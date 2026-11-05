# Hubify: integrasi J&T untuk uji pemilik
Cabang ini hanya untuk Hubify. Jangan masukkan ke template rilis sebelum pemilik menyatakan uji live stabil.

- Pengiriman mempunyai submenu Manual dan API J&T Express.
- Toggle J&T disimpan bersama konfigurasi. Satu metode aktif untuk checkout; menonaktifkan J&T memerlukan tarif Manual tersimpan.
- Mapping mengenali header CSV/XLSX, memvalidasi semua baris, menyimpan dan mengaktifkan dalam satu transaksi. Revisi checkout/pesanan sebelumnya mempertahankan mapping masing-masing.
- Kolom template tersedia di /templates/jnt-mapping.csv. Kode wilayah carrier harus berasal dari J&T.
- Pilihan EZ, HBO, JND, JSD disimpan; checkout hanya menampilkan pilihan yang dikembalikan oleh API. Sesuai konfirmasi pemilik akun, expresstype memakai kode layanan tersebut. Konfigurasi historis tetap dapat dibaca.
- Test API memakai HEAD pada keempat URL yang diizinkan, tanpa payload order, resi, atau cancellation. Hasil mencerminkan HTTP sebenarnya; 405 berarti HEAD tidak didukung. HTTP 200 bukan bukti autentikasi atau keberhasilan transaksi.
- Bukti uji tarif tidak lagi menjadi syarat aktivasi. Validasi konfigurasi, mapping, izin admin dan environment carrier tetap berlaku.
- Tidak ada migrasi database atau rilis template pada perubahan ini.
