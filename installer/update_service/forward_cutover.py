"""Forward-only orchestration contract, intentionally not registered in Engine.

A native adapter must prove ingress fencing, carrier drain, restored backup,
ledger identity and readiness before registration. A policy is not executable
code and cannot supply shell commands. Caller holds the global operation lock.
"""
from .trust import Rejected


class ForwardCutover:
    def __init__(self, driver): self.d = driver

    def dry_run(self):
        return self.d.preflight()

    def stage(self, journal, phase, operation):
        journal['phase'] = phase
        self.d.save(journal)  # durable intent BEFORE contacting a daemon
        operation(journal)
        journal['phase'] = phase + '_done'
        self.d.save(journal)

    def apply(self):
        if self.d.load(): raise Rejected('reconciliation_required')
        report = self.d.preflight()
        j = self.d.initial(report)
        try:
            self.stage(j, 'prepare', self.d.prepare)
            self.d.preflight()
            self.stage(j, 'drain', self.d.drain)
            self.stage(j, 'fence', self.d.fence)
            self.stage(j, 'backup', self.d.backup_and_restore_verify)
            j['migration_started'] = True
            self.stage(j, 'migration', self.d.migrate)
            self.d.verify_migration(j)
            return self.forward(j)
        except BaseException:
            # Never infer that Docker stopped or an external request failed from
            # a client exit. No automatic old-code activation after SQL intent.
            j['phase'] = 'recovery_required'
            self.d.save(j)
            raise

    def forward(self, j):
        self.stage(j, 'activation', self.d.activate)
        self.stage(j, 'readiness', self.d.verify_active)
        self.stage(j, 'metadata', self.d.metadata)
        j['traffic_may_have_opened'] = True
        self.stage(j, 'opening', self.d.open_traffic)
        self.stage(j, 'workers', self.d.resume_workers)
        self.d.verify_active(j)
        j['phase'] = 'complete';self.d.save(j)
        return j

    def reconcile(self):
        j = self.d.load()
        if not j: raise Rejected('journal_missing')
        self.d.verify_identity(j)
        self.d.external_work_stopped(j)
        state = self.d.database_state(j)
        if j.get('traffic_may_have_opened'):
            if state != 'new': raise Rejected('migration_history')
            # Once writes may exist, only adopt a verified healthy new candidate.
            self.d.verify_active(j)
            self.stage(j,'metadata',self.d.metadata)
            self.stage(j,'opening',self.d.open_traffic)
            self.stage(j,'workers',self.d.resume_workers)
            j['phase']='complete';self.d.save(j);return j
        if state == 'new':
            self.d.verify_migration(j)
            return self.forward(j)  # never replay SQL
        if state == 'old' and not j.get('migration_started'):
            self.d.rollback_before_migration(j)
            j['phase']='rolled_back';self.d.save(j);return j
        raise Rejected('migration_uncertain')
