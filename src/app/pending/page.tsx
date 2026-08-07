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

type Submission = {
  id: string;
  amount: number;
  method: string;
  reference_used: string;
  paid_date: string;
  status: string;
  created_at: string;
  tenants: {
    full_name: string;
    houses: {
      name: string;
      code: string;
    };
  };
};

export default function PendingPaymentsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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

      await fetchSubmissions();
      setLoading(false);
    }

    load();
  }, [router]);

  async function fetchSubmissions() {
    const { data, error } = await supabase
      .from("payment_submissions")
      .select(
        `
        id,
        amount,
        method,
        reference_used,
        paid_date,
        status,
        created_at,
        tenants (
          full_name,
          houses (
            name,
            code
          )
        )
      `
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (!error) {
      setSubmissions(data || []);
    }
  }

  const handleConfirm = async (submission: Submission) => {
    setProcessing(submission.id);
    setMessage(null);

    const { error } = await supabase.rpc("confirm_payment_submission", {
      p_submission_id: submission.id,
      p_confirmed_amount: submission.amount,
      p_landlord_notes: "Confirmed via portal",
    });

    if (error) {
      setMessage("Error: " + error.message);
      setProcessing(null);
      return;
    }

    setMessage(
      `Payment of ${formatMK(submission.amount)} confirmed successfully.`
    );
    await fetchSubmissions();
    setProcessing(null);
  };

  const handleReject = async (id: string) => {
    setProcessing(id);

    const { error } = await supabase
      .from("payment_submissions")
      .update({ status: "rejected" })
      .eq("id", id);

    if (error) {
      setMessage("Error: " + error.message);
    } else {
      setMessage("Payment rejected.");
      await fetchSubmissions();
    }

    setProcessing(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-slate-600">
              ← Dashboard
            </Link>
            <h1 className="text-2xl font-bold">Pending Payments</h1>
          </div>
        </div>

        {message && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 text-green-700 text-sm">
            {message}
          </div>
        )}

        {submissions.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center text-slate-500">
            No pending payments
          </div>
        ) : (
          <div className="space-y-4">
            {submissions.map((sub) => {
              const tenantName = sub.tenants?.full_name || "Unknown";
              const houseName =
                (Array.isArray(sub.tenants?.houses)
                  ? sub.tenants.houses[0]?.name
                  : sub.tenants?.houses?.name) || "—";

              return (
                <div
                  key={sub.id}
                  className="bg-white rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div>
                    <p className="font-medium">{tenantName}</p>
                    <p className="text-sm text-slate-500">{houseName}</p>
                    <p className="text-lg font-bold mt-1">
                      {formatMK(Number(sub.amount))}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {sub.method} • {sub.paid_date} • Ref:{" "}
                      {sub.reference_used}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleConfirm(sub)}
                      disabled={processing === sub.id}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-medium px-4 py-2 rounded-lg"
                    >
                      {processing === sub.id ? "..." : "Confirm"}
                    </button>
                    <button
                      onClick={() => handleReject(sub.id)}
                      disabled={processing === sub.id}
                      className="border text-sm px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
