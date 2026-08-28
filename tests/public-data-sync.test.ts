import assert from "node:assert/strict";
import test from "node:test";
import {
  loadOfficialDataSyncConfig,
  runOfficialDataSync,
  type OfficialDataSyncDependencies
} from "../apps/api/src/sync/official-data-sync.ts";

test("official data sync config requires database, API URLs, and server-only data.go.kr key", () => {
  assert.deepEqual(loadOfficialDataSyncConfig({
    DATABASE_URL: " postgres://tulip:test@localhost:5432/tulip ",
    DATA_GO_KR_API_KEY: " secret-key ",
    TULIP_REGION_API_URL: " https://region.example/api ",
    TULIP_WASTE_API_URL: " https://waste.example/api ",
    TULIP_WASTE_MAX_REJECTED_RATIO: "0.15"
  }), {
    databaseUrl: "postgres://tulip:test@localhost:5432/tulip",
    serviceKey: "secret-key",
    regionApiUrl: "https://region.example/api",
    wasteApiUrl: "https://waste.example/api",
    wasteMaxRejectedRatio: 0.15
  });

  assert.throws(() => loadOfficialDataSyncConfig({
    DATABASE_URL: "postgres://localhost/tulip",
    TULIP_REGION_API_URL: "https://region.example/api",
    TULIP_WASTE_API_URL: "https://waste.example/api"
  }), /DATA_GO_KR_API_KEY/);

  assert.throws(() => loadOfficialDataSyncConfig({
    DATABASE_URL: "postgres://localhost/tulip",
    DATA_GO_KR_API_KEY: "secret-key",
    TULIP_REGION_API_URL: "https://region.example/api",
    TULIP_WASTE_API_URL: "https://waste.example/api",
    TULIP_WASTE_MAX_REJECTED_RATIO: "1.5"
  }), /TULIP_WASTE_MAX_REJECTED_RATIO/);
});

test("official data sync refreshes regions before waste and always closes persistence", async () => {
  const events: string[] = [];
  const dependencies: OfficialDataSyncDependencies = {
    async syncRegions() {
      events.push("regions");
      return { fetched: 10, accepted: 9, rejected: 1 };
    },
    async syncWaste() {
      events.push("waste");
      return {
        fetched: 4,
        expanded: 7,
        published: true,
        publishedCount: 6,
        malformed: 0,
        unresolved: 1,
        reasons: { unresolved_region: 1 }
      };
    },
    async close() {
      events.push("close");
    }
  };

  const result = await runOfficialDataSync(dependencies);
  assert.deepEqual(events, ["regions", "waste", "close"]);
  assert.equal(result.regions.accepted, 9);
  assert.equal(result.waste.publishedCount, 6);
});

test("official data sync treats rejected waste publication as a failed run and still closes", async () => {
  const events: string[] = [];
  const dependencies: OfficialDataSyncDependencies = {
    async syncRegions() {
      events.push("regions");
      return { fetched: 3, accepted: 3, rejected: 0 };
    },
    async syncWaste() {
      events.push("waste");
      return {
        fetched: 10,
        expanded: 12,
        published: false,
        publishedCount: 0,
        malformed: 2,
        unresolved: 3,
        reasons: { malformed_source_row: 2, unresolved_region: 3 }
      };
    },
    async close() {
      events.push("close");
    }
  };

  await assert.rejects(() => runOfficialDataSync(dependencies), /waste snapshot publication was rejected/);
  assert.deepEqual(events, ["regions", "waste", "close"]);
});
