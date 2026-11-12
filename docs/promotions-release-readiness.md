# Promosi v1.8.0 — checklist rilis dan recovery

Keputusan: **NO-GO deployment/publikasi stabil**. Kandidat implementasi dan finalisasi siap review; tidak ada otorisasi deployment baru dalam finalisasi ini. Semua observasi produksi pada 12 November 2026 bersifat read-only; tidak ada file, ledger, data atau konfigurasi VPS yang ditulis oleh audit.

## Baseline dan scope

| Identitas | Hasil pemeriksaan |
| --- | --- |
| Implementasi | `69070233e8a50d4276c43b528f6a3c635d7b6845`, branch `codex/promotions-refactor` |
| Main terkini | `b4aa626886429a5bd5378270abd6633c8d423ce8`; implementasi satu commit di atasnya, tidak tertinggal main |
| Rilis publik | v1.7.4, commit terurai tag `c3cfb22fb03bc3bea37aadfb6d790c75e805d51b`; tree seluruh source sama dengan main (main hanya merge ancestry) |
| Artefak publik sebelum upgrade | `store-v1.7.4.tar.gz`, SHA-256 `0a286296c0c85e5e320f85043e85dede0213e013dae129351a374df35f586b4e` |
| VPS aktual | metadata/source VERSION 1.7.3, SHA `c67fb49da284d51618524812d83974de70526657`; channel metadata `hubify-staging`, channel container `pilot` |
| App tree VPS dan v1.7.4 | sama: `476df370f9fc9595d00040b3309ee51f883148cb` |
| Image VPS sebelumnya | `sha256:52ecc4f33d3c856191428d12bc21806c4df23321d73d49f209933bc183516356` |
| Data produksi teramati | 11 produk, 41 SKU, 13 pesanan/19 item, 0 voucher, 4 kampanye SCHEDULED; 1 kampanye sedang berlaku dan 1 stok tereservasi |
| Layanan | app/db healthy, proxy running; maintenance timer dan updater aktif; J&T Production API/order/create disetujui dan aktif |

Tidak ada AGENTS.md pada root maupun jalur aplikasi setelah pemeriksaan ulang. Perubahan produk/variasi pada main dipertahankan. Finalisasi tidak mengubah editor produk, dependensi, schema lain, deployment/helper, platform, atau integrasi. PR lama #37/#38 menyentuh PDP, schema, VERSION dan policy; PR #3 menyentuh installer/dependency. Ketiganya berbasis baseline lama. Tidak ada commit dari PR tersebut yang diimpor; owner masing-masing harus merekonsiliasi terhadap main sebelum merge bersamaan. Konflik langsung dengan main saat audit: tidak ada. Bila main berubah, ulangi diff dan identitas kandidat; jangan force-push branch milik agent lain.

Delta finalisasi dari 6907023: metadata `VERSION` 1.8.0 dan rentang instalasi 1.7.4; transaksi/timeout pada migrasi baru yang belum dirilis; tes upgrade/release, catatan rilis dan bukti. Workflow PR juga memetakan suite management/editor/Promosi ke database uji yang dipersyaratkan masing-masing, dengan setup target lokal yang tervalidasi. Runner keamanan tetap menjalankan suite lengkap tanpa filter dalam CI; guard database masing-masing suite tidak dilonggarkan. UI dan logika harga/checkout hasil implementasi tidak dikerjakan ulang. Tidak ada tag publik yang dipindah, asset lama yang diganti, atau metadata versi VPS yang disinkronkan diam-diam.

## Pemeriksaan migrasi

| Tambahan | Kontrak dan dampak |
| --- | --- |
| `FlashSaleCampaign.draft JSONB` | nullable, tanpa default/backfill; kampanye lama tetap `draft IS NULL` |
| `FlashSaleSkuOffer` | UUID dari aplikasi, FK item CASCADE dan SKU RESTRICT, harga/kuota integer positif, kombinasi item/SKU unik |
| Index | unique item/SKU, index variantId, index OrderItem.flashOfferId; tabel penawaran memakai RLS seperti tabel promosi existing |
| `OrderItem.flashOfferId UUID` | nullable, FK RESTRICT; item lama tetap NULL; snapshot harga/diskon lama tidak dihitung ulang |
| Transaksi/lock | BEGIN/COMMIT, lock_timeout 3 detik, statement_timeout 30 detik; tidak ada DML pada tabel existing |

