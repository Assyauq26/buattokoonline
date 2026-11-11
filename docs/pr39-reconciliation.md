# PR #39 — audit byte migrasi dan rekonsiliasi baseline

Audit 11 November 2026. **NO-GO tetap berlaku.** Tidak ada perubahan file migrasi historis, ledger Prisma, metadata versi, konfigurasi produksi, helper terpasang, tag, main, atau release selama investigasi ini. Pengujian aplikasi menggunakan database lokal sintetis; suite Python berjalan dalam container terisolasi dengan mount source readonly dan network none.

## 1. Empat sumber bukti

- Git: tag v1.7.2 terurai ke `5145bdcd7cd84f93f49a066aa669560e858db0ac`; kandidat implementasi `4fc8acf3970c68997ce1b4da78ee28d5d85afaf6`.
- Paket publik: asset `store-v1.7.2.tar.gz`, asset GitHub 733967912, ukuran 2.159.090 byte. SHA-256 hasil download `dd7d400a3821e4fc20b6886f688ee48c46300a440344b0e06978e32313dad938`, cocok dengan API GitHub dan checksum yang diterbitkan.
- Manifest `release.json`: version 1.7.2, source SHA 5145bdc. Seluruh **730 file** cocok dengan checksum manifest dan byte Git pada SHA tersebut. Tidak ada perbedaan Git–paket, termasuk kedua migrasi.
- Source VPS aktif: `/opt/single-store/development-sources/5145bdcd7cd84f93f49a066aa669560e858db0ac`. Seluruh 730 file tersedia; 728 identik dengan paket, hanya dua migrasi di bawah berbeda. File tersebut juga identik dengan salinan historis pada source `7061d3575be5f1e999aa4369f12fc1979f4eaed6`.
- Ledger Prisma dibaca melalui SELECT terhadap `_prisma_migrations`, hanya entri finished dan tidak rolled back. Checksum ledger cocok dengan file VPS dan `version.json`.

## 2. Hasil perbandingan byte

| Migrasi | Git / paket / kandidat | VPS aktif / historis | Kesimpulan |
| --- | --- | --- | --- |
| `20261109120000_order_resolution_workflow` | 3097 byte; 20 LF; 0 CRLF | 3116 byte; 19 CRLF + 1 LF | Selisih tepat 19 byte CR sebelum LF |
| `20261109121500_resolution_transfer_review` | 354 byte; 2 LF; 0 CRLF | 356 byte; 2 CRLF | Selisih tepat 2 byte CR sebelum LF |

Bukan sekadar perbandingan teks atau hash hasil normalisasi: byte VPS diperoleh dengan base64 agar transport PowerShell/SSH tidak mengubah akhir baris, lalu dibandingkan langsung dengan blob `git show` dan anggota tar. Menghapus **hanya** byte CR yang langsung diikuti LF dari salinan di memori menghasilkan byte yang persis sama. Tidak ada trimming, perubahan whitespace lain, decoding ulang, perubahan SQL atau penulisan normalisasi ke disk VPS.

Hash lengkap dan offset setiap byte CR tersedia pada [bukti mesin](audits/pr39-reconciliation/verified-comparison.json).

| Migrasi | SHA-256 Git / paket / kandidat | SHA-256 VPS / ledger / metadata |
| --- | --- | --- |
| Order resolution | `865ec38af4482060322ba0dc89becc9132881d7bbb7f7e633b669af30e0444ec` | `789ef757b2cb2fb6f6d38f710c6a50cfcb371d9b61e18e4154120930e02107ac` |
| Transfer review | `22cb34b1d3840926b42356fb333c0678f5a0ea850ee3c3b8b1f9373cc92a885b` | `d67b0094191575be2f28c7968e41eabad5bf9a9ab84676d8c66b7e7c01313483` |

Dengan demikian, paket publik v1.7.2 konsisten dengan Git, tetapi representasi byte dua migrasi pada VPS berbeda. Tidak ditemukan perubahan semantik SQL. Audit tidak mengasumsikan siapa atau proses mana yang pertama kali menghasilkan representasi historis tersebut.

## 3. Gate keamanan yang sebenarnya

Helper terpasang `/usr/local/sbin/hubify-staging-deploy` tetap ber-hash `cf9e431cd46dcbef22389729311546d13ac8ddb5c1c99adbc7b97dfa49378a97`. Fungsi preflight dan pemeriksaan schema dipanggil secara read-only, tanpa memanggil deploy, backup, migrate, recover, atau main.

- Preflight mode uji: PASS; mode uji sebelumnya diotorisasi pengguna.
- Ledger terhadap metadata instalasi: PASS.
- Source VPS existing terhadap ledger: PASS.
- Source kandidat dengan byte Git/paket LF terhadap ledger: **FAIL**, `Migrasi existing berubah atau hilang: 20261109120000_order_resolution_workflow`.

[Bukti output helper](audits/pr39-reconciliation/official-gate.json). Pemeriksaan berhenti pada migrasi pertama; inventaris terpisah membuktikan kedua mismatch di atas. Kesetaraan setelah normalisasi adalah bukti investigasi, **bukan** izin mengabaikan syarat checksum byte-exact. Tidak ada monkey-patch validator atau perubahan allowlist checksum dalam investigasi ini.

## 4. Rekonsiliasi Git yang aman

Kondisi awal audit:

