import assert from "node:assert/strict";
import test from "node:test";
import { createTulipWebRuntime } from "../apps/web/src/server/tulip-runtime.ts";

const env = {
  BOUQUET_AUTHORIZATION_URL: "https://auth.example/authorize",
  BOUQUET_TOKEN_URL: "https://auth.example/token",
  BOUQUET_USERINFO_URL: "https://auth.example/userinfo",
  BOUQUET_CLIENT_ID: "tulip",
  BOUQUET_REDIRECT_URI: "https://tulip.example/api/auth/bouquet/callback",
  TULIP_POST_LOGIN_URL: "/api/auth/post-login"
};

test("runtime converts Bouquet callback into an HttpOnly session accepted by Tulip API", async () => {
  const runtime = createTulipWebRuntime(env, async (url) => {
    if (String(url) === env.BOUQUET_TOKEN_URL) {
      return new Response(JSON.stringify({ access_token: "bouquet-access" }), { status: 200 });
    }
    if (String(url) === env.BOUQUET_USERINFO_URL) {
      return new Response(JSON.stringify({ sub: "bouquet-user-1", name: "Tulip User" }), { status: 200 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  const started = await runtime.sso.start("/api/auth/post-login");
  const state = new URL(started.headers.Location).searchParams.get("state")!;
  const oauthCookie = started.cookies?.[0];
  const callback = await runtime.sso.callback({ code: "code-1", state, cookieHeader: oauthCookie });
  const cookie = callback.cookies?.find((value) => value.startsWith("tulip_session="));

  const me = await runtime.handleApi({ method: "GET", path: "/v1/me" }, cookie);
  assert.equal(me.status, 200);
  assert.deepEqual(me.body, { userId: "bouquet-user-1", displayName: "Tulip User" });
  assert.equal(JSON.stringify(me).includes("bouquet-access"), false);
});

test("runtime rejects Tulip API requests without the opaque session cookie", async () => {
  const runtime = createTulipWebRuntime(env, async () => new Response("{}", { status: 500 }));
  const response = await runtime.handleApi({ method: "GET", path: "/v1/me" });
  assert.equal(response.status, 401);
});
