"""Per-installation Google client provisioning. No shared Hubify credentials.

Root operator only; stages a private env file and Compose reference. It never
restarts an app, enables an account, calls Gmail or writes database credentials.
"""
import argparse
import base64
import json
import os
from pathlib import Path
import re
import secrets
import core
from update_service.trust import Rejected
from update_service.worker_upgrade import secure_path
from promotions_cutover import operation_lock

def validate(value,origin):
    from urllib.parse import urlsplit
    parsed=urlsplit(origin)
    if parsed.scheme!='https' or parsed.path not in ('','/') or parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise Rejected('oauth_origin')
    web=value.get('web',{})
    callback=origin.rstrip('/')+'/api/v1/admin/payment-evidence/oauth/callback'
    if not re.fullmatch(r'[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com',web.get('client_id','')) or not re.fullmatch(r'[a-zA-Z0-9_-]{10,200}',web.get('client_secret','')):
        raise Rejected('oauth_client')
    if web.get('auth_uri')!='https://accounts.google.com/o/oauth2/auth' or web.get('token_uri')!='https://oauth2.googleapis.com/token' or callback not in web.get('redirect_uris',[]):
        raise Rejected('oauth_callback')
    return web,callback

def provision(client,admins,apply=False):
    if os.geteuid()!=0:raise Rejected('operator_required')
    client=Path(client);secure_path(client)
    if client.stat().st_mode&0o077:raise Rejected('oauth_file_permissions')
    runtime=dict(line.split('=',1) for line in (core.CONFIG/'runtime.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
    web,callback=validate(core.read_json(client),runtime['APP_ORIGIN'])
    if not admins or any(not re.fullmatch('[a-zA-Z0-9_-]{1,100}',a) for a in admins):raise Rejected('oauth_admins')
    folder=core.CONFIG/'payment-evidence';env=folder/'oauth-runtime.env'
    compose=core.read_json(core.COMPOSE)
    # Existing pilot keys/private envelopes require their own reviewed operator
    # transition; this command never rotates or overwrites any encryption key.
    if folder.exists() and any(folder.iterdir()):raise Rejected('oauth_existing_configuration_requires_review')
    report={'callback':callback,'adminCount':len(admins),'applied':False,'restartRequired':True,'accountActivation':False}
    if not apply:return report
    folder.mkdir(mode=0o700,exist_ok=True);secure_path(folder)
    values={'PAYMENT_EVIDENCE_PREVIEW':'true','PAYMENT_GMAIL_OAUTH_TEST':'true',
        'PAYMENT_BLU_CHECKOUT_ENABLED':'true','PAYMENT_EVIDENCE_ADMIN_IDS':','.join(admins),
        'PAYMENT_GOOGLE_CLIENT_ID':web['client_id'],'PAYMENT_GOOGLE_CLIENT_SECRET':web['client_secret'],
        'PAYMENT_INTEGRATION_ENCRYPTION_KEY':base64.b64encode(secrets.token_bytes(32)).decode()}
    fd=os.open(env,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as handle:
        handle.write(''.join(k+'='+v+'\n' for k,v in values.items()));handle.flush();os.fsync(handle.fileno())
    backup=folder/'compose.before.json'
    core.atomic_json(backup,compose)
    files=compose['services']['app'].get('env_file',[])
    if not isinstance(files,list):raise Rejected('compose_env_file')
    compose['services']['app']['env_file']=[*files,str(env)]
    core.atomic_json(core.COMPOSE,compose)
    report['applied']=True
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--client-json',required=True);p.add_argument('--admin',action='append',required=True);p.add_argument('--apply',action='store_true')
    a=p.parse_args()
    if a.apply:
        with operation_lock():print(json.dumps(provision(a.client_json,a.admin,True)))
    else:print(json.dumps(provision(a.client_json,a.admin)))
