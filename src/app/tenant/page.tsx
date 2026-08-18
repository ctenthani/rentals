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
  }).format(amount).replace("MWK", "MK");
}

function getPaidMonths(nextDueDate: string | null, monthsInAdvance: number): string {
  if (!nextDueDate) return "—";
  const d = new Date(nextDueDate + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  d.setMonth(d.getMonth() - 1);
  const count = Math.max(Number(monthsInAdvance) || 1, 1);
  const months: string[] = [];
  for (let i = 0; i < count; i++) {
    months.unshift(d.toLocaleString("en", { month: "short", year: "numeric" }));
    d.setMonth(d.getMonth() - 1);
  }
  return months.join(", ");
}

export default function TenantPortalPage() {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [houseName, setHouseName] = useState("");
  const [houseCode, setHouseCode] = useState("");
  const [status, setStatus] = useState("upcoming");
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [rent, setRent] = useState(0);
  const [monthsAdv, setMonthsAdv] = useState(0);
  const [bankAccount, setBankAccount] = useState("");
  const [payments, setPayments] = useState<any[]>([]);
  const [requiredAdvance, setRequiredAdvance] = useState(2);

  const router = useRouter();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/auth/login"); return; }

      const { data: tenant } = await supabase
        .from("tenants")
        .select(`id, full_name, houses ( name, code, monthly_rent, bank_account )`)
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (!tenant) {
        router.push("/dashboard");
        return;
      }

      const house = Array.isArray(tenant.houses) ? tenant.houses[0] : tenant.houses;
      setName(tenant.full_name || "");
      setHouseName(house?.name || "");
      setHouseCode(house?.code || "");
      setRent(Number(house?.monthly_rent || 0));
      setBankAccount(house?.bank_account || "");

      const { data: bal } = await supabase
        .from("tenant_balances")
        .select("current_balance, next_due_date, months_in_advance, status")
        .eq("tenant_id", tenant.id)
        .maybeSingle();

      if (bal) {
        setBalance(Number(bal.current_balance || 0));
        setNextDue(bal.next_due_date);
        setMonthsAdv(Number(bal.months_in_advance || 0));
        setStatus(bal.status || "upcoming");
      }

      const threeMonthNames = ["Joe Lipanda", "Chison", "Emily", "Gift Mphande"];
      if (threeMonthNames.some((n) => (tenant.full_name || "").includes(n.split(" ")[0]))) {
        setRequiredAdvance(3);
      }

      const { data: pays } = await supabase
        .from("payments")
        .select("id, amount, method, paid_date")
        .eq("tenant_id", tenant.id)
        .order("paid_date", { ascending: false })
        .limit(20);

      setPayments(pays || []);
      setLoading(false);
    }
    load();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
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
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Welcome</p>
            <p className="font-semibold text-slate-900">{name}</p>
          </div>
          <button onClick={handleLogout} className="text-sm text-slate-500">Logout</button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <div className="bg-white rounded-2xl border p-5 shadow-sm">
          <p className="font-semibold text-slate-900">{houseName}</p>
          <span className={`inline-block mt-2 text-[11px] font-bold px-2.5 py-1 rounded-full ${
            status === "paid" ? "bg-emerald-100 text-emerald-800" :
            status === "overdue" ? "bg-red-100 text-red-800" : "bg-sky-100 text-sky-800"
          }`}>{status.toUpperCase()}</span>

          <div className="mt-4 bg-slate-50 rounded-xl p-3">
            <p className="text-[11px] text-slate-500 uppercase font-semibold">Paid Months</p>
            <p className="text-sm text-slate-800 mt-1">{getPaidMonths(nextDue, monthsAdv)}</p>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Next Due Date</span><span className="font-semibold">{nextDue || "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Outstanding Balance</span><span className="font-bold text-red-600">{formatMK(balance)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Monthly Rent</span><span className="font-medium">{formatMK(rent)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Advance Required</span><span className="font-medium">{monthsAdv} / {requiredAdvance} months</span></div>
          </div>
        </div>

        <Link href="/tenant/lease" className="block w-full text-center border-2 border-emerald-600 text-emerald-700 font-semibold py-3 rounded-xl bg-white">
          View / sign lease
        </Link>

        <Link href="/tenant/pay" className="block w-full text-center bg-green-600 text-white font-semibold py-3 rounded-xl">
          Make Payment
        </Link>

        <div className="bg-white rounded-2xl border p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900 mb-3">Payment Details</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Bank</span><span>National Bank of Malawi</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Account</span><span className="font-medium">{bankAccount || "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Reference</span><span className="font-medium">{houseCode}-{name.replace(/\s+/g, "")}</span></div>
          </div>
          <p className="text-xs text-slate-400 mt-3">Always use the exact reference so your payment can be matched quickly.</p>
        </div>

        <div className="bg-white rounded-2xl border p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900 mb-3">Payment History</h2>
          {payments.length === 0 ? (
            <p className="text-sm text-slate-400">No payments yet</p>
          ) : (
            <div className="space-y-3">
              {payments.map((p) => (
                <div key={p.id} className="flex justify-between items-center text-sm">
                  <div>
                    <p className="font-semibold">{formatMK(Number(p.amount))}</p>
                    <p className="text-xs text-slate-400">{p.method || "Payment"} · {p.paid_date}</p>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">CONFIRMED</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
