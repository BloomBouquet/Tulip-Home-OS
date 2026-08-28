# Team Tulip Server-Local Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move official-data refresh credentials and database connectivity onto the Tulip application server, add a minimal PM2 deployment baseline with rollback, and expose a safe liveness endpoint.

**Architecture:** GitHub Actions keeps the manual/daily trigger but only opens a pinned-host-key SSH session and invokes a server-local refresh script. Server scripts load `/etc/tulip-home-os/tulip.env`, serialize refresh/deploy operations with `flock`, keep migration execution explicit, and run the Next.js app through PM2 bound to loopback. `/api/health` is a DB-independent liveness endpoint used by deploy verification.

**Tech Stack:** GitHub Actions, OpenSSH, Bash, flock, Node.js 22, pnpm 10.15.0, Next.js 16, PM2, PostgreSQL 17.

**Spec:** `docs/superpowers/specs/2026-08-28-team-tulip-server-local-operations-design.md`

## Global Constraints

- Never expose PostgreSQL merely so GitHub-hosted runners can reach it.
- `DATABASE_URL`, `DATA_GO_KR_API_KEY`, public-data source URLs, and Bouquet secrets stay in `/etc/tulip-home-os/tulip.env` on the server.
- GitHub stores only SSH trigger material plus the schedule enable flag.
- SSH must use pinned `known_hosts`, `BatchMode=yes`, `StrictHostKeyChecking=yes`, and a bounded connect timeout.
- Daily refresh must not run git pull/fetch, dependency installation, builds, PM2 restart, or migrations.
- Migration execution remains an explicit operator step and is not part of refresh or deploy scripts.
- `.runtime/locks` is service-account-owned and ignored by git.
- The repository currently has no `pnpm-lock.yaml`; deployment therefore follows CI and uses `pnpm install --no-frozen-lockfile`. Do not use `--frozen-lockfile` unless a lockfile is introduced in a separate verified change.
- Public repository files must not hard-code a real infrastructure hostname, IP, SSH port, database credential, or API key.

---

### Task 1: SSH-triggered official-data refresh

**Files:**
- Modify: `.github/workflows/refresh-official-data.yml`
- Modify: `tests/official-data-refresh-workflow.test.ts`
- Create: `scripts/server/refresh-official-data.sh`
- Create: `tests/server-refresh-script.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: existing root command `npm run sync:official-data`.
- Produces: executable entry point `/srv/tulip-home-os/scripts/server/refresh-official-data.sh`; GitHub Actions contract using `TULIP_SSH_HOST`, `TULIP_SSH_PORT`, `TULIP_SSH_USER`, `TULIP_SSH_PRIVATE_KEY`, `TULIP_SSH_KNOWN_HOSTS`, and `TULIP_PUBLIC_DATA_SYNC_ENABLED`.

- [ ] **Step 1: Replace the workflow expectations with a failing SSH-boundary contract**

Update `tests/official-data-refresh-workflow.test.ts` so it still requires `workflow_dispatch`, `schedule`, `10 18 * * *`, and the schedule enable guard, but now also requires:

```ts
assert.match(workflow, /TULIP_SSH_HOST:\s*\$\{\{ vars\.TULIP_SSH_HOST \}\}/);
assert.match(workflow, /TULIP_SSH_PORT:\s*\$\{\{ vars\.TULIP_SSH_PORT \}\}/);
assert.match(workflow, /TULIP_SSH_USER:\s*\$\{\{ vars\.TULIP_SSH_USER \}\}/);
assert.match(workflow, /TULIP_SSH_PRIVATE_KEY:\s*\$\{\{ secrets\.TULIP_SSH_PRIVATE_KEY \}\}/);
assert.match(workflow, /TULIP_SSH_KNOWN_HOSTS:\s*\$\{\{ secrets\.TULIP_SSH_KNOWN_HOSTS \}\}/);
assert.match(workflow, /BatchMode=yes/);
assert.match(workflow, /StrictHostKeyChecking=yes/);
assert.match(workflow, /ConnectTimeout=10/);
assert.match(workflow, /\/srv\/tulip-home-os\/scripts\/server\/refresh-official-data\.sh/);
assert.doesNotMatch(workflow, /TULIP_DATABASE_URL|DATABASE_URL:/);
assert.doesNotMatch(workflow, /DATA_GO_KR_API_KEY/);
assert.doesNotMatch(workflow, /TULIP_REGION_API_URL|TULIP_WASTE_API_URL/);
assert.doesNotMatch(workflow, /ssh-keyscan/);
assert.doesNotMatch(workflow, /pnpm install|npm run sync:official-data/);
```

Create `tests/server-refresh-script.test.ts` and require the script to contain strict mode, `.runtime/locks`, `chmod 700`, `flock -n`, `/etc/tulip-home-os/tulip.env`, required variable validation, and `npm run sync:official-data`, while rejecting `git pull`, `git fetch`, `pnpm install`, `pnpm verify`, `pm2`, `psql`, and migration filenames.

- [ ] **Step 2: Run RED**

Run through CI via a Draft PR after committing the tests. Expected: existing suite remains green while the changed workflow contract and missing server refresh script fail.

- [ ] **Step 3: Implement the server-local refresh script**

Create `scripts/server/refresh-official-data.sh` with this behavior:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${TULIP_APP_DIR:-/srv/tulip-home-os}"
ENV_FILE="${TULIP_ENV_FILE:-/etc/tulip-home-os/tulip.env}"
LOCK_DIR="${APP_DIR}/.runtime/locks"

mkdir -p "$LOCK_DIR"
chmod 700 "${APP_DIR}/.runtime" "$LOCK_DIR"
exec 9>"${LOCK_DIR}/official-data-refresh.lock"
flock -n 9 || { echo "official-data refresh already running" >&2; exit 75; }

[[ -r "$ENV_FILE" ]] || { echo "Tulip environment file is not readable" >&2; exit 78; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

for name in DATABASE_URL DATA_GO_KR_API_KEY TULIP_REGION_API_URL TULIP_WASTE_API_URL; do
  [[ -n "${!name:-}" ]] || { echo "required Tulip server variable is missing: $name" >&2; exit 78; }
done

cd "$APP_DIR"
npm run sync:official-data
```

