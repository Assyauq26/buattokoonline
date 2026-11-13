"""Actual systemd RuntimeDirectory lifecycle + read-only Docker bind regression."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'installer'))
from update_service.service_runtime import preserve

UNIT='updater-lab-runtime-e18a0010'
ROOT=Path('/opt/updater-runtime-regression')


def run(args):return subprocess.check_output([str(a) for a in args],stderr=subprocess.DEVNULL).decode().strip()


def probe():
    code="const n=require('net'),c=n.connect('/probe/control.sock');c.on('connect',()=>c.write('probe'));c.on('data',d=>{console.log(JSON.stringify({ok:d.toString()==='ok'}));c.end()});c.on('error',e=>console.log(JSON.stringify({ok:false,error:e.code})));"
    return json.loads(run(['docker','exec',UNIT,'node','-e',code]))


if __name__=='__main__':
    if os.geteuid()!=0 or ROOT.exists():raise SystemExit('Root, unused disposable fixture required')
    ROOT.mkdir(mode=0o700)
    server=ROOT/'server.py';server.write_text('''import socket,os
from pathlib import Path
p=Path('/run/updater-lab-runtime-e18a0010/control.sock');p.unlink(missing_ok=True)
s=socket.socket(socket.AF_UNIX);s.bind(str(p));os.chmod(p,0o660);os.chown(p,0,1000);s.listen(8)
while True:
 c,_=s.accept();c.recv(1024);c.sendall(b'ok');c.close()
''')
    unit=Path('/etc/systemd/system')/(UNIT+'.service')
    if unit.exists():raise SystemExit('Unit already exists')
    unit.write_text('[Unit]\nDescription=Disposable runtime bind regression\n[Service]\nType=simple\nRuntimeDirectory='+UNIT+'\nRuntimeDirectoryMode=0755\nExecStart=/usr/bin/python3 '+str(server)+'\n')
    run(['systemctl','daemon-reload']);run(['systemctl','start',UNIT])
    for _ in range(50):
        if (Path('/run')/UNIT/'control.sock').exists():break
        time.sleep(.1)
    run(['docker','run','-d','--name',UNIT,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
        '--user','1000:1000','--mount','type=bind,src=/run/'+UNIT+',dst=/probe,readonly','node:22-bookworm-slim','sleep','infinity'])
    assert probe()['ok'];before=(Path('/run')/UNIT).stat().st_ino
    run(['systemctl','stop',UNIT]);run(['systemctl','start',UNIT]);time.sleep(.3)
    broken=probe();assert not broken['ok'] and broken['error']=='ENOENT'
    run(['docker','restart',UNIT]);assert probe()['ok']
    policy=preserve(UNIT+'.service',apply=True);fixed=(Path('/run')/UNIT).stat().st_ino
    run(['systemctl','stop',UNIT]);assert (Path('/run')/UNIT).stat().st_ino==fixed
    run(['systemctl','start',UNIT]);time.sleep(.3);assert probe()['ok']
    run(['systemctl','restart',UNIT]);time.sleep(.3);assert probe()['ok'] and (Path('/run')/UNIT).stat().st_ino==fixed
    report={'actualSystemd':True,'actualReadOnlyDockerBind':True,'oldDefaultReproduced':'ENOENT after stop/start','preservedStopStart':True,
        'preservedRestart':True,'sameDirectoryInodeAfterFix':True,'socketMode':'0660','clientUid':1000,'network':'none','policyHash':policy['sha256'],'centralPlatformChanged':False}
    (ROOT/'result.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
    run(['systemctl','stop',UNIT]);run(['docker','stop',UNIT])
    # No data volumes exist. Keep the stopped probe and root-only receipt.
    unit.unlink();Path(policy['path']).unlink();Path(policy['path']).parent.rmdir();run(['systemctl','daemon-reload'])
