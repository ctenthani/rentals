"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const SUPABASE_URL = "https://favhmbrpisstrwgytapl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdmhtYnJwaXNzdHJ3Z3l0YXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTM5MzIsImV4cCI6MjEwMTY4OTkzMn0.6V2oE161lKWAATnZDxQiGFLfoRifoRrH7MSb0MHTJ3U";

export default function LeasePage() {
  const params = useSearchParams();
  const tenantIdParam = params.get("tenant_id");
  const router = useRouter();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [isLandlord, setIsLandlord] = useState(false);

  const [tenant, setTenant] = useState<any>(null);
  const [house, setHouse] = useState<any>(null);
  const [landlord, setLandlord] = useState<any>(null);
  const [terms, setTerms] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [idPath, setIdPath] = useState<string | null>(null);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [tenantSig, setTenantSig] = useState<string | null>(null);
  const [landlordSig, setLandlordSig] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/auth/login"); return; }

      const { data: ownLl } = await supabase.from("landlords").select("id").eq("auth_user_id", session.user.id).maybeSingle();
      const { data: mem } = await supabase.from("landlord_members").select("landlord_id").eq("auth_user_id", session.user.id).maybeSingle();
            const isOwnLease = t.auth_user_id === session.user.id;
      const landlordMode = !!(ownLl || mem) && !isOwnLease;
      setIsLandlord(landlordMode);

      let tid = tenantIdParam;
      if (!tid) {
        const { data: myT } = await supabase.from("tenants").select("id").eq("auth_user_id", session.user.id).maybeSingle();
        tid = myT?.id;
      }
      if (!tid) { setError("No tenant selected"); setLoading(false); return; }

      const { data: t } = await supabase
        .from("tenants")
        .select("*, houses(name, code, monthly_rent)")
        .eq("id", tid)
        .maybeSingle();
      if (!t) { setError("Tenant not found"); setLoading(false); return; }
      if (!landlordMode && t.auth_user_id !== session.user.id) {
        setError("You can only open your own lease"); setLoading(false); return;
      }
      setTenant(t);
      setHouse(Array.isArray(t.houses) ? t.houses[0] : t.houses);

      const { data: ll } = await supabase
        .from("landlords")
        .select("full_name, business_name")
        .eq("id", t.landlord_id)
        .maybeSingle();
      setLandlord(ll);

      const { data: lease } = await supabase.from("leases").select("*").eq("tenant_id", t.id).maybeSingle();
      setTerms(lease?.terms || defaultTerms(ll, t, Array.isArray(t.houses) ? t.houses[0] : t.houses));
      setIdNumber(lease?.id_number || "");
      setIdPath(lease?.id_doc_path || null);
      setTenantSig(lease?.tenant_signature || null);
      setLandlordSig(lease?.landlord_signature || null);
      setLoading(false);
    })();
  }, [router, tenantIdParam]);

  function defaultTerms(ll: any, t: any, h: any) {
    return `RESIDENTIAL LEASE AGREEMENT

Landlord: ${ll?.full_name || ""} (${ll?.business_name || ""})
Tenant: ${t?.full_name || ""}
Property: ${h?.code || ""} — ${h?.name || ""}
Monthly rent: MK ${Number(h?.monthly_rent || 0).toLocaleString()}

The tenant shall pay rent on or before the due date, keep the premises in good condition, and use the property as a private dwelling only.
The landlord shall grant quiet enjoyment of the premises while rent is paid.
This agreement is governed by the laws of Malawi.`;
  }

  function pos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const r = canvas.getBoundingClientRect();
    const src = "touches" in e ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  }

  const startDraw = (e: any) => {
    const c = canvasRef.current;
    if (!c) return;
    drawing.current = true;
    const ctx = c.getContext("2d")!;
    const p = pos(e, c);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const moveDraw = (e: any) => {
    if (!drawing.current) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const p = pos(e, c);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const endDraw = () => { drawing.current = false; };

  const saveTenantParts = async () => {
    if (!tenant) return;
    if (!idNumber.trim() && !idFile && !idPath) {
      setError("Enter your ID number or upload National ID / passport");
      return;
    }
    const c = canvasRef.current;
    const drawn = c && c.toDataURL().length > 3000 ? c.toDataURL("image/png") : tenantSig;
    if (!drawn) {
      setError("Sign in the box or upload a signature image");
      return;
    }
    setSaving(true); setError(null);
    let docPath = idPath;
    if (idFile) {
      const path = `ids/${tenant.id}/${Date.now()}-${idFile.name}`;
      const { error: upErr } = await supabase.storage.from("lease-docs").upload(path, idFile, { upsert: true });
      if (upErr) { setSaving(false); setError(upErr.message + " — create bucket lease-docs if missing"); return; }
      docPath = path;
    }
    const { error: uErr } = await supabase.from("leases").upsert({
      tenant_id: tenant.id,
      terms,
      id_number: idNumber,
      id_doc_path: docPath,
      tenant_signature: drawn,
      landlord_signature: landlordSig,
    }, { onConflict: "tenant_id" });
    setSaving(false);
    if (uErr) { setError(uErr.message); return; }
    setTenantSig(drawn);
    setIdPath(docPath || null);
    setMsg("ID and signature saved");
  };

  const saveLandlord = async () => {
    if (!tenant) return;
    setSaving(true);
    const c = canvasRef.current;
    const drawn = c && c.toDataURL().length > 3000 ? c.toDataURL("image/png") : landlordSig;
    const { error: uErr } = await supabase.from("leases").upsert({
      tenant_id: tenant.id,
      terms,
      id_number: idNumber,
      id_doc_path: idPath,
      tenant_signature: tenantSig,
      landlord_signature: drawn,
    }, { onConflict: "tenant_id" });
    setSaving(false);
    if (uErr) setError(uErr.message);
    else { setLandlordSig(drawn); setMsg("Lease saved"); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading lease...</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b print:hidden">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href={isLandlord ? "/dashboard" : "/tenant"} className="text-sm text-slate-600">← Back</Link>
          <p className="font-bold">Lease</p>
          <button onClick={() => window.print()} className="text-sm text-emerald-700">Print / PDF</button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl print:hidden">{error}</p>}
        {msg && <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl print:hidden">{msg}</p>}

        <section className="bg-white rounded-2xl border p-5 space-y-2">
          <h1 className="text-xl font-bold text-center">Residential lease</h1>
          <p className="text-sm"><strong>Landlord:</strong> {landlord?.full_name || "—"} · {landlord?.business_name || ""}</p>
          <p className="text-sm"><strong>Tenant:</strong> {tenant?.full_name}</p>
          <p className="text-sm"><strong>Property:</strong> {house?.code} — {house?.name}</p>
        </section>

        {isLandlord ? (
          <textarea className="w-full border rounded-xl px-3 py-2 text-sm min-h-[220px] print:hidden" value={terms} onChange={(e) => setTerms(e.target.value)} />
        ) : null}
        <pre className="bg-white border rounded-xl p-4 text-xs whitespace-pre-wrap">{terms}</pre>

        <section className="bg-white rounded-2xl border p-5 space-y-3">
          <h2 className="font-bold">Tenant identification</h2>
          {!isLandlord && (
            <p className="text-xs text-slate-500">You may only add your ID and signature. You cannot edit the lease wording.</p>
          )}
          <label className="text-xs font-semibold text-slate-500">National ID / passport number</label>
          <input
            className="w-full border rounded-xl px-3 py-2 text-sm"
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            readOnly={isLandlord}
            placeholder="ID or passport number"
          />
          {!isLandlord && (
            <>
              <label className="text-xs font-semibold text-slate-500">Upload ID / passport (photo or PDF)</label>
              <input type="file" accept="image/*,.pdf" onChange={(e) => setIdFile(e.target.files?.[0] || null)} />
            </>
          )}
          {idPath && <p className="text-xs text-emerald-700">ID document on file</p>}
        </section>

        <section className="bg-white rounded-2xl border p-5 space-y-3">
          <h2 className="font-bold">{isLandlord ? "Landlord signature" : "Tenant signature"}</h2>
          {((isLandlord && landlordSig) || (!isLandlord && tenantSig)) && (
            <img src={(isLandlord ? landlordSig : tenantSig) || ""} alt="signature" className="h-16 object-contain" />
          )}
          <canvas
            ref={canvasRef}
            width={600}
            height={160}
            className="w-full border rounded-xl bg-white touch-none print:hidden"
            onMouseDown={startDraw}
            onMouseMove={moveDraw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={moveDraw}
            onTouchEnd={endDraw}
          />
          <button type="button" className="text-xs text-slate-500 print:hidden" onClick={() => {
            const c = canvasRef.current;
            if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
          }}>Clear signature</button>
        </section>

        <div className="flex gap-2 print:hidden">
          {!isLandlord ? (
            <button onClick={saveTenantParts} disabled={saving} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">
              {saving ? "Saving..." : "Save ID and signature"}
            </button>
          ) : (
            <button onClick={saveLandlord} disabled={saving} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">
              {saving ? "Saving..." : "Save lease"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
