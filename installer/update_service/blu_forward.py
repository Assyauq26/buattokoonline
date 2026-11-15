"""Exact public schema31->32->33 path. Seller opt-in remains separate from SQL.

No older release is relabelled, no SQL grammar is widened and an unfinished
intermediate ledger remains fenced for operator recovery, never old-code retry.
"""
from .evidence_forward import EvidenceForward, reviewed_baseline, NEW_NAME, NEW_SQL
from .native_forward import NativeForward, require, schema_hash
import core

EXECUTOR = 'blu-checkout-forward-v1'
ACTIVATION_NAME = '20261115090000_blu_checkout_review'
ACTIVATION_SQL = '2e82d9b22f55c50108697950cc447a380034941ce7dca2fed59d870a054e03c3'
AFTER_SCHEMA = 'f2c74e00885d943c8491f4de00a6ebdbf295c6016095f3b049878320ece9d075'
ADDITIONS = {NEW_NAME: NEW_SQL, ACTIVATION_NAME: ACTIVATION_SQL}


def reviewed_policy(policy):
    require(policy.get('executor') == EXECUTOR, 'upgrade_path_unsupported')
    reviewed_baseline(policy)
    require(policy['afterMigrations'] == {**policy['beforeMigrations'], **ADDITIONS}, 'migration_history')


class BluCheckoutForward(EvidenceForward):
    validate_policy = staticmethod(reviewed_policy)
    after_schema = AFTER_SCHEMA

    @property
    def migration_additions(self):
        return dict(ADDITIONS)

    def verify_active(self, journal):
        NativeForward.verify_active(self, journal)
        require(schema_hash() == self.after_schema, 'schema_drift')
        # Initial readiness must not silently activate any seller account. After
        # opening, an explicit authorized opt-in is valid new production data.
        if not journal.get('traffic_may_have_opened'):
            require(core.sql('SELECT count(*) FROM "PaymentEvidenceSource" WHERE enabled;') == '0',
                    'unexpected_payment_activation')
