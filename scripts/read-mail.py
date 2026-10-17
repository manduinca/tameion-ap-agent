"""Read invoice emails with IMAP EXAMINE and BODY.PEEK; never send or change flags."""
import argparse, email, hashlib, imaplib, json, os, re, shutil, subprocess, sys
from email.header import decode_header, make_header
from email.policy import default
from email.utils import parseaddr
from html.parser import HTMLParser

class Text(HTMLParser):
    def __init__(self): super().__init__(); self.parts=[]; self.skip=0
    def handle_starttag(self, tag, attrs):
        if tag in ('script','style'): self.skip+=1
        elif tag in ('br','p','div','tr','li'): self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag in ('script','style'): self.skip=max(0,self.skip-1)
    def handle_data(self, value):
        if not self.skip:self.parts.append(value)

def header(message, name):
    return str(make_header(decode_header(str(message.get(name,'')))))

def read_messages(since, limit):
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', since): raise ValueError('Invalid date')
    domains=['google.com','googlemail.com','cloudflare.com','digitalocean.com','facebookmail.com','meta.com']
    query=f'after:{since.replace("-","/")} (invoice OR factura OR receipt OR recibo OR payment) ('+' OR '.join('from:'+d for d in domains)+')'
    with imaplib.IMAP4_SSL('imap.gmail.com', timeout=30) as client:
        client.login(os.environ['GMAIL_USER'],os.environ['GMAIL_APP_PASSWORD'])
        _,folders=client.list(); mailbox='INBOX'
        for folder in folders or []:
            if folder and b'\\All' in folder:
                match=re.search(rb'\) "[^"]*" (.+)$',folder)
                if match: mailbox=match.group(1).decode(); break
        status,_=client.select(mailbox,readonly=True)
        if status!='OK': raise RuntimeError('Cannot examine mailbox')
        status,data=client.uid('search',None,'X-GM-RAW','"'+query+'"')
        if status!='OK': raise RuntimeError('Invoice search failed')
        results=[]
        for uid in (data[0].split() if data and data[0] else [])[-limit:]:
            status,parts=client.uid('fetch',uid,'(BODY.PEEK[])')
            if status!='OK': continue
            raw=next((p[1] for p in parts if isinstance(p,tuple)),None)
            if raw is None or len(raw)>10_000_000: continue
            message=email.message_from_bytes(raw,policy=default)
            sender=parseaddr(str(message.get('From','')))[1].lower()
            domain=sender.rsplit('@',1)[-1]
            auth=message.get_all('Authentication-Results',[])
            authenticated=any(re.match(r'^mx\.google\.com\s*;',str(a),re.I) and re.search(r'\bdmarc=pass\b',str(a),re.I) and re.search(r'header\.from='+re.escape(domain)+r'(?:[;\s]|$)',str(a),re.I) for a in auth)
            plain=[]; html=[]; attachments=[]
            for part in message.walk():
                if part.is_multipart(): continue
                payload=part.get_payload(decode=True) or b''
                content_type=part.get_content_type()
                if content_type in ('text/plain','text/html') and part.get_content_disposition()!='attachment':
                    decoded=payload.decode(part.get_content_charset() or 'utf-8',errors='replace')
                    if content_type=='text/plain':plain.append(decoded)
                    else:
                        parser=Text();parser.feed(decoded);html.append(' '.join(parser.parts))
                elif content_type=='application/pdf' and len(payload)<5_000_000:
                    if shutil.which('pdftotext'):
                        proc=subprocess.run(['pdftotext','-','-'],input=payload,capture_output=True,timeout=20)
                        if proc.returncode==0: attachments.append(proc.stdout.decode('utf-8',errors='replace'))
            text='\n'.join(plain or html)+'\n'+'\n'.join(attachments)
            identifier=str(message.get('Message-ID') or f'{mailbox}:{uid.decode()}')
            results.append({'sourceId':'email:'+hashlib.sha256(identifier.encode()).hexdigest(),'from':sender,'senderDomain':domain,'authenticatedSender':authenticated,'subject':header(message,'Subject'),'text':text[:32000]})
        client.close()
        return results

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--since',required=True);parser.add_argument('--limit',type=int,default=10)
    args=parser.parse_args()
    try: print(json.dumps(read_messages(args.since,max(1,min(args.limit,50))),ensure_ascii=False))
    except Exception:
        print('Read-only invoice mail fetch failed; verify IMAP access and local credentials.',file=sys.stderr);sys.exit(1)
