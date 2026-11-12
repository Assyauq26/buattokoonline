# Promosi seller — audit dan rencana implementasi

Catatan ini merekam implementasi dan verifikasi commit 6907023. Finalisasi versi v1.8.0, bukti upgrade dan keputusan deployment terbaru tersedia pada [checklist kesiapan rilis](promotions-release-readiness.md).

Baseline: main b4aa626886429a5bd5378270abd6633c8d423ce8, VERSION 1.7.4. Worktree terpisah codex/promotions-refactor. Tidak ada AGENTS.md pada root atau jalur aplikasi; AGENTS.md platform-m1 berada di proyek lain. Desain desktop/mobile dan brief 53ef5437 menjadi acuan. Skill emil-design-eng diterapkan.

| Before | After | Why |
| --- | --- | --- |
| Marketing memuat dua manager panjang sekaligus | Promosi dengan tab dan URL state | Refresh dan navigasi mempertahankan konteks |
| Form kampanye satu langkah | Jadwal, Produk & harga, Tinjau | Validasi dan hierarki sesuai desain |
| Harga kampanye per produk tanpa kuota | Harga/kuota SKU dan snapshot order | Harga variasi dan reservasi harus konsisten |
| Draf memerlukan seluruh data publikasi | Validasi draf terpisah | Draf belum lengkap benar-benar tersimpan |
| Voucher memakai form generik | Form, pratinjau, detail dan status eksplisit | Menghindari status dan field tersembunyi yang ambigu |

## Kontrak existing dan risiko

Single-store: satu database per toko. Actor memerlukan Admin dan permission promosi; produk memerlukan product.read. Campaign memakai lock FlashSaleControl dan waktu start-inclusive/end-exclusive, harga katalog tidak ditimpa. Query pricing dievaluasi saat baca di luar cache; checkout memeriksa ulang signature sebelum transaksi. Saat ini overlap dilarang untuk seluruh kampanye, termasuk produk berbeda; status SCHEDULED tetap ada di database ketika waktu sudah aktif/berakhir. Editor masih membolehkan perubahan kampanye berjalan.

Voucher menggunakan Coupon, kode unik, kuota dihitung dari Order selain CANCELLED/EXPIRED; refund tetap terpakai. Checkout mengunci Coupon sebelum menghitung diskon dan mencatat order. Voucher dapat digabung dengan harga Flash Sale karena diskon dihitung atas subtotal yang sudah diberi harga kampanye. Kebijakan ini dipertahankan dan ditampilkan. Tidak ada lifecycle draf voucher saat ini. Harga FIXED masih dapat membawa maxDiscount tersembunyi dan perlu dinormalisasi.

## Dependency implementasi

1. Tambahan kontrak SKU/kuota dan snapshot order, validasi draf/publikasi, lock kuota dan lifecycle konservatif. Migrasi baru additive; SQL historis tidak berubah.
2. Query daftar dengan pagination/filter URL; detail/riwayat dan tindakan sesuai lifecycle; pemilih produk dengan pilihan sementara lintas pagination.
3. Wizard Flash Sale dan voucher form responsif memakai komponen existing, CSS tema, reduced motion, fokus dan unsaved changes.
4. Pengujian database terisolasi dan jam terkendali: batas waktu, paralelisme stok/kuota/voucher, expiry/cancel/idempotency dan histori; browser 360/390/430/tablet/desktop, build/typecheck/lint, screenshot dan perbandingan desain.

Scope saat ini implementasi/verifikasi lokal. CI dan deployment tidak dijalankan untuk task ini tanpa instruksi yang berlaku. J&T Production pada Hubify tetap aktif; pengujian tidak menyentuh promosi atau transaksi produksi.

## Implementasi

Halaman `/admin/marketing` sekarang menggunakan satu workspace Promosi. Manager lama diganti, bukan dijalankan berdampingan. Filter/pagination masing-masing tab disimpan dalam query URL terpisah. Detail memiliki riwayat dengan pagination. Picker produk memakai satu Radix Dialog, di tengah desktop dan layar penuh mobile; pilihan sementara bertahan lintas halaman dan batal tidak mengubah peserta. Versi editor memakai optimistic revision; request ID baru mencegah draft ganda setelah kegagalan koneksi. Pemulihan sesi browser diikat ke identitas seller, dan ditandai sebagai perubahan belum tersimpan, bukan draft server.

Flash Sale memakai tiga langkah dan harga/kuota per SKU. Nilai massal hanya mengubah input form sampai penyimpanan server. Produk/variasi, status terbit, harga reguler dan stok diperiksa ulang pada transaksi publikasi. Kampanye berjalan tidak dapat diedit; dapat diakhiri tanpa menghitung ulang histori order. Draf belum lengkap disimpan pada JSON non-authoritative. Kolom jadwal lama tetap NOT NULL untuk kompatibilitas skema; placeholder jadwal draft tidak dipakai untuk harga atau ditampilkan sebagai jadwal lengkap.

