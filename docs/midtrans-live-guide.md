# Midtrans Snap — konfigurasi dan penggunaan live

Halaman aplikasi: **Pengaturan → Metode Pembayaran → Midtrans**,
`https://hubify.web.id/admin/settings/payment-methods/midtrans`.
Pengubahan konfigurasi memerlukan izin `bank.manage`; pemeriksaan pesanan
oleh staf memerlukan `payment.read`. Setiap instalasi memakai merchant dan key sendiri.

## Kredensial dan aktivasi

1. Buka [dashboard Midtrans](https://dashboard.midtrans.com), pilih **Production**.
2. Buka **Settings → Access Keys**. Merchant ID mengidentifikasi merchant;
   Client Key dipakai script Snap; Server Key mengautentikasi backend.
3. Pada halaman Hubify di atas pilih **Production · dana nyata**. Masukkan
   Merchant ID, Client Key, dan Server Key pada field masing-masing.
   Masukkan key langsung di dashboard; jangan kirim melalui chat atau screenshot.
4. Centang **Aktifkan Midtrans**, lalu **Simpan konfigurasi**. Periksa hasil simpan.
   Key disimpan terenkripsi; pembacaan pengaturan tidak mengembalikan Server Key.
   Field key kosong pada edit mempertahankan key lama untuk merchant/environment
   yang sama. Perubahan merchant atau environment memerlukan kedua key baru.
5. “Konfigurasi tersimpan” bukan bukti bahwa Midtrans menerima kredensial.
   Keabsahannya baru terlihat ketika permintaan transaksi pertama berhasil.
   Tanpa konfigurasi/aktivasi, Midtrans tidak tampil di checkout.
   Sandbox tidak ditawarkan kepada pembeli umum. Key Sandbox dan Production berbeda.

Versi konfigurasi lama dipertahankan untuk tagihan yang telah diterbitkan.
Jika Server Key dirotasi pada Midtrans, simpan key baru pada merchant/environment
yang sama agar rekonsiliasi lama dapat mencoba key pengganti dalam realm tersebut.
Jangan mengganti Merchant ID hanya untuk memperbaiki key salah.

## URL pada dashboard Midtrans

Di **Settings → Configuration**, isi dan simpan:

| Field Midtrans | Nilai Hubify |
| --- | --- |
| Payment Notification URL | `https://hubify.web.id/api/v1/payments/midtrans/notification` |
| Finish Redirect URL | `https://hubify.web.id/payments/midtrans/finish` |
| Unfinished Redirect URL | `https://hubify.web.id/payments/midtrans/finish` |
| Error Redirect URL | `https://hubify.web.id/payments/midtrans/finish` |

Pada tampilan MAP yang mengelompokkan pengaturan Snap, cari **Payment Notification
URL** pada Settings/Configuration dan redirect pada pengaturan Snap. Label field
di atas mengacu dokumentasi resmi; jangan memasukkan URL webhook sebagai redirect.
Hubify juga menyertakan finish callback per token. Redirect hanya menavigasi
pembeli; query redirect dan callback popup tidak melunasi pesanan.

Kanal Snap mengikuti kanal yang benar-benar aktif pada merchant. Periksa aktivasi
kanal di dashboard Midtrans; Hubify tidak memaksa daftar bank/e-wallet tertentu.
Tidak perlu memasukkan rekening transfer manual untuk membayar melalui Snap.

## Pesanan dan pembayaran nyata oleh pemilik toko

1. Login sebagai customer, pilih produk yang stoknya tersedia.
2. Isi alamat, pilih layanan pengiriman, lalu pilih **Midtrans** di checkout.
3. Konfirmasi harga, diskon, ongkir, dan total. Tidak ada kode unik tambahan.
4. Buat pesanan. Pada instruksi pembayaran klik **Bayar sekarang**.
   Backend menyimpan attempt sebelum meminta token Snap. Permintaan ini membuat
   transaksi production; operator tidak melakukannya sebagai smoke test.
5. Pilih kanal yang tersedia di popup resmi Snap dan bayar dengan dana nyata.
   Jika popup gagal dimuat, gunakan **Buka halaman pembayaran** yang menuju URL
   resmi Midtrans dari token yang sama.
6. Kembali ke Hubify. Webhook dan worker mengonfirmasi status dari backend.
   Tidak ada unggah bukti. Gunakan **Cek pembayaran** bila diperlukan; tombol ini
   memeriksa status, bukan menyatakan pembayaran berhasil.

Menutup popup tidak membatalkan pesanan. Buka kembali instruksi dan pilih
**Lanjutkan pembayaran**; token yang sama dipakai. Status terminal provider yang
telah diverifikasi dapat membuka **Mulai percobaan baru**, selama waktu pesanan
masih cukup. Timeout pembuatan token tidak diulang secara buta; tunggu pemeriksaan
dan jangan membuat pembayaran ganda. Tidak ada fallback diam-diam ke manual.

Tagihan memakai batas aplikasi sekitar 20 menit, dengan expiry provider yang
diikat pada waktu server saat pembuatan token. Waktu yang tampil di Snap/kanal
provider bisa lebih pendek karena pembulatan menit. Setelah batas lewat jangan
membayar, walaupun suatu kanal masih menampilkan instruksi. Hubify memeriksa
provider sebelum melepas reservasi; gangguan provider dapat menahan stok lebih
lama sampai status dapat dipastikan.

## Pemeriksaan seller

Di **Pesanan → Detail pesanan → Pembayaran** tersedia nominal, provider order_id,
kanal, status aktual, waktu pemeriksaan, dan tombol **Cek pembayaran**.
Di pengaturan Midtrans tersedia 30 attempt terbaru dengan riwayat webhook/status.
ID transaksi sumber dipetakan ke attempt dan pesanan, bukan nama pembayar.

Cocokkan provider order_id dan nominal dengan transaksi di dashboard Midtrans.
Pembayaran `settlement`, atau kartu `capture` dengan fraud `accept`, melunasi
pesanan melalui transaksi database yang sama dengan komit stok, histori, audit,
dan notifikasi. Klik berulang/webhook duplikat tidak menggandakan efek tersebut.
`pending` belum lunas. Refund/partial refund dan anomali pembayaran masuk dicatat
untuk pemeriksaan; tidak memicu refund otomatis atau menghidupkan pesanan tertutup.

**Pembayaran berhasil berbeda dengan pencairan dana.** Status lunas Hubify
mengikuti transaksi provider. Jadwal payout, saldo merchant, biaya, dan rekening
pencairan mengikuti ketentuan serta dashboard Midtrans.

## Troubleshooting

| Gejala | Langkah |
| --- | --- |
| Key ditolak/environment tertukar | Pilih environment yang benar di kedua dashboard; masukkan kedua key realm yang sama dan simpan. Jangan membagikan key/log mentah. |
| Kanal tidak tampil | Periksa aktivasi kanal merchant pada Midtrans. Kanal dalam proses aktivasi belum tentu tersedia di Snap. |
| Popup gagal | Gunakan URL redirect resmi yang muncul setelah token tersimpan. Periksa pemblokir konten dan koneksi; jangan membayar dua kali. |
| Popup ditutup | Lanjutkan pembayaran yang sama. Penutupan popup tidak membuktikan gagal maupun sukses. |
| Status pending | Lihat transaksi di Midtrans, lalu Cek pembayaran. Pemeriksaan dibatasi frekuensinya; worker tetap berjalan tanpa tab pembeli. |
| GET Status 404 sebelum memilih kanal | Ini dapat terjadi secara normal: transaksi Core belum dibuat dari sesi Snap. Jangan menganggapnya gagal/lunas. |
| Sudah dibayar, Hubify belum lunas | Cocokkan ID/nominal/status di Midtrans; gunakan Cek pembayaran. Periksa riwayat sinkronisasi dan notifikasi webhook Midtrans. Jangan bayar ulang. |
| Webhook gagal/terlambat | Pastikan URL HTTPS publik benar, tidak dilindungi login. Provider retry dan inbox persisten/worker memulihkan status. Selama maintenance endpoint dapat 503 agar provider mencoba lagi. |
| Token/kanal kedaluwarsa | Tunggu rekonsiliasi dan penutupan pesanan. Token baru hanya untuk percobaan yang aman; jangan memakai tagihan lama setelah ditutup. |
| Deny/failure lalu mencoba kanal lain | Attempt yang ditolak dicatat; pesanan tidak langsung dibatalkan. Setelah status terminal dikonfirmasi, gunakan percobaan baru jika waktu masih cukup. |
| Timeout pembuatan Snap | Hasil belum pasti. Sistem tidak menerbitkan token ganda; tunggu rekonsiliasi/expiry dan hubungi seller bila dana sudah terpotong. |
| Dana masuk untuk pesanan tertutup/nominal berbeda | Perlu pemeriksaan seller. Tidak ada pelunasan paksa, pembukaan order, atau refund otomatis. |
| Refund di Midtrans | Riwayat provider dicatat sebagai refund review. Seller merekonsiliasi kasus refund aplikasi; status lama tidak ditimpa menjadi pending. |

Referensi resmi: [integrasi Snap](https://docs.midtrans.com/docs/snap-snap-integration-guide),
[webhook dan signature](https://docs.midtrans.com/docs/https-notification-webhooks),
[GET Status](https://docs.midtrans.com/docs/get-status-api-requests),
[siklus status](https://docs.midtrans.com/docs/transaction-status-cycle),
[expiry dan callback](https://docs.midtrans.com/docs/snap-advanced-feature),
[Production](https://docs.midtrans.com/docs/switching-to-production-mode).
