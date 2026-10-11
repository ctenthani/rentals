"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
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
  if (Number(balance) > 0 && !nextDue) return "upcoming";
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

export default function PaymentsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [tenantIds, setTenantIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const [reason, setReason] = useState("");
  async function load() {
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
    const { data: tenants } = await supabase.from("tenants").select("id").eq("landlord_id", lid);
    const ids = (tenants || []).map((t: any) => t.id);
    setTenantIds(ids);
    if (!ids.length) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data, error: qErr } = await supabase
      .from("payments")
      .select("id, amount, method, paid_date, created_at, tenant_id, request_id, voided_at, void_reason, tenants(full_name, houses(name, code))")
      .in("tenant_id", ids)
      .order("created_at", { ascending: false });
    if (qErr) setError(qErr.message);
    setRows(data || []);
    setPicked({});
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

  const selectedIds = Object.keys(picked).filter((id) => picked[id]);

  const reverse = async (ids: string[]) => {
    if (!ids.length || busy) return;
    if (reason.trim().length < 5) { setError("Enter a reversal reason of at least five characters."); return; }
    if (!confirm("Reverse these payments? The original receipts and the reason remain in the audit history.")) return;
    setBusy(true); setError(null);
    const { error: rpcError } = await supabase.rpc("rentozi_reverse_payments", { p_ids: ids, p_reason: reason.trim() });
    setBusy(false);
    if (rpcError) { setError(rpcError.message); return; }
    setReason(""); await load();
  };
  const deleteSelected = () => reverse(selectedIds);
  const clearAll = () => reverse(rows.filter(r => r.request_id && !r.voided_at).map(r => r.id));

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-slate-600">
            ← Dashboard
          </Link>
          <p className="font-bold">Payment history</p>
        </div>
      </header>
      <main className="max-w-3xl mx-auto p-4 space-y-3">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
        <p className="text-sm text-slate-600">Reverse mistakes instead of deleting receipts. Reverse newer payments first. Historical payments require reconciliation.</p>
        <label className="block text-sm">Reason for reversal<input value={reason} onChange={e => setReason(e.target.value)} className="block w-full border rounded-xl p-2 mt-1" maxLength={500} /></label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={deleteSelected}
            disabled={!selectedIds.length || busy}
            className="border border-red-200 text-red-600 px-3 py-1.5 rounded-lg text-sm disabled:opacity-40"
          >
            Reverse selected ({selectedIds.length})
          </button>
          <button
            onClick={clearAll}
            disabled={busy || !rows.some(r => r.request_id && !r.voided_at)}
            className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm disabled:opacity-40"
          >
            Reverse all new payments
          </button>
        </div>
        {rows.length === 0 && (
          <div className="bg-white border rounded-2xl p-10 text-center text-slate-500">
            <p>No payments recorded yet.</p>
            <Link href="/record-payment" className="text-emerald-700 font-semibold text-sm">
              Record a payment →
            </Link>
          </div>
        )}
        {rows.map((row) => {
          const t = tenantOf(row);
          const h = houseOf(row);
          return (
            <div key={row.id} className="bg-white border rounded-2xl p-4 flex gap-3 items-start">
              <input
                type="checkbox"
                aria-label={`Select payment for ${t?.full_name || "tenant"}`}
                disabled={!row.request_id || !!row.voided_at || busy}
                className="mt-1"
                checked={!!picked[row.id]}
                onChange={(e) => setPicked((p) => ({ ...p, [row.id]: e.target.checked }))}
              />
              <div className="flex-1 flex justify-between gap-3">
                <div>
                  <p className="font-bold">{t?.full_name || "Tenant"}</p>
                  {row.voided_at && <p className="text-sm text-red-700">Reversed: {row.void_reason}</p>}
                  <p className="text-xs text-slate-500">
                    {h?.code} — {h?.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {row.paid_date || row.created_at?.slice(0, 10)} · {row.method || ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-emerald-700">{formatMK(Number(row.amount))}</p>
                  <Link href={`/receipt?id=${row.id}`} className="text-xs text-sky-700 font-semibold">
                    Receipt
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
