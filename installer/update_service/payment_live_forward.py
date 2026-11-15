"""Exact canonical v1.8.2/schema33 -> v1.8.3/schema34 payment continuation.

No historical SQL normalization or arbitrary migration grammar. Activation is a
separate seller action; preexisting source/payment/stock rows remain unchanged.
"""
import core
from .evidence_forward import EvidenceForward,canonical_digest
from .native_forward import NativeForward,require,schema_hash
EXECUTOR='payment-live-forward-v1'
BASE_SOURCE='ef7b338413b33d05e864deb858ccc75a5269189a'
BASE_TREE='d075b1850ed1d26197c1990a9d07881ae2237b4b'
BASE_SCHEMA='f2c74e00885d943c8491f4de00a6ebdbf295c6016095f3b049878320ece9d075'
BASE_FILES='766155b2cc9dc7ff32dea0eee7bb47146f5f1a3ffa2afa45820bbfef33c03eb3'
BASE_MIGRATIONS='cf21b6baef4978c04e4d3edb32fdf56d3a359cd35a03916ed151a3660e2cab59'
BASE_ARCHIVE='55913f7c81c102db77bef200593c7d8d06d5e921d68a580ca32012e4f5119e6a'
NEW_NAME='20261115120000_gopay_payment_attempt'
NEW_SQL='5e231c48b3dd2763a4b9a8c5a75ac90d70beb453472dddec8648e2f3fad4fd58'
AFTER_SCHEMA='b88c7c76aee2cea2a6723292c861383843c5d609a7b5187d9a9b5fa76a551a91'
OMIT={'PaymentEvidenceAttempt':"-'qrisPayload'-'qrisId'-'trxId'-'merchantName'"}
def reviewed_policy(policy):
    require(policy.get('executor')==EXECUTOR and policy.get('format')==2,'upgrade_path_unsupported')
    require((policy['fromVersion'],policy['toVersion'],policy['fromSourceSha'],policy['baselineAppTree'],policy['baselineSchemaHash'])==('1.8.2','1.8.3',BASE_SOURCE,BASE_TREE,BASE_SCHEMA),'policy_baseline_mismatch')
    require(canonical_digest(policy['baselineFiles'])==BASE_FILES,'policy_baseline_mismatch')
    require(len(policy['beforeMigrations'])==33 and canonical_digest(policy['beforeMigrations'])==BASE_MIGRATIONS,'migration_history')
    require(policy['afterMigrations']=={**policy['beforeMigrations'],NEW_NAME:NEW_SQL},'migration_history')
class PaymentLiveForward(EvidenceForward):
    validate_policy=staticmethod(reviewed_policy)
    baseline_source=BASE_SOURCE
    baseline_tree=BASE_TREE
    baseline_schema=BASE_SCHEMA
    from_version='1.8.2'
    before_count=33
    migration_name=NEW_NAME
    migration_checksum=NEW_SQL
    new_tables=()
    snapshot_omit=OMIT
    after_schema=AFTER_SCHEMA
    def prepare(self,journal):
        NativeForward.prepare(self,journal)
        # Opens configuration capability, never enables a source/account. The
        # existing per-installation access/key and explicit seller consent remain.
        journal['candidate']['services']['app'].setdefault('environment',{})['PAYMENT_GOPAY_CHECKOUT_ENABLED']='true'
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
    baseline,files=package.package(Path(old),BASE_ARCHIVE,BASE_SOURCE,'1.8.2')
    target,_=package.package(Path(new),digest,sha,'1.8.3')
    policy=dict(format=2,repository=core.REPO,id='canonical-v182-to-v183-payments',sequence=sequence,issuedAt=now,expiresAt=now+86400,
      fromVersion='1.8.2',toVersion='1.8.3',fromSourceSha=BASE_SOURCE,sourceSha=sha,artifactDigest=digest,
      baselineAppTree=BASE_TREE,baselineSchemaHash=BASE_SCHEMA,baselineFiles={p:package.digest(files[p]) for p in sorted(files) if p.startswith('app/')},
      minimumWorker=3,executor=EXECUTOR,failureStrategy='forward-only-after-migration',beforeMigrations=baseline['migrations'],afterMigrations=target['migrations'],installations=installations)
    reviewed_policy(policy);return policy
