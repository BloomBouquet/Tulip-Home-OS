export default function AuthCallbackPage() {
  return (
    <section className="authPage">
      <span className="eyebrow">AUTH CALLBACK</span>
      <h1>로그인 연결을 확인하고 있어요.</h1>
      <p>정상 로그인은 서버 callback에서 바로 다음 화면으로 이동합니다. 이 화면에 머물렀다면 다시 로그인해 주세요.</p>
      <a className="primaryButton" href="/login">로그인 다시 시작</a>
    </section>
  );
}