| Ref | SHA | VERSION |
| --- | --- | --- |
| `origin/main` | `cc4e42e34044dc327094258abb2583bbd4d1f6ca` | 1.6.3 |
| `v1.7.2` | `5145bdcd7cd84f93f49a066aa669560e858db0ac` | 1.7.2 |
| PR #39 implementasi | `4fc8acf3970c68997ce1b4da78ee28d5d85afaf6` | 1.7.3 kandidat |

`git merge-base main v1.7.2` sama dengan main. `git rev-list --left-right --count main...v1.7.2` = **0 / 19**. Main tidak memiliki commit eksklusif yang perlu diselesaikan lewat conflict resolution. PR #39 semula satu commit setelah v1.7.2 tetapi 20 commit setelah main; GitHub membandingkan terhadap main, bukan hanya commit terakhir. Diff baseline main→v1.7.2 menyentuh 130 file, diff implementasi v1.7.2→4fc8acf menyentuh 29 file; karena ada overlap, diff PR terhadap main berjumlah 157 file.

Simulasi `git merge-tree --write-tree main v1.7.2` menghasilkan `de20798137274b73ce944e094c15d1b8e43a5032`, persis tree tag v1.7.2. Simulasi v1.7.2→4fc8acf menghasilkan `05e455a2a630f0d3a09a2bfaba0f95ae1085a222`, persis tree kandidat. Tidak ada konflik atau hasil merge yang mengubah file rilis.

Urutan yang disiapkan, **belum dieksekusi karena NO-GO**:

1. Setelah kompatibilitas migrasi diselesaikan dan gate lulus, buat PR baseline terpisah dari **SHA tag 5145bdc**, bukan head terbaru branch PR 36/37/38 atau branch agent lain.
2. Integrasikan baseline memakai merge commit yang mempertahankan ancestry; repository mengizinkan merge commit. Hindari squash, rebase, force-push, cherry-pick, reset main, atau menurunkan VERSION. Verifikasi tree hasil baseline merge persis tree v1.7.2 dan SHA tag masih ancestor main.
3. Tinjau kembali PR #39 terhadap main yang sudah mencakup baseline. Diff yang tersisa adalah remediasi editor dan dokumentasi audit; jangan menghapus perubahan produksi agar diff tampak kecil. PR #39 tidak perlu direbase untuk menjaga commit implementasi.
4. Sebelum setiap operasi, baca kembali remote main, tag, dan head #39. Jika SHA berubah, berhenti dan audit delta; jangan otomatis mengambil pekerjaan baru agent lain.
5. Jalankan gate pada exact merge candidate, kemudian merge melalui workflow yang diizinkan. Tag rilis berikutnya harus menunjuk commit final yang sama dengan source release dan deployment.

Hanya commit dokumentasi/bukti audit ditambahkan ke PR #39 pada investigasi ini; aplikasi, migrasi, workflow dan helper tidak diubah. Main/tag tetap pada SHA di atas.

## 5. Pengujian ulang kandidat

Dijalankan ulang pada source implementasi 4fc8acf; penambahan setelahnya hanya dokumentasi bukti:

| Gate | Hasil terbaru |
| --- | --- |
| Unit/regresi | 636 PASS, 3 skipped existing; 87 suite PASS, 1 skipped |
| PostgreSQL lokal terisolasi | 21 PASS |
| Python installer/updater/helper | 58 PASS; container Linux network none, source readonly |
| Build produksi Node 22 | PASS |
| Typecheck | PASS |
| Lint | 0 error, 39 warning |
| Boundary repository, diff whitespace | PASS |
| Browser produksi lokal | 14 kelompok assertion PASS; 7 viewport; tidak ada page exception |
| Integritas paket v1.7.2 | 730/730 checksum manifest dan byte Git PASS |
| Ancestry dan simulasi Git | PASS |
| Helper schema compatibility | **FAIL** |
| Merge/tag/publish/deploy kandidat | Tidak dijalankan karena gate FAIL |

Tidak membuat transaksi pelanggan, order J&T, pembayaran atau refund nyata. Restore scratch yang lulus pada pekerjaan sebelumnya tidak diklaim sebagai pengujian ulang pada audit read-only ini.

## 6. Keputusan dan persetujuan yang dibutuhkan

**Tetap NO-GO.** Rekonsiliasi Git sudah dibuktikan aman secara ancestry/tree, tetapi tidak menyelesaikan checksum ledger. Merge/publikasi/deployment tidak dilakukan. Hubify tetap v1.7.2 dan mode uji; tidak ada perubahan state produksi pada investigasi ini.

Persetujuan terpisah diperlukan sebelum mengembangkan atau menerapkan **prosedur kompatibilitas resmi untuk representasi akhir baris migrasi historis**. Rancangan tersebut harus mempertahankan file historis dan ledger, mengikat bukti pada pasangan hash spesifik serta identitas instalasi, tetap menolak perubahan SQL lain, mencakup installer/updater/helper dan rollback, serta diuji pada salinan terisolasi. Persetujuan desain tidak berarti izin melewati guard saat ini; implementasi tetap harus melalui review dan gate resmi.

Opsi mengedit SQL historis, mengganti checksum ledger/metadata, mengubah tag/asset v1.7.2, atau memaksa helper agar lolos **tidak dilakukan dan tidak direkomendasikan**. Jika kebijakan tetap mensyaratkan byte-exact equality tanpa prosedur kompatibilitas resmi, tidak tersedia jalur rilis aman dalam batas instruksi saat ini.

Latest status: see [v1.7.3 release gates](v1.7.3-release-status.md). The historical checksum NO-GO below was resolved through reviewed PRs #41/#42; deployment now awaits the existing GitHub Environment reviewer approval.
