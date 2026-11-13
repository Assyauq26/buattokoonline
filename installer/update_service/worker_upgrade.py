"""One-time root operator upgrade from an independently reviewed Git SHA.

Not exposed to the seller API. No network fetch, key bootstrap, app migration,
or application/config replacement. The operator authenticates the SHA out of
band; Git hashes alone are integrity checks, not independent signatures.
"""
import argparse
import ctypes
import hashlib
from contextlib import closing
import fcntl
import json
import os
from pathlib import Path
import re
import socket
import sqlite3
import subprocess
import tempfile
import time
import core
from .state import ACTIVE
from .trust import Rejected


def exchange(a,b):
    """Linux atomic directory exchange: no missing WorkingDirectory on reboot."""
    libc=ctypes.CDLL(None,use_errno=True)
    function=getattr(libc,'renameat2',None)
    if function is None:raise Rejected('atomic_exchange_unsupported')
    if function(-100,os.fsencode(a),-100,os.fsencode(b),2)!=0:
        raise Rejected('atomic_exchange_failed')
    directory=os.open(Path(a).parent,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(directory)
    finally:os.close(directory)


def files_digest(folder):
    result={}
    for p in Path(folder).rglob('*.py'):
        if p.is_symlink():raise Rejected('worker_path')
        result[p.relative_to(folder).as_posix()]=hashlib.sha256(p.read_bytes()).hexdigest()
    return result


def inventory(source, sha):
    source = Path(source).resolve()
    if not re.fullmatch('[a-f0-9]{40}', sha): raise Rejected('worker_source')
    def git(*args):
        return subprocess.check_output(['git', '-C', str(source), *args], stderr=subprocess.DEVNULL)
    if git('rev-parse', 'HEAD').decode().strip() != sha: raise Rejected('worker_source')
    result = {}
    for record in git('ls-tree', '-rz', sha, 'installer').split(b'\0'):
        if not record: continue
        header, raw_name = record.split(b'\t', 1)
        name = raw_name.decode()
        if not name.endswith('.py'): continue
        if header.split()[0] not in (b'100644', b'100755'): raise Rejected('worker_source')
        p = source/name
        if p.is_symlink() or not p.is_file(): raise Rejected('worker_source')
        data = git('show', sha+':'+name)
        if p.read_bytes() != data: raise Rejected('worker_source_bytes')
        result[name.removeprefix('installer/')] = data
    if not {'core.py','updater.py','update_service/server.py'} <= result.keys(): raise Rejected('worker_source')
    return result


def idle(config):
    uri = Path(config['database']).resolve().as_uri() + '?mode=ro'
    with closing(sqlite3.connect(uri, uri=True)) as db:
        if db.execute('SELECT count(*) FROM jobs WHERE state IN ('+','.join('?' for _ in ACTIVE)+')', ACTIVE).fetchone()[0]:
            raise Rejected('worker_busy')


def health():
    for _ in range(20):
        if subprocess.run(['systemctl','is-active','--quiet','single-store-updater.service']).returncode == 0:
            try:
                with socket.socket(socket.AF_UNIX) as connection:
                    connection.settimeout(2)
                    connection.connect('/run/single-store-update-status/status.sock')
                    connection.sendall(b'GET /api/local-updater/status HTTP/1.0\r\n\r\n')
                    if connection.recv(256).startswith(b'HTTP/1.0 401'): return
            except OSError: pass
        time.sleep(1)
    raise Rejected('worker_health')


def install(source, sha, apply=False):
    if os.geteuid() != 0: raise Rejected('operator_required')
    files = inventory(source, sha)
    target = core.ROOT/'updater'
    # Reject symlinked worker paths/parents instead of following arbitrary targets.
    if any(p.is_symlink() for p in (target, *target.parents)): raise Rejected('worker_path')
    config = core.read_json(core.CONFIG/'updater/config.json')
    # First rollout supports only the audited v2 family; unknown roots fail shut.
    if (target/'update_service/__init__.py').read_text().splitlines()[-1].strip() != 'VERSION = 2':
        raise Rejected('worker_version_unsupported')
    idle(config)
    receipt = {'sourceSha':sha, 'files':len(files), 'applied':False,
        'beforeFiles':files_digest(target),'afterFiles':{n:hashlib.sha256(v).hexdigest() for n,v in files.items()}}
    if not apply: return receipt
    with open('/run/single-store-operation.lock','a+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        idle(config)
        previous = target.with_name('updater.before-'+sha)
        journal = core.CONFIG/'updater/worker-upgrade.json'
        if previous.exists() or journal.exists(): raise Rejected('worker_upgrade_requires_review')
        stage = Path(tempfile.mkdtemp(prefix='.worker-', dir=target.parent))
        try:
            for name, data in files.items():
                path = stage/name; path.parent.mkdir(parents=True, exist_ok=True)
                with path.open('xb') as handle:
                    handle.write(data); handle.flush(); os.fsync(handle.fileno())
                path.chmod(0o600)
            for directory in sorted([stage,*[p for p in stage.rglob('*') if p.is_dir()]],key=lambda p:len(p.parts),reverse=True):
                handle=os.open(directory,os.O_RDONLY|os.O_DIRECTORY)
                try:os.fsync(handle)
                finally:os.close(handle)
            core.atomic_json(journal, {**receipt, 'phase':'prepared', 'previous':str(previous), 'stage':str(stage)})
            core.run(['systemctl','stop','single-store-updater.service'])
            idle(config)
            core.atomic_json(journal, {**receipt, 'phase':'switching', 'previous':str(previous), 'stage':str(stage)})
            exchange(target,stage)
            core.run(['systemctl','start','single-store-updater.service'])
            health()
            stage.rename(previous)
            receipt['applied']=True
            core.atomic_json(journal, {**receipt,'phase':'complete','previous':str(previous),'stage':str(stage)})
            return receipt
        except BaseException:
            # An interrupted directory switch stays journaled for operator review.
            # A completed, failed health probe can restore the untouched old worker.
            if stage.exists() and files_digest(target)==receipt['afterFiles'] and files_digest(stage)==receipt['beforeFiles']:
                core.run(['systemctl','stop','single-store-updater.service'])
                exchange(target,stage)
                core.run(['systemctl','start','single-store-updater.service']); health()
                core.atomic_json(journal, {**receipt,'phase':'rolled_back','previous':str(previous),'stage':str(stage)})
            elif target.exists() and not previous.exists():
                core.run(['systemctl','start','single-store-updater.service']); health()
            raise


def recover(source,sha):
    if os.geteuid()!=0:raise Rejected('operator_required')
    new={n:hashlib.sha256(v).hexdigest() for n,v in inventory(source,sha).items()}
    journal=core.CONFIG/'updater/worker-upgrade.json';j=core.read_json(journal)
    if j.get('sourceSha')!=sha or j.get('afterFiles')!=new:raise Rejected('worker_source')
    target=core.ROOT/'updater';stage=Path(j.get('stage',''));previous=Path(j.get('previous',''))
    if stage.parent!=target.parent or not stage.name.startswith('.worker-') or previous!=target.with_name('updater.before-'+sha):raise Rejected('worker_path')
    if any(p.is_symlink() for p in (target,stage,previous,*target.parents)):raise Rejected('worker_path')
    with open('/run/single-store-operation.lock','a+') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        idle(core.read_json(core.CONFIG/'updater/config.json'))
        current=files_digest(target)
        if current not in (j['beforeFiles'],j['afterFiles']):raise Rejected('worker_source_bytes')
        core.run(['systemctl','start','single-store-updater.service']);health()
        if current==j['afterFiles']:
            if stage.exists():
                if files_digest(stage)!=j['beforeFiles'] or previous.exists():raise Rejected('worker_source_bytes')
                stage.rename(previous)
            if not previous.exists() or files_digest(previous)!=j['beforeFiles']:raise Rejected('worker_source_bytes')
            j.update(phase='complete',applied=True)
        else:j.update(phase='rolled_back',applied=False)
        core.atomic_json(journal,j);return {'phase':j['phase'],'sourceSha':sha}


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',required=True);parser.add_argument('--sha',required=True)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--recover',action='store_true')
    args=parser.parse_args()
    result=recover(args.source,args.sha) if args.recover else install(args.source,args.sha,args.apply)
    print(json.dumps({k:v for k,v in result.items() if k not in ('beforeFiles','afterFiles')}))
