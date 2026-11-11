"use client";
import { DeleteProductButton } from "./delete-product-button";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import Link from "@/components/ui/navigation";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  ArrowLeft,
  ChevronDown,
  Layers3,
  Package,
  Info,
  Check,
  Save,
  Sparkles,
} from "lucide-react";
import {
  canonicalProductForm,
  suggestSku,
  isSimpleProduct,
  simpleProductRow,
} from "@/modules/catalog/product-editor-domain";
import {
  cmToMm,
  mmToCm,
  weightToGrams,
} from "@/modules/catalog/product-shipping";
import { ProductBulkEditor } from "./product-bulk-editor";
import { CustomVariationEditor } from "./custom-variation-editor";
import {
  ProductVariantBuilder,
  type VariantChoice,
} from "@/components/admin/product-variant-builder";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import {
  saveProductAction,
  allocateProductSkusAction,
  setProductStatusAction,
} from "@/modules/catalog/product-management.actions";
import { SizeChartEditor } from "./size-chart-editor";
import { ProductPhotoEditor } from "./product-photo-editor";
import { canonicalProductPricing } from "@/modules/catalog/product-canonical-pricing";
import { productPublishReadiness } from "@/modules/catalog/product-publish-readiness";
import {
  productInputSchema,
  type ProductInput,
} from "@/modules/catalog/product-management.validation";
import type { ProductEditorData } from "@/modules/catalog/product-management.service";
import type { ProductStatus } from "@prisma/client";

const selectClass =
  "h-11 w-full rounded-xl border border-line bg-white px-3 text-sm focus:border-zinc-600 focus:outline-none focus:ring-0 disabled:opacity-50";
