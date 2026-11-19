package auth

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/az58740/multi-project-manager/backend/internal/projects"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// TEST_DATABASE_URL must point to a disposable, empty database; the test never drops schemas.
func TestPostgresMigrationBootstrapAndSessions(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to an empty disposable database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	p, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	var existing *string
	if err = p.QueryRow(ctx, `SELECT to_regclass('public.auth_users')::text`).Scan(&existing); err != nil {
		t.Fatal(err)
	}
	if existing != nil {
		t.Fatal("TEST_DATABASE_URL must reference a fresh disposable database")
	}
	_, err = p.Exec(ctx, `CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, location TEXT NOT NULL DEFAULT '', manager TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); INSERT INTO projects (id,name,type) VALUES ('legacy','preserved','other')`)
	if err != nil {
		t.Fatal(err)
	}
	const n = 6
	var wg sync.WaitGroup
	errorsCh := make(chan error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			s, e := projects.NewPostgresStore(ctx, dsn)
			if e == nil {
				s.Close()
			}
			errorsCh <- e
		}()
	}
	wg.Wait()
	close(errorsCh)
	for e := range errorsCh {
		if e != nil {
			t.Fatalf("concurrent migrations: %v", e)
		}
	}
	ps, err := projects.NewPostgresStore(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer ps.Close()
	legacy, err := ps.Get(ctx, "legacy")
	if err != nil || legacy.Name != "preserved" || legacy.Code == "" {
		t.Fatalf("legacy project changed: %+v %v", legacy, err)
	}
	s, err := NewPostgresStore(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(adminPassword), bcrypt.DefaultCost)
	if err != nil {
		t.Fatal(err)
	}
	wins := make(chan bool, n)
	errorsCh = make(chan error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			r := record{User: User{ID: fmt.Sprintf("id%d", i), Name: "Admin", Email: fmt.Sprintf("admin%d@example.test", i), Role: "admin", Status: "active", CreatedAt: time.Now()}, PasswordHash: string(passwordHash)}
			ok, e := s.Bootstrap(ctx, r)
			wins <- ok
			errorsCh <- e
		}(i)
	}
	wg.Wait()
	close(wins)
	close(errorsCh)
	for e := range errorsCh {
		if e != nil {
			t.Fatal(e)
		}
	}
	nwin := 0
	for win := range wins {
		if win {
			nwin++
		}
	}
	if nwin != 1 {
		t.Fatalf("bootstrap winners %d", nwin)
	}
	users, err := s.List(ctx)
	if err != nil || len(users) != 1 {
		t.Fatalf("users=%v err=%v", users, err)
	}
	admin := users[0]
	one, err := s.ByEmail(ctx, admin.Email)
	if err != nil || one.PasswordHash != string(passwordHash) {
		t.Fatal("bootstrap overwrote user")
	}
	second := record{User: User{ID: "second", Name: "Second", Email: "second@example.test", Role: "admin", Status: "active", CreatedAt: time.Now()}, PasswordHash: "second-hash"}
	if _, err = s.Create(ctx, second, admin.ID); err != nil {
		t.Fatal(err)
	}
	token := []byte("hashed-token")
	if err = s.NewSession(ctx, second.ID, second.PasswordHash, token, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if u, err := s.Session(ctx, token); err != nil || u.ID != second.ID {
		t.Fatalf("session %v %v", u, err)
	}
	status := "disabled"
	if _, err = s.Update(ctx, admin.ID, second.ID, changes{Status: &status}); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Session(ctx, token); err != ErrNotFound {
		t.Fatalf("disabled session valid: %v", err)
	}
	if err = s.NewSession(ctx, second.ID, second.PasswordHash, []byte("new"), time.Now().Add(time.Hour)); err != ErrStale {
		t.Fatalf("stale account created session: %v", err)
	}
	if _, err = s.Update(ctx, admin.ID, admin.ID, changes{Status: &status}); err != ErrLastAdmin {
		t.Fatalf("last admin restriction: %v", err)
	}
	key := bucketHash("test-bucket")
	for i := 0; i < 4; i++ {
		ok, err := s.Attempt(ctx, key, 3, time.Minute)
		if err != nil || ok != (i < 3) {
			t.Fatalf("attempt %d %v %v", i, ok, err)
		}
	}

	a, err := New(s, origin, true)
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	a.Register(mux)
	cookie := loginAs(t, mux, admin.Email, adminPassword)
	var stored []byte
	if err := p.QueryRow(ctx, `SELECT token_hash FROM auth_sessions WHERE user_id=$1`, admin.ID).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if string(stored) == cookie.Value || string(stored) != string(tokenHash(cookie.Value)) {
		t.Fatal("session token not securely hashed in database")
	}
	// A fresh application instance can use persisted sessions, and logout revokes them everywhere.
	a2, err := New(s, origin, true)
	if err != nil {
		t.Fatal(err)
	}
	mux2 := http.NewServeMux()
	a2.Register(mux2)
	mustStatus(t, req(mux2, "GET", "/api/v1/auth/session", "", cookie, ""), 200)
	mustStatus(t, req(mux2, "POST", "/api/v1/auth/logout", "", cookie, origin), 200)
	mustStatus(t, req(mux, "GET", "/api/v1/auth/session", "", cookie, ""), 401)

	active := "active"
	if _, err = s.Update(ctx, admin.ID, second.ID, changes{Status: &active}); err != nil {
		t.Fatal(err)
	}
	results := make(chan error, 2)
	for _, id := range []string{admin.ID, second.ID} {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			_, e := s.Update(ctx, admin.ID, id, changes{Status: &status})
			results <- e
		}(id)
	}
	wg.Wait()
	close(results)
	success := 0
	for e := range results {
		if e == nil {
			success++
		} else if e != ErrLastAdmin && e != ErrForbidden {
			t.Fatal(e)
		}
	}
	if success != 1 {
		t.Fatalf("concurrent demotions succeeded %d times", success)
	}
	users, err = s.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	activeAdmins := 0
	for _, u := range users {
		if u.Role == "admin" && u.Status == "active" {
			activeAdmins++
		}
	}
	if activeAdmins != 1 {
		t.Fatalf("active administrators remaining: %d", activeAdmins)
	}
}
