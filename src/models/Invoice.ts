import mongoose, { Schema, Document, models, Types } from "mongoose";

export type InvoiceStatus = "draft" | "paid" | "void";

export interface IInvoice extends Document {
  userId: Types.ObjectId;
  subscriptionId: Types.ObjectId;
  planId: Types.ObjectId;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  amountPaise: number;
  status: InvoiceStatus;
  invoiceNumber: string; // human-readable e.g. INV-2024-0001
  paidAt?: Date;
  createdAt: Date;
}

const InvoiceSchema = new Schema<IInvoice>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      required: true,
    },
    planId: { type: Schema.Types.ObjectId, ref: "Plan", required: true },
    razorpayOrderId: { type: String, required: true },
    razorpayPaymentId: { type: String },
    amountPaise: { type: Number, required: true },
    status: {
      type: String,
      enum: ["draft", "paid", "void"],
      default: "draft",
    },
    invoiceNumber: { type: String, required: true, unique: true },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

InvoiceSchema.index({ userId: 1 });
InvoiceSchema.index({ razorpayOrderId: 1 });

export const Invoice =
  models.Invoice ?? mongoose.model<IInvoice>("Invoice", InvoiceSchema);
