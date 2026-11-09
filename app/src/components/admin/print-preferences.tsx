"use client";
import { useState, useEffect } from "react";
export function PrintPreferences() {
  const [size, setSize] = useState("100x150"),
    [message, setMessage] = useState("");
  useEffect(() => {
    try {
      const s = localStorage.getItem("awb-print-size");
      if (s === "75x150" || s === "100x150") setSize(s);
    } catch {
      setMessage("Penyimpanan perangkat tidak tersedia.");
    }
  }, []);
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold">Preferensi cetak AWB</h1>
      <label>
        Ukuran kertas
        <select
          className="ml-3 min-h-11 rounded-lg border p-2"
          value={size}
          onChange={(e) => {
            setSize(e.target.value);
            setMessage("");
          }}
        >
          <option value="75x150">75 × 150 mm</option>
          <option value="100x150">100 × 150 mm</option>
        </select>
      </label>
      <p>
        Preferensi disimpan di perangkat ini. Preview dan cetak resi aktif tetap
        melalui detail pesanan.
      </p>
      <button
        className="min-h-11 rounded-xl bg-primary p-3 text-white"
        onClick={() => {
          try {
            localStorage.setItem("awb-print-size", size);
            setMessage("Preferensi tersimpan.");
          } catch {
            setMessage("Penyimpanan perangkat tidak tersedia.");
          }
        }}
      >
        Simpan preferensi
      </button>
      <p role="status">{message}</p>
    </div>
  );
}
