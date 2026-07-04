import mongoose, { Schema, Document, models } from "mongoose";

export interface IPlan extends Document {
  name: string;
  slug: string;
  description: string;
  amountPaise: number; // stored in paise, no floats
  intervalDays: number; // 30 = monthly, 365 = annual
  features: string[];
  isActive: boolean;
}

const PlanSchema = new Schema<IPlan>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    amountPaise: { type: Number, required: true },
    intervalDays: { type: Number, required: true, default: 30 },
    features: [{ type: String }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Plan = models.Plan ?? mongoose.model<IPlan>("Plan", PlanSchema);
