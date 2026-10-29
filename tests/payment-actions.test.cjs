const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),{webcrypto}=require('node:crypto'),{JSDOM}=require('jsdom');
const React=require('react');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
function load(file,imports={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:n=>imports[n]||require(n),crypto:webcrypto,TextEncoder,Uint8Array,sessionStorage:global.window?.sessionStorage,console,AbortSignal});return module.exports;}
async function screen(file,client,notify){const dom=new JSDOM('<div id="root"></div>',{url:'https://rentozi.example.invalid'});const prior={window:global.window,document:global.document,navigator:global.navigator,act:global.IS_REACT_ACT_ENVIRONMENT};global.window=dom.window;global.document=dom.window.document;Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});global.IS_REACT_ACT_ENVIRONMENT=true;
const router={push(){}};const component=load(file,{'next/navigation':{useRouter:()=>router},'next/link':{default:({children,...p})=>React.createElement('a',p,children)},'@/lib/supabase':{supabase:client},'@/lib/messaging':{notifyRentozi:notify},'@/lib/accounting':{currentBalance:()=>0},'@/lib/documents':{validateDocument(){},privateDocumentUrl:async()=>''},'@/lib/payment-actions':load('src/lib/payment-actions.ts')}).default;
const root=require('react-dom/client').createRoot(document.getElementById('root'));await React.act(async()=>root.render(React.createElement(component)));
return{dom,async close(){await React.act(async()=>root.unmount());dom.window.close();global.window=prior.window;global.document=prior.document;Object.defineProperty(global,'navigator',{value:prior.navigator,configurable:true});global.IS_REACT_ACT_ENVIRONMENT=prior.act;}};}
function fixtures(insert,rpc){const tenant={id:'tenant',full_name:'Test Tenant',email:'tenant@example.invalid',landlord_id:'landlord',houses:{code:'T1',name:'Test property',monthly_rent:1000}},row={id:'submission',amount:1000,paid_date:'2026-10-29',tenant_id:'tenant',tenants:tenant};return{auth:{getSession:async()=>({data:{session:{user:{id:'user'}}}})},rpc:async(name,args)=>rpc?rpc(name,args):{data:name==='landlord_notify_email'?'owner@example.invalid':name==='my_landlord_id'?'landlord':{business_name:'Test landlord'},error:null},storage:{from:()=>({upload:async()=>({error:null})})},from(table){const filters=[];return{select(){return this},eq(k,v){filters.push([k,v]);return this},is(){return this},in(){return this},order(){return this},limit(){return this},insert,maybeSingle:async()=>({data:table==='tenants'?tenant:table==='tenant_balances'?{next_due_date:'2026-11-01'}:filters.some(([k])=>k==='auth_user_id')?null:{email:'owner@example.invalid'},error:null}),then(resolve){resolve({data:table==='tenants'?[tenant]:table==='payment_submissions'?[row]:[],error:null})}}}};}
function submit(form,dom){form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));}
test('tenant payment form accepts one click, shows saving immediately and keeps saved report locked during email',async()=>{
 const save=deferred(),mail=deferred(),calls=[];const client=fixtures(async value=>{calls.push(value);return save.promise});const t=await screen('src/app/pay/page.tsx',client,()=>mail.promise);
 try{const form=document.querySelector('form');await React.act(async()=>{submit(form,t.dom);submit(form,t.dom);});assert.equal(calls.length,1);assert.match(form.textContent,/Submitting/);assert.equal(form.querySelector('button[type="submit"]').disabled,true);
 await React.act(async()=>save.resolve({error:null}));assert.match(document.body.textContent,/Payment submitted/);assert.equal(form.querySelector('button[type="submit"]').disabled,true);
 await React.act(async()=>mail.resolve({ok:false,error:'Timeout'}));assert.match(document.body.textContent,/Do not submit again/);await React.act(async()=>submit(form,t.dom));assert.equal(calls.length,1);assert.equal(form.querySelector('button[type="submit"]').disabled,true);
 }finally{await t.close();}
});
test('landlord double-click confirms once, immediately removes saved row before notification completes',async()=>{
 const review=deferred(),mail=deferred();let decisions=0,emails=0;const base=fixtures();const client={...base,rpc:async(name,args)=>{if(name==='rentozi_review_submission'){decisions++;return review.promise;}return base.rpc(name,args);}};const t=await screen('src/app/pending/page.tsx',client,()=>{emails++;return mail.promise;});
 try{let button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Confirm');await React.act(async()=>{button.click();button.click();});assert.equal(decisions,1);assert.match(button.textContent,/Confirming/);assert.equal(button.disabled,true);
 await React.act(async()=>review.resolve({data:{payment_id:'payment',months:1},error:null}));assert.match(document.body.textContent,/Payment confirmed/);assert.equal(Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Confirm'),false);assert.equal(emails,1);
 await React.act(async()=>mail.resolve({ok:false,error:'Connection lost'}));assert.match(document.body.textContent,/Payment decision saved/);assert.equal(decisions,1);
 }finally{await t.close();}
});
test('landlord request failure unlocks the controls for a safe retry',async()=>{
 const base=fixtures();const t=await screen('src/app/pending/page.tsx',{...base,rpc:async(n,a)=>n==='rentozi_review_submission'?Promise.reject(Error('Offline')):base.rpc(n,a)},async()=>({ok:true}));
 try{await React.act(async()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Confirm').click());assert.match(document.body.textContent,/Retry safely/);assert.equal(Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Confirm').disabled,false);}finally{await t.close();}
});
test('lost submission response retries the same primary key and verifies the existing own record',async()=>{
 const dom=new JSDOM('',{url:'https://rentozi.example.invalid'}),prior=global.window;global.window=dom.window;
 try{const helper=load('src/lib/payment-actions.ts');const one=await helper.paymentRequest('tenant',{amount:1000},null),two=await helper.paymentRequest('tenant',{amount:1000},null);assert.equal(one.id,two.id);
 let reads=0;const client={from:()=>({insert:async()=>({error:{code:'23505',message:'Duplicate'}}),select(){return this},eq(){return this},maybeSingle:async()=>{reads++;return{data:{id:one.id},error:null}}})};await helper.savePaymentReport(client,{tenant_id:'tenant'},one.id);assert.equal(reads,1);
 helper.clearPaymentRequest('tenant');const next=await helper.paymentRequest('tenant',{amount:1000},null);assert.notEqual(next.id,one.id);
 }finally{global.window=prior;dom.window.close();}
});

