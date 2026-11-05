"use client";
import { useId, useRef, useState } from "react";
import { reloadOperationPage } from "./operation-navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { operationPayload } from "./operation-payload";
export type OperationField = { name: string; label: string; type?: "text" | "number" | "textarea" | "select" | "checkbox" | "datetime-local" | "date" | "hidden"; value?: string | number; required?: boolean; min?: number; max?: number; maxLength?: number; options?: { value: string; label: string }[]; hint?: string };
export function OperationForm({ url, label, confirmation, fields, requestId = false, returnItems = false }: { url: string; label: string; confirmation: string; fields: OperationField[]; requestId?: boolean; returnItems?: boolean }) {
  const id = useId();
  const busy = useRef(false); const attempt = useRef<{ fingerprint: string; id: string }>();
  const feedback = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false); const [review, setReview] = useState(false);
  const [message, setMessage] = useState(""); const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  async function submit(form: HTMLFormElement) {
    if (busy.current) return; busy.current = true; setPending(true); setMessage(""); setErrors({});
    try {
      const payload = operationPayload(new FormData(form), fields.filter(f => f.type === "number" || (f.type === "hidden" && typeof f.value === "number")).map(f => f.name), fields.filter(f => f.type === "datetime-local" || f.type === "date").map(f => f.name), returnItems);
      if (requestId) { const fingerprint = JSON.stringify(payload); if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, id: crypto.randomUUID() }; payload.requestId = attempt.current.id; }
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok || !result.success) {
        setSuccess(false); setErrors(result.error?.details?.fieldErrors || {});
        setMessage(`${result.error?.message || "Perubahan gagal."}${response.status === 409 ? " Muat ulang data, periksa perubahan terbaru, lalu coba lagi." : ""}`);
      } else { setSuccess(true); setReview(false); setMessage("Perubahan berhasil disimpan."); attempt.current = undefined; reloadOperationPage(true); }
    } catch { setSuccess(false); setMessage("Koneksi terputus. Periksa data terbaru atau ulangi payload yang sama; request ID dipertahankan."); }
    finally { busy.current = false; setPending(false); requestAnimationFrame(() => feedback.current?.focus()); }
  }
  return <form className="space-y-4" aria-label={label} onChange={() => { setReview(false); setSuccess(false); setMessage(""); }} onSubmit={e => { e.preventDefault(); if (!review) { setReview(true); return; } void submit(e.currentTarget); }}>
    <fieldset disabled={pending} className="grid min-w-0 gap-4 sm:grid-cols-2">
      {fields.map(field => {
        const inputId = `${id}-${field.name}`; const error = errors[field.name]?.join(" ");
        if (field.type === "hidden") return <input key={field.name} type="hidden" name={field.name} value={field.value ?? ""} />;
        const props = { id: inputId, name: field.name, required: field.required, "aria-invalid": !!error, "aria-describedby": `${inputId}-help`, defaultValue: field.value, maxLength: field.maxLength ?? 2000 };
        return <div key={field.name} className={field.type === "textarea" || field.type === "checkbox" ? "min-w-0 sm:col-span-2" : "min-w-0"}>
          {field.type !== "checkbox" && <Label htmlFor={inputId}>{field.label}{field.required ? " *" : ""}</Label>}
          {field.type === "checkbox" ? <label htmlFor={inputId} className="flex items-start gap-3 text-sm"><input id={inputId} name={field.name} type="checkbox" required={field.required} className="mt-1 h-4 w-4 accent-black" />{field.label}</label> : field.type === "textarea" ? <Textarea {...props} /> : field.type === "select" ? <select {...props} className="h-11 w-full min-w-0 rounded-xl border border-line bg-white px-3 text-sm">{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <Input {...props} type={field.type || "text"} min={field.min} max={field.max} step={field.type === "number" || field.type === "datetime-local" ? 1 : undefined} />}
          <p id={`${inputId}-help`} className={`mt-1 text-xs ${error ? "text-destructive" : "text-ink-soft"}`}>{error || field.hint}</p>
        </div>;
      })}
    </fieldset>
    <div ref={feedback} tabIndex={-1} className="scroll-mt-24 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-black" aria-label={`Hasil ${label}`}>
      {message && <p role={success ? "status" : "alert"} className={`break-words text-sm ${success ? "text-ink" : "text-destructive"}`}>{message}</p>}
    </div>
    {review && <div className="space-y-3 rounded-xl border border-line bg-surface p-4" role="group" aria-label="Konfirmasi tindakan"><p className="text-sm">{confirmation}</p><p className="text-xs text-ink-soft">Periksa data di atas sebelum mengonfirmasi.</p></div>}
    <div className="flex flex-wrap gap-3"><Button className="h-auto min-h-11 max-w-full whitespace-normal py-3 text-center" type="submit" disabled={pending || success}>{pending ? "Menyimpan…" : review ? `Konfirmasi ${label.toLowerCase()}` : label}</Button>{review && <Button type="button" variant="outline" disabled={pending} onClick={() => setReview(false)}>Batal</Button>}{message && !success && <Button type="button" variant="outline" onClick={() => { setReview(false); reloadOperationPage(); }}>Muat ulang data</Button>}</div>
  </form>;
}
