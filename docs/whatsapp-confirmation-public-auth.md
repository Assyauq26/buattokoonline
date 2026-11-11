# WhatsApp confirmation and public account access

Scope: customer login/registration and optional seller dashboard login. Seller signup on the central platform remains email-only and unchanged.

## Account policy

- A confirmation URL is sent only in response to a valid, signed incoming WhatsApp challenge from the same phone. It contains a secret in the fragment, never the query string.
- Opening the link does not authenticate. The user explicitly presses Konfirmasi & Lanjutkan in the initiating browser. The HttpOnly browser proof, tenant, audience, purpose, account type, expiry and single-use exchange remain required.
- Six-digit fallback is available for browser handoff failures. Five wrong attempts lock the challenge.
- New customers complete the existing email verification and profile flow. Only their own pending customer phone proof may be attached to a newly created customer.
- Existing sellers first sign in using email/password and link their personal profile phone under Settings / Account Security. Seller linking requires the current password, rotates session version and records a seller-only identity. Public phone verification never creates or promotes an admin.
- Password reset, inactive/deleted user, changed number, changed role scope or stale identity rejects WhatsApp login until relinked.
- WA_PUBLIC_AUTH=1 admits any valid phone for authentication on already authorized tenants. It does not issue tenant credentials, enable notifications or enroll unrelated installations. Existing notification recipient/consent controls remain independent.

## UI review

| Before | After | Why |
| --- | --- | --- |
| Code entry as the primary action | Explicit confirmation link, fallback code collapsed | Fewer steps without trusting incoming messages as a browser session |
| Mixed theme button styling | Black primary buttons, restrained borders and focus states | Clear action hierarchy on mobile and desktop |
| Customer-only login entry | Customer registration entry plus separate seller login/link entry | Make supported account flows discoverable without role escalation |

## Local evidence

Typecheck and production build pass. 53 focused store tests pass, including database login/link/replay, registration, session and rate limits. Browser checks pass at 360/390/430/1440 px using a local production build with mocked relay; link navigation does not consume secrets, the fragment is removed, and the explicit button sends exactly one confirmation. Relay suite: 40 tests pass on isolated PostgreSQL. Browser evidence: output/whatsapp-audit/.

Live confirmation-link delivery still requires an owner-initiated message after activation. Prior OTP pilot receipt is not proof of the new link flow. No CI, DNS change, new provider key, automatic merge or stable release in this change.
