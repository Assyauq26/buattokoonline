# Hubify order fulfillment — v1.6.0

Seller cukup **verifikasi pembayaran → siapkan paket → buat resi**. Penyiapan paket satu kali dan tidak mengulang commit stok/penjualan. Bukti pembayaran dapat diminta perbaikan dengan alasan wajib, tanpa otomatis meminta transfer ulang.

AWB aktif yang belum diterima kurir ditampilkan Menunggu pickup. Cetak AWB hanya mencetak; bukan tahap status atau konfirmasi pickup. UI J&T tidak mensyaratkan pernyataan penyerahan manual. Endpoint handover lama tetap kompatibel dan hanya menyimpan pernyataan seller lama, bukan fakta pickup.

Tracking resmi: 100 pickup/perjalanan, 200 delivered, 401/402 retur, 150–152 kendala. Dokumentasi primer: https://developer.jet.co.id/documentation . Delivered disimpan di shipment/history; completion dicatat terpisah jika tidak ada hold finansial. Kasus aktif, pembayaran, refund, stok dan audit tidak dihapus atau diselesaikan otomatis oleh tracking.

Timer lokal terautentikasi memproses satu shipment jatuh tempo per menit, minimal satu hari antar pemeriksaan. Kapasitas teoritis maksimum 1.440 shipment per hari (dapat lebih rendah jika ada keterlambatan operasional). Shipment selesai dipantau 30 hari sejak pencatatan delivered atau selama kasus aktif; refresh manual tetap tersedia sesudahnya. Tidak ada webhook provider yang dikonfigurasi. Tidak menambah kemampuan pickup/webhook yang tidak terverifikasi.

Event memakai waktu kejadian provider dan audit penerimaan baru. Respons lama/pengganti, duplikat dan hasil tidak pasti ditangani secara konservatif. Create/cancel tetap berizin, terikat snapshot carrier historis, intent durable dan identitas order asli. Timeout tidak boleh diulang sebagai create baru.

AWB lokal mendukung 100 × 150 dan 75 × 150 mm, Code 128 dan QR, routing code respons J&T dan NON COD untuk transfer. Cetak ulang tidak mengirim Create Order. Pembatalan resi dan transaksi/refund tetap terpisah.

Tidak ada SQL atau perubahan dependency. Kompatibilitas/mapping lama, batas worker, pengujian dan rollback dijelaskan pada [laporan v1.6.0](v1.6.0-release.md).
