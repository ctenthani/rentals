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

function getPaidMonths(
  nextDueDate: string | null,
  monthsInAdvance: number
): string {
  if (!nextDueDate) return "—";
  const d = new Date(nextDueDate + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  d.setMonth(d.getMonth() - 1);
  const count = Math.max(Number(monthsInAdvance) || 1, 1);
  const months: string[] = [];
  for (let i = 0; i < count; i++) {
    months.unshift(
      d.toLocaleString("en", { month: "short", year: "2-digit" })
    );
    d.setMonth(d.getMonth() - 1);
  }
  return months.join(", ");
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
    overdue: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
    upcoming: "bg-sky-100 text-sky-800 ring-1 ring-sky-200",
  };
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${
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
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
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
        `id, full_name, phone, email, auth_user_id, house_id,
         houses ( id, code, name, monthly_rent, bank_account )`
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
      const { data: balData } = await supabase
        .from("tenant_balances")
        .select(
          "tenant_id, current_balance, next_due_date, months_in_advance, status"
        )
        .in("tenant_id", tenantIds);
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

    if (tenantIds.length > 0) {
      const { data: pays } = await supabase
        .from("payments")
        .select(
          `id, amount, paid_date, months_covered, method,
           tenants ( full_name )`
        )
        .in("tenant_id", tenantIds)
        .order("paid_date", { ascending: false })
        .limit(8);
      setRecentPayments(pays || []);
    } else {
      setRecentPayments([]);
    }

    setLoading(false);
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  const openEdit = (row: any) => {
    setEditing({ ...row, next_due_date: row.next_due_date || "" });
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
      if (data?.success === false)
        throw new Error(data.error || "Update failed");
      setSuccess("Changes saved");
      setEditing(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (!confirm(`Delete ${editing.house_name} / ${editing.full_name}?`))
      return;
    setSaving(true);
    const { data, error: delError } = await supabase.rpc(
      "landlord_delete_property",
      { p_tenant_id: editing.tenant_id }
    );
    setSaving(false);
    if (delError) {
      setError(delError.message);
      return;
    }
    if (data?.success === false) {
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
      setLoginMessage("Email and password required");
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
    setAdding(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    if (data?.success === false) {
      setError(data.error || "Failed");
      return;
    }
    setSuccess("Property added");
    setShowAdd(false);
    setAddForm({ ...emptyAdd });
    await loadData();
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-sky-50">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalExpected = rows.reduce(
    (s, r) => s + Number(r.monthly_rent || 0),
    0
  );
  const totalOutstanding = rows.reduce(
    (s, r) => s + Number(r.current_balance || 0),
    0
  );
  const paidCount = rows.filter((r) => r.status === "paid").length;
  const overdueCount = rows.filter((r) => r.status === "overdue").length;

  const nav = (href: string, label: string, active = false) => (
    <Link
      href={href}
      className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition ${
        active
          ? "bg-emerald-600 text-white shadow-sm"
          : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-800"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/40 to-sky-50 overflow-x-hidden">
      <header className="bg-white/90 backdrop-blur border-b border-emerald-100 sticky top-0 z-40">
        <div className="w-full max-w-[100vw] px-3 lg:px-6">
          <div className="flex items-center justify-between h-14 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-200">
                <span className="text-white font-bold text-sm">R</span>
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-900 text-sm truncate">
                  {businessName || "Rental Manager"}
                </p>
                <p className="text-[10px] text-emerald-700/80 truncate hidden sm:block">
                  {landlordName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden md:block text-right">
                <p className="text-[10px] text-slate-400">Signed in</p>
                <p className="text-xs font-medium text-slate-700 max-w-[160px] truncate">
                  {accountEmail}
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white flex items-center justify-center text-xs font-bold shadow">
                {(accountEmail || "?").charAt(0).toUpperCase()}
              </div>
              <button
                onClick={handleLogout}
                className="text-xs font-medium text-slate-500 hover:text-rose-600 px-2"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="bg-white/70 border-b border-emerald-100">
        <div className="px-3 lg:px-6 py-2 flex flex-wrap gap-1">
          {nav("/dashboard", "Dashboard", true)}
          {nav("/pending", "Pending")}
          {nav("/record-payment", "Record")}
          {nav("/payments", "Payments")}
          {nav("/reminders", "Reminders")}
          {nav("/settings", "Settings")}
        </div>
      </div>

      <main className="px-3 lg:px-6 py-5 max-w-[100vw]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Overview</h1>
            <p className="text-xs text-slate-500">
              Properties, dues, paid months & receipts
            </p>
          </div>
          <button
            onClick={() => {
              setShowAdd(true);
              setAddForm({ ...emptyAdd });
            }}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-emerald-200 self-start"
          >
            + Add Property
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <div className="rounded-2xl bg-white border border-emerald-100 p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
              Expected
            </p>
            <p className="text-lg font-bold text-slate-900 mt-1">
              {loading ? "—" : formatMK(totalExpected)}
            </p>
          </div>
          <div className="rounded-2xl bg-white border border-rose-100 p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-500">
              Outstanding
            </p>
            <p className="text-lg font-bold text-rose-600 mt-1">
              {loading ? "—" : formatMK(totalOutstanding)}
            </p>
          </div>
          <div className="rounded-2xl bg-white border border-sky-100 p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-sky-600">
              Paid / Overdue
            </p>
            <p className="text-lg font-bold text-slate-900 mt-1">
              {loading ? "—" : `${paidCount} / ${overdueCount}`}
            </p>
          </div>
          <div className="rounded-2xl bg-white border border-violet-100 p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600">
              Properties
            </p>
            <p className="text-lg font-bold text-slate-900 mt-1">
              {loading ? "—" : rows.length}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-3 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-sm">
            {success}
          </div>
        )}

        {/* Recent payments + receipts */}
        {recentPayments.length > 0 && (
          <div className="mb-5 bg-white rounded-2xl border border-emerald-100 p-4 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-bold text-slate-800 text-sm">
                Recent payments
              </h2>
              <Link
                href="/payments"
                className="text-xs font-semibold text-emerald-700 hover:underline"
              >
                View all
              </Link>
            </div>
            <div className="space-y-2">
              {recentPayments.map((p) => {
                const t = Array.isArray(p.tenants) ? p.tenants[0] : p.tenants;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 text-sm border-b border-slate-50 last:border-0 pb-2 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">
                        {t?.full_name || "Tenant"}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {p.paid_date}
                        {p.months_covered
                          ? ` · ${p.months_covered} mo`
                          : ""}
                        {p.method ? ` · ${p.method}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-emerald-700">
                        {formatMK(Number(p.amount))}
                      </span>
                      <Link
                        href={`/receipt?id=${p.id}`}
                        className="bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg"
                      >
                        Receipt
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-sky-50">
            <h2 className="font-bold text-slate-800 text-sm">
              Houses & Tenants
            </h2>
          </div>

          {loading ? (
            <div className="p-12 flex justify-center">
              <div className="w-7 h-7 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-slate-500 text-sm">
              No properties yet.
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table
                className="w-full table-fixed text-left"
                style={{ minWidth: 0 }}
              >
                <colgroup>
                  <col className="w-[12%]" />
                  <col className="w-[12%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                  <col className="w-[18%]" />
                  <col className="w-[9%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[6%]" />
                  <col className="w-[7%]" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="px-2 py-2.5 font-bold">House</th>
                    <th className="px-2 py-2.5 font-bold">Tenant</th>
                    <th className="px-2 py-2.5 font-bold">Rent</th>
                    <th className="px-2 py-2.5 font-bold">Next due</th>
                    <th className="px-2 py-2.5 font-bold">Paid months</th>
                    <th className="px-2 py-2.5 font-bold">Balance</th>
                    <th className="px-2 py-2.5 font-bold">Status</th>
                    <th className="px-2 py-2.5 font-bold">Bank</th>
                    <th className="px-2 py-2.5 font-bold">Login</th>
                    <th className="px-2 py-2.5 font-bold"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={row.tenant_id}
                      className={`text-xs border-t border-slate-100 hover:bg-emerald-50/50 transition ${
                        i % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                      }`}
                    >
                      <td className="px-2 py-2.5 font-semibold text-slate-900 truncate">
                        <span className="text-emerald-700">
                          {row.house_code}
                        </span>
                        <span className="block text-[10px] font-normal text-slate-500 truncate">
                          {row.house_name}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-slate-800 truncate">
                        {row.full_name}
                        {row.phone && (
                          <span className="block text-[10px] text-slate-400 truncate">
                            {row.phone}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                        {formatMK(row.monthly_rent)}
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="font-bold text-teal-700 whitespace-nowrap">
                          {row.next_due_date || "—"}
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          {row.months_in_advance || 0} mo adv
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-[11px] text-slate-700 leading-snug">
                        <span className="line-clamp-2">
                          {getPaidMonths(
                            row.next_due_date,
                            row.months_in_advance
                          )}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 font-bold text-rose-600 whitespace-nowrap">
                        {formatMK(row.current_balance)}
                      </td>
                      <td className="px-2 py-2.5">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-2 py-2.5 text-[10px] text-slate-500 truncate">
                        {row.bank_account || "—"}
                      </td>
                      <td className="px-2 py-2.5">
                        {row.auth_user_id ? (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                            Yes
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">No</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <button
                            onClick={() => openEdit(row)}
                            className="text-[11px] font-bold text-emerald-700 hover:underline text-left"
                          >
                            Edit
                          </button>
                          <Link
                            href={`/lease?tenant_id=${row.tenant_id}`}
                            className="text-[11px] font-medium text-sky-700 hover:underline"
                          >
                            Lease
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {showAdd && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b bg-gradient-to-r from-emerald-50 to-teal-50">
              <h3 className="font-bold text-slate-900">Add Property</h3>
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
              <div className="grid grid-cols-2 gap-2">
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
                placeholder="Bank"
                value={addForm.bank_account}
                onChange={(e) =>
                  setAddForm({ ...addForm, bank_account: e.target.value })
                }
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={adding}
                  className="flex-1 bg-emerald-600 text-white py-2.5 rounded-xl text-sm font-semibold"
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

      {editing && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b bg-gradient-to-r from-emerald-50 to-sky-50">
              <h3 className="font-bold">Edit Property</h3>
              <p className="text-xs text-slate-500">
                {editing.house_code} · {editing.full_name}
              </p>
            </div>
            <div className="p-5 space-y-3">
              <input
                value={editing.house_name || ""}
                placeholder="House name"
                onChange={(e) =>
                  setEditing({ ...editing, house_name: e.target.value })
                }
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
              />
              <input
                value={editing.full_name || ""}
                placeholder="Tenant"
                onChange={(e) =>
                  setEditing({ ...editing, full_name: e.target.value })
                }
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={editing.phone || ""}
                  placeholder="Phone"
                  onChange={(e) =>
                    setEditing({ ...editing, phone: e.target.value })
                  }
                  className="w-full border rounded-xl px-3 py-2.5 text-sm"
                />
                <input
                  type="email"
                  value={editing.email || ""}
                  placeholder="Email"
                  onChange={(e) =>
                    setEditing({ ...editing, email: e.target.value })
                  }
                  className="w-full border rounded-xl px-3 py-2.5 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-500 font-bold">
                    RENT
                  </label>
                  <input
                    type="number"
                    value={editing.monthly_rent}
                    onChange={(e) =>
                      setEditing({ ...editing, monthly_rent: e.target.value })
                    }
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-teal-700 font-bold">
                    NEXT DUE
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
                    className="w-full border border-teal-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-500 font-bold">
                    BALANCE
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
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-bold">
                    MONTHS ADVANCE
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
                    className="w-full border rounded-xl px-3 py-2 text-sm"
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
                placeholder="Bank"
                onChange={(e) =>
                  setEditing({ ...editing, bank_account: e.target.value })
                }
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
              />

              <div className="border-t pt-3 space-y-2">
                <p className="text-sm font-bold text-slate-800">Tenant login</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="email"
                    value={loginEmail}
                    placeholder="Email"
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                  />
                  <input
                    value={loginPassword}
                    placeholder="Password"
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                {loginMessage && (
                  <p
                    className={`text-xs ${
                      loginMessage.startsWith("Error")
                        ? "text-rose-600"
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
                  className="w-full border border-emerald-200 text-emerald-700 py-2 rounded-xl text-sm font-semibold"
                >
                  {creatingLogin ? "Creating..." : "Create tenant login"}
                </button>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 bg-emerald-600 text-white py-2.5 rounded-xl text-sm font-semibold"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-4 border border-rose-200 text-rose-600 rounded-xl text-sm"
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
