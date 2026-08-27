# Team Tulip PostgreSQL Auth State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move OAuth transient state and Tulip session persistence from process-local memory to PostgreSQL so Bouquet login, session authentication, and logout work correctly across multiple Tulip runtime instances.

**Architecture:** Convert both auth-store interfaces to Promise-based contracts, then add PostgreSQL implementations backed by the same `PgPoolExecutor` used by domain repositories. Persist only SHA-256 hashes of high-entropy OAuth state/session tokens, keep atomic one-time OAuth state consumption with `DELETE ... RETURNING`, and wire both stores through `RuntimePersistence` so PostgreSQL mode is shared while explicit memory mode remains isolated.

**Tech Stack:** TypeScript, Web Crypto SHA-256, PostgreSQL 17, `pg`, Node test runner, Next.js, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-28-team-tulip-postgres-auth-state-design.md`

## Global Constraints

- Keep Bouquet OAuth2 Authorization Code + PKCE S256 unchanged.
- OAuth transient state TTL remains 5 minutes.
- Tulip session TTL remains 7 days.
- Never persist raw OAuth state or raw Tulip session tokens.
- Never persist Bouquet access tokens.
- Use parameterized SQL only.
- Keep `TULIP_PERSISTENCE_MODE=memory` as the explicit all-in-memory test/development mode.
- PostgreSQL mode must reuse one pool per Tulip runtime for both domain and auth persistence.
- Existing `001_initial.sql` and `002_unique_home_owner.sql` are immutable; add migration `003`.
- Database outages must remain server failures rather than being translated into invalid credentials.

---

### Task 1: Async auth-store contracts and SSO controller

**Files:**
- Modify: `apps/api/src/auth/bouquet-oauth.ts`
- Modify: `apps/api/src/auth/tulip-session.ts`
- Modify: `apps/api/src/auth/bouquet-sso-controller.ts`
- Test: `tests/bouquet-oauth.test.ts`
- Test: `tests/tulip-session.test.ts`
- Test: `tests/bouquet-sso-controller.test.ts`

**Interfaces:**
- Produces: `TransientAuthStore.save(...): Promise<void>` and `consume(...): Promise<TransientAuthRecord | null>`.
- Produces: `TulipSessionStore.create(...): Promise<string>`, `resolve(...): Promise<BouquetIdentity | null>`, and `revoke(...): Promise<void>`.
- Consumers: PostgreSQL auth stores and Web Runtime in later tasks.

- [ ] **Step 1: Write failing async-contract tests**

Change existing in-memory tests to `async` tests and `await` `save`, `consume`, `create`, `resolve`, and `revoke`. Add a controller test using delayed async stores so `start`, `callback`, and `logout` must await persistence before returning.

- [ ] **Step 2: Run core tests and verify RED**

Run: `npm run test:core`
Expected: FAIL because current store implementations/controllers return/use synchronous values and delayed async stores are not awaited.

- [ ] **Step 3: Implement Promise-based contracts**

Update the interfaces and in-memory implementations to `async` methods without changing TTL/replay/session semantics. Update `BouquetSsoController` to await every auth-store operation.

- [ ] **Step 4: Run focused and core verification**

Run: `node --experimental-strip-types --test tests/bouquet-oauth.test.ts tests/tulip-session.test.ts tests/bouquet-sso-controller.test.ts`
Run: `npm run verify:core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/bouquet-oauth.ts apps/api/src/auth/tulip-session.ts apps/api/src/auth/bouquet-sso-controller.ts tests/bouquet-oauth.test.ts tests/tulip-session.test.ts tests/bouquet-sso-controller.test.ts
git commit -m "refactor: make auth stores asynchronous"
```

### Task 2: Opaque-secret hashing and migration 003

**Files:**
- Create: `apps/api/src/auth/opaque-secret-hash.ts`
- Create: `apps/api/db/migrations/003_persistent_auth_state.sql`
- Modify: `apps/api/src/index.ts`
- Test: `tests/opaque-secret-hash.test.ts`

**Interfaces:**
- Produces: `hashOpaqueSecret(value: string): Promise<string>` returning lowercase 64-character SHA-256 hex.
- Migration creates `oauth_transient_states` and `tulip_sessions` plus expiry indexes.

- [ ] **Step 1: Write RED hashing tests**

Test the known SHA-256 digest of `"abc"`, deterministic output, lowercase 64-character hex, and rejection of blank input.

- [ ] **Step 2: Run hash test and verify RED**

Run: `node --experimental-strip-types --test tests/opaque-secret-hash.test.ts`
Expected: FAIL because `opaque-secret-hash.ts` does not exist.

- [ ] **Step 3: Implement Web Crypto hashing helper**

Use `crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized))` and convert the digest to lowercase hex. Do not log or expose the input.

- [ ] **Step 4: Add immutable migration 003**

Create both auth-state tables exactly as defined by the design, including the `users(id)` foreign key for sessions and indexes on expiry/user-expiry.

- [ ] **Step 5: Verify helper and typecheck**

Run: `node --experimental-strip-types --test tests/opaque-secret-hash.test.ts`
Run: `npm run typecheck:core`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth/opaque-secret-hash.ts apps/api/db/migrations/003_persistent_auth_state.sql apps/api/src/index.ts tests/opaque-secret-hash.test.ts
git commit -m "feat: add persistent auth schema and hashing"
```

