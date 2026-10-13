import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"https://rentozi.netlify.app","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-cron-secret","Access-Control-Allow-Methods":"POST, OPTIONS"};
function reply(body: unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});}
function clients(req: Request){
 const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const user=createClient(url,anon,{global:{headers:{Authorization:req.headers.get("Authorization")||""}},auth:{persistSession:false}});
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 return {user,admin};
}


function esc(value: unknown){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
async function mail(admin: any,actor: string|null,to: string,subject: string,html: string,key?: string){
 const apiKey=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('EMAIL_FROM');
 if(!apiKey||!from)throw Error('Rentozi email sender configuration is unavailable');
 let status='unknown',providerId=null,error=null;
 try{
  const r=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(12000),headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify({from,to:[to],subject,html})});
  const result=await r.json().catch(()=>({}));status=r.ok?'accepted':'failed';providerId=r.ok?result.id:null;error=r.ok?null:String(result.message||'Email provider rejected this message').slice(0,250);
 }catch{error='Delivery could not be confirmed. Check email before retrying.';}
 await admin.from('rentozi_email_log').insert({actor_id:actor,recipient:to,subject,status,provider_id:providerId,error});
 if(status!=='accepted')throw Error(error||'Could not send email');return providerId;
}
function checkedLink(link: string,redirect: string){
 const target=new URL(link);if(target.origin!==Deno.env.get('SUPABASE_URL')||target.searchParams.get('redirect_to')!==redirect)throw Error('Rentozi authentication redirect is not allowed. Check the project URL configuration.');return link;
}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return reply({error:'Use POST'},405);
 const configured=Deno.env.get('CRON_SECRET'),secret=req.headers.get('x-cron-secret')||new URL(req.url).searchParams.get('secret');if(!configured||secret!==configured)return reply({error:'Unauthorized'},401);
 if(!Deno.env.get('RESEND_API_KEY')||!Deno.env.get('EMAIL_FROM'))return reply({error:'A configured email sender is required; no reminders were counted as sent'},503);
 try{
  const {admin}=clients(req),{error:duesError}=await admin.rpc('run_monthly_dues');if(duesError)throw Error('Could not refresh rent due dates');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Blantyre',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let sent=0,failed=0,skipped=0;
  for(const days of [7,2]){
   const when=new Date(today+'T12:00:00Z');when.setUTCDate(when.getUTCDate()+days);const due=when.toISOString().slice(0,10);
   const {data:balances,error}=await admin.from('tenant_balances').select('tenant_id,next_due_date,current_balance').eq('next_due_date',due);if(error)throw Error('Could not load due reminders');
   for(const b of balances||[]){
    const {data:already,error:logError}=await admin.from('rent_reminders').select('id').eq('tenant_id',b.tenant_id).eq('due_date',due).eq('days_before',days).maybeSingle();if(logError)throw Error('Could not check reminder history');if(already){skipped++;continue;}
    const {data:tenant,error:tenantError}=await admin.from('tenants').select('full_name,email,is_active,houses(name,code,monthly_rent)').eq('id',b.tenant_id).maybeSingle();if(tenantError)throw Error('Could not load reminder recipient');if(!tenant?.email||!tenant.is_active){skipped++;continue;}
    const {data:claimed,error:claimError}=await admin.rpc('rentozi_claim_reminder',{p_tenant:b.tenant_id,p_due:due,p_days:days});if(claimError)throw Error('Could not claim reminder');if(!claimed){skipped++;continue;}
    const house=Array.isArray(tenant.houses)?tenant.houses[0]:tenant.houses,key='rent-reminder-'+b.tenant_id+'-'+due+'-'+days;
    try{
     await mail(admin,null,tenant.email,'Rent reminder: due in '+days+' days','<p>Hello '+esc(tenant.full_name)+',</p><p>Rent for '+esc(house?.code||house?.name||'your property')+' is due on '+due+'.</p><p>Amount: MK '+Number(house?.monthly_rent||0).toLocaleString()+'</p><p>Please ignore this if already paid.</p><p><a href="https://rentozi.netlify.app/auth/login">Open Rentozi</a></p>',key);
     const {error:saved}=await admin.from('rent_reminders').insert({tenant_id:b.tenant_id,due_date:due,days_before:days});if(saved)throw Error('Delivery accepted but reminder history could not be saved');const {error:marked}=await admin.from('rentozi_reminder_jobs').update({sent_at:new Date().toISOString(),error:null}).eq('tenant_id',b.tenant_id).eq('due_date',due).eq('days_before',days);if(marked)throw Error('Could not finish reminder history');sent++;
    }catch(error){await admin.from('rentozi_reminder_jobs').update({error:(error as Error).message}).eq('tenant_id',b.tenant_id).eq('due_date',due).eq('days_before',days);failed++;}
   }
  }
  return reply({success:failed===0,sent,failed,skipped},failed?207:200);
 }catch(error){return reply({error:(error as Error).message},503);}
});
