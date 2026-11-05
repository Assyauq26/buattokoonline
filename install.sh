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
RAM_KIB=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
SWAP_KIB=$(awk '/SwapTotal/ {print $2}' /proc/meminfo)
[[ $(nproc) -ge 2 ]] || { echo 'Minimal 2 vCPU diperlukan.'; exit 1; }
[[ $RAM_KIB -ge 1900000 ]] || { echo 'RAM minimal 2 GB (1900000 KiB) diperlukan.'; exit 1; }
if [[ $RAM_KIB -lt 3800000 && $SWAP_KIB -lt 1900000 ]]; then
  echo 'Profil 2 GB memerlukan swap aktif minimal 1900000 KiB (sekitar 2 GiB). Siapkan swap lalu jalankan installer kembali. Periksa dengan free -h dan swapon --show.'
  exit 1
fi
echo "Profil server: $(nproc) vCPU; RAM $RAM_KIB KiB; swap $SWAP_KIB KiB. Build dijalankan dengan satu worker Next.js."
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
if ! docker buildx version >/dev/null 2>&1; then apt-get install -y docker-buildx; fi
docker buildx version >/dev/null
systemctl enable --now docker
if [[ ! -f /etc/single-store/setup.json ]]; then
  [[ -z $(docker volume ls -q --filter name=single-store_) ]] || { echo 'Volume toko existing ditemukan; data tidak ditimpa.'; exit 1; }
fi
python3 "$SOURCE_DIR/installer/prepare.py" "$SOURCE_DIR" "$@"
