export default function HomeOnboardingPage() {
  return (
    <section className="onboardingPage">
      <header className="onboardingHeader">
        <span className="eyebrow">FIRST HOME</span>
        <h1>우리 집을 등록해 주세요.</h1>
        <p>정확한 주소나 동·호수는 받지 않아요. 쓰레기 배출 일정에 필요한 행정구역까지만 등록합니다.</p>
      </header>

      <form className="homeForm" action="/api/onboarding/home" method="post">
        <label>
          <span>집 이름</span>
          <input name="name" required maxLength={40} placeholder="예: 우리 집" autoComplete="off" />
        </label>
        <label>
          <span>시·도</span>
          <input name="sido" required placeholder="예: 광주광역시" autoComplete="address-level1" />
        </label>
        <label>
          <span>시·군·구</span>
          <input name="sigungu" required placeholder="예: 광산구" autoComplete="address-level2" />
        </label>
        <label>
          <span>행정동</span>
          <input name="eupmyeondong" required placeholder="예: 수완동" autoComplete="address-level3" />
        </label>
        <label>
          <span>행정구역 코드</span>
          <input name="regionCode" required inputMode="numeric" placeholder="예: 2920012300" autoComplete="off" />
          <small>공공데이터 지역 매칭용 코드이며 정확한 집 주소는 저장하지 않습니다.</small>
        </label>
        <button className="primaryButton formSubmit" type="submit">우리 집 만들기</button>
      </form>
    </section>
  );
}
