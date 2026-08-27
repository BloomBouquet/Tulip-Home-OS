import type { BouquetIdentity } from "./bouquet-auth-adapter.ts";
import {
  buildAuthorizationUrl,
  createPkcePair,
  type BouquetOAuthConfig,
  type BouquetTokenResult,
  type TransientAuthStore
} from "./bouquet-oauth.ts";
import {
  buildSessionClearCookie,
  buildSessionCookie,
  TULIP_SESSION_COOKIE,
  type TulipSessionStore
} from "./tulip-session.ts";

export const TULIP_OAUTH_STATE_COOKIE = "tulip_oauth_state";

export interface BouquetOAuthOperations {
  exchangeCode(code: string, codeVerifier: string): Promise<BouquetTokenResult>;
  fetchIdentity(accessToken: string): Promise<BouquetIdentity>;
}

export interface SsoControllerResponse {
  status: number;
  headers: Record<string, string>;
  cookies?: string[];
  body?: unknown;
}

export interface BouquetSsoControllerDependencies {
  config: BouquetOAuthConfig;
  oauth: BouquetOAuthOperations;
  transient: TransientAuthStore;
  sessions: TulipSessionStore;
  createState?: () => string;
  createPkce?: () => Promise<{ verifier: string; challenge: string }>;
}

function localReturnTo(value: string | undefined, fallback: string): string {
  const normalized = value?.trim() || fallback;
  if (!normalized.startsWith("/") || normalized.startsWith("//") || normalized.includes("\\") || /[\r\n]/.test(normalized)) {
    throw new RangeError("returnTo must be a local path");
  }
  return normalized;
}

function cookieValue(cookieHeader: string | undefined, cookieName: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== cookieName) continue;
    const value = rawValue.join("=");
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

function cookieSecure(config: BouquetOAuthConfig): boolean {
  return new URL(config.redirectUri).protocol === "https:";
}

function buildOauthStateCookie(state: string, secure: boolean): string {
  return `${TULIP_OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; Path=/api/auth/bouquet; HttpOnly${secure ? "; Secure" : ""}; SameSite=Lax; Max-Age=300`;
}

function buildOauthStateClearCookie(secure: boolean): string {
  return `${TULIP_OAUTH_STATE_COOKIE}=; Path=/api/auth/bouquet; HttpOnly${secure ? "; Secure" : ""}; SameSite=Lax; Max-Age=0`;
}

export class BouquetSsoController {
  private readonly dependencies: Required<Pick<BouquetSsoControllerDependencies, "config" | "oauth" | "transient" | "sessions">>
    & Pick<BouquetSsoControllerDependencies, "createState" | "createPkce">;

  constructor(dependencies: BouquetSsoControllerDependencies) {
    this.dependencies = dependencies;
  }

  async start(returnTo?: string): Promise<SsoControllerResponse> {
    const state = (this.dependencies.createState ?? (() => crypto.randomUUID()))().trim();
    if (!state) throw new RangeError("OAuth state generator returned an empty value");
    const pkce = await (this.dependencies.createPkce ?? (() => createPkcePair()))();
    const target = localReturnTo(returnTo, this.dependencies.config.postLoginUrl);
    this.dependencies.transient.save(state, { codeVerifier: pkce.verifier, returnTo: target });
    const secure = cookieSecure(this.dependencies.config);

    return {
      status: 302,
      headers: {
        Location: buildAuthorizationUrl(this.dependencies.config, {
          state,
          codeChallenge: pkce.challenge
        })
      },
      cookies: [buildOauthStateCookie(state, secure)]
    };
  }

  async callback(input: { code?: string; state?: string; cookieHeader?: string }): Promise<SsoControllerResponse> {
    const code = input.code?.trim();
    const state = input.state?.trim();
    const secure = cookieSecure(this.dependencies.config);
    if (!code || !state) {
      return { status: 400, headers: {}, cookies: [buildOauthStateClearCookie(secure)], body: { error: "INVALID_OAUTH_CALLBACK" } };
    }

    const browserState = cookieValue(input.cookieHeader, TULIP_OAUTH_STATE_COOKIE);
    if (!browserState || browserState !== state) {
      return { status: 400, headers: {}, cookies: [buildOauthStateClearCookie(secure)], body: { error: "INVALID_OAUTH_STATE" } };
    }

    const transient = this.dependencies.transient.consume(state);
    if (!transient) {
      return { status: 400, headers: {}, cookies: [buildOauthStateClearCookie(secure)], body: { error: "INVALID_OAUTH_STATE" } };
    }

    const token = await this.dependencies.oauth.exchangeCode(code, transient.codeVerifier);
    const identity = await this.dependencies.oauth.fetchIdentity(token.accessToken);
    const sessionToken = this.dependencies.sessions.create(identity);

    return {
      status: 302,
      headers: {
        Location: localReturnTo(transient.returnTo, this.dependencies.config.postLoginUrl)
      },
      cookies: [
        buildSessionCookie(sessionToken, { secure }),
        buildOauthStateClearCookie(secure)
      ]
    };
  }

  async logout(cookieHeader?: string): Promise<SsoControllerResponse> {
    const sessionToken = cookieValue(cookieHeader, TULIP_SESSION_COOKIE);
    if (sessionToken) this.dependencies.sessions.revoke(sessionToken);
    const secure = cookieSecure(this.dependencies.config);
    return {
      status: 204,
      headers: {},
      cookies: [buildSessionClearCookie({ secure })]
    };
  }
}