Add `.runtime/` to `.gitignore`.

- [ ] **Step 4: Replace the workflow with SSH-only execution**

Keep the trigger/concurrency sections. The job env contains only SSH inputs. Create `~/.ssh`, write the private key with mode `0600`, write pinned known-hosts, validate host/port/user/key/known-hosts are non-empty, then run one command equivalent to:

```bash
ssh \
  -i "$HOME/.ssh/id_tulip" \
  -p "$TULIP_SSH_PORT" \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$HOME/.ssh/known_hosts" \
  -o ConnectTimeout=10 \
  -o IdentitiesOnly=yes \
  "${TULIP_SSH_USER}@${TULIP_SSH_HOST}" \
  "/srv/tulip-home-os/scripts/server/refresh-official-data.sh"
```

- [ ] **Step 5: Run GREEN and commit**

Expected CI: core tests including both workflow/server-script contracts pass, PostgreSQL integration passes, offline web typecheck passes, and full workspace/Next build passes.

Commit message: `ci: move official data refresh to server SSH trigger`.

---

### Task 2: Minimal liveness endpoint

**Files:**
- Create: `apps/web/src/app/api/health/route.ts`
- Create: `tests/health-route.test.ts`

**Interfaces:**
- Produces: unauthenticated `GET /api/health` returning exactly `{ ok: true, service: "tulip-home-os" }` with HTTP 200 and no secret/readiness metadata.

- [ ] **Step 1: Write failing route test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../apps/web/src/app/api/health/route.ts";

