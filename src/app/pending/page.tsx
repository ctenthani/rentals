"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SUPABASE_URL = "https://favhmbrpisstrwgytapl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdmhtYnJwaXNzdHJ3Z3l0YXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTM5MzIsImV4cCI6MjEwMTY4OTkzMn0.6V2oE161lKWAATnZDxQiGFLfoRifoRrH7MSb0MHTJ3U";

function formatMK(n: number) {
  return new Intl.NumberFormat("en-MW", { style: "currency", currency: "MWK", minimumFractionDigits: 0 })
    .format(n).replace("MWK", "MK");
}

type Submission = {
  id: string;
  amount: number;
  method: string;
  reference_used: string | null;
  paid_date: string;
  status: string;
  created_at: string;
  transaction_id: string | null;
  proof_url: string | null;
  notes: string | null;
  tenants: { full_name: string; email: string | null; houses: { name: string; code: string } | { name: string; code: string }[] } | null;
};

export default function PendingPage() {
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/auth/login"); return; }

    let { data: landlord } = await supabase.from("landlords").select("id").eq("auth_user_id", session.user.id).maybeSingle();
    if (!landlord) {
      const { data: m } = await supabase.from("landlord_members").select("landlord_id").eq("auth_user_id", session.user.id).maybeSingle();
      if (m) landlord = { id: m.landlord_id };
    }
    if (!landlord) { setError("No landlord profile"); setLoading(false); return; }

    const { data: tenants } = await supabase.from("tenants").select("id").eq("landlord_id", landlord.id);
    const ids = (tenants || []).map((t) => t.id);
    if (!ids.length) { setItems([]); setLoading(false); return; }

    const { data, error: qErr } = await supabase
      .from("payment_submissions")
      .select(`id, amount, method, reference_used, paid_date, status, created_at, transaction_id, proof_url, notes,
        tenants ( full_name, email, houses ( name, code ) )`)
      .in("tenant_id", ids)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (qErr) setError(qErr.message);
    else setItems((data as any) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [router]);

  const confirm = async (id: string) => {
    setBusy(id); setError(null); setMsg(null);
    const { data, error: rpcErr } = await supabase.rpc("confirm_payment_submission", { p_submission_id: id });
    setBusy(null);
    if (rpcErr) { setError(rpcErr.message); return; }
    if (data?.success === false) { setError(data.error || "Confirm failed"); return; }
    setMsg("Payment confirmed");
    if (data?.payment_id) {
      window.open(`/receipt?id=${data.payment_id}`, "_blank");
    }
    await load();
  };

  const reject = async (id: string) => {
    setBusy(id);
    await supabase.rpc("reject_payment_submission", { p_submission_id: id });
    setBusy(null);
    await load();
  };

  const tenantOf = (s: Submission) => {
    const t = s.tenants;
    if (!t) return { name: "—", house: "—", email: null as string | null };
    const h = Array.isArray(t.houses) ? t.houses[0] : t.houses;
    return { name: t.full_name, house: h ? `${h.name} (${h.code})` : "—", email: t.email };
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-slate-600">← Dashboard</Link>
          <h1 className="font-bold">Pending payments</h1>
          {items.length > 0 && (
            <span className="ml-auto text-xs font-bold bg-amber-100 text-amber-800 px-2 py-1 rounded-full animate-pulse">
              {items.length} action
            </span>
          )}
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-3">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
        {msg && <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl">{msg}</p>}
        {loading ? (
          <p className="text-slate-500 text-sm">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-12">No pending submissions</p>
        ) : (
          items.map((s) => {
            const t = tenantOf(s);
            return (
              <div key={s.id} className="bg-white border rounded-2xl p-4 shadow-sm space-y-2">
                <div className="flex justify-between gap-2">
                  <div>
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.house}</p>
                  </div>
                  <p className="font-bold text-emerald-700 text-lg">{formatMK(Number(s.amount))}</p>
                </div>
                <p className="text-xs text-slate-500">
                  {s.method} · {s.paid_date} · Ref: {s.reference_used || "—"}
                </p>
                {s.transaction_id && <p className="text-xs">Txn ID: <strong>{s.transaction_id}</strong></p>}
                {s.notes && <p className="text-xs text-slate-400">{s.notes}</p>}
                {s.proof_url && (
                  <a href={s.proof_url} target="_blank" rel="noreferrer" className="block">
                    <img src={s.proof_url} alt="Proof" className="max-h-40 rounded-lg border" />
                  </a>
                )}
                <div className="flex gap-2 pt-2">
                  <button onClick={() => confirm(s.id)} disabled={busy === s.id}
                    className="flex-1 bg-green-600 text-white py-2 rounded-xl text-sm font-semibold disabled:opacity-50">
                    {busy === s.id ? "..." : "Confirm"}
                  </button>
                  <button onClick={() => reject(s.id)} disabled={busy === s.id}
                    className="px-4 border border-red-200 text-red-600 rounded-xl text-sm">
                    Reject
                  </button>
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
