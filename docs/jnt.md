# Pengaturan pengiriman toko

Buka **Pengiriman → Pengaturan Pengiriman** dengan akun Admin yang memiliki izin
`shipping.update`. Setiap instalasi mempunyai database sendiri dan tepat satu
metode checkout. Instalasi baru dan hasil migrasi dimulai dengan Manual tanpa
tarif. Tetapkan ongkir flat dalam rupiah bulat dari Rp0 sampai Rp100.000.000.
Tarif dikenakan sekali per pesanan. Checkout menolak pesanan sebelum tarif
ditetapkan. Rp0 mengaktifkan gratis ongkir secara eksplisit.

## Konfigurasi J&T Express API

1. Pilih Sandbox atau Production dan masukkan empat konfigurasi dari dashboard
   J&T. Gunakan URL HTTPS lengkap, termasuk path. Konfirmasi dengan J&T sebelum
   memilih kredensial Order yang sama untuk Cancellation.
2. Unggah mapping yang diberikan atau dikonfirmasi J&T untuk toko. Pilih sheet
   dan baris header bila diperlukan. Petakan provinsi, kabupaten/kota, kecamatan
   serta lima kode carrier secara terpisah. Kode kecamatan internal opsional
   harus konsisten dengan nama hierarki. Aplikasi mencocokkan hierarki lengkap
   dengan snapshot Emsifa dan mempertahankan penulisan kode carrier.
3. Validasi file dan perbaiki baris yang gagal. Pratinjau hanya membaca file.
   Stage menyimpan file secara privat, checksum SHA-256, metadata, versi, laporan
   dan baris yang telah lulus. Aktivasi mapping adalah tindakan terpisah. Pilih
   versi terdahulu yang masih valid untuk rollback. Penggantian versi diperiksa
   terhadap gudang tersimpan dan memerlukan Manual aktif. Sesudah penggantian,
   jalankan ulang tes tarif sebelum mengaktifkan J&T.
4. Pilih kecamatan gudang dari mapping aktif, isi nama, kontak, telepon dan
   alamat detail. Masukkan referensi persetujuan layanan EZ dan masa berlakunya.
5. Uji draft sebelum menyimpan. Cek tarif mengirim permintaan read-only dengan
   asal gudang, kecamatan tujuan, berat dan layanan EZ. Tracking memerlukan resi
   sah milik toko beserta konfirmasi izin penggunaannya. Order dan Cancellation
   hanya memvalidasi konfigurasi karena kontrak publik tidak menetapkan probe
   autentikasi aman. Tes tidak mengirim permintaan pembuatan atau pembatalan AWB.
6. Simpan konfigurasi dan lihat checklist aktivasi. Bukti cek tarif berlaku
   selama 24 jam untuk aktivasi dan terikat pada konfigurasi, environment,
   gudang dan versi mapping. Perubahan draft tidak memindahkan metode aktif.
   Aktifkan J&T melalui tombol terpisah setelah semua syarat lulus.

Batas file adalah 2 MiB, 12.000 baris data dan 40 kolom. XLSX dibatasi 12 sheet,
128 entri ZIP, dan 16 MiB ukuran dekompresi total. File formula pada sheet yang
dipilih, file macro dan tautan eksternal ditolak. Pilih pemisah koma atau titik
koma untuk CSV UTF-8. Laporan menampilkan jumlah masalah dan hingga 100 nomor
baris. Semua baris harus lulus sebelum versi dapat disimpan. Sebanyak 25 versi
dapat disimpan per instalasi. Data sintetis di test suite hanya untuk pengujian.

Kode `sendSiteCode` dan `destAreaCode` berasal dari kolom cek tarif. Kode
`origin_code`, `destination_code`, dan `receiver_area` berasal dari kolom
Order. Kode yang kurang atau wilayah ambigu perlu dikonfirmasi ke J&T. CLI
lama `app/scripts/jnt/reconcile-l3.mjs` masih tersedia untuk membaca dan
merekonsiliasi arsip delapan kolom. Versi CLI tersebut belum memiliki lima kode
yang diperlukan untuk aktivasi checkout dari dashboard.

## Konfigurasi server

