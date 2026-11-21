-- Product catalog distinguishes resale goods from operational supplies.
CREATE TABLE ledger_products (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    item_type TEXT NOT NULL CHECK (item_type IN ('resale', 'supply')),
    unit TEXT NOT NULL CHECK (length(btrim(unit)) > 0),
    currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, id),
    UNIQUE (project_id, code)
);
CREATE INDEX ledger_products_project_type_idx ON ledger_products (project_id, item_type, is_active, name);

ALTER TABLE purchases ADD COLUMN purchase_kind TEXT NOT NULL DEFAULT 'resale'
    CHECK (purchase_kind IN ('resale', 'supply'));
ALTER TABLE purchase_items ADD COLUMN catalog_item_id TEXT;
ALTER TABLE purchase_items ADD CONSTRAINT purchase_items_catalog_fk
    FOREIGN KEY (project_id, catalog_item_id)
    REFERENCES ledger_products (project_id, id) ON DELETE RESTRICT;
CREATE INDEX purchase_items_catalog_idx ON purchase_items (project_id, catalog_item_id);
