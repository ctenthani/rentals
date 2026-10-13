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
  const {data:owner,error:ownerError}=await user.rpc('rentozi_is_platform_owner');if(ownerError||!owner)return reply({error:'Only the site owner can manage platform users'},403);
  const body=await req.json(),action=body.action||'list';
  if(action==='list'){
   const page=Math.max(1,Math.min(10000,Number(body.page)||1));const {data:accounts,error}=await admin.auth.admin.listUsers({page,perPage:100});if(error)throw Error('Could not load users');
   const ids=accounts.users.map(u=>u.id);
   const [tenants,landlords,members,controls,owners,ownTenants,pending]=await Promise.all([
    admin.from('tenants').select('id,auth_user_id,full_name,is_active').in('auth_user_id',ids),admin.from('landlords').select('id,auth_user_id,business_name').in('auth_user_id',ids),admin.from('landlord_members').select('auth_user_id,role').in('auth_user_id',ids),admin.from('rentozi_user_controls').select('user_id,disabled').in('user_id',ids),admin.from('rentozi_platform_owners').select('user_id'),admin.from('tenants').select('id,full_name,is_active,houses(name,code)').eq('auth_user_id',identity.user.id),admin.from('rentozi_invitations').select('email,kind,status').eq('status','pending')]);
   if([tenants,landlords,members,controls,owners,ownTenants,pending].some(r=>r.error))throw Error('Could not load user roles');
   return reply({users:accounts.users.map(u=>{const roles=[...new Set([...(tenants.data||[]).filter(t=>t.auth_user_id===u.id).map(()=> 'Tenant'),...(landlords.data||[]).filter(l=>l.auth_user_id===u.id).map(()=> 'Landlord'),...(members.data||[]).filter(m=>m.auth_user_id===u.id).map(m=>m.role==='owner'?'Business owner':'Co-manager')])];const protectedOwner=(owners.data||[]).some(o=>o.user_id===u.id);return{id:u.id,email:u.email,name:String(u.user_metadata?.full_name||(tenants.data||[]).find(t=>t.auth_user_id===u.id)?.full_name||(landlords.data||[]).find(l=>l.auth_user_id===u.id)?.business_name||'').slice(0,200),created_at:u.created_at,last_sign_in_at:u.last_sign_in_at,verified:!!u.email_confirmed_at,roles,tenant_profiles:(tenants.data||[]).filter(t=>t.auth_user_id===u.id).map(t=>({id:t.id,name:t.full_name})),pending:(pending.data||[]).filter(i=>i.email===u.email).map(i=>i.kind),removed:(controls.data||[]).some(c=>c.user_id===u.id&&c.disabled),protected:protectedOwner,can_delete_unused:!protectedOwner&&roles.length===0};}),total:accounts.total||accounts.users.length,next_page:accounts.users.length===100?(accounts.nextPage||page+1):null,own_tenants:ownTenants.data});
  }
  if(action==='diagnostics'){
   const {data:logs,error}=await admin.from('rentozi_email_log').select('id,recipient,subject,status,error,provider_id,created_at').order('created_at',{ascending:false}).limit(30);if(error)throw Error('Could not load delivery history');return reply({sender_address:Deno.env.get('EMAIL_FROM')?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]||null,sender_configured:!!Deno.env.get('EMAIL_FROM'),key_configured:!!Deno.env.get('RESEND_API_KEY'),transport:'Resend: notices and Supabase-generated authentication links',logs});
  }
  if(action==='test-email'){
   const kinds=['notification','invitation','recovery','reminder'];if(!kinds.includes(body.kind))return reply({error:'Choose a test type'},400);
   const {data:allowed,error}=await user.rpc('rentozi_email_recipient',{p_email:identity.user.email});if(error||!allowed)return reply({error:'Hourly email limit reached'},429);
   let html='<p>Rentozi '+esc(body.kind)+' delivery test.</p><p>This message verifies the configured sender. No rent or payment record was changed.</p>';
   if(['invitation','recovery'].includes(body.kind)){
    const redirect='https://rentozi.netlify.app/auth/'+(body.kind==='recovery'?'reset-password':'login');const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:body.kind==='recovery'?'recovery':'magiclink',email:identity.user.email!,options:{redirectTo:redirect}});if(linkError||!link.properties?.action_link)throw Error('Could not generate the authentication test link');html+='<p><a href="'+esc(checkedLink(link.properties.action_link,redirect))+'">Open your '+esc(body.kind)+' link</a></p><p>Your existing password has not been changed.</p>';
   }
   const id=await mail(admin,identity.user.id,identity.user.email!,'Rentozi '+body.kind+' test',html);return reply({success:true,provider_id:id,message:'Accepted by the email provider. Check your inbox.'});
  }
  const id=String(body.user_id||''),{data:target,error:lookup}=await admin.auth.admin.getUserById(id);if(lookup||!target.user)return reply({error:'User not found'},404);
  if(String(body.confirm_email||'').trim().toLowerCase()!==(target.user.email||id).toLowerCase())return reply({error:'Type the selected user’s email to confirm'},400);
  const {data:protectedOwner,error:protectionError}=await admin.from('rentozi_platform_owners').select('user_id').eq('user_id',id).maybeSingle();if(protectionError)throw Error('Could not verify owner protection');if(protectedOwner||id===identity.user.id)return reply({error:'Owner logins are protected. Remove your tenant role separately.'},409);
  if(action==='detach-tenant'){
   const {error}=await user.rpc('rentozi_detach_tenant_login',{p_tenant:body.tenant_id,p_user:id,p_reason:String(body.reason||'')});if(error)return reply({error:error.message},400);return reply({success:true});
  }
  if(action==='delete-unused'){
   const {data:unused,error}=await user.rpc('rentozi_unused_user',{p_user:id});if(error||!unused)return reply({error:'This login is linked to rental history or is protected. Remove access instead.'},409);
   const {error:deleted}=await admin.auth.admin.deleteUser(id);if(deleted)return reply({error:'Deletion was blocked by linked records. Remove access instead.'},409);
   await admin.from('rentozi_admin_events').insert({actor:identity.user.id,target:id,action:'delete_unused_login',details:{email:target.user.email}});return reply({success:true});
  }
  if(!['remove','restore'].includes(action))return reply({error:'Unknown action'},400);
  if(String(body.reason||'').trim().length<3)return reply({error:'Enter a reason'},400);
  if(action==='restore'){const {error}=await admin.auth.admin.updateUserById(id,{ban_duration:'none'});if(error)throw Error('Could not restore authentication access');}
  const {error:scopeError}=await user.rpc('rentozi_set_user_access',{p_user:id,p_enabled:action==='restore',p_reason:String(body.reason||'')});if(scopeError)return reply({error:scopeError.message},scopeError.code==='42501'?403:400);
  let warning=null;if(action==='remove'){const {error}=await admin.auth.admin.updateUserById(id,{ban_duration:'876000h'});if(error)warning='Application access removed. Authentication suspension needs a retry.';}
  return reply({success:true,warning});
 }catch(error){return reply({error:(error as Error).message||'User management unavailable'},503);}
});
