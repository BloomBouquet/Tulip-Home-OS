# Team Tulip Waste Data Sync Design

**Date:** 2026-08-28

## Goal

Connect official Korean public waste-disposal data and official legal-dong region codes to Tulip Home OS so users select a valid 읍·면·동 during Home onboarding and Today can show applicable household-waste tasks without calling the public API on every request.

## Source contracts

### Region catalog

Source: 행정안전부_행정표준코드_법정동코드 (`data.go.kr` dataset 15077871).

- REST API, JSON/XML.
- Canonical key: 10-character `region_cd`.
- Relevant fields: `region_cd`, `sido_cd`, `sgg_cd`, `umd_cd`, `locatadd_nm`, `locathigh_cd`, `locallow_nm`, `adpt_de`.
- The importer treats the legal-dong code as the canonical Tulip region identifier.
- UI terminology is `읍·면·동`; Tulip does not claim these are 행정동 codes.

### Waste schedules

Primary source: 행정안전부_생활쓰레기배출정보 조회서비스 (`data.go.kr` dataset 15155080), backed by the national household-waste standard dataset.

Reference file dataset: 행정안전부_생활쓰레기배출정보 (15075534 / national standard dataset 15025450).

- Source contains region/management-area information, disposal methods, weekdays, time windows, places, and other waste guidance.
- The reference file had 7,398 rows at the latest verified metadata and is updated automatically; the portal notes that data is current to roughly two days prior.
- Tulip does not scrape municipal websites.
- Public API credentials are server-only environment values.

## Chosen architecture

Tulip uses scheduled server-side synchronization rather than live public-API calls from Today.

```text
MOIS legal-dong API
        ↓
Region Catalog Importer
        ↓
region_catalog
        ↓
Home onboarding selector
        ↓
Home.regionCode

MOIS household-waste API
        ↓
Waste Importer
        ↓ normalize + region resolution
        ↓
waste_schedules
        ↓
PostgresWasteScheduleProvider
        ↓
RepositoryTodaySource
        ↓
Today
```

The user-facing request path depends only on Tulip PostgreSQL after synchronization. Public-source outages therefore do not make Today unavailable when previously synchronized data exists.

## Database design

Add immutable migration `004_waste_data_sync.sql`.

### `region_catalog`

```text
region_code TEXT PRIMARY KEY
sido TEXT NOT NULL
sigungu TEXT
locality TEXT
parent_region_code TEXT
level TEXT NOT NULL CHECK IN ('SIDO','SIGUNGU','EUPMYEONDONG')
active BOOLEAN NOT NULL DEFAULT TRUE
source_updated_at TIMESTAMPTZ NOT NULL
synced_at TIMESTAMPTZ NOT NULL
```

Indexes:

- `(level, sido, sigungu, locality)` for selector queries.
- `(parent_region_code, active)` for hierarchy queries.

Only active 시도/시군구/읍면동 rows are returned by onboarding APIs.

### `waste_schedules` additions

Keep the existing domain columns and add:

```text
source_row_key TEXT
source_scope_name TEXT
synced_at TIMESTAMPTZ
active BOOLEAN NOT NULL DEFAULT TRUE
```

Add a uniqueness constraint suitable for stable source-row upserts. Existing schedule IDs remain deterministic Tulip IDs and must not include user/Home information.

## Region-resolution rules

Tulip stores Home region codes as canonical 10-digit legal-dong codes.

Waste source rows may apply at different geographic scopes. The importer resolves them conservatively:

1. Exact 읍·면·동 match when the source management area unambiguously maps to one legal-dong catalog row.
2. Otherwise resolve to the unambiguous 시군구 scope and store the first five digits of the legal-dong code as the schedule scope key.
3. Ambiguous management-area rows are recorded as unresolved import results and are not exposed to Today.
4. No fuzzy guess is accepted solely to increase coverage.

Provider lookup for Home `2920011400` uses both:

```text
2920011400  # exact locality
29200       # containing 시군구
```

Exact-locality and containing-district schedules can both apply. Duplicate normalized schedules are deduplicated by schedule identity.

## Import behavior

Both importers are idempotent.

### Region sync

- Fetch pages from the official API.
- Normalize and validate region-code structure.
- Upsert all valid rows.
- Mark rows absent from a successfully completed full snapshot as inactive.
- Never deactivate old rows when a fetch terminates partially or fails.

### Waste sync

- Fetch public API pages into a staging collection for one sync run.
- Validate source response shape before changing active production rows.
- Normalize using the existing waste normalization boundary, expanded only where necessary for official source fields.
- Resolve region scope against `region_catalog`.
- Upsert resolved rows.
- Persist unresolved-row counts and reasons in a sync result; do not publish unresolved rows.
- Mark stale schedules inactive only after a successful complete run.
- Preserve the last successful dataset if the public API is unavailable.

No destructive `TRUNCATE`-then-reload flow is allowed.

## Sync execution boundary

Expose application-level functions instead of binding import logic directly to a particular scheduler:

```ts
syncRegionCatalog(...): Promise<RegionSyncResult>
syncWasteSchedules(...): Promise<WasteSyncResult>
```

A later deployment scheduler can invoke these once per day. The repository must also provide an explicit CLI/script entry point suitable for cron/GitHub Actions/manual operations.

