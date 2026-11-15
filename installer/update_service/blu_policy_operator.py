"""Prepare an exact public v1.8.1 -> v1.8.2 detached policy; never publish."""
import time
from pathlib import Path
import core
import promotions_transition as package
from .blu_forward import EXECUTOR,reviewed_policy
from .evidence_forward import BASE_SOURCE,BASE_TREE,BASE_SCHEMA

BASE_ARCHIVE='483e43b4e2e72fe5b8d5aa35273e153760fb792f2bbb6a4049a26c5311665efc'

def prepare(old,new,sha,digest,installations,sequence,now=None):
    now=int(time.time()) if now is None else now
    baseline,files=package.package(Path(old),BASE_ARCHIVE,BASE_SOURCE,'1.8.1')
    target,_=package.package(Path(new),digest,sha,'1.8.2')
    policy=dict(format=2,repository=core.REPO,id='canonical-v181-to-v182-blu',sequence=sequence,
        issuedAt=now,expiresAt=now+86400,fromVersion='1.8.1',toVersion='1.8.2',fromSourceSha=BASE_SOURCE,
        sourceSha=sha,artifactDigest=digest,baselineAppTree=BASE_TREE,baselineSchemaHash=BASE_SCHEMA,
        baselineFiles={p:package.digest(files[p]) for p in sorted(files) if p.startswith('app/')},
        minimumWorker=3,executor=EXECUTOR,failureStrategy='forward-only-after-migration',
        beforeMigrations=baseline['migrations'],afterMigrations=target['migrations'],installations=installations)
    reviewed_policy(policy)
    return policy
