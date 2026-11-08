"use client";

import { useState } from "react";

export function EmailOtpTest({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<"idle" | "sending" | "accepted" | "error" | "limited">("idle");

  async function send() {
    setState("sending");
    try {
      const response = await fetch("/api/v1/admin/email-otp/test", { method: "POST", redirect: "error" });
      setState(response.ok ? "accepted" : response.status === 429 ? "limited" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <button type="button" disabled={!enabled || state === "sending"} onClick={send}
        className="min-h-11 w-full rounded-xl bg-zinc-950 px-5 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-offset-4 disabled:opacity-50 sm:w-auto">
        {state === "sending" ? "Mengirim…" : "Kirim Email Test"}
      </button>
      <p role="status" className="mt-3 text-sm text-zinc-700">
        {state === "accepted" && "Layanan menerima email uji. Periksa kotak masuk atau folder spam."}
        {state === "error" && "Email uji gagal dikirim. Coba lagi nanti atau hubungi Buattokosendiri."}
        {state === "limited" && "Batas pengiriman Email & OTP Beta tercapai. Email belum dikirim. Coba lagi setelah batas pulih."}
      </p>
    </>
  );
}
