import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Store} from '../src/store.mjs';
import {runAgent} from '../src/engine.mjs';
import {OfflineAdvisor} from '../src/llm.mjs';
import {invoiceKey} from '../src/policy.mjs';
const policy=JSON.parse(fs.readFileSync(new URL('../config/policy.json',import.meta.url)));
const config={policy};
const inv={source:'fixture',sourceId:'one',vendor:'digitalocean',reference:'TEST-1',amount:'0.10',currency:'USD',dueDate:'2026-10-01',state:'posted'};
test('duplicate handling and repeated dry-runs preserve first-invoice eligibility',async()=>{
  const store=new Store(':memory:');const advisor=new OfflineAdvisor();
  const bills=[inv,{...inv,sourceId:'two'}];
  for(let i=0;i<2;i++){const r=await runAgent(bills,{store,advisor,config});assert.equal(r.pay,1);assert.equal(r.hold,1);}
  assert.equal(store.verifyAudit(),true);store.close();
});
test('payment confirmation, replay, and audit trace are idempotent',async()=>{
  const store=new Store(':memory:');let submitted=0;
  const chain={isPaid:async()=>false,capacity:async()=>null,pay:async(key,vendor,amount,reason,intent,onSubmitted)=>{submitted++;onSubmitted('tx-id');return{txId:'tx-id',txHash:'0xabc'};}};
  const args={store,advisor:new OfflineAdvisor(),config,chain,execute:true};
  assert.equal((await runAgent([inv],args)).confirmed,1);
  assert.equal((await runAgent([inv],args)).replayed,1);assert.equal(submitted,1);assert.equal(store.verifyAudit(),true);
  assert.throws(()=>store.db.prepare('UPDATE events SET type=?').run('changed'),/Append-only/);
  assert.throws(()=>store.db.prepare('DELETE FROM events').run(),/Append-only/);store.close();
});
test('an interrupted request reuses its idempotency key and original rationale',async()=>{
  const store=new Store(':memory:');let count=0;const keys=[],reasons=[];
  const chain={isPaid:async()=>false,capacity:async()=>null,pay:async(key,vendor,amount,reason,intent,onSubmitted)=>{keys.push(intent.idempotency_key);reasons.push(reason);if(++count===1)throw Error('response lost');onSubmitted('recovered');return{txId:'recovered',txHash:'0xabc'};}};
  const args={store,advisor:new OfflineAdvisor(),config,chain,execute:true};
  assert.equal((await runAgent([inv],args)).escalate,1);assert.equal((await runAgent([inv],args)).confirmed,1);
  assert.equal(keys[0],keys[1]);assert.equal(reasons[0],reasons[1]);store.close();
});
test('changed invoice after an intent is blocked for manual review',()=>{
  const s=new Store(':memory:');const key=invoiceKey(inv,policy);s.upsert(inv,key);s.intent(key,10,'digitalocean','original');
  assert.throws(()=>s.upsert({...inv,amount:'0.20'},key),/changed after payment intent/);s.close();
});
test('a model outage prevents payment without hiding deterministic duplicate guards',async()=>{
  const s=new Store(':memory:');const r=await runAgent([inv],{store:s,config,advisor:{model:'unavailable',recommend:async()=>{throw Error('offline');}}});
  assert.equal(r.escalate,1);assert.equal(s.payment(invoiceKey(inv,policy)),undefined);s.close();
});
