"""Detached upgrade-policy authentication. This module never authorizes apply.

The v1.8.0 archive remains immutable. A separately signed policy can describe a
future reviewed executor; installing a policy alone cannot enable that executor.
Sequence persistence belongs to the caller's durable State transaction.
"""
import base64
import hashlib
import re
import subprocess
import tempfile
import time
from pathlib import Path
from .trust import Rejected, strict_json, version, REPO


def authenticate(raw, roots, now=None):
    now = int(time.time()) if now is None else now
    try:
        if len(raw) > 1024 * 1024:
            raise Rejected('policy_size')
        outer = strict_json(raw)
        if set(outer) != {'keyId', 'payload', 'signature'} or outer['keyId'] not in roots:
            raise Rejected('policy_key')
        payload = base64.b64decode(outer['payload'], validate=True)
        signature = base64.b64decode(outer['signature'], validate=True)
        if len(signature) != 64:
            raise Rejected('policy_signature')
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder)
            (p/'key').write_text(roots[outer['keyId']])
            (p/'payload').write_bytes(payload)
            (p/'signature').write_bytes(signature)
            result = subprocess.run(['openssl', 'pkeyutl', '-verify', '-pubin', '-inkey', str(p/'key'),
                '-rawin', '-in', str(p/'payload'), '-sigfile', str(p/'signature')], capture_output=True, timeout=10)
        if result.returncode:
            raise Rejected('policy_signature')
        policy = strict_json(payload)
        if (policy['format'] != 1 or policy['repository'] != REPO
            or type(policy['sequence']) is not int or policy['sequence'] < 1
            or type(policy['issuedAt']) is not int or type(policy['expiresAt']) is not int
            or not policy['issuedAt'] - 60 <= now < policy['expiresAt']
            or not 0 < policy['expiresAt'] - policy['issuedAt'] <= 7 * 86400):
            raise Rejected('policy_expired_or_invalid')
        if not re.fullmatch('[a-z0-9-]{1,80}', policy['id']):
            raise Rejected('policy_identity')
        version(policy['fromVersion']); version(policy['toVersion'])
        if version(policy['fromVersion']) >= version(policy['toVersion']):
            raise Rejected('policy_path')
        for field, length in [('artifactDigest', 64), ('sourceSha', 40), ('baselineAppTree', 40)]:
            if not re.fullmatch('[a-f0-9]{' + str(length) + '}', policy[field]):
                raise Rejected('policy_identity')
        if type(policy['minimumWorker']) is not int or policy['minimumWorker'] < 3:
            raise Rejected('policy_worker')
        if policy['failureStrategy'] != 'forward-only-after-migration':
            raise Rejected('policy_recovery')
        if policy['executor'] != 'forward-cutover-v1':
            raise Rejected('policy_executor')
        for field in ('beforeMigrations', 'afterMigrations'):
            rows = policy[field]
            if not isinstance(rows, dict) or not rows or len(rows) > 1000:
                raise Rejected('policy_migrations')
            for name, digest in rows.items():
                if not re.fullmatch('[0-9]{14}_[a-z0-9_]+', name) or not re.fullmatch('[a-f0-9]{64}', digest):
                    raise Rejected('policy_migrations')
        if not policy['beforeMigrations'].items() <= policy['afterMigrations'].items():
            raise Rejected('policy_history_changed')
        # No SQL aliases or normalization are accepted in this contract.
        if set(policy) != {'format','repository','id','sequence','issuedAt','expiresAt',
            'fromVersion','toVersion','artifactDigest','sourceSha','baselineAppTree',
            'minimumWorker','failureStrategy','executor','beforeMigrations','afterMigrations'}:
            raise Rejected('policy_unknown_fields')
        return policy, hashlib.sha256(payload).hexdigest()
    except Rejected:
        raise
    except Exception:
        raise Rejected('policy_invalid') from None


def bind(policy, release, installed, app_tree, ledger, worker):
    """Pure identity check, not an exception to Engine.process's migration guard."""
    if (policy['toVersion'], policy['sourceSha'], policy['artifactDigest']) != (release['version'], release['sha'], release['digest']):
        raise Rejected('policy_artifact_mismatch')
    if installed['version'] != policy['fromVersion'] or app_tree != policy['baselineAppTree']:
        raise Rejected('policy_baseline_mismatch')
    if worker < policy['minimumWorker']:
        raise Rejected('worker_upgrade_required')
    if ledger != policy['beforeMigrations'] or installed['migrations'] != ledger:
        raise Rejected('migration_history')
