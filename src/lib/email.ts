import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT ?? 587),
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail(payload: EmailPayload) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? "billing@registerkaro.in",
    ...payload,
  });
}

// ─── Email Templates ──────────────────────────────────────────────────────────

export async function sendSubscriptionCreated(
  to: string,
  planName: string,
  nextBillingDate: Date
) {
  await sendEmail({
    to,
    subject: "Your subscription is active 🎉",
    html: `
      <h2>Welcome to ${planName}!</h2>
      <p>Your subscription is now <strong>active</strong>.</p>
      <p>Next billing date: <strong>${nextBillingDate.toDateString()}</strong></p>
    `,
  });
}

export async function sendPaymentConfirmed(
  to: string,
  amountPaise: number,
  invoiceId: string
) {
  await sendEmail({
    to,
    subject: "Payment received ✅",
    html: `
      <h2>Payment Confirmed</h2>
      <p>We received your payment of <strong>₹${amountPaise / 100}</strong>.</p>
      <p>Invoice ID: <code>${invoiceId}</code></p>
    `,
  });
}

export async function sendInvoiceGenerated(
  to: string,
  invoiceId: string,
  amountPaise: number,
  planName: string
) {
  await sendEmail({
    to,
    subject: `Invoice ${invoiceId} for ${planName}`,
    html: `
      <h2>Invoice Generated</h2>
      <p>Invoice: <strong>${invoiceId}</strong></p>
      <p>Plan: <strong>${planName}</strong></p>
      <p>Amount: <strong>₹${amountPaise / 100}</strong></p>
    `,
  });
}

export async function sendSubscriptionCancelled(
  to: string,
  planName: string,
  accessUntil: Date
) {
  await sendEmail({
    to,
    subject: "Subscription cancelled",
    html: `
      <h2>Subscription Cancelled</h2>
      <p>Your <strong>${planName}</strong> subscription has been cancelled.</p>
      <p>You'll continue to have access until <strong>${accessUntil.toDateString()}</strong>.</p>
    `,
  });
}

export async function sendPlanChanged(
  to: string,
  fromPlan: string,
  toPlan: string,
  effectiveDate: Date
) {
  await sendEmail({
    to,
    subject: "Plan updated",
    html: `
      <h2>Plan Changed</h2>
      <p>Your plan has been changed from <strong>${fromPlan}</strong> to <strong>${toPlan}</strong>.</p>
      <p>Effective: <strong>${effectiveDate.toDateString()}</strong></p>
    `,
  });
}
