"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  defaultDarkJeansConfig,
  type AnnouncementItem,
  type DarkJeansConfig,
  type SocialMediaEntry,
  type StoreAppearanceV1,
  type TrustFeatureItem,
  type FooterLink,
} from "@/modules/appearance/schema";
import type { Change } from "./controls";

const inputClass =
  "mt-1 min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-600 focus:outline-none focus:ring-0";

const ANNOUNCEMENT_ICONS = [
  { id: "truck", label: "Truk Pengiriman" },
  { id: "shield", label: "Keamanan / Garansi" },
  { id: "refresh", label: "Retur / Tukar" },
  { id: "sparkles", label: "Kilau / Premium" },
  { id: "star", label: "Bintang" },
  { id: "tag", label: "Tag / Promo" },
];

const TRUST_ICONS = [
  { id: "diamond", label: "Berlian (Premium Quality)" },
  { id: "shield", label: "Perisai (Secure Payment)" },
  { id: "truck", label: "Truk (Fast Delivery)" },
  { id: "headset", label: "Headset (24/7 Support)" },
  { id: "star", label: "Bintang (Kepuasan)" },
  { id: "refresh", label: "Putar (Jaminan Retur)" },
];

const SOCIAL_PLATFORMS = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "facebook", label: "Facebook" },
  { id: "whatsapp", label: "WhatsApp" },
] as const;

