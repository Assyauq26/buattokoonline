# Payments live completion — working checkpoint

Base: main ef7b338413b33d05e864deb858ccc75a5269189a, published v1.8.2.
Hubify was freshly checked at that source/version, schema33 and healthy services.
This document is not evidence of a new deployment. Current edits are local only.
The owner authorizes implementation, merge, Hubify deployment and publication
after gates, without another approval or bank transfer before release.

## Implemented continuation

blu now claims one authenticated bank credit and settles through the shared
payment/inventory/history/notification transaction. Exact final amount, receiving
account, signed supported incoming-email content, an active matching window and
one unclaimed notification are required. Sender identity is not a match key.
Conflicts, invalid signatures, unsupported message identity and closed orders
remain unapproved. Claims never expire or disappear on restart.

Activation readiness uses the exact backend activation validator without writes.
Live HTML currently had an enabled checkbox/button; the prior backend combined
message hid the five-minute Gmail-check freshness requirement. Separate reasons
now distinguish stale checks, disconnected/invalid sessions, inactive accounts,
missing bank signature verification and operator permission/configuration.

| Before | After | Why |
| --- | --- | --- |
| Activation error appears only after submitting | Readiness reason shown before activation | Explain the actual unmet requirement |
| Every blu candidate requires approval | One authenticated, unique incoming notification settles atomically | Apply the owner's amount-based business rule |
| Browser only reads stored status | Explicit check uses the shared backend worker with durable cooldown | Tabs cannot manufacture payment proof or multiply provider polls |
| QRIS text only | Bounded PNG/JPEG/WebP upload, local decode and TLV/CRC validation | Support phone and desktop setup |
| Opaque authentication dependency | In-repository typed fixed-origin transport and encrypted persistent sessions | No opaque program runs with merchant credentials |
| QR image follows mutable settings | QR payload, random QR/trx IDs and merchant name snapshot per attempt | Configuration edits cannot change issued bills |

## GoPay contract evidence

Upstream reference: ahmadzakiyox/gopay-api-gateaway at c753b8c; readable historic
server2f9444e79c17c2fd01832a03720a7b67032bab9f was compared with current server.
Current login.js/sessionManager.js were traced only in the existing dedicated
QA VM's disposable Docker container: network none, read-only root/input, node
user, capabilities dropped, no-new-privileges,128MiB memory,1CPU,32 PIDs and16MiB
tmpfs. Only synthetic phone/OTP/access/refresh values and mocked axios/fs were
available. VM code generation was disabled and evaluation bounded. No owner
account, real credential, inbox or production filesystem was mounted.

Observed current request DTOs, not guessed endpoints:

- POST https://api.gobiz.co.id/goid/login/request:
  client_id=go-biz-web-new, phone_number=national digits, country_code=62.
  This differs from the historical full-phone/login_type request.
- POST https://api.gobiz.co.id/goid/token: grant_type=otp,
  data={otp,otp_token}, same client_id.
- Same token endpoint for grant_type=refresh_token:
  data={refresh_token,phone_number,country_code}.
- GET https://api.gobiz.co.id/goresto/v5/public/users/config:
  current login reads response.merchant.id and merchant.outlet_name.
- Current readable server uses the merchant-analytics/v2/merchants/transactions
  endpoint with from/size/start_time/end_time/merchant_ids/statuses/payment_types.

This proves shapes used by upstream code under mocks; it does not prove current
provider acceptance, a live connection or a successful payment. The native adapter
validates each response, rejects missing challenge/token/expiry/merchant data,
rejects redirects, bounds bodies/timeouts and never returns provider tokens/errors
to the browser. No missing transaction status defaults to success. Unknown,
refund/partial-refund, pending and failed mutations cannot settle.

## Database / release work still required

Only new migration20261115120000_gopay_payment_attempt adds nullable QR snapshot
columns and indexes, plus a connected-source opt-in CHECK. Existing source flags,
prices, orders, stock, history and old migration SQL are not changed. It was applied
only to the isolated local test database. Production remains schema33.

Do not publish or deploy this checkpoint. Remaining gates include full session
and worker failure/restart/security tests, desktop/mobile flow verification, complete
mutation coverage/cursor review, migration snapshot/restore rehearsal, official
updater/private Hubify33→34 cutover capability, packaging/version metadata,
artifact identity, capacity/backup preflight, actual deployment and smoke, then
tag/release/catalog. Preserve J&T Production flags, historical SQL/ledger/artifacts,
other tenants and central web services. Post-SQL recovery must be forward-only;
never automatically restore a database after new orders may have arrived.

Local evidence so far: typecheck passes; one production build passed before the
later GoPay checkout/worker additions; targeted lint had no errors and one image
warning;27 current payment/database/adapter/image tests pass. Those results do
not replace the outstanding gates or prove a live GoPay connection.
