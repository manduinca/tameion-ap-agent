import {assess,finalize,invoiceKey,matchVendor} from './policy.mjs';

export async function runAgent(invoices,{config,store,advisor,chain=null,execute=false,now=new Date()}) {
  if(execute&&!chain)throw Error('Onchain treasury is required for execution.');
  const summary={processed:0,pay:0,hold:0,escalate:0,confirmed:0,replayed:0,sourceCounts:{},model:advisor.model,usage:null};
  let proposedTotal=0;const proposedCategories={};
  for(const invoice of invoices){
    summary.processed++;summary.sourceCounts[invoice.source]=(summary.sourceCounts[invoice.source]||0)+1;
    const key=invoiceKey(invoice,config.policy),existing=store.payment(key),duplicate=store.isDuplicate(invoice.sourceId,key);
    store.upsert(invoice,key);
    if(existing?.status==='confirmed'){summary.replayed++;continue;}
    const historicalAmounts=store.rows().filter(r=>r.source_id!==invoice.sourceId && matchVendor(r.invoice,config.policy)?.alias===matchVendor(invoice,config.policy)?.alias).map(r=>{try{return Number(r.invoice.amount)*100;}catch{return 0;}});
    const assessment=assess(invoice,config.policy,{now,duplicate,alreadyPaid:existing?.status==='failed',historicalAmounts});
    let recommendation;
    if(existing&&execute)recommendation={action:'pay',reason:existing.reason,confidence:1};
    else try{recommendation=await advisor.recommend(invoice,assessment);}catch{recommendation={action:'escalate',reason:'Model unavailable or invalid response; human review required.',confidence:0};}
    let decision={...finalize(assessment,recommendation,config.policy.minimumConfidence),recommendation,model:advisor.model,invoiceKey:key,source:invoice.source,mode:execute?'testnet':'dry-run'};
    if(decision.action==='pay'){
      const category=assessment.vendor.category;
      if(proposedTotal+assessment.amountCents>Math.round(Number(config.policy.totalBudgetUSDC)*100))decision={...decision,action:'escalate',reason:'total_budget_exceeded',guardrails:['total_budget_exceeded']};
      else if((proposedCategories[category]||0)+assessment.amountCents>Math.round(Number(config.policy.categories[category])*100))decision={...decision,action:'escalate',reason:'category_budget_exceeded',guardrails:['category_budget_exceeded']};
    }
    if(decision.action==='pay'&&execute){
      try {
        if(await chain.isPaid(key)&&!existing){decision={...decision,action:'hold',reason:'invoice_already_paid_onchain',guardrails:['invoice_already_paid_onchain']};}
        else {
          const blocker=existing?null:await chain.capacity(assessment.vendor,assessment.amountCents);
          if(blocker)decision={...decision,action:'escalate',reason:blocker,guardrails:[blocker]};
          else {
            const intent=store.intent(key,assessment.amountCents,assessment.vendor.alias,decision.reason);
            store.event('payment_intent',{invoiceKey:key,amountCents:assessment.amountCents,vendor:assessment.vendor.alias,mode:'testnet'});
            const tx=await chain.pay(key,assessment.vendor,assessment.amountCents,intent.reason,intent,txId=>store.updatePayment(key,{status:'submitted',txId}));
            store.updatePayment(key,{status:'confirmed',...tx});summary.confirmed++;
            store.event('payment_confirmed',{invoiceKey:key,...tx});
          }
        }
      }catch(error){
        // Keep intent and transaction ID for reconciliation; never create a new payment blindly.
        store.event('payment_unresolved',{invoiceKey:key,httpStatus:error.status??null,code:error.code??null});
        decision={...decision,action:'escalate',reason:'payment_pending_or_failed_review_required',guardrails:['payment_pending_or_failed_review_required']};
      }
    }
    summary[decision.action]++;
    if(decision.action==='pay'){proposedTotal+=assessment.amountCents;proposedCategories[assessment.vendor.category]=(proposedCategories[assessment.vendor.category]||0)+assessment.amountCents;}
    const paid=store.payment(key)?.status==='confirmed';
    store.decision(invoice.sourceId,decision,paid?'confirmed':decision.action==='pay'?'planned':decision.action);
    store.event('decision',{sourceId:invoice.sourceId,invoiceKey:key,action:decision.action,reason:decision.reason,mode:decision.mode,model:advisor.model});
  }
  summary.usage=advisor.usage;
  store.event('run_completed',summary);return summary;
}
