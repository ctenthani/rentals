"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SUPABASE_URL = "https://favhmbrpisstrwgytapl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdmhtYnJwaXNzdHJ3Z3l0YXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTM5MzIsImV4cCI6MjEwMTY4OTkzMn0.6V2oE161lKWAATnZDxQiGFLfoRifoRrH7MSb0MHTJ3U";

function formatMK(n: number) {
  return new Intl.NumberFormat("en-MW", {
    style: "currency",
    currency: "MWK",
    minimumFractionDigits: 0,
  })
    .format(n)
    .replace("MWK", "MK");
}

function getPaidMonths(nextDueDate: string | null, monthsInAdvance: number) {
  if (!nextDueDate) return "—";
  const d = new Date(nextDueDate + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  d.setMonth(d.getMonth() - 1);
  const count = Math.max(Number(monthsInAdvance) || 1, 1);
  const months: string[] = [];
  for (let i = 0; i < count; i++) {
    months.unshift(d.toLocaleString("en", { month: "short", year: "numeric" }));
    d.setMonth(d.getMonth() - 1);
  }
  return months.join(", ");
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "upcoming").toLowerCase();
  const cls =
    s === "paid"
      ? "bg-emerald-100 text-emerald-800"
      : s === "overdue"
      ? "bg-red-100 text-red-800"
      : "bg-sky-100 text-sky-800";
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>
      {s.toUpperCase()}
    </span>
  );
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [userEmail, setUserEmail] = useState("");
  const [businessName, setBusinessName] = useState("My Rentals");
  const [landlordName, setLandlordName] = useState("");
  const [isAlsoTenant, setIsAlsoTenant] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [loginPassword, setLoginPassword] = useState("123456");
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    house_name: "",
    house_code: "",
    monthly_rent: "",
    bank_account: "1924966",
    tenant_name: "",
    phone: "",
    email: "",
  });

  const router = useRouter();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  async function loadData() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.push("/auth/login");
      return;
    }
    setUserEmail(session.user.email || "");

    const { data: tenantRow } = await supabase
      .from("tenants")
      .select("id")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();

    let landlordId: string | null = null;

       const { data: mem } = await supabase
      .from("landlord_members")
      .select("landlord_id, role")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();

    let landlordId: string | null = mem?.landlord_id || null;

    if (landlordId) {
      const { data: ll } = await supabase
        .from("landlords")
        .select("id, full_name, business_name, email")
        .eq("id", landlordId)
        .maybeSingle();
      if (ll) {
        setBusinessName(ll.business_name || ll.full_name || "My Rentals");
        setLandlordName(ll.full_name || "");
      }
    } else {
      const { data: landlord } = await supabase
        .from("landlords")
        .select("id, full_name, business_name, email")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();
      if (landlord) {
        landlordId = landlord.id;
        setBusinessName(landlord.business_name || landlord.full_name || "My Rentals");
        setLandlordName(landlord.full_name || "");
      }
    }

    // Only brand-new users create a landlord. Never do this for co-managers.
    if (!landlordId) {
      const { data: createdId, error: createErr } = await supabase.rpc(
        "create_landlord_profile"
      );
      if (!createErr && createdId) landlordId = createdId as string;
    }

    if (!landlordId) {
      setError("No landlord profile linked to this account");
      setLoading(false);
      return;
    }

    if (!landlordId && tenantRow) {
      router.push("/tenant");
      return;
    }
    if (rows.length >= 2) {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: ll } = await supabase
        .from("landlords")
        .select("plan, plan_paid_until")
        .eq("auth_user_id", session?.user.id || "")
        .maybeSingle();
      const paid =
        ll?.plan === "paid" &&
        ll?.plan_paid_until &&
        new Date(ll.plan_paid_until) >= new Date();
      if (!paid) {
        setSaving(false);
        setError("Free plan includes 2 properties. Extra properties are MK 4,999/month or MK 35,993/year (40% off) in Settings.");
        return;
      }
    }
    if (!landlordId) {
      const { data: createdId, error: createErr } = await supabase.rpc(
        "create_landlord_profile"
      );
      if (!createErr && createdId) {
        landlordId = createdId as string;
      } else {
        setError(
          createErr?.message || "No landlord profile linked to this account"
        );
        setLoading(false);
        return;
      }
    }

    setIsAlsoTenant(!!tenantRow);

    const { data: tenants } = await supabase
      .from("tenants")
      .select(
        `id, full_name, phone, email, auth_user_id, house_id,
         houses ( id, name, code, monthly_rent, bank_account )`
      )
      .eq("landlord_id", landlordId)
      .order("full_name");

    const tenantIds = (tenants || []).map((t: any) => t.id);

    let balances: any[] = [];
    if (tenantIds.length) {
      const { data: bal } = await supabase
        .from("tenant_balances")
        .select("*")
        .in("tenant_id", tenantIds);
      balances = bal || [];

      const { count } = await supabase
        .from("payment_submissions")
        .select("id", { count: "exact", head: true })
        .in("tenant_id", tenantIds)
        .eq("status", "pending");
      setPendingCount(count || 0);
    }

    const merged = (tenants || []).map((t: any) => {
      const house = Array.isArray(t.houses) ? t.houses[0] : t.houses;
      const b = balances.find((x) => x.tenant_id === t.id);
      return {
        id: t.id,
        full_name: t.full_name,
        phone: t.phone,
        email: t.email,
        auth_user_id: t.auth_user_id,
        house_id: t.house_id || house?.id,
        house_name: house?.name || "—",
        house_code: house?.code || "—",
        monthly_rent: Number(house?.monthly_rent || 0),
        bank_account: house?.bank_account || "",
        next_due_date: b?.next_due_date || null,
        months_in_advance: Number(b?.months_in_advance || 0),
        current_balance: Number(b?.current_balance || 0),
        status: b?.status || "upcoming",
      };
    });

    setRows(merged);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [router]);

  const totals = {
    expected: rows.reduce((s, r) => s + r.monthly_rent, 0),
    outstanding: rows.reduce((s, r) => s + r.current_balance, 0),
    paid: rows.filter((r) => r.status === "paid").length,
    overdue: rows.filter((r) => r.status === "overdue").length,
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);

    const { error: rpcErr } = await supabase.rpc("landlord_update_tenant", {
      p_tenant_id: editing.id,
      p_full_name: editing.full_name,
      p_phone: editing.phone,
      p_email: editing.email,
      p_house_name: editing.house_name,
      p_house_code: editing.house_code,
      p_monthly_rent: Number(editing.monthly_rent),
      p_bank_account: editing.bank_account,
      p_next_due_date: editing.next_due_date || null,
      p_months_in_advance: Number(editing.months_in_advance || 0),
    });

    if (rpcErr) {
      await supabase
        .from("tenants")
        .update({
          full_name: editing.full_name,
          phone: editing.phone,
          email: editing.email,
        })
        .eq("id", editing.id);

      if (editing.house_id) {
        await supabase
          .from("houses")
          .update({
            name: editing.house_name,
            code: editing.house_code,
            monthly_rent: Number(editing.monthly_rent),
            bank_account: editing.bank_account,
          })
          .eq("id", editing.house_id);
      }

      await supabase.from("tenant_balances").upsert({
        tenant_id: editing.id,
        next_due_date: editing.next_due_date || null,
        months_in_advance: Number(editing.months_in_advance || 0),
        current_balance: Number(editing.current_balance || 0),
        status: editing.status || "upcoming",
      });
    }

    setSaving(false);
    setEditing(null);
    await loadData();
  };

  const handleCreateLogin = async () => {
    if (!editing?.email) {
      setError("Set tenant email first");
      return;
    }
    if (!loginPassword || loginPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: fnErr } = await supabase.functions.invoke(
      "create-tenant-user",
      {
        body: {
          email: editing.email.trim(),
          password: loginPassword,
          tenant_id: editing.id,
          full_name: editing.full_name,
        },
      }
    );
    setSaving(false);
    if (fnErr) {
      setError(fnErr.message);
      return;
    }
    if (data?.error) {
      setError(data.error);
      return;
    }
    await supabase.functions.invoke("send-email", {
      body: {
        to: editing.email.trim(),
        subject: `Your ${businessName} tenant login`,
        html: `<p>Hello ${editing.full_name},</p>
<p>Your tenant portal is ready.</p>
<p>Login: <a href="https://rentozi.netlify.app/auth/login">https://rentozi.netlify.app/auth/login</a><br/>
Email: ${editing.email}<br/>
Password: ${loginPassword}</p>
<p>${businessName}</p>`,
        text: `Login https://rentozi.netlify.app/auth/login Email: ${editing.email} Password: ${loginPassword}`,
      },
    });
    alert(`Login created. Password: ${loginPassword}`);
    await loadData();
  };

  const handleAddProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    
    const FREE_PROPERTIES = 2;
    if (rows.length >= 2) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { data: ll } = await supabase
        .from("landlords")
        .select("plan, plan_paid_until, paid_extras")
        .eq("auth_user_id", session?.user.id || "")
        .maybeSingle();
      const paidOk =
        ll?.plan === "paid" &&
        ll?.plan_paid_until &&
        new Date(ll.plan_paid_until) >= new Date() &&
        rows.length < 2 + Number(ll.paid_extras || 0);
      if (!paidOk) {
        setSaving(false);
        setError(
          "Free plan includes 2 properties. Pay MK 3,999 per extra property per month in Settings (40% off for 12+ months)."
        );
        return;
      }
    }
    const { error: rpcErr } = await supabase.rpc("landlord_add_property", {
      p_house_name: addForm.house_name,
      p_house_code: addForm.house_code,
      p_monthly_rent: Number(addForm.monthly_rent),
      p_bank_account: addForm.bank_account,
      p_tenant_name: addForm.tenant_name,
      p_phone: addForm.phone,
      p_email: addForm.email || null,
    });
    setSaving(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setShowAdd(false);
    setAddForm({
      house_name: "",
      house_code: "",
      monthly_rent: "",
      bank_account: "1924966",
      tenant_name: "",
      phone: "",
      email: "",
    });
    await loadData();
  };

  const handleDelete = async (tenantId: string) => {
    if (!confirm("Remove this property/tenant?")) return;
    await supabase.rpc("landlord_delete_property", { p_tenant_id: tenantId });
    setEditing(null);
    await loadData();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/40 to-sky-50 overflow-x-hidden">
      <header className="bg-white/90 backdrop-blur border-b border-emerald-100 sticky top-0 z-40">
        <div className="w-full max-w-[100vw] px-3 lg:px-6">
          <div className="flex items-center justify-between h-14 gap-2">
            <div>
              <p className="font-bold text-slate-900 text-sm sm:text-base">
                {businessName}
              </p>
              <p className="text-[11px] text-slate-500 truncate max-w-[220px]">
                {landlordName ? `${landlordName} · ` : ""}
                {userEmail}
              </p>
            </div>
            <nav className="flex flex-wrap items-center gap-1 text-xs">
              <Link
                href="/dashboard"
                className="px-2.5 py-1.5 rounded-lg bg-emerald-100 text-emerald-900 font-semibold"
              >
                Dashboard
              </Link>
              {isAlsoTenant && (
                <Link
                  href="/tenant"
                  className="px-2.5 py-1.5 rounded-lg bg-sky-100 text-sky-900 font-semibold"
                >
                  Tenant view
                </Link>
              )}
              <Link
                href="/pending"
                className={`px-2.5 py-1.5 rounded-lg font-semibold relative ${
                  pendingCount > 0
                    ? "bg-amber-100 text-amber-900 animate-pulse"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Pending
                {pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center animate-bounce">
                    {pendingCount}
                  </span>
                )}
              </Link>
              <Link
                href="/record-payment"
                className="px-2.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
              >
                Record
              </Link>
              <Link
                href="/payments"
                className="px-2.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
              >
                Payments
              </Link>
              <Link
                href="/settings"
                className="px-2.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
              >
                Settings
              </Link>
              <button
                onClick={handleLogout}
                className="px-2.5 py-1.5 rounded-lg text-slate-500"
              >
                Logout
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="w-full max-w-[100vw] px-3 lg:px-6 py-4 space-y-4">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl border border-emerald-100 p-4 shadow-sm">
            <p className="text-[11px] uppercase text-slate-500 font-semibold">Expected</p>
            <p className="text-lg font-bold text-emerald-700">{formatMK(totals.expected)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-rose-100 p-4 shadow-sm">
            <p className="text-[11px] uppercase text-slate-500 font-semibold">Outstanding</p>
            <p className="text-lg font-bold text-rose-600">{formatMK(totals.outstanding)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-sky-100 p-4 shadow-sm">
            <p className="text-[11px] uppercase text-slate-500 font-semibold">Paid / Overdue</p>
            <p className="text-lg font-bold text-slate-800">
              {totals.paid} / {totals.overdue}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <p className="text-[11px] uppercase text-slate-500 font-semibold">Properties</p>
            <p className="text-lg font-bold text-slate-800">{rows.length}</p>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <h2 className="font-bold text-slate-900">Houses &amp; Tenants</h2>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-emerald-600 text-white text-sm font-semibold px-3 py-2 rounded-xl"
          >
            + Add Property
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-x-auto">
          <table className="w-full text-left text-xs table-fixed min-w-[900px]">
            <thead className="bg-emerald-50 text-emerald-900">
              <tr>
                <th className="px-2 py-2">House</th>
                <th className="px-2 py-2">Tenant</th>
                <th className="px-2 py-2">Rent</th>
                <th className="px-2 py-2">Next due</th>
                <th className="px-2 py-2">Paid months</th>
                <th className="px-2 py-2">Balance</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Bank</th>
                <th className="px-2 py-2">Login</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-2 font-medium">
                    {r.house_code}
                    <div className="text-[10px] text-slate-400 truncate">{r.house_name}</div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="truncate font-medium">{r.full_name}</div>
                    <div className="text-[10px] text-slate-400">{r.phone}</div>
                  </td>
                  <td className="px-2 py-2">{formatMK(r.monthly_rent)}</td>
                  <td className="px-2 py-2">{r.next_due_date || "—"}</td>
                  <td className="px-2 py-2 text-[11px]">
                    {getPaidMonths(r.next_due_date, r.months_in_advance)}
                    <div className="text-slate-400">{r.months_in_advance} mo adv</div>
                  </td>
                  <td className="px-2 py-2 font-semibold text-rose-600">
                    {formatMK(r.current_balance)}
                  </td>
                  <td className="px-2 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-2 py-2 text-[10px]">{r.bank_account || "—"}</td>
                  <td className="px-2 py-2">{r.auth_user_id ? "Yes" : "No"}</td>
                  <td className="px-2 py-2 space-x-1 whitespace-nowrap">
                    <button
                      onClick={() => setEditing({ ...r })}
                      className="text-emerald-700 font-semibold"
                    >
                      Edit
                    </button>
                    <Link
                      href={`/lease?tenant_id=${r.id}`}
                      className="text-sky-700 font-semibold"
                    >
                      Lease
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg">Edit property</h3>
            {[
              ["Tenant name", "full_name"],
              ["Phone", "phone"],
              ["Email", "email"],
              ["House name", "house_name"],
              ["House code", "house_code"],
              ["Monthly rent (MK)", "monthly_rent"],
              ["Bank account", "bank_account"],
            ].map(([label, key]) => (
              <div key={key}>
                <label className="text-xs font-semibold text-slate-500">{label}</label>
                <input
                  type={key === "monthly_rent" ? "number" : "text"}
                  className="w-full border rounded-xl px-3 py-2 text-sm mt-1"
                  value={editing[key] || ""}
                  onChange={(e) => setEditing({ ...editing, [key]: e.target.value })}
                />
              </div>
            ))}
            <div>
              <label className="text-xs font-semibold text-slate-500">Next due date</label>
              <input
                type="date"
                className="w-full border rounded-xl px-3 py-2 text-sm mt-1"
                value={editing.next_due_date || ""}
                onChange={(e) =>
                  setEditing({ ...editing, next_due_date: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Months paid in advance
              </label>
              <input
                type="number"
                className="w-full border rounded-xl px-3 py-2 text-sm mt-1"
                value={editing.months_in_advance}
                onChange={(e) =>
                  setEditing({ ...editing, months_in_advance: e.target.value })
                }
              />
            </div>
            <div className="border-t pt-3">
              <label className="text-xs font-semibold text-slate-500">
                Default password for Create login (min 6 characters)
              </label>
              <input
                className="w-full border rounded-xl px-3 py-2 text-sm mt-1"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={handleCreateLogin}
                disabled={saving}
                className="border border-emerald-300 text-emerald-800 px-4 py-2 rounded-xl text-sm"
              >
                Create login
              </button>
              <button
                onClick={() => handleDelete(editing.id)}
                className="border border-red-200 text-red-600 px-4 py-2 rounded-xl text-sm"
              >
                Delete
              </button>
              <button
                onClick={() => setEditing(null)}
                className="text-slate-500 px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleAddProperty}
            className="bg-white rounded-2xl w-full max-w-lg p-5 space-y-3"
          >
            <h3 className="font-bold text-lg">Add property</h3>
            <input
              required
              className="w-full border rounded-xl px-3 py-2 text-sm"
              placeholder="House name"
              value={addForm.house_name}
              onChange={(e) => setAddForm({ ...addForm, house_name: e.target.value })}
            />
            <input
              required
              className="w-full border rounded-xl px-3 py-2 text-sm"
              placeholder="House code"
              value={addForm.house_code}
              onChange={(e) => setAddForm({ ...addForm, house_code: e.target.value })}
            />
            <input
              required
              type="number"
              className="w-full border rounded-xl px-3 py-2 text-sm"
              placeholder="Monthly rent"
              value={addForm.monthly_rent}
              onChange={(e) =>
                setAddForm({ ...addForm, monthly_rent: e.target.value })
              }
            />
            <input
              className="w-full border rounded-xl px-3 py-2 text-sm"
              placeholder="Bank account"
              value={addForm.bank_account}
              onChange={(e) =>
                setAddForm({ ...addForm, bank_account: e.target.value })
              }
            />
            <input
              required
              className="w-full border rounded-xl px-3 py-2 text-sm"
              placeholder="Tenant full name"
              value={addForm.tenant_name}
              onChange={(e) =>
                setAddForm({ ...addForm, tenant_name: e.target.value })
              }
            />
            <input
              className="w-full border rounded-xl px-3 py-2 text-sm"
              placeholder="Phone"
              value={addForm.phone}
              onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
            />
            <input
              className="w-full border rounded-xl px-3 py-2 text-sm"
              placeholder="Email"
              value={addForm.email}
              onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="text-slate-500 px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
