"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SUPABASE_URL = "https://favhmbrpisstrwgytapl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdmhtYnJwaXNzdHJ3Z3l0YXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTM5MzIsImV4cCI6MjEwMTY4OTkzMn0.6V2oE161lKWAATnZDxQiGFLfoRifoRrH7MSb0MHTJ3U";

const DEFAULT_TERMS = `1. PARTIES AND PREMISES
The Landlord lets and the Tenant takes the premises described in this agreement for residential use only.

2. RENT
The Tenant shall pay the monthly rent on or before the payment day each month.

3. DEPOSIT
The deposit shall be held by the Landlord and refunded at the end of the tenancy less any lawful deductions.

4. UTILITIES
Unless otherwise agreed, the Tenant is responsible for electricity, water and other metered utilities. The Landlord remains responsible for structural repairs unless otherwise agreed.

5. CARE OF PREMISES
The Tenant shall keep the premises in good and clean condition and shall not make alterations without written consent.

6. ACCESS
The Landlord or agent may enter at reasonable times with reasonable prior notice (except in emergency) to inspect, repair or show the premises.

7. NOTICE
Either party may terminate this agreement by giving the notice period stated above.

8. ENTIRE AGREEMENT
This document constitutes the whole agreement. Variations must be in writing and signed by both parties.

9. ELECTRONIC SIGNATURES
Signatures applied electronically on this platform (drawn or uploaded) may be used to execute this agreement.

10. GOVERNING LAW
This agreement is governed by the laws of Malawi.`;

function money(n: any) {
  return Number(n || 0).toLocaleString();
}

