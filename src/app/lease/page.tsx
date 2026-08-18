"use client";

import { useEffect, useRef, useState } from "react";
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

function SignaturePad({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [mode, setMode] = useState<"draw" | "upload">("draw");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode !== "draw") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }, [mode]);

  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return {
        x: (t.clientX - rect.left) * scaleX,
        y: (t.clientY - rect.top) * scaleY,
      };
    }
    const m = e as React.MouseEvent;
    return {
      x: (m.clientX - rect.left) * scaleX,
      y: (m.clientY - rect.top) * scaleY,
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
    if (canvasRef.current) onChange(canvasRef.current.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (canvas)
      canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2 text-xs no-print">
        <button
          type="button"
          onClick={() => setMode("draw")}
          className={`px-2 py-1 rounded-lg ${
            mode === "draw" ? "bg-emerald-100 text-emerald-800" : "text-slate-500"
          }`}
        >
          Draw
        </button>
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`px-2 py-1 rounded-lg ${
            mode === "upload"
              ? "bg-emerald-100 text-emerald-800"
              : "text-slate-500"
          }`}
        >
          Upload
        </button>
        <button type="button" onClick={clear} className="text-slate-500">
          Clear
        </button>
      </div>
      {value && (
        <img
          src={value}
          alt="Signature"
          className="max-h-20 border rounded bg-white"
        />
      )}
      <div className="no-print">
        {mode === "draw" ? (
          <canvas
            ref={canvasRef}
            width={400}
            height={120}
            className="w-full border rounded-xl bg-white touch-none cursor-crosshair"
            onMouseDown={start}
            onMouseMove={move}
            onMouseUp={end}
            onMouseLeave={end}
            onTouchStart={start}
            onTouchMove={move}
            onTouchEnd={end}
          />
        ) : (
          <input type="file" accept="image/*" onChange={onFile} className="block w-full text-sm" />
        )}
      </div>
    </div>
  );
}

