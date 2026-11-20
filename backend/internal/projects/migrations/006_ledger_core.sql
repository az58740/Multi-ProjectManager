CREATE TABLE ledger_accounts (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL CHECK (scope IN ('project', 'shared')),
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    currency CHAR(3),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((scope = 'shared' AND project_id IS NULL) OR (scope = 'project' AND project_id IS NOT NULL)),
    UNIQUE (id)
);

CREATE INDEX ledger_accounts_project_idx ON ledger_accounts (project_id, is_active, code);
CREATE UNIQUE INDEX ledger_accounts_shared_code_uq ON ledger_accounts (code) WHERE scope = 'shared';
CREATE UNIQUE INDEX ledger_accounts_project_code_uq ON ledger_accounts (project_id, code) WHERE scope = 'project';

CREATE TABLE ledger_journal_entries (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    description TEXT NOT NULL CHECK (length(btrim(description)) > 0),
    idempotency_key TEXT NOT NULL,
    created_by TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, idempotency_key)
);

CREATE INDEX ledger_entries_project_date_idx ON ledger_journal_entries (project_id, entry_date DESC, id DESC);

CREATE TABLE ledger_journal_lines (
    id TEXT PRIMARY KEY,
    entry_id TEXT NOT NULL REFERENCES ledger_journal_entries(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
    currency CHAR(3) NOT NULL,
    debit_amount NUMERIC(38, 12) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
    credit_amount NUMERIC(38, 12) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
    functional_debit NUMERIC(38, 12) NOT NULL DEFAULT 0 CHECK (functional_debit >= 0),
    functional_credit NUMERIC(38, 12) NOT NULL DEFAULT 0 CHECK (functional_credit >= 0),
    exchange_rate NUMERIC(38, 18) NOT NULL CHECK (exchange_rate > 0),
    memo TEXT NOT NULL DEFAULT '',
    CHECK ((debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0)),
    CHECK ((functional_debit > 0 AND functional_credit = 0) OR (functional_credit > 0 AND functional_debit = 0)),
    UNIQUE (entry_id, id)
);

CREATE INDEX ledger_lines_entry_idx ON ledger_journal_lines (entry_id, id);
