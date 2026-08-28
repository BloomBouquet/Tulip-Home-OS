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

test("official-data refresh workflow keeps credentials server-side and only runs the sync CLI", async () => {
  const workflow = await readFile(WORKFLOW_PATH, "utf8");

  assert.match(workflow, /DATABASE_URL:\s*\$\{\{ secrets\.TULIP_DATABASE_URL \}\}/);
  assert.match(workflow, /DATA_GO_KR_API_KEY:\s*\$\{\{ secrets\.DATA_GO_KR_API_KEY \}\}/);
  assert.match(workflow, /TULIP_REGION_API_URL:\s*\$\{\{ vars\.TULIP_REGION_API_URL \}\}/);
  assert.match(workflow, /TULIP_WASTE_API_URL:\s*\$\{\{ vars\.TULIP_WASTE_API_URL \}\}/);
  assert.match(workflow, /TULIP_WASTE_MAX_REJECTED_RATIO:/);
  assert.match(workflow, /npm run sync:official-data/);

  assert.doesNotMatch(workflow, /psql\b/);
  assert.doesNotMatch(workflow, /004_waste_data_sync\.sql/);
});
