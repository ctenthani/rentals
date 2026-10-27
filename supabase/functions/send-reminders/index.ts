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

// Reminder slots are stable (7 / 2 days); late runs use today's actual distance.
function malawiDay(now = new Date()) {
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Blantyre',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
function distance(due: string,today: string){return Math.round((Date.parse(due+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);}
function slot(due: string,today: string){const n=distance(due,today);return n>=0&&n<=7?(n<=2?2:7):null;}
async function runReminders(admin: any,dryRun: boolean,runId: string|null){
 const today=malawiDay(),until=new Date(today+'T12:00:00Z');until.setUTCDate(until.getUTCDate()+7);
 let sent=0,failed=0,skipped=0,eligible=0;const candidates: any[]=[];
 try{
  // Preview never writes balances, claims, history or email logs.
  if(!dryRun){const {error}=await admin.rpc('run_monthly_dues');if(error)throw Error('Could not refresh rent due dates');}
  const {data:balances,error}=await admin.from('tenant_balances').select('tenant_id,next_due_date,current_balance').gte('next_due_date',today).lte('next_due_date',until.toISOString().slice(0,10));if(error)throw Error('Could not load due reminders');
  for(const b of balances||[]){
   const days=slot(b.next_due_date,today);if(days===null)continue;
   const due=b.next_due_date,remaining=distance(due,today);
   const {data:already,error:logError}=await admin.from('rent_reminders').select('id').eq('tenant_id',b.tenant_id).eq('due_date',due).eq('days_before',days).maybeSingle();if(logError)throw Error('Could not check reminder history');if(already){skipped++;continue;}
   const {data:tenant,error:tenantError}=await admin.from('tenants').select('full_name,email,is_active,houses(name,code,monthly_rent)').eq('id',b.tenant_id).maybeSingle();if(tenantError)throw Error('Could not load reminder recipient');if(!tenant?.email||!tenant.is_active){skipped++;continue;}
   eligible++;candidates.push({tenant_id:b.tenant_id,due_date:due,days_remaining:remaining,reminder_slot:days});if(dryRun)continue;
   const {data:claimed,error:claimError}=await admin.rpc('rentozi_claim_reminder',{p_tenant:b.tenant_id,p_due:due,p_days:days});if(claimError)throw Error('Could not claim reminder');if(!claimed){skipped++;continue;}
   const house=Array.isArray(tenant.houses)?tenant.houses[0]:tenant.houses,key='rent-reminder-'+b.tenant_id+'-'+due+'-'+days;
   try{
    const when=remaining===0?'today':remaining===1?'tomorrow':'in '+remaining+' days';
    await mail(admin,null,tenant.email,'Rent reminder: due '+when,'<p>Hello '+esc(tenant.full_name)+',</p><p>Rent for <strong>'+esc(house?.code||house?.name||'your property')+'</strong> is due on <strong>'+due+'</strong> ('+when+').</p><p>Amount: MK '+Number(house?.monthly_rent||0).toLocaleString()+'</p><p>Please ignore this if already paid.</p><p><a href="https://rentozi.netlify.app/auth/login">Open Rentozi</a></p>',key);
    // Record provider acceptance before any subsequent operation can fail.
    const {error:marked}=await admin.from('rentozi_reminder_jobs').update({sent_at:new Date().toISOString(),error:null}).eq('tenant_id',b.tenant_id).eq('due_date',due).eq('days_before',days);if(marked)throw Error('Delivery accepted but reminder job could not be marked');
    const {error:saved}=await admin.from('rent_reminders').insert({tenant_id:b.tenant_id,due_date:due,days_before:days});if(saved)throw Error('Delivery accepted but reminder history could not be saved');sent++;
   }catch(error){const {error:jobError}=await admin.from('rentozi_reminder_jobs').update({error:(error as Error).message}).eq('tenant_id',b.tenant_id).eq('due_date',due).eq('days_before',days);if(jobError)throw Error('Could not record reminder failure');failed++;}
   // Stay below the provider's two-request-per-second rate limit.
   await new Promise(resolve=>setTimeout(resolve,600));
  }
  const result={success:failed===0,dry_run:dryRun,today,eligible,sent,failed,skipped,...(dryRun?{candidates}:{})};
  if(runId){const {error}=await admin.from('rentozi_reminder_runs').update({status:failed?'partial':'completed',finished_at:new Date().toISOString(),summary:result}).eq('id',runId);if(error)throw Error('Could not record reminder run completion');}
  return result;
 }catch(error){if(runId)await admin.from('rentozi_reminder_runs').update({status:'failed',finished_at:new Date().toISOString(),error:(error as Error).message,summary:{eligible,sent,failed,skipped}}).eq('id',runId);throw error;}
}
declare const EdgeRuntime: {waitUntil(promise: Promise<unknown>): void};
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return reply({error:'Use POST'},405);
 const configured=Deno.env.get('CRON_SECRET'),secret=req.headers.get('x-cron-secret');
 const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),bearer=req.headers.get('Authorization');
 const apiKey=req.headers.get('apikey');let secretKeys: unknown[]=[];try{secretKeys=Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}'));}catch{}
 const privileged=!!(serviceKey&&(bearer==='Bearer '+serviceKey||apiKey===serviceKey))||!!(apiKey&&secretKeys.includes(apiKey));
 if(!(configured&&secret===configured)&&!privileged)return reply({error:'Unauthorized'},401);
 if(!Deno.env.get('RESEND_API_KEY')||!Deno.env.get('EMAIL_FROM'))return reply({error:'A configured email sender is required; no reminders were counted as sent'},503);
 try{
  const body=await req.json().catch(()=>({})),dryRun=body.dry_run===true,{admin}=clients(req);
  if(dryRun)return reply(await runReminders(admin,true,null));
  const runId=crypto.randomUUID(),{error}=await admin.from('rentozi_reminder_runs').insert({id:runId,status:'running'});if(error)throw Error('Could not create reminder run log');
  if(body.background===true&&typeof EdgeRuntime!=='undefined'){
   EdgeRuntime.waitUntil(runReminders(admin,false,runId).catch(e=>console.error('Reminder run failed',runId,e.message)));
   return reply({accepted:true,run_id:runId},202);
  }
  const result=await runReminders(admin,false,runId);return reply({...result,run_id:runId},result.failed?207:200);
 }catch(error){return reply({error:(error as Error).message},503);}
});
