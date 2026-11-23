-- Persist opening balances and product stock quantities.
ALTER TABLE ledger_accounts
    ADD COLUMN opening_balance NUMERIC(38, 12) NOT NULL DEFAULT 0
        CHECK (opening_balance >= 0);

ALTER TABLE ledger_products
    ADD COLUMN opening_stock NUMERIC(38, 12) NOT NULL DEFAULT 0
        CHECK (opening_stock >= 0),
    ADD COLUMN current_stock NUMERIC(38, 12) NOT NULL DEFAULT 0
        CHECK (current_stock >= 0);