- `JNT_INTEGRATION_ENCRYPTION_KEY` harus berupa 32 byte acak dalam Base64.
  Simpan sebagai secret instalasi. Ciphertext konfigurasi dan revisi pesanan
  memakai AES-256-GCM dengan pengikatan environment. Rotasi kunci memerlukan
  migrasi ciphertext termasuk revisi historis dan backup yang relevan.
- `JWT_SECRET` menandatangani quote checkout dan bukti uji tarif. Pertahankan
  nilai ini antar-restart. Rotasi membatalkan quote dan bukti uji terdahulu.
- `JNT_API_ENV=sandbox` atau `production` menentukan environment carrier yang
  diizinkan untuk checkout dan fulfillment. `JNT_SANDBOX_API_APPROVED=yes`
  juga dapat mengizinkan uji read-only Sandbox saat environment checkout lain
  dipilih. Production memerlukan onboarding resmi dan
  `JNT_PRODUCTION_API_APPROVED=yes`.
- Gunakan daftar URL bawaan yang sudah ada jika sesuai dashboard seller. Untuk
  varian akun yang dikonfirmasi langsung oleh J&T, operator dapat memasukkan
  URL lengkap dalam `JNT_REVIEWED_ENDPOINTS_JSON`, berupa objek dengan kunci
  environment `sandbox` atau `production` dan kunci endpoint `order`,
  `tariff`, `tracking`, atau `cancellation`. Nama host seller tidak pernah
  otomatis masuk allowlist. Transport menolak alamat DNS privat dan redirect.
- Pembuatan AWB dari pesanan lunas tetap memerlukan
  `JNT_ENABLE_ORDER_CREATE=yes` dan, untuk Production,
  `JNT_PRODUCTION_ORDER_APPROVED=yes`. Pembatalan memerlukan
  `JNT_ENABLE_CANCELLATION=yes`. Tindakan tersebut tersedia hanya melalui alur
  order yang berizin. Rekonsiliasi status `UNKNOWN` ke J&T sebelum percobaan
  berikutnya. Tinjau dan rotasi kredensial yang pernah tampak di screenshot
  jika masih aktif.

Tarif sukses mengikuti kontrak publik J&T. Respons resmi mencantumkan nilai
tarif lokal dan tidak mendefinisikan field mata uang atau signature respons.
Jika field mata uang dikirim, nilai yang diterima hanya IDR. Sistem menolak
respons kosong, tarif tidak valid dan biaya J&T nol.

[Dokumentasi integrasi J&T Express Indonesia](https://developer.jet.co.id/documentation)

## Migrasi dan rollback

Migrasi `20261105100000_shipping_settings` membuat pengaturan Manual,
metadata import dan revisi checkout J&T. Migrasi mengambil salinan terenkripsi
dari konfigurasi aktif lama dan menyimpan referensi mapping lama jika tersedia.
Pesanan baru menyimpan metode, layanan, ongkir, dan referensi revisi J&T.
Fulfillment pesanan tersebut membaca revisi yang direkam saat checkout.
Pencabutan kredensial lama atau perubahan izin environment di server dapat
menahan fulfillment historis dan memerlukan rekonsiliasi operator.

Terapkan migrasi pada database pengujian dahulu dan buat backup sebelum
cutover. Aturan SQL otomatis pada updater dan workflow Hubify saat ini
memerlukan review operator untuk migrasi ini. Gunakan database preview yang
terpisah dengan data sintetis dan gate Production dinonaktifkan. Jalankan
`npm run db:migrate` menggunakan koneksi owner setelah review dan periksa
hak akses role runtime. Atur tarif Manual sebelum membuka checkout.

Rollback metode atau mapping dapat dilakukan di dashboard sesuai langkah di
atas. Untuk rollback kode, pertahankan tabel/kolom additive dan backup
database. Jeda operasi carrier, rekonsiliasi pesanan yang dibuat oleh versi ini,
dan pastikan konfigurasi yang digunakan oleh kode lama sesuai sebelum membuka
lagi checkout. Kode lama membaca tarif dari environment dan belum memahami
revisi checkout baru. Jalankan restore database hanya sesuai keputusan operator
dan prosedur recovery toko.