### Task 3: PostgreSQL auth stores

**Files:**
- Create: `apps/api/src/auth/postgres-auth-stores.ts`
- Modify: `apps/api/src/index.ts`
- Test: `tests/postgres-auth-stores.test.ts`

**Interfaces:**
- Consumes: `SqlExecutor`, `hashOpaqueSecret`, `TransientAuthStore`, `TulipSessionStore`.
- Produces: `PostgresTransientAuthStore` and `PostgresTulipSessionStore`.

- [ ] **Step 1: Write RED SQL-contract tests**

Use a recording `SqlExecutor` to verify:
- transient `save` sends only state hash as the lookup key, never raw state in SQL text;
- transient `consume` uses one atomic `DELETE ... RETURNING`/CTE statement and returns only unexpired records;
- session `create` provisions `users` before inserting the hashed token;
- session `resolve` filters `expires_at > NOW()`;
- session `revoke` deletes by token hash;
- no access token or raw state/session token is persisted.

- [ ] **Step 2: Run test and verify RED**

Run: `node --experimental-strip-types --test tests/postgres-auth-stores.test.ts`
Expected: FAIL because PostgreSQL auth store classes do not exist.

- [ ] **Step 3: Implement `PostgresTransientAuthStore`**

Use a 5-minute default TTL, opportunistic expiry cleanup on save, parameterized UPSERT, and atomic consume:

```sql
WITH deleted AS (
  DELETE FROM oauth_transient_states
  WHERE state_hash = $1
  RETURNING code_verifier, return_to, expires_at
)
SELECT code_verifier, return_to
FROM deleted
WHERE expires_at > NOW()
```

- [ ] **Step 4: Implement `PostgresTulipSessionStore`**

Use a 7-day default TTL, raw token generation via `crypto.randomUUID()`, token hashing, canonical Bouquet-user UPSERT, session insert, valid-only resolve, revoke-by-hash, and opportunistic expired-session cleanup.

- [ ] **Step 5: Verify PostgreSQL auth store tests and core suite**

