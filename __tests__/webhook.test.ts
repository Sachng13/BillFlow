import {
  HANDLED_WEBHOOK_EVENTS,
  isHandledWebhookEvent,
  parsePaymentFailedPayload,
  parsePaymentSuccessPayload,
  wasEventProcessed,
} from "@/lib/webhook";

describe("webhook idempotency and filtering", () => {
  it("detects already-processed events", () => {
    expect(wasEventProcessed(null)).toBe(false);
    expect(wasEventProcessed({ eventId: "evt_123" })).toBe(true);
  });

  it("filters to handled event types only", () => {
    expect(isHandledWebhookEvent("payment.captured")).toBe(true);
    expect(isHandledWebhookEvent("order.paid")).toBe(true);
    expect(isHandledWebhookEvent("payment.failed")).toBe(true);
    expect(isHandledWebhookEvent("payment.authorized")).toBe(false);
    expect(isHandledWebhookEvent("subscription.charged")).toBe(false);
  });

  it("documents all handled events", () => {
    expect(HANDLED_WEBHOOK_EVENTS).toEqual([
      "payment.captured",
      "payment.failed",
      "order.paid",
    ]);
  });

  it("parses payment.captured payload", () => {
    const payload = {
      payment: {
        entity: {
          id: "pay_123",
          order_id: "order_456",
          amount: 49900,
        },
      },
    };

    expect(parsePaymentSuccessPayload(payload)).toEqual({
      orderId: "order_456",
      paymentId: "pay_123",
      amountPaise: 49900,
    });
  });

  it("parses order.paid payload with order entity", () => {
    const payload = {
      order: { entity: { id: "order_789" } },
      payment: {
        entity: { id: "pay_789", order_id: "order_789", amount: 10000 },
      },
    };

    expect(parsePaymentSuccessPayload(payload).orderId).toBe("order_789");
    expect(parsePaymentSuccessPayload(payload).paymentId).toBe("pay_789");
  });

  it("parses payment.failed payload", () => {
    const payload = {
      payment: { entity: { order_id: "order_fail" } },
    };
    expect(parsePaymentFailedPayload(payload)).toEqual({ orderId: "order_fail" });
  });
});