export default function TenantLeasePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lease, setLease] = useState<any>(null);
  const [tenantName, setTenantName] = useState("");
  const [phone, setPhone] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [houseName, setHouseName] = useState("");
  const [houseCode, setHouseCode] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [landlordBusiness, setLandlordBusiness] = useState(
    "Chifundo and Wezzie"
  );
  const [landlordName, setLandlordName] = useState(
    "Chifundo and Wezzie Tenthani"
  );
  const [monthlyRent, setMonthlyRent] = useState(0);
  const [tenantSig, setTenantSig] = useState<string | null>(null);
  const [tenantSigner, setTenantSigner] = useState("");

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

      const { data: tenant, error: tErr } = await supabase
        .from("tenants")
        .select(
          `id, full_name, phone, national_id, landlord_id,
           houses ( name, code, monthly_rent, bank_account )`
        )
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (tErr || !tenant) {
        setError("No tenant profile linked to this login");
        setLoading(false);
        return;
      }

      const house = Array.isArray(tenant.houses)
        ? tenant.houses[0]
        : tenant.houses;

      setTenantName(tenant.full_name || "");
      setPhone(tenant.phone || "");
      setNationalId(tenant.national_id || "");
      setHouseName(house?.name || "");
      setHouseCode(house?.code || "");
      setBankAccount(house?.bank_account || "");
      setMonthlyRent(Number(house?.monthly_rent || 0));
      setTenantSigner(tenant.full_name || "");

      // Always show landlord names (fallback + DB)
      setLandlordBusiness("Chifundo and Wezzie");
      setLandlordName("Chifundo and Wezzie Tenthani");

      if (tenant.landlord_id) {
        const { data: ll } = await supabase
          .from("landlords")
          .select("full_name, business_name")
          .eq("id", tenant.landlord_id)
          .maybeSingle();
        if (ll?.business_name) setLandlordBusiness(ll.business_name);
        if (ll?.full_name) setLandlordName(ll.full_name);
      }

      const { data: leaseRow } = await supabase
        .from("leases")
        .select("*")
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!leaseRow) {
        setError("Your landlord has not created a lease yet.");
        setLoading(false);
        return;
      }

      setLease(leaseRow);
      if (leaseRow.tenant_signature) setTenantSig(leaseRow.tenant_signature);
      if (leaseRow.tenant_signer_name)
        setTenantSigner(leaseRow.tenant_signer_name);
      if (leaseRow.landlord_signer_name)
        setLandlordName(leaseRow.landlord_signer_name);
      if (leaseRow.monthly_rent) setMonthlyRent(Number(leaseRow.monthly_rent));
      setLoading(false);
    }
    load();
  }, [router]);

  const handleSaveSignature = async () => {
    if (!tenantSig) {
      setError("Please draw or upload your signature first");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    const { data, error: rpcError } = await supabase.rpc("tenant_sign_lease", {
      p_tenant_signature: tenantSig,
      p_tenant_signer_name: tenantSigner || tenantName,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    if (data?.success === false) {
      setError(data.error || "Could not save");
      return;
    }
    setSuccess("Signature saved");
    setLease((prev: any) =>
      prev
        ? {
            ...prev,
            tenant_signature: tenantSig,
            tenant_signer_name: tenantSigner,
            tenant_signed_at: new Date().toISOString(),
          }
        : prev
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Loading lease...</p>
      </div>
    );
  }

  if (error && !lease) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-4">
        <p className="text-red-600 text-sm text-center">{error}</p>
        <Link href="/tenant" className="text-green-700 text-sm font-medium">
          ← Tenant portal
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 no-print">
          <Link href="/tenant" className="text-sm text-slate-600">
            ← Tenant portal
          </Link>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="border px-4 py-2 rounded-xl text-sm font-medium"
            >
              Download / Print PDF
            </button>
            <button
              type="button"
              onClick={handleSaveSignature}
              disabled={saving}
              className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save my signature"}
            </button>
          </div>
        </div>
        {error && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded-xl no-print">
            {error}
          </p>
        )}
        {success && (
          <p className="mb-4 text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl no-print">
            {success}
          </p>
        )}

        <article
          id="lease-document"
          className="border-2 border-slate-800 p-6 sm:p-8"
        >
          <h1 className="text-xl font-bold text-center mb-6">
            RESIDENTIAL TENANCY AGREEMENT
          </h1>
          <div className="grid sm:grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <p className="text-xs uppercase text-slate-500 font-semibold">
                Landlord
              </p>
              <p className="font-medium">{landlordBusiness}</p>
              <p className="text-slate-600">{landlordName}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500 font-semibold">
                Tenant
              </p>
              <p className="font-medium">{tenantName}</p>
              <p className="text-slate-600">{phone}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500 font-semibold">
                Premises
              </p>
              <p className="font-medium">
                {houseName} ({houseCode})
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500 font-semibold">
                Rent payment account
              </p>
              <p className="font-medium">{bankAccount || "—"}</p>
            </div>
          </div>
          <div className="text-sm space-y-1 mb-4">
            <p>
              <strong>National ID:</strong> {nationalId || "—"}
            </p>
            <p>
              <strong>Lease period:</strong> {lease?.start_date || "—"} to{" "}
              {lease?.end_date || "open"}
            </p>
            <p>
              <strong>Monthly rent:</strong>{" "}
              {formatMK(Number(lease?.monthly_rent || monthlyRent))}
            </p>
            <p>
              <strong>Deposit:</strong>{" "}
              {formatMK(Number(lease?.deposit_amount || 0))}
            </p>
          </div>
          <h2 className="text-sm font-bold uppercase mb-2">
            Terms and conditions
          </h2>
          <div className="text-sm leading-relaxed whitespace-pre-wrap mb-8">
            {lease?.terms || "No terms saved yet."}
          </div>
          <div className="grid sm:grid-cols-2 gap-8">
            <div className="space-y-2">
              <p className="text-sm font-semibold">Landlord</p>
              <p className="text-sm">
                {lease?.landlord_signer_name || landlordName}
              </p>
              {lease?.landlord_signature ? (
                <img
                  src={lease.landlord_signature}
                  alt="Landlord"
                  className="max-h-20 border rounded bg-white"
                />
              ) : (
                <p className="text-xs text-slate-400">
                  Awaiting landlord signature
                </p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">Tenant</p>
              <input
                value={tenantSigner}
                onChange={(e) => setTenantSigner(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm no-print"
              />
              <p className="text-sm only-print">{tenantSigner}</p>
              <div className="no-print">
                <SignaturePad value={tenantSig} onChange={setTenantSig} />
              </div>
              {(tenantSig || lease?.tenant_signature) && (
                <img
                  src={tenantSig || lease.tenant_signature}
                  alt="Tenant"
                  className="max-h-20 border rounded bg-white only-print"
                />
              )}
            </div>
          </div>
        </article>
      </div>
      <style jsx global>{`
        .only-print {
          display: none;
        }
        @media print {
          .no-print {
            display: none !important;
          }
          .only-print {
            display: block !important;
          }
          body {
            background: white;
          }
          #lease-document {
            border: 1px solid #000;
          }
          @page {
            margin: 12mm;
            size: A4;
          }
        }
      `}</style>
    </div>
  );
}
