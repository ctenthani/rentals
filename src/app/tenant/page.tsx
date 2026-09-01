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

function getPaidMonths(nextDueDate: string | null, monthsInAdvance: number) {
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

type Tab = "home" | "pay" | "issues";

export default function TenantPortalPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [house, setHouse] = useState<any>(null);
  const [payInfo, setPayInfo] = useState<any>(null);
  const [isAlsoLandlord, setIsAlsoLandlord] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("home");
  const [submitting, setSubmitting] = useState(false);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Bank Transfer");
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [transactionId, setTransactionId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);

  const [issueCategory, setIssueCategory] = useState("Maintenance");
  const [issueSubject, setIssueSubject] = useState("");
  const [issueDetails, setIssueDetails] = useState("");
  const [issuePhoto, setIssuePhoto] = useState<File | null>(null);

  const router = useRouter();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.push("/auth/login");
      return;
    }

    const { data: llCheck } = await supabase
      .from("landlords")
      .select("id")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();
    setIsAlsoLandlord(!!llCheck);

    const { data: t, error: tErr } = await supabase
      .from("tenants")
      .select(
        `id, full_name, phone, email, landlord_id,
         houses ( id, name, code, monthly_rent, bank_account )`
      )
      .eq("auth_user_id", session.user.id)
      .maybeSingle();

    if (tErr || !t) {
      setError("No tenant profile linked to this login");
      setLoading(false);
      return;
    }

    const h = Array.isArray(t.houses) ? t.houses[0] : t.houses;
    setTenant(t);
    setHouse(h || null);

    if (t.landlord_id) {
      const { data: ll } = await supabase
        .from("landlords")
        .select(
          "email, business_name, full_name, airtel_number, mpamba_number, bank_name, bank_account, payment_notes"
        )
        .eq("id", t.landlord_id)
        .maybeSingle();
      setPayInfo(ll);
    }

    const { data: bal } = await supabase
      .from("tenant_balances")
      .select("*")
      .eq("tenant_id", t.id)
      .maybeSingle();
    setBalance(bal);

    const { data: pays } = await supabase
      .from("payments")
      .select("id, amount, method, paid_date, months_covered, notes, created_at")
      .eq("tenant_id", t.id)
      .order("paid_date", { ascending: false })
      .limit(20);
    setPayments(pays || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [router]);

  const getLandlordEmail = async (landlordId: string | null) => {
    if (landlordId) {
      const { data: ll } = await supabase
        .from("landlords")
        .select("email")
        .eq("id", landlordId)
        .maybeSingle();
      if (ll?.email) return ll.email as string;
    }
    return payInfo?.email || null;
  };

  const houseLabel = () =>
    house ? `${house.name} (${house.code})` : "property";

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (!transactionId.trim() && !reference.trim()) {
      setError("Enter a transaction ID or payment reference");
      return;
    }

    setSubmitting(true);
    setError(null);
    setMsg(null);

    let proofUrl: string | null = null;
    if (proofFile) {
      const path = `${tenant.id}/${Date.now()}-${proofFile.name.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      )}`;
      const { error: upErr } = await supabase.storage
        .from("payment-proofs")
        .upload(path, proofFile, { upsert: true });
      if (upErr) {
        setSubmitting(false);
        setError(upErr.message);
        return;
      }
      const { data: pub } = supabase.storage
        .from("payment-proofs")
        .getPublicUrl(path);
      proofUrl = pub.publicUrl;
    }

    const { error: insErr } = await supabase.from("payment_submissions").insert({
      tenant_id: tenant.id,
      amount: amt,
      method,
      paid_date: paidDate,
      reference_used: reference.trim() || transactionId.trim(),
      transaction_id: transactionId.trim() || null,
      notes: notes.trim() || null,
      proof_url: proofUrl,
      status: "pending",
    });

    if (insErr) {
      setSubmitting(false);
      setError(insErr.message);
      return;
    }

    const to = await getLandlordEmail(tenant.landlord_id);
    if (to) {
      await supabase.functions.invoke("send-email", {
        body: {
          to,
          subject: `Payment pending confirmation – ${tenant.full_name}`,
          html: `<p><strong>${tenant.full_name}</strong> submitted a payment for ${houseLabel()}.</p>
<p>Amount: MK ${amt.toLocaleString()} · ${method} · ${transactionId || reference}</p>
<p><a href="https://rentozi.netlify.app/pending">Open Pending</a></p>`,
          text: `${tenant.full_name} submitted a payment. Confirm on Pending.`,
        },
      });
    }

    setSubmitting(false);
    setMsg("Payment report submitted. Your landlord has been notified.");
    setTab("home");
    setAmount("");
    setTransactionId("");
    setReference("");
    setNotes("");
    setProofFile(null);
    await load();
  };

  const handleSubmitIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !issueSubject.trim() || !issueDetails.trim()) {
      setError("Enter a subject and details");
      return;
    }
    setSubmitting(true);
    setError(null);
    setMsg(null);

    let photoUrl: string | null = null;
    if (issuePhoto) {
      const path = `issues/${tenant.id}/${Date.now()}-${issuePhoto.name.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      )}`;
      const { error: upErr } = await supabase.storage
        .from("payment-proofs")
        .upload(path, issuePhoto, { upsert: true });
      if (!upErr) {
        const { data: pub } = supabase.storage
          .from("payment-proofs")
          .getPublicUrl(path);
        photoUrl = pub.publicUrl;
      }
    }

    try {
      await supabase.from("tenant_issues").insert({
        tenant_id: tenant.id,
        category: issueCategory,
        subject: issueSubject.trim(),
        details: issueDetails.trim(),
        photo_url: photoUrl,
        status: "open",
      });
    } catch {
      /* optional table */
    }

    const to = await getLandlordEmail(tenant.landlord_id);
    if (to) {
      await supabase.functions.invoke("send-email", {
        body: {
          to,
          subject: `Tenant issue: ${issueCategory} – ${tenant.full_name}`,
          html: `<p>${tenant.full_name} (${houseLabel()})</p>
<p><strong>${issueCategory}:</strong> ${issueSubject}</p>
<p>${issueDetails.replace(/\n/g, "<br/>")}</p>
${photoUrl ? `<p><a href="${photoUrl}">Photo</a></p>` : ""}`,
          text: `${issueSubject}: ${issueDetails}`,
        },
      });
    }

    setSubmitting(false);
    setMsg("Issue sent to your landlord.");
    setIssueSubject("");
    setIssueDetails("");
    setIssuePhoto(null);
    setTab("home");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
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
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-red-600 text-sm">{error}</p>
        <button onClick={handleLogout} className="text-sm text-slate-600">
          Logout
        </button>
      </div>
    );
  }

  const status = (balance?.status || "upcoming").toLowerCase();
  const monthsAdv = Number(balance?.months_in_advance || 0);
  const bankAccount = house?.bank_account || payInfo?.bank_account;
  const hasPayDetails =
    bankAccount || payInfo?.airtel_number || payInfo?.mpamba_number;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Welcome</p>
            <p className="font-bold text-slate-900">{tenant?.full_name}</p>
          </div>
          <div className="flex items-center gap-3">
            {isAlsoLandlord && (
              <Link href="/dashboard" className="text-sm text-emerald-700 font-semibold">
                Landlord view
              </Link>
            )}
            <button onClick={handleLogout} className="text-sm text-slate-500">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>
        )}
        {msg && (
          <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl">{msg}</p>
        )}

        {tab === "home" && (
          <>
            <div className="bg-white rounded-2xl border shadow-sm p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-lg">{house?.name || "Property"}</p>
                  <p className="text-xs text-slate-500">{house?.code}</p>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                    status === "paid"
                      ? "bg-emerald-100 text-emerald-800"
                      : status === "overdue"
                      ? "bg-red-100 text-red-800"
                      : "bg-sky-100 text-sky-800"
                  }`}
                >
                  {status.toUpperCase()}
                </span>
              </div>

              <p className="text-xs text-slate-500 uppercase font-semibold">Paid months</p>
              <p className="text-sm font-medium">
                {getPaidMonths(balance?.next_due_date, monthsAdv)}
              </p>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Next due date</p>
                  <p className="font-semibold">{balance?.next_due_date || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Outstanding</p>
                  <p className="font-semibold text-red-600">
                    {formatMK(Number(balance?.current_balance || 0))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Monthly rent</p>
                  <p className="font-semibold">
                    {formatMK(Number(house?.monthly_rent || 0))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Months in advance</p>
                  <p className="font-semibold">{monthsAdv}</p>
                </div>
              </div>

              <div className="text-xs text-slate-600 space-y-1 pt-2 border-t">
                <p className="font-semibold text-slate-700">Pay to</p>
                {!hasPayDetails && (
                  <p className="text-slate-400">
                    Your landlord has not added payment numbers yet.
                  </p>
                )}
                {bankAccount && (
                  <p>
                    Bank{payInfo?.bank_name ? ` (${payInfo.bank_name})` : ""}:{" "}
                    <strong>{bankAccount}</strong>
                  </p>
                )}
                {payInfo?.airtel_number && (
                  <p>
                    Airtel Money: <strong>{payInfo.airtel_number}</strong>
                  </p>
                )}
                {payInfo?.mpamba_number && (
                  <p>
                    TNM Mpamba: <strong>{payInfo.mpamba_number}</strong>
                  </p>
                )}
                {payInfo?.payment_notes && (
                  <p className="text-slate-500">{payInfo.payment_notes}</p>
                )}
              </div>
            </div>

            <Link
              href="/tenant/lease"
              className="block w-full text-center border-2 border-emerald-600 text-emerald-800 font-semibold py-3 rounded-xl"
            >
              View / sign lease
            </Link>

            <div className="bg-white rounded-2xl border shadow-sm p-4">
              <h2 className="font-bold mb-3">Payment History</h2>
              {payments.length === 0 ? (
                <p className="text-sm text-slate-500">No payments recorded yet</p>
              ) : (
                <ul className="space-y-2">
                  {payments.map((p) => (
                    <li
                      key={p.id}
                      className="flex justify-between items-center text-sm border-b border-slate-50 pb-2"
                    >
                      <div>
                        <p className="font-semibold">{formatMK(Number(p.amount))}</p>
                        <p className="text-xs text-slate-500">
                          {p.method} · {p.paid_date}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                        CONFIRMED
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {tab === "pay" && (
          <form
            onSubmit={handleSubmitPayment}
            className="bg-white rounded-2xl border shadow-sm p-5 space-y-3"
          >
            <h3 className="font-bold text-lg">Report a payment</h3>
            {hasPayDetails ? (
              <div className="text-xs bg-slate-50 rounded-xl p-3 space-y-1">
                {bankAccount && (
                  <p>
                    Bank: <strong>{bankAccount}</strong>
                  </p>
                )}
                {payInfo?.airtel_number && (
                  <p>
                    Airtel Money: <strong>{payInfo.airtel_number}</strong>
                  </p>
                )}
                {payInfo?.mpamba_number && (
                  <p>
                    TNM Mpamba: <strong>{payInfo.mpamba_number}</strong>
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded-xl">
                Ask your landlord to add their bank or mobile-money numbers in Settings.
              </p>
            )}
            <input
              required
              type="number"
              placeholder="Amount (MK)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            >
              <option>Bank Transfer</option>
              <option>Airtel Money</option>
              <option>TNM Mpamba</option>
              <option>Cash</option>
            </select>
            <input
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <input
              placeholder="Transaction ID"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <input
              placeholder="Reference (optional)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setProofFile(e.target.files?.[0] || null)}
              className="w-full text-sm"
            />
            <textarea
              placeholder="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-emerald-600 text-white py-3 rounded-xl text-sm font-semibold"
            >
              {submitting ? "Submitting..." : "Submit payment report"}
            </button>
          </form>
        )}

        {tab === "issues" && (
          <form
            onSubmit={handleSubmitIssue}
            className="bg-white rounded-2xl border shadow-sm p-5 space-y-3"
          >
            <h3 className="font-bold text-lg">Report an issue</h3>
            <select
              value={issueCategory}
              onChange={(e) => setIssueCategory(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            >
              <option>Maintenance</option>
              <option>Plumbing</option>
              <option>Electrical</option>
              <option>Security</option>
              <option>Noise / neighbour</option>
              <option>Rent / payment query</option>
              <option>Other</option>
            </select>
            <input
              required
              placeholder="Subject"
              value={issueSubject}
              onChange={(e) => setIssueSubject(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <textarea
              required
              placeholder="Details"
              value={issueDetails}
              onChange={(e) => setIssueDetails(e.target.value)}
              rows={5}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setIssuePhoto(e.target.files?.[0] || null)}
              className="w-full text-sm"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-amber-600 text-white py-3 rounded-xl text-sm font-semibold"
            >
              {submitting ? "Sending..." : "Send issue to landlord"}
            </button>
          </form>
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-white border-t z-40">
        <div className="max-w-lg mx-auto grid grid-cols-3 text-xs">
          {(["home", "pay", "issues"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setError(null);
                setMsg(null);
              }}
              className={`py-3 font-semibold capitalize ${
                tab === t ? "text-emerald-700" : "text-slate-500"
              }`}
            >
              {t === "pay" ? "Pay" : t === "issues" ? "Issues" : "Home"}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
