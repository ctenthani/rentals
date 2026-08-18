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

export default function TenantPayPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [houseCode, setHouseCode] = useState("");
  const [houseName, setHouseName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [rent, setRent] = useState(0);
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Bank Transfer");
  const [reference, setReference] = useState("");
  const [paidDate, setPaidDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
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

      const { data: tenant } = await supabase
        .from("tenants")
        .select(
          `id, full_name, houses ( name, code, monthly_rent, bank_account )`
        )
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (!tenant) {
        setError("No tenant profile linked to this login");
        setLoading(false);
        return;
      }

      const house = Array.isArray(tenant.houses)
        ? tenant.houses[0]
        : tenant.houses;

      setTenantId(tenant.id);
      setName(tenant.full_name || "");
      setHouseName(house?.name || "");
      setHouseCode(house?.code || "");
      setBankAccount(house?.bank_account || "1924966");
      setRent(Number(house?.monthly_rent || 0));
      setReference(
        `${house?.code || "H"}-${(tenant.full_name || "").replace(/\s+/g, "")}`
      );
      setAmount(String(house?.monthly_rent || ""));

      const { data: bal } = await supabase
        .from("tenant_balances")
        .select("current_balance, next_due_date")
        .eq("tenant_id", tenant.id)
        .maybeSingle();

      if (bal) {
        setBalance(Number(bal.current_balance || 0));
        setNextDue(bal.next_due_date);
      }

      setLoading(false);
    }
    load();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !amount) {
      setError("Amount is required");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    // Insert as pending submission for landlord to confirm
    const { error: insError } = await supabase.from("payment_submissions").insert({
      tenant_id: tenantId,
      amount: Number(amount),
      method,
      reference_used: reference || null,
      paid_date: paidDate,
      status: "pending",
      notes: notes || null,
    });

    setSubmitting(false);

    if (insError) {
      // Fallback if table name differs
      const { error: altError } = await supabase.from("payments").insert({
        tenant_id: tenantId,
        amount: Number(amount),
        method,
        paid_date: paidDate,
        notes: `REF: ${reference}. ${notes || ""} (tenant submitted – confirm)`,
      });

      if (altError) {
        setError(insError.message + " / " + altError.message);
        return;
      }
    }

    setSuccess(
      "Payment reported. Your landlord will confirm it. Keep your transfer receipt."
    );
    setNotes("");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/tenant" className="text-sm text-slate-600">
            ← Back
          </Link>
          <h1 className="font-bold text-slate-900">Make Payment</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <div className="bg-white rounded-2xl border p-5 shadow-sm">
          <p className="font-semibold text-slate-900">{houseName}</p>
          <p className="text-sm text-slate-500">{name}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-xs text-slate-500">Monthly rent</p>
              <p className="font-semibold">{formatMK(rent)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Next due</p>
              <p className="font-semibold">{nextDue || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Balance</p>
              <p className="font-bold text-red-600">{formatMK(balance)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-slate-900">Where to pay</h2>
          <div className="text-sm space-y-2">
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">National Bank</span>
              <span className="font-semibold text-right">{bankAccount}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">Airtel Money</span>
              <span className="font-semibold">0995684682</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">TNM Mpamba</span>
              <span className="font-semibold">0888381177</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">Reference</span>
              <span className="font-bold text-emerald-700 text-right break-all">
                {reference}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Use the exact reference so your payment can be matched quickly.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-800 text-sm">
            {success}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border p-5 shadow-sm space-y-3"
        >
          <h2 className="font-semibold text-slate-900">I have paid</h2>
          <p className="text-xs text-slate-500">
            After you transfer, submit the details below for the landlord to
            confirm.
          </p>

          <div>
            <label className="text-xs font-semibold text-slate-500">
              Amount (MK)
            </label>
            <input
              type="number"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500">
              Method
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm mt-1"
            >
              <option>Bank Transfer</option>
              <option>Airtel Money</option>
              <option>TNM Mpamba</option>
              <option>Cash</option>
              <option>Other</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500">
              Reference used
            </label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500">
              Date paid
            </label>
            <input
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Transaction ID, phone used, etc."
              className="w-full border rounded-xl px-3 py-2.5 text-sm mt-1"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-3 rounded-xl"
          >
            {submitting ? "Submitting..." : "Submit payment report"}
          </button>
        </form>
      </main>
    </div>
  );
}
