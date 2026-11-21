-- Shared accounts can be global or limited to a project type.
ALTER TABLE ledger_accounts ADD COLUMN shared_scope TEXT NOT NULL DEFAULT 'all';
-- Preserve existing project-scoped accounts before enforcing the scope shape.
UPDATE ledger_accounts SET shared_scope = 'project' WHERE scope = 'project';
ALTER TABLE ledger_accounts ADD CONSTRAINT ledger_accounts_shared_scope_ck
    CHECK (shared_scope IN ('all', 'export', 'cold-storage', 'sorting', 'construction', 'rental', 'other', 'project'));
ALTER TABLE ledger_accounts ADD CONSTRAINT ledger_accounts_shared_scope_shape_ck
    CHECK ((scope = 'shared' AND shared_scope <> 'project') OR (scope = 'project' AND shared_scope = 'project'));
CREATE INDEX ledger_accounts_shared_scope_idx ON ledger_accounts (shared_scope, is_active, code) WHERE scope = 'shared';
