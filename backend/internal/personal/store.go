package personal

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/az58740/multi-project-manager/backend/internal/dbconfig"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrInvalidInput = errors.New("invalid personal counterparty")
	ErrNotFound     = errors.New("personal counterparty not found")
	ErrConflict     = errors.New("personal counterparty conflict")
)

type CounterpartyInput struct {
	EntityType     string `json:"entityType"`
	Name           string `json:"name"`
	IdentityNumber string `json:"identityNumber"`
	Phone          string `json:"phone"`
	Address        string `json:"address"`
	Notes          string `json:"notes"`
}
type Counterparty struct {
	ID        string `json:"id"`
	ProjectID string `json:"projectId"`
	CounterpartyInput
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
type Store interface {
	List(context.Context, string) ([]Counterparty, error)
	Create(context.Context, string, CounterpartyInput) (Counterparty, error)
	Update(context.Context, string, string, CounterpartyInput) (Counterparty, error)
}

func prepare(in CounterpartyInput) (CounterpartyInput, error) {
	in.EntityType = strings.TrimSpace(in.EntityType)
	in.Name = strings.TrimSpace(in.Name)
	in.IdentityNumber = strings.TrimSpace(in.IdentityNumber)
	in.Phone = strings.TrimSpace(in.Phone)
	in.Address = strings.TrimSpace(in.Address)
	in.Notes = strings.TrimSpace(in.Notes)
	if (in.EntityType != "individual" && in.EntityType != "legal") || in.Name == "" || runeCount(in.Name) > 160 || runeCount(in.IdentityNumber) > 80 || runeCount(in.Phone) > 80 || runeCount(in.Address) > 300 || runeCount(in.Notes) > 1000 || !validText(in.Name, in.IdentityNumber, in.Phone, in.Address, in.Notes) {
		return CounterpartyInput{}, ErrInvalidInput
	}
	return in, nil
}
func validText(values ...string) bool {
	for _, value := range values {
		if !utf8.ValidString(value) || strings.ContainsRune(value, 0) {
			return false
		}
	}
	return true
}
func runeCount(value string) int {
	if !utf8.ValidString(value) {
		return 1 << 30
	}
	return len([]rune(value))
}
func newID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err == nil {
		return "pctr_" + hex.EncodeToString(b[:])
	}
	return "pctr_" + time.Now().UTC().Format("20060102150405.000000000")
}

type MemoryStore struct {
	items []Counterparty
	mu    sync.RWMutex
}

func (s *MemoryStore) List(_ context.Context, projectID string) ([]Counterparty, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := []Counterparty{}
	for _, item := range s.items {
		if item.ProjectID == projectID {
			out = append(out, item)
		}
	}
	return out, nil
}
func (s *MemoryStore) Create(_ context.Context, projectID string, input CounterpartyInput) (Counterparty, error) {
	in, err := prepare(input)
	if err != nil {
		return Counterparty{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, item := range s.items {
		if item.ProjectID == projectID && in.IdentityNumber != "" && item.IdentityNumber == in.IdentityNumber {
			return Counterparty{}, ErrConflict
		}
	}
	now := time.Now().UTC()
	item := Counterparty{ID: newID(), ProjectID: projectID, CounterpartyInput: in, CreatedAt: now, UpdatedAt: now}
	s.items = append([]Counterparty{item}, s.items...)
	return item, nil
}
func (s *MemoryStore) Update(_ context.Context, projectID, id string, input CounterpartyInput) (Counterparty, error) {
	in, err := prepare(input)
	if err != nil {
		return Counterparty{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.items {
		if s.items[i].ID == id && s.items[i].ProjectID == projectID {
			for j, other := range s.items {
				if j != i && other.ProjectID == projectID && in.IdentityNumber != "" && other.IdentityNumber == in.IdentityNumber {
					return Counterparty{}, ErrConflict
				}
			}
			s.items[i].CounterpartyInput = in
			s.items[i].UpdatedAt = time.Now().UTC()
			return s.items[i], nil
		}
	}
	return Counterparty{}, ErrNotFound
}

type PostgresStore struct{ pool *pgxpool.Pool }

func NewPostgresStore(ctx context.Context, url string) (*PostgresStore, error) {
	cfg, err := dbconfig.ParsePoolConfig(url)
	if err != nil {
		return nil, err
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &PostgresStore{pool: pool}, nil
}
func (s *PostgresStore) Close() { s.pool.Close() }

const columns = `id, project_id, entity_type, name, identity_number, phone, address, notes, created_at, updated_at`

func scan(row interface{ Scan(...any) error }) (Counterparty, error) {
	var item Counterparty
	err := row.Scan(&item.ID, &item.ProjectID, &item.EntityType, &item.Name, &item.IdentityNumber, &item.Phone, &item.Address, &item.Notes, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}
func (s *PostgresStore) List(ctx context.Context, projectID string) ([]Counterparty, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+columns+` FROM personal_counterparties WHERE project_id=$1 ORDER BY created_at DESC, id DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Counterparty{}
	for rows.Next() {
		item, scanErr := scan(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		out = append(out, item)
	}
	return out, rows.Err()
}
func (s *PostgresStore) Create(ctx context.Context, projectID string, input CounterpartyInput) (Counterparty, error) {
	in, err := prepare(input)
	if err != nil {
		return Counterparty{}, err
	}
	item, err := scan(s.pool.QueryRow(ctx, `INSERT INTO personal_counterparties (id, project_id, entity_type, name, identity_number, phone, address, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING `+columns, newID(), projectID, in.EntityType, in.Name, in.IdentityNumber, in.Phone, in.Address, in.Notes))
	if isUnique(err) {
		return Counterparty{}, ErrConflict
	}
	return item, err
}
func (s *PostgresStore) Update(ctx context.Context, projectID, id string, input CounterpartyInput) (Counterparty, error) {
	in, err := prepare(input)
	if err != nil {
		return Counterparty{}, err
	}
	item, err := scan(s.pool.QueryRow(ctx, `UPDATE personal_counterparties SET entity_type=$1,name=$2,identity_number=$3,phone=$4,address=$5,notes=$6,updated_at=NOW() WHERE id=$7 AND project_id=$8 RETURNING `+columns, in.EntityType, in.Name, in.IdentityNumber, in.Phone, in.Address, in.Notes, id, projectID))
	if err == pgx.ErrNoRows {
		return Counterparty{}, ErrNotFound
	}
	if isUnique(err) {
		return Counterparty{}, ErrConflict
	}
	return item, err
}
func isUnique(err error) bool {
	var e interface{ SQLState() string }
	return errors.As(err, &e) && e.SQLState() == "23505"
}
