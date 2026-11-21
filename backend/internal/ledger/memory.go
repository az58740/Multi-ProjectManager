package ledger

import (
	"context"
	"strings"
	"sync"
	"time"
)

type MemoryStore struct {
	mu       sync.RWMutex
	accounts []Account
	products []Product
	entries  []JournalEntry
}

func NewMemoryStore() *MemoryStore { return &MemoryStore{accounts: []Account{}} }
func (s *MemoryStore) ListAccounts(_ context.Context, projectID string) ([]Account, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := []Account{}
	for _, a := range s.accounts {
		if a.Scope == "shared" || a.ProjectID == projectID {
			out = append(out, a)
		}
	}
	return out, nil
}
func (s *MemoryStore) CreateAccount(_ context.Context, projectID string, in AccountInput) (Account, error) {
	in.Currency = strings.ToUpper(strings.TrimSpace(in.Currency))
	if !validAccount(in) {
		return Account{}, ErrInvalidInput
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, a := range s.accounts {
		if a.Scope == in.Scope && a.ProjectID == projectID && a.Code == in.Code {
			return Account{}, ErrConflict
		}
	}
	id := newID("acct_")
	pid := projectID
	if in.Scope == "shared" {
		pid = ""
	}
	a := Account{ID: id, Scope: in.Scope, ProjectID: pid, Code: in.Code, Name: in.Name, AccountType: in.AccountType, Currency: in.Currency, IsActive: true, CreatedAt: time.Now().UTC()}
	s.accounts = append(s.accounts, a)
	return a, nil
}
func (s *MemoryStore) ListEntries(_ context.Context, projectID string) ([]JournalEntry, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := []JournalEntry{}
	for _, e := range s.entries {
		if e.ProjectID == projectID {
			out = append(out, e)
		}
	}
	return out, nil
}

func (s *MemoryStore) ListProducts(_ context.Context, projectID string) ([]Product, error) {
	s.mu.RLock(); defer s.mu.RUnlock()
	out := []Product{}
	for _, p := range s.products { if p.ProjectID == projectID && p.IsActive { out = append(out, p) } }
	return out, nil
}

func (s *MemoryStore) CreateProduct(_ context.Context, projectID string, in ProductInput) (Product, error) {
	in.Currency = strings.ToUpper(strings.TrimSpace(in.Currency))
	if _, err := prepareProduct(in); err != nil { return Product{}, err }
	s.mu.Lock(); defer s.mu.Unlock()
	for _, p := range s.products { if p.ProjectID == projectID && p.Code == in.Code { return Product{}, ErrConflict } }
	p := Product{ID: newID("prod_"), ProjectID: projectID, ProductInput: in, IsActive: true, CreatedAt: time.Now().UTC()}
	s.products = append(s.products, p)
	return p, nil
}

func (s *MemoryStore) CreateEntry(_ context.Context, projectID, actor string, in EntryInput) (JournalEntry, error) {
	in, err := prepareEntry(in)
	if err != nil {
		return JournalEntry{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, e := range s.entries {
		if e.ProjectID == projectID && e.IdempotencyKey == in.IdempotencyKey {
			return e, nil
		}
	}
	for _, l := range in.Lines {
		found := false
		for _, a := range s.accounts {
			if a.ID == l.AccountID && (a.Scope == "shared" || a.ProjectID == projectID) {
				found = true
			}
		}
		if !found {
			return JournalEntry{}, ErrAccountNotFound
		}
	}
	lines := make([]JournalLine, len(in.Lines))
	for i, l := range in.Lines {
		lines[i] = JournalLine{ID: newID("line_"), AccountID: l.AccountID, Currency: l.Currency, DebitAmount: l.DebitAmount, CreditAmount: l.CreditAmount, FunctionalDebit: l.FunctionalDebit, FunctionalCredit: l.FunctionalCredit, ExchangeRate: l.ExchangeRate, Memo: l.Memo}
	}
	e := JournalEntry{ID: newID("je_"), ProjectID: projectID, EntryDate: in.EntryDate, Description: in.Description, IdempotencyKey: in.IdempotencyKey, CreatedBy: actor, CreatedAt: time.Now().UTC(), Lines: lines}
	s.entries = append(s.entries, e)
	return e, nil
}
