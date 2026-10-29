"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { notifyRentozi } from "@/lib/messaging";
import { useRouter } from "next/navigation";
import Link from "next/link";


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

  const request = useRef<{ details: string; id: string } | null>(null);
  const inFlight = useRef(false);
  const selected = tenants.find((t) => t.id === tenantId);
  const rent = Number(selected?.house?.monthly_rent || 0);
  const months = rent > 0 && Number(amount) > 0 ? Math.floor(Number(amount) / rent) : 0;

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/auth/login");
        return;
      }

      const { data: lid, error: lidErr } = await supabase.rpc("my_landlord_id");
      if (lidErr) {
        setError("my_landlord_id: " + lidErr.message);
        setLoading(false);
        return;
      }
      if (!lid) {
        setError("No landlord profile for this login");
        setLoading(false);
        return;
      }

      const { data: pub } = await supabase.rpc("landlord_public", { p_id: lid });
      if (pub) setBiz(pub.business_name || pub.full_name || "Rentozi");

      const { data: list, error: tErr } = await supabase
        .from("tenants")
        .select("id, full_name, email, phone, house_id, landlord_id")
        .eq("landlord_id", lid)
        .order("full_name");

      if (tErr) {
        setError("tenants: " + tErr.message);
        setLoading(false);
        return;
      }

      const houseIds = (list || []).map((t: any) => t.house_id).filter(Boolean);
      let houses: any[] = [];
      if (houseIds.length) {
        const { data: hs, error: hErr } = await supabase
          .from("houses")
          .select("id, name, code, monthly_rent")
          .in("id", houseIds);
        if (hErr) setError("houses: " + hErr.message);
        houses = hs || [];
      }

      const mapped = (list || []).map((t: any) => ({
        ...t,
        house: houses.find((h) => h.id === t.house_id) || null,
      }));
      setTenants(mapped);
      if (mapped[0]) setTenantId(mapped[0].id);
      setLoading(false);
    })();
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (inFlight.current) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001 || !paidDate || paidDate > new Date().toISOString().slice(0, 10)) {
      setError("Enter a positive amount with at most two decimal places and a date on or before today."); return;
    }
    const details = JSON.stringify([selected.id, value, method, paidDate, reference]);
    if (request.current?.details !== details) request.current = { details, id: crypto.randomUUID() };
    inFlight.current = true;
    setSaving(true); setError(null); setMsg(null);
    let committed = false;
    try {
    const { data: result, error: pErr } = await supabase.rpc("rentozi_record_payment", {
      p_tenant: selected.id, p_amount: value, p_method: method, p_date: paidDate,
      p_reference: reference, p_request: request.current.id,
    });
    if (pErr) { inFlight.current = false; setSaving(false); setError(pErr.message); return; }
    committed = true;
    setMsg("Payment saved. Sending the tenant notification…");
    const pay = { id: result.payment_id };
    const covered = Number(result.months || 0);
    const nextDue = result.next_due_date;

    if (!result.already_processed && selected.email && pay?.id) {
      const receiptLink = `https://rentozi.netlify.app/receipt?id=${pay.id}`;
      const delivery = await notifyRentozi({
          request_id: "record-payment-" + pay.id,
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
      });
      if(!delivery.ok)setError("Payment saved; email notice failed: "+delivery.error);
    }

    request.current = null;
    setMsg(`Saved. ${covered} complete month(s) credited. Remaining balance ${formatMK(Number(result.balance))}; part-month credit ${formatMK(Number(result.credit))}. Next due ${nextDue}.`);
    setAmount("");
    setReference("");
    } catch (e: any) {
      if (committed) { setMsg("Payment saved. Do not record it again."); setAmount(""); setReference(""); setError("Email delivery could not be confirmed. " + e.message); }
      else setError("Could not confirm the payment was saved. Retry the same details safely. " + e.message);
    } finally { inFlight.current = false; setSaving(false); }
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
          <div className="bg-white border rounded-2xl p-8 text-center text-slate-500 space-y-2">
            <p>No properties on this account yet.</p>
            <p className="text-xs">If the dashboard shows houses, this page could not read them. The red message above is the reason.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-white border rounded-2xl p-5 space-y-3">
            <label className="text-xs font-semibold text-slate-500">Tenant / house</label>
            <select className="w-full border rounded-xl px-3 py-2 text-sm" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.house?.code || "—"} — {t.house?.name || "House"} · {t.full_name} ({formatMK(Number(t.house?.monthly_rent || 0))}/mo)
                </option>
              ))}
            </select>
            <label className="text-xs font-semibold text-slate-500">Amount</label>
            <input required type="number" min="0.01" step="0.01" className="w-full border rounded-xl px-3 py-2 text-sm" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {months > 0 && (
              <p className="text-xs text-emerald-800 bg-emerald-50 px-2 py-1 rounded-md inline-block">
                Payment is applied to outstanding rent first. Any remainder stays as credit.
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
            <input type="date" className="w-full border rounded-xl px-3 py-2 text-sm" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            <label className="text-xs font-semibold text-slate-500">Reference</label>
            <input className="w-full border rounded-xl px-3 py-2 text-sm" value={reference} onChange={(e) => setReference(e.target.value)} />
            <button disabled={saving} className="w-full bg-emerald-600 text-white py-2.5 rounded-xl text-sm font-semibold">
              {saving ? "Saving..." : "Save payment"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
