"use client";
import Image from "next/image";
import {
  GRADIENT_TARGETS,
  TOKEN_KEYS,
  TOKEN_LABELS,
  type StoreAppearanceV1,
} from "@/modules/appearance/schema";
import { PRESETS } from "@/modules/appearance/presets";
export const TABS = [
  "Identitas Toko",
  "Preset/Template Warna",
  "Warna",
  "Gradasi",
  "Header",
  "Navigasi",
  "Tombol/Kartu",
  "Footer",
  "Riwayat",
] as const;
export type Change = (fn: (draft: StoreAppearanceV1) => void) => void;
const OPTION_LABELS: Record<string, string> = {
  text: "Teks",
  image: "Gambar",
  both: "Teks & Gambar",
  classic: "Klasik",
  centered: "Tengah",
  compact: "Ringkas",
  pill: "Pill",
  bar: "Bottom bar",
  none: "Tanpa",
  soft: "Lembut",
  round: "Membulat",
  raised: "Tegas",
  square: "Persegi",
  system: "Sistem",
  serif: "Serif",
  small: "Kecil",
  normal: "Normal",
  large: "Besar",
  left: "Kiri",
  center: "Tengah",
  home: "Home",
  shop: "Shop",
  cart: "Keranjang",
  account: "Akun",
  heart: "Hati",
  star: "Bintang",
};
const inputClass =
  "mt-1 min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-600 focus:outline-none focus:ring-0";
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-zinc-800">
      {label}
      {children}
    </label>
  );
}
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <span className="mt-1 flex gap-2">
        <input
          aria-label={`${label} picker`}
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border p-1"
        />
        <input
          aria-label={`${label} HEX`}
          maxLength={7}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass + " !mt-0 font-mono"}
        />
      </span>
    </Field>
  );
}
export function Controls({
  tab,
  draft,
  change,
  upload,
  busy,
}: {
  tab: string;
  draft: StoreAppearanceV1;
  change: Change;
  upload: (file: File) => void;
  busy: boolean;
}) {
  const text = (
    label: string,
    value: string,
    update: (d: StoreAppearanceV1, v: string) => void,
    max = 160,
  ) => (
    <Field label={label}>
      <input
        className={inputClass}
        value={value}
        maxLength={max}
        onChange={(e) => change((d) => update(d, e.target.value))}
      />
    </Field>
  );
  const check = (
    label: string,
    value: boolean,
    update: (d: StoreAppearanceV1, v: boolean) => void,
  ) => (
    <label className="flex min-h-11 items-center gap-3 text-sm">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => change((d) => update(d, e.target.checked))}
      />
      {label}
    </label>
  );
  const select = (
    label: string,
    value: string,
    options: readonly string[],
    update: (d: StoreAppearanceV1, v: string) => void,
  ) => (
    <Field label={label}>
      <select
        aria-label={label}
        className={inputClass}
        value={value}
        onChange={(e) => change((d) => update(d, e.target.value))}
      >
        {options.map((v) => (
          <option key={v} value={v}>
            {OPTION_LABELS[v] ?? v}
          </option>
        ))}
      </select>
    </Field>
  );
  if (tab === TABS[0])
    return (
      <>
        {text(
          "Nama toko",
          draft.identity.name,
          (d, v) => (d.identity.name = v),
          60,
        )}
        {text("Tagline", draft.identity.tagline, (d, v) => {
          const previous = d.identity.tagline;
          d.identity.tagline = v;
          if (d.footer.tagline === previous) d.footer.tagline = v;
        })}
        {select(
          "Mode logo",
          draft.identity.mode,
          ["text", "image", "both"],
          (d, v) => (d.identity.mode = v as typeof d.identity.mode),
        )}
        <Field label="Upload logo PNG/JPEG/WebP (maks. 2 MiB)">
          <input
            className={inputClass + " py-2"}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
        </Field>
        {draft.identity.logoAssetId && (
          <div className="rounded-xl border p-3">
            <Image
              unoptimized
              width={240}
              height={80}
              alt="Logo draft"
              src={`/api/v1/admin/store-branding/${draft.identity.logoAssetId}`}
              className="max-h-20 max-w-full object-contain"
            />
            <button
              type="button"
              className="mt-2 text-sm underline"
              onClick={() => change((d) => (d.identity.logoAssetId = null))}
            >
              Lepaskan logo dari draft
            </button>
          </div>
        )}
        <Field label={`Lebar logo: ${draft.identity.logoWidth}px`}>
          <input
            type="range"
            className="mt-2 w-full"
            min={32}
            max={240}
            value={draft.identity.logoWidth}
            onChange={(e) =>
              change((d) => (d.identity.logoWidth = Number(e.target.value)))
            }
          />
        </Field>
        {select(
          "Posisi logo",
          draft.identity.position,
          ["left", "center"],
          (d, v) => (d.identity.position = v as typeof d.identity.position),
        )}
      </>
    );
  if (tab === TABS[1])
    return (
      <div className="grid gap-3">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            className="rounded-2xl border border-zinc-300 p-4 text-left hover:border-black focus-visible:outline"
            onClick={() =>
              change((d) => {
                d.colors = structuredClone(p.config.colors);
              })
            }
          >
            <span className="mb-3 flex overflow-hidden rounded-lg">
              {[
                p.config.colors.pageBg,
                p.config.colors.surface,
                p.config.colors.primary,
                p.config.colors.accent,
              ].map((c, i) => (
                <span
                  key={i}
                  style={{ background: c }}
                  className="h-8 flex-1 border"
                />
              ))}
            </span>
            <strong className="text-sm">{p.name}</strong>
          </button>
        ))}
      </div>
    );
  if (tab === TABS[2])
    return (
      <>
        {TOKEN_KEYS.map((k) => (
          <ColorField
            key={k}
            label={TOKEN_LABELS[k]}
            value={draft.colors[k]}
            onChange={(v) => change((d) => (d.colors[k] = v))}
          />
        ))}
      </>
    );
  if (tab === TABS[3])
    return (
      <>
        {GRADIENT_TARGETS.map((target) => {
          const g = draft.gradients[target];
          return (
            <fieldset key={target} className="space-y-3 rounded-2xl border p-4">
              <legend className="px-1 text-sm font-bold">{target}</legend>
              {check(
                "Aktifkan",
                g.enabled,
                (d, v) => (d.gradients[target].enabled = v),
              )}
              <Field label={`Sudut: ${g.angle}°`}>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={g.angle}
                  className="w-full"
                  onChange={(e) =>
                    change(
                      (d) =>
                        (d.gradients[target].angle = Number(e.target.value)),
                    )
                  }
                />
              </Field>
              {g.stops.map((s, i) => (
                <div key={i} className="space-y-2 border-b pb-3">
                  <ColorField
                    label={`Stop ${i + 1}`}
                    value={s.color}
                    onChange={(v) =>
                      change((d) => (d.gradients[target].stops[i].color = v))
                    }
                  />
                  <Field label="Posisi %">
                    <input
                      className={inputClass}
                      type="number"
                      min={0}
                      max={100}
                      value={s.position}
                      onChange={(e) =>
                        change(
                          (d) =>
                            (d.gradients[target].stops[i].position = Number(
                              e.target.value,
                            )),
                        )
                      }
                    />
                  </Field>
                  {i > 0 && i < g.stops.length - 1 && (
                    <button
                      className="min-h-11 text-sm underline"
                      onClick={() =>
                        change((d) => d.gradients[target].stops.splice(i, 1))
                      }
                    >
                      Hapus stop
                    </button>
                  )}
                </div>
              ))}
              {g.stops.length < 4 && (
                <button
                  className="min-h-11 text-sm underline"
                  onClick={() =>
                    change((d) => {
                      const stops = d.gradients[target].stops;
                      const last = stops.at(-2)!;
                      stops.splice(stops.length - 1, 0, {
                        color: last.color,
                        position: Math.round((last.position + 100) / 2),
                      });
                    })
                  }
                >
                  Tambah stop
                </button>
              )}
              <ColorField
                label="Fallback solid"
                value={g.fallback}
                onChange={(v) =>
                  change((d) => (d.gradients[target].fallback = v))
                }
              />
              <ColorField
                label="Warna teks"
                value={g.foreground}
                onChange={(v) =>
                  change((d) => (d.gradients[target].foreground = v))
                }
              />
            </fieldset>
          );
        })}
      </>
    );
  if (tab === TABS[4])
    return (
      <>
        {select(
          "Layout header",
          draft.header.layout,
          ["classic", "centered", "compact"],
          (d, v) => (d.header.layout = v as typeof d.header.layout),
        )}
        {check(
          "Sticky header",
          draft.header.sticky,
          (d, v) => (d.header.sticky = v),
        )}
        {check(
          "Pencarian",
          draft.header.search,
          (d, v) => (d.header.search = v),
        )}
        {check(
          "Wishlist",
          draft.header.wishlist,
          (d, v) => (d.header.wishlist = v),
        )}
        {text(
          "Announcement",
          draft.header.announcement,
          (d, v) => (d.header.announcement = v),
        )}
        {draft.header.links.map((l, i) => (
          <fieldset key={l.id} className="space-y-2 rounded-xl border p-3">
            <legend className="px-1 text-sm">Menu {i + 1}</legend>
            {text(
              "Label",
              l.label,
              (d, v) => (d.header.links[i].label = v),
              60,
            )}
            {text(
              "URL internal",
              l.href,
              (d, v) => (d.header.links[i].href = v),
              240,
            )}
            {check(
              "Tampilkan",
              l.visible,
              (d, v) => (d.header.links[i].visible = v),
            )}
            <div className="flex gap-3">
              <button
                disabled={i === 0}
                className="min-h-11 text-sm underline"
                onClick={() =>
                  change((d) => {
                    [d.header.links[i - 1], d.header.links[i]] = [
                      d.header.links[i],
                      d.header.links[i - 1],
                    ];
                  })
                }
              >
                Naik
              </button>
              <button
                disabled={i === draft.header.links.length - 1}
                className="min-h-11 text-sm underline"
                onClick={() =>
                  change((d) => {
                    [d.header.links[i + 1], d.header.links[i]] = [
                      d.header.links[i],
                      d.header.links[i + 1],
                    ];
                  })
                }
              >
                Turun
              </button>
              <button
                className="min-h-11 text-sm underline"
                onClick={() =>
                  change((d) => {
                    d.header.links.splice(i, 1);
                  })
                }
              >
                Hapus
              </button>
            </div>
          </fieldset>
        ))}
        <button
          disabled={draft.header.links.length >= 10}
          className="min-h-11 text-sm underline"
          onClick={() =>
            change((d) => {
              d.header.links.push({
                id: `menu-${crypto.randomUUID().slice(0, 8)}`,
                label: "Menu baru",
                href: "/shop",
                visible: true,
              });
            })
          }
        >
          Tambah menu
        </button>
      </>
    );
  if (tab === TABS[5])
    return (
      <>
        {select(
          "Navigasi mobile",
          draft.mobile.style,
          ["pill", "bar"],
          (d, v) => (d.mobile.style = v as typeof d.mobile.style),
        )}
        <p className="text-sm text-zinc-600">
          Empat tujuan inti selalu tersedia.
        </p>
        {draft.mobile.items.map((item, i) => (
          <fieldset key={item.id} className="space-y-2 rounded-xl border p-3">
            <legend className="px-1 text-sm font-bold">{item.id}</legend>
            {text(
              "Label",
              item.label,
              (d, v) => (d.mobile.items[i].label = v),
              60,
            )}
            {select(
              "Ikon",
              item.icon,
              ["home", "shop", "cart", "account", "heart", "star"],
              (d, v) => (d.mobile.items[i].icon = v as typeof item.icon),
            )}
            <div className="flex gap-4">
              <button
                className="min-h-11 text-sm underline"
                disabled={i === 0}
                onClick={() =>
                  change((d) => {
                    [d.mobile.items[i - 1], d.mobile.items[i]] = [
                      d.mobile.items[i],
                      d.mobile.items[i - 1],
                    ];
                  })
                }
              >
                Naik
              </button>
              <button
                className="min-h-11 text-sm underline"
                disabled={i === 3}
                onClick={() =>
                  change((d) => {
                    [d.mobile.items[i + 1], d.mobile.items[i]] = [
                      d.mobile.items[i],
                      d.mobile.items[i + 1],
                    ];
                  })
                }
              >
                Turun
              </button>
            </div>
          </fieldset>
        ))}
      </>
    );
  if (tab === TABS[6])
    return (
      <>
        {(
          [
            ["radius", ["none", "soft", "round"]],
            ["shadow", ["none", "soft", "raised"]],
            ["button", ["square", "soft", "pill"]],
            ["font", ["system", "serif"]],
            ["scale", ["small", "normal", "large"]],
          ] as const
        ).map(([key, options]) => (
          <div key={key}>
            {select(
              {
                radius: "Radius sudut",
                shadow: "Bayangan",
                button: "Bentuk tombol",
                font: "Jenis huruf",
                scale: "Skala huruf",
              }[key],
              draft.styling[key],
              options,
              (d, v) => {
                Object.assign(d.styling, { [key]: v });
              },
            )}
          </div>
        ))}
      </>
    );
  if (tab === TABS[7])
    return (
      <>
        {text(
          "Tagline footer",
          draft.footer.tagline,
          (d, v) => (d.footer.tagline = v),
        )}
        {check(
          "Tampilkan logo",
          draft.footer.showLogo,
          (d, v) => (d.footer.showLogo = v),
        )}
        {check(
          "Trust features",
          draft.footer.trustFeatures,
          (d, v) => (d.footer.trustFeatures = v),
        )}
        <p className="text-sm text-zinc-600">
          Tautan legal tetap tersedia. Isi legal tidak berubah.
        </p>
      </>
    );
  return null;
}