ADD COLUMN mengambil lock tabel; FK/index juga memerlukan lock. Batas waktu sengaja membatalkan migrasi ketika ada writer yang menahan tabel. Ukuran fixture lokal tidak mewakili durasi indeks pada toko besar; jangan menganggap hasil milidetik sebagai SLA downtime. Gunakan maintenance resmi dan hentikan writer sebelum migrasi produksi. Jangan menggunakan `CREATE INDEX CONCURRENTLY` di dalam transaksi ini atau menghapus FK agar deployment lolos.

Prisma 5.22 dapat menampilkan `current transaction is aborted` ketika mencoba menulis diagnostik setelah SQL mengalami lock timeout. Penyebab awal ada di log PostgreSQL (`55P03`). Kegagalan harus meninggalkan skema lama utuh dan baris migrasi gagal terlihat; jangan mengedit ledger, menjalankan `migrate resolve`, atau retry membabi buta dalam otomatisasi ini. Pertahankan maintenance/journal dan minta review operator untuk recovery.

### Checksum historis — bukti byte

Seluruh 29 file migrasi Git pada main/6907023 dan isi artefak publik v1.7.4 sama. Ledger Prisma VPS lengkap, tidak ada duplicate/unfinished/rolled-back row. Dua perbedaan berikut adalah representasi line ending, bukan perubahan SQL:

| Migrasi | Git/artefak LF SHA-256 | VPS/ledger SHA-256 | Byte VPS |
| --- | --- | --- | --- |
| `20261109120000_order_resolution_workflow` | `865ec38af4482060322ba0dc89becc9132881d7bbb7f7e633b669af30e0444ec` | `789ef757b2cb2fb6f6d38f710c6a50cfcb371d9b61e18e4154120930e02107ac` | 3116, 19 CRLF dan 20 LF |
| `20261109121500_resolution_transfer_review` | `22cb34b1d3840926b42356fb333c0678f5a0ea850ee3c3b8b1f9373cc92a885b` | `d67b0094191575be2f28c7968e41eabad5bf9a9ab84676d8c66b7e7c01313483` | 356, 2 CRLF dan 2 LF |

Byte file original VPS dan proyeksi source aktif cocok dengan ledger. Penghapusan **hanya** CR sebelum LF dalam memori menghasilkan byte Git/artefak persis. Dua puluh tujuh checksum lainnya cocok strict. Bukti lengkap: [historical-review.json](assets/promotions-release/historical-review.json). Tidak ada normalisasi file produksi atau ledger. Pengecualian resmi yang ada hanya mengizinkan transisi v1.7.3 yang dipatok; ia tidak mengizinkan source/versi kandidat ini. Jalur penyelesaian: proposal kompatibilitas baru yang dipatok identitas, SHA sumber, app tree, artefak bukti dan pasangan byte lengkap, diuji negatif/positif dan direview sebelum pemasangan helper. Proposal tersebut **belum diimplementasikan atau disetujui** dalam PR ini.

## Urutan deployment yang harus direview sebelum otorisasi

