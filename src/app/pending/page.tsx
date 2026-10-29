"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { notifyRentozi } from "@/lib/messaging";
import { privateDocumentUrl } from "@/lib/documents";
import { useRouter } from "next/navigation";
import Link from "next/link";


function formatMK(n: number) {
  return new Intl.NumberFormat("en-MW", { style: "currency", currency: "MWK", minimumFractionDigits: 0 })
    .format(n)
    .replace("MWK", "MK");
}

function addMonths(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

export default function PendingPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [working, setWorking] = useState<string | null>(null);
  const [biz, setBiz] = useState("Rentozi");
  const actionLock = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [decision, setDecision] = useState("");

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
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

    const { data: tenants } = await supabase
      .from("tenants")
      .select("id, houses(monthly_rent)")
      .eq("landlord_id", lid);
    const ids = (tenants || []).map((t: any) => t.id);
    if (!ids.length) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data, error: qErr } = await supabase
      .from("payment_submissions")
      .select("id, amount, method, reference_used, paid_date, status, created_at, proof_path, tenant_id, tenants(full_name, email, phone, houses(name, code, monthly_rent))")
      .in("tenant_id", ids)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (qErr) setError(qErr.message);
    setItems(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [router]);

  const tenantOf = (row: any) => (Array.isArray(row.tenants) ? row.tenants[0] : row.tenants);
  const houseOf = (row: any) => {
    const t = tenantOf(row);
    return Array.isArray(t?.houses) ? t.houses[0] : t?.houses;
  };

  const decide = async (id: string, status: "confirmed" | "rejected") => {
    if (actionLock.current) return;
    const row = items.find((x) => x.id === id);
    if (!row) return;
    actionLock.current = true; setWorking(id); setDecision(status); setError(null); setMessage(null);
    let committed = false;
    try {
    const t = tenantOf(row), h = houseOf(row);
    const { data: result, error: rpcError } = await supabase.rpc("rentozi_review_submission", { p_id: id, p_approve: status === "confirmed" });
    if (rpcError) throw Error(rpcError.message);
    committed = true;
    setItems(current => current.filter(x => x.id !== id));
    setMessage(result?.already_processed ? "This payment was already processed. The list has been updated." : status === "confirmed" ? "Payment confirmed. Sending the tenant's notification…" : "Payment rejected. Sending the tenant's notification…");
    const paymentId = result?.payment_id || null;
    const months = Number(result?.months || 0);
    if (result?.already_processed) return;

    if (t?.email) {
      const receiptLink = paymentId
        ? `https://rentozi.netlify.app/receipt?id=${paymentId}`
        : "https://rentozi.netlify.app/tenant";
      const delivery = await notifyRentozi({
          request_id: "payment-decision-" + id + "-" + status,
          to: t.email,
          subject: status === "confirmed" ? `${biz}: rent payment confirmed` : `${biz}: payment not accepted`,
          html:
            status === "confirmed"
              ? `<p style="color:#64748b;font-size:12px">${biz}</p>
                 <p>Your rent payment has been received and confirmed.</p>
                 <p>Amount: <strong>${formatMK(Number(row.amount))}</strong><br/>
                 Property: ${h?.name || h?.code || "—"}<br/>
                 Date: ${row.paid_date || new Date().toISOString().slice(0, 10)}<br/>
                 Method: ${row.method || "Tenant submission"}<br/>
                 Months covered: ${months}</p>
                 <p>View / print your receipt:<br/><a href="${receiptLink}">${receiptLink}</a></p>
                 <p>Thank you.<br/>${biz}</p>`
              : `<p style="color:#64748b;font-size:12px">${biz}</p>
                 <p>Your payment of ${formatMK(Number(row.amount))} was not accepted. Contact ${biz}.</p>`,
      });
      setMessage(status === "confirmed" ? "Payment confirmed and removed from pending payments." : "Payment rejected and removed from pending payments.");
      if(!delivery.ok)setError("Payment decision saved. Email delivery could not be confirmed; do not confirm again. " + delivery.error);
    }
    else setMessage(status === "confirmed" ? "Payment confirmed. No tenant email address is saved." : "Payment rejected. No tenant email address is saved.");
    } catch (e: any) {
      if (committed) { setMessage("Payment decision saved. Do not repeat it."); setError("Email delivery could not be confirmed. " + e.message); }
      else setError("Could not confirm the decision. Retry safely or refresh the list. " + e.message);
    } finally { actionLock.current = false; setWorking(null); setDecision(""); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-slate-600">← Dashboard</Link>
          <p className="font-bold">Pending payments</p>
        </div>
      </header>
      <main className="max-w-3xl mx-auto p-4 space-y-3">
        {message && <p role="status" aria-live="polite" className="text-sm text-emerald-800 bg-emerald-50 p-3 rounded-xl">{message}</p>}
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
        {items.length === 0 && <p className="text-center text-slate-500 py-16">No pending submissions</p>}
        {items.map((row) => {
          const t = tenantOf(row);
          const h = houseOf(row);
          const rent = Number(h?.monthly_rent || 0);
          
          return (
            <div key={row.id} className="bg-white border rounded-2xl p-4 space-y-2">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-bold">{t?.full_name || "Tenant"}</p>
                  <p className="text-xs text-slate-500">{h?.code} — {h?.name}</p>
                </div>
                <p className="font-bold text-emerald-700">{formatMK(Number(row.amount))}</p>
              </div>
              <p className="text-sm text-slate-600">{row.method} · {row.paid_date} · {row.reference_used || "no ref"}</p>
              <p className="text-xs text-emerald-800 bg-emerald-50 inline-block px-2 py-1 rounded-md">Applied to the rent balance when confirmed; partial payments remain credited.</p>
              <div className="flex gap-2 pt-1">
                {row.proof_path && <button type="button" onClick={async () => {
                  try { window.open(await privateDocumentUrl("payment-proofs", row.proof_path), "_blank", "noopener,noreferrer"); }
                  catch (e: any) { setError(e.message); }
                }} className="border px-3 py-1.5 rounded-lg text-sm">View proof</button>}
                <button disabled={!!working} onClick={() => decide(row.id, "confirmed")} aria-busy={working === row.id && decision === "confirmed"} className="bg-emerald-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-sm">{working === row.id && decision === "confirmed" ? "Confirming…" : "Confirm"}</button>
                <button disabled={!!working} onClick={() => decide(row.id, "rejected")} aria-busy={working === row.id && decision === "rejected"} className="border border-red-200 disabled:opacity-50 text-red-600 px-3 py-1.5 rounded-lg text-sm">{working === row.id && decision === "rejected" ? "Rejecting…" : "Reject"}</button>
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
