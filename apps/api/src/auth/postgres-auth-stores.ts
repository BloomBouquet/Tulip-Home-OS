import type { BouquetIdentity } from "./bouquet-auth-adapter.ts";
import type {
  TransientAuthRecord,
  TransientAuthStore
} from "./bouquet-oauth.ts";
import { hashOpaqueSecret } from "./opaque-secret-hash.ts";
import type { TulipSessionStore } from "./tulip-session.ts";
import type { SqlExecutor } from "../persistence/postgres-repositories.ts";

interface TransientAuthRow extends Record<string, unknown> {
  code_verifier: string;
  return_to: string;
}

interface TulipSessionRow extends Record<string, unknown> {
  user_id: string;
  display_name: string | null;
}

export interface PostgresTransientAuthStoreOptions {
  now?: () => Date;
  ttlMs?: number;
}

export class PostgresTransientAuthStore implements TransientAuthStore {
  private readonly sql: SqlExecutor;
  private readonly now: () => Date;
  private readonly ttlMs: number;

  constructor(sql: SqlExecutor, options: PostgresTransientAuthStoreOptions = {}) {
    this.sql = sql;
    this.now = options.now ?? (() => new Date());
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1000;
    if (!Number.isFinite(this.ttlMs) || this.ttlMs <= 0) {
      throw new RangeError("ttlMs must be positive");
    }
  }

  async save(state: string, record: TransientAuthRecord): Promise<void> {
    const normalizedState = state.trim();
    if (!normalizedState) throw new RangeError("state is required");

    const stateHash = await hashOpaqueSecret(normalizedState);
    const expiresAt = new Date(this.now().getTime() + this.ttlMs).toISOString();

    await this.sql.query(
      `INSERT INTO oauth_transient_states (
         state_hash, code_verifier, return_to, expires_at
       ) VALUES ($1, $2, $3, $4)
       ON CONFLICT (state_hash) DO UPDATE SET
         code_verifier = EXCLUDED.code_verifier,
         return_to = EXCLUDED.return_to,
         expires_at = EXCLUDED.expires_at,
         created_at = NOW()`,
      [stateHash, record.codeVerifier, record.returnTo, expiresAt]
    );

    await this.sql.query(
      "DELETE FROM oauth_transient_states WHERE expires_at <= NOW()"
    );
  }

  async consume(state: string): Promise<TransientAuthRecord | null> {
    const normalizedState = state.trim();
    if (!normalizedState) return null;
    const stateHash = await hashOpaqueSecret(normalizedState);

    const result = await this.sql.query<TransientAuthRow>(
      `WITH deleted AS (
         DELETE FROM oauth_transient_states
         WHERE state_hash = $1
         RETURNING code_verifier, return_to, expires_at
       )
       SELECT code_verifier, return_to
       FROM deleted
       WHERE expires_at > NOW()`,
      [stateHash]
    );

    const row = result.rows[0];
    return row
      ? { codeVerifier: row.code_verifier, returnTo: row.return_to }
      : null;
  }
}

export interface PostgresTulipSessionStoreOptions {
  now?: () => Date;
  ttlMs?: number;
  createToken?: () => string;
}

export class PostgresTulipSessionStore implements TulipSessionStore {
  private readonly sql: SqlExecutor;
  private readonly now: () => Date;
  private readonly ttlMs: number;
  private readonly createToken: () => string;

  constructor(sql: SqlExecutor, options: PostgresTulipSessionStoreOptions = {}) {
    this.sql = sql;
    this.now = options.now ?? (() => new Date());
    this.ttlMs = options.ttlMs ?? 7 * 24 * 60 * 60 * 1000;
    this.createToken = options.createToken ?? (() => crypto.randomUUID());
    if (!Number.isFinite(this.ttlMs) || this.ttlMs <= 0) {
      throw new RangeError("ttlMs must be positive");
    }
  }

  async create(identity: BouquetIdentity): Promise<string> {
    const userId = identity.userId.trim();
    if (!userId) throw new RangeError("session identity requires userId");

    const token = this.createToken().trim();
    if (!token) throw new RangeError("session token generator returned an empty token");

    const tokenHash = await hashOpaqueSecret(token);
    const expiresAt = new Date(this.now().getTime() + this.ttlMs).toISOString();
    const displayName = identity.displayName?.trim() || null;

    await this.sql.query(
      `INSERT INTO users (id, bouquet_user_id)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET bouquet_user_id = EXCLUDED.bouquet_user_id`,
      [userId, userId]
    );

    await this.sql.query(
      `INSERT INTO tulip_sessions (
         token_hash, user_id, display_name, expires_at
       ) VALUES ($1, $2, $3, $4)
       ON CONFLICT (token_hash) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         display_name = EXCLUDED.display_name,
         expires_at = EXCLUDED.expires_at,
         created_at = NOW()`,
      [tokenHash, userId, displayName, expiresAt]
    );

    await this.sql.query(
      "DELETE FROM tulip_sessions WHERE expires_at <= NOW()"
    );

    return token;
  }

  async resolve(token: string): Promise<BouquetIdentity | null> {
    const normalizedToken = token.trim();
    if (!normalizedToken) return null;
    const tokenHash = await hashOpaqueSecret(normalizedToken);

    const result = await this.sql.query<TulipSessionRow>(
      `SELECT user_id, display_name
       FROM tulip_sessions
       WHERE token_hash = $1
         AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    const row = result.rows[0];
    if (!row) return null;
    const displayName = row.display_name?.trim();
    return {
      userId: row.user_id,
      ...(displayName ? { displayName } : {})
    };
  }

  async revoke(token: string): Promise<void> {
    const normalizedToken = token.trim();
    if (!normalizedToken) return;
    const tokenHash = await hashOpaqueSecret(normalizedToken);
    await this.sql.query(
      "DELETE FROM tulip_sessions WHERE token_hash = $1",
      [tokenHash]
    );
  }
}
