#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {parseArgs} from 'node:util';
import {loadConfig,writePrivate} from './config.mjs';
import {Store} from './store.mjs';
import {MuseClient,OfflineAdvisor,LocalReviewAdvisor} from './llm.mjs';
import {OdooReader,odooEnvironment} from './odoo.mjs';
import {readMail} from './mail.mjs';
import {ArcTreasury} from './chain.mjs';
import {runAgent} from './engine.mjs';
import {writeReport} from './report.mjs';

const help=`Tameion AP Agent
  run --source fixture|odoo|email [--since YYYY-MM-DD] [--limit 10] [--offline] [--local-review] [--execute-testnet]
  prepare-testnet [--fund 3.00]
  report
  serve [--port 4767]
  audit
Defaults: dry-run, read-only Odoo/email, Arc TESTNET only.
--offline is an explicitly labeled fixture baseline, not an LLM demonstration.
Use AP_ENV_FILE, ODOO_ENV_FILE, AP_WALLETS_FILE and AP_DATA_DIR to configure local paths.`;

async function main(){
  const command=process.argv[2]||'help';
  if(command==='help'){console.log(help);return;}
  const {values}=parseArgs({args:process.argv.slice(3),options:{source:{type:'string',default:'fixture'},since:{type:'string',default:'2026-10-01'},limit:{type:'string',default:'10'},offline:{type:'boolean',default:false},'local-review':{type:'boolean',default:false},'execute-testnet':{type:'boolean',default:false},fund:{type:'string',default:'3.00'},port:{type:'string',default:'4767'}}});
  const config=loadConfig();fs.mkdirSync(config.dataDir,{recursive:true,mode:0o700});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(values.since))throw Error('Invalid --since date.');
  const limit=Number(values.limit);if(!Number.isInteger(limit)||limit<1||limit>200)throw Error('--limit must be 1–200.');
  if(command==='serve'){
    const port=Number(values.port);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local port.');
    http.createServer((req,res)=>{
      if(req.method!=='GET'){res.writeHead(405);res.end();return;}
      const file=req.url==='/'?'report.html':req.url==='/report.json'?'report.json':null;
      if(!file||!fs.existsSync(path.join(config.dataDir,file))){res.writeHead(404);res.end('Generate a report first.');return;}
      res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(fs.readFileSync(path.join(config.dataDir,file)));
    }).listen(port,'127.0.0.1',()=>console.log(`Read-only local report: http://127.0.0.1:${port}`));return;
  }
  const lock=path.join(config.dataDir,'.run.lock');
  let fd;
  try{fd=fs.openSync(lock,'wx',0o600);fs.writeFileSync(fd,String(process.pid));}catch{throw Error('Another run may be active. Inspect data/.run.lock before retrying.');}
  let store;
  try{
    if(command==='prepare-testnet'){
      console.log('Preparing guarded Arc testnet treasury…');
      console.log(JSON.stringify(await new ArcTreasury(config).prepare({fund:values.fund}),null,2));return;
    }
    store=new Store(path.join(config.dataDir,'journal.sqlite'));
    if(command==='report'){console.log(JSON.stringify(writeReport(store,config).stats,null,2));return;}
    if(command==='audit'){if(!store.verifyAudit())throw Error('Audit hash-chain verification failed.');console.log('Audit hash chain verified.');return;}
    if(command!=='run')throw Error('Unknown command. Use help.');
    if(values.offline&&(values.source!=='fixture'||values['execute-testnet']))throw Error('--offline is allowed only for fixture dry-runs.');
    if(values['local-review']&&values['execute-testnet'])throw Error('Local review has no payment authority.');
    if(values.source!=='fixture'&&!values['local-review']&&config.model.endsWith('-contributor')&&config.env.AP_ALLOW_REAL_DATA_TO_CONTRIBUTOR!=='yes')throw Error('Real invoice data on Contributor requires explicit approval. Use --local-review to keep private documents local.');
    const advisor=values['local-review']?new LocalReviewAdvisor():values.offline?new OfflineAdvisor():new MuseClient(config);
    let invoices;
    if(values.source==='fixture')invoices=JSON.parse(fs.readFileSync(path.join(config.root,'fixtures/invoices.json'))).slice(0,limit);
    else if(values.source==='odoo')invoices=await new OdooReader(odooEnvironment(config)).readBills({since:values.since,limit});
    else if(values.source==='email')invoices=await readMail(config,advisor,{since:values.since,limit});
    else throw Error('Unknown source.');
    console.log(`Read ${invoices.length} ${values.source} source records. Mode: ${values['execute-testnet']?'ARC TESTNET':'dry-run'}. Model: ${advisor.model}.`);
    let chain;
    if(values['execute-testnet']){chain=new ArcTreasury(config);await chain.load();}
    const summary=await runAgent(invoices,{config,store,advisor,chain,execute:values['execute-testnet']});
    const report=writeReport(store,config);writePrivate(path.join(config.dataDir,'last-run.json'),summary);
    console.log(JSON.stringify({...summary,auditValid:report.auditValid},null,2));
    console.log(`Report: ${path.join(config.dataDir,'report.html')}`);
  }finally{store?.close();if(fd!==undefined)fs.closeSync(fd);fs.unlinkSync(lock);}
}

main().catch(error=>{console.error(error.message);process.exitCode=1;});
