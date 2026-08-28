# Tulip Home OS

Team Tulip's Personal Home OS MVP foundation, built with the Luna Agent System workflow.

## Current milestone

Implemented and verified:

- shared Home OS contracts and recurrence engine
- Bouquet OAuth2 Authorization Code + PKCE S256 server flow
- PostgreSQL-backed cross-instance authentication and Home OS persistence
- official legal-dong region catalog and authenticated chained region selector
- guarded household-waste import and PostgreSQL-backed Today waste schedules
- server-only official-data sync CLI
- SSH-triggered server-local official-data refresh
- PM2 production baseline bound to loopback
- rollback-capable deployment script with `/api/health` liveness verification
- PostgreSQL 17 integration verification and Next.js production build in GitHub Actions

## Verification

```bash
corepack enable
pnpm install --no-frozen-lockfile
npm run verify:core
npm run typecheck:web:offline
pnpm verify
```

Current feature-head verification includes **143 core behavior tests**, one PostgreSQL 17 end-to-end integration test, offline web typechecking, and the Next.js production build.

For the PostgreSQL integration test, provide a dedicated test database:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/tulip_test npm run test:postgres
```

## PostgreSQL setup

Production runtime defaults to PostgreSQL persistence. Keep PostgreSQL on localhost/private networking; do not expose port 5432 merely so GitHub-hosted Actions can reach it.

Apply migrations explicitly before deploying the application version that requires them:

```bash
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f apps/api/db/migrations/001_initial.sql
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f apps/api/db/migrations/002_unique_home_owner.sql
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f apps/api/db/migrations/003_persistent_auth_state.sql
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f apps/api/db/migrations/004_waste_data_sync.sql
```

Do not rewrite an already-applied migration. Add the next numbered migration for future schema changes.

## Production server layout

Default layout:

```text
/srv/tulip-home-os/                  # deployed repository
/etc/tulip-home-os/tulip.env         # server-only env, chmod 600
/srv/tulip-home-os/.runtime/locks/    # process locks, chmod 700
```

`/etc/tulip-home-os/tulip.env` owns production-only values such as:

```text
DATABASE_URL=postgresql://...
DATA_GO_KR_API_KEY=...
TULIP_REGION_API_URL=https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList
TULIP_WASTE_API_URL=https://apis.data.go.kr/1741000/household_waste_info/info
TULIP_WASTE_MAX_REJECTED_RATIO=0.2
BOUQUET_AUTHORIZATION_URL=https://.../authorize
BOUQUET_TOKEN_URL=https://.../token
BOUQUET_USERINFO_URL=https://.../userinfo
BOUQUET_CLIENT_ID=...
BOUQUET_REDIRECT_URI=https://<tulip-host>/api/auth/bouquet/callback
TULIP_POST_LOGIN_URL=/api/auth/post-login
# optional
BOUQUET_CLIENT_SECRET=...
```

Never put the database URL, data.go.kr key, or Bouquet secret into the public repository or public browser environment variables.

## Deploy with PM2

The committed PM2 config runs one `tulip-home-os` Next.js process on `127.0.0.1:3100` by default. A reverse proxy should be the public ingress.

The repository currently has no committed `pnpm-lock.yaml`. The deploy script therefore installs with `--no-frozen-lockfile --lockfile=false`; introducing a committed lockfile is a separate dependency-hardening change.

Run an explicit deployment on the server with:

```bash
bash scripts/server/deploy.sh
curl -fsS http://127.0.0.1:3100/api/health
```

The deploy script rejects tracked working-tree changes, fetches the configured branch (`main` by default), verifies the target before PM2 reload, and rolls back to the previous commit if the new process fails its local liveness check. It does **not** apply database migrations.

The liveness endpoint returns only:

```json
{"ok":true,"service":"tulip-home-os"}
```

It intentionally does not query PostgreSQL or expose environment/runtime metadata.

## Official public-data refresh

The daily refresh executes on the application server, not on the GitHub-hosted runner. The server-local command is:

```bash
bash scripts/server/refresh-official-data.sh
```

That script serializes execution with `flock`, loads `/etc/tulip-home-os/tulip.env`, validates the required data/DB variables, and calls the existing `npm run sync:official-data`. It does not fetch application code, install dependencies, build, restart PM2, or apply migrations.

GitHub Actions contains only the SSH trigger boundary:

```text
Variable: TULIP_SSH_HOST
Variable: TULIP_SSH_PORT
Variable: TULIP_SSH_USER
Secret:   TULIP_SSH_PRIVATE_KEY
Secret:   TULIP_SSH_KNOWN_HOSTS
Variable: TULIP_PUBLIC_DATA_SYNC_ENABLED
```

`TULIP_SSH_KNOWN_HOSTS` must contain a trusted, pinned host key. The workflow uses strict host-key verification and never calls `ssh-keyscan` at execution time.

Recommended rollout order:

1. provision PostgreSQL on localhost/private networking;
2. create `/etc/tulip-home-os/tulip.env` with restrictive permissions;
3. clone Tulip into `/srv/tulip-home-os`;
4. explicitly apply the required migrations;
5. run `bash scripts/server/deploy.sh`;
6. verify `curl -fsS http://127.0.0.1:3100/api/health`;
7. configure the GitHub SSH variables/secrets;
8. manually dispatch `Refresh official data` once;
9. verify region/waste rows and Today behavior;
10. set `TULIP_PUBLIC_DATA_SYNC_ENABLED=true` only after the manual refresh succeeds.

The sync runner refreshes regions before waste schedules. Empty upstream snapshots and waste snapshots exceeding the rejected-row threshold fail without replacing the previously active data.

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
