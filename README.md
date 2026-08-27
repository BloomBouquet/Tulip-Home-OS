# Tulip Home OS

Team Tulip's Personal Home OS MVP foundation, built with the Luna Agent System workflow.

## Current milestone

Implemented and verified:

- shared Home OS contracts
- recurrence engine
- waste schedule normalization boundary
- Today aggregator with partial-failure handling
- Bouquet authentication adapter boundary
- Bouquet OAuth2 Authorization Code + PKCE S256 server flow
- OAuth state browser binding with one-time HttpOnly state cookie
- PostgreSQL-backed one-time OAuth transient state shared across runtime instances
- opaque HttpOnly Tulip session with PostgreSQL-backed cross-instance resolution/revocation
- raw OAuth state and raw Tulip session tokens are not persisted; PostgreSQL stores SHA-256 lookup hashes
- Bouquet access tokens remain server-only and are not persisted in Tulip sessions
- Home ownership authorization guard
- Today frontend view model
- Next.js Today screen backed by the authenticated Tulip API proxy
- Bouquet login/callback/logout server routes
- first-Home onboarding page with administrative-area-only fields
- one-Home onboarding domain service
- authenticated framework-independent REST router
- Routine/HomeItem CRUD, Today, complete/undo, and history HTTP routes
- PostgreSQL persistence for Home, Routine, HomeItem, and TaskOccurrence
- PostgreSQL 17 integration verification in GitHub Actions
- one-Home-per-owner database constraint

## Verification

GitHub Actions verifies the core behavior plus a real PostgreSQL 17 service and the full Next.js production build.

```bash
corepack enable
pnpm install
npm run verify:core
npm run typecheck:web:offline
pnpm verify
```

For the PostgreSQL integration test, provide a dedicated test database:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/tulip_test npm run test:postgres
```

The PostgreSQL integration suite verifies domain persistence and the cross-instance authentication path: one runtime starts OAuth, a different runtime consumes the callback state, another runtime authenticates the resulting Tulip session, and logout from another runtime revokes the session globally.

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
```

Do not rewrite an already-applied migration. Add the next numbered migration for future schema changes.

Migration `003_persistent_auth_state.sql` adds shared OAuth transient-state and Tulip-session tables. Deploy this migration before starting an application version that uses PostgreSQL auth persistence. Existing process-local sessions from an older deployment cannot be migrated, so users may need to sign in again during rollout.

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

In PostgreSQL mode, Home/Routine/HomeItem/TaskOccurrence data, OAuth transient state, and Tulip sessions are shared across runtime instances. OAuth state/session lookup keys are stored only as SHA-256 hashes; the short-lived PKCE verifier remains recoverable in the transient-state table until callback consumption. Bouquet access tokens are used only server-side for the OAuth flow and are not persisted in Tulip session records.

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
