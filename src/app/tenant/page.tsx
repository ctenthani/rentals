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
    months.unshift(
      d.toLocaleString("en", { month: "short", year: "numeric" })
    );
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
  const [payments, setPayments] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("home");
  const [submitting, setSubmitting] = useState(false);

  // Payment form
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Bank Transfer");
  const [paidDate, setPaidDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [transactionId, setTransactionId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);

  // Issue form
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

  const advanceRequired = (() => {
    const name = (tenant?.full_name || "").toLowerCase();
    if (
      name.includes("lipanda") ||
      name.includes("chison") ||
      name.includes("emily") ||
      name.includes("mphande")
    ) {
      return 3;
    }
    return 2;
  })();

  const getLandlordEmail = async (landlordId: string | null) => {
    if (landlordId) {
      const { data: ll } = await supabase
        .from("landlords")
        .select("email")
        .eq("id", landlordId)
        .maybeSingle();
      if (ll?.email) return ll.email as string;
    }
    return "ctenthani@gmail.com";
  };

  const houseLabel = () =>
    house ? `${house.name} (${house.code})` : "property";

  const notifyLandlordPayment = async (payload: {
    fullName: string;
    landlordId: string | null;
    amount: number;
    method: string;
    txn: string;
  }) => {
    try {
      const landlordEmail = await getLandlordEmail(payload.landlordId);
      await supabase.functions.invoke("send-email", {
        body: {
          to: landlordEmail,
          subject: `Payment pending confirmation – ${payload.fullName}`,
          html: `<p>Hello,</p>
<p><strong>${payload.fullName}</strong> submitted a rent payment that needs your confirmation.</p>
<ul>
  <li><strong>Property:</strong> ${houseLabel()}</li>
  <li><strong>Amount:</strong> MK ${Number(payload.amount).toLocaleString()}</li>
  <li><strong>Method:</strong> ${payload.method}</li>
  <li><strong>Txn / Ref:</strong> ${payload.txn || "—"}</li>
</ul>
<p><a href="https://rentozi.netlify.app/pending"><strong>Open Pending payments</strong></a></p>
<p>Rentozi Rentals</p>`,
          text: `${payload.fullName} submitted a payment. Confirm: https://rentozi.netlify.app/pending`,
        },
      });
    } catch (e) {
      console.log("Landlord payment notify failed", e);
    }
  };

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

    await notifyLandlordPayment({
      fullName: tenant.full_name,
      landlordId: tenant.landlord_id,
      amount: amt,
      method,
      txn: transactionId.trim() || reference.trim(),
    });

    setSubmitting(false);
    setMsg(
      "Payment report submitted. Your landlord has been notified by email."
    );
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
    if (!tenant) return;

    if (!issueSubject.trim() || !issueDetails.trim()) {
      setError("Please enter a subject and details");
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

    // Optional: store in DB if table exists (ignore error if not)
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
      /* table may not exist yet */
    }

    try {
      const landlordEmail = await getLandlordEmail(tenant.landlord_id);
      await supabase.functions.invoke("send-email", {
        body: {
          to: landlordEmail,
          subject: `Tenant issue: ${issueCategory} – ${tenant.full_name}`,
          html: `<p>Hello,</p>
<p>A tenant reported an issue that needs your attention.</p>
<ul>
  <li><strong>Tenant:</strong> ${tenant.full_name}</li>
  <li><strong>Phone:</strong> ${tenant.phone || "—"}</li>
  <li><strong>Property:</strong> ${houseLabel()}</li>
  <li><strong>Category:</strong> ${issueCategory}</li>
  <li><strong>Subject:</strong> ${issueSubject.trim()}</li>
</ul>
<p><strong>Details:</strong></p>
<p>${issueDetails.trim().replace(/\n/g, "<br/>")}</p>
${
  photoUrl
    ? `<p><a href="${photoUrl}">View attached photo</a></p>`
    : ""
}
<p>Please follow up with the tenant.</p>
<p>Rentozi Rentals</p>`,
          text: `Issue from ${tenant.full_name} (${houseLabel()}): ${issueCategory} – ${issueSubject}. ${issueDetails}`,
        },
      });
    } catch (err) {
      setSubmitting(false);
      setError("Could not send email. Try again or contact the landlord directly.");
      return;
    }

    setSubmitting(false);
    setMsg("Issue sent to your landlord by email. Thank you.");
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  if (error && !tenant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-4">
        <p className="text-red-600 text-sm">{error}</p>
        <button onClick={handleLogout} className="text-sm text-slate-600">
          Logout
        </button>
      </div>
    );
  }

  const status = (balance?.status || "upcoming").toLowerCase();
  const monthsAdv = Number(balance?.months_in_advance || 0);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Welcome</p>
            <p className="font-bold text-slate-900">{tenant?.full_name}</p>
          </div>
          <button onClick={handleLogout} className="text-sm text-slate-500">
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>
        )}
        {msg && (
          <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl">
            {msg}
          </p>
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

              <div className="text-xs text-slate-500 uppercase font-semibold">
                Paid months
              </div>
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
                  <p className="text-xs text-slate-500">Advance required</p>
                  <p className="font-semibold">
                    {monthsAdv} / {advanceRequired} months
                  </p>
                </div>
              </div>

              {house?.bank_account && (
                <p className="text-xs text-slate-500">
                  Pay to account: <strong>{house.bank_account}</strong>
                  <br />
                  Airtel Money: 0995684682 · Mpamba: 0888381177
                </p>
              )}
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
                        <p className="font-semibold">
                          {formatMK(Number(p.amount))}
                        </p>
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
            <p className="text-xs text-slate-500">
              After you pay, submit details here. Your landlord gets an email to
              confirm.
            </p>

            <div>
              <label className="text-xs font-semibold text-slate-500">
                Amount (MK)
              </label>
              <input
                required
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Method
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm mt-1"
              >
                <option>Bank Transfer</option>
                <option>Airtel Money</option>
                <option>TNM Mpamba</option>
                <option>Cash</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Date paid
              </label>
              <input
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Transaction ID
              </label>
              <input
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm mt-1"
                placeholder="From SMS or bank alert"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Reference (optional)
              </label>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Screenshot / proof
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                className="w-full text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full border rounded-xl px-3 py-2 text-sm mt-1"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-emerald-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
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
            <p className="text-xs text-slate-500">
              Describe the problem. An email is sent to your landlord right away.
            </p>

            <div>
              <label className="text-xs font-semibold text-slate-500">
                Category
              </label>
              <select
                value={issueCategory}
                onChange={(e) => setIssueCategory(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm mt-1"
              >
                <option>Maintenance</option>
                <option>Plumbing</option>
                <option>Electrical</option>
                <option>Security</option>
                <option>Noise / neighbour</option>
                <option>Rent / payment query</option>
                <option>Other</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500">
                Subject
              </label>
              <input
                required
                value={issueSubject}
                onChange={(e) => setIssueSubject(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm mt-1"
                placeholder="Short title, e.g. Leaking tap"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500">
                Details
              </label>
              <textarea
                required
                value={issueDetails}
                onChange={(e) => setIssueDetails(e.target.value)}
                rows={5}
                className="w-full border rounded-xl px-3 py-2 text-sm mt-1"
                placeholder="What happened, when, and how urgent is it?"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500">
                Photo (optional)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setIssuePhoto(e.target.files?.[0] || null)}
                className="w-full text-sm mt-1"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-amber-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {submitting ? "Sending..." : "Send issue to landlord"}
            </button>
          </form>
        )}
      </main>

      {/* Bottom tabs */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t shadow-lg z-40">
        <div className="max-w-lg mx-auto grid grid-cols-3 text-xs">
          <button
            onClick={() => {
              setTab("home");
              setError(null);
            }}
            className={`py-3 font-semibold ${
              tab === "home" ? "text-emerald-700" : "text-slate-500"
            }`}
          >
            Home
          </button>
          <button
            onClick={() => {
              setTab("pay");
              setError(null);
              setMsg(null);
            }}
            className={`py-3 font-semibold ${
              tab === "pay" ? "text-emerald-700" : "text-slate-500"
            }`}
          >
            Pay
          </button>
          <button
            onClick={() => {
              setTab("issues");
              setError(null);
              setMsg(null);
            }}
            className={`py-3 font-semibold ${
              tab === "issues" ? "text-amber-700" : "text-slate-500"
            }`}
          >
            Issues
          </button>
        </div>
      </nav>
    </div>
  );
}
