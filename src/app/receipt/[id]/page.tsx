"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useParams } from "next/navigation";

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

export default function ReceiptPage() {
  const params = useParams();
  const id = params.id as string;
  const [payment, setPayment] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("payments")
        .select(
          `
          id, amount, method, paid_date, months_covered, notes,
          tenants (full_name, houses (name, code))
        `
        )
        .eq("id", id)
        .single();

      setPayment(data);
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading receipt...
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Receipt not found
      </div>
    );
  }

  const tenantName = payment.tenants?.full_name || "Tenant";
  const house = Array.isArray(payment.tenants?.houses)
    ? payment.tenants.houses[0]
    : payment.tenants?.houses;

  return (
    <div className="min-h-screen bg-white p-6 max-w-md mx-auto">
      <div className="border-2 border-slate-800 p-6 rounded-lg">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold">RENT RECEIPT</h1>
          <p className="text-sm text-slate-600 mt-1">Tenthanis Rentals</p>
        </div>

        <div className="space-y-2 text-sm mb-6">
          <div className="flex justify-between">
            <span className="text-slate-500">Receipt No.</span>
            <span className="font-mono">{payment.id.slice(0, 8).toUpperCase()}</span>
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

      <button
        onClick={() => window.print()}
        className="mt-6 w-full bg-green-600 text-white py-3 rounded-xl font-medium print:hidden"
      >
        Print / Save as PDF
      </button>
    </div>
  );
}
