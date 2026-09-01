"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SUPABASE_URL = "https://favhmbrpisstrwgytapl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdmhtYnJwaXNzdHJ3Z3l0YXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTM5MzIsImV4cCI6MjEwMTY4OTkzMn0.6V2oE161lKWAATnZDxQiGFLfoRifoRrH7MSb0MHTJ3U";

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
  const [accent, setAccent] = useState("#059669");

  const [members, setMembers] = useState<any[]>([]);
  const [newManagerEmail, setNewManagerEmail] = useState("");
  const [newManagerPassword, setNewManagerPassword] = useState("123456");

  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");

  const router = useRouter();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.push("/auth/login");
      return;
    }
    setUserEmail(session.user.email || "");

    const { data: ll } = await supabase
      .from("landlords")
      .select("*")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();

    let lid = ll?.id || null;
    if (!lid) {
      const { data: mem } = await supabase
        .from("landlord_members")
        .select("landlord_id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();
      if (mem) {
        const { data: owner } = await supabase
          .from("landlords")
          .select("*")
          .eq("id", mem.landlord_id)
          .maybeSingle();
        if (owner) {
          lid = owner.id;
          applyLandlord(owner);
        }
      }
    } else {
      applyLandlord(ll);
    }

    if (!lid) {
      setError("No landlord profile");
      setLoading(false);
      return;
    }
    setLandlordId(lid);

    const { data: mems } = await supabase
      .from("landlord_members")
      .select("id, email, role, auth_user_id")
      .eq("landlord_id", lid);
    setMembers(mems || []);
    setLoading(false);
  }

  function applyLandlord(ll: any) {
    setFullName(ll.full_name || "");
    setBusinessName(ll.business_name || "");
    setNotifyEmail(ll.email || "");
    setAirtel(ll.airtel_number || "");
    setMpamba(ll.mpamba_number || "");
    setBankName(ll.bank_name || "");
    setBankAccount(ll.bank_account || "");
    setNotes(ll.payment_notes || "");
    setAccent(ll.accent_color || "#059669");
  }

  useEffect(() => {
    load();
  }, [router]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!landlordId) return;
    setSaving(true);
    setError(null);
    setMsg(null);
    const { error: uErr } = await supabase
      .from("landlords")
      .update({
        full_name: fullName,
        business_name: businessName,
        email: notifyEmail,
        airtel_number: airtel || null,
        mpamba_number: mpamba || null,
        bank_name: bankName || null,
        bank_account: bankAccount || null,
        payment_notes: notes || null,
        accent_color: accent,
      })
      .eq("id", landlordId);
    setSaving(false);
    if (uErr) {
      setError(uErr.message);
      return;
    }
    setMsg("Settings saved");
  };

  const addManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!landlordId || !newManagerEmail.trim()) return;
    if (newManagerPassword.length < 6) {
      setError("Manager password must be at least 6 characters");
      return;
    }
    setSaving(true);
    setError(null);
    setMsg(null);

    const { data, error: fnErr } = await supabase.functions.invoke(
      "create-tenant-user",
      {
        body: {
          email: newManagerEmail.trim(),
          password: newManagerPassword,
          tenant_id: null,
          full_name: "Manager",
          as_manager: true,
          landlord_id: landlordId,
        },
      }
    );

    // Fallback: if function does not support managers, tell user to create Auth user then paste UID
    if (fnErr || data?.error) {
      setSaving(false);
      setError(
        "Could not auto-create manager. Create the user in Authentication, then run the SQL at the bottom of this page with their UID."
      );
      return;
    }

    const uid = data?.user_id;
    if (uid) {
      await supabase.from("landlord_members").insert({
        landlord_id: landlordId,
        auth_user_id: uid,
        email: newManagerEmail.trim(),
        role: "manager",
      });
    }

    setSaving(false);
    setMsg(
      `Manager added. They sign in with ${newManagerEmail} / ${newManagerPassword}`
    );
    setNewManagerEmail("");
    await load();
  };

  const removeManager = async (id: string) => {
    if (!confirm("Remove this manager?")) return;
    await supabase.from("landlord_members").delete().eq("id", id);
    await load();
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (newPass !== newPass2) {
      setError("Passwords do not match");
      return;
    }
    const { error: pErr } = await supabase.auth.updateUser({ password: newPass });
    if (pErr) {
      setError(pErr.message);
      return;
    }
    setNewPass("");
    setNewPass2("");
    setMsg("Password changed");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/40 to-sky-50">
      <header className="bg-white/90 border-b sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-slate-600">
            ← Dashboard
          </Link>
          <p className="font-bold">Settings</p>
          <p className="text-[11px] text-slate-400 truncate max-w-[140px]">
            {userEmail}
          </p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>
        )}
        {msg && (
          <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl">
            {msg}
          </p>
        )}

        <form
          onSubmit={saveProfile}
          className="bg-white rounded-2xl border shadow-sm p-5 space-y-4"
        >
          <h2 className="font-bold text-lg">Business profile</h2>
          <p className="text-xs text-slate-500">
            Shown on the dashboard header, receipts, and leases.
          </p>
          <label className="block text-xs font-semibold text-slate-500">
            Your name
            <input
              className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </label>
          <label className="block text-xs font-semibold text-slate-500">
            Business / company name
            <input
              className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
            />
          </label>
          <label className="block text-xs font-semibold text-slate-500">
            Notification email
            <input
              className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
              value={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.value)}
            />
          </label>
          <label className="block text-xs font-semibold text-slate-500">
            Accent colour
            <input
              type="color"
              className="mt-1 h-10 w-20 border rounded-lg"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold"
          >
            {saving ? "Saving..." : "Save profile"}
          </button>
        </form>

        <form
          onSubmit={saveProfile}
          className="bg-white rounded-2xl border shadow-sm p-5 space-y-3"
        >
          <h2 className="font-bold text-lg">How tenants pay you</h2>
          <p className="text-xs text-slate-500">
            Leave blank any method you do not use. Tenants only see what you fill in.
          </p>
          <input
            className="w-full border rounded-xl px-3 py-2 text-sm"
            placeholder="Bank name"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
          />
          <input
            className="w-full border rounded-xl px-3 py-2 text-sm"
            placeholder="Bank account number"
            value={bankAccount}
            onChange={(e) => setBankAccount(e.target.value)}
          />
          <input
            className="w-full border rounded-xl px-3 py-2 text-sm"
            placeholder="Airtel Money number"
            value={airtel}
            onChange={(e) => setAirtel(e.target.value)}
          />
          <input
            className="w-full border rounded-xl px-3 py-2 text-sm"
            placeholder="TNM Mpamba number"
            value={mpamba}
            onChange={(e) => setMpamba(e.target.value)}
          />
          <textarea
            className="w-full border rounded-xl px-3 py-2 text-sm"
            placeholder="Notes (account name, what reference to use)"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button
            type="submit"
            disabled={saving}
            className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold"
          >
            Save payment details
          </button>
        </form>

        <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-3">
          <h2 className="font-bold text-lg">Managers</h2>
          <p className="text-xs text-slate-500">
            Extra people who can open this same landlord dashboard (spouse,
            caretaker, agent). They use their own email and password.
          </p>

          {members.length === 0 ? (
            <p className="text-sm text-slate-400">No extra managers yet.</p>
          ) : (
            <ul className="space-y-2">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between text-sm border rounded-xl px-3 py-2"
                >
                  <span>
                    {m.email || m.auth_user_id}
                    <span className="ml-2 text-[10px] uppercase text-slate-400">
                      {m.role || "manager"}
                    </span>
                  </span>
                  <button
                    onClick={() => removeManager(m.id)}
                    className="text-red-600 text-xs"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={addManager} className="space-y-2 pt-2">
            <input
              type="email"
              required
              placeholder="Manager email"
              value={newManagerEmail}
              onChange={(e) => setNewManagerEmail(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <input
              placeholder="Temporary password (min 6)"
              value={newManagerPassword}
              onChange={(e) => setNewManagerPassword(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={saving}
              className="border border-emerald-300 text-emerald-800 px-4 py-2 rounded-xl text-sm font-semibold"
            >
              Add manager
            </button>
          </form>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Manual fallback: Authentication → Add user → copy UID, then in SQL:
            <br />
            <code>
              INSERT INTO landlord_members (landlord_id, auth_user_id, email,
              role) VALUES (&apos;{landlordId}&apos;,
              &apos;PASTE-UID&apos;, &apos;email@example.com&apos;,
              &apos;manager&apos;);
            </code>
          </p>
        </div>

        <form
          onSubmit={changePassword}
          className="bg-white rounded-2xl border shadow-sm p-5 space-y-3"
        >
          <h2 className="font-bold text-lg">Change your password</h2>
          <input
            type="password"
            placeholder="New password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={newPass2}
            onChange={(e) => setNewPass2(e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-semibold"
          >
            Update password
          </button>
        </form>
      </div>
    </div>
  );
}
