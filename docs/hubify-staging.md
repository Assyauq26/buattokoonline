# Deploy kandidat fitur ke Hubify (staging khusus)

Hubify adalah staging yang boleh mengalami downtime. Bukan produksi seller.
Workflow ini tidak dipakai oleh gheverhan.store dan tidak mengubah mekanisme
update.sh yang hanya menerima GitHub Release stabil.

## Arsitektur dan syarat

- Target DIPATOK pada domain hubify.web.id dan Tencent 43.173.41.24.
- Instalasi harus selesai; konfigurasi APP_ORIGIN=https://hubify.web.id.
- Trigger manual (workflow_dispatch), bukan push/PR/merge otomatis. Operator memilih
  PR internal terbuka dan exact 40-hex HEAD SHA. CI verify.yml untuk SHA itu
  harus SUCCESS. Workflow dan server memverifikasi secara terpisah.
- Siapkan GitHub Environment hubify-staging, Required reviewers (wajib), dan
  environment secrets HUBIFY_SSH_PRIVATE_KEY dan HUBIFY_SSH_KNOWN_HOSTS.
  Environment baru TIDAK otomatis memiliki protection rules. Atur melalui
  repository Settings > Environments sebelum mengaktifkan kredensial.
- Akun SSH khusus hubifydeploy, bukan username admin penuh; tidak menjadi anggota
  docker group. Hanya helper root tepercaya yang diperbolehkan lewat sudoers.
- Helper yang dipasang pada VPS berasal dari MAIN yang sudah direview, bukan PR
  pengembangan. Kandidat tetap mempunyai akses runtime ke database/staging:
  gunakan data dummy, review PR, nonaktifkan kredensial J&T Production.

## Aktivasi sekali pada VPS Tencent oleh operator

Lakukan langkah di bawah HANYA setelah PR ini direview dan merge. Pastikan
backup toko sudah tersedia, domain dan fingerprint SSH sesuai.

Di terminal ubuntu@43.173.41.24 pada repository checkout yang sudah diperbarui:

    sudo test -f /etc/single-store/installed
    sudo grep '^APP_ORIGIN=https://hubify.web.id$' /etc/single-store/runtime.env
    sudo install -o root -g root -m 0755 staging/hubify-staging-deploy.py /usr/local/sbin/hubify-staging-deploy
    sudo adduser --disabled-password --gecos '' hubifydeploy
    sudo install -d -o hubifydeploy -g hubifydeploy -m 700 /home/hubifydeploy/.ssh

Jika user sudah ada, JANGAN jalankan adduser lagi; verifikasi identitas dan group.

Buat pasangan SSH key ED25519 KHUSUS deployment pada komputer tepercaya,
jangan di GitHub workflow dan jangan menggunakan kunci pribadi toko/Gheverhan.
Public key ditempatkan di /home/hubifydeploy/.ssh/authorized_keys (owner dan
group hubifydeploy, mode 0600). Private key hanya di secret environment GitHub.

Ambil host public key lewat konsol Tencent, cocokkan fingerprint independen
dengan perintah ssh-keygen. Isi secret HUBIFY_SSH_KNOWN_HOSTS menggunakan baris
penuh dengan format: 43.173.41.24 ssh-ed25519 AAAA....
Jangan mempercayai ssh-keyscan tanpa pemeriksaan independen.

Tambahkan sudoers dengan sudo visudo -f /etc/sudoers.d/hubify-staging:

    hubifydeploy ALL=(root) NOPASSWD: /usr/local/sbin/hubify-staging-deploy *

Validasi menggunakan sudo visudo -cf /etc/sudoers.d/hubify-staging.
Tidak boleh memberikan NOPASSWD: ALL, akses Docker socket, atau akses root shell.
Argumen script hanya diterima setelah validasi PR/SHA/CI dan target domain.

## Deploy kandidat fitur

1. Review keamanan kandidat PR. Pastikan CI verify.yml SUCCESS pada HEAD SHA.
2. Buka Actions > Deploy to Hubify staging > Run workflow dari main.
3. Isi PR number, exact SHA 40 karakter, dan ketik DEPLOY HUBIFY.
4. Setujui GitHub Environment approval.
5. Workflow memverifikasi PR dan CI, lalu masuk melalui SSH host key yang
   dipatok dan meminta helper root yang sudah terpasang.
6. Helper mengunduh checkout kandidat dari ref PR, memverifikasi exact SHA,
   memeriksa inventory migrasi dan kontrak DB, membuat backup root-only,
   menghentikan sementara penulisan aplikasi, membangun Docker berurutan pada
   profil RAM 2 GB, menjalankan hanya migrasi additive, mengaktifkan kode baru
   dan memeriksa readiness serta HTTPS publik.
7. Buka https://hubify.web.id untuk uji fitur. Versi SHA tersimpan di
   /etc/single-store/version.json dengan channel hubify-staging.
8. Setelah disetujui, merge PR dan terbitkan rilis resmi seller lewat proses
   GitHub Release TERPISAH. Deploy staging tidak merge/release otomatis.

Jika aktivasi gagal, helper menjalankan recovery engine bawaan untuk mengaktifkan
kode/container lama. Backup database/media/config disimpan. Migrasi additive
yang telah terpasang TETAP ADA: ini bukan rollback database.

Untuk membatalkan kandidat yang terakhir berhasil di-deploy, operator dapat
menjalankan secara manual dari SSH Tencent:

    sudo /usr/local/sbin/hubify-staging-deploy --rollback

Ini memulihkan kode/container lama, bukan restore database. Jangan lakukan
rollback jika ada data transaksi penting atau migrasi yang tidak kompatibel.
Jika recovery gagal, pertahankan journal/backup dan lakukan pemeriksaan manual
sesuai docs/updates.md. JANGAN hapus volume atau jalankan bootstrap lagi.

## Batasan dan keamanan

- Toko Hubify existing sudah selesai onboarding. Perubahan wizard installer
  pertama tidak bisa diuji dengan menjalankan install.sh kembali; perlu VM
  disposable tersendiri untuk uji wizard baru.
- Jangan mengaktifkan J&T official Production, pengiriman atau pembayaran live.
- Jangan deploy unreviewed PR dari akun lain; even same-repo PR code dapat
  menjalankan build dan akses data staging. Gunakan data dummy serta review.
- Kunci SSH/actions tidak boleh disimpan di repository atau dikirim ke chat.
- Periksa ketersediaan disk dan backup sebelum tiap deploy (terutama VPS 2GB).
- Tidak ada auto-deploy, auto-merge, auto-release, atau update paksa seller.
