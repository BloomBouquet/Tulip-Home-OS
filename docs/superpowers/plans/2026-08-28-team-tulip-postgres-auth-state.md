# Team Tulip PostgreSQL Auth State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move OAuth transient state and Tulip session persistence from process-local memory to PostgreSQL so Bouquet login, session authentication, and logout work correctly across multiple Tulip runtime instances.

**Architecture:** Auth-store contracts are Promise-based. PostgreSQL mode uses the same `PgPoolExecutor` for domain repositories and auth stores. OAuth state/session lookup values are persisted only as SHA-256 hashes; OAuth state is consumed atomically with `DELETE ... RETURNING`. Explicit memory mode remains process-local for tests/local development.

**Spec:** `docs/superpowers/specs/2026-08-28-team-tulip-postgres-auth-state-design.md`

## Constraints

- [x] Preserve Bouquet OAuth2 Authorization Code + PKCE S256.
- [x] Preserve 5-minute OAuth state TTL.
- [x] Preserve 7-day Tulip session TTL.
- [x] Never persist raw OAuth state or raw Tulip session tokens.
- [x] Never persist Bouquet access tokens.
- [x] Use parameterized SQL.
- [x] Keep `TULIP_PERSISTENCE_MODE=memory` as explicit process-local mode.
- [x] Reuse one PostgreSQL pool per runtime for domain + auth persistence.
- [x] Keep migrations 001/002 immutable and add migration 003.
- [x] Keep database failures distinct from invalid credentials.

## Implementation

- [x] Convert `TransientAuthStore` to async `save`/`consume`.
- [x] Convert `TulipSessionStore` to async `create`/`resolve`/`revoke`.
- [x] Make `BouquetSsoController` await persistence operations.
- [x] Add `hashOpaqueSecret()` using Web Crypto SHA-256 lower-hex output.
- [x] Add `003_persistent_auth_state.sql`.
- [x] Add `PostgresTransientAuthStore` with hashed lookup and atomic one-time consume.
- [x] Add `PostgresTulipSessionStore` with user provisioning, hashed session lookup, expiry filtering, and revoke.
- [x] Wire auth stores into `RuntimePersistence`.
- [x] Share one `PgPoolExecutor` inside each PostgreSQL runtime.
- [x] Preserve all-in-memory domain + auth behavior in explicit memory mode.
- [x] Extend PostgreSQL 17 integration to migrations `001 -> 002 -> 003`.
- [x] Verify Runtime A OAuth start → Runtime B callback.
- [x] Verify Runtime C accepts Runtime B's session.
- [x] Verify replayed callback state is rejected.
- [x] Verify Runtime D logout invalidates the session globally.
- [x] Verify raw OAuth state/session token values are not PostgreSQL lookup keys.
- [x] Update README and implementation status.
- [x] Complete Security/Code Review/Governance audit.

## TDD Evidence

- **Async contract RED:** CI #38 — 106 existing tests passed; delayed-store test failed because `start()` returned before persistence completed.
- **Async contract GREEN:** CI #45 — full gate passed after Promise-based stores/controller awaiting.
- **Hash RED:** CI #46 — `opaque-secret-hash.ts` was absent.
- **PostgreSQL auth-store RED:** CI #50 — `postgres-auth-stores.ts` was absent while the existing suite remained green.
- **Runtime persistence RED:** CI #53 — core 112/112 passed, then real PostgreSQL integration failed because Runtime A persisted zero OAuth state rows.
- **Runtime persistence GREEN:** CI #54 — cross-instance PostgreSQL auth flow and full build passed.
- **Final documented-head gate:** CI #56 on `3adbaa33cfbc8467727fc5a791ba962b2de284f5` passed core 112/112, PostgreSQL 17 integration, offline web TypeScript, full workspace verification, and Next.js production build.

## Pull Request

- [x] Draft PR #5 created: `feat : PostgreSQL 인증 상태 영속화` → `main`.
- [x] Changed-file scope reviewed.
- [x] No unresolved inline review threads at the reviewed head.
- [ ] Confirm CI on the final plan-document head and mark PR ready.
- [ ] Merge only the verified head SHA.
- [ ] Confirm `main` push CI passes the same PostgreSQL 17/full-build gate.
