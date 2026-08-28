import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryTulipSessionStore,
  buildSessionCookie,
  buildSessionClearCookie
} from "../apps/api/src/auth/tulip-session.ts";

test("session store creates opaque tokens and stores identity only", async () => {
  let now = 1_000;
  const store = new InMemoryTulipSessionStore({ now: () => now, ttlMs: 1_000, createToken: () => "opaque-session-1" });
  const token = await store.create({ userId: "bouquet-1", displayName: "Tulip User" });
  assert.equal(token, "opaque-session-1");
  assert.deepEqual(await store.resolve(token), { userId: "bouquet-1", displayName: "Tulip User" });
  assert.equal(JSON.stringify(await store.resolve(token)).includes("access_token"), false);
});

test("session expires and revoke invalidates immediately", async () => {
  let now = 1_000;
  let sequence = 0;
  const store = new InMemoryTulipSessionStore({ now: () => now, ttlMs: 100, createToken: () => `session-${++sequence}` });
  const expired = await store.create({ userId: "user-1" });
  now = 1_101;
  assert.equal(await store.resolve(expired), null);

  const active = await store.create({ userId: "user-1" });
  await store.revoke(active);
  assert.equal(await store.resolve(active), null);
});

test("session cookie is HttpOnly, Secure, SameSite=Lax and clearable", () => {
  const cookie = buildSessionCookie("session-1", { maxAgeSeconds: 3600 });
  assert.match(cookie, /^tulip_session=session-1;/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=3600/);

  const cleared = buildSessionClearCookie();
  assert.match(cleared, /Max-Age=0/);
  assert.match(cleared, /HttpOnly/);
});

test("session cookie can omit Secure only for an explicitly local HTTP runtime", () => {
  const cookie = buildSessionCookie("session-local", { maxAgeSeconds: 3600, secure: false });
  assert.equal(cookie.includes("Secure"), false);
  assert.match(cookie, /HttpOnly/);
  assert.match(buildSessionClearCookie({ secure: false }), /Max-Age=0/);
  assert.equal(buildSessionClearCookie({ secure: false }).includes("Secure"), false);
});
