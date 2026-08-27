# Tulip Home OS

Team Tulip's Personal Home OS MVP foundation, built with the Luna Agent System workflow.

## Current milestone

Implemented and verified without external runtime dependencies:

- shared Home OS contracts
- recurrence engine
- waste schedule normalization boundary
- Today aggregator with partial-failure handling
- Bouquet authentication adapter boundary
- Bouquet OAuth2 Authorization Code + PKCE S256 server flow
- OAuth state browser binding with one-time HttpOnly state cookie
- Opaque HttpOnly Tulip session (Bouquet access token is server-only)
- Home ownership authorization guard
- Today frontend view model
- Next.js Today screen backed by the authenticated Tulip API proxy
- Bouquet login/callback/logout server routes
- first-Home onboarding page with administrative-area-only fields
- one-Home onboarding domain service
- authenticated framework-independent REST router
- Routine/HomeItem CRUD, Today, complete/undo, and history HTTP routes

## Verification

The sandbox cannot reach the npm registry, so the Next.js dependency installation/build cannot be run here.
Core TypeScript and behavior tests can be verified with globally available Node.js and TypeScript:

```bash
npm run typecheck:core
npm run test:core
# current result: 91 tests, 0 failures
```

When normal network access is available:

```bash
corepack enable
pnpm install
pnpm verify
pnpm --filter @tulip/web dev
```

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

The current web runtime uses in-memory OAuth state, Tulip sessions, and domain repositories so the complete flow can be tested without external packages. Before multi-instance or durable deployment, replace those adapters with shared/durable stores.

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
