-- Additive authentication migration: existing projects and project data are untouched.
CREATE TABLE auth_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
    status TEXT NOT NULL CHECK (status IN ('active', 'pending', 'disabled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE auth_sessions (
    token_hash BYTEA PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expires_at ON auth_sessions(expires_at);
CREATE TABLE auth_rate_limits (
    bucket_hash BYTEA PRIMARY KEY,
    attempts INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX auth_rate_limits_expires_at ON auth_rate_limits(expires_at);
