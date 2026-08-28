BEGIN;

CREATE TABLE oauth_transient_states (
  state_hash TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX oauth_transient_states_expires_at_idx
  ON oauth_transient_states(expires_at);

CREATE TABLE tulip_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX tulip_sessions_expires_at_idx
  ON tulip_sessions(expires_at);
CREATE INDEX tulip_sessions_user_expires_idx
  ON tulip_sessions(user_id, expires_at);

COMMIT;
