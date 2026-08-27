# Team Tulip PostgreSQL Auth State Design

## Context

Tulip's domain persistence is now PostgreSQL-backed by default, but OAuth transient state and Tulip sessions remain process-local in-memory stores. That means multi-instance deployment can still break login and session continuity when a request lands on a different application instance.

This design moves both auth-state boundaries to PostgreSQL while preserving the existing Bouquet OAuth2 Authorization Code + PKCE flow, opaque HttpOnly Tulip session cookie, and explicit in-memory mode for isolated tests/local development.

## Goals

- Make Bouquet OAuth start/callback work across different Tulip runtime instances.
- Make Tulip session resolution and logout/revocation work across different runtime instances.
- Preserve OAuth state one-time consumption and five-minute expiry semantics.
- Preserve Tulip session seven-day expiry semantics.
- Never persist raw OAuth state values or raw Tulip session tokens.
- Reuse the existing PostgreSQL pool instead of creating a second database connection pool.
- Keep `TULIP_PERSISTENCE_MODE=memory` as an explicit all-in-memory test/development mode.

## Non-goals

- Redis or another cache service.
- Bouquet access-token persistence.
- Refresh-token support.
- Device/session management UI.
- Session rotation or sliding expiration.
- Encrypting the short-lived PKCE verifier at the application layer.
- Changing the Bouquet identity contract or the browser cookie names.

## Chosen Approach

Use PostgreSQL as the shared auth-state backend behind the existing auth-store abstractions. Change the auth-store contracts from synchronous methods to Promise-based methods because PostgreSQL I/O is asynchronous.

The same `PgPoolExecutor` instance that backs Home/Routine/HomeItem/TaskOccurrence repositories will also back the PostgreSQL auth stores. The runtime persistence factory will own all repositories/stores and the single close lifecycle.

Redis remains a future adapter option if auth-state traffic outgrows PostgreSQL; the controller and runtime should depend only on the store interfaces so this later swap does not change OAuth flow code.

## Contract Changes

### TransientAuthStore

Current synchronous contract becomes:

```ts
interface TransientAuthStore {
  save(state: string, record: TransientAuthRecord): Promise<void>;
  consume(state: string): Promise<TransientAuthRecord | null>;
}
```

`BouquetSsoController.start()` awaits `save()` and `callback()` awaits `consume()`.

### TulipSessionStore

Current synchronous contract becomes:

```ts
interface TulipSessionStore {
  create(identity: BouquetIdentity): Promise<string>;
  resolve(token: string): Promise<BouquetIdentity | null>;
  revoke(token: string): Promise<void>;
}
```

`BouquetSsoController.callback()` awaits session creation, `logout()` awaits revocation, and `SessionAuthAdapter.verify()` awaits resolution.

The in-memory implementations will implement the same async contracts so tests keep one interface regardless of persistence mode.

## Database Migration

Add a new immutable migration:

`apps/api/db/migrations/003_persistent_auth_state.sql`

Do not modify `001_initial.sql` or `002_unique_home_owner.sql`.

### `oauth_transient_states`

Columns:

