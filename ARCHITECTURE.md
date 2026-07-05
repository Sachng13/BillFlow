# Architecture — RegisterKaro Billing Platform

This document explains **why** the system works the way it does. The assignment grades flow decisions and edge cases, not feature count.

---

## 1. System overview

```
User (browser)
    │
    ├─► Next.js pages (React, client auth via JWT in localStorage)
    │
    └─► API routes (Node.js)
            │
            ├─► MongoDB (users, plans, subscriptions, invoices, webhook_events)
            ├─► Razorpay (orders + checkout)
            └─► SMTP (transactional email)
```

**Money is always stored in paise (integers).** Never floats.

---

## 2. Data model

### User
- `email`, `passwordHash` (bcrypt)
- Owns subscriptions and invoices

### Plan
- `name`, `slug`, `amountPaise`, `intervalDays`, `features`
- Seeded on first `GET /api/plans` if empty (Starter ₹499, Pro ₹1499, Enterprise ₹4999)

### Subscription — state machine

```
pending ──payment confirmed──► active ──cancel──► active + cancelAtPeriodEnd=true
   │                              │
   │                              └── period end ──► cancelled (lazy on read)
   │
   └── payment failed ──► payment_failed
```

| Field | Purpose |
|-------|---------|
| `status` | `pending` / `active` / `cancelled` / `expired` / `payment_failed` |
| `razorpayOrderId` | Original checkout order (unique) |
| `cancelAtPeriodEnd` | Soft cancel — access until `currentPeriodEnd` |
| `previousPlanId`, `planChangedAt` | Audit trail for upgrades/downgrades |

### Invoice
- One per charge (initial subscription, upgrade proration)
- `draft` → `paid` or `void`
- Linked to `subscriptionId` + `razorpayOrderId`

### WebhookEvent
- **Idempotency store** — `eventId` from Razorpay (unique)
- Prevents double activation, double emails

---

## 3. Checkout & payment flow

### Decision: subscription starts as `pending`

When user clicks “Get started”:

1. `POST /api/checkout` creates Razorpay order, `pending` subscription, `draft` invoice
2. Razorpay modal opens
3. On success, client calls `POST /api/checkout/verify` with payment signature
4. Server verifies HMAC → `completeOrderPayment()` → `active` subscription, `paid` invoice, emails

**Why pending first?** Payment UI success ≠ money captured. Pending state makes “not yet paid” explicit.

### Decision: dual confirmation paths

| Path | When |
|------|------|
| Client verify | Immediate UX after Razorpay modal (works on localhost) |
| Webhook | Backup / production source of truth when server is publicly reachable |

Both call the same `completeOrderPayment()` function. Idempotency:
- New subscription: skip if already `active`
- Upgrade invoice: skip if invoice already `paid`

### Edge cases handled

| Case | Behavior |
|------|----------|
| User already has `active` subscription | Checkout blocked — use upgrade |
| User has `pending` subscription | Checkout blocked — complete or abandon first |
| Duplicate webhook | `WebhookEvent.eventId` check → `already_processed` |
| Verify + webhook both fire | Second call is no-op (`alreadyComplete`) |
| Payment fails | Webhook `payment.failed` → `payment_failed` + void invoice |

---

## 4. Webhook handling

**Endpoint:** `POST /api/webhooks/razorpay`

### Steps
1. Read raw body (required for signature)
2. Verify `x-razorpay-signature` with `RAZORPAY_WEBHOOK_SECRET`
3. Check `WebhookEvent` for `eventId` — if exists, return 200 `already_processed`
4. Filter events: only `payment.captured`, `order.paid`, `payment.failed`
5. Process side effects
6. **Record `WebhookEvent` only after success** — failed processing returns 500 so Razorpay retries

### Why record after success (not before)?

Recording before processing caused “poisoned” events: processing fails, event marked done, retry skipped. Recording after allows safe retries.

