"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Navbar from "@/components/Navbar";
import { Suspense } from "react";

interface Plan {
  _id: string;
  name: string;
  slug: string;
  amountPaise: number;
  features: string[];
}

interface Subscription {
  _id: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  planId: Plan;
  planChangedAt?: string;
}

interface Invoice {
  _id: string;
  invoiceNumber: string;
  status: string;
  amountPaise: number;
  createdAt: string;
  paidAt?: string;
  planId: { name: string };
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  cancelled: "bg-red-100 text-red-700",
  expired: "bg-slate-100 text-slate-500",
  payment_failed: "bg-red-100 text-red-600",
};

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

async function loadRazorpayScript() {
  if (window.Razorpay) return;
  await new Promise<void>((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    document.body.appendChild(script);
  });
}

function DashboardContent() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
  }, [user, isLoading, router]);

  useEffect(() => {
    const payment = searchParams.get("payment");
    if (payment === "pending") {
      setMessage(
        "Payment submitted! Your subscription will activate shortly once confirmed."
      );
    } else if (payment === "success") {
      setMessage("Payment successful! Your subscription is now active.");
    }
  }, [searchParams]);

  const fetchData = useCallback(async () => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const [subRes, invRes, plansRes] = await Promise.all([
      fetch("/api/subscriptions", { headers }),
      fetch("/api/invoices", { headers }),
      fetch("/api/plans"),
    ]);
    const subData = await subRes.json();
    const invData = await invRes.json();
    const plansData = await plansRes.json();
    setSubscription(subData.subscription ?? null);
    setInvoices(invData.invoices ?? []);
    setAllPlans(plansData.plans ?? []);
    setLoading(false);
  }, [token]);

  // Poll for activation when subscription is still pending after payment
  useEffect(() => {
    const payment = searchParams.get("payment");
    if (!token || !payment || subscription?.status !== "pending") return;

    const interval = setInterval(() => {
      fetchData();
    }, 3000);

    return () => clearInterval(interval);
  }, [token, searchParams, subscription?.status, fetchData]);

  useEffect(() => {
    if (token) fetchData();
  }, [token, fetchData]);

  const handleCancel = async () => {
    if (!confirm("Cancel your subscription? You'll retain access until the current period ends.")) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/subscriptions/cancel", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }
      setMessage(`Subscription cancelled. Access until ${new Date(data.accessUntil).toDateString()}`);
      fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpgrade = async (newPlanId: string) => {
    if (!token || !user) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/subscriptions/upgrade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPlanId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error);
        return;
      }

      // Downgrade — no payment needed
      if (!data.requiresPayment) {
        setMessage(`${data.message} to ${data.newPlan}`);
        fetchData();
        return;
      }

      // Upgrade with prorated charge — open Razorpay
      await loadRazorpayScript();

      const rzp = new window.Razorpay({
        key: data.keyId,
        amount: data.chargeAmountPaise,
        currency: data.currency ?? "INR",
        order_id: data.orderId,
        name: "BillFlow",
        description: `Upgrade to ${data.newPlan}`,
        prefill: { name: data.userName ?? user.name, email: data.userEmail ?? user.email },
        theme: { color: "#F97316" },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verifyRes = await fetch("/api/checkout/verify", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok) {
              alert(verifyData.error ?? "Payment verification failed");
              return;
            }
            setMessage(`Upgraded to ${data.newPlan}! Prorated charge: ₹${data.chargeAmountPaise / 100}`);
            fetchData();
          } catch {
            alert("Payment verification failed. Please refresh your dashboard.");
            fetchData();
          }
        },
        modal: {
          ondismiss: () => setActionLoading(false),
        },
      });
      rzp.open();
    } finally {
      setActionLoading(false);
    }
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="flex items-center justify-center py-32 text-slate-400">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Dashboard</h1>
        <p className="text-slate-500 mb-8">Welcome back, {user?.name}</p>

        {message && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm p-4 rounded-xl mb-6">
            {message}
          </div>
        )}

        {/* Subscription Card */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
          <h2 className="font-semibold text-slate-700 mb-4 text-sm uppercase tracking-wide">
            Current Subscription
          </h2>

          {!subscription ? (
            <div className="text-center py-8">
              <p className="text-slate-500 mb-4">No active subscription</p>
              <button
                onClick={() => router.push("/plans")}
                className="bg-orange-500 text-white px-6 py-2.5 rounded-xl font-medium text-sm hover:bg-orange-600 transition"
              >
                Browse Plans
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">{subscription.planId?.name} Plan</h3>
                  <p className="text-slate-500 text-sm mt-1">
                    ₹{subscription.planId?.amountPaise / 100}/month
                  </p>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${STATUS_COLORS[subscription.status] ?? "bg-slate-100 text-slate-500"}`}>
                  {subscription.cancelAtPeriodEnd ? "Cancels at period end" : subscription.status}
                </span>
              </div>

              {subscription.currentPeriodEnd && (
                <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-slate-400 text-xs mb-1">Period Start</p>
                    <p className="font-medium text-slate-700">
                      {new Date(subscription.currentPeriodStart).toDateString()}
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-slate-400 text-xs mb-1">
                      {subscription.cancelAtPeriodEnd ? "Access Until" : "Next Billing"}
                    </p>
                    <p className="font-medium text-slate-700">
                      {new Date(subscription.currentPeriodEnd).toDateString()}
                    </p>
                  </div>
                </div>
              )}

              {/* Plan change options */}
              {subscription.status === "active" && !subscription.cancelAtPeriodEnd && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-400 mb-3 font-medium uppercase tracking-wide">Switch Plan</p>
                  <div className="flex gap-2 flex-wrap">
                    {allPlans
                      .filter((p) => p._id !== subscription.planId?._id)
                      .map((p) => (
                        <button
                          key={p._id}
                          onClick={() => handleUpgrade(p._id)}
                          disabled={actionLoading}
                          className="text-xs border border-slate-200 hover:border-orange-400 hover:text-orange-600 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                        >
                          {p.amountPaise > subscription.planId?.amountPaise ? "↑" : "↓"} Switch to {p.name} (₹{p.amountPaise / 100}/mo)
                        </button>
                      ))}
                    <button
                      onClick={handleCancel}
                      disabled={actionLoading}
                      className="text-xs border border-red-200 text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                    >
                      Cancel subscription
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Invoices */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h2 className="font-semibold text-slate-700 mb-4 text-sm uppercase tracking-wide">
            Billing History
          </h2>
          {invoices.length === 0 ? (
            <p className="text-slate-400 text-sm py-4 text-center">No invoices yet</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {invoices.map((inv) => (
                <div key={inv._id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-700 text-sm">{inv.invoiceNumber}</p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      {inv.planId?.name} · {new Date(inv.createdAt).toDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-800 text-sm">₹{inv.amountPaise / 100}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      inv.status === "paid"
                        ? "bg-green-100 text-green-600"
                        : inv.status === "void"
                        ? "bg-slate-100 text-slate-400"
                        : "bg-yellow-100 text-yellow-600"
                    }`}>
                      {inv.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}
