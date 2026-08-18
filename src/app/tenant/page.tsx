"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SUPABASE_URL = "https://favhmbrpisstrwgytapl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdmhtYnJwaXNzdHJ3Z3l0YXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTM5MzIsImV4cCI6MjEwMTY4OTkzMn0.6V2oE161lKWAATnZDxQiGFLfoRifoRrH7MSb0MHTJ3U";

function formatMK(n: number) {
  return new Intl.NumberFormat("en-MW", { style: "currency", currency: "MWK", minimumFractionDigits: 0 })
    .format(n).replace("MWK", "MK");
}

function getPaidMonths(nextDue: string | null, adv: number) {
  if (!nextDue) return "—";
  const d = new Date(nextDue + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  d.setMonth(d.getMonth() - 1);
  const count = Math.max(Number(adv) || 1, 1);
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
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("Bank Transfer");
  const [payRef, setPayRef] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payNotes, setPayNotes] = useState("");
  const [txnId, setTxnId] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [payMsg, setPayMsg] = useState<string | null>(null);
  const [payErr, setPayErr] = useState<string | null>(null);
  const [payBusy, setPayBusy] = useState(false);

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

      if (!tenant) { router.push("/dashboard"); return; }

      const house = Array.isArray(tenant.houses) ? tenant.houses[0] : tenant.houses;
      setTenantId(tenant.id);
      setName(tenant.full_name || "");
      setHouseName(house?.name || "");
      setHouseCode(house?.code || "");
      setRent(Number(house?.monthly_rent || 0));
      setBankAccount(house?.bank_account || "");
      setPayAmount(String(house?.monthly_rent || ""));
      setPayRef(`${house?.code || "H"}-${(tenant.full_name || "").replace(/\s+/g, "")}`);

      const three = ["Joe Lipanda", "Chison", "Emily", "Gift Mphande"];
      if (three.some((n) => (tenant.full_name || "").includes(n.split(" ")[0]))) setRequiredAdvance(3);

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

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !payAmount) return;
    setPayBusy(true); setPayErr(null); setPayMsg(null);

    let proofUrl: string | null = null;
    if (proofFile) {
      const path = `${tenantId}/${Date.now()}-${proofFile.name.replace(/\s+/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("payment-proofs").upload(path, proofFile);
      if (upErr) { setPayErr(upErr.message); setPayBusy(false); return; }
      const { data: pub } = supabase.storage.from("payment-proofs").getPublicUrl(path);
      proofUrl = pub.publicUrl;
    }

    const { error } = await supabase.from("payment_submissions").insert({
      tenant_id: tenantId,
      amount: Number(payAmount),
      method: payMethod,
      reference_used: payRef || null,
      paid_date: payDate,
      status: "pending",
      notes: payNotes || null,
      transaction_id: txnId || null,
      proof_url: proofUrl,
    });

    if (error) { setPayErr(error.message); setPayBusy(false); return; }
    setPayMsg("Payment reported with proof. Landlord will confirm.");
    setTxnId(""); setProofFile(null); setPayNotes("");
    setPayBusy(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><p className="text-slate-500">Loading...</p></div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Welcome</p>
            <p className="font-semibold">{name}</p>
          </div>
          <button onClick={handleLogout} className="text-sm text-slate-500">Logout</button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <div className="bg-white rounded-2xl border p-5 shadow-sm">
          <p className="font-semibold">{houseName}</p>
          <span className={`inline-block mt-2 text-[11px] font-bold px-2.5 py-1 rounded-full ${
            status === "paid" ? "bg-emerald-100 text-emerald-800" :
            status === "overdue" ? "bg-red-100 text-red-800" : "bg-sky-100 text-sky-800"
          }`}>{status.toUpperCase()}</span>
          <div className="mt-4 bg-slate-50 rounded-xl p-3">
            <p className="text-[11px] text-slate-500 uppercase font-semibold">Paid Months</p>
            <p className="text-sm mt-1">{getPaidMonths(nextDue, monthsAdv)}</p>
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

        <button type="button" onClick={() => setShowPay((v) => !v)}
          className="block w-full text-center bg-green-600 text-white font-semibold py-3 rounded-xl">
          {showPay ? "Hide payment form" : "Make Payment"}
        </button>

        {showPay && (
          <form onSubmit={submitPayment} className="bg-white rounded-2xl border p-5 shadow-sm space-y-3">
            <h2 className="font-semibold">Where to pay</h2>
            <div className="text-sm space-y-1">
              <p>National Bank: <strong>{bankAccount}</strong></p>
              <p>Airtel Money: <strong>0995684682</strong></p>
              <p>TNM Mpamba: <strong>0888381177</strong></p>
              <p>Reference: <strong className="text-emerald-700">{payRef}</strong></p>
            </div>
            {payErr && <p className="text-sm text-red-600">{payErr}</p>}
            {payMsg && <p className="text-sm text-emerald-700">{payMsg}</p>}
            <input type="number" required value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm" placeholder="Amount MK" />
            <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm">
              <option>Bank Transfer</option>
              <option>Airtel Money</option>
              <option>TNM Mpamba</option>
              <option>Cash</option>
            </select>
            <input value={payRef} onChange={(e) => setPayRef(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm" placeholder="Reference" />
            <input value={txnId} onChange={(e) => setTxnId(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm" placeholder="Transaction ID / SMS code" />
            <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            <div>
              <label className="text-xs font-semibold text-slate-500">Screenshot / receipt photo</label>
              <input type="file" accept="image/*" onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                className="mt-1 block w-full text-sm" />
            </div>
            <textarea value={payNotes} onChange={(e) => setPayNotes(e.target.value)} rows={2}
              className="w-full border rounded-xl px-3 py-2.5 text-sm" placeholder="Optional notes" />
            <button type="submit" disabled={payBusy}
              className="w-full bg-green-600 text-white font-semibold py-3 rounded-xl disabled:opacity-50">
              {payBusy ? "Submitting..." : "Submit payment report"}
            </button>
          </form>
        )}

        <div className="bg-white rounded-2xl border p-5 shadow-sm">
          <h2 className="font-semibold mb-3">Payment History</h2>
          {payments.length === 0 ? (
            <p className="text-sm text-slate-400">No payments yet</p>
          ) : (
            <div className="space-y-3">
              {payments.map((p) => (
                <div key={p.id} className="flex justify-between items-center text-sm">
                  <div>
                    <p className="font-semibold">{formatMK(Number(p.amount))}</p>
                    <p className="text-xs text-slate-400">{p.method} · {p.paid_date}</p>
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
