"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SUPABASE_URL = "https://favhmbrpisstrwgytapl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdmhtYnJwaXNzdHJ3Z3l0YXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTM5MzIsImV4cCI6MjEwMTY4OTkzMn0.6V2oE161lKWAATnZDxQiGFLfoRifoRrH7MSb0MHTJ3U";

export default function MakePaymentPage() {
  const [tenant, setTenant] = useState<any>(null);
  const [house, setHouse] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Bank Transfer");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  useEffect(() => {
    async function loadData() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/auth/login");
        return;
      }

      const { data: tenantData, error: tenantError } = await supabase
        .from("tenants")
        .select("id, full_name, house_id")
        .eq("auth_user_id", session.user.id)
        .single();

      if (tenantError || !tenantData) {
        setError("Account not linked to a tenant.");
        setLoading(false);
        return;
      }

      setTenant(tenantData);

      const { data: houseData } = await supabase
        .from("houses")
        .select("code, name, bank_account")
        .eq("id", tenantData.house_id)
        .single();

      setHouse(houseData);
      setLoading(false);
    }

    loadData();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);

    const reference = `${house?.code}-${tenant?.full_name?.replace(/\s+/g, "")}`;

    const { error } = await supabase.from("payment_submissions").insert({
      tenant_id: tenant.id,
      amount: Number(amount),
      method,
      reference_used: reference,
      paid_date: new Date().toISOString().split("T")[0],
      status: "pending",
    });

    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }

    setMessage(
      "Payment submitted successfully! Waiting for landlord confirmation."
    );
    setAmount("");
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  if (error && !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/tenant" className="text-slate-600">
            ← Back
          </Link>
          <h1 className="text-xl font-bold">Make Payment</h1>
        </div>

        {/* Bank details */}
        <div className="bg-white rounded-xl border p-5 text-sm space-y-2">
          <h3 className="font-medium mb-2">Bank Details</h3>
          <p>
            <span className="text-slate-500">Bank:</span> National Bank of
            Malawi
          </p>
          <p>
            <span className="text-slate-500">Account:</span>{" "}
            <strong>{house?.bank_account}</strong>
          </p>
          <p>
            <span className="text-slate-500">Reference:</span>{" "}
            <strong>
              {house?.code}-{tenant?.full_name?.replace(/\s+/g, "")}
            </strong>
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Please use the exact reference so we can match your payment quickly.
          </p>
        </div>

        {/* Payment form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border p-5 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium mb-1">
              Amount Paid (MK)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              min="1"
              className="w-full border rounded-lg px-3 py-2"
              placeholder="e.g. 180000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Payment Method
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option>Bank Transfer</option>
              <option>Airtel Money</option>
              <option>TNM Mpamba</option>
              <option>Cash</option>
            </select>
          </div>

          {message && (
            <p className="text-sm p-3 rounded bg-green-50 text-green-700">
              {message}
            </p>
          )}

          {error && (
            <p className="text-sm p-3 rounded bg-red-50 text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-3 rounded-lg"
          >
            {submitting ? "Submitting..." : "I have paid – Submit"}
          </button>
        </form>
      </div>
    </main>
  );
}