export default function LeasePage() {
  const router = useRouter();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [tenantMode, setTenantMode] = useState(true);

  const [tenant, setTenant] = useState<any>(null);
  const [house, setHouse] = useState<any>(null);
  const [landlord, setLandlord] = useState<any>(null);
  const [form, setForm] = useState({
    id_number: "",
    move_in: "",
    lease_start: "",
    lease_end: "",
    monthly_rent: "",
    deposit: "0",
    payment_day: "1",
    notice_days: "30",
    terms: DEFAULT_TERMS,
    id_doc_path: "" as string | null,
    tenant_signature: "" as string | null,
    landlord_signature: "" as string | null,
  });
  const [idFile, setIdFile] = useState<File | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  const setF = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/auth/login"); return; }

      const tid =
        new URLSearchParams(window.location.search).get("tenant_id") ||
        (await supabase.from("tenants").select("id").eq("auth_user_id", session.user.id).maybeSingle()).data?.id;

      if (!tid) { setError("No tenant selected"); setLoading(false); return; }

      const { data: t } = await supabase
        .from("tenants")
        .select("*, houses(id, name, code, monthly_rent, bank_account)")
        .eq("id", tid)
        .maybeSingle();
      if (!t) { setError("Tenant not found"); setLoading(false); return; }

      const isOwn = !!(t.auth_user_id && t.auth_user_id === session.user.id);
      setTenantMode(isOwn);
      if (!isOwn) {
        const { data: ownLl } = await supabase.from("landlords").select("id").eq("auth_user_id", session.user.id).maybeSingle();
        const { data: mem } = await supabase.from("landlord_members").select("id").eq("auth_user_id", session.user.id).maybeSingle();
        if (!ownLl && !mem) { setError("You can only open your own lease"); setLoading(false); return; }
      }

      setTenant(t);
      const h = Array.isArray(t.houses) ? t.houses[0] : t.houses;
      setHouse(h);

      const { data: ll } = await supabase
        .from("landlords")
        .select("full_name, business_name")
        .eq("id", t.landlord_id)
        .maybeSingle();
      setLandlord(ll);

      const { data: lease } = await supabase.from("leases").select("*").eq("tenant_id", t.id).maybeSingle();
      const today = new Date().toISOString().slice(0, 10);
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);

      setForm({
        id_number: lease?.id_number || "",
        move_in: lease?.move_in || today,
        lease_start: lease?.lease_start || today,
        lease_end: lease?.lease_end || nextYear.toISOString().slice(0, 10),
        monthly_rent: String(lease?.monthly_rent ?? h?.monthly_rent ?? 0),
        deposit: String(lease?.deposit ?? 0),
        payment_day: String(lease?.payment_day ?? 1),
        notice_days: String(lease?.notice_days ?? 30),
        terms: lease?.terms || DEFAULT_TERMS,
        id_doc_path: lease?.id_doc_path || null,
        tenant_signature: lease?.tenant_signature || null,
        landlord_signature: lease?.landlord_signature || null,
      });
      setLoading(false);
    })();
  }, [router]);

  function pos(e: any, canvas: HTMLCanvasElement) {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  }
  const startDraw = (e: any) => {
    const c = canvasRef.current; if (!c) return;
    drawing.current = true;
    const p = pos(e, c);
    const ctx = c.getContext("2d")!;
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
  };
  const moveDraw = (e: any) => {
    if (!drawing.current) return;
    const c = canvasRef.current; if (!c) return;
    const p = pos(e, c);
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#0f172a";
    ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const endDraw = () => { drawing.current = false; };

  const save = async () => {
    if (!tenant) return;
    if (tenantMode && !form.id_number.trim() && !idFile && !form.id_doc_path) {
      setError("Enter your ID number or upload National ID / passport");
      return;
    }
    const c = canvasRef.current;
    const drawn = c && c.toDataURL().length > 4000 ? c.toDataURL("image/png") : tenantMode ? form.tenant_signature : form.landlord_signature;
    if (tenantMode && !drawn) { setError("Please sign in the box"); return; }

    setSaving(true); setError(null);
    let docPath = form.id_doc_path;
    if (tenantMode && idFile) {
      const path = `ids/${tenant.id}/${Date.now()}-${idFile.name}`;
      const { error: upErr } = await supabase.storage.from("lease-docs").upload(path, idFile, { upsert: true });
      if (upErr) { setSaving(false); setError(upErr.message); return; }
      docPath = path;
    }

    const payload: any = {
      tenant_id: tenant.id,
      terms: form.terms,
      id_number: form.id_number,
      id_doc_path: docPath,
      move_in: form.move_in || null,
      lease_start: form.lease_start || null,
      lease_end: form.lease_end || null,
      monthly_rent: Number(form.monthly_rent || 0),
      deposit: Number(form.deposit || 0),
      payment_day: Number(form.payment_day || 1),
      notice_days: Number(form.notice_days || 30),
      tenant_signature: tenantMode ? drawn : form.tenant_signature,
      landlord_signature: tenantMode ? form.landlord_signature : drawn || form.landlord_signature,
    };

    const { data: existing } = await supabase.from("leases").select("id").eq("tenant_id", tenant.id).maybeSingle();
    const q = existing?.id
      ? supabase.from("leases").update(payload).eq("id", existing.id)
      : supabase.from("leases").insert(payload);
    const { error: uErr } = await q;
    setSaving(false);
    if (uErr) { setError(uErr.message); return; }
    setForm((p) => ({
      ...p,
      id_doc_path: docPath,
      tenant_signature: tenantMode ? drawn : p.tenant_signature,
      landlord_signature: tenantMode ? p.landlord_signature : drawn,
    }));
    setMsg(tenantMode ? "ID and signature saved" : "Lease saved");
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading lease...</div>;
  }

  const Field = ({ label, children }: any) => (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">{label}</p>
      {children}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-emerald-50 to-sky-50">
      <header className="bg-white/90 backdrop-blur border-b sticky top-0 z-30 print:hidden">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href={tenantMode ? "/tenant" : "/dashboard"} className="text-sm text-slate-600">← Back</Link>
          <p className="font-bold">Lease</p>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="border px-3 py-1.5 rounded-xl text-sm">Print / PDF</button>
            <button onClick={save} disabled={saving} className="bg-emerald-600 text-white px-3 py-1.5 rounded-xl text-sm font-semibold">
              {saving ? "Saving..." : tenantMode ? "Save ID & signature" : "Save lease"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 pb-16">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl mb-3 print:hidden">{error}</p>}
        {msg && <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl mb-3 print:hidden">{msg}</p>}

        <article className="bg-white shadow-xl border border-slate-200 rounded-sm p-6 sm:p-10 space-y-6">
          <div className="text-center border-b pb-4">
            <p className="text-[11px] tracking-[0.25em] uppercase text-emerald-800 font-semibold">Rentozi</p>
            <h1 className="text-2xl font-bold mt-1">Residential Tenancy Agreement</h1>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-500">Landlord</p>
              <p className="font-semibold">{landlord?.business_name || landlord?.full_name || "—"}</p>
              <p className="text-slate-600">{landlord?.full_name}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-500">Tenant</p>
              <p className="font-semibold">{tenant?.full_name}</p>
              <p className="text-slate-600">{tenant?.phone}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-500">Premises</p>
              <p className="font-semibold">{house?.name}</p>
              <p className="text-slate-600">Code: {house?.code}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-500">Rent payment account</p>
              <p className="font-semibold">{house?.bank_account || "—"}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 print:hidden">
            <Field label="National ID / passport number">
              <input className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" value={form.id_number} onChange={(e) => setF("id_number", e.target.value)} disabled={!tenantMode} />
            </Field>
            <Field label="Move-in date">
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" value={form.move_in} onChange={(e) => setF("move_in", e.target.value)} disabled={tenantMode} />
            </Field>
            <Field label="Lease start">
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" value={form.lease_start} onChange={(e) => setF("lease_start", e.target.value)} disabled={tenantMode} />
            </Field>
            <Field label="Lease end">
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" value={form.lease_end} onChange={(e) => setF("lease_end", e.target.value)} disabled={tenantMode} />
            </Field>
            <Field label="Monthly rent (MK)">
              <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" value={form.monthly_rent} onChange={(e) => setF("monthly_rent", e.target.value)} disabled={tenantMode} />
            </Field>
            <Field label="Deposit (MK)">
              <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" value={form.deposit} onChange={(e) => setF("deposit", e.target.value)} disabled={tenantMode} />
            </Field>
            <Field label="Payment day of month">
              <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" value={form.payment_day} onChange={(e) => setF("payment_day", e.target.value)} disabled={tenantMode} />
            </Field>
            <Field label="Notice (days)">
              <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" value={form.notice_days} onChange={(e) => setF("notice_days", e.target.value)} disabled={tenantMode} />
            </Field>
          </div>

          {tenantMode && (
            <div className="print:hidden">
              <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">Upload National ID / passport</p>
              <input type="file" accept="image/*,.pdf" onChange={(e) => setIdFile(e.target.files?.[0] || null)} />
              {form.id_doc_path && <p className="text-xs text-emerald-700 mt-1">ID document on file</p>}
            </div>
          )}

          <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-4 text-sm space-y-1">
            <p><strong>National ID:</strong> {form.id_number || "—"}</p>
            <p><strong>Property:</strong> {house?.code} — {house?.name}</p>
            <p><strong>Lease period:</strong> {form.lease_start || "—"} to {form.lease_end || "—"}</p>
            <p><strong>Move-in:</strong> {form.move_in || "—"}</p>
            <p><strong>Monthly rent:</strong> MK {money(form.monthly_rent)}</p>
            <p><strong>Deposit:</strong> MK {money(form.deposit)}</p>
            <p><strong>Payment day:</strong> {form.payment_day} · <strong>Notice:</strong> {form.notice_days} days</p>
          </div>

          <div>
            <p className="text-sm font-bold uppercase tracking-wide mb-2">Terms and conditions</p>
            {tenantMode ? (
              <pre className="text-xs whitespace-pre-wrap leading-relaxed text-slate-700">{form.terms}</pre>
            ) : (
              <textarea className="w-full border rounded-xl px-3 py-2 text-xs min-h-[220px] print:hidden" value={form.terms} onChange={(e) => setF("terms", e.target.value)} />
            )}
            {!tenantMode && <pre className="hidden print:block text-xs whitespace-pre-wrap">{form.terms}</pre>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-500 mb-2">Tenant signature</p>
              {form.tenant_signature && <img src={form.tenant_signature} alt="tenant signature" className="h-14 object-contain mb-2" />}
              {tenantMode && (
                <canvas ref={canvasRef} width={400} height={140} className="w-full border rounded-xl bg-white touch-none print:hidden"
                  onMouseDown={startDraw} onMouseMove={moveDraw} onMouseUp={endDraw} onMouseLeave={endDraw}
                  onTouchStart={startDraw} onTouchMove={moveDraw} onTouchEnd={endDraw} />
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-500 mb-2">Landlord signature</p>
              {form.landlord_signature && <img src={form.landlord_signature} alt="landlord signature" className="h-14 object-contain mb-2" />}
              {!tenantMode && (
                <canvas ref={canvasRef} width={400} height={140} className="w-full border rounded-xl bg-white touch-none print:hidden"
                  onMouseDown={startDraw} onMouseMove={moveDraw} onMouseUp={endDraw} onMouseLeave={endDraw}
                  onTouchStart={startDraw} onTouchMove={moveDraw} onTouchEnd={endDraw} />
              )}
            </div>
          </div>
        </article>
      </main>
    </div>
  );
}
