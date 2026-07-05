import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { verifyPaymentSignature } from "@/lib/razorpayVerify";
import { getAuthUser } from "@/lib/auth";
import { activateSubscriptionByOrderId, assertOrderOwnedByUser } from "@/lib/activateSubscription";
import { logError } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: "Missing payment details" }, { status: 400 });
    }

    if (
      !verifyPaymentSignature(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      )
    ) {
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
    }

    await connectDB();

    const owned = await assertOrderOwnedByUser(razorpay_order_id, authUser.userId);
    if (!owned) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await activateSubscriptionByOrderId(
      razorpay_order_id,
      razorpay_payment_id,
      undefined,
      "verify"
    );

    return NextResponse.json({
      status: result.alreadyComplete ? "already_complete" : "completed",
      type: result.type,
      subscriptionId: result.subscriptionId,
    });
  } catch (err) {
    logError("verify.failed", err);
    return NextResponse.json({ error: "Payment verification failed" }, { status: 500 });
  }
}
