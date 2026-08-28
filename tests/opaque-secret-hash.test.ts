import assert from "node:assert/strict";
import test from "node:test";
import { hashOpaqueSecret } from "../apps/api/src/auth/opaque-secret-hash.ts";

test("hashOpaqueSecret returns deterministic lowercase SHA-256 hex", async () => {
  const first = await hashOpaqueSecret("abc");
  const second = await hashOpaqueSecret("abc");

  assert.equal(first, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(second, first);
  assert.match(first, /^[0-9a-f]{64}$/);
});

test("hashOpaqueSecret rejects blank opaque values", async () => {
  await assert.rejects(() => hashOpaqueSecret("   "), /opaque secret is required/);
});
