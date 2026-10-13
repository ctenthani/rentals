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
 try{
  const {user,admin}=clients(req);const {data:identity,error:authError}=await user.auth.getUser();if(authError||!identity.user)return reply({error:'Sign in first'},401);
  const {data:active}=await user.rpc('rentozi_user_enabled');if(!active)return reply({error:'This account has been removed'},403);
  const body=await req.json(),to=String(body.to||'').trim().toLowerCase();if(!to||typeof body.subject!=='string'||body.subject.length>200||String(body.html||body.text||'').length>50000)return reply({error:'Invalid message'},400);
  const {data:allowed,error:scopeError}=await user.rpc('rentozi_email_recipient',{p_email:to});if(scopeError||!allowed)return reply({error:'Recipient is outside your rental account, or the hourly limit was reached'},403);
  const id=await mail(admin,identity.user.id,to,body.subject,body.html||'<p>'+esc(body.text)+'</p>',body.request_id?'notice-'+String(body.request_id).slice(0,100):undefined);
  return reply({success:true,provider_id:id,status:'accepted'});
 }catch(error){return reply({error:(error as Error).message||'Could not send notification'},502);}
});
