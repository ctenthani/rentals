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
  
  if(!["ctenthani@gmail.com","ctenthani@mubas.ac.mw"].includes((identity.user.email||"").toLowerCase()))return reply({error:"Only the platform owner can create landlords"},403);
  // Existing accounts are never reset, reassigned, or removed by this endpoint.
  const {data:created,error:inviteError}=await admin.auth.admin.inviteUserByEmail(email,{data:{role:"landlord",full_name:String(body.full_name||email)},redirectTo:"https://rentozi.netlify.app/auth/reset-password"});
  if(inviteError||!created.user)return reply({error:"Could not invite this email. Existing users must keep their own login; use the existing-user invitation option."},409);
  
  const {error:linkError}=await admin.from("landlords").insert({auth_user_id:created.user.id,email,full_name:String(body.full_name||email),business_name:String(body.business_name||"My Rentals")});
  if(linkError)return reply({error:"Invitation sent, but landlord profile needs review"},409);
  return reply({success:true,invited:true,email});
 }catch{return reply({error:"Could not complete invitation"},500);}
});
