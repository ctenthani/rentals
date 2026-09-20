"use client";

import Link from "next/link";

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/40 to-sky-50">
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-slate-600">← Back</Link>
          <p className="font-bold">How to use Rentozi</p>
          <Link href="/auth/login" className="text-sm text-emerald-700">Sign in</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto p-4 space-y-4 pb-16">
        <section className="bg-white rounded-2xl border shadow-sm p-5 space-y-2">
          <h1 className="text-xl font-bold">Rentozi user guide</h1>
          <p className="text-sm text-slate-600">
            Track rent, confirm payments, keep leases and send receipts.
            Reminders go out 7 days and 3 days before the due date. Ignore them if you already paid.
          </p>
        </section>
        <section className="bg-white rounded-2xl border shadow-sm p-5 space-y-3">
          <h2 className="font-bold text-lg">For landlords</h2>
          <ol className="list-decimal pl-5 text-sm space-y-2 text-slate-700">
            <li>Sign in, then open Settings and enter business name plus bank / Airtel / Mpamba.</li>
            <li>Add property + tenant. New houses start as UPCOMING until a payment is recorded.</li>
            <li>Edit tenant → add email → Create login. They get an email with the password.</li>
            <li>Pending flashes when a tenant reports a payment. Confirm or Reject.</li>
            <li>Record is for cash you received yourself. Payments is history. Lease is the agreement.</li>
            <li>Co-manager shares your houses. Create new landlord is a separate business (owner only).</li>
          </ol>
        </section>
        <section className="bg-white rounded-2xl border shadow-sm p-5 space-y-3">
          <h2 className="font-bold text-lg">For tenants</h2>
          <ol className="list-decimal pl-5 text-sm space-y-2 text-slate-700">
            <li>Log in with the email and password from your landlord.</li>
            <li>Home shows paid months, next due date and receipts you can open or print.</li>
            <li>Pay: send money to the numbers shown, then submit amount + transaction ID + screenshot.</li>
            <li>Wait for confirmation, then download the receipt.</li>
            <li>You get reminder emails 7 days and 3 days before rent is due. Ignore if already paid.</li>
            <li>Issues = repairs. Lease = read and sign.</li>
          </ol>
        </section>
        <section className="bg-white rounded-2xl border shadow-sm p-5 space-y-2 text-sm text-slate-700">
          <h2 className="font-bold text-lg">Problems</h2>
          <p><strong>Failed to fetch</strong> — switch network and retry; the database may be waking up.</p>
          <p><strong>No email</strong> — check spam, ask landlord to Create login again.</p>
        </section>
      </main>
    </div>
  );
}
