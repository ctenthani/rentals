"use client";

import { useEffect, useState } from "react";
import { currentBalance } from "@/lib/accounting";
import { supabase } from "@/lib/supabase";
import { invokeRentozi } from "@/lib/messaging";
import { useRouter } from "next/navigation";
import Link from "next/link";


function formatMK(n: number) {
  return new Intl.NumberFormat("en-MW", {
    style: "currency",
    currency: "MWK",
    minimumFractionDigits: 0,
  })
    .format(n)
    .replace("MWK", "MK");
}

function cycleMonths(nextDue: string | null, monthsInAdvance: number) {
  if (!nextDue) return [] as string[];
  const count = Math.max(Number(monthsInAdvance) || 0, 0);
  if (!count) return [];
  const d = new Date(nextDue + "T12:00:00");
  if (Number.isNaN(d.getTime())) return [];
  d.setMonth(d.getMonth() - 1);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.unshift(d.toLocaleString("en", { month: "short", year: "numeric" }));
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

function monthsOverdue(nextDue: string | null) {
  if (!nextDue) return 0;
  const due = new Date(nextDue + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  due.setHours(12, 0, 0, 0);
  if (Number.isNaN(due.getTime()) || due > today) return 0;
  let n = 0;
  const d = new Date(due);
  while (d <= today && n < 36) {
    n += 1;
    d.setMonth(d.getMonth() + 1);
  }
  return n;
}

function liveBalance(nextDue: string | null, stored: number, rent: number) {
  const overdue = monthsOverdue(nextDue);
  if (overdue > 0) return overdue * Number(rent || 0);
  return Number(stored || 0);
}

function computeStatus(nextDue: string | null, balance: number) {
  if (Number(balance) > 0) return "overdue";
  if (!nextDue) return "upcoming";
  const due = new Date(nextDue + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  due.setHours(12, 0, 0, 0);
  if (due > today) return "paid";
  if (due.getTime() === today.getTime()) return "due";
  return "overdue";
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "upcoming").toLowerCase();
  const cls =
    s === "paid"
      ? "bg-emerald-100 text-emerald-800"
      : s === "overdue"
      ? "bg-red-100 text-red-800"
      : s === "due"
      ? "bg-amber-100 text-amber-800"
      : "bg-slate-100 text-slate-700";
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>
      {s.toUpperCase()}
    </span>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [userEmail, setUserEmail] = useState("");
  const [businessName, setBusinessName] = useState("My Rentals");
  const [landlordName, setLandlordName] = useState("");
  const [isPlatformOwner,setIsPlatformOwner]=useState(false);
  const [inviteOnAdd,setInviteOnAdd]=useState(true);
  const [invitationStates,setInvitationStates]=useState<Record<string,any>>({});
  const [notice,setNotice]=useState("");
  const [isAlsoTenant, setIsAlsoTenant] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    house_name: "",
    house_code: "",
    monthly_rent: "",
    bank_account: "",
    tenant_name: "",
    phone: "",
    email: "",
  });

  async function loadData() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.push("/auth/login");
      return;
    }
    setUserEmail(session.user.email || "");
    const {data:platformOwner}=await supabase.rpc("rentozi_is_platform_owner");setIsPlatformOwner(!!platformOwner);

    const { data: tenantRows } = await supabase
      .from("tenants")
      .select("id")
      .eq("auth_user_id", session.user.id);
    const tenantRow = tenantRows?.[0] || null;

    const { data: lid } = await supabase.rpc("my_landlord_id");
    const landlordId: string | null = lid || null;

    if (landlordId) {
      const { data: pub } = await supabase.rpc("landlord_public", { p_id: landlordId });
      if (pub) {
        setBusinessName(pub.business_name || pub.full_name || "My Rentals");
        setLandlordName(pub.full_name || "");
      }
    }

    if (!landlordId && tenantRow) {
      router.push("/tenant");
      return;
    }
    if (!landlordId) {
      setError("No landlord profile linked to this account");
      setLoading(false);
      return;
    }

    setIsAlsoTenant(!!tenantRow);

    const { data: tenants } = await supabase
      .from("tenants")
      .select("id, full_name, phone, email, auth_user_id, house_id, is_active")
      .eq("landlord_id", landlordId)
      .order("full_name");

    const houseIds = (tenants || []).map((t: any) => t.house_id).filter(Boolean);
    let houses: any[] = [];
    if (houseIds.length) {
      const { data: hs } = await supabase
        .from("houses")
        .select("id, name, code, monthly_rent, bank_account")
        .in("id", houseIds);
      houses = hs || [];
    }

    const tenantIds = (tenants || []).map((t: any) => t.id);
    let balances: any[] = [];
    if (tenantIds.length) {
      const { data: bal } = await supabase.from("tenant_balances").select("*").in("tenant_id", tenantIds);
      balances = bal || [];
      const { count } = await supabase
        .from("payment_submissions")
        .select("id", { count: "exact", head: true })
        .in("tenant_id", tenantIds)
        .eq("status", "pending");
      setPendingCount(count || 0);
    }

    setRows(
      (tenants || []).map((t: any) => {
        const house = houses.find((h) => h.id === t.house_id);
        const b = balances.find((x) => x.tenant_id === t.id);
        const nextDue = b?.next_due_date || null;
        const rent = Number(house?.monthly_rent || 0);
        const balAmt = currentBalance(b, rent);
        return {
          id: t.id,
          is_active: t.is_active,
          partial_credit: Number(b?.partial_credit || 0),
          full_name: t.full_name,
          phone: t.phone,
          email: t.email,
          auth_user_id: t.auth_user_id,
          house_id: t.house_id || house?.id,
          house_name: house?.name || "—",
          house_code: house?.code || "—",
          monthly_rent: rent,
          bank_account: house?.bank_account || "",
          next_due_date: nextDue,
          months_in_advance: Number(b?.months_in_advance || 0),
          current_balance: balAmt,
          status: computeStatus(nextDue, balAmt),
        };
      })
    );
    const {data:states}=await supabase.rpc("rentozi_invitation_status",{p_tenants:tenantIds});setInvitationStates(Object.fromEntries((states||[]).map((r:any)=>[r.tenant_id,r])));
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [router]);

  const totals = {
    expected: rows.filter(r => r.is_active !== false).reduce((s, r) => s + r.monthly_rent, 0),
    outstanding: rows.reduce((s, r) => s + r.current_balance, 0),
    paid: rows.filter((r) => r.status === "paid").length,
    overdue: rows.filter((r) => r.status === "overdue" || r.status === "due").length,
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.rpc("rentozi_update_property", { p_tenant: editing.id, p_details: {
      full_name: editing.full_name, phone: editing.phone, email: editing.email,
      house_name: editing.house_name, house_code: editing.house_code,
      monthly_rent: Number(editing.monthly_rent), bank_account: editing.bank_account,
      next_due_date: editing.next_due_date || null, months_in_advance: Number(editing.months_in_advance || 0),
      current_balance: Number(editing.current_balance || 0),
    }});
    if (updateError) { setSaving(false); setError(updateError.message); return; }
    setSaving(false);
    setEditing(null);
    await loadData();
  };

  const handleCreateLogin = async () => {
    if (!editing?.email) {
      setError("Set tenant email first");
      return;
    }
    setSaving(true);
    setError(null);
    try{
      const {error:saveError}=await supabase.rpc("rentozi_save_tenant_email",{p_tenant:editing.id,p_email:editing.email.trim()});if(saveError)throw saveError;
      await invokeRentozi("create-tenant-user",{email:editing.email.trim(),tenant_id:editing.id,full_name:editing.full_name});
      setNotice("Invitation sent to "+editing.email+". The recipient accepts the link to connect their profile. Existing passwords are preserved.");setEditing(null);
    }catch(e){setError((e as Error).message);}finally{setSaving(false);}
    await loadData();
  };

  const handleAddProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { data:newTenantId,error: rpcErr } = await supabase.rpc("landlord_add_property", {
      p_house_name: addForm.house_name,
      p_house_code: addForm.house_code,
      p_monthly_rent: Number(addForm.monthly_rent),
      p_bank_account: addForm.bank_account,
      p_tenant_name: addForm.tenant_name,
      p_phone: addForm.phone,
      p_email: addForm.email || null,
    });
    if (rpcErr) {
      setSaving(false);setError(rpcErr.message);
      return;
    }
    setShowAdd(false);
    if(inviteOnAdd&&addForm.email){try{await invokeRentozi("create-tenant-user",{email:addForm.email.trim(),tenant_id:newTenantId,full_name:addForm.tenant_name});setNotice("Property saved and invitation sent. The recipient accepts the link to connect their profile.");}catch(e){setError("Property saved. Invitation failed: "+(e as Error).message+". Use Edit → Send login invitation to retry.");}}

    setAddForm({
      house_name: "",
      house_code: "",
      monthly_rent: "",
      bank_account: "",
      tenant_name: "",
      phone: "",
      email: "",
    });
    setSaving(false);await loadData();
  };

  const handleDelete = async (tenantId: string) => {
    const archived = rows.find(r => r.id === tenantId)?.is_active === false;
    if (!confirm(archived ? "Restore this property and tenant?" : "Archive this property and tenant? Receipts and balances will be preserved.")) return;
    const { error: rpcError } = await supabase.rpc(archived ? "rentozi_restore_property" : "landlord_delete_property", { p_tenant_id: tenantId });
    if (rpcError) { setError(rpcError.message); return; }
    setEditing(null); await loadData();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/40 to-sky-50">
      <header className="bg-white/90 backdrop-blur border-b border-emerald-100 sticky top-0 z-40">
        <div className="w-full px-4 lg:px-8">
          <div className="flex items-center justify-between h-14 gap-2">
            <div>
              <p className="font-bold text-slate-900 text-sm sm:text-base">{businessName}</p>
              <p className="text-[11px] text-slate-500 truncate max-w-[220px]">
                {landlordName ? `${landlordName} · ` : ""}
                {userEmail}
              </p>
            </div>
            <nav className="flex flex-wrap items-center gap-1 text-xs">
              <Link href="/dashboard" className="px-2.5 py-1.5 rounded-lg bg-emerald-100 text-emerald-900 font-semibold">
                Dashboard
              </Link>
              {isAlsoTenant && (
                <Link href="/tenant" className="px-2.5 py-1.5 rounded-lg bg-sky-100 text-sky-900 font-semibold">
                  Tenant view
                </Link>
              )}
              <Link
                href="/pending"
                className={`px-2.5 py-1.5 rounded-lg font-semibold relative ${
                  pendingCount > 0 ? "bg-amber-100 text-amber-900 animate-pulse" : "text-slate-600"
                }`}
              >
                Pending
                {pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
              </Link>
              <Link href="/record-payment" className="px-2.5 py-1.5 rounded-lg text-slate-600">
                Record
              </Link>
              <Link href="/payments" className="px-2.5 py-1.5 rounded-lg text-slate-600">
                Payments
              </Link>
              {isPlatformOwner&&<Link href="/owner" className="text-xs bg-slate-900 text-white px-3 py-2 rounded-xl">Site users</Link>}
            <Link href="/settings" className="px-2.5 py-1.5 rounded-lg text-slate-600">
                Settings
              </Link>
              <Link href="/help" className="px-2.5 py-1.5 rounded-lg text-slate-600">
                Help
              </Link>
              <button onClick={handleLogout} className="px-2.5 py-1.5 rounded-lg text-slate-500">
                Logout
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="w-full px-4 lg:px-8 py-4 space-y-4">
        {notice&&<p role="status" className="bg-emerald-50 text-emerald-800 p-3 rounded-xl">{notice}</p>}
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl border p-4">
            <p className="text-[11px] uppercase text-slate-500 font-semibold">Expected</p>
            <p className="text-lg font-bold text-emerald-700">{formatMK(totals.expected)}</p>
          </div>
          <div className="bg-white rounded-2xl border p-4">
            <p className="text-[11px] uppercase text-slate-500 font-semibold">Outstanding</p>
            <p className="text-lg font-bold text-rose-600">{formatMK(totals.outstanding)}</p>
          </div>
          <div className="bg-white rounded-2xl border p-4">
            <p className="text-[11px] uppercase text-slate-500 font-semibold">Paid / Due</p>
            <p className="text-lg font-bold">
              {totals.paid} / {totals.overdue}
            </p>
          </div>
          <div className="bg-white rounded-2xl border p-4">
            <p className="text-[11px] uppercase text-slate-500 font-semibold">Properties</p>
            <p className="text-lg font-bold">{rows.length}</p>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <h2 className="font-bold">Houses &amp; Tenants</h2>
          <button onClick={() => setShowAdd(true)} className="bg-emerald-600 text-white text-sm font-semibold px-3 py-2 rounded-xl">
            + Add Property
          </button>
        </div>

        <div className="bg-white rounded-2xl border overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-emerald-50 text-emerald-900">
              <tr>
                {["House", "Tenant", "Rent", "Next due", "This cycle", "Balance", "Status", "Bank", "Login", "Actions"].map((h) => (
                  <th key={h} className="px-2 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-2 py-2 font-medium">
                    {r.house_code}
                    <div className="text-[10px] text-slate-400">{r.house_name}{r.is_active === false && <span className="ml-2 text-xs text-slate-500">Archived</span>}</div>
                  </td>
                  <td className="px-2 py-2">
                    {r.full_name}
                    <div className="text-[10px] text-slate-400">{r.phone}</div>
                  </td>
                  <td className="px-2 py-2">{formatMK(r.monthly_rent)}</td>
                  <td className="px-2 py-2">{r.next_due_date || "—"}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1 max-w-[220px]">
                      {cycleMonths(r.next_due_date, r.months_in_advance).map((m) => (
                        <span key={m} className="bg-emerald-50 text-emerald-800 text-[10px] font-semibold px-1.5 py-0.5 rounded-md">
                          {m}
                        </span>
                      ))}
                      {!cycleMonths(r.next_due_date, r.months_in_advance).length && <span className="text-slate-400">—</span>}
                    </div>
                  </td>
                  <td className={`px-2 py-2 font-semibold ${r.current_balance > 0 ? "text-rose-600" : "text-slate-500"}`}>
                    {formatMK(r.current_balance)}
                  </td>
                  <td className="px-2 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-2 py-2 text-[10px]">{r.bank_account || "—"}</td>
                  <td className="px-2 py-2">{r.auth_user_id ? "Yes" : invitationStates[r.id]?.delivery_error ? "Email failed" : invitationStates[r.id]?.status==="pending"&&invitationStates[r.id]?.sent_at ? "Invited · awaiting acceptance" : invitationStates[r.id]?.status==="expired" ? "Invitation expired" : "No"}</td>
                  <td className="px-2 py-2 space-x-1 whitespace-nowrap">
                    <button onClick={() => setEditing({ ...r })} className="text-emerald-700 font-semibold">
                      Edit
                    </button>
                    <Link href={`/lease?tenant_id=${r.id}`} className="text-sky-700 font-semibold">
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
              ["Monthly rent", "monthly_rent"],
              ["Bank account", "bank_account"],
            ].map(([label, key]) => (
              <div key={key}>
                <label className="text-xs font-semibold text-slate-500">{label}</label>
                <input
                  className="w-full border rounded-xl px-3 py-2 text-sm mt-1"
                  value={editing[key] || ""}
                  onChange={(e) => setEditing({ ...editing, [key]: e.target.value })}
                />
              </div>
            ))}
            <label className="text-xs font-semibold text-slate-500">Next due date</label>
            <input
              type="date"
              className="w-full border rounded-xl px-3 py-2 text-sm"
              value={editing.next_due_date || ""}
              onChange={(e) => setEditing({ ...editing, next_due_date: e.target.value })}
            />
            <label className="text-xs font-semibold text-slate-500">Months in this cycle</label>
            <input
              type="number"
              className="w-full border rounded-xl px-3 py-2 text-sm"
              value={editing.months_in_advance}
              onChange={(e) => setEditing({ ...editing, months_in_advance: e.target.value })}
            />
            <label className="text-xs font-semibold text-slate-500">Current balance (changes are recorded as account adjustments)</label>
            <input
              type="number"
              className="w-full border rounded-xl px-3 py-2 text-sm"
              value={editing.current_balance}
              onChange={(e) => setEditing({ ...editing, current_balance: e.target.value })}
            />
            <p className="text-xs text-slate-500">New tenants receive an invitation and choose their own password. Existing users keep their login.</p>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button onClick={handleSaveEdit} disabled={saving} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">
                {saving ? "Saving..." : "Save"}
              </button>
              <button type="button" onClick={handleCreateLogin} disabled={saving} className="border px-4 py-2 rounded-xl text-sm font-semibold">
                Send login invitation
              </button>
              <Link href="/help" className="bg-sky-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">
                How to use Rentozi
              </Link>
              <button type="button" onClick={() => handleDelete(editing.id)} className="border border-red-200 text-red-600 px-4 py-2 rounded-xl text-sm font-semibold">
                {editing.is_active === false ? "Restore property" : "Archive property"}
              </button>
              <button type="button" onClick={() => setEditing(null)} className="text-slate-500 px-4 py-2 rounded-xl text-sm font-semibold">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleAddProperty} className="bg-white rounded-2xl w-full max-w-lg p-5 space-y-3">
            <h3 className="font-bold text-lg">Add property</h3>
            <input required className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="House name" value={addForm.house_name} onChange={(e) => setAddForm({ ...addForm, house_name: e.target.value })} />
            <input required className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="House code" value={addForm.house_code} onChange={(e) => setAddForm({ ...addForm, house_code: e.target.value })} />
            <input required type="number" className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Monthly rent" value={addForm.monthly_rent} onChange={(e) => setAddForm({ ...addForm, monthly_rent: e.target.value })} />
            <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Bank account" value={addForm.bank_account} onChange={(e) => setAddForm({ ...addForm, bank_account: e.target.value })} />
            <input required className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Tenant name" value={addForm.tenant_name} onChange={(e) => setAddForm({ ...addForm, tenant_name: e.target.value })} />
            <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Phone" value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} />
            <input className="w-full border rounded-xl px-3 py-2 text-sm" type="email" placeholder="Email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} />
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={inviteOnAdd} onChange={e=>setInviteOnAdd(e.target.checked)}/>Send login invitation when an email is provided</label>
            <div className="flex gap-2">
              <button disabled={saving} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm">Save</button>
              <button type="button" onClick={() => setShowAdd(false)} className="text-slate-500 text-sm">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
