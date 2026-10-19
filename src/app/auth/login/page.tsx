"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";


export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data: signedIn,error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const {data:active}=await supabase.rpc("rentozi_user_enabled");
    if(!active){await supabase.auth.signOut();setLoading(false);setError("This account has been removed. Contact the site owner.");return;}
    if(signedIn.user?.user_metadata?.role==="landlord"){
      const {data:existing}=await supabase.rpc("my_landlord_id");
      if(!existing){const {error:profileError}=await supabase.rpc("create_landlord_profile",{p_full_name:signedIn.user.user_metadata.full_name||"My Rentals",p_business_name:signedIn.user.user_metadata.business_name||"My Rentals"});if(profileError){setLoading(false);setError(profileError.message);return;}}
    }
    const next = new URLSearchParams(window.location.search).get("next");
    const safeNext = next && /^\/(receipt|pending)(\?|$)/.test(next) && !next.includes("\\") && !/[\r\n]/.test(next) ? next : "/dashboard";
    router.push(safeNext);
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-2xl border shadow-sm p-8">
        <h1 className="text-2xl font-bold text-center mb-2">Sign in</h1>
        <p className="text-sm text-slate-500 text-center mb-6">
          Landlord or tenant login
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border rounded-xl px-3 py-2.5 text-sm"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border rounded-xl px-3 py-2.5 text-sm"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2.5 rounded-xl"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
<div className="text-right">
  <Link
    href="/auth/forgot-password"
    className="text-xs text-green-700 font-medium"
  >
    Forgot password?
  </Link>
</div>
        <p className="text-sm text-center text-slate-500 mt-6">
          New landlord?{" "}
          <Link href="/auth/signup" className="text-green-700 font-medium">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
