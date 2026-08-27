export interface BouquetOAuthConfig {
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  clientId: string;
  redirectUri: string;
  postLoginUrl: string;
  clientSecret?: string;
}

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new RangeError(`${name} is required`);
  return value;
}

function absoluteUrl(value: string, name: string): string {
  try {
    const url = new URL(value);
    const localHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const allowed = url.protocol === "https:" || (localHost && url.protocol === "http:");
    if (!allowed) throw new Error("insecure protocol");
    return url.toString();
  } catch {
    throw new RangeError(`${name} must be a valid HTTPS URL`);
  }
}

function localPath(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//") || normalized.includes("\\") || /[\r\n]/.test(normalized)) {
    throw new RangeError(`${name} must be a local path`);
  }
  return normalized;
}

export function loadBouquetOAuthConfig(env: Record<string, string | undefined>): BouquetOAuthConfig {
  const authorizationUrl = absoluteUrl(required(env, "BOUQUET_AUTHORIZATION_URL"), "BOUQUET_AUTHORIZATION_URL");
  const tokenUrl = absoluteUrl(required(env, "BOUQUET_TOKEN_URL"), "BOUQUET_TOKEN_URL");
  const userinfoUrl = absoluteUrl(required(env, "BOUQUET_USERINFO_URL"), "BOUQUET_USERINFO_URL");
  const clientId = required(env, "BOUQUET_CLIENT_ID");
  const redirectUri = absoluteUrl(required(env, "BOUQUET_REDIRECT_URI"), "BOUQUET_REDIRECT_URI");
  const postLoginUrl = localPath(required(env, "TULIP_POST_LOGIN_URL"), "TULIP_POST_LOGIN_URL");

  return {
    authorizationUrl,
    tokenUrl,
    userinfoUrl,
    clientId,
    redirectUri,
    postLoginUrl,
    ...(env.BOUQUET_CLIENT_SECRET?.trim() ? { clientSecret: env.BOUQUET_CLIENT_SECRET.trim() } : {})
  };
}

function base64Url(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const c = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const block = (a << 16) | (b << 8) | c;
    output += alphabet[(block >> 18) & 63];
    output += alphabet[(block >> 12) & 63];
    if (index + 1 < bytes.length) output += alphabet[(block >> 6) & 63];
    if (index + 2 < bytes.length) output += alphabet[block & 63];
  }
  return output.replace(/\+/g, "-").replace(/\//g, "_");
}

export async function createPkcePair(verifier?: string): Promise<{ verifier: string; challenge: string }> {
  const random = new Uint8Array(32);
  if (!verifier) crypto.getRandomValues(random);
  const actualVerifier = verifier ?? base64Url(random);
  if (actualVerifier.length < 43 || actualVerifier.length > 128) {
    throw new RangeError("PKCE verifier must be between 43 and 128 characters");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(actualVerifier));
  const challenge = base64Url(new Uint8Array(digest));
  return { verifier: actualVerifier, challenge };
}

export function buildAuthorizationUrl(
  config: BouquetOAuthConfig,
  input: { state: string; codeChallenge: string }
): string {
  const url = new URL(config.authorizationUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export interface TransientAuthRecord {
  codeVerifier: string;
  returnTo: string;
}

export interface TransientAuthStore {
  save(state: string, record: TransientAuthRecord): Promise<void>;
  consume(state: string): Promise<TransientAuthRecord | null>;
}

export class InMemoryTransientAuthStore implements TransientAuthStore {
  private readonly records = new Map<string, { record: TransientAuthRecord; expiresAt: number }>();
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(options: { now?: () => number; ttlMs?: number } = {}) {
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1000;
    if (!Number.isFinite(this.ttlMs) || this.ttlMs <= 0) throw new RangeError("ttlMs must be positive");
  }

  async save(state: string, record: TransientAuthRecord): Promise<void> {
    const normalizedState = state.trim();
    if (!normalizedState) throw new RangeError("state is required");
    this.records.set(normalizedState, {
      record: structuredClone(record),
      expiresAt: this.now() + this.ttlMs
    });
  }

  async consume(state: string): Promise<TransientAuthRecord | null> {
    const record = this.records.get(state);
    if (!record) return null;
    this.records.delete(state);
    if (record.expiresAt <= this.now()) return null;
    return structuredClone(record.record);
  }
}

import type { BouquetIdentity } from "./bouquet-auth-adapter.ts";

export interface BouquetTokenResult {
  accessToken: string;
  tokenType?: string;
}

export type BouquetFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new RangeError("Bouquet response must be valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RangeError("Bouquet response must be a JSON object");
  }
  return value as Record<string, unknown>;
}

export class BouquetOAuthClient {
  private readonly config: BouquetOAuthConfig;
  private readonly fetcher: BouquetFetch;

  constructor(config: BouquetOAuthConfig, fetcher: BouquetFetch = fetch) {
    this.config = config;
    this.fetcher = fetcher;
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<BouquetTokenResult> {
    const normalizedCode = code.trim();
    const normalizedVerifier = codeVerifier.trim();
    if (!normalizedCode) throw new RangeError("authorization code is required");
    if (!normalizedVerifier) throw new RangeError("PKCE verifier is required");

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      code: normalizedCode,
      code_verifier: normalizedVerifier
    });
    if (this.config.clientSecret) body.set("client_secret", this.config.clientSecret);

    const response = await this.fetcher(this.config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    if (!response.ok) throw new Error(`Bouquet token exchange failed (${response.status})`);

    const json = await readJsonObject(response);
    const accessToken = typeof json.access_token === "string" ? json.access_token.trim() : "";
    if (!accessToken) throw new RangeError("Bouquet token response requires access_token");
    const tokenType = typeof json.token_type === "string" && json.token_type.trim() ? json.token_type.trim() : undefined;
    return { accessToken, ...(tokenType ? { tokenType } : {}) };
  }

  async fetchIdentity(accessToken: string): Promise<BouquetIdentity> {
    const normalizedToken = accessToken.trim();
    if (!normalizedToken) throw new RangeError("access token is required");

    const response = await this.fetcher(this.config.userinfoUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${normalizedToken}`, Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Bouquet userinfo request failed (${response.status})`);

    const json = await readJsonObject(response);
    const rawUserId = typeof json.userId === "string" ? json.userId : typeof json.sub === "string" ? json.sub : "";
    const userId = rawUserId.trim();
    if (!userId) throw new RangeError("Bouquet userinfo requires a user id");

    const rawDisplayName = typeof json.displayName === "string" ? json.displayName : typeof json.name === "string" ? json.name : "";
    const displayName = rawDisplayName.trim();
    return { userId, ...(displayName ? { displayName } : {}) };
  }
}
