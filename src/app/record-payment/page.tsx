"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SUPABASE_URL = "https://favhmbrpisstrwgytapl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdmhtYnJwaXNzdHJ3Z3l0YXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTM5MzIsImV4cCI6MjEwMTY4OTkzMn0.6V2oE161lKWAATnZDxQiGFLfoRifoRrH7MSb0MHTJ3U";

function formatMK(amount: number) {
  return new Intl.NumberFormat("en-MW", {
    style: "currency",
    currency: "MWK",
    minimumFractionDigits: 0,
  })
    .format(amount)
    .replace("MWK", "MK");
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split("T")[0];
}

export default function RecordPaymentPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  useEffect(() => {
    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/auth/login");
        return;
      }

      const { data: tenantCheck } = await supabase
        .from("tenants")
        .select("id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (tenantCheck) {
        router.push("/tenant");
        return;
      }

      await loadTenants();
      setLoading(false);
    }

    init();
  }, [router]);

  async function loadTenants() {
    const { data } = await supabase
      .from("tenant_overview")
      .select("*")
      .order("house_code");
    setTenants(data || []);
  }

  const selected = tenants.find((t) => t.tenant_id === selectedId);

  const monthsCovered =
    selected && Number(amount) > 0 && Number(selected.monthly_rent) > 0
      ? Math.round(Number(amount) / Number(selected.monthly_rent))
      : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || monthsCovered < 1) return;

    setSaving(true);
    setMessage(null);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc(
      "record_landlord_payment",
      {
        p_tenant_id: selected.tenant_id,
        p_amount: Number(amount),
        p_months: monthsCovered,
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }

    if (data && data.success === false) {
      setError(data.error || "Failed to record payment");
      setSaving(false);
      return;
    }

    setMessage(
      `Payment of ${formatMK(Number(amount))} recorded (${monthsCovered} month${monthsCovered > 1 ? "s" : ""}). Paid up to ${data.new_due_date}. New balance: ${formatMK(data.new_balance)}`
    );

    setAmount("");
    setSelectedId("");
    await loadTenants();
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/dashboard" className="text-slate-600 text-sm">
            ← Dashboard
          </Link>
          <h1 className="font-semibold text-slate-800">Record Payment</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Select Tenant
              </label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                required
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
              >
                <option value="">— Choose tenant —</option>
                {tenants.map((t) => (
                  <option key={t.tenant_id} value={t.tenant_id}>
                    {t.house_name} – {t.full_name} (Balance:{" "}
                    {formatMK(Number(t.current_balance))})
                  </option>
                ))}
              </select>
            </div>

            {selected && (
              <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-1">
                <p>
                  <span className="text-slate-500">Current Paid Up To:</span>{" "}
                  <strong>{selected.next_due_date}</strong>
                </p>
                <p>
                  <span className="text-slate-500">Current Balance:</span>{" "}
                  <strong>{formatMK(Number(selected.current_balance))}</strong>
                </p>
                <p>
                  <span className="text-slate-500">Monthly Rent:</span>{" "}
                  {formatMK(Number(selected.monthly_rent))}
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Amount Received (MK)
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                min="1"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                placeholder="e.g. 360000"
              />
            </div>

            {selected && Number(amount) > 0 && (
              <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-sm">
                <p className="font-medium text-green-800">
                  This amount covers approximately{" "}
                  <strong>{monthsCovered}</strong> month
                  {monthsCovered !== 1 ? "s" : ""}
                </p>
                <p className="text-green-700 mt-1">
                  New Paid Up To date will be:{" "}
                  <strong>
                    {monthsCovered > 0
                      ? addMonths(selected.next_due_date, monthsCovered)
                      : "—"}
                  </strong>
                </p>
              </div>
            )}

            {message && (
              <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm">
                {message}
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving || !selectedId || monthsCovered < 1}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-3 rounded-xl"
            >
              {saving ? "Saving..." : "Record Payment"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
