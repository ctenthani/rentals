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

export default function PaymentsPage() {
  const router = useRouter();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
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
      const { data: tenants } = await supabase.from("tenants").select("id").eq("landlord_id", lid);
      const ids = (tenants || []).map((t: any) => t.id);
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
      setLoading(false);
    })();
  }, [router]);

  const tenantOf = (row: any) => {
    const t = row.tenants;
    return Array.isArray(t) ? t[0] : t;
  };
  const houseOf = (row: any) => {
    const t = tenantOf(row);
    const h = t?.houses;
    return Array.isArray(h) ? h[0] : h;
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-slate-600">← Dashboard</Link>
          <p className="font-bold">Payment history</p>
        </div>
      </header>
      <main className="max-w-3xl mx-auto p-4 space-y-3">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
        {rows.length === 0 && (
          <div className="bg-white border rounded-2xl p-10 text-center text-slate-500">
            <p>No payments recorded yet.</p>
            <Link href="/record-payment" className="text-emerald-700 font-semibold text-sm">Record a payment →</Link>
          </div>
        )}
        {rows.map((row) => {
          const t = tenantOf(row);
          const h = houseOf(row);
          return (
            <div key={row.id} className="bg-white border rounded-2xl p-4 flex justify-between gap-3">
              <div>
                <p className="font-bold">{t?.full_name || "Tenant"}</p>
                <p className="text-xs text-slate-500">{h?.code} — {h?.name}</p>
                <p className="text-xs text-slate-500">{row.paid_date || row.created_at?.slice(0, 10)} · {row.method || ""}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-emerald-700">{formatMK(Number(row.amount))}</p>
                <Link href={`/receipt?id=${row.id}`} className="text-xs text-sky-700 font-semibold">Receipt</Link>
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
