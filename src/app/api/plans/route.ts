import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Plan } from "@/models/Plan";

// Seed default plans if none exist
async function seedPlans() {
  const count = await Plan.countDocuments();
  if (count > 0) return;

  await Plan.insertMany([
    {
      name: "Starter",
      slug: "starter",
      description: "Perfect for individuals and small projects",
      amountPaise: 49900, // ₹499/month
      intervalDays: 30,
      features: ["5 Projects", "10 GB Storage", "Email Support", "API Access"],
      isActive: true,
    },
    {
      name: "Pro",
      slug: "pro",
      description: "Best for growing teams and businesses",
      amountPaise: 149900, // ₹1499/month
      intervalDays: 30,
      features: [
        "Unlimited Projects",
        "100 GB Storage",
        "Priority Support",
        "Advanced Analytics",
        "Team Collaboration",
        "Custom Integrations",
      ],
      isActive: true,
    },
    {
      name: "Enterprise",
      slug: "enterprise",
      description: "For large organizations with custom needs",
      amountPaise: 499900, // ₹4999/month
      intervalDays: 30,
      features: [
        "Everything in Pro",
        "Unlimited Storage",
        "24/7 Dedicated Support",
        "SLA Guarantee",
        "SSO / SAML",
        "Custom Contracts",
        "On-premise option",
      ],
      isActive: true,
    },
  ]);
}

export async function GET() {
  try {
    await connectDB();
    await seedPlans();
    const plans = await Plan.find({ isActive: true }).sort({ amountPaise: 1 });
    return NextResponse.json({ plans });
  } catch (err) {
    console.error("[plans/GET]", err);
    return NextResponse.json({ error: "Failed to fetch plans" }, { status: 500 });
  }
}