- `state_hash TEXT PRIMARY KEY`
- `code_verifier TEXT NOT NULL`
- `return_to TEXT NOT NULL`
- `expires_at TIMESTAMPTZ NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Indexes:

- expiry index on `expires_at`

The raw OAuth `state` value is never stored. The application derives a lowercase SHA-256 hex digest and stores/looks up only that digest.

The PKCE verifier must remain recoverable until callback, so it is stored as plaintext for at most the short transient TTL. No Bouquet access token is written to this table.

### `tulip_sessions`

Columns:

- `token_hash TEXT PRIMARY KEY`
- `user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `display_name TEXT`
- `expires_at TIMESTAMPTZ NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Indexes:

- expiry index on `expires_at`
- user/expiry index for future session administration and cleanup

The raw session token exists only in the browser cookie and application request memory. PostgreSQL stores only the SHA-256 digest.

Because a first-time user may establish a session before creating a Home, PostgreSQL session creation must upsert the canonical Bouquet user into `users` before inserting the session row. This moves canonical user provisioning earlier in the lifecycle while remaining compatible with the existing Home repository upsert.

## Hashing Boundary

Create a small shared SHA-256 helper for opaque auth secrets.

Properties:

- Input must be non-empty after trimming where the existing contract already requires trimmed opaque values.
- Output is deterministic lowercase hexadecimal SHA-256.
- State/session equality is performed only through the digest.
- Raw values are never included in SQL text, logs, errors, or persisted columns.

SHA-256 here is used as a lookup-safe one-way representation of high-entropy random values, not as password hashing.

## OAuth Transient-State Semantics

### Save

1. Validate non-empty `state`.
2. Hash raw state.
3. Compute five-minute expiry using the existing TTL policy.
4. Insert/upsert the hash, PKCE verifier, local return path, and expiry.
5. Opportunistically delete expired transient rows.

### Consume

Consumption must be atomic across instances.

Use one SQL statement based on `DELETE ... RETURNING` so only one callback can consume a state record. The statement removes the matching hash and returns the record only when still valid. An expired record must never be returned.

A replay on another instance therefore receives `null` and preserves the existing `INVALID_OAUTH_STATE` behavior.

## Tulip Session Semantics

### Create

1. Validate Bouquet `userId`.
2. Generate the existing high-entropy opaque session token.
3. Hash the token.
4. Upsert the Bouquet user in `users`.
5. Insert session hash, identity data, and seven-day expiry.
6. Opportunistically delete expired session rows.
7. Return the raw token only to the caller so it can be placed in the HttpOnly cookie.

### Resolve

1. Hash the presented raw cookie token.
2. Query only a row whose `expires_at > NOW()`.
3. Return the stored Bouquet identity or `null`.
4. Expired rows may be lazily removed during create/revoke/cleanup operations; they are never considered valid.

### Revoke

Hash the presented token and delete by hash. Revocation is immediately visible to all application instances sharing the database.

## Runtime Wiring

Extend `RuntimePersistence` to include:

- `transient: TransientAuthStore`
- `sessions: TulipSessionStore`
- existing Home/Routine/HomeItem/TaskOccurrence repositories
- `close()`

### PostgreSQL mode

Create one `PgPoolExecutor` and inject it into all domain repositories plus the two PostgreSQL auth stores.

### Memory mode

Instantiate all domain repositories plus `InMemoryTransientAuthStore` and `InMemoryTulipSessionStore`.

`SessionAuthAdapter` must depend on `TulipSessionStore`, not the concrete in-memory class.

`createTulipWebRuntime()` receives the stores from persistence before constructing SSO and API routing. `close()` closes the shared PostgreSQL pool once.

## Failure Behavior

- Missing/expired/replayed OAuth state remains HTTP 400 `INVALID_OAUTH_STATE`.
- Missing/expired/revoked Tulip session remains authentication failure and maps to the existing HTTP 401 behavior.
- Database connectivity/query failures are not converted into invalid-credential responses; they propagate as server failures so operational outages are distinguishable from user auth errors.
- Unknown `TULIP_PERSISTENCE_MODE` remains a configuration error.

## Security Requirements

- Preserve PKCE S256.
- Preserve browser-state cookie binding before consuming server-side OAuth state.
- Preserve `HttpOnly`, `Secure` in HTTPS environments, and `SameSite=Lax` for the Tulip session cookie.
- Preserve the five-minute OAuth state cookie/server-state lifetime and seven-day session lifetime.
- Do not store Bouquet access tokens in the session table.
- Do not store raw OAuth state or raw Tulip session tokens.
- Use parameterized SQL only.
- Do not expose hashes, PKCE verifier, or session internals through API responses.

## Testing Strategy

### Unit tests

- Async in-memory store semantics remain unchanged.
- SHA-256 helper is deterministic and rejects empty values where required.
- PostgreSQL transient store parameterizes writes and performs one-time atomic consume.
- PostgreSQL session store hashes tokens, provisions Bouquet users, resolves valid sessions, rejects expired sessions, and revokes by hash.
- SSO controller awaits async stores and preserves current response/cookie behavior.
- Runtime uses PostgreSQL auth stores by default and memory stores only in explicit memory mode.

### PostgreSQL 17 integration test

Apply migrations `001 -> 002 -> 003`, then prove the complete cross-instance flow:

1. Runtime A starts Bouquet login and stores transient state.
2. Runtime B receives the callback using the same browser state cookie and successfully consumes the state.
3. Runtime B creates a Tulip session in PostgreSQL.
4. Runtime C receives the session cookie and authenticates an API request successfully.
5. A different runtime revokes the session via logout.
6. Runtime C (or a fresh runtime D) receives the same old cookie and authentication is rejected.
7. Replay of the already-consumed OAuth callback is rejected.

The existing Home/Routine/HomeItem/Occurrence PostgreSQL integration coverage and full workspace/Next.js production build remain part of the CI gate.

## Migration and Rollout

- `003_persistent_auth_state.sql` is additive and does not rewrite existing domain tables.
- Existing process-local sessions cannot be migrated because their raw tokens/records only live in application memory; deployments applying this change may require currently logged-in users to authenticate again.
- Deploy migration 003 before starting the new runtime version.
- No new infrastructure service is required beyond the existing PostgreSQL database.

## Acceptance Criteria

- OAuth start on one instance can complete on another instance.
- OAuth state is one-time across all instances and expires after five minutes.
- A session created on one instance authenticates requests on another instance.
- Logout/revoke on one instance invalidates that session everywhere.
- Raw state/session tokens never appear in PostgreSQL.
- `TULIP_PERSISTENCE_MODE=memory` preserves isolated in-memory behavior.
- Migrations 001, 002, and 003 plus full CI, PostgreSQL integration, TypeScript checks, tests, and Next.js production build are green before merge.
