export type BouquetIdentity = {
  userId: string;
  displayName?: string;
};

export interface BouquetAuthAdapter {
  verify(token: string): Promise<BouquetIdentity>;
}

export class BouquetAuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BouquetAuthenticationError";
  }
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export class LocalBouquetAuthAdapter implements BouquetAuthAdapter {
  async verify(token: string): Promise<BouquetIdentity> {
    const normalized = token.trim();
    if (!normalized) {
      throw new BouquetAuthenticationError("Bouquet token is required");
    }

    return {
      userId: `local_${stableHash(normalized)}`,
      displayName: "Tulip Local User"
    };
  }
}

export function createLocalBouquetAuthAdapter(): BouquetAuthAdapter {
  return new LocalBouquetAuthAdapter();
}
