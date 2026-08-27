import type { BouquetIdentity } from "./bouquet-auth-adapter.ts";

export interface TulipSessionStore {
  create(identity: BouquetIdentity): Promise<string>;
  resolve(token: string): Promise<BouquetIdentity | null>;
  revoke(token: string): Promise<void>;
}

export interface TulipSessionStoreOptions {
  now?: () => number;
  ttlMs?: number;
  createToken?: () => string;
}

export class InMemoryTulipSessionStore implements TulipSessionStore {
  private readonly records = new Map<string, { identity: BouquetIdentity; expiresAt: number }>();
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly createToken: () => string;

  constructor(options: TulipSessionStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? 7 * 24 * 60 * 60 * 1000;
    this.createToken = options.createToken ?? (() => crypto.randomUUID());
    if (!Number.isFinite(this.ttlMs) || this.ttlMs <= 0) throw new RangeError("ttlMs must be positive");
  }

  async create(identity: BouquetIdentity): Promise<string> {
    if (!identity.userId.trim()) throw new RangeError("session identity requires userId");
    const token = this.createToken().trim();
    if (!token) throw new RangeError("session token generator returned an empty token");
    this.records.set(token, {
      identity: structuredClone(identity),
      expiresAt: this.now() + this.ttlMs
    });
    return token;
  }

  async resolve(token: string): Promise<BouquetIdentity | null> {
    const record = this.records.get(token);
    if (!record) return null;
    if (record.expiresAt <= this.now()) {
      this.records.delete(token);
      return null;
    }
    return structuredClone(record.identity);
  }

  async revoke(token: string): Promise<void> {
    this.records.delete(token);
  }
}

export const TULIP_SESSION_COOKIE = "tulip_session";

function safeCookieValue(value: string): string {
  if (!value.trim()) throw new RangeError("session token is required");
  return encodeURIComponent(value);
}

export function buildSessionCookie(token: string, options: { maxAgeSeconds?: number; secure?: boolean } = {}): string {
  const maxAgeSeconds = options.maxAgeSeconds ?? 7 * 24 * 60 * 60;
  const secure = options.secure ?? true;
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds <= 0) throw new RangeError("maxAgeSeconds must be positive");
  return `${TULIP_SESSION_COOKIE}=${safeCookieValue(token)}; Path=/; HttpOnly${secure ? "; Secure" : ""}; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function buildSessionClearCookie(options: { secure?: boolean } = {}): string {
  const secure = options.secure ?? true;
  return `${TULIP_SESSION_COOKIE}=; Path=/; HttpOnly${secure ? "; Secure" : ""}; SameSite=Lax; Max-Age=0`;
}
