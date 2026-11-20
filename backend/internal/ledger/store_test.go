package ledger

import (
	"context"
	"testing"
)

func TestPrepareEntryRequiresFunctionalBalanceWithoutFloat(t *testing.T) {
	in, err := prepareEntry(EntryInput{EntryDate: "2026-11-20", Description: "test", IdempotencyKey: "k-1", Lines: []LineInput{
		{AccountID: "a", Currency: "USD", DebitAmount: "0.1", FunctionalDebit: "100.01", ExchangeRate: "1000"},
		{AccountID: "b", Currency: "USD", CreditAmount: "0.1", FunctionalCredit: "100.01", ExchangeRate: "1000"},
	}})
	if err != nil || len(in.Lines) != 2 {
		t.Fatalf("balanced decimals rejected: %v", err)
	}
	_, err = prepareEntry(EntryInput{EntryDate: "2026-11-20", Description: "test", IdempotencyKey: "k-2", Lines: []LineInput{
		{AccountID: "a", Currency: "USD", DebitAmount: "0.1", FunctionalDebit: "100.01", ExchangeRate: "1000"},
		{AccountID: "b", Currency: "USD", CreditAmount: "0.1", FunctionalCredit: "100.02", ExchangeRate: "1000"},
	}})
	if err != ErrInvalidInput {
		t.Fatalf("unbalanced entry accepted: %v", err)
	}
}

func TestMemoryEntryIsIdempotentAndAllowsSharedAccount(t *testing.T) {
	s := NewMemoryStore()
	ctx := context.Background()
	shared, err := s.CreateAccount(ctx, "p1", AccountInput{Scope: "shared", Code: "BANK-USD", Name: "Bank", AccountType: "asset", Currency: "USD"})
	if err != nil {
		t.Fatal(err)
	}
	project, err := s.CreateAccount(ctx, "p1", AccountInput{Scope: "project", Code: "REV", Name: "Revenue", AccountType: "revenue", Currency: "USD"})
	if err != nil {
		t.Fatal(err)
	}
	in := EntryInput{EntryDate: "2026-11-20", Description: "sale", IdempotencyKey: "sale-1", Lines: []LineInput{
		{AccountID: shared.ID, Currency: "USD", DebitAmount: "10", FunctionalDebit: "10000", ExchangeRate: "1000"},
		{AccountID: project.ID, Currency: "USD", CreditAmount: "10", FunctionalCredit: "10000", ExchangeRate: "1000"},
	}}
	first, err := s.CreateEntry(ctx, "p1", "u1", in)
	if err != nil {
		t.Fatal(err)
	}
	second, err := s.CreateEntry(ctx, "p1", "u1", in)
	if err != nil {
		t.Fatal(err)
	}
	if first.ID != second.ID {
		t.Fatalf("idempotency returned different ids: %s %s", first.ID, second.ID)
	}
}
