"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

const SUPABASE_URL = "https://favhmbrpisstrwgytapl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdmhtYnJwaXNzdHJ3Z3l0YXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTM5MzIsImV4cCI6MjEwMTY4OTkzMn0.6V2oE161lKWAATnZDxQiGFLfoRifoRrH7MSb0MHTJ3U";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://tenthanis.netlify.app/auth/reset-password",
    });

    if (error) setError(error.message);
    else
      setMessage(
        "If an account exists for that email, a reset link has been sent."
      );

    setLoading(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-2xl border shadow-sm p-8">
        <h1 className="text-2xl font-bold text-center mb-2">Forgot password</h1>
        <p className="text-sm text-slate-500 text-center mb-6">
          Enter your email and we will send a reset link
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border rounded-xl px-3 py-2.5 text-sm"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">
              {error}
            </p>
          )}
          {message && (
            <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2.5 rounded-xl"
          >
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>

        <p className="text-sm text-center text-slate-500 mt-6">
          <Link href="/auth/login" className="text-green-700 font-medium">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
