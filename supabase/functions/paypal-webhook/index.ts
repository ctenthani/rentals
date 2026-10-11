
// Do not grant paid access from unsigned or unverified events.
Deno.serve(()=>new Response(JSON.stringify({error:"Webhook verification and capture reconciliation are not configured"}),{status:503,headers:{"Content-Type":"application/json"}}));
