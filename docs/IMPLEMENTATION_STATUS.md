# Team Tulip implementation status — 2026-08-28

## Completed

- Shared Home OS contracts, recurrence engine, Home/Routine/HomeItem/TaskOccurrence services
- Bouquet OAuth2 Authorization Code + PKCE S256 and opaque HttpOnly Tulip sessions
- PostgreSQL-backed cross-instance domain and authentication persistence
- Versioned PostgreSQL migrations `001 -> 002 -> 003 -> 004`
- PostgreSQL-backed official legal-dong region catalog
- Authenticated 시·도 → 시·군·구 → 읍·면·동 selector and canonical Home region validation
- Guarded household-waste API import, normalization, resolution, and snapshot publication
- Empty/low-quality upstream protection that preserves the previous active snapshot
- PostgreSQL Today waste provider using exact locality plus district scope in Asia/Seoul
- `npm run sync:official-data` server-side sync runner
- GitHub Actions official-data schedule changed to an SSH-only trigger boundary
- Server-local `scripts/server/refresh-official-data.sh` with external env ownership and non-overlapping `flock`
- PM2 production baseline for one loopback-only Next.js `tulip-home-os` process
- Unauthenticated minimal `/api/health` liveness route with `Cache-Control: no-store`
- `scripts/server/deploy.sh` with tracked-tree validation, target verification before reload, local health verification, and previous-SHA rollback
- Daily data refresh isolated from code deployment and database migrations
- PostgreSQL 17 integration verification and Next.js production build in GitHub Actions

## Current verification

Latest verified production-code head GitHub Actions gate verifies:

- Core TypeScript typecheck
- **143 core behavior tests passing, 0 failures**
- PostgreSQL 17 end-to-end integration test passing
- Migrations `001 -> 002 -> 003 -> 004` in integration order
- Cross-instance authentication/session behavior
- Official region snapshot + authenticated selector hierarchy
- Home canonical region validation
- Waste snapshot publication, stale-row handling, empty-snapshot rejection, and quality threshold
- Today district/locality waste loading
- SSH-only official-data refresh workflow contract
- Server-local refresh isolation from migration/deploy operations
- Minimal health route contract
- PM2 loopback/no-secret contract
- Deploy verify/reload/rollback contract
- Offline web TypeScript verification
- Full workspace verification
- Next.js production build

## Production operations architecture

```text
GitHub Actions
  workflow_dispatch / 03:10 KST schedule
        |
        | pinned-host-key SSH only
        v
Tulip application server
  /srv/tulip-home-os
  /etc/tulip-home-os/tulip.env (0600)
  .runtime/locks (0700)
        |
        +--> refresh-official-data.sh --> npm run sync:official-data
        |
        +--> deploy.sh --> verify --> PM2 reload --> /api/health
                                      | failure
                                      v
                                previous SHA rollback
        |
        v
PostgreSQL 17 on localhost/private networking
```

The GitHub refresh workflow does not receive `DATABASE_URL`, `DATA_GO_KR_API_KEY`, Bouquet credentials, or public-data source URLs. GitHub stores only the SSH trigger inputs and schedule-enable flag.

## Security and data-integrity properties

- PostgreSQL does not need to be exposed to GitHub-hosted runners for official-data refresh.
- SSH host verification uses pinned `known_hosts`; runtime `ssh-keyscan` is forbidden.
- GitHub SSH execution uses non-interactive strict host checking and a bounded connection timeout.
- Production DB/API/OAuth credentials remain in the server-owned environment file.
- Daily refresh cannot overlap another refresh and does not fetch code, install dependencies, build, restart PM2, or migrate the database.
- Deployment cannot overlap another deployment, rejects tracked local changes, and verifies the target commit before reload.
- Failed post-reload liveness causes an explicit checkout/build/reload of `PREVIOUS_SHA` and exits unsuccessfully.
- `/api/health` is liveness-only and exposes no DB, OAuth, filesystem, session, or environment metadata.
- Migration execution remains an explicit operator action using `psql -v ON_ERROR_STOP=1`.
- Raw OAuth state/session tokens are not persisted as lookup keys; SHA-256 hashes are used.
- Bouquet access tokens are not persisted in Tulip sessions.
- Home onboarding stores no GPS, exact address, or apartment unit.
- Public-data empty/quality failures do not replace the previous active snapshot.

## Deployment notes

Default server layout:

1. `/srv/tulip-home-os`
2. `/etc/tulip-home-os/tulip.env`
3. `/srv/tulip-home-os/.runtime/locks`

Recommended production sequence:

1. Keep PostgreSQL on localhost/private networking.
2. Create the server environment file with mode `0600`.
3. Clone the repository into `/srv/tulip-home-os`.
4. Apply required migrations explicitly in numeric order with `psql -v ON_ERROR_STOP=1`.
5. Run `bash scripts/server/deploy.sh`.
6. Verify `http://127.0.0.1:3100/api/health` locally.
7. Configure GitHub SSH host/port/user/private-key/pinned-known-hosts inputs.
8. Manually dispatch official-data refresh once.
9. Verify region/waste publication and Today behavior.
10. Enable `TULIP_PUBLIC_DATA_SYNC_ENABLED=true` only after that manual run succeeds.

The repository currently has no committed `pnpm-lock.yaml`. Server deployment therefore uses non-frozen installation without persisting an untracked lockfile; adding a committed lockfile remains a separate dependency-hardening milestone.

## Next engineering milestone

1. Provision or identify the actual Tulip production host and private PostgreSQL instance.
2. Configure server-owned production environment values and Bouquet production endpoints.
3. Apply migration `004` if the target database is currently at `003`.
4. Perform the first real PM2 deploy, local health verification, and manual official-data refresh.
5. Enable scheduled refresh only after successful production verification.
