"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="mx-auto max-w-6xl rounded-xl border border-zinc-200 bg-white p-6">
      <h1 className="text-xl font-bold">Promosi belum dapat dimuat</h1>
      <p role="alert" className="my-3 text-sm text-zinc-600">
        Periksa koneksi dan coba kembali. Perubahan terakhir mungkin sudah
        tersimpan; periksa daftar sebelum mengirim ulang.
      </p>
      <button
        className="min-h-11 rounded-lg px-4 text-sm font-semibold"
        style={{
          background: "var(--store-primary,#111)",
          color: "var(--store-primaryText,#fff)",
        }}
        onClick={reset}
      >
        Coba lagi
      </button>
    </section>
  );
}
