import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Plan } from "@/models/Plan";
import { Subscription } from "@/models/Subscription";
import { Invoice } from "@/models/Invoice";
import { razorpay } from "@/lib/razorpay";
import { getAuthUser } from "@/lib/auth";
import { User } from "@/models/User";

/**
 * POST /api/checkout
 *
 * Decision: Subscription is created with status "pending" here.
 * It only transitions to "active" when the webhook confirms payment.capture.
 * This avoids race conditions between client-side success callbacks and actual money movement.
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

    // Block if user already has an active subscription
    const existingActive = await Subscription.findOne({
      userId: authUser.userId,
      status: "active",
    });
    if (existingActive) {
      return NextResponse.json(
        { error: "You already have an active subscription. Use upgrade/downgrade instead." },
        { status: 409 }
      );
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
    console.error("[checkout/POST]", err);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
