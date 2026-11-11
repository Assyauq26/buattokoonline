# Audit pengaturan seller — 10 November 2026

## Lingkup dan kondisi awal

Repository `Assyauq26/buattokoonline`, checkout `seller-order-flow`.
Base `cc4e42e34044dc327094258abb2583bbd4d1f6ca`, versi tetap `1.6.3`.
Branch pekerjaan `codex/settings-navigation-polish`; checkout awal bersih.
Lingkup hanya implementasi dan verifikasi lokal. Tidak ada CI, push, merge, rilis, deployment, perubahan DNS, atau mutasi produksi.

## Audit dan hasil

| Before | After | Why |
| --- | --- | --- |
| Sidebar memakai struktur berbeda untuk disclosure dan link | Grid ikon/label/chevron seragam, disclosure button dengan ARIA | Panah sejajar, dapat dioperasikan keyboard, parent aktif terbuka saat deep link |
| Pengaturan membuka kartu overview dan judul berulang | Base route redirect ke Informasi Seller | Langsung ke form; deep link lain tetap berlaku |
| Navigasi pengaturan desktop disembunyikan di mobile tanpa pengganti | Selector di atas judul, mengikuti URL dan history | Semua submenu sesuai permission dapat dijangkau |
| Nomor pribadi read-only dan action hanya menerima nama | Kontak seller terpisah, validasi saat submit, revision lock | Bisa diketik/ditempel/dikosongkan tanpa mengubah identitas login atau verifikasi |
| Identitas dan layanan toko tersusun memanjang; preview tersembunyi di mobile | Dua kolom desktop, satu kolom mobile, preview collapsible | Hierarki mengikuti acuan tanpa menghilangkan fungsi |
| Pengiriman tersebar pada tautan konfigurasi | Pilihan Manual/J&T, status aktual, akses gudang/mapping/AWB | Satu metode checkout; integrasi existing dipertahankan |
| Rekening tampil penuh; feedback form terbatas | Ringkasan masked, tambah/edit inline, fokus edit, status dan feedback | Menjaga leading zero, referensi historis dan otorisasi existing |
| Metode pembayaran tidak menjelaskan kesiapan rekening aktual | Status transfer berdasarkan jumlah rekening aktif | Tidak mengiklankan gateway atau kesiapan palsu |
| Cek Update menuju jalur lama dan tanpa status pending | Tetap dalam Pengaturan, status memeriksa, catatan rilis | Pemeriksaan tidak disamakan dengan pemasangan berhasil |

Animasi disclosure 180 ms, dapat dibalik, tidak dianimasikan untuk keyboard/reduced motion. Tidak ada library baru. Warna primary berasal dari tema published; bukti browser sengaja memakai tema biru untuk menguji bahwa warna tidak hardcode monokrom.

## File utama

- `app/src/components/admin/admin-nav.tsx`, `admin-nav.css`: sidebar dan disclosure.
- `app/src/components/admin/settings-shell.tsx`, `settings.css`, `app/src/app/admin/settings/*`: routing, selector, layout responsif.
- `seller-information.tsx`, `app/src/modules/admin/seller-profile.service.ts`, `seller-profile.actions.ts`: form kontak dan penyimpanan berotorisasi.
- `store-information.tsx`: identitas, layanan pelanggan, preview, cancel/save/error.
- `shipping-overview.tsx`, `jnt-integration-settings.tsx`, `jnt-mapping-settings.tsx`, `print-preferences.tsx`: metode aktif dan konfigurasi existing.
- `bank-account-manager.tsx`, `app/src/modules/payments/bank.actions.ts`: form inline dan invalidasi status terkait.
- `update-check-button.tsx`, `app/src/app/admin/settings/updates/page.tsx`: pemeriksaan versi tanpa menjalankan update.
- `settings-feedback.tsx`: spinner tanpa perubahan dimensi, pesan persisten, toast.
- `tests/settings-browser.mjs`: alur browser dengan database disposable dan operasi carrier simulasi.

## Data dan keamanan

