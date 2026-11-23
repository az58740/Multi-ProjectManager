-- Allow product catalog items to be shared by all projects.
ALTER TABLE ledger_products
    ADD COLUMN scope TEXT NOT NULL DEFAULT 'project',
    ADD COLUMN shared_scope TEXT NOT NULL DEFAULT 'project';

ALTER TABLE ledger_products
    ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE ledger_products
    ADD CONSTRAINT ledger_products_scope_ck
    CHECK (scope IN ('project', 'shared')),
    ADD CONSTRAINT ledger_products_shared_scope_ck
    CHECK (shared_scope IN ('all', 'export', 'cold-storage', 'sorting', 'construction', 'rental', 'other', 'project')),
    ADD CONSTRAINT ledger_products_scope_shape_ck
    CHECK ((scope = 'shared' AND project_id IS NULL AND shared_scope <> 'project') OR
           (scope = 'project' AND project_id IS NOT NULL AND shared_scope = 'project'));

CREATE INDEX ledger_products_shared_scope_idx
    ON ledger_products (shared_scope, item_type, is_active, name)
    WHERE scope = 'shared';
