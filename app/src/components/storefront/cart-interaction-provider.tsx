"use client";
import * as Dialog from "@radix-ui/react-dialog";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";
import { addToCartAction } from "@/modules/cart/cart.actions";
import { emitCartCount } from "@/modules/cart/cart-events";
import type { PurchaseProduct } from "@/modules/catalog/purchase-options";
import { Button } from "@/components/ui/button";
import { QuickAddVariantSheet } from "./quick-add-variant-sheet";
import { CartSuccessSheet, type AddedProduct } from "./cart-success-sheet";
import { ProductPurchaseMotion, useProductSheetPresence } from "./product-purchase-motion";

type Interaction = {
  busy: boolean;
  openProduct: (slug: string, trigger: HTMLElement) => void;
  add: (
    product: PurchaseProduct,
    variantId: string,
    quantity: number,
    trigger?: HTMLElement,
  ) => Promise<boolean>;
};
const Context = createContext<Interaction | null>(null);
export const useCartInteraction = () => useContext(Context);
export function CartInteractionProvider({ children }: { children: ReactNode }) {
  const router = useRouter(),
    pathname = usePathname();
  const [phase, setPhase] = useState<
    "closed" | "loading" | "options" | "error" | "success"
  >("closed");
  const productPage = pathname.startsWith("/product/");
  const lastPhase = useRef(phase);
  if (phase !== "closed") lastPhase.current = phase;
  const displayPhase = phase === "closed" && productPage ? lastPhase.current : phase;
  const [keyboardInput, setKeyboardInput] = useState(false);
  const [directProductAdd, setDirectProductAdd] = useState(false);
  useEffect(() => {
    if (!productPage) return;
    const keyboard = () => setKeyboardInput(true);
    const pointer = () => setKeyboardInput(false);
    document.addEventListener("keydown", keyboard);
    document.addEventListener("pointerdown", pointer);
    return () => { document.removeEventListener("keydown", keyboard); document.removeEventListener("pointerdown", pointer); };
  }, [productPage]);
  const [product, setProduct] = useState<PurchaseProduct | null>(null),
    [added, setAdded] = useState<AddedProduct | null>(null);
  const [error, setError] = useState<string | null>(null),
    [uncertain, setUncertain] = useState(false),
    [busy, setBusy] = useState(false);
  // Keep the product button pending until the server responds. Showing the
  // taller options sheet first makes the success sheet appear to slide down.
  const sheetOpen = phase !== "closed" && !(directProductAdd && busy && phase === "options");
  const { present, visible } = useProductSheetPresence(sheetOpen, productPage, keyboardInput);
  const [seedQuantity, setSeedQuantity] = useState(1);
  const [seed, setSeed] = useState<Record<string, string>>({});
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const epoch = useRef(0);
  const refreshOnCart = useRef(false);
  const refresh = router.refresh;
  const trigger = useRef<HTMLElement | null>(null),
    mutation = useRef(false),
    controller = useRef<AbortController | null>(null),
    opened = useRef(false),
    slugRef = useRef("");
  useEffect(() => {
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    epoch.current++;
    setPhase("closed");
    opened.current = false;
    controller.current?.abort();
    if (pathname === "/cart" && refreshOnCart.current) {
      refreshOnCart.current = false;
      refresh();
    }
  }, [pathname, refresh]);
  // Refresh an already-open sheet without resetting its selected options/quantity.
  // A router refresh alone preserves this provider's client-held product snapshot.
  useEffect(() => {
    if (phase !== "options" || !product?.slug) return;
    const slug = product.slug;
    let active = true;
    let request: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = async () => {
      if (mutation.current || request) return;
      request = new AbortController();
      timer = setTimeout(() => request?.abort(), 5000);
      setBusy(true);
      try {
        const response = await fetch(
          `/api/v1/products/${encodeURIComponent(slug)}/purchase`,
          { cache: "no-store", signal: request.signal },
        );
        const result = await response.json();
        if (!response.ok || !result.success)
          throw new Error(
            "Pilihan berubah. Tutup dan buka kembali untuk memuat harga terbaru.",
          );
        if (active && opened.current)
          setProduct(result.data as PurchaseProduct);
      } catch {
        if (active) {
          setError(
            "Harga diperbarui. Tutup dan buka kembali untuk memuat pilihan terbaru.",
          );
          setUncertain(true);
        }
      } finally {
        clearTimeout(timer);
        request = null;
        if (active) setBusy(false);
      }
    };
    window.addEventListener("store:campaign-changed", update);
    return () => {
      active = false;
      clearTimeout(timer);
      request?.abort();
      window.removeEventListener("store:campaign-changed", update);
    };
  }, [phase, product?.slug]);
  function close() {
    if (mutation.current) return;
    controller.current?.abort();
    opened.current = false;
    setPhase("closed");
    setBusy(false);
  }
  function cart() {
    opened.current = false;
    setPhase("closed");
    refreshOnCart.current = true;
    if (pathname === "/cart") {
      refreshOnCart.current = false;
      refresh();
    } else router.push("/cart");
  }
  async function add(
    current: PurchaseProduct,
    variantId: string,
    quantity: number,
    element?: HTMLElement,
  ) {
    if (mutation.current) return false;
    setDirectProductAdd(productPage && phase === "closed" && Boolean(element));
    setContainer(document.querySelector<HTMLElement>(".storefront-root"));
    const generation = epoch.current;
    mutation.current = true;
    opened.current = true;
    if (element) {
      trigger.current = element;
      setSeedQuantity(quantity);
      const variant = current.variants.find((v) => v.id === variantId);
      setSeed(
        Object.fromEntries(
          current.groups.map((g) => [
            g.id,
            g.values.find((v) => variant?.optionValueIds.includes(v.id))?.id ??
              "",
          ]),
        ),
      );
    }
    setProduct(current);
    setPhase("options");
    setBusy(true);
    setError(null);
    setUncertain(false);
    try {
      const result = await addToCartAction(variantId, quantity);
      if (generation !== epoch.current) return false;
      if (result.unauthorized) {
        opened.current = false;
        setPhase("closed");
        router.push("/login?redirectTo=/cart");
        return false;
      }
      if (!result.ok || !result.data) {
        // Only a409 proves the locked stock transaction rolled back. A generic
        // error can follow a committed increment whose cart-view read failed.
        const unknown = result.httpStatus !== 409;
        setUncertain(unknown);
        setError(
          unknown
            ? `${result.error ?? "Hasil belum dapat dipastikan."} Periksa keranjang sebelum mencoba lagi.`
            : (result.error ?? "Gagal menambah produk. Silakan coba lagi."),
        );
        return false;
      }
      const line = result.data.lines.find((l) => l.variantId === variantId);
      emitCartCount(result.data.count);
      if (!line) {
        setUncertain(true);
        setError(
          "Produk diperbarui. Periksa keranjang untuk memastikan hasilnya.",
        );
        return false;
      }
      setAdded({
        name: line.product.name,
        image: line.product.image,
        variantLabel: line.variantLabel,
        quantity,
        unitPrice: line.unitPrice,
      });
      setPhase("success");
      return true;
    } catch {
      // A lost response may follow a committed write. Do not offer blind replay.
      if (generation !== epoch.current) return false;
      setUncertain(true);
      setError("Koneksi terputus. Periksa keranjang sebelum mencoba lagi.");
      return false;
    } finally {
      mutation.current = false;
      setBusy(false);
      router.refresh();
    }
  }
  async function load(slug: string) {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setPhase("loading");
    setProduct(null);
    setSeed({});
    setSeedQuantity(1);
    setError(null);
    setUncertain(false);
    const timeout = setTimeout(() => request.abort(), 12000);
    try {
      const response = await fetch(
        `/api/v1/products/${encodeURIComponent(slug)}/purchase`,
        { cache: "no-store", signal: request.signal },
      );
      const result = await response.json();
      if (!response.ok || !result.success)
        throw new Error(result.error?.message ?? "Pilihan tidak dapat dimuat");
      if (request.signal.aborted || !opened.current) return;
      const current = result.data as PurchaseProduct;
      setProduct(current);
      if (
        !current.groups.length &&
        current.variants.length === 1 &&
        current.variants[0].available > 0
      )
        await add(current, current.variants[0].id, 1);
      else setPhase("options");
    } catch (e) {
      if (opened.current && controller.current === request) {
        setPhase("error");
        setError(
          e instanceof Error && !request.signal.aborted
            ? e.message
            : "Pilihan belum dapat dimuat. Silakan coba lagi.",
        );
      }
    } finally {
      clearTimeout(timeout);
      if (controller.current === request) setBusy(false);
    }
  }
  function openProduct(slug: string, element: HTMLElement) {
    if (opened.current || mutation.current) return;
    setContainer(document.querySelector<HTMLElement>(".storefront-root"));
    opened.current = true;
    trigger.current = element;
    slugRef.current = slug;
    void load(slug);
  }
  return (
    <Context.Provider value={{ busy, openProduct, add }}>
      {children}
      <Dialog.Root
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        {container && (!productPage || present) && (
          <Dialog.Portal container={container} forceMount={productPage ? true : undefined}>
            <Dialog.Overlay forceMount={productPage ? true : undefined} className="purchase-backdrop" data-product-motion={productPage || undefined} data-visible={visible} data-instant={keyboardInput} />
            <Dialog.Content
              forceMount={productPage ? true : undefined}
              className="purchase-sheet"
              data-product-motion={productPage || undefined}
              data-visible={visible}
              data-instant={keyboardInput}
              data-testid="purchase-dialog"
              aria-describedby="purchase-description"
              onEscapeKeyDown={(e) => {
                if (mutation.current) e.preventDefault();
              }}
              onPointerDownOutside={(e) => {
                if (mutation.current) e.preventDefault();
              }}
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                if (trigger.current?.isConnected)
                  trigger.current.focus({ preventScroll: true });
              }}
            >
              <ProductPurchaseMotion enabled={productPage} phase={displayPhase} instant={!productPage || keyboardInput}>
              <span className="purchase-drag-handle" aria-hidden="true" />
              <Dialog.Title
                className={
                  displayPhase === "success"
                    ? "sr-only"
                    : "mb-5 pr-8 text-base font-semibold"
                }
              >
                {displayPhase === "success"
                  ? "Berhasil ditambahkan ke keranjang"
                  : "Pilih produk"}
              </Dialog.Title>
              <Dialog.Description id="purchase-description" className="sr-only">
                {displayPhase === "success"
                  ? "Produk sudah dikonfirmasi server. Pilih lanjut belanja atau lihat keranjang."
                  : "Pilih variasi dan jumlah yang tersedia sebelum menambahkan produk."}
              </Dialog.Description>
              {displayPhase !== "success" && (
                <button
                  type="button"
                  className="purchase-close"
                  aria-label="Tutup"
                  disabled={busy && mutation.current}
                  onClick={close}
                >
                  <X size={20} />
                </button>
              )}
              {displayPhase === "loading" && (
                <p role="status" className="flex items-center gap-3 py-8">
                  <Loader2
                    className="animate-spin motion-reduce:animate-none"
                    size={20}
                  />
                  Memuat pilihan…
                </p>
              )}
              {displayPhase === "error" && (
                <div className="space-y-5">
                  <p role="alert">{error}</p>
                  <Button onClick={() => void load(slugRef.current)}>
                    Coba Lagi
                  </Button>
                </div>
              )}
              {displayPhase === "options" && product && (
                <QuickAddVariantSheet
                  key={product.id}
                  product={product}
                  initialOptions={seed}
                  initialQuantity={seedQuantity}
                  busy={busy}
                  error={error}
                  uncertain={uncertain}
                  onSubmit={(id, quantity) => void add(product, id, quantity)}
                  onCart={cart}
                />
              )}
              {displayPhase === "success" && added && (
                <CartSuccessSheet
                  item={added}
                  onContinue={close}
                  onCart={cart}
                />
              )}
              </ProductPurchaseMotion>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </Dialog.Root>
    </Context.Provider>
  );
}
