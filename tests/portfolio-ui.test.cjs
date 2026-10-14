const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
test('landlord reviews and confirms a tenant-only correction without changing the owner',{skip:!process.env.JSDOM_MODULE},async()=>{
 const {JSDOM}=require(process.env.JSDOM_MODULE),dom=new JSDOM('<main id="root"></main>',{url:'https://rentozi.example.invalid'}),prior={window:global.window,document:global.document,navigator:global.navigator,act:global.IS_REACT_ACT_ENVIRONMENT};
 global.window=dom.window;global.document=dom.window.document;Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});global.IS_REACT_ACT_ENVIRONMENT=true;
 const React=require('react'),{createRoot}=require('react-dom/client'),root=createRoot(document.getElementById('root')),calls=[];
 const users=[{id:'owner',name:'Owner',email:'owner@example.invalid',role:'owner',protected:true,verified:true,enabled:true},{id:'tenant',name:'Tenant',email:'tenant@example.invalid',role:'manager',has_tenant:true,protected:false,verified:true,enabled:true}];
 const supabase={rpc:async(name,args)=>{calls.push({name,args});if(name==='rentozi_set_portfolio_role')users[1].role=args.p_role;return{data:name==='rentozi_portfolio_users'?users:{success:true},error:null};}};
 const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/PortfolioRoles.tsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:name=>name==='@/lib/supabase'?{supabase}:require(name)});
 try{
 await React.act(async()=>root.render(React.createElement(module.exports.default,{landlordId:'portfolio'})));
 assert.equal(document.querySelectorAll('select').length,1);assert.match(document.body.textContent,/Business owner · protected/);
 const select=document.querySelector('select');await React.act(async()=>{select.value='tenant';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 const review=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Review role change');await React.act(async()=>review.click());assert.equal(calls.filter(c=>c.name==='rentozi_set_portfolio_role').length,0);assert.match(document.querySelector('[role="dialog"]').textContent,/tenant keeps access to their own rental records/i);
 await React.act(async()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Confirm role change').click());
 assert.deepEqual(JSON.parse(JSON.stringify(calls.find(c=>c.name==='rentozi_set_portfolio_role').args)),{p_landlord:'portfolio',p_user:'tenant',p_role:'tenant',p_expected_role:'manager'});assert.match(document.body.textContent,/Tenant only saved/);assert.equal(document.querySelector('[role="dialog"]'),null);
 }finally{await React.act(async()=>root.unmount());dom.window.close();global.window=prior.window;global.document=prior.document;Object.defineProperty(global,'navigator',{value:prior.navigator,configurable:true});global.IS_REACT_ACT_ENVIRONMENT=prior.act;}
});

