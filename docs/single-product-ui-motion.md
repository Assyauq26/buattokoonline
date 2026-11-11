# Single product UI and motion

Scope: frontend product route and its interactions only. Base: `origin/main` at `cc4e42e`. Worktree: `single-product-ui-motion`; branch: `codex/single-product-ui-motion`.

## Audit

| Before | After | Why |
| --- | --- | --- |
| Gallery replaces a keyed image after touchend | Native horizontal scroll-snap with one capsule track/thumb | Follows the finger and permits gesture cancellation without blocking vertical document scroll |
| Dot window, separate zoom state | Shared active photo with fullscreen Radix dialog and keyboard controls | Preserves position, focus, Escape and body scroll lock |
| Native disclosure snaps; size chart and information container each add a rule | Interruptible local disclosure transition and one rule per row | Removes double divider and abrupt content changes |
| Product questions block | Removed from this route | Requested simplification; no backend deletion |
| Cart portal mounts/unmounts abruptly | Product-only retained exit, transform/opacity transitions and local sheet height adjustment | No page layout jump; existing mutation and confirmation handlers remain intact |
| Shared loading boundary always displays Shop grid | Dedicated product route skeleton and pathname-aware parent fallback | Matches the large gallery, product details and mobile actions |

## Integration

The active chat “Perbarui fitur Pengiriman” was reviewed before editing. Its current work concerns central dashboard/installer and store mail-brand synchronization in `platform-m1` and `seller-order-flow`. Open PR #36 (`codex/one-click-updater-openwa`) concerns updater, authentication, admin settings and WhatsApp. No changed product files overlap its reviewed diff. PR #3 remains an older updater PR.

The shared cart provider and purchase stylesheet are the main integration surfaces. New behavior is gated by the product pathname/data attribute; other routes retain their existing DOM wrapper and animations. Review their latest diffs again after PR #36 completes. Do not merge or deploy this PR before that integration check. No CI was manually dispatched; commits use `[skip ci]` to avoid automatic workflows.

## Design references and limits

Applied `emil-design-eng` and reviewed React components with `react-best-practices`. The supplied page screenshot and Shopee capsule indicator were inspected. The generated latest mockup was not exposed in the available chat attachment history, so exact pixel matching cannot be asserted. Product data, reviews, prices and stock remain dynamic.

The gallery frame is edge-to-edge on mobile and uses a 4:5 silhouette. Images use `contain` to preserve the entire product/model. Differently proportioned images can retain background space; no cropping or image alteration is introduced. Automated screenshots use explicitly synthetic local fixtures, not production product data. Touch tests use browser emulation, not physical iOS/Android hardware.

Following screenshot review, the capsule indicator overlays the lower-left photo where the Perbesar label previously appeared. The label and arrows beside the indicator are removed; clicking/tapping the photo still opens fullscreen. Color options use content-width flex wrapping instead of two equal columns. The loading silhouette follows both changes. Fullscreen previous/next controls remain available for desktop navigation.

## Local verification

Use Node 22 and a disposable local PostgreSQL database named `single_product_ui_test`. Apply existing migrations, generate Prisma and build `app`. Set `DATABASE_URL`/`DIRECT_URL` to this database, then run `node tests/single-product-ui-browser.mjs` from the repository root. The script rejects remote hosts and other database names, creates fixture data, starts a local preview on port 3119, exercises actual cart actions and writes screenshots/results under `output/single-product-ui` (ignored by Git).

Validation results are recorded in the PR description and the local `results.json`; build/lint output is summarized there. No production database, API, authentication, checkout or cart business logic was changed.

Verified locally: 39 tests across gallery keyboard/fallback/variant handling, cart interaction, purchase validation/options and quantity; production build with type validation; full lint with 0 errors and 37 existing warnings (changed components lint clean). Chromium checks cover 360/390/430/768/1440px, first-load skeleton under a database lock, native touch emulation, fullscreen keyboard/focus/scroll lock, accordion/reduced motion, wishlist, actual successful and rejected cart mutations, direct checkout preserving cart, and one/zero photos. No browser page errors were recorded.
