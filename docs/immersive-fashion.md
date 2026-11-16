# Immersive Fashion

Tema opsional untuk instalasi single-store. Kandidat berangkat dari `8fb8607` (v1.9.1). Versi aplikasi, konfigurasi pengiriman dan kanal pembaruan seller berada di luar perubahan ini.

## Cara seller menggunakan tema

1. Buka **Dekorasi Toko → Tema → Immersive Fashion** di `/admin/customize`.
2. Pilih logo atau nama toko di kontrol identitas. Logo terang akan lebih terbaca di atas foto. Di tab Tema, buka setiap koleksi untuk mengatur judul, deskripsi, sumber, urutan dan titik fokus mobile/desktop. Sampul opsional menerima path gambar produk terbit dari instalasi ini, misalnya `/api/v1/product-images/<id>`. Bila kosong, latar memakai foto produk aktif.
3. Untuk koleksi manual, tandai produk sebagai unggulan di editor produk. Koleksi kategori memakai slug kategori. Produk terbaru diurutkan berdasarkan waktu pembuatan produk terbit, dengan ID sebagai pembeda jika waktunya sama. Terlaris menjumlahkan **unit** pada item pesanan berstatus pembayaran PAID yang masih terkait dengan SKU produk terbit. Pesanan dibatalkan, kedaluwarsa, atau direfund dikecualikan. Sumber Flash Sale mengikuti waktu dan kelayakan dari service promosi.
4. Pilih lebar preview **390px**, **768px** atau **1360px**. **Simpan Draft** mempertahankan perubahan untuk editor. Pengunjung melihat konfigurasi terbit. Pilih **Terbitkan** untuk mengganti tampilan toko.
5. Untuk kembali, buka **Riwayat**, pilih revisi yang dikehendaki lalu **Rollback**. Jika editor lain telah menerbitkan perubahan, muat revisi terbaru sebelum mencoba lagi. Rollback menulis revisi tampilan. Riwayat pembelian, keranjang dan persediaan tetap berada di database transaksi.

## Audit, arsitektur dan urutan implementasi

| Tahap | Titik integrasi | Hasil |
| --- | --- | --- |
| M0–M1 | Appearance V1, runtime token, layout storefront dan checkout | ID `immersive-fashion` dan koleksi berupa field JSON opsional. Instalasi tanpa pilihan ini merender tema sebelumnya. Tidak perlu migrasi SQL. |
| M2 | `modules/catalog/fashion-catalog.ts`, `components/fashion/catalog.tsx`, halaman search | Katalog fullscreen berisi tautan produk asli. Setiap permintaan mengirim paling banyak lima kartu berbeda. Data dimuat per halaman 12. Status favorit terbatas pada pengguna dan produk terlihat. |
| M3 | `product/[slug]`, galeri, pemilih SKU, purchase panel | Foto, varian, stok, harga, tambah ke keranjang dan beli langsung menggunakan domain produk existing. |
| M4 | Wishlist, CartClient, cart service | Grid favorit, pemilihan SKU, ubah variasi dan jumlah. Badge memakai jumlah unit keranjang. Ringkasan memakai baris eligible yang dipilih. |
| M5 | CheckoutClient, checkout action, preview API, createOrder | Pilihan baris ikut dalam konfirmasi harga, kuotasi pengiriman dan idempotensi pesanan. Server membaca ulang keranjang pemilik di dalam transaksi. Checkout mengonsumsi hanya baris yang dibeli. |
| M6 | Auth layout, profil, alamat, keamanan, pesanan dan resolusi | Menggunakan sesi, OTP, status pembayaran, timeline dan ketentuan pengembalian dari domain semula. |
| M7 | Editor, server action preview, publish/rollback | Preview membutuhkan izin backoffice, iframe baca-saja, noindex dan no-store. Pemeriksaan versi draf/terbit dan transaksi publish dipakai bersama tema lain. |
| M8 | Fixture PostgreSQL dan browser Chromium lokal | Lihat matriks verifikasi di bawah. |

### Peta route dan shell

