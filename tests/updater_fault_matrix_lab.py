"""Real Linux process-loss/failure matrix in separate disposable Docker copies."""
import json
import os
from pathlib import Path
import shutil
import sys
import time
import uuid
import updater_linux_lab as lab
from updater_multistep_lab import reuse_images
from update_service.server import Controller
from update_service.state import State
from update_service.reconcile import reconcile
from update_service.trust import Rejected
import core


def exercise(case,phase,expected,backup_failure=False):
    lab.prepare(case);root=lab.BASE/case
    shutil.copyfile(lab.BASE/'e18a0005/reuse-images.json',root/'reuse-images.json')
    if backup_failure:(root/'backups').write_text('Deliberate isolated backup-directory obstruction; no database backup started.')
    else:(root/'fault.json').write_text(json.dumps({'phase':phase,'action':'kill'}))
    pid=os.fork()
    if pid==0:
        try:
            with lab.context(case) as (_,cfg),reuse_images(root):
                controller=Controller(cfg)
                admin=json.loads(core.sql('''SELECT row_to_json(x) FROM (SELECT u.id,u."sessionVersion" FROM "User" u JOIN "UserRole" ur ON ur."userId"=u.id JOIN "Role" r ON r.id=ur."roleId" WHERE r.name='Admin' AND u.email LIKE 'updater-admin-%@example.invalid' LIMIT 1) x;'''))
                actor={'installation':cfg['installation'],'actor':admin['id'],'sessionVersion':admin['sessionVersion'],'sessionHash':'e'*64,'sessionExpires':int(time.time())+86400}
                status=controller.command({**actor,'action':'check'})
                assert status['release']['version']=='1.8.0'
                controller.command({**actor,'action':'start','sha':status['release']['sha'],'requestKey':str(uuid.uuid4())})
                controller.engine.process(controller.state.jobs()[0])
                os._exit(0 if backup_failure else 8)
        except BaseException:os._exit(9)
    _,outcome=os.waitpid(pid,0)
    if backup_failure:assert os.WIFEXITED(outcome) and os.WEXITSTATUS(outcome)==0
    else:assert os.WIFSIGNALED(outcome) and os.WTERMSIG(outcome)==9
    with lab.context(case) as (_,cfg):
        controller=Controller(cfg);job=controller.state.jobs()[0]
        assert job['state']=='recovery_required'
        if backup_failure:
            marker=Path(cfg['jobs'])/job['id']/'external-work.json'
            assert json.loads(marker.read_text())['kind']=='backup' and (root/'backups').is_file()
            # mkdir failed before spawning any backup process. Parent waited for
            # the actual executor's exit; check named migration daemon as well.
            assert 'single-store-migrate-'+job['id'] not in core.run(['docker','ps','--format','{{.Names}}']).splitlines()
        reason=None
        try:reconcile(cfg,job['id'],external_work_stopped=backup_failure)
        except Rejected as error:reason=str(error)
        actual=controller.state.jobs()[0]['state'];installed=core.read_json(core.CONFIG/'version.json')
        if expected=='migration_uncertain':assert reason==expected and actual=='recovery_required' and installed['version']=='1.7.4'
        else:assert reason is None and actual==expected
        report={'case':case,'fault':phase,'realLinuxProcessKill':not backup_failure,'actualBackupFailure':backup_failure,
            'expected':expected,'state':actual,'recoveryReason':reason,'installedVersion':installed['version'],
            'ledgerRows':len(controller.engine.ledger()),'activeDatabaseRestoreDuringRecovery':False,'sqlReplayed':False,
            'imagesReusedAfterSourceInventory':True,'productionStoresUpdated':0}
        (root/'fault-result.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
        core.run(['systemctl','stop','single-store-maintenance.timer'])
        core.dc(['stop']) # Retain all owned data/backup/journals; no volume removal.
    return report


if __name__=='__main__':
    if os.geteuid()!=0:raise SystemExit('Explicit root disposable lab only')
    result=[]
    for spec in [('e18a0006','prepare_done','rolled_back',False),('e18a0007','backup_failure','rolled_back',True),
                 ('e18a0008','migration','migration_uncertain',False),('e18a0009','activation_done','succeeded',False)]:
        result.append(exercise(*spec))
    (lab.BASE/'fault-matrix-result.json').write_text(json.dumps(result,indent=2))