export function DarkJeansControls({
  draft,
  change,
}: {
  draft: StoreAppearanceV1;
  change: Change;
}) {
  const [activeSection, setActiveSection] = useState<
    "announcement" | "social" | "newArrival" | "promo" | "trust" | "footer"
  >("announcement");

  const dj: DarkJeansConfig = draft.darkJeans ?? defaultDarkJeansConfig();

  function mutateDj(fn: (dj: DarkJeansConfig) => void) {
    change((d) => {
      d.darkJeans ??= structuredClone(defaultDarkJeansConfig());
      fn(d.darkJeans);
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#D9AC61]/40 bg-zinc-900/90 p-4 text-white">
        <h3 className="text-sm font-bold text-[#D9AC61]">
          Pengaturan Khusus Tema Dark Jeans
        </h3>
        <p className="mt-1 text-xs text-zinc-400">
          Atur announcement bar, media sosial, section New Arrival, banner promosi, keunggulan toko, dan link footer.
        </p>
      </div>

      {/* Sub-navigation pills */}
      <div className="flex flex-wrap gap-1.5 border-b pb-3">
        {[
          { key: "announcement", label: "Announcement" },
          { key: "social", label: "Media Sosial" },
          { key: "newArrival", label: "New Arrival" },
          { key: "promo", label: "Banner Promo" },
          { key: "trust", label: "Keunggulan" },
          { key: "footer", label: "Footer" },
        ].map((sec) => (
          <button
            key={sec.key}
            type="button"
            onClick={() => setActiveSection(sec.key as typeof activeSection)}
            className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
              activeSection === sec.key
                ? "bg-[#D9AC61] text-black"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            {sec.label}
          </button>
        ))}
      </div>

      {/* SECTION 1: ANNOUNCEMENT BAR */}
      {activeSection === "announcement" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-zinc-900">
              Daftar Item Announcement
            </h4>
            <button
              type="button"
              className="text-xs font-semibold text-blue-600 underline"
              onClick={() =>
                mutateDj((config) => {
                  config.announcementItems ??= [];
                  if (config.announcementItems.length < 8) {
                    config.announcementItems.push({
                      id: `ann-${crypto.randomUUID().slice(0, 8)}`,
                      label: "Informasi toko baru",
                      icon: "truck",
                      visible: true,
                      order: config.announcementItems.length,
                    });
                  }
                })
              }
            >
              + Tambah Item
            </button>
          </div>

          <p className="text-xs text-zinc-500">
            Ditampilkan di bar paling atas. Pada mobile akan menjadi baris ringkas yang dapat digeser (scroll horizontal).
          </p>

          <div className="space-y-3">
            {(dj.announcementItems || []).map((item, idx) => (
              <fieldset
                key={item.id}
                className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-700">
                    Item #{idx + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                      <input
                        type="checkbox"
                        checked={item.visible}
                        onChange={(e) =>
                          mutateDj((cfg) => {
                            if (cfg.announcementItems?.[idx]) {
                              cfg.announcementItems[idx].visible = e.target.checked;
                            }
                          })
                        }
                      />
                      Tampil
                    </label>
                    <button
                      type="button"
                      className="text-xs text-red-600 underline ml-2"
                      onClick={() =>
                        mutateDj((cfg) => {
                          cfg.announcementItems?.splice(idx, 1);
                        })
                      }
                    >
                      Hapus
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-zinc-600">Teks / Pesan</label>
                  <input
                    type="text"
                    maxLength={100}
                    value={item.label}
                    className={inputClass}
                    onChange={(e) =>
                      mutateDj((cfg) => {
                        if (cfg.announcementItems?.[idx]) {
                          cfg.announcementItems[idx].label = e.target.value;
                        }
                      })
                    }
                  />
                </div>

                <div>
                  <label className="text-xs text-zinc-600">Pilihan Ikon</label>
                  <select
                    value={item.icon}
                    className={inputClass}
                    onChange={(e) =>
                      mutateDj((cfg) => {
                        if (cfg.announcementItems?.[idx]) {
                          cfg.announcementItems[idx].icon = e.target.value;
                        }
                      })
                    }
                  >
                    {ANNOUNCEMENT_ICONS.map((ic) => (
                      <option key={ic.id} value={ic.id}>
                        {ic.label}
                      </option>
                    ))}
                  </select>
                </div>
              </fieldset>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 2: MEDIA SOSIAL */}
      {activeSection === "social" && (
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-zinc-900">
            Tautan Media Sosial Toko
          </h4>
          <p className="text-xs text-zinc-500">
            Masukkan URL profil media sosial toko Anda (misal: https://instagram.com/namatoko). Ikon hanya muncul jika URL diisi dan diaktifkan.
          </p>

          <div className="space-y-3">
            {SOCIAL_PLATFORMS.map((plat) => {
              const entry =
                dj.socialLinks?.find((s) => s.platform === plat.id) ?? {
                  platform: plat.id,
                  url: "",
                  enabled: false,
                  headerVisible: true,
                  footerVisible: true,
                  order: 0,
                };

              return (
                <div
                  key={plat.id}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-800">
                      {plat.label}
                    </span>
                    <label className="flex items-center gap-1.5 text-xs text-zinc-700">
                      <input
                        type="checkbox"
                        checked={entry.enabled}
                        onChange={(e) =>
                          mutateDj((cfg) => {
                            cfg.socialLinks ??= [];
                            const existing = cfg.socialLinks.find(
                              (s) => s.platform === plat.id,
                            );
                            if (existing) {
                              existing.enabled = e.target.checked;
                            } else {
                              cfg.socialLinks.push({
                                ...entry,
                                enabled: e.target.checked,
                              });
                            }
                          })
                        }
                      />
                      Aktifkan
                    </label>
                  </div>

                  <div>
                    <input
                      type="url"
                      placeholder={`https://${plat.id}.com/username`}
                      value={entry.url}
                      className={inputClass}
                      onChange={(e) =>
                        mutateDj((cfg) => {
                          cfg.socialLinks ??= [];
                          const existing = cfg.socialLinks.find(
                            (s) => s.platform === plat.id,
                          );
                          if (existing) {
                            existing.url = e.target.value;
                          } else {
                            cfg.socialLinks.push({
                              ...entry,
                              url: e.target.value,
                            });
                          }
                        })
                      }
                    />
                  </div>

                  {entry.enabled && (
                    <div className="flex gap-4 pt-1">
                      <label className="flex items-center gap-1 text-xs text-zinc-600">
                        <input
                          type="checkbox"
                          checked={entry.headerVisible}
                          onChange={(e) =>
                            mutateDj((cfg) => {
                              const item = cfg.socialLinks?.find(
                                (s) => s.platform === plat.id,
                              );
                              if (item) item.headerVisible = e.target.checked;
                            })
                          }
                        />
                        Header
                      </label>
                      <label className="flex items-center gap-1 text-xs text-zinc-600">
                        <input
                          type="checkbox"
                          checked={entry.footerVisible}
                          onChange={(e) =>
                            mutateDj((cfg) => {
                              const item = cfg.socialLinks?.find(
                                (s) => s.platform === plat.id,
                              );
                              if (item) item.footerVisible = e.target.checked;
                            })
                          }
                        />
                        Footer
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 3: NEW ARRIVAL */}
      {activeSection === "newArrival" && (
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-zinc-900">
            Pengaturan Section New Arrival
          </h4>

          <label className="flex items-center gap-2 text-sm text-zinc-800">
            <input
              type="checkbox"
              checked={dj.newArrival?.enabled ?? true}
              onChange={(e) =>
                mutateDj((cfg) => {
                  cfg.newArrival ??= defaultDarkJeansConfig().newArrival!;
                  cfg.newArrival.enabled = e.target.checked;
                })
              }
            />
            Tampilkan section New Arrival di beranda
          </label>

          <div>
            <label className="text-xs text-zinc-600">Eyebrow / Subjudul Atas</label>
            <input
              type="text"
              value={dj.newArrival?.eyebrow ?? "///// NEW ARRIVAL"}
              className={inputClass}
              onChange={(e) =>
                mutateDj((cfg) => {
                  cfg.newArrival ??= defaultDarkJeansConfig().newArrival!;
                  cfg.newArrival.eyebrow = e.target.value;
                })
              }
            />
          </div>

          <div>
            <label className="text-xs text-zinc-600">Judul Utama (Baris 1)</label>
            <input
              type="text"
              value={dj.newArrival?.heading ?? "New Arrival"}
              className={inputClass}
              onChange={(e) =>
                mutateDj((cfg) => {
                  cfg.newArrival ??= defaultDarkJeansConfig().newArrival!;
                  cfg.newArrival.heading = e.target.value;
                })
              }
            />
          </div>

          <div>
            <label className="text-xs text-zinc-600">
              Judul Warna Emas (Baris 2)
            </label>
            <input
              type="text"
              value={dj.newArrival?.highlightedHeading ?? "Premium Denim"}
              className={inputClass}
              onChange={(e) =>
                mutateDj((cfg) => {
                  cfg.newArrival ??= defaultDarkJeansConfig().newArrival!;
                  cfg.newArrival.highlightedHeading = e.target.value;
                })
              }
            />
          </div>

          <div>
            <label className="text-xs text-zinc-600">Deskripsi Singkat</label>
            <textarea
              rows={2}
              value={
                dj.newArrival?.description ??
                "Koleksi terbaru dengan kualitas terbaik untuk gaya lebih percaya diri."
              }
              className={inputClass}
              onChange={(e) =>
                mutateDj((cfg) => {
                  cfg.newArrival ??= defaultDarkJeansConfig().newArrival!;
                  cfg.newArrival.description = e.target.value;
                })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-600">Label Tombol</label>
              <input
                type="text"
                value={dj.newArrival?.ctaLabel ?? "SHOP NOW"}
                className={inputClass}
                onChange={(e) =>
                  mutateDj((cfg) => {
                    cfg.newArrival ??= defaultDarkJeansConfig().newArrival!;
                    cfg.newArrival.ctaLabel = e.target.value;
                  })
                }
              />
            </div>
            <div>
              <label className="text-xs text-zinc-600">Tujuan Tombol</label>
              <input
                type="text"
                value={dj.newArrival?.ctaHref ?? "/shop"}
                className={inputClass}
                onChange={(e) =>
                  mutateDj((cfg) => {
                    cfg.newArrival ??= defaultDarkJeansConfig().newArrival!;
                    cfg.newArrival.ctaHref = e.target.value;
                  })
                }
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-600">Sumber Produk</label>
            <select
              value={dj.newArrival?.productSource ?? "newest"}
              className={inputClass}
              onChange={(e) =>
                mutateDj((cfg) => {
                  cfg.newArrival ??= defaultDarkJeansConfig().newArrival!;
                  cfg.newArrival.productSource = e.target.value as "newest" | "featured";
                })
              }
            >
              <option value="newest">Produk Terbaru (Direkomendasikan)</option>
              <option value="featured">Produk Pilihan / Unggulan</option>
            </select>
          </div>
        </div>
      )}

      {/* SECTION 4: BANNER PROMO */}
      {activeSection === "promo" && (
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-zinc-900">
            Pengaturan Banner Promosi
          </h4>

          <label className="flex items-center gap-2 text-sm text-zinc-800">
            <input
              type="checkbox"
              checked={dj.promoBanner?.enabled ?? false}
              onChange={(e) =>
                mutateDj((cfg) => {
                  cfg.promoBanner ??= defaultDarkJeansConfig().promoBanner!;
                  cfg.promoBanner.enabled = e.target.checked;
                })
              }
            />
            Aktifkan Banner Promosi di Beranda
          </label>

          <p className="text-xs text-zinc-500">
            Banner promosi menggunakan layout artwork background penuh sesuai mockup Dark Jeans.
          </p>

          <div>
            <label className="text-xs text-zinc-600">Mode Tampilan</label>
            <select
              value={dj.promoBanner?.displayMode ?? "artwork"}
              className={inputClass}
              onChange={(e) =>
                mutateDj((cfg) => {
                  cfg.promoBanner ??= defaultDarkJeansConfig().promoBanner!;
                  cfg.promoBanner.displayMode = e.target.value as "artwork" | "overlay";
                })
              }
            >
              <option value="artwork">
                Artwork Banner Penuh (Teks sudah menyatu di gambar)
              </option>
              <option value="overlay">
                Gambar Latar + Teks &amp; Tombol Overlay
              </option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-600">Label Diskon</label>
              <input
                type="text"
                placeholder="DISKON"
                value={dj.promoBanner?.heading ?? "DISKON"}
                className={inputClass}
                onChange={(e) =>
                  mutateDj((cfg) => {
                    cfg.promoBanner ??= defaultDarkJeansConfig().promoBanner!;
                    cfg.promoBanner.heading = e.target.value;
                  })
                }
              />
            </div>
            <div>
              <label className="text-xs text-zinc-600">Angka Diskon</label>
              <input
                type="text"
                placeholder="50%"
                value={dj.promoBanner?.highlightedDiscount ?? "50%"}
                className={inputClass}
                onChange={(e) =>
                  mutateDj((cfg) => {
                    cfg.promoBanner ??= defaultDarkJeansConfig().promoBanner!;
                    cfg.promoBanner.highlightedDiscount = e.target.value;
                  })
                }
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-600">Teks Promosi</label>
            <input
              type="text"
              value={
                dj.promoBanner?.description ?? "UPGRADE STYLE, SAVE MORE!"
              }
              className={inputClass}
              onChange={(e) =>
                mutateDj((cfg) => {
                  cfg.promoBanner ??= defaultDarkJeansConfig().promoBanner!;
                  cfg.promoBanner.description = e.target.value;
                })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-600">Label Tombol</label>
              <input
                type="text"
                value={dj.promoBanner?.ctaLabel ?? "SHOP NOW"}
                className={inputClass}
                onChange={(e) =>
                  mutateDj((cfg) => {
                    cfg.promoBanner ??= defaultDarkJeansConfig().promoBanner!;
                    cfg.promoBanner.ctaLabel = e.target.value;
                  })
                }
              />
            </div>
            <div>
              <label className="text-xs text-zinc-600">Tautan Tujuan</label>
              <input
                type="text"
                value={dj.promoBanner?.ctaHref ?? "/shop"}
                className={inputClass}
                onChange={(e) =>
                  mutateDj((cfg) => {
                    cfg.promoBanner ??= defaultDarkJeansConfig().promoBanner!;
                    cfg.promoBanner.ctaHref = e.target.value;
                  })
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* SECTION 5: TRUST FEATURES */}
      {activeSection === "trust" && (
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-zinc-900">
            Panel Keunggulan Toko
          </h4>

          <label className="flex items-center gap-2 text-sm text-zinc-800">
            <input
              type="checkbox"
              checked={dj.trustFeatures?.enabled ?? true}
              onChange={(e) =>
                mutateDj((cfg) => {
                  cfg.trustFeatures ??= defaultDarkJeansConfig().trustFeatures!;
                  cfg.trustFeatures.enabled = e.target.checked;
                })
              }
            />
            Tampilkan panel keunggulan toko
          </label>

          <div>
            <label className="text-xs text-zinc-600">
              Teks Kaligrafi / Tanda Tangan Dekoratif (Sisi Kanan)
            </label>
            <input
              type="text"
              placeholder="Streetwear Denim Style"
              value={dj.trustFeatures?.signature ?? "Streetwear Denim Style"}
              className={inputClass}
              onChange={(e) =>
                mutateDj((cfg) => {
                  cfg.trustFeatures ??= defaultDarkJeansConfig().trustFeatures!;
                  cfg.trustFeatures.signature = e.target.value;
                })
              }
            />
          </div>

          <div className="space-y-3">
            {(dj.trustFeatures?.items || []).map((t, idx) => (
              <div
                key={t.id}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-700">
                    Keunggulan #{idx + 1}
                  </span>
                  <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                    <input
                      type="checkbox"
                      checked={t.visible}
                      onChange={(e) =>
                        mutateDj((cfg) => {
                          if (cfg.trustFeatures?.items?.[idx]) {
                            cfg.trustFeatures.items[idx].visible =
                              e.target.checked;
                          }
                        })
                      }
                    />
                    Tampil
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-zinc-600">Judul</label>
                    <input
                      type="text"
                      value={t.title}
                      className={inputClass}
                      onChange={(e) =>
                        mutateDj((cfg) => {
                          if (cfg.trustFeatures?.items?.[idx]) {
                            cfg.trustFeatures.items[idx].title = e.target.value;
                          }
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-600">Ikon</label>
                    <select
                      value={t.icon}
                      className={inputClass}
                      onChange={(e) =>
                        mutateDj((cfg) => {
                          if (cfg.trustFeatures?.items?.[idx]) {
                            cfg.trustFeatures.items[idx].icon = e.target.value;
                          }
                        })
                      }
                    >
                      {TRUST_ICONS.map((ti) => (
                        <option key={ti.id} value={ti.id}>
                          {ti.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-zinc-600">Deskripsi Singkat</label>
                  <input
                    type="text"
                    value={t.description || ""}
                    className={inputClass}
                    onChange={(e) =>
                      mutateDj((cfg) => {
                        if (cfg.trustFeatures?.items?.[idx]) {
                          cfg.trustFeatures.items[idx].description =
                            e.target.value;
                        }
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 6: FOOTER LINKS */}
      {activeSection === "footer" && (
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-zinc-900">
            Pengaturan Footer Toko
          </h4>

          <div>
            <label className="text-xs text-zinc-600">Judul Kolom Quick Link</label>
            <input
              type="text"
              value={dj.footer?.quickLinksTitle ?? "Quick Link"}
              className={inputClass}
              onChange={(e) =>
                mutateDj((cfg) => {
                  cfg.footer ??= defaultDarkJeansConfig().footer!;
                  cfg.footer.quickLinksTitle = e.target.value;
                })
              }
            />
          </div>

          <div>
            <label className="text-xs text-zinc-600">
              Judul Kolom Customer Care
            </label>
            <input
              type="text"
              value={dj.footer?.customerCareTitle ?? "Customer Care"}
              className={inputClass}
              onChange={(e) =>
                mutateDj((cfg) => {
                  cfg.footer ??= defaultDarkJeansConfig().footer!;
                  cfg.footer.customerCareTitle = e.target.value;
                })
              }
            />
          </div>

          <p className="text-xs text-zinc-500">
            Kolom identitas toko dan alamat diambil otomatis dari data &quot;Identitas Toko&quot; di tab atas.
          </p>
        </div>
      )}
    </div>
  );
}
