# Sinkronisasi nama toko

Kandidat 11 November 2026, berpasangan dengan branch
codex/platform-operations-enrollment pada repository platform pusat.

Nama tampilan disimpan melalui jalur Informasi Toko dan Dekorasi Toko existing.
Publish/rollback menulis StoreMailBrandSync pada transaksi Prisma yang sama.
Worker sesudah commit mencoba menyelaraskan nama melalui relay scoped.
Maintenance per menit mencoba ulang dengan backoff maksimum satu jam.
Worker terlambat memakai revision dan attempt CAS sehingga tidak mengakui event yang telah diganti.

Relay mengautentikasi token melalui registry pusat. Sinkronisasi diteruskan melalui
control credential privat ke /api/platform/internal/mail-identity.
Tenant, origin, status aktif, agent dan revision diperiksa di pusat.
Nama disanitasi untuk header email. Sender domain tetap otp@buattokosendiri.web.id.
Selama sinkronisasi tertunda, tenant dinamis mengirim dengan nama registry terakhir.
Template, tujuan, kuota dan OTP tetap melewati validator existing.

Migration additive 20261111090000_store_mail_brand_sync membuat satu row event terakhir
dan mengaktifkan RLS. Identitas tenant pusat tetap menggunakan ID yang sama.
Riwayat perubahan nama tetap berada pada StoreAppearanceRevision.

Perubahan juga menyelaraskan installer/agent.py dan installer/platform-bootstrap.sh
dengan sumber platform. Agent baru melaporkan metadata operasional terpilih.
Updater baru memakai ID agent dalam representasi hex saat origin konfigurasi cocok.
Updater existing mempertahankan identitas dan state lokal, lalu melaporkan aliasnya.

Urutan aktivasi adalah controller platform, relay, migration toko dan aplikasi toko.
Relay lama mempertahankan validasi strict brand sehingga belum dapat menerima nama
yang berbeda sampai relay kandidat aktif.
Saat code rollback, pertahankan migration dan event. Jangan restore database toko
secara otomatis karena transaksi baru dapat hilang.

Bukti pengujian tersedia melalui tes mail-brand-sync database, appearance-mail-guard,
store-appearance-actions, store-mail-relay serta tests/store-identity-browser.mjs.
Browser memakai toko disposable dan tidak mengirim pesan nyata.

Pilot rename melalui Hubify publik dan verifikasi From email nyata belum dilakukan
pada kandidat ini. Detail audit, threat model, status milestone dan recovery berada
di docs/platform-operations-audit.md pada repository platform.
