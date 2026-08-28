# Team Tulip Waste Data Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize official Korean legal-dong and household-waste data into Tulip PostgreSQL, validate Home region selection against that catalog, expose chained onboarding selectors, and feed synchronized waste schedules into Today without live public-API calls on the request path.

**Architecture:** Fetch complete public-source snapshots before publication. Region and waste publication use parameterized PostgreSQL snapshot statements so upsert and stale-row deactivation occur only after fetch/normalize/resolve succeeds. Production runtime reads region/waste data from the existing shared `PgPoolExecutor`; explicit memory mode stays isolated and uses an empty waste provider.

**Tech Stack:** TypeScript, Web Crypto SHA-256, PostgreSQL 17, `pg`, Node test runner, Next.js 16, React 19, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-28-team-tulip-waste-data-sync-design.md`

## Global Constraints

- Use official MOIS/data.go.kr APIs only; do not scrape municipal websites.
- Keep public-data service credentials server-only.
- Home region identity is the official 10-digit legal-dong `region_cd`.
- Exclude `ri_cd != "00"` rows from the MVP selector.
- Do not add GPS, exact address, apartment/unit data, OCR, payment, ads, or AI waste interpretation.
- Fetch all source pages before publishing a snapshot.
- Never deactivate previous rows after a partial/failed fetch.
- Reject waste publication when malformed + unresolved rows exceed 20% of fetched rows.
- Imported waste rows use SHA-256 `source_row_key` and ID `waste:<source_row_key>`.
- Today never calls the public API directly.
- Existing migrations `001`, `002`, and `003` are immutable; add `004_waste_data_sync.sql`.
- All SQL values are parameterized.
- Business-date matching remains `Asia/Seoul`.

---

### Task 1: Migration 004 and region catalog persistence

**Files:**
- Create: `apps/api/db/migrations/004_waste_data_sync.sql`
- Create: `apps/api/src/regions/region-catalog.ts`
- Create: `apps/api/src/regions/postgres-region-catalog.ts`
- Modify: `apps/api/src/index.ts`
- Test: `tests/region-catalog.test.ts`

**Interfaces:**
- Produces `RegionLevel = "SIDO" | "SIGUNGU" | "EUPMYEONDONG"`.
- Produces `RegionCatalogEntry { regionCode, sido, sigungu?, locality?, parentRegionCode?, level, active, sourceUpdatedAt, syncedAt }`.
- Produces `RegionCatalogReader.findByCode(code)`, `listSido()`, `listChildren(parentCode, level)`, and `findDistrictCandidates(sido, sigungu)`.
- Produces `PostgresRegionCatalog.publishSnapshot(entries)` using one parameterized JSONB snapshot statement.

- [ ] **Step 1: Write RED repository-contract tests**

Create `tests/region-catalog.test.ts` that imports the not-yet-existing region module and asserts active-only deterministic listing, exact-code lookup, and snapshot SQL containing `jsonb_to_recordset`, `ON CONFLICT`, and stale `active = FALSE` handling.

```ts
const catalog = new PostgresRegionCatalog(recordingSql);
await catalog.publishSnapshot([entry]);
assert.match(recordingSql.calls[0].text, /jsonb_to_recordset/i);
assert.match(recordingSql.calls[0].text, /ON CONFLICT/i);
assert.match(recordingSql.calls[0].text, /active = FALSE/i);
```

- [ ] **Step 2: Run RED verification**

Run through Draft-PR GitHub Actions: `npm run verify:core`.
Expected: FAIL because `region-catalog.ts` / `postgres-region-catalog.ts` do not exist.

- [ ] **Step 3: Add migration 004**

Create `region_catalog` with the exact columns/constraints from the spec. Alter `waste_schedules` with nullable `source_row_key`, nullable `source_scope_name`, nullable `synced_at`, and non-null `active DEFAULT TRUE`; add a unique partial-capable normal unique constraint/index for non-null `source_row_key` plus active/scope indexes.

- [ ] **Step 4: Implement region persistence**

Use one JSONB parameter for `publishSnapshot`:

```sql
WITH incoming AS (
  SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
    region_code text, sido text, sigungu text, locality text,
    parent_region_code text, level text, source_updated_at timestamptz,
    synced_at timestamptz
  )
), upserted AS (
  INSERT INTO region_catalog (...)
  SELECT ... FROM incoming
  ON CONFLICT (region_code) DO UPDATE SET ... , active = TRUE
  RETURNING region_code
)
UPDATE region_catalog
SET active = FALSE
WHERE active = TRUE
  AND region_code NOT IN (SELECT region_code FROM incoming);
