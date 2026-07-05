# BillFlow — Subscription Billing Platform

A subscription billing product with plans, checkout, payments, invoices, and email notifications.

**Stack:** Next.js 15 · React · Node.js API routes · MongoDB · Razorpay (test mode) · Nodemailer

## Features

- JWT authentication (register / login)
- Plans page with Razorpay checkout
- Subscription dashboard (status, upgrade, downgrade, cancel)
- Billing history (invoices)
- Webhook handler with idempotency (`payment.captured`, `order.paid`, `payment.failed`)
- Transactional email notifications

## Quick start

### Prerequisites

- Node.js 18+
- MongoDB ([local install](https://www.mongodb.com/try/download/community) or [MongoDB Atlas](https://www.mongodb.com/atlas))

### Install and run

```bash
git clone <repo-url>
cd registerkaro-billing
npm install
cp .env.example .env.local
```

Fill in `.env.local` (see [Environment variables](#environment-variables)), then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### MongoDB connection note

If you see `querySrv ECONNREFUSED` with Atlas, use the **standard** `mongodb://` connection string from the Atlas dashboard instead of `mongodb+srv://`, or use a local URI:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/registerkaro-billing
```

Ensure Atlas **Network Access** allows your IP (or `0.0.0.0/0` for development).

### Test payment flow

1. Register → choose a plan → pay with Razorpay test card: `4111 1111 1111 1111`, any future expiry, any CVV
2. Dashboard shows active subscription and paid invoice
3. Try upgrade (Razorpay opens for prorated charge) and cancel

### Webhooks (local development)

Razorpay cannot reach `localhost` directly. Use a tunnel such as ngrok:

```bash
npx ngrok http 3000
```

In Razorpay Dashboard → **Webhooks**:

- URL: `https://<your-tunnel-host>/api/webhooks/razorpay`
- Events: `payment.captured`, `order.paid`, `payment.failed`
- Copy the webhook secret into `RAZORPAY_WEBHOOK_SECRET`

Client-side `/api/checkout/verify` also confirms payments immediately after checkout. Webhooks serve as a server-to-server backup when the app is publicly reachable.

### Email (development)

Use [Ethereal](https://ethereal.email) for a fake SMTP inbox, or configure Gmail / SendGrid credentials in `.env.local`.

### Tests

```bash
npm test
```

Covers webhook idempotency helpers, Razorpay signature verification, and upgrade proration.

## Environment variables

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `RAZORPAY_KEY_ID` | Razorpay key ID (test mode) |
| `RAZORPAY_KEY_SECRET` | Razorpay API key secret |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook signing secret (separate from API secret) |
| `EMAIL_HOST` | SMTP host |
| `EMAIL_PORT` | SMTP port (default 587) |
| `EMAIL_USER` | SMTP username |
| `EMAIL_PASS` | SMTP password |
| `EMAIL_FROM` | Sender address |

## API routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login |
| GET | `/api/plans` | List plans (seeds defaults if empty) |
| POST | `/api/checkout` | Create order and pending subscription |
| POST | `/api/checkout/verify` | Verify payment signature and activate |
| GET | `/api/subscriptions` | Current subscription |
| POST | `/api/subscriptions/upgrade` | Upgrade or downgrade plan |
| POST | `/api/subscriptions/cancel` | Schedule cancellation at period end |
| GET | `/api/invoices` | Billing history |
| POST | `/api/webhooks/razorpay` | Razorpay webhook endpoint |

## Project structure

```
src/
├── app/           # Pages and API routes (Next.js App Router)
├── components/    # Navbar, AuthProvider
├── lib/           # Database, auth, payments, email, webhook helpers
└── models/        # Mongoose schemas
__tests__/         # Jest tests
ARCHITECTURE.md    # Design decisions and flow documentation
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Run production build |
| `npm test` | Run test suite |

## Documentation

See [ARCHITECTURE.md](./ARCHITECTURE.md) for data models, state machines, payment flows, webhook idempotency, and design trade-offs.
