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
  const body=await req.json(),email=String(body.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({error:'Enter a valid email'},400);
  const kind='manager',target=body.landlord_id;
  const {data:invitation,error:prepareError}=await user.rpc('rentozi_prepare_invitation',{p_kind:kind,p_target:target,p_email:email,p_name:String(body.full_name||email),p_business:body.business_name||null});
  if(prepareError||!invitation)return reply({error:prepareError?.message||'Could not prepare invitation'},prepareError?.code==='42501'?403:400);
  const {data:existing,error:lookupError}=await admin.rpc('rentozi_auth_user_id',{p_email:email});if(lookupError)throw Error('Could not check invitation recipient');
  if(existing){const {data:control}=await admin.from('rentozi_user_controls').select('disabled').eq('user_id',existing).maybeSingle();if(control?.disabled)return reply({error:'This user has been removed. The site owner must restore access first.'},409);}
  const redirect='https://rentozi.netlify.app/auth/accept-invite?invite='+invitation;
  const params=existing?{type:'magiclink' as const,email,options:{redirectTo:redirect}}:{type:'invite' as const,email,options:{redirectTo:redirect,data:{role:kind,full_name:String(body.full_name||email)}}};
  const {data:generated,error:linkError}=await admin.auth.admin.generateLink(params);
  if(linkError||!generated.properties?.action_link)return reply({error:'Could not generate a secure invitation. Retry or ask the site owner to check authentication settings.'},502);
  try{const link=checkedLink(generated.properties.action_link,redirect);await mail(admin,identity.user.id,email,'Your Rentozi '+kind+' invitation','<p>You have been invited to Rentozi as a '+kind+'.</p><p><a href="'+esc(link)+'">Review and accept your invitation</a></p><p>'+ (existing?'Keep your existing password.':'After accepting, choose your own password.')+'</p>','invitation-'+invitation);await admin.from('rentozi_invitations').update({sent_at:new Date().toISOString(),delivery_error:null}).eq('id',invitation);}
  catch(error){await admin.from('rentozi_invitations').update({delivery_error:String((error as Error).message).slice(0,250)}).eq('id',invitation);return reply({error:(error as Error).message},502);}
  return reply({success:true,invited:true,existing_account:!!existing,email,message:'Invitation sent. The recipient must accept it to link their profile.'});
 }catch{return reply({error:'Could not complete invitation. Your saved profile is retained.'},500);}
});
