import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"https://rentozi.netlify.app","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-cron-secret","Access-Control-Allow-Methods":"POST, OPTIONS"};
function reply(body: unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});}
function clients(req: Request){
 const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const user=createClient(url,anon,{global:{headers:{Authorization:req.headers.get("Authorization")||""}},auth:{persistSession:false}});
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 return {user,admin};
}

// Account and financial history deletion requires a reviewed export/retention process.
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 const {user}=clients(req);const {data:identity}=await user.auth.getUser();
 if(!identity.user)return reply({error:"Sign in first"},401);
 return reply({error:"Use recoverable property archiving. Account closure requires support review to preserve receipts and shared access."},409);
});
