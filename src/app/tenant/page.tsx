export default function TenantDashboard() {
  return (
    <main className="min-h-screen p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <h1 className="text-xl font-bold">Tenant Dashboard</h1>

        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-slate-500">Status</p>
          <p className="font-medium mt-1">UPCOMING</p>
          <p className="text-sm text-slate-600 mt-3">Next due: —</p>
          <p className="text-lg font-bold text-red-600 mt-1">Balance: MK —</p>
        </div>

        <a
          href="/pay"
          className="block w-full bg-green-600 hover:bg-green-700 text-white text-center font-medium py-3 rounded-xl"
        >
          Make Payment
        </a>
      </div>
    </main>
  );
}
