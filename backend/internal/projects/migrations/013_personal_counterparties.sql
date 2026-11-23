CREATE TABLE personal_counterparties (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('individual', 'legal')),
    name TEXT NOT NULL,
    identity_number TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX personal_counterparties_project_idx
    ON personal_counterparties (project_id, created_at DESC, id DESC);

CREATE UNIQUE INDEX personal_counterparties_identity_idx
    ON personal_counterparties (project_id, identity_number)
    WHERE identity_number <> '';
