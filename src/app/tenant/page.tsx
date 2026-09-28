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

async function notifyOwner(supabase: any, tenantId: string, fallbackEmail: string | null | undefined, subject: string, html: string) {
  const { data: rpcEmail } = await supabase.rpc("landlord_notify_email", { p_tenant_id: tenantId });
  const to = (rpcEmail || fallbackEmail || "").trim();
  if (!to) return { ok: false, error: "Landlord has no email in Settings" };
  const { data, error } = await supabase.functions.invoke("send-email", {
    body: { to, subject, html },
  });
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: String(data.error) };
  return { ok: true };
}

export default function TenantPage() {
  const router = useRouter();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  const [issue, setIssue] = useState("");

  const selected = units.find((u) => u.id === selectedId) || units[0];

  async function loadPayments(tenantId: string) {
    const { data } = await supabase
      .from("payments")
      .select("id, amount, paid_date, method, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    setPayments(data || []);
  }

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/auth/login");
        return;
      }
      const { data: ownLl } = await supabase.from("landlords").select("id").eq("auth_user_id", session.user.id).maybeSingle();
      const { data: mem } = await supabase.from("landlord_members").select("id").eq("auth_user_id", session.user.id).limit(1);
      setIsAlsoLandlord(!!ownLl || !!(mem && mem.length));

      const { data: list } = await supabase
        .from("tenants")
        .select("id, full_name, phone, email, auth_user_id, landlord_id, house_id, houses(id, name, code, monthly_rent, bank_account)")
        .eq("auth_user_id", session.user.id);

      const mapped = await Promise.all(
        (list || []).map(async (t: any) => {
          const house = Array.isArray(t.houses) ? t.houses[0] : t.houses;
          const { data: bal } = await supabase.from("tenant_balances").select("*").eq("tenant_id", t.id).maybeSingle();
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
    setError(null);
    setMsg(null);
    let proof: string | null = null;
    if (file) {
      const path = `${selected.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("payment-proofs").upload(path, file);
      if (upErr) {
        setError(upErr.message);
        return;
      }
      proof = path;
    }
    const { error: insErr } = await supabase.from("payment_submissions").insert({
      tenant_id: selected.id,
      amount: Number(amount),
      method,
      reference_used: reference,
      paid_date: paidDate || new Date().toISOString().slice(0, 10),
      proof_path: proof,
      status: "pending",
    });
    if (insErr) {
      setError(insErr.message);
      return;
    }
    const mail = await notifyOwner(supabase, selected.id, landlord?.email, subject, html)
      `Payment to confirm — ${selected.full_name} (${selected.house?.code})`,
      `<p>${selected.full_name} reported <strong>${formatMK(Number(amount))}</strong> via ${method}
       for <strong>${selected.house?.code} — ${selected.house?.name}</strong>.</p>
       <p>Reference: ${reference || "—"}</p>
       <p><a href="https://rentozi.netlify.app/pending">Open Pending</a></p>`
    );
    setMsg(mail.ok ? "Submitted. Your landlord was emailed." : `Submitted, but email failed: ${mail.error}`);
    setAmount("");
    setReference("");
    setFile(null);
  };

  const submitIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !issue.trim()) return;
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
    const mail = await notifyOwner(
      supabase,
      landlord?.email,
      `Issue from ${selected.full_name} (${selected.house?.code})`,
      `<p><strong>${selected.house?.code} — ${selected.house?.name}</strong></p><p>${issue}</p><p>${selected.full_name} ${selected.phone || ""}</p>`
    );
    setIssue("");
    setMsg(mail.ok ? "Issue sent. Your landlord was emailed." : `Saved, but email failed: ${mail.error}`);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>;
  if (!selected) return <div className="min-h-screen flex items-center justify-center text-slate-500">No properties linked to this login.</div>;

  const status = computeStatus(selected.balance?.next_due_date || null, Number(selected.balance?.current_balance || 0));
  const months = cycleMonths(selected.balance?.next_due_date, Number(selected.balance?.months_in_advance || 0));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-sky-50">
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <p className="font-bold truncate">{landlord?.business_name || "My rent"}</p>
          <div className="flex gap-2 text-xs">
            {isAlsoLandlord && <Link href="/dashboard" className="text-emerald-700 font-semibold">Landlord</Link>}
            <Link href="/help" className="text-slate-600">Help</Link>
            <button onClick={async () => { await supabase.auth.signOut(); router.push("/auth/login"); }} className="text-slate-500">Logout</button>
          </div>
        </div>
        <div className="max-w-lg mx-auto px-4 pb-3 space-y-2">
          {units.length > 1 && (
            <select className="w-full border rounded-xl px-3 py-2 text-sm bg-white" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.house?.code} — {u.house?.name}</option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            {(["home", "pay", "issues"] as const).map((k) => (
              <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg text-sm capitalize ${tab === k ? "bg-emerald-100 text-emerald-900 font-semibold" : "text-slate-600"}`}>
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
                  <p className="text-xs text-slate-500">{selected.house?.code} · {selected.house?.name}</p>
                </div>
                <StatusBadge status={status} />
              </div>
              <p className="text-sm">Rent {formatMK(Number(selected.house?.monthly_rent || 0))}</p>
              <p className="text-sm">Next due <strong>{selected.balance?.next_due_date || "Not set"}</strong></p>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">This cycle</p>
                <MonthPills months={months} />
              </div>
              <Link href={`/lease?tenant_id=${selected.id}`} className="inline-block text-sm text-sky-700 font-semibold">View / sign lease</Link>
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
                  <Link href={`/receipt?id=${p.id}`} className="bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">Open / print</Link>
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
              {selected.house?.bank_account && <p>Account: {selected.house.bank_account}</p>}
              {landlord?.airtel_number && <p>Airtel: {landlord.airtel_number}</p>}
              {landlord?.mpamba_number && <p>Mpamba: {landlord.mpamba_number}</p>}
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
