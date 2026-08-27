# Team Tulip PostgreSQL Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace Tulip's in-memory Home/Routine/HomeItem/TaskOccurrence persistence boundary with PostgreSQL repositories while preserving the existing domain-service interfaces.

**Architecture:** Keep domain services unchanged and implement the existing repository contracts behind a small `SqlExecutor` abstraction. PostgreSQL repositories map snake_case database rows to shared contracts, use parameterized SQL only, and use idempotent UPSERT statements. Because `homes.owner_id` references `users.id`, saving a Home first provisions the canonical Bouquet user identifier into `users`. The web runtime defaults to PostgreSQL; in-memory domain persistence remains an explicit local/test mode. OAuth transient state and Tulip sessions remain process-local and are intentionally outside this milestone.

**Tech Stack:** TypeScript, PostgreSQL 17, `pg`, Node test runner, Next.js, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-27-team-tulip-personal-home-os-design.md`

## Global Constraints

- Bouquet user id remains the canonical Tulip owner id.
- No raw string interpolation for user-controlled SQL values.
- Repository methods preserve existing contract return shapes and ISO timestamp strings.
- Missing rows return `null`, not exceptions.
- List methods use deterministic ordering.
- Completed-history queries remain owner/Home scoped and newest-first.
- Existing in-memory repositories remain available only through explicit local/test runtime configuration.
- Applied migrations stay immutable; schema changes use the next numbered migration.
- One Bouquet owner can have only one Home at the database layer.

---

### Task 1: PostgreSQL Home repository

**Files:**
- Create: `apps/api/src/persistence/postgres-repositories.ts`
- Test: `tests/postgres-home-repository.test.ts`

- [x] Write RED tests for Home save/find mappings and canonical user provisioning.
- [x] Verify tests fail because PostgreSQL repository does not exist.
- [x] Implement `SqlExecutor` and `PostgresHomeRepository`.
- [x] Verify Home repository tests and existing regression suite pass.

### Task 2: PostgreSQL Routine repository

**Files:**
- Modify: `apps/api/src/persistence/postgres-repositories.ts`
- Test: `tests/postgres-routine-repository.test.ts`

- [x] Write RED tests for JSON recurrence mapping, list ordering, upsert, delete.
- [x] Implement `PostgresRoutineRepository`.
- [x] Verify tests pass.

### Task 3: PostgreSQL HomeItem repository

**Files:**
- Modify: `apps/api/src/persistence/postgres-repositories.ts`
- Test: `tests/postgres-home-item-repository.test.ts`

- [x] Write RED tests for nullable fields, list ordering, upsert, delete.
- [x] Implement `PostgresHomeItemRepository`.
- [x] Verify tests pass.

### Task 4: PostgreSQL TaskOccurrence repository

**Files:**
- Modify: `apps/api/src/persistence/postgres-repositories.ts`
- Test: `tests/postgres-occurrence-repository.test.ts`

- [x] Write RED tests for find/list/history/upsert.
- [x] Implement `PostgresTaskOccurrenceRepository`.
- [x] Verify newest-first completed history and limit parameterization.

### Task 5: Export and real driver boundary

**Files:**
- Modify: `apps/api/src/index.ts`
- Create: `apps/api/src/persistence/pg-executor.ts`
- Modify: `apps/api/package.json`

- [x] Add the `pg` driver dependency and a small Pool-backed executor.
- [x] Keep `DATABASE_URL` resolution at runtime, never module import/build time.
- [x] Prevent an explicit missing runtime URL from silently falling back to process environment state.
- [x] Export PostgreSQL repository/driver boundaries.

### Task 6: CI PostgreSQL integration

**Files:**
- Create: `integration/postgres.integration.test.ts`
- Modify: `.github/workflows/ci.yml`

- [x] Add a PostgreSQL 17 service container to CI.
- [x] Apply numbered migrations to the service database.
- [x] Exercise actual Home/Routine/HomeItem/Occurrence save/read flows.
- [x] Verify cross-runtime Home persistence against the same database.
- [x] Run core tests, PostgreSQL integration, offline web typecheck, and full workspace/Next production build.

### Task 7: Web runtime persistence wiring

**Files:**
- Modify: `apps/web/src/server/tulip-runtime.ts`
- Modify: `tests/tulip-web-runtime.test.ts`

- [x] Make PostgreSQL the default Home/Routine/HomeItem/Occurrence persistence mode.
- [x] Require `DATABASE_URL` for the default runtime.
- [x] Keep `TULIP_PERSISTENCE_MODE=memory` as an explicit local/test escape hatch.
- [x] Keep OAuth transient state and Tulip sessions outside this persistence milestone.
- [x] Add runtime resource cleanup through `close()`.

### Task 8: One-Home-per-owner concurrency integrity

**Files:**
- Create: `apps/api/db/migrations/002_unique_home_owner.sql`
- Modify: `tests/postgres-home-repository.test.ts`
- Modify: `integration/postgres.integration.test.ts`

- [x] Reproduce the concurrent-owner integrity gap with a RED PostgreSQL test.
- [x] Add a versioned unique index migration instead of rewriting `001_initial.sql`.
- [x] Translate only the `homes_owner_id_idx` unique violation to the existing Home validation error.
- [x] Preserve unknown PostgreSQL failures as server errors.

## Completion Gate

- [x] Core regression suite passes with 106 tests.
- [x] PostgreSQL 17 integration passes using real migrations and repositories.
- [x] Offline web typecheck passes.
- [x] Full workspace verification and Next.js production build pass.
- [ ] Merge PR only after the final documentation-only head CI is green.
