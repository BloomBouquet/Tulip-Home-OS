# Team Tulip PostgreSQL Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Tulip's in-memory Home/Routine/HomeItem/TaskOccurrence persistence boundary with PostgreSQL-ready repositories while preserving the existing domain-service interfaces.

**Architecture:** Keep domain services unchanged and implement the existing repository contracts behind a small `SqlExecutor` abstraction. PostgreSQL repositories map snake_case database rows to shared contracts, use parameterized SQL only, and use idempotent UPSERT statements. Because `homes.owner_id` references `users.id`, saving a Home first provisions the canonical Bouquet user identifier into `users`.

**Tech Stack:** TypeScript, PostgreSQL, existing SQL migration, Node test runner, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-27-team-tulip-personal-home-os-design.md`

## Global Constraints

- Bouquet user id remains the canonical Tulip owner id.
- No raw string interpolation for user-controlled SQL values.
- Repository methods must preserve existing contract return shapes and ISO timestamp strings.
- Missing rows return `null`, not exceptions.
- List methods use deterministic ordering.
- Completed-history queries remain owner/Home scoped and newest-first.
- Existing in-memory repositories remain available for isolated tests.

---

### Task 1: PostgreSQL Home repository

**Files:**
- Create: `apps/api/src/persistence/postgres-repositories.ts`
- Test: `tests/postgres-home-repository.test.ts`

- [ ] Write RED tests for Home save/find mappings and canonical user provisioning.
- [ ] Verify tests fail because PostgreSQL repository does not exist.
- [ ] Implement `SqlExecutor` and `PostgresHomeRepository`.
- [ ] Verify Home repository tests and existing regression suite pass.

### Task 2: PostgreSQL Routine repository

**Files:**
- Modify: `apps/api/src/persistence/postgres-repositories.ts`
- Test: `tests/postgres-routine-repository.test.ts`

- [ ] Write RED tests for JSON recurrence mapping, list ordering, upsert, delete.
- [ ] Implement `PostgresRoutineRepository`.
- [ ] Verify tests pass.

### Task 3: PostgreSQL HomeItem repository

**Files:**
- Modify: `apps/api/src/persistence/postgres-repositories.ts`
- Test: `tests/postgres-home-item-repository.test.ts`

- [ ] Write RED tests for nullable fields, list ordering, upsert, delete.
- [ ] Implement `PostgresHomeItemRepository`.
- [ ] Verify tests pass.

### Task 4: PostgreSQL TaskOccurrence repository

**Files:**
- Modify: `apps/api/src/persistence/postgres-repositories.ts`
- Test: `tests/postgres-occurrence-repository.test.ts`

- [ ] Write RED tests for find/list/history/upsert.
- [ ] Implement `PostgresTaskOccurrenceRepository`.
- [ ] Verify newest-first completed history and limit parameterization.

### Task 5: Export and real driver boundary

**Files:**
- Modify: `apps/api/src/index.ts`
- Create: `apps/api/src/persistence/pg-executor.ts`
- Modify: `apps/api/package.json`

- [ ] Add the `pg` driver dependency and a small Pool-backed executor.
- [ ] Keep `DATABASE_URL` resolution at runtime, never module import/build time.
- [ ] Export PostgreSQL repository/driver boundaries.

### Task 6: CI PostgreSQL integration smoke test

**Files:**
- Create: `tests/postgres-integration.test.ts`
- Modify: `.github/workflows/ci.yml`

- [ ] Add a PostgreSQL service container to CI.
- [ ] Apply `001_initial.sql` to the service database.
- [ ] Exercise actual Home/Routine/HomeItem/Occurrence save/read flows.
- [ ] Run the full existing CI gate.
- [ ] Merge only after GitHub Actions is green.
