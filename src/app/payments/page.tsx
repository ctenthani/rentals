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

export default function PaymentsPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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

      const { data: tenantCheck } = await supabase
        .from("tenants")
        .select("id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (tenantCheck) {
        router.push("/tenant");
        return;
      }

      await loadPayments();
      setLoading(false);
    }

    init();
  }, [router]);

  async function loadPayments() {
    const { data } = await supabase
      .from("payments")
      .select(
        `
        id,
        amount,
        method,
        paid_date,
        months_covered,
        notes,
        created_at,
        tenants (
          full_name,
          houses (
            name
          )
        )
      `
      )
      .order("created_at", { ascending: false });

    setPayments(data || []);
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this payment record? This cannot be undone.")) return;

    setDeleting(id);
    setMessage(null);

    const { error } = await supabase.from("payments").delete().eq("id", id);

    if (error) {
      setMessage("Error: " + error.message);
    } else {
      setMessage("Payment deleted.");
      await loadPayments();
    }

    setDeleting(null);
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
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/dashboard" className="text-slate-600 text-sm">
            ← Dashboard
          </Link>
          <h1 className="font-semibold text-slate-800">Payment History</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {message && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm">
            {message}
          </div>
        )}

        {payments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">
            No payments recorded yet
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((p) => {
              const tenantName = p.tenants?.full_name || "Unknown";
              const houseName = Array.isArray(p.tenants?.houses)
                ? p.tenants.houses[0]?.name
                : p.tenants?.houses?.name;

              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div>
                    <p className="font-medium text-slate-800">{tenantName}</p>
                    <p className="text-sm text-slate-500">{houseName || "—"}</p>
                    <p className="text-lg font-semibold mt-1">
                      {formatMK(Number(p.amount))}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {p.method} • {p.paid_date}
                      {p.months_covered
                        ? ` • ${p.months_covered} month(s)`
                        : ""}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Link
                      href={`/receipt/${p.id}`}
                      className="text-sm text-green-700 border border-green-200 px-4 py-2 rounded-xl hover:bg-green-50"
                    >
                      Receipt
                    </Link>
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={deleting === p.id}
                      className="text-sm text-red-600 border border-red-200 px-4 py-2 rounded-xl hover:bg-red-50 disabled:opacity-50"
                    >
                      {deleting === p.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