```

Reader queries must return only active rows unless `findByCode` is explicitly used for validation and still requires `active = TRUE`.

- [ ] **Step 5: Run GREEN verification and commit**

Run: `npm run verify:core` via CI.
Expected: PASS.
Commit: `feat: add region catalog persistence`

### Task 2: Official legal-dong client and region synchronization

**Files:**
- Create: `apps/api/src/regions/mois-region-client.ts`
- Create: `apps/api/src/regions/region-sync-service.ts`
- Modify: `apps/api/src/index.ts`
- Test: `tests/region-sync.test.ts`

**Interfaces:**
- `MoisRegionApiClient.fetchAll(): Promise<unknown[]>`.
- `normalizeMoisRegionRow(row, syncedAt): RegionCatalogEntry | null`.
- `syncRegionCatalog({ client, catalog, now }): Promise<{ fetched, accepted, rejected }>`.

- [ ] **Step 1: Write RED normalization/client tests**

Use fixtures with official fields `region_cd`, `sido_cd`, `sgg_cd`, `umd_cd`, `ri_cd`, `locatadd_nm`, `locathigh_cd`, `locallow_nm`, `adpt_de`. Verify:

```text
SIDO          sgg_cd=000, umd_cd=000, ri_cd=00
SIGUNGU       sgg_cd!=000, umd_cd=000, ri_cd=00
EUPMYEONDONG  umd_cd!=000, ri_cd=00
```

Verify `ri_cd != 00` returns `null`, malformed code shapes are rejected, and pagination requests contain `ServiceKey`, `pageNo`, `numOfRows`, `type=json`.

- [ ] **Step 2: Verify RED**

Expected: module-not-found / missing exports only in the new region-sync tests.

- [ ] **Step 3: Implement source parsing**

Derive display hierarchy from `locatadd_nm` and `locallow_nm` without fuzzy matching. Preserve multi-token district names by treating the first full-address token as `sido`, the last token as `locality` for EUPMYEONDONG, and the middle text as `sigungu`. Prefer valid `locathigh_cd` as parent code.

- [ ] **Step 4: Implement complete pagination**

Support the MOIS `StanReginCd` JSON envelope and a standard body/items envelope defensively. Stop only after the reported total is exhausted; a malformed page fails the sync rather than publishing a partial snapshot.

- [ ] **Step 5: Implement sync service and GREEN**

Collect all pages first, normalize in memory, then call `catalog.publishSnapshot(acceptedRows)` exactly once.
Run full core CI and commit: `feat: add legal-dong region sync`.

### Task 3: Household-waste source expansion, conservative resolution, and snapshot sync

**Files:**
- Create: `apps/api/src/waste/mois-waste-client.ts`
- Create: `apps/api/src/waste/waste-sync-service.ts`
- Create: `apps/api/src/waste/postgres-waste-sync-store.ts`
- Modify: `apps/api/src/waste/waste-normalizer.ts`
- Modify: `apps/api/src/index.ts`
- Test: `tests/waste-sync.test.ts`

**Interfaces:**
- `MoisWasteApiClient.fetchAll(): Promise<Record<string, unknown>[]>`.
- `expandMoisWasteRow(row): WasteSourceCandidate[]`, expanding household/general, food, and recycling fields separately.
- `resolveWasteRegion(candidate, regions): Promise<{ regionCode, sourceScopeName } | null>`.
- `createWasteSourceRowKey(candidate): Promise<string>` using SHA-256 canonical serialization.
- `PostgresWasteSyncStore.publishSnapshot(rows)`.
- `syncWasteSchedules(...): Promise<WasteSyncResult>` containing fetched/expanded/published/malformed/unresolved/reasons.

- [ ] **Step 1: Write RED tests**

Fixtures use known official field names such as `SGG_NM`, `MNG_ZONE_NM`, `MNG_ZONE_TRGT_RGN_NM`, `EMSN_PLC`, `LF_WST_EMSN_MTHD`, `FOD_WST_EMSN_MTHD`, `RCYCL_EMSN_MTHD`, matching `*_EMSN_DOW`, `*_BGNG_TM`, `*_END_TM`, and `DAT_CRTR_YMD`/`DAT_UPDT_PNT`.

Verify one source record can expand to three category candidates; exact locality beats district scope; duplicate district names without a province remain unresolved; canonical hashing changes when time/place/method changes.

- [ ] **Step 2: Verify RED**

Expected: only new waste-sync tests fail because modules/exports are absent.

- [ ] **Step 3: Implement defensive public-data pagination/parser**

Request configured `MOIS_WASTE_API_BASE_URL` with server-only `PUBLIC_DATA_SERVICE_KEY`, `returnType=json`, `pageNo`, and `numOfRows`. Accept known common response envelopes, but throw on an unrecognized page shape instead of silently treating it as empty.

- [ ] **Step 4: Implement conservative resolver**

Use province aliases when present (`CTPV_NM`, `SIDO_NM`, `CTPRVN_NM`) plus `SGG_NM`; do not guess when multiple active districts match. For a unique district, inspect active locality children and accept an exact locality token present in the official management/target scope text. Otherwise publish at the five-digit district scope.

- [ ] **Step 5: Implement snapshot publication safety**

Stage every expanded candidate in memory. Count malformed/unresolved. If `(malformed + unresolved) / max(1, fetched) > 0.20`, return a failed publication result without calling `publishSnapshot`. Otherwise publish all resolved schedules in one JSONB snapshot statement and deactivate only stale rows where `source_row_key IS NOT NULL`.

- [ ] **Step 6: GREEN and commit**

Run core CI. Commit: `feat: add household waste synchronization`.

### Task 4: PostgreSQL waste provider and Today lookup

**Files:**
- Create: `apps/api/src/waste/postgres-waste-provider.ts`
- Modify: `apps/api/src/index.ts`
- Test: `tests/postgres-waste-provider.test.ts`

**Interfaces:**
- Produces `PostgresWasteScheduleProvider implements WasteScheduleProvider`.

- [ ] **Step 1: Write RED provider tests**

Assert 10-digit validation, exact + five-digit district query parameters, `active = TRUE`, `weekdays` containment, Seoul weekday, deterministic ordering, and mapping null database columns to absent optional fields.

- [ ] **Step 2: Verify RED**

Expected: missing provider module.

- [ ] **Step 3: Implement provider**

Compute weekday using Asia/Seoul, not runner/server timezone. Query:

```sql
WHERE active = TRUE
  AND region_code = ANY($1::text[])
  AND $2 = ANY(weekdays)
