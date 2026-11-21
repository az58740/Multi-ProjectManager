package ledger

import (
	"context"
	"errors"
	"fmt"
	"github.com/az58740/multi-project-manager/backend/internal/dbconfig"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"strings"
	"time"
)

type PostgresStore struct{ pool *pgxpool.Pool }

func NewPostgresStore(ctx context.Context, url string) (*PostgresStore, error) {
	cfg, e := dbconfig.ParsePoolConfig(url)
	if e != nil {
		return nil, e
	}
	p, e := pgxpool.NewWithConfig(ctx, cfg)
	if e != nil {
		return nil, e
	}
	if e = p.Ping(ctx); e != nil {
		p.Close()
		return nil, e
	}
	return &PostgresStore{p}, nil
}
func (s *PostgresStore) Close() { s.pool.Close() }

const accountCols = `id, scope, COALESCE(shared_scope,''), COALESCE(project_id,''), code, name, account_type, COALESCE(currency,''), is_active, created_at`

func scanAccount(row interface{ Scan(...any) error }) (Account, error) {
	var a Account
	e := row.Scan(&a.ID, &a.Scope, &a.SharedScope, &a.ProjectID, &a.Code, &a.Name, &a.AccountType, &a.Currency, &a.IsActive, &a.CreatedAt)
	return a, e
}
func (s *PostgresStore) ListAccounts(ctx context.Context, pid string) ([]Account, error) {
	rows, e := s.pool.Query(ctx, `SELECT `+accountCols+` FROM ledger_accounts a WHERE (a.scope='shared' AND (a.shared_scope='all' OR a.shared_scope=(SELECT type FROM projects WHERE id=$1))) OR a.project_id=$1 ORDER BY a.scope,a.code`, pid)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Account{}
	for rows.Next() {
		a, e := scanAccount(rows)
		if e != nil {
			return nil, e
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
func (s *PostgresStore) CreateAccount(ctx context.Context, pid string, in AccountInput) (Account, error) {
	in.Code, in.Name, in.Currency = strings.TrimSpace(in.Code), strings.TrimSpace(in.Name), strings.ToUpper(strings.TrimSpace(in.Currency))
	if !validAccount(in) {
		return Account{}, ErrInvalidInput
	}
	project := any(nil)
	sharedScope := strings.TrimSpace(in.SharedScope)
	if in.Scope == "project" {
		project = pid
		sharedScope = "project"
	}
	a, e := scanAccount(s.pool.QueryRow(ctx, `INSERT INTO ledger_accounts(id,scope,shared_scope,project_id,code,name,account_type,currency) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING `+accountCols, newID("acct_"), in.Scope, sharedScope, project, in.Code, in.Name, in.AccountType, in.Currency))
	if e != nil {
		if isUnique(e) {
			return Account{}, ErrConflict
		}
		return Account{}, e
	}
	return a, nil
}
func (s *PostgresStore) ListEntries(ctx context.Context, pid string) ([]JournalEntry, error) {
	rows, e := s.pool.Query(ctx, `SELECT id,project_id,entry_date::text,description,idempotency_key,COALESCE(created_by,''),created_at FROM ledger_journal_entries WHERE project_id=$1 ORDER BY entry_date DESC,id DESC`, pid)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []JournalEntry{}
	for rows.Next() {
		var x JournalEntry
		if e = rows.Scan(&x.ID, &x.ProjectID, &x.EntryDate, &x.Description, &x.IdempotencyKey, &x.CreatedBy, &x.CreatedAt); e != nil {
			return nil, e
		}
		x.Lines, e = loadLines(ctx, s.pool, x.ID)
		if e != nil {
			return nil, e
		}
		out = append(out, x)
	}
	return out, rows.Err()
}
func loadLines(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, id string) ([]JournalLine, error) {
	rows, e := q.Query(ctx, `SELECT id,account_id,currency,debit_amount::text,credit_amount::text,functional_debit::text,functional_credit::text,exchange_rate::text,memo FROM ledger_journal_lines WHERE entry_id=$1 ORDER BY id`, id)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []JournalLine{}
	for rows.Next() {
		var l JournalLine
		if e = rows.Scan(&l.ID, &l.AccountID, &l.Currency, &l.DebitAmount, &l.CreditAmount, &l.FunctionalDebit, &l.FunctionalCredit, &l.ExchangeRate, &l.Memo); e != nil {
			return nil, e
		}
		out = append(out, l)
	}
	return out, rows.Err()
}
func (s *PostgresStore) CreateEntry(ctx context.Context, pid, actor string, in EntryInput) (JournalEntry, error) {
	in, e := prepareEntry(in)
	if e != nil {
		return JournalEntry{}, e
	}
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return JournalEntry{}, e
	}
	defer tx.Rollback(ctx)
	var existing JournalEntry
	e = tx.QueryRow(ctx, `SELECT id,project_id,entry_date::text,description,idempotency_key,COALESCE(created_by,''),created_at FROM ledger_journal_entries WHERE project_id=$1 AND idempotency_key=$2`, pid, in.IdempotencyKey).Scan(&existing.ID, &existing.ProjectID, &existing.EntryDate, &existing.Description, &existing.IdempotencyKey, &existing.CreatedBy, &existing.CreatedAt)
	if e == nil {
		existing.Lines, e = loadLines(ctx, tx, existing.ID)
		if e != nil {
			return JournalEntry{}, e
		}
		return existing, tx.Commit(ctx)
	}
	if !errors.Is(e, pgx.ErrNoRows) {
		return JournalEntry{}, e
	}
	for _, l := range in.Lines {
		var ok bool
		if e = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM ledger_accounts WHERE id=$1 AND is_active AND (scope='shared' OR (scope='project' AND project_id=$2)))`, l.AccountID, pid).Scan(&ok); e != nil {
			return JournalEntry{}, e
		}
		if !ok {
			return JournalEntry{}, ErrAccountNotFound
		}
	}
	entry := JournalEntry{ID: newID("je_"), ProjectID: pid, EntryDate: in.EntryDate, Description: in.Description, IdempotencyKey: in.IdempotencyKey, CreatedBy: actor, CreatedAt: time.Now().UTC(), Lines: make([]JournalLine, len(in.Lines))}
	e = tx.QueryRow(ctx, `INSERT INTO ledger_journal_entries(id,project_id,entry_date,description,idempotency_key,created_by) VALUES($1,$2,$3,$4,$5,NULLIF($6,'')) RETURNING created_at`, entry.ID, pid, in.EntryDate, in.Description, in.IdempotencyKey, actor).Scan(&entry.CreatedAt)
	if e != nil {
		return JournalEntry{}, e
	}
	for i, l := range in.Lines {
		line := JournalLine{ID: newID("line_"), AccountID: l.AccountID, Currency: l.Currency, DebitAmount: l.DebitAmount, CreditAmount: l.CreditAmount, FunctionalDebit: l.FunctionalDebit, FunctionalCredit: l.FunctionalCredit, ExchangeRate: l.ExchangeRate, Memo: l.Memo}
		entry.Lines[i] = line
		if _, e = tx.Exec(ctx, `INSERT INTO ledger_journal_lines(id,entry_id,account_id,currency,debit_amount,credit_amount,functional_debit,functional_credit,exchange_rate,memo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, line.ID, entry.ID, line.AccountID, line.Currency, line.DebitAmount, line.CreditAmount, line.FunctionalDebit, line.FunctionalCredit, line.ExchangeRate, line.Memo); e != nil {
			return JournalEntry{}, e
		}
	}
	if e = tx.Commit(ctx); e != nil {
		if isUnique(e) {
			// Another request won the unique-key race. Return its committed entry
			// so a network retry remains idempotent instead of leaking a conflict.
			var winner JournalEntry
			winnerErr := s.pool.QueryRow(ctx, `SELECT id,project_id,entry_date::text,description,idempotency_key,COALESCE(created_by,''),created_at FROM ledger_journal_entries WHERE project_id=$1 AND idempotency_key=$2`, pid, in.IdempotencyKey).Scan(&winner.ID, &winner.ProjectID, &winner.EntryDate, &winner.Description, &winner.IdempotencyKey, &winner.CreatedBy, &winner.CreatedAt)
			if winnerErr != nil {
				return JournalEntry{}, winnerErr
			}
			winner.Lines, winnerErr = loadLines(ctx, s.pool, winner.ID)
			return winner, winnerErr
		}
		return JournalEntry{}, e
	}
	return entry, nil
}

const productCols = `id, project_id, code, name, item_type, unit, currency, is_active, created_at`

func scanProduct(row interface{ Scan(...any) error }) (Product, error) {
	var p Product
	err := row.Scan(&p.ID, &p.ProjectID, &p.Code, &p.Name, &p.ItemType, &p.Unit, &p.Currency, &p.IsActive, &p.CreatedAt)
	return p, err
}

func (s *PostgresStore) ListProducts(ctx context.Context, pid string) ([]Product, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+productCols+` FROM ledger_products WHERE project_id=$1 AND is_active ORDER BY item_type, name, id`, pid)
	if err != nil { return nil, err }
	defer rows.Close()
	items := []Product{}
	for rows.Next() { p, err := scanProduct(rows); if err != nil { return nil, err }; items = append(items, p) }
	return items, rows.Err()
}

func (s *PostgresStore) CreateProduct(ctx context.Context, pid string, in ProductInput) (Product, error) {
	in, err := prepareProduct(in)
	if err != nil { return Product{}, err }
	p, err := scanProduct(s.pool.QueryRow(ctx, `INSERT INTO ledger_products(id,project_id,code,name,item_type,unit,currency) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING `+productCols, newID("prod_"), pid, in.Code, in.Name, in.ItemType, in.Unit, in.Currency))
	if err != nil { if isUnique(err) { return Product{}, ErrConflict }; return Product{}, err }
	return p, nil
}

func isUnique(e error) bool {
	var pe interface{ SQLState() string }
	return errors.As(e, &pe) && pe.SQLState() == "23505"
}

var _ = fmt.Sprintf
