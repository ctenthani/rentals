import test from 'node:test';import assert from 'node:assert/strict';
import dispatch,{config} from '../netlify/functions/rent-reminders.mjs';
test('scheduled reminder dispatcher uses existing secret and queues a durable production run',async()=>{
 const oldFetch=globalThis.fetch,oldSecret=process.env.CRON_SECRET,oldContext=process.env.CONTEXT;
 try{process.env.CRON_SECRET='test-only';process.env.CONTEXT='production';let sent;
 globalThis.fetch=async(url,opts)=>{sent={url,...opts};return Response.json({accepted:true,run_id:'test-run'},{status:202});};
 const result=await dispatch();assert.equal(result.status,202);assert.equal(config.schedule,'0 6,12 * * *');assert.equal(sent.headers['x-cron-secret'],'test-only');assert.deepEqual(JSON.parse(sent.body),{background:true});
 }finally{globalThis.fetch=oldFetch;if(oldSecret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=oldSecret;if(oldContext===undefined)delete process.env.CONTEXT;else process.env.CONTEXT=oldContext;}
});
test('dispatcher reports authentication failure and fails closed without a secret',async()=>{
 const oldFetch=globalThis.fetch,oldSecret=process.env.CRON_SECRET;
 try{delete process.env.CRON_SECRET;globalThis.fetch=()=>{throw Error('Should not call');};await assert.rejects(dispatch(),/CRON_SECRET/);
 process.env.CRON_SECRET='test-only';globalThis.fetch=async()=>Response.json({error:'Unauthorized'},{status:401});await assert.rejects(dispatch(),/401 Unauthorized/);
 }finally{globalThis.fetch=oldFetch;if(oldSecret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=oldSecret;}
});
test('preview contexts never send real tenant mail',async()=>{
 const oldFetch=globalThis.fetch,oldSecret=process.env.CRON_SECRET,oldContext=process.env.CONTEXT;
 try{process.env.CRON_SECRET='test-only';process.env.CONTEXT='deploy-preview';let sent;
 globalThis.fetch=async(url,opts)=>{sent=JSON.parse(opts.body);return Response.json({success:true,dry_run:true,eligible:6});};await dispatch();assert.deepEqual(sent,{dry_run:true});
 }finally{globalThis.fetch=oldFetch;if(oldSecret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=oldSecret;if(oldContext===undefined)delete process.env.CONTEXT;else process.env.CONTEXT=oldContext;}
});
