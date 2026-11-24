package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"sort"
	"sync"
	"time"
)

var (
	ErrNotFound  = errors.New("not found")
	ErrConflict  = errors.New("email already exists")
	ErrLastAdmin = errors.New("cannot remove last active administrator")
	ErrForbidden = errors.New("administrator required")
	ErrStale     = errors.New("account changed during login")
)

type User struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt,omitempty"`
}
type record struct {
	User
	PasswordHash string
}
type changes struct{ Name, Role, Status, PasswordHash *string }
type Store interface {
	Bootstrap(context.Context, record) (bool, error)
	Create(context.Context, record, string) (User, error)
	ByEmail(context.Context, string) (record, error)
	List(context.Context) ([]User, error)
	PromoteSoleActiveUser(context.Context) (bool, error)
	Update(context.Context, string, string, changes) (User, error)
	NewSession(context.Context, string, string, []byte, time.Time) error
	Session(context.Context, []byte) (User, error)
	DeleteSession(context.Context, []byte) error
	Attempt(context.Context, []byte, int, time.Duration) (bool, error)
}

func newID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "usr_" + base64.RawURLEncoding.EncodeToString(b), nil
}
func tokenHash(token string) []byte { h := sha256.Sum256([]byte(token)); return h[:] }
func bucketHash(s string) []byte    { h := sha256.Sum256([]byte(s)); return h[:] }

type memorySession struct {
	userID  string
	expires time.Time
}
type memoryLimit struct {
	count   int
	expires time.Time
}
type MemoryStore struct {
	mu       sync.Mutex
	users    map[string]record
	emails   map[string]string
	sessions map[string]memorySession
	limits   map[string]memoryLimit
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{users: map[string]record{}, emails: map[string]string{}, sessions: map[string]memorySession{}, limits: map[string]memoryLimit{}}
}
func (s *MemoryStore) Bootstrap(_ context.Context, r record) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.users) != 0 {
		return false, nil
	}
	s.users[r.ID] = r
	s.emails[r.Email] = r.ID
	return true, nil
}
func (s *MemoryStore) Create(_ context.Context, r record, actor string) (User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if actor != "" {
		a, ok := s.users[actor]
		if !ok || a.Role != "admin" || a.Status != "active" {
			return User{}, ErrForbidden
		}
	}
	if _, ok := s.emails[r.Email]; ok {
		return User{}, ErrConflict
	}
	s.users[r.ID] = r
	s.emails[r.Email] = r.ID
	return r.User, nil
}
func (s *MemoryStore) ByEmail(_ context.Context, email string) (record, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, ok := s.emails[email]
	if !ok {
		return record{}, ErrNotFound
	}
	return s.users[id], nil
}
func (s *MemoryStore) List(_ context.Context) ([]User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]User, 0, len(s.users))
	for _, r := range s.users {
		out = append(out, r.User)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out, nil
}
func (s *MemoryStore) PromoteSoleActiveUser(_ context.Context) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	active := make([]string, 0, 1)
	for id, r := range s.users {
		if r.Status == "active" {
			active = append(active, id)
		}
	}
	if len(active) != 1 || s.users[active[0]].Role == "admin" {
		return false, nil
	}
	r := s.users[active[0]]
	r.Role = "admin"
	s.users[active[0]] = r
	return true, nil
}

func (s *MemoryStore) Update(_ context.Context, actor, id string, c changes) (User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	a, ok := s.users[actor]
	if !ok || a.Role != "admin" || a.Status != "active" {
		return User{}, ErrForbidden
	}
	r, ok := s.users[id]
	if !ok {
		return User{}, ErrNotFound
	}
	role, status := r.Role, r.Status
	if c.Role != nil {
		role = *c.Role
	}
	if c.Status != nil {
		status = *c.Status
	}
	if r.Role == "admin" && r.Status == "active" && (role != "admin" || status != "active") {
		n := 0
		for _, u := range s.users {
			if u.Role == "admin" && u.Status == "active" {
				n++
			}
		}
		if n <= 1 {
			return User{}, ErrLastAdmin
		}
	}
	securityChanged := role != r.Role || status != r.Status || c.PasswordHash != nil
	if c.Name != nil {
		r.Name = *c.Name
	}
	r.Role = role
	r.Status = status
	if c.PasswordHash != nil {
		r.PasswordHash = *c.PasswordHash
	}
	s.users[id] = r
	if securityChanged {
		for k, v := range s.sessions {
			if v.userID == id {
				delete(s.sessions, k)
			}
		}
	}
	return r.User, nil
}
func (s *MemoryStore) NewSession(_ context.Context, id, hash string, token []byte, expiry time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.users[id]
	if !ok || r.Status != "active" || r.PasswordHash != hash {
		return ErrStale
	}
	now := time.Now()
	for k, v := range s.sessions {
		if !v.expires.After(now) {
			delete(s.sessions, k)
		}
	}
	s.sessions[string(token)] = memorySession{id, expiry}
	return nil
}
func (s *MemoryStore) Session(_ context.Context, token []byte) (User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ses, ok := s.sessions[string(token)]
	if !ok || !ses.expires.After(time.Now()) {
		delete(s.sessions, string(token))
		return User{}, ErrNotFound
	}
	r, ok := s.users[ses.userID]
	if !ok || r.Status != "active" {
		return User{}, ErrNotFound
	}
	return r.User, nil
}
func (s *MemoryStore) DeleteSession(_ context.Context, token []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, string(token))
	return nil
}
func (s *MemoryStore) Attempt(_ context.Context, key []byte, max int, window time.Duration) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	for k, v := range s.limits {
		if !v.expires.After(now) {
			delete(s.limits, k)
		}
	}
	k := string(key)
	v := s.limits[k]
	if !v.expires.After(now) {
		v = memoryLimit{expires: now.Add(window)}
	}
	v.count++
	s.limits[k] = v
	return v.count <= max, nil
}
