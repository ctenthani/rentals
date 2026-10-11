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
  const {user}=clients(req);const {data:identity,error:authError}=await user.auth.getUser();
  if(authError||!identity.user)return reply({error:"Sign in first"},401);
  const body=await req.json(),to=String(body.to||"").trim().toLowerCase();
  if(!to||typeof body.subject!=="string"||body.subject.length>200||String(body.html||body.text||"").length>50000)return reply({error:"Invalid message"},400);
  const {data:allowed,error:scopeError}=await user.rpc("rentozi_email_recipient",{p_email:to});
  if(scopeError||!allowed)return reply({error:"This recipient is outside your rental account, or the hourly limit was reached"},403);
  const key=Deno.env.get("RESEND_API_KEY"),from=Deno.env.get("EMAIL_FROM");
  if(!key||!from)return reply({error:"A verified email sender must be configured"},503);
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from,to:[to],subject:body.subject,html:body.html,text:body.text})});
  if(!response.ok)return reply({error:"Email provider rejected the message; the saved record is unchanged"},502);
  return reply({success:true});
 }catch{return reply({error:"Could not send notification"},500);}
});
