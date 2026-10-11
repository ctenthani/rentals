const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const root=path.resolve(__dirname,'..');let checks=0;
async function check(name,fn){await fn();console.log('PASS '+name);checks++;}
function transpile(file){return ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;}
const accounting={exports:{}};vm.runInNewContext(transpile('src/lib/accounting.ts'),accounting);
function endpoint(name,opts={}){
 let handler,external=0,invites=0;
 const builder={select(){return this},eq(){return this},is(){return this},insert:async()=>({error:null}),update(){return this},maybeSingle:async()=>({data:opts.row||null,error:null}),then(resolve){resolve({data:[{id:'tenant'}],error:null})}};
 const client={auth:{getUser:async()=>({data:{user:opts.user||null},error:null}),admin:{inviteUserByEmail:async()=>{invites++;return opts.inviteError?{error:opts.inviteError,data:{}}:{data:{user:{id:'new-user'}},error:null}}}},from:()=>builder,rpc:async()=>({data:opts.allowed??false,error:null})};
 const context={exports:{},require:()=>({createClient:()=>client}),Deno:{env:{get:key=>opts.env?.[key]},serve:fn=>handler=fn},Request,Response,URL,console,fetch:async()=>{external++;return Response.json({})}};
 vm.runInNewContext(transpile('supabase/functions/'+name+'/index.ts'),context);
 return{run:(body={})=>handler(new Request('https://example.invalid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})),get external(){return external},get invites(){return invites}};
}
(async()=>{
 await check('Month-end and leap-year rent cycles',()=>{
  assert.equal(accounting.exports.addCalendarMonths('2026-01-31',1),'2026-02-28');
  assert.equal(accounting.exports.addCalendarMonths('2024-01-31',1),'2024-02-29');
  assert.equal(accounting.exports.dueCycles('2026-01-31','2026-02-27'),1);
  assert.equal(accounting.exports.dueCycles('2026-01-31','2026-02-28'),2);
 });
 await check('Partial credit remains reflected before and after later accrual',()=>{
  const b={current_balance:600,partial_credit:400,next_due_date:'2026-10-01',balance_as_of:'2026-10-11'};
  assert.equal(accounting.exports.currentBalance(b,1000,'2026-10-20'),600);
  assert.equal(accounting.exports.currentBalance(b,1000,'2026-11-01'),1600);
  assert.equal(accounting.exports.currentBalance({...b,balance_as_of:null},1000,'2026-10-20'),600);
 });
 for(const name of ['create-tenant-user','create-manager','create-new-landlord','rapid-processor','send-email','delete-landlord-account','create-paypal-order'])await check(name+' rejects unsigned callers before side effects',async()=>{
  const e=endpoint(name),r=await e.run({email:'user@example.invalid',tenant_id:'tenant',landlord_id:'landlord',to:'user@example.invalid',subject:'test'});
  assert.equal(r.status,401);assert.equal(e.invites,0);assert.equal(e.external,0);
 });
 await check('Another landlord cannot invite a tenant',async()=>{
  const e=endpoint('create-tenant-user',{user:{id:'other-owner'},row:{id:'tenant',email:'t@example.invalid'},allowed:false});assert.equal((await e.run({email:'t@example.invalid',tenant_id:'tenant'})).status,403);assert.equal(e.invites,0);
 });
 await check('Existing tenant login cannot be password-reset by landlord',async()=>{
  const e=endpoint('create-tenant-user',{user:{id:'owner'},row:{id:'tenant',email:'t@example.invalid',auth_user_id:'existing'},allowed:true});assert.equal((await e.run({email:'t@example.invalid',tenant_id:'tenant',password:'attacker'})).status,409);assert.equal(e.invites,0);
 });
 await check('Invitation recipient must match saved tenant email',async()=>{
  const e=endpoint('create-tenant-user',{user:{id:'owner'},row:{id:'tenant',email:'t@example.invalid'},allowed:true});assert.equal((await e.run({email:'someone@example.invalid',tenant_id:'tenant'})).status,400);assert.equal(e.invites,0);
 });
 await check('New tenant gets invitation without resetting any account',async()=>{
  const e=endpoint('create-tenant-user',{user:{id:'owner'},row:{id:'tenant',email:'t@example.invalid'},allowed:true});assert.equal((await e.run({email:'t@example.invalid',tenant_id:'tenant'})).status,200);assert.equal(e.invites,1);assert.equal(e.external,0);
 });
 await check('Co-manager creation requires business ownership',async()=>{
  const e=endpoint('create-manager',{user:{id:'manager'}});assert.equal((await e.run({email:'new@example.invalid',landlord_id:'other'})).status,403);assert.equal(e.invites,0);
 });
 await check('Email outside rental account is blocked before delivery',async()=>{
  const e=endpoint('send-email',{user:{id:'owner'},allowed:false});assert.equal((await e.run({to:'other@example.invalid',subject:'test'})).status,403);assert.equal(e.external,0);
 });
 await check('Unconfigured scheduler fails closed without sending messages',async()=>{
  const e=endpoint('send-reminders');assert.equal((await e.run()).status,401);assert.equal(e.external,0);
 });
 await check('Unverified upgrade and webhook cannot grant paid access',async()=>{
  const e=endpoint('create-paypal-order',{user:{id:'owner'}});assert.equal((await e.run()).status,503);assert.equal(e.external,0);
  assert.equal((await endpoint('paypal-webhook').run()).status,503);
 });
 console.log(checks+' checks passed. All invitations, delivery and database operations mocked.');
})().catch(e=>{console.error(e);process.exitCode=1;});
