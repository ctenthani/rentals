// Netlify invokes scheduled functions internally; there is no public HTTP trigger.
export const config={schedule:'0 6,12 * * *'};
export default async function(){
 const secret=process.env.CRON_SECRET;
 if(!secret)throw Error('CRON_SECRET is missing. No reminders were requested.');
 const response=await fetch('https://favhmbrpisstrwgytapl.supabase.co/functions/v1/send-rent-reminders',{
  method:'POST',signal:AbortSignal.timeout(25000),
  headers:{'Content-Type':'application/json','x-cron-secret':secret},
  body:JSON.stringify(process.env.CONTEXT&&process.env.CONTEXT!=='production'?{dry_run:true}:{background:true})
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok||result.error||!(result.accepted===true||result.dry_run===true&&result.success===true))throw Error('Reminder dispatcher failed: '+response.status+' '+String(result.error||'No run accepted'));
 console.log('Rentozi reminder dispatch',JSON.stringify(result));
 return new Response(JSON.stringify(result),{status:response.status,headers:{'Content-Type':'application/json'}});
}
