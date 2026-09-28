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

export default function PendingPage() {
  const router = useRouter();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [working, setWorking] = useState<string | null>(null);

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
    const { data: tenants } = await supabase.from("tenants").select("id").eq("landlord_id", lid);
    const ids = (tenants || []).map((t: any) => t.id);
    if (!ids.length) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data, error: qErr } = await supabase
      .from("payment_submissions")
      .select("id, amount, method, reference_used, paid_date, status, created_at, proof_path, tenant_id, tenants(full_name, email, phone, houses(name, code))")
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

  const tenantOf = (row: any) => {
    const t = row.tenants;
    return Array.isArray(t) ? t[0] : t;
  };
  const houseOf = (row: any) => {
    const t = tenantOf(row);
    const h = t?.houses;
    return Array.isArray(h) ? h[0] : h;
  };

    const decide = async (id: string, status: "confirmed" | "rejected") => {
    setWorking(id);
    const row = items.find((x) => x.id === id);
    const t = row ? tenantOf(row) : null;
    const h = row ? houseOf(row) : null;
    const { error: uErr } = await supabase.from("payment_submissions").update({ status }).eq("id", id);
    if (uErr) {
      setError(uErr.message);
      setWorking(null);
      return;
    }
    let paymentId: string | null = null;
    if (status === "confirmed" && row) {
      const { data: pay } = await supabase
        .from("payments")
        .insert({
          tenant_id: row.tenant_id,
          amount: row.amount,
          method: row.method,
          paid_date: row.paid_date,
          reference: row.reference_used,
        })
        .select("id")
        .maybeSingle();
      paymentId = pay?.id || null;
    }
    if (t?.email) {
      const receiptLink = paymentId
        ? `https://rentozi.netlify.app/receipt?id=${paymentId}`
        : "https://rentozi.netlify.app/tenant";
      await supabase.functions.invoke("send-email", {
        body: {
          to: t.email,
          subject: status === "confirmed" ? "Payment confirmed — receipt attached" : "Payment not accepted",
          html:
            status === "confirmed"
              ? `<p>Your payment of <strong>${formatMK(Number(row.amount))}</strong> for ${h?.code || ""} was confirmed.</p>
                 <p><a href="${receiptLink}">Open / print your receipt</a></p>`
              : `<p>Your payment of ${formatMK(Number(row.amount))} was not accepted. Contact your landlord.</p>`,
        },
      });
    }
    setWorking(null);
    await load();
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
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
        {items.length === 0 && <p className="text-center text-slate-500 py-16">No pending submissions</p>}
        {items.map((row) => {
          const t = tenantOf(row);
          const h = houseOf(row);
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
              <div className="flex gap-2 pt-1">
                <button disabled={working === row.id} onClick={() => decide(row.id, "confirmed")} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm">
                  Confirm
                </button>
                <button disabled={working === row.id} onClick={() => decide(row.id, "rejected")} className="border border-red-200 text-red-600 px-3 py-1.5 rounded-lg text-sm">
                  Reject
                </button>
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
