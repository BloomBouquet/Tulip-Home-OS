import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../apps/web/src/app/api/health/route.ts";

test("health route exposes only stable Tulip liveness metadata", async () => {
  const response = await GET();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "tulip-home-os" });
  assert.equal(response.headers.get("cache-control"), "no-store");
});
