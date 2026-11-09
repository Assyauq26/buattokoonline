import Link from "next/link";
export default function Page() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6 pb-32">
      <Link href="/account">← Kembali ke Akun</Link>
      <h1 className="text-2xl font-bold">Pusat Bantuan</h1>
      <p>
        Untuk pertanyaan pembayaran dan pengiriman, buka detail pesanan Anda.
        Jangan berikan password atau kode OTP kepada siapa pun.
      </p>
      <Link className="underline" href="/orders">
        Pesanan Saya
      </Link>
    </div>
  );
}
