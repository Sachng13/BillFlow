# RegisterKaro Billing Platform

Subscription billing product built for the RegisterKaro engineering take-home assignment.

**Stack:** Next.js 15 · React · Node.js API routes · MongoDB · Razorpay (test mode) · Nodemailer

## Features

- JWT auth (register / login)
- Plans page with Razorpay checkout
- Subscription dashboard (status, upgrade, downgrade, cancel)
- Billing history (invoices)
- Webhook handler with idempotency (`payment.captured`, `order.paid`, `payment.failed`)
- Email notifications (subscription, payment, invoice, cancel, plan change)

## Quick start (< 10 minutes)

### 1. Prerequisites

- Node.js 18+
- MongoDB running locally or [MongoDB Atlas](https://www.mongodb.com/atlas) free tier

### 2. Install

```bash
git clone <your-repo-url>
cd registerkaro-billing
npm install
```

### 3. Environment

```bash
cp .env.example .env.local
```

Fill in values (see [Environment variables](#environment-variables)).

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Test payment flow

1. Register → choose a plan → pay with Razorpay test card: `4111 1111 1111 1111`, any future expiry, any CVV
2. Dashboard shows active subscription + invoice
3. Try upgrade (Razorpay opens for prorated charge) and cancel

### 6. Webhooks (local)

Razorpay cannot reach `localhost` directly. Use ngrok:

```bash
npx ngrok http 3000
```

In Razorpay Dashboard → **Webhooks**:

- URL: `https://<ngrok-id>.ngrok-free.app/api/webhooks/razorpay`
- Events: `payment.captured`, `order.paid`, `payment.failed`
- Copy webhook secret → `RAZORPAY_WEBHOOK_SECRET` in `.env.local`

> Client-side `/api/checkout/verify` also activates subscriptions immediately after payment (webhook is backup).

### 7. Email (dev)

Use [Ethereal](https://ethereal.email) — create account, copy SMTP creds to `.env.local`. Emails appear in Ethereal inbox, not real Gmail.

### 8. Tests

```bash
npm test
```

Covers webhook idempotency helpers, signature verification, and proration math.

## Environment variables

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `RAZORPAY_KEY_ID` | Test key from Razorpay dashboard |
| `RAZORPAY_KEY_SECRET` | API key secret |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook signing secret (different from API secret) |
| `EMAIL_HOST` | SMTP host |
| `EMAIL_PORT` | SMTP port (587) |
| `EMAIL_USER` | SMTP username |
| `EMAIL_PASS` | SMTP password |
| `EMAIL_FROM` | From address |

## API routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login |
| GET | `/api/plans` | List plans (auto-seeds 3 plans) |
| POST | `/api/checkout` | Create order + pending subscription |
| POST | `/api/checkout/verify` | Verify payment signature, activate |
| GET | `/api/subscriptions` | Current subscription |
| POST | `/api/subscriptions/upgrade` | Upgrade/downgrade |
| POST | `/api/subscriptions/cancel` | Cancel at period end |
| GET | `/api/invoices` | Billing history |
| POST | `/api/webhooks/razorpay` | Razorpay webhook |

## Project structure

```
src/
├── app/           # Pages + API routes (Next.js App Router)
├── components/    # Navbar, AuthProvider
├── lib/           # DB, auth, payments, email, webhook helpers
└── models/        # Mongoose schemas
__tests__/         # Jest tests
ARCHITECTURE.md    # Design decisions (read this for the interview)
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Run production build |
| `npm test` | Run tests |

## Screen recording checklist (3–5 min)

1. Register → subscribe → dashboard active
2. Show invoice in billing history
3. Upgrade plan → Razorpay prorated payment
4. Cancel subscription → “cancels at period end”
5. Replay duplicate webhook in Razorpay dashboard → `already_processed` response

## License

Private — RegisterKaro assignment submission.