Untuk kampanye SKU, ringkasan kartu katalog memilih harga SKU yang masih tersedia, termasuk bila harga promo SKU lebih tinggi daripada basePrice produk. Harga awal pembanding berasal dari SKU tersebut. PDP, quick purchase, cart dan Buy Now tetap memakai SKU yang benar; harga ringkasan tidak diwariskan kepada semua variasi. Nilai katalog tersimpan tidak berubah.

Migrasi tambahan `20261112050000_promotion_sku_offers` menambah draft JSON, tabel penawaran SKU dan snapshot `OrderItem.flashOfferId`. Identitas SKU tetap direferensikan. Kuota dihitung dari item pesanan selain CANCELLED/EXPIRED; order pending menahan kuota dan refund tetap dihitung. Checkout mengunci baris penawaran sebelum membaca ulang harga dan membuat order. Tidak ada counter kuota yang direset saat retry atau perubahan payment. Harga reguler tidak ditimpa. Pembaca harga PDP, quick purchase, cart dan Buy Now berbagi helper SKU yang sama; overlay katalog tetap dievaluasi di luar cache metadata.

Voucher mempertahankan kode unik, lock Coupon, minimum belanja dan reservasi berdasarkan order. Diskon nominal mengabaikan cap persentase tersembunyi, termasuk data lama; snapshot order tidak berubah. Limit total/per pelanggan tidak boleh diturunkan di bawah pemakaian yang sudah terikat. Aktivasi voucher habis/expired ditolak. Pratinjau memakai input aktual dan tanggal selalu WIB.

## Perbedaan yang disengaja dari gambar

- Kuota ringkasan produk diberi label **per SKU**, karena tiap variasi dapat memiliki stok berbeda. Harga normal menampilkan rentang bila relevan.
- Overlap tetap mengikuti kontrak database existing: satu kampanye terjadwal pada satu periode toko, termasuk bila SKU berbeda. Jadwal berdampingan diterima. Tidak menghapus exclusion constraint historis.
- Tidak ada tombol “Simpan draf” voucher karena model Coupon belum memiliki lifecycle draft yang terpisah dari nonaktif. Voucher dapat disimpan nonaktif secara eksplisit; tidak ada tombol yang mengaku menyimpan draft server padahal hanya state lokal.
- Produk promo lama memerlukan tindakan eksplisit untuk mengakhiri/menyelesaikan konversi; tidak dipilih atau dikonversi diam-diam.
- Screenshot implementasi memakai produk sintetis, bukan data/foto produksi atau contoh harga pada mockup.

## Batas rilis

Belum di-deploy, merge atau diterbitkan. VERSION masih baseline 1.7.4. `rollback_compatible` ditandai **false**: kode lama tidak memahami kuota SKU dan dapat memakai harga ringkasan produk tanpa kuota. Migrasi skema additive tidak membuat perilaku kode lama otomatis aman. Updater biasa dan helper staging harus tetap menolak; jangan memaksa flag agar lolos. Rilis berikutnya memerlukan review migrasi, backup/restore, rencana aktivasi dan pemulihan operator, serta penetapan versi/rentang kompatibilitas baru. Instalasi Hubify juga memiliki guard checksum historis dan J&T Production aktif; jalur staging lama menolak kondisi tersebut. Tidak ada guard, ledger, migrasi historis atau konfigurasi produksi yang diubah dalam task ini.

## Hasil verifikasi final — 12 November 2026

Seluruh pengujian memakai Node 22.23.4 dan PostgreSQL 16 lokal milik task pada port 5557. Database browser dan database transaksi dipisahkan. Tidak ada request J&T, AWB, pembayaran nyata, email atau kampanye produksi. Fixture browser menampilkan nama/foto sintetis dan bukan data dari desain.

| Pemeriksaan | Hasil |
| --- | --- |
| Unit/regression melalui runner keamanan repository | 637 PASS; 3 SKIP pada Windows, 87 berkas PASS dan 1 SKIP |
| Database terarah melalui runner repository | 21 PASS |
| Browser pada build produksi | 12 kelompok skenario PASS; tidak ada uncaught page error |
| Viewport | 360, 390, 430, 768, 1440 px; halaman konten aktual tanpa overflow dokumen |
| Production build dan TypeScript `tsc --noEmit` | PASS |
| Lint seluruh aplikasi | 0 error, 38 warning existing; lint berkas berubah hanya 2 warning `_value` pada stub kompatibilitas existing |
| Prisma generate dan migrate status | PASS; 30 migrasi, schema lokal up to date |
| Integritas migrasi lama | 29 blob migrasi pada HEAD sama dengan file kerja melalui `git hash-object`; tidak ada perubahan historis |
| Dependency/package lock dan whitespace | Tidak ada perubahan package/dependency; `git diff --check` PASS |

