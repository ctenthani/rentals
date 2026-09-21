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
  const [tenantMode, setTenantMode] = useState(true);

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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/auth/login");
        return;
      }

      const { data: myTenant } = await supabase
        .from("tenants")
        .select("id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      let tid = tenantIdParam || myTenant?.id || null;
      if (!tid) {
        setError("No tenant selected");
        setLoading(false);
        return;
      }

      const { data: t } = await supabase
        .from("tenants")
        .select("*, houses(name, code, monthly_rent)")
        .eq("id", tid)
        .maybeSingle();
      if (!t) {
        setError("Tenant not found");
        setLoading(false);
        return;
      }

      const isOwn = t.auth_user_id && t.auth_user_id === session.user.id;
      setTenantMode(!!isOwn);

      if (!isOwn && t.auth_user_id && t.auth_user_id !== session.user.id) {
        const { data: ownLl } = await supabase
          .from("landlords")
          .select("id")
          .eq("auth_user_id", session.user.id)
          .maybeSingle();
        const { data: mem } = await supabase
          .from("landlord_members")
          .select("id")
          .eq("auth_user_id", session.user.id)
          .maybeSingle();
        if (!ownLl && !mem) {
          setError("You can only open your own lease");
          setLoading(false);
          return;
        }
      }

      setTenant(t);
      setHouse(Array.isArray(t.houses) ? t.houses[0] : t.houses);

      const { data: ll } = await supabase
        .from("landlords")
        .select("full_name, business_name")
        .eq("id", t.landlord_id)
        .maybeSingle();
      setLandlord(ll);

      const { data: lease } = await supabase
        .from("leases")
        .select("*")
        .eq("tenant_id", t.id)
        .maybeSingle();

      const fallback = `RESIDENTIAL LEASE AGREEMENT

Landlord: ${ll?.full_name || ""} (${ll?.business_name || ""})
Tenant: ${t.full_name || ""}
Property: ${Array.isArray(t.houses) ? t.houses[0]?.code : t.houses?.code} — ${
        Array.isArray(t.houses) ? t.houses[0]?.name : t.houses?.name
      }
Monthly rent: MK ${Number(
        (Array.isArray(t.houses) ? t.houses[0]?.monthly_rent : t.houses?.monthly_rent) || 0
      ).toLocaleString()}

The tenant shall pay rent on or before the due date, keep the premises in good condition, and use the property as a private dwelling only.
The landlord shall grant quiet enjoyment of the premises while rent is paid.
This agreement is governed by the laws of Malawi.`;

      setTerms(lease?.terms || fallback);
      setIdNumber(lease?.id_number || "");
      setIdPath(lease?.id_doc_path || null);
      setTenantSig(lease?.tenant_signature || null);
      setLandlordSig(lease?.landlord_signature || null);
      setLoading(false);
    })();
  }, [router, tenantIdParam]);

  function pos(e: any, canvas: HTMLCanvasElement) {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  }
  const startDraw = (e: any) => {
    const c = canvasRef.current;
    if (!c) return;
    drawing.current = true;
    const p = pos(e, c);
    const ctx = c.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const moveDraw = (e: any) => {
    if (!drawing.current) return;
    const c = canvasRef.current;
    if (!c) return;
    const p = pos(e, c);
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const endDraw = () => {
    drawing.current = false;
  };

  const save = async () => {
    if (!tenant) return;
    if (tenantMode && !idNumber.trim() && !idFile && !idPath) {
      setError("Enter your ID number or upload National ID / passport");
      return;
    }
    const c = canvasRef.current;
    const drawn =
      c && c.toDataURL().length > 4000 ? c.toDataURL("image/png") : tenantMode ? tenantSig : landlordSig;
    if (tenantMode && !drawn) {
      setError("Please sign in the box");
      return;
    }
    setSaving(true);
    setError(null);
    let docPath = idPath;
    if (tenantMode && idFile) {
      const path = `ids/${tenant.id}/${Date.now()}-${idFile.name}`;
      const { error: upErr } = await supabase.storage
        .from("lease-docs")
        .upload(path, idFile, { upsert: true });
      if (upErr) {
        setSaving(false);
        setError(upErr.message);
        return;
      }
      docPath = path;
    }

    const payload: any = {
      tenant_id: tenant.id,
      terms,
      id_number: idNumber,
      id_doc_path: docPath,
      tenant_signature: tenantMode ? drawn : tenantSig,
      landlord_signature: tenantMode ? landlordSig : drawn || landlordSig,
    };

    const { error: uErr } = await supabase
      .from("leases")
      .upsert(payload, { onConflict: "tenant_id" });
    setSaving(false);
    if (uErr) {
      setError(uErr.message);
      return;
    }
    if (tenantMode) setTenantSig(drawn);
    else setLandlordSig(drawn);
    setMsg(tenantMode ? "ID and signature saved" : "Lease saved");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Loading lease...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b print:hidden">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href={tenantMode ? "/tenant" : "/dashboard"} className="text-sm text-slate-600">
            ← Back
          </Link>
          <p className="font-bold">Lease</p>
          <button onClick={() => window.print()} className="text-sm text-emerald-700">
            Print / PDF
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl print:hidden">{error}</p>
        )}
        {msg && (
          <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl print:hidden">{msg}</p>
        )}

        <section className="bg-white rounded-2xl border p-5 space-y-1">
          <h1 className="text-xl font-bold text-center">Residential lease</h1>
          <p className="text-sm">
            <strong>Landlord:</strong> {landlord?.full_name || "—"}
            {landlord?.business_name ? ` · ${landlord.business_name}` : ""}
          </p>
          <p className="text-sm">
            <strong>Tenant:</strong> {tenant?.full_name}
          </p>
          <p className="text-sm">
            <strong>Property:</strong> {house?.code} — {house?.name}
          </p>
        </section>

        {tenantMode ? (
          <pre className="bg-white border rounded-xl p-4 text-xs whitespace-pre-wrap leading-relaxed">
            {terms}
          </pre>
        ) : (
          <textarea
            className="w-full bg-white border rounded-xl px-3 py-2 text-sm min-h-[240px]"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
          />
        )}

        <section className="bg-white rounded-2xl border p-5 space-y-3">
          <h2 className="font-bold">Tenant identification</h2>
          {tenantMode && (
            <p className="text-xs text-slate-500">
              You can only add your ID and signature. Lease wording is locked.
            </p>
          )}
          <label className="text-xs font-semibold text-slate-500">
            National ID / passport number
          </label>
          <input
            className="w-full border rounded-xl px-3 py-2 text-sm disabled:bg-slate-100"
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            disabled={!tenantMode}
            placeholder="ID or passport number"
          />
          {tenantMode && (
            <>
              <label className="text-xs font-semibold text-slate-500">
                Upload National ID or passport
              </label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setIdFile(e.target.files?.[0] || null)}
              />
            </>
          )}
          {idPath && <p className="text-xs text-emerald-700">ID document on file</p>}
        </section>

        <section className="bg-white rounded-2xl border p-5 space-y-3">
          <h2 className="font-bold">{tenantMode ? "Your signature" : "Landlord signature"}</h2>
          {(tenantMode ? tenantSig : landlordSig) && (
            <img
              src={(tenantMode ? tenantSig : landlordSig) || ""}
              alt="signature"
              className="h-16 object-contain"
            />
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
          <button
            type="button"
            className="text-xs text-slate-500 print:hidden"
            onClick={() => {
              const c = canvasRef.current;
              if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            }}
          >
            Clear signature
          </button>
        </section>

        {landlordSig && tenantMode && (
          <section className="bg-white rounded-2xl border p-5">
            <p className="text-xs font-semibold text-slate-500 mb-2">Landlord signature</p>
            <img src={landlordSig} alt="landlord signature" className="h-16 object-contain" />
          </section>
        )}

        <button
          onClick={save}
          disabled={saving}
          className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold print:hidden"
        >
          {saving ? "Saving..." : tenantMode ? "Save ID and signature" : "Save lease"}
        </button>
      </main>
    </div>
  );
}
