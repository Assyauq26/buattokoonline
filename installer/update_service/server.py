"""Two Unix sockets: private commands, capability-authenticated read-only status."""
import fcntl, hashlib, hmac, ipaddress, json, os, re, socketserver, threading, time
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler
import core
from . import VERSION
from .engine import Engine
from .state import State, ACTIVE
from .trust import Rejected, verify, version
from .availability import availability

class NoRedirect(HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):raise Rejected('catalog_redirect')
class Controller:
 def __init__(self,config):
  self.config=config;self.state=State(config['database'],config['installation']);self.engine=Engine(self.state,config)
  self.check_lock=threading.Lock();self.last_check=0;self.catalog_error=None;self.catalog=None
  self.state.recover()
 def actor(self,actor,session_version,session_hash,expires):
  if not re.fullmatch('[a-zA-Z0-9_-]{1,128}',actor or '') or type(session_version)!=int or not 0<=session_version<2**31 or not re.fullmatch('[a-f0-9]{64}',session_hash or '') or type(expires)!=int or expires<=time.time():raise Rejected('session_expired')
  # Strict characters above make these SQL literals bounded, not caller SQL.
  q=f'''SELECT count(*) FROM "User" u WHERE u.id='{actor}' AND u."isActive" AND u."deletedAt" IS NULL AND u."sessionVersion"={session_version} AND EXISTS(SELECT 1 FROM "UserRole" ur JOIN "Role" r ON r.id=ur."roleId" WHERE ur."userId"=u.id AND r.name='Admin') AND NOT EXISTS(SELECT 1 FROM "SessionRevocation" WHERE "tokenHash"='{session_hash}');'''
  if core.sql(q)!='1':raise Rejected('access_denied')
 def checked(self,force=False):
  with self.check_lock:
   if not force and self.catalog and self.catalog['expiresAt']>time.time():return self.catalog
   if time.time()-self.last_check<30:raise Rejected('check_cooldown')
   self.last_check=time.time()
   try:
    with build_opener(NoRedirect()).open(Request(self.config['catalog'],headers={'User-Agent':'BTOS-Updater/2'}),timeout=8) as r:raw=r.read(1024*1024+1)
    catalog=verify(raw,core.read_json(self.config['trust']))
    self.state.catalog(catalog);self.catalog=catalog;self.catalog_error=None
    return catalog
   except Exception:self.catalog_error='catalog_unavailable';raise Rejected('catalog_unavailable') from None
 def status(self):
  installed=core.read_json(core.CONFIG/'version.json');cat=self.catalog
  valid=cat and cat['expiresAt']>time.time() and not self.catalog_error
  jobs=[]
  for row in self.state.jobs():
   detail=json.loads(row['detail']);release=json.loads(row['release'])
   jobs.append({k:row[k] for k in ['id','state','created','updated']}|{'version':release['version'],'sha':release['sha'],'detail':{k:v for k,v in detail.items() if k in ['error','downloaded','total','activeVersion','finishedAt']}})
  discovery=availability(cat,installed,self.config['channel'],VERSION,bool(valid))
  # Do not offer a lower executable release while hiding a newer blocked one.
  offered=discovery['nextRelease'] if discovery['state']=='available' else None
  return {'installation':self.config['installation'],'updaterVersion':VERSION,'installedVersion':installed['version'],'installedSha':installed['source_sha'],'checkedAt':self.last_check or None,'catalogError':self.catalog_error,'release':offered,'availability':discovery,'jobs':jobs}
 def command(self,body):
  if not isinstance(body,dict) or set(body)-{'action','installation','actor','sessionVersion','sessionHash','sessionExpires','sha','requestKey'}:raise Rejected('invalid_body')
  if body.get('installation')!=self.config['installation']:raise Rejected('installation_mismatch')
  actor=body.get('actor');sv=body.get('sessionVersion');sh=body.get('sessionHash');exp=body.get('sessionExpires')
  self.actor(actor,sv,sh,exp)
  self.state.limit('control',60,60)
  action=body.get('action')
  if action=='check':self.checked(True)
  elif action=='start':
   if not re.fullmatch('[a-f0-9-]{36}',body.get('requestKey','')):raise Rejected('invalid_request_key')
   if self.state.prior(actor,body['requestKey'],body.get('sha')):
    return self.status()|{'statusToken':self.state.ticket(actor,sv,sh,exp)}
   self.state.limit('start',5,300)
   # Re-fetch the signed catalog at start: revocations/outages cannot be bypassed
   # using a previously displayed, stale available release.
   with self.check_lock:self.last_check=0
   cat=self.checked(True)
   release=next((r for r in cat['releases'] if r['sha']==body.get('sha')),None)
   eligible=self.status()['release']
   if not release or not eligible or eligible['sha']!=release['sha']:raise Rejected('release_not_available')
   self.state.start(actor,body['requestKey'],release)
  elif action!='status':raise Rejected('invalid_action')
  return self.status()|{'statusToken':self.state.ticket(actor,sv,sh,exp)}
 def worker(self):
  while True:
   jobs=self.state.jobs();job=next((j for j in jobs if j['state']=='queued'),None)
   if job:
    try:self.engine.process(job)
    except Exception:self.state.set(job['id'],'recovery_required',error='worker_interrupted')
   time.sleep(2)

