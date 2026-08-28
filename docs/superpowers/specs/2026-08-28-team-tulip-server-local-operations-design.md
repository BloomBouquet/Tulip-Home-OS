# Team Tulip Server-Local Operations Design

Date: 2026-08-28
Status: Approved in chat; repository review pending

## 1. Goal

Move Tulip's official public-data refresh away from direct PostgreSQL access from GitHub-hosted runners. GitHub Actions will only trigger an SSH command on the Tulip application server. The application server will hold the production database URL and data.go.kr API key and will execute the existing `npm run sync:official-data` command locally.

This milestone also establishes a minimal, auditable production runtime for the Next.js application with PM2 and a liveness health endpoint.

## 2. Security boundary

Production PostgreSQL must not be exposed to GitHub-hosted runners or the public Internet for this workflow.

Server-only values:

- `DATABASE_URL`
- `DATA_GO_KR_API_KEY`
- `TULIP_REGION_API_URL`
- `TULIP_WASTE_API_URL`
- `TULIP_WASTE_MAX_REJECTED_RATIO`
- Bouquet production OAuth secrets/configuration

These values live in a server-owned environment file outside the repository, defaulting to `/etc/tulip-home-os/tulip.env`, readable only by the Tulip service account. They are never copied into GitHub Actions secrets as part of this design.

GitHub Actions may contain only SSH trigger material:

- Variable `TULIP_SSH_HOST`
- Variable `TULIP_SSH_PORT`
- Variable `TULIP_SSH_USER`
- Secret `TULIP_SSH_PRIVATE_KEY`
- Secret `TULIP_SSH_KNOWN_HOSTS`
- Variable `TULIP_PUBLIC_DATA_SYNC_ENABLED`

`TULIP_SSH_KNOWN_HOSTS` pins the server host key. The workflow must not trust a fresh `ssh-keyscan` result at execution time.

The SSH key should be dedicated to Tulip automation and restricted on the server to the minimum account/command permissions required for Tulip operations.

## 3. Runtime layout

Default documented layout:

```text
/srv/tulip-home-os/                 # git checkout / application files
/etc/tulip-home-os/tulip.env        # server-only environment, chmod 600
/var/lock/tulip-home-os/            # sync lock files
```

The paths are configurable through server-local environment variables where useful, but the public repository must not hard-code an infrastructure hostname, IP address, database credential, or API key.

Only the Next.js web process is required as a long-running application process. `apps/api` is consumed by the web server runtime and is not deployed as a second public daemon in this milestone.

## 4. Official-data refresh flow

### 4.1 GitHub Actions

`.github/workflows/refresh-official-data.yml` retains:

- `workflow_dispatch` for an operator-triggered refresh
- daily schedule at 03:10 Asia/Seoul (`10 18 * * *` UTC)
- scheduled execution gated by `TULIP_PUBLIC_DATA_SYNC_ENABLED == 'true'`
- `contents: read` permissions
- concurrency protection

The workflow no longer installs Node dependencies and no longer receives `DATABASE_URL`, `DATA_GO_KR_API_KEY`, or public-data source URLs.

Instead it:

1. creates `~/.ssh`;
2. writes the dedicated private key with mode `0600`;
3. writes the pinned known-hosts content;
4. validates host/port/user variables are non-empty;
5. opens one non-interactive SSH session;
6. executes the server-local refresh script in `/srv/tulip-home-os`.

SSH uses `BatchMode=yes`, `StrictHostKeyChecking=yes`, and a bounded connection timeout. Failure of SSH or the remote command fails the workflow.

### 4.2 Server-local refresh script

Add `scripts/server/refresh-official-data.sh`.

The script:

1. enables strict shell behavior (`set -Eeuo pipefail`);
2. acquires a non-blocking `flock` lock so two refreshes cannot overlap;
3. changes to the deployed repository directory;
4. loads `/etc/tulip-home-os/tulip.env` without printing secret values;
5. validates required server-only variables are present;
6. runs `npm run sync:official-data`;
7. propagates the command's exit status.

The script does not run `git pull`, install dependencies, build the application, restart PM2, or apply database migrations. Daily data refresh must be isolated from application deployment and schema changes.

The existing sync runner remains responsible for:

- refreshing regions before waste schedules;
- rejecting empty upstream snapshots;
- rejecting a waste publication above the configured unresolved/malformed threshold;
- preserving the previous active snapshot on publication failure.

## 5. Application deployment baseline

Add `deploy/ecosystem.config.cjs` and `scripts/server/deploy.sh`.

### 5.1 PM2 configuration

PM2 runs the Next.js application from the repository root using the existing `@tulip/web` start command. The service binds to loopback only, defaulting to `127.0.0.1:3100`, so a reverse proxy remains the public ingress.

