import test from "node:test";
import assert from "node:assert/strict";

async function loadNormalizer() {
  try {
    return await import("../apps/api/src/waste/waste-normalizer.ts");
  } catch (error) {
    assert.fail(`waste normalizer unavailable: ${String(error)}`);
  }
}

test("normalizes Korean weekday text and recycling category", async () => {
  const { normalizeWasteRow } = await loadNormalizer();
  const result = normalizeWasteRow({
    regionCode: "29200",
    wasteType: "재활용품",
    weekdays: "월, 목",
    startTime: "20:00",
    endTime: "24:00",
    sourceUpdatedAt: "2026-08-20T00:00:00.000Z"
  });

  assert.equal(result.regionCode, "29200");
  assert.equal(result.wasteType, "RECYCLING");
  assert.deepEqual(result.weekdays, [1, 4]);
  assert.equal(result.startTime, "20:00");
});

test("maps unknown waste categories to OTHER", async () => {
  const { normalizeWasteRow } = await loadNormalizer();
  const result = normalizeWasteRow({
    regionCode: "29200",
    wasteType: "특수품목",
    weekdays: "수",
    sourceUpdatedAt: "2026-08-20T00:00:00.000Z"
  });

  assert.equal(result.wasteType, "OTHER");
});

test("rejects missing region code", async () => {
  const { normalizeWasteRow, WasteNormalizationError } = await loadNormalizer();
  assert.throws(
    () => normalizeWasteRow({
      regionCode: "",
      wasteType: "일반쓰레기",
      weekdays: "화",
      sourceUpdatedAt: "2026-08-20T00:00:00.000Z"
    }),
    WasteNormalizationError
  );
});

test("rejects weekday input that cannot be parsed", async () => {
  const { normalizeWasteRow, WasteNormalizationError } = await loadNormalizer();
  assert.throws(
    () => normalizeWasteRow({
      regionCode: "29200",
      wasteType: "음식물",
      weekdays: "매달 둘째날",
      sourceUpdatedAt: "2026-08-20T00:00:00.000Z"
    }),
    WasteNormalizationError
  );
});

test("keeps optional text fields absent when source values are empty", async () => {
  const { normalizeWasteRow } = await loadNormalizer();
  const result = normalizeWasteRow({
    regionCode: "29200",
    wasteType: "일반",
    weekdays: "일",
    startTime: "",
    endTime: "",
    placeDescription: "",
    methodDescription: "",
    sourceUpdatedAt: "2026-08-20T00:00:00.000Z"
  });

  assert.equal(result.startTime, undefined);
  assert.equal(result.endTime, undefined);
  assert.equal(result.placeDescription, undefined);
  assert.equal(result.methodDescription, undefined);
});
