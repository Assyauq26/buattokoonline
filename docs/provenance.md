# Asal kode dan batas distribusi

Pemilik repository `Assyauq26` meminta adaptasi aplikasi toko miliknya ke repository
`Assyauq26/buattokoonline` dan memilih Apache-2.0 (juga dicatat di README awal
commit `d0a1705`). Distribusi ini menggunakan otorisasi pemilik tersebut untuk kode
aplikasi, bukan menganggap repository publik otomatis memiliki izin lisensi.

Source: `frontend/` dari revision `0ce1f130b65cd8cbf2f1f3832cfda935632ff502` pada
[repository sumber](https://github.com/Assyauq26/Gheverhan). Hanya source aplikasi,
migrasi schema, referensi wilayah publik, helper build yang diperlukan, serta tes
domain dipilih. Riwayat Git sumber tidak diimpor.

Tidak disalin: database `.postgres`, backend lama, platform/portal/SaaS, agent,
landing, deploy produksi, konfigurasi Vercel/Netlify, seed produk, CSV privat J&T,
foto/banner, logo brand, data pelanggan, dan artefak pengujian produksi.
Gambar default Unsplash dan foto dashboard dihapus. Aset Google/WhatsApp tidak
didistribusikan. Logo default berupa teks dari identitas toko.

`NOTICE` dan lisensi MIT komponen Lumen, React, Braces serta referensi wilayah
dipertahankan. Dependensi npm memakai versi terkunci dan lisensinya masing-masing.
Apache-2.0 berlaku untuk kode proyek yang dimiliki/dilisensikan pemilik; tidak
memberikan hak merek pihak ketiga atau melisensikan ulang dependensi.

Pemindaian batas source dijalankan oleh `tests/repository-boundary.mjs` pada setiap
PR. Bootstrap dan tes VM memeriksa bahwa tabel bisnis dan media kosong. Review ini
bukan klaim bahwa audit hak cipta seluruh pihak ketiga dapat digantikan otomatis.
