import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

test("PM2 keeps the Tulip web process on a loopback-only production baseline", async () => {
  const pm2 = await readOptional("deploy/ecosystem.config.cjs");

  assert.match(pm2, /name:\s*["']tulip-home-os["']/);
  assert.match(pm2, /127\.0\.0\.1/);
  assert.match(pm2, /3100/);
  assert.match(pm2, /@tulip\/web/);
  assert.match(pm2, /NODE_ENV:\s*["']production["']/);
  assert.doesNotMatch(pm2, /DATABASE_URL|DATA_GO_KR_API_KEY|BOUQUET_CLIENT_SECRET/);
});

test("server deploy verifies before reload and rolls back a failed health check", async () => {
  const deploy = await readOptional("scripts/server/deploy.sh");

  assert.match(deploy, /^#!\/usr\/bin\/env bash/m);
  assert.match(deploy, /set -Eeuo pipefail/);
  assert.match(deploy, /flock -n/);
  assert.match(deploy, /git status --porcelain --untracked-files=no/);
  assert.match(deploy, /PREVIOUS_SHA=/);
  assert.match(deploy, /TARGET_SHA=/);
  assert.match(deploy, /git fetch/);
  assert.match(deploy, /git checkout --detach "\$TARGET_SHA"/);
  assert.match(deploy, /pnpm install --no-frozen-lockfile/);
  assert.match(deploy, /pnpm verify/);
  assert.match(deploy, /pm2 startOrReload deploy\/ecosystem\.config\.cjs --update-env/);
  assert.match(deploy, /127\.0\.0\.1.*\/api\/health/);
  assert.match(deploy, /git checkout --detach "\$PREVIOUS_SHA"/);
  assert.match(deploy, /pnpm build/);

  assert.doesNotMatch(deploy, /pnpm install --frozen-lockfile/);
  assert.doesNotMatch(deploy, /psql\b|004_waste_data_sync\.sql/);
  assert.doesNotMatch(deploy, /git reset --hard/);
});
