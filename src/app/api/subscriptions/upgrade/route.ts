import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Subscription } from "@/models/Subscription";
import { Plan } from "@/models/Plan";
import { User } from "@/models/User";
import { Invoice } from "@/models/Invoice";
import { razorpay } from "@/lib/razorpay";
import { getAuthUser } from "@/lib/auth";
import { sendPlanChanged } from "@/lib/email";

/**
 * POST /api/subscriptions/upgrade
 *
 * Handles both upgrade and downgrade mid-cycle.
 *
 * Decision: Immediate plan change with prorated billing.
 * - Calculate remaining days in the current period.
 * - Charge only the difference for upgrade (prorated amount).
 * - For downgrade: apply immediately, no refund (simpler, noted in ARCHITECTURE.md).
 * - A new Razorpay order is created for the prorated amount.
 * - A new pending invoice is created; activated via webhook.
 *
 * Alternative considered: Change at period end (simpler, no proration).
 * Rejected because users upgrading mid-month expect features immediately.
 */
export async function POST(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { newPlanId } = await req.json();
  if (!newPlanId) {
    return NextResponse.json({ error: "newPlanId required" }, { status: 400 });
  }

  await connectDB();

  const subscription = await Subscription.findOne({
    userId: authUser.userId,
    status: "active",
  });

  if (!subscription) {
    return NextResponse.json({ error: "No active subscription" }, { status: 404 });
  }

  const currentPlan = await Plan.findById(subscription.planId);
  const newPlan = await Plan.findById(newPlanId);

  if (!newPlan || !newPlan.isActive) {
    return NextResponse.json({ error: "New plan not found" }, { status: 404 });
  }

  if (subscription.planId.toString() === newPlanId) {
    return NextResponse.json({ error: "Already on this plan" }, { status: 409 });
  }

  const now = new Date();
  const periodEnd = new Date(subscription.currentPeriodEnd);
  const totalDays = (periodEnd.getTime() - new Date(subscription.currentPeriodStart).getTime()) / 86400000;
  const remainingDays = Math.max(0, (periodEnd.getTime() - now.getTime()) / 86400000);
  const remainingFraction = remainingDays / totalDays;

  const isUpgrade = newPlan.amountPaise > (currentPlan?.amountPaise ?? 0);

  let chargeAmountPaise = 0;
  if (isUpgrade) {
    // Prorated: charge the difference for remaining days
    const diff = newPlan.amountPaise - (currentPlan?.amountPaise ?? 0);
    chargeAmountPaise = Math.round(diff * remainingFraction);
  }
  // Downgrade: no charge, no refund — apply immediately

  let orderId: string | null = null;

  if (chargeAmountPaise > 0) {
    const order = await razorpay.orders.create({
      amount: chargeAmountPaise,
      currency: "INR",
      receipt: `upgrade_${Date.now()}`,
      notes: {
        userId: authUser.userId,
        planId: newPlanId,
        type: "upgrade",
      },
    });
    orderId = order.id;

    const invoiceCount = await Invoice.countDocuments();
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invoiceCount + 1).padStart(4, "0")}`;

    await Invoice.create({
      userId: authUser.userId,
      subscriptionId: subscription._id,
      planId: newPlan._id,
      razorpayOrderId: order.id,
      amountPaise: chargeAmountPaise,
      status: "draft",
      invoiceNumber,
    });
  }

  // Update subscription plan
  subscription.previousPlanId = subscription.planId;
  subscription.planId = newPlan._id;
  subscription.planChangedAt = now;
  // Reset cancelAtPeriodEnd if they're upgrading (assume they want to stay)
  if (isUpgrade) {
    subscription.cancelAtPeriodEnd = false;
    subscription.cancelledAt = undefined;
  }
  await subscription.save();

  // Notify user
  const user = await User.findById(authUser.userId);
  if (user) {
    await sendPlanChanged(
      user.email,
      currentPlan?.name ?? "previous plan",
      newPlan.name,
      now
    );
  }

  return NextResponse.json({
    message: isUpgrade ? "Plan upgraded" : "Plan downgraded",
    newPlan: newPlan.name,
    chargeAmountPaise,
    // If upgrade has a charge, return orderId for client to pay
    orderId: orderId,
    requiresPayment: chargeAmountPaise > 0,
    keyId: chargeAmountPaise > 0 ? process.env.RAZORPAY_KEY_ID : null,
  });
}
