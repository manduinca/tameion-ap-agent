import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {reportData} from '../src/report.mjs';

test('real invoice counts merge duplicate notifications and exclude unsupported email evidence',()=>{
  const store=new Store(':memory:');
  try{
    const invoice={source:'email',vendor:'google-workspace',reference:'INV-1',currency:'USD',amount:'12.00',authenticatedSender:true,amountVerified:true};
    store.upsert({...invoice,sourceId:'email:one'},'same-invoice');
    store.upsert({...invoice,sourceId:'email:two'},'same-invoice');
    store.upsert({...invoice,sourceId:'email:unverified',reference:'INV-2',amountVerified:false},'other-invoice');
    store.upsert({...invoice,sourceId:'email:unauthenticated',reference:'INV-3',authenticatedSender:false},'untrusted-invoice');
    store.upsert({...invoice,source:'fixture',sourceId:'fixture:one',reference:'DEMO-1'},'fixture-invoice');
    const report=reportData(store,{model:'test',policy:{vendors:[]}});
    assert.equal(report.stats.documents,5);
    assert.equal(report.stats.realDocuments,4);
    assert.equal(report.stats.invoices,2);
    assert.equal(report.stats.realInvoices,1);
    assert.equal(report.stats.fixtures,1);
    assert.equal(report.stats.confirmedPayments,0);
    assert.equal(report.auditValid,true);
  }finally{store.close();}
});
