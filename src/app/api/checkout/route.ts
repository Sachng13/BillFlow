import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Plan } from "@/models/Plan";
import { Subscription } from "@/models/Subscription";
import { Invoice } from "@/models/Invoice";
import { razorpay } from "@/lib/razorpay";
import { getAuthUser } from "@/lib/auth";
import { User } from "@/models/User";
import { logError } from "@/lib/logger";

/**
 * POST /api/checkout
 *
 * Decision: Subscription is created with status "pending" here.
 * It transitions to "active" when payment is confirmed via verify or webhook.
 *
 * Edge case: If user already has an active subscription, we block checkout
 * (they should upgrade instead).
 */
export async function POST(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId } = await req.json();
    if (!planId) {
      return NextResponse.json({ error: "planId required" }, { status: 400 });
    }

    await connectDB();

    const plan = await Plan.findById(planId);
    if (!plan || !plan.isActive) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // Block if user already has an active or pending subscription
    const existing = await Subscription.findOne({
      userId: authUser.userId,
      status: { $in: ["active", "pending"] },
    });
    if (existing) {
      const msg =
        existing.status === "active"
          ? "You already have an active subscription. Use upgrade/downgrade instead."
          : "You have a pending checkout. Complete payment or wait before starting a new one.";
      return NextResponse.json({ error: msg }, { status: 409 });
    }

    const user = await User.findById(authUser.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: plan.amountPaise,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      notes: {
        userId: authUser.userId,
        planId: plan._id.toString(),
        planName: plan.name,
      },
    });

    // Create subscription in "pending" state
    const subscription = await Subscription.create({
      userId: authUser.userId,
      planId: plan._id,
      status: "pending",
      razorpayOrderId: order.id,
    });

    // Generate invoice number: INV-YYYY-XXXX
    const invoiceCount = await Invoice.countDocuments();
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invoiceCount + 1).padStart(4, "0")}`;

    // Create a draft invoice — marks paid when webhook fires
    await Invoice.create({
      userId: authUser.userId,
      subscriptionId: subscription._id,
      planId: plan._id,
      razorpayOrderId: order.id,
      amountPaise: plan.amountPaise,
      status: "draft",
      invoiceNumber,
    });

    return NextResponse.json({
      orderId: order.id,
      amount: plan.amountPaise,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID,
      planName: plan.name,
      userName: user.name,
      userEmail: user.email,
      subscriptionId: subscription._id,
    });
  } catch (err) {
    logError("checkout.failed", err);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
