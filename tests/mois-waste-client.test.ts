import assert from "node:assert/strict";
import test from "node:test";
import { MoisWasteApiClient } from "../apps/api/src/waste/mois-waste-client.ts";

test("household-waste API client paginates complete JSON snapshots with server-only credentials", async () => {
  const requested: URL[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    requested.push(url);
    const page = Number(url.searchParams.get("pageNo"));
    return new Response(JSON.stringify({
      response: {
        header: { resultCode: "00", resultMsg: "NORMAL SERVICE" },
        body: {
          totalCount: 2,
          pageNo: page,
          numOfRows: 1,
          items: {
            item: [{ SGG_NM: page === 1 ? "광산구" : "서구", DAT_CRTR_YMD: "20260826" }]
          }
        }
      }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const client = new MoisWasteApiClient({
    baseUrl: "https://apis.data.go.kr/1741000/household_waste_info/info",
    serviceKey: "server-secret",
    pageSize: 1,
    fetcher
  });
  const rows = await client.fetchAll();

  assert.equal(rows.length, 2);
  assert.equal(requested.length, 2);
  assert.equal(requested[0].searchParams.get("serviceKey"), "server-secret");
  assert.equal(requested[0].searchParams.get("returnType"), "json");
  assert.equal(requested[0].searchParams.get("pageNo"), "1");
  assert.equal(requested[0].searchParams.get("numOfRows"), "1");
});

test("household-waste API client rejects malformed or unsuccessful source responses", async () => {
  const client = new MoisWasteApiClient({
    baseUrl: "https://apis.data.go.kr/1741000/household_waste_info/info",
    serviceKey: "server-secret",
    fetcher: async () => new Response(JSON.stringify({ response: { header: { resultCode: "99" } } }), { status: 200 })
  });
  await assert.rejects(() => client.fetchAll(), /source response|result code/i);
});
