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
- Waste normalization/provider boundary
- Versioned PostgreSQL migrations `001 -> 002 -> 003`
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
- GitHub Actions CI with PostgreSQL 17 integration and Next.js production build

## Current verification

Latest feature-head GitHub Actions gate verifies:

- Core TypeScript typecheck
- **112 core behavior tests passing**
- PostgreSQL 17 integration test passing
- Migrations `001 -> 002 -> 003` applied in order
- Cross-instance OAuth state persistence and one-time consumption
- Cross-instance Tulip session resolution and global logout revocation
- Raw state/session values absent from persisted lookup keys
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
PostgreSQL auth stores (production default)
 ├─ oauth_transient_states
 └─ tulip_sessions
      ↓
shared PgPoolExecutor per runtime
      ↑
Domain repositories
 ├─ HomeRepository
 ├─ RoutineRepository
 ├─ HomeItemRepository
 └─ TaskOccurrenceRepository
```

`TULIP_PERSISTENCE_MODE=memory` remains an explicit local/test mode. In that mode both domain data and authentication state are process-local by design.

## Security properties

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

## Deployment notes

Apply migrations before starting the corresponding application version:

1. `001_initial.sql`
2. `002_unique_home_owner.sql`
3. `003_persistent_auth_state.sql`

Existing sessions created by the older process-local in-memory implementation cannot be migrated and may require users to sign in again during rollout.

## Next engineering milestone

1. Confirm the deployed Bouquet provider endpoint/claim contract and production environment values.
2. Add the normalized public waste-data importer and region-code picker dataset.
3. Add production deployment configuration, health/readiness checks, and migration execution strategy.
4. Add session-management UI/rotation only if product requirements call for it.
