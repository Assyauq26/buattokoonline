#!/usr/bin/env python3
"""Offline diagnosis/dry-run, using fresh read-only operator observations.

There is intentionally no --apply: the production cutover guard stays closed.
No root privileges, network access, extraction, subprocess or mutation needed.
"""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'installer'))
import core
import promotions_transition as transition


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true', required=True)
    parser.add_argument('--observation', required=True, help='JSON bundle from the read-only observer')
    parser.add_argument('--baseline-archive', required=True)
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--candidate-sha256', required=True)
    parser.add_argument('--source-sha', required=True)
    args = parser.parse_args()
    load = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))
    baseline = transition.package(args.baseline_archive, transition.BASE_ARCHIVE,
                                  transition.BASE_RELEASE_SOURCE, '1.7.4')
    candidate = transition.package(args.candidate, args.candidate_sha256, args.source_sha, '1.8.0')
    bundle = load(args.observation)
    result = transition.review(bundle['observation'], bundle['runtime'], bundle['schema'],
                               baseline, candidate, bundle['context'])
    result['candidate_sha256'] = args.candidate_sha256
    result['observation_sha256'] = transition.digest(Path(args.observation).read_bytes())
    print(json.dumps(result, sort_keys=True, indent=2))
    # Exit 2 distinguishes accepted equivalence + blocked cutover from rejection.
    return 2


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (core.StoreError, KeyError, ValueError, OSError) as exc:
        print(json.dumps({'equivalence_accepted': False, 'decision': 'NO-GO',
                          'reason': str(exc), 'production_writes': False}), file=sys.stderr)
        sys.exit(1)
