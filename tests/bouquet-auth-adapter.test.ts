import test from "node:test";
import assert from "node:assert/strict";

async function loadAdapter() {
  try {
    return await import("../apps/api/src/auth/bouquet-auth-adapter.ts");
  } catch (error) {
    assert.fail(`bouquet auth adapter unavailable: ${String(error)}`);
  }
}

test("local adapter returns a deterministic Bouquet identity", async () => {
  const { createLocalBouquetAuthAdapter } = await loadAdapter();
  const adapter = createLocalBouquetAuthAdapter();
  const first = await adapter.verify("local-token");
  const second = await adapter.verify("local-token");

  assert.equal(first.userId, second.userId);
  assert.equal(first.displayName, "Tulip Local User");
});

test("local adapter rejects an empty token", async () => {
  const { createLocalBouquetAuthAdapter, BouquetAuthenticationError } = await loadAdapter();
  const adapter = createLocalBouquetAuthAdapter();

  await assert.rejects(() => adapter.verify("   "), BouquetAuthenticationError);
});