Expected server-only environment contract:

```text
PUBLIC_DATA_SERVICE_KEY=...
MOIS_REGION_API_BASE_URL=...
MOIS_WASTE_API_BASE_URL=...
```

Default production endpoint values may be defined in server configuration, but credentials must never be sent to the browser.

## Region API for onboarding

Add authenticated or public-read-only Tulip API endpoints for the selector. These expose only public administrative-area data and no user data.

```text
GET /v1/regions/sido
GET /v1/regions/sigungu?sido=<name-or-code>
GET /v1/regions/localities?sigungu=<region-code>
```

Prefer code-based parent selection after the first selector step to avoid name ambiguity.

Home creation continues to send:

```text
name
regionCode
sido
sigungu
eupmyeondong
```

The server verifies that the selected active `regionCode` exists and matches the submitted display hierarchy before persisting Home data.

## Web onboarding

Replace free-text region inputs with chained selectors:

```text
시/도
  ↓
시/군/구
  ↓
읍/면/동
```

Behavior:

- downstream selections reset when a parent changes;
- loading and empty states are explicit;
- submit is disabled until a complete valid region is selected;
- the browser receives public region values only, never the public-data service key;
- no GPS or exact address is introduced.

## PostgreSQL waste provider

Implement `PostgresWasteScheduleProvider` against `waste_schedules`.

`getByRegionAndDate(regionCode, date)`:

- validates a 10-digit Home region code;
- computes exact locality plus containing 5-digit district scope;
- returns only active schedules whose weekday includes the Asia/Seoul weekday;
- maps PostgreSQL rows back into `WasteSchedule` contracts;
- deterministic ordering;
- returns an empty array when no schedule exists rather than failing Today.

Database errors still propagate so the existing Today partial-failure warning path remains effective.

## Runtime wiring

Replace `emptyWasteProvider` in PostgreSQL runtime with `PostgresWasteScheduleProvider` using the runtime's existing shared PostgreSQL executor/pool.

Explicit `TULIP_PERSISTENCE_MODE=memory` keeps an empty/in-memory waste provider for isolated unit/development mode unless a test provider is injected.

## Today behavior

No new Today domain type is required. Existing `RepositoryTodaySource` already turns a `WasteSchedule` into a Home-isolated `TaskOccurrence`.

After provider wiring:

```text
Home.regionCode
  ↓
PostgresWasteScheduleProvider
  ↓
WasteSchedule[] for requested Seoul date
  ↓
RepositoryTodaySource
  ↓
materialized WASTE TaskOccurrence
  ↓
Today response/UI
```

Waste source failure remains partial: Routine and HomeItem Today items are still returned with the existing warning behavior.

## Data provenance and user trust

Tulip should retain and expose at least:

- source update timestamp;
- Tulip synchronization timestamp;
- source scope/management-area description where useful.

The UI may show a concise source/last-updated note in the waste detail area. It must not imply Tulip independently guarantees municipal collection when the official source is stale or incomplete.

## Legal/privacy boundaries

- Public datasets have no Tulip user personal data.
- Public-data credentials stay server-side.
- No exact address, apartment/unit, GPS, OCR, payment, advertising, or municipal-site scraping is added.
- Public-source attribution/provenance is retained operationally even when the source license permits unrestricted reuse.

## Failure handling

- Region sync failure: keep the previous catalog active; do not partially deactivate.
- Waste sync failure: keep the previous successful schedules active.
- Individual malformed rows: reject and count with a structured reason; continue the run if the source snapshot itself is complete.
- Excessive unresolved/malformed rate: fail the publication phase and retain the old dataset.
- Provider/database failure during Today: existing Today warning path handles partial failure.

## Testing strategy

### Unit tests

- official region response parsing and hierarchy normalization;
- waste-source parsing and normalization;
- conservative region resolution;
- exact + district provider lookup;
- weekday matching in Asia/Seoul;
- idempotent/stale-deactivation sync policy;
- incomplete fetch never deactivates existing rows;
- Home region validation.

### PostgreSQL 17 integration

Apply migrations `001 -> 002 -> 003 -> 004`, then verify:

1. region sync persists selector hierarchy;
2. waste sync persists normalized active schedules;
3. rerun is idempotent;
4. stale rows deactivate only after a complete successful snapshot;
5. unresolved rows never appear through the provider;
6. a Home using a real catalog region gets the correct district/local waste schedule in Today.

### Web/full build

- selector view-model/client tests;
- onboarding uses codes returned by region APIs;
- existing core tests remain green;
- offline web typecheck passes;
- full workspace and Next.js production build pass in GitHub Actions.

## Delivery sequence

1. Migration 004 + region/waste persistence contracts.
2. Region catalog client/importer.
3. Waste public-data client/importer and conservative region resolver.
4. PostgreSQL waste provider.
5. Region selector API + Home region validation.
6. Runtime Today provider wiring.
7. Web onboarding chained selectors.
8. PostgreSQL 17 integration tests, documentation, Security/Governance review, PR, merge gate.

## Explicit non-goals

- GPS/geolocation.
- Exact street or apartment/unit address.
- Apartment-specific private collection schedules.
- Municipal webpage scraping.
- Large-waste online reporting/payment.
- AI interpretation of waste rules.
- Replacing official source text with guessed instructions.
