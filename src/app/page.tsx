"use client";

import Link from "next/link";
import Navbar from "@/components/Navbar";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-orange-50">
        <Navbar />
        <main className="max-w-4xl mx-auto px-6 py-24 text-center">
          <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 text-sm font-medium px-4 py-1.5 rounded-full mb-8">
            <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
            Subscription Billing Platform
          </div>
          <h1 className="text-5xl font-bold text-slate-900 mb-6 leading-tight">
            Simple, transparent
            <br />
            <span className="text-orange-500">subscription billing</span>
          </h1>
          <p className="text-xl text-slate-500 mb-12 max-w-2xl mx-auto">
            Manage your plans, payments, and invoices in one place.
            Upgrade or cancel anytime.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/plans"
              className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-8 py-3 rounded-xl transition text-lg"
            >
              View Plans
            </Link>
            <Link
              href="/register"
              className="bg-white hover:bg-slate-50 text-slate-700 font-semibold px-8 py-3 rounded-xl border border-slate-200 transition text-lg"
            >
              Get Started Free
            </Link>
          </div>

          {/* Feature highlights */}
          <div className="mt-24 grid grid-cols-3 gap-8 text-left">
            {[
              {
                icon: "💳",
                title: "Secure Payments",
                desc: "Powered by Razorpay. Your payment data never touches our servers.",
              },
              {
                icon: "📧",
                title: "Instant Notifications",
                desc: "Email confirmations for every payment, invoice, and plan change.",
              },
              {
                icon: "🔄",
                title: "Flexible Plans",
                desc: "Upgrade, downgrade, or cancel anytime. Prorated billing on upgrades.",
              },
            ].map((f) => (
              <div key={f.title} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-semibold text-slate-800 mb-2">{f.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </main>
      </div>
  );
}
