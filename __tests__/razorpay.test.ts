import crypto from "crypto";
import {
  verifyPaymentSignature,
  verifyWebhookSignature,
} from "@/lib/razorpayVerify";

describe("Razorpay signature verification", () => {
  const keySecret = "test_key_secret";
  const webhookSecret = "test_webhook_secret";

  beforeEach(() => {
    process.env.RAZORPAY_KEY_SECRET = keySecret;
    process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
  });

  it("verifies valid payment signature", () => {
    const orderId = "order_abc";
    const paymentId = "pay_xyz";
    const signature = crypto
      .createHmac("sha256", keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    expect(verifyPaymentSignature(orderId, paymentId, signature)).toBe(true);
  });

  it("rejects invalid payment signature", () => {
    expect(verifyPaymentSignature("order_abc", "pay_xyz", "bad_sig")).toBe(false);
  });

  it("verifies valid webhook signature", () => {
    const body = JSON.stringify({ event: "payment.captured", id: "evt_1" });
    const signature = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    expect(verifyWebhookSignature(body, signature)).toBe(true);
  });

  it("rejects tampered webhook body", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    const signature = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    expect(verifyWebhookSignature(body + " ", signature)).toBe(false);
  });
});
