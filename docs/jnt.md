# J&T milik toko

Kredensial awal kosong. Menu **Integrasi J&T** hanya dapat diakses Admin toko
dengan izin `shipping.update`. Kredensial disimpan terenkripsi AES-256-GCM di
database toko; kunci acak berada di konfigurasi server toko. Tidak ada akun platform,
izin BTOS atau identitas tenant.

Isi kredensial sandbox/production yang diberikan J&T, gudang asal, layanan EZ,
referensi perjanjian dan tanggal berlaku. Uji Check Fee tidak membuat AWB. Tombol
Order/Tracking/Cancel tidak mengarang uji aman jika endpoint tidak menyediakan
probe tanpa efek samping. Hasil uji bukan jaminan semua wilayah siap.

Untuk operasi API, pemilik server memilih `SHIPPING_PROVIDER=jnt`,
`JNT_API_ENV=sandbox` atau `production`. Production memerlukan
`JNT_PRODUCTION_API_APPROVED=yes`; pembuatan AWB memerlukan
`JNT_ENABLE_ORDER_CREATE=yes` dan, untuk production, `JNT_PRODUCTION_ORDER_APPROVED=yes`.
Flag lokal ini menyatakan keputusan pemilik toko untuk memakai API berbayar/live;
tidak dikirim ke platform lain. Buat ulang app sesudah mengubah environment.

Mapping wilayah resmi J&T **tidak disertakan** karena merupakan data kontrak carrier.
Pemilik memasukkan CSV miliknya sendiri dengan header:

```csv
Provinsi,Kota,Kecamatan,Provinsi JNT,Kota JNT,Kode Kota JNT,Kecamatan JNT,Kode JNT
```

Simpan root-only di `/etc/single-store/jnt-l3-official.csv`. Jalankan helper dalam
tools dengan bind mount file tersebut ke `/app/resources/jnt-l3-official.csv`.
Gunakan `--preview` untuk review hasil, `--stage` dengan `JNT_MAPPING_IMPORT_APPROVED=yes`
dan `JNT_MAPPING_EXPECTED_ROWS` jumlah baris data yang telah diperiksa (tanpa header),
lalu `--activate` dengan flag tersebut, `JNT_MAPPING_APPROVED_VERSION` persis hash
hasil preview dan `JNT_MAPPING_REVIEWER` identitas admin. Hanya pemetaan exact dan
unik yang diaktifkan. Jangan menyetujui dugaan wilayah sebagai mapping carrier.

```bash
sudo install -d -m 700 /var/lib/single-store/jnt-reports
sudo docker compose -f /opt/single-store/deploy/compose.yaml run --rm --user 0:0 \
  -v /etc/single-store/jnt-l3-official.csv:/app/resources/jnt-l3-official.csv:ro \
  -v /var/lib/single-store/jnt-reports:/app/.jnt-mapping-report \
  tools node scripts/jnt/reconcile-l3.mjs --preview
```

Untuk `--stage`/`--activate`, tambahkan flag `-e NAMA_VARIABEL=nilai` sebelum `tools`
untuk variabel persetujuan di atas. CLI sementara dijalankan sebagai root di container
agar dapat membaca CSV root-only; service aplikasi tetap berjalan sebagai user biasa.
Laporan tersimpan di `/var/lib/single-store/jnt-reports`. Jumlah baris tidak dikunci
ke dataset toko sumber; gunakan hanya data carrier yang memang berhak digunakan toko.

Transport mempertahankan allowlist HTTPS J&T, batas waktu, validasi signature,
validasi berat, kepemilikan pesanan, dan ledger request. Hasil AWB tidak pasti
ditandai `UNKNOWN` dan tidak otomatis dikirim ulang. Rekonsiliasi langsung dengan
J&T sebelum tindakan berikutnya. Tidak ada kredensial/live order sumber yang dipakai
untuk tes template ini.
