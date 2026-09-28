"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SUPABASE_URL = "https://favhmbrpisstrwgytapl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdmhtYnJwaXNzdHJ3Z3l0YXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTM5MzIsImV4cCI6MjEwMTY4OTkzMn0.6V2oE161lKWAATnZDxQiGFLfoRifoRrH7MSb0MHTJ3U";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [landlordId, setLandlordId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [airtel, setAirtel] = useState("");
  const [mpamba, setMpamba] = useState("");
  const [notes, setNotes] = useState("");

  const [newLlName, setNewLlName] = useState("");
  const [newLlBiz, setNewLlBiz] = useState("");
  const [newLlEmail, setNewLlEmail] = useState("");
  const [newLlPass, setNewLlPass] = useState("123456");

  const [cmName, setCmName] = useState("");
  const [cmEmail, setCmEmail] = useState("");
  const [cmPass, setCmPass] = useState("123456");

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [deleteWord, setDeleteWord] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/auth/login");
        return;
      }

      const { data: own } = await supabase
        .from("landlords")
        .select("*")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      const { data: mem } = await supabase
        .from("landlord_members")
        .select("landlord_id")
        .eq("auth_user_id", session.user.id)
        .limit(1);

      let row = own;
      if (!row && mem?.[0]?.landlord_id) {
        const { data: ll } = await supabase.from("landlords").select("*").eq("id", mem[0].landlord_id).maybeSingle();
        row = ll;
      }

      if (!row) {
        setError("No landlord profile on this login");
        setLoading(false);
        return;
      }

      setIsOwner(!!own);
      setLandlordId(row.id);
      setFullName(row.full_name || "");
      setBusinessName(row.business_name || "");
      setNotifyEmail(row.email || session.user.email || "");
      setBankName(row.bank_name || "");
      setBankAccount(row.bank_account || "");
      setAirtel(row.airtel_number || "");
      setMpamba(row.mpamba_number || "");
      setNotes(row.payment_notes || "");
      setLoading(false);
    })();
  }, [router]);

  const saveBusiness = async () => {
    if (!landlordId) return;
    if (!notifyEmail.trim()) {
      setError("Notification email is required so tenant activity can reach you");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: uErr } = await supabase
      .from("landlords")
      .update({
        full_name: fullName,
        business_name: businessName,
        email: notifyEmail.trim().toLowerCase(),
      })
      .eq("id", landlordId);
    setSaving(false);
    if (uErr) setError(uErr.message);
    else setMsg("Business details saved. Tenant emails will go to " + notifyEmail.trim());
  };

  const savePay = async () => {
    if (!landlordId) return;
    setSaving(true);
    const { error: uErr } = await supabase
      .from("landlords")
      .update({
        bank_name: bankName,
        bank_account: bankAccount,
        airtel_number: airtel,
        mpamba_number: mpamba,
        payment_notes: notes,
      })
      .eq("id", landlordId);
    setSaving(false);
    if (uErr) setError(uErr.message);
    else setMsg("Payment details saved");
  };

  const createLandlord = async () => {
    setError(null);
    const { error: fnErr } = await supabase.functions.invoke("create-landlord", {
      body: {
        full_name: newLlName,
        business_name: newLlBiz,
        email: newLlEmail,
        password: newLlPass,
      },
    });
    if (fnErr) setError(fnErr.message);
    else setMsg("New landlord created. They will receive a login email.");
  };

  const addManager = async () => {
    setError(null);
    const { error: fnErr } = await supabase.functions.invoke("create-manager", {
      body: {
        landlord_id: landlordId,
        full_name: cmName,
        email: cmEmail,
        password: cmPass,
      },
    });
    if (fnErr) setError(fnErr.message);
    else setMsg("Co-manager added. They received a login email.");
  };

  const changePassword = async () => {
    if (pw1 !== pw2) {
      setError("Passwords do not match");
      return;
    }
    const { error: pErr } = await supabase.auth.updateUser({ password: pw1 });
    if (pErr) setError(pErr.message);
    else setMsg("Password updated");
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading settings...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-slate-600">← Dashboard</Link>
          <p className="font-bold">Settings</p>
          <span />
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
        {msg && <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl">{msg}</p>}

        {isOwner && (
          <section className="bg-white rounded-2xl border p-5 space-y-2">
            <h2 className="font-bold">Create new landlord</h2>
            <p className="text-xs text-slate-500">Separate empty business. They get a login email.</p>
            <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Landlord name" value={newLlName} onChange={(e) => setNewLlName(e.target.value)} />
            <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Business name" value={newLlBiz} onChange={(e) => setNewLlBiz(e.target.value)} />
            <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Login email" value={newLlEmail} onChange={(e) => setNewLlEmail(e.target.value)} />
            <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Password" value={newLlPass} onChange={(e) => setNewLlPass(e.target.value)} />
            <button onClick={createLandlord} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm">Create landlord</button>
          </section>
        )}

        <section className="bg-white rounded-2xl border p-5 space-y-2">
          <h2 className="font-bold">Co-managers</h2>
          <p className="text-xs text-slate-500">Same properties as this account. They get a login email.</p>
          <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Name" value={cmName} onChange={(e) => setCmName(e.target.value)} />
          <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Email" value={cmEmail} onChange={(e) => setCmEmail(e.target.value)} />
          <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Password" value={cmPass} onChange={(e) => setCmPass(e.target.value)} />
          <button onClick={addManager} className="border border-emerald-600 text-emerald-700 px-4 py-2 rounded-xl text-sm">Add co-manager</button>
        </section>

        <section className="bg-white rounded-2xl border p-5 space-y-2">
          <h2 className="font-bold">Business</h2>
          <p className="text-xs text-slate-500">The email below receives payment reports, issues and lease signatures. Every landlord/manager must fill this.</p>
          <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Landlord name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Notification email" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} />
          <button onClick={saveBusiness} disabled={saving} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm">
            {saving ? "Saving..." : "Save"}
          </button>
        </section>

        <section className="bg-white rounded-2xl border p-5 space-y-2">
          <h2 className="font-bold">How tenants pay you</h2>
          <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Bank name" value={bankName} onChange={(e) => setBankName(e.target.value)} />
          <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Bank account" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
          <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Airtel Money" value={airtel} onChange={(e) => setAirtel(e.target.value)} />
          <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Mpamba" value={mpamba} onChange={(e) => setMpamba(e.target.value)} />
          <textarea className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button onClick={savePay} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm">Save payment details</button>
        </section>

        <section className="bg-white rounded-2xl border p-5 space-y-2">
          <h2 className="font-bold">Change password</h2>
          <input type="password" className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="New password" value={pw1} onChange={(e) => setPw1(e.target.value)} />
          <input type="password" className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Confirm" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          <button onClick={changePassword} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm">Update password</button>
        </section>

        <section className="bg-white rounded-2xl border border-red-200 p-5 space-y-2">
          <h2 className="font-bold text-red-700">Delete account</h2>
          <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Type DELETE" value={deleteWord} onChange={(e) => setDeleteWord(e.target.value)} />
          <button
            disabled={deleteWord !== "DELETE"}
            onClick={async () => {
              if (!landlordId) return;
              await supabase.from("landlords").delete().eq("id", landlordId);
              await supabase.auth.signOut();
              router.push("/auth/login");
            }}
            className="bg-red-600 text-white px-4 py-2 rounded-xl text-sm disabled:opacity-40"
          >
            Delete my account
          </button>
        </section>
      </main>
    </div>
  );
}
