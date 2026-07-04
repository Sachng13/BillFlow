import mongoose, { Schema, Document, models } from "mongoose";

/**
 * Webhook idempotency store.
 *
 * Every incoming Razorpay webhook is stored here by its event ID.
 * Before processing, we check if eventId already exists.
 * If it does → skip (idempotent).
 * If not → process and mark as processed.
 *
 * This prevents double-charging, double-emailing, etc. on duplicate deliveries.
 */
export interface IWebhookEvent extends Document {
  eventId: string;        // Razorpay's unique event identifier
  eventType: string;      // e.g. payment.captured
  processedAt: Date;
  payload: object;        // raw payload stored for debugging
}

const WebhookEventSchema = new Schema<IWebhookEvent>({
  eventId: { type: String, required: true, unique: true },
  eventType: { type: String, required: true },
  processedAt: { type: Date, default: Date.now },
  payload: { type: Schema.Types.Mixed },
});

export const WebhookEvent =
  models.WebhookEvent ??
  mongoose.model<IWebhookEvent>("WebhookEvent", WebhookEventSchema);
