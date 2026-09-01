"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

const SUPABASE_URL = "https://favhmbrpisstrwgytapl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdmhtYnJwaXNzdHJ3Z3l0YXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTM5MzIsImV4cCI6MjEwMTY4OTkzMn0.6V2oE161lKWAATnZDxQiGFLfoRifoRrH7MSb0MHTJ3U";

function formatMK(n: number) {
  return new Intl.NumberFormat("en-MW", {
    style: "currency",
    currency: "MWK",
    minimumFractionDigits: 0,
  })
    .format(n)
    .replace("MWK", "MK");
}

export default function ReceiptPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brand, setBrand] = useState("Rentozi Rentals");
  const [landlordName, setLandlordName] = useState("");
  const [payment, setPayment] = useState<any>(null);
  const [tenantName, setTenantName] = useState("");
  const [houseLabel, setHouseLabel] = useState("");

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  useEffect(() => {
    async function load() {
      const id = new URLSearchParams(window.location.search).get("id");
      if (!id) {
        setError("Missing receipt id");
        setLoading(false);
        return;
      }

      const { data, error: qErr } = await supabase
        .from("payments")
        .select(
          `id, amount, method, paid_date, months_covered, notes, created_at, tenant_id,
           tenants ( full_name, landlord_id, houses ( name, code ) )`
        )
        .eq("id", id)
        .maybeSingle();

      if (qErr || !data) {
        setError(qErr?.message || "Receipt not found");
        setLoading(false);
        return;
      }

      setPayment(data);
      const t: any = Array.isArray(data.tenants) ? data.tenants[0] : data.tenants;
      setTenantName(t?.full_name || "Tenant");
      const h = t?.houses
        ? Array.isArray(t.houses)
          ? t.houses[0]
          : t.houses
        : null;
      setHouseLabel(h ? `${h.name} (${h.code})` : "—");

      if (t?.landlord_id) {
        const { data: ll } = await supabase
          .from("landlords")
          .select("business_name, full_name")
          .eq("id", t.landlord_id)
          .maybeSingle();
        if (ll?.business_name) setBrand(ll.business_name);
        else if (ll?.full_name) setBrand(ll.full_name);
        if (ll?.full_name) setLandlordName(ll.full_name);
      }

      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Loading receipt...</p>
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-red-600 text-sm">{error}</p>
        <Link href="/dashboard" className="text-emerald-700 text-sm">
          ← Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-md mx-auto">
        <div className="flex justify-between mb-4 print:hidden">
          <Link href="/dashboard" className="text-sm text-slate-600">
            ← Back
          </Link>
          <button
            onClick={() => window.print()}
            className="bg-emerald-600 text-white text-sm px-4 py-2 rounded-xl"
          >
            Print
          </button>
        </div>

        <article className="bg-white border-2 border-slate-800 p-6">
          <p className="text-center text-xs uppercase tracking-widest text-slate-500">
            Official receipt
          </p>
          <h1 className="text-center text-xl font-bold mt-1">{brand}</h1>
          {landlordName && (
            <p className="text-center text-sm text-slate-600">{landlordName}</p>
          )}
          <hr className="my-4" />
          <p className="text-sm">
            <strong>Receipt No:</strong> {String(payment.id).slice(0, 8).toUpperCase()}
          </p>
          <p className="text-sm">
            <strong>Date:</strong> {payment.paid_date}
          </p>
          <p className="text-sm">
            <strong>Received from:</strong> {tenantName}
          </p>
          <p className="text-sm">
            <strong>Property:</strong> {houseLabel}
          </p>
          <p className="text-sm">
            <strong>Method:</strong> {payment.method}
          </p>
          {payment.months_covered ? (
            <p className="text-sm">
              <strong>Months covered:</strong> {payment.months_covered}
            </p>
          ) : null}
          <p className="text-2xl font-bold text-center my-6">
            {formatMK(Number(payment.amount))}
          </p>
          <p className="text-xs text-slate-500 text-center">
            Thank you for your payment.
          </p>
          <p className="text-xs text-center mt-4 font-semibold">{brand}</p>
        </article>
      </div>
    </div>
  );
}
