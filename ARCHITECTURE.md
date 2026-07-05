# Architecture

Design decisions, data model, and flow documentation for the subscription billing platform.

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

All monetary amounts are stored in **paise** (integer minor units). Floating-point currency is not used.

---

## 2. Data model

### User
- `email`, `passwordHash` (bcrypt)
- Owns subscriptions and invoices

### Plan
- `name`, `slug`, `amountPaise`, `intervalDays`, `features`
- Default plans are seeded on first `GET /api/plans` if the collection is empty: Starter (₹499), Pro (₹1499), Enterprise (₹4999)

### Subscription

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
| `cancelAtPeriodEnd` | Soft cancel — access continues until `currentPeriodEnd` |
| `previousPlanId`, `planChangedAt` | Audit trail for plan changes |

### Invoice
- Created per charge (initial subscription or upgrade proration)
- Status: `draft` → `paid` or `void`
- Linked to `subscriptionId` and `razorpayOrderId`

### WebhookEvent
- Stores processed Razorpay `eventId` values (unique)
- Ensures webhook side effects run exactly once

---

## 3. Checkout and payment

### Subscription starts as `pending`

1. `POST /api/checkout` creates a Razorpay order, a `pending` subscription, and a `draft` invoice
2. Razorpay checkout modal opens in the browser
3. On success, the client calls `POST /api/checkout/verify` with the payment signature
4. The server verifies the HMAC signature and calls `completeOrderPayment()` to set the subscription to `active`, mark the invoice `paid`, and send emails

A subscription remains `pending` until payment is confirmed server-side. Client-side checkout success alone does not activate access.

### Dual confirmation paths

| Path | Role |
|------|------|
| Client verify (`/api/checkout/verify`) | Immediate activation after checkout; works on localhost |
| Webhook (`/api/webhooks/razorpay`) | Server-to-server confirmation when the app is publicly reachable |

Both paths call `completeOrderPayment()`. Repeated calls are safe:

- New subscription: no-op if already `active`
- Upgrade invoice: no-op if invoice already `paid`

### Edge cases

| Case | Behavior |
|------|----------|
| User already has an `active` subscription | Checkout blocked; use upgrade instead |
| User has a `pending` subscription | Checkout blocked until payment completes or is abandoned |
| Duplicate webhook delivery | `WebhookEvent.eventId` lookup returns `already_processed` |
| Verify and webhook both arrive | Second invocation is idempotent |
| Payment fails | Webhook `payment.failed` sets `payment_failed` and voids the draft invoice |

---

## 4. Webhook handling

**Endpoint:** `POST /api/webhooks/razorpay`

### Processing steps

1. Read the raw request body (required for signature verification)
2. Verify `x-razorpay-signature` using `RAZORPAY_WEBHOOK_SECRET`
3. Return `already_processed` if `eventId` exists in `WebhookEvent`
4. Handle only `payment.captured`, `order.paid`, and `payment.failed`; other events return `ignored`
5. Apply side effects via `completeOrderPayment()` or payment-failure handlers
6. Persist `WebhookEvent` **after** successful processing; return 500 on failure so Razorpay can retry

### Idempotency

Events are recorded only after successful processing. Recording before processing would mark failed events as done and block legitimate retries.

Unhandled event types are acknowledged without persisting an idempotency record.

---

## 5. Subscription lifecycle

### Cancellation

- Sets `cancelAtPeriodEnd = true` while keeping `status: active`
- User retains access until `currentPeriodEnd`
- Cancellation email is sent once
- On `GET /api/subscriptions`, subscriptions past their period end with `cancelAtPeriodEnd` transition to `cancelled`

There is no background cron in this implementation. A production deployment would use a scheduled job for period-end transitions.

### Renewal and expiry

Recurring billing via the Razorpay Subscriptions API is not implemented. Subscriptions do not auto-renew at period end in this version.

---

## 6. Plan changes

### Upgrade (higher price)

1. Prorated charge: `(newPrice - oldPrice) × remainingDays / totalDays`
2. If charge > 0: create a Razorpay order and draft invoice; open checkout for the prorated amount
3. Plan change is applied only after payment confirmation through `completeOrderPayment()`
4. Emails: plan changed, payment confirmed, invoice generated

### Upgrade with zero proration

When the prorated amount rounds to zero, the plan is updated immediately with no payment step.

### Downgrade (lower price)

Applied immediately with no charge and no refund. This avoids building a credit-note flow in the MVP.

---

## 7. Notifications

| Event | Emails sent |
|-------|-------------|
| First payment | Subscription created, payment confirmed, invoice |
| Upgrade payment | Plan changed, payment confirmed, invoice |
| Downgrade | Plan changed |
| Cancellation | Cancellation notice with access-until date |

Emails are sent at most once per payment event, guarded by payment idempotency. SMTP failures are logged; they do not roll back a confirmed payment.

---

## 8. Authentication

- API routes accept `Authorization: Bearer <JWT>`
- The client stores the token in `localStorage` via `AuthProvider`
- Token expiry: 7 days

Production hardening would typically move to httpOnly cookies and CSRF protection instead of localStorage.

---

## 9. Tests

| File | Coverage |
|------|----------|
| `__tests__/webhook.test.ts` | Event filtering, idempotency helper, payload parsing |
| `__tests__/razorpay.test.ts` | HMAC signature verification |
| `__tests__/proration.test.ts` | Upgrade proration calculation |

```bash
npm test
```

---

## 10. Known limitations

| Area | Current behavior | Production follow-up |
|------|------------------|----------------------|
| Period-end transitions | Lazy update on subscription read | Scheduled job or queue worker |
| Invoice numbering | `countDocuments()` based | Atomic counter or UUID |
| Auth storage | JWT in localStorage | httpOnly cookies |
| API protection | Per-route JWT check | Rate limiting on auth endpoints |
| Billing model | One-off Razorpay orders | Razorpay Subscriptions API for recurring charges |

---

## 11. Key source files

| File | Responsibility |
|------|----------------|
| `src/lib/activateSubscription.ts` | `completeOrderPayment()` for new subscriptions and upgrades |
| `src/lib/webhook.ts` | Event filtering, payload parsing, idempotency helpers |
| `src/lib/proration.ts` | Prorated upgrade charge calculation |
| `src/lib/subscriptionLifecycle.ts` | Lazy cancellation transition |
| `src/lib/razorpayVerify.ts` | Payment and webhook signature verification |
| `src/app/api/webhooks/razorpay/route.ts` | Webhook HTTP handler |
