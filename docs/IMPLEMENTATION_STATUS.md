# Team Tulip implementation status — 2026-08-27

## Completed

- Repository baseline prepared for `main` at `BloomBouquet/Tulip-Home-OS`
- Shared contracts
- Bouquet auth adapter boundary
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
- Next.js Today UI scaffold with overdue, empty, warning, and loading states

## Verified in this environment

- `npm run verify:core`
  - TypeScript core typecheck: PASS
  - Node core behavior tests: **46 passing, 0 failing**
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
2. Add framework HTTP handlers for Routine/HomeItem CRUD, occurrence complete/undo, history, and Today.
3. Replace Today preview data in the web app with API data.
4. Add Home onboarding and administrative-area selection.
5. Add the normalized public waste-data importer job.
6. Add CI and deployment after package installation is available.