Tes database mencakup draf tidak lengkap, identitas SKU asing, permission sebelum lookup, harga invalid, stok/kuota, pagination backend, jadwal berdampingan dan overlap, start-inclusive/end-exclusive tanpa scheduler, pembatasan edit kampanye berjalan, pengakhiran, dan perubahan produk setelah dipilih. Dua pembeli memperebutkan kuota SKU terakhir, retry order yang sama, expiry stok/kuota tepat sekali, voucher terakhir, batas per pelanggan pada dua intent Buy Now, serta snapshot gabungan Flash Sale/voucher diuji pada transaksi nyata di database lokal. Harga SKU terpilih/tidak terpilih dan harga ringkasan SKU yang tersedia juga diuji.

Browser menjalankan wizard hingga commit server, pemilihan lintas halaman, batal tanpa mutasi, produk belum terbit, detail setelah refresh, persentase/nominal, penghapusan cap tersembunyi, batas total/per pelanggan, salin clipboard, dan aktif/nonaktif voucher. Simulasi request produk terputus menghasilkan error persisten; retry berhasil tanpa kehilangan query atau peserta. Pemulihan sesi dan draf server diuji terpisah. Filter/tab bertahan dalam URL. Escape mengembalikan fokus dan reduced motion mematikan gerakan kontrol. Pemeriksaan screenshot menemukan dan memperbaiki overflow mobile/tablet, menu tindakan voucher yang salah, serta penempatan footer.

Pengujian viewport adalah emulasi Chromium, bukan pengujian pada perangkat fisik atau seluruh browser. Jalur tenant menggunakan arsitektur satu database per toko existing; tes permission/ID dijalankan di database lokal, tanpa membuat tenant produksi lain. Verifikasi CI jarak jauh, installer upgrade/rollback pada VPS dan aktivasi produksi belum dilakukan dalam scope ini.

## Screenshot implementasi

Screenshot diambil dari build produksi lokal pada viewport setara referensi, setelah loading selesai. Shell dashboard, font dan ikon existing dipertahankan. Footer form mobile berada di bawah dengan safe area; menu tindakan berupa bottom sheet dan pemilih produk berupa layar penuh. Daftar desktop memakai tabel, sedangkan editor produk memakai baris grid dengan pengaturan SKU yang dapat dibuka agar variasi berbeda tetap terbaca.

| Desktop | Mobile |
| --- | --- |
| [Daftar kampanye](assets/promotions-refactor/desktop-campaigns.png) | [Produk & harga](assets/promotions-refactor/mobile-products-new.png) |
| [Produk dan SKU](assets/promotions-refactor/desktop-products.png) | [Pemilih produk](assets/promotions-refactor/picker-390.png) |
| [Tinjau kampanye](assets/promotions-refactor/desktop-review.png) | [Daftar voucher](assets/promotions-refactor/vouchers-390.png) |
| [Form dan pratinjau voucher](assets/promotions-refactor/desktop-voucher-form.png) | [Form voucher](assets/promotions-refactor/mobile-voucher-form.png) |
| [Dialog pemilih produk](assets/promotions-refactor/desktop-product-picker.png) | [Tindakan voucher](assets/promotions-refactor/mobile-voucher-actions.png) |

Hasil browser terstruktur: [browser-result.json](assets/promotions-refactor/browser-result.json). Skrip reproduksi ada di `tests/promotions-browser.mjs`; tes transaksi ada di `app/tests/database/promotions-refactor.test.ts`. Kedua skrip menolak target selain database lokal khusus task. Hasil lengkap lint/build dan bukti viewport lain tersedia pada direktori lokal ignored `promotion-evidence`.

## Rencana aktivasi dan pemulihan yang memerlukan review rilis

1. Tetapkan versi baru dan kontrak upgrade pada artifact rilis yang direview. Uji jalur resmi installer/helper untuk migrasi tambahan dan riwayat migrasi Hubify; flag rollback tidak boleh diubah untuk meloloskan gate.
2. Siapkan backup terverifikasi atas database, media, konfigurasi dan metadata aplikasi. Latih pemulihan pasangan database/aplikasi pada lingkungan uji yang disetujui sebelum menyentuh produksi.
3. Gunakan prosedur resmi operator untuk membatasi write selama cutover yang diperlukan, terapkan migrasi tambahan, pasang artifact, lalu verifikasi readiness, harga, cart/checkout dan konfigurasi pengiriman tanpa membuat promosi/pesanan nyata untuk test.
4. Sebelum ada write baru, pemulihan backup hanya boleh dilakukan setelah operator membuktikan tidak ada transaksi baru yang akan hilang. Setelah ada transaksi atau kampanye SKU baru, gunakan perbaikan maju pada kode yang memahami SKU; jangan otomatis menyalakan binary lama atau menghapus tabel/kolom/ledger.

Status implementasi lokal: **terverifikasi dan siap review**. Status deployment/rilis: **NO-GO sampai review operasional di atas selesai dan ada otorisasi deployment terpisah**. Tidak ada PR/CI/deployment yang dibuat otomatis; perubahan disimpan sebagai commit pada branch `codex/promotions-refactor`, tanpa mengubah main atau worktree agent lain.
