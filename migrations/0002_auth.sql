-- Application auth: one password per environment and opaque server-side sessions.
-- Only verifiers are stored: a salted PBKDF2 password hash and SHA-256 hashes of session tokens.
-- Set/rotate the password with `pnpm auth set-password <env>`; rotation deletes every session.

CREATE TABLE auth_password (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Recent failed logins per client (hashed address), for login throttling.
CREATE TABLE auth_login_failures (
  client_key TEXT NOT NULL,
  failed_at TEXT NOT NULL
);

CREATE INDEX auth_login_failures_client_idx ON auth_login_failures (client_key, failed_at);
