# Hubify v1.8.0 — diagnosis, cutover dan recovery operator

Status: **NO-GO untuk mutasi produksi**. Dokumen ini menyiapkan review; bukan izin
merge, memasang helper, deployment, tag atau publikasi. Helper diagnosis baru hanya
mengautentikasi ekuivalensi. Executor cutover produksi yang memelihara seluruh guard
belum tersedia/disetujui; perintah deployment tidak boleh dirakit manual untuk
melewati penolakan helper staging/updater.

## Identitas dan prasyarat

- Instalasi `2d958c50e7a60006f3a8531cf217335e`, origin `https://hubify.web.id`.
- Aktual sebelum upgrade: metadata 1.7.3, source
  `c67fb49da284d51618524812d83974de70526657`, image
  `sha256:52ecc4f33d3c856191428d12bc21806c4df23321d73d49f209933bc183516356`.
- Payload runtime ekuivalen v1.7.4 setelah menerima **dua pasangan byte tepat**;
  ini tidak mengubah metadata aktual menjadi 1.7.4.
- Referensi publik: `store-v1.7.4.tar.gz`, SHA-256
  `0a286296c0c85e5e320f85043e85dede0213e013dae129351a374df35f586b4e`.
- Kandidat: VERSION 1.8.0; gunakan SHA/digest artefak exact pada PR49. Perubahan
  commit/merge memerlukan packaging, attestation dan gate baru yang terdampak.
- Satu migrasi tambahan: `20261112050000_promotion_sku_offers`, SHA-256
  `0b43da5d78a6c9211c4fef32bf8d5a813e2e335992035f8923db64f50a35b2f7`.
- Root operator harus memverifikasi checkout/helper dari commit yang direview,
  backup manager lama dan root-only digest sebelum pemasangan yang diotorisasi.
  Audit sekarang menjalankan observer melalui stdin dan tidak memasang helper.

## Perintah diagnosis yang dapat dijalankan sekarang

Jalankan dari checkout kandidat LF yang direview pada mesin operator. Gunakan SSH
alias yang sudah diverifikasi. Tidak perlu memasang script di VPS. Redirect stdout
berada **di mesin operator**; output tidak berisi secret/customer/order identifiers.
Observer hanya membaca source, Docker metadata, environment allowlist dan katalog
SQL dengan `BEGIN READ ONLY`; tidak memanggil endpoint J&T.

```powershell
Get-Content -Raw deploy/hubify-promotions-observe.py |
  ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes bts-tencent-m1 'sudo -n python3 -' |
  Set-Content -Encoding utf8 observation.json
python deploy/hubify-promotions-review.py --dry-run `
  --observation observation.json `
  --baseline-archive store-v1.7.4.tar.gz `
  --candidate CANDIDATE_ARCHIVE `
  --candidate-sha256 REVIEWED_ARCHIVE_SHA256 `
  --source-sha REVIEWED_SOURCE_SHA
