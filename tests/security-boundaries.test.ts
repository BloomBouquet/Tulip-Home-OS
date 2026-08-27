import test from "node:test";
import assert from "node:assert/strict";
import type { Home } from "../packages/contracts/src/index.ts";

async function loadAuth() {
  try {
    return await import("../apps/api/src/auth/bouquet-auth-adapter.ts");
  } catch (error) {
    assert.fail(`auth adapter unavailable: ${String(error)}`);
  }
}

async function loadHomeService() {
  try {
    return await import("../apps/api/src/home/home-service.ts");
  } catch (error) {
    assert.fail(`home service unavailable: ${String(error)}`);
  }
}

test("local Bouquet adapter rejects an empty token", async () => {
  const { LocalBouquetAuthAdapter } = await loadAuth();
  const adapter = new LocalBouquetAuthAdapter();
  await assert.rejects(() => adapter.verify(""), /Bouquet token is required/);
});

test("local Bouquet adapter maps the same token to the same user id", async () => {
  const { LocalBouquetAuthAdapter } = await loadAuth();
  const adapter = new LocalBouquetAuthAdapter();
  const first = await adapter.verify("sample-token");
  const second = await adapter.verify("sample-token");
  assert.equal(first.userId, second.userId);
  assert.match(first.userId, /^local_/);
});

test("home owner is allowed", async () => {
  const { assertHomeOwner } = await loadHomeService();
  const home: Home = {
    id: "home-1",
    ownerId: "user-1",
    name: "우리 집",
    regionCode: "2920011400",
    sido: "광주광역시",
    sigungu: "광산구",
    eupmyeondong: "수완동",
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z"
  };
  assert.doesNotThrow(() => assertHomeOwner(home, "user-1"));
});

test("non-owner access is hidden behind NotFoundError", async () => {
  const { assertHomeOwner, NotFoundError } = await loadHomeService();
  const home: Home = {
    id: "home-1",
    ownerId: "user-1",
    name: "우리 집",
    regionCode: "2920011400",
    sido: "광주광역시",
    sigungu: "광산구",
    eupmyeondong: "수완동",
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z"
  };
  assert.throws(() => assertHomeOwner(home, "user-2"), NotFoundError);
});
