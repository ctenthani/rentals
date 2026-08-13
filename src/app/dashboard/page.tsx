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
    paid: "bg-emerald-100 text-emerald-800",
    overdue: "bg-red-100 text-red-800",
    upcoming: "bg-sky-100 text-sky-800",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide ${
        styles[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {(status || "—").toUpperCase()}
    </span>
  );
}

const emptyAdd = {
  house_code: "",
  house_name: "",
  monthly_rent: "",
  bank_account: "1924966",
  tenant_name: "",
  phone: "",
  email: "",
  next_due_date: new Date().toISOString().split("T")[0],
  current_balance: "0",
};

export default function LandlordDashboard() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [creatingLogin, setCreatingLogin] = useState(false);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);

  // Add property
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ ...emptyAdd });
  const [adding, setAdding] = useState(false);

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
    const { data: overview, error: overviewError } = await supabase
      .from("tenant_overview")
      .select("*")
      .order("house_code");
    if (overviewError) {
      setError(overviewError.message);
      setLoading(false);
      return;
    }
    const { data: tenantExtras } = await supabase
      .from("tenants")
      .select("id, email, auth_user_id");
    const extraMap: Record<string, { email: string; auth_user_id: string }> =
      {};
    (tenantExtras || []).forEach((t: any) => {
      extraMap[t.id] = {
        email: t.email || "",
        auth_user_id: t.auth_user_id || "",
      };
    });
    const merged = (overview || []).map((row: any) => ({
      ...row,
      email: extraMap[row.tenant_id]?.email || "",
      auth_user_id: extraMap[row.tenant_id]?.auth_user_id || "",
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
    setLoginEmail(row.email || "");
    setLoginPassword("");
    setLoginMessage(null);
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

  const handleCreateLogin = async () => {
    if (!editing) return;
    if (!loginEmail || !loginPassword) {
      setLoginMessage("Email and password are required");
      return;
    }
    if (loginPassword.length < 6) {
      setLoginMessage("Password must be at least 6 characters");
      return;
    }
    setCreatingLogin(true);
    setLoginMessage(null);

    // Keep landlord session — only use Edge Function
    const { data, error } = await supabase.functions.invoke(
      "create-tenant-user",
      {
        body: {
          tenant_id: editing.tenant_id,
          email: loginEmail,
          password: loginPassword,
          full_name: editing.full_name,
        },
      }
    );

    if (error) {
      setLoginMessage(
        "Error: " +
          error.message +
          " (Deploy the create-tenant-user Edge Function first)"
      );
      setCreatingLogin(false);
      return;
    }
    if (data?.error) {
      setLoginMessage("Error: " + data.error);
      setCreatingLogin(false);
      return;
    }

    setLoginMessage(`Login created. Tenant signs in with ${loginEmail}`);
    setEditing({
      ...editing,
      email: loginEmail,
      auth_user_id: data?.user_id || editing.auth_user_id,
    });
    setCreatingLogin(false);
    await loadData();
  };

  const handleAddProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setError(null);
    setSuccess(null);

    const { data, error: rpcError } = await supabase.rpc(
      "landlord_add_property",
      {
        p_house_code: addForm.house_code,
        p_house_name: addForm.house_name,
        p_monthly_rent: Number(addForm.monthly_rent),
        p_bank_account: addForm.bank_account,
        p_tenant_name: addForm.tenant_name,
        p_phone: addForm.phone || null,
        p_email: addForm.email || null,
        p_next_due_date: addForm.next_due_date,
        p_current_balance: Number(addForm.current_balance || 0),
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setAdding(false);
      return;
    }
    if (data && data.success === false) {
      setError(data.error || "Failed to add property");
      setAdding(false);
      return;
    }

    setSuccess("Property added successfully");
    setShowAdd(false);
    setAddForm({ ...emptyAdd });
    setAdding(false);
    await loadData();
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Loading dashboard...</p>
        </div>
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
  const paidCount = rows.filter((r) => r.status === "paid").length;
  const overdueCount = rows.filter((r) => r.status === "overdue").length;

  const navLink = (href: string, label: string, active = false) => (
    <Link
      href={href}
      className={`px-3.5 py-2 text-sm font-medium rounded-lg transition ${
        active
          ? "text-green-800 bg-green-100"
          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center">
                  <span className="text-white text-sm font-bold">R</span>
                </div>
                <span className="font-bold text-slate-900 tracking-tight">
                  Rental Manager
                </span>
              </div>
              <nav className="hidden md:flex items-center gap-1">
                {navLink("/dashboard", "Dashboard", true)}
                {navLink("/pending", "Pending")}
                {navLink("/record-payment", "Record Payment")}
                {navLink("/payments", "Payments")}
                {navLink("/reminders", "Reminders")}
              </nav>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-slate-500 hover:text-slate-800 font-medium px-3 py-1.5 rounded-lg hover:bg-slate-100 transition"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="md:hidden bg-white border-b border-slate-200 overflow-x-auto">
        <div className="flex gap-1.5 px-4 py-2.5 min-w-max">
          {navLink("/dashboard", "Dashboard", true)}
          {navLink("/pending", "Pending")}
          {navLink("/record-payment", "Record")}
          {navLink("/payments", "Payments")}
          {navLink("/reminders", "Reminders")}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Overview
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage properties, tenants, and rent collection
            </p>
          </div>
          <button
            onClick={() => {
              setShowAdd(true);
              setAddForm({ ...emptyAdd });
              setError(null);
            }}
            className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-sm transition"
          >
            + Add Property
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Expected Rent
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
              {loading ? "—" : formatMK(totalExpected)}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Outstanding
            </p>
            <p className="text-2xl font-bold text-red-600 mt-2 tracking-tight">
              {loading ? "—" : formatMK(totalOutstanding)}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Paid / Overdue
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
              {loading ? "—" : `${paidCount} / ${overdueCount}`}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Properties
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
              {loading ? "—" : rows.length}
            </p>
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

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Houses & Tenants</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              3 months advance: Lipanda, Chisoni, Emily, Gift Mphande
            </p>
          </div>

          {loading ? (
            <div className="p-16 flex flex-col items-center gap-3">
              <div className="w-7 h-7 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-400 text-sm">Loading...</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              No properties yet. Click <strong>Add Property</strong> to start.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/90 text-left">
                    {[
                      "House",
                      "Tenant",
                      "Phone",
                      "Email",
                      "Login",
                      "Rent",
                      "Paid Months",
                      "Next Due",
                      "Balance",
                      "Status",
                      "Bank",
                      "",
                    ].map((h) => (
                      <th
                        key={h || "a"}
                        className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr
                      key={row.tenant_id}
                      className="hover:bg-slate-50/80 transition"
                    >
                      <td className="px-5 py-4 font-medium text-slate-900 whitespace-nowrap">
                        {row.house_name}
                      </td>
                      <td className="px-5 py-4 text-slate-800 whitespace-nowrap">
                        {row.full_name}
                      </td>
                      <td className="px-5 py-4 text-slate-500 whitespace-nowrap">
                        {row.phone || "—"}
                      </td>
                      <td className="px-5 py-4 text-slate-500 text-xs max-w-[140px] truncate">
                        {row.email || "—"}
                      </td>
                      <td className="px-5 py-4">
                        {row.auth_user_id ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Linked
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">
                            None
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-700 whitespace-nowrap">
                        {formatMK(Number(row.monthly_rent))}
                      </td>
                      <td className="px-5 py-4 text-slate-600 text-xs leading-relaxed max-w-[200px]">
                        {getPaidMonths(
                          row.next_due_date,
                          Number(row.months_in_advance || 0)
                        )}
                      </td>
                      <td className="px-5 py-4 font-medium text-slate-800 whitespace-nowrap">
                        {row.next_due_date}
                      </td>
                      <td className="px-5 py-4 font-semibold text-red-600 whitespace-nowrap">
                        {formatMK(Number(row.current_balance))}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-5 py-4 text-slate-500 text-xs whitespace-nowrap">
                        {row.bank_account}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => openEdit(row)}
                          className="text-green-700 hover:text-green-900 font-semibold text-sm hover:underline"
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

      {/* Add Property Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200">
            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-900">
                Add Property
              </h3>
              <p className="text-sm text-slate-500 mt-0.5">
                New house and tenant
              </p>
            </div>
            <form onSubmit={handleAddProperty}>
              <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                      House Code *
                    </label>
                    <input
                      required
                      value={addForm.house_code}
                      onChange={(e) =>
                        setAddForm({ ...addForm, house_code: e.target.value })
                      }
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm"
                      placeholder="H11"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                      Monthly Rent *
                    </label>
                    <input
                      required
                      type="number"
                      value={addForm.monthly_rent}
                      onChange={(e) =>
                        setAddForm({
                          ...addForm,
                          monthly_rent: e.target.value,
                        })
                      }
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm"
                      placeholder="150000"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                      House Name *
                    </label>
                    <input
                      required
                      value={addForm.house_name}
                      onChange={(e) =>
                        setAddForm({ ...addForm, house_name: e.target.value })
                      }
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm"
                      placeholder="Chileka House 6"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                      Tenant Name *
                    </label>
                    <input
                      required
                      value={addForm.tenant_name}
                      onChange={(e) =>
                        setAddForm({ ...addForm, tenant_name: e.target.value })
                      }
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm"
                      placeholder="John Banda"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                      Phone
                    </label>
                    <input
                      value={addForm.phone}
                      onChange={(e) =>
                        setAddForm({ ...addForm, phone: e.target.value })
                      }
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm"
                      placeholder="26599..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                      Email
                    </label>
                    <input
                      type="email"
                      value={addForm.email}
                      onChange={(e) =>
                        setAddForm({ ...addForm, email: e.target.value })
                      }
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm"
                      placeholder="optional"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                      Bank Account
                    </label>
                    <input
                      value={addForm.bank_account}
                      onChange={(e) =>
                        setAddForm({
                          ...addForm,
                          bank_account: e.target.value,
                        })
                      }
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                      Next Due Date
                    </label>
                    <input
                      type="date"
                      value={addForm.next_due_date}
                      onChange={(e) =>
                        setAddForm({
                          ...addForm,
                          next_due_date: e.target.value,
                        })
                      }
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                      Starting Balance
                    </label>
                    <input
                      type="number"
                      value={addForm.current_balance}
                      onChange={(e) =>
                        setAddForm({
                          ...addForm,
                          current_balance: e.target.value,
                        })
                      }
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm"
                    />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                <button
                  type="submit"
                  disabled={adding}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-2.5 rounded-xl font-semibold text-sm"
                >
                  {adding ? "Adding..." : "Add Property"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-5 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal — same as before with Create Login */}
      {editing && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200">
            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-900">
                Edit Property
              </h3>
              <p className="text-sm text-slate-500 mt-0.5">
                {editing.house_code} · {editing.full_name}
              </p>
            </div>
            <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    House Name
                  </label>
                  <input
                    type="text"
                    value={editing.house_name || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, house_name: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Tenant Name
                  </label>
                  <input
                    type="text"
                    value={editing.full_name || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, full_name: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={editing.phone || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, phone: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Email
                  </label>
                  <input
                    type="email"
                    value={editing.email || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, email: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Monthly Rent
                  </label>
                  <input
                    type="number"
                    value={editing.monthly_rent}
                    onChange={(e) =>
                      setEditing({ ...editing, monthly_rent: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Next Due Date
                  </label>
                  <input
                    type="date"
                    value={editing.next_due_date}
                    onChange={(e) =>
                      setEditing({ ...editing, next_due_date: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
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
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
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
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Status
                  </label>
                  <select
                    value={editing.status}
                    onChange={(e) =>
                      setEditing({ ...editing, status: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm"
                  >
                    <option value="upcoming">Upcoming</option>
                    <option value="overdue">Overdue</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Bank Account
                  </label>
                  <input
                    type="text"
                    value={editing.bank_account}
                    onChange={(e) =>
                      setEditing({ ...editing, bank_account: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </div>

                <div className="col-span-2 border-t border-slate-100 pt-5 mt-1">
                  <h4 className="text-sm font-bold text-slate-900 mb-1">
                    Tenant login
                  </h4>
                  <p className="text-xs text-slate-500 mb-3">
                    Uses the server function so your landlord session stays
                    active. Deploy create-tenant-user first.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Login email
                      </label>
                      <input
                        type="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Temporary password
                      </label>
                      <input
                        type="text"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  {loginMessage && (
                    <p
                      className={`text-xs mt-2 ${
                        loginMessage.startsWith("Error")
                          ? "text-red-600"
                          : "text-emerald-600"
                      }`}
                    >
                      {loginMessage}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleCreateLogin}
                    disabled={creatingLogin}
                    className="mt-3 w-full border border-green-200 text-green-700 hover:bg-green-50 disabled:opacity-50 py-2.5 rounded-xl text-sm font-semibold"
                  >
                    {creatingLogin ? "Creating..." : "Create tenant login"}
                  </button>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-2.5 rounded-xl font-semibold text-sm"
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