test('proof upload is locked from the first click and submission stays saved if email fails',async()=>{
 const upload=deferred(),save=deferred(),mail=deferred();let uploads=0,inserts=0;const base=fixtures(async()=>{inserts++;return save.promise});base.storage={from:()=>({upload:()=>{uploads++;return upload.promise;}})};
 const t=await screen('src/app/tenant/page.tsx',base,()=>mail.promise);
 try{
  await React.act(async()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Pay').click());
  const form=document.querySelector('form'),amount=form.querySelector('input[type="number"]'),file=form.querySelector('input[type="file"]');
  await React.act(async()=>{Object.getOwnPropertyDescriptor(t.dom.window.HTMLInputElement.prototype,'value').set.call(amount,'1000');amount.dispatchEvent(new t.dom.window.Event('input',{bubbles:true}));});
  await React.act(async()=>{Object.defineProperty(file,'files',{value:[new t.dom.window.File(['test'],'proof.png',{type:'image/png'})],configurable:true});file.dispatchEvent(new t.dom.window.Event('change',{bubbles:true}));});
  await React.act(async()=>{submit(form,t.dom);submit(form,t.dom);});assert.equal(uploads,1);assert.equal(inserts,0);assert.match(form.textContent,/Uploading proof/);
  await React.act(async()=>upload.resolve({error:null}));assert.equal(inserts,1);await React.act(async()=>save.resolve({error:null}));assert.match(form.textContent,/Payment submitted/);
  await React.act(async()=>mail.resolve({ok:false,error:'Timeout'}));assert.match(form.textContent,/Do not submit again/);await React.act(async()=>submit(form,t.dom));assert.equal(inserts,1);
 }finally{await t.close();}
});
