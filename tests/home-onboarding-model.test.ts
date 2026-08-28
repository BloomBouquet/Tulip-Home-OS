import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHomeOnboardingInput,
  normalizeHomeOnboardingInput,
  postLoginDestination,
  selectLocality,
  selectSigungu,
  selectSido,
  type RegionSelectionOption
} from "../apps/web/src/lib/home-onboarding-model.ts";

const sido: RegionSelectionOption = {
  regionCode: "2900000000",
  name: "광주광역시",
  level: "SIDO",
  sido: "광주광역시"
};
const sigungu: RegionSelectionOption = {
  regionCode: "2920000000",
  name: "광산구",
  level: "SIGUNGU",
  sido: "광주광역시",
  sigungu: "광산구"
};
const locality: RegionSelectionOption = {
  regionCode: "2920011400",
  name: "수완동",
  level: "EUPMYEONDONG",
  sido: "광주광역시",
  sigungu: "광산구",
  eupmyeondong: "수완동"
};

test("normalizeHomeOnboardingInput trims administrative-area-only Home payload", () => {
  assert.deepEqual(normalizeHomeOnboardingInput({
    name: "  우리 집  ",
    regionCode: " 2920012300 ",
    sido: " 광주광역시 ",
    sigungu: " 광산구 ",
    eupmyeondong: " 수완동 "
  }), {
    name: "우리 집",
    regionCode: "2920012300",
    sido: "광주광역시",
    sigungu: "광산구",
    eupmyeondong: "수완동"
  });
});

test("normalizeHomeOnboardingInput rejects missing administrative region fields", () => {
  assert.throws(() => normalizeHomeOnboardingInput({
    name: "집",
    regionCode: "",
    sido: "광주광역시",
    sigungu: "광산구",
    eupmyeondong: "수완동"
  }), /regionCode/);
});

test("postLoginDestination sends first-time users to Home onboarding", () => {
  assert.equal(postLoginDestination(null), "/onboarding/home");
  assert.equal(postLoginDestination({ id: "home-1" }), "/today");
});

test("changing an upper region selection clears all downstream selections", () => {
  const selectedSido = selectSido({ sido, sigungu, locality }, sido);
  assert.deepEqual(selectedSido, { sido });

  const selectedSigungu = selectSigungu({ sido, sigungu, locality }, sigungu);
  assert.deepEqual(selectedSigungu, { sido, sigungu });

  assert.deepEqual(selectLocality({ sido, sigungu }, locality), { sido, sigungu, locality });
});

test("Home payload uses the canonical locality code and display hierarchy from selected options", () => {
  const selection = selectLocality(selectSigungu(selectSido({}, sido), sigungu), locality);
  assert.deepEqual(buildHomeOnboardingInput("  우리 집  ", selection), {
    name: "우리 집",
    regionCode: "2920011400",
    sido: "광주광역시",
    sigungu: "광산구",
    eupmyeondong: "수완동"
  });
  assert.throws(() => buildHomeOnboardingInput("우리 집", { sido, sigungu }), /locality/i);
});
