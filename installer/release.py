"""Build the only package format the updater accepts. Run on a clean tagged checkout."""
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import core


def pack(source, output, fixture=False):
    source, output = Path(source), Path(output)
    version = (source / 'VERSION').read_text().strip()
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', version):
        raise core.StoreError('Stable semantic VERSION required')
    if not fixture:
        subprocess.run(['git', '-C', source, 'diff', '--exit-code', 'HEAD'], check=True, stdout=subprocess.DEVNULL)
    sha = core.run(['git', '-C', source, 'rev-parse', 'HEAD'])
    names = core.run(['git', '-C', source, 'ls-files']).splitlines()
    names = [n for n in names if n.startswith(('app/', 'installer/', 'deploy/', 'docs/')) or n in ['VERSION', 'update.sh', 'restore.sh', 'release-policy.json', 'LICENSE', 'NOTICE', 'README.md']]
    # Disposable CI fixtures may add one migration to an otherwise tracked checkout.
    if fixture:
        names = sorted(set(names) | {p.relative_to(source).as_posix() for p in (source / 'app/prisma/migrations').glob('*/migration.sql')})
    files = {}
    for name in names:
        path = source / name
        if path.is_symlink() or not path.is_file():
            raise core.StoreError('Only tracked regular source files are distributable')
        files[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    manifest = {'format': 1, 'repository': core.REPO, 'repository_id': core.REPO_ID, 'version': version,
                'tag': 'v' + version, 'source_sha': sha, 'compatibility': core.read_json(source / 'release-policy.json'),
                'migrations': core.inventory(source), 'files': files}
    with tarfile.open(output, 'w:gz') as archive:
        for name in sorted(files):
            data = (source / name).read_bytes()
            info = tarfile.TarInfo(name)
            info.size, info.mode, info.mtime = len(data), 0o644, 0
            archive.addfile(info, io.BytesIO(data))
        data = json.dumps(manifest, sort_keys=True).encode()
        info = tarfile.TarInfo('release.json')
        info.size, info.mode, info.mtime = len(data), 0o644, 0
        archive.addfile(info, io.BytesIO(data))
    return manifest


if __name__ == '__main__':
    pack(Path.cwd(), sys.argv[1])
