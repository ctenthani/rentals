import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const configured=Deno.env.get("CRON_SECRET");
  if(!configured||req.headers.get("x-cron-secret")!==configured)return new Response(JSON.stringify({error:"unauthorized"}),{status:401,headers:{...cors,"Content-Type":"application/json"}});
  if(req.method!=="POST")return new Response("Use POST",{status:405,headers:cors});
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Monthly dues status first
    await supabase.rpc("run_monthly_dues");

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from =
      Deno.env.get("EMAIL_FROM") || "Rentozi <noreply@rentozi.nsanja.app>";

    let sent = 0;

    for (const days of [7, 2]) {
      const { data: dueList, error } = await supabase.rpc(
        "tenants_due_in_days",
        { p_days: days }
      );
      if (error) throw error;

      for (const t of dueList || []) {
        if (!t.email) continue;

        const subject =
          days === 7
            ? `Rent reminder – due in 7 days (${t.house_code})`
            : `Rent reminder – due in 2 days (${t.house_code})`;

        const html = `
<p>Hello ${t.full_name},</p>
<p>This is a friendly reminder that rent for <strong>${t.house_name} (${t.house_code})</strong> is due on <strong>${t.next_due_date}</strong>.</p>
<p>Amount: <strong>MK ${Number(t.monthly_rent || 0).toLocaleString()}</strong></p>
<p><em>Please ignore this message if you have already paid.</em></p>
<p>Portal: <a href="https://rentozi.netlify.app/auth/login">https://rentozi.netlify.app/auth/login</a></p>
<p>Thank you for being a valued tenant.<br/>Rentozi Rentals — Chifundo and Wezzie Tenthani</p>`;

        if (resendKey) {
          const delivered = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from,
              to: [t.email],
              subject,
              html,
              text: `Hello ${t.full_name}, rent due ${t.next_due_date}. Ignore if already paid.`,
            }),
          });
        }

        await supabase.from("reminder_log").insert({
          tenant_id: t.tenant_id,
          reminder_type: `${days}day`,
          due_date: t.next_due_date,
        });
        sent++;
      }
    }

    return new Response(JSON.stringify({ success: true, sent }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});