import test from "node:test";
import assert from "node:assert/strict";
import type { Home } from "../packages/contracts/src/index.ts";
import {
  InMemoryHomeItemRepository,
  InMemoryHomeRepository
} from "../apps/api/src/persistence/in-memory-repositories.ts";

async function loadService() {
  return import("../apps/api/src/items/item-service.ts");
}

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

async function setup() {
  const homes = new InMemoryHomeRepository();
  const items = new InMemoryHomeItemRepository();
  await homes.save(home);
  const { HomeItemService } = await loadService();
  const service = new HomeItemService({
    homes,
    items,
    now: () => new Date("2026-08-27T00:00:00.000Z"),
    createId: () => "item-created"
  });
  return { service, items };
}

test("owner can create and list an item with derived next action", async () => {
  const { service } = await setup();
  const created = await service.create("user-1", {
    homeId: home.id,
    name: "정수기 필터",
    category: "FILTER",
    purchasedAt: "2026-08-27T09:00:00.000Z",
    replacementIntervalDays: 90,
    note: "주방"
  });

  assert.equal(created.id, "item-created");
  assert.equal(created.nextActionAt, "2026-11-25T09:00:00.000Z");
  assert.deepEqual(await service.list("user-1", home.id), [created]);
});

test("earliest configured interval drives next action", async () => {
  const { service } = await setup();
  const created = await service.create("user-1", {
    homeId: home.id,
    name: "공기청정기",
    category: "APPLIANCE",
    purchasedAt: "2026-08-27T09:00:00.000Z",
    replacementIntervalDays: 180,
    inspectionIntervalDays: 30
  });

  assert.equal(created.nextActionAt, "2026-09-26T09:00:00.000Z");
});

test("owner can update and delete an item", async () => {
  const { service, items } = await setup();
  await service.create("user-1", {
    homeId: home.id,
    name: "건전지",
    category: "BATTERY",
    nextActionAt: "2026-09-01T09:00:00.000Z"
  });

  const updated = await service.update("user-1", "item-created", {
    name: "리모컨 건전지",
    note: "AAA 2개"
  });
  assert.equal(updated.name, "리모컨 건전지");
  assert.equal(updated.note, "AAA 2개");

  await service.delete("user-1", "item-created");
  assert.equal(await items.findById("item-created"), null);
});

test("cross-user item operations are hidden as not found", async () => {
  const { service } = await setup();
  await service.create("user-1", {
    homeId: home.id,
    name: "전구",
    category: "CONSUMABLE"
  });

  await assert.rejects(() => service.list("user-2", home.id), /Resource not found/);
  await assert.rejects(() => service.update("user-2", "item-created", { name: "침입" }), /Resource not found/);
  await assert.rejects(() => service.delete("user-2", "item-created"), /Resource not found/);
});

test("item intervals must be positive integers", async () => {
  const { service } = await setup();
  await assert.rejects(
    () => service.create("user-1", {
      homeId: home.id,
      name: "필터",
      category: "FILTER",
      replacementIntervalDays: 0
    }),
    /positive integer/
  );
});

test("owner can get an item by id while cross-user access stays hidden", async () => {
  const { service } = await setup();
  const created = await service.create("user-1", {
    homeId: home.id,
    name: "가습기 필터",
    category: "FILTER"
  });

  assert.deepEqual(await service.get("user-1", created.id), created);
  await assert.rejects(() => service.get("user-2", created.id), /Resource not found/);
});
