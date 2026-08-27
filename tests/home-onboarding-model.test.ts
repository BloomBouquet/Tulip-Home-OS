import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeHomeOnboardingInput,
  postLoginDestination
} from "../apps/web/src/lib/home-onboarding-model.ts";

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
