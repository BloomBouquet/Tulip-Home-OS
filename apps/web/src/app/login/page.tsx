export default function LoginPage() {
  return (
    <section className="authPage">
      <span className="eyebrow">TULIP · BOUQUET ACCOUNT</span>
      <h1>꽃다발 계정으로 시작해요.</h1>
      <p>별도의 Tulip 비밀번호를 만들지 않고 꽃다발 로그인으로 안전하게 연결합니다.</p>
      <a className="primaryButton" href="/api/auth/bouquet/login?returnTo=%2Fapi%2Fauth%2Fpost-login">
        꽃다발로 로그인
      </a>
      <p className="securityNote">Tulip은 꽃다발 비밀번호와 OAuth access token을 브라우저 저장소에 보관하지 않습니다.</p>
    </section>
  );
}
