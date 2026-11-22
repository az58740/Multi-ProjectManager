-- Account banking details and project exchange directory.
ALTER TABLE ledger_accounts ADD COLUMN account_number TEXT NOT NULL DEFAULT '';
ALTER TABLE ledger_accounts ADD COLUMN bank_name TEXT NOT NULL DEFAULT '';

CREATE TABLE ledger_exchanges (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    address TEXT NOT NULL CHECK (length(btrim(address)) > 0),
    primary_phone TEXT NOT NULL CHECK (length(btrim(primary_phone)) > 0),
    secondary_phone TEXT NOT NULL CHECK (length(btrim(secondary_phone)) > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, id),
    UNIQUE (project_id, name)
);
CREATE INDEX ledger_exchanges_project_active_idx ON ledger_exchanges (project_id, is_active, name);