Baseline process policy:

- one named process: `tulip-home-os`
- automatic restart on crash
- production environment
- timestamps in PM2 logs
- no database or OAuth secrets embedded in the committed PM2 file

The process inherits server-side environment variables from `deploy.sh`.

### 5.2 Deployment script

`scripts/server/deploy.sh` is an explicit operator deployment entry point. It:

1. acquires a deployment lock;
2. loads the server environment file;
3. validates Node/pnpm/PM2 are available;
4. fetches the configured remote branch (`main` by default) and checks out the exact remote commit;
5. runs `pnpm install --frozen-lockfile`;
6. runs `pnpm verify` before restart;
7. runs `pm2 startOrReload deploy/ecosystem.config.cjs --update-env`;
8. waits briefly and checks the local liveness endpoint;
9. restores/keeps the previous running process if the new health check does not become healthy, where PM2 can do so without destructive cleanup;
10. prints the deployed commit SHA, not secrets.

Database migrations are intentionally not executed by `deploy.sh` in this milestone. Schema changes remain an explicit operator step before deploying a version that requires them.

## 6. Health endpoint

Add an unauthenticated `GET /api/health` route to the Next.js application.

Response contract:

```json
{
  "ok": true,
  "service": "tulip-home-os"
}
```

The endpoint is a liveness check only. It does not expose environment values, database metadata, OAuth configuration, build paths, or user/session information. It intentionally does not query PostgreSQL; database readiness is validated by migration/sync/application tests rather than a public liveness route.

## 7. Migration and first production sync rollout

Migration execution and data refresh remain separate operations.

For a new database, apply migrations in numeric order. For an existing database already at `003`, apply only `004_waste_data_sync.sql` after confirming it has not already been applied.

Required rollout order:

1. provision PostgreSQL on localhost/private networking;
2. create `/etc/tulip-home-os/tulip.env` with restrictive permissions;
3. clone/deploy Tulip to `/srv/tulip-home-os`;
4. explicitly apply the required migration(s) with `psql -v ON_ERROR_STOP=1`;
5. deploy/start the Next.js application through PM2;
6. verify `http://127.0.0.1:3100/api/health`;
7. configure GitHub SSH trigger variables/secrets;
8. manually dispatch `Refresh official data` once;
9. verify region/waste rows were published and Today can consume them;
10. only then set `TULIP_PUBLIC_DATA_SYNC_ENABLED=true` for scheduled refreshes.

The daily refresh workflow never applies migrations.

## 8. Failure behavior

- Missing GitHub SSH configuration: fail before opening SSH.
- SSH authentication/host-key mismatch: fail the workflow.
- Existing server-local refresh lock: fail rather than overlap.
- Missing server env file or required variable: fail without running sync.
- Public-data fetch/quality failure: existing sync runner returns failure and previous active snapshot remains intact.
- Application deploy verification failure: deployment script returns non-zero and does not report success.
- Health endpoint failure after PM2 restart: deployment script returns non-zero.

No failure path should print the database URL, API key, OAuth secret, or SSH private key.

## 9. Testing strategy

Use TDD for each production change.

Contract tests will verify:

- refresh workflow contains manual + scheduled trigger but no database/API-key secrets;
- refresh workflow uses pinned known-hosts data and strict non-interactive SSH;
- workflow calls only the server-local refresh entry point;
- server refresh script uses strict mode, `flock`, external env file, and existing sync CLI;
- server refresh script does not run migration/deployment commands;
- PM2 configuration binds Next.js to loopback and contains no committed secrets;
- deploy script verifies before restart and performs a local `/api/health` check;
- health route returns the stable minimal response;
- README verification count matches the current 138 core behavior tests before new tests are added, and is updated again to the final count at completion.

CI must remain green for:

- core TypeScript/type behavior tests;
- PostgreSQL 17 integration;
- offline web typecheck;
- full workspace verification;
- Next.js production build.

## 10. Documentation updates

README will be updated to:

- correct the stale `136` core-test count before recording the final new count;
- document server-local production env ownership;
- document explicit migration order;
- document PM2/local health check commands;
- document GitHub SSH trigger variables/secrets;
- state that PostgreSQL 5432 must not be opened merely for GitHub-hosted Actions;
- document manual-first, scheduled-second public-data rollout.

## 11. Non-goals

This milestone does not:

- provision a VPS or DNS record;
- expose PostgreSQL publicly;
- introduce Docker/Kubernetes;
- introduce a self-hosted GitHub runner;
- add a general migration framework;
- change Bouquet OAuth semantics;
- add a separate public API daemon;
- add monitoring/alerting infrastructure beyond GitHub Actions failure state and PM2/local health checks;
- hard-code the user's infrastructure hostname, port, or credentials into the public repository.
