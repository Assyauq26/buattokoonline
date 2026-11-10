# Customer orders and refund feedback

Date: 2026-11-10. Branch: `codex/customer-refund-feedback`.
Baseline: v1.6.1, `d162af4331956e4a0bfa82af4e46399f95b9c7ea`.
Scope: implementation and local verification only. No merge, release, deployment, DNS change or production database operation.

## Findings

- Customer orders CSS explicitly hid the shared storefront header on mobile. Header stickiness also depended on the store's optional homepage setting.
- The customer bank form reused the seller resolution workflow. Successful writes displayed a generic message above the form; the saved account remained visually indistinguishable from an editable form. The supplied screenshot already showed a persisted account. Local HTTP/database/browser tests confirmed persistence; this was principally a feedback/state presentation problem, not evidence of a failed production write.
- Order detail repeated cancellation, resolution and general status in separate panels. The list repeated the status below its badge and fetched only the latest resolution, hiding older refunds when a newer request existed.
- The endpoint already enforced order ownership, revision checks and an order transaction lock, and encrypted bank details. It returned only an ID, and operation invalidation omitted customer list/account and resolution routes.
- There was no reusable mounted toast component in the application; only styling references. Added a small shared status component using the existing icon library, without a new notification dependency.

## Changes

| Before | After | Why |
| --- | --- | --- |
| Mobile header hidden | Existing header remains sticky on customer order routes | Restore navigation without duplicate store chrome |
| Visible tab scrollbar | Scoped hidden scrollbar, existing horizontal swipe and keyboard navigation retained | Preserve all filters and counts |
| Repeated cancellation/refund panels | One primary status/refund card, products/totals, compact payment/address/history accordions | Match the supplied hierarchy |
| Shared seller bank form | Dedicated customer refund view and masked saved-account summary | Make the result of saving obvious |
| Generic remote success notice | Immediate busy state, inline validation, committed-state acknowledgement and 3.6-second toast | No silent submission or premature success |
| Unknown network result permits blind retry | Refetch first; if reconciliation fails, require a status check before another write | Avoid duplicate or stale updates |

Customer pages use published branding and theme tokens. Store contact links use the public configured WhatsApp destination only. Existing payment proof, delivery timeline, review, return tracking, evidence, refund receipt and dispute actions remain available.

## State and financial correctness

- Unpaid cancellation and unapproved requests do not display an approved refund amount or bank form.
- `WAITING_BANK`: request bank details. `READY`: account saved; awaiting seller processing.
- `TRANSFER_PENDING`: account is locked. `TRANSFER_RECORDED`: seller has recorded a transfer, not confirmed customer receipt.
- `RECEIVED`: customer confirmed receipt. `WAITING_RETURN`: refund remains subject to return inspection.
- Amounts come from the resolution's approved product/shipping snapshots, not the order total. Multiple historical refunds remain visible.
- The server additionally rejects bank changes without a positive approved amount and verified payment. Its committed response includes state/revision/hasBank, never account details or ciphertext.
- Bank-only writes do not change payment, shipment, inventory or stock movements. Existing order locks and optimistic revisions prevent races with seller transfer preparation.
- Account numbers remain strings; leading zeros and 5–30 digit lengths are preserved. Validation checks format only, not bank ownership/existence.
- Saved summaries mask account numbers. Toasts and audit event messages contain no account numbers. Authorized owner/seller forms can still read the destination when needed.
- Expired sessions redirect to login; another customer's resolution page resolves to not-found. Private proof endpoints retain ownership checks and no-store caching.

## Verification

- Production build and TypeScript checks passed. Existing unrelated ambiguous Tailwind easing/Vite configuration warnings remain; no new build failure.
- 60 tests passed across refund presentation/policy, customer payment CTA, customer grouping, order flow and the PostgreSQL resolution integration suite.
- 30 browser checks passed. Browser checks use the production build at `127.0.0.1:3103` and disposable local PostgreSQL `management_v130_test`. Fixtures, bank destinations and proof files are synthetic.
- Browser evidence: `order-flow-evidence/customer-refund/results.json`. Covers 360/390/430/1440 widths, sticky single header, keyboard tab access, form errors/focus, delayed and repeated submits, HTTP/business failures, network failure, timeout after commit, uncertain-outcome reconciliation, refresh/back/forward, seller visibility, concurrent transfer lock, foreign account rejection, unpaid cancellation, partial returns, private proof access, actual UI receipt confirmation, active theme, reduced motion and unmount handling.
- Screenshots: `customer-orders-{width}.png`, `customer-detail-{width}.png`, `customer-refund-{width}.png`, and `customer-bank-saved-toast-390.png` in that evidence directory.
- No real transfer, carrier dispatch or production customer mutation was performed. Responsive checks use desktop Chrome emulation, not physical mobile-device testing.

## Files and review boundary

Primary changes: customer order list/detail/resolution routes and scoped styles; storefront header; `customer-refund.tsx`; `status-toast.tsx`; `customer-refund-view.ts`; resolution acknowledgement/eligibility and operation invalidation; regression/browser tests.

No schema migration or new package is required. This branch retains VERSION 1.6.1 and is prepared for review, not published as a new release. Deployment and production smoke testing remain outside this request.
