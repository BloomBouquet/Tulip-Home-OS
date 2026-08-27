import assert from "node:assert/strict";
import test from "node:test";
import {
  handleHomeOnboarding,
  handlePostLogin,
  handleTulipProxyRequest,
  ssoResponseToResponse,
  type TulipApiRuntimePort
} from "../apps/web/src/server/web-route-handlers.ts";

test("ssoResponseToResponse preserves redirects and session cookies", async () => {
  const response = ssoResponseToResponse({
    status: 302,
    headers: { Location: "/today" },
    cookies: ["tulip_session=s; HttpOnly"]
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/today");
  assert.match(response.headers.get("set-cookie") ?? "", /tulip_session=s/);
});

test("Tulip proxy forwards method, v1 path, query, JSON body, and cookie", async () => {
  let captured: any;
  const runtime: TulipApiRuntimePort = {
    async handleApi(request, cookieHeader) {
      captured = { request, cookieHeader };
      return { status: 201, body: { ok: true } };
    }
  };
  const request = new Request("https://tulip.example/api/tulip/v1/homes?debug=1", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "tulip_session=session-1" },
    body: JSON.stringify({ name: "집" })
  });

  const response = await handleTulipProxyRequest(request, ["v1", "homes"], runtime);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(captured.request.path, "/v1/homes");
  assert.equal(captured.request.query.debug, "1");
  assert.deepEqual(captured.request.body, { name: "집" });
  assert.equal(captured.cookieHeader, "tulip_session=session-1");
});

test("post-login sends users without a Home to onboarding and existing users to Today", async () => {
  const missing: TulipApiRuntimePort = { handleApi: async () => ({ status: 404, body: { error: "NOT_FOUND" } }) };
  const existing: TulipApiRuntimePort = { handleApi: async () => ({ status: 200, body: { id: "home-1" } }) };
  assert.equal((await handlePostLogin("cookie", missing)).headers.get("location"), "/onboarding/home");
  assert.equal((await handlePostLogin("cookie", existing)).headers.get("location"), "/today");
});

test("Home onboarding form sends only normalized administrative-area fields", async () => {
  let body: unknown;
  const runtime: TulipApiRuntimePort = {
    async handleApi(request) {
      body = request.body;
      return { status: 201, body: { id: "home-1" } };
    }
  };
  const form = new FormData();
  form.set("name", " 우리 집 ");
  form.set("regionCode", " 2920012300 ");
  form.set("sido", " 광주광역시 ");
  form.set("sigungu", " 광산구 ");
  form.set("eupmyeondong", " 수완동 ");
  const request = new Request("https://tulip.example/api/onboarding/home", { method: "POST", body: form });

  const response = await handleHomeOnboarding(request, "tulip_session=s", runtime);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/today");
  assert.deepEqual(body, {
    name: "우리 집",
    regionCode: "2920012300",
    sido: "광주광역시",
    sigungu: "광산구",
    eupmyeondong: "수완동"
  });
});
