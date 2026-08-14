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

export default function RecordPaymentPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [amount, setAmount] = useState("");
  const [paidForMonth, setPaidForMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [landlordId, setLandlordId] = useState<string | null>(null);

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

      let { data: landlord } = await supabase
        .from("landlords")
        .select("id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (!landlord) {
        const { data: membership } = await supabase
          .from("landlord_members")
          .select("landlord_id")
          .eq("auth_user_id", session.user.id)
          .maybeSingle();

        if (membership?.landlord_id) {
          landlord = { id: membership.landlord_id };
        }
      }

      if (!landlord) {
        setError("No landlord profile found");
        setLoading(false);
        return;
      }

      setLandlordId(landlord.id);

      const { data, error: loadError } = await supabase
        .from("tenants")
        .select(
          `
          id,
          full_name,
          houses (
            name,
            code,
            monthly_rent
          )
        `
        )
        .eq("landlord_id", landlord.id)
        .order("full_name");

      if (loadError) {
        setError(loadError.message);
      } else {
        setTenants(data || []);
      }

      setLoading(false);
    }

    init();
  }, [router]);

  const selected = tenants.find((t) => t.id === tenantId);
  const house = selected
    ? Array.isArray(selected.houses)
      ? selected.houses[0]
      : selected.houses
    : null;
  const monthlyRent = Number(house?.monthly_rent || 0);
  const amountNum = Number(amount || 0);
  const monthsCovered =
    monthlyRent > 0 ? Math.max(1, Math.round(amountNum / monthlyRent)) : 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !amount) {
      setError("Select a tenant and enter an amount");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const { data, error: rpcError } = await supabase.rpc(
      "record_landlord_payment",
      {
        p_tenant_id: tenantId,
        p_amount: amountNum,
        p_months: monthsCovered,
        p_paid_for_month: paidForMonth + "-01",
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }

    if (data && data.success === false) {
      setError(data.error || "Payment failed");
      setSaving(false);
      return;
    }

    setMessage(
      `Recorded ${formatMK(amountNum)} for ${monthsCovered} month(s) starting ${paidForMonth}. Next due: ${data?.new_due_date || "—"}`
    );
    setAmount("");
    setNotes("");
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
        {tenants.length === 0 ? (
          <div className="bg-white rounded-2xl border p-8 text-center text-slate-500 text-sm">
            No properties on this account yet. Add a property from the
            Dashboard first.
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5"
          >
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tenant
              </label>
              <select
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                required
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
              >
                <option value="">Select tenant...</option>
                {tenants.map((t) => {
                  const h = Array.isArray(t.houses) ? t.houses[0] : t.houses;
                  return (
                    <option key={t.id} value={t.id}>
                      {t.full_name} — {h?.name || "—"} (
                      {formatMK(Number(h?.monthly_rent || 0))}/mo)
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Amount received (MK)
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                min={1}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                placeholder="180000"
              />
              {monthlyRent > 0 && amountNum > 0 && (
                <p className="text-xs text-slate-500 mt-1">
                  ≈ {monthsCovered} month(s) at {formatMK(monthlyRent)}/mo
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Payment is for month
              </label>
              <input
                type="month"
                value={paidForMonth}
                onChange={(e) => setPaidForMonth(e.target.value)}
                required
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">
                First month this payment covers. Next due is calculated from
                here.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Notes (optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                placeholder="Bank ref, Airtel, etc."
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">
                {error}
              </p>
            )}
            {message && (
              <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2.5 rounded-xl"
            >
              {saving ? "Saving..." : "Record payment"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
