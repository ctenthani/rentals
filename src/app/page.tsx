import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Rental Manager</h1>
          <p className="text-slate-600 mt-2">Tenant & Landlord Portal</p>
        </div>

        <div className="space-y-3">
          <Link
            href="/auth/login"
            className="block w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 rounded-lg"
          >
            Login
          </Link>
          <Link
            href="/dashboard"
            className="block w-full bg-slate-800 hover:bg-slate-900 text-white font-medium py-3 rounded-lg"
          >
            Landlord Dashboard
          </Link>
          <Link
            href="/tenant"
            className="block w-full border border-slate-300 hover:bg-white text-slate-800 font-medium py-3 rounded-lg"
          >
            Tenant View
          </Link>
        </div>
      </div>
    </main>
  );
}
