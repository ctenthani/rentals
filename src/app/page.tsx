"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";


export default function HomePage() {
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      window.location.replace(session ? "/dashboard" : "/auth/login");
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center text-slate-500">
      Opening your account...
    </div>
  );
}
