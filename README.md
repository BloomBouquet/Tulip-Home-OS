# Tulip Home OS

Team Tulip's Personal Home OS MVP foundation, built with the Luna Agent System workflow.

## Current milestone

Implemented and verified:

- shared Home OS contracts and recurrence engine
- Bouquet OAuth2 Authorization Code + PKCE S256 server flow
- one-time OAuth state binding and opaque HttpOnly Tulip sessions
- PostgreSQL-backed cross-instance auth state/session persistence
- Home ownership authorization and one-Home-per-owner database constraint
- Routine/HomeItem CRUD, Today, complete/undo, and history APIs
- PostgreSQL persistence for Home, Routine, HomeItem, and TaskOccurrence
- PostgreSQL-backed official legal-dong region catalog
- authenticated region selector API for 시·도 → 시·군·구 → 읍·면·동
- first-Home onboarding UI that accepts only server-provided canonical region options
- Home region validation against the active official catalog
- normalized household-waste importer with rejected-row safety threshold
- PostgreSQL waste snapshot store with stale-row deactivation
- empty upstream region/waste snapshot rejection that preserves the previous active snapshot
- Today waste provider that combines exact locality and district schedules in Asia/Seoul
- operational official-data sync runner and CLI
- PostgreSQL 17 integration verification and Next.js production build in GitHub Actions

## Verification

GitHub Actions verifies the core behavior plus a real PostgreSQL 17 service and the full Next.js production build.

```bash
corepack enable
pnpm install
npm run verify:core
npm run typecheck:web:offline
pnpm verify
```

Current feature-head verification includes **136 core behavior tests**, one PostgreSQL 17 end-to-end integration test, offline web typechecking, and the Next.js production build.

For the PostgreSQL integration test, provide a dedicated test database:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/tulip_test npm run test:postgres
```

The PostgreSQL integration suite verifies domain persistence, cross-instance authentication, the official region selector, Home catalog validation, waste snapshot idempotency/stale-row handling, and Today loading both district- and locality-scoped waste schedules.

## PostgreSQL setup

Production runtime defaults to PostgreSQL persistence. `DATABASE_URL` is required unless in-memory persistence is explicitly selected for local/test use.

```text
DATABASE_URL=postgresql://user:password@host:5432/tulip
# local/test-only escape hatch; domain and auth state are process-local in this mode
TULIP_PERSISTENCE_MODE=memory
```

Apply migrations in numeric order before starting the application:

```bash
psql "$DATABASE_URL" -f apps/api/db/migrations/001_initial.sql
psql "$DATABASE_URL" -f apps/api/db/migrations/002_unique_home_owner.sql
psql "$DATABASE_URL" -f apps/api/db/migrations/003_persistent_auth_state.sql
psql "$DATABASE_URL" -f apps/api/db/migrations/004_waste_data_sync.sql
```

Do not rewrite an already-applied migration. Add the next numbered migration for future schema changes.

Migration `003_persistent_auth_state.sql` adds shared OAuth transient-state and Tulip-session tables. Migration `004_waste_data_sync.sql` adds the official region catalog and normalized waste schedule storage used by onboarding and Today.

## Official public-data sync

The public-data key is server-only. Never expose `DATA_GO_KR_API_KEY` through browser environment variables or client bundles.

```text
DATABASE_URL=postgresql://user:password@host:5432/tulip
DATA_GO_KR_API_KEY=...
TULIP_REGION_API_URL=https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList
TULIP_WASTE_API_URL=https://apis.data.go.kr/1741000/household_waste_info/info
# optional; default 0.2, valid range 0..1
TULIP_WASTE_MAX_REJECTED_RATIO=0.2
```

Run a complete refresh with:

```bash
npm run sync:official-data
```

The runner refreshes the region catalog first, then resolves and publishes the household-waste snapshot against that catalog. If the malformed/unresolved waste ratio exceeds the configured threshold, the new waste snapshot is rejected and the command exits unsuccessfully instead of replacing the previous active snapshot. A zero-row region or household-waste response is also rejected before publication so a transient upstream failure cannot deactivate the previous active snapshot.

Keep the API URLs as deployment configuration even when using the examples above. This allows the upstream endpoint to be changed without rebuilding Tulip.

## Bouquet SSO environment contract

Server-side runtime configuration:

```text
BOUQUET_AUTHORIZATION_URL=https://.../authorize
BOUQUET_TOKEN_URL=https://.../token
BOUQUET_USERINFO_URL=https://.../userinfo
BOUQUET_CLIENT_ID=...
BOUQUET_REDIRECT_URI=https://<tulip-host>/api/auth/bouquet/callback
TULIP_POST_LOGIN_URL=/api/auth/post-login
# optional server-only confidential client setting
BOUQUET_CLIENT_SECRET=...
```

Production endpoints must use HTTPS. `http://localhost` and `http://127.0.0.1` are accepted only for local development.

In PostgreSQL mode, Home/Routine/HomeItem/TaskOccurrence data, official region/waste snapshots, OAuth transient state, and Tulip sessions are shared across runtime instances. OAuth state/session lookup keys are stored only as SHA-256 hashes; the short-lived PKCE verifier remains recoverable in the transient-state table until callback consumption. Bouquet access tokens are used only server-side for the OAuth flow and are not persisted in Tulip session records.

## Repository

`https://github.com/BloomBouquet/Tulip-Home-OS`

The baseline is published from `main`; feature work continues on isolated `team-tulip/*` branches.

## Product constraints

- Asia/Seoul scheduling
- no GPS in MVP
- no exact home address or apartment unit
- no OCR/payment/ads/public profile
- Bouquet is the canonical account identity
- all Home-scoped access is checked server-side
