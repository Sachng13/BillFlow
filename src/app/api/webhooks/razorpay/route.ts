import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/razorpayVerify";
import { WebhookEvent } from "@/models/WebhookEvent";
import { Subscription } from "@/models/Subscription";
import { Invoice } from "@/models/Invoice";
import { activateSubscriptionByOrderId } from "@/lib/activateSubscription";
import {
  isHandledWebhookEvent,
  parsePaymentFailedPayload,
  parsePaymentSuccessPayload,
  wasEventProcessed,
} from "@/lib/webhook";
import { logError, logWarn } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  if (!verifyWebhookSignature(rawBody, signature)) {
    logWarn("webhook.signature_invalid");
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

  const existing = await WebhookEvent.findOne({ eventId });
  if (wasEventProcessed(existing)) {
    return NextResponse.json({ status: "already_processed" });
  }

  if (!isHandledWebhookEvent(eventType)) {
    return NextResponse.json({ status: "ignored", eventType });
  }

  try {
    if (eventType === "payment.captured" || eventType === "order.paid") {
      await handlePaymentSuccess(payload);
    } else if (eventType === "payment.failed") {
      await handlePaymentFailed(payload);
    }

    // Record only after successful processing — allows Razorpay to retry on failure
    await WebhookEvent.create({ eventId, eventType, payload });
    return NextResponse.json({ status: "processed" });
  } catch (err) {
    logError("webhook.processing_failed", err, { eventId, eventType });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

async function handlePaymentSuccess(payload: Record<string, unknown>) {
  const { orderId, paymentId, amountPaise } = parsePaymentSuccessPayload(payload);

  if (!orderId || !paymentId) {
    throw new Error("payment success payload missing orderId or paymentId");
  }

  await activateSubscriptionByOrderId(orderId, paymentId, amountPaise, "webhook");
}

async function handlePaymentFailed(payload: Record<string, unknown>) {
  const { orderId } = parsePaymentFailedPayload(payload);
  if (!orderId) return;

  await Subscription.findOneAndUpdate(
    { razorpayOrderId: orderId },
    { status: "payment_failed" }
  );
  await Invoice.findOneAndUpdate({ razorpayOrderId: orderId }, { status: "void" });
}
