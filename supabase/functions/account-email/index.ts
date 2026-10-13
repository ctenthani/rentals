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
async function digest(value: string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(n=>n.toString(16).padStart(2,'0')).join('');}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return reply({error:'Use POST'},405);
 if(req.headers.get('origin')&&req.headers.get('origin')!=='https://rentozi.netlify.app')return reply({error:'Open Rentozi to request account emails'},403);
 try{
  const text=await req.text();if(text.length>4096)return reply({error:'Request too large'},413);const body=JSON.parse(text),email=String(body.email||'').trim().toLowerCase(),kind=body.kind;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!['signup','recovery'].includes(kind))return reply({error:'Enter a valid email and request type'},400);
  if(kind==='signup'&&(typeof body.password!=='string'||body.password.length<8||body.password.length>128))return reply({error:'Use a password of 8–128 characters'},400);
  const {admin}=clients(req);if(!Deno.env.get('RESEND_API_KEY')||!Deno.env.get('EMAIL_FROM'))return reply({error:'Account email delivery is not configured. Contact the site owner.'},503);
  const {data:allowed,error:rateError}=await admin.rpc('rentozi_claim_auth_mail',{p_email_hash:await digest(email),p_ip_hash:await digest(req.headers.get('x-forwarded-for')||req.headers.get('cf-connecting-ip')||'unknown')});if(rateError)throw Error('Account email service unavailable');if(!allowed)return reply({error:'Too many email requests. Wait before trying again.'},429);
  const generic={success:true,message:'If this address is eligible, an email has been sent. Check your inbox and spam folder.'};
  const {data:existing,error:lookup}=await admin.rpc('rentozi_auth_user_id',{p_email:email});if(lookup)throw Error('Account email service unavailable');
  if(existing){const {data:control}=await admin.from('rentozi_user_controls').select('disabled').eq('user_id',existing).maybeSingle();if(control?.disabled)return reply(generic);}
  if(kind==='recovery'&&!existing)return reply(generic);
  let type: 'signup'|'recovery'|'magiclink'=kind;
  if(kind==='signup'&&existing){const {data:old}=await admin.auth.admin.getUserById(existing);if(old.user?.email_confirmed_at)return reply(generic);type='magiclink';}
  const redirect='https://rentozi.netlify.app/auth/'+(kind==='recovery'?'reset-password':'login');
  const params=type==='signup'?{type,email,password:body.password,options:{redirectTo:redirect,data:{role:'landlord',full_name:String(body.full_name||'').slice(0,200),business_name:String(body.business_name||'').slice(0,200)}}}:{type,email,options:{redirectTo:redirect}};
  const {data:generated,error}=await admin.auth.admin.generateLink(params);if(error||!generated.properties?.action_link)throw Error('Could not prepare account email. Try again later.');
  const link=checkedLink(generated.properties.action_link,redirect);
  await mail(admin,null,email,kind==='signup'?'Confirm your Rentozi account':'Reset your Rentozi password','<p><a href="'+esc(link)+'">'+(kind==='signup'?'Confirm your email and sign in':'Choose a new password')+'</a></p><p>If you did not request this, you can ignore this email.</p>');
  return reply(generic);
 }catch(error){return reply({error:(error as Error).message||'Account email service unavailable'},503);}
});
