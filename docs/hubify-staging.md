# Deployment manual Hubify (tanpa gate CI)

Hubify adalah staging khusus `hubify.web.id` pada VPS `43.173.41.24`, bukan produksi seller.
Mulai dari perubahan kebijakan ini, `.github/workflows/verify.yml` hanya berjalan bila pemilik
memilih **Actions > Single-store Ubuntu installation > Run workflow**. Tidak ada trigger
push atau pull request. Hasil CI boleh digunakan sebagai informasi, tetapi bukan
syarat merge maupun deployment Hubify.

## Kebijakan yang tetap berlaku

- Deploy tetap **manual** melalui Actions > Deploy to Hubify staging > Run workflow.
- Hanya `main` dan **exact 40-character HEAD SHA** yang diizinkan; SHA diverifikasi
  di Actions dan ulang di helper VPS. Jika `main` berubah selama proses, deploy berhenti.
- Environment `hubify-staging` dan approval/reviewer yang dikonfigurasi tetap dipertahankan.
- SSH menggunakan `hubifydeploy` dengan host key terverifikasi dan hanya
  `sudo /usr/local/sbin/hubify-staging-deploy`; jangan beri root shell,
  akses Docker socket, atau `NOPASSWD: ALL`.
- Backup, maintenance mode, pemeriksaan kontrak database, validasi migrasi,
  readiness/HTTPS, dan recovery tetap wajib. **Melepas CI tidak menghapus
  pemeriksaan migrasi maupun persyaratan keamanan runtime.**
- J&T Production tidak diaktifkan pada staging. Checkout transaksi live tidak diuji
  dengan uang nyata atau order carrier sungguhan.

## Pembaruan helper di server (sekali, oleh operator sudo)

Kode helper baru di repository tidak otomatis mengganti helper root-owned yang terpasang.
Operator harus memeriksa `main` terbaru dan memasang helper yang telah direview:

```bash
# Jalankan dalam checkout repository yang sudah diperbarui ke main yang disetujui.
sudo test -f /etc/single-store/installed
sudo grep '^APP_ORIGIN=https://hubify.web.id$' /etc/single-store/runtime.env
sudo install -o root -g root -m 0755 staging/hubify-staging-deploy.py /usr/local/sbin/hubify-staging-deploy
sudo visudo -cf /etc/sudoers.d/hubify-staging
```

Pastikan backup tersedia dan tidak ada proses upgrade aktif sebelum mengganti helper.
Operator sebaiknya membandingkan SHA source helper dengan commit yang disetujui.

## Deploy dengan tombol manual

1. Buka repository pada branch `main`, salin exact 40-hex HEAD commit.
2. Buka **Actions > Deploy to Hubify staging > Run workflow** dari `main`.
3. Masukkan `exact_sha` dan ketik `DEPLOY HUBIFY`.
4. Selesaikan approval environment bila diaktifkan.
5. Workflow hanya memverifikasi identitas repo, exact SHA `main`, dan koneksi SSH.
   Tidak ada pemeriksaan CI-success.
6. Helper melakukan preflight, backup, build, migrasi yang kompatibel,
   penggantian aplikasi, readiness dan HTTPS. Hasilnya mencatat SHA terpasang.
7. Setelah deploy, atur ongkir Manual di dashboard sebelum menguji checkout dummy.

Jika migrasi kandidat ditolak oleh validator additive, deployment **tetap berhenti**.
Jangan mengubah validator, memalsukan inventory, atau menjalankan SQL manual tanpa
review operator yang terpisah dan rencana backup/restore teruji. Fitur shipping
pada PR #6 memakai migrasi data sehingga memerlukan pemeriksaan ini.

## Recovery

Jika deployment baru gagal, helper mengupayakan pemulihan container/kode sebelumnya
dan mempertahankan journal serta backup. Migrasi additive yang telah berjalan tidak
otomatis dihapus dari database. Untuk rollback staging terakhir melalui operator:

```bash
sudo /usr/local/sbin/hubify-staging-deploy --rollback
```

Rollback kode bukan restore database. Jangan lakukan ketika ada perubahan data
transaksi yang harus dipertahankan; lihat `docs/updates.md`.
