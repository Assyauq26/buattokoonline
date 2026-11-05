#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077
[[ $EUID -eq 0 && ${1:-} == --check && $# -eq 2 ]] || { echo 'Gunakan sudo bash restore.sh --check /var/backups/single-store/ID_BACKUP'; exit 1; }
exec 9>/run/single-store-operation.lock
flock -n 9 || exit 1
exec python3 /opt/single-store/manager/updater.py --verify-backup "$2"
