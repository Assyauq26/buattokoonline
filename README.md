# Toko online single-store

**Satu instalasi = satu toko = satu seller.** Storefront dan dashboard administrator
diadaptasi dari aplikasi toko [Gheverhan](https://github.com/Assyauq26/Gheverhan).
Nama sumber tidak menjadi identitas default toko seller.

Katalog, kategori, variasi/stok, keranjang/checkout, pesanan, pelanggan, dekorasi,
promosi, review, pembayaran manual dan J&T berjalan dengan database toko sendiri.
Tidak ada tenant, portal SaaS, pairing VPS, control-plane atau update paksa.

## Persyaratan

Ubuntu **24.04 LTS**, **2 vCPU**, minimal **1900000 KiB RAM (kelas 2 GB)**,
dan **12 GB ruang kosong**. Profil RAM di bawah 3800000 KiB memerlukan swap aktif
minimal **1900000 KiB**, sekitar 2 GiB. Installer berhenti dengan pesan jelas bila
RAM/swap/disk tidak memenuhi batas. Periksa `free -h`, `swapon --show` dan `df -h`.
Git, akses sudo, SSH dan inbound TCP 80/443 diperlukan. Siapkan domain milik toko.

Build Compose dijalankan berurutan, Next.js memakai satu worker, Node build memakai
batas heap 1024 MiB dan runtime 512 MiB, dengan dua thread native. Ini batas heap,
bukan batas seluruh RAM proses. Hasil pengukuran aktual ada pada artifact CI profil
`vm2gb`; pengujian memakai guest Ubuntu dengan RAM 2048 MiB dan 2 vCPU, terpisah
dari memori browser/runner. Jangan menganggap runner berkapasitas besar sebagai
bukti kompatibilitas VPS 2 GB. Profil dan cara mengukur dijelaskan di docs/testing.md.

## Instalasi

```bash
git clone https://github.com/Assyauq26/buattokoonline.git
cd buattokoonline
sudo bash install.sh
```

Terminal menampilkan tautan otorisasi setup. Wizard **hanya mendengarkan loopback**.
Dari komputer kamu buka SSH tunnel, lalu buka tautan terminal di browser:

```bash
ssh -L 8787:127.0.0.1:8787 USER@IP_VPS
```

Jangan membagikan tautan setup atau mempublikasikan port 8787. Tidak perlu password
penyedia DNS. Progres tetap tersimpan bila browser/SSH terputus.

1. **Nama Toko** — isi brand untuk header, login, metadata dan logo teks.
2. **Hubungkan Domain** — ikuti kartu DNS A, opsi CNAME www, lalu Periksa Koneksi
   Domain. Dua resolver memeriksa A/AAAA; alamat salah/konflik ditolak. Caddy
   memverifikasi hostname, sertifikat tepercaya dan challenge server melalui HTTP
   serta HTTPS. Admin terkunci sampai pemeriksaan produksi lolos.
3. **Buat Admin** — email, password kuat dan konfirmasi. Password melewati jalur
   SSH tunnel lokal, tidak masuk log, argumen proses atau file progres. Bootstrap
   bcrypt dijalankan sekali; akun existing dipertahankan saat recovery.
4. **Selesai** — buka storefront/dashboard. Setup pertama dicabut permanen.

Toko baru mempunyai **0 produk, kategori seller, pelanggan, pesanan, review, voucher,
kampanye flash sale, upload dan kredensial J&T**. Hanya akun admin, peran/izin dan
identitas toko dibuat. Draft Dekorasi Toko mengikuti dashboard; storefront memakai
versi yang dipublikasikan.

Untuk melanjutkan instalasi, jalankan installer dari **exact Git SHA dan mode yang
sama**. Jangan menghapus direktori atau volume. Lihat docs/operations.md.
`--local-test` hanya menerima `localhost`; CA lokal diberi label jelas dan tidak
dianggap sebagai sertifikat HTTPS domain publik.

## Setelah instalasi dan update

Atur rekening, sender email/Resend dan tarif pengiriman menggunakan akun seller.
Pendaftaran pelanggan memerlukan OTP email; checkout memerlukan tarif yang valid.
Halaman selesai tidak menyatakan toko sudah siap menerima transaksi.

```bash
sudo bash update.sh --check
sudo bash update.sh --apply --version 1.0.1
```

Updater membaca **stable GitHub Releases**, memeriksa identitas repository, tag SHA,
digest SHA256 dari GitHub dan seluruh isi paket. Ia menolak perubahan riwayat atau
migrasi yang tidak terbukti kompatibel, meminta konfirmasi versi, menghentikan
penulisan sementara, membuat backup, membangun source terpisah dan memeriksa
kesehatan versi baru. Tidak menjalankan bootstrap admin atau menimpa volume data.

Jika aktivasi gagal, kode/container lama dipulihkan untuk migrasi yang kompatibel.
Migrasi additive yang sudah berjalan tetap ada. Ini **bukan rollback database penuh**;
drift/migrasi gagal memerlukan rekonsiliasi operator sebelum update berikutnya.

- [Operasional dan recovery](docs/operations.md)
- [Release, backup dan pemulihan](docs/updates.md)
- [Pengujian dan pengukuran RAM](docs/testing.md)
- [J&T milik toko](docs/jnt.md)
- [Provenance dan lisensi](docs/provenance.md)

## Pengembangan

Node.js 22, PostgreSQL 16, Python 3.12 untuk installer/updater.

```bash
cd app
npm ci --ignore-scripts
node node_modules/@prisma/engines/scripts/postinstall.js
npx prisma generate
npm run security:prepare
npm run typecheck
npm test
npm run build
```

[Apache-2.0](LICENSE), dengan atribusi dan lisensi komponen pihak ketiga pada
[NOTICE](NOTICE). Tidak mencakup merek atau data produksi toko sumber.