| Route | Alur dan komponen bersama | Navigasi mobile |
| --- | --- | --- |
| `/`, `/?koleksi=…&posisi=…` | Pilih koleksi, geser produk, buka detail, kembali ke posisi logis. Canonical beranda tunggal. | Menu, brand, Wishlist dan empat item bawah |
| `/shop`, kategori, `/search`, `/wishlist` | Katalog tanpa filter mengarah ke beranda fullscreen. Daftar berfilter, saran pencarian, favorit dan quick-add menggunakan data katalog. | Kembali, brand, Wishlist dan empat item bawah |
| `/product/[slug]` | Galeri, informasi, SKU, harga, jumlah, keranjang atau intent beli langsung. | Footer pembelian |
| `/cart` | Ubah SKU/jumlah/pilihan, baca total, checkout. Keranjang tamu mengikuti kebijakan login existing. | Footer total dan Checkout |
| `/checkout`, `/checkout/payment/[id]` | Alamat, layanan pengiriman, voucher, pembayaran, nominal dan status dari server. | Tindakan checkout/pembayaran |
| `/login`, `/register`, `/whatsapp`, pemulihan akun | Form auth, tujuan kembali, verifikasi sesuai konfigurasi tenant. | Ruang untuk keyboard dan form |
| `/account`, profil, alamat, keamanan, hapus akun | Identitas, menu akun dan edit data pemilik. | Navigasi bawah pada halaman utama Profil |
| `/orders`, detail, tracking dan resolution | Status, tindakan eligible, bukti/refund, timeline. | Tombol kembali dan tindakan pesanan |
| `/admin/customize` | Editor di dashboard seller. Preview menggunakan iframe terpisah. | Shell dashboard seller |

Urutan navigasi bawah adalah **Beranda · Search · Keranjang · Profil**. Header desktop tetap menyediakan Search, Wishlist, Keranjang dan Profil. Header mobile menempatkan Wishlist global di kanan. Tombol hati pada produk memutasi favorit produk tersebut.

### Review UI

| Before | After | Why |
| --- | --- | --- |
| Beranda berupa blok katalog dan grid. | Foto aktif memenuhi viewport, kartu tengah lebih besar, sisi mengikuti lengkungan, posisi dan koleksi terlihat. | Pembeli bisa menjelajah satu produk lalu kembali ke titik semula. |
| Navigasi dan palet storefront generik. | Latar charcoal, judul serif editorial, kontrol sans-serif, tombol primer putih, garis tipis. Brand berasal dari konfigurasi toko. | Kontrol terbaca pada latar foto dan pada halaman transaksi. |
| Layar kecil memakai pola navigasi umum. | Header mobile berisi menu/kembali, brand dan Wishlist. Footer tugas menggantikan navigasi bawah selama pembelian. | Tindakan pembelian dan navigasi tidak saling menutup. |
| Keranjang mengirim seluruh isinya ke checkout. | Pembeli memilih baris dan mengubah variasi. Server memvalidasi kepemilikan, harga dan stok saat submit. | Pilihan di layar sesuai dengan isi pesanan yang tersimpan. |
| Editor tema menampilkan contoh generik. | Preview Immersive Fashion memakai koleksi dan produk nyata instalasi. | Seller dapat menilai komposisi judul, foto dan titik fokus sebelum menerbitkan. |

Token utama menggunakan charcoal `#191817`, ivory `#faf9f6`, divider terang transparan dan judul Georgia dengan fallback serif. CSS khusus berada di `components/fashion/fashion.css`. Gambar produk tetap dilayani storage existing. Interaksi menghormati reduced motion, safe area dan zoom. Pada layar pendek konten boleh digulir. Kartu samping dapat diketuk, carousel menerima tombol panah keyboard. Tidak ada autoplay atau penangkapan wheel global.

### Matriks verifikasi lokal

Pengujian memakai build produksi Next.js, Chromium, PostgreSQL terisolasi, 15 produk sintetis, dua akun uji dengan peran berbeda, tarif dan rekening simulasi. Seluruh interaksi browser berlangsung di loopback HTTPS. Untuk mengulang pemeriksaan transaksi, gunakan instalasi uji yang memiliki dua baris keranjang, dua SKU pada satu produk, alamat valid, metode pembayaran dan ongkir lokal.

