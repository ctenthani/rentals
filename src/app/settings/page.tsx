"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SUPABASE_URL = "https://favhmbrpisstrwgytapl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdmhtYnJwaXNzdHJ3Z3l0YXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTM5MzIsImV4cCI6MjEwMTY4OTkzMn0.6V2oE161lKWAATnZDxQiGFLfoRifoRrH7MSb0MHTJ3U";

const OWNER_EMAILS = ["ctenthani@gmail.com", "ctenthani@mubas.ac.mw"];

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [landlordId, setLandlordId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [airtel, setAirtel] = useState("");
  const [mpamba, setMpamba] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [notes, setNotes] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [mgrName, setMgrName] = useState("");
  const [mgrEmail, setMgrEmail] = useState("");
  const [mgrPass, setMgrPass] = useState("123456");
  const [newLlName, setNewLlName] = useState("");
  const [newLlBiz, setNewLlBiz] = useState("");
  const [newLlEmail, setNewLlEmail] = useState("");
  const [newLlPass, setNewLlPass] = useState("123456");
  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [deleteTyped, setDeleteTyped] = useState("");

  const router = useRouter();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const isOwner = OWNER_EMAILS.includes(userEmail.toLowerCase());

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/auth/login"); return; }
    setUserEmail(session.user.email || "");

    const { data: mem } = await supabase.from("landlord_members").select("landlord_id").eq("auth_user_id", session.user.id).maybeSingle();
    let ll: any = null;
    if (mem?.landlord_id) {
      const { data } = await supabase.from("landlords").select("*").eq("id", mem.landlord_id).maybeSingle();
      ll = data;
    }
    if (!ll) {
      const { data } = await supabase.from("landlords").select("*").eq("auth_user_id", session.user.id).maybeSingle();
      ll = data;
    }
    if (!ll) { setError("No landlord profile"); setLoading(false); return; }

    setLandlordId(ll.id);
    setFullName(ll.full_name || "");
    setBusinessName(ll.business_name || "");
    setNotifyEmail(ll.email || session.user.email || "");
    setAirtel(ll.airtel_number || "");
    setMpamba(ll.mpamba_number || "");
    setBankName(ll.bank_name || "");
    setBankAccount(ll.bank_account || "");
    setNotes(ll.payment_notes || "");
    const { data: mems } = await supabase.from("landlord_members").select("id, email, role").eq("landlord_id", ll.id);
    setMembers(mems || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [router]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!landlordId) return;
    setSaving(true); setError(null);
    const { error: uErr } = await supabase.from("landlords").update({
      full_name: fullName, business_name: businessName, email: notifyEmail,
      airtel_number: airtel || null, mpamba_number: mpamba || null,
      bank_name: bankName || null, bank_account: bankAccount || null, payment_notes: notes || null,
    }).eq("id", landlordId);
    setSaving(false);
    if (uErr) setError(uErr.message); else setMsg("Saved");
  };

  const addManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!landlordId) { setError("Missing landlord id"); return; }
    setSaving(true); setError(null); setMsg(null);
    const { data, error: fnErr } = await supabase.functions.invoke("create-manager", {
      body: { email: mgrEmail.trim(), password: mgrPass, landlord_id: landlordId, full_name: mgrName || "Manager" },
    });
    setSaving(false);
    if (fnErr) { setError(fnErr.message); return; }
    if (data?.error) { setError(data.error); return; }
    setMsg(`Co-manager added and emailed: ${mgrEmail}`);
    setMgrEmail(""); setMgrName("");
    await load();
  };

  const createLandlord = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(null); setMsg(null);
    const { data, error: fnErr } = await supabase.functions.invoke("create-new-landlord", {
      body: { email: newLlEmail.trim(), password: newLlPass, full_name: newLlName, business_name: newLlBiz },
    });
    setSaving(false);
    if (fnErr) { setError(fnErr.message); return; }
    if (data?.error) { setError(data.error); return; }
    setMsg(`New landlord created and emailed: ${newLlEmail}`);
    setNewLlEmail(""); setNewLlName(""); setNewLlBiz("");
  };

  const removeManager = async (id: string) => {
    if (!confirm("Remove this manager?")) return;
    await supabase.from("landlord_members").delete().eq("id", id);
    await load();
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass.length < 6 || newPass !== newPass2) { setError("Passwords must match and be 6+ characters"); return; }
    const { error: pErr } = await supabase.auth.updateUser({ password: newPass });
    if (pErr) setError(pErr.message); else { setNewPass(""); setNewPass2(""); setMsg("Password changed"); }
  };

  const deleteAccount = async () => {
    if (deleteTyped !== "DELETE") { setError("Type DELETE"); return; }
    const { data, error: fnErr } = await supabase.functions.invoke("delete-landlord-account");
    if (fnErr || data?.error) { setError(fnErr?.message || data?.error); return; }
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p>Loading...</p></div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-slate-600">← Dashboard</Link>
          <p className="font-bold">Settings</p>
          <p className="text-[11px] text-slate-400">{userEmail}</p>
        </div>
      </header>
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
        {msg && <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl">{msg}</p>}

        {isOwner && (
          <form onSubmit={createLandlord} className="bg-white rounded-2xl border p-5 space-y-3">
            <h2 className="font-bold text-lg">Create new landlord</h2>
            <p className="text-xs text-slate-500">Separate empty business. They get a login email.</p>
            <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Landlord name" value={newLlName} onChange={(e) => setNewLlName(e.target.value)} />
            <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Business name" value={newLlBiz} onChange={(e) => setNewLlBiz(e.target.value)} />
            <input required type="email" className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Login email" value={newLlEmail} onChange={(e) => setNewLlEmail(e.target.value)} />
            <input required className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Password min 6" value={newLlPass} onChange={(e) => setNewLlPass(e.target.value)} />
            <button disabled={saving} className="bg-slate-800 text-white px-4 py-2 rounded-xl text-sm">{saving ? "Creating..." : "Create landlord"}</button>
          </form>
        )}

        <section className="bg-white rounded-2xl border p-5 space-y-3">
          <h2 className="font-bold text-lg">Co-managers</h2>
          <p className="text-xs text-slate-500">Same properties as this account. They get a login email.</p>
          {members.map((m) => (
            <div key={m.id} className="flex justify-between text-sm border rounded-xl px-3 py-2">
              <span>{m.email} · {m.role}</span>
              <button type="button" onClick={() => removeManager(m.id)} className="text-red-600 text-xs">Remove</button>
            </div>
          ))}
          <form onSubmit={addManager} className="space-y-2">
            <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Name" value={mgrName} onChange={(e) => setMgrName(e.target.value)} />
            <input required type="email" className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Email" value={mgrEmail} onChange={(e) => setMgrEmail(e.target.value)} />
            <input required className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Password min 6" value={mgrPass} onChange={(e) => setMgrPass(e.target.value)} />
            <button disabled={saving} className="border border-emerald-300 text-emerald-800 px-4 py-2 rounded-xl text-sm">{saving ? "Adding..." : "Add co-manager"}</button>
          </form>
        </section>

        <form onSubmit={saveProfile} className="bg-white rounded-2xl border p-5 space-y-3">
          <h2 className="font-bold text-lg">Business</h2>
          <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Notification email" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} />
          <button className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm">Save</button>
        </form>

        <form onSubmit={saveProfile} className="bg-white rounded-2xl border p-5 space-y-3">
          <h2 className="font-bold text-lg">How tenants pay you</h2>
          <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Bank name" value={bankName} onChange={(e) => setBankName(e.target.value)} />
          <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Bank account" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
          <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Airtel Money" value={airtel} onChange={(e) => setAirtel(e.target.value)} />
          <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Mpamba" value={mpamba} onChange={(e) => setMpamba(e.target.value)} />
          <textarea className="w-full border rounded-xl px-3 py-2 text-sm" rows={2} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm">Save payment details</button>
        </form>

        <form onSubmit={changePassword} className="bg-white rounded-2xl border p-5 space-y-3">
          <h2 className="font-bold text-lg">Change password</h2>
          <input type="password" className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="New password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
          <input type="password" className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Confirm" value={newPass2} onChange={(e) => setNewPass2(e.target.value)} />
          <button className="bg-slate-800 text-white px-4 py-2 rounded-xl text-sm">Update password</button>
        </form>

        <section className="bg-white rounded-2xl border border-red-200 p-5 space-y-3">
          <h2 className="font-bold text-red-700">Delete account</h2>
          <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Type DELETE" value={deleteTyped} onChange={(e) => setDeleteTyped(e.target.value)} />
          <button type="button" onClick={deleteAccount} className="bg-red-600 text-white px-4 py-2 rounded-xl text-sm">Delete my account</button>
        </section>
      </div>
    </div>
  );
}
