"""Bounded child process for backup/restore verification; no customer DB restore."""
import os
from pathlib import Path
import sys
import core
import updater
from .runtime import install

def main():
    os.umask(0o077)
    install()
    receipt=Path(sys.argv[1]).resolve()
    root=(core.DATA/'updater/jobs').resolve()
    if receipt.name!='backup.json' or receipt.parent.parent!=root:
        raise core.StoreError('invalid_backup_target')
    path=updater.backup()
    # Persist its location before verification; operators can inspect an
    # interrupted scratch restore without guessing which backup belongs to it.
    core.atomic_json(receipt,{'path':path,'verified':False})
    updater.verify_backup(path)
    core.atomic_json(receipt,{'path':path,'verified':True})

if __name__=='__main__':
    try:main()
    except Exception:raise SystemExit(1)
