import assert from "node:assert/strict";
import test from "node:test";
import {
  BouquetSsoController,
  type BouquetOAuthOperations
} from "../apps/api/src/auth/bouquet-sso-controller.ts";
import {
  InMemoryTransientAuthStore,
  type BouquetOAuthConfig
} from "../apps/api/src/auth/bouquet-oauth.ts";
import { InMemoryTulipSessionStore } from "../apps/api/src/auth/tulip-session.ts";

const config: BouquetOAuthConfig = {
  authorizationUrl: "https://auth.example/authorize",
  tokenUrl: "https://auth.example/token",
  userinfoUrl: "https://auth.example/userinfo",
  clientId: "tulip",
  redirectUri: "https://tulip.example/auth/callback",
  postLoginUrl: "/today"
};

function oauth(overrides: Partial<BouquetOAuthOperations> = {}): BouquetOAuthOperations {
  return {
    exchangeCode: async () => ({ accessToken: "access-token" }),
    fetchIdentity: async () => ({ userId: "bouquet-user", displayName: "Tulip User" }),
    ...overrides
  };
}

test("start stores PKCE verifier and returns Bouquet authorization redirect", async () => {
  const transient = new InMemoryTransientAuthStore();
  const controller = new BouquetSsoController({
    config,
    oauth: oauth(),
    transient,
    sessions: new InMemoryTulipSessionStore({ createToken: () => "session-1" }),
    createState: () => "state-1",
    createPkce: async () => ({ verifier: "v".repeat(43), challenge: "challenge-1" })
  });

  const response = await controller.start("/onboarding/home");
  assert.equal(response.status, 302);
  const location = new URL(response.headers.Location);
  assert.equal(location.searchParams.get("state"), "state-1");
  assert.equal(location.searchParams.get("code_challenge"), "challenge-1");
  assert.match(response.cookies?.[0] ?? "", /^tulip_oauth_state=state-1;/);
  assert.deepEqual(transient.consume("state-1"), { codeVerifier: "v".repeat(43), returnTo: "/onboarding/home" });
});

test("callback rejects missing or replayed state before exchanging code", async () => {
  let exchanges = 0;
  const controller = new BouquetSsoController({
    config,
    oauth: oauth({ exchangeCode: async () => { exchanges += 1; return { accessToken: "token" }; } }),
    transient: new InMemoryTransientAuthStore(),
    sessions: new InMemoryTulipSessionStore(),
    createState: () => "state",
    createPkce: async () => ({ verifier: "v".repeat(43), challenge: "challenge" })
  });

  const response = await controller.callback({ code: "code", state: "unknown", cookieHeader: "tulip_oauth_state=unknown" });
  assert.equal(response.status, 400);
  assert.equal(exchanges, 0);
});

test("callback exchanges code, creates session cookie, and prevents state replay", async () => {
  const transient = new InMemoryTransientAuthStore();
  transient.save("state-1", { codeVerifier: "verifier-1", returnTo: "/today" });
  let exchangeInput: string[] = [];
  const sessions = new InMemoryTulipSessionStore({ createToken: () => "opaque-session" });
  const controller = new BouquetSsoController({
    config,
    oauth: oauth({ exchangeCode: async (code, verifier) => { exchangeInput = [code, verifier]; return { accessToken: "access-secret" }; } }),
    transient,
    sessions,
    createState: () => "state",
    createPkce: async () => ({ verifier: "v".repeat(43), challenge: "challenge" })
  });

  const noBrowserBinding = await controller.callback({ code: "code-1", state: "state-1" });
  assert.equal(noBrowserBinding.status, 400);
  transient.save("state-1", { codeVerifier: "verifier-1", returnTo: "/today" });

  const response = await controller.callback({ code: "code-1", state: "state-1", cookieHeader: "tulip_oauth_state=state-1" });
  assert.equal(response.status, 302);
  assert.equal(response.headers.Location, "/today");
  assert.match(response.cookies?.find((cookie) => cookie.startsWith("tulip_session=")) ?? "", /^tulip_session=opaque-session;/);
  assert.deepEqual(exchangeInput, ["code-1", "verifier-1"]);
  assert.deepEqual(sessions.resolve("opaque-session"), { userId: "bouquet-user", displayName: "Tulip User" });
  assert.equal(JSON.stringify(response.cookies).includes("access-secret"), false);

  const replay = await controller.callback({ code: "code-1", state: "state-1", cookieHeader: "tulip_oauth_state=state-1" });
  assert.equal(replay.status, 400);
});

test("logout revokes cookie session and returns a clearing cookie", async () => {
  const sessions = new InMemoryTulipSessionStore({ createToken: () => "opaque-session" });
  sessions.create({ userId: "bouquet-user" });
  const controller = new BouquetSsoController({
    config,
    oauth: oauth(),
    transient: new InMemoryTransientAuthStore(),
    sessions,
    createState: () => "state",
    createPkce: async () => ({ verifier: "v".repeat(43), challenge: "challenge" })
  });

  const response = await controller.logout("other=1; tulip_session=opaque-session; theme=dark");
  assert.equal(response.status, 204);
  assert.match(response.cookies?.[0] ?? "", /Max-Age=0/);
  assert.equal(sessions.resolve("opaque-session"), null);
});