ORDER BY waste_type ASC, start_time ASC NULLS LAST, id ASC
```

- [ ] **Step 4: GREEN and commit**

Run core CI. Commit: `feat: add PostgreSQL waste provider`.

### Task 5: Region selector API and Home catalog validation

**Files:**
- Create: `apps/api/src/regions/region-service.ts`
- Modify: `apps/api/src/home/home-management-service.ts`
- Modify: `apps/api/src/http/tulip-api-router.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `tests/home-management-service.test.ts`
- Modify: `tests/http-api-router.test.ts`
- Test: `tests/region-service.test.ts`

**Interfaces:**
- `RegionService.listSido()`, `listSigungu(parentCode)`, `listLocalities(parentCode)`, `validateHomeRegion(input)`.
- Router dependency `regions: RegionService`.

- [ ] **Step 1: Write RED validation/API tests**

Verify invalid/nonexistent/inactive/non-EUP region is rejected. Verify hierarchy mismatch (`regionCode` for 수완동 with `sigungu: 서구`) returns 400. Verify the three selector endpoints require the normal session and use `parentCode`.

- [ ] **Step 2: Verify RED**

Expected: new dependency/endpoints/validation missing.

- [ ] **Step 3: Implement RegionService**

Return selector options `{ regionCode, name, level, sido, sigungu?, locality? }`. Validate parent code shape/level before listing children.

- [ ] **Step 4: Inject validation into Home create/update**

`HomeManagementService` receives `regions: RegionService`. Creation always validates. Update validates the combined current+patched region tuple whenever any region field changes.

- [ ] **Step 5: Update existing in-memory tests**

Use a small in-memory/stub region catalog containing the existing 광주 fixtures rather than weakening production validation.

- [ ] **Step 6: GREEN and commit**

Run core CI. Commit: `feat: validate Home regions through catalog`.

### Task 6: Runtime PostgreSQL wiring for region and waste persistence

**Files:**
- Modify: `apps/web/src/server/tulip-runtime.ts`
- Modify: `tests/tulip-web-runtime.test.ts`

**Interfaces:**
- `RuntimePersistence` adds `regions: RegionCatalogReader` and `waste: WasteScheduleProvider`.
- PostgreSQL mode shares the same `PgPoolExecutor` with region reader and waste provider.
- Memory mode uses a deterministic in-memory region catalog fixture for tests and the existing empty waste provider.

- [ ] **Step 1: Write RED runtime test**

Add a PostgreSQL integration assertion later, and a unit boundary test proving memory runtime still constructs without public-data credentials while Home validation uses its injected catalog.

- [ ] **Step 2: Verify RED**

Expected: runtime has no region/waste persistence fields.

