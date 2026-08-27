import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryHomeRepository } from "../apps/api/src/persistence/in-memory-repositories.ts";

async function loadService() {
  return import("../apps/api/src/home/home-management-service.ts");
}

function serviceWithId(id = "home-created") {
  return loadService().then(({ HomeManagementService }) => {
    const homes = new InMemoryHomeRepository();
    const service = new HomeManagementService({
      homes,
      now: () => new Date("2026-08-27T15:00:00.000Z"),
      createId: () => id
    });
    return { service, homes };
  });
}

test("user can create and retrieve one current Home", async () => {
  const { service } = await serviceWithId();
  const created = await service.create("user-1", {
    name: " 우리 집 ",
    regionCode: "2920011400",
    sido: "광주광역시",
    sigungu: "광산구",
    eupmyeondong: "수완동"
  });

  assert.equal(created.id, "home-created");
  assert.equal(created.ownerId, "user-1");
  assert.equal(created.name, "우리 집");
  assert.deepEqual(await service.getCurrent("user-1"), created);
});

test("second Home creation is rejected for the same user", async () => {
  const { service } = await serviceWithId();
  const input = {
    name: "우리 집",
    regionCode: "2920011400",
    sido: "광주광역시",
    sigungu: "광산구",
    eupmyeondong: "수완동"
  };
  await service.create("user-1", input);
  await assert.rejects(() => service.create("user-1", input), /already exists/);
});

test("Home onboarding rejects empty administrative-area fields", async () => {
  const { service } = await serviceWithId();
  await assert.rejects(
    () => service.create("user-1", {
      name: "우리 집",
      regionCode: "",
      sido: "광주광역시",
      sigungu: "광산구",
      eupmyeondong: "수완동"
    }),
    /regionCode is required/
  );
});

test("owner can update current Home region without exact address data", async () => {
  const { service } = await serviceWithId();
  await service.create("user-1", {
    name: "우리 집",
    regionCode: "2920011400",
    sido: "광주광역시",
    sigungu: "광산구",
    eupmyeondong: "수완동"
  });

  const updated = await service.updateCurrent("user-1", {
    name: "새 집",
    regionCode: "2914011900",
    sido: "광주광역시",
    sigungu: "서구",
    eupmyeondong: "동천동"
  });

  assert.equal(updated.name, "새 집");
  assert.equal(updated.eupmyeondong, "동천동");
  assert.equal("address" in updated, false);
});
