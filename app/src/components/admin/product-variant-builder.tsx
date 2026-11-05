"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type VariantChoice = { color: string; size: string };
type ExistingChoice = VariantChoice;

/** Keep UI counts consistent with the placeholder row removed by the editor. */
export function getVariantCombinations(
  colors: string[],
  sizes: string[],
  variants: ExistingChoice[],
  placeholderRow = false,
) {
  const pairs = (colors.length ? colors : [""]).flatMap((color) =>
    (sizes.length ? sizes : [""]).map((size) => ({ color, size })),
  );
  const normalize = (value: string) => value.trim().toLocaleLowerCase("id");
  const existing = new Set(
    variants.map((v) => `${normalize(v.color)}::${normalize(v.size)}`),
  );
  const missing = pairs.filter(
    (v) => !existing.has(`${normalize(v.color)}::${normalize(v.size)}`),
  );
  return {
    missing,
    exceedsLimit:
      variants.length - (placeholderRow ? 1 : 0) + missing.length > 50,
  };
}

function uniqueOptions(options: string[]) {
  const seen = new Set<string>();
  return options
    .map((value) => value.trim())
    .filter((value) => {
      const key = value.toLocaleLowerCase("id");
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** A frontend-only convenience for populating the existing flat variant model. */
export function ProductVariantBuilder({
  disabled,
  variants,
  placeholderRow = false,
  onAdd,
}: {
  disabled: boolean;
  variants: ExistingChoice[];
  placeholderRow?: boolean;
  onAdd: (combinations: VariantChoice[]) => boolean | Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const [colors, setColors] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [colorDraft, setColorDraft] = useState("");
  const [sizeDraft, setSizeDraft] = useState("");

  function toggle(next: boolean) {
    if (inFlight.current) return;
    setError("");
    if (next) {
      setColors(uniqueOptions(variants.map((v) => v.color)));
      setSizes(uniqueOptions(variants.map((v) => v.size)));
      setColorDraft("");
      setSizeDraft("");
    }
    setOpen(next);
  }

  function addOption(type: "color" | "size") {
    const draft = (type === "color" ? colorDraft : sizeDraft).trim();
    const options = type === "color" ? colors : sizes;
    if (!draft || draft.length > (type === "color" ? 80 : 40)) return;
    if (
      !options.some(
        (value) =>
          value.toLocaleLowerCase("id") === draft.toLocaleLowerCase("id"),
      )
    ) {
      if (type === "color") setColors([...colors, draft]);
      else setSizes([...sizes, draft]);
    }
    if (type === "color") setColorDraft("");
    else setSizeDraft("");
  }

  function handleEnter(
    event: KeyboardEvent<HTMLInputElement>,
    type: "color" | "size",
  ) {
    if (event.key === "Enter") {
      event.preventDefault();
      addOption(type);
    }
  }

  const { missing, exceedsLimit } = getVariantCombinations(
    colors,
    sizes,
    variants,
    placeholderRow,
  );

  return (
    <Dialog.Root open={open} onOpenChange={toggle}>
      <Dialog.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="min-h-10 border-zinc-300"
        >
          <Plus size={16} /> Buat kombinasi
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content
          aria-describedby="variant-builder-description"
          className="fixed inset-x-0 bottom-0 z-[61] max-h-[90dvh] overflow-y-auto rounded-t-[28px] bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl focus:outline-none sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[min(94vw,560px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px] sm:p-7"
        >
          <div
            className="mx-auto mb-5 h-1 w-12 rounded-full bg-zinc-200 sm:hidden"
            aria-hidden="true"
          />
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-xl font-bold tracking-tight text-zinc-950">
                Atur variasi produk
              </Dialog.Title>
              <Dialog.Description
                id="variant-builder-description"
                className="mt-1.5 text-sm leading-relaxed text-zinc-500"
              >
                Masukkan pilihan warna dan ukuran. Kombinasi baru ditambahkan ke
                daftar SKU yang sudah ada, tanpa menghapus varian lama.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              aria-label="Tutup pengaturan varian"
            >
              <X size={19} />
            </Dialog.Close>
          </div>
          <fieldset disabled={pending} className="mt-6 space-y-5">
            {[
              {
                type: "color" as const,
                title: "Warna",
                example: "Contoh: Hitam, Putih, Navy",
                options: colors,
                draft: colorDraft,
                setDraft: setColorDraft,
                setOptions: setColors,
                limit: 80,
              },
              {
                type: "size" as const,
                title: "Ukuran",
                example: "Contoh: S, M, L, XL",
                options: sizes,
                draft: sizeDraft,
                setDraft: setSizeDraft,
                setOptions: setSizes,
                limit: 40,
              },
            ].map((section) => (
              <div
                key={section.type}
                className="rounded-2xl border border-zinc-200 p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold">{section.title}</h3>
                  <span className="text-xs text-zinc-400">
                    {section.options.length} opsi
                  </span>
                </div>
                <div
                  className="flex flex-wrap gap-2"
                  aria-label={`Opsi ${section.title.toLowerCase()}`}
                >
                  {section.options.map((option) => (
                    <span
                      key={option.toLocaleLowerCase("id")}
                      className="inline-flex max-w-full items-center gap-1 rounded-lg bg-zinc-100 py-1.5 pl-3 pr-1.5 text-sm text-zinc-800"
                    >
                      <span className="truncate">{option}</span>
                      <button
                        type="button"
                        className="grid h-7 w-7 place-items-center rounded-md hover:bg-zinc-200"
                        onClick={() =>
                          section.setOptions((previous) =>
                            previous.filter((value) => value !== option),
                          )
                        }
                        aria-label={`Hapus opsi ${option}`}
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    aria-label={`Tambah opsi ${section.title}`}
                    maxLength={section.limit}
                    value={section.draft}
                    placeholder={section.example}
                    onChange={(e) => section.setDraft(e.target.value)}
                    onKeyDown={(e) => handleEnter(e, section.type)}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-600 focus:ring-0"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 shrink-0 px-4"
                    onClick={() => addOption(section.type)}
                    disabled={!section.draft.trim()}
                  >
                    <Plus size={17} /> Tambah
                  </Button>
                </div>
              </div>
            ))}
          </fieldset>
          <div className="mt-5 rounded-xl bg-zinc-50 px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-zinc-700">Kombinasi baru</span>
              <strong className="text-zinc-950">{missing.length} varian</strong>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Maksimal 50 varian per produk. Harga dan stok bisa diatur setelah
              kombinasi dibuat.
            </p>
            {exceedsLimit && (
              <p role="alert" className="mt-2 text-xs font-medium text-red-600">
                Kombinasi melebihi batas 50 varian.
              </p>
            )}
          </div>
          <Button
            type="button"
            className="mt-5 h-12 w-full rounded-xl"
            disabled={
              pending ||
              (!colors.length && !sizes.length) ||
              !missing.length ||
              exceedsLimit
            }
            aria-busy={pending}
            onClick={async () => {
              if (inFlight.current) return;
              inFlight.current = true;
              setPending(true);
              setError("");
              try {
                if (await onAdd(missing)) setOpen(false);
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : "SKU gagal ditambahkan. Coba lagi.",
                );
              } finally {
                inFlight.current = false;
                setPending(false);
              }
            }}
          >
            <Check size={18} /> Tambahkan {missing.length} kombinasi
          </Button>
          {pending && (
            <p role="status" className="mt-3 text-sm">
              Memeriksa SKU…
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
