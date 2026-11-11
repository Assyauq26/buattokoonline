# Audit dan refactor Harga & Variasi — dua langkah

Baseline main/v1.7.3 b8b33ebecec3f1c9798b7148f0f407da142afb46. Worktree khusus product-variation-two-step, branch codex/product-variation-two-step. Worktree produk/PDP/identity/compatibility yang diperiksa bersih. PR 37 mengubah storefront, PR 38 identity/mail; tidak ada overlap langsung pada product-editor/custom-variation-editor. Tidak mengintegrasikan head agent lain. Jika ada perubahan baru pada file ini, review/rebase terhadap main setelah task UI terpisah, jangan cherry-pick branch agent.

## Alur dan invariants

ProductEditor memuat ProductEditorData dari getManagedProduct, menaruh field/foto/optionGroups/variants pada values. CustomVariationEditor mengedit immutable values melalui onChange; generator memakai combinationKey ID tersortir dan mempertahankan objek SKU existing, harga dan stok. allocateProductSkusAction hanya mencari bentrok kode, bukan menyimpan produk. ProductBulkEditor memakai applyBulk dan hanya menerapkan field terisi ke draft semua/terpilih. saveProductAction adalah titik permanen: canonical pricing → Zod → transaksi serializable product-management service → inventory adjustment dengan expectedOnHand/reservasi dan receipt idempotency → reload serialize. Satu SKU internal untuk simple tetap wajib. SKU stok/riwayat/cart/order terlindungi; rename/reorder opsi tidak mengganti ID. Foto satu grup, ownership staged-media dan gambar historis tetap divalidasi server.

Tidak ada autosave produk. Upload menyimpan media sementara melalui endpoint existing, berbeda dengan menyimpan produk. Simpan variasi pada desain baru hanya menutup editor dengan draft diterapkan; Simpan Perubahan/Simpan Draft/Terbitkan tetap operasi server existing. Batal memulihkan snapshot variasi/foto opsi sejak editor dibuka, dengan konfirmasi bila berubah. Tombol kembali antarlangkah tidak mengembalikan snapshot. Navigasi keluar masih memakai guard formulir existing.

Legacy multi-SKU memakai optionsEnabled=false tetapi mempunyai opsi/selection ID deterministik hasil serialize/backfill. UI membedakannya dari simple. Edit harga/stok saja mempertahankan format legacy dan optionsEnabled=false. Hanya perubahan struktur/nama/urutan/foto opsi yang mengadopsi format custom melalui API existing; ID, kode dan label raw SKU existing dipertahankan, dan server tetap menolak perubahan identitas SKU historis. Membuka atau membatalkan editor tidak mengadopsi/mengubah data permanen.

Konsumen data tetap sama: purchase-options/catalog membaca opsi dan harga canonical untuk PDP; cart menyimpan ID SKU dan menghitung harga terbaru; checkout/inventory melakukan reservasi; order menyimpan snapshot historis. Refactor tidak menyentuh jalur ini. Hak inventory.read menentukan apakah nilai stok dikirim; inventory.adjust menentukan apakah input dapat diedit. Harga kosong tetap mewarisi harga utama, diskon harus lebih rendah, SKU baru stok 0, maksimum 3 grup/50 kombinasi, SKU berstok/berriwayat tidak boleh dihapus atau diganti identitasnya. Publikasi tetap memakai readiness existing dan versi optimistic concurrency; submit produk memakai lock serta receipt idempotency existing.

Input massal mempunyai state isian lokal, tetapi hasilnya hanya ditulis ke values lewat applyBulk setelah tombol Terapkan ke SKU. State ini tetap mounted saat Back/Next; tutup dan Simpan variasi meminta konfirmasi bila isian belum diterapkan. Upload gambar hanya menambah media sementara; mapping opsi menunggu Gunakan gambar. Batal di pemilih gambar mempertahankan mapping sebelumnya.

## Review desain (emil-design-eng)

