"""Finite update pipeline. Only signed releases; no caller supplied commands."""
import copy, fcntl, hashlib, json, os, shutil, subprocess, sys, time
from pathlib import Path
import core, updater
from .trust import Rejected, download, version
from .state import ACTIVE
from .package import extract

class Engine:
 def __init__(self,state,config):self.state=state;self.config=config
 def pending(self,folder,kind):core.atomic_json(folder/'external-work.json',{'kind':kind,'startedAt':int(time.time())})
 def settled(self,folder):(folder/'external-work.json').unlink(missing_ok=True)
 def mark(self,job,state,**details):self.state.set(job['id'],state,**details)
 def ledger(self):
  rows=json.loads(core.sql("SELECT coalesce(json_agg(json_build_object('name',migration_name,'checksum',checksum)),'[]') FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;"))
  if len(rows)!=len({r['name'] for r in rows}):raise Rejected('migration_history')
  return {r['name']:r['checksum'] for r in rows}
 def resources(self):
  memory={line.split(':')[0]:int(line.split()[1]) for line in Path('/proc/meminfo').read_text().splitlines() if ':' in line}
  if (os.cpu_count() or 0)<2 or memory.get('MemTotal',0)<1900000 or memory.get('MemAvailable',0)+memory.get('SwapFree',0)<1800000:raise Rejected('insufficient_resources')
 def baseline(self):
  baseline=core.read_json(self.config['baseline'])
  root=Path(baseline['root'])
  for name,digest in baseline['files'].items():
   p=root/name
   if p.is_symlink() or not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=digest:raise Rejected('local_customization')
  # Detect added code files too, while excluding runtime/cache/generated content.
  for p in (root/'app/src').rglob('*'):
   if p.is_file() and p.relative_to(root).as_posix() not in baseline['files']:raise Rejected('local_customization')
 def build(self,source,tag,target):
  # Durable events contain only allowlisted stage/error codes, never raw logs.
  with open(os.devnull,'wb') as log:
   try:r=subprocess.run(['docker','build','--force-rm','--memory','1280m','--memory-swap','2048m','--cpu-period','100000','--cpu-quota','100000','--target',target,'-t',tag,str(source/'app')],env={**os.environ,'DOCKER_BUILDKIT':'0'},stdout=log,stderr=subprocess.STDOUT,timeout=2400)
   except subprocess.TimeoutExpired:raise Rejected('build_timeout') from None
  if r.returncode:raise Rejected('build_failed')
 def backup(self,folder):
  try:
   result=subprocess.run([sys.executable,'-m','update_service.backup_step',str(folder/'backup.json')],cwd=Path(__file__).parent.parent,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=900)
  except subprocess.TimeoutExpired:raise Rejected('backup_timeout') from None
  if result.returncode:raise Rejected('backup_failed')
  receipt=core.read_json(folder/'backup.json')
  if receipt.get('verified') is not True:raise Rejected('backup_failed')
  return receipt['path']
 def verified(self,release,image):
  core.healthy()
  actual=json.loads(core.run(['docker','inspect','single-store-app-1']))[0]
  expected=core.run(['docker','image','inspect','--format','{{.Id}}',image])
  env=dict(s.split('=',1) for s in actual['Config']['Env'] if '=' in s)
  if actual['Image']!=expected or env.get('STORE_BUILD_SHA')!=release['sha'] or env.get('STORE_INSTALLED_VERSION')!=release['version']:raise Rejected('active_version_mismatch')
  core.public_health(core.read_json(core.STATE))
 def process(self,job):
  release=json.loads(job['release']);folder=Path(self.config['jobs'])/job['id'];folder.mkdir(mode=0o700,parents=True,exist_ok=True)
  journal_path=folder/'operation.json';mutated=False;stopped=False;timer=False;old=None;installed=None
  with open('/run/single-store-operation.lock','w') as lock:
   try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
   except BlockingIOError:return # Retain queued; another authorized operator owns the lock.
   try:
    self.mark(job,'preflight')
    installed=core.read_json(core.CONFIG/'version.json');old=core.read_json(core.COMPOSE)
    if 'APP_ORIGIN='+self.config['origin'] not in (core.CONFIG/'runtime.env').read_text().splitlines():raise Rejected('installation_mismatch')
    if version(release['version'])<=version(installed['version']) or not version(release['minimumInstalledVersion'])<=version(installed['version'])<=version(release['maximumInstalledVersion']) or release['minimumUpdater']>2 or installed['db_contract']!=release['dbContract']:raise Rejected('incompatible_release')
    if not release['rollbackCompatible']:raise Rejected('operator_migration_required')
    persistent=int(core.sql("SELECT pg_database_size('store');"))
    persistent+=sum(p.stat().st_size for p in (core.DATA/'media').rglob('*') if p.is_file())
    # Budget both isolated image targets, extraction, compressed backup and a
    # scratch restore. Refuse before downloading/building against a full disk.
    if shutil.disk_usage(core.ROOT).free<6*1024**3+2*persistent:raise Rejected('insufficient_disk')
    self.resources()
    if self.ledger()!=installed['migrations'] or core.sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL;')!='0':raise Rejected('migration_history')
    self.baseline();core.healthy()
    self.mark(job,'downloading',downloaded=0,total=release['size'])
    last=[0]
    def progress(done,total):
     if done==total or time.monotonic()-last[0]>0.5:self.mark(job,'downloading',downloaded=done,total=total);last[0]=time.monotonic()
    download(release['url'],folder/'release.tar.gz',release['size'],release['digest'],progress)
    self.mark(job,'preparing')
    source=folder/'release';source.mkdir(mode=0o755)
    manifest=extract(folder/'release.tar.gz',source,release,installed,self.config)
    if manifest['compatibility']['rollback_compatible']!=release['rollbackCompatible']:raise Rejected('manifest_compatibility')
    for key,name in [('minimumInstalledVersion','minimum_installed_version'),('maximumInstalledVersion','maximum_installed_version')]:
     if manifest['compatibility'].get(name)!=release[key]:raise Rejected('manifest_compatibility')
    candidate=copy.deepcopy(old)
    for name,target in [('tools','tools'),('app','runtime')]:
     image='single-store-'+name+':update-'+job['id']
     candidate['services'][name]['build']={'context':str(source/'app'),'target':target};candidate['services'][name]['image']=image
     self.pending(folder,'build')
     self.build(source,image,target)
     self.settled(folder)
    candidate['services']['app'].setdefault('environment',{}).update(STORE_INSTALLED_VERSION=release['version'],STORE_BUILD_SHA=release['sha'],STORE_UPDATE_CHANNEL=self.config['channel'])
    stage=folder/'compose.json';core.atomic_json(stage,candidate)
    # Drain scheduled work; never kill a possibly in-flight carrier mutation.
    timer=subprocess.run(['systemctl','is-active','--quiet','single-store-maintenance.timer']).returncode==0
    core.run(['systemctl','stop','single-store-maintenance.timer'])
    deadline=time.monotonic()+120
    while subprocess.run(['systemctl','is-active','--quiet','single-store-maintenance.service']).returncode==0:
     if time.monotonic()>deadline:raise Rejected('maintenance_busy')
     time.sleep(1)
    old['services']['app']['image']=core.run(['docker','inspect','--format','{{.Image}}','single-store-app-1'])
    journal={'previous':installed,'old_compose':old,'candidate':candidate,'manifest':manifest,'timer':timer,'backup':None,'previous_baseline':core.read_json(self.config['baseline'])}
    core.atomic_json(journal_path,journal)
    self.mark(job,'backing_up');stopped=True;core.dc(['stop','-t','60','app'],timeout=90)
    self.pending(folder,'backup')
    journal['backup']=self.backup(folder);core.atomic_json(journal_path,journal)
    self.settled(folder)
    self.mark(job,'migrating');mutated=True
    self.pending(folder,'migration')
    core.dc(['run','--rm','-T','--no-deps','--name','single-store-migrate-'+job['id'],'tools','npm','run','db:migrate'],file=stage,timeout=300)
    self.settled(folder)
    if self.ledger()!=manifest['migrations']:raise Rejected('migration_verification')
    self.mark(job,'activating');core.atomic_json(core.COMPOSE,candidate)
    core.dc(['up','-d','--no-deps','--no-build','--wait','--wait-timeout','90','app'],timeout=180)
    self.mark(job,'verifying');self.verified(release,candidate['services']['app']['image'])
    core.atomic_json(core.CONFIG/'version.json',{**installed,'version':release['version'],'source_sha':release['sha'],'migrations':manifest['migrations'],'channel':self.config['channel']})
    core.atomic_json(self.config['baseline'],{'root':str(source),'files':manifest['files']})
    self.mark(job,'succeeded',activeVersion=release['version'],finishedAt=int(time.time()))
   except Exception as error:
    reason=str(error) if isinstance(error,Rejected) else 'operation_failed'
    # A killed Docker client does not prove its daemon work stopped. Preserve
    # the fence on interruption; only an operator can reconcile external work.
    if (folder/'external-work.json').exists():
     if reason=='build_failed':self.settled(folder) # Completed build exited nonzero.
     else:self.mark(job,'recovery_required',error=reason);return
    if stopped and old:
     # A partially failed migration is not presumed compatible, even if the
     # intended release was additive. Preserve the DB and fence further jobs.
     safe=not mutated or (journal_path.exists() and self.ledger()==core.read_json(journal_path)['manifest']['migrations'])
     if not safe:self.mark(job,'recovery_required',error=reason);return
     try:
      self.mark(job,'rolling_back',error=reason);core.atomic_json(core.COMPOSE,old)
      core.dc(['up','-d','--no-deps','--no-build','--wait','--wait-timeout','90','app']);core.healthy();core.public_health(core.read_json(core.STATE))
      core.atomic_json(core.CONFIG/'version.json',{**installed,'migrations':self.ledger()})
      core.atomic_json(self.config['baseline'],core.read_json(journal_path)['previous_baseline'])
      self.mark(job,'rolled_back',error=reason,finishedAt=int(time.time()))
     except Exception:self.mark(job,'recovery_required',error='rollback_failed');return
    else:self.mark(job,'failed',error=reason,finishedAt=int(time.time()))
   finally:
    current=next((j for j in self.state.jobs() if j['id']==job['id']),None)
    if timer and current and current['state']!='recovery_required':core.run(['systemctl','start','single-store-maintenance.timer'])
