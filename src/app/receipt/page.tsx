"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

const SUPABASE_URL = "https://favhmbrpisstrwgytapl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdmhtYnJwaXNzdHJ3Z3l0YXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTM5MzIsImV4cCI6MjEwMTY4OTkzMn0.6V2oE161lKWAATnZDxQiGFLfoRifoRrH7MSb0MHTJ3U";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function formatMK(n: number) {
  return new Intl.NumberFormat("en-MW", {
    style: "currency",
    currency: "MWK",
    minimumFractionDigits: 0,
  })
    .format(n)
    .replace("MWK", "MK");
}

function addMonths(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

export default function ReceiptPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pay, setPay] = useState<any>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [house, setHouse] = useState<any>(null);
  const [biz, setBiz] = useState("Rentozi");
  const [landlordName, setLandlordName] = useState("");
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [months, setMonths] = useState(1);

  useEffect(() => {
    (async () => {
      const id = new URLSearchParams(window.location.search).get("id");
      if (!id) {
        setError("Missing receipt id");
        setLoading(false);
        return;
      }

      const { data: p, error: pErr } = await supabase
        .from("payments")
        .select("id, amount, method, paid_date, created_at, tenant_id, reference")
        .eq("id", id)
        .maybeSingle();
      if (pErr || !p) {
        setError(pErr?.message || "Receipt not found");
        setLoading(false);
        return;
      }
      setPay(p);

      const { data: t } = await supabase
        .from("tenants")
        .select("id, full_name, email, phone, landlord_id, house_id")
        .eq("id", p.tenant_id)
        .maybeSingle();
      setTenant(t);

      if (t?.house_id) {
        const { data: h } = await supabase
          .from("houses")
          .select("id, name, code, monthly_rent")
          .eq("id", t.house_id)
          .maybeSingle();
        setHouse(h);
        const rent = Number(h?.monthly_rent || 0);
        const covered = rent > 0 ? Math.max(1, Math.round(Number(p.amount) / rent)) : 1;
        setMonths(covered);
      }

      const { data: bal } = await supabase
        .from("tenant_balances")
        .select("next_due_date, months_in_advance")
        .eq("tenant_id", p.tenant_id)
        .maybeSingle();
      if (bal?.next_due_date) setNextDue(bal.next_due_date);
      else {
        const start = p.paid_date || p.created_at?.slice(0, 10);
        const rent = Number((await supabase.from("houses").select("monthly_rent").eq("id", t?.house_id).maybeSingle()).data?.monthly_rent || 0);
        const covered = rent > 0 ? Math.max(1, Math.round(Number(p.amount) / rent)) : 1;
        if (start) setNextDue(addMonths(start, covered));
      }

      if (t?.landlord_id) {
        const { data: pub } = await supabase.rpc("landlord_public", { p_id: t.landlord_id });
        if (pub) {
          setBiz(pub.business_name || pub.full_name || "Rentozi");
          setLandlordName(pub.full_name || "");
        }
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading receipt...</div>;
  }
  if (error || !pay) {
    return <div className="min-h-screen flex items-center justify-center text-red-600">{error || "Not found"}</div>;
  }

  const date = pay.paid_date || pay.created_at?.slice(0, 10);
  const receiptNo = String(pay.id).slice(0, 8).toUpperCase();

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4">
      <div className="max-w-xl mx-auto mb-4 flex justify-between print:hidden">
        <Link href="/tenant" className="text-sm text-slate-600">
          ← Back
        </Link>
        <button onClick={() => window.print()} className="bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold">
          Print
        </button>
      </div>

      <article className="max-w-xl mx-auto bg-white border-2 border-slate-800 p-8 text-slate-900">
        <p className="text-center text-[11px] tracking-[0.2em] uppercase text-slate-500">Official receipt</p>
        <h1 className="text-center text-2xl font-bold mt-1">{biz}</h1>
        {landlordName && <p className="text-center text-sm text-slate-500">{landlordName}</p>}
        <hr className="my-5 border-slate-800" />

        <p className="text-sm mb-4">
          Dear {tenant?.full_name || "Tenant"},
        </p>
        <p className="text-sm mb-4">Your rent payment has been received and confirmed.</p>

        <div className="text-sm space-y-1">
          <p>
            <strong>Receipt No:</strong> {receiptNo}
          </p>
          <p>
            <strong>Date:</strong> {date}
          </p>
          <p>
            <strong>Received from:</strong> {tenant?.full_name}
          </p>
          <p>
            <strong>Property:</strong> {house?.name} {house?.code ? `(${house.code})` : ""}
          </p>
          <p>
            <strong>Method:</strong> {pay.method || "—"}
          </p>
          {pay.reference && (
            <p>
              <strong>Reference:</strong> {pay.reference}
            </p>
          )}
          <p>
            <strong>Months covered:</strong> {months}
          </p>
          <p>
            <strong>Next due date:</strong> {nextDue || "—"}
          </p>
        </div>

        <p className="text-center text-3xl font-bold my-8">{formatMK(Number(pay.amount))}</p>
        <p className="text-center text-sm text-slate-500">Thank you for your payment.</p>
        <p className="text-center font-semibold mt-1">{biz}</p>
      </article>
    </div>
  );
}
