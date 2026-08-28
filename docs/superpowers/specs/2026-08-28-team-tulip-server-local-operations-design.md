# Team Tulip Server-Local Operations Design

Date: 2026-08-28
Status: Implemented on feature branch; final-head verification pending

## Goal

Move official public-data refresh away from direct PostgreSQL access from GitHub-hosted runners. GitHub Actions only triggers a command over SSH; the Tulip application server owns the production database/API credentials and executes the existing sync runner locally.

This milestone also establishes a minimal PM2 runtime, an unauthenticated liveness route, and a rollback-capable operator deployment script.

## Security boundary

Production PostgreSQL must remain on localhost/private networking and must not be exposed merely for GitHub-hosted Actions.

Server-only values live in `/etc/tulip-home-os/tulip.env` with restrictive permissions:

- `DATABASE_URL`
- `DATA_GO_KR_API_KEY`
- `TULIP_REGION_API_URL`
- `TULIP_WASTE_API_URL`
- `TULIP_WASTE_MAX_REJECTED_RATIO`
- Bouquet production OAuth configuration/secrets

GitHub Actions may contain only:

- Variable `TULIP_SSH_HOST`
- Variable `TULIP_SSH_PORT`
- Variable `TULIP_SSH_USER`
- Secret `TULIP_SSH_PRIVATE_KEY`
- Secret `TULIP_SSH_KNOWN_HOSTS`
- Variable `TULIP_PUBLIC_DATA_SYNC_ENABLED`

The workflow uses pinned known-hosts data, `BatchMode=yes`, `StrictHostKeyChecking=yes`, `IdentitiesOnly=yes`, and a bounded connection timeout. Runtime `ssh-keyscan` is not allowed.

## Runtime layout

```text
/srv/tulip-home-os/                 # deployed repository
/srv/tulip-home-os/.runtime/locks/  # service-account locks, mode 0700
/etc/tulip-home-os/tulip.env        # server-only environment, mode 0600
```

Only the Next.js web process is a long-running public application process in this milestone. `apps/api` is consumed by the web runtime.

## Official-data refresh

`.github/workflows/refresh-official-data.yml` retains `workflow_dispatch`, the daily 03:10 Asia/Seoul schedule (`10 18 * * *` UTC), the schedule-enable guard, read-only repository permissions, and concurrency protection.

It no longer receives DB/API/source credentials and does not install dependencies. It validates the SSH inputs, writes the dedicated key and pinned known-hosts content into `~/.ssh`, and invokes:

```bash
bash /srv/tulip-home-os/scripts/server/refresh-official-data.sh
```

over one strict non-interactive SSH session.

`scripts/server/refresh-official-data.sh`:

1. uses `set -Eeuo pipefail`;
2. creates `.runtime/locks` with mode `0700`;
3. acquires a non-blocking `flock`;
4. loads `/etc/tulip-home-os/tulip.env` without printing values;
5. validates `DATABASE_URL`, `DATA_GO_KR_API_KEY`, `TULIP_REGION_API_URL`, and `TULIP_WASTE_API_URL`;
6. changes to the deployed repository;
7. runs `npm run sync:official-data` and propagates failure.

Daily refresh does not fetch code, install dependencies, build, restart PM2, or apply migrations.

## PM2 runtime and deployment

`deploy/ecosystem.config.cjs` runs one process named `tulip-home-os`, defaults to `127.0.0.1:3100`, uses the existing `@tulip/web` start command, enables restart-on-crash/timestamps, and embeds no DB/API/OAuth credentials.

`scripts/server/deploy.sh` is an explicit operator action. It:

1. loads the server environment;
2. creates/acquires a non-blocking deployment lock;
3. validates Node, pnpm, PM2, Git, curl, and flock;
4. refuses deployment when tracked files are dirty;
5. records `PREVIOUS_SHA`;
6. fetches the configured branch (`main` by default), resolves `TARGET_SHA`, and checks it out detached;
7. installs dependencies;
8. runs `pnpm verify` before touching the running process;
9. reloads PM2 with `--update-env`;
10. retries `http://127.0.0.1:${TULIP_PORT:-3100}/api/health` for a bounded period;
11. on failed target verification, restores the previous checkout without reloading PM2;
12. on failed post-reload health, checks out `PREVIOUS_SHA`, restores dependencies, rebuilds, reloads PM2, performs a best-effort restored health check, and exits non-zero;
13. reports only the successfully deployed commit SHA on success.

The repository currently has no committed `pnpm-lock.yaml`. Therefore this milestone uses:

```bash
pnpm install --no-frozen-lockfile --lockfile=false
```

on the persistent server checkout so deployment does not create an untracked lockfile that could influence later installs. Introducing a committed lockfile is a separate dependency-hardening milestone.

Database migrations are intentionally excluded from `deploy.sh`.

## Health endpoint

Unauthenticated `GET /api/health` returns HTTP 200 with `Cache-Control: no-store` and exactly:

```json
{
  "ok": true,
  "service": "tulip-home-os"
}
```

It is liveness-only. It does not query PostgreSQL or expose environment, OAuth, filesystem, build, user, or session metadata.

## Migration and first production rollout

Migration execution, application deployment, and data refresh remain separate operations.

Required order:

1. provision PostgreSQL on localhost/private networking;
2. create `/etc/tulip-home-os/tulip.env` with restrictive permissions;
3. clone Tulip to `/srv/tulip-home-os`;
4. explicitly apply required migrations with `psql -v ON_ERROR_STOP=1`;
5. run `bash scripts/server/deploy.sh`;
6. verify `http://127.0.0.1:3100/api/health`;
7. configure GitHub SSH variables/secrets;
8. manually dispatch `Refresh official data` once;
9. verify region/waste publication and Today behavior;
10. only then set `TULIP_PUBLIC_DATA_SYNC_ENABLED=true`.

For a database already at `003`, apply only `004_waste_data_sync.sql` after confirming it has not already been applied. The daily refresh workflow never applies migrations.

## Failure behavior

- Missing GitHub SSH configuration: fail before SSH.
- Host-key/authentication failure: fail workflow.
- Existing refresh/deploy lock: fail rather than overlap.
- Missing server env: fail without running the operation.
- Dirty tracked worktree: refuse deployment.
- Target verification failure: restore previous checkout, leave the currently running process untouched, and exit non-zero.
- New-version health failure: rebuild/reload `PREVIOUS_SHA` and exit non-zero.
- Public-data quality/upstream failure: existing sync guarantees preserve the previous active snapshot.
- No failure path intentionally prints server secrets or the SSH private key.

## Testing

TDD contracts verify:

- manual + guarded daily workflow triggers;
- SSH-only credential boundary and pinned host verification;
- absence of DB/API credentials and migration/dependency operations from the workflow;
- refresh strict mode, lock, external env, and sync-only responsibility;
- PM2 loopback production configuration with no committed secrets;
- deploy dirty-tree guard, exact target selection, verify-before-reload, local health check, and previous-SHA rollback;
- minimal health response;
- PostgreSQL 17 integration, offline web typecheck, full workspace verification, and Next.js production build remain green.

## Non-goals

This milestone does not provision VPS/DNS/PostgreSQL, expose PostgreSQL publicly, introduce Docker/Kubernetes or a self-hosted runner, add a migration framework, change Bouquet OAuth semantics, add a second public API daemon, or hard-code real infrastructure coordinates/credentials in the repository.
