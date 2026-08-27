# Tulip Home OS

Team Tulip's Personal Home OS MVP foundation, built with the Luna Agent System workflow.

## Current milestone

Implemented and verified without external runtime dependencies:

- shared Home OS contracts
- recurrence engine and scheduling validation
- waste schedule normalization boundary
- Bouquet authentication adapter boundary
- Home ownership authorization guard
- PostgreSQL-ready schema contract
- in-memory persistence repositories
- Routine / HomeItem CRUD services
- TaskOccurrence completion / undo / history
- repository-backed Today aggregation
- home-isolated occurrence IDs
- Next.js Today screen scaffold

## Verification

The sandbox cannot reach the npm registry, so package installation and the full Next.js build cannot be run here. Core behavior and offline TypeScript checks are available:

```bash
npm run verify:core
npm run typecheck:web:offline
```

Current verified result: 46 core tests passing, 0 failing.

When normal network access is available:

```bash
corepack enable
pnpm install
pnpm verify
pnpm --filter @tulip/web dev
```

## Product constraints

- Asia/Seoul scheduling
- no GPS in MVP
- no exact home address or apartment unit
- no OCR/payment/ads/public profile
- Bouquet is the canonical account identity
- all Home-scoped access is checked server-side
