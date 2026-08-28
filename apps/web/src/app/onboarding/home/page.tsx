"use client";

import { useEffect, useMemo, useState } from "react";
import {
  selectLocality,
  selectSigungu,
  selectSido,
  type RegionSelectionOption,
  type RegionSelectionState
} from "../../../lib/home-onboarding-model.ts";
import { TulipApiClient } from "../../../lib/tulip-api-client.ts";

function selectedOption(options: RegionSelectionOption[], regionCode: string): RegionSelectionOption | undefined {
  return options.find((option) => option.regionCode === regionCode);
}

export default function HomeOnboardingPage() {
  const client = useMemo(() => new TulipApiClient(), []);
  const [selection, setSelection] = useState<RegionSelectionState>({});
  const [sidoOptions, setSidoOptions] = useState<RegionSelectionOption[]>([]);
  const [sigunguOptions, setSigunguOptions] = useState<RegionSelectionOption[]>([]);
  const [localityOptions, setLocalityOptions] = useState<RegionSelectionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    client.sidoRegions()
      .then((options) => {
        if (active) setSidoOptions(options);
      })
      .catch(() => {
        if (active) setError("지역 목록을 불러오지 못했습니다. 다시 시도해 주세요.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [client]);

  async function handleSidoChange(regionCode: string) {
    const option = selectedOption(sidoOptions, regionCode);
    setSigunguOptions([]);
    setLocalityOptions([]);
    setError("");
    if (!option) {
      setSelection({});
      return;
    }

    setSelection((current) => selectSido(current, option));
    setLoading(true);
    try {
      setSigunguOptions(await client.sigunguRegions(option.regionCode));
    } catch {
      setError("시·군·구 목록을 불러오지 못했습니다. 다시 선택해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSigunguChange(regionCode: string) {
    const option = selectedOption(sigunguOptions, regionCode);
    setLocalityOptions([]);
    setError("");
    if (!option) {
      setSelection((current) => current.sido ? { sido: current.sido } : {});
      return;
    }

    const next = selectSigungu(selection, option);
    setSelection(next);
    setLoading(true);
    try {
      setLocalityOptions(await client.localityRegions(option.regionCode));
    } catch {
      setError("읍·면·동 목록을 불러오지 못했습니다. 다시 선택해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  function handleLocalityChange(regionCode: string) {
    const option = selectedOption(localityOptions, regionCode);
    setError("");
    if (!option) {
      setSelection((current) => current.sido && current.sigungu
        ? { sido: current.sido, sigungu: current.sigungu }
        : current.sido ? { sido: current.sido } : {});
      return;
    }
    setSelection((current) => selectLocality(current, option));
  }

  const ready = Boolean(selection.sido && selection.sigungu && selection.locality);

  return (
    <section className="onboardingPage">
      <header className="onboardingHeader">
        <span className="eyebrow">FIRST HOME</span>
        <h1>우리 집을 등록해 주세요.</h1>
        <p>정확한 주소나 동·호수는 받지 않아요. 쓰레기 배출 일정에 필요한 시·도, 시·군·구, 읍·면·동까지만 선택합니다.</p>
      </header>

      {error ? <div className="warning" role="alert">{error}</div> : null}

      <form className="homeForm" action="/api/onboarding/home" method="post">
        <label>
          <span>집 이름</span>
          <input name="name" required maxLength={40} placeholder="예: 우리 집" autoComplete="off" />
        </label>

        <label>
          <span>시·도</span>
          <select
            value={selection.sido?.regionCode ?? ""}
            onChange={(event) => void handleSidoChange(event.target.value)}
            disabled={loading && sidoOptions.length === 0}
            required
          >
            <option value="">시·도를 선택해 주세요</option>
            {sidoOptions.map((option) => (
              <option key={option.regionCode} value={option.regionCode}>{option.name}</option>
            ))}
          </select>
        </label>

        <label>
          <span>시·군·구</span>
          <select
            value={selection.sigungu?.regionCode ?? ""}
            onChange={(event) => void handleSigunguChange(event.target.value)}
            disabled={!selection.sido || loading}
            required
          >
            <option value="">시·군·구를 선택해 주세요</option>
            {sigunguOptions.map((option) => (
              <option key={option.regionCode} value={option.regionCode}>{option.name}</option>
            ))}
          </select>
        </label>

        <label>
          <span>읍·면·동</span>
          <select
            value={selection.locality?.regionCode ?? ""}
            onChange={(event) => handleLocalityChange(event.target.value)}
            disabled={!selection.sigungu || loading}
            required
          >
            <option value="">읍·면·동을 선택해 주세요</option>
            {localityOptions.map((option) => (
              <option key={option.regionCode} value={option.regionCode}>{option.name}</option>
            ))}
          </select>
          <small>공식 법정동 카탈로그의 지역 코드만 사용하며 GPS나 상세 주소는 저장하지 않습니다.</small>
        </label>

        <input type="hidden" name="regionCode" value={selection.locality?.regionCode ?? ""} />
        <input type="hidden" name="sido" value={selection.sido?.sido ?? ""} />
        <input type="hidden" name="sigungu" value={selection.sigungu?.sigungu ?? ""} />
        <input type="hidden" name="eupmyeondong" value={selection.locality?.eupmyeondong ?? ""} />

        <button className="primaryButton formSubmit" type="submit" disabled={!ready || loading}>
          우리 집 만들기
        </button>
      </form>
    </section>
  );
}
