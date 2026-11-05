#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077
[[ $EUID -eq 0 ]] || { echo 'Jalankan sudo bash update.sh.'; exit 1; }
exec 9>/run/single-store-operation.lock
flock -n 9 || { echo 'Operasi toko lain sedang berjalan.'; exit 1; }
exec python3 /opt/single-store/manager/updater.py "$@"
