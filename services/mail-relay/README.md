# Relay Email & OTP

Relay berjalan di infrastruktur operator tepercaya. Resend tetap memakai
pengirim **otp@buattokosendiri.web.id**. OTP dan notifikasi seller memakai
**Buattokosendiri**, sedangkan registrasi, reset password dan email uji
customer memakai nama branding toko yang dipublikasikan.

## Runtime operator

- Jalankan dengan Node 22.13+ atau build dari root repositori dengan
  docker build -f services/mail-relay/Dockerfile .
- Siapkan RESEND_API_KEY yang sudah diotorisasi untuk domain tersebut,
  MAIL_RELAY_REGISTRY (path JSON), dan MAIL_RELAY_DB (path SQLite persisten).
  Batasi akses file dan volume untuk proses relay. Jangan masukkan key, daftar
  alamat seller atau token ke Git. Nonaktifkan pelacakan klik untuk email
  autentikasi karena tautan reset memuat token sekali pakai.
- Proxy HTTPS hanya untuk POST /api/platform/store-mail pada
  buattokosendiri.web.id. Bind default 127.0.0.1:8092. Jika proxy Docker
  terpisah, gunakan MAIL_RELAY_BIND=0.0.0.0 hanya di bridge privat yang
  dibagikan dengan proxy dan jangan publish port relay. Jangan log body,
  Authorization, atau query tautan reset di proxy.
- Registry adalah array objek origin HTTPS persis, brand, tokenHash dan
  sellerEmails. Operator memverifikasi kontrol toko dan identitas brand
  sebelum memasukkan registry. Hasilkan token 32 byte acak unik per toko,
  simpan SHA-256 token heksadesimal di registry, dan kirim token mentah
  hanya ke operator toko melalui kanal rahasia.
- Simpan token itu pada runtime toko sebagai STORE_MAIL_RELAY_TOKEN. Installer
  tidak mengisi key Resend atau token. Rotasi token per toko tanpa rotasi
  key platform. Registry dibaca pada tiap permintaan dan dapat diperbarui
  secara atomik. Hapus entri untuk mencabut akses.
- Untuk uji terbatas, set `MAIL_RELAY_REQUIRE_CUSTOMER_ALLOWLIST=1` dan
  isi `customerEmails` dengan daftar penerima yang diotorisasi. Konfigurasi
  tanpa daftar customer ditolak dalam mode ini. Email uji dashboard harus
  memenuhi daftar seller dan customer.
- Jika branding publik berubah, sinkronkan brand di registry. Daftar
  sellerEmails harus berisi akun dashboard yang diizinkan menerima OTP
  seller, notifikasi dan email uji. Pengiriman ditolak bila identitas
  toko berbeda atau alamat seller belum diotorisasi.
- STORE_MAIL_MODE=operator-direct bersama RESEND_API_KEY tersedia untuk
  deployment tepercaya yang dikelola operator. Jangan pakai mode ini pada
  VPS seller. Hapus konfigurasi PASSWORD_RESET_FROM lama setelah migrasi.
  Reset customer membentuk URL dari APP_ORIGIN yang sudah divalidasi.

## Batas dan verifikasi

Relay hanya menerima tujuan email yang sudah ditetapkan. Token terikat
ke satu origin dan branding yang disetujui. Seller/test dibatasi ke daftar
email seller per toko. Relay menyusun sendiri URL reset, subject, HTML,
dan alamat pengirim. VPS yang diambil alih tetap dapat meminta email
customer sesuai kuota tokonya; rotasi token jika terjadi penyalahgunaan.

SQLite mencatat kuota per toko, penerima, pengiriman uji dan global dalam
transaksi. Batas awal 30 email/toko/jam, 10 email/penerima/jam, 3 email uji
per toko/jam, dan batas global 40/menit serta 150/jam. Penerimaan provider
berbeda dari keberhasilan email masuk ke kotak surat. Jika relay tidak
tersedia, autentikasi berbasis password tetap dapat digunakan.

Jalankan node --test services/mail-relay/relay.integration.test.mjs untuk
uji HTTP, SQLite, dan provider palsu. Sebelum go-live uji di toko berizin
dengan Resend sungguhan, cek From di kotak masuk, registrasi customer,
reset seller/customer, replay, expiry, dan pencabutan sesi. Uji tombol
Email & OTP dari akun dashboard yang diotorisasi. Pertahankan rilis lama
sampai jalur relay baru terverifikasi. Rollback aplikasi dan routing
relay dilakukan terpisah; tidak ada migrasi database toko.
