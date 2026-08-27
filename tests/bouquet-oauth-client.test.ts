import assert from "node:assert/strict";
import test from "node:test";
import { BouquetOAuthClient, type BouquetOAuthConfig } from "../apps/api/src/auth/bouquet-oauth.ts";

const config: BouquetOAuthConfig = {
  authorizationUrl: "https://auth.example/authorize",
  tokenUrl: "https://auth.example/token",
  userinfoUrl: "https://auth.example/userinfo",
  clientId: "tulip",
  redirectUri: "https://tulip.example/auth/callback",
  postLoginUrl: "/today"
};

test("exchangeCode sends authorization code and PKCE verifier as form data", async () => {
  let captured: { url?: string; init?: RequestInit } = {};
  const client = new BouquetOAuthClient(config, async (url, init) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify({ access_token: "access-1", token_type: "Bearer" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });

  const token = await client.exchangeCode("code-1", "verifier-1");
  assert.equal(token.accessToken, "access-1");
  assert.equal(captured.url, config.tokenUrl);
  assert.equal(captured.init?.method, "POST");
  const body = new URLSearchParams(String(captured.init?.body));
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("client_id"), "tulip");
  assert.equal(body.get("redirect_uri"), config.redirectUri);
  assert.equal(body.get("code"), "code-1");
  assert.equal(body.get("code_verifier"), "verifier-1");
});

test("exchangeCode rejects non-success and malformed token responses", async () => {
  const rejected = new BouquetOAuthClient(config, async () => new Response("denied", { status: 401 }));
  await assert.rejects(() => rejected.exchangeCode("code", "verifier"), /token exchange failed/i);

  const malformed = new BouquetOAuthClient(config, async () => new Response(JSON.stringify({ token_type: "Bearer" }), { status: 200 }));
  await assert.rejects(() => malformed.exchangeCode("code", "verifier"), /access_token/i);
});

test("fetchIdentity maps Bouquet userinfo without exposing the access token", async () => {
  let authorization = "";
  const client = new BouquetOAuthClient(config, async (_url, init) => {
    authorization = String((init?.headers as Record<string, string>)?.Authorization ?? "");
    return new Response(JSON.stringify({ sub: "bouquet-user-1", name: "Tulip User" }), { status: 200 });
  });

  const identity = await client.fetchIdentity("secret-access-token");
  assert.deepEqual(identity, { userId: "bouquet-user-1", displayName: "Tulip User" });
  assert.equal(authorization, "Bearer secret-access-token");
  assert.equal(JSON.stringify(identity).includes("secret-access-token"), false);
});

test("fetchIdentity rejects missing user identifiers", async () => {
  const client = new BouquetOAuthClient(config, async () => new Response(JSON.stringify({ name: "No ID" }), { status: 200 }));
  await assert.rejects(() => client.fetchIdentity("token"), /user id/i);
});
