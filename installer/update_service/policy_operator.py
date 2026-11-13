"""Prepare/sign a public detached v1.8.0 policy. Never publishes or prints keys."""
import argparse
import base64
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import core
import promotions_transition as transition
from .upgrade_policy import authenticate
from .trust import Rejected

TARGET_SHA='7e81f8e60b27ab5695ac50ac6b653b63095e36d1'
TARGET_DIGEST='2e15208d27a87a4aeae4446404d45a1f91b55fcc5d28da3714dc064aeeaa9223'


def prepare(old,new,installations,sequence,now=None):
    now=int(time.time()) if now is None else now
    baseline,files=transition.package(old,transition.BASE_ARCHIVE,transition.BASE_RELEASE_SOURCE,'1.7.4')
    target,_=transition.package(new,TARGET_DIGEST,TARGET_SHA,'1.8.0')
    return dict(format=2,repository=core.REPO,id='canonical-v174-to-v180',sequence=sequence,issuedAt=now,expiresAt=now+86400,
        fromVersion='1.7.4',toVersion='1.8.0',fromSourceSha=transition.BASE_RELEASE_SOURCE,sourceSha=TARGET_SHA,
        artifactDigest=TARGET_DIGEST,baselineAppTree=transition.BASE_TREE,baselineSchemaHash=transition.BASE_SCHEMA,
        baselineFiles={p:transition.digest(files[p]) for p in sorted(transition.runtime_paths(files))},
        minimumWorker=3,executor='forward-cutover-v1',failureStrategy='forward-only-after-migration',
        beforeMigrations=baseline['migrations'],afterMigrations=target['migrations'],installations=installations)


def sign(policy,key,key_id):
    path=Path(key)
    if path.is_symlink() or not path.is_file():raise Rejected('signing_key_path')
    if os.name=='posix' and path.stat().st_mode & 0o077:raise Rejected('signing_key_permissions')
    with tempfile.TemporaryDirectory() as folder:
        p=Path(folder);raw=json.dumps(policy,separators=(',',':')).encode();(p/'payload').write_bytes(raw)
        subprocess.run(['openssl','pkeyutl','-sign','-inkey',str(path),'-rawin','-in',str(p/'payload'),'-out',str(p/'signature')],check=True,capture_output=True)
        public=subprocess.check_output(['openssl','pkey','-in',str(path),'-pubout'],stderr=subprocess.DEVNULL).decode()
        envelope={'keyId':key_id,'payload':base64.b64encode(raw).decode(),'signature':base64.b64encode((p/'signature').read_bytes()).decode()}
        authenticate(json.dumps(envelope).encode(),{key_id:public})
        return envelope


if __name__=='__main__':
    parser=argparse.ArgumentParser();subs=parser.add_subparsers(dest='command',required=True)
    create=subs.add_parser('prepare');create.add_argument('--from-archive',required=True);create.add_argument('--to-archive',required=True)
    create.add_argument('--installation',action='append',required=True);create.add_argument('--sequence',type=int,required=True);create.add_argument('--output',required=True)
    signer=subs.add_parser('sign');signer.add_argument('--input',required=True);signer.add_argument('--private-key',required=True);signer.add_argument('--key-id',required=True);signer.add_argument('--output',required=True)
    args=parser.parse_args()
    result=prepare(args.from_archive,args.to_archive,args.installation,args.sequence) if args.command=='prepare' else sign(core.read_json(args.input),args.private_key,args.key_id)
    output=Path(args.output)
    # Refuse overwriting previous signed/public metadata; publishing is separate.
    with output.open('x',encoding='utf8') as handle:json.dump(result,handle,separators=(',',':'));handle.flush();os.fsync(handle.fileno())
    print('Public policy file created; not published.')
