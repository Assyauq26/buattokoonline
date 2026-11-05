#!/usr/bin/env bash
# One Ubuntu server, one store. No portal, registration service or remote agent.
set -Eeuo pipefail
set +x
umask 077
export LC_ALL=C.UTF-8
SOURCE_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
INSTALL_DIR=/opt/single-store
CONFIG_DIR=/etc/single-store
DATA_DIR=/var/lib/single-store
LOCAL_TEST=false
[[ ${1:-} != --local-test ]] || LOCAL_TEST=true
[[ $# -eq 0 || ( $# -eq 1 && $LOCAL_TEST == true ) ]] || { echo 'Usage: sudo bash install.sh [--local-test]'; exit 2; }
fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
trap 'unset ADMIN_PASSWORD PASSWORD_CONFIRM; echo "Instalasi berhenti. Data tidak dihapus. Periksa layanan sebelum menjalankan ulang." >&2' ERR
[[ $EUID -eq 0 ]] || fail 'Jalankan dengan sudo bash install.sh.'
[[ -f /etc/os-release ]] || fail 'Ubuntu 24.04 diperlukan.'
# shellcheck disable=SC1091
source /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 ]] || fail 'Installer mendukung Ubuntu 24.04 LTS.'
[[ $(uname -m) == x86_64 || $(uname -m) == aarch64 ]] || fail 'Arsitektur server tidak didukung.'
[[ $(awk '/MemTotal/ {print $2}' /proc/meminfo) -ge 3800000 ]] || fail 'RAM minimal 4 GB diperlukan untuk build.'
[[ $(df -Pk /var | awk 'NR==2 {print $4}') -ge 12000000 ]] || fail 'Ruang kosong minimal 12 GB diperlukan.'
[[ -d /run/systemd/system ]] || fail 'Server harus menggunakan systemd.'
[[ ! -e $CONFIG_DIR && ! -L $CONFIG_DIR && ! -e $INSTALL_DIR && ! -L $INSTALL_DIR && ! -e $DATA_DIR && ! -L $DATA_DIR ]] || fail 'Instalasi/data sudah ada. Installer tidak menimpa toko; lihat docs/operations.md.'
command -v flock >/dev/null || fail 'util-linux/flock diperlukan.'
exec 9>/run/single-store-install.lock
flock -n 9 || fail 'Installer lain sedang berjalan.'
for port in 80 443 3000; do
  [[ -z $(ss -H -ltn "sport = :$port") ]] || fail "Port $port sedang digunakan. Gunakan server kosong."
done

