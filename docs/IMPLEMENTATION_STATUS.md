# Team Tulip implementation status — 2026-08-28

## Completed

- Repository baseline published to `main` at `BloomBouquet/Tulip-Home-OS`
- Shared Home OS contracts
- Bouquet auth adapter boundary
- Bouquet OAuth2 Authorization Code + PKCE S256 primitives and token/userinfo client
- OAuth `state` HttpOnly browser-cookie binding and one-time server consumption
- Opaque HttpOnly Tulip session with no Bouquet access token persisted in the browser session
- PostgreSQL-backed OAuth transient state shared across application instances
- PostgreSQL-backed Tulip sessions shared across application instances
- SHA-256 lookup hashing for raw OAuth state and raw Tulip session tokens
- Atomic `DELETE ... RETURNING` OAuth state consumption
- Cross-instance session logout/revocation
- Server SSO login/callback/logout routes and post-login Home routing
- Home ownership guard
- Recurrence engine with validation
- Versioned PostgreSQL migrations `001 -> 002 -> 003 -> 004`
- Repository interfaces and explicit in-memory persistence adapters for tests/local development
- PostgreSQL repositories for Home, Routine, HomeItem, and TaskOccurrence
- Authorized Routine CRUD service
- Authorized HomeItem CRUD service
- TaskOccurrence completion / undo / history service
- Routine completion advances the next due date exactly once
- HomeItem completion advances by the shortest configured maintenance interval
- Repository-backed Today source
- Home-isolated deterministic occurrence IDs
- Asia/Seoul Today date handling
- Today aggregator and view model
- Next.js Today UI backed by authenticated same-origin Tulip API proxy
- Login and first-Home onboarding pages
- One-Home onboarding service with administrative-area-only data
- Bouquet-authenticated HTTP router
- Home / Routine / HomeItem / Today / occurrence / history REST routes
- Strict YYYY-MM-DD calendar validation at the HTTP boundary
- Runtime category / recurrence discriminant validation for untrusted HTTP JSON
- Malformed percent-encoded resource paths return 400 instead of 500
- Official legal-dong MOIS API client and snapshot normalizer
- PostgreSQL active region catalog with deterministic hierarchy readers
- Authenticated Region selector routes for 시·도 / 시·군·구 / 읍·면·동
- Home creation validation against the active canonical locality hierarchy
- Web onboarding changed from free-text administrative areas to chained official region selectors
- Household-waste MOIS API client and category expansion for general / food / recycling schedules
- Region resolution that prefers exact locality and falls back to district scope
- Waste import rejection threshold for malformed/unresolved source rows
- PostgreSQL waste snapshot publication with stale imported-row deactivation
- Empty upstream region/waste snapshot rejection before publication, preserving the previous active snapshot
- PostgreSQL Today waste provider using exact locality plus five-digit district scope
- Production PostgreSQL runtime wiring for official region and waste providers
- Official-data sync runner that refreshes regions before waste and always closes persistence
- `npm run sync:official-data` operational CLI with server-only `DATA_GO_KR_API_KEY`
- GitHub Actions CI with PostgreSQL 17 integration and Next.js production build

## Current verification

Latest verified feature-head GitHub Actions gate verifies:

- Core TypeScript typecheck
- **136 core behavior tests passing, 0 failures**
- PostgreSQL 17 end-to-end integration test passing
- Migrations `001 -> 002 -> 003 -> 004` applied in order
- Cross-instance OAuth state persistence and one-time consumption
- Cross-instance Tulip session resolution and global logout revocation
- Raw state/session values absent from persisted lookup keys
- Region snapshot publication and authenticated selector hierarchy
- Home rejection when display hierarchy does not match the canonical locality code
- Waste snapshot idempotency and stale imported-row deactivation
- Empty region/waste upstream responses rejected before snapshot publication
- Today loading both district- and locality-scoped waste schedules
- Official-data sync configuration, ordering, rejected-publication failure, and guaranteed persistence cleanup
- Offline web TypeScript verification
- Full workspace verification
- Next.js production build

## Persistence architecture

```text
Bouquet OAuth / Tulip session
      ↓
Auth store interfaces
 ├─ TransientAuthStore
 └─ TulipSessionStore
      ↓
PostgreSQL auth stores
 ├─ oauth_transient_states
 └─ tulip_sessions

Official public data
 ├─ legal-dong region API
 └─ household-waste API
      ↓
normalizers + guarded full-snapshot publication
      ↓
PostgreSQL public-data stores
 ├─ region_catalog
 └─ waste_schedules
      ↓
shared PgPoolExecutor per runtime
      ↑
Domain repositories / API services
 ├─ HomeRepository
 ├─ RoutineRepository
 ├─ HomeItemRepository
 └─ TaskOccurrenceRepository
```

`TULIP_PERSISTENCE_MODE=memory` remains an explicit local/test mode. In that mode both domain data and authentication state are process-local by design, and the production public-data catalog/provider is not attached.

## Security and data-integrity properties

- PKCE S256 remains enabled.
- Browser state cookie must match callback state before server-side state consumption.
- PostgreSQL stores SHA-256 hashes instead of raw OAuth state/session token lookup values.
- OAuth state consumption is atomic across instances.
- OAuth transient state expires after five minutes.
- Tulip sessions expire after seven days.
- Bouquet access tokens are not written to Tulip session storage.
- Session cookies remain HttpOnly, Secure in HTTPS environments, and SameSite=Lax.
- PostgreSQL queries use parameterized values.
- Database failures remain server failures rather than being treated as invalid user credentials.
- `DATA_GO_KR_API_KEY` is a server-only sync credential and is not exposed through the browser API.
- Home onboarding stores no GPS coordinates, exact address, or apartment unit.
- Home region data must match an active canonical 읍·면·동 entry before persistence in PostgreSQL mode.
- Waste import does not replace the active snapshot when malformed/unresolved source quality exceeds the configured threshold.
- Zero-row region or household-waste upstream responses fail before publication, so the previous active snapshot remains available.
- Region refresh runs before waste refresh so waste matching uses the newest successfully published region catalog.

## Deployment notes

Apply migrations before starting the corresponding application version:

1. `001_initial.sql`
2. `002_unique_home_owner.sql`
3. `003_persistent_auth_state.sql`
4. `004_waste_data_sync.sql`

Configure these server-only/public-data runtime values before executing the first official-data refresh:

- `DATABASE_URL`
- `DATA_GO_KR_API_KEY`
- `TULIP_REGION_API_URL`
- `TULIP_WASTE_API_URL`
- optional `TULIP_WASTE_MAX_REJECTED_RATIO` (`0..1`, default `0.2`)

Run `npm run sync:official-data` only after migration `004` is applied. A rejected or unexpectedly empty source snapshot exits unsuccessfully and leaves the previously active imported snapshot in place.

Existing sessions created by the older process-local in-memory implementation cannot be migrated and may require users to sign in again during rollout.

## Next engineering milestone

1. Configure the deployed Bouquet provider endpoints/claims and production secrets.
2. Apply migration `004`, configure the approved public-data source URLs/key, and run the initial official snapshot refresh against the deployment database.
3. Add deployment health/readiness checks and an explicit migration execution strategy.
4. Add a scheduled public-data refresh job after production database connectivity and secrets are available.
5. Add session-management UI/rotation only if product requirements call for it.
