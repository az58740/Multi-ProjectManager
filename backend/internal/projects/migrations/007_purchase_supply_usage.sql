-- Purchase is intentionally separate from export_shipments (Shipment).
-- One purchase may contain several items and each item may be allocated to many shipments.

ALTER TABLE export_shipments
    ADD CONSTRAINT export_shipments_project_id_id_uq UNIQUE (project_id, id);

CREATE TABLE purchases (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    supplier_id TEXT NOT NULL,
    reference TEXT NOT NULL CHECK (length(btrim(reference)) > 0),
    purchase_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'partially_consumed', 'consumed', 'cancelled')),
    currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    total_amount NUMERIC(38, 12) NOT NULL CHECK (total_amount > 0),
    functional_total NUMERIC(38, 12) NOT NULL CHECK (functional_total > 0),
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, id),
    UNIQUE (project_id, reference),
    CONSTRAINT purchases_supplier_project_fk
        FOREIGN KEY (project_id, supplier_id)
        REFERENCES export_counterparties (project_id, id) ON DELETE RESTRICT
);

CREATE INDEX purchases_project_date_idx
    ON purchases (project_id, purchase_date DESC, id DESC);

CREATE TABLE purchase_items (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    purchase_id TEXT NOT NULL,
    item_type TEXT NOT NULL CHECK (item_type IN ('produce', 'packaging', 'supply', 'other')),
    description TEXT NOT NULL CHECK (length(btrim(description)) > 0),
    unit TEXT NOT NULL CHECK (unit IN ('kg', 'piece', 'box', 'pallet', 'unit')),
    quantity NUMERIC(38, 12) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(38, 12) NOT NULL CHECK (unit_price > 0),
    line_amount NUMERIC(38, 12) NOT NULL CHECK (line_amount > 0),
    functional_line_amount NUMERIC(38, 12) NOT NULL CHECK (functional_line_amount > 0),
    currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    exchange_rate NUMERIC(38, 18) NOT NULL CHECK (exchange_rate > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, id),
    FOREIGN KEY (project_id, purchase_id)
        REFERENCES purchases (project_id, id) ON DELETE CASCADE
);

CREATE INDEX purchase_items_purchase_idx
    ON purchase_items (project_id, purchase_id, id);

CREATE TABLE supply_usages (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    purchase_item_id TEXT NOT NULL,
    shipment_id TEXT NOT NULL,
    usage_date DATE NOT NULL,
    quantity NUMERIC(38, 12) NOT NULL CHECK (quantity > 0),
    amount NUMERIC(38, 12) NOT NULL CHECK (amount > 0),
    functional_amount NUMERIC(38, 12) NOT NULL CHECK (functional_amount > 0),
    currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    exchange_rate NUMERIC(38, 18) NOT NULL CHECK (exchange_rate > 0),
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (purchase_item_id, shipment_id),
    FOREIGN KEY (project_id, purchase_item_id)
        REFERENCES purchase_items (project_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (project_id, shipment_id)
        REFERENCES export_shipments (project_id, id) ON DELETE RESTRICT
);

CREATE INDEX supply_usages_project_shipment_idx
    ON supply_usages (project_id, shipment_id, usage_date DESC, id DESC);
CREATE INDEX supply_usages_purchase_item_idx
    ON supply_usages (project_id, purchase_item_id, usage_date DESC, id DESC);

CREATE FUNCTION check_purchase_supplier_role() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM export_counterparties
        WHERE project_id = NEW.project_id
          AND id = NEW.supplier_id
          AND 'supplier' = ANY(roles)
    ) THEN
        RAISE EXCEPTION 'purchase supplier must have supplier role'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER purchases_supplier_role_check
    BEFORE INSERT OR UPDATE OF project_id, supplier_id ON purchases
    FOR EACH ROW EXECUTE FUNCTION check_purchase_supplier_role();
