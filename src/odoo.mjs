import fs from 'node:fs';
import dotenv from 'dotenv';

// No generic execute_kw escape hatch: this adapter exposes reads only.
export class OdooReader {
  constructor(env,{fetchImpl=fetch}={}) {
    this.env=env; this.fetch=fetchImpl; this.uid=null;
    this.url=new URL('/jsonrpc',env.ODOO_URL);
    if(this.url.protocol!=='https:' || this.url.hostname!=='www.deepskill.space')throw Error('Unexpected Odoo endpoint.');
  }
  async #rpc(service,method,args) {
    const r=await this.fetch(this.url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:'call',params:{service,method,args},id:1})});
    if(!r.ok)throw Error(`Odoo read failed (HTTP ${r.status}).`);
    const j=await r.json();if(j.error)throw Error('Odoo read failed; check authentication and read permissions.');return j.result;
  }
  async authenticate(){this.uid=await this.#rpc('common','authenticate',[this.env.ODOO_DB,this.env.ODOO_LOGIN,this.env.ODOO_API_KEY,{}]);if(!this.uid)throw Error('Odoo authentication failed.');}
  async readBills({since,limit=200}={}) {
    if(!this.uid)await this.authenticate();
    let result=[], after=0;
    while(result.length<limit) {
      const domain=[['move_type','=','in_invoice'],['id','>',after]];
      if(since)domain.push(['invoice_date','>=',since]);
      const rows=await this.#rpc('object','execute_kw',[this.env.ODOO_DB,this.uid,this.env.ODOO_API_KEY,'account.move','search_read',[domain],{fields:['id','name','ref','partner_id','invoice_date','invoice_date_due','currency_id','amount_total','amount_residual','payment_state','state'],order:'id asc',limit:Math.min(100,limit-result.length)}]);
      if(!Array.isArray(rows))throw Error('Unexpected Odoo response.');if(!rows.length)break;
      result.push(...rows);after=rows.at(-1).id;
    }
    return result.map(r=>({source:'odoo',sourceId:`odoo:${r.id}`,vendor:r.partner_id?.[1]||'',reference:r.ref||r.name||'',date:r.invoice_date||null,dueDate:r.invoice_date_due||null,currency:r.currency_id?.[1]||'',amount:String(r.amount_residual>0?r.amount_residual:r.amount_total),paymentState:r.payment_state,state:r.state}));
  }
}
export function odooEnvironment(config){
  const file=config.env.ODOO_ENV_FILE;
  const shared=file?dotenv.parse(fs.readFileSync(file)):{};
  return {...shared,...config.env};
}
