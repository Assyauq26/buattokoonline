# Verifikasi carousel Immersive Fashion

Baseline pembanding `2d1e047`. Pengujian berlangsung di build produksi Next.js dengan katalog PostgreSQL lokal. Foto dan nama produk dalam rekaman berasal dari toko uji.

| Bagian | Sebelum | Sesudah |
| --- | --- | --- |
| Arah gerak | Lima posisi tetap pada baseline. Kandidat antara mengaitkan posisi vertikal dan kemiringan kartu dengan sudut drag, sehingga kumpulan kartu terlihat seperti kipas. | Kartu bergerak ke kiri dan kanan pada sisi depan silinder tegak. Titik tengah paling dekat. Sisi kiri dan kanan menghadap ke pusat. |
| Kendali | Posisi berpindah setelah pointer dilepas. | Posisi mengikuti jarak pointer saat disentuh atau ditarik. Setelah dilepas, momentum dibatasi dan geraknya dapat langsung ditangkap kembali. |
| Latar | Foto utuh menunggu kejadian JavaScript untuk ditampilkan. Kunjungan ulang mengirim foto lagi. | HTML awal memuat foto pembuka yang dapat langsung dilukis. Pilihan ukuran mengikuti viewport. Saat berganti produk, foto lama bertahan sampai foto baru dapat ditampilkan. |
| Komposisi | Pengaturan foto koleksi hanya mengubah titik fokus foto utuh. | Seller dapat mengunggah latar bersih dan objek transparan untuk foto pembuka. Posisi dan skala mobile/desktop dapat diubah, dipratinjau, dan direset. |

## Cara gerak

Satu nilai posisi pecahan menggerakkan seluruh kartu. Jarak dari pusat dibungkus sesuai jumlah produk. Posisi horizontal mengikuti sinus, sedangkan kedalaman mengikuti kosinus dikurangi satu. Transformasi menggeser kartu pada X dan Z, lalu memutar wajah kartu pada Y. Tinggi pusat kartu tetap. Perspektif browser mengecilkan kartu yang menjauh. Lebar lintasan, kedalaman, dan batas yaw berbeda pada mobile dan desktop. Titik tengah memiliki yaw serta kedalaman nol. Tidak ada tombol panah horizontal.

Saat disentuh, pergerakan langsung diterapkan pada frame browser berikutnya. Spring teredam bekerja setelah lepas dan dapat diinterupsi. Pergantian foto membutuhkan jarak lebih dari 0,58 interval produk dari indeks yang disorot. Permintaan foto yang selesai terlambat diperiksa terhadap pilihan terbaru. Keyboard aktif saat carousel mendapat fokus. Gestur vertikal memilih koleksi dan pencarian tetap bisa diketik.

## Bukti visual

- [Video sentuhan mobile 390 × 844](mobile.webm) dan [tangkapan layar mobile](mobile.png).
- [Video mouse desktop 1440 × 900](desktop.webm) dan [tangkapan layar desktop](desktop.png).
- [Matriks geometri, ukuran layar, pemeriksaan gambar dan editor](checks.json).

Di kedua video, urutannya adalah tarik pelan, tahan, balik arah, lepas, tangkap kembali, ganti koleksi, lalu lewati batas produk 15 → 1. Setelah berhenti, kartu dibuka dan navigasi kembali diperiksa terhadap URL serta identitas produk. Pada ponsel kartu pusat dan tetangganya mengisi layar. Di desktop kelima kartu dapat terlihat, dengan sisi terluar lebih kecil. Foto, potongan gambar, dan teks di toko sebenarnya bergantung pada isi koleksi. Bukti ini memakai Chromium dengan emulasi sentuhan, tanpa pengukuran frame rate pada ponsel fisik.

## Waktu muat

Tiga kunjungan dengan cache browser kosong, masing-masing langsung diikuti kunjungan ulang. Chrome pada 390 × 844, DPR 2, perlambatan CPU 4×, latensi emulasi 65 ms dan unduhan 640.000 byte/detik. Database, produk dan profil jaringan sama. LCP adalah waktu hingga elemen konten terbesar terlihat. Transfer gambar menjumlahkan `transferSize` seluruh gambar katalog, termasuk header revalidasi.

| Median tiga pengukuran | Baseline | Koreksi |
| --- | ---: | ---: |
| LCP pada cache kosong | 868 ms | 740 ms |
| LCP pada kunjungan ulang | 1.060 ms | 860 ms |
| Transfer gambar pada cache kosong | 178.406 B | 46.908 B |
| Transfer gambar pada kunjungan ulang | 213.602 B | 1.500 B |
| Jumlah permintaan gambar, kosong / ulang | 5 / 6 | 5 / 5 |

Waktu mulai permintaan foto pertama pada cache kosong memiliki median 148 ms sebelum dan 173 ms sesudah. Preload sudah ada di baseline. Perbaikan terukur terutama pada volume transfer dan penyelesaian foto pertama (median 478 → 367 ms). LCP kunjungan pertama setelah proses dimulai meningkat dari 1.476 menjadi 1.752 ms pada pasangan sampel ini. Enam pengukuran per versi belum cukup untuk memprediksi perangkat atau server publik.

[Waterfall sebelum](waterfall-before.json) · [Waterfall sesudah](waterfall-after.json).

## Pemeriksaan kode dan tampilan

- Build produksi, TypeScript dan ESLint terarah. Sebanyak 96 tes lulus dalam tujuh suite untuk tema, editor, konfigurasi dan keranjang.
- Lebar 360, 390, 430, 1280, 1440, dan 1920 px, ditambah 360 × 590 dan 844 × 390. Pemeriksaan mengukur matriks transform browser, kedalaman, orientasi, perspektif, lebar kartu pusat dan overflow.
- Katalog 0, 1, 2 dan 15 produk. Pemeriksaan mencakup batas loop, pembacaan data selanjutnya, tombol panah keyboard, trackpad horizontal, reduced motion, pointercancel, sentuhan ganda, gambar lambat dan gagal.
- Aset editor diuji dengan latar lokal dan objek transparan. Gambar buram ditolak sebagai objek. Preview sandbox, reset posisi, perlindungan aset draf, dan gambar setelah publikasi diperiksa pada database uji. Foto toko yang hanya memiliki satu lapisan tetap memakai foto utuh.

Lihat [implementasi geometri](../../../app/src/components/fashion/orbit.ts), [penanganan drag](../../../app/src/components/fashion/use-orbit.ts), [tampilan katalog](../../../app/src/components/fashion/catalog.tsx) dan [pergantian foto](../../../app/src/components/fashion/cover.tsx).
