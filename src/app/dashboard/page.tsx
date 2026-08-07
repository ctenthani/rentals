"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type TenantRow = {
  tenant_id: string;
  full_name: string;
  phone: string | null;
  house_code: string;
  house_name: string;
  monthly_rent: number;
  bank_account: string;
  current_balance: number;
  next_due_date: string;
  months_in_advance: number;
  status: string;
};

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
  const colors: Record<string, string> = {
    paid: "bg-green-100 text-green-800",
    overdue: "bg-red-100 text-red-800",
    upcoming: "bg-blue-100 text-blue-800",
    vacant: "bg-gray-100 text-gray-800",
  };

  return (
    <span
      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
        colors[status] || "bg-gray-100 text-gray-800"
      }`}
    >
      {status.toUpperCase()}
    </span>
  );
}

export default function LandlordDashboard() {
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("tenant_overview")
        .select("*")
        .order("house_code");

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      setRows(data || []);
      setLoading(false);
    }

    loadData();
  }, []);

  const totalExpected = rows.reduce(
    (sum, r) => sum + Number(r.monthly_rent || 0),
    0
  );
  const totalOutstanding = rows.reduce(
    (sum, r) => sum + Number(r.current_balance || 0),
    0
  );

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Landlord Dashboard</h1>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl border p-5">
            <p className="text-sm text-slate-500">Expected Rent</p>
            <p className="text-2xl font-bold mt-1">
              {loading ? "—" : formatMK(totalExpected)}
            </p>
          </div>
          <div className="bg-white rounded-xl border p-5">
            <p className="text-sm text-slate-500">Outstanding</p>
            <p className="text-2xl font-bold mt-1 text-red-600">
              {loading ? "—" : formatMK(totalOutstanding)}
            </p>
          </div>
          <div className="bg-white rounded-xl border p-5">
            <p className="text-sm text-slate-500">Occupied</p>
            <p className="text-2xl font-bold mt-1">
              {loading ? "—" : `${rows.length} / 10`}
            </p>
          </div>
          <div className="bg-white rounded-xl border p-5">
            <p className="text-sm text-slate-500">Occupancy</p>
            <p className="text-2xl font-bold mt-1">
              {loading ? "—" : "100%"}
            </p>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            Error loading data: {error}
            <br />
            <span className="text-xs">
              Check that your Supabase environment variables are set correctly
              in Netlify.
            </span>
          </div>
        )}

        {/* Houses Table */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold">All Houses & Tenants</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-6 py-3 font-medium">House</th>
                    <th className="px-6 py-3 font-medium">Tenant</th>
                    <th className="px-6 py-3 font-medium">Phone</th>
                    <th className="px-6 py-3 font-medium">Rent</th>
                    <th className="px-6 py-3 font-medium">Next Due</th>
                    <th className="px-6 py-3 font-medium">Balance</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Bank A/C</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.tenant_id} className="hover:bg-slate-50">
                      <td className="px-6 py-3 font-medium">
                        {row.house_name}
                      </td>
                      <td className="px-6 py-3">{row.full_name}</td>
                      <td className="px-6 py-3 text-slate-600">
                        {row.phone || "—"}
                      </td>
                      <td className="px-6 py-3">
                        {formatMK(Number(row.monthly_rent))}
                      </td>
                      <td className="px-6 py-3">{row.next_due_date}</td>
                      <td className="px-6 py-3 font-medium text-red-600">
                        {formatMK(Number(row.current_balance))}
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {row.bank_account}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