| Before | After | Why |
| --- | --- | --- |
| Opsi dan seluruh SKU panjang pada halaman | Ringkasan harga, grup/foto dan jumlah SKU | Halaman utama mudah dipindai |
| Editor inline tanpa langkah | Dialog desktop lapang; mobile full screen; Opsi → Harga & Stok | Menjaga konteks dan target sentuh |
| Tidak ada tab produk | Lima tab dengan panel tetap mounted | Draft tidak hilang saat pindah tab |
| Tombol generator terpisah | Lanjut merekonsiliasi memakai generator yang sama | Kombinasi baru/lama konsisten |
| Save state dan save permanen berpotensi tertukar | Penjelasan draft dekat footer dan tombol produk permanen | Tidak mengklaim autosave |

Risiko utama: state modal yang terduplikasi, data harga hilang saat Back, selection berbasis indeks setelah reorder, nested dialog foto/konfirmasi, error menargetkan field di panel tersembunyi, dan draft stock belum generated. Solusi memakai values tunggal, snapshot hanya untuk cancel, ID kombinasi existing, satu instance editor untuk dua langkah, ref rekonsiliasi existing, pengungkapan panel error sebelum fokus. Tidak mengubah API, service, schema, SQL, storefront atau deployment.

## Verifikasi

Node 22, PostgreSQL 16 lokal; browser Chrome headless memakai build produksi Next, port 3117 dan database terisolasi product_variation_test. Seluruh data/foto di bukti adalah fixture sintetis, bukan data pengguna atau produksi. Tidak mengakses/mengubah VPS.

| Pemeriksaan | Hasil |
| --- | --- |
| npm run typecheck | PASS |
| npm run lint | PASS, 0 error; 38 warning existing, termasuk destructuring metadata ProductEditor yang sudah ada |
| npm run build | PASS; warning Tailwind existing tentang utility easing |
| npm test | 636 PASS, 3 skipped existing pada Windows; 87 suite PASS, 1 skipped |
| TEST_DATABASE_ENABLED=yes npm test -- tests/database/product-editor-remediation.test.ts | 21 PASS pada product_editor_test lokal; stok/reservasi, idempotency, akses, harga keranjang, data legacy/custom |
| node tests/product-variation-two-step-browser.mjs | 20 skenario PASS, 0 page error; hasil akhir dan screenshot di assets di bawah |

Browser mencakup produk baru/simple dan reopen, satu sampai tiga jenis variasi, gallery/upload foto dan batal, batas satu grup foto, reorder keyboard, bulk semua/terpilih, Back/Next, isian bulk belum diterapkan, error diskon inline, snapshot cancel, simpan dan reopen, rename/reorder SKU tersimpan, tambah SKU stok 0, hapus opsi aman tanpa movement tambahan, legacy tanpa adopsi saat edit harga, stok readonly, fokus kembali, guard keluar. Viewport 360/390/430/768/1024/1440/1920 tanpa overflow horizontal; footer pada tinggi 500px, reduced motion dan keyboard. Pengujian menggunakan viewport desktop Chrome; keyboard virtual/safe area pada perangkat iOS/Android fisik belum diuji. CSS memakai visualViewport dan env safe-area untuk perilaku tersebut. Tidak menjalankan checkout/pembayaran/order eksternal baru; jalur service tetap dan test regresi relevan lulus.

Reproduksi browser: set DATABASE_URL dan DIRECT_URL ke postgresql://postgres@127.0.0.1:5549/product_variation_test setelah database lokal dibuat dan migrasi existing diterapkan; jalankan npm run build di app lalu node tests/product-variation-two-step-browser.mjs dari root. Skrip menolak database selain nama/host lokal tersebut, menonaktifkan email eksternal, memulai server miliknya sendiri dan menghentikannya di finally. EDITOR_PREVIEW_MODE=dev opsional untuk pengembangan. Hasil mentah di variation-two-step-evidence diabaikan Git.

## Bukti visual