Migrasi additive `20261110100000_seller_contact_phone` menambah kolom nullable `User.sellerContactPhone`. Nilai NULL memakai nomor lama sebagai fallback sebelum kontak diedit; string kosong berarti seller sengaja mengosongkannya. Tidak mengubah `User.phone`, email, password hash, emailVerifiedAt, sessionVersion, atau kredensial autentikasi.

Action mengambil akun dari sesi server, menolak target ID tambahan, memastikan role/akun masih aktif dalam transaksi, dan menolak revision stale. Audit tidak merekam nomor kontak.

Kontrak J&T, endpoint, payload, signature, pembuatan resi, pickup, cancellation dan transaksi tidak diubah. Secret tersimpan tidak dikirim ke browser; field kosong mempertahankan secret. Probe HTTP diberi batasan jelas: HTTP 200 tidak membuktikan kredensial/tarif/transaksi valid.

Bank tetap memakai service otorisasi, concurrency, dan soft-delete existing. Pengaturan alamat toko tidak menimpa gudang. Preferensi AWB tetap penyimpanan perangkat, hanya ukuran 75×150 dan 100×150 mm.

## Verifikasi akhir

- Typecheck: PASS.
- Production build: PASS. Konfigurasi existing melewati lint; peringatan Tailwind easing dan Vite config existing dicatat, tidak diperlakukan sebagai hasil lint.
- 5 berkas pengujian, 24 tes: PASS (seller profile scope, seller contact database, shipping settings, J&T nonmutating probe, management lifecycle).
- Browser Chrome terhadap production build lokal: 17 kelompok skenario PASS, 0 runtime/hydration errors.
- Desktop 1440×1000; mobile 360/390/430×900: PASS.
- Phone: typing, invalid input, normalisasi, clear, refresh dan login ulang PASS; identitas login tidak berubah.
- Save: spinner segera, dimensi tombol stabil, duplicate submission ditahan, kegagalan mempertahankan draft PASS.
- Bank: tambah/edit/batal/status, masked summary, leading zero, tanpa dialog PASS. Regresi history/concurrency melalui management lifecycle PASS.
- J&T: upload CSV nyata ke database lokal, mapping aktif, pemilihan gudang, secret kosong saat edit, aktivasi satu metode PASS. Empat hasil endpoint disimulasikan; tidak ada shipment nyata.
- AWB: preferensi bertahan setelah reload PASS.
- Update: pemeriksaan rilis baca-saja, tetap pada route settings, tidak mengklaim update selesai PASS.
- Semua 9 submenu diperiksa pada tiap lebar mobile; URL/back/forward, tanpa overflow halaman, dan tombol simpan bebas dari bottom navigation PASS.
- Screenshot dibandingkan dengan hierarki acuan: navigasi kiri + konten, store dua kolom, shipping pilihan metode, bank inline mengikuti override tertulis. Data screenshot sintetis, bukan akun produksi.

Bukti lokal: `output/settings-audit/results.json`, `store-desktop.png`, `shipping-desktop.png`, `bank-desktop.png`, serta `*-360/390/430-viewport.png` dan `*-save.png`. Screenshot full-page juga tersedia; fixed navigation berada pada posisi viewport saat capture, gunakan viewport/save capture untuk menilai overlap.

Perintah verifikasi dari `app`:

```text
npm run typecheck
npm run build
npm test -- tests/unit/seller-profile-scope.test.ts tests/unit/shipping-settings.test.ts tests/unit/jnt-seller-probe.test.ts tests/database/seller-contact.test.ts tests/database/management-lifecycle.test.ts
```

Browser dijalankan dari root dengan `node tests/settings-browser.mjs`. Semua tes database memerlukan PostgreSQL disposable `management_v130_test` di loopback, bukan database live.

## Batas dan tindak lanjut

Tidak ada blocker implementasi yang ditemukan pada pemeriksaan akhir. Belum live: migrasi additive dan deployment memerlukan tahap rilis terpisah sesuai otorisasi berikutnya. Update Versi tetap memakai kemampuan updater SSH existing; halaman tidak memantau proses pemasangan/rollback dan menyatakannya secara eksplisit. Tidak menguji pengiriman J&T, email, atau pembaruan aplikasi nyata untuk pekerjaan ini.
