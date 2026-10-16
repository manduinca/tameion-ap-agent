import {createHash} from 'node:crypto';
import {id} from 'ethers';

export const sha = value => createHash('sha256').update(String(value)).digest('hex');
const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().trim();

export function money(value) {
  const text = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw Error('Amount must be positive decimal money with at most two fractional digits.');
  const [whole, fraction=''] = text.split('.');
  const cents = BigInt(whole)*100n + BigInt(fraction.padEnd(2,'0'));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('Amount is too large.');
  return Number(cents);
}
export const units = cents => BigInt(cents)*10000n;
export const formatMoney = cents => `${Math.floor(cents/100)}.${String(cents%100).padStart(2,'0')}`;
export const categoryId = name => id(name);
export const businessDate = (date=new Date()) => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);

export function matchVendor(invoice, policy) {
  const name = normalize(invoice.vendor);
  const matches = policy.vendors.filter(v => v.alias===name || v.patterns.some(p => name.includes(p)));
  return matches.length===1 ? matches[0] : null;
}

export function invoiceKey(invoice, policy) {
  const vendor = matchVendor(invoice, policy)?.alias || normalize(invoice.vendor);
  const reference = normalize(invoice.reference).replace(/[^\p{L}\p{N}]/gu,'');
  return '0x'+sha(`${vendor}|${reference || 'missing:'+invoice.sourceId}`);
}

export function assess(invoice, policy, {now=new Date(), duplicate=false, alreadyPaid=false, historicalAmounts=[]}={}) {
  const vendor=matchVendor(invoice, policy);
  const base={vendor, key:invoiceKey(invoice,policy), amountCents:null, blockers:[], disposition:null};
  const block=(code,action)=>{base.blockers.push(code); if(base.disposition!=='hold')base.disposition=action;};
  if (duplicate || alreadyPaid) block('duplicate_or_already_paid','hold');
  if (['paid','in_payment','reversed'].includes(invoice.paymentState) || invoice.paid===true) block('already_settled_in_source','hold');
  if (invoice.state && invoice.state!=='posted') block('source_invoice_not_posted','hold');
  if (!invoice.reference) block('missing_invoice_reference','escalate');
  if (!vendor) block('vendor_not_allowlisted','escalate');
  if (invoice.source==='email' && (!vendor || !invoice.authenticatedSender || !vendor.senders.some(d=>invoice.senderDomain===d||invoice.senderDomain?.endsWith('.'+d)))) block('unverified_email_sender','escalate');
  if (invoice.currency!=='USD') block('unsupported_currency_no_implicit_fx','escalate');
  try { base.amountCents=money(invoice.amount); if(base.amountCents<=0)block('non_positive_amount','escalate'); } catch {block('invalid_amount','escalate');}
  if (base.amountCents>money(policy.perTransactionLimitUSDC)) block('per_transaction_limit','escalate');
  else if (base.amountCents>money(policy.autoLimitUSDC)) block('owner_approval_required','escalate');
  const date = String(invoice.dueDate ?? '');
  const validDate=/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10)===date;
  if (!validDate) block('missing_or_invalid_due_date','escalate');
  else if(date>businessDate(now)) block('not_due_yet','hold');
  if (invoice.extractionConfidence!=null && invoice.extractionConfidence<policy.minimumConfidence) block('low_extraction_confidence','escalate');
  if (invoice.source==='email' && invoice.amountVerified!==true) block('amount_not_verified_in_source','escalate');
  const past=historicalAmounts.filter(x=>Number.isSafeInteger(x)&&x>0).sort((a,b)=>a-b);
  if(past.length>=3 && base.amountCents>past[Math.floor(past.length/2)]*policy.anomalyMultiplier) block('amount_anomaly','escalate');
  return base;
}

export function finalize(assessment, recommendation, minimumConfidence) {
  if(assessment.disposition) return {action:assessment.disposition, reason:assessment.blockers.join('; '), guardrails:assessment.blockers};
  if(recommendation.confidence<minimumConfidence) return {action:'escalate',reason:'model_confidence_below_threshold',guardrails:['model_confidence_below_threshold']};
  return {action:recommendation.action, reason:recommendation.reason,guardrails:[]};
}