- [ ] **Step 3: Wire runtime**

Remove PostgreSQL use of `emptyWasteProvider`. Construct `PostgresRegionCatalog`/reader and `PostgresWasteScheduleProvider` from the same SQL executor, inject `RegionService` into Home/router, and pass provider to `RepositoryTodaySource`.

- [ ] **Step 4: GREEN and commit**

Run core + offline web typecheck. Commit: `feat: connect synchronized waste data to Today`.

### Task 7: Chained onboarding region selector

**Files:**
- Create: `apps/web/src/lib/region-selector-model.ts`
- Create: `apps/web/src/components/home-region-form.tsx`
- Modify: `apps/web/src/lib/tulip-api-client.ts`
- Modify: `apps/web/src/app/onboarding/home/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `tests/tulip-api-client.test.ts`
- Test: `tests/region-selector-model.test.ts`

**Interfaces:**
- Web client methods `regionsSido()`, `regionsSigungu(parentCode)`, `regionsLocalities(parentCode)`.
- `RegionOption` mirrors API response.
- Client form submits hidden `regionCode`, `sido`, `sigungu`, `eupmyeondong` values to existing `/api/onboarding/home` action.

- [ ] **Step 1: Write RED model/client tests**

Verify code-based endpoint construction and pure state helpers that reset downstream selections when a parent changes.

- [ ] **Step 2: Verify RED**

Expected: region client/model missing.

- [ ] **Step 3: Implement client component**

Load SIDO on mount, then SIGUNGU by selected SIDO code, then locality by selected SIGUNGU code. Disable children while loading/without parent. Use `읍·면·동` copy, not `행정동`. No manual region-code field appears.

- [ ] **Step 4: Preserve existing form boundary**

Keep `action="/api/onboarding/home" method="post"`; selected option data is emitted through hidden fields. Submit remains disabled until an EUPMYEONDONG is selected.

- [ ] **Step 5: GREEN and commit**

Run core, offline web typecheck, and full workspace CI. Commit: `feat: add chained Home region selector`.

### Task 8: Real PostgreSQL 17 integration, sync CLI, documentation, and PR gate

**Files:**
- Create: `apps/api/src/waste/sync-cli.ts`
- Modify: `package.json`
- Modify: `integration/postgres.integration.test.ts`
- Modify: `README.md`
- Modify: `docs/IMPLEMENTATION_STATUS.md`
- Modify: this plan checklist

**Interfaces:**
- Root script `sync:waste-data` executes region sync first, then waste sync with `DATABASE_URL`, `PUBLIC_DATA_SERVICE_KEY`, `MOIS_REGION_API_BASE_URL`, `MOIS_WASTE_API_BASE_URL`.

- [ ] **Step 1: Extend integration migrations to 004**

Apply `001 -> 002 -> 003 -> 004`.

- [ ] **Step 2: Add real PostgreSQL assertions**

Seed/fetch region fixtures through the sync boundary, verify hierarchy listing and idempotent re-sync. Publish district + exact-locality waste fixtures; verify unresolved rows are absent; verify stale imported rows deactivate only after a complete second snapshot.

- [ ] **Step 3: Verify Today integration**

Create a Home with a catalog-backed 10-digit region and call `/v1/today` on a matching Seoul weekday. Assert WASTE occurrences from both applicable district/local schedules appear and remain Home-isolated.

- [ ] **Step 4: Add CLI and docs**

Add root script:

```json
"sync:waste-data": "node --experimental-strip-types apps/api/src/waste/sync-cli.ts"
```

Document migration 004, env vars, daily scheduler recommendation, source provenance, 20% publication guard, and no-live-API Today design.

- [ ] **Step 5: Run Luna Security/Code Review/Governance audit**

Confirm no service key reaches web code; no fuzzy region guess; no GPS/exact address scope creep; no stale deactivation on incomplete source; SQL parameterization; Today partial failure preserved; old migrations unchanged.

- [ ] **Step 6: Run fresh final CI gate**

Require success for `npm run verify:core`, `npm run test:postgres`, `npm run typecheck:web:offline`, and `pnpm verify` including Next production build.

- [ ] **Step 7: Open/finalize PR**

Title: `feat : 공공 쓰레기 일정 및 지역 선택 연결`
Target: `main`.
Use the fixed Tulip PR body format. Confirm exact head SHA, no unresolved review threads, CI success, changed-file scope, and `mergeable=true` before ready/merge.

- [ ] **Step 8: Merge verified SHA and re-check main CI**

Merge only the verified head SHA and confirm the `main` push workflow passes the same PostgreSQL 17/full-build gate before declaring this milestone complete.
