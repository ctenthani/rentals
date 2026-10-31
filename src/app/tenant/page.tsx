"use client";

import { useEffect, useRef, useState } from "react";
import { currentBalance } from "@/lib/accounting";
import { validateDocument } from "@/lib/documents";
import { supabase } from "@/lib/supabase";
import { paymentRequest, savePaymentReport, clearPaymentRequest, type PaymentRequest } from "@/lib/payment-actions";
import { notifyRentozi } from "@/lib/messaging";
import { useRouter } from "next/navigation";
import Link from "next/link";
import IssueInbox from "@/components/IssueInbox";


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

function cycleMonths(nextDue: string | null, monthsInAdvance: number) {
  if (!nextDue) return [] as string[];
  const count = Math.max(Number(monthsInAdvance) || 0, 0);
  if (!count) return [];
  const d = new Date(nextDue + "T12:00:00");
  if (Number.isNaN(d.getTime())) return [];
  d.setMonth(d.getMonth() - 1);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.unshift(d.toLocaleString("en", { month: "short", year: "numeric" }));
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

function MonthPills({ months }: { months: string[] }) {
  if (!months.length) return <span className="text-slate-400 text-xs">No months in this cycle</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {months.map((m) => (
        <span key={m} className="bg-emerald-50 text-emerald-800 text-[11px] font-semibold px-2 py-0.5 rounded-md">
          {m}
        </span>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "upcoming").toLowerCase();
  const cls =
    s === "paid"
      ? "bg-emerald-100 text-emerald-800"
      : s === "overdue"
      ? "bg-red-100 text-red-800"
      : s === "due"
      ? "bg-amber-100 text-amber-800"
      : "bg-slate-100 text-slate-700";
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{s.toUpperCase()}</span>;
}

async function notifyOwner(
  supabase: any,
  tenantId: string,
  fallbackEmail: string | null | undefined,
  subject: string,
  html: string,
  requestId?: string
) {
  const { data: rpcEmail, error: recipientError } = await supabase.rpc("landlord_notify_email", { p_tenant_id: tenantId });
  if (recipientError) return { ok: false, error: "Could not verify your landlord’s notification address. Contact your landlord." };
  const to = String(rpcEmail || "").trim();
  if (!to) return { ok: false, error: "Landlord has no email in Settings" };
  return notifyRentozi({to,subject,html,request_id:requestId});
}

export default function TenantPage() {
  const router = useRouter();


  const [tab, setTab] = useState<"home" | "pay" | "issues">("home");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [units, setUnits] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [landlord, setLandlord] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [isAlsoLandlord, setIsAlsoLandlord] = useState(false);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Airtel Money");
  const [reference, setReference] = useState("");
  const [paidDate, setPaidDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const paymentLock = useRef(false);
  const paymentId = useRef<PaymentRequest | null>(null);
  const [paymentPhase, setPaymentPhase] = useState("");
  const [paymentSaved, setPaymentSaved] = useState(false);
  useEffect(() => { paymentId.current = null; setPaymentSaved(false); setPaymentPhase(""); }, [selectedId]);

  const [issue, setIssue] = useState("");
  const [issueRefresh,setIssueRefresh]=useState(0);
  const issueLock=useRef(false);
  const [issueBusy,setIssueBusy]=useState(false);

  const selected = units.find((u) => u.id === selectedId) || units[0];

  async function loadPayments(tenantId: string) {
    const { data } = await supabase
      .from("payments")
      .select("id, amount, paid_date, method, created_at")
      .is("voided_at", null)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    setPayments(data || []);
  }

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/auth/login");
        return;
      }

      const { data: ownLl } = await supabase
        .from("landlords")
        .select("id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();
      const { data: mem } = await supabase
        .from("landlord_members")
        .select("id")
        .eq("auth_user_id", session.user.id)
        .eq("role", "manager")
        .eq("access_disabled", false)
        .limit(1);
      setIsAlsoLandlord(!!ownLl || !!(mem && mem.length));

      const { data: list } = await supabase
        .from("tenants")
        .select(
          "id, full_name, phone, email, auth_user_id, landlord_id, house_id, houses(id, name, code, monthly_rent, bank_account)"
        )
        .eq("auth_user_id", session.user.id);

      const mapped = await Promise.all(
        (list || []).map(async (t: any) => {
          const house = Array.isArray(t.houses) ? t.houses[0] : t.houses;
          const { data: bal } = await supabase
            .from("tenant_balances")
            .select("*")
            .eq("tenant_id", t.id)
            .maybeSingle();
          return { ...t, house, balance: bal };
        })
      );
      setUnits(mapped);
      const first = mapped[0]?.id || "";
      setSelectedId(first);

      if (mapped[0]?.landlord_id) {
        const { data: ll } = await supabase
          .from("landlords")
          .select("full_name, business_name, email, airtel_number, mpamba_number, bank_name, bank_account")
          .eq("id", mapped[0].landlord_id)
          .maybeSingle();
        setLandlord(ll);
      }
      if (first) await loadPayments(first);
      setLoading(false);
    })();
  }, [router]);

  useEffect(() => {
    if (selectedId) loadPayments(selectedId);
  }, [selectedId]);

  const submitPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const paymentAmount = Number(amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      setError("Enter a valid amount greater than zero");
      return;
    }

    if (paymentLock.current || paymentSaved) return;
    if (file) { try { validateDocument(file); } catch (e: any) { setError(e.message); return; } }
    paymentLock.current = true;
    setError(null); setMsg(null); setPaymentPhase(file ? "Uploading proof…" : "Submitting payment…");
    let saved = false;
    try {
      const report = { tenant_id: selected.id, amount: paymentAmount, method, reference_used: reference, paid_date: paidDate || new Date().toISOString().slice(0, 10), status: "pending" };
      paymentId.current = await paymentRequest(selected.id, { ...report, file: file ? [file.name, file.size, file.lastModified] : null }, paymentId.current);
      let proof: string | null = null;
      if (file) {
        const path = `${selected.id}/${paymentId.current.id}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("payment-proofs").upload(path, file);
        if (upErr && String(upErr.statusCode) !== "409") throw Error(upErr.message);
        proof = path;
      }
      setPaymentPhase("Submitting payment…");
      await savePaymentReport(supabase, { ...report, proof_path: proof }, paymentId.current.id);
      saved = true; setPaymentSaved(true);
      setMsg("Payment submitted for confirmation. Do not submit it again.");
      setPaymentPhase("Payment submitted · notifying landlord…");
      const mail = await notifyOwner(supabase, selected.id, landlord?.email,
        `Payment to confirm — ${selected.full_name} (${selected.house?.code})`,
        `<p>${selected.full_name} reported <strong>${formatMK(paymentAmount)}</strong> via ${method} for <strong>${selected.house?.code} — ${selected.house?.name}</strong>.</p><p>Reference: ${reference || "—"}</p><p><a href="https://rentozi.netlify.app/pending">Open Pending</a></p>`,
        "payment-report-" + paymentId.current.id);
      setMsg(mail.ok ? "Payment submitted. Your landlord has been notified." : "Payment submitted for confirmation. Email delivery could not be confirmed; contact your landlord. Do not submit again.");
      setAmount(""); setReference(""); setFile(null);
    } catch (e: any) {
      if (saved) setMsg("Payment submitted for confirmation. Email delivery could not be confirmed; do not submit again.");
      else setError("Could not confirm submission. Retry the same details safely. " + e.message);
    } finally { paymentLock.current = false; setPaymentPhase(""); }
  };

  const submitIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !issue.trim() || issueLock.current) return;
    issueLock.current=true;setIssueBusy(true);
    try {
    setError(null);
    const { error: iErr } = await supabase.from("tenant_issues").insert({
      tenant_id: selected.id,
      message: issue,
      status: "open",
    });
    if (iErr) {
      setError(iErr.message);
      return;
    }
    setIssueRefresh(n=>n+1);setIssue("");setMsg("Issue saved. You can track replies below.");
    const mail = await notifyOwner(
      supabase,
      selected.id,
      landlord?.email,
      `Issue from ${selected.full_name} (${selected.house?.code})`,
      `<p><strong>${selected.house?.code} — ${selected.house?.name}</strong></p>
       <p>${issue}</p>
       <p>${selected.full_name} ${selected.phone || ""}</p>`
    );
    setIssue("");
    setMsg(mail.ok ? "Issue saved and landlord notified. Track replies below." : "Issue saved in the app. Email notification could not be confirmed.");
    } catch(e){setError((e as Error).message);}finally{issueLock.current=false;setIssueBusy(false);}
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>;
  }
  if (!selected) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        No properties linked to this login.
      </div>
    );
  }

  const status = computeStatus(selected.balance?.next_due_date || null, currentBalance(selected.balance, Number(selected.house?.monthly_rent || 0)));
  const months = cycleMonths(selected.balance?.next_due_date, Number(selected.balance?.months_in_advance || 0));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-sky-50">
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <p className="font-bold truncate">{landlord?.business_name || "My rent"}</p>
          <div className="flex gap-2 text-xs">
            {isAlsoLandlord && (
              <Link href="/dashboard" className="text-emerald-700 font-semibold">
                Landlord
              </Link>
            )}
            <Link href="/help" className="text-slate-600">
              Help
            </Link>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                router.push("/auth/login");
              }}
              className="text-slate-500"
            >
              Logout
            </button>
          </div>
        </div>
        <div className="max-w-lg mx-auto px-4 pb-3 space-y-2">
          {units.length > 1 && (
            <select
              className="w-full border rounded-xl px-3 py-2 text-sm bg-white"
              disabled={!!paymentPhase}
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.house?.code} — {u.house?.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            {(["home", "pay", "issues"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-3 py-1.5 rounded-lg text-sm capitalize ${
                  tab === k ? "bg-emerald-100 text-emerald-900 font-semibold" : "text-slate-600"
                }`}
              >
                {k === "home" ? "Home" : k === "pay" ? "Pay" : "Issues"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
        {msg && <p className="text-sm text-emerald-800 bg-emerald-50 p-3 rounded-xl">{msg}</p>}

        {tab === "home" && (
          <>
            <section className="bg-white rounded-2xl border p-5 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold">{selected.full_name}</p>
                  <p className="text-xs text-slate-500">
                    {selected.house?.code} · {selected.house?.name}
                  </p>
                </div>
                <StatusBadge status={status} />
              </div>
              <p className="text-sm">Rent {formatMK(Number(selected.house?.monthly_rent || 0))}</p>
              <p className="text-sm">Outstanding {formatMK(currentBalance(selected.balance, Number(selected.house?.monthly_rent || 0)))} · Part-month credit {formatMK(Number(selected.balance?.partial_credit || 0))}</p>
              <p className="text-sm">
                Next due <strong>{selected.balance?.next_due_date || "Not set"}</strong>
              </p>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">This cycle</p>
                <MonthPills months={months} />
              </div>
              <Link href={`/lease?tenant_id=${selected.id}`} className="inline-block text-sm text-sky-700 font-semibold">
                View / sign lease
              </Link>
            </section>

            <section className="bg-white rounded-2xl border p-5 space-y-3">
              <h2 className="font-bold">Receipts</h2>
              {payments.length === 0 && <p className="text-sm text-slate-500">No confirmed receipts yet.</p>}
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between border rounded-xl px-3 py-2 text-sm">
                  <div>
                    <p className="font-semibold">{formatMK(Number(p.amount))}</p>
                    <p className="text-[11px] text-slate-500">
                      {p.paid_date || p.created_at?.slice(0, 10)} · {p.method || ""}
                    </p>
                  </div>
                  <Link href={`/receipt?id=${p.id}`} className="bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
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
            <fieldset disabled={!!paymentPhase || paymentSaved} className="space-y-3">
            <div className="text-sm bg-slate-50 rounded-xl p-3 space-y-1">
              <p className="font-semibold">Pay to</p>
              {selected.house?.bank_account && <p>Account: {selected.house.bank_account}</p>}
              {landlord?.airtel_number && <p>Airtel: {landlord.airtel_number}</p>}
              {landlord?.mpamba_number && <p>Mpamba: {landlord.mpamba_number}</p>}
            </div>
            <input
              required
              type="number"
              className="w-full border rounded-xl px-3 py-2 text-sm"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <select className="w-full border rounded-xl px-3 py-2 text-sm" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option>Airtel Money</option>
              <option>Mpamba</option>
              <option>Bank</option>
              <option>Cash</option>
            </select>
            <input
              className="w-full border rounded-xl px-3 py-2 text-sm"
              placeholder="Transaction ID"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <input type="date" className="w-full border rounded-xl px-3 py-2 text-sm" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            <input key={String(paymentSaved)} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button disabled={!!paymentPhase || paymentSaved} aria-busy={!!paymentPhase} className="w-full bg-emerald-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold">{paymentPhase || (paymentSaved ? "Payment submitted" : "Submit for confirmation")}</button>
            </fieldset>
            <p role="status" aria-live="polite" className="text-sm">{paymentPhase || (paymentSaved ? msg : "")}</p>
            {paymentSaved && !paymentPhase && <button type="button" className="text-emerald-700 underline text-sm" onClick={() => { clearPaymentRequest(selected.id); paymentId.current = null; setPaymentSaved(false); setMsg(null); setAmount(""); setReference(""); setFile(null); }}>Report another payment</button>}
          </form>
        )}

        {tab === "issues" && (
          <div className="space-y-4"><IssueInbox tenantId={selected.id} refreshKey={issueRefresh}/><form onSubmit={submitIssue} className="bg-white rounded-2xl border p-5 space-y-3">
            <h2 className="font-bold">Report an issue</h2>
            <textarea
              required
              rows={5}
              className="w-full border rounded-xl px-3 py-2 text-sm"
              placeholder="Describe the problem"
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
            />
            <button disabled={issueBusy} className="w-full bg-slate-800 text-white py-2.5 rounded-xl text-sm font-semibold">{issueBusy?"Saving issue…":"Send to landlord"}</button>
          </form></div>
        )}
      </main>
    </div>
  );
}