1. Selesaikan blocker di bagian keputusan, merge kandidat yang direview, pin SHA/tag/manifest/asset digest. Build ulang dari Git LF; perubahan merge mengubah source SHA, sehingga artefak kandidat sebelumnya tidak boleh dinyatakan sebagai artefak merge baru.
2. Pastikan operation lock resmi tidak sedang dipegang updater/deployment lain. Rekonsiliasi metadata Hubify memerlukan review sendiri: app tree sama tidak cukup untuk menulis versi atau memberi izin checksum baru.
3. Siapkan dan verifikasi backup baru tepat sebelum cutover. Simpan source/image/Compose/manager/helper sebelum upgrade serta file environment, media, konfigurasi, kunci integrasi/enkripsi dan inventory ledger. Jangan menyalin secret ke PR. Dua backup lama teramati memiliki checksum dump/media/config cocok, tetapi bukan backup cutover baru dan belum direstore ulang oleh audit produksi.
4. Jalankan prosedur operator resmi yang telah disetujui untuk kandidat ini. Jalur saat ini menolak kandidat; jangan menjalankan SQL manual untuk menghindari helper, mengubah `rollback_compatible`, menonaktifkan J&T, atau mengubah migrasi historis/ledger.
5. Prosedur yang disetujui kelak harus mengambil lock operasi bersama, memasang maintenance 503 pada route Hubify sambil menjaga route domain lain, menghentikan timer/service maintenance serta writer app, dan memastikan worker updater tidak mengaktifkan versi lain. J&T tracking/mail/media cleanup ikut berhenti karena dipanggil timer. Tidak boleh membuat/membatalkan AWB untuk smoke test.
6. Setelah writer berhenti, buat backup resmi, jalankan verifikasi checksum dan `restore.sh --check BACKUP_PATH` yang memulihkan ke database pemeriksaan terpisah. Catat hasil. Jangan memakai bootstrap atau mengembalikan dump ke DB aktif untuk upgrade.
7. Build artifact tools/runtime terpisah, jalankan prosedur migrasi deployment existing (`prisma migrate deploy` melalui tools image dengan migration environment) **hanya setelah helper transisi disetujui**. Verifikasi 29 ledger lama identik dan satu row migrasi baru selesai, serta tidak ada perubahan snapshot/harga/kampanye lama.
8. Aktifkan image yang memahami SKU dengan Compose/mount/flag integrasi yang dipertahankan. Lakukan readiness dan smoke read-only, baru tulis metadata versi sesuai prosedur setelah sehat. Buka traffic dan hidupkan kembali timer setelah semua pemeriksaan lolos. Catat waktu cutover dan transaksi pertama setelahnya.

## Backup, rollback kode, dan restore database

Backup resmi berisi `database.dump`, `media.tar.gz`, `configuration.tar.gz`, dan `backup.json` dengan SHA-256. Lindungi file root-only dan enkripsi sebelum dipindah karena konfigurasi berisi secret. `restore.sh --check` hanya pemeriksaan ke database/direktori sementara; tidak melakukan rollback DB aktif. Selain itu simpan image ID lama, source commit, Compose, helper/manager dan konfigurasi proxy byte-identik. Buktikan backup berasal dari store yang benar dan simpan inventory migrasi serta jumlah record sebagai pembanding.

**Rollback kode** mengganti runtime ke image/source lama sambil mempertahankan DB terbaru. **Restore database** mengganti data dengan snapshot masa lalu. Keduanya berbeda. Migrasi additive ini tidak membuat kode lama memahami semantik SKU. Karena itu rollback otomatis lama tidak boleh dipakai setelah aktivasi fitur baru.

| Titik gagal | Recovery yang diizinkan setelah review operator |
| --- | --- |
| Preflight menolak metadata/checksum/policy/J&T | Hentikan sebelum downtime; tidak ada schema/ledger/config yang diubah |
| Build gagal sebelum migrasi | Gunakan image lama, pastikan konfigurasi/journal/route/timer sehat; tidak perlu restore DB |
| Lock/SQL gagal | Pertahankan maintenance, periksa log PostgreSQL dan ledger read-only; uji membuktikan transaksi SQL rollback tanpa partial DDL. Jangan menghapus baris migrasi gagal. Review operator menentukan jalur pemulihan resmi |
| Migrasi sukses, app baru gagal, belum ada write fitur baru | Pertahankan schema/ledger tambahan. Kandidat image lama hanya boleh dipertimbangkan setelah bukti tidak ada SKU offer/order baru dan review metadata/helper; guard standar tidak otomatis dilewati |
| Sudah ada order, draf/penawaran SKU, atau perubahan voucher baru | Tetap gunakan kode yang memahami data baru dan lakukan perbaikan maju. Jangan menyalakan runtime lama atau restore backup sehingga order/reservation baru hilang |
| DB harus direstore akibat kerusakan | Keputusan terpisah dengan write fence, rekonsiliasi transaksi sejak backup/PITR, payment/shipment/refund dan operator pemilik data. Tidak ada restore otomatis dalam rilis ini |

Pemicu menghentikan aktivasi: migration pending/gagal, ledger tidak cocok, readiness gagal, perubahan tak terduga pada proxy/integrasi/metadata, harga atau kuota tidak konsisten, worker lain aktif, atau snapshot/reservation berubah tanpa transaksi yang sesuai. Kegagalan tidak boleh membuka traffic dengan schema sebagian terpasang.

