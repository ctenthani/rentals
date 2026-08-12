"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SUPABASE_URL = "https://favhmbrpisstrwgytapl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdmhtYnJwaXNzdHJ3Z3l0YXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTM5MzIsImV4cCI6MjEwMTY4OTkzMn0.6V2oE161lKWAATnZDxQiGFLfoRifoRrH7MSb0MHTJ3U";

function formatMK(amount: number) {
  return new Intl.NumberFormat("en-MW", {
    style: "currency",
    currency: "MWK",
    minimumFractionDigits: 0,
  })
    .format(amount)
    .replace("MWK", "MK");
}

function whatsappLink(phone: string, message: string) {
  // Normalise Malawian numbers to international format without +
  let n = phone.replace(/\D/g, "");
  if (n.startsWith("0")) n = "265" + n.slice(1);
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}

export default function RemindersPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/auth/login");
        return;
      }

      const { data } = await supabase
        .from("tenant_overview")
        .select("*")
        .order("next_due_date");

      // Show overdue + due within 7 days
      const today = new Date();
      const in7 = new Date();
      in7.setDate(today.getDate() + 7);

      const filtered = (data || []).filter((r) => {
        if (!r.next_due_date) return false;
        const due = new Date(r.next_due_date);
        return due <= in7;
      });

      setRows(filtered);
      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/dashboard" className="text-slate-600 text-sm">
            ← Dashboard
          </Link>
          <h1 className="font-semibold">Rent Reminders</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <p className="text-sm text-slate-500">
          Tenants who are overdue or due within the next 7 days. Tap WhatsApp to
          send a ready-made message.
        </p>

        {rows.length === 0 ? (
          <div className="bg-white rounded-2xl border p-8 text-center text-slate-500">
            No reminders needed right now
          </div>
        ) : (
          rows.map((r) => {
            const isOverdue = new Date(r.next_due_date) < new Date();
            const msg = isOverdue
              ? `Hello ${r.full_name}, this is a reminder that your rent for ${r.house_name} is overdue. Outstanding balance: ${formatMK(Number(r.current_balance))}. Please pay at your earliest convenience. Thank you.`
              : `Hello ${r.full_name}, friendly reminder that rent for ${r.house_name} is due on ${r.next_due_date}. Amount: ${formatMK(Number(r.monthly_rent))}. Thank you.`;

            return (
              <div
                key={r.tenant_id}
                className="bg-white rounded-2xl border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <p className="font-medium">{r.full_name}</p>
                  <p className="text-sm text-slate-500">{r.house_name}</p>
                  <p className="text-sm mt-1">
                    Due: <strong>{r.next_due_date}</strong> · Balance:{" "}
                    <strong className="text-red-600">
                      {formatMK(Number(r.current_balance))}
                    </strong>
                  </p>
                  {isOverdue && (
                    <span className="inline-block mt-1 text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full">
                      OVERDUE
                    </span>
                  )}
                </div>

                {r.phone ? (
                  <a
                    href={whatsappLink(r.phone, msg)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl text-center"
                  >
                    WhatsApp reminder
                  </a>
                ) : (
                  <span className="text-sm text-slate-400">No phone</span>
                )}
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
