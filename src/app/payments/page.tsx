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
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [tenantIds, setTenantIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function refreshBalance(tenantId: string) {
    const { data: pays } = await supabase
      .from("payments")
      .select("amount, paid_date, created_at")
      .eq("tenant_id", tenantId)
      .order("paid_date", { ascending: false });

    const { data: t } = await supabase
      .from("tenants")
      .select("houses(monthly_rent)")
      .eq("id", tenantId)
      .maybeSingle();
    const house = Array.isArray(t?.houses) ? t?.houses[0] : t?.houses;
    const rent = Number(house?.monthly_rent || 0);

    if (!pays || pays.length === 0) {
      await supabase.from("tenant_balances").upsert({
        tenant_id: tenantId,
        months_in_advance: 0,
        next_due_date: null,
        current_balance: rent,
        status: "upcoming",
      });
      return;
    }

    const last = pays[0];
    const months = rent > 0 ? Math.max(1, Math.round(Number(last.amount) / rent)) : 1;
    const start = last.paid_date || last.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const nextDue = addMonths(start, months);
    const status = computeStatus(nextDue, 0);
    await supabase.from("tenant_balances").upsert({
      tenant_id: tenantId,
      months_in_advance: months,
      next_due_date: nextDue,
      current_balance: status === "paid" ? 0 : rent,
      status,
    });
  }

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
      .select("id, amount, method, paid_date, created_at, tenant_id, tenants(full_name, houses(name, code))")
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

  const deleteSelected = async () => {
    if (!selectedIds.length || !confirm("Delete the selected payments and rebuild those tenants' cycles?")) return;
    setBusy(true);
    const affected = Array.from(new Set(rows.filter((r) => selectedIds.includes(r.id)).map((r) => r.tenant_id)));
    await supabase.from("payments").delete().in("id", selectedIds);
    for (const tid of affected) await refreshBalance(tid);
    setBusy(false);
    await load();
  };

  const clearAll = async () => {
    if (!tenantIds.length || !confirm("Delete ALL payments and reset every cycle / status?")) return;
    setBusy(true);
    await supabase.from("payments").delete().in("tenant_id", tenantIds);
    for (const tid of tenantIds) await refreshBalance(tid);
    setBusy(false);
    await load();
  };

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
        <div className="flex flex-wrap gap-2">
          <button
            onClick={deleteSelected}
            disabled={!selectedIds.length || busy}
            className="border border-red-200 text-red-600 px-3 py-1.5 rounded-lg text-sm disabled:opacity-40"
          >
            Delete selected ({selectedIds.length})
          </button>
          <button
            onClick={clearAll}
            disabled={busy || !rows.length}
            className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm disabled:opacity-40"
          >
            Clear all payments
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
                className="mt-1"
                checked={!!picked[row.id]}
                onChange={(e) => setPicked((p) => ({ ...p, [row.id]: e.target.checked }))}
              />
              <div className="flex-1 flex justify-between gap-3">
                <div>
                  <p className="font-bold">{t?.full_name || "Tenant"}</p>
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