Kampanye existing tetap menggunakan jadwal dan harga product-wide existing; tidak ada konversi otomatis ke kuota SKU. Kampanye yang melintasi maintenance tetap dinilai waktu server saat traffic dibuka. Promo yang telah berakhir tidak diterapkan oleh pembaca harga baru, walau scheduler tertunda. Timer kembali memproses expiry yang lewat; release stok/kuota tetap idempotent. Pesanan pending sebelum cutover mempertahankan snapshot dan nullable flashOfferId, bukan dipindah ke campaign baru. Retry idempotency/order snapshot tetap berlaku. Restart runtime menghilangkan cache in-process; pembaca promosi tetap berada di luar metadata cache, dan operasi promosi melakukan invalidasi katalog/PDP/cart/checkout. Tidak ada scheduler promosi baru yang perlu diinstal.

## Health dan smoke setelah pemasangan yang diotorisasi

- App/db healthy; HTTPS `/api/v1/ready` 200, storefront/login/PDP/cart/checkout dapat dibaca tanpa page error. Verifikasi SHA/image/version terhadap artifact, bukan hanya teks dashboard.
- Periksa ledger 30 row selesai dan checksum 29 row lama tetap, harga reguler, snapshot harga/diskon/order lama dan reservation pembanding tetap sesuai.
- Draf tidak muncul di storefront. Kampanye lama berjalan/berakhir sesuai server, SKU terpilih/tidak terpilih benar; jangan membuat promo produksi sebagai fixture. Gunakan tes sintetis terisolasi untuk penulisan/concurrency.
- J&T API/order/create approval, konfigurasi integrasi, mount socket/token serta route proxy lain identik. Smoke tidak membuat order, membayar, mengirim email, atau membuat/membatalkan AWB nyata.
- Timer/worker kembali sehat. Amati expiry, cleanup, mail sync dan tracking sesuai kontrak existing; jangan mengulang efek eksternal untuk membuktikan kesehatan.

## Validasi dan keputusan final

| Gate | Bukti dan hasil |
| --- | --- |
| Baseline/source scope | PASS; main diperiksa ulang, tidak ada commit agent lain diimpor; runtime UI/pricing tetap byte Git yang sama dengan 6907023 |
| Migrasi historis | PASS integritas 29 file Git/artefak; dua perbedaan ledger diketahui sebagai CRLF/LF dan **tetap menolak transisi baru** |
| Upgrade PostgreSQL 16 | PASS, 29 → 30 melalui `prisma migrate deploy`; fixture 5 lifecycle kampanye, 2 voucher, harga SKU berbeda dan 4 snapshot paid/pending/cancelled/expired tidak berubah |
| Schema/constraint | PASS nullable/default, FK, CHECK harga/kuota, unique/index dan RLS; tidak ada aktivasi/backfill SKU atau order historis |
| Lock failure | PASS: kegagalan sekitar 5,1 detik termasuk startup CLI, server log menunjukkan lock_timeout 3 detik; tidak ada partial DDL, row migrasi gagal tidak diperbaiki |
| Backup/restore sintetis | PASS custom-format pg_dump/pg_restore ke DB lain; seluruh tabel/snapshot pembanding identik; tidak merestore DB produksi |
| Isolasi | PASS identitas produk tidak muncul di DB toko uji kedua; permission/ID/concurrency dilindungi tes implementasi sebelumnya |
| Release contract | 5 PASS; versi/policy, 29 checksum, transaksi SQL dan penolakan guard/historical transition baru |
| Installer/archive regression | 8 PASS, termasuk identitas release, unsafe archive dan grammar migrasi |
| Build/typecheck final | PASS pada Node 22.23.4; tidak ada perubahan dependensi atau UI sejak bukti browser |
| Bukti sebelumnya digunakan kembali | 637 unit PASS/3 Windows SKIP, 21 DB PASS, 12 kelompok browser PASS (360/390/430/768/1440, dialog tengah/fullscreen, draft/retry/concurrency/cache) |
| Produksi read-only | `/api/v1/ready` 200 ready; app/db healthy; flags J&T tetap yes, updater/timer aktif; checksum dua backup terbaru cocok |
| Packaging | Jalankan `installer/release.py` pada clone bersih LF dari commit finalisasi, tanpa `fixture=True`; attestation final mencatat SHA/digest pada deskripsi PR dan manifest lokal. Source SHA merge/release kelak memerlukan packaging ulang |
| CI/release | PR mengikuti workflow repository; sebelum publikasi wajib full CI dan review operator. Tes lokal tidak menggantikan gate tersebut |

