# Security

## Controls implemented

- Hosting-managed browser identity; no app password database.
- Server-side account ownership checks.
- No MT5 password or investor-password collection.
- Pairing code hashes with deployment pepper, ten-minute expiry, single use, per-source throttling, and attempt budget.
- Account-scoped short-lived access tokens, refresh tokens, fingerprint rotation, and device revocation field.
- HMAC-signed canonical connector envelopes.
- Fresh-send replay window, monotonic sequence, idempotency key, and duplicate-safe acknowledgements.
- Input validation, bounded positions, exact numeric strings, no-store API responses, correlation IDs, and non-sensitive errors.
- Hash-linked audit events and raw payload retention foundation.
- CSP, frame denial, MIME sniffing prevention, referrer, opener, and permissions headers.
- Logical D1 binding and hosted secret management; no secrets in source or logs.

## Secret handling

`PAIRING_PEPPER` and `CONNECTOR_TOKEN_SECRET` must each be high-entropy values of at least 32 characters and configured through the hosting runtime. Rotation needs a two-key grace window before production; the first loop accepts one active key. Connector access tokens are never written to application logs. EA credential persistence is intentionally not implemented until Windows-protected storage is available.

## Tenant isolation

User APIs derive identity from trusted headers and join through `owner_user_id`; callers do not choose an organization. Connector tokens embed device and account scopes, which must match both envelope and database records. Admin authorization is not yet exposed.

## Data protection roadmap

Before production: define regional storage, snapshot/event retention, deletion/anonymization, account export, audit legal hold, key management, database backup, incident response, dependency scanning in CI, SAST, CSP nonce strategy, and a privacy review of broker/account identifiers.

## Connector hardening roadmap

Code-sign the installer and EA, publish reproducible source hashes, add protected local credential storage, signed update manifests, connector attestation/version policy, bounded encrypted event queue, and user-visible device revocation.
