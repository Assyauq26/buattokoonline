# Agent platform pusat M1

Nama platform: **Buat Toko Online Sendiri**. Platform pusat berada di repository
`Assyauq26/buattokosendiri-landing`. Repository ini tetap master aplikasi toko.
Hubify adalah satu-satunya lingkungan pengembangan aplikasi toko; tidak ada
layanan staging tambahan. File helper yang namanya mengandung `staging` masih
dipakai deployment Hubify dan sengaja tidak diubah tanpa instruksi tersendiri.

`installer/agent.py` menghubungkan VPS seller melalui HTTPS keluar. Agent mengambil
pekerjaan bertipe tetap, memverifikasi versi tag **dan exact SHA rilis yang disetujui**,
menjalankan `install.sh`, lalu memakai `installer/core.py` terpasang. Tidak ada
implementasi ulang database, DNS, HTTPS, bootstrap admin, health check, atau recovery.
Core dan wizard lokal tetap kompatibel. Tidak ada endpoint remote shell atau update.

Bootstrap dikemas platform dengan checksum SHA-256 agent. Token pairing dimasukkan
melalui prompt tersembunyi, bukan argumen shell. Credential agent dan password awal
administrator hanya disimpan root-only di `/etc/btos-agent`. Status yang dikirim
dibatasi ke tahap, versi, IP publik, hasil HTTPS/health, dan kode kesalahan umum.

Persyaratan: Ubuntu 24.04, 2 vCPU, RAM 2 GB (swap 2 GB bila RAM <4 GB), disk kosong
12 GB, systemd, VPS kosong, koneksi keluar HTTPS dan port masuk HTTP/HTTPS.
Installer menolak data existing yang tidak dimiliki proses pairing ini.

## Pemulihan

- Progres dikirim melalui outbox lokal durable dengan nomor urut idempoten.
- Koneksi putus tidak membuat token pairing baru atau menghapus database.
- Setelah gagal atau menunggu DNS, seller memilih Periksa lagi pada platform.
- Password bootstrap tetap tersedia root-only selama pemulihan; tidak dibuat ulang.
- Untuk pemulihan wizard lokal: hentikan `btos-agent`, jalankan service setup lama,
  gunakan SSH tunnel ke 127.0.0.1:8787. Jangan menjalankan dua pengendali sekaligus.
- Pencabutan token platform menghentikan komunikasi berikutnya. Untuk berhenti
  segera, operator menjalankan `systemctl stop btos-agent`. Tinjau progres sebelum
  melanjutkan operasi lokal. Jangan reset volume.

## Rilis dan batas verifikasi

Agent didistribusikan sebagai bagian platform yang dipatok ke commit sumber;
aplikasi toko tetap diambil dari tag stabil yang disetujui. Daftar persetujuan
kosong secara default. Menambahkan adapter ini tidak menjadikan HEAD development
sebagai rilis installer. Pengujian controller lokal bukan bukti instalasi VPS:
uji Ubuntu disposable, DNS nyata, HTTPS publik, dan health check tetap diperlukan.