PR #49 memicu workflow management secara otomatis. Run awal [43214885683](https://github.com/Assyauq26/buattokoonline/actions/runs/43214885683) mencatat 736 tes PASS dan dua suite gagal pada guard target, karena workflow lama mengarahkan seluruh suite ke `management_v130_test`. Finalisasi menambahkan PostgreSQL Promosi pada port 5557 dan DB editor terpisah pada port 5432, tanpa mengubah guard atau menghapus suite. Setup per berkas memilih hanya hostname, port dan nama database uji yang dipatok; tiga tes tambahan menolak target remote/port/nama/protokol salah. Verifikasi lokal pemetaan: 24 PASS (21 transaksi Promosi + 3 routing). Status run pengganti dan identitas artifact exact HEAD dicatat pada PR; run yang gagal tidak dinyatakan lulus.

Bukti mesin: [upgrade-result.json](assets/promotions-release/upgrade-result.json), [deployment-readonly.json](assets/promotions-release/deployment-readonly.json), [deployment-safety-readonly.json](assets/promotions-release/deployment-safety-readonly.json), [backup-readonly.json](assets/promotions-release/backup-readonly.json). Dump sintetis dan file private/raw audit berada di direktori lokal ignored, tidak dipaketkan. Seluruh fixture berada di jalur test; tidak ada contoh state baru yang diimpor UI produksi. Screenshot desain dan kontrak browser tetap berasal dari [hasil 6907023](promotions-refactor.md).

Reproduksi upgrade di cluster lokal terpisah menggunakan `tests/promotions-upgrade.mjs`, `PROMOTION_RELEASE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5557/postgres`, `PROMOTION_TEST_PG_BIN` menunjuk client PostgreSQL 16, dan `PROMOTION_BASELINE_ARCHIVE` menunjuk artefak publik v1.7.4 dengan digest yang dipatok skrip. Skrip membuat empat database acak berprefix `hubify_promotions_` hanya pada host/port yang diizinkan dan membuang hanya database yang dibuat pemanggilan tersebut. Setiap putaran upgrade memakai baseline baru; ledger migration test lama tidak diedit untuk menyamakan checksum revisi migrasi yang belum dirilis. Client pg_dump/pg_restore 16.11 dan server 16.13 dipakai pada rehearsal ini.

Tes unit/transaksi/browser dari 6907023 digunakan kembali karena implementasi UI/pricing tidak berubah; tes tambahan berfokus pada migrasi dan packaging. Uji dump/restore ini bukan klaim bahwa helper operator, proxy/maintenance, backup media/config atau rollback VPS kandidat telah dilatih end-to-end. Verifikasi CI Ubuntu/2 GB serta jalur operator resmi kandidat masih wajib sebelum status publikasi/deployment dapat berubah menjadi GO.

Blocker yang sudah terbukti: metadata instalasi Hubify tidak sama dengan baseline policy 1.7.4; dua representasi checksum membutuhkan transisi resmi baru; `rollback_compatible: false` dan SQL FK/check/RLS/transaction tidak diterima grammar migrasi otomatis; helper staging menolak J&T Production aktif; belum ada prosedur operator/helper kandidat yang disetujui maupun otorisasi deployment baru. Menambahkan dokumentasi tidak mengubah keputusan guard tersebut.

Keputusan ini membedakan **GO untuk review kandidat** dari **NO-GO untuk publikasi/deployment**. Yang memerlukan tindakan/approval selanjutnya adalah proposal transisi helper yang tetap memelihara J&T/ledger/proxy, rekonsiliasi metadata berbasis identitas source/image, latihan cutover/recovery resmi, CI rilis pada exact SHA, serta otorisasi publikasi dan pemasangan. Tidak ada permintaan untuk menonaktifkan pengamanan tersebut.
