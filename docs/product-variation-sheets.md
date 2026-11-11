# Audit alur input produk dan sheet variasi

Baseline main f6ce29b03f994f3dc7d3368912737ca1d2aca99b. Branch/worktree khusus codex/product-variation-sheets / product-variation-sheets. Worktree editor, PDP, identity/mail, historical compatibility, dan helper deploy bersih sebelum implementasi. PR terbuka #37 (storefront), #38 (identity/mail, base lama dan juga memuat PDP), #3 (installer/updater) tidak menyentuh editor ini. Tidak mengambil head agent lain.

Brief terbaru menggantikan wizard PR #43 dengan sheet per jenis dan sheet SKU tersendiri. Gambar 1–2 menjadi acuan kartu/sheet; gambar 3 hanya acuan pemilih foto inline, bukan wizard latarnya. Urutan/label tab dan aktif hitam mengikuti revisi tertulis. Pengguna mengonfirmasi tabel ringkas mobile seperti gambar terbaru, menggantikan ketentuan kartu SKU dalam brief sebelumnya. Data pada gambar bukan seed/hardcode aplikasi. Browser/phone chrome tidak menjadi bagian UI aplikasi.

## Audit sumber data dan kontrak

ProductEditor memuat data serialized dari getManagedProduct ke values: field produk, images, optionImages, optionGroups, variants; shipping mempunyai presentasi satuan sendiri dan diserialisasi oleh shippingData. Draft form values tetap satu sumber data untuk ringkasan dan penyimpanan. saveProductAction adalah penyimpanan produk permanen, dengan canonical pricing, Zod, transaksi service, optimistic revision dan idempotency. Publish/archive/delete dan guard keluar tetap memakai jalur existing. Tidak ada autosave.

Foto memakai product-media staging endpoint existing dengan batas JPG/PNG/WebP 4 MB, recovery media/session dan request ID existing. Upload menambah media sementara ke pool form, bukan menyimpan pilihan variasi permanen. Pilihan/mapping foto pada sheet memakai ID opsi stabil. Batal sheet memulihkan snapshot media saat dibuka; opsi/SKU sheet tidak ditulis ke form sampai Save. Media historis tetap dilindungi server.

Generator CustomVariationEditor tetap memakai generateCombinations/combinationKey ID tersortir, suggestSku dan allocateProductSkusAction existing. Kombinasi yang identik mempertahankan record ID, kode SKU, harga, stok dan reservasi. Kombinasi baru mengikuti nilai default existing (harga null mengikuti harga utama, stok 0 bila berizin). Penghapusan/perubahan identitas SKU berstok/berriwayat ditolak. Rename/reorder opsi tidak mengganti ID. Maksimum 3 jenis, 50 opsi per jenis dan 50 kombinasi; hanya satu jenis memiliki foto, transfer perlu konfirmasi. applyBulk hanya menerapkan field terisi ke semua/indeks asli terpilih. Search/filter hanya presentasi dan tidak mereindeks payload.

Produk tunggal tetap memiliki satu SKU internal tanpa kartu Varian 1. Toggle off/jenis terakhir dihapus hanya boleh untuk SKU tidak terlindungi, dengan konfirmasi; SKU pertama dipertahankan, stok tidak digabungkan. Format legacy optionsEnabled=false tetap dipertahankan untuk edit harga/stok saja; perubahan opsi mengadopsi format custom lewat kontrak existing. inventory.read membatasi nilai yang dikirim; inventory.adjust membatasi pengeditan. PDP/cart/checkout/order memakai ID serta pricing/service existing dan tidak diubah.

## Review emil-design-eng

