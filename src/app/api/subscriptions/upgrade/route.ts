import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Subscription } from "@/models/Subscription";
import { Plan } from "@/models/Plan";
import { User } from "@/models/User";
import { Invoice } from "@/models/Invoice";
import { razorpay } from "@/lib/razorpay";
import { getAuthUser } from "@/lib/auth";
import { sendPlanChanged } from "@/lib/email";
import { calculateProratedUpgradeCharge, isUpgrade } from "@/lib/proration";
import { logError } from "@/lib/logger";

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
  const upgrading = isUpgrade(currentPlan?.amountPaise ?? 0, newPlan.amountPaise);

  const chargeAmountPaise = upgrading
    ? calculateProratedUpgradeCharge(
        currentPlan?.amountPaise ?? 0,
        newPlan.amountPaise,
        new Date(subscription.currentPeriodStart),
        new Date(subscription.currentPeriodEnd),
        now
      )
    : 0;

  // Upgrade with prorated charge — collect payment first, then apply plan
  if (upgrading && chargeAmountPaise > 0) {
    const order = await razorpay.orders.create({
      amount: chargeAmountPaise,
      currency: "INR",
      receipt: `upgrade_${Date.now()}`,
      notes: { userId: authUser.userId, planId: newPlanId, type: "upgrade" },
    });

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

    const user = await User.findById(authUser.userId);
    return NextResponse.json({
      message: "Payment required to upgrade",
      newPlan: newPlan.name,
      currentPlan: currentPlan?.name,
      chargeAmountPaise,
      orderId: order.id,
      requiresPayment: true,
      keyId: process.env.RAZORPAY_KEY_ID,
      currency: "INR",
      userName: user?.name,
      userEmail: user?.email,
    });
  }

  // Downgrade, or upgrade with zero prorated charge — apply immediately
  subscription.previousPlanId = subscription.planId;
  subscription.planId = newPlan._id;
  subscription.planChangedAt = now;
  if (upgrading) {
    subscription.cancelAtPeriodEnd = false;
    subscription.cancelledAt = undefined;
  }
  await subscription.save();

  const user = await User.findById(authUser.userId);
  if (user) {
    try {
      await sendPlanChanged(
        user.email,
        currentPlan?.name ?? "previous plan",
        newPlan.name,
        now
      );
    } catch (err) {
      logError("upgrade.email_failed", err);
    }
  }

  return NextResponse.json({
    message: upgrading ? "Plan upgraded" : "Plan downgraded",
    newPlan: newPlan.name,
    chargeAmountPaise: 0,
    orderId: null,
    requiresPayment: false,
    keyId: null,
  });
}
