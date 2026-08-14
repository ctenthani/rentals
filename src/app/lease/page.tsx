"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

const SUPABASE_URL = "https://favhmbrpisstrwgytapl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdmhtYnJwaXNzdHJ3Z3l0YXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTM5MzIsImV4cCI6MjEwMTY4OTkzMn0.6V2oE161lKWAATnZDxQiGFLfoRifoRrH7MSb0MHTJ3U";

const DEFAULT_CLAUSES = `RESIDENTIAL TENANCY AGREEMENT – REPUBLIC OF MALAWI

1. PARTIES AND PREMISES
The Landlord lets and the Tenant takes the premises described in this agreement for residential use only.

2. RENT
The Tenant shall pay the monthly rent stated herein in Malawi Kwacha (MK), on or before the agreed payment day of each month, to the Landlord's nominated bank or mobile money account. Late payment may attract a written demand and, where agreed, a reasonable late fee.

3. DEPOSIT
The Tenant shall pay a security deposit as stated herein. The deposit shall be held by the Landlord and refunded within a reasonable period after move-out, less lawful deductions for unpaid rent, utilities owed by the Tenant, or damage beyond fair wear and tear. An inventory should be agreed at move-in and move-out where practical.

4. TERM AND RENEWAL
The tenancy runs from the start date to the end date stated herein. If the Tenant remains in occupation with the Landlord's consent after the end date without a new written agreement, the tenancy may continue month-to-month on the same terms until terminated by either party with the notice period below.

5. NOTICE AND TERMINATION
Either party may terminate this agreement by giving written notice of not less than the notice period stated herein (default 30 days), unless a longer period is required by any applicable law or mutual written variation. The Landlord may seek vacant possession for material breach (including non-payment of rent after demand, illegal use, or serious damage) in accordance with applicable law.

6. USE AND OCCUPATION
The premises shall be used only as a private dwelling. The Tenant shall not sublet, assign, or part with possession without the Landlord's prior written consent. The Tenant shall not carry on any unlawful activity on the premises.

7. CARE OF PREMISES
The Tenant shall keep the interior reasonably clean and shall not cause damage beyond fair wear and tear. The Tenant shall report structural defects, water leaks, and electrical hazards promptly. Alterations require the Landlord's written consent.

8. UTILITIES AND OUTGOINGS
Unless otherwise agreed in writing, the Tenant is responsible for electricity, water, and other metered utilities consumed during the tenancy. The Landlord remains responsible for structural repairs and rates/taxes on the property unless otherwise agreed.

9. ACCESS
The Landlord or agent may enter the premises at reasonable times, with reasonable prior notice (except in emergency), to inspect, repair, or show the premises.

10. DISPUTE RESOLUTION
The parties shall first attempt to resolve disputes amicably. Nothing in this agreement limits either party's rights under the laws of Malawi.

11. ENTIRE AGREEMENT
This document constitutes the whole agreement. Variations must be in writing and signed or authenticated by both parties.

12. ELECTRONIC SIGNATURES
The parties agree that signatures applied electronically on this platform may be used to execute this agreement to the extent permitted under applicable Malawian law.`;

function formatMK(amount: number) {
  return new Intl.NumberFormat("en-MW", {
    style: "currency",
    currency: "MWK",
    minimumFractionDigits: 0,
  })
    .format(amount)
    .replace("MWK", "MK");
}

function SignaturePad({
  label,
  onChange,
}: {
  label: string;
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }, []);

  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const end = () => {
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        <button
          type="button"
          onClick={clear}
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={400}
        height={140}
        className="w-full border border-slate-200 rounded-xl bg-white touch-none cursor-crosshair"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
    </div>
  );
}

