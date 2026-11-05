# Pengujian instalasi dan update

CI menjalankan dua profil Ubuntu 24.04: runner disposable biasa dan guest QEMU/KVM
yang benar-benar diberi **2048 MiB RAM, 2 vCPU dan swap 2 GiB**. Browser berjalan di
host; aplikasi, PostgreSQL, Caddy, proses build dan installer berada di guest sehingga
browser pengujian tidak memakai RAM VPS. Host key SSH guest dibuat/dipatok oleh
fixture sebelum boot; bukan penerimaan host key tanpa verifikasi.

Keduanya melakukan clone GitHub pada exact SHA, wizard browser, penguncian admin
sebelum verifikasi, interupsi DNS/build/bootstrap, login, katalog kosong, produk/foto,
draft/publish branding, restart, dua paket versi disposable, backup/restore dan
rollback kode setelah aktivasi gagal. Fixture updater hanya diterima bila
`GITHUB_ACTIONS=true` dan instalasi secara eksplisit LOCAL_TEST. Mode produksi
tidak menerima paket fixture atau menurunkan validasi release resmi.

Unit test memeriksa DNS kosong, salah, benar, ketidaksamaan resolver, AAAA konflik,
alamat publik, password, recovery secret, SQL migrasi dan archive berbahaya. Kasus
DNS unit adalah simulasi terkontrol; jangan dilaporkan sebagai pengamatan DNS publik.
TLS lokal benar-benar memeriksa CA lokal Caddy dan hostname, tanpa `curl -k`, tetapi
tetap **bukan** bukti sertifikat ACME publik.

`resources-2gb.json` mengambil sampel `/proc` guest setiap detik: MemTotal, vCPU,
SwapTotal, puncak `MemTotal-MemAvailable`, puncak swap terpakai, Node RSS/HWM,
durasi build berhasil, swap-in/out, major page faults dan delta OOM kill. Ukuran heap
Node (build 1024 MiB, runtime 512 MiB) tidak sama dengan total RSS. CI menolak profil
yang tidak benar-benar 2 GB atau mengalami OOM. Statistik peak bersifat sampling;
RSS/HWM proses melengkapi sampel tekanan RAM guest.

Artifact berisi JSON dan screenshot wizard/storefront/dashboard. Untuk uji publik
gunakan VPS/domain disposable yang diotorisasi, verifikasi host key dari sumber
tepercaya, catat A/AAAA dua resolver, challenge HTTP/HTTPS dan sertifikat yang
divalidasi trust store publik. Jangan memakai gheverhan.store atau kredensial J&T
Production. Akses atau DNS publik yang belum tersedia dilaporkan sebagai blocker.

## Bukti pengujian 5 November 2026

Pengujian aplikasi di Tencent dan guest 2 GB berikut menggunakan source
`9fbf6dae69db3b82a82752c98ee72d0df748c184`. Perubahan berikutnya pada CI/CLI dicatat
pada PR; nilai berikut merupakan hasil pengukuran, bukan estimasi kebutuhan RAM.

| Ukuran | Tencent 43.173.41.24 | Guest QEMU/KVM |
| --- | ---: | ---: |
| vCPU | 2 | 2 |
| MemTotal | 1982104 KiB | 2014844 KiB |
| SwapTotal | 2035708 KiB | 2097148 KiB |
| Peak RAM (total − available) | 1767768 KiB | 1871780 KiB |
| Peak swap terpakai | 448924 KiB | 424732 KiB |
| Build berhasil | 234,4 detik | 195,6 detik |
| Delta OOM kill | 0 | 0 |

Runtime Tencent terukur 222300 KiB RSS/HWM pada akhir pengujian. Heap runtime
512 MiB dan heap build 1024 MiB berhasil menjalankan skenario ini; build Node HWM
Tencent mencapai 931252 KiB. Nilai tersebut memvalidasi profil minimal untuk beban
uji ini, bukan janji kapasitas tak terbatas untuk semua katalog/traffic.

Tencent: DNS dua resolver cocok, tanpa AAAA konflik, sertifikat publik Let's Encrypt
YE2 untuk `uji.hubify.web.id` tervalidasi dengan trust store/hostname, serta challenge
port 80 dan 443 terbukti dari klien di luar VPS. Admin dibuat setelah verifikasi,
katalog/pelanggan/transaksi/media awal kosong, login serta produk/foto berhasil,
dan akun/brand/stok/media bertahan sesudah restart. Listing memakai cache data
30 detik; pemeriksaan publik setelah restart mencakup revalidasi cache dan decode
foto, bukan hanya keberadaan file. Setup pertama telah dicabut.

Guest 2 GB juga lulus dua versi disposable: update additive ke 1.0.1, restore dump
ke database pemeriksaan serta ekstraksi media/config, kemudian kegagalan aktivasi
1.0.2 memulihkan kode/container 1.0.1. Skema additive yang sudah berjalan tetap ada;
tidak ada rollback database penuh yang diklaim.

- [Laporan Tencent dan sertifikat publik](evidence/tencent-2gb.json)
- [Pengukuran guest 2 GB](evidence/vm2gb-resources.json)
- [Wizard: nama toko](evidence/wizard-1-name.png)
- [Wizard: domain publik](evidence/wizard-2-public-domain.png)
- [Wizard: buat admin](evidence/wizard-3-admin.png)
- [Wizard: selesai](evidence/wizard-4-complete.png)
- [Dashboard awal kosong](evidence/admin-empty.png)
- [Storefront sesudah restart](evidence/storefront-after-restart.png)

Paket release resmi belum diterbitkan. CLI produksi menampilkan status tersebut
dan menolak paket fixture CI. Pengujian updater fixture dibatasi ke instalasi
LOCAL_TEST di CI; tidak diaktifkan pada Tencent. Data yang tersisa di VPS uji
adalah satu produk/foto sintetis dan satu admin uji, bukan data toko sumber.
