import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WORKFLOW_PATH = ".github/workflows/refresh-official-data.yml";

test("official-data refresh workflow supports manual and guarded daily runs", async () => {
  const workflow = await readFile(WORKFLOW_PATH, "utf8");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /cron:\s*["']10 18 \* \* \*["']/);
  assert.match(
    workflow,
    /if:\s*github\.event_name == 'workflow_dispatch' \|\| vars\.TULIP_PUBLIC_DATA_SYNC_ENABLED == 'true'/
  );
});

test("official-data refresh workflow crosses only the pinned SSH boundary", async () => {
  const workflow = await readFile(WORKFLOW_PATH, "utf8");

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
  assert.doesNotMatch(workflow, /psql\b|004_waste_data_sync\.sql/);
});
