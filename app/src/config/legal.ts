/** Draf editorial: lengkapi melalui review pemilik, bukan data kontak rekaan. */
export const legalProfile = {
  siteOrigin: process.env.APP_ORIGIN || "http://localhost:3000",
  updatedAt: "2026-10-18",
  updatedLabel: "18 Oktober 2026",
  status: "draft" as "draft" | "approved",
  draftNotice:
    "Draf dengan konten contoh/dummy untuk ditinjau pengelola. Identitas, kontak, serta kebijakan operasional belum disahkan sebagai ketentuan resmi.",
  operatorName: process.env.STORE_NAME || "Pengelola toko",
  legalEntity: null as string | null,
  postalAddress: null as string | null,
  contactEmail: null as string | null,
  customerServiceUrl: null as string | null,
};
export const termsSections = [
  [
    "Pendahuluan dan ruang lingkup",
    "toko ini adalah layanan toko online fashion untuk melihat produk, membuat akun, dan memesan barang. Ketentuan ini mengatur penggunaan website serta hubungan pemesanan antara pelanggan dan pengelola toko. Identitas badan usaha, alamat, dan kontak resmi pengelola perlu dilengkapi sebelum draf ini ditetapkan sebagai ketentuan resmi. Ketentuan wajib dibaca bersama Kebijakan Privasi dan informasi pada pesanan.",
  ],
  [
    "Persetujuan penggunaan layanan",
    "Bacalah informasi produk, harga, pembayaran, dan ketentuan sebelum menggunakan layanan. Saat mendaftar, Anda diminta menyatakan persetujuan melalui checkbox. Website belum menyediakan pencatatan persetujuan yang dikaitkan dengan versi dokumen tertentu. Ketentuan tidak menghilangkan hak konsumen yang diberikan peraturan perundang-undangan.",
  ],
  [
    "Pendaftaran dan keamanan akun",
    "Pendaftaran memerlukan nama, alamat email yang valid, password, dan persetujuan ketentuan. Nomor HP wajib diisi pada pendaftaran baru untuk kebutuhan akun dan komunikasi transaksi; pendaftaran menggunakan nomor HP saja belum tersedia. Email pendaftaran diverifikasi melalui kode OTP sebelum akun dibuat. Jaga kerahasiaan password dan akses email, keluar dari perangkat bersama, dan segera laporkan dugaan penyalahgunaan melalui kontak resmi. Login Google dan WhatsApp belum tersedia.",
  ],
  [
    "Tanggung jawab pengguna",
    "Berikan informasi yang benar dan terbaru, termasuk alamat serta kontak penerima. Anda bertanggung jawab atas tindakan yang dilakukan dengan akun Anda sepanjang berada dalam kendali Anda. Jangan membagikan token, tautan reset, atau password. Pengelola dapat membatasi akses yang disalahgunakan dengan tetap memperhatikan kewajiban hukum dan penyelesaian pesanan yang sah.",
  ],
  [
    "Informasi produk dan stok",
    "Deskripsi, ukuran, warna, foto, dan status produk membantu Anda memilih barang. Tampilan warna dapat berbeda menurut perangkat. Stok dan harga diperiksa kembali oleh sistem saat checkout; isi keranjang bukan jaminan ketersediaan permanen. Produk yang diarsipkan tidak dapat dipesan baru, sedangkan catatan pesanan sebelumnya tetap dipertahankan sesuai kebutuhan transaksi.",
  ],
  [
    "Harga, promo, voucher, dan flash sale",
    "Harga serta diskon yang berlaku ditampilkan di website. Voucher dapat memiliki batas penggunaan, minimum belanja, periode, dan batas per akun sesuai pengaturan promo. Flash sale mengikuti waktu aktif dan ketersediaan. Total yang dihitung server pada checkout menjadi acuan; bila harga berubah, periksa ulang dan setujui rincian yang baru sebelum melanjutkan. Promo tidak selalu dapat digabung.",
  ],
  [
    "Pemesanan dan checkout",
    "Periksa varian, jumlah, alamat, ongkir, voucher, dan total sebelum mengirim pesanan. Setelah berhasil, simpan nomor pesanan untuk komunikasi. Sistem dapat melakukan reservasi stok selama proses pembayaran. Jangan mengirim ulang pesanan yang sama ketika permintaan masih diproses; periksa status terlebih dahulu. Pemesanan dapat ditolak jika stok, data, atau validasi transaksi tidak memenuhi syarat.",
  ],
  [
    "Transfer bank dan verifikasi pembayaran",
    "Pembayaran saat ini menggunakan transfer bank manual ke rekening yang ditampilkan pada instruksi pesanan. Pastikan rekening dan nominal sebelum transfer. Unggah bukti yang terbaca dan sesuai transaksi; jangan menyertakan PIN, OTP, password, atau informasi lain yang tidak diperlukan. Mengunggah bukti hanya menempatkan pembayaran dalam pemeriksaan, bukan menyatakan pembayaran telah lunas. Admin dapat menyetujui, menolak dengan alasan, atau meminta bukti yang benar.",
  ],
  [
    "Pemrosesan pesanan",
    "Pesanan diproses sesuai status pembayaran dan hasil pemeriksaan admin. Pembayaran yang masih menunggu verifikasi belum dapat diperlakukan sebagai pembayaran berhasil. Jika bukti ditolak, ikuti petunjuk untuk mengunggah ulang. Tidak ada janji waktu verifikasi atau pemrosesan tertentu pada draf ini. Status pesanan dapat dilihat melalui akun yang membuat pesanan.",
  ],
  [
    "Pengiriman, ongkir, dan estimasi",
    "Pengiriman dan penetapan informasi operasionalnya saat ini dikelola secara manual. Periksa ongkir serta alamat sebelum checkout dan konfirmasikan detail yang belum jelas kepada pengelola. Informasi resi ditambahkan ketika tersedia. Estimasi pengantaran dapat dipengaruhi lokasi, kurir, dan keadaan di luar kendali pengelola; draf ini tidak menjanjikan layanan kurir, pengiriman instan, atau batas waktu tertentu.",
  ],
  [
    "Pembatalan pesanan",
    "Permintaan pembatalan dinilai berdasarkan status pembayaran, verifikasi, dan pemrosesan. Pesanan tanpa pembayaran yang memenuhi kondisi sistem dapat kedaluwarsa sesuai batas waktu yang ditampilkan. Bukti pembayaran yang sedang direview tidak berarti pesanan bebas dibatalkan. Pesanan yang telah lunas memerlukan pemeriksaan finansial; jangan menganggap pembatalan otomatis menghasilkan pengembalian dana. Konfirmasikan permintaan melalui kontak resmi dengan nomor pesanan.",
  ],
  [
    "Retur dan pengembalian dana",
    "Jika barang bermasalah atau tidak sesuai, simpan informasi pesanan dan bukti yang relevan lalu ajukan pemeriksaan melalui kontak resmi. Jangan mengirim barang retur tanpa instruksi pengelola. Sistem mempunyai proses admin untuk penilaian retur dan pengembalian dana, tetapi tidak menjanjikan persetujuan otomatis. Contoh konten dummy untuk ditinjau: pengajuan retur paling lambat 7 hari setelah barang diterima, dengan barang belum dipakai dan label tetap terpasang; ongkir dan pengembalian dana ditentukan setelah pemeriksaan. Angka serta syarat contoh ini belum menjadi kebijakan aktif dan tidak mengaktifkan layanan atau SLA otomatis. Pemilik perlu menggantinya sebelum pengesahan, tanpa membatasi hak konsumen yang diwajibkan hukum.",
  ],
  [
    "Hak dan kewajiban pelanggan",
    "Anda berhak memperoleh informasi yang jelas, menggunakan layanan secara wajar, memeriksa status pesanan, dan mengajukan keluhan atas transaksi. Anda berkewajiban memeriksa rincian pesanan, membayar sesuai instruksi, serta tidak memalsukan bukti pembayaran. Penanganan keluhan memerlukan informasi yang cukup dan hanya data yang relevan dengan masalah tersebut.",
  ],
  [
    "Penggunaan yang dilarang",
    "Dilarang melakukan akses tanpa hak, mengambil data akun orang lain, menyebarkan malware, memalsukan identitas atau pembayaran, menyalahgunakan voucher, memanipulasi stok, mengganggu layanan, maupun mencoba melewati kontrol keamanan. Pengelola dapat menyelidiki aktivitas tersebut dan mengambil langkah yang proporsional sesuai hukum. Jangan menggunakan layanan untuk transaksi yang melanggar peraturan.",
  ],
  [
    "Hak kekayaan intelektual",
    "Nama, tampilan, materi editorial, serta aset yang dimiliki atau dilisensikan kepada pengelola toko dilindungi ketentuan kekayaan intelektual yang berlaku. Anda boleh menggunakan website untuk berbelanja dan memperoleh informasi. Penggunaan ulang untuk tujuan lain memerlukan hak atau izin yang sesuai. Merek pihak ketiga tetap menjadi milik pemegangnya dan tidak menunjukkan adanya kerja sama yang tidak dinyatakan.",
  ],
  [
    "Tanggung jawab yang wajar",
    "Pengelola berupaya menjaga ketepatan informasi dan keamanan layanan, namun gangguan teknis atau perubahan ketersediaan dapat terjadi. Kerugian ditangani menurut penyebab, bukti, dan hukum yang berlaku. Tidak ada klausul dalam draf ini yang membebaskan tanggung jawab yang secara hukum tidak boleh dikesampingkan, atau menghapus hak Anda atas penyelesaian masalah barang dan transaksi.",
  ],
  [
    "Perubahan ketentuan",
    "Ketentuan dapat diperbarui untuk mencerminkan perubahan layanan atau hukum, disertai tanggal pembaruan. Perubahan material perlu diinformasikan dengan cara yang wajar. Ketentuan baru tidak serta-merta mengubah hak transaksi yang sudah terjadi. Periksa kembali dokumen ini sebelum transaksi berikutnya; tidak ada klaim bahwa versi persetujuan pengguna telah disimpan oleh sistem.",
  ],
  [
    "Perselisihan dan hukum yang berlaku",
    "Sampaikan keluhan terlebih dahulu kepada pengelola agar dapat diupayakan penyelesaian secara musyawarah berdasarkan catatan transaksi. Jika belum selesai, para pihak dapat menggunakan mekanisme penyelesaian sengketa yang tersedia menurut hukum Indonesia, termasuk lembaga perlindungan konsumen atau pengadilan yang berwenang. Ketentuan ini tidak membatasi pilihan atau hak yang dilindungi hukum.",
  ],
  [
    "Kontak layanan pelanggan",
    "Cantumkan nomor pesanan dan ringkasan masalah saat menghubungi layanan pelanggan melalui kanal resmi yang telah dikonfirmasi. Jangan mengirim password, OTP, atau token login. Rincian kontak dan identitas pengelola tercantum pada bagian Kontak dokumen ini apabila sudah ditetapkan. Draf ini belum mengarang alamat, nomor telepon, atau email perusahaan.",
  ],
] as const;
export const privacySections = [
  [
    "Pendahuluan dan pengelola layanan",
    "Kebijakan ini menjelaskan pemrosesan data dalam penggunaan toko ini. Pengelola bertanggung jawab atas tujuan dan penggunaan data untuk layanan toko. Identitas badan usaha dan kontak perlu dilengkapi sebelum pengesahan. Draf ini disusun dengan mempertimbangkan UU Nomor 27 Tahun 2022 tentang Perlindungan Data Pribadi dan ketentuan terkait; bukan pernyataan bahwa kepatuhan hukum telah diaudit atau dijamin.",
  ],
  [
    "Kategori data yang dikumpulkan",
    "Layanan dapat memproses nama, email, nomor telepon opsional, alamat pengiriman, informasi pesanan, bukti pembayaran, status pembayaran, pengiriman, dan komunikasi terkait layanan. Informasi teknis dapat mencakup sesi, waktu aktivitas, status keamanan, serta log kesalahan terbatas. Berikan hanya data yang diperlukan. Jangan mengunggah identitas atau informasi finansial tambahan yang tidak diminta untuk transaksi.",
  ],
  [
    "Cara pengumpulan data",
    "Data diperoleh ketika Anda mendaftar, login, mengisi alamat, membuat pesanan, menggunakan voucher, mengunggah bukti, atau menghubungi pengelola. Sebagian data dibuat saat layanan memproses transaksi dan keamanan akun. Infrastruktur dapat memproses informasi koneksi yang diperlukan untuk melayani permintaan. Website belum menyediakan integrasi login Google atau WhatsApp; tombol tersebut bukan pengumpulan data melalui provider login.",
  ],
  [
    "Tujuan dan dasar pemrosesan",
    "Data digunakan untuk menyediakan akun, memenuhi pesanan, memverifikasi transfer, mengelola pengiriman, menangani keluhan/refund, dan melindungi layanan dari penyalahgunaan. Dasar pemrosesan dapat berupa pelaksanaan perjanjian, kewajiban hukum, kepentingan yang sah dengan mempertimbangkan hak Anda, atau persetujuan apabila memang diperlukan. Persetujuan untuk tujuan opsional harus dapat dibedakan dari kebutuhan transaksi; draf ini tidak mengklaim adanya langganan marketing otomatis.",
  ],
  [
    "Akun, kontak, dan alamat pengiriman",
    "Email diperlukan untuk pendaftaran dan pengenalan akun; nomor HP diwajibkan bagi akun baru dan digunakan sesuai kebutuhan akun, kontak, dan pengiriman. Email diverifikasi dengan kode OTP yang berlaku singkat sebelum akun baru diaktifkan. Alamat serta data penerima dipakai untuk pemenuhan pesanan. Pastikan Anda berhak memberikan data orang lain sebagai penerima dan informasikan penggunaannya. Password disimpan sebagai hash, bukan disediakan sebagai teks biasa untuk dibaca pengelola.",
  ],
  [
    "Pesanan dan transaksi",
    "Rincian barang, jumlah, harga, voucher, ongkir, alamat penerima, serta status pesanan dan pembayaran diproses untuk memenuhi dan mencatat transaksi. Pencatatan stok, reservasi, refund, dan pengiriman membantu menjaga konsistensi operasional. Data transaksi dapat tetap diperlukan setelah akun tidak lagi dipakai untuk kewajiban pencatatan, pembuktian, atau penyelesaian sengketa yang sah.",
  ],
  [
    "Bukti pembayaran",
    "Bukti transfer diunggah untuk membantu pemeriksaan pembayaran manual. File disimpan pada bucket pembayaran private dan diakses melalui server berdasarkan kepemilikan pesanan atau kewenangan admin. Pengunggahan bukti tidak otomatis membuktikan pembayaran telah diterima. Batasi informasi pada bukti; tutupi data rekening lain yang tidak relevan bila memungkinkan, tanpa menghilangkan informasi yang diperlukan untuk pencocokan transaksi. Kebijakan ini tidak mengklaim enkripsi ujung ke ujung atau jadwal penghapusan otomatis.",
  ],
  [
    "Cookies dan sesi autentikasi",
    "Website memakai cookie sesi untuk mengenali login dan menyediakan halaman terlindungi. Source menetapkan HttpOnly, SameSite=Lax, dan Secure pada lingkungan production; token memiliki masa berlaku terbatas. Sistem memeriksa versi sesi dan pencabutan token, termasuk setelah logout/reset password. Pemeriksaan tersebut membutuhkan database yang siap. Cookie yang diperlukan untuk autentikasi berbeda dari pelacakan pemasaran; kebijakan ini tidak menyatakan adanya consent manager atau analytics tambahan yang belum dikonfirmasi.",
  ],
  [
    "Email transaksional",
    "Pengiriman email reset password menggunakan Resend apabila provider dan sender sudah dikonfigurasi. Email berisi tautan reset sekali pakai dengan masa berlaku terbatas. Informasi email dan isi pesan yang diperlukan diproses oleh provider untuk pengiriman. Draf ini tidak menjanjikan bahwa semua jenis notifikasi pesanan tersedia, atau bahwa newsletter otomatis dikirim. Pengelola tidak akan meminta password atau OTP melalui balasan email.",
  ],
  [
    "Penyedia layanan dan penerima data",
    "Aplikasi, database PostgreSQL, dan media disimpan pada server milik pengelola. Resend digunakan untuk email apabila dikonfigurasi. Penyedia memproses data yang diperlukan untuk fungsi tersebut sesuai konfigurasi dan hubungan layanan pengelola. Dalam pengiriman manual, data penerima yang diperlukan dapat disampaikan kepada pihak pengiriman yang dipilih. Tidak ada klaim sertifikasi, kontrak pemrosesan tertentu, daftar subprocessor, atau mekanisme proteksi provider yang belum diverifikasi.",
  ],
  [
    "Penyimpanan dan perlindungan data",
    "Akses aplikasi dibatasi dengan autentikasi, peran, dan pemeriksaan kepemilikan. Bukti pembayaran tidak dimaksudkan menjadi file publik, sementara gambar katalog dapat tersedia untuk umum. Pembatasan percobaan autentikasi dan pencatatan peristiwa keamanan membantu perlindungan akun. Tidak ada sistem yang kebal terhadap gangguan; kebijakan ini tidak menjanjikan keamanan mutlak, backup otomatis, pemulihan titik waktu, atau perlindungan yang belum dibuktikan.",
  ],
  [
    "Retensi data",
    "Lama penyimpanan ditentukan menurut tujuan pemrosesan, status pesanan/keluhan, kebutuhan pembuktian, kewajiban hukum, serta kebutuhan keamanan yang proporsional. Contoh konten dummy untuk ditinjau: data transaksi disimpan hingga 2 tahun dan bukti pembayaran hingga 90 hari setelah penyelesaian transaksi, dengan pengecualian untuk kewajiban hukum atau sengketa. Angka ini hanya contoh editorial, bukan jadwal retensi aktif atau penghapusan otomatis; pemilik harus menetapkan dasar dan jangka waktu yang benar sebelum pengesahan. Berakhirnya sesi tidak berarti catatan transaksi atau seluruh data akun langsung terhapus.",
  ],
  [
    "Hak pemilik data pribadi",
    "Sesuai hukum dan kondisi yang berlaku, Anda dapat meminta informasi pemrosesan, akses, koreksi, pembaruan, pengakhiran pemrosesan, penghapusan/pemusnahan, penarikan persetujuan pada pemrosesan berbasis persetujuan, pembatasan, atau hak lain yang diberikan UU PDP. Pelaksanaan hak dapat mempunyai pengecualian yang sah, misalnya kewajiban penyimpanan dan sengketa. Tidak ada biaya atau batas waktu respons tertentu yang dijanjikan tanpa dasar yang telah ditetapkan.",
  ],
  [
    "Permintaan akses atau penghapusan",
    "Ajukan permintaan melalui kontak privasi resmi dengan menjelaskan jenis permintaan dan akun/pesanan yang relevan secara minimal. Pengelola perlu memverifikasi kewenangan secara proporsional agar tidak mengungkap atau menghapus data orang lain. Jangan mengirim password, token, atau salinan identitas lengkap tanpa kebutuhan dan kanal aman yang jelas. Sistem belum mempunyai fitur self-service untuk penghapusan seluruh akun; permintaan perlu ditangani pengelola dengan mempertimbangkan transaksi aktif dan kewajiban hukum.",
  ],
  [
    "Pengungkapan yang sah",
    "Data dapat diungkapkan sebatas kebutuhan pemenuhan layanan, penyelesaian pembayaran/pengiriman/keluhan, perlindungan hak, atau permintaan pihak yang berwenang berdasarkan hukum. Pengungkapan harus mempunyai dasar yang sah dan dibatasi pada informasi yang relevan. Draf ini tidak memberikan izin umum untuk menjual data atau menggunakan bukti pembayaran untuk tujuan pemasaran.",
  ],
  [
    "Pemrosesan lintas negara",
    "Hosting, database, penyimpanan, email, atau dukungan provider dapat melibatkan pemrosesan di luar Indonesia sesuai lokasi layanan dan jaringan penyedianya. Pengelola perlu menilai dasar dan perlindungan transfer lintas negara yang relevan menurut hukum. Draf ini tidak menjamin semua data disimpan di Indonesia atau mengklaim mekanisme transfer kontraktual tertentu yang belum dikonfirmasi.",
  ],
  [
    "Privasi anak",
    "Layanan tidak dirancang untuk mengumpulkan data anak tanpa perlindungan yang diperlukan. Jika pengguna belum dapat memberikan persetujuan atau melakukan transaksi secara sah, keterlibatan orang tua/wali diperlukan sesuai hukum yang berlaku. Hubungi pengelola bila terdapat data anak yang diproses tanpa kewenangan; penanganan dilakukan setelah verifikasi dan pertimbangan kewajiban transaksi.",
  ],
  [
    "Perubahan kebijakan",
    "Perubahan layanan, provider, praktik pemrosesan, atau hukum dapat memerlukan pembaruan kebijakan. Tanggal pembaruan membantu Anda melihat versi yang disajikan. Perubahan material perlu dikomunikasikan dengan cara yang wajar dan persetujuan baru diperoleh bila diwajibkan. Website belum mencatat consent yang dikaitkan dengan versi dokumen tertentu; draf ini tidak menyatakan sebaliknya.",
  ],
  [
    "Pertanyaan dan kontak privasi",
    "Gunakan kontak resmi yang dicantumkan pengelola untuk pertanyaan privasi, keluhan, dan pelaksanaan hak. Sampaikan informasi minimum agar permintaan dapat dikenali tanpa mengirim password atau bukti pembayaran lengkap yang tidak relevan. Identitas dan kontak yang masih belum lengkap pada draf harus dikonfirmasi sebelum dokumen ini disahkan sebagai kebijakan resmi.",
  ],
] as const;