### Events ignored
`payment.authorized`, `subscription.*`, etc. — acknowledged with `ignored` (no side effects, no idempotency record needed).

---

## 5. Subscription lifecycle

### Cancel
- Sets `cancelAtPeriodEnd = true`, keeps `status: active`
- User retains access until `currentPeriodEnd`
- Email sent once
- **Lazy transition:** `GET /api/subscriptions` moves to `cancelled` when period has passed

**Trade-off:** No cron job in this assignment. Production would use a scheduled job. Lazy read is documented and sufficient for demo.

### Expired
- Not auto-renewed in this MVP (no recurring Razorpay subscriptions API)
- Documented as future work

---

## 6. Plan changes (upgrade / downgrade)

### Upgrade (higher price)
1. Calculate prorated charge: `(newPrice - oldPrice) × remainingDays / totalDays`
2. If charge > 0: create Razorpay order + draft invoice, open payment modal
3. **Plan changes only after payment** via `completeOrderPayment()` (upgrade path)
4. Emails: plan changed, payment confirmed, invoice

### Upgrade with zero proration
- End of period, tiny difference rounds to 0 → apply immediately, no payment

### Downgrade (lower price)
- Apply immediately, no charge, no refund (documented trade-off — simpler than credit notes)

**Alternative considered:** Change at period end for downgrades. Rejected for upgrade because users expect immediate feature access.

---

## 7. Notifications

| Event | Email |
|-------|-------|
| First payment | Subscription created + payment confirmed + invoice |
| Upgrade payment | Plan changed + payment confirmed + invoice |
| Downgrade | Plan changed |
| Cancel | Cancellation with access-until date |

**Sent exactly once** via webhook/verify idempotency. Email failures are logged but do not roll back payment (emails are best-effort; payment is source of truth).

---

## 8. Auth

- JWT in `Authorization: Bearer` header for API routes
- Client stores token in `localStorage` via `AuthProvider`
- 7-day expiry

**Trade-off:** No httpOnly cookies (XSS risk). Acceptable for assignment scope; production would use secure cookies + CSRF protection.

---

## 9. Tests

```
__tests__/webhook.test.ts    — event filtering, idempotency helper, payload parsing
__tests__/razorpay.test.ts   — HMAC signature verification
__tests__/proration.test.ts    — upgrade charge calculation
```

Run: `npm test`

---

## 10. Production gaps (honest trade-offs)

| Gap | Production fix |
|-----|----------------|
| No cron for cancel/expiry | Scheduled job or queue |
| Invoice numbers via `countDocuments` | Atomic counter or UUID |
| JWT in localStorage | httpOnly session cookies |
| No rate limiting on auth | Add middleware |
| Single Razorpay order model | Razorpay Subscriptions API for true recurring |

---

## 11. Key files

| File | Responsibility |
|------|----------------|
| `src/lib/activateSubscription.ts` | `completeOrderPayment()` — new sub + upgrade |
| `src/lib/webhook.ts` | Event filter, payload parsers, idempotency helper |
| `src/lib/proration.ts` | Prorated upgrade math |
| `src/lib/subscriptionLifecycle.ts` | Lazy cancel transition |
| `src/app/api/webhooks/razorpay/route.ts` | Webhook entry point |

---

## 12. Interview talking points

Be ready to explain:

1. **Why pending before active?** — Payment not confirmed until verify/webhook
2. **Why both verify and webhook?** — Local dev + production reliability
3. **How duplicate webhooks are handled?** — `WebhookEvent.eventId` + order/invoice idempotency
4. **What does cancel mean?** — Soft cancel, access until period end
5. **Upgrade proration formula** — Proportional to remaining days
6. **What breaks without ngrok?** — Webhook won't arrive; verify still works
7. **Email failure** — Logged, payment still succeeds

This is the mindset RegisterKaro grades: **sound decisions when the happy path breaks.**
