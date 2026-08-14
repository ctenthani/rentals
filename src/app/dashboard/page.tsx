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

function getPaidMonths(nextDueDate: string | null, monthsInAdvance: number): string {
  if (!nextDueDate) return "No payments recorded";
  const months: string[] = [];
  const d = new Date(nextDueDate + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "—";

  // Last paid month is the month before next due
  d.setMonth(d.getMonth() - 1);

  const count = Math.max(Number(monthsInAdvance) || 1, 1);
  for (let i = 0; i < count; i++) {
    months.unshift(
      d.toLocaleString("en", { month: "short", year: "numeric" })
    );
    d.setMonth(d.getMonth() - 1);
  }
  return months.join(" · ");
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
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ ...emptyAdd });
  const [adding, setAdding] = useState(false);

  const [accountEmail, setAccountEmail] = useState("");
  const [landlordName, setLandlordName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [landlordId, setLandlordId] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  useEffect(() => {
    async function init() {
      try {
        await supabase.rpc("expire_due_leases");
      } catch {
        /* optional */
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/auth/login");
        return;
      }

      setAccountEmail(session.user.email || "");

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
        .select("id, full_name, business_name")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (!landlord) {
        const { data: membership } = await supabase
          .from("landlord_members")
          .select("landlord_id, landlords(id, full_name, business_name)")
          .eq("auth_user_id", session.user.id)
          .maybeSingle();

        if (membership?.landlords) {
          const L = Array.isArray(membership.landlords)
            ? membership.landlords[0]
            : membership.landlords;
          landlord = L as any;
        }
      }

      if (!landlord) {
        await supabase.rpc("create_landlord_profile", {
          p_full_name: session.user.email?.split("@")[0] || "Landlord",
          p_business_name: null,
        });
        const res = await supabase
          .from("landlords")
          .select("id, full_name, business_name")
          .eq("auth_user_id", session.user.id)
          .maybeSingle();
        landlord = res.data;
      }

      if (!landlord) {
        setError("No landlord profile found.");
        setCheckingAuth(false);
        setLoading(false);
        return;
      }

      setLandlordId(landlord.id);
      setLandlordName(landlord.full_name || "");
      setBusinessName(landlord.business_name || "");
      setCheckingAuth(false);
      await loadData(landlord.id);
    }

    init();
  }, [router]);

  async function loadData(lid?: string) {
    const id = lid || landlordId;
    if (!id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data: tenants, error: tenantsError } = await supabase
      .from("tenants")
      .select(
        `
        id,
        full_name,
        phone,
        email,
        auth_user_id,
        house_id,
        houses (
          id,
          code,
          name,
          monthly_rent,
          bank_account,
          landlord_id
        )
      `
      )
      .eq("landlord_id", id)
      .order("full_name");

    if (tenantsError) {
      setError(tenantsError.message);
      setLoading(false);
      return;
    }

    const tenantIds = (tenants || []).map((t: any) => t.id);
    let balances: any[] = [];

    if (tenantIds.length > 0) {
      const { data: balData, error: balError } = await supabase
        .from("tenant_balances")
        .select(
          "tenant_id, current_balance, next_due_date, months_in_advance, status"
        )
        .in("tenant_id", tenantIds);

      if (balError) {
        console.error(balError);
      }
      balances = balData || [];
    }

    const balMap: Record<string, any> = {};
    balances.forEach((b) => {
      balMap[b.tenant_id] = b;
    });

    const merged = (tenants || []).map((t: any) => {
      const house = Array.isArray(t.houses) ? t.houses[0] : t.houses;
      const bal = balMap[t.id] || {};
      return {
        tenant_id: t.id,
        full_name: t.full_name,
        phone: t.phone,
        email: t.email || "",
        auth_user_id: t.auth_user_id || "",
        house_code: house?.code || "",
        house_name: house?.name || "",
        monthly_rent: Number(house?.monthly_rent || 0),
        bank_account: house?.bank_account || "",
        current_balance: Number(bal.current_balance ?? 0),
        next_due_date: bal.next_due_date || null,
        months_in_advance: Number(bal.months_in_advance || 0),
        status: bal.status || "upcoming",
      };
    });

    merged.sort((a: any, b: any) =>
      String(a.house_code).localeCompare(String(b.house_code))
    );

    setRows(merged);
    setLoading(false);
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  const openEdit = (row: any) => {
    setEditing({
      ...row,
      next_due_date: row.next_due_date || "",
    });
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
          p_next_due_date: editing.next_due_date || null,
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

  const handleDelete = async () => {
    if (!editing) return;
    if (
      !confirm(
        `Delete ${editing.house_name} / ${editing.full_name}? This cannot be undone.`
      )
    ) {
      return;
    }

    setSaving(true);
    setError(null);

    const { data, error: delError } = await supabase.rpc(
      "landlord_delete_property",
      { p_tenant_id: editing.tenant_id }
    );

    setSaving(false);

    if (delError) {
      setError(delError.message);
      return;
    }
    if (data && data.success === false) {
      setError(data.error || "Delete failed");
      return;
    }

    setEditing(null);
    setSuccess("Property removed");
    await loadData();
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
      setLoginMessage("Error: " + error.message);
      setCreatingLogin(false);
      return;
    }
    if (data?.error) {
      setLoginMessage("Error: " + data.error);
      setCreatingLogin(false);
      return;
    }

    setLoginMessage(`Login created for ${loginEmail}`);
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
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
      className={`px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap ${
        active
          ? "text-green-800 bg-green-100"
          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex justify-between items-center h-14 gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 shrink-0 rounded-lg bg-green-600 flex items-center justify-center">
                <span className="text-white text-sm font-bold">R</span>
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-900 text-sm truncate">
                  {businessName || "Rental Manager"}
                </p>
                <p className="text-[11px] text-slate-500 truncate hidden sm:block">
                  {landlordName}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right hidden sm:block">
                <p className="text-[10px] text-slate-500">Signed in</p>
                <p className="text-xs font-medium text-slate-800 max-w-[140px] truncate">
                  {accountEmail}
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-green-100 text-green-800 flex items-center justify-center text-sm font-bold">
                {(accountEmail || "?").charAt(0).toUpperCase()}
              </div>
              <button
                onClick={handleLogout}
                className="text-xs text-slate-500 hover:text-slate-800 font-medium px-2 py-1"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Nav — wraps, no horizontal page scroll */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-2 flex flex-wrap gap-1">
          {navLink("/dashboard", "Dashboard", true)}
          {navLink("/pending", "Pending")}
          {navLink("/record-payment", "Record")}
          {navLink("/payments", "Payments")}
          {navLink("/reminders", "Reminders")}
          {navLink("/settings", "Settings")}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Overview</h1>
            <p className="text-sm text-slate-500">Your properties only</p>
          </div>
          <button
            onClick={() => {
              setShowAdd(true);
              setAddForm({ ...emptyAdd });
              setError(null);
            }}
            className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl self-start"
          >
            + Add Property
          </button>
        </div>

        {/* Stats — 2x2 on mobile, no overflow */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-[11px] font-medium text-slate-500 uppercase">
              Expected
            </p>
            <p className="text-lg font-bold text-slate-900 mt-1 break-words">
              {loading ? "—" : formatMK(totalExpected)}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-[11px] font-medium text-slate-500 uppercase">
              Outstanding
            </p>
            <p className="text-lg font-bold text-red-600 mt-1 break-words">
              {loading ? "—" : formatMK(totalOutstanding)}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-[11px] font-medium text-slate-500 uppercase">
              Paid / Overdue
            </p>
            <p className="text-lg font-bold text-slate-900 mt-1">
              {loading ? "—" : `${paidCount} / ${overdueCount}`}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-[11px] font-medium text-slate-500 uppercase">
              Properties
            </p>
            <p className="text-lg font-bold text-slate-900 mt-1">
              {loading ? "—" : rows.length}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm break-words">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-sm">
            {success}
          </div>
        )}

        {/* Card list — no horizontal scroll */}
        <div className="space-y-3">
          <h2 className="font-semibold text-slate-900 px-1">
            Houses & Tenants
          </h2>

          {loading ? (
            <div className="bg-white rounded-2xl border p-10 flex justify-center">
              <div className="w-7 h-7 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="bg-white rounded-2xl border p-10 text-center text-slate-500 text-sm">
              No properties yet.{" "}
              <button
                onClick={() => setShowAdd(true)}
                className="text-green-700 font-semibold"
              >
                Add your first
              </button>
            </div>
          ) : (
            rows.map((row) => (
              <div
                key={row.tenant_id}
                className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">
                      {row.house_name}
                    </p>
                    <p className="text-sm text-slate-600 truncate">
                      {row.full_name}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {row.house_code}
                      {row.phone ? ` · ${row.phone}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div>
                    <p className="text-[11px] text-slate-500 uppercase">Rent</p>
                    <p className="font-medium text-slate-800">
                      {formatMK(row.monthly_rent)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 uppercase">
                      Balance
                    </p>
                    <p className="font-semibold text-red-600">
                      {formatMK(row.current_balance)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 uppercase">
                      Next due
                    </p>
                    <p className="font-semibold text-slate-900">
                      {row.next_due_date || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 uppercase">
                      Advance
                    </p>
                    <p className="font-medium text-slate-800">
                      {row.months_in_advance || 0} mo
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl px-3 py-2 mb-3">
                  <p className="text-[11px] text-slate-500 uppercase mb-0.5">
                    Paid months
                  </p>
                  <p className="text-sm text-slate-800 leading-snug break-words">
                    {getPaidMonths(row.next_due_date, row.months_in_advance)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => openEdit(row)}
                    className="text-sm font-semibold text-green-700 hover:underline"
                  >
                    Edit
                  </button>
                  <Link
                    href={`/lease?tenant_id=${row.tenant_id}`}
                    className="text-sm font-medium text-slate-600 hover:underline"
                  >
                    Lease
                  </Link>
                  <span className="text-xs text-slate-400 self-center">
                    Bank {row.bank_account || "—"}
                  </span>
                  {row.auth_user_id ? (
                    <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full ml-auto">
                      Login linked
                    </span>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[95vh] overflow-y-auto">
            <div className="px-5 py-4 border-b">
              <h3 className="text-lg font-bold">Add Property</h3>
            </div>
            <form onSubmit={handleAddProperty} className="p-5 space-y-3">
              <input
                required
                placeholder="House code *"
                value={addForm.house_code}
                onChange={(e) =>
                  setAddForm({ ...addForm, house_code: e.target.value })
                }
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
              />
              <input
                required
                placeholder="House name *"
                value={addForm.house_name}
                onChange={(e) =>
                  setAddForm({ ...addForm, house_name: e.target.value })
                }
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
              />
              <input
                required
                placeholder="Tenant name *"
                value={addForm.tenant_name}
                onChange={(e) =>
                  setAddForm({ ...addForm, tenant_name: e.target.value })
                }
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  required
                  type="number"
                  placeholder="Rent *"
                  value={addForm.monthly_rent}
                  onChange={(e) =>
                    setAddForm({ ...addForm, monthly_rent: e.target.value })
                  }
                  className="w-full border rounded-xl px-3 py-2.5 text-sm"
                />
                <input
                  type="date"
                  value={addForm.next_due_date}
                  onChange={(e) =>
                    setAddForm({ ...addForm, next_due_date: e.target.value })
                  }
                  className="w-full border rounded-xl px-3 py-2.5 text-sm"
                />
              </div>
              <input
                placeholder="Phone"
                value={addForm.phone}
                onChange={(e) =>
                  setAddForm({ ...addForm, phone: e.target.value })
                }
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
              />
              <input
                placeholder="Bank account"
                value={addForm.bank_account}
                onChange={(e) =>
                  setAddForm({ ...addForm, bank_account: e.target.value })
                }
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
              />
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={adding}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold"
                >
                  {adding ? "Adding..." : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-4 border rounded-xl text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[95vh] overflow-y-auto">
            <div className="px-5 py-4 border-b">
              <h3 className="text-lg font-bold">Edit Property</h3>
              <p className="text-sm text-slate-500">
                {editing.house_code} · {editing.full_name}
              </p>
            </div>
            <div className="p-5 space-y-3">
              <input
                value={editing.house_name || ""}
                onChange={(e) =>
                  setEditing({ ...editing, house_name: e.target.value })
                }
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
                placeholder="House name"
              />
              <input
                value={editing.full_name || ""}
                onChange={(e) =>
                  setEditing({ ...editing, full_name: e.target.value })
                }
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
                placeholder="Tenant name"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={editing.phone || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, phone: e.target.value })
                  }
                  className="w-full border rounded-xl px-3 py-2.5 text-sm"
                  placeholder="Phone"
                />
                <input
                  type="email"
                  value={editing.email || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, email: e.target.value })
                  }
                  className="w-full border rounded-xl px-3 py-2.5 text-sm"
                  placeholder="Email"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-500">Rent</label>
                  <input
                    type="number"
                    value={editing.monthly_rent}
                    onChange={(e) =>
                      setEditing({ ...editing, monthly_rent: e.target.value })
                    }
                    className="w-full border rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500">
                    Next due date
                  </label>
                  <input
                    type="date"
                    value={editing.next_due_date || ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        next_due_date: e.target.value,
                      })
                    }
                    className="w-full border rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-500">Balance</label>
                  <input
                    type="number"
                    value={editing.current_balance}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        current_balance: e.target.value,
                      })
                    }
                    className="w-full border rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500">
                    Months in advance
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
                    className="w-full border rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>
              </div>
              <select
                value={editing.status}
                onChange={(e) =>
                  setEditing({ ...editing, status: e.target.value })
                }
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
              >
                <option value="upcoming">Upcoming</option>
                <option value="overdue">Overdue</option>
                <option value="paid">Paid</option>
              </select>
              <input
                value={editing.bank_account || ""}
                onChange={(e) =>
                  setEditing({ ...editing, bank_account: e.target.value })
                }
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
                placeholder="Bank account"
              />

              <div className="border-t pt-3 space-y-2">
                <p className="text-sm font-semibold">Tenant login</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="Login email"
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                  />
                  <input
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Temp password"
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                {loginMessage && (
                  <p
                    className={`text-xs ${
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
                  className="w-full border border-green-200 text-green-700 py-2 rounded-xl text-sm font-medium"
                >
                  {creatingLogin ? "Creating..." : "Create tenant login"}
                </button>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 min-w-[100px] bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-4 border border-red-200 text-red-600 rounded-xl text-sm"
                >
                  Delete
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="px-4 border rounded-xl text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
