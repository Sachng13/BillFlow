import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BillFlow – Subscription Billing",
  description: "Subscription billing platform by RegisterKaro",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
