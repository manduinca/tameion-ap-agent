import test from 'node:test';
import assert from 'node:assert/strict';
import {OdooReader} from '../src/odoo.mjs';
import {MuseClient} from '../src/llm.mjs';
import {requireTestnet} from '../src/config.mjs';
import {isInvoiceEmail} from '../src/mail.mjs';

test('Odoo adapter paginates through reads and exposes no write executor',async()=>{
  const requests=[];let pages=0;
  const odoo=new OdooReader({ODOO_URL:'https://www.deepskill.space',ODOO_DB:'db',ODOO_LOGIN:'user',ODOO_API_KEY:'secret'},{fetchImpl:async(url,req)=>{
    const body=JSON.parse(req.body);requests.push(body.params);
    const result=body.params.service==='common'?2:++pages===1?[{id:1,partner_id:[1,'Cloudflare'],name:'INV-1',currency_id:[1,'USD'],amount_total:0.1,amount_residual:0.1,state:'posted',payment_state:'not_paid'}]:[];
    return {ok:true,json:async()=>({result})};
  }});
  assert.equal((await odoo.readBills()).length,1);assert.equal(requests.length,3);
  assert.equal(odoo.rpc,undefined);assert.equal(odoo.execute,undefined);
  for(const r of requests.filter(r=>r.service==='object')){assert.equal(r.args[3],'account.move');assert.equal(r.args[4],'search_read');}
});
test('Muse validates JSON and hides provider errors and credentials',async()=>{
  const config={env:{MODEL_API_KEY:'do-not-disclose'},model:'muse-spark-1.3-contributor'};
  const client=new MuseClient(config,{fetchImpl:async()=>({ok:false,status:401,json:async()=>({error:'do-not-disclose'})})});
  await assert.rejects(()=>client.recommend({source:'fixture'},{vendor:null,blockers:[]}),e=>!e.message.includes('do-not-disclose')&&e.message.includes('401'));
  const invalid=new MuseClient(config,{fetchImpl:async()=>({ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:'{"action":"pay","amount":999}'}]}]})})});
  await assert.rejects(()=>invalid.recommend({source:'fixture'},{vendor:null,blockers:[]}),/schema validation/);
});
test('mainnet and non-test keys are rejected',()=>{
  assert.throws(()=>requireTestnet({policy:{chainId:1,blockchain:'ETH'},env:{}}),/Only Arc testnet/);
  assert.throws(()=>requireTestnet({policy:{chainId:5042002,blockchain:'ARC-TESTNET'},env:{CIRCLE_API_KEY:'LIVE_API_KEY:secret'}}),/TEST_API_KEY/);
});
test('model receives the source state and deterministic evidence checks',async()=>{
  let body;
  const c=new MuseClient({env:{MODEL_API_KEY:'stub'},model:'muse-spark-1.3-contributor'},{fetchImpl:async(url,request)=>{body=JSON.parse(request.body);return{ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({action:'pay',reason:'Within policy',confidence:0.99})}]}]})};}});
  await c.recommend({source:'fixture',state:'posted',reference:'REF'}, {vendor:{alias:'cloudflare'},blockers:[]});
  const sent=JSON.parse(body.input);assert.equal(sent.invoice.state,'posted');assert.equal(sent.trustedChecks.allowlisted,true);assert.equal(sent.trustedChecks.evidenceVerified,true);
});
test('real data cannot reach Contributor without the explicit local opt-in',()=>{
  let called=false;
  const c=new MuseClient({env:{MODEL_API_KEY:'stub'},model:'muse-spark-1.3-contributor'},{fetchImpl:async()=>{called=true;}});
  assert.throws(()=>c.extractEmail({text:'private'}),/Explicit approval/);
  assert.throws(()=>c.recommend({source:'odoo'},{}),/Explicit approval/);
  assert.equal(called,false);
});
test('Google Pay account alerts and marketing cannot masquerade as Workspace invoices',()=>{
  const vendor={alias:'google-workspace'};
  assert.equal(isInvoiceEmail({subject:'Google Workspace: Your invoice is available',text:'Google Workspace'},vendor),true);
  assert.equal(isInvoiceEmail({subject:'You added a new card to Google Pay',text:'payment invoice'},vendor),false);
  assert.equal(isInvoiceEmail({subject:'Introducing a new AI model',text:'payment invoice Google Workspace'},vendor),false);
  assert.equal(isInvoiceEmail({subject:'Google Ads invoice',text:'Google Ads'},vendor),false);
});
