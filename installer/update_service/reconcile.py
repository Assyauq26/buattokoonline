"""Operator-only reconciliation; never restores a DB or starts a migration."""
import fcntl
import json
import os
from pathlib import Path
import core
from .engine import Engine
from .state import State
from .runtime import install
from .trust import Rejected

def reconcile(config, job_id, external_work_stopped=False):
    if os.geteuid() != 0: raise Rejected('operator_required')
    state = State(config['database'], config['installation'])
    job = next((j for j in state.jobs() if j['id'] == job_id), None)
    if not job or job['state'] != 'recovery_required': raise Rejected('not_recovering')
    engine = Engine(state, config)
    with open('/run/single-store-operation.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        folder=Path(config['jobs'])/job_id
        if (folder/'forward.json').exists():
            from .native_forward import NativeForward
            from .forward_cutover import ForwardCutover
            pending=folder/'external-work.json'
            if pending.exists() and not external_work_stopped:raise Rejected('external_work_review_required')
            running=core.run(['docker','ps','--format','{{.Names}}']).splitlines()
            if 'single-store-migrate-'+job_id in running:raise Rejected('migration_running')
            if external_work_stopped:pending.unlink(missing_ok=True)
            result=ForwardCutover(NativeForward(engine,job)).reconcile()
            state.set(job_id,'succeeded' if result['phase']=='complete' else 'rolled_back',activeVersion=json.loads(job['release'])['version'])
            return
        running = core.run(['docker', 'ps', '--format', '{{.Names}}']).splitlines()
        if 'single-store-migrate-' + job_id in running: raise Rejected('migration_running')
        journal_path = Path(config['jobs']) / job_id / 'operation.json'
        # Build/backup Docker activity can outlive the client or host worker.
        # Root must inspect it first; a healthy app alone cannot clear this fence.
        pending=journal_path.parent/'external-work.json'
        if pending.exists() and not external_work_stopped:raise Rejected('external_work_review_required')
        if not journal_path.exists():
            # No cutover intent persisted: verify original code/data still healthy.
            installed = core.read_json(core.CONFIG / 'version.json')
            if engine.ledger() != installed['migrations']: raise Rejected('migration_history')
            engine.baseline(); core.healthy(); core.public_health(core.read_json(core.STATE))
            state.set(job_id, 'failed', error='interrupted_before_cutover')
            pending.unlink(missing_ok=True)
            return
        journal = core.read_json(journal_path)
        target = json.loads(job['release'])
        ledger = engine.ledger()
        if core.sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL;') != '0': raise Rejected('partial_migration')
        if ledger not in [journal['previous']['migrations'], journal['manifest']['migrations']]: raise Rejected('migration_history')
        # Adopt only a fully activated target that passes real image/env/readiness checks.
        if ledger == journal['manifest']['migrations']:
            try:
                engine.verified(target, journal['candidate']['services']['app']['image'],public=not bool(journal.get('proxy')))
            except Exception:
                pass
            else:
                image=core.run(['docker','image','inspect','--format','{{.Id}}',journal['candidate']['services']['app']['image']])
                core.atomic_json(core.CONFIG / 'version.json', {**journal['previous'], 'version': target['version'], 'source_sha': target['sha'], 'migrations': ledger, 'channel': config['channel'],'image_digest':image,'artifact_sha256':target['digest']})
                core.atomic_json(config['baseline'], {'root': str(journal_path.parent / 'release'), 'files': journal['manifest']['files']})
                if journal.get('proxy'):
                    from .native_forward import NativeForward
                    NativeForward(engine,job).proxy(journal,True)
                    core.public_health(core.read_json(core.STATE))
                state.set(job_id, 'succeeded', activeVersion=target['version'])
                pending.unlink(missing_ok=True)
                if journal['timer']: core.run(['systemctl', 'start', 'single-store-maintenance.timer'])
                return
        # Explicit operator invocation permits code-only rollback for reviewed additive schemas.
        if not target['rollbackCompatible']: raise Rejected('unsafe_rollback')
        core.atomic_json(core.COMPOSE, journal['old_compose'])
        core.dc(['up', '-d', '--no-deps', '--no-build', '--wait', '--wait-timeout', '90', 'app'])
        core.healthy()
        if journal.get('proxy'):
            from .native_forward import NativeForward
            NativeForward(engine,job).proxy(journal,True)
        core.public_health(core.read_json(core.STATE))
        core.atomic_json(core.CONFIG / 'version.json', {**journal['previous'], 'migrations': ledger})
        core.atomic_json(config['baseline'], journal['previous_baseline'])
        state.set(job_id, 'rolled_back', error='operator_reconciled')
        pending.unlink(missing_ok=True)
        if journal['timer']: core.run(['systemctl', 'start', 'single-store-maintenance.timer'])

if __name__ == '__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('job');parser.add_argument('--external-work-stopped',action='store_true',help='Operator attests that associated Docker build/backup work has stopped after inspection.')
    args=parser.parse_args()
    install()
    try:
        reconcile(core.read_json('/etc/single-store/updater/config.json'), args.job,args.external_work_stopped)
        print('Reconciliation complete. Check dashboard status.')
    except Exception:
        raise SystemExit('Recovery remains required. No database restore was performed.')
