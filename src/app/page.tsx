"use client";

import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://favhmbrpisstrwgytapl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdmhtYnJwaXNzdHJ3Z3l0YXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTM5MzIsImV4cCI6MjEwMTY4OTkzMn0.6V2oE161lKWAATnZDxQiGFLfoRifoRrH7MSb0MHTJ3U",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: true,
    },
  }
);

export default function HomePage() {
  useEffect(() => {
    (async () => {
      await supabase.auth.signOut();
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith("sb-") || k.includes("supabase"))
          .forEach((k) => localStorage.removeItem(k));
      } catch {}
      window.location.replace("/auth/login");
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center text-slate-500">
      Signing out...
    </div>
  );
}
