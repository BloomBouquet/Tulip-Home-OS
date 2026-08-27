export interface HomeOnboardingInput {
  name: string;
  regionCode: string;
  sido: string;
  sigungu: string;
  eupmyeondong: string;
}

function required(value: string, field: keyof HomeOnboardingInput): string {
  const normalized = value.trim();
  if (!normalized) throw new RangeError(`${field} is required`);
  return normalized;
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

export function postLoginDestination(home: { id: string } | null): "/onboarding/home" | "/today" {
  return home ? "/today" : "/onboarding/home";
}
