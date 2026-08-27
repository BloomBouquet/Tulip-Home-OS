# Team Tulip Bouquet SSO + Web Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Connect Tulip to Bouquet OAuth2 Authorization Code + PKCE and replace the preview-only web flow with authenticated Home onboarding and Today API consumption.

**Architecture:** Keep OAuth transport and Tulip session handling behind framework-independent services so secrets and token exchange remain server-side. The web app uses server route handlers for login/callback/session and a typed API client for Home/Today data; no Bouquet access token is exposed to browser JavaScript.

**Tech Stack:** TypeScript, Web Crypto/Web Fetch primitives, Next.js App Router contracts, existing Tulip API/domain services.

**Spec:** `docs/superpowers/specs/2026-08-27-team-tulip-personal-home-os-design.md`

## Global Constraints

- OAuth flow is Authorization Code + PKCE S256.
- Authorization endpoint, token endpoint, userinfo endpoint, client ID, redirect URI, and post-login URL come from environment configuration.
- No client secret is required in the browser; any configured confidential secret remains server-only.
- OAuth `state` and PKCE verifier are short-lived, one-time values; callback state is also bound to an HttpOnly browser cookie.
- Browser session is opaque and HttpOnly; Bouquet access tokens are never stored in localStorage/sessionStorage.
- Tulip keeps Bouquet `userId` as the canonical external identity.
- Home onboarding collects only `name`, `regionCode`, `sido`, `sigungu`, `eupmyeondong`.
- Existing PR #1 is not modified; this branch is stacked on `team-tulip/http-api-onboarding`.

---

### Task 1: OAuth configuration, PKCE, and transient state

**Files:**
- Create: `apps/api/src/auth/bouquet-oauth.ts`
- Create: `tests/bouquet-oauth.test.ts`

**Interfaces:**
- Produces `BouquetOAuthConfig`, `createPkcePair()`, `buildAuthorizationUrl()`, `TransientAuthStore`.

- [x] Write tests for S256 challenge, required configuration, authorization URL, state one-time consumption, expiration.
- [x] Run tests and confirm RED.
- [x] Implement the minimum OAuth primitives.
- [x] Run tests and confirm GREEN.
- [x] Commit `feat: add bouquet oauth pkce primitives`.

### Task 2: Bouquet code exchange + userinfo adapter

**Files:**
- Modify: `apps/api/src/auth/bouquet-oauth.ts`
- Create: `tests/bouquet-oauth-client.test.ts`

**Interfaces:**
- Produces `BouquetOAuthClient.exchangeCode()` and `fetchIdentity()`.

- [x] Test form-encoded token request, non-2xx rejection, malformed token response rejection, userinfo identity mapping.
- [x] Confirm RED.
- [x] Implement using injected `fetch`.
- [x] Confirm GREEN.
- [x] Commit `feat: add bouquet oauth client`.

### Task 3: Opaque Tulip session service

**Files:**
- Create: `apps/api/src/auth/tulip-session.ts`
- Create: `tests/tulip-session.test.ts`

**Interfaces:**
- Produces `TulipSessionStore`, `createSession()`, `resolveSession()`, `revokeSession()`.

- [x] Test opaque token generation, expiry, revoke, and identity-only persisted session data.
- [x] Confirm RED.
- [x] Implement in-memory adapter boundary and cookie helpers.
- [x] Confirm GREEN.
- [x] Commit `feat: add opaque tulip sessions`.

### Task 4: Framework-independent SSO controller

**Files:**
- Create: `apps/api/src/auth/bouquet-sso-controller.ts`
- Create: `tests/bouquet-sso-controller.test.ts`
- Modify: `apps/api/src/index.ts`

**Interfaces:**
- Produces login redirect, callback validation, session creation, logout response.

- [x] Test login redirect/state storage, callback state mismatch, successful callback, replay rejection, logout.
- [x] Confirm RED.
- [x] Implement controller.
- [x] Confirm GREEN.
- [x] Commit `feat: add bouquet sso controller`.

### Task 5: Web API client + onboarding state model

**Files:**
- Create: `apps/web/src/lib/tulip-api-client.ts`
- Create: `apps/web/src/lib/home-onboarding-model.ts`
- Create: `tests/home-onboarding-model.test.ts`

**Interfaces:**
- Produces typed calls for `/v1/me`, `/v1/homes/current`, `/v1/homes`, `/v1/today` and pure onboarding validation/model helpers.

- [x] Test onboarding validation and payload normalization.
- [x] Confirm RED.
- [x] Implement model and typed client.
- [x] Confirm GREEN + offline web typecheck.
- [x] Commit `feat: add web onboarding api client`.

### Task 6: Next.js login/callback/onboarding pages and server adapters

**Files:**
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/auth/callback/page.tsx`
- Create: `apps/web/src/app/onboarding/home/page.tsx`
- Create: `apps/web/src/server/tulip-runtime.ts`
- Create: `apps/web/src/server/web-route-handlers.ts`
- Create: `apps/web/src/app/api/auth/**/route.ts`
- Create: `apps/web/src/app/api/tulip/[...path]/route.ts`
- Create: `apps/web/src/app/api/onboarding/home/route.ts`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/today/page.tsx`

**Interfaces:**
- Login routes to server SSO entry path.
- Callback page resolves server session and redirects to onboarding or Today.
- Onboarding submits administrative-area-only Home payload.
- Today consumes typed Tulip API client rather than preview data.

- [x] Add compile-time/offline tests where possible for routing/view model contracts.
- [x] Implement minimal pages without exposing Bouquet tokens.
- [x] Run web offline typecheck.
- [x] Commit `feat: connect web sso and home onboarding`.

### Task 7: Governance and verification

**Files:**
- Modify: `README.md`
- Modify: `docs/IMPLEMENTATION_STATUS.md`

- [x] Verify no OAuth access/refresh token is exposed to client storage or rendered output.
- [x] Run `npm run verify:core`.
- [x] Run `npm run typecheck:web:offline`.
- [x] Run `git diff --check`.
- [x] Commit `docs: record bouquet sso milestone`.
