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
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
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

      let { data: landlord } = await supabase
        .from("landlords")
        .select("id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (!landlord) {
        const { data: membership } = await supabase
          .from("landlord_members")
          .select("landlord_id")
          .eq("auth_user_id", session.user.id)
          .maybeSingle();
        if (membership?.landlord_id) {
          landlord = { id: membership.landlord_id };
        }
      }

      if (!landlord) {
        setError("No landlord profile");
        setLoading(false);
        return;
      }

      const { data: tenants } = await supabase
        .from("tenants")
        .select("id")
        .eq("landlord_id", landlord.id);

      const tenantIds = (tenants || []).map((t) => t.id);
      if (tenantIds.length === 0) {
        setPayments([]);
        setLoading(false);
        return;
      }

      const { data, error: payError } = await supabase
        .from("payments")
        .select(
          `
          id,
          amount,
          method,
          paid_date,
          months_covered,
          notes,
          tenant_id,
          tenants (
            full_name,
            houses ( name, code )
          )
        `
        )
        .in("tenant_id", tenantIds)
        .order("paid_date", { ascending: false });

      if (payError) setError(payError.message);
      else setPayments(data || []);
      setLoading(false);
    }

    init();
  }, [router]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this payment record?")) return;
    setDeleting(id);
    const { error: delError } = await supabase
      .from("payments")
      .delete()
      .eq("id", id);
    setDeleting(null);
    if (delError) {
      setError(delError.message);
      return;
    }
    setPayments((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-sky-50">
      <header className="bg-white/90 border-b border-emerald-100 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-slate-600">
            ← Dashboard
          </Link>
          <h1 className="font-bold text-slate-900">Payment history</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center p-16">
            <div className="w-7 h-7 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : payments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 text-sm">
            No payments recorded yet.
            <div className="mt-3">
              <Link
                href="/record-payment"
                className="text-emerald-700 font-semibold"
              >
                Record a payment →
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((p) => {
              const tenant = Array.isArray(p.tenants)
                ? p.tenants[0]
                : p.tenants;
              const house = tenant?.houses
                ? Array.isArray(tenant.houses)
                  ? tenant.houses[0]
                  : tenant.houses
                : null;

              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      {tenant?.full_name || "Tenant"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {house?.name || "—"}
                      {house?.code ? ` (${house.code})` : ""} · {p.paid_date}
                      {p.method ? ` · ${p.method}` : ""}
                    </p>
                    {p.months_covered ? (
                      <p className="text-xs text-teal-700 mt-0.5">
                        {p.months_covered} month(s) covered
                      </p>
                    ) : null}
                    {p.notes ? (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                        {p.notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <p className="font-bold text-emerald-700 text-lg">
                      {formatMK(Number(p.amount))}
                    </p>
                    <Link
                      href={`/receipt?id=${p.id}`}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-xl"
                    >
                      Receipt
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      disabled={deleting === p.id}
                      className="text-xs text-rose-600 font-medium px-2"
                    >
                      {deleting === p.id ? "..." : "Delete"}
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
