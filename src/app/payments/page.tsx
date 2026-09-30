"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
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

function addMonths(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

function computeStatus(nextDue: string | null, balance: number) {
  if (Number(balance) > 0) return "overdue";
  if (!nextDue) return "upcoming";
  const due = new Date(nextDue + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  due.setHours(12, 0, 0, 0);
  if (due > today) return "paid";
  if (due.getTime() === today.getTime()) return "due";
  return "overdue";
}

export default function RecordPaymentPage() {
  const router = useRouter();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [biz, setBiz] = useState("Rentozi");

  const [tenantId, setTenantId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Bank");
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");

  const selected = tenants.find((t) => t.id === tenantId);
  const rent = Number(selected?.house?.monthly_rent || 0);
  const months = rent > 0 && Number(amount) > 0 ? Math.max(1, Math.round(Number(amount) / rent)) : 0;

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/auth/login");
        return;
      }
      const { data: lid } = await supabase.rpc("my_landlord_id");
      if (!lid) {
        setError("No landlord profile");
        setLoading(false);
        return;
      }
      const { data: pub } = await supabase.rpc("landlord_public", { p_id: lid });
      if (pub) setBiz(pub.business_name || pub.full_name || "Rentozi");

      const { data: list, error: tErr } = await supabase
        .from("tenants")
        .select("id, full_name, email, phone, houses(id, name, code, monthly_rent)")
        .eq("landlord_id", lid)
        .order("full_name");
      if (tErr) setError(tErr.message);
      const mapped = (list || []).map((t: any) => ({
        ...t,
        house: Array.isArray(t.houses) ? t.houses[0] : t.houses,
      }));
      setTenants(mapped);
      if (mapped[0]) setTenantId(mapped[0].id);
      setLoading(false);
    })();
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    setMsg(null);

    const { data: pay, error: pErr } = await supabase
      .from("payments")
      .insert({
        tenant_id: selected.id,
        amount: Number(amount),
        method,
        paid_date: paidDate,
        reference,
      })
      .select("id")
      .maybeSingle();
    if (pErr) {
      setSaving(false);
      setError(pErr.message);
      return;
    }

    const { data: bal } = await supabase
      .from("tenant_balances")
      .select("*")
      .eq("tenant_id", selected.id)
      .maybeSingle();
    const startFrom =
      bal?.next_due_date && new Date(bal.next_due_date) > new Date()
        ? bal.next_due_date
        : paidDate;
    const covered = months || 1;
    const nextDue = addMonths(startFrom, covered);
    const status = computeStatus(nextDue, 0);
    await supabase.from("tenant_balances").upsert({
      tenant_id: selected.id,
      next_due_date: nextDue,
      months_in_advance: covered,
      current_balance: 0,
      status,
    });

    if (selected.email && pay?.id) {
      const receiptLink = `https://rentozi.netlify.app/receipt?id=${pay.id}`;
      await supabase.functions.invoke("send-email", {
        body: {
          to: selected.email,
          subject: `${biz}: rent payment confirmed`,
          html: `<p style="color:#64748b;font-size:12px">${biz}</p>
                 <p>Your rent payment has been received and confirmed.</p>
                 <p>Amount: <strong>${formatMK(Number(amount))}</strong><br/>
                 Property: ${selected.house?.name || selected.house?.code || "—"}<br/>
                 Date: ${paidDate}<br/>
                 Method: ${method}<br/>
                 Months covered: ${covered}</p>
                 <p>View / print your receipt:<br/><a href="${receiptLink}">${receiptLink}</a></p>
                 <p>Thank you.<br/>${biz}</p>`,
        },
      });
    }

    setSaving(false);
    setMsg(`Saved. ${covered} month(s) covered. Next due ${nextDue}.`);
    setAmount("");
    setReference("");
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-slate-600">
            ← Dashboard
          </Link>
          <p className="font-bold">Record Payment</p>
        </div>
      </header>
      <main className="max-w-2xl mx-auto p-4">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl mb-3">{error}</p>}
        {msg && <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl mb-3">{msg}</p>}

        {tenants.length === 0 ? (
          <div className="bg-white border rounded-2xl p-8 text-center text-slate-500">
            No properties on this account yet. Add a property from the Dashboard first.
          </div>
        ) : (
          <form onSubmit={submit} className="bg-white border rounded-2xl p-5 space-y-3">
            <label className="text-xs font-semibold text-slate-500">Tenant / house</label>
            <select
              className="w-full border rounded-xl px-3 py-2 text-sm"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.house?.code} — {t.house?.name} · {t.full_name} ({formatMK(Number(t.house?.monthly_rent || 0))}/mo)
                </option>
              ))}
            </select>

            <label className="text-xs font-semibold text-slate-500">Amount</label>
            <input
              required
              type="number"
              className="w-full border rounded-xl px-3 py-2 text-sm"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {months > 0 && (
              <p className="text-xs text-emerald-800 bg-emerald-50 px-2 py-1 rounded-md inline-block">
                This covers {months} month{months === 1 ? "" : "s"}
              </p>
            )}

            <label className="text-xs font-semibold text-slate-500">Method</label>
            <select className="w-full border rounded-xl px-3 py-2 text-sm" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option>Bank</option>
              <option>Airtel Money</option>
              <option>Mpamba</option>
              <option>Cash</option>
            </select>

            <label className="text-xs font-semibold text-slate-500">Date received</label>
            <input
              type="date"
              className="w-full border rounded-xl px-3 py-2 text-sm"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
            />

            <label className="text-xs font-semibold text-slate-500">Reference</label>
            <input
              className="w-full border rounded-xl px-3 py-2 text-sm"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />

            <button disabled={saving} className="w-full bg-emerald-600 text-white py-2.5 rounded-xl text-sm font-semibold">
              {saving ? "Saving..." : "Save payment"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