type Values = Omit<ProductInput, "images" | "variants" | "optionImages"> & {
  optionImages: ProductEditorData["optionImages"];
  images: ProductEditorData["images"];
  variants: (ProductInput["variants"][number] & {
    reserved?: number;
    protected?: boolean;
  })[];
};
function valuesFor(p?: ProductEditorData): Values {
  if (p) {
    const { id: _id, status: _status, updatedAt: _version, ...values } = p;
    return values;
  }
  return {
    weightGrams: null,
    packageLengthMm: null,
    packageWidthMm: null,
    packageHeightMm: null,
    name: "",
    slug: "",
    description: "",
    material: "",
    careInstruction: "",
    sizeChart: null,
    shippingReturn: "",
    basePrice: 0,
    salePrice: null,
    categoryId: null,
    brandId: null,
    isFeatured: false,
    optionGroups: [],
    optionImages: [],
    images: [],
    variants: [
      { sku: "", color: "", size: "", price: null, salePrice: null, onHand: 0 },
    ],
  };
}
function isEmptyDraftVariant(row: Values["variants"][number]) {
  return (
    !row.id &&
    !row.sku &&
    !row.color &&
    !row.size &&
    row.price == null &&
    row.salePrice == null &&
    !row.onHand
  );
}
function suggestSlug(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
function shippingFor(p?: ProductEditorData) {
  return {
    weight: p?.weightGrams == null ? "" : String(p.weightGrams),
    length: mmToCm(p?.packageLengthMm),
    width: mmToCm(p?.packageWidthMm),
    height: mmToCm(p?.packageHeightMm),
  };
}
function shippingData(s: ReturnType<typeof shippingFor>) {
  return {
    weightGrams: weightToGrams(s.weight),
    packageLengthMm: cmToMm(s.length),
    packageWidthMm: cmToMm(s.width),
    packageHeightMm: cmToMm(s.height),
  };
}
function formSnapshot(
  values: Values,
  custom: boolean,
  shipping: ReturnType<typeof shippingFor>,
) {
  let normalized: unknown;
  try {
    normalized = shippingData(shipping);
  } catch {
    normalized = shipping;
  }
  return canonicalProductForm({ values, custom, shipping: normalized });
}
const statusLabels = { DRAFT: "Draft", PUBLISHED: "Terbit", ARCHIVED: "Arsip" };
export function ProductEditor({
  initial,
  categories,
  brands,
  canEdit,
  canStock,
  canArchive,
}: {
  initial?: ProductEditorData;
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  canEdit: boolean;
  canStock: boolean;
  canArchive: boolean;
}) {
  const router = useRouter();
  const [productId, setProductId] = useState(initial?.id || "");
  const [bulkSelected, setBulkSelected] = useState(new Set<number>());
  const [bulkSelectedOnly, setBulkSelectedOnly] = useState(false);
  const [custom, setCustom] = useState(initial?.optionsEnabled ?? false);
  const [reordering, setReordering] = useState(false);
  const [queueBusy, setQueueBusy] = useState(false);
  const restoreBack = useRef(false);
  const backState = useRef({ dirty: false, uploading: false });
  const busy = useRef(false);
  const persistedSnapshot = useRef<ProductEditorData | undefined>(initial);
  const [values, setValues] = useState<Values>(() => valuesFor(initial));
  const [version, setVersion] = useState(initial?.updatedAt || "");
  const [status, setStatus] = useState<ProductStatus>(
    initial?.status || "DRAFT",
  );
  const [shipping, setShipping] = useState(() => shippingFor(initial));
  const [baseline, setBaseline] = useState(() =>
    formSnapshot(
      valuesFor(initial),
      initial?.optionsEnabled ?? false,
      shippingFor(initial),
    ),
  );
  const simple =
    !custom && isSimpleProduct({ ...values, optionsEnabled: false });
  const dirty = formSnapshot(values, custom, shipping) !== baseline;
  const saveRequest = useRef<{ payload: string; id: string }>();
  const uploadRequests = useRef(new WeakMap<File, string>());
  const [mediaRecovered, setMediaRecovered] = useState(false);
  useEffect(() => {
    const key = `store-product-media:${productId || "new"}`;
    let cancelled = false;
    async function restoreMedia() {
      try {
        const ids = JSON.parse(sessionStorage.getItem(key) || "[]");
        if (
          !Array.isArray(ids) ||
          !ids.length ||
          ids.length > 60 ||
          ids.some(
            (id) => typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id),
          )
        )
          return;
        const response = await fetch(
          `/api/v1/admin/product-media?ids=${encodeURIComponent(ids.join(","))}`,
          { cache: "no-store" },
        );
        const result = await response.json();
        if (!cancelled && response.ok && result.success) {
          const photos = result.data as (ProductEditorData["images"][number] & {
            purpose: string;
          })[];
          photos.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
          setValues((current) => ({
            ...current,
            images: [
              ...current.images,
              ...photos
                .filter(
                  (photo) =>
                    photo.purpose === "gallery" &&
                    !current.images.some((i) => i.id === photo.id),
                )
                .map(({ id, url, alt }) => ({ id, url, alt })),
            ],
            optionImages: [
              ...current.optionImages,
              ...photos
                .filter(
                  (photo) =>
                    photo.purpose === "option" &&
                    !current.optionImages.some((i) => i.id === photo.id),
                )
                .map(({ id, url, alt }) => ({ id, url, alt })),
            ],
          }));
          if (photos.length)
            setNotice(
              "Foto sementara dipulihkan. Lengkapi kembali data produk sebelum Simpan.",
            );
        }
      } catch {
        /* Browser storage is optional; never restore unverified ownership. */
      } finally {
        if (!cancelled) setMediaRecovered(true);
      }
    }
    void restoreMedia();
    return () => {
      cancelled = true;
    };
  }, [productId]);
  useEffect(() => {
    if (!mediaRecovered) return;
    const ids = [...values.images, ...values.optionImages]
      .filter((photo) => photo.url.startsWith("/api/v1/admin/product-media/"))
      .map((photo) => photo.id);
    try {
      sessionStorage.setItem(
        `store-product-media:${productId || "new"}`,
        JSON.stringify(ids),
      );
    } catch {
      /* optional */
    }
  }, [values.images, values.optionImages, productId, mediaRecovered]);
  const [navigating, startNavigation] = useTransition();
  const [operation, setPending] = useState<string | null>(null);
  const pending = operation || (navigating ? "navigation" : null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const fieldError = (id: string) =>
    fieldErrors[id] ? (
      <p id={`${id}-error`} className="editor-field-error" role="alert">
        {fieldErrors[id]}
      </p>
    ) : null;
  const validationProps = (id: string) => ({
    "aria-invalid": Boolean(fieldErrors[id]),
    "aria-describedby": fieldErrors[id] ? `${id}-error` : undefined,
  });
  const [notice, setNotice] = useState("");
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) {
      feedback.current?.focus({ preventScroll: true });
      feedback.current?.scrollIntoView({ block: "center" });
    }
  }, [error]);
  function change<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setError("");
    setNotice("");
  }
  function accept(p: ProductEditorData) {
    persistedSnapshot.current = p;
    setProductId(p.id);
    setCustom(p.optionsEnabled);
    setValues(valuesFor(p));
    setVersion(p.updatedAt);
    setStatus(p.status);
    setShipping(shippingFor(p));
    setBaseline(formSnapshot(valuesFor(p), p.optionsEnabled, shippingFor(p)));
    saveRequest.current = undefined;
  }
  async function save(event: FormEvent<HTMLFormElement>, publish = false) {
    event.preventDefault();
    if (busy.current || queueBusy || navigating) return;
    busy.current = true;
    setPending("save");
    setError("");
    setNotice("");
    try {
      let saveValues = values;
      if (simple && !values.variants[0].sku.trim()) {
        const allocated = await allocateProductSkusAction([
          { key: "simple", sku: suggestSku(values.name, [], [], new Set()) },
        ]);
        if (!allocated.ok || !allocated.data?.[0])
          throw new Error(allocated.error || "SKU gagal dibuat. Coba lagi.");
        saveValues = {
          ...values,
          variants: [{ ...values.variants[0], sku: allocated.data[0].sku }],
        };
        setValues(saveValues);
      }
      const form = new FormData();
      form.set("id", productId);
      form.set("updatedAt", version);
      const payload =
        formSnapshot(saveValues, custom, shipping) + productId + version;
      if (saveRequest.current?.payload !== payload)
        saveRequest.current = { payload, id: crypto.randomUUID() };
      form.set("requestId", saveRequest.current.id);
      form.set(
        "product",
        JSON.stringify(
          canonicalProductPricing({
            ...saveValues,
            variantMode: simple ? "simple" : custom ? "variable" : undefined,
            ...shippingData(shipping),
            // Persist accessible photo names even after recovering an upload from session.
            images: values.images.map((image, index) => ({
              ...image,
              alt:
                !image.alt.trim() ||
                image.alt.startsWith("Produk - Foto produk")
                  ? `${values.name.trim() || "Produk"} - Foto produk ${index + 1}`.slice(
                      0,
                      200,
                    )
                  : image.alt,
            })),
            optionImages: values.optionImages.map((image, index) => ({
              ...image,
              alt:
                !image.alt.trim() ||
                image.alt.startsWith("Produk - Foto variasi")
                  ? `${values.name.trim() || "Produk"} - Foto variasi ${index + 1}`.slice(
                      0,
                      200,
                    )
                  : image.alt,
            })),
            optionsEnabled: custom && Boolean(values.optionGroups?.length),
            optionGroups:
              custom && values.optionGroups?.length
                ? values.optionGroups
                : undefined,
          }),
        ),
      );
      const parsed = productInputSchema.safeParse(
        JSON.parse(String(form.get("product"))),
      );
      if (!parsed.success) {
        const issues: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const [field, index, key, valueIndex] = issue.path;
          let id =
            (
              {
                name: "product-name",
                slug: "product-slug",
                basePrice: "product-price",
                salePrice: "product-sale-price",
              } as Record<string, string>
            )[String(field)] || "product-pricing";
          if (field === "variants" && typeof index === "number")
            id = simple
              ? key === "sku"
                ? "simple-sku"
                : key === "onHand"
                  ? "simple-stock"
                  : key === "salePrice"
                    ? "product-sale-price"
                    : "product-price"
              : custom
                ? key === "sku"
                  ? `sku-${index}`
                  : `sku-${key === "onHand" ? "stock" : key === "salePrice" ? "sale" : "price"}-${index}`
                : `variant-${index}-${key === "onHand" ? "stock" : String(key)}`;
          if (field === "optionGroups" && typeof index === "number") {
            const group = values.optionGroups?.[index];
            if (group)
              id =
                key === "values" && typeof valueIndex === "number"
                  ? `option-value-${group.values[valueIndex]?.id}`
                  : `group-title-${group.id}`;
          }
          issues[id] = /^(Invalid|Too |Expected|Unrecognized)/.test(
            issue.message,
          )
            ? "Periksa isian ini. Nilai belum sesuai batas yang diizinkan."
            : issue.message;
        }
        setFieldErrors(issues);
        setNotice("Periksa kolom yang ditandai sebelum menyimpan produk.");
        const target = document.getElementById(Object.keys(issues)[0]);
        const details = target?.closest("details");
        if (details) details.open = true;
        requestAnimationFrame(() => {
          target?.focus();
          target?.scrollIntoView({ block: "center" });
        });
        return;
      }
      setFieldErrors({});
      const result = await saveProductAction(form);
      if (!result.ok || !result.data) {
        setError(result.error || "Produk gagal disimpan");
        return;
      }
      try {
        sessionStorage.removeItem(`store-product-media:${productId || "new"}`);
      } catch {
        /* optional */
      }
      accept(result.data);
      if (publish) {
        const published = await setProductStatusAction(
          result.data.id,
          result.data.updatedAt,
          "PUBLISHED",
        );
        if (!published.ok || !published.data) {
          setError(
            published.error ||
              "Draft tersimpan, tetapi produk belum dapat diterbitkan.",
          );
          return;
        }
        accept(published.data);
      }
      setNotice(
        publish ? "Produk berhasil diterbitkan." : "Produk berhasil disimpan.",
      );
      const savedId = result.data.id;
      startNavigation(() => {
        if (!initial) router.push(`/admin/products/${savedId}`);
        else router.refresh();
      });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Tidak dapat menyimpan produk. Coba lagi.",
      );
    } finally {
      busy.current = false;
      setPending(null);
    }
  }
  async function changeStatus(target: ProductStatus) {
    if (!productId || dirty || busy.current) return;
    busy.current = true;
    setPending(target);
    setError("");
    setNotice("");
    try {
      const result = await setProductStatusAction(productId, version, target);
      if (!result.ok || !result.data) {
        setError(result.error || "Status gagal diperbarui");
        return;
      }
      accept(result.data);
      setNotice(`Status produk: ${statusLabels[target]}.`);
      router.refresh();
    } catch {
      setError("Status gagal diperbarui. Coba lagi.");
    } finally {
      busy.current = false;
      setPending(null);
    }
  }
  async function uploadFile(
    file: File,
    purpose: "gallery" | "option",
    progress: (percent: number) => void = () => {},
  ) {
    if (busy.current) return;
    if (purpose === "option" && values.optionImages.length >= 50) {
      setError("Maksimal 50 foto variasi dan tabel ukuran per produk.");
      return;
    }
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      !file.size ||
      file.size > 4 * 1024 * 1024
    ) {
      setError("Gunakan JPG, PNG, atau WebP berukuran 1 byte–4 MB.");
      return;
    }
    busy.current = true;
    setPending("upload-" + purpose);
    setError("");
    setNotice("");
    try {
      let requestId = uploadRequests.current.get(file);
      if (!requestId) {
        requestId = crypto.randomUUID();
        uploadRequests.current.set(file, requestId);
      }
      const form = new FormData();
      form.set("image", file);
      form.set("requestId", requestId);
      form.set("purpose", purpose);
      const image = await new Promise<ProductEditorData["images"][number]>(
        (resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open("POST", "/api/v1/admin/product-media");
          request.timeout = 45000;
          request.upload.onprogress = (event) => {
            if (event.lengthComputable)
              progress(Math.round((event.loaded / event.total) * 100));
          };
          request.onerror = request.ontimeout = () =>
            reject(
              new Error(
                "Upload belum dapat dikonfirmasi. Coba lagi dengan file yang sama.",
              ),
            );
          request.onload = () => {
            try {
              const result = JSON.parse(request.responseText);
              if (
                request.status < 200 ||
                request.status >= 300 ||
                !result.success
              )
                reject(new Error(result.error?.message || "Upload gagal"));
              else
                resolve({
                  id: result.data.id,
                  url: result.data.url,
                  alt: result.data.alt,
                });
            } catch {
              reject(new Error("Respons upload tidak valid. Coba lagi."));
            }
          };
          request.send(form);
        },
      );
      setValues((current) => {
        const key = purpose === "gallery" ? "images" : "optionImages";
        const label =
          `${current.name.trim() || "Produk"} - ${purpose === "gallery" ? "Foto produk" : "Foto variasi"} ${current[key].length + 1}`.slice(
            0,
            200,
          );
        return {
          ...current,
          [key]: [
            ...current[key].filter((i) => i.id !== image.id),
            { ...image, alt: label },
          ],
        };
      });
      setNotice(
        "Foto sementara siap. Klik Simpan untuk memasang foto pada produk.",
      );
      return image;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Upload gagal.");
    } finally {
      busy.current = false;
      setPending(null);
    }
  }
  async function uploadOption(file: File, progress: (percent: number) => void) {
    return uploadFile(file, "option", progress);
  }
  function restorePhotos(purpose: "images" | "optionImages") {
    const previous = persistedSnapshot.current?.[purpose] ?? [];
    const next = [
      ...previous,
      ...values[purpose].filter(
        (photo) => !previous.some((old) => old.id === photo.id),
      ),
    ];
    const limit = purpose === "images" ? 10 : 50;
    if (next.length > limit) {
      setError(
        `Pemulihan melewati batas ${limit} foto. Hapus foto baru yang tidak dipakai terlebih dahulu.`,
      );
      return;
    }
    change(purpose, next);
  }
  function removePhoto(id: string, purpose: "images" | "optionImages") {
    // A product photo may be the selected image for a customer-facing option.
    // Never orphan that relation; ask the seller to select a replacement first.
    if (
      purpose === "images" &&
      values.optionGroups?.some((group) =>
        group.values.some((option) => option.imageId === id),
      )
    ) {
      setError(
        "Foto ini dipakai oleh opsi variasi. Pilih gambar pengganti pada Varian sebelum menghapus foto utama.",
      );
      return;
    }
    // Deletion is provisional until the product is saved. Cancelling staged media
    // here breaks both "Pulihkan foto" and discarding changes in the variation
    // panel: the restored media ID would already be cancelled server-side.
    // Unreferenced staged uploads are expired by the existing TTL cleanup;
    // finalized product media is removed only by the save transaction.
    change(
      purpose,
      values[purpose].filter((image) => image.id !== id),
    );
  }
  useEffect(() => {
    if (!dirty && !queueBusy && !pending?.startsWith("upload-")) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const navigate = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement)?.closest?.("a[href]");
      if (!anchor || event.defaultPrevented) return;
      const href = anchor.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        anchor.getAttribute("target") === "_blank"
      )
        return;
      if (
        !window.confirm(
          "Ada perubahan produk yang belum disimpan. Tinggalkan halaman?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty, pending, queueBusy]);
  useEffect(() => {
    // Navigation.currentEntry.index identifies the direction of a browser
    // traverse even when it was initiated by Forward or history.go(n).
    // Restoring with a constant go(1) loses the editor on cancelled Forward.
    type NavigationIndex = { currentEntry?: { index?: number } };
    const index = () => {
      const nav = (window as Window & { navigation?: NavigationIndex })
        .navigation;
      return typeof nav?.currentEntry?.index === "number"
        ? nav.currentEntry.index
        : null;
    };
    let previousIndex = index();
    const pop = (event: PopStateEvent) => {
      const destinationIndex = index();
      const returnOffset =
        previousIndex !== null && destinationIndex !== null
          ? previousIndex - destinationIndex
          : 1; // Legacy Back fallback where Navigation API is unavailable.
      previousIndex = destinationIndex;
      if (restoreBack.current) {
        event.stopImmediatePropagation();
        restoreBack.current = false;
        return;
      }
      const current = backState.current;
      if (!current.dirty && !current.uploading) return;
      if (
        !window.confirm(
          "Ada perubahan produk yang belum disimpan. Tinggalkan halaman?",
        )
      ) {
        event.stopImmediatePropagation();
        if (returnOffset !== 0) {
          restoreBack.current = true;
          window.history.go(returnOffset);
        }
      }
    };
    window.addEventListener("popstate", pop, true);
    return () => window.removeEventListener("popstate", pop, true);
  }, []);
  useEffect(() => {
    setBulkSelected(new Set());
  }, [values.variants.length]);
  function variantChange(
    index: number,
    patch: Partial<Values["variants"][number]>,
  ) {
    change(
      "variants",
      values.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    );
  }
  async function appendCombinations(
    combinations: VariantChoice[],
  ): Promise<boolean> {
    if (busy.current) return false;
    // A blank create-mode row is only a form placeholder, not a persisted variant.
    const placeholder =
      values.variants.length === 1 && isEmptyDraftVariant(values.variants[0]);
    const list = placeholder ? [] : [...values.variants];
    const retainedCount = list.length;
    const pairs = new Set(
      list.map(
        (v) =>
          `${v.color.trim().toLocaleLowerCase("id")}::${v.size.trim().toLocaleLowerCase("id")}`,
      ),
    );
    const skus = new Set(list.map((v) => v.sku.trim().toUpperCase()));
    for (const choice of combinations) {
      const color = choice.color.trim();
      const size = choice.size.trim();
      const key = `${color.toLocaleLowerCase("id")}::${size.toLocaleLowerCase("id")}`;
      if (pairs.has(key)) continue;
      if (list.length >= 50) {
        setError("Maksimal 50 varian per produk.");
        return false;
      }
      const dimensions = [
        ["color", color],
        ["size", size],
      ]
        .filter(([, value]) => value)
        .map(([axis, value]) => ({
          id: axis,
          name: axis,
          allowsImage: false,
          values: [{ id: `${axis}:${value.toLocaleLowerCase("id")}`, value }],
        }));
      const sku = suggestSku(
        values.name,
        dimensions,
        dimensions.map((group) => group.values[0].id),
        skus,
      );
      list.push({
        sku,
        color,
        size,
        price: null,
        salePrice: null,
        ...(canStock ? { onHand: 0 } : {}),
      });
      pairs.add(key);
      skus.add(sku.toUpperCase());
    }
    if (!list.length || list.length === retainedCount) return false;
    busy.current = true;
    setPending("sku");
    try {
      const fresh = list.slice(retainedCount);
      const keyFor = (row: Values["variants"][number]) =>
        `${row.color.trim().toLocaleLowerCase("id")}::${row.size.trim().toLocaleLowerCase("id")}`;
      const result = await allocateProductSkusAction(
        fresh.map((row) => ({ key: keyFor(row), sku: row.sku })),
      );
      if (!result.ok || !result.data)
        throw new Error(result.error || "SKU gagal dibuat. Coba lagi.");
      for (const row of fresh)
        row.sku = result.data.find(
          (candidate) => candidate.key === keyFor(row),
        )!.sku;
      change("variants", list);
      return true;
    } finally {
      busy.current = false;
      setPending(null);
    }
  }
  let payload: unknown;
  try {
    payload = canonicalProductPricing({
      ...values,
      ...shippingData(shipping),
      variants: simple
        ? [
            {
              ...values.variants[0],
              sku:
                values.variants[0].sku ||
                suggestSku(values.name, [], [], new Set()),
            },
          ]
        : values.variants,
      variantMode: simple ? "simple" : custom ? "variable" : undefined,
      optionsEnabled: custom && Boolean(values.optionGroups?.length),
    });
  } catch {
    payload = null;
  }
  const readiness = productPublishReadiness(payload);
  backState.current = {
    dirty,
    uploading: queueBusy || Boolean(pending?.startsWith("upload-")),
  };
  return (
    <div className="product-editor-v2 mx-auto max-w-6xl space-y-5 pb-8">
      <div className="seller-product-toolbar flex items-center justify-between gap-3">
        <Link
          href="/admin/products"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-zinc-600 transition-colors hover:text-black"
        >
          <ArrowLeft size={18} /> Kembali ke produk
        </Link>
        <span
          data-testid="product-status"
          className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700"
        >
          <span
            className={`size-2 rounded-full ${status === "PUBLISHED" ? "bg-emerald-500" : status === "ARCHIVED" ? "bg-zinc-400" : "bg-amber-400"}`}
          />
          {statusLabels[status]}
        </span>
      </div>
      <header className="seller-product-heading flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.035em] text-zinc-950 sm:text-[30px]">
            {initial ? "Edit produk" : "Tambah produk"}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
            {initial
              ? "Perbarui informasi dan penjualan produk dengan mudah."
              : "Tambahkan foto dan informasi produk, lalu simpan sebelum publikasi."}
          </p>
        </div>
        <div className="hidden items-center gap-2 rounded-xl bg-white px-4 py-3 text-xs text-zinc-500 shadow-sm sm:flex">
          <Package size={17} className="text-zinc-700" /> Panel Pengelola Toko
        </div>
      </header>
      <div
        ref={feedback}
        role="region"
        aria-label="Status perubahan produk"
        tabIndex={-1}
        aria-live="polite"
        aria-atomic="true"
        className="focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
      >
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800"
          >
            {notice}
          </p>
        )}
        {Object.entries(fieldErrors)
          .filter(
            ([id]) =>
              ![
                "product-name",
                "product-slug",
                "product-price",
                "product-sale-price",
                "simple-stock",
                "simple-sku",
              ].includes(id),
          )
          .map(([id, message]) => (
            <p key={id} className="editor-field-error">
              <a href={`#${id}`}>{message}</a>
            </p>
          ))}
      </div>
      <form
        noValidate
        onSubmit={(event) =>
          void save(
            event,
            (event.nativeEvent as SubmitEvent).submitter?.getAttribute(
              "data-intent",
            ) === "publish",
          )
        }
        data-testid="product-editor"
        className="space-y-5"
      >
        <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_260px]">
          <fieldset
            disabled={!canEdit || !!pending || queueBusy}
            className="min-w-0 space-y-5"
          >
            <ProductPhotoEditor
              photos={values.images}
              name={values.name}
              disabled={!canEdit || !!pending || !mediaRecovered}
              canUndo={Boolean(
                persistedSnapshot.current?.images.some(
                  (i) => !values.images.some((photo) => photo.id === i.id),
                ),
              )}
              onUndo={() => restorePhotos("images")}
              onBusy={setQueueBusy}
              onChange={(photos) =>
                setValues((current) => ({ ...current, images: photos }))
              }
              onRemove={(id) => removePhoto(id, "images")}
              onUpload={(file, progress) =>
                uploadFile(file, "gallery", progress)
              }
            />

            <section
              id="product-basic"
              className="min-w-0 space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_3px_14px_rgba(0,0,0,.025)] sm:p-6"
            >
              <div>
                <h2 className="text-base font-bold text-zinc-950 sm:text-lg">
                  Informasi dasar
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Buat nama dan identitas produk yang mudah dikenali.
                </p>
              </div>
              <div>
                <div className="flex justify-between gap-3">
                  <Label htmlFor="product-name">
                    Nama produk{" "}
                    <span aria-hidden="true" className="text-red-500">
                      *
                    </span>
                  </Label>
                  <span className="text-xs text-zinc-400">
                    {values.name.length}/160
                  </span>
                </div>
                <Input
                  id="product-name"
                  {...validationProps("product-name")}
                  aria-label="Nama produk"
                  value={values.name}
                  required
                  minLength={2}
                  maxLength={160}
                  placeholder="Contoh: Kemeja Linen Premium Wanita"
                  onChange={(e) => {
                    const name = e.target.value;
                    change("name", name);
                    if (
                      !initial &&
                      (!values.slug || values.slug === suggestSlug(values.name))
                    )
                      change("slug", suggestSlug(name));
                  }}
                />
                {fieldError("product-name")}
              </div>
              <div>
                <Label htmlFor="product-category">Kategori</Label>
                <select
                  id="product-category"
                  className={selectClass}
                  value={values.categoryId || ""}
                  onChange={(e) => change("categoryId", e.target.value || null)}
                >
                  <option value="">Pilih kategori produk</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Link
                  href="/admin/products/categories"
                  className="mt-2 inline-flex min-h-9 items-center text-xs font-semibold text-zinc-600 underline-offset-4 hover:underline"
                >
                  Kelola kategori
                </Link>
              </div>
              <div>
                <Label htmlFor="product-brand">Merek</Label>
                <select
                  id="product-brand"
                  className={selectClass}
                  value={values.brandId || ""}
                  onChange={(e) => change("brandId", e.target.value || null)}
                >
                  <option value="">Tanpa merek</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="border-t border-zinc-100 pt-4">
                <Label htmlFor="product-slug">
                  Alamat produk (slug){" "}
                  <span aria-hidden="true" className="text-red-500">
                    *
                  </span>
                </Label>
                <Input
                  id="product-slug"
                  {...validationProps("product-slug")}
                  aria-label="Alamat produk (slug)"
                  value={values.slug}
                  required
                  maxLength={120}
                  onChange={(e) => change("slug", e.target.value)}
                  placeholder="nama-produk"
                />
                {fieldError("product-slug")}
                <p className="mt-1.5 break-all text-xs text-zinc-500">
                  /product/{values.slug || "nama-produk"}
                </p>
              </div>
            </section>

            <section
              id="product-detail"
              className="min-w-0 space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_3px_14px_rgba(0,0,0,.025)] sm:p-6"
            >
              <div>
                <h2 className="text-base font-bold sm:text-lg">
                  Detail produk
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Jelaskan bahan, keunggulan, dan panduan ukuran produk.
                </p>
              </div>
              <div>
                <Label htmlFor="product-description">Deskripsi</Label>
                <Textarea
                  id="product-description"
                  value={values.description}
                  rows={5}
                  maxLength={10000}
                  placeholder="Ceritakan spesifikasi dan keunggulan produk secara jelas..."
                  onChange={(e) => change("description", e.target.value)}
                  className="resize-y"
                />
                <p className="mt-1 text-right text-xs text-zinc-400">
                  {values.description.length}/10.000
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {([["material", "Material"]] as const).map(([key, label]) => (
                  <div key={key}>
                    <Label htmlFor={`product-${key}`}>{label}</Label>
                    <Textarea
                      id={`product-${key}`}
                      value={values[key]}
                      maxLength={2000}
                      rows={3}
                      onChange={(e) => change(key, e.target.value)}
                      placeholder={
                        key === "material"
                          ? "Contoh: Katun premium"
                          : "Contoh: Cuci dengan air dingin"
                      }
                    />
                  </div>
                ))}
              </div>
              <SizeChartEditor
                value={values.sizeChart ?? null}
                photos={[...values.images, ...values.optionImages]}
                disabled={!canEdit || !!pending || queueBusy || !mediaRecovered}
                onChange={(chart) => change("sizeChart", chart)}
                onUpload={uploadOption}
              />
            </section>

            <section
              id="product-pricing"
              className="min-w-0 space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_3px_14px_rgba(0,0,0,.025)] sm:p-6"
            >
              <div>
                <h2 className="text-base font-bold sm:text-lg">
                  Info penjualan
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Tentukan harga utama. Harga khusus dapat diatur per varian.
                </p>
              </div>
              <div className="seller-sales-control">
                <div>
                  <strong>Tambah varian</strong>
                  <p>
                    Tambahkan hingga 3 varian produk untuk beragam ukuran,
                    warna, bahan, atau yang lain.
                  </p>
                </div>
                <label className="seller-toggle">
                  <span className="sr-only">Tambah varian</span>
                  <input
                    id="seller-variant-toggle"
                    type="checkbox"
                    role="switch"
                    aria-label="Aktifkan variasi produk"
                    checked={custom}
                    disabled={!canEdit || !!pending}
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      if (
                        values.variants.some(
                          (row) =>
                            row.protected ||
                            (row.id && (row.onHand || row.reserved)),
                        )
                      ) {
                        setError(
                          "Mode variasi tidak dapat diubah karena SKU memiliki stok atau riwayat. Harga dan stok tetap dapat diedit. Buat produk baru untuk susunan variasi berbeda.",
                        );
                        return;
                      }
                      if (
                        (values.variants.some((row) => row.id) || !enabled) &&
                        !window.confirm(
                          enabled
                            ? "Aktifkan variasi? SKU yang ada dipertahankan pada kombinasi pertama. Tinjau pilihan sebelum menyimpan produk."
                            : "Nonaktifkan variasi? Hanya SKU pertama dipertahankan. Kombinasi lain dilepas setelah Simpan produk. Stok tidak digabungkan.",
                        )
                      )
                        return;
                      if (!enabled) {
                        const first = values.variants[0];
                        setValues((current) => ({
                          ...current,
                          basePrice: first?.price ?? current.basePrice,
                          salePrice:
                            first?.price != null
                              ? first.salePrice
                              : current.salePrice,
                          optionGroups: [],
                          variants: [simpleProductRow(current.variants)],
                        }));
                      }
                      setCustom(enabled);
                      setError("");
                      setNotice("");
                    }}
                  />
                  <span aria-hidden="true" className="seller-toggle-track" />
                </label>
              </div>
              {
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="product-price">
                        Harga normal (Rp){" "}
                        <span aria-hidden="true" className="text-red-500">
                          *
                        </span>
                      </Label>
                      <Input
                        id="product-price"
                        {...validationProps("product-price")}
                        aria-label="Harga normal (Rp)"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={2147483647}
                        step={1}
                        required
                        value={
                          (simple
                            ? (values.variants[0].price ?? values.basePrice)
                            : values.basePrice) || ""
                        }
                        onChange={(e) =>
                          setValues((current) => ({
                            ...current,
                            basePrice: Number(e.target.value),
                            variants: simple
                              ? current.variants.map((row) => ({
                                  ...row,
                                  price:
                                    row.price == null
                                      ? null
                                      : Number(e.target.value),
                                }))
                              : current.variants,
                          }))
                        }
                        placeholder="0"
                      />
                      {fieldError("product-price")}
                    </div>
                    <div>
                      <Label htmlFor="product-sale-price">
                        Harga diskon (opsional)
                      </Label>
                      <Input
                        id="product-sale-price"
                        {...validationProps("product-sale-price")}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
                        value={
                          (simple && values.variants[0].price != null
                            ? values.variants[0].salePrice
                            : values.salePrice) ?? ""
                        }
                        onChange={(e) =>
                          setValues((current) => ({
                            ...current,
                            salePrice: e.target.value
                              ? Number(e.target.value)
                              : null,
                            variants: simple
                              ? current.variants.map((row) => ({
                                  ...row,
                                  salePrice:
                                    row.price == null
                                      ? null
                                      : e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                }))
                              : current.variants,
                          }))
                        }
                        placeholder="Opsional"
                      />
                      {fieldError("product-sale-price")}
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-zinc-500">
                    <Info size={14} className="mr-1 inline-block" /> Harga
                    diskon harus lebih rendah dari harga normal.
                  </p>
                </>
              }
              {simple && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="simple-stock">Stok fisik</Label>
                    <Input
                      id="simple-stock"
                      {...validationProps("simple-stock")}
                      type="number"
                      inputMode="numeric"
                      min={values.variants[0].reserved ?? 0}
                      step={1}
                      disabled={!canStock}
                      value={values.variants[0].onHand ?? ""}
                      placeholder={canStock ? "0" : "Akses stok dibatasi"}
                      onChange={(e) =>
                        variantChange(0, { onHand: Number(e.target.value) })
                      }
                    />
                    {fieldError("simple-stock")}
                    <p className="mt-1 text-xs text-zinc-500">
                      {values.variants[0].reserved ?? 0} unit direservasi.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="simple-sku">Kode SKU</Label>
                    <Input
                      id="simple-sku"
                      {...validationProps("simple-sku")}
                      maxLength={80}
                      value={values.variants[0].sku}
                      readOnly={values.variants[0].protected}
                      placeholder="Otomatis saat produk disimpan"
                      onChange={(e) =>
                        variantChange(0, { sku: e.target.value })
                      }
                    />
                    {fieldError("simple-sku")}
                    <p className="mt-1 text-xs text-zinc-500">
                      {values.variants[0].protected
                        ? "SKU dikunci karena memiliki stok atau riwayat."
                        : "Isi kode sendiri atau biarkan kosong untuk dibuat otomatis."}
                    </p>
                  </div>
                </div>
              )}
            </section>

            {custom ? (
              <section id="product-variants" className="min-w-0 space-y-4">
                <Button
                  type="button"
                  variant="outline"
                  aria-pressed={reordering}
                  onClick={() => setReordering((value) => !value)}
                >
                  {reordering ? "Selesai mengurutkan" : "Urutkan variasi"}
                </Button>
                <CustomVariationEditor
                  mode="all"
                  fieldErrors={fieldErrors}
                  reordering={reordering}
                  groups={values.optionGroups ?? []}
                  rows={values.variants}
                  photos={[...values.images, ...values.optionImages]}
                  galleryPhotos={values.images}
                  optionPhotos={values.optionImages}
                  canUndoPhotos={Boolean(
                    persistedSnapshot.current?.optionImages.some(
                      (i) =>
                        !values.optionImages.some(
                          (current) => current.id === i.id,
                        ),
                    ),
                  )}
                  onRemovePhoto={(id) => removePhoto(id, "optionImages")}
                  onUndoPhotos={() => restorePhotos("optionImages")}
                  disabled={!canEdit || !!pending || !mediaRecovered}
                  canStock={canStock}
                  productName={values.name}
                  basePrice={values.basePrice}
                  onUpload={uploadOption}
                  onChange={(optionGroups, variants) => {
                    setError("");
                    setValues((current) => {
                      const next = {
                        ...current,
                        optionGroups,
                        variants,
                      };
                      return next;
                    });
                    setNotice("");
                  }}
                />
              </section>
            ) : !simple ? (
              <section
                id="product-variants"
                className="min-w-0 space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_3px_14px_rgba(0,0,0,.025)] sm:p-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-base font-bold sm:text-lg">
                      <Layers3 size={19} /> Varian &amp; stok
                    </h2>
                    <p className="mt-1 text-xs text-zinc-500">
                      Kelola warna, ukuran, harga, SKU, dan persediaan.
                    </p>
                  </div>
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                    {values.variants.length} / 50
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    !canEdit ||
                    !!pending ||
                    values.variants.some((row) => row.id)
                  }
                  onClick={() => {
                    if (values.variants.some((row) => row.id)) {
                      setError(
                        "SKU produk lama perlu konversi terkontrol untuk menjaga integritas keranjang dan histori transaksi.",
                      );
                      return;
                    }
                    setCustom(true);
                    requestAnimationFrame(() =>
                      document
                        .getElementById("product-variants")
                        ?.scrollIntoView({ block: "start" }),
                    );
                  }}
                >
                  Gunakan variasi kustom
                </Button>
                <ProductBulkEditor
                  rows={values.variants}
                  basePrice={values.basePrice}
                  canStock={canStock}
                  disabled={!canEdit || !!pending}
                  selected={bulkSelected}
                  selectedOnly={bulkSelectedOnly}
                  onMode={setBulkSelectedOnly}
                  onChange={(rows) => change("variants", rows)}
                />
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 p-3">
                  <ProductVariantBuilder
                    disabled={!canEdit || !!pending}
                    variants={values.variants}
                    placeholderRow={
                      values.variants.length === 1 &&
                      isEmptyDraftVariant(values.variants[0])
                    }
                    onAdd={appendCombinations}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-10 border-zinc-300"
                    disabled={
                      !canEdit || !!pending || values.variants.length >= 50
                    }
                    onClick={() =>
                      change("variants", [
                        ...values.variants,
                        {
                          sku: "",
                          color: "",
                          size: "",
                          price: null,
                          salePrice: null,
                          ...(canStock ? { onHand: 0 } : {}),
                        },
                      ])
                    }
                  >
                    <Plus size={16} /> Tambah varian
                  </Button>
                </div>
                <p className="text-xs leading-relaxed text-zinc-500">
                  SKU wajib unik. Harga varian yang kosong mengikuti harga
                  utama. Varian yang sudah digunakan dalam transaksi mungkin
                  tidak dapat dihapus.
                </p>
                <div className="space-y-3">
                  {values.variants.map((v, index) => (
                    <details
                      key={v.id || `new-${index}`}
                      open={index === 0}
                      onInvalidCapture={(event) => {
                        event.currentTarget.open = true;
                      }}
                      className="group min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-white"
                    >
                      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 bg-zinc-50 px-3 py-3 text-sm transition-colors hover:bg-zinc-100 sm:px-4 [&::-webkit-details-marker]:hidden">
                        {bulkSelectedOnly && (
                          <input
                            type="checkbox"
                            aria-label={`Pilih SKU sederhana ${index + 1}`}
                            checked={bulkSelected.has(index)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              setBulkSelected((current) => {
                                const next = new Set(current);
                                if (e.target.checked) next.add(index);
                                else next.delete(index);
                                return next;
                              })
                            }
                          />
                        )}
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white font-bold text-zinc-600 shadow-sm">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-zinc-900">
                            {[v.color, v.size].filter(Boolean).join(" · ") ||
                              `Varian ${index + 1}`}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-zinc-500">
                            {v.sku || "SKU belum diisi"}
                          </span>
                        </span>
                        <ChevronDown
                          size={17}
                          className="shrink-0 text-zinc-500 transition-transform group-open:rotate-180"
                        />
                      </summary>
                      <div className="space-y-3 border-t border-zinc-200 p-3 sm:p-4">
                        <div className="grid gap-3 sm:grid-cols-3">
                          {(
                            [
                              ["sku", "SKU"],
                              ["color", "Warna"],
                              ["size", "Ukuran"],
                            ] as const
                          ).map(([key, label]) => (
                            <div key={key}>
                              <Label htmlFor={`variant-${index}-${key}`}>
                                {label}
                                {key === "sku" && (
                                  <span
                                    aria-hidden="true"
                                    className="text-red-500"
                                  >
                                    {" "}
                                    *
                                  </span>
                                )}
                              </Label>
                              <Input
                                id={`variant-${index}-${key}`}
                                aria-label={label}
                                value={v[key] || ""}
                                readOnly={v.protected}
                                required={key === "sku"}
                                maxLength={
                                  key === "sku" ? 80 : key === "color" ? 80 : 40
                                }
                                placeholder={
                                  key === "sku"
                                    ? "SKU unik"
                                    : key === "color"
                                      ? "Contoh: Hitam"
                                      : "Contoh: M"
                                }
                                onChange={(e) =>
                                  variantChange(index, {
                                    [key]: e.target.value,
                                  })
                                }
                              />
                            </div>
                          ))}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          {(
                            [
                              ["price", "Harga varian (Rp)"],
                              ["salePrice", "Diskon varian (Rp)"],
                            ] as const
                          ).map(([key, label]) => (
                            <div key={key}>
                              <Label htmlFor={`variant-${index}-${key}`}>
                                {label}
                              </Label>
                              <Input
                                id={`variant-${index}-${key}`}
                                type="number"
                                inputMode="numeric"
                                min={1}
                                step={1}
                                value={v[key] ?? ""}
                                placeholder="Ikuti harga utama"
                                onChange={(e) =>
                                  variantChange(index, {
                                    [key]: e.target.value
                                      ? Number(e.target.value)
                                      : null,
                                  })
                                }
                              />
                            </div>
                          ))}
                          {(canStock || v.onHand !== undefined) && (
                            <div>
                              <Label htmlFor={`variant-${index}-stock`}>
                                Stok fisik
                              </Label>
                              <Input
                                id={`variant-${index}-stock`}
                                type="number"
                                inputMode="numeric"
                                min={v.reserved ?? 0}
                                step={1}
                                disabled={!canStock}
                                value={v.onHand ?? 0}
                                onChange={(e) =>
                                  variantChange(index, {
                                    onHand: Number(e.target.value),
                                  })
                                }
                              />
                              <p className="mt-1 text-xs text-zinc-500">
                                {v.reserved ?? 0} unit direservasi.
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="flex justify-end border-t border-zinc-100 pt-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            aria-label={`Hapus varian ${index + 1}`}
                            disabled={
                              !canEdit ||
                              !!pending ||
                              values.variants.length === 1
                            }
                            onClick={() =>
                              change(
                                "variants",
                                values.variants.filter((_, i) => i !== index),
                              )
                            }
                          >
                            <Trash2 size={15} /> Hapus varian
                          </Button>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            ) : null}

            <section
              id="product-shipping"
              className="min-w-0 space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6"
            >
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <Package size={20} aria-hidden="true" /> Pengiriman
                </h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Informasi berat dan ukuran paket.
                </p>
              </div>
              <div>
                <Label htmlFor="package-weight">Berat paket (gram) *</Label>
                <div className="relative">
                  <Input
                    id="package-weight"
                    inputMode="numeric"
                    placeholder="Contoh: 500"
                    value={shipping.weight}
                    onChange={(e) =>
                      setShipping((current) => ({
                        ...current,
                        weight: e.target.value,
                      }))
                    }
                    className="pr-16"
                  />
                  <span className="pointer-events-none absolute right-3 top-3 text-sm text-zinc-500">
                    gram
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-600">
                  Masukkan berat produk setelah dikemas. Boleh kosong pada
                  draft; wajib sebelum publikasi baru.
                </p>
              </div>
              <div className="grid gap-3 min-[430px]:grid-cols-3">
                {(
                  [
                    ["length", "Panjang"],
                    ["width", "Lebar"],
                    ["height", "Tinggi"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <Label htmlFor={`package-${key}`}>{label} (cm)</Label>
                    <Input
                      id={`package-${key}`}
                      inputMode="decimal"
                      placeholder="Opsional"
                      value={shipping[key]}
                      onChange={(e) =>
                        setShipping((current) => ({
                          ...current,
                          [key]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-600">
                Ukuran paket setelah dikemas, dalam sentimeter. Lengkapi
                ketiganya atau kosongkan seluruh dimensi. Tarif ongkir manual
                tetap berlaku.
              </p>
            </section>

            <section
              id="product-settings"
              className="min-w-0 space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_3px_14px_rgba(0,0,0,.025)] sm:p-6"
            >
              <h2 className="text-base font-bold sm:text-lg">
                Pengaturan lainnya
              </h2>
              <div>
                <Label htmlFor="product-shippingReturn">
                  Pengiriman &amp; pengembalian
                </Label>
                <Textarea
                  id="product-shippingReturn"
                  value={values.shippingReturn}
                  maxLength={2000}
                  rows={3}
                  placeholder="Tuliskan kebijakan pengiriman dan pengembalian..."
                  onChange={(e) => change("shippingReturn", e.target.value)}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex min-h-14 items-center justify-between gap-4 rounded-xl border border-zinc-200 px-4 text-sm font-medium">
                  <span>Produk unggulan</span>
                  <input
                    type="checkbox"
                    checked={values.isFeatured}
                    onChange={(e) => change("isFeatured", e.target.checked)}
                    className="h-5 w-5 accent-black"
                  />
                </label>
              </div>
              <p className="text-xs leading-relaxed text-zinc-500">
                Draft dan arsip tidak dapat dibeli melalui storefront. Arsip
                tetap menyimpan riwayat pesanan.
              </p>
            </section>
          </fieldset>
          <aside className="hidden space-y-4 2xl:block">
            <div className="sticky top-24 space-y-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_3px_14px_rgba(0,0,0,.025)]">
                <h2 className="text-sm font-bold text-zinc-950">
                  Isi data produk
                </h2>
                <p className="mb-4 mt-1 text-xs leading-relaxed text-zinc-500">
                  Navigasi cepat untuk melengkapi katalog.
                </p>
                <nav aria-label="Bagian editor produk" className="space-y-1">
                  {(
                    [
                      ["product-images", "Foto produk"],
                      ["product-basic", "Informasi dasar"],
                      ["product-detail", "Detail produk"],
                      ["product-pricing", "Harga"],
                      ...(!simple
                        ? [["product-variants", "Varian & stok"] as const]
                        : []),
                      ["product-shipping", "Pengiriman"],
                      ["product-settings", "Pengaturan lainnya"],
                    ] as const
                  ).map(([href, label], index) => (
                    <a
                      key={href}
                      href={`#${href}`}
                      className="flex min-h-10 items-center gap-3 rounded-lg px-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-950"
                    >
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-zinc-100 text-[11px] font-bold">
                        {index + 1}
                      </span>
                      {label}
                    </a>
                  ))}
                </nav>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles size={18} /> Tips katalog
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-600">
                  Gunakan nama yang spesifik, foto yang terang, dan SKU unik
                  untuk setiap kombinasi. Pastikan harga dan stok sudah benar
                  sebelum publikasi.
                </p>
              </div>
            </div>
          </aside>
        </div>
        {canEdit && (
          <div className="seller-product-actions">
            <span className="min-w-0 flex-1 text-xs font-medium text-zinc-500">
              {pending?.startsWith("upload-")
                ? "Foto sedang diunggah. Produk belum disimpan."
                : dirty
                  ? "Ada perubahan yang belum disimpan."
                  : productId
                    ? "Seluruh perubahan telah disimpan."
                    : "Belum ada perubahan."}
              {status === "DRAFT" && (
                <span className="mt-1 block">
                  {readiness.ready
                    ? readiness.reason
                    : `Lengkapi informasi wajib untuk menerbitkan produk. ${readiness.reason}`}
                </span>
              )}
            </span>
            {status === "DRAFT" && readiness.ready && (
              <Button
                type="submit"
                variant="outline"
                data-testid="save-product"
                data-intent="save"
                disabled={!!pending || queueBusy || !dirty}
              >
                Simpan Draft
              </Button>
            )}
            <Button
              type="submit"
              disabled={
                !!pending ||
                queueBusy ||
                (!dirty && (status !== "DRAFT" || !readiness.ready))
              }
              data-intent={
                status === "DRAFT" && readiness.ready ? "publish" : "save"
              }
              aria-busy={pending === "save"}
              data-testid={
                status === "DRAFT" && readiness.ready
                  ? "publish-product"
                  : "save-product"
              }
              className="h-11 shrink-0 rounded-xl px-5 sm:px-7"
            >
              <Save size={17} />
              {status !== "DRAFT"
                ? "Simpan Perubahan"
                : readiness.ready
                  ? "Terbitkan"
                  : "Simpan sebagai Draft"}
              {pending === "save" && (
                <span role="status" className="text-xs">
                  Menyimpan…
                </span>
              )}
            </Button>
          </div>
        )}
      </form>
      {productId && (
        <section
          id="product-publication"
          className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6"
        >
          <div>
            <h2 className="text-base font-bold sm:text-lg">Publikasi</h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Simpan perubahan terlebih dahulu sebelum mengubah status. Produk
              terbit langsung tersedia di katalog.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canArchive && (
              <DeleteProductButton
                id={productId}
                name={values.name}
                revision={version}
                disabled={!!pending || queueBusy || dirty}
              />
            )}
            {canEdit && status === "ARCHIVED" && (
              <Button
                type="button"
                disabled={!!pending || queueBusy || dirty || !readiness.ready}
                onClick={() => void changeStatus("PUBLISHED")}
                data-testid="publish-product"
              >
                Terbitkan produk
              </Button>
            )}
            {canEdit && status !== "DRAFT" && (
              <Button
                type="button"
                variant="outline"
                disabled={!!pending || queueBusy || dirty}
                onClick={() => void changeStatus("DRAFT")}
                data-testid="draft-product"
                className="min-h-11 rounded-xl"
              >
                Ubah menjadi draft
              </Button>
            )}
            {canArchive && status !== "ARCHIVED" && (
              <Button
                type="button"
                variant="outline"
                disabled={!!pending || queueBusy || dirty}
                onClick={() => void changeStatus("ARCHIVED")}
                data-testid="archive-product"
                className="min-h-11 rounded-xl"
              >
                {pending === "ARCHIVED" ? "Mengarsipkan..." : "Arsipkan produk"}
              </Button>
            )}
            {status === "PUBLISHED" && (
              <Button asChild variant="outline" className="min-h-11 rounded-xl">
                <Link href={`/product/${values.slug}`}>
                  Lihat di storefront
                </Link>
              </Button>
            )}
          </div>
          {dirty && (
            <p className="text-xs font-medium text-amber-700">
              Simpan semua perubahan sebelum mengubah status produk.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
