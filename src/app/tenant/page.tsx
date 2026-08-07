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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20",
    overdue: "bg-red-50 text-red-700 ring-1 ring-red-600/20",
    upcoming: "bg-sky-50 text-sky-700 ring-1 ring-sky-600/20",
    pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20",
    confirmed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20",
    rejected: "bg-red-50 text-red-700 ring-1 ring-red-600/20",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        styles[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {status?.toUpperCase()}
    </span>
  );
}

export default function TenantPortal() {
  const [tenant, setTenant] = useState<any>(null);
  const [house, setHouse] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/auth/login");
        return;
      }

      // Get tenant
      const { data: tenantData, error: tenantError } = await supabase
        .from("tenants")
        .select("id, full_name, phone, house_id")
        .eq("auth_user_id", session.user.id)
        .single();

      if (tenantError || !tenantData) {
        setError(
          "Your account is not linked to any tenant yet. Contact the landlord."
        );
        setLoading(false);
        return;
      }

      setTenant(tenantData);

      // Get house
      const { data: houseData } = await supabase
        .from("houses")
        .select("code, name, monthly_rent, bank_account")
        .eq("id", tenantData.house_id)
        .single();
      setHouse(houseData);

      // Get balance
      const { data: balanceData } = await supabase
        .from("tenant_balances")
        .select(
          "current_balance, next_due_date, months_in_advance, status"
        )
        .eq("tenant_id", tenantData.id)
        .single();
      setBalance(balanceData);

      // Get payment history (submissions)
      const { data: historyData } = await supabase
        .from("payment_submissions")
        .select("id, amount, method, status, paid_date, created_at, reference_used")
        .eq("tenant_id", tenantData.id)
        .order("created_at", { ascending: false })
        .limit(10);

      setHistory(historyData || []);
      setLoading(false);
    }

    load();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md text-center shadow-sm">
          <p className="text-red-600 mb-6">{error}</p>
          <button
            onClick={handleLogout}
            className="text-sm border border-slate-200 px-5 py-2.5 rounded-xl"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  const requiredAdvance = [
    "Joe Lipanda",
    "Elias Chisoni",
    "Emily Mwakisephile",
    "Gift Mphande",
  ].includes(tenant?.full_name)
    ? 3
    : 2;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-4 h-14 flex justify-between items-center">
          <div>
            <p className="text-xs text-slate-500">Welcome</p>
            <p className="font-semibold text-slate-800 leading-tight">
              {tenant?.full_name}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Status Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm text-slate-500">{house?.name}</p>
                <div className="mt-1.5">
                  <StatusBadge status={balance?.status || "upcoming"} />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Next Due Date</span>
                <span className="font-medium text-slate-800">
                  {balance?.next_due_date || "—"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Outstanding Balance</span>
                <span className="text-xl font-semibold text-red-600">
                  {formatMK(Number(balance?.current_balance || 0))}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Monthly Rent</span>
                <span className="font-medium text-slate-800">
                  {formatMK(Number(house?.monthly_rent || 0))}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Months in Advance</span>
                <span className="font-medium text-slate-800">
                  {balance?.months_in_advance || 0} / {requiredAdvance} required
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Make Payment Button */}
        <Link
          href="/pay"
          className="flex items-center justify-center w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3.5 rounded-2xl shadow-sm transition"
        >
          Make Payment
        </Link>

        {/* Bank Details */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-semibold text-slate-800 mb-3">Payment Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Bank</span>
              <span className="font-medium">National Bank of Malawi</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Account</span>
              <span className="font-medium">{house?.bank_account}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Reference</span>
              <span className="font-medium">
                {house?.code}-{tenant?.full_name?.replace(/\s+/g, "")}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Always use the exact reference so your payment can be matched quickly.
          </p>
        </div>

        {/* Payment History */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">Payment History</h3>
          </div>

          {history.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">
              No payments yet
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="px-5 py-3.5 flex justify-between items-center"
                >
                  <div>
                    <p className="font-medium text-slate-800">
                      {formatMK(Number(item.amount))}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {item.method} • {item.paid_date}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
