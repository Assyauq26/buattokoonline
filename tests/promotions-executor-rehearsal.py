"""Real DB/backup adapters for Cutover, on the existing guarded local PG cluster.

Service activation/fencing are simulated here; native driver guards and failure
stages have separate tests. No connection to a deployed store is accepted.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlparse, unquote
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'installer'))
import promotions_cutover as cutover
import promotions_transition as transition
from update_service.forward_cutover import ForwardCutover

url = os.environ['PROMOTION_EXECUTOR_DATABASE']
target = urlparse(url)
assert target.hostname in ['127.0.0.1', 'localhost'] and target.port == 5557
assert target.path.startswith('/hubify_promotions_upgrade_')
PG = Path(os.environ['PROMOTION_TEST_PG_BIN'])
folder = ROOT / 'promotion-evidence' / 'executor-rehearsal' / uuid.uuid4().hex[:8]
folder.mkdir(parents=True)
env = {**os.environ, 'PGPASSWORD': unquote(target.password or ''), 'PGCLIENTENCODING': 'UTF8',
       'DATABASE_URL': url, 'DIRECT_URL': url}
args = ['-h', target.hostname, '-p', str(target.port), '-U', unquote(target.username or 'postgres')]


def run(name, args2, **kw):
    exe = PG / (name + ('.exe' if os.name == 'nt' else ''))
    return subprocess.check_output([str(exe), *args, *args2], env=env, **kw)


def sql(query):
    return run('psql', ['-d', target.path[1:], '-At', '-v', 'ON_ERROR_STOP=1', '-c', query], encoding='utf8').strip()


def ledger():
    return json.loads(sql('SELECT json_agg(to_jsonb(m) ORDER BY migration_name) FROM "_prisma_migrations" m;'))


class Rehearsal:
    sha, digest = 'local-real-db', 'synthetic-nonrelease'
    def __init__(self): self.journal = None; self.calls = []; self.original = ledger()
    def save(self, j):
        self.journal = json.loads(json.dumps(j)); (folder / 'journal.json').write_text(json.dumps(j), encoding='utf8')
    def load(self): return self.journal
    def preflight(self):
        assert len(ledger()) == 29 and all(r['finished_at'] and not r['rolled_back_at'] for r in ledger())
        path = Path(os.environ.get('PROMOTION_CANDIDATE_SCHEMA',str(ROOT/'app/prisma/schema.prisma'))).parent/'migrations'/transition.NEW_NAME/'migration.sql'
        assert transition.digest(path.read_bytes()) == transition.NEW_SQL
        return {'accepted':True}
    def recheck(self,j): self.preflight()
    def initial(self,r): return {'sha':self.sha,'digest':self.digest,'migration_started':False}
    def prepare(self,j): self.calls.append('simulated_image_prepare')
    def drain(self,j): self.calls.append('simulated_drain')
    def fence(self,j): self.calls.append('simulated_fence')
    def backup(self,j):
        self.calls.append('real_backup_restore')
        path=folder/'before.dump'; run('pg_dump',['-d',target.path[1:],'-Fc','-f',str(path)])
        scratch='hubify_promotions_restore_executor_'+uuid.uuid4().hex[:8]
        run('createdb',[scratch])
        try:
            run('pg_restore',['-d',scratch,'--no-owner','--exit-on-error',str(path)])
            rows=run('psql',['-d',scratch,'-At','-c','SELECT count(*) FROM "_prisma_migrations";'],encoding='utf8').strip()
            assert rows=='29'
        finally:run('dropdb',[scratch]) # Only the exact random local DB created here.
        return {'verified':True,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    def migrate(self,j):
        self.calls.append('real_prisma_migrate_deploy')
        subprocess.run([os.environ['PROMOTION_NODE'],str(ROOT/'app/node_modules/prisma/build/index.js'),
                        'migrate','deploy','--schema',os.environ.get('PROMOTION_CANDIDATE_SCHEMA',str(ROOT/'app/prisma/schema.prisma'))],env=env,check=True,capture_output=True)
    def verify_migration(self,j):
        rows=ledger();assert len(rows)==30 and rows[:29]==self.original
        assert rows[-1]['checksum']==transition.NEW_SQL
    def activate(self,j):self.calls.append('simulated_activation')
    def verify_active(self,j):self.verify_migration(j)
    def metadata(self,j):self.calls.append('simulated_metadata')
    def open_traffic(self,j):self.calls.append('simulated_open')
    def resume_workers(self,j):self.calls.append('simulated_resume')
    def rollback_before_migration(self,j):raise AssertionError('Unexpected rollback')
    def backup_and_restore_verify(self,j):j['backup']=self.backup(j)
    def verify_identity(self,j):assert j['sha']==self.sha and j['digest']==self.digest
    def external_work_stopped(self,j):pass
    def database_state(self,j):return 'new' if len(ledger())==30 else 'old' if len(ledger())==29 else 'uncertain'


d=Rehearsal();forward=os.environ.get('UPDATER_FORWARD_REHEARSAL')=='yes'
e=ForwardCutover(d) if forward else cutover.Cutover(d)
e.dry_run();assert ledger()==d.original and not (folder/'journal.json').exists()
result=e.apply();assert result['phase']=='complete';assert d.calls.count('real_prisma_migrate_deploy')==1
if forward:e.reconcile()
else:e.apply()
assert d.calls.count('real_prisma_migrate_deploy')==1
receipt={'ok':True,'historicalLedgerUnchanged':True,'before':29,'after':30,'backupScratchRestore':True,
         'executorDryRunNoMutation':True,'completedRetryNoReplay':True,'nativeServicesSimulated':True,
         'calls':d.calls,'productionTouched':False}
(ROOT/'promotion-evidence/executor-rehearsal/result.json').write_text(json.dumps(receipt,indent=2),encoding='utf8')
print(json.dumps(receipt))
