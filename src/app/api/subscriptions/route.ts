import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Subscription } from "@/models/Subscription";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const subscription = await Subscription.findOne({
    userId: authUser.userId,
    status: { $in: ["active", "pending", "payment_failed"] },
  })
    .populate("planId")
    .sort({ createdAt: -1 });

  return NextResponse.json({ subscription });
}
