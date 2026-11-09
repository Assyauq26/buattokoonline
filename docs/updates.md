# Release dan update lokal

Menu **Update Versi** di dashboard admin menampilkan versi dari konfigurasi container.
Tombol **Periksa rilis** membaca metadata publik GitHub; kompatibilitas paket baru
diverifikasi oleh updater VPS. Jika metadata versi belum tersedia (misalnya saat
pertama diperbarui melalui updater lama), cek versi melalui SSH.
Pemilik toko menjalankan `sudo bash /opt/single-store/manager/update.sh --check`,
lalu `--apply --version X.Y.Z` dengan versi yang sudah diperiksa.
Hubify menampilkan jalur pengembangan dan commit aktif; operator memakai deploy kandidat.
Semua request updater adalah metadata/asset publik
GitHub; tidak memerlukan akun platform atau token GitHub seller.

Sumber resmi dipatok ke `Assyauq26/buattokoonline`, repository ID `1446326256`.
Updater hanya menerima release stabil, nama asset `store-vX.Y.Z.tar.gz`, digest
`sha256:` dari API GitHub, tag Git yang terurai menjadi SHA commit, dan manifest
yang cocok. Isi setiap file juga diperiksa. Redirect download dibatasi ke host
GitHub. Path traversal, symlink, duplikasi path dan paket berlebihan ditolak.
Kepercayaan distribusi bertumpu pada TLS GitHub dan hak penerbit repository tersebut;
digest bukan tanda tangan independen yang melindungi dari akun penerbit yang dibajak.

## Menerbitkan versi

**Upgrade ke v1.5.0:** memerlukan migrasi operator dan menandai
`rollback_compatible: false`, sehingga updater otomatis berhenti sebelum downtime.
Jangan memaksa melewati guard. Kode lama tidak mengenali ledger refund baru.
Lihat [catatan rilis v1.5.0](v1.5.0-release.md) untuk batasan dan prosedur rollback.

**Upgrade v1.0.0 → v1.1.0:** updater otomatis menghentikan pemasangan jika
migrasi `20261105100000_shipping_settings` belum tercatat. Migrasi ini menyiapkan
tabel pengaturan J&T, foreign key, dan menyalin konfigurasi aktif. Operator perlu
menyiapkan backup serta memeriksa migrasi dan hasil restore pada salinan toko
sebelum menjadwalkan upgrade instalasi lama. Instalasi baru menggunakan migrasi
normal saat setup. Jangan menjalankan bootstrap ulang untuk meng-upgrade toko.

Adaptasi perubahan source utama secara selektif; jangan mengimpor database, seed,
secret, foto, platform atau riwayat produksi. Naikkan `VERSION` menjadi semver stabil,
review `release-policy.json`, jalankan CI lengkap, lalu buat tag yang cocok.
Workflow `release.yml` dapat dijalankan manual pada tag yang cocok untuk membuat **draft** GitHub Release dari file tracked beserta
manifest checksum/migrasi. Pemilik melakukan review terakhir sebelum menerbitkan
release stabil. Draft/prerelease tidak diterima updater. Tidak ada release stabil
yang diterbitkan otomatis oleh pekerjaan implementasi ini.

Riwayat migrasi yang sudah terpasang tidak boleh diedit/hilang. Kontrak DB v1 saat
ini otomatis menerima grammar konservatif: CREATE TABLE baru dengan kolom dasar
tanpa default fungsi/FK, CREATE INDEX non-unique pada kolom biasa, dan ADD COLUMN
nullable dengan tipe dasar. SQL lain, constraint baru pada tabel existing, perubahan
tipe, DML, prosedur dan operasi destruktif dihentikan sebelum downtime. Jangan
memalsukan `rollback_compatible` untuk melewati migrasi yang belum direview.

## Backup dan aktivasi

Updater memasang halaman persiapan 503, menghentikan timer lokal dan app agar media
dan database tidak menerima penulisan aplikasi. Backup root-only disimpan di
`/var/backups/single-store/ID/`: `database.dump`, `media.tar.gz`,
`configuration.tar.gz`, dan `backup.json` dengan checksum. Konfigurasi berisi secret;
enkripsi backup sebelum menyalinnya ke lokasi lain.

Source baru berada di `/opt/single-store/releases/`, dengan tag image terpisah.
Build/migrasi tidak mengganti image lama. Setelah migrasi additive, Compose diaktifkan,
readiness DB/media serta storefront/login HTTPS diperiksa. Metadata versi baru
ditulis setelah sehat. Image/source lama dan backup dipertahankan untuk recovery.
Build menimbulkan downtime; CLI memberi tahu sebelum konfirmasi `UPDATE vX.Y.Z`.

Uji restore nyata, tanpa menimpa database aktif:

```bash
sudo bash restore.sh --check /var/backups/single-store/ID
```

Perintah memverifikasi checksum, memulihkan dump ke database pemeriksaan sementara,
memeriksa akun/produk/identitas, mengekstrak media/config ke direktori privat, lalu
menghapus hanya database pemeriksaan. Ia tidak menyatakan database aktif telah
di-rollback. Hasil mencantumkan jumlah file media dan hash konfigurasi yang dipulihkan.

## Kegagalan dan interupsi

`/etc/single-store/update.json` mencatat versi lama, Compose, lokasi manager lama,
backup dan status. Setelah gangguan proses/server:

```bash
sudo bash update.sh --recover
```

Recovery mengaktifkan ulang kode/container lama dan metadata versinya. Migrasi
additive yang telanjur diterapkan tidak dihapus. Jika Prisma mencatat migrasi gagal,
atau inventory berbeda setelah rollback kode, update berikutnya ditolak. Operator
harus memeriksa skema, tabel `_prisma_migrations`, dan backup pada VM terpisah;
selesaikan/reconcile migrasi yang telah direview sebelum menerbitkan versi pengganti.
Tidak otomatis menjalankan migrasi turun, `prisma migrate reset`, seed atau
`docker compose down -v`.

Untuk pemulihan database penuh akibat kejadian di luar migrasi kompatibel, hentikan
seluruh penulisan, uji dump/media/config di server terpisah, pilih titik backup
bersama pemilik toko, dan lakukan restore terencana. Restore menimpa perubahan
setelah titik backup; bukan bagian rollback otomatis updater ini.

Instalasi lama PR #1 yang belum mempunyai `version.json` tetap ditolak aman oleh
updater. Jangan menjalankan ulang bootstrap. Adopsi metadata versi perlu review
inventory migrasi dan deployment existing oleh operator; tidak ditebak otomatis.