- Baseline v1.7.3: [desktop](assets/product-editor-v173/variable-1440.png), [mobile](assets/product-editor-v173/variable-390.png).
- Setelah: [ringkasan desktop](assets/product-variation-two-step/desktop-main.png), [ringkasan mobile](assets/product-variation-two-step/mobile-main.png).
- Langkah opsi: [desktop](assets/product-variation-two-step/desktop-options.png), [mobile](assets/product-variation-two-step/mobile-options.png).
- Langkah harga/stok: [desktop](assets/product-variation-two-step/stock-1440.png), [mobile](assets/product-variation-two-step/stock-390.png).
- [Hasil browser](assets/product-variation-two-step/browser-result.json).

Screenshot ringkasan full-page memperlihatkan footer sticky pada posisi viewport saat diambil. Halaman 3 jenis variasi memang memerlukan scroll vertikal; daftar SKU panjang tetap di editor.

## Selisih dari mockup

- Identitas toko/shell existing dipertahankan; tidak mengganti nama toko menjadi Hubify Seller secara hardcode. Data contoh tidak disalin.
- Harga utama tetap input editable agar kemampuan existing tidak hilang, dikelompokkan dalam dua kolom. Nilai rupiah integer mengikuti input aplikasi; label Rp menjelaskan satuannya.
- Kode SKU tetap editable bila diizinkan, readonly untuk SKU terlindungi. Reservasi/available dan tombol hapus aman tetap tersedia. Kartu mobile memiliki field SKU dan tiga kolom harga/stok, dengan scroll vertikal.
- Opsi per jenis dapat dilipat; urutkan opsi memakai mode eksplisit dengan keyboard/drag existing. Foto hanya satu jenis dan transfer memerlukan konfirmasi. Tombol merah hanya untuk aksi destruktif; primary hitam, tab/step biru.
- Tidak ada autosave. Simpan variasi menerapkan draft form; Simpan Perubahan/Simpan sebagai Draft/Terbitkan existing menyimpan permanen sesuai status/readiness.
- Step fade 140ms hanya pointer dan tanpa prefers-reduced-motion; keyboard tidak dianimasikan. Footer mobile menghormati tinggi visualViewport/safe area.

## Berkas dan integrasi

Frontend: product-editor.tsx (tab/ringkasan/snapshot), product-variation-dialog.tsx (dua langkah, validasi, fokus), custom-variation-editor.tsx (ref generator existing, editor tetap mounted, foto eksplisit), product-bulk-editor.tsx (notifikasi isian belum diterapkan), variation-editor.css (desktop/mobile). Pengujian: tests/product-variation-two-step-browser.mjs. Dokumen/bukti: dokumen ini dan assets/product-variation-two-step; .gitignore mengabaikan hasil mentah.

Recheck main masih b8b33ebe; worktree PDP, identity, remediation lama, dan compatibility bersih. PR 37 storefront/PDP dan PR 38 identity/mail belum memiliki overlap langsung pada berkas frontend task ini. PR 38 masih berbasis codex/one-click-updater-openwa dan diff-nya juga mencakup PDP dari PR 37, VERSION serta migrasi identity/mail; jangan menyalin/merge seluruh head itu ke branch task ini. PR 3 lama menyangkut installer/updater/dependency/layout. Tidak menyalin perubahan agent lain. Review Draft PR UI ini terhadap main v1.7.3 terlebih dahulu. PR 37 dapat direview terpisah; rekonsiliasi/rebase PR 38 oleh pemiliknya setelah baseline/PDP jelas agar tidak membawa ulang perubahan yang dirilis. Ulangi lint/typecheck/build/browser jika main berubah. Jika agent lain mulai mengubah editor yang sama, selesaikan PR pertama dahulu dan rebase PR kedua; jangan menimpa worktree/force-push branch milik agent lain.

CI tidak diminta atau dijalankan manual; commit menggunakan [skip ci] untuk melewati workflow PR otomatis. Hanya commit dan Draft PR; tidak merge/deploy.
