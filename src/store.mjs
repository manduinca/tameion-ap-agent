import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {sha} from './policy.mjs';

export class Store {
  constructor(file) {
    if(file!==':memory:')fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(file);
    if(file!==':memory:')fs.chmodSync(file,0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS invoices(source_id TEXT PRIMARY KEY, invoice_key TEXT NOT NULL, payload TEXT NOT NULL, decision TEXT, status TEXT NOT NULL DEFAULT 'new', updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS invoice_key_idx ON invoices(invoice_key);
      CREATE TABLE IF NOT EXISTS payments(invoice_key TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, tx_id TEXT, tx_hash TEXT, status TEXT NOT NULL, amount_cents INTEGER NOT NULL, vendor TEXT NOT NULL, reason TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY, created_at TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL, previous_hash TEXT NOT NULL, hash TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'Append-only audit'); END;
      CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'Append-only audit'); END;`);
  }
  upsert(invoice,key) {
    const old=this.db.prepare('SELECT * FROM invoices WHERE source_id=?').get(invoice.sourceId);
    const payload=JSON.stringify(invoice);
    if(old && old.payload!==payload && this.payment(old.invoice_key)) throw Error('Invoice changed after payment intent; manual review required.');
    this.db.prepare(`INSERT INTO invoices(source_id,invoice_key,payload,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(source_id) DO UPDATE SET payload=excluded.payload,invoice_key=excluded.invoice_key,updated_at=excluded.updated_at`).run(invoice.sourceId,key,payload,new Date().toISOString());
  }
  isDuplicate(sourceId,key) {
    const first=this.db.prepare('SELECT source_id FROM invoices WHERE invoice_key=? ORDER BY rowid LIMIT 1').get(key);
    return Boolean(first && first.source_id!==sourceId);
  }
  payment(key) {return this.db.prepare('SELECT * FROM payments WHERE invoice_key=?').get(key);}
  intent(key,amount,vendor,reason) {
    this.db.prepare(`INSERT OR IGNORE INTO payments VALUES(?,?,NULL,NULL,'intent',?,?,?,?)`).run(key,randomUUID(),amount,vendor,reason,new Date().toISOString());
    const p=this.payment(key);
    if(p.amount_cents!==amount || p.vendor!==vendor) throw Error('Existing payment intent does not match invoice.');
    return p;
  }
  updatePayment(key,{status,txId=null,txHash=null}) {
    this.db.prepare('UPDATE payments SET status=?,tx_id=COALESCE(?,tx_id),tx_hash=COALESCE(?,tx_hash),updated_at=? WHERE invoice_key=?').run(status,txId,txHash,new Date().toISOString(),key);
  }
  decision(sourceId,decision,status) {this.db.prepare('UPDATE invoices SET decision=?,status=?,updated_at=? WHERE source_id=?').run(JSON.stringify(decision),status,new Date().toISOString(),sourceId);}
  event(type,data) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous=this.db.prepare('SELECT hash FROM events ORDER BY seq DESC LIMIT 1').get()?.hash || '0'.repeat(64);
      const createdAt=new Date().toISOString(), payload=JSON.stringify(data);
      const hash=sha(`${previous}|${createdAt}|${type}|${payload}`);
      this.db.prepare('INSERT INTO events(created_at,type,data,previous_hash,hash) VALUES(?,?,?,?,?)').run(createdAt,type,payload,previous,hash);
      this.db.exec('COMMIT');
    } catch(e) {this.db.exec('ROLLBACK');throw e;}
  }
  verifyAudit() {
    let prev='0'.repeat(64);
    for(const e of this.db.prepare('SELECT * FROM events ORDER BY seq').all()) {
      if(e.previous_hash!==prev || e.hash!==sha(`${prev}|${e.created_at}|${e.type}|${e.data}`))return false;
      prev=e.hash;
    }
    return true;
  }
  rows() {return this.db.prepare('SELECT * FROM invoices ORDER BY source_id').all().map(r=>({...r,invoice:JSON.parse(r.payload),decision:r.decision?JSON.parse(r.decision):null,payment:this.payment(r.invoice_key)}));}
  close(){this.db.close();}
}
