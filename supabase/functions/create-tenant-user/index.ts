import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"https://rentozi.netlify.app","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-cron-secret","Access-Control-Allow-Methods":"POST, OPTIONS"};
function reply(body: unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});}
function clients(req: Request){
 const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const user=createClient(url,anon,{global:{headers:{Authorization:req.headers.get("Authorization")||""}},auth:{persistSession:false}});
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 return {user,admin};
}

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"Use POST"},405);
 try{
  const {user,admin}=clients(req);
  const {data:identity,error:authError}=await user.auth.getUser();
  if(authError||!identity.user)return reply({error:"Sign in first"},401);
  const body=await req.json(),email=String(body.email||"").trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({error:"Enter a valid email"},400);
  
  const {data:tenant,error:tenantError}=await user.from("tenants").select("id,landlord_id,auth_user_id,email,full_name").eq("id",body.tenant_id).maybeSingle();
  const {data:allowed,error:scopeError}=await user.rpc("rentozi_tenant_access",{p_tenant:body.tenant_id,p_manage:true});
  if(tenantError||scopeError||!tenant||!allowed)return reply({error:"Only this tenant's landlord or co-manager can send an invitation"},403);
  if(tenant.auth_user_id)return reply({error:"A login is already linked. The tenant must use password recovery themselves."},409);
  if((tenant.email||"").trim().toLowerCase()!==email)return reply({error:"Save this email on the tenant record first"},400);
  // Existing accounts are never reset, reassigned, or removed by this endpoint.
  const {data:created,error:inviteError}=await admin.auth.admin.inviteUserByEmail(email,{data:{role:"tenant",full_name:String(body.full_name||email)},redirectTo:"https://rentozi.netlify.app/auth/reset-password"});
  if(inviteError||!created.user)return reply({error:"Could not invite this email. Existing users must keep their own login; use the existing-user invitation option."},409);
  
  const {data:linked,error:linkError}=await admin.from("tenants").update({auth_user_id:created.user.id}).eq("id",tenant.id).is("auth_user_id",null).select("id");
  if(linkError||linked?.length!==1)return reply({error:"Invitation sent, but tenant linkage needs review. Do not retry by resetting a password."},409);
  return reply({success:true,invited:true,email});
 }catch{return reply({error:"Could not complete invitation"},500);}
});
