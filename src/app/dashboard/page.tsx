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

function getPaidMonths(nextDueDate: string, monthsInAdvance: number): string {
  if (!nextDueDate) return "—";

  const months: string[] = [];
  const d = new Date(nextDueDate + "T12:00:00");
  d.setMonth(d.getMonth() - 1);

  const count = Math.max(Number(monthsInAdvance) || 0, 6);

  for (let i = 0; i < count; i++) {
    months.unshift(
      d.toLocaleString("en", { month: "short", year: "numeric" })
    );
    d.setMonth(d.getMonth() - 1);
  }

  return months.join(", ");
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20",
    overdue: "bg-red-50 text-red-700 ring-1 ring-red-600/20",
    upcoming: "bg-sky-50 text-sky-700 ring-1 ring-sky-600/20",
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

export default function LandlordDashboard() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
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

      const { data: tenantCheck } = await supabase
        .from("tenants")
        .select("id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (tenantCheck) {
        router.push("/tenant");
        return;
      }

      setCheckingAuth(false);
      await loadData();
    }

    init();
  }, [router]);

  async function loadData() {
    setLoading(true);
    setError(null);

    // Load overview + emails from tenants
    const { data: overview, error: overviewError } = await supabase
      .from("tenant_overview")
      .select("*")
      .order("house_code");

    if (overviewError) {
      setError(overviewError.message);
      setLoading(false);
      return;
    }

    const { data: tenantEmails } = await supabase
      .from("tenants")
      .select("id, email");

    const emailMap: Record<string, string> = {};
    (tenantEmails || []).forEach((t: any) => {
      emailMap[t.id] = t.email || "";
    });

    const merged = (overview || []).map((row: any) => ({
      ...row,
      email: emailMap[row.tenant_id] || "",
    }));

    setRows(merged);
    setLoading(false);
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  const openEdit = (row: any) => {
    setEditing({ ...row });
    setSuccess(null);
    setError(null);
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "landlord_update_tenant",
        {
          p_tenant_id: editing.tenant_id,
          p_full_name: editing.full_name,
          p_phone: editing.phone || null,
          p_email: editing.email || null,
          p_house_code: editing.house_code,
          p_house_name: editing.house_name,
          p_monthly_rent: Number(editing.monthly_rent),
          p_bank_account: editing.bank_account,
          p_next_due_date: editing.next_due_date,
          p_current_balance: Number(editing.current_balance),
          p_status: editing.status,
          p_months_in_advance: Number(editing.months_in_advance || 0),
        }
      );

      if (rpcError) throw rpcError;

      if (data && data.success === false) {
        throw new Error(data.error || "Update failed");
      }

      setSuccess("Changes saved successfully");
      setEditing(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading...</p>
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
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center h-14">
            <div className="flex items-center gap-6">
              <span className="font-bold text-slate-800 tracking-tight">
                Rental Manager
              </span>
              <nav className="hidden md:flex items-center gap-1">
                <Link
                  href="/dashboard"
                  className="px-3 py-2 text-sm font-medium text-green-700 bg-green-50 rounded-lg"
                >
                  Dashboard
                </Link>
                <Link
                  href="/pending"
                  className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
                >
                  Pending
                </Link>
                <Link
                  href="/record-payment"
                  className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
                >
                  Record Payment
                </Link>
                <Link
                  href="/payments"
                  className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
                >
                  Payments
                </Link>
                <Link
                  href="/reminders"
                  className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
                >
                  Reminders
                </Link>
              </nav>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-slate-500 hover:text-slate-800"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Mobile nav */}
      <div className="md:hidden bg-white border-b overflow-x-auto">
        <div className="flex gap-1 px-4 py-2 min-w-max">
          <Link
            href="/dashboard"
            className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded-lg"
          >
            Dashboard
          </Link>
          <Link
            href="/pending"
            className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 rounded-lg"
          >
            Pending
          </Link>
          <Link
            href="/record-payment"
            className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 rounded-lg"
          >
            Record
          </Link>
          <Link
            href="/payments"
            className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 rounded-lg"
          >
            Payments
          </Link>
          <Link
            href="/reminders"
            className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 rounded-lg"
          >
            Reminders
          </Link>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <p className="text-sm text-slate-500">Expected Rent</p>
            <p className="text-2xl font-semibold mt-1 tracking-tight">
              {loading ? "—" : formatMK(totalExpected)}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <p className="text-sm text-slate-500">Outstanding</p>
            <p className="text-2xl font-semibold mt-1 tracking-tight text-red-600">
              {loading ? "—" : formatMK(totalOutstanding)}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <p className="text-sm text-slate-500">Occupied</p>
            <p className="text-2xl font-semibold mt-1 tracking-tight">
              {loading ? "—" : `${rows.length} / 10`}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <p className="text-sm text-slate-500">Occupancy</p>
            <p className="text-2xl font-semibold mt-1 tracking-tight">100%</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-sm">
            {success}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
            <h2 className="font-semibold text-slate-800">
              All Houses & Tenants
            </h2>
            <p className="text-xs text-slate-500">
              3 months advance: Lipanda, Chisoni, Emily, Gift Mphande
            </p>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400">Loading...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/80 text-left text-slate-500">
                    <th className="px-6 py-3 font-medium">House</th>
                    <th className="px-6 py-3 font-medium">Tenant</th>
                    <th className="px-6 py-3 font-medium">Phone</th>
                    <th className="px-6 py-3 font-medium">Email</th>
                    <th className="px-6 py-3 font-medium">Rent</th>
                    <th className="px-6 py-3 font-medium">Paid Months</th>
                    <th className="px-6 py-3 font-medium">Next Due</th>
                    <th className="px-6 py-3 font-medium">Balance</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Bank</th>
                    <th className="px-6 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.tenant_id} className="hover:bg-slate-50/60">
                      <td className="px-6 py-3.5 font-medium text-slate-800">
                        {row.house_name}
                      </td>
                      <td className="px-6 py-3.5">{row.full_name}</td>
                      <td className="px-6 py-3.5 text-slate-500">
                        {row.phone || "—"}
                      </td>
                      <td className="px-6 py-3.5 text-slate-500 text-xs">
                        {row.email || "—"}
                      </td>
                      <td className="px-6 py-3.5">
                        {formatMK(Number(row.monthly_rent))}
                      </td>
                      <td className="px-6 py-3.5 text-slate-700 text-xs leading-relaxed max-w-[200px]">
                        {getPaidMonths(
                          row.next_due_date,
                          Number(row.months_in_advance || 0)
                        )}
                      </td>
                      <td className="px-6 py-3.5 font-medium text-slate-800">
                        {row.next_due_date}
                      </td>
                      <td className="px-6 py-3.5 font-medium text-red-600">
                        {formatMK(Number(row.current_balance))}
                      </td>
                      <td className="px-6 py-3.5">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-6 py-3.5 text-slate-500">
                        {row.bank_account}
                      </td>
                      <td className="px-6 py-3.5">
                        <button
                          onClick={() => openEdit(row)}
                          className="text-green-700 hover:text-green-800 font-medium text-sm"
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
      </main>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800">
                Edit Property
              </h3>
              <p className="text-sm text-slate-500 mt-0.5">
                {editing.house_code} • {editing.full_name}
              </p>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    House Name
                  </label>
                  <input
                    type="text"
                    value={editing.house_name || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, house_name: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Tenant Name
                  </label>
                  <input
                    type="text"
                    value={editing.full_name || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, full_name: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={editing.phone || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, phone: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={editing.email || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, email: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                    placeholder="tenant@gmail.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Monthly Rent
                  </label>
                  <input
                    type="number"
                    value={editing.monthly_rent}
                    onChange={(e) =>
                      setEditing({ ...editing, monthly_rent: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Next Due Date
                  </label>
                  <input
                    type="date"
                    value={editing.next_due_date}
                    onChange={(e) =>
                      setEditing({ ...editing, next_due_date: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
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
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Months in Advance
                  </label>
                  <input
                    type="number"
                    value={editing.months_in_advance || 0}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        months_in_advance: e.target.value,
                      })
                    }
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Status
                  </label>
                  <select
                    value={editing.status}
                    onChange={(e) =>
                      setEditing({ ...editing, status: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                  >
                    <option value="upcoming">Upcoming</option>
                    <option value="overdue">Overdue</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Bank Account
                  </label>
                  <input
                    type="text"
                    value={editing.bank_account}
                    onChange={(e) =>
                      setEditing({ ...editing, bank_account: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-2.5 rounded-xl font-medium text-sm"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={() => setEditing(null)}
                className="px-5 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
