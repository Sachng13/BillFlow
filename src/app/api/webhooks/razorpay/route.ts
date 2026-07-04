import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { Subscription } from "@/models/Subscription";
import { Invoice } from "@/models/Invoice";
import { WebhookEvent } from "@/models/WebhookEvent";
import { User } from "@/models/User";
import { Plan } from "@/models/Plan";
import {
  sendSubscriptionCreated,
  sendPaymentConfirmed,
  sendInvoiceGenerated,
} from "@/lib/email";

/**
 * POST /api/webhooks/razorpay
 *
 * This is the SOURCE OF TRUTH for subscription activation.
 *
 * Key decisions:
 * 1. SIGNATURE VERIFICATION first — reject anything unsigned.
 * 2. IDEMPOTENCY — check WebhookEvent by eventId before processing.
 *    Razorpay can deliver the same event multiple times; we apply effects exactly once.
 * 3. We only care about: payment.captured | payment.failed
 *    All other events are acknowledged (200) but ignored.
 * 4. Raw body is read as text for signature verification before JSON parsing.
 */
export async function POST(req: NextRequest) {
  // Must read raw body for HMAC verification
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  // Step 1: Verify signature
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn("[webhook] Invalid signature — rejected");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { id: string; event: string; payload: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id: eventId, event: eventType, payload } = event;

  await connectDB();

  // Step 2: Idempotency check — have we already processed this event?
  const alreadyProcessed = await WebhookEvent.findOne({ eventId });
  if (alreadyProcessed) {
    console.log(`[webhook] Duplicate event ${eventId} — skipping`);
    // Return 200 so Razorpay stops retrying
    return NextResponse.json({ status: "already_processed" });
  }

  // Step 3: Filter to events we care about
  const HANDLED_EVENTS = ["payment.captured", "payment.failed"];
  if (!HANDLED_EVENTS.includes(eventType)) {
    // Acknowledge but do nothing — idempotency record not needed for ignored events
    return NextResponse.json({ status: "ignored" });
  }

  // Step 4: Mark as processed BEFORE side effects to prevent double processing
  // (in a distributed system you'd use a DB transaction or atomic upsert)
  await WebhookEvent.create({ eventId, eventType, payload });

  // Step 5: Handle the event
  try {
    if (eventType === "payment.captured") {
      await handlePaymentCaptured(payload);
    } else if (eventType === "payment.failed") {
      await handlePaymentFailed(payload);
    }
  } catch (err) {
    // Side effects failed. The webhook event is already marked processed.
    // Log for manual remediation — don't re-throw (Razorpay would retry).
    console.error(`[webhook] Side effect error for ${eventId}:`, err);
  }

  return NextResponse.json({ status: "processed" });
}

async function handlePaymentCaptured(payload: Record<string, unknown>) {
  const payment = (payload as { payment: { entity: Record<string, unknown> } })
    .payment?.entity;
  const orderId = payment?.order_id as string;
  const paymentId = payment?.id as string;
  const amountPaise = payment?.amount as number;

  if (!orderId || !paymentId) {
    console.error("[webhook] payment.captured missing orderId/paymentId");
    return;
  }

  const subscription = await Subscription.findOne({ razorpayOrderId: orderId });
  if (!subscription) {
    console.error(`[webhook] No subscription for orderId ${orderId}`);
    return;
  }

  // Guard: don't re-activate an already active subscription
  if (subscription.status === "active") {
    console.log(`[webhook] Subscription ${subscription._id} already active`);
    return;
  }

  const now = new Date();
  const plan = await Plan.findById(subscription.planId);
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + (plan?.intervalDays ?? 30));

  // Activate subscription
  subscription.status = "active";
  subscription.razorpayPaymentId = paymentId;
  subscription.currentPeriodStart = now;
  subscription.currentPeriodEnd = periodEnd;
  await subscription.save();

  // Mark invoice paid
  const invoice = await Invoice.findOneAndUpdate(
    { razorpayOrderId: orderId },
    {
      status: "paid",
      razorpayPaymentId: paymentId,
      paidAt: now,
    },
    { new: true }
  );

  // Send emails
  const user = await User.findById(subscription.userId);
  if (user && plan) {
    await sendSubscriptionCreated(user.email, plan.name, periodEnd);
    await sendPaymentConfirmed(user.email, amountPaise, invoice?.invoiceNumber ?? "");
    if (invoice) {
      await sendInvoiceGenerated(user.email, invoice.invoiceNumber, amountPaise, plan.name);
    }
  }

  console.log(`[webhook] Subscription ${subscription._id} activated`);
}

async function handlePaymentFailed(payload: Record<string, unknown>) {
  const payment = (payload as { payment: { entity: Record<string, unknown> } })
    .payment?.entity;
  const orderId = payment?.order_id as string;

  if (!orderId) return;

  await Subscription.findOneAndUpdate(
    { razorpayOrderId: orderId },
    { status: "payment_failed" }
  );

  // Void the draft invoice
  await Invoice.findOneAndUpdate(
    { razorpayOrderId: orderId },
    { status: "void" }
  );

  console.log(`[webhook] Payment failed for order ${orderId}`);
}
