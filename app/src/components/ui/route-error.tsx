"use client";
import { Button } from "./button";
export function RouteError({ reset }: { reset: () => void }) {
  return <section className="space-y-4 py-8" role="alert">
    <h1 className="text-xl font-semibold">Halaman belum dapat dimuat</h1>
    <p className="text-sm text-ink-soft">Periksa koneksi Anda, lalu coba muat ulang. Perubahan yang sudah disimpan tetap tersimpan.</p>
    <Button type="button" onClick={reset}>Coba lagi</Button>
  </section>;
}
