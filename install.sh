#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077
export LC_ALL=C.UTF-8 DEBIAN_FRONTEND=noninteractive
SOURCE_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
[[ $EUID -eq 0 ]] || { echo 'Jalankan sudo bash install.sh.'; exit 1; }
source /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 ]] || { echo 'Ubuntu 24.04 LTS diperlukan.'; exit 1; }
[[ $(uname -m) == x86_64 || $(uname -m) == aarch64 ]] || exit 1
[[ $(awk '/MemTotal/ {print $2}' /proc/meminfo) -ge 3800000 ]] || { echo 'RAM minimal 4 GB.'; exit 1; }
[[ $(df -Pk /var | awk 'NR==2 {print $4}') -ge 12000000 ]] || { echo 'Ruang kosong minimal 12 GB.'; exit 1; }
[[ -d /run/systemd/system ]] || { echo 'systemd diperlukan.'; exit 1; }
exec 9>/run/single-store-install.lock
flock -n 9 || { echo 'Installer lain sedang berjalan.'; exit 1; }
if [[ -f /etc/single-store/installed ]]; then
  echo 'Toko sudah terpasang. Database, akun, dan konfigurasi dipertahankan. Gunakan update.sh untuk pembaruan versi.'
  exit 0
fi
if [[ ! -f /etc/single-store/setup.json ]]; then
  for path in /etc/single-store /opt/single-store /var/lib/single-store; do
    [[ ! -e $path && ! -L $path ]] || { echo 'Data existing tanpa progres wizard ditemukan; installer menolak menimpanya.'; exit 1; }
  done
  for port in 80 443 3000 8787; do
    [[ -z $(ss -H -ltn "sport = :$port") ]] || { echo "Port $port sedang dipakai. Gunakan server kosong."; exit 1; }
  done
fi
apt-get update
apt-get install -y ca-certificates curl openssl rsync dnsutils python3
if ! command -v docker >/dev/null; then apt-get install -y docker.io docker-compose-v2; fi
docker compose version >/dev/null
systemctl enable --now docker
if [[ ! -f /etc/single-store/setup.json ]]; then
  [[ -z $(docker volume ls -q --filter name=single-store_) ]] || { echo 'Volume toko existing ditemukan; data tidak ditimpa.'; exit 1; }
fi
python3 "$SOURCE_DIR/installer/prepare.py" "$SOURCE_DIR" "$@"
