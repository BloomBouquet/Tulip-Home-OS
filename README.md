# Tulip Home OS

Team Tulip's Personal Home OS MVP foundation, built with the Luna Agent System workflow.

## Current milestone

Implemented and verified without external runtime dependencies:

- shared Home OS contracts
- recurrence engine
- waste schedule normalization boundary
- Today aggregator with partial-failure handling
- Bouquet authentication adapter boundary
- Home ownership authorization guard
- Today frontend view model
- Next.js Today screen scaffold with overdue, empty, warning, and loading states
- one-Home onboarding domain service
- authenticated framework-independent REST router
- Routine/HomeItem CRUD, Today, complete/undo, and history HTTP routes

## Verification

The sandbox cannot reach the npm registry, so the Next.js dependency installation/build cannot be run here.
Core TypeScript and behavior tests can be verified with globally available Node.js and TypeScript:

```bash
npm run typecheck:core
npm run test:core
# current result: 58 tests, 0 failures
```

When normal network access is available:

```bash
corepack enable
pnpm install
pnpm verify
pnpm --filter @tulip/web dev
```

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
