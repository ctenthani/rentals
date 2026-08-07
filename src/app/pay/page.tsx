export default function MakePaymentPage() {
  return (
    <main className="min-h-screen p-4">
      <div className="max-w-lg mx-auto bg-white rounded-xl border p-6 space-y-4">
        <h1 className="text-xl font-bold">Make Payment</h1>

        <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-2">
          <p><strong>Bank:</strong> National Bank of Malawi</p>
          <p><strong>Most houses:</strong> Account 1924966</p>
          <p><strong>Joe Lipanda (H04):</strong> Account 1353942</p>
        </div>

        <p className="text-slate-600 text-sm">
          Full payment form with proof upload will be enabled after Supabase connection.
        </p>
      </div>
    </main>
  );
}
