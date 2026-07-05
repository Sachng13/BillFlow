/** Razorpay webhook event types we process */
export const HANDLED_WEBHOOK_EVENTS = [
  "payment.captured",
  "payment.failed",
  "order.paid",
] as const;

export type HandledWebhookEvent = (typeof HANDLED_WEBHOOK_EVENTS)[number];

export function isHandledWebhookEvent(
  eventType: string
): eventType is HandledWebhookEvent {
  return (HANDLED_WEBHOOK_EVENTS as readonly string[]).includes(eventType);
}

export function parsePaymentSuccessPayload(payload: Record<string, unknown>) {
  const payment = (payload as { payment?: { entity?: Record<string, unknown> } })
    .payment?.entity;
  const order = (payload as { order?: { entity?: Record<string, unknown> } })
    .order?.entity;

  return {
    orderId: (payment?.order_id ?? order?.id) as string | undefined,
    paymentId: payment?.id as string | undefined,
    amountPaise: payment?.amount as number | undefined,
  };
}

export function parsePaymentFailedPayload(payload: Record<string, unknown>) {
  const payment = (payload as { payment?: { entity?: Record<string, unknown> } })
    .payment?.entity;
  return { orderId: payment?.order_id as string | undefined };
}

/** Returns true if this eventId was already recorded (idempotency guard). */
export function wasEventProcessed(
  existingEvent: { eventId: string } | null
): boolean {
  return existingEvent !== null;
}
