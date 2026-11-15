"""Exact canonical v1.8.3/schema34 -> v1.9.0/schema35 payment continuation.

No historical SQL normalization or arbitrary migration grammar. Activation is a
separate seller action; preexisting source/payment/stock rows remain unchanged.
"""
import core
from .evidence_forward import EvidenceForward,canonical_digest
from .native_forward import NativeForward,require,schema_hash
EXECUTOR='midtrans-snap-forward-v1'
BASE_SOURCE='f48f2a5f637c50537af96474e51ea4cf18948274'
BASE_TREE='396c5c791f3c65bcaefd4f50be2777aab2bcdb1e'
BASE_SCHEMA='b88c7c76aee2cea2a6723292c861383843c5d609a7b5187d9a9b5fa76a551a91'
BASE_FILES='4bd73bdb8cba061b350e1362c2da946d32089502dadf65172e2e0ba050aa65bc'
BASE_MIGRATIONS='ed8c00d1d3d69c048eff75c5fce774eb4d9ff4ce3941f861e620b17180333f39'
BASE_ARCHIVE='eb850edf418b4a88de7a9a7c066d6016713d1aa847216088e416daea2a0e438a'
NEW_NAME='20261115160000_midtrans_snap'
NEW_SQL='c1c0e01ec2c403e073b361ff54534ab96f1d4cebe5af7520db53b48c8716b5ee'
AFTER_SCHEMA='882d3a6ecc33a66a68502e630fb7d401eabf3d86828fc0ac5d570ced5ed2f78f'
OMIT={}
TABLES=('MidtransConfiguration','MidtransSetting','MidtransAttempt','MidtransEvent')
def reviewed_policy(policy):
    require(policy.get('executor')==EXECUTOR and policy.get('format')==2,'upgrade_path_unsupported')
    require((policy['fromVersion'],policy['toVersion'],policy['fromSourceSha'],policy['baselineAppTree'],policy['baselineSchemaHash'])==('1.8.3','1.9.0',BASE_SOURCE,BASE_TREE,BASE_SCHEMA),'policy_baseline_mismatch')
    require(canonical_digest(policy['baselineFiles'])==BASE_FILES,'policy_baseline_mismatch')
    require(len(policy['beforeMigrations'])==34 and canonical_digest(policy['beforeMigrations'])==BASE_MIGRATIONS,'migration_history')
    require(policy['afterMigrations']=={**policy['beforeMigrations'],NEW_NAME:NEW_SQL},'migration_history')
class MidtransForward(EvidenceForward):
    validate_policy=staticmethod(reviewed_policy)
    baseline_source=BASE_SOURCE
    baseline_tree=BASE_TREE
    baseline_schema=BASE_SCHEMA
    from_version='1.8.3'
    before_count=34
    migration_name=NEW_NAME
    migration_checksum=NEW_SQL
    new_tables=TABLES
    snapshot_omit=OMIT
    after_schema=AFTER_SCHEMA
    def prepare(self,journal):
        NativeForward.prepare(self,journal)
        from .midtrans_runtime import ensure_key
        ensure_key(journal['candidate'])
        core.atomic_json(self.folder/'compose.json',journal['candidate'])
    def verify_active(self,journal):
        NativeForward.verify_active(self,journal)
        require(schema_hash()==AFTER_SCHEMA,'schema_drift')
    @property
    def migration_additions(self):return {NEW_NAME:NEW_SQL}

def prepare_policy(old,new,sha,digest,installations,sequence,now=None):
    import time
    from pathlib import Path
    import promotions_transition as package
    now=int(time.time()) if now is None else now
    baseline,files=package.package(Path(old),BASE_ARCHIVE,BASE_SOURCE,'1.8.3')
    target,_=package.package(Path(new),digest,sha,'1.9.0')
    policy=dict(format=2,repository=core.REPO,id='canonical-v183-to-v190-midtrans',sequence=sequence,issuedAt=now,expiresAt=now+86400,
      fromVersion='1.8.3',toVersion='1.9.0',fromSourceSha=BASE_SOURCE,sourceSha=sha,artifactDigest=digest,
      baselineAppTree=BASE_TREE,baselineSchemaHash=BASE_SCHEMA,baselineFiles={p:package.digest(files[p]) for p in sorted(files) if p.startswith('app/')},
      minimumWorker=3,executor=EXECUTOR,failureStrategy='forward-only-after-migration',beforeMigrations=baseline['migrations'],afterMigrations=target['migrations'],installations=installations)
    reviewed_policy(policy);return policy
