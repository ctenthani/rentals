"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SUPABASE_URL = "https://favhmbrpisstrwgytapl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdmhtYnJwaXNzdHJ3Z3l0YXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTM5MzIsImV4cCI6MjEwMTY4OTkzMn0.6V2oE161lKWAATnZDxQiGFLfoRifoRrH7MSb0MHTJ3U";

function formatMK(n: number) {
  return new Intl.NumberFormat("en-MW", {
    style: "currency",
    currency: "MWK",
    minimumFractionDigits: 0,
  })
    .format(n)
    .replace("MWK", "MK");
}

function computeStatus(nextDue: string | null, balance: number) {
  if (Number(balance) > 0) return "overdue";
  if (!nextDue) return "upcoming";
  const due = new Date(nextDue + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  due.setHours(12, 0, 0, 0);
  if (due > today) return "paid";
  if (due.getTime() === today.getTime()) return "due";
  return "overdue";
}

function getPaidMonths(nextDueDate: string | null, monthsInAdvance: number) {
  if (!nextDueDate) return "None yet";
  const d = new Date(nextDueDate + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "None yet";
  d.setMonth(d.getMonth() - 1);
  const count = Math.max(Number(monthsInAdvance) || 1, 1);
  const months: string[] = [];
  for (let i = 0; i < count; i++) {
    months.unshift(d.toLocaleString("en", { month: "short", year: "numeric" }));
    d.setMonth(d.getMonth() - 1);
  }
  return months.join(", ");
}

export default function TenantPage() {
  const [tab, setTab] = useState<"home" | "pay" | "issues">("home");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [house, setHouse] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [landlord, setLandlord] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [isAlsoLandlord, setIsAlsoLandlord] = useState(false);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Airtel Money");
  const [reference, setReference] = useState("");
  const [paidDate, setPaidDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [issue, setIssue] = useState("");

  const router = useRouter();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/auth/login"); return; }

    const { data: ownLl } = await supabase.from("landlords").select("id").eq("auth_user_id", session.user.id).maybeSingle();
    const { data: mem } = await supabase.from("landlord_members").select("id").eq("auth_user_id", session.user.id).maybeSingle();
    setIsAlsoLandlord(!!ownLl || !!mem);

    const { data: t } = await supabase
      .from("tenants")
      .select("*, houses(id, name, code, monthly_rent, bank_account)")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();
    if (!t) { setError("No tenant profile linked to this login"); setLoading(false); return; }
    setTenant(t);
    const h = Array.isArray(t.houses) ? t.houses[0] : t.houses;
    setHouse(h);

    const { data: b } = await supabase.from("tenant_balances").select("*").eq("tenant_id", t.id).maybeSingle();
    setBalance(b);

    if (t.landlord_id) {
      const { data: ll } = await supabase
        .from("landlords")
        .select("full_name, business_name, email, airtel_number, mpamba_number, bank_name, bank_account, payment_notes")
        .eq("id", t.landlord_id)
        .maybeSingle();
      setLandlord(ll);
    }

    const { data: pays } = await supabase
      .from("payments")
      .select("id, amount, paid_date, method, created_at")
      .eq("tenant_id", t.id)
      .order("created_at", { ascending: false });
    setPayments(pays || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [router]);

  const submitPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    setError(null); setMsg(null);
    let proof: string | null = null;
    if (file) {
      const path = `${tenant.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("payment-proofs").upload(path, file);
      if (upErr) { setError(upErr.message); return; }
      proof = path;
    }
    const { error: insErr } = await supabase.from("payment_submissions").insert({
      tenant_id: tenant.id,
      amount: Number(amount),
      method,
      reference_used: reference,
      paid_date: paidDate || new Date().toISOString().slice(0, 10),
      proof_path: proof,
      status: "pending",
    });
    if (insErr) { setError(insErr.message); return; }
    if (landlord?.email) {
      await supabase.functions.invoke("send-email", {
        body: {
          to: landlord.email,
          subject: `Payment to confirm: ${tenant.full_name}`,
          html: `<p>${tenant.full_name} reported MK ${Number(amount).toLocaleString()} via ${method}. Open Pending in Rentozi.</p>`,
        },
      });
    }
    setMsg("Submitted. Wait for your landlord to confirm.");
    setAmount(""); setReference(""); setFile(null);
  };

  const submitIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !issue.trim()) return;
    await supabase.from("tenant_issues").insert({ tenant_id: tenant.id, message: issue, status: "open" });
    if (landlord?.email) {
      await supabase.functions.invoke("send-email", {
        body: {
          to: landlord.email,
          subject: `Issue from ${tenant.full_name}`,
          html: `<p>${issue}</p>`,
        },
      });
    }
    setIssue("");
    setMsg("Issue sent to your landlord.");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>;

  const status = computeStatus(balance?.next_due_date || null, Number(balance?.current_balance || 0));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-sky-50">
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <p className="font-bold truncate">{landlord?.business_name || "My rent"}</p>
          <div className="flex gap-2 text-xs">
            {isAlsoLandlord && <Link href="/dashboard" className="text-emerald-700 font-semibold">Landlord</Link>}
            <Link href="/help" className="text-slate-600">Help</Link>
            <button onClick={async () => { await supabase.auth.signOut(); router.push("/auth/login"); }} className="text-slate-500">Logout</button>
          </div>
        </div>
        <div className="max-w-lg mx-auto px-4 flex gap-2 pb-2">
          {(["home", "pay", "issues"] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg text-sm capitalize ${tab === k ? "bg-emerald-100 text-emerald-900 font-semibold" : "text-slate-600"}`}>
              {k === "home" ? "Home" : k === "pay" ? "Pay" : "Issues"}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
        {msg && <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl">{msg}</p>}

        {tab === "home" && (
          <>
            <section className="bg-white rounded-2xl border p-5 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold">{tenant?.full_name}</p>
                  <p className="text-xs text-slate-500">{house?.code} · {house?.name}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  status === "paid" ? "bg-emerald-100 text-emerald-800" :
                  status === "overdue" ? "bg-red-100 text-red-800" :
                  status === "due" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
                }`}>{status.toUpperCase()}</span>
              </div>
              <p className="text-sm">Rent {formatMK(Number(house?.monthly_rent || 0))}</p>
              <p className="text-sm">Next due: <strong>{balance?.next_due_date || "Not set"}</strong></p>
              <p className="text-sm">Paid months: {getPaidMonths(balance?.next_due_date, Number(balance?.months_in_advance || 0))}</p>
              <Link href={`/lease?tenant_id=${tenant?.id}`} className="inline-block text-sm text-sky-700 font-semibold">View / sign lease</Link>
            </section>

            <section className="bg-white rounded-2xl border p-5 space-y-3">
              <h2 className="font-bold">Receipts</h2>
              {payments.length === 0 && <p className="text-sm text-slate-500">No confirmed receipts yet.</p>}
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between border rounded-xl px-3 py-2 text-sm">
                  <div>
                    <p className="font-semibold">{formatMK(Number(p.amount))}</p>
                    <p className="text-[11px] text-slate-500">{p.paid_date || p.created_at?.slice(0, 10)} · {p.method || ""}</p>
                  </div>
                  <Link
                    href={`/receipt?id=${p.id}`}
                    className="bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
                  >
                    Open / print
                  </Link>
                </div>
              ))}
            </section>
          </>
        )}

        {tab === "pay" && (
          <form onSubmit={submitPay} className="bg-white rounded-2xl border p-5 space-y-3">
            <h2 className="font-bold">Report a payment</h2>
            <div className="text-sm bg-slate-50 rounded-xl p-3 space-y-1">
              <p className="font-semibold">Pay to</p>
              {landlord?.bank_name && <p>Bank: {landlord.bank_name} {landlord.bank_account}</p>}
              {house?.bank_account && <p>Account: {house.bank_account}</p>}
              {landlord?.airtel_number && <p>Airtel: {landlord.airtel_number}</p>}
              {landlord?.mpamba_number && <p>Mpamba: {landlord.mpamba_number}</p>}
              {landlord?.payment_notes && <p className="text-xs text-slate-500">{landlord.payment_notes}</p>}
            </div>
            <input required type="number" className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <select className="w-full border rounded-xl px-3 py-2 text-sm" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option>Airtel Money</option>
              <option>Mpamba</option>
              <option>Bank</option>
              <option>Cash</option>
            </select>
            <input className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Transaction ID" value={reference} onChange={(e) => setReference(e.target.value)} />
            <input type="date" className="w-full border rounded-xl px-3 py-2 text-sm" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button className="w-full bg-emerald-600 text-white py-2.5 rounded-xl text-sm font-semibold">Submit for confirmation</button>
          </form>
        )}

        {tab === "issues" && (
          <form onSubmit={submitIssue} className="bg-white rounded-2xl border p-5 space-y-3">
            <h2 className="font-bold">Report an issue</h2>
            <textarea required rows={5} className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Describe the problem" value={issue} onChange={(e) => setIssue(e.target.value)} />
            <button className="w-full bg-slate-800 text-white py-2.5 rounded-xl text-sm font-semibold">Send to landlord</button>
          </form>
        )}
      </main>
    </div>
  );
}
