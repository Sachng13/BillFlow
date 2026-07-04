import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Invoice } from "@/models/Invoice";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const invoices = await Invoice.find({ userId: authUser.userId })
    .populate("planId", "name")
    .sort({ createdAt: -1 });

  return NextResponse.json({ invoices });
}
