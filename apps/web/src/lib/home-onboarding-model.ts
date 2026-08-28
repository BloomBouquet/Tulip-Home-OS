export interface HomeOnboardingInput {
  name: string;
  regionCode: string;
  sido: string;
  sigungu: string;
  eupmyeondong: string;
}

export type RegionSelectionLevel = "SIDO" | "SIGUNGU" | "EUPMYEONDONG";

export interface RegionSelectionOption {
  regionCode: string;
  name: string;
  level: RegionSelectionLevel;
  sido: string;
  sigungu?: string;
  eupmyeondong?: string;
}

export interface RegionSelectionState {
  sido?: RegionSelectionOption;
  sigungu?: RegionSelectionOption;
  locality?: RegionSelectionOption;
}

function required(value: string, field: keyof HomeOnboardingInput): string {
  const normalized = value.trim();
  if (!normalized) throw new RangeError(`${field} is required`);
  return normalized;
}

function canonicalOption(option: RegionSelectionOption, level: RegionSelectionLevel): RegionSelectionOption {
  if (option.level !== level) throw new RangeError(`region option must be ${level}`);
  if (!/^\d{10}$/.test(option.regionCode)) throw new RangeError("regionCode must contain exactly 10 digits");
  if (!option.name.trim() || !option.sido.trim()) throw new RangeError("region option names are required");
  return option;
}

export function normalizeHomeOnboardingInput(input: HomeOnboardingInput): HomeOnboardingInput {
  return {
    name: required(input.name, "name"),
    regionCode: required(input.regionCode, "regionCode"),
    sido: required(input.sido, "sido"),
    sigungu: required(input.sigungu, "sigungu"),
    eupmyeondong: required(input.eupmyeondong, "eupmyeondong")
  };
}

export function selectSido(
  _state: RegionSelectionState,
  option: RegionSelectionOption
): RegionSelectionState {
  const selected = canonicalOption(option, "SIDO");
  return { sido: selected };
}

export function selectSigungu(
  state: RegionSelectionState,
  option: RegionSelectionOption
): RegionSelectionState {
  if (!state.sido) throw new RangeError("sido selection is required before sigungu");
  const selected = canonicalOption(option, "SIGUNGU");
  if (!selected.sigungu?.trim() || selected.sido !== state.sido.sido) {
    throw new RangeError("sigungu selection does not match selected sido");
  }
  return { sido: state.sido, sigungu: selected };
}

export function selectLocality(
  state: RegionSelectionState,
  option: RegionSelectionOption
): RegionSelectionState {
  if (!state.sido || !state.sigungu) {
    throw new RangeError("sido and sigungu selections are required before locality");
  }
  const selected = canonicalOption(option, "EUPMYEONDONG");
  if (
    !selected.eupmyeondong?.trim() ||
    selected.sido !== state.sido.sido ||
    selected.sigungu !== state.sigungu.sigungu
  ) {
    throw new RangeError("locality selection does not match selected hierarchy");
  }
  return { sido: state.sido, sigungu: state.sigungu, locality: selected };
}

export function buildHomeOnboardingInput(
  name: string,
  state: RegionSelectionState
): HomeOnboardingInput {
  if (!state.sido) throw new RangeError("sido selection is required");
  if (!state.sigungu?.sigungu) throw new RangeError("sigungu selection is required");
  if (!state.locality?.eupmyeondong) throw new RangeError("locality selection is required");

  return normalizeHomeOnboardingInput({
    name,
    regionCode: state.locality.regionCode,
    sido: state.sido.sido,
    sigungu: state.sigungu.sigungu,
    eupmyeondong: state.locality.eupmyeondong
  });
}

export function postLoginDestination(home: { id: string } | null): "/onboarding/home" | "/today" {
  return home ? "/today" : "/onboarding/home";
}