export default function LeasePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [tenantName, setTenantName] = useState("");
  const [phone, setPhone] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [houseName, setHouseName] = useState("");
  const [houseCode, setHouseCode] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [landlordBusiness, setLandlordBusiness] = useState("");
  const [landlordName, setLandlordName] = useState("");

  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [deposit, setDeposit] = useState("");
  const [paymentDay, setPaymentDay] = useState("1");
  const [noticeDays, setNoticeDays] = useState("30");
  const [moveIn, setMoveIn] = useState("");
  const [terms, setTerms] = useState(DEFAULT_CLAUSES);

  const [landlordSig, setLandlordSig] = useState<string | null>(null);
  const [tenantSig, setTenantSig] = useState<string | null>(null);
  const [landlordSigner, setLandlordSigner] = useState("");
  const [tenantSigner, setTenantSigner] = useState("");

  const [existingLease, setExistingLease] = useState<any>(null);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tid = params.get("tenant_id");
    setTenantId(tid);

    async function load() {
      await supabase.rpc("expire_due_leases");

      if (!tid) {
        setError("Missing tenant_id");
        setLoading(false);
        return;
      }

      const { data: tenant, error: tErr } = await supabase
        .from("tenants")
        .select(
          `
          id, full_name, phone, email, national_id, move_in_date, landlord_id,
          houses ( name, code, monthly_rent, bank_account )
        `
        )
        .eq("id", tid)
        .maybeSingle();

      if (tErr || !tenant) {
        setError(tErr?.message || "Tenant not found");
        setLoading(false);
        return;
      }

      const house = Array.isArray(tenant.houses)
        ? tenant.houses[0]
        : tenant.houses;

      setTenantName(tenant.full_name || "");
      setPhone(tenant.phone || "");
      setNationalId(tenant.national_id || "");
      setMoveIn(tenant.move_in_date || "");
      setHouseName(house?.name || "");
      setHouseCode(house?.code || "");
      setBankAccount(house?.bank_account || "");
      setMonthlyRent(String(house?.monthly_rent || ""));
      setTenantSigner(tenant.full_name || "");

      if (tenant.landlord_id) {
        const { data: ll } = await supabase
          .from("landlords")
          .select("full_name, business_name")
          .eq("id", tenant.landlord_id)
          .maybeSingle();
        setLandlordName(ll?.full_name || "");
        setLandlordBusiness(ll?.business_name || "");
        setLandlordSigner(ll?.full_name || "");
      }

      const { data: lease } = await supabase
        .from("leases")
        .select("*")
        .eq("tenant_id", tid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lease) {
        setExistingLease(lease);
        setStartDate(lease.start_date || startDate);
        setEndDate(lease.end_date || "");
        setMonthlyRent(String(lease.monthly_rent || monthlyRent));
        setDeposit(String(lease.deposit_amount || "0"));
        setPaymentDay(String(lease.payment_day || "1"));
        setNoticeDays(String(lease.notice_period_days || "30"));
        if (lease.terms) setTerms(lease.terms);
        if (lease.landlord_signature) setLandlordSig(lease.landlord_signature);
        if (lease.tenant_signature) setTenantSig(lease.tenant_signature);
        if (lease.landlord_signer_name)
          setLandlordSigner(lease.landlord_signer_name);
        if (lease.tenant_signer_name) setTenantSigner(lease.tenant_signer_name);
      }

      setLoading(false);
    }

    load();
  }, []);

  const handleSave = async () => {
    if (!tenantId || !startDate || !monthlyRent) {
      setError("Start date and rent are required");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const { data, error: rpcError } = await supabase.rpc(
      "landlord_upsert_lease",
      {
        p_tenant_id: tenantId,
        p_start_date: startDate,
        p_end_date: endDate || null,
        p_monthly_rent: Number(monthlyRent),
        p_deposit: Number(deposit || 0),
        p_payment_day: Number(paymentDay || 1),
        p_notice_days: Number(noticeDays || 30),
        p_terms: terms,
        p_national_id: nationalId || null,
        p_move_in: moveIn || null,
        p_landlord_signature: landlordSig,
        p_landlord_signer_name: landlordSigner || null,
        p_tenant_signature: tenantSig,
        p_tenant_signer_name: tenantSigner || null,
      }
    );

    setSaving(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    if (data?.success === false) {
      setError(data.error || "Save failed");
      return;
    }

    setSuccess(
      `Lease saved (${data?.status || "active"}). ID: ${String(data?.lease_id || "").slice(0, 8)}`
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-slate-500">Loading lease...</p>
      </div>
    );
  }

  if (error && !tenantName) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-4">
        <p className="text-red-600">{error}</p>
        <Link href="/dashboard" className="text-green-700 text-sm">
          ← Dashboard
        </Link>
      </div>
    );
  }

  const status = existingLease?.status || "draft";
  const isExpired =
    status === "expired" ||
    (endDate && new Date(endDate) < new Date(new Date().toDateString()));

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-6 print:py-2">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 print:hidden">
          <Link href="/dashboard" className="text-sm text-slate-600">
            ← Dashboard
          </Link>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="border border-slate-200 px-4 py-2 rounded-xl text-sm font-medium"
            >
              Print / PDF
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-xl text-sm font-medium"
            >
              {saving ? "Saving..." : "Save lease"}
            </button>
          </div>
        </div>

        {error && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded-xl print:hidden">
            {error}
          </p>
        )}
        {success && (
          <p className="mb-4 text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl print:hidden">
            {success}
          </p>
        )}

        <div className="border-2 border-slate-800 rounded-lg p-6 sm:p-8">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold tracking-wide">
              RESIDENTIAL TENANCY AGREEMENT
            </h1>
            <p className="text-sm text-slate-600 mt-1">Republic of Malawi</p>
            <p className="text-xs mt-2">
              Status:{" "}
              <span
                className={`font-semibold uppercase ${
                  isExpired ? "text-red-600" : "text-emerald-700"
                }`}
              >
                {isExpired ? "expired" : status}
              </span>
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 text-sm mb-6">
            <div>
              <p className="text-slate-500 text-xs uppercase font-semibold">
                Landlord
              </p>
              <p className="font-medium">{landlordBusiness || landlordName}</p>
              <p className="text-slate-600">{landlordName}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs uppercase font-semibold">
                Tenant
              </p>
              <p className="font-medium">{tenantName}</p>
              <p className="text-slate-600">{phone}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs uppercase font-semibold">
                Premises
              </p>
              <p className="font-medium">
                {houseName} ({houseCode})
              </p>
            </div>
            <div>
              <p className="text-slate-500 text-xs uppercase font-semibold">
                Rent payment account
              </p>
              <p className="font-medium">{bankAccount || "—"}</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-6 print:hidden">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                National ID
              </label>
              <input
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Move-in date
              </label>
              <input
                type="date"
                value={moveIn}
                onChange={(e) => setMoveIn(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Lease start *
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full border rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Lease end
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Monthly rent (MK) *
              </label>
              <input
                type="number"
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Deposit (MK)
              </label>
              <input
                type="number"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Payment day of month
              </label>
              <input
                type="number"
                min={1}
                max={28}
                value={paymentDay}
                onChange={(e) => setPaymentDay(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Notice period (days)
              </label>
              <input
                type="number"
                value={noticeDays}
                onChange={(e) => setNoticeDays(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Print summary */}
          <div className="hidden print:grid grid-cols-2 gap-2 text-sm mb-6">
            <p>
              <span className="text-slate-500">National ID:</span>{" "}
              {nationalId || "—"}
            </p>
            <p>
              <span className="text-slate-500">Move-in:</span> {moveIn || "—"}
            </p>
            <p>
              <span className="text-slate-500">Start:</span> {startDate}
            </p>
            <p>
              <span className="text-slate-500">End:</span> {endDate || "Open"}
            </p>
            <p>
              <span className="text-slate-500">Rent:</span>{" "}
              {formatMK(Number(monthlyRent || 0))}
            </p>
            <p>
              <span className="text-slate-500">Deposit:</span>{" "}
              {formatMK(Number(deposit || 0))}
            </p>
            <p>
              <span className="text-slate-500">Payment day:</span> {paymentDay}
            </p>
            <p>
              <span className="text-slate-500">Notice:</span> {noticeDays} days
            </p>
          </div>

          <div className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wide mb-2">
              Terms and conditions
            </h2>
            <textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={16}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs leading-relaxed font-mono print:border-0 print:p-0"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-8 mt-8">
            <div className="space-y-3">
              <p className="text-sm font-semibold">Landlord signature</p>
              <input
                value={landlordSigner}
                onChange={(e) => setLandlordSigner(e.target.value)}
                placeholder="Full name"
                className="w-full border rounded-xl px-3 py-2 text-sm print:hidden"
              />
              {landlordSig ? (
                <img
                  src={landlordSig}
                  alt="Landlord signature"
                  className="border rounded-xl max-h-28 bg-white"
                />
              ) : (
                <div className="print:hidden">
                  <SignaturePad
                    label="Draw signature"
                    onChange={setLandlordSig}
                  />
                </div>
              )}
              <p className="text-xs text-slate-500">
                Date:{" "}
                {existingLease?.landlord_signed_at
                  ? new Date(existingLease.landlord_signed_at).toLocaleString()
                  : "—"}
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold">Tenant signature</p>
              <input
                value={tenantSigner}
                onChange={(e) => setTenantSigner(e.target.value)}
                placeholder="Full name"
                className="w-full border rounded-xl px-3 py-2 text-sm print:hidden"
              />
              {tenantSig ? (
                <img
                  src={tenantSig}
                  alt="Tenant signature"
                  className="border rounded-xl max-h-28 bg-white"
                />
              ) : (
                <div className="print:hidden">
                  <SignaturePad
                    label="Draw signature"
                    onChange={setTenantSig}
                  />
                </div>
              )}
              <p className="text-xs text-slate-500">
                Date:{" "}
                {existingLease?.tenant_signed_at
                  ? new Date(existingLease.tenant_signed_at).toLocaleString()
                  : "—"}
              </p>
            </div>
          </div>

          <p className="text-[10px] text-slate-400 mt-8 text-center">
            Template for private residential tenancy in Malawi. Not formal legal
            advice. Parties should seek independent advice where appropriate.
          </p>
        </div>
      </div>
    </div>
  );
}
