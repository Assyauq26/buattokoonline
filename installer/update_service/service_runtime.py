"""Preserve the mounted control directory across worker stop/start and restart.

systemd's default removes RuntimeDirectory on stop. Docker then retains a bind
mount to the deleted directory. Retain this directory (not weaker socket/token
permissions) so existing app mounts observe the replacement socket.
"""
import argparse
import hashlib
import os
from pathlib import Path
import re
import tempfile
import core
from .trust import Rejected

SYSTEMD=Path('/etc/systemd/system')
CONTENT=b'[Service]\nRuntimeDirectoryPreserve=yes\n'


def verify_mount(directory=Path('/run/single-store-updater')):
    """Read-only proof from the actual unprivileged app, not just the host socket."""
    try:
        import json
        host=Path(directory).stat()
        script="""const f=require('fs'),h=require('http'),s=f.statSync('/run/store-updater');const q=h.get({socketPath:'/run/store-updater/control.sock',path:'/api/local-updater/status'},r=>{r.resume();r.on('end',()=>console.log(JSON.stringify({directory:[s.dev,s.ino],status:r.statusCode})))});q.setTimeout(2000,()=>q.destroy());q.on('error',()=>process.exit(2));"""
        actual=json.loads(core.dc(['exec','-T','app','node','-e',script],timeout=10))
        if actual!={'directory':[host.st_dev,host.st_ino],'status':401}:raise ValueError()
        return {'appMountVerified':True,'unauthenticatedStatus':401}
    except Exception:raise Rejected('worker_socket_mount_review_required') from None


def preserve(unit='single-store-updater.service',apply=False):
    if os.geteuid()!=0:raise Rejected('operator_required')
    if not re.fullmatch(r'[a-z0-9-]{1,90}\.service',unit):raise Rejected('worker_service_review_required')
    from .worker_upgrade import secure_path
    secure_path(SYSTEMD)
    directory=SYSTEMD/(unit+'.d');path=directory/'60-store-worker-runtime.conf'
    if directory.exists():secure_path(directory)
    if directory.is_symlink() or path.is_symlink():raise Rejected('worker_service_review_required')
    if path.exists() and (not path.is_file() or path.read_bytes()!=CONTENT):raise Rejected('worker_service_review_required')
    receipt={'unit':unit,'path':str(path),'sha256':hashlib.sha256(CONTENT).hexdigest(),'alreadyPresent':path.exists(),'applied':False}
    if not apply:return receipt
    directory.mkdir(mode=0o755,exist_ok=True)
    if not path.exists():
        fd,name=tempfile.mkstemp(prefix='.runtime-',dir=directory)
        try:
            with os.fdopen(fd,'wb') as handle:handle.write(CONTENT);handle.flush();os.fsync(handle.fileno())
            os.chmod(name,0o644)
            os.link(name,path) # Full file appears atomically; never overwrite a custom drop-in.
        finally:Path(name).unlink(missing_ok=True)
        descriptor=os.open(directory,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(descriptor)
        finally:os.close(descriptor)
    core.run(['systemctl','daemon-reload'])
    # Fresh arming precedes creation of the immutable app's original unit.
    if (SYSTEMD/unit).exists() and core.run(['systemctl','show',unit,'--property=RuntimeDirectoryPreserve','--value'])!='yes':
        raise Rejected('worker_service_review_required')
    receipt['applied']=True
    return receipt


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--sha',required=True);p.add_argument('--apply',action='store_true');a=p.parse_args()
    from .worker_upgrade import inventory
    source=Path(a.source).resolve()
    if Path(__file__).resolve().parents[1]!=source/'installer':raise SystemExit('Pinned source module required')
    inventory(source,a.sha)
    with open('/run/single-store-operation.lock','a+') as lock:
        import fcntl,json
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        print(json.dumps(preserve(apply=a.apply)))
