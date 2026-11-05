# Toko online single-store

**Satu instalasi = satu toko = satu seller.** Storefront dan dashboard administrator,
diadaptasi dari aplikasi toko [Gheverhan](https://github.com/Assyauq26/Gheverhan).
Nama proyek/sumber tidak digunakan sebagai brand toko baru.

Katalog, kategori, variasi, stok, keranjang, checkout, pesanan, pelanggan, dekorasi,
promosi, review, pembayaran manual dan integrasi J&T berjalan pada server toko.
Tidak ada multi-tenant, control-plane, lisensi aktivasi, pairing VPS, monitoring agent,
auto-update, database bersama, atau koneksi wajib ke BTOS.

## Instalasi

Gunakan **server Ubuntu 24.04 LTS kosong**, RAM minimal 4 GB dan ruang kosong 12 GB.
Domain diarahkan ke server; TCP 80/443 terbuka. Git harus tersedia untuk clone.

```bash
git clone https://github.com/Assyauq26/buattokoonline.git
cd buattokoonline
sudo bash install.sh
```

Installer meminta nama brand/toko, domain, email administrator dashboard, password
tersembunyi dua kali, dan konfirmasi. Password minimal 12 karakter, maksimal 72 byte;
disimpan sebagai bcrypt hash. Kredensial database, sesi dan enkripsi dibuat acak.

Installer membangun aplikasi, menyiapkan PostgreSQL independen, upload persisten,
dan Caddy HTTPS. Buka `https://domain-anda/admin` untuk login dan menambah produk.
HTTPS menunggu DNS valid bila domain belum menunjuk ke server.

Toko baru memiliki **0 produk, kategori seller, pelanggan, pesanan, review, voucher,
kampanye flash sale dan upload**. Logo serta kredensial J&T kosong. Hanya identitas
toko, akun admin dan struktur peran/izin dibuat. Tidak menjalankan seed katalog.

Nama brand dipakai di header, logo teks dan metadata. Perubahan draft Dekorasi Toko
terlihat pada dashboard; storefront memakai versi yang dipublikasikan.

## Setelah instalasi

Atur rekening pembayaran, email transaksional dan pengiriman dengan akun milik toko.
Pendaftaran pelanggan memakai OTP email sehingga memerlukan konfigurasi sender.
Checkout memerlukan tarif pengiriman valid. Tidak ada tarif atau kredensial demo aktif.

- [Operasional, HTTPS, backup dan update manual](docs/operations.md)
- [Konfigurasi J&T toko](docs/jnt.md)
- [Provenance, lisensi dan aset yang dikecualikan](docs/provenance.md)
- [Workflow pengujian Ubuntu](.github/workflows/verify.yml)

## Pengembangan dan tes

Node.js 22, npm, PostgreSQL 16. Source aplikasi terdapat di `app/`.

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

Workflow menjalankan tes unit dan instalasi melalui prompt pada VM Ubuntu disposable,
login admin, tambah produk/foto, publikasi, pemisahan draft brand dan persistensi
setelah restart. Bukti JSON dan screenshot tersedia sebagai artifact workflow.
Sertifikat publik dan transaksi J&T live tidak disimulasikan sebagai berhasil.

## Lisensi

[Apache-2.0](LICENSE) untuk kode proyek, dengan atribusi dan lisensi komponen pihak
ketiga yang dipertahankan dalam [NOTICE](NOTICE). Tidak mencakup merek atau data toko sumber.
