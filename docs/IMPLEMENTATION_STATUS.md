# Team Tulip implementation status — 2026-08-27

## Completed

- Repository baseline prepared for `main` at `BloomBouquet/Tulip-Home-OS`
- Shared contracts
- Bouquet auth adapter boundary
- Bouquet OAuth2 Authorization Code + PKCE S256 primitives and token/userinfo client
- OAuth `state` one-time server record + HttpOnly browser state-cookie binding
- Opaque HttpOnly Tulip session with no Bouquet access token persisted in the browser session
- Server SSO login/callback/logout routes and post-login Home routing
- Home ownership guard
- Recurrence engine with validation
- Waste normalization/provider boundary
- PostgreSQL-ready schema migration
- Repository interfaces and in-memory persistence adapters
- Authorized Routine CRUD service
- Authorized HomeItem CRUD service
- TaskOccurrence completion / undo / history service
- Routine completion advances the next due date exactly once
- HomeItem completion advances by the shortest configured maintenance interval
- Repository-backed Today source
- Home-isolated deterministic occurrence IDs
- Asia/Seoul Today date handling
- Today aggregator
- Today view model
- Next.js Today UI backed by authenticated same-origin Tulip API proxy
- Login and first-Home onboarding pages
- One-Home onboarding service with administrative-area-only data
- Bouquet bearer-authenticated HTTP router
- Home / Routine / HomeItem / Today / occurrence / history REST routes
- Strict YYYY-MM-DD calendar validation at the HTTP boundary
- Runtime category / recurrence discriminant validation for untrusted HTTP JSON
- Malformed percent-encoded resource paths return 400 instead of 500

## Verified in this environment

- `npm run verify:core`
  - TypeScript core typecheck: PASS
  - Node core behavior tests: **91 passing, 0 failing**
- `npm run typecheck:web:offline`: PASS
- `git diff --check`: PASS

## Full build blocker

The current execution sandbox cannot resolve `registry.npmjs.org`.
`npm run verify` reaches Corepack and then fails while attempting to download `pnpm@10.15.0` with `getaddrinfo EAI_AGAIN registry.npmjs.org`.

Because of that environment restriction, the following are not verifiable here yet:

- `pnpm install`
- full workspace `pnpm typecheck`
- `next build`
- full `pnpm -r build`

The failure is before project packages are installed, not a project test or TypeScript failure.

## Persistence milestone architecture

```text
Bouquet identity
      ↓
Home ownership guard
      ↓
Domain services
 ├─ RoutineService
 ├─ HomeItemService
 └─ OccurrenceService
      ↓
Repository interfaces
 ├─ HomeRepository
 ├─ RoutineRepository
 ├─ HomeItemRepository
 └─ TaskOccurrenceRepository
      ↓
In-memory adapter (tests now)
PostgreSQL adapter (next)
```

`apps/api/db/migrations/001_initial.sql` defines the PostgreSQL schema contract and deliberately contains no GPS, exact-address, apartment-unit, payment, or receipt-image fields.

## Next engineering milestone

1. Add a real PostgreSQL repository adapter once the DB driver can be installed.
2. Replace in-memory OAuth state/Tulip session stores with a shared production store before multi-instance deployment.
3. Confirm the deployed Bouquet provider endpoint/claim contract and configure the SSO environment values.
4. Add the normalized public waste-data importer job and region-code picker dataset.
5. Add CI and deployment after package installation is available.


## Bouquet SSO milestone architecture

```text
Browser
  ↓ /api/auth/bouquet/login
PKCE S256 + one-time state
  ↓
Bouquet Authorization Server
  ↓ code + state
/api/auth/bouquet/callback
  ├─ state cookie === callback state
  ├─ consume one-time server state
  ├─ server-side /token exchange
  ├─ server-side /userinfo
  └─ opaque HttpOnly Tulip session
       ↓
/api/tulip/v1/* proxy
       ↓
TulipApiRouter + Home ownership guard
```

Bouquet access tokens are used only for the server-side `/userinfo` request and are not written to localStorage, sessionStorage, rendered HTML, or the Tulip session record. The current in-memory runtime is intentionally a development adapter; it is not the final multi-instance persistence/session implementation.
