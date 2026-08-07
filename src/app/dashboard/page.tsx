export default function LandlordDashboard() {
  return (
    <main className="min-h-screen p-6">
      <h1 className="text-2xl font-bold mb-6">Landlord Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-slate-500">Expected Rent</p>
          <p className="text-2xl font-bold mt-1">MK 1,810,000</p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-slate-500">Outstanding</p>
          <p className="text-2xl font-bold mt-1 text-red-600">MK 4,040,000</p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-slate-500">Occupied</p>
          <p className="text-2xl font-bold mt-1">10 / 10</p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-slate-500">Occupancy</p>
          <p className="text-2xl font-bold mt-1">100%</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold mb-2">Houses</h2>
        <p className="text-slate-600 text-sm">
          Live data from Supabase will appear here once environment variables are added.
        </p>
      </div>
    </main>
  );
}