| Before | After | Why |
| --- | --- | --- |
| Informasi Dasar, Media, Harga & Variasi, Pengiriman, Detail | Foto Produk, Informasi Dasar, Detail, Variasi, Pengiriman; produk baru mulai Foto Produk | Urutan pengisian sesuai brief |
| Aktif tab biru | Teks/ikon/garis aktif hitam | Revisi warna pengguna |
| Toggle langsung membuka wizard | Empty state dan Tambah variasi pertama | Seller memulai satu jenis dengan sengaja |
| Semua jenis di satu wizard dua langkah | Edit jenis tertentu dan Harga & Stok langsung, satu sheet/dialog | Tidak memaksa navigasi ke langkah lain |
| Pemilih foto dialog bertumpuk | Panel inline tepat di bawah opsi | Konteks opsi, satu backdrop |
| Edit langsung ke values lalu snapshot cancel | Session sheet sementara; Apply merekonsiliasi dan menulis ke form | Akibat tutup/save jelas |
| Form SKU mobile panjang | Tabel ringkas 4 kolom sesuai konfirmasi terbaru; kode/detail baris dapat dibuka | Mengikuti desain terbaru tanpa menghilangkan kontrol SKU |

Sheet mobile memperhitungkan visualViewport dan safe area, scroll di dalam konten, footer tetap terjangkau. Desktop memakai dialog lebar. Dialog/fokus memakai Radix; konfirmasi destruktif/transfer ditampilkan inline, tanpa lapisan modal kedua. Escape/backdrop/X menawarkan lanjut atau buang draft; upload aktif mengunci penutupan. Escape menutup panel foto/mengakhiri interaksi drag dahulu, sebelum menutup sheet. Entry pointer memakai transition opacity/translate 160ms, panel foto 120ms; entry keyboard dan reduced motion langsung. Tidak memakai transition:all atau delay input.

Dirty sheet diteruskan ke guard beforeunload/link/popstate form, termasuk pada produk tersimpan yang belum mempunyai perubahan form lain. Isian massal yang belum diterapkan tidak dapat disimpan sebagai nilai SKU tanpa sengaja; Reset isian massal hanya mengosongkan resep input, bukan harga/stok yang sudah diterapkan. Audit juga menemukan alokasi SKU mendahului validasi nama/slug kosong: setelah banyak SKU fallback terpakai, pesan bentrok SKU bisa menutupi error nama. Validasi field dasar kini memakai aturan Zod existing sebelum memanggil allocator, lalu membuka Informasi Dasar. Validasi pengiriman memakai konversi/unit/schema existing, kini membuka tab Pengiriman dan menandai input berat/dimensi terkait; payload tetap sama.

## Verifikasi dan penyerahan

| Pemeriksaan lokal Node 22 | Hasil |
| --- | --- |
| npm run typecheck | PASS |
| npm run lint | PASS, 0 error; 38 warning existing (termasuk destructuring metadata di ProductEditor) |
| npm run build | PASS; warning utility easing Tailwind existing |
| npm test | 636 PASS, 3 skipped existing pada Windows; 87 suite PASS / 1 skipped |
| TEST_DATABASE_ENABLED=yes npm test -- tests/database/product-editor-remediation.test.ts | 21 PASS pada database product_editor_test lokal |
| node tests/product-variation-sheets-browser.mjs | 16 kelompok skenario PASS, 0 page error; build produksi lokal, Chrome headless, PostgreSQL 16 lokal product_sheets_test |

Browser memeriksa tab/aktif hitam/default Foto Produk dan alias hash, produk tunggal/save/reopen, validasi nama dan pengiriman membuka field/tab benar, empty state tanpa membuka sheet otomatis, draft sheet/batal/lanjut, pemilih gallery dan upload native inline, kegagalan upload + retry, transfer foto satu jenis, 1–3 jenis/9 kombinasi, bulk semua/terpilih dengan indeks asli ketika search/filter aktif, kode SKU manual, diskon tidak valid, reset resep massal, Save sheet hanya ke form, guard Back/beforeunload, simpan/reopen/rename/reorder mempertahankan ID/harga/stok/foto, proteksi SKU historis, kombinasi baru stok 0, hapus opsi aman, format legacy, empty photo picker, hapus jenis terakhir dengan konfirmasi dan survivor internal, stock readonly dan fokus kembali. Seluruh data/foto di bukti merupakan fixture sintetis.

Viewport 360/390/430/768/1024/1440/1920 tanpa overflow horizontal. Tinggi 500px menguji footer sheet; keyboard, Escape dan reduced motion juga diperiksa. Belum menguji Safari/iOS/Android fisik, keyboard virtual atau gesture sentuh pada perangkat nyata. Tidak membuat pesanan/pembayaran/pengiriman eksternal baru. Tiga unit storage yang skipped merupakan kondisi Windows existing; sumber storage tidak diubah.

