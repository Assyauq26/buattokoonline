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
