"""Hubify v1.3.0 -> v1.4.0: exact source, unchanged schema, preserved rollback image."""
import copy, fcntl, json, os, re, sys, time
from pathlib import Path
sys.path.insert(0, '/opt/single-store/manager')
import core, updater
JOURNAL=core.CONFIG/'hubify-v140.json'
def restore(journal):
    core.atomic_json(core.COMPOSE,journal['old_compose'])
    core.dc(['up','-d','--no-build','--wait','--wait-timeout','90','app'])
    core.healthy(); core.atomic_json(core.CONFIG/'version.json',journal['previous'])
    journal['status']='rolled-back';core.atomic_json(JOURNAL,journal)
def main():
    if os.geteuid()!=0:raise RuntimeError('Authorized operator required')
    if 'APP_ORIGIN=https://hubify.web.id' not in (core.CONFIG/'runtime.env').read_text().splitlines():raise RuntimeError('Not Hubify')
    with open('/run/single-store-operation.lock','w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if sys.argv[1:]==['--rollback']:restore(core.read_json(JOURNAL));return
        sha=sys.argv[1]
        if not re.fullmatch('[a-f0-9]{40}',sha):raise RuntimeError('Exact commit required')
        installed=core.read_json(core.CONFIG/'version.json')
        if installed['version']!='1.3.0':raise RuntimeError('Expected 1.3.0')
        source=core.ROOT/'development-sources'/sha
        if not source.exists():core.run(['git','clone','--no-checkout','https://github.com/Assyauq26/buattokoonline.git',source],timeout=180)
        core.run(['git','-C',source,'fetch','origin',sha],timeout=180);core.run(['git','-C',source,'checkout','--detach',sha])
        if (source/'VERSION').read_text().strip()!='1.4.0' or core.run(['git','-C',source,'rev-parse','HEAD'])!=sha:raise RuntimeError('Source mismatch')
        if core.inventory(source)!=installed['migrations']:raise RuntimeError('Schema differs')
        ledger=json.loads(core.sql('SELECT coalesce(json_object_agg(migration_name,checksum),\'{}\') FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;'))
        if ledger!=installed['migrations'] or core.sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL;')!='0':raise RuntimeError('Ledger mismatch')
        backup=updater.backup();updater.verify_backup(backup)
        old=core.read_json(core.COMPOSE);new=copy.deepcopy(old)
        new['services']['app']['build']={'context':str(source/'app'),'target':'runtime'}
        new['services']['app']['image']='single-store-app:v140-'+sha[:12]
        new['services']['app'].setdefault('environment',{}).update(STORE_INSTALLED_VERSION='1.4.0',STORE_BUILD_SHA=sha,STORE_UPDATE_CHANNEL='stable')
        stage=source/'compose.v140.json';core.atomic_json(stage,new)
        print('BUILDING_V140 '+sha,flush=True)
        core.dc(['build','app'],file=stage,timeout=2400)
        # Reclaim build cache only. Tagged images/rollback, volumes and backups remain intact.
        core.run(['docker','builder','prune','-f'],timeout=180)
        backup=updater.backup()
        journal={'status':'prepared','sha':sha,'previous':installed,'old_compose':old,'backup':backup,'time':int(time.time())};core.atomic_json(JOURNAL,journal)
        try:
            core.atomic_json(core.COMPOSE,new);core.dc(['up','-d','--no-build','--wait','--wait-timeout','90','app'])
            core.healthy();core.public_health(core.read_json(core.STATE))
            core.atomic_json(core.CONFIG/'version.json',{**installed,'version':'1.4.0','source_sha':sha,'channel':'stable'})
            journal['status']='complete';core.atomic_json(JOURNAL,journal)
            print('HUBIFY_V140_SUCCESS '+sha+' backup='+backup,flush=True)
        except Exception:restore(journal);raise
if __name__=='__main__':
    try:main()
    except Exception as e:print('Upgrade stopped: '+type(e).__name__,file=sys.stderr);sys.exit(1)
