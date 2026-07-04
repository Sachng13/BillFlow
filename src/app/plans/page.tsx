"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/components/AuthProvider";
import Navbar from "@/components/Navbar";

interface Plan {
  _id: string;
  name: string;
  slug: string;
  description: string;
  amountPaise: number;
  intervalDays: number;
  features: string[];
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function PlansContent() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const { user, token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    fetch("/api/plans")
      .then((r) => r.json())
      .then((d) => setPlans(d.plans ?? []))
      .finally(() => setLoading(false));
  }, []);

  const handleSubscribe = async (plan: Plan) => {
    if (!user || !token) {
      router.push("/register");
      return;
    }

    setCheckoutLoading(plan._id);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ planId: plan._id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error);
        return;
      }

      // Load Razorpay script if not already loaded
      if (!window.Razorpay) {
        await new Promise<void>((resolve) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => resolve();
          document.body.appendChild(script);
        });
      }

      const rzp = new window.Razorpay({
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        order_id: data.orderId,
        name: "BillFlow",
        description: `${data.planName} Subscription`,
        prefill: { name: data.userName, email: data.userEmail },
        theme: { color: "#F97316" },
        handler: () => {
          // Webhook is the source of truth — client handler just redirects.
          // We show a "pending" message; webhook will activate it.
          router.push("/dashboard?payment=pending");
        },
        modal: {
          ondismiss: () => setCheckoutLoading(null),
        },
      });
      rzp.open();
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const highlighted = ["Pro"]; // visually highlight recommended plan

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-14">
          <h1 className="text-4xl font-bold text-slate-900 mb-3">Simple, honest pricing</h1>
          <p className="text-slate-500 text-lg">No hidden fees. Cancel anytime.</p>
        </div>

        {loading ? (
          <div className="text-center py-20 text-slate-400">Loading plans…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const isHighlighted = highlighted.includes(plan.name);
              return (
                <div
                  key={plan._id}
                  className={`rounded-2xl p-8 flex flex-col ${
                    isHighlighted
                      ? "bg-orange-500 text-white shadow-xl scale-105"
                      : "bg-white border border-slate-100 shadow-sm"
                  }`}
                >
                  {isHighlighted && (
                    <div className="text-xs font-bold uppercase tracking-wider bg-white/20 rounded-full px-3 py-1 self-start mb-4">
                      Most Popular
                    </div>
                  )}
                  <h2 className={`text-xl font-bold mb-1 ${isHighlighted ? "text-white" : "text-slate-800"}`}>
                    {plan.name}
                  </h2>
                  <p className={`text-sm mb-5 ${isHighlighted ? "text-orange-100" : "text-slate-500"}`}>
                    {plan.description}
                  </p>
                  <div className="mb-6">
                    <span className={`text-4xl font-extrabold ${isHighlighted ? "text-white" : "text-slate-900"}`}>
                      ₹{plan.amountPaise / 100}
                    </span>
                    <span className={`text-sm ml-1 ${isHighlighted ? "text-orange-100" : "text-slate-400"}`}>
                      /month
                    </span>
                  </div>
                  <ul className="space-y-2 mb-8 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className={`flex items-center gap-2 text-sm ${isHighlighted ? "text-orange-50" : "text-slate-600"}`}>
                        <span className={`text-base ${isHighlighted ? "text-white" : "text-orange-500"}`}>✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => handleSubscribe(plan)}
                    disabled={checkoutLoading === plan._id}
                    className={`w-full py-3 rounded-xl font-semibold transition text-sm disabled:opacity-60 ${
                      isHighlighted
                        ? "bg-white text-orange-500 hover:bg-orange-50"
                        : "bg-orange-500 text-white hover:bg-orange-600"
                    }`}
                  >
                    {checkoutLoading === plan._id ? "Loading…" : "Get started"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlansPage() {
  return (
    <AuthProvider>
      <PlansContent />
    </AuthProvider>
  );
}
