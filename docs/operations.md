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

Installer menolak direktori atau volume yang sudah ada agar kredensial/data tidak
ditimpa. Jangan menghapus volume untuk memperbaiki startup. Jika instalasi berhenti
setelah konfigurasi dibuat, perbaiki penyebab dengan melihat status/build log.
Lanjutkan migrasi melalui service `tools`. Bootstrap menolak database yang sudah
memiliki user/identitas toko, sehingga tidak mereset password yang ada.

## DNS dan HTTPS

Arahkan A (dan AAAA jika digunakan) domain ke IP server, buka inbound TCP 80/443,
dan pastikan record AAAA tidak menunjuk server lain. Caddy meminta serta memperbarui
sertifikat otomatis. Installer membuktikan akses HTTPS dari server bila penerbitan
sudah selesai; jika belum, ia melaporkan status menunggu DNS. Port aplikasi hanya
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
`docker compose down -v` pada toko yang hendak dipertahankan. Untuk update: backup,
review perubahan, salin source baru ke `/opt/single-store/app`, build app/tools,
jalankan `tools npm run db:migrate`, kemudian `up -d app`. Jangan jalankan bootstrap
lagi. Tidak ada auto-update atau sinkronisasi dengan toko/platform lain.

## Ruang lingkup tes

Workflow menjalankan installer pada VM GitHub-hosted Ubuntu 24.04 yang baru untuk
setiap job. VM mempunyai tooling bawaan runner; database/media toko dimulai kosong.
Ia menguji login nyata, UI produk dan upload, draft/publish brand, HTTPS lokal,
database dan media setelah restart seluruh container. Provider J&T/email nyata
dan sertifikat domain publik memerlukan konfigurasi milik seller dan tidak diuji
menggunakan akun produksi sumber.
