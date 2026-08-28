import assert from "node:assert/strict";
import test from "node:test";
import { TulipApiClient } from "../apps/web/src/lib/tulip-api-client.ts";

test("client uses same-origin credentials and maps current Home 404 to null", async () => {
  let init: RequestInit | undefined;
  const client = new TulipApiClient("https://tulip.example", async (_url, requestInit) => {
    init = requestInit;
    return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 });
  });
  assert.equal(await client.currentHome(), null);
  assert.equal(init?.credentials, "include");
});

test("createHome sends normalized JSON payload", async () => {
  let body = "";
  const client = new TulipApiClient("", async (_url, init) => {
    body = String(init?.body ?? "");
    return new Response(body, { status: 201, headers: { "content-type": "application/json" } });
  });
  const home = await client.createHome({
    name: "우리 집",
    regionCode: "2920012300",
    sido: "광주광역시",
    sigungu: "광산구",
    eupmyeondong: "수완동"
  });
  assert.equal(home.name, "우리 집");
  assert.deepEqual(JSON.parse(body), {
    name: "우리 집",
    regionCode: "2920012300",
    sido: "광주광역시",
    sigungu: "광산구",
    eupmyeondong: "수완동"
  });
});

test("region selector client follows the server hierarchy and keeps session credentials", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new TulipApiClient("/api/tulip", async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
  });

  await client.sidoRegions();
  await client.sigunguRegions("2900000000");
  await client.localityRegions("2920000000");

  assert.deepEqual(calls.map((call) => call.url), [
    "/api/tulip/v1/regions/sido",
    "/api/tulip/v1/regions/sigungu?parentCode=2900000000",
    "/api/tulip/v1/regions/localities?parentCode=2920000000"
  ]);
  assert.ok(calls.every((call) => call.init?.credentials === "include"));
});

test("default client targets the same-origin Tulip API proxy", async () => {
  let requested = "";
  const client = new TulipApiClient(undefined, async (url) => {
    requested = String(url);
    return new Response(JSON.stringify({ date: "2026-08-27", summary: { pending: 0, completed: 0 }, items: [], warnings: [] }), { status: 200 });
  });
  await client.today("2026-08-27");
  assert.equal(requested, "/api/tulip/v1/today?date=2026-08-27");
});