```

Ganti tiga placeholder dengan identitas artefak dari attestation/PR. Script membaca
JSON UTF-8 dengan/tanpa BOM. Pada Linux gunakan redirect stdout ke file lokal.
Simpan JSON hasil diagnosis sebagai audit di mesin operator. Exit **2** berarti
ekuivalensi diterima tetapi cutover **ditolak**; exit **1** berarti bukti tidak
cocok; tidak ada exit yang mengizinkan deployment. Tidak ada opsi `--apply`.

Diagnosis mengautentikasi seluruh isi dan manifest kedua arsip, source/version,
repository identity, metadata aktual, image, 552 file runtime yang dipaketkan,
fingerprint katalog PostgreSQL, 29 ledger lengkap, dua original/active raw bytes,
29 file kanonis dan satu SQL baru yang dipatok. Perubahan substantif, checksum
asing, migration tambahan, source lain, schema drift, ledger gagal/duplikat dan
policy yang dilonggarkan ditolak. Snapshot audit offline tidak menjadi token
otorisasi; ulangi pengamatan tepat sebelum cutover dengan operation lock.

Penerimaan byte **tidak** menjalankan Prisma. Rehearsal PostgreSQL 16/Prisma 5.22
membuktikan `prisma migrate deploy` dapat memakai source kanonis tanpa menulis
ulang 29 checksum legacy. Tidak perlu runtime projection, edit SQL historis,
`migrate resolve`, ataupun perubahan ledger. Paket final harus mempertahankan byte
LF Git yang sama; bukan paket eb69954 dengan label baru.

## Guard yang masih menghentikan tindakan

1. `staging/hubify-staging-deploy.py` menolak `JNT_PRODUCTION_API_APPROVED=yes`
   atau `JNT_PRODUCTION_ORDER_APPROVED=yes`. Keduanya tetap yes pada observasi
   aktual. Jangan menonaktifkannya untuk mendapatkan jalur staging.
2. `installer/updater.py` menolak policy `rollback_compatible:false`, SQL
   operator-only serta baseline metadata 1.7.3 di luar rentang generic 1.7.4.
   Policy dan grammar generic tetap utuh.
3. Modul diagnosis adalah proposal transisi eksplisit, **bukan executor produksi**.
   Sebelum GO diperlukan executor resmi yang direview dan diuji end-to-end untuk
   state machine di bawah; memasang script diagnosis saja tidak menutup blocker.

## Kontrak executor cutover yang wajib direview

Urutan ini adalah spesifikasi implementasi/review, bukan perintah manual untuk
menjalankan migrasi ketika helper menolak.

1. Ambil lock existing `/run/single-store-operation.lock` secara nonblocking.
   Tolak journal `updating`, `failed`, `recovery_required`; pin source/digest dan
   ulangi diagnosis aktual di dalam lock. Catat identitas source/helper/metadata,
   Compose/proxy bytes, app/tools image ID, 29 row ledger lengkap, snapshot harga,
   order, pemakaian voucher dan reservation sebelum fence.
2. Build app/tools candidate lebih dahulu tanpa mengaktifkannya. Pertahankan
   seluruh environment, volume, network, permission dan route domain lain.
   Jangan prune image rollback/volume/backup. Build gagal: berhenti tanpa migrasi.
3. Fence write pada route Hubify dengan maintenance **503** memakai prosedur proxy
   existing yang mempertahankan extra sites dan memverifikasi hash proxy. Hentikan
   `single-store-maintenance.timer` dan service yang sedang berjalan; hentikan
   updater timer/worker dengan mekanisme resmi; hentikan app lama dan tunggu
   koneksi writer/in-flight habis. Timer menghentikan expiry, tracking, mail retry
   dan cleanup. Jangan meninggalkan worker lama yang menulis saat migrasi.
4. Buat backup resmi `updater.backup()` setelah fence. Verifikasi lewat
   `restore.sh --check BACKUP_PATH`/`updater.verify_backup()`, yang mengembalikan
   dump ke DB **terpisah** dan memeriksa media/config. Backup cutover meliputi
   `database.dump`, `media.tar.gz`, `configuration.tar.gz`, `backup.json`, SHA-256,
   image/source/Compose/helper/manager/proxy/env/encryption key. Simpan root-only;
   enkripsi bila dipindahkan. Backup lama yang checksum-nya cocok bukan backup
   cutover baru. Jangan restore dump ke database aktif untuk upgrade.
5. Executor harus menerima **hanya** pasangan ekuivalensi dan SQL baru yang dipatok,
   lalu menggunakan tools image dan environment migrasi existing untuk
   `prisma migrate deploy`. Source historis tetap kanonis. BEGIN/COMMIT membatasi
   seluruh DDL, lock_timeout 3 detik dan statement_timeout 30 detik. Tidak ada
   fallback `resolve`, retry otomatis, atau global normalizer.
6. Verifikasi 29 row ledger byte-identik dan satu row SQL baru selesai; tidak ada
   unfinished/rolled-back/duplicate row. Verifikasi constraint/index/RLS, nullable
   field lama NULL, belum ada penawaran baru, harga/order snapshot/reservation
   pembanding utuh. Tolak perubahan yang tidak dijelaskan transaksi.
7. Aktifkan image baru **di balik fence**. Readiness internal dan smoke read-only
   katalog/PDP/cart/checkout/settings harus lulus. Tidak membuat order, payment,
   AWB, pickup, pembatalan, refund atau probe J&T sebagai smoke test. Pertahankan
   semua flag/kredensial Production. Restart menghapus cache in-process; pembaca
   promosi memeriksa waktu/SKU di luar cache metadata.
8. Baru setelah sehat tulis metadata **1.8.0 dan source SHA sebenarnya**, inventory
   tetap berisi 29 legacy digest + SQL baru. Simpan baseline aktual c67/1.7.3 dan
   bukti ekuivalensi pada audit; jangan tulis 1.7.4 perantara. Persist journal,
   buka traffic, periksa readiness publik, pulihkan timer/updater sesuai state
   sebelum cutover dan catat batas write pertama. Jangan memulihkan binary lama
   otomatis jika health publik kemudian gagal.

## Kegagalan, rollback dan recovery_required

| Titik gagal | Tindakan |
| --- | --- |
| Diagnosis, build atau backup sebelum migrasi | Berhenti; tidak mengubah schema/ledger. Pulihkan hanya service/proxy yang sempat di-fence setelah verifikasi identitas lama dan journal. |
| Lock/statement timeout atau SQL gagal | Transaksi DDL rollback; ledger kegagalan Prisma tetap terlihat. Tetap maintenance, journal `recovery_required`, kumpulkan log PostgreSQL/Prisma. Tidak menghapus ledger atau retry buta. |
| Migrasi berhasil tetapi runtime baru gagal | Pertahankan fence dan schema/ledger tambahan; perbaikan maju pada kode yang memahami SKU. Rollback kode lama memerlukan review terpisah atas bukti belum ada write fitur baru; tidak otomatis dianggap aman karena DDL additive. |
| Ada write/order/penawaran/voucher baru setelah aktivasi | `recovery_required`; pakai kode yang memahami SKU, perbaikan maju. Jangan menyalakan kode lama atau restore snapshot lama. |
| Kerusakan DB memerlukan restore | Keputusan terpisah dengan fence, PITR/export transaksi sejak backup, rekonsiliasi payment/shipment/order/refund/reservation dan pemilik data. Tidak ada restore otomatis. |

Rollback DDL adalah efek transaksi SQL yang gagal. Rollback aplikasi mengganti
image tetapi mempertahankan DB baru. Restore DB mengembalikan data ke masa lalu
dan berisiko menghilangkan transaksi baru; ketiganya tidak boleh disamakan.

Kampanye existing tidak dikonversi diam-diam menjadi penawaran SKU. Waktu server
tetap menentukan start-inclusive/end-exclusive walau maintenance melewati jadwal.
Expiry/reservation diproses idempotent saat timer kembali. Order pending dan lama
mempertahankan snapshot serta `flashOfferId=NULL`. Jangan reset kuota/cache untuk
memaksa campaign berlaku kembali.

## Bukti latihan dan batasnya

`tests/promotions-upgrade.mjs` membuat database lokal acak hanya pada loopback
PostgreSQL 5557. Jalankan sekali dengan baseline kanonis dan sekali dengan
`PROMOTION_LEGACY_LEDGER=yes`. Mode kedua membuat schema *fixture lama* memakai
dua original byte `.bin` sebelum Prisma mencatat ledger awal. Ia tidak mengedit
file historis repository, kandidat atau VPS. Kedua mode memeriksa 29→30 migrasi,
snapshot sembilan tabel, lima state kampanye, empat order, voucher/SKU, constraint,
RLS, restore backup terpisah, tenant isolation dan rollback DDL saat lock.

Latihan ini membuktikan upgrade database dan restore sintetis, **belum** membuktikan
executor cutover/proxy/worker/backup media/config produksi. Sampai executor resmi
serta gate Ubuntu/2 GB lulus pada kandidat yang direview, keputusan tetap NO-GO.
