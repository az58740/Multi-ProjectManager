package ledger

import (
	"context"
	"strings"
	"sync"
	"time"
)

type MemoryStore struct {
	mu        sync.RWMutex
	accounts  []Account
	products  []Product
	exchanges []Exchange
	entries   []JournalEntry
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
	if in.OpeningBalance == "" {
		in.OpeningBalance = "0"
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
	sharedScope := in.SharedScope
	if in.Scope == "project" {
		sharedScope = "project"
	}
	a := Account{ID: id, Scope: in.Scope, SharedScope: sharedScope, ProjectID: pid, Code: newID("ACC-"), Name: in.Name, AccountNumber: strings.TrimSpace(in.AccountNumber), BankName: strings.TrimSpace(in.BankName), AccountType: in.AccountType, Currency: in.Currency, OpeningBalance: in.OpeningBalance, CurrentBalance: in.OpeningBalance, IsActive: true, CreatedAt: time.Now().UTC()}
	s.accounts = append(s.accounts, a)
	return a, nil
}

func (s *MemoryStore) UpdateAccount(_ context.Context, projectID, id string, in AccountInput) (Account, error) {
	in.Scope, in.SharedScope = "project", "project"
	if !validAccount(in) {
		return Account{}, ErrInvalidInput
	}
	if in.OpeningBalance == "" {
		in.OpeningBalance = "0"
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.accounts {
		if s.accounts[i].ID == id && (s.accounts[i].ProjectID == projectID || s.accounts[i].Scope == "shared") {
			a := &s.accounts[i]
			a.Name, a.AccountNumber, a.BankName, a.Currency, a.AccountType, a.OpeningBalance = in.Name, in.AccountNumber, in.BankName, in.Currency, in.AccountType, in.OpeningBalance
			a.CurrentBalance = in.OpeningBalance
			return *a, nil
		}
	}
	return Account{}, ErrAccountNotFound
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
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := []Product{}
	for _, p := range s.products {
		if (p.ProjectID == projectID || (p.Scope == "shared" && p.SharedScope == "all")) && p.IsActive {
			out = append(out, p)
		}
	}
	return out, nil
}

func (s *MemoryStore) CreateProduct(_ context.Context, projectID string, in ProductInput) (Product, error) {
	in.Currency = strings.ToUpper(strings.TrimSpace(in.Currency))
	var err error
	if in, err = prepareProduct(in); err != nil {
		return Product{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	pid := projectID
	if in.Scope == "shared" {
		pid = ""
	}
	p := Product{ID: newID("prod_"), ProjectID: pid, ProductInput: in, IsActive: true, CreatedAt: time.Now().UTC()}
	p.Code = newID("SKU-")
	s.products = append(s.products, p)
	return p, nil
}

func (s *MemoryStore) UpdateProduct(_ context.Context, projectID, id string, in ProductInput) (Product, error) {
	in.Scope, in.SharedScope = "project", "project"
	var err error
	if in, err = prepareProduct(in); err != nil {
		return Product{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.products {
		if s.products[i].ID == id && s.products[i].ProjectID == projectID {
			s.products[i].Name, s.products[i].ItemType, s.products[i].Unit, s.products[i].Currency = in.Name, in.ItemType, in.Unit, in.Currency
			s.products[i].OpeningStock, s.products[i].CurrentStock = in.OpeningStock, in.CurrentStock
			return s.products[i], nil
		}
	}
	return Product{}, ErrProductNotFound
}

func (s *MemoryStore) ListExchanges(_ context.Context, projectID string) ([]Exchange, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := []Exchange{}
	for _, item := range s.exchanges {
		if item.ProjectID == projectID && item.IsActive {
			out = append(out, item)
		}
	}
	return out, nil
}

func (s *MemoryStore) CreateExchange(_ context.Context, projectID string, in ExchangeInput) (Exchange, error) {
	in, err := prepareExchange(in)
	if err != nil {
		return Exchange{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, item := range s.exchanges {
		if item.ProjectID == projectID && item.Name == in.Name {
			return Exchange{}, ErrConflict
		}
	}
	item := Exchange{ID: newID("exch_"), ProjectID: projectID, ExchangeInput: in, IsActive: true, CreatedAt: time.Now().UTC()}
	s.exchanges = append(s.exchanges, item)
	return item, nil
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
