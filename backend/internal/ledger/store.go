package ledger

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"math/big"
	"regexp"
	"strings"
	"time"
)

var (
	ErrInvalidInput    = errors.New("invalid ledger input")
	ErrConflict        = errors.New("ledger idempotency conflict")
	ErrAccountNotFound = errors.New("ledger account not found")
)

var ProductTypes = map[string]bool{"resale": true, "supply": true}

type AccountInput struct {
	Scope         string `json:"scope"`
	SharedScope   string `json:"sharedScope"`
	Code          string `json:"code"`
	Name          string `json:"name"`
	AccountNumber string `json:"accountNumber"`
	BankName      string `json:"bankName"`
	AccountType   string `json:"accountType"`
	Currency      string `json:"currency"`
}
type Account struct {
	ID            string    `json:"id"`
	Scope         string    `json:"scope"`
	SharedScope   string    `json:"sharedScope"`
	ProjectID     string    `json:"projectId"`
	Code          string    `json:"code"`
	Name          string    `json:"name"`
	AccountNumber string    `json:"accountNumber"`
	BankName      string    `json:"bankName"`
	AccountType   string    `json:"accountType"`
	Currency      string    `json:"currency"`
	IsActive      bool      `json:"isActive"`
	CreatedAt     time.Time `json:"createdAt"`
}

type ProductInput struct {
	Code     string `json:"code"`
	Name     string `json:"name"`
	ItemType string `json:"itemType"`
	Unit     string `json:"unit"`
	Currency string `json:"currency"`
}

type Product struct {
	ID        string `json:"id"`
	ProjectID string `json:"projectId"`
	ProductInput
	IsActive  bool      `json:"isActive"`
	CreatedAt time.Time `json:"createdAt"`
}
type ExchangeInput struct {
	Name           string `json:"name"`
	Address        string `json:"address"`
	PrimaryPhone   string `json:"primaryPhone"`
	SecondaryPhone string `json:"secondaryPhone"`
}
type Exchange struct {
	ID        string `json:"id"`
	ProjectID string `json:"projectId"`
	ExchangeInput
	IsActive  bool      `json:"isActive"`
	CreatedAt time.Time `json:"createdAt"`
}
type LineInput struct {
	AccountID        string `json:"accountId"`
	Currency         string `json:"currency"`
	DebitAmount      string `json:"debitAmount"`
	CreditAmount     string `json:"creditAmount"`
	FunctionalDebit  string `json:"functionalDebit"`
	FunctionalCredit string `json:"functionalCredit"`
	ExchangeRate     string `json:"exchangeRate"`
	Memo             string `json:"memo"`
}
type EntryInput struct {
	EntryDate      string      `json:"entryDate"`
	Description    string      `json:"description"`
	IdempotencyKey string      `json:"idempotencyKey"`
	Lines          []LineInput `json:"lines"`
}
type JournalLine struct {
	ID               string `json:"id"`
	AccountID        string `json:"accountId"`
	Currency         string `json:"currency"`
	DebitAmount      string `json:"debitAmount"`
	CreditAmount     string `json:"creditAmount"`
	FunctionalDebit  string `json:"functionalDebit"`
	FunctionalCredit string `json:"functionalCredit"`
	ExchangeRate     string `json:"exchangeRate"`
	Memo             string `json:"memo"`
}
type JournalEntry struct {
	ID, ProjectID, EntryDate, Description, IdempotencyKey string
	CreatedBy                                             string        `json:"createdBy,omitempty"`
	CreatedAt                                             time.Time     `json:"createdAt"`
	Lines                                                 []JournalLine `json:"lines"`
}

type Store interface {
	ListAccounts(context.Context, string) ([]Account, error)
	CreateAccount(context.Context, string, AccountInput) (Account, error)
	ListProducts(context.Context, string) ([]Product, error)
	CreateProduct(context.Context, string, ProductInput) (Product, error)
	ListExchanges(context.Context, string) ([]Exchange, error)
	CreateExchange(context.Context, string, ExchangeInput) (Exchange, error)
	ListEntries(context.Context, string) ([]JournalEntry, error)
	CreateEntry(context.Context, string, string, EntryInput) (JournalEntry, error)
}

var decimalPattern = regexp.MustCompile(`^(0|[1-9][0-9]*)(\.[0-9]+)?$`)

