import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SCRIPT_PATH = "scripts/server/refresh-official-data.sh";

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

test("server-local official-data refresh owns secrets and serializes execution", async () => {
  const script = await readOptional(SCRIPT_PATH);

  assert.match(script, /^#!\/usr\/bin\/env bash/m);
  assert.match(script, /set -Eeuo pipefail/);
  assert.match(script, /\.runtime\/locks/);
  assert.match(script, /chmod 700/);
  assert.match(script, /flock -n/);
  assert.match(script, /\/etc\/tulip-home-os\/tulip\.env/);
  assert.match(script, /DATABASE_URL/);
  assert.match(script, /DATA_GO_KR_API_KEY/);
  assert.match(script, /TULIP_REGION_API_URL/);
  assert.match(script, /TULIP_WASTE_API_URL/);
  assert.match(script, /npm run sync:official-data/);
});

test("daily refresh stays isolated from deploy and migration operations", async () => {
  const script = await readOptional(SCRIPT_PATH);

  assert.doesNotMatch(script, /git (?:pull|fetch)/);
  assert.doesNotMatch(script, /pnpm install/);
  assert.doesNotMatch(script, /pnpm verify/);
  assert.doesNotMatch(script, /pm2\b/);
  assert.doesNotMatch(script, /psql\b/);
  assert.doesNotMatch(script, /004_waste_data_sync\.sql/);
});
