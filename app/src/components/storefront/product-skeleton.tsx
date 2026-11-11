import "./product-detail.css";
import "./product-skeleton.css";

export function ProductSkeleton() {
  return <div className="pdp-page pdp-skeleton" role="status" aria-label="Memuat produk" aria-busy="true" data-testid="product-skeleton">
    <span className="sr-only">Memuat informasi produk…</span>
    <div className="pdp-main" aria-hidden="true">
      <div className="pdp-topbar"><span className="pdp-skeleton-block pdp-skeleton-icon" /><span className="pdp-skeleton-block pdp-skeleton-logo" /><span className="pdp-skeleton-block pdp-skeleton-icon" /></div>
      <div className="pdp-hero"><div className="pdp-media"><div className="pdp-gallery-frame pdp-skeleton-block"><span className="pdp-gallery-progress"><span className="pdp-skeleton-indicator" /></span></div></div></div>
      <div className="pdp-sheet"><div className="pdp-info">
        <div className="pdp-skeleton-block pdp-skeleton-brand" />
        <div className="pdp-skeleton-block pdp-skeleton-title" />
        <div className="pdp-skeleton-block pdp-skeleton-price" />
        <div className="pdp-skeleton-block pdp-skeleton-rating" />
        <div className="pdp-skeleton-block pdp-skeleton-label" />
        <div className="pdp-skeleton-options">{[0, 1, 2, 3].map((i) => <span key={i} className="pdp-skeleton-block" />)}</div>
        <div className="pdp-skeleton-block pdp-skeleton-quantity" />
        <div className="pdp-skeleton-block pdp-skeleton-note" />
        {[0, 1, 2, 3].map((i) => <div key={i} className="pdp-skeleton-row"><span className="pdp-skeleton-block pdp-skeleton-icon" /><span className="pdp-skeleton-block pdp-skeleton-row-label" /></div>)}
        <div className="pdp-purchase-actions"><span className="pdp-skeleton-block pdp-skeleton-cta" /><span className="pdp-skeleton-block pdp-skeleton-cta" /></div>
      </div></div>
    </div>
  </div>;
}
