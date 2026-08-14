"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SUPABASE_URL = "https://favhmbrpisstrwgytapl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdmhtYnJwaXNzdHJ3Z3l0YXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTM5MzIsImV4cCI6MjEwMTY4OTkzMn0.6V2oE161lKWAATnZDxQiGFLfoRifoRrH7MSb0MHTJ3U";

export default function SettingsPage() {
  const [accountEmail, setAccountEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

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

      setAccountEmail(session.user.email || "");

      // Tenant? redirect
      const { data: tenantCheck } = await supabase
        .from("tenants")
        .select("id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (tenantCheck) {
        router.push("/tenant");
        return;
      }

      // Owner profile
      const { data: landlord } = await supabase
        .from("landlords")
        .select("id, full_name, business_name")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (landlord) {
        setIsOwner(true);
        setFullName(landlord.full_name || "");
        setBusinessName(landlord.business_name || "");

        const { data: mem } = await supabase
          .from("landlord_members")
          .select("id, email, role, auth_user_id")
          .eq("landlord_id", landlord.id);

        setMembers(mem || []);
      } else {
        // Co-manager: show the account they manage
        const { data: membership } = await supabase
          .from("landlord_members")
          .select("landlord_id, landlords(full_name, business_name)")
          .eq("auth_user_id", session.user.id)
          .maybeSingle();

        if (membership?.landlords) {
          const L = Array.isArray(membership.landlords)
            ? membership.landlords[0]
            : membership.landlords;
          setIsOwner(false);
          setFullName((L as any)?.full_name || "");
          setBusinessName((L as any)?.business_name || "");
        }
      }

      setLoading(false);
    }

    init();
  }, [router]);
{/* Plan */}
<div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
  <h2 className="font-semibold text-slate-900 mb-2">Subscription</h2>
  <p className="text-sm text-slate-700">
    Plan:{" "}
    <span className="font-semibold capitalize">{plan || "free"}</span>
  </p>
  <p className="text-xs text-slate-500 mt-1">
    {plan === "pro"
      ? "Pro — unlimited properties"
      : "Free — 1 tenant included. Upgrade to add more."}
  </p>
  {plan !== "pro" && (
    <p className="text-xs text-slate-500 mt-3">
      To upgrade, contact support or pay for Pro. Your account will be
      switched to Pro after payment.
    </p>
  )}
</div>
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) return;

    setSavingProfile(true);
    setProfileMsg(null);
    setProfileError(null);

    const { data, error } = await supabase.rpc("update_landlord_profile", {
      p_full_name: fullName,
      p_business_name: businessName,
    });

    if (error) setProfileError(error.message);
    else if (data?.success === false)
      setProfileError(data.error || "Update failed");
    else setProfileMsg("Profile saved");

    setSavingProfile(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setPasswordError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return;
    }

    setSavingPassword(true);
    setPasswordError(null);
    setPasswordMsg(null);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) setPasswordError(error.message);
    else {
      setPasswordMsg("Password updated");
      setPassword("");
      setConfirm("");
    }
    setSavingPassword(false);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) return;

    setInviting(true);
    setInviteMsg(null);

    const { data, error } = await supabase.rpc("invite_landlord_member", {
      p_email: inviteEmail.trim(),
    });

    if (error) setInviteMsg("Error: " + error.message);
    else if (data?.success === false)
      setInviteMsg("Error: " + (data.error || "Invite failed"));
    else {
      setInviteMsg("Member added. They can sign in and manage this account.");
      setInviteEmail("");

      // Refresh members
      const { data: landlord } = await supabase
        .from("landlords")
        .select("id")
        .eq("auth_user_id", (await supabase.auth.getUser()).data.user?.id || "")
        .maybeSingle();

      if (landlord) {
        const { data: mem } = await supabase
          .from("landlord_members")
          .select("id, email, role, auth_user_id")
          .eq("landlord_id", landlord.id);
        setMembers(mem || []);
      }
    }

    setInviting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-slate-600 text-sm">
              ← Dashboard
            </Link>
            <h1 className="font-semibold text-slate-900">Settings</h1>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Account */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Signed in as
          </p>
          <p className="font-medium text-slate-900 mt-1">{accountEmail}</p>
          <p className="text-xs text-slate-500 mt-1">
            {isOwner ? "Account owner" : "Co-manager"}
          </p>
        </div>

        {/* Profile */}
        <form
          onSubmit={handleSaveProfile}
          className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4"
        >
          <h2 className="font-semibold text-slate-900">Landlord profile</h2>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Full name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={!isOwner}
              required
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Business / company name
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              disabled={!isOwner}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm disabled:bg-slate-50"
            />
          </div>

          {profileError && (
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">
              {profileError}
            </p>
          )}
          {profileMsg && (
            <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl">
              {profileMsg}
            </p>
          )}

          {isOwner && (
            <button
              type="submit"
              disabled={savingProfile}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2.5 rounded-xl text-sm"
            >
              {savingProfile ? "Saving..." : "Save profile"}
            </button>
          )}
        </form>

        {/* Password */}
        <form
          onSubmit={handleChangePassword}
          className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4"
        >
          <h2 className="font-semibold text-slate-900">Change password</h2>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              New password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Confirm password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
            />
          </div>

          {passwordError && (
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">
              {passwordError}
            </p>
          )}
          {passwordMsg && (
            <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl">
              {passwordMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={savingPassword}
            className="w-full bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white font-medium py-2.5 rounded-xl text-sm"
          >
            {savingPassword ? "Updating..." : "Update password"}
          </button>
        </form>

        {/* Co-managers (owner only) */}
        {isOwner && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h2 className="font-semibold text-slate-900">Team access</h2>
            <p className="text-xs text-slate-500">
              Invite another user who has already signed up. They will see the
              same properties as you.
            </p>

            {members.length > 0 && (
              <ul className="space-y-2">
                {members.map((m) => (
                  <li
                    key={m.id}
                    className="flex justify-between items-center text-sm border border-slate-100 rounded-xl px-3 py-2"
                  >
                    <span className="text-slate-800">{m.email || m.auth_user_id}</span>
                    <span className="text-xs text-slate-500 capitalize">
                      {m.role}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={handleInvite} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Co-manager email
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  placeholder="colleague@gmail.com"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                />
              </div>

              {inviteMsg && (
                <p
                  className={`text-sm p-3 rounded-xl ${
                    inviteMsg.startsWith("Error")
                      ? "text-red-600 bg-red-50"
                      : "text-emerald-700 bg-emerald-50"
                  }`}
                >
                  {inviteMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={inviting}
                className="w-full border border-green-200 text-green-700 hover:bg-green-50 disabled:opacity-50 font-medium py-2.5 rounded-xl text-sm"
              >
                {inviting ? "Inviting..." : "Add co-manager"}
              </button>
            </form>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 pb-8">
          <Link href="/auth/forgot-password" className="text-green-700">
            Forgot password flow
          </Link>
          {" · "}
          <Link href="/dashboard" className="text-green-700">
            Back to dashboard
          </Link>
        </p>
      </main>
    </div>
  );
}