test("health route exposes only stable Tulip liveness metadata", async () => {
  const response = await GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "tulip-home-os" });
  assert.equal(response.headers.get("cache-control"), "no-store");
});
```

- [ ] **Step 2: Run RED**

Expected: `ERR_MODULE_NOT_FOUND` for the missing health route while existing tests stay green.

- [ ] **Step 3: Implement minimal route**

```ts
export async function GET(): Promise<Response> {
  return Response.json(
    { ok: true, service: "tulip-home-os" },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
```

- [ ] **Step 4: Run GREEN and commit**

Commit message: `feat: add Tulip liveness endpoint`.

---

### Task 3: PM2 runtime and rollback-capable deploy script

**Files:**
- Create: `deploy/ecosystem.config.cjs`
- Create: `scripts/server/deploy.sh`
- Create: `tests/server-deploy-contract.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: PM2 process `tulip-home-os`, loopback bind default `127.0.0.1:3100`, and operator entry point `scripts/server/deploy.sh`.

- [ ] **Step 1: Write failing deployment contract test**

The test reads both files and requires:

```ts
assert.match(pm2, /name:\s*["']tulip-home-os["']/);
assert.match(pm2, /127\.0\.0\.1/);
assert.match(pm2, /3100/);
assert.match(pm2, /@tulip\/web/);
assert.doesNotMatch(pm2, /DATABASE_URL|DATA_GO_KR_API_KEY|BOUQUET_CLIENT_SECRET/);

assert.match(deploy, /set -Eeuo pipefail/);
assert.match(deploy, /flock -n/);
assert.match(deploy, /git status --porcelain --untracked-files=no/);
assert.match(deploy, /PREVIOUS_SHA=/);
assert.match(deploy, /TARGET_SHA=/);
assert.match(deploy, /pnpm install --no-frozen-lockfile/);
assert.match(deploy, /pnpm verify/);
assert.match(deploy, /pm2 startOrReload deploy\/ecosystem\.config\.cjs --update-env/);
assert.match(deploy, /127\.0\.0\.1.*\/api\/health/);
assert.match(deploy, /git checkout --detach "\$PREVIOUS_SHA"/);
assert.doesNotMatch(deploy, /psql\b|004_waste_data_sync\.sql/);
```

- [ ] **Step 2: Run RED**

Expected: missing PM2/deploy files only.

- [ ] **Step 3: Implement `deploy/ecosystem.config.cjs`**

Use `TULIP_BIND_HOST` and `TULIP_PORT` with loopback defaults and no committed secrets:

```js
const host = process.env.TULIP_BIND_HOST || "127.0.0.1";
const port = process.env.TULIP_PORT || "3100";

module.exports = {
  apps: [{
    name: "tulip-home-os",
    cwd: __dirname + "/..",
    script: "pnpm",
    args: `--filter @tulip/web start -- --hostname ${host} --port ${port}`,
    autorestart: true,
    time: true,
    env: { NODE_ENV: "production" }
  }]
};
```

- [ ] **Step 4: Implement `scripts/server/deploy.sh`**

Required control flow:

1. strict mode;
2. load `/etc/tulip-home-os/tulip.env`;
3. ensure `.runtime/locks` mode `0700` and acquire non-blocking deploy lock;
4. verify `node`, `pnpm`, `pm2`, `git`, `curl`, and `flock` exist;
5. `cd "$APP_DIR"` and reject dirty tracked files using `git status --porcelain --untracked-files=no`;
6. set `PREVIOUS_SHA="$(git rev-parse HEAD)"`;
7. `git fetch origin "$DEPLOY_BRANCH"`, resolve `TARGET_SHA="$(git rev-parse "origin/$DEPLOY_BRANCH")"`, then `git checkout --detach "$TARGET_SHA"`;
8. `pnpm install --no-frozen-lockfile` and `pnpm verify` before PM2 reload;
9. `pm2 startOrReload deploy/ecosystem.config.cjs --update-env`;
10. retry `curl -fsS "http://127.0.0.1:${TULIP_PORT:-3100}/api/health"` up to 10 times with 2-second sleeps;
11. on health failure, checkout `PREVIOUS_SHA`, restore dependencies, `pnpm build`, reload PM2, best-effort health-check restored version, then exit non-zero;
12. on success print only `deployed ${TARGET_SHA}`.

Do not print environment contents. Do not run migrations.

- [ ] **Step 5: Run GREEN and commit**

Commit message: `ops: add PM2 deployment with health rollback`.

---

### Task 4: Documentation and final verification

**Files:**
- Modify: `README.md`
- Modify: `docs/IMPLEMENTATION_STATUS.md`
- Modify: `docs/superpowers/specs/2026-08-28-team-tulip-server-local-operations-design.md`
- Modify: `docs/superpowers/plans/2026-08-28-team-tulip-server-local-operations.md`

**Interfaces:**
- Documents: migration-before-deploy ordering, server-only env ownership, PM2/local health, SSH trigger variables/secrets, manual-first schedule rollout, and private PostgreSQL requirement.

- [ ] **Step 1: Correct the planning-time lockfile discovery in the spec**

Replace `pnpm install --frozen-lockfile` with `pnpm install --no-frozen-lockfile` and state that the repository currently has no `pnpm-lock.yaml`; adding a lockfile is a separate future hardening change.

- [ ] **Step 2: Update README operations section**

Document:

```text
/srv/tulip-home-os
/etc/tulip-home-os/tulip.env  (0600)
/srv/tulip-home-os/.runtime/locks  (0700)
```

Document explicit migration commands using `psql -v ON_ERROR_STOP=1`, `scripts/server/deploy.sh`, local `curl -fsS http://127.0.0.1:3100/api/health`, and the GitHub SSH inputs. State clearly that PostgreSQL 5432 is not opened for GitHub-hosted Actions and that the first refresh is manually dispatched before enabling the daily schedule.

- [ ] **Step 3: Update implementation status and final test count**

Replace stale 136/138 counts with the exact final count from the latest CI. Record server-local refresh, SSH trigger, PM2, liveness, rollback, and private DB boundary as completed only after final CI is green.

- [ ] **Step 4: Run final verification on the exact documentation head**

Require fresh CI evidence for:

- core test suite with zero failures;
- PostgreSQL 17 integration 1/1;
- offline web typecheck;
- full workspace verification;
- Next.js production build.

- [ ] **Step 5: Review and PR readiness**

Review all changed files for secret leakage, hard-coded infrastructure, migration coupling, unsafe SSH host-key behavior, and rollback correctness. Update the PR body using the user's fixed PR format, then mark Ready only when the exact head SHA is green and no Important/Critical review finding remains.
