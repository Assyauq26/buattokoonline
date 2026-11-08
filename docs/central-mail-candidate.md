# Central mail candidate — 2026-11-07

Status: **NO-GO for public production rollout**. Proposed version: **1.2.0**.
This branch does not authorize merging, publishing a stable tag, changing DNS,
deploying the store/platform, or enabling public installations.

## Scope and trust

One independent PostgreSQL database per store is retained. Only the operator
relay possesses the Resend API key. A paired outbound agent retrieves a random
256-bit store credential directly from the authenticated platform API; the
browser never receives it. The platform stores a digest for authorization and
an AES-GCM envelope for idempotent retry, using a separate key namespace.

The relay reads canonical tenant identity from the operator control endpoint on
every request. There is no stale positive authorization cache. Brand, domain and
administrator changes require an OTP-authenticated platform owner; the agent
cannot approve its own identity. DNS must resolve to the paired VPS. Changes
rotate the token and invalidate readiness. Only verified platform accounts may
be added as authorized administrators. Agent revocation also disables mail.

The agent compares the approved brand against the locally published branding,
verifies relay readiness, atomically writes the store token with mode 0600,
reconciles only the application container, checks health, and acknowledges a
short-lived HMAC receipt bound to tenant and credential generation. Failed
activation cannot complete an email-enabled installation. Legacy controllers
with provisioning disabled retain installation compatibility but do not gain
OTP readiness automatically.

**Identity limitation:** a changed published brand requires owner approval in
the platform Email & OTP panel. A domain change also requires the store runtime
and HTTPS to be migrated; this adapter deliberately does not rewrite domains.
Until identities match, the dashboard says action is needed. Fully automatic
owner-authorized branding/domain synchronization is not yet a closed release
gate. No untrusted VPS claim is silently accepted.

## Operator service preparation (not executed)

1. Build `services/mail-relay/Dockerfile` from the reviewed exact commit and pin
   `MAIL_RELAY_IMAGE` by digest. Run `services/mail-relay/compose.yaml` only on the
   trusted operator host. No seller package contains a provider key.
2. Create root-owned `/etc/btos-mail-relay/runtime.env` mode 0600. Provision the
   existing Resend key server-side without printing it. Set `MAIL_REGISTRY_URL`
   to the private platform service `/api/platform/internal/mail-registry`, the
   shared operator-only `MAIL_CONTROL_SECRET`, `MAIL_RELAY_DB=/data/mail.sqlite`,
   and `MAIL_RELAY_BIND=0.0.0.0`. Never send the control secret to a seller.
3. Attach only the platform, reverse proxy and relay to `btos-mail-operator`.
   Create `/var/lib/btos-mail-relay` owned by the image node UID (1000), mode0700.
   Compose publishes no host port. Enforce host egress to Resend HTTPS and the
   private registry. Do not expose `/health`, `/ready`, or the registry publicly.
4. Canary only: require customer allowlisting and set the authorized recipients
   in `MAIL_TEST_RECIPIENTS`. Seller recipients are also registry-allowlisted.
5. Before any production route change, preserve the exact current proxy config,
   image digests, platform database backup and relay SQLite consistent backup.
   Validate the existing proxy config and record current platform/Hubify health.
6. Prepare two exact POST routes, `/api/platform/store-mail` and
   `/api/platform/store-mail/status`, to relay:8092. Explicitly deny public
   `/api/platform/internal/*` before the platform catch-all. Do not change any
   other routing or DNS. Validate the complete candidate with `caddy validate`
   in the running proxy's config context before an atomic reload.
7. Only after final approval: start relay, require private `/ready`200, apply
   validated proxy config, then verify both new routes plus existing platform
   health and Hubify ready. Roll back immediately on any regression.

## Recovery and rollback

Backups of the platform database and AUTH_SECRET are required together to recover
sealed tokens. Back up the operator control secret separately. Preserve the
SQLite quota/delivery ledger across restart and rollback; never clear it to
bypass quotas. Its journal contains HMAC fingerprints, provider idempotency keys
and counters, not recipients, OTPs or tokens.

Rollback routing by restoring the exact saved proxy config, validating it, then
reloading. Stop only the relay service; do not bring down the platform or Hubify
Compose projects. Restore the prior application image by its digest. Leave the
new additive platform mail tables intact for application rollback. Credentials
already rotated stay revoked; recovery uses authenticated agent synchronization,
not restoring an old valid token. If rollback disables email, display unavailable
and preserve password login; do not claim OTP is operational.

This is a prepared procedure, **not proof of an executed production rollback**.
An isolated Ubuntu installer/rollback run and a canary activation still need
successful evidence before the gate is closed.

## Capacity and operations

Official Resend account UI checked 2026-11-07: Free, 3000/month,100/day,
10requests/second; usage37/month,8/day at observation. No upgrade or purchase.
These limits cannot support unrestricted hundreds/thousands of stores.

Initial admission stops after three registry tenants. Relay budget50/day and
1500/month, platform budget50/day and1500/month; these are conservative separate
partitions, not provider-account-wide accounting. Any other Resend sender must
be accounted for before rollout. Per-tenant10/day,30/hour, recipient10/hour,
global40/minute150/hour; reserve20% of the relay daily budget and two tenant
messages for seller authentication. Test mail has a separate daily ceiling.
This explicit canary cap must not be presented as public launch readiness.

SQLite persists quotas and delivery idempotency. Concurrent retries share a
provider idempotency key for23hours; failures back off30seconds, return503 and
Retry-After. There is no durable plaintext-OTP queue. Application logical sends
have distinct request IDs so repeated password-change notifications are not
accidentally suppressed. Provider failures never become success responses.

Monitor private readiness and aggregate `mail_relay.usage` every60seconds;
`nearLimit` is true at80%. Alert routing to the operator must be configured and
tested before public release. Logs contain no payload, recipient, token or
provider key. Dashboard active means live relay/identity checks succeeded, not
proof of mailbox delivery or remaining account credit.

Scaling requires an approved provider capacity budget, per-tenant admission and
fair allocations, provider throughput enforcement, measured operator resources,
and an alert destination. Never raise paid limits or remove admission silently.

## Verification and release gates

Local evidence: store504pass/3skip; platform7pass; relay6pass; typecheck and
production build passed. Three isolated databases exercised customer registration,
customer reset/replay, concurrent seller resets, old-session revocation and brand
sender identity with an in-memory provider. Four viewport widths were inspected;
the first HTTP-browser/HTTPS-fixture mismatch was detected and fixed in fixtures,
not in application origin security. Dependency audit:0high,0critical,6moderate
development dependencies at audit time.

These are **not new-candidate real Resend inbox results**. Historical delivery
from earlier merged PR tests is not reused as proof. Current-candidate live email,
Ubuntu24.04/2GB installation, rollback, CI, artifact/tag/SHA verification and
automatic identity synchronization remain explicit gates until separately proven.

Run manual `verify.yml` on the candidate branch. It covers the existing real
Ubuntu VM profile plus a three-database HTTP mail job. A candidate package is not
a stable seller release: final tag, SHA, artifact digest and platform manifest
must agree after approved merge. Keep platform approved-releases unchanged until
that final approval and canary evidence exist.
