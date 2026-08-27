import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuthorizationUrl,
  createPkcePair,
  InMemoryTransientAuthStore,
  loadBouquetOAuthConfig
} from "../apps/api/src/auth/bouquet-oauth.ts";

test("createPkcePair builds the RFC 7636 S256 challenge", async () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const pair = await createPkcePair(verifier);
  assert.equal(pair.verifier, verifier);
  assert.equal(pair.challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("loadBouquetOAuthConfig requires every public endpoint and client value", () => {
  assert.throws(
    () => loadBouquetOAuthConfig({ BOUQUET_AUTHORIZATION_URL: "https://auth.example/authorize" }),
    /BOUQUET_TOKEN_URL/
  );
});

test("buildAuthorizationUrl includes code challenge, state, and redirect contract", () => {
  const config = loadBouquetOAuthConfig({
    BOUQUET_AUTHORIZATION_URL: "https://auth.example/authorize",
    BOUQUET_TOKEN_URL: "https://auth.example/token",
    BOUQUET_USERINFO_URL: "https://auth.example/userinfo",
    BOUQUET_CLIENT_ID: "tulip",
    BOUQUET_REDIRECT_URI: "https://tulip.example/auth/callback",
    TULIP_POST_LOGIN_URL: "/today"
  });

  const url = new URL(buildAuthorizationUrl(config, { state: "state-1", codeChallenge: "challenge-1" }));
  assert.equal(url.origin + url.pathname, "https://auth.example/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "tulip");
  assert.equal(url.searchParams.get("redirect_uri"), "https://tulip.example/auth/callback");
  assert.equal(url.searchParams.get("state"), "state-1");
  assert.equal(url.searchParams.get("code_challenge"), "challenge-1");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
});

test("transient auth state is one-time and expires", async () => {
  let now = 1_000;
  const store = new InMemoryTransientAuthStore({ now: () => now, ttlMs: 100 });
  await store.save("state-1", { codeVerifier: "verifier", returnTo: "/today" });

  assert.deepEqual(await store.consume("state-1"), { codeVerifier: "verifier", returnTo: "/today" });
  assert.equal(await store.consume("state-1"), null);

  await store.save("state-2", { codeVerifier: "other", returnTo: "/today" });
  now = 1_101;
  assert.equal(await store.consume("state-2"), null);
});

test("OAuth config rejects unsafe localhost schemes and protocol-relative post-login targets", () => {
  assert.throws(() => loadBouquetOAuthConfig({
    BOUQUET_AUTHORIZATION_URL: "ftp://localhost/authorize",
    BOUQUET_TOKEN_URL: "https://auth.example/token",
    BOUQUET_USERINFO_URL: "https://auth.example/userinfo",
    BOUQUET_CLIENT_ID: "tulip",
    BOUQUET_REDIRECT_URI: "http://localhost:3000/api/auth/bouquet/callback",
    TULIP_POST_LOGIN_URL: "/today"
  }), /HTTPS URL/);

  assert.throws(() => loadBouquetOAuthConfig({
    BOUQUET_AUTHORIZATION_URL: "https://auth.example/authorize",
    BOUQUET_TOKEN_URL: "https://auth.example/token",
    BOUQUET_USERINFO_URL: "https://auth.example/userinfo",
    BOUQUET_CLIENT_ID: "tulip",
    BOUQUET_REDIRECT_URI: "http://localhost:3000/api/auth/bouquet/callback",
    TULIP_POST_LOGIN_URL: "//evil.example"
  }), /local path/);
});