class Handler(BaseHTTPRequestHandler):
 protocol_version='HTTP/1.0'
 def setup(self):super().setup();self.connection.settimeout(10)
 def log_message(self,*args):pass # No headers, query strings, credentials or request bodies in logs.
 def response(self,status,body):
  data=json.dumps(body).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','private, no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def do_GET(self):
  try:
   if not self.server.readonly or self.path!='/api/local-updater/status':return self.response(404,{'error':'not_found'})
   token=self.headers.get('Authorization','').removeprefix('Bearer ');actor=self.server.controller.state.ticket_actor(token)
   if not actor:raise Rejected('session_expired')
   self.server.controller.state.limit('status',120,60)
   self.server.controller.actor(actor['actor'],actor['session_version'],actor['session_hash'],actor['expires'])
   self.response(200,self.server.controller.status())
  except Rejected as e:self.response(401 if str(e) in ['session_expired','access_denied'] else 429,{'error':'status_unavailable'})
  except Exception:self.response(503,{'error':'status_unavailable'})
 def do_POST(self):
  try:
   if self.server.readonly or self.path!='/command':return self.response(404,{'error':'not_found'})
   token=self.headers.get('Authorization','').removeprefix('Bearer ')
   expected=Path(self.server.controller.config['controlToken']).read_text().strip()
   if not hmac.compare_digest(token,expected):raise Rejected('access_denied')
   size=int(self.headers.get('Content-Length','0'))
   if not 0<size<=2048 or self.headers.get('Transfer-Encoding'):raise Rejected('invalid_body')
   result=self.server.controller.command(json.loads(self.rfile.read(size)));self.response(200,result)
  except Rejected as e:self.response(409,{'error':str(e)})
  except Exception:self.response(503,{'error':'updater_unavailable'})
class BoundedThreads(socketserver.ThreadingMixIn):
 daemon_threads=True
 def __init__(self,*args,**kwargs):self.slots=threading.BoundedSemaphore(8);super().__init__(*args,**kwargs)
 def process_request(self,request,address):
  if not self.slots.acquire(blocking=False):self.shutdown_request(request);return
  try:super().process_request(request,address)
  except BaseException:self.slots.release();raise
 def process_request_thread(self,request,address):
  try:super().process_request_thread(request,address)
  finally:self.slots.release()
class UnixServer(BoundedThreads,socketserver.UnixStreamServer):pass
class StatusServer(BoundedThreads,socketserver.TCPServer):allow_reuse_address=True
def main():
 os.umask(0o077)
 from .runtime import install
 install()
 cfg=core.read_json('/etc/single-store/updater/config.json')
 if not cfg['catalog'].startswith('https://buattokosendiri.web.id/') or cfg['channel'] not in ['pilot','stable']:raise Rejected('operator_configuration')
 lock=open('/run/single-store-updater/service.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 controller=Controller(cfg)
 for path,readonly in [('/run/single-store-updater/control.sock',False),('/run/single-store-update-status/status.sock',True)]:
  Path(path).unlink(missing_ok=True);server=UnixServer(path,Handler);server.controller=controller;server.readonly=readonly
  os.chmod(path,0o666 if readonly else 0o660)
  if not readonly:os.chown(path,0,1000)
  threading.Thread(target=server.serve_forever,daemon=True).start()
 # Only the read-only, ticket-authenticated surface is reachable from Caddy.
 # The address is the operator-selected private Docker bridge, never 0.0.0.0.
 address=cfg.get('statusAddress')
 if address:
  ip=ipaddress.ip_address(address)
  if ip.version!=4 or not ip.is_private or ip.is_unspecified:raise Rejected('status_address')
  server=StatusServer((address,17841),Handler);server.controller=controller;server.readonly=True
  threading.Thread(target=server.serve_forever,daemon=True).start()
 controller.worker()
if __name__=='__main__':main()