Reproduksi: set DATABASE_URL dan DIRECT_URL ke postgresql://postgres@127.0.0.1:5549/product_sheets_test setelah database lokal dibuat dan migrasi existing diterapkan; build app lalu jalankan node tests/product-variation-sheets-browser.mjs dari root. Skrip menolak nama/host database lain, mematikan konfigurasi email eksternal, menyalakan server lokalnya pada 3118, dan menghentikannya di finally. EDITOR_PREVIEW_MODE=dev opsional. Hasil mentah/failure di variation-sheet-evidence diabaikan Git.

## Bukti desain dan perbedaan yang disengaja

- [Empty state mobile](assets/product-variation-sheets/mobile-empty.png), [satu jenis pada form](assets/product-variation-sheets/mobile-one-type.png), [ringkasan mobile](assets/product-variation-sheets/mobile-main.png), [ringkasan desktop](assets/product-variation-sheets/desktop-main.png).
- [Edit jenis mobile](assets/product-variation-sheets/mobile-edit-type.png), [desktop](assets/product-variation-sheets/desktop-edit-type.png).
- [Foto inline](assets/product-variation-sheets/mobile-inline-photo.png), [inline tanpa foto produk](assets/product-variation-sheets/mobile-inline-empty.png).
- [Harga & Stok mobile](assets/product-variation-sheets/stock-390.png), [desktop](assets/product-variation-sheets/stock-1440.png), [hasil browser](assets/product-variation-sheets/browser-result.json).

Urutan/label tab dan warna aktif hitam mengikuti revisi tertulis, berbeda dengan tab lama/biru pada gambar. Tabel mobile mengikuti jawaban pengguna yang mengesampingkan kartu vertikal dalam brief. Browser/iPhone chrome tidak digambar sebagai bagian aplikasi. Foto/harga/SKU/jumlah pilihan bukan contoh hardcode; fixture bukti memakai gambar sintetis. Identitas/shell toko dan font existing dipertahankan. Kode SKU manual/readonly, informasi reservasi dan aksi hapus aman tetap tersedia lewat detail baris mobile atau kolom desktop. Field numerik mobile 16px dan target tombol menjaga akses sentuh. Perubahan ke form dijelaskan di footer, bukan klaim autosave. Capture halaman penuh memakai viewport setinggi konten agar footer sticky tidak menutupi isi bukti; screenshot sheet dan pemeriksaan responsif tetap memakai ukuran viewport yang tercantum.

## Berkas dan integrasi

- product-editor.tsx: urutan/label/default/hash tab, ringkasan, toggle/empty state, snapshot media, Apply session dan guard dirty sheet, navigasi validasi pengiriman.
- product-variation-sheet.tsx (baru): satu sheet/dialog dengan draft lokal per jenis atau SKU, validasi, footer, discard, fokus, viewport/motion. product-variation-dialog.tsx lama dihapus.
- custom-variation-editor.tsx: scope jenis yang dipilih, generator existing, foto inline, konfirmasi inline, stable ID dan prioritas Escape.
- variation-sku-grid.tsx (baru): tabel responsif, pencarian/filter, pilihan memakai indeks sumber, kode SKU dan hak stok.
- product-bulk-editor.tsx: reset resep tanpa mereset hasil draft. variation-editor.css: tab hitam, kartu, sheet dan tabel, safe area/motion.
- tests/product-variation-sheets-browser.mjs, dokumen/bukti ini, dan .gitignore untuk hasil mentah. Backend, API, schema, migrasi, helper deploy, VERSION dan release artifact tidak berubah.

Hanya commit dan Draft PR; tidak merge/deploy. CI tidak diminta, commit memakai [skip ci].

Jika main berubah, rebase task ini terhadap main dan ulangi pemeriksaan terkait. Jangan integrasikan PR #38 secara utuh: base-nya bukan main dan mencakup PDP; pemilik perlu merekonsiliasi baseline terlebih dahulu. Helper deployment yang mematok app tree PR #43 bukan bagian task UI ini dan tidak dilonggarkan.
