"""Reviewed, signed public v1.8.1 -> evidence-schema32 capability.

This is an operator-installed worker revision, not SQL grammar expansion. Old
workers reject the new executor name. No policy alone replaces a worker. This
edge installs the OFF-by-default evidence schema, not checkout activation.
"""
import json
from .native_forward import NativeForward, require
from .trust import Rejected
import promotions_transition as package

EXECUTOR = 'payment-evidence-forward-v1'
BASE_SOURCE = '0a4e16c2e4590c7a7413f07ff71b7523824b294d'
BASE_TREE = 'c4002bb01a465b4ab72758b0bdd1cfe698462f7f'
BASE_SCHEMA = '09f36fc359787459a2ab0b9511e326e0c4c08ced7e7afd5df7ca5c540df287cf'
AFTER_SCHEMA = '72f1aa730f8c992605fba501f50ffb27e779dd7a786532904f0d6830aa46b02a'
BASE_FILES = '158d508bda60be0554ed58d57c1f60be538c12b291867ee11cb39aac94348a02'
BASE_MIGRATIONS = 'bc328b31078d202e24e061e50a4f987f98f17b069901b10ed34dc208a668f11a'
NEW_NAME = '20261114090000_payment_evidence_review'
NEW_SQL = 'e674bd330da1bd6ff0f682caf1326541a058bcb73b2ee58e99635687d4a27286'
TABLES = ('PaymentEvidenceSource', 'PaymentEvidenceAttempt', 'IncomingPaymentEvidence',
          'PaymentEvidenceClaim', 'PaymentEvidenceReview', 'PaymentEvidenceOAuthState')


def canonical_digest(value):
    return package.digest(json.dumps(value, sort_keys=True, separators=(',', ':')).encode())


def reviewed_policy(policy):
    """Called only after signature verification; no configurable SQL/commands."""
    require(policy.get('executor') == EXECUTOR and policy.get('format') == 2,
            'upgrade_path_unsupported')
    require((policy['fromVersion'], policy['toVersion'], policy['fromSourceSha'],
             policy['baselineAppTree'], policy['baselineSchemaHash']) ==
            ('1.8.1', '1.8.2', BASE_SOURCE, BASE_TREE, BASE_SCHEMA), 'policy_baseline_mismatch')
    require(canonical_digest(policy['baselineFiles']) == BASE_FILES, 'policy_baseline_mismatch')
    require(len(policy['beforeMigrations']) == 31 and
            canonical_digest(policy['beforeMigrations']) == BASE_MIGRATIONS, 'migration_history')
    require(policy['afterMigrations'] == {**policy['beforeMigrations'], NEW_NAME: NEW_SQL},
            'migration_history')


class EvidenceForward(NativeForward):
    baseline_source = BASE_SOURCE
    baseline_tree = BASE_TREE
    baseline_schema = BASE_SCHEMA
    from_version = '1.8.1'
    before_count = 31
    migration_name = NEW_NAME
    migration_checksum = NEW_SQL
    new_tables = TABLES
    snapshot_omit = {}  # all existing prices, orders, promotions, stock and history
    after_schema = AFTER_SCHEMA

    def preflight(self, inspect_only=False):
        if self.policy is None:
            from .policy_feed import fresh
            import core
            self.policy = fresh(self.config, self.e.state, self.release,
                                core.read_json(core.CONFIG/'version.json'))
        reviewed_policy(self.policy)
        report = super().preflight(inspect_only)
        # super refreshes signed policy in apply mode; pin it again before use.
        reviewed_policy(self.policy)
        return report

    def verify_active(self, journal):
        super().verify_active(journal)
        # Never silently turn a schema installation into payment activation.
        import core
        require(core.sql('SELECT count(*) FROM "PaymentEvidenceSource" WHERE enabled;') == '0',
                'unexpected_payment_activation')
        from .native_forward import schema_hash
        require(schema_hash() == AFTER_SCHEMA, 'schema_drift')


def adapter(engine, job, policy=None):
    """Recovery selects the persisted executor and reauthenticates in reconcile.

    Never infer the edge from current database version after partial migration.
    """
    if policy is None:
        from pathlib import Path
        import core
        path = Path(engine.config['jobs'])/job['id']/'forward.json'
        if path.exists():
            policy = core.read_json(path)['policy']
    if policy and policy.get('executor') == EXECUTOR:
        reviewed_policy(policy)
        return EvidenceForward(engine, job, policy)
    if policy and policy.get('executor') != 'forward-cutover-v1':
        raise Rejected('policy_executor')
    return NativeForward(engine, job, policy)
