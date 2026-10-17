import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {odooEnvironment} from './odoo.mjs';
import {matchVendor} from './policy.mjs';

export function isInvoiceEmail(email,vendor){
  if(!/invoice|factura|receipt|recibo|payment (received|confirmation|successful)|pago (recibido|confirmado)/i.test(email.subject))return false;
  if(vendor.alias==='google-workspace'&&!/google workspace|g suite/i.test(email.subject+' '+email.text))return false;
  return true;
}

export async function readMail(config,advisor,{since,limit=10}) {
  const env=odooEnvironment(config);
  if(!env.GMAIL_USER||!env.GMAIL_APP_PASSWORD)throw Error('GMAIL_USER and GMAIL_APP_PASSWORD are required for read-only IMAP.');
  const r=spawnSync('python3',[path.join(config.root,'scripts/read-mail.py'),'--since',since,'--limit',String(limit)],{encoding:'utf8',maxBuffer:4*1024*1024,timeout:180000,env:{...process.env,GMAIL_USER:env.GMAIL_USER,GMAIL_APP_PASSWORD:env.GMAIL_APP_PASSWORD}});
  if(r.status!==0)throw Error('Read-only mail ingestion failed; check IMAP access.');
  const messages=JSON.parse(r.stdout), invoices=[];
  for(const email of messages) {
    const vendors=config.policy.vendors.filter(v=>v.senders.some(d=>email.senderDomain===d||email.senderDomain.endsWith('.'+d)));
    if(vendors.length!==1||!isInvoiceEmail(email,vendors[0]))continue;
    let extracted;
    try{extracted=await advisor.extractEmail(email);}catch{extracted={reference:null,amount:null,currency:null,date:null,dueDate:null,paid:false,amountEvidence:'',confidence:0};}
    const evidence=extracted.amountEvidence||'';
    const escapedAmount=String(extracted.amount||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const amountVerified=Boolean(extracted.amount && evidence && email.text.includes(evidence) && new RegExp(`(?<![\\d.])${escapedAmount}(?![\\d.])`).test(evidence.replace(/,/g,'')));
    const clearlyPaid=/receipt|payment (received|confirmation|successful)|recibo|pago (recibido|confirmado)|factura pagada/i.test(email.subject);
    invoices.push({source:'email',sourceId:email.sourceId,vendor:vendors[0].alias,reference:extracted.reference||'',date:extracted.date,dueDate:extracted.dueDate,currency:extracted.currency||'',amount:extracted.amount||'',paid:clearlyPaid||extracted.paid,state:'posted',senderDomain:email.senderDomain,authenticatedSender:email.authenticatedSender,amountVerified,extractionConfidence:extracted.confidence});
  }
  return invoices;
}
