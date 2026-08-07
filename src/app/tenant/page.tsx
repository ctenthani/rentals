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

export default function TenantPortal() {
  const [tenant, setTenant] = useState<any>(null);
  const [house, setHouse] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  useEffect(() => {
    async function loadTenant() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/auth/login");
        return;
      }

      // 1. Get the tenant
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

      // 2. Get the house
      const { data: houseData } = await supabase
        .from("houses")
        .select("code, name, monthly_rent, bank_account")
        .eq("id", tenantData.house_id)
        .single();

      setHouse(houseData);

      // 3. Get the balance
      const { data: balanceData } = await supabase
        .from("tenant_balances")
        .select(
          "current_balance, next_due_date, months_in_advance, status"
        )
        .eq("tenant_id", tenantData.id)
        .single();

      setBalance(balanceData);
      setLoading(false);
    }

    loadTenant();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white border rounded-xl p-6 max-w-md text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={handleLogout}
            className="text-sm border px-4 py-2 rounded-lg"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-slate-500">Welcome</p>
            <h1 className="text-xl font-bold">{tenant?.full_name}</h1>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-slate-600 border px-3 py-1.5 rounded-lg"
          >
            Logout
          </button>
        </div>

        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-slate-500 mb-1">{house?.name}</p>
          <p className="font-medium text-lg capitalize mb-4">
            {balance?.status || "—"}
          </p>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Next Due Date</span>
              <span className="font-medium">
                {balance?.next_due_date || "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Outstanding Balance</span>
              <span className="font-bold text-red-600 text-lg">
                {formatMK(Number(balance?.current_balance || 0))}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Monthly Rent</span>
              <span className="font-medium">
                {formatMK(Number(house?.monthly_rent || 0))}
              </span>
            </div>
            {balance?.months_in_advance > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-600">Months in Advance</span>
                <span className="font-medium text-green-600">
                  {balance.months_in_advance}
                </span>
              </div>
            )}
          </div>
        </div>

        <Link
          href="/pay"
          className="block w-full bg-green-600 hover:bg-green-700 text-white text-center font-medium py-3.5 rounded-xl"
        >
          Make Payment
        </Link>

        <div className="bg-white rounded-xl border p-5 text-sm space-y-2">
          <h3 className="font-medium mb-2">Payment Details</h3>
          <p>
            <span className="text-slate-500">Bank:</span> National Bank of
            Malawi
          </p>
          <p>
            <span className="text-slate-500">Account:</span>{" "}
            <strong>{house?.bank_account || "—"}</strong>
          </p>
          <p>
            <span className="text-slate-500">Reference:</span>{" "}
            <strong>
              {house?.code}-{tenant?.full_name?.replace(/\s+/g, "")}
            </strong>
          </p>
        </div>
      </div>
    </main>
  );
}
