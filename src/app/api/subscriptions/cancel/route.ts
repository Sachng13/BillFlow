import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Subscription } from "@/models/Subscription";
import { Plan } from "@/models/Plan";
import { User } from "@/models/User";
import { getAuthUser } from "@/lib/auth";
import { sendSubscriptionCancelled } from "@/lib/email";

/**
 * POST /api/subscriptions/cancel
 *
 * Decision: "Cancel" does NOT immediately deactivate the subscription.
 * We set cancelAtPeriodEnd = true. The user retains access until currentPeriodEnd.
 * Status transitions to "cancelled" at period end (handled by a cron/scheduler in prod).
 *
 * This matches industry standard (Stripe, Razorpay subscriptions) and gives users
 * the value they paid for without a refund flow.
 */
export async function POST(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const subscription = await Subscription.findOne({
    userId: authUser.userId,
    status: "active",
  });

  if (!subscription) {
    return NextResponse.json(
      { error: "No active subscription found" },
      { status: 404 }
    );
  }

  if (subscription.cancelAtPeriodEnd) {
    return NextResponse.json(
      { error: "Subscription is already scheduled to cancel" },
      { status: 409 }
    );
  }

  subscription.cancelAtPeriodEnd = true;
  subscription.cancelledAt = new Date();
  await subscription.save();

  // Send cancellation email
  const user = await User.findById(authUser.userId);
  const plan = await Plan.findById(subscription.planId);
  if (user && plan) {
    await sendSubscriptionCancelled(
      user.email,
      plan.name,
      subscription.currentPeriodEnd
    );
  }

  return NextResponse.json({
    message: "Subscription will cancel at period end",
    accessUntil: subscription.currentPeriodEnd,
  });
}