| Pemeriksaan | Bukti yang diamati |
| --- | --- |
| Tema lama, draf, penerbitan, rollback | Sebelum terbit, guest melihat tema klasik dan seller melihat produk sebenarnya pada iframe. Guest tidak dapat mengakses preview. Publikasi dari versi lama ditolak dengan HTTP 409. Setelah rollback, tema klasik muncul dan pesanan uji masih tersimpan. |
| Ukuran layar | Potret 360×800, 390×844, 430×932 dan 768×1024. Desktop 1280×800, 1440×900 dan 1920×1080. Layar pendek 360×590 dan landscape 844×390. Tidak ada overflow horizontal dokumen pada katalog. |
| Katalog dan interaksi | Drag horizontal, swipe vertikal berpindah koleksi, gerak diagonal, tap setelah drag, keyboard, reduced motion, pindah koleksi, posisi 13 dari 15 dan kembali dari detail. Emulasi mobile dengan CPU diperlambat 4×, gambar ditunda, lalu pemuatan gambar ditolak. Pilihan terakhir mengendalikan latar dan kontrol tetap dapat digunakan saat gambar gagal. |
| Pencarian, favorit dan SKU | Saran setelah mengetik, hasil pencarian dan navigasi ke PDP. Foto muncul pada variasi yang memiliki gambar. Pemilihan SKU melalui Wishlist dan PDP menambah barang setelah konfirmasi server. Beli sekarang membawa warna dan jumlah terpilih ke checkout langsung. Isi keranjang diperiksa sebelum dan sesudah tindakan tersebut. URL produk yang tidak tersedia menampilkan jalan kembali ke katalog. |
| Konsistensi checkout | Ubah jumlah dan variasi, pilih satu dari dua baris, cek ongkir dan nominal akhir. Perubahan harga serta stok habis ditolak saat submit. Jumlah pesanan tidak bertambah pada kedua kegagalan. Pesanan valid berisi satu baris dan baris lainnya tetap di keranjang. Dua penambahan keranjang serentak menghasilkan dua unit tambahan. |
| Akun dan akses | Guest ditolak saat membaca pesanan privat. Setelah login lewat form, pembeli kembali ke checkout dengan baris terpilih. Profil, alamat, keamanan, daftar/detail pesanan serta halaman daftar/pemulihan tampil pada shell yang sesuai. Tes unit juga memeriksa bahwa token instalasi A ditolak instalasi B. |
| Pembayaran dan purnajual | Pembayaran manual menunggu, pesanan kedaluwarsa, timeline tracking sintetis, status transfer refund yang dicatat seller, dan navigasi ke halaman resolusi. Tidak ada transaksi dengan penyedia eksternal. |
| Pemeriksaan kode | Build produksi dan typecheck lulus. 175 tes dalam 18 suite lulus. Lint terarah mencatat satu peringatan terkait gambar di halaman checkout dan nol error. |

[Alur mobile](immersive-fashion/mobile.webp) · [Alur desktop](immersive-fashion/desktop.webp) · [Sembilan viewport katalog](immersive-fashion/catalog-viewports.webp) · [Preview di editor seller](immersive-fashion/seller-preview.webp)

Tangkapan layar memuat data sintetis saat runtime. Jumlah kartu mengikuti isi koleksi. Desktop dan mobile menggunakan crop yang berbeda, sehingga pilihan foto serta focal point seller memengaruhi komposisi akhir. Pada layar pendek, area transaksi dapat digulir dan footer tindakan tetap terjangkau. Pengujian perangkat memakai emulasi Chromium. Pengiriman OTP melalui operator, pembayaran gateway live dan pengiriman paket nyata berada di luar pengujian ini.

### Batas operasional

Instalasi toko memiliki database sendiri. Konfigurasi, revision, produk, keranjang, akun dan pesanan dibaca dari instalasi saat ini. Hanya informasi terbit yang dapat di-cache publik. Aset kampanye, credential, callback, worker pembayaran dan integrasi J&T memakai mekanisme existing. Tampilan eksternal pada halaman penyedia pembayaran dikelola penyedia.

Foto dan data toko “Atelier QA” pada screenshot adalah fixture lokal. File tersebut, sesi QA, alamat contoh dan pesanan simulasi tidak dikemas dalam aplikasi.
