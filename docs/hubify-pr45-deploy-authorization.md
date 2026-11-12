# Hubify PR #45 deployment authorization proposal

Status: PR #45 merged to main at 72d27569660f79ad64804ddd11984e79e0f74372 after the user's merge/deploy instruction. Deployment remains NO-GO pending review of this new safety authorization. The installed helper and runtime remain unchanged on v1.7.3 / f6ce29b03f994f3dc7d3368912737ca1d2aca99b. No release or CI run was started.

## Reason for a separate review

The installed historical compatibility module only authorizes the original v1.7.2 transition and the exact PR #43 UI redeployment. The activation procedure in [hubify-v173-ui-redeploy.md](hubify-v173-ui-redeploy.md) explicitly states: “After deployment changes installed source_sha, another different deployment again requires review.”

Read-only evaluation of the installed helper against untouched main 72d2756 rejects `Kompatibilitas migrasi historis tidak terverifikasi: 20261109120000_order_resolution_workflow`. Domain/origin, J&T test mode, completed journal, whole-proxy hash and all 29 ledger entries pass. The failure is the previously bounded transition authorization, not new SQL or an altered ledger.

## Exact proposed continuation

- Installed source must be f6ce29b03f994f3dc7d3368912737ca1d2aca99b, version/candidate_version 1.7.3, channel hubify-staging.
- Candidate complete committed app tree must be 307668134ed5b0f4057331ea652e128eccb5808e, the UI from PR #45. It is derived from `git rev-parse --verify HEAD:app`; caller input or an updater package without this tree cannot use the authorization.
- These are a paired transition. The previous source cannot target the new app tree, and the new source cannot target the previous app tree. Unknown sources/trees fail closed. After this deployment changes source_sha, the authorization does not permit arbitrary later deployments.
- Installation/origin, db contract, exact two raw CRLF/LF checksum pairs, full migration inventory, authenticated original archive and manifest remain required. Prior PR #43 and original compatibility behavior remain available unchanged.
- The audit record identifies transition `v1.7.3-ui-pr45` and records the actual installed source and candidate tree. SQL, ledger, release artifact, VERSION, shared proxy and deployment helper execution are not modified by this proposal.

Only installer/historical_migrations.py, its tests and this document change. No application changes beyond the already merged PR #45, and no integration of other agents' heads.

## Verification

- 81 installer/updater/historical/helper regression tests PASS, including five new tests for exact acceptance, cross-pair/missing/unknown rejection, metadata/context/history/byte/archive rejection, Git-derived projection with no SQL, and rejection of the previous app tree.
- Six deployment compatibility/rollback tests PASS. Both suites ran in an ephemeral existing Linux test image, network disabled, 0.5 CPU/256 MB, source mounted read-only. No skipped tests.
- Proposed module loaded from a temporary review directory passes actual VPS helper check_schema read-only for untouched main 72d2756. All 29 effective checksums equal the existing ledger/metadata. Live Caddy output is byte-identical to the active proxy.
- Before/after SHA-256 equality verified for the root-owned helper; manager core/updater/historical modules; version metadata; runtime environment; Caddyfile; and Compose. Ledger re-read is unchanged, and candidate Git status is clean. No runtime migration projection was applied to this candidate during the probe.
- App validation remains PR #45's 636 passing unit tests, 21 database tests, 16 browser scenario groups, typecheck/lint/build. This proposal does not change app tree or introduce a reason to rerun UI tests.
- Root disk currently has about 3 GB free. Before build, check capacity and remove only explicitly inspected unused obsolete application images if needed, retaining current and previous rollback images, all containers/volumes, source and backups. Do not broadly prune shared services.

## Activation after review

1. Recheck this PR head, main app tree, installed source f6ce29b, unchanged ledger/proxy and all preflight pins. Stop if any differ.
2. Merge the authorization PR into main. Verify main app tree still equals 307668134ed5b0f4057331ea652e128eccb5808e. Do not merge unrelated heads or create a tag/release.
3. Back up the root-owned historical_migrations.py privately with owner/mode preserved. Syntax-check and atomically install only that reviewed module from exact merged main, preserving root ownership/mode. Do not change historical SQL, ledger, archive, helper, core or updater. Keep the backup for recovery.
4. Recheck official preflight/schema/ledger/proxy checks, capacity and lack of another operation. Dispatch deploy-hubify.yml on exact current main SHA through the existing GitHub Environment. Preserve its current access configuration; do not bypass the workflow with an operator deployment.
5. Retain the official helper's operation lock, full backup, isolated runtime projection, build, migration validation, health and recovery. Verify success/exact live SHA, readiness, editor, shared proxy, integrations and unchanged ledger afterward. No public release or fleet rollout.

Until approval, this proposal is not installed, no deployment workflow is dispatched, and Hubify continues serving its existing code.
