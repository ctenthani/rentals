"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

const SUPABASE_URL = "https://favhmbrpisstrwgytapl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdmhtYnJwaXNzdHJ3Z3l0YXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTM5MzIsImV4cCI6MjEwMTY4OTkzMn0.6V2oE161lKWAATnZDxQiGFLfoRifoRrH7MSb0MHTJ3U";

function formatMK(amount: number) {
  return new Intl.NumberFormat("en-MW", {
    style: "currency",
    currency: "MWK",
    minimumFractionDigits: 0,
  })
    .format(amount)
    .replace("MWK", "MK");
}

function whatsappLink(phone: string, message: string) {
  let n = (phone || "").replace(/\D/g, "");
  if (n.startsWith("0")) n = "265" + n.slice(1);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}

export default function ReceiptPage() {
  const [payment, setPayment] = useState<any>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(null);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get("id");
    setId(paymentId);

    async function load() {
      if (!paymentId) {
        setError("No receipt ID provided");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("payments")
        .select(
          `
          id,
          amount,
          method,
          paid_date,
          months_covered,
          notes,
          tenants (
            full_name,
            phone,
            auth_user_id,
            houses (
              name,
              code
            )
          )
        `
        )
        .eq("id", paymentId)
        .single();

      if (error || !data) {
        setError(error?.message || "Receipt not found");
        setLoading(false);
        return;
      }

      setPayment(data);
      setPhone(data.tenants?.phone || null);

      // Try to get a real email from auth if linked
      // (only works if you later store a real email on the tenant)
      // For now we also allow a manual email field if you add one later
      setEmail(null);

      setLoading(false);
    }

    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-slate-500">Loading receipt...</p>
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white gap-4 p-4">
        <p className="text-red-600 text-center">{error || "Receipt not found"}</p>
        <p className="text-xs text-slate-400">ID: {id || "none"}</p>
        <Link href="/payments" className="text-green-700 text-sm">
          ← Back to Payments
        </Link>
      </div>
    );
  }

  const tenantName = payment.tenants?.full_name || "Tenant";
  const house = Array.isArray(payment.tenants?.houses)
    ? payment.tenants.houses[0]
    : payment.tenants?.houses;

  const receiptUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/receipt?id=${payment.id}`
      : "";

  const messageBody = `Hello ${tenantName},

Your rent payment has been received and confirmed.

Amount: ${formatMK(Number(payment.amount))}
Property: ${house?.name || "—"}
Date: ${payment.paid_date}
Method: ${payment.method}
${payment.months_covered ? `Months covered: ${payment.months_covered}` : ""}

View / print your receipt:
${receiptUrl}

Thank you.
Tenthanis Rentals`;

  const waLink = phone ? whatsappLink(phone, messageBody) : null;

  const mailtoLink = email
    ? `mailto:${email}?subject=${encodeURIComponent(
        `Rent Receipt - ${house?.name || "Property"}`
      )}&body=${encodeURIComponent(messageBody)}`
    : null;

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-md mx-auto">
        {/* Receipt card */}
        <div className="border-2 border-slate-800 p-6 rounded-lg">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold tracking-wide">RENT RECEIPT</h1>
            <p className="text-sm text-slate-600 mt-1">Tenthanis Rentals</p>
          </div>

          <div className="space-y-2 text-sm mb-6">
            <div className="flex justify-between">
              <span className="text-slate-500">Receipt No.</span>
              <span className="font-mono">
                {String(payment.id).slice(0, 8).toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Date</span>
              <span>{payment.paid_date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tenant</span>
              <span className="font-medium">{tenantName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Property</span>
              <span>{house?.name || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Method</span>
              <span>{payment.method}</span>
            </div>
            {payment.months_covered && (
              <div className="flex justify-between">
                <span className="text-slate-500">Months covered</span>
                <span>{payment.months_covered}</span>
              </div>
            )}
          </div>

          <div className="border-t border-b border-slate-300 py-4 my-4 text-center">
            <p className="text-sm text-slate-500">Amount received</p>
            <p className="text-3xl font-bold mt-1">
              {formatMK(Number(payment.amount))}
            </p>
          </div>

          <p className="text-xs text-slate-500 text-center mt-6">
            Thank you for your payment.
          </p>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col gap-3 print:hidden">
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-medium text-center"
            >
              Send via WhatsApp
            </a>
          )}

          {mailtoLink && (
            <a
              href={mailtoLink}
              className="w-full bg-slate-800 hover:bg-slate-900 text-white py-3 rounded-xl font-medium text-center"
            >
              Send via Email
            </a>
          )}

          {!waLink && !mailtoLink && (
            <p className="text-sm text-center text-slate-500 bg-slate-50 p-3 rounded-xl">
              No phone or email on file for this tenant. Add a phone number on
              the Dashboard to send via WhatsApp.
            </p>
          )}

          <button
            onClick={() => window.print()}
            className="w-full border border-slate-200 text-slate-700 py-3 rounded-xl font-medium"
          >
            Print / Save as PDF
          </button>

          <Link
            href="/payments"
            className="w-full text-center text-sm text-slate-600 py-2"
          >
            ← Back to Payments
          </Link>
        </div>
      </div>
    </div>
  );
}
