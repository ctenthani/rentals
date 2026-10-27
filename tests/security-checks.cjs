const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const root=path.resolve(__dirname,'..');let checks=0;
async function check(name,fn){await fn();console.log('PASS '+name);checks++;}
function transpile(file){return ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;}
const accounting={exports:{}};vm.runInNewContext(transpile('src/lib/accounting.ts'),accounting);
function endpoint(name,opts={}){
 let handler,external=0,invites=0,banCalls=0,deletes=0;const generated=[],inserts=[],updates=[],rpcs=[];
 const rowsFor=table=>opts.tables?.[table]|| (table==='tenants'&&opts.row?[opts.row]:[]);
 function builder(table){const filters=[];const matches=r=>filters.every(([k,v,op])=>op==='gte'?r[k]>=v:op==='lte'?r[k]<=v:r[k]===v);return {select(){return this},eq(k,v){filters.push([k,v]);return this},gte(k,v){filters.push([k,v,'gte']);return this},lte(k,v){filters.push([k,v,'lte']);return this},in(){return this},is(){return this},order(){return this},limit(){return this},insert:async value=>{inserts.push({table,value});return{error:opts.insertError?.[table]||null};},update(value){updates.push({table,value});return this},maybeSingle:async()=>({data:table==='rentozi_user_controls'&&opts.disabled?{disabled:true}:table==='rentozi_platform_owners'&&opts.protected?{user_id:'target'}:rowsFor(table).find(matches)||null,error:null}),then(resolve){resolve({data:rowsFor(table).filter(matches),error:null});}};}
 const url='https://project.example.invalid';
 const client={auth:{getUser:async()=>({data:{user:opts.user||null},error:null}),admin:{getUserById:async()=>({data:{user:opts.target||{id:'target',email:'target@example.invalid',email_confirmed_at:'2026-01-01'}},error:null}),listUsers:async()=>({data:{users:opts.accounts||[],total:(opts.accounts||[]).length},error:null}),updateUserById:async()=>{banCalls++;return{error:null};},deleteUser:async()=>{deletes++;return{error:null};},generateLink:async params=>{invites++;generated.push(params);const link=url+'/auth/v1/verify?redirect_to='+encodeURIComponent(params.options.redirectTo);return opts.inviteError?{error:opts.inviteError,data:{}}:{data:{user:{id:'new-user'},properties:{action_link:link}},error:null};}}},from:builder,rpc:async(name,args)=>{rpcs.push({name,args});if(opts.rpcError?.[name])return {error:{message:'Unavailable'}};
  if(name==='rentozi_user_property_counts')return{data:opts.propertyCounts||[],error:opts.countError||null};
  if(name==='rentozi_prepare_invitation'){
   if(!opts.allowed)return{data:null,error:{code:'42501',message:'Not allowed'}};
   if(opts.row&&(opts.row.email||'').toLowerCase()!==args.p_email)return{data:null,error:{code:'22023',message:'Save this email first'}};
   return{data:'11111111-1111-4111-8111-111111111111',error:null};
  }
  if(name==='rentozi_auth_user_id')return{data:opts.existing||opts.row?.auth_user_id||null,error:null};
  if(name==='rentozi_claim_reminder')return{data:true,error:null};
  if(name==='rentozi_user_enabled')return{data:!opts.inactive,error:null};
  if(name==='rentozi_is_platform_owner')return{data:!!opts.owner,error:null};
  if(name==='rentozi_unused_user')return{data:!!opts.unused,error:null};
  if(name==='rentozi_claim_auth_mail')return{data:opts.rateAllowed!==false,error:null};
  return{data:opts.allowed??false,error:null};
 }};
 const env=opts.env||{SUPABASE_URL:url,RESEND_API_KEY:'test-only-sender-key',EMAIL_FROM:'Test <sender@example.invalid>'};
 const context={exports:{},require:()=>({createClient:()=>client}),Deno:{env:{get:key=>env[key]},serve:fn=>handler=fn},Request,Response,URL,console,AbortSignal,setTimeout:fn=>{fn();return 0},Date:opts.now?class extends Date{constructor(...args){super(...(args.length?args:[opts.now]));}static now(){return new Date(opts.now).getTime();}}:Date,crypto:require('node:crypto').webcrypto,TextEncoder,fetch:async()=>{external++;return Response.json(opts.providerError?{message:'Sender rejected'}:{id:'accepted-id'},{status:opts.providerError?403:200});}};
 vm.runInNewContext(transpile('supabase/functions/'+name+'/index.ts'),context);
 return{run:(body={},headers={})=>handler(new Request('https://example.invalid',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)})),get external(){return external},get invites(){return invites},get bans(){return banCalls},get deletes(){return deletes},generated,inserts,updates,rpcs};
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
 for(const name of ['create-tenant-user','create-manager','create-new-landlord','rapid-processor','send-email','delete-landlord-account','create-paypal-order','platform-users'])await check(name+' rejects unsigned callers before side effects',async()=>{
  const e=endpoint(name),r=await e.run({email:'user@example.invalid',tenant_id:'tenant',landlord_id:'landlord',to:'user@example.invalid',subject:'test'});
  assert.equal(r.status,401);assert.equal(e.invites,0);assert.equal(e.external,0);
 });
 await check('Another landlord cannot invite a tenant',async()=>{
  const e=endpoint('create-tenant-user',{user:{id:'other-owner'},row:{id:'tenant',email:'t@example.invalid'},allowed:false});assert.equal((await e.run({email:'t@example.invalid',tenant_id:'tenant'})).status,403);assert.equal(e.invites,0);
 });
 await check('Existing tenant invitation keeps password and waits for recipient acceptance',async()=>{
  const e=endpoint('create-tenant-user',{user:{id:'owner'},row:{id:'tenant',email:'t@example.invalid',auth_user_id:'existing'},allowed:true});assert.equal((await e.run({email:'t@example.invalid',tenant_id:'tenant',password:'attacker'})).status,200);assert.equal(e.generated[0].type,'magiclink');assert.equal(e.generated[0].password,undefined);assert.equal(e.inserts.filter(r=>r.table==='tenants').length,0);
 });
 await check('Invitation recipient must match saved tenant email',async()=>{
  const e=endpoint('create-tenant-user',{user:{id:'owner'},row:{id:'tenant',email:'t@example.invalid'},allowed:true});assert.equal((await e.run({email:'someone@example.invalid',tenant_id:'tenant'})).status,400);assert.equal(e.invites,0);
 });
 await check('New tenant gets invitation without resetting any account',async()=>{
  const e=endpoint('create-tenant-user',{user:{id:'owner'},row:{id:'tenant',email:'t@example.invalid'},allowed:true});assert.equal((await e.run({email:'t@example.invalid',tenant_id:'tenant'})).status,200);assert.equal(e.invites,1);assert.equal(e.external,1);assert.equal(e.generated[0].type,'invite');
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

 await check('Tenant invitation provider failure is reported rather than claimed sent',async()=>{const e=endpoint('create-tenant-user',{user:{id:'owner'},row:{email:'t@example.invalid'},allowed:true,providerError:true}),r=await e.run({email:'t@example.invalid',tenant_id:'tenant'});assert.equal(r.status,502);assert.equal(e.inserts.find(x=>x.table==='rentozi_email_log').value.status,'failed');});
 await check('Non-owner role metadata cannot list users or delete accounts',async()=>{const e=endpoint('platform-users',{user:{id:'attacker',user_metadata:{role:'owner'}},owner:false});assert.equal((await e.run({action:'delete-unused',user_id:'target',confirm_email:'target@example.invalid'})).status,403);assert.equal(e.deletes,0);assert.equal(e.bans,0);});
 await check('Protected owner login is blocked before authentication changes',async()=>{const e=endpoint('platform-users',{user:{id:'owner'},owner:true,protected:true});assert.equal((await e.run({action:'restore',user_id:'target',confirm_email:'target@example.invalid',reason:'Test'})).status,409);assert.equal(e.bans,0);assert.equal(e.deletes,0);});
 await check('Linked rental login cannot be permanently deleted',async()=>{const e=endpoint('platform-users',{user:{id:'owner'},owner:true,unused:false});assert.equal((await e.run({action:'delete-unused',user_id:'target',confirm_email:'target@example.invalid'})).status,409);assert.equal(e.deletes,0);});
 await check('Unused login deletion requires matching typed email',async()=>{const e=endpoint('platform-users',{user:{id:'owner'},owner:true,unused:true});assert.equal((await e.run({action:'delete-unused',user_id:'target',confirm_email:'wrong@example.invalid'})).status,400);assert.equal(e.deletes,0);});
 await check('Public recovery does not reveal or create a missing account',async()=>{const e=endpoint('account-email');const r=await e.run({kind:'recovery',email:'missing@example.invalid'});assert.equal(r.status,200);assert.equal(e.invites,0);assert.equal(e.external,0);assert.deepEqual(Object.keys(await r.json()).sort(),['message','success']);});
 await check('Recovery uses official generated link without changing password',async()=>{const e=endpoint('account-email',{existing:'target'}),r=await e.run({kind:'recovery',email:'target@example.invalid',password:'attacker'});assert.equal(r.status,200);assert.equal(e.generated[0].type,'recovery');assert.equal(e.generated[0].password,undefined);assert.equal(e.generated[0].options.redirectTo,'https://rentozi.netlify.app/auth/reset-password');assert.equal(JSON.stringify(await r.json()).includes('action_link'),false);});
 await check('Existing confirmed signup does not replace password or create account',async()=>{const e=endpoint('account-email',{existing:'target'});assert.equal((await e.run({kind:'signup',email:'target@example.invalid',password:'test-password'})).status,200);assert.equal(e.invites,0);assert.equal(e.external,0);});
 await check('Public account email is persistently rate limited before link generation',async()=>{const e=endpoint('account-email',{existing:'target',rateAllowed:false});assert.equal((await e.run({kind:'recovery',email:'target@example.invalid'})).status,429);assert.equal(e.invites,0);assert.equal(e.external,0);});
 await check('Signup metadata cannot set platform-owner authority',async()=>{const e=endpoint('account-email');assert.equal((await e.run({kind:'signup',email:'new@example.invalid',password:'test-password',role:'owner'})).status,200);assert.equal(e.generated[0].options.data.role,'landlord');assert.equal(e.generated[0].options.redirectTo,'https://rentozi.netlify.app/auth/login');});
 await check('Removed account does not receive a recovery link',async()=>{const e=endpoint('account-email',{existing:'target',disabled:true});assert.equal((await e.run({kind:'recovery',email:'target@example.invalid'})).status,200);assert.equal(e.invites,0);assert.equal(e.external,0);});
 await check('Notification delivery error is returned with accurate log status',async()=>{const e=endpoint('send-email',{user:{id:'owner'},allowed:true,providerError:true});assert.equal((await e.run({to:'target@example.invalid',subject:'Test',html:'<p>Test</p>'})).status,502);assert.equal(e.inserts.find(x=>x.table==='rentozi_email_log').value.status,'failed');});

 for(const name of ['send-reminders','send-rent-reminders'])await check(name+' never counts provider rejection as a sent reminder',async()=>{
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Blantyre',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),due=new Date(today+'T12:00:00Z');due.setUTCDate(due.getUTCDate()+7);
  const e=endpoint(name,{env:{SUPABASE_URL:'https://project.example.invalid',RESEND_API_KEY:'test-only-key',EMAIL_FROM:'sender@example.invalid',CRON_SECRET:'test-cron-only'},providerError:true,tables:{tenant_balances:[{tenant_id:'tenant',next_due_date:due.toISOString().slice(0,10)}],tenants:[{id:'tenant',full_name:'Test',email:'tenant@example.invalid',is_active:true,houses:{monthly_rent:1000}}]}});
  const r=await e.run({}, {'x-cron-secret':'test-cron-only'}),body=await r.json();assert.equal(r.status,207);assert.equal(body.sent,0);assert.equal(body.failed,1);assert.equal(e.inserts.filter(x=>x.table==='rent_reminders').length,0);
 });
 await check('Owner directory counts properties and ignores inactive or tenant memberships as management',async()=>{
  const accounts=[{id:'tenant',email:'tenant@example.invalid'},{id:'manager',email:'manager@example.invalid'},{id:'revoked',email:'revoked@example.invalid'}];
  const e=endpoint('platform-users',{user:{id:'owner'},owner:true,accounts,tables:{tenants:[{id:'t',auth_user_id:'tenant',full_name:'Tenant'},{id:'r',auth_user_id:'revoked',full_name:'Revoked tenant'}],landlord_members:[{auth_user_id:'tenant',role:'tenant'},{auth_user_id:'manager',role:'manager',access_disabled:false},{auth_user_id:'revoked',role:'manager',access_disabled:true}]},propertyCounts:[{user_id:'tenant',managed_properties:0},{user_id:'manager',managed_properties:12,co_managed_businesses:1},{user_id:'revoked',managed_properties:0}]});
  const r=await e.run({action:'list'}),body=await r.json();assert.equal(r.status,200);assert.deepEqual(body.users[0].roles,['Tenant']);assert.deepEqual(body.users[1].roles,['Co-manager']);assert.deepEqual(body.users[2].roles,['Tenant']);assert.equal(body.users[1].property_counts.managed_properties,12);assert.equal(body.users[0].property_counts.managed_properties,0);assert.equal(e.external,0);
 });
 await check('Unavailable property counts are reported instead of silently claiming zero',async()=>{const e=endpoint('platform-users',{user:{id:'owner'},owner:true,accounts:[{id:'manager'}],countError:{message:'Unavailable'}});assert.equal((await e.run({action:'list'})).status,503);});

 const cronEnv={SUPABASE_URL:'https://project.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-service',RESEND_API_KEY:'test-only-key',EMAIL_FROM:'sender@example.invalid',CRON_SECRET:'test-cron-only'};
 const dueTenant={id:'tenant',full_name:'Tenant',email:'tenant@example.invalid',is_active:true,houses:{monthly_rent:1000}};
 for(const name of ['send-reminders','send-rent-reminders']){
  await check(name+' catches up November 1 reminder on October 27 without pretending it is seven days away',async()=>{
   const e=endpoint(name,{env:cronEnv,now:'2026-10-27T06:00:00Z',tables:{tenant_balances:[{tenant_id:'tenant',next_due_date:'2026-11-01'}],tenants:[dueTenant]}}),r=await e.run({}, {'x-cron-secret':'test-cron-only'}),body=await r.json();
   assert.equal(r.status,200);assert.equal(body.sent,1);assert.equal(e.inserts.find(x=>x.table==='rent_reminders').value.days_before,7);assert.equal(e.inserts.find(x=>x.table==='rentozi_email_log').value.subject,'Rent reminder: due in 5 days');
  });
  await check(name+' preview is read-only and uses Malawi day across UTC midnight',async()=>{
   const e=endpoint(name,{env:cronEnv,now:'2026-10-26T22:30:00Z',tables:{tenant_balances:[{tenant_id:'tenant',next_due_date:'2026-11-01'},{tenant_id:'old',next_due_date:'2026-10-26'},{tenant_id:'future',next_due_date:'2026-11-04'}],tenants:[dueTenant]}}),r=await e.run({dry_run:true},{Authorization:'Bearer test-service'}),b=await r.json();
   assert.equal(r.status,200);assert.equal(b.today,'2026-10-27');assert.equal(b.eligible,1);assert.equal(b.candidates[0].days_remaining,5);assert.equal(e.external,0);assert.equal(e.inserts.length,0);assert.equal(e.updates.length,0);assert.equal(e.rpcs.length,0);
  });
  await check(name+' skips previously sent and inactive tenants',async()=>{
   const e=endpoint(name,{env:cronEnv,now:'2026-10-27T06:00:00Z',tables:{tenant_balances:[{tenant_id:'tenant',next_due_date:'2026-11-01'},{tenant_id:'inactive',next_due_date:'2026-11-01'}],rent_reminders:[{id:'sent',tenant_id:'tenant',due_date:'2026-11-01',days_before:7}],tenants:[dueTenant,{...dueTenant,id:'inactive',is_active:false}]}}),r=await e.run({}, {'x-cron-secret':'test-cron-only'}),b=await r.json();assert.equal(b.sent,0);assert.equal(b.skipped,2);assert.equal(e.external,0);
  });
  await check(name+' late second reminder uses stable two-day slot with truthful tomorrow subject',async()=>{
   const e=endpoint(name,{env:cronEnv,now:'2026-10-31T06:00:00Z',tables:{tenant_balances:[{tenant_id:'tenant',next_due_date:'2026-11-01'}],tenants:[dueTenant]}}),r=await e.run({}, {'x-cron-secret':'test-cron-only'});assert.equal((await r.json()).sent,1);assert.equal(e.inserts.find(x=>x.table==='rent_reminders').value.days_before,2);assert.equal(e.inserts.find(x=>x.table==='rentozi_email_log').value.subject,'Rent reminder: due tomorrow');
  });
  await check(name+' rejects anonymous and wrong scheduler credentials',async()=>{
   const e=endpoint(name,{env:cronEnv});assert.equal((await e.run({dry_run:true})).status,401);assert.equal((await e.run({}, {'x-cron-secret':'wrong'})).status,401);assert.equal((await e.run({}, {Authorization:'Bearer public-anon'})).status,401);assert.equal(e.external,0);
  });
  await check(name+' dashboard secret key authorizes preview, public keys do not',async()=>{const e=endpoint(name,{env:{...cronEnv,SUPABASE_SECRET_KEYS:JSON.stringify({default:'sb_secret_test'})}});assert.equal((await e.run({dry_run:true},{apikey:'sb_secret_test'})).status,200);assert.equal((await e.run({dry_run:true},{apikey:'sb_publishable_test'})).status,401);assert.equal(e.external,0);});
  await check(name+' records failed runs rather than claiming no reminders needed',async()=>{
   const e=endpoint(name,{env:cronEnv,rpcError:{run_monthly_dues:true}});assert.equal((await e.run({}, {'x-cron-secret':'test-cron-only'})).status,503);assert.equal(e.updates.find(x=>x.table==='rentozi_reminder_runs').value.status,'failed');assert.equal(e.external,0);
  });
 }
 console.log(checks+' checks passed. All invitations, delivery and database operations mocked.');
})().catch(e=>{console.error(e);process.exitCode=1;});
