"""Detached Ed25519 catalog verification against an operator-installed trust root."""
import base64, hashlib, json, re, subprocess, tempfile, time
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen, HTTPRedirectHandler, build_opener

class Rejected(Exception): pass
REPO = 'Assyauq26/buattokoonline'
VERSION = re.compile(r'(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})')
def version(value):
 if not isinstance(value,str) or not VERSION.fullmatch(value):raise Rejected('invalid_version')
 return tuple(map(int,value.split('.')))
def strict_json(raw):
 def unique(pairs):
  result={}
  for k,v in pairs:
   if k in result:raise Rejected('duplicate_field')
   result[k]=v
  return result
 return json.loads(raw,object_pairs_hook=unique)
def verify(envelope, roots, now=None):
 now=int(time.time()) if now is None else now
 if len(envelope)>1024*1024:raise Rejected('catalog_too_large')
 try:
  outer=strict_json(envelope)
  if set(outer)!={'keyId','payload','signature'} or outer['keyId'] not in roots:raise Rejected('untrusted_key')
  payload=base64.b64decode(outer['payload'],validate=True);signature=base64.b64decode(outer['signature'],validate=True)
  if len(signature)!=64:raise Rejected('invalid_signature')
  with tempfile.TemporaryDirectory() as folder:
   p=Path(folder);(p/'key').write_text(roots[outer['keyId']]);(p/'payload').write_bytes(payload);(p/'sig').write_bytes(signature)
   r=subprocess.run(['openssl','pkeyutl','-verify','-pubin','-inkey',str(p/'key'),'-rawin','-in',str(p/'payload'),'-sigfile',str(p/'sig')],capture_output=True,timeout=10)
  if r.returncode:raise Rejected('invalid_signature')
  catalog=strict_json(payload)
  if catalog['format']!=2 or catalog['repository']!=REPO or type(catalog['sequence'])!=int or catalog['sequence']<1:raise Rejected('invalid_catalog')
  if not all(type(catalog[k])==int for k in ['issuedAt','expiresAt']) or not catalog['issuedAt']-60<=now<catalog['expiresAt'] or catalog['expiresAt']-catalog['issuedAt']>7*86400:raise Rejected('catalog_expired')
  if not isinstance(catalog['releases'],list) or len(catalog['releases'])>50:raise Rejected('invalid_catalog')
  if not isinstance(catalog['revoked'],list) or any(not re.fullmatch('[a-f0-9]{40}',s) for s in catalog['revoked']):raise Rejected('invalid_revocations')
  identities=set()
  for item in catalog['releases']:
   version(item['version'])
   if version(item['minimumInstalledVersion'])>version(item['maximumInstalledVersion']):raise Rejected('invalid_compatibility')
   if not re.fullmatch('[a-f0-9]{40}',item['sha']) or not re.fullmatch('[a-f0-9]{64}',item['digest']):raise Rejected('invalid_identity')
   if item['version'] in identities:raise Rejected('duplicate_version')
   identities.add(item['version'])
   expected=f'https://github.com/{REPO}/releases/download/v{item["version"]}/store-v{item["version"]}.tar.gz'
   if item['url']!=expected or type(item['size'])!=int or not 0<item['size']<=300*1024*1024:raise Rejected('invalid_artifact')
   if item['channel'] not in ['pilot','stable'] or type(item['minimumUpdater'])!=int or item['minimumUpdater']<2:raise Rejected('invalid_compatibility')
   if type(item['rollbackCompatible'])!=bool or item['dbContract']!=1 or not isinstance(item['notes'],str) or len(item['notes'])>12000:raise Rejected('invalid_compatibility')
  return catalog
 except Rejected:raise
 except Exception:raise Rejected('invalid_catalog') from None

class SafeRedirect(HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  target=urlparse(newurl)
  if target.scheme!='https' or target.username or target.hostname not in {'github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'} or target.port not in [None,443]:raise Rejected('redirect_rejected')
  return super().redirect_request(req,fp,code,msg,headers,newurl)
def download(url,path,size,digest,progress=lambda done,total:None):
 if not url.startswith(f'https://github.com/{REPO}/releases/download/v'):raise Rejected('artifact_origin')
 deadline=time.monotonic()+300;done=0;hasher=hashlib.sha256()
 try:
  with build_opener(SafeRedirect()).open(Request(url,headers={'User-Agent':'BTOS-Updater/2'}),timeout=20) as response,open(path,'wb') as out:
   while True:
    if time.monotonic()>deadline:raise Rejected('download_timeout')
    block=response.read(65536)
    if not block:break
    done+=len(block)
    if done>size:raise Rejected('artifact_size')
    out.write(block);hasher.update(block);progress(done,size)
  if done!=size or hasher.hexdigest()!=digest:raise Rejected('artifact_digest')
 except Exception:
  Path(path).unlink(missing_ok=True);raise
