# Operasional toko mandiri

## Lokasi dan layanan

- `/opt/single-store`: salinan source dan Compose.
- `/etc/single-store`: konfigurasi root-only; **jangan commit, unggah, atau bagikan**.
- `/var/lib/single-store/media`: upload persisten, UID 1000.
- Volume Docker `single-store_postgres`: database toko ini.
- Volume `single-store_caddy_data`: sertifikat dan akun ACME.
- Database hanya diakses backend. Role `store_app` mempunyai DML dan `BYPASSRLS`
  untuk membaca tabel aplikasi yang memiliki RLS dari migrasi sumber, tanpa hak
  superuser, membuat database/role, atau memiliki schema. Otorisasi pelanggan/staf
  dilakukan API; port PostgreSQL tidak dibuka. Migrasi memakai role terpisah.
- Timer systemd `single-store-maintenance.timer`: kedaluwarsa pesanan belum dibayar
  dan pembersihan upload sementara kedaluwarsa setiap menit, hanya di server ini.
  Referensi wilayah dibaca dari snapshot lokal; pembaruan data dilakukan manual.

```bash
sudo docker compose -f /opt/single-store/deploy/compose.yaml ps
sudo docker compose -f /opt/single-store/deploy/compose.yaml restart
```

Installer baru mendukung 2 vCPU, RAM minimal 1900000 KiB, swap aktif minimal
1900000 KiB untuk profil di bawah 3800000 KiB RAM, Ubuntu 24.04 dan disk kosong
12 GB. Swap membantu saat build, tetapi tidak menggantikan pemeriksaan RAM.

Wizard disimpan pada `/etc/single-store/setup.json`, termasuk exact source SHA,
mode, brand/domain dan tahapan build/bootstrap; tidak menyimpan password admin.
Jalankan installer dari checkout SHA dan mode yang sama untuk melanjutkan. Tautan
setup root-only dapat dibuka melalui SSH tunnel. Periksa host key SSH melalui
console penyedia VPS sebelum mempercayai koneksi pertama.

Jika source perlu diperbaiki **sebelum finalisasi/build/admin dimulai**, root dapat
mereview checkout baru lalu menjalankan `sudo bash install.sh --resume-source`.
SHA lama disimpan dalam riwayat progres; brand, secret dan verifikasi tidak direset.
Flag ini ditolak setelah finalisasi dimulai. Jangan menggunakannya untuk mengubah
kode toko existing; gunakan updater release untuk toko yang sudah terpasang.

Gangguan saat DNS/HTTPS dapat diperiksa ulang tanpa membuat ulang secret. Build
yang terputus dijalankan ulang dengan cache. Jika transaksi bootstrap sudah commit,
recovery mendeteksi admin existing dan hanya melanjutkan finalisasi. Password lama
tetap berlaku. Setelah instalasi sehat, token dihapus, API setup mengembalikan 410,
unit setup dinonaktifkan, lalu listener loopback berhenti. Menjalankan installer
kembali tidak membuka setup untuk toko yang sudah selesai.

Direktori/volume existing tanpa progres wizard dikenali dan ditolak aman. Jangan
menghapusnya untuk mengatasi error. Log operasi lokal berada di
`/etc/single-store/operation.log` (root-only); input password/SQL stdin tidak dicatat.

## DNS dan HTTPS

Arahkan A (dan AAAA jika digunakan) domain ke IP server, buka inbound TCP 80/443,
dan pastikan record AAAA tidak menunjuk server lain. Caddy meminta serta memperbarui
sertifikat otomatis. Wizard tidak membuka langkah admin sampai DNS dan HTTPS
lulus, dan mengulang verifikasi saat membuat admin. Port aplikasi hanya
terikat pada loopback; PostgreSQL tidak menerbitkan port host.

`--local-test` hanya menerima domain `localhost` dan memakai CA lokal Caddy.
Ini menguji TLS tanpa domain publik dan **bukan** bukti penerbitan sertifikat ACME.

## Menyiapkan penjualan

Login `/admin`, tambahkan produk/foto/berat/stok, rekening bank, lalu atur pengiriman.
Pendaftaran pelanggan dan reset password memakai email OTP/tautan melalui Resend.
Konfigurasikan `RESEND_API_KEY` dan `PASSWORD_RESET_FROM` (sender terverifikasi milik
toko) di `/etc/single-store/runtime.env`, lalu buat ulang service app:

```bash
sudo docker compose -f /opt/single-store/deploy/compose.yaml up -d --force-recreate app
```

Tidak ada data akun pelanggan, tarif, rekening atau kredensial email contoh aktif.
Checkout manual memerlukan `JNT_MANUAL_RATE_CONFIG` berisi tarif serta wilayah yang
benar-benar ditentukan toko. Lihat schema `app/src/infrastructure/shipping/jnt/jnt-config.ts`.
Tanpa konfigurasi tarif, checkout menampilkan tidak tersedia; tidak mengarang ongkir.
J&T API dijelaskan pada [jnt.md](jnt.md). Tinjau draf kebijakan toko sebelum menjual.

## Backup dan pembaruan manual

Backup selalu mencakup database, media, dan konfigurasi/kunci enkripsi sebagai satu
set. Simpan backup terenkripsi di lokasi lain dengan akses terbatas. Contoh dump:

```bash
sudo install -d -m 700 /var/backups/single-store
sudo sh -c 'umask 077; docker compose -f /opt/single-store/deploy/compose.yaml exec -T db pg_dump -U postgres -d store -Fc > /var/backups/single-store/store.dump'
sudo sh -c 'umask 077; tar -czf /var/backups/single-store/files.tar.gz /etc/single-store /var/lib/single-store/media'
```

Uji restore pada server terpisah sebelum bergantung pada backup. Jangan menjalankan
`docker compose down -v` pada toko yang hendak dipertahankan. Gunakan updater CLI
release yang dijelaskan pada [updates.md](updates.md); updater membuat set backup
ber-checksum dan mempertahankan versi kode lama. Jangan menimpa source aktif secara
manual atau menjalankan bootstrap lagi. Tidak ada auto-update atau sinkronisasi.

## Ruang lingkup tes

Lihat [testing.md](testing.md) untuk profil runner biasa dan guest Ubuntu 2 GB,
recovery wizard, backup/restore, dua versi disposable, rollback kode, serta batas
pembuktian TLS lokal dan pengujian publik yang terotorisasi.
