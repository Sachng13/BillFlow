import mongoose, { Schema, Document, models, Types } from "mongoose";

/**
 * Subscription Status State Machine:
 *
 *  pending  →  active  →  cancelled (access until currentPeriodEnd)
 *                ↓
 *             expired  (currentPeriodEnd passed, no renewal)
 *
 * "cancel" means: set cancelAtPeriodEnd = true.
 * The subscription stays "active" until currentPeriodEnd, then transitions to "cancelled".
 * This matches how Stripe/Razorpay handle cancellations.
 */
export type SubscriptionStatus =
  | "pending"
  | "active"
  | "cancelled"
  | "expired"
  | "payment_failed";

export interface ISubscription extends Document {
  userId: Types.ObjectId;
  planId: Types.ObjectId;
  status: SubscriptionStatus;

  // Razorpay order created at checkout initiation
  razorpayOrderId: string;
  // Set once payment is confirmed via webhook (source of truth)
  razorpayPaymentId?: string;

  currentPeriodStart: Date;
  currentPeriodEnd: Date;

  // If true, subscription won't renew. Access continues until currentPeriodEnd.
  cancelAtPeriodEnd: boolean;
  cancelledAt?: Date;

  // Track plan changes for upgrade/downgrade
  previousPlanId?: Types.ObjectId;
  planChangedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    planId: { type: Schema.Types.ObjectId, ref: "Plan", required: true },
    status: {
      type: String,
      enum: ["pending", "active", "cancelled", "expired", "payment_failed"],
      default: "pending",
    },
    razorpayOrderId: { type: String, required: true, unique: true },
    razorpayPaymentId: { type: String },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    cancelledAt: { type: Date },
    previousPlanId: { type: Schema.Types.ObjectId, ref: "Plan" },
    planChangedAt: { type: Date },
  },
  { timestamps: true }
);

// Index for fast user lookups
SubscriptionSchema.index({ userId: 1, status: 1 });
SubscriptionSchema.index({ razorpayPaymentId: 1 });

export const Subscription =
  models.Subscription ??
  mongoose.model<ISubscription>("Subscription", SubscriptionSchema);
