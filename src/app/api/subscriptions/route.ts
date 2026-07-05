import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Subscription } from "@/models/Subscription";
import { getAuthUser } from "@/lib/auth";
import { applySubscriptionLifecycle } from "@/lib/subscriptionLifecycle";

export async function GET(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  let subscription = await Subscription.findOne({
    userId: authUser.userId,
    status: { $in: ["active", "pending", "payment_failed", "cancelled"] },
  })
    .populate("planId")
    .sort({ createdAt: -1 });

  subscription = await applySubscriptionLifecycle(subscription);

  return NextResponse.json({ subscription });
}
