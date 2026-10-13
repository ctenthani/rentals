"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { invokeRentozi } from "@/lib/messaging";
import { useRouter } from "next/navigation";
import Link from "next/link";


export default function SettingsPage() {
  const router = useRouter();


  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [landlordId, setLandlordId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);

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

  const [cmName, setCmName] = useState("");
  const [cmEmail, setCmEmail] = useState("");

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/auth/login");
        return;
      }

      const { data: lid } = await supabase.rpc("my_landlord_id");
      if (!lid) {
        setError("No landlord profile on this login");
        setLoading(false);
        return;
      }
      setLandlordId(lid);
      const {data:platformOwner}=await supabase.rpc("rentozi_is_platform_owner");setIsPlatformOwner(!!platformOwner);

      const { data: own } = await supabase
        .from("landlords")
        .select("*")
        .eq("id", lid)
        .maybeSingle();

      const row = own || {
        id: lid,
        full_name: "Your business",
        business_name: "Your business",
        email: session.user.email,
      };

      setIsOwner(!!own?.auth_user_id && own.auth_user_id === session.user.id);
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
    if (!landlordId) {
      setError("No landlord profile on this login");
      return;
    }
    if (!notifyEmail.trim()) {
      setError("Notification email is required");
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
    setError(null);
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
    setError(null);try{await invokeRentozi("create-new-landlord",{full_name:newLlName,business_name:newLlBiz,email:newLlEmail});setMsg("Landlord invitation sent. The recipient accepts it and chooses their own password if new.");}catch(e){setError((e as Error).message);}
  };
  const addManager = async () => {
    setError(null);try{await invokeRentozi("create-manager",{landlord_id:landlordId,full_name:cmName,email:cmEmail});setMsg("Co-manager invitation sent. Existing accounts keep their password and accept the link to join.");}catch(e){setError((e as Error).message);}
  };

  const changePassword = async () => {
    if (pw1.length < 8) { setError("Choose at least eight characters."); return; }
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
          <Link href="/dashboard" className="text-sm text-slate-600">
            ← Dashboard
          </Link>
          <p className="font-bold">Settings</p>
          {isPlatformOwner&&<Link href="/owner" className="text-sm text-emerald-700">Site users</Link>}
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
        {msg && <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl">{msg}</p>}

        {isPlatformOwner && (
          <section className="bg-white rounded-2xl border p-5 space-y-2">
            <h2 className="font-bold">Create new landlord</h2>
            <p className="text-xs text-slate-500">Separate empty business. They get a login email.</p>
            <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Landlord name" value={newLlName} onChange={(e) => setNewLlName(e.target.value)} />
            <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Business name" value={newLlBiz} onChange={(e) => setNewLlBiz(e.target.value)} />
            <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Login email" value={newLlEmail} onChange={(e) => setNewLlEmail(e.target.value)} />
            <button onClick={createLandlord} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm">
              Create landlord
            </button>
          </section>
        )}

        <section className="bg-white rounded-2xl border p-5 space-y-2">
          <h2 className="font-bold">Co-managers</h2>
          {!isOwner && <p className="text-xs text-slate-500">Only the account owner can invite co-managers.</p>}
          <p className="text-xs text-slate-500">Same properties as this account. New users choose their own password from the invitation link.</p>
          <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Name" value={cmName} onChange={(e) => setCmName(e.target.value)} />
          <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Email" value={cmEmail} onChange={(e) => setCmEmail(e.target.value)} />
          <button disabled={!isOwner} onClick={addManager} className="border border-emerald-600 text-emerald-700 px-4 py-2 rounded-xl text-sm">
            Invite co-manager
          </button>
        </section>

        <section className="bg-white rounded-2xl border p-5 space-y-2">
          <h2 className="font-bold">Business</h2>
          <p className="text-xs text-slate-500">This email receives payment reports, issues and lease signatures.</p>
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
          <button onClick={savePay} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm">
            Save payment details
          </button>
        </section>

        <section className="bg-white rounded-2xl border p-5 space-y-2">
          <h2 className="font-bold">Change password</h2>
          <input type="password" className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="New password" value={pw1} onChange={(e) => setPw1(e.target.value)} />
          <input type="password" className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Confirm" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          <button onClick={changePassword} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm">
            Update password
          </button>
        </section>

        <section className="bg-white rounded-2xl border p-5 space-y-2">
          <h2 className="font-bold">Account closure</h2>
          <p className="text-sm text-slate-600">Archive properties from the dashboard to preserve receipts. Contact support for account closure and data export.</p>
        </section>
      </main>
    </div>
  );
}
