CREATE TABLE export_counterparties (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    roles TEXT[] NOT NULL CHECK (
        cardinality(roles) > 0
        AND array_ndims(roles) = 1
        AND array_position(roles, NULL) IS NULL
        AND roles <@ ARRAY['supplier', 'customer', 'intermediary']::TEXT[]
    ),
    phone TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, id)
);

CREATE INDEX idx_export_counterparties_project_created
    ON export_counterparties (project_id, created_at DESC, id DESC);

CREATE TABLE export_shipments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    reference TEXT NOT NULL CHECK (length(btrim(reference)) > 0),
    supplier_id TEXT NOT NULL,
    pallet_count BIGINT NOT NULL CHECK (pallet_count > 0),
    weight_kg NUMERIC NOT NULL CHECK (
        weight_kg > 0 AND weight_kg::TEXT NOT IN ('NaN', 'Infinity', '-Infinity')
    ),
    destination TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('planning', 'in_transit', 'delivered', 'sold')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT export_shipment_supplier_project_fk
        FOREIGN KEY (project_id, supplier_id)
        REFERENCES export_counterparties (project_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_export_shipments_project_created
    ON export_shipments (project_id, created_at DESC, id DESC);
