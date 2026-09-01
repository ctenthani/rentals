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
  const [landlordId, setLandlordId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [airtel, setAirtel] = useState("");
  const [mpamba, setMpamba] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [notes, setNotes] = useState("");

  const router = useRouter();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/auth/login");
        return;
      }

      const { data: ll } = await supabase
        .from("landlords")
        .select("*")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (!ll) {
        setError("No landlord profile");
        setLoading(false);
        return;
      }

      setLandlordId(ll.id);
      setFullName(ll.full_name || "");
      setBusinessName(ll.business_name || "");
      setEmail(ll.email || session.user.email || "");
      setAirtel(ll.airtel_number || "");
      setMpamba(ll.mpamba_number || "");
      setBankName(ll.bank_name || "");
      setBankAccount(ll.bank_account || "");
      setNotes(ll.payment_notes || "");
      setLoading(false);
    }
    load();
  }, [router]);

  const save = async (e: React.FormEvent) => {
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
        email,
        airtel_number: airtel || null,
        mpamba_number: mpamba || null,
        bank_name: bankName || null,
        bank_account: bankAccount || null,
        payment_notes: notes || null,
      })
      .eq("id", landlordId);

    setSaving(false);
    if (uErr) {
      setError(uErr.message);
      return;
    }
    setMsg("Settings saved. Tenants will see these pay-to numbers.");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-slate-600">
            ← Dashboard
          </Link>
          <p className="font-bold">Settings</p>
        </div>
      </header>

      <form
        onSubmit={save}
        className="max-w-lg mx-auto p-4 space-y-4"
      >
        {error && (
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>
        )}
        {msg && (
          <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl">{msg}</p>
        )}

        <div className="bg-white rounded-2xl border p-4 space-y-3">
          <h2 className="font-bold">Business</h2>
          <input
            className="w-full border rounded-xl px-3 py-2 text-sm"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <input
            className="w-full border rounded-xl px-3 py-2 text-sm"
            placeholder="Business / company name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
          <input
            className="w-full border rounded-xl px-3 py-2 text-sm"
            placeholder="Email for notifications"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="bg-white rounded-2xl border p-4 space-y-3">
          <h2 className="font-bold">How tenants should pay you</h2>
          <p className="text-xs text-slate-500">
            Leave blank any method you do not use. These appear on the tenant portal.
          </p>
          <input
            className="w-full border rounded-xl px-3 py-2 text-sm"
            placeholder="Bank name (e.g. National Bank)"
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
            placeholder="Extra notes (account name, reference format)"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-emerald-600 text-white py-3 rounded-xl font-semibold"
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
      </form>
    </div>
  );
}