Run: `node --experimental-strip-types --test tests/postgres-auth-stores.test.ts`
Run: `npm run verify:core`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth/postgres-auth-stores.ts apps/api/src/index.ts tests/postgres-auth-stores.test.ts
git commit -m "feat: add PostgreSQL auth stores"
```

### Task 4: Wire auth stores into Tulip Web Runtime

**Files:**
- Modify: `apps/web/src/server/tulip-runtime.ts`
- Test: `tests/tulip-web-runtime.test.ts`

**Interfaces:**
- Consumes: both auth-store interfaces and PostgreSQL auth-store implementations.
- Produces: `RuntimePersistence` containing domain repositories, auth stores, and one shared close lifecycle.

- [ ] **Step 1: Write RED runtime tests**

Add tests showing `SessionAuthAdapter` behavior is asynchronous and explicit memory mode still completes login/API authentication without `DATABASE_URL`. Add a factory-boundary assertion that PostgreSQL mode obtains auth stores from the same persistence lifecycle rather than creating process-local stores.

- [ ] **Step 2: Run runtime tests and verify RED**

Run: `node --experimental-strip-types --test tests/tulip-web-runtime.test.ts`
Expected: FAIL because runtime still constructs in-memory auth stores outside `RuntimePersistence`.

- [ ] **Step 3: Refactor `RuntimePersistence`**

Add `transient` and `sessions`. Memory mode returns in-memory implementations; PostgreSQL mode creates one `PgPoolExecutor` and injects it into domain repositories plus both PostgreSQL auth stores.

- [ ] **Step 4: Make `SessionAuthAdapter` depend on `TulipSessionStore`**

Await `sessions.resolve(token)`. Throw `BouquetAuthenticationError` only when the store returns `null`; let database exceptions propagate unchanged.

- [ ] **Step 5: Verify runtime and full core tests**

Run: `node --experimental-strip-types --test tests/tulip-web-runtime.test.ts tests/bouquet-sso-controller.test.ts`
Run: `npm run verify:core`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/server/tulip-runtime.ts tests/tulip-web-runtime.test.ts
git commit -m "feat: share auth persistence across runtimes"
```

### Task 5: PostgreSQL 17 cross-instance authentication integration

**Files:**
- Modify: `integration/postgres.integration.test.ts`

**Interfaces:**
- Consumes migrations `001`, `002`, `003` and `createTulipWebRuntime`.
- Proves cross-instance OAuth state/session behavior against real PostgreSQL 17.

- [ ] **Step 1: Extend migration sequence to `001 -> 002 -> 003`**

Add migration 003 to `migrationUrls` before any runtime is created.

- [ ] **Step 2: Add cross-instance login test flow**

Use Runtime A to call `sso.start`, Runtime B to call `sso.callback` with A's OAuth state cookie, Runtime C to authenticate `/v1/me` using B's Tulip session cookie, and Runtime D to revoke via logout.

- [ ] **Step 3: Add replay and global revoke assertions**

Verify a second callback with the consumed state returns 400 and the old session cookie returns 401 after Runtime D logs out.

- [ ] **Step 4: Verify no raw secrets in PostgreSQL**

Extract the raw state and session cookie values and query `oauth_transient_states`/`tulip_sessions`; assert stored keys are 64-character hashes and never equal the raw values.

- [ ] **Step 5: Run real PostgreSQL integration in CI**

Run through GitHub Actions `npm run test:postgres` using the existing PostgreSQL 17 service.
Expected: PASS with migrations 001/002/003 and cross-instance auth flow.

- [ ] **Step 6: Commit**

```bash
git add integration/postgres.integration.test.ts
git commit -m "test: verify cross-instance auth persistence"
```

### Task 6: Documentation, governance review, and merge gate

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-28-team-tulip-postgres-auth-state.md`

- [ ] **Step 1: Update operational documentation**

Document migration order `001 -> 002 -> 003`, shared PostgreSQL auth persistence, rollout re-login behavior, and that memory mode is process-local by design.

- [ ] **Step 2: Run Luna Security/Code Review/Governance audit**

Confirm:
- no raw state/session token SQL persistence;
- access token remains server-only and non-persistent;
- one-time state consume is atomic;
- `SessionAuthAdapter` does not hide DB outages as 401;
- all PostgreSQL values are parameterized;
- old migrations remain unchanged;
- runtime closes one shared pool once.

- [ ] **Step 3: Run fresh final CI gate**

GitHub Actions must pass:
- `npm run verify:core`
- `npm run test:postgres`
- `npm run typecheck:web:offline`
- `pnpm verify`, including Next.js production build.

- [ ] **Step 4: Open PR using the fixed Tulip PR format**

Title:

```text
feat : PostgreSQL 인증 상태 영속화
```

Target: `main`.

- [ ] **Step 5: Verify PR head and mergeability**

Check the exact final head SHA, CI success, changed-file scope, unresolved review threads, and `mergeable=true` before marking ready/merging.

- [ ] **Step 6: Merge and verify main push CI**

Merge only the verified head SHA. Confirm the `main` push workflow passes the same PostgreSQL 17/full build gate before declaring the milestone complete.