func decimal(value string, positive bool) (string, *big.Rat, bool) {
	value = strings.TrimSpace(value)
	if value == "" && !positive {
		value = "0"
	}
	if !decimalPattern.MatchString(value) {
		return "", nil, false
	}
	r, ok := new(big.Rat).SetString(value)
	if !ok || (positive && r.Sign() <= 0) || (!positive && r.Sign() < 0) {
		return "", nil, false
	}
	return value, r, true
}
func currency(v string) bool {
	if len(v) != 3 {
		return false
	}
	for _, c := range v {
		if c < 'A' || c > 'Z' {
			return false
		}
	}
	return true
}
func validAccount(in AccountInput) bool {
	in.Code, in.Name, in.Currency = strings.TrimSpace(in.Code), strings.TrimSpace(in.Name), strings.ToUpper(strings.TrimSpace(in.Currency))
	if in.SharedScope == "" && in.Scope == "project" {
		in.SharedScope = "project"
	}
	if in.SharedScope == "" && in.Scope == "shared" {
		in.SharedScope = "all"
	}
	return (in.Scope == "project" || in.Scope == "shared") && (in.Scope == "project" || map[string]bool{"all": true, "export": true, "cold-storage": true, "sorting": true, "construction": true, "rental": true, "other": true}[in.SharedScope]) && in.Name != "" && currency(in.Currency) && map[string]bool{"asset": true, "liability": true, "equity": true, "revenue": true, "expense": true}[in.AccountType]
}

func prepareProduct(in ProductInput) (ProductInput, error) {
	in.Code, in.Name, in.ItemType, in.Unit, in.Currency = strings.TrimSpace(in.Code), strings.TrimSpace(in.Name), strings.TrimSpace(in.ItemType), strings.TrimSpace(in.Unit), strings.ToUpper(strings.TrimSpace(in.Currency))
	if in.Name == "" || !ProductTypes[in.ItemType] || in.Unit == "" || !currency(in.Currency) || strings.ContainsRune(in.Name, 0) || strings.ContainsRune(in.Unit, 0) {
		return ProductInput{}, ErrInvalidInput
	}
	return in, nil
}

func prepareExchange(in ExchangeInput) (ExchangeInput, error) {
	in.Name, in.Address, in.PrimaryPhone, in.SecondaryPhone = strings.TrimSpace(in.Name), strings.TrimSpace(in.Address), strings.TrimSpace(in.PrimaryPhone), strings.TrimSpace(in.SecondaryPhone)
	if in.Name == "" || in.Address == "" || in.PrimaryPhone == "" || in.SecondaryPhone == "" || strings.ContainsRune(in.Name, 0) || strings.ContainsRune(in.Address, 0) || strings.ContainsRune(in.PrimaryPhone, 0) || strings.ContainsRune(in.SecondaryPhone, 0) {
		return ExchangeInput{}, ErrInvalidInput
	}
	return in, nil
}
func prepareEntry(in EntryInput) (EntryInput, error) {
	in.EntryDate = strings.TrimSpace(in.EntryDate)
	in.Description = strings.TrimSpace(in.Description)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	if _, err := time.Parse("2006-01-02", in.EntryDate); err != nil || in.Description == "" || in.IdempotencyKey == "" || len(in.Lines) < 2 || len(in.Lines) > 100 {
		return EntryInput{}, ErrInvalidInput
	}
	debit := new(big.Rat)
	credit := new(big.Rat)
	for i, line := range in.Lines {
		in.Lines[i].AccountID = strings.TrimSpace(line.AccountID)
		in.Lines[i].Currency = strings.TrimSpace(line.Currency)
		in.Lines[i].Memo = strings.TrimSpace(line.Memo)
		da, dr, dok := decimal(line.DebitAmount, false)
		ca, cr, cok := decimal(line.CreditAmount, false)
		fd, fr, fdok := decimal(line.FunctionalDebit, false)
		fc, fcR, fcok := decimal(line.FunctionalCredit, false)
		rate, _, rok := decimal(line.ExchangeRate, true)
		if in.Lines[i].AccountID == "" || !currency(in.Lines[i].Currency) || !dok || !cok || !fdok || !fcok || !rok || (dr.Sign() > 0) == (cr.Sign() > 0) || (fr.Sign() > 0) == (fcR.Sign() > 0) {
			return EntryInput{}, ErrInvalidInput
		}
		in.Lines[i].DebitAmount, in.Lines[i].CreditAmount, in.Lines[i].FunctionalDebit, in.Lines[i].FunctionalCredit, in.Lines[i].ExchangeRate = da, ca, fd, fc, rate
		debit.Add(debit, fr)
		credit.Add(credit, fcR)
	}
	if debit.Cmp(credit) != 0 {
		return EntryInput{}, ErrInvalidInput
	}
	return in, nil
}
func newID(prefix string) string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return prefix + time.Now().UTC().Format("20060102150405.000000000")
	}
	return prefix + hex.EncodeToString(b[:])
}
