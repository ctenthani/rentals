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
  const colors: Record<string, string> = {
    paid: "bg-green-100 text-green-800",
    overdue: "bg-red-100 text-red-800",
    upcoming: "bg-blue-100 text-blue-800",
  };

  return (
    <span
      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
        colors[status] || "bg-gray-100 text-gray-800"
      }`}
    >
      {status?.toUpperCase()}
    </span>
  );
}

export default function LandlordDashboard() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
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

      setCheckingAuth(false);
      await loadData();
    }

    init();
  }, [router]);

  async function loadData() {
    setLoading(true);
    const { data, error } = await supabase
      .from("tenant_overview")
      .select("*")
      .order("house_code");

    if (error) {
      setError(error.message);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  const openEdit = (row: any) => {
    setEditing({ ...row });
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);

    // Update tenant_balances
    const { error: balError } = await supabase
      .from("tenant_balances")
      .update({
        next_due_date: editing.next_due_date,
        current_balance: Number(editing.current_balance),
        status: editing.status,
      })
      .eq("tenant_id", editing.tenant_id);

    // Update houses
    const { error: houseError } = await supabase
      .from("houses")
      .update({
        monthly_rent: Number(editing.monthly_rent),
        bank_account: editing.bank_account,
      })
      .eq("code", editing.house_code);

    // Update tenant phone
    const { error: tenantError } = await supabase
      .from("tenants")
      .update({
        phone: editing.phone,
      })
      .eq("id", editing.tenant_id);

    if (balError || houseError || tenantError) {
      setError(
        balError?.message || houseError?.message || tenantError?.message || "Error saving"
      );
      setSaving(false);
      return;
    }

    setEditing(null);
    setSaving(false);
    await loadData();
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Checking login...</p>
      </div>
    );
  }

  const totalExpected = rows.reduce(
    (sum, r) => sum + Number(r.monthly_rent || 0),
    0
  );
  const totalOutstanding = rows.reduce(
    (sum, r) => sum + Number(r.current_balance || 0),
    0
  );

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Top Navigation */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center h-14">
            <div className="flex items-center gap-6">
              <span className="font-bold text-lg">Rental Manager</span>
              <nav className="flex gap-4 text-sm">
                <Link
                  href="/dashboard"
                  className="font-medium text-green-700 border-b-2 border-green-600 pb-3.5"
                >
                  Dashboard
                </Link>
                <Link
                  href="/pending"
                  className="text-slate-600 hover:text-slate-900 pb-3.5"
                >
                  Pending Payments
                </Link>
              </nav>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 sm:p-6">
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

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
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
                    <th className="px-6 py-3 font-medium">Bank</th>
                    <th className="px-6 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.tenant_id} className="hover:bg-slate-50">
                      <td className="px-6 py-3 font-medium">{row.house_name}</td>
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
                      <td className="px-6 py-3">
                        <button
                          onClick={() => openEdit(row)}
                          className="text-green-700 hover:underline text-sm"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold">
              Edit – {editing.house_name}
            </h3>

            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-slate-600 mb-1">Tenant Phone</label>
                <input
                  type="text"
                  value={editing.phone || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, phone: e.target.value })
                  }
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Monthly Rent</label>
                <input
                  type="number"
                  value={editing.monthly_rent}
                  onChange={(e) =>
                    setEditing({ ...editing, monthly_rent: e.target.value })
                  }
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Next Due Date</label>
                <input
                  type="date"
                  value={editing.next_due_date}
                  onChange={(e) =>
                    setEditing({ ...editing, next_due_date: e.target.value })
                  }
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">
                  Current Balance
                </label>
                <input
                  type="number"
                  value={editing.current_balance}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      current_balance: e.target.value,
                    })
                  }
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Status</label>
                <select
                  value={editing.status}
                  onChange={(e) =>
                    setEditing({ ...editing, status: e.target.value })
                  }
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="upcoming">Upcoming</option>
                  <option value="overdue">Overdue</option>
                  <option value="paid">Paid</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Bank Account</label>
                <input
                  type="text"
                  value={editing.bank_account}
                  onChange={(e) =>
                    setEditing({ ...editing, bank_account: e.target.value })
                  }
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-medium"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={() => setEditing(null)}
                className="px-4 border rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