printf '\nInstalasi toko mandiri — satu instalasi, satu toko.\n'
IFS= read -r -p 'Nama brand/toko: ' STORE_NAME
IFS= read -r -p 'Domain toko (contoh: toko.example.com): ' STORE_DOMAIN
IFS= read -r -p 'Email administrator dashboard: ' ADMIN_EMAIL
[[ ${#STORE_NAME} -ge 1 && ${#STORE_NAME} -le 100 && $STORE_NAME != *[[:cntrl:]]* && $STORE_NAME == "${STORE_NAME# }" && $STORE_NAME == "${STORE_NAME% }" ]] || fail 'Nama toko tidak valid (1–100 karakter).'
STORE_DOMAIN=${STORE_DOMAIN,,}
if $LOCAL_TEST; then
  [[ $STORE_DOMAIN == localhost ]] || fail '--local-test hanya untuk localhost dengan sertifikat lokal.'
else
  [[ ${#STORE_DOMAIN} -le 253 && $STORE_DOMAIN =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]] || fail 'Masukkan domain tanpa https, path, atau port.'
fi
[[ ${#ADMIN_EMAIL} -le 254 && $ADMIN_EMAIL =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$ ]] || fail 'Email administrator tidak valid.'
IFS= read -r -s -p 'Password administrator (minimal 12 karakter, maksimal 72 byte): ' ADMIN_PASSWORD
printf '\n'
IFS= read -r -s -p 'Ulangi password: ' PASSWORD_CONFIRM
printf '\n'
[[ $ADMIN_PASSWORD == "$PASSWORD_CONFIRM" && ${#ADMIN_PASSWORD} -ge 12 && $(printf '%s' "$ADMIN_PASSWORD" | wc -c) -le 72 ]] || fail 'Password tidak cocok atau panjang tidak valid.'
unset PASSWORD_CONFIRM
printf '\nBrand: %s\nDomain: %s\nAdmin: %s\nLokasi: %s\n' "$STORE_NAME" "$STORE_DOMAIN" "$ADMIN_EMAIL" "$INSTALL_DIR"
IFS= read -r -p 'Ketik INSTALL untuk mengonfirmasi instalasi: ' CONFIRM
[[ $CONFIRM == INSTALL ]] || { unset ADMIN_PASSWORD; echo 'Dibatalkan.'; exit 0; }

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl openssl rsync dnsutils
if ! command -v docker >/dev/null; then apt-get install -y docker.io docker-compose-v2; fi
docker compose version >/dev/null || fail 'Docker Compose v2 diperlukan.'
systemctl enable --now docker
docker info >/dev/null
[[ -z $(docker volume ls -q --filter name=single-store_) ]] || fail 'Volume toko lama ditemukan. Tidak menimpa data.'

install -d -m 0755 "$INSTALL_DIR" "$DATA_DIR"
install -d -m 0700 "$CONFIG_DIR"
install -d -m 0700 -o 1000 -g 1000 "$DATA_DIR/media"
rsync -a --exclude=node_modules --exclude=.next --exclude='*.tsbuildinfo' --exclude='.env*' --exclude=test-results "$SOURCE_DIR/app" "$INSTALL_DIR/"
install -d -m 0755 "$INSTALL_DIR/deploy"
install -m 0644 "$SOURCE_DIR/deploy/compose.yaml" "$INSTALL_DIR/deploy/compose.yaml"
POSTGRES_PASSWORD=$(openssl rand -hex 32)
OWNER_PASSWORD=$(openssl rand -hex 32)
RUNTIME_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
JNT_KEY=$(openssl rand -base64 32)
CRON_SECRET=$(openssl rand -hex 32)
printf 'POSTGRES_PASSWORD=%s\n' "$POSTGRES_PASSWORD" > "$CONFIG_DIR/postgres.env"
cat > "$CONFIG_DIR/init.sql" <<SQL
CREATE ROLE store_owner LOGIN PASSWORD '$OWNER_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE;
-- The trusted server enforces customer/staff permissions. No browser connects to PostgreSQL.
-- Existing application migrations enable RLS without client policies, so this server role
-- needs BYPASSRLS while retaining only explicit DML grants (no schema/role ownership).
CREATE ROLE store_app LOGIN PASSWORD '$RUNTIME_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
CREATE DATABASE store OWNER store_owner;
REVOKE CONNECT ON DATABASE store FROM PUBLIC;
GRANT CONNECT ON DATABASE store TO store_owner, store_app;
\connect store
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
cat > "$CONFIG_DIR/runtime.env" <<ENV
APP_ORIGIN=https://$STORE_DOMAIN
NEXT_PUBLIC_BASE_URL=https://$STORE_DOMAIN
DATABASE_URL=postgresql://store_app:$RUNTIME_PASSWORD@db:5432/store
DIRECT_URL=postgresql://store_app:$RUNTIME_PASSWORD@db:5432/store
JWT_SECRET=$JWT_SECRET
AUTH_COOKIE_NAME=store_session
STORAGE_LOCAL_ROOT=/media
JNT_INTEGRATION_ENCRYPTION_KEY=$JNT_KEY
CRON_SECRET=$CRON_SECRET
PAYMENT_PROVIDER=manual
SHIPPING_PROVIDER=manual
REGION_DATA_MODE=snapshot
PRODUCT_MEDIA_CLEANUP_ENABLED=1
PASSWORD_RESET_BASE_URL=https://$STORE_DOMAIN
ENV
cat > "$CONFIG_DIR/migration.env" <<ENV
DATABASE_URL=postgresql://store_owner:$OWNER_PASSWORD@db:5432/store
DIRECT_URL=postgresql://store_owner:$OWNER_PASSWORD@db:5432/store
ENV
unset POSTGRES_PASSWORD OWNER_PASSWORD RUNTIME_PASSWORD JWT_SECRET JNT_KEY CRON_SECRET
cat > "$CONFIG_DIR/Caddyfile" <<CADDY
{
  email $ADMIN_EMAIL
}
$STORE_DOMAIN {
  encode zstd gzip
  reverse_proxy app:3000
  header X-Content-Type-Options nosniff
  header Referrer-Policy strict-origin-when-cross-origin
}
CADDY
if $LOCAL_TEST; then sed -i '/encode zstd gzip/a\  tls internal' "$CONFIG_DIR/Caddyfile"; fi
chmod 0600 "$CONFIG_DIR/"*
# Docker initializes PostgreSQL as its own UID, so the read-only init mount must be readable.
chmod 0644 "$CONFIG_DIR/init.sql"
compose() { docker compose -f "$INSTALL_DIR/deploy/compose.yaml" "$@"; }
compose build app tools
compose up -d --wait db
compose run --rm -T tools npm run db:migrate
printf '%s\0%s\0%s' "$STORE_NAME" "$ADMIN_EMAIL" "$ADMIN_PASSWORD" | compose run --rm -T tools npm run bootstrap
unset ADMIN_PASSWORD
compose exec -T db psql -U postgres -d store -v ON_ERROR_STOP=1 <<'SQL'
GRANT USAGE ON SCHEMA public TO store_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO store_app;
REVOKE ALL ON TABLE "_prisma_migrations" FROM store_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO store_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO store_app;
ALTER DEFAULT PRIVILEGES FOR ROLE store_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO store_app;
ALTER DEFAULT PRIVILEGES FOR ROLE store_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO store_app;
SQL
# init.sql is not needed again; retain no extra plaintext credential copy.
printf '%s\n' '-- Initialized; credentials are stored in root-only environment files.' > "$CONFIG_DIR/init.sql"
compose up -d --wait app proxy
install -m 0644 "$SOURCE_DIR/deploy/single-store-maintenance.service" /etc/systemd/system/single-store-maintenance.service
install -m 0644 "$SOURCE_DIR/deploy/single-store-maintenance.timer" /etc/systemd/system/single-store-maintenance.timer
systemctl daemon-reload
systemctl enable --now single-store-maintenance.timer
touch "$CONFIG_DIR/installed"
printf '\nToko %s berhasil dipasang.\nStorefront: https://%s\nDashboard: https://%s/admin\n' "$STORE_NAME" "$STORE_DOMAIN" "$STORE_DOMAIN"
if $LOCAL_TEST; then
  echo 'Sertifikat CA lokal digunakan untuk VM pengujian; bukan sertifikat publik.'
elif curl --fail --silent --show-error --max-time 20 --resolve "$STORE_DOMAIN:443:127.0.0.1" "https://$STORE_DOMAIN/api/v1/health" >/dev/null; then
  echo 'HTTPS publik berhasil diverifikasi.'
else
  echo 'HTTPS menunggu DNS/akses port 80 dan 443. Arahkan A/AAAA ke server ini; Caddy mengulang penerbitan otomatis.'
fi
echo 'Katalog, pelanggan, pesanan, voucher, dan media masih kosong. Login untuk mulai menambahkan produk.'
