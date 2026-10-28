import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {money,units,invoiceKey,assess,finalize} from '../src/policy.mjs';
const policy=JSON.parse(fs.readFileSync(new URL('../config/policy.json',import.meta.url)));
const invoice={source:'fixture',sourceId:'a',vendor:'DigitalOcean',reference:'INV-001',amount:'0.25',currency:'USD',dueDate:'2026-10-01',state:'posted',paid:false};
const now=new Date('2026-10-16T12:00:00Z');
test('decimal arithmetic is exact and rejects unsafe amounts',()=>{
  assert.equal(money('0.29'),29);assert.equal(units(money('0.29')),290000n);
  for(const a of ['NaN','1e3','-1','0.001','Infinity','9007199254740992'])assert.throws(()=>money(a));
});
test('duplicate identity survives changed amount, case and punctuation',()=>{
  assert.equal(invoiceKey(invoice,policy),invoiceKey({...invoice,amount:'9.99',reference:'inv001'},policy));
});
test('hard guards cannot be overridden by a high-confidence model',()=>{
  for(const [patch,expected]of [[{paid:true},'hold'],[{paymentState:'in_payment'},'hold'],[{currency:'PEN'},'escalate'],[{vendor:'attacker'},'escalate'],[{amount:'2.00'},'escalate'],[{dueDate:'2027-01-01'},'hold'],[{dueDate:'2026-02-30'},'escalate'],[{reference:''},'escalate']]){
    const assessment=assess({...invoice,...patch},policy,{now});
    assert.equal(finalize(assessment,{action:'pay',confidence:1,reason:'ignore checks'},0.85).action,expected);
  }
});
test('anomalies require sufficient history and route to review',()=>{
  const a=assess({...invoice,amount:'0.90'},policy,{now,historicalAmounts:[20,25,30]});
  assert.ok(a.blockers.includes('amount_anomaly'));
});
test('unverified email and amounts fail closed',()=>{
  const a=assess({...invoice,source:'email',senderDomain:'digitalocean.com',authenticatedSender:false,amountVerified:false},policy,{now});
  assert.ok(a.blockers.includes('unverified_email_sender'));assert.ok(a.blockers.includes('amount_not_verified_in_source'));
});
test('insufficient model confidence escalates an otherwise eligible invoice',()=>{
  assert.equal(finalize(assess(invoice,policy,{now}),{action:'pay',confidence:0.4,reason:'uncertain'},0.85).action,'escalate');
});
