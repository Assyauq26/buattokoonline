# Deploy `main` ke Hubify

Hubify adalah satu-satunya lingkungan pengembangan aplikasi toko di [hubify.web.id](https://hubify.web.id).
Nama file, environment, channel, dan helper yang mengandung `staging` di bawah
adalah identitas deployment lama yang masih aktif, bukan lingkungan tambahan.
Jangan menghapus atau menggantinya sebelum migrasi deployment Hubify diotorisasi.
Gunakan data pengujian dan jadwalkan kemungkinan downtime saat build atau migrasi.
Deploy Hubify memakai commit terkini dari `main` di `Assyauq26/buattokoonline`.
Workflow dan helper VPS memeriksa SHA tanpa bergantung pada status PR atau CI.

## Pemasangan helper di VPS

Operator membutuhkan akses `sudo` melalui console Tencent atau SSH operator.
Gunakan checkout yang berisi helper baru dari `main`. Pastikan instalasi selesai,
domain cocok, dan backup sebelumnya tersedia. Dari root checkout di VPS, jalankan:

```bash
sudo test -f /etc/single-store/installed
sudo grep -qx 'APP_ORIGIN=https://hubify.web.id' /etc/single-store/runtime.env
sudo cp -a /usr/local/sbin/hubify-staging-deploy /usr/local/sbin/hubify-staging-deploy.before-main
sudo install -o root -g root -m 0755 staging/hubify-staging-deploy.py /usr/local/sbin/hubify-staging-deploy.new
sudo mv -f /usr/local/sbin/hubify-staging-deploy.new /usr/local/sbin/hubify-staging-deploy
sudo visudo -cf /etc/sudoers.d/hubify-staging
```

Untuk instalasi pertama, lewati perintah `cp` dan siapkan akun `hubifydeploy`
dengan public key ED25519 khusus deployment. Direktori `~/.ssh` miliknya
bermode 0700 dan `authorized_keys` bermode 0600. Berikan hanya izin berikut
melalui `sudo visudo -f /etc/sudoers.d/hubify-staging`.

```sudoers
hubifydeploy ALL=(root) NOPASSWD: /usr/local/sbin/hubify-staging-deploy *
```

Simpan private key khusus deploy sebagai `HUBIFY_SSH_PRIVATE_KEY` di GitHub
Environment `hubify-staging`. Set `HUBIFY_SSH_KNOWN_HOSTS` dengan public host key
ED25519 untuk `43.173.41.24` setelah mencocokkan fingerprint melalui console
Tencent. Batasi deployment branches environment ke `main`. Akun SSH deploy
menggunakan helper milik root. Simpan akses Docker dan shell root pada akun operator.

## Deploy setelah merge

1. Merge perubahan aplikasi ke `main`.
2. Jalankan **Actions → Deploy to Hubify staging → Run workflow** dari `main`.
   Isi `exact_sha` dengan SHA HEAD `main` dan ketik `DEPLOY HUBIFY` untuk
   konfirmasi. Dari terminal, gunakan:

   ```bash
   sha=$(gh api repos/Assyauq26/buattokoonline/git/ref/heads/main --jq .object.sha)
   gh workflow run deploy-hubify.yml --ref main -f exact_sha="$sha" -f confirmation='DEPLOY HUBIFY'
   ```

3. Setujui deployment jika GitHub Environment masih memakai **Required reviewers**.
4. Workflow mengirim SHA `main` ke helper. Helper mengambil HEAD `main`,
   memeriksa kecocokan SHA, membuat backup, melakukan build dan migrasi, lalu
   mengecek HTTPS publik. Jika SHA sudah tertinggal, jalankan ulang dari `main`.
5. Periksa `STAGING_DEPLOY_SUCCESS` pada log Actions dan
   [status readiness](https://hubify.web.id/api/v1/ready). SHA terpasang
   tercatat di `/etc/single-store/version.json` dengan channel `hubify-staging`.
   Workflow bisa dijalankan ulang setelah commit terpasang untuk memeriksa
   kesehatan aplikasi tanpa rebuild.

CI verifikasi dapat dijalankan secara manual melalui workflow
**Single-store Ubuntu installation**. Deploy Hubify dapat dijalankan langsung
setelah merge. GitHub Releases dan updater toko memakai prosedur rilis sendiri.

## Migrasi Issue #5 dan rollback

Helper Hubify menerima `20261105100000_shipping_settings` melalui pengecualian
yang dipatok ke nama dan checksum SQL. Pengecualian berlaku pada helper root
yang dipasang operator. Migrasi baru lainnya melalui validator additive. Helper
memeriksa riwayat migrasi database dan kontrak rollback sebelum memulai deploy.
Untuk uji checkout sesudah migrasi Issue #5, tetapkan ongkir Manual di dashboard.

Jika deploy gagal, helper memulihkan kode/container sebelumnya. Operator juga
dapat memulihkan deployment terakhir secara manual.

```bash
sudo /usr/local/sbin/hubify-staging-deploy --rollback
```

Backup database, media, dan konfigurasi tersimpan privat. Rollback kode
mempertahankan migrasi yang sudah diterapkan. Jika pemulihan memerlukan
perbaikan database, periksa journal dan backup sesuai [panduan update](updates.md).
Gunakan data sintetis untuk pengujian dan biarkan akses J&T Production dinonaktifkan.
