#!/usr/bin/env python3
"""Reviewed operator executor for one Hubify installation. No remote seller rollout."""
import argparse
import json
from pathlib import Path
import sys
import urllib.request

REPOSITORY = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPOSITORY / 'installer'))
import core
import promotions_cutover as cutover


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--dry-run', action='store_true')
    mode.add_argument('--apply', action='store_true')
    mode.add_argument('--reconcile', action='store_true')
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--candidate-sha256', required=True)
    parser.add_argument('--source-sha', required=True)
    parser.add_argument('--baseline-archive', required=True)
    parser.add_argument('--external-work-stopped', action='store_true', help='Reconciliation only, after operator inspection of interrupted Docker build/backup work')
    args = parser.parse_args()
    driver = cutover.Native(REPOSITORY, args.candidate, args.candidate_sha256, args.source_sha, args.baseline_archive)
    cutover.check(not args.external_work_stopped or args.reconcile, 'external work attestation requires reconcile')
    driver.external_work_stopped = args.external_work_stopped
    engine = cutover.Cutover(driver)
    if args.dry_run:
        print(json.dumps(engine.dry_run(), sort_keys=True))
        return
    # Apply only a merged main commit; root explicitly pins SHA and digest.
    request = urllib.request.Request('https://api.github.com/repos/' + core.REPO + '/branches/main',
                                     headers={'User-Agent': 'hubify-production-cutover'})
    with urllib.request.urlopen(request, timeout=30) as response:
        current = json.load(response)
    if not args.reconcile:
        cutover.check(current['commit']['sha'] == args.source_sha, 'source is not current merged main')
    else:
        url = 'https://api.github.com/repos/' + core.REPO + '/compare/' + args.source_sha + '...' + current['commit']['sha']
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'hubify-production-cutover'}), timeout=30) as response:
            ancestry = json.load(response)
        cutover.check(ancestry['status'] in ('identical','ahead'), 'reconciliation source is not merged ancestry')
    with cutover.operation_lock():
        result = engine.reconcile() if args.reconcile else engine.apply()
        print(json.dumps({'phase': result['phase'], 'source_sha': args.source_sha,
                          'artifact_sha256': args.candidate_sha256, 'backup': result.get('backup')}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, core.StoreError) else 'Cutover stopped; inspect root-only journal.', file=sys.stderr)
        sys.exit(1)
