import hashlib, json, secrets, sqlite3, time
from contextlib import contextmanager
from .trust import Rejected

ACTIVE=('queued','preflight','downloading','preparing','backing_up','migrating','activating','verifying','rolling_back','recovery_required')
TERMINAL=('succeeded','failed','rolled_back')
class State:
 def __init__(self,path,installation):
  self.path=str(path);self.installation=installation
  with self.db() as c:
   c.executescript('''CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS releases(version TEXT PRIMARY KEY,digest TEXT NOT NULL,sha TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,installation TEXT NOT NULL,actor TEXT NOT NULL,request_key TEXT NOT NULL UNIQUE,state TEXT NOT NULL,release TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '{}',created INTEGER NOT NULL,updated INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS tickets(digest TEXT PRIMARY KEY,actor TEXT NOT NULL,session_version INTEGER NOT NULL,session_hash TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,job TEXT NOT NULL,state TEXT NOT NULL,at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS limits(scope TEXT PRIMARY KEY,window INTEGER NOT NULL,count INTEGER NOT NULL);
   ''')
   identity=c.execute("SELECT value FROM meta WHERE key='installation'").fetchone()
   if identity and identity['value']!=installation:raise Rejected('installation_mismatch')
   c.execute("INSERT OR IGNORE INTO meta VALUES('installation',?)",(installation,))
 @contextmanager
 def db(self):
  c=sqlite3.connect(self.path,timeout=10,isolation_level=None);c.row_factory=sqlite3.Row
  c.execute('PRAGMA journal_mode=WAL');c.execute('PRAGMA synchronous=FULL');c.execute('BEGIN IMMEDIATE')
  try:yield c;c.commit()
  except Exception:c.rollback();raise
  finally:c.close()
 def catalog(self,catalog):
  with self.db() as c:
   prior=c.execute("SELECT value FROM meta WHERE key='sequence'").fetchone()
   if prior and int(prior['value'])>catalog['sequence']:raise Rejected('catalog_rollback')
   digest=hashlib.sha256(json.dumps(catalog,sort_keys=True).encode()).hexdigest()
   old=c.execute("SELECT value FROM meta WHERE key='catalog_digest'").fetchone()
   if prior and int(prior['value'])==catalog['sequence'] and old and old['value']!=digest:raise Rejected('catalog_equivocation')
   for item in catalog['releases']:
    row=c.execute('SELECT digest,sha FROM releases WHERE version=?',(item['version'],)).fetchone()
    if row and (row['digest'],row['sha'])!=(item['digest'],item['sha']):raise Rejected('immutable_release_changed')
    c.execute('INSERT OR IGNORE INTO releases VALUES(?,?,?)',(item['version'],item['digest'],item['sha']))
   for key,value in [('sequence',str(catalog['sequence'])),('catalog_digest',digest),('checked',str(int(time.time())))]:c.execute('INSERT OR REPLACE INTO meta VALUES(?,?)',(key,value))
 def start(self,actor,key,release):
  now=int(time.time())
  with self.db() as c:
   previous=c.execute('SELECT * FROM jobs WHERE request_key=?',(key,)).fetchone()
   if previous:
    if json.loads(previous['release'])['sha']!=release['sha'] or previous['actor']!=actor:raise Rejected('idempotency_conflict')
    return dict(previous)
   active=c.execute('SELECT * FROM jobs WHERE state IN ('+','.join('?' for _ in ACTIVE)+') ORDER BY created DESC LIMIT 1',ACTIVE).fetchone()
   if active:return dict(active)
   job=secrets.token_hex(16)
   c.execute('INSERT INTO jobs(id,installation,actor,request_key,state,release,created,updated) VALUES(?,?,?,?,?,?,?,?)',(job,self.installation,actor,key,'queued',json.dumps(release),now,now))
   c.execute('INSERT INTO events(job,state,at) VALUES(?,?,?)',(job,'queued',now))
   return dict(c.execute('SELECT * FROM jobs WHERE id=?',(job,)).fetchone())
 def policy(self,policy,digest):
  # Authenticate first; sequence is global for this policy feed, not per id.
  with self.db() as c:
   prior=c.execute("SELECT value FROM meta WHERE key='policy_sequence'").fetchone()
   old=c.execute("SELECT value FROM meta WHERE key='policy_digest'").fetchone()
   if prior and int(prior['value'])>policy['sequence']:raise Rejected('policy_replay')
   if prior and int(prior['value'])==policy['sequence'] and old and old['value']!=digest:raise Rejected('policy_equivocation')
   for key,value in [('policy_sequence',str(policy['sequence'])),('policy_digest',digest)]:
    c.execute('INSERT OR REPLACE INTO meta VALUES(?,?)',(key,value))
 def prior(self,actor,key,sha):
  with self.db() as c:
   row=c.execute('SELECT * FROM jobs WHERE request_key=?',(key,)).fetchone()
   if row and (row['actor']!=actor or json.loads(row['release'])['sha']!=sha):raise Rejected('idempotency_conflict')
   return dict(row) if row else None
 def limit(self,scope,maximum,seconds):
  window=int(time.time())//seconds
  with self.db() as c:
   row=c.execute('SELECT window,count FROM limits WHERE scope=?',(scope,)).fetchone()
   count=row['count'] if row and row['window']==window else 0
   if count>=maximum:raise Rejected('rate_limited')
   c.execute('INSERT OR REPLACE INTO limits VALUES(?,?,?)',(scope,window,count+1))
 def set(self,job,state,**detail):
  if state not in ACTIVE+TERMINAL:raise ValueError('state')
  with self.db() as c:
   row=c.execute('SELECT detail,state FROM jobs WHERE id=?',(job,)).fetchone()
   if not row:raise Rejected('job_missing')
   value={**json.loads(row['detail']),**detail}
   c.execute('UPDATE jobs SET state=?,detail=?,updated=? WHERE id=?',(state,json.dumps(value),int(time.time()),job))
   if row['state']!=state:c.execute('INSERT INTO events(job,state,at) VALUES(?,?,?)',(job,state,int(time.time())))
 def jobs(self):
  with self.db() as c:return [dict(r) for r in c.execute('SELECT * FROM jobs ORDER BY created DESC,rowid DESC LIMIT 20')]
 def ticket(self,actor,session_version,session_hash,session_expiry):
  token=secrets.token_urlsafe(32);expiry=min(int(time.time())+900,session_expiry)
  with self.db() as c:
   c.execute('DELETE FROM tickets WHERE expires<=?',(int(time.time()),))
   c.execute('INSERT INTO tickets VALUES(?,?,?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),actor,session_version,session_hash,expiry))
  return token
 def ticket_actor(self,token):
  if not isinstance(token,str) or len(token)>100:return None
  with self.db() as c:
   row=c.execute('SELECT actor,session_version,session_hash,expires FROM tickets WHERE digest=? AND expires>?',(hashlib.sha256(token.encode()).hexdigest(),int(time.time()))).fetchone()
   return dict(row) if row else None
 def recover(self):
  # Never blindly repeat an interrupted migration, backup, or Docker activation.
  # systemd KillMode=control-group fences descendants; the global operation lock
  # additionally coordinates CLI helpers. Ambiguous external Docker work is held.
  for job in self.jobs():
   if job['state'] in ACTIVE and job['state'] not in ['queued','recovery_required']:
    self.set(job['id'],'recovery_required',error='updater_interrupted')
