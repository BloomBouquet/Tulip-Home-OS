import assert from "node:assert/strict";
import test from "node:test";
import { hashOpaqueSecret } from "../apps/api/src/auth/opaque-secret-hash.ts";
import {
  PostgresTransientAuthStore,
  PostgresTulipSessionStore
} from "../apps/api/src/auth/postgres-auth-stores.ts";
import type {
  SqlExecutor,
  SqlQueryResult
} from "../apps/api/src/persistence/postgres-repositories.ts";

class RecordingSqlExecutor implements SqlExecutor {
  readonly calls: Array<{ text: string; params: readonly unknown[] }> = [];
  private readonly queuedResults: SqlQueryResult<Record<string, unknown>>[] = [];

  queue(rows: Record<string, unknown>[]): void {
    this.queuedResults.push({ rows });
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params: readonly unknown[] = []
  ): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    return (this.queuedResults.shift() ?? { rows: [] }) as SqlQueryResult<Row>;
  }
}

test("PostgresTransientAuthStore hashes state and atomically consumes it once", async () => {
  const sql = new RecordingSqlExecutor();
  const now = new Date("2026-08-28T00:00:00.000Z");
  const store = new PostgresTransientAuthStore(sql, { now: () => now, ttlMs: 300_000 });
  const rawState = "raw-oauth-state";
  const expectedHash = await hashOpaqueSecret(rawState);

  await store.save(rawState, { codeVerifier: "pkce-verifier", returnTo: "/today" });

  const insert = sql.calls.find((call) => /INSERT INTO oauth_transient_states/i.test(call.text));
  assert.ok(insert);
  assert.equal(insert.params[0], expectedHash);
  assert.equal(insert.params.includes(rawState), false);
  assert.equal(sql.calls.some((call) => call.text.includes(rawState)), false);
  assert.deepEqual(insert.params.slice(1, 3), ["pkce-verifier", "/today"]);
  assert.equal(insert.params[3], "2026-08-28T00:05:00.000Z");

  sql.queue([{ code_verifier: "pkce-verifier", return_to: "/today" }]);
  const consumed = await store.consume(rawState);
  assert.deepEqual(consumed, { codeVerifier: "pkce-verifier", returnTo: "/today" });

  const consume = sql.calls.at(-1)!;
  assert.match(consume.text, /DELETE FROM oauth_transient_states/i);
  assert.match(consume.text, /RETURNING/i);
  assert.match(consume.text, /expires_at > NOW\(\)/i);
  assert.deepEqual(consume.params, [expectedHash]);
});

test("PostgresTulipSessionStore stores only token hash after provisioning Bouquet user", async () => {
  const sql = new RecordingSqlExecutor();
  const now = new Date("2026-08-28T00:00:00.000Z");
  const rawToken = "opaque-session-token";
  const expectedHash = await hashOpaqueSecret(rawToken);
  const store = new PostgresTulipSessionStore(sql, {
    now: () => now,
    ttlMs: 7 * 24 * 60 * 60 * 1000,
    createToken: () => rawToken
  });

  const returned = await store.create({ userId: "bouquet-user", displayName: "Tulip User" });
  assert.equal(returned, rawToken);

  const userIndex = sql.calls.findIndex((call) => /INSERT INTO users/i.test(call.text));
  const sessionIndex = sql.calls.findIndex((call) => /INSERT INTO tulip_sessions/i.test(call.text));
  assert.ok(userIndex >= 0);
  assert.ok(sessionIndex > userIndex);
  assert.deepEqual(sql.calls[userIndex].params, ["bouquet-user", "bouquet-user"]);

  const sessionInsert = sql.calls[sessionIndex];
  assert.equal(sessionInsert.params[0], expectedHash);
  assert.equal(sessionInsert.params.includes(rawToken), false);
  assert.equal(sql.calls.some((call) => call.text.includes(rawToken)), false);
  assert.deepEqual(sessionInsert.params.slice(1, 3), ["bouquet-user", "Tulip User"]);
  assert.equal(sessionInsert.params[3], "2026-09-04T00:00:00.000Z");
});

test("PostgresTulipSessionStore resolves valid identities and revokes by token hash", async () => {
  const sql = new RecordingSqlExecutor();
  const rawToken = "resolve-session-token";
  const expectedHash = await hashOpaqueSecret(rawToken);
  const store = new PostgresTulipSessionStore(sql);

  sql.queue([{ user_id: "bouquet-user", display_name: "Tulip User" }]);
  assert.deepEqual(await store.resolve(rawToken), { userId: "bouquet-user", displayName: "Tulip User" });

  const resolve = sql.calls.at(-1)!;
  assert.match(resolve.text, /FROM tulip_sessions/i);
  assert.match(resolve.text, /expires_at > NOW\(\)/i);
  assert.deepEqual(resolve.params, [expectedHash]);

  await store.revoke(rawToken);
  const revoke = sql.calls.at(-1)!;
  assert.match(revoke.text, /DELETE FROM tulip_sessions/i);
  assert.deepEqual(revoke.params, [expectedHash]);
});
