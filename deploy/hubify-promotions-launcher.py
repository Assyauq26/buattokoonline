#!/usr/bin/env python3
"""Root-owned restricted entry point for the existing protected GitHub workflow."""
import os
from pathlib import Path
import re
import stat
import sys


def command(arguments, root=Path('/opt/single-store')):
    if len(arguments) != 2 or not re.fullmatch('[a-f0-9]{40}', arguments[0]) or not re.fullmatch('[a-f0-9]{64}', arguments[1]):
        raise ValueError('Exact merged source SHA and artifact digest required')
    sha, digest = arguments
    repository = root / 'operator-sources' / sha
    artifact = root / 'operator-artifacts' / sha / 'store-v1.8.0.tar.gz'
    baseline = root / 'operator-artifacts/store-v1.7.4.tar.gz'
    script = repository / 'deploy/hubify-promotions-cutover.py'
    for path in [repository, artifact, baseline, script]:
        for item in [path, *path.parents]:
            info = item.lstat()
            if stat.S_ISLNK(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
                raise ValueError('Root-owned non-writable source/artifact required')
            if item == root:
                break
    return ['/usr/bin/python3', str(script), '--apply', '--candidate', str(artifact),
            '--candidate-sha256', digest, '--source-sha', sha, '--baseline-archive', str(baseline)]


if __name__ == '__main__':
    try:
        if os.geteuid() != 0:
            raise ValueError('Restricted root entry point required')
        argv = command(sys.argv[1:])
        os.execv(argv[0], argv)
    except Exception:
        raise SystemExit('Promotions cutover rejected by restricted launcher')
