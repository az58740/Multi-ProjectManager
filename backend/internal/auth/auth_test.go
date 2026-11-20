package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

const origin = "https://app.example.test"
const adminEmail = "admin@example.test"
const adminPassword = "admin-password-very-safe"
const userPassword = "1234"

func setup(t *testing.T) (*Auth, *http.ServeMux) {
	t.Helper()
	a, err := New(NewMemoryStore(), origin, true)
	if err != nil {
		t.Fatal(err)
	}
	created, err := a.Bootstrap(context.Background(), adminEmail, adminPassword)
	if err != nil || !created {
		t.Fatalf("bootstrap %v %v", created, err)
	}
	mux := http.NewServeMux()
	a.Register(mux)
	mux.Handle("/api/v1/projects", a.RequireSameOrigin(a.RequireSession(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))))
	return a, mux
}
func req(mux http.Handler, method, path, body string, cookie *http.Cookie, orig string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	if orig != "" {
		r.Header.Set("Origin", orig)
	}
	if cookie != nil {
		r.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	return w
}
func mustStatus(t *testing.T, w *httptest.ResponseRecorder, code int) {
	t.Helper()
	if w.Code != code {
		t.Fatalf("status=%d want=%d body=%s", w.Code, code, w.Body.String())
	}
}
func loginAs(t *testing.T, mux http.Handler, email, password string) *http.Cookie {
	t.Helper()
	data, _ := json.Marshal(map[string]string{"email": email, "password": password})
	w := req(mux, "POST", "/api/v1/auth/login", string(data), nil, origin)
	mustStatus(t, w, 200)
	if len(w.Result().Cookies()) != 1 {
		t.Fatal("missing session cookie")
	}
	return w.Result().Cookies()[0]
}
func userID(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var p struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &p); err != nil || p.ID == "" {
		t.Fatalf("expected user response: %s %v", w.Body.String(), err)
	}
	return p.ID
}
func TestSecurityFlows(t *testing.T) {
	_, m := setup(t)
	registration := `{"name":"Member","email":"MEMBER@example.test","password":"` + userPassword + `"}`
	mustStatus(t, req(m, "POST", "/api/v1/auth/register", registration, nil, ""), 403)
	mustStatus(t, req(m, "POST", "/api/v1/auth/register", registration, nil, "https://evil.example"), 403)
	mustStatus(t, req(m, "POST", "/api/v1/auth/register", `{"name":"X","email":"x@example.test","password":"member-password-safe","role":"admin"}`, nil, origin), 400)
	w := req(m, "POST", "/api/v1/auth/register", registration, nil, origin)
	mustStatus(t, w, 201)
	mustStatus(t, req(m, "POST", "/api/v1/auth/register", registration, nil, origin), 409)
	if len(w.Result().Cookies()) != 0 || !strings.Contains(w.Body.String(), `"active"`) {
		t.Fatal("registration should create an active account without a session")
	}
	w = req(m, "POST", "/api/v1/auth/login", `{"email":"member@example.test","password":"`+userPassword+`"}`, nil, origin)
	mustStatus(t, w, 200)
	w = req(m, "POST", "/api/v1/auth/login", `{"email":"  MEMBER@EXAMPLE.TEST  ","password":"`+userPassword+`"}`, nil, origin)
	mustStatus(t, w, 200)
	mustStatus(t, req(m, "GET", "/api/v1/projects", "", nil, ""), 401)
	mustStatus(t, req(m, "GET", "/api/v1/auth/session", "", nil, ""), 401)
	mustStatus(t, req(m, "POST", "/api/v1/auth/login", `{"email":"admin@example.test","password":"wrong"}`, nil, origin), 401)
	admin := loginAs(t, m, adminEmail, adminPassword)
	if !admin.HttpOnly || !admin.Secure || admin.SameSite != http.SameSiteNoneMode || admin.Path != "/" || admin.MaxAge <= 0 {
		t.Fatalf("unsafe cookie: %#v", admin)
	}
	w = req(m, "GET", "/api/v1/users", "", admin, "")
	mustStatus(t, w, 200)
	var list struct {
		Items []User `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil || len(list.Items) != 2 {
		t.Fatalf("list %s %v", w.Body.String(), err)
	}
	var member, adminID string
	for _, u := range list.Items {
		if u.Email == "member@example.test" {
			member = u.ID
			if u.Role != "user" || u.Status != "active" {
				t.Fatal(u)
			}
		} else {
			adminID = u.ID
		}
	}
	mustStatus(t, req(m, "PATCH", "/api/v1/users/"+adminID, `{"role":"user"}`, admin, origin), 409)
	mustStatus(t, req(m, "PATCH", "/api/v1/users/"+adminID, `{"status":"disabled"}`, admin, origin), 409)
	user := loginAs(t, m, "member@example.test", userPassword)
	mustStatus(t, req(m, "GET", "/api/v1/projects", "", user, ""), 204)
	mustStatus(t, req(m, "POST", "/api/v1/projects", "{}", user, "https://evil.example"), 403)
	mustStatus(t, req(m, "GET", "/api/v1/users", "", user, ""), 403)
	mustStatus(t, req(m, "PATCH", "/api/v1/users/"+member, `{"role":"admin"}`, user, origin), 403)
	mustStatus(t, req(m, "POST", "/api/v1/users", `{"name":"Escalation","email":"no@example.test","password":"some-long-password","role":"admin","status":"active"}`, user, origin), 403)
	mustStatus(t, req(m, "PATCH", "/api/v1/users/"+member, `{"status":"disabled"}`, admin, origin), 200)
	mustStatus(t, req(m, "GET", "/api/v1/projects", "", user, ""), 401)
	mustStatus(t, req(m, "GET", "/api/v1/auth/session", "", user, ""), 401)
	mustStatus(t, req(m, "POST", "/api/v1/auth/logout", "", admin, "https://evil.example"), 403)
	mustStatus(t, req(m, "POST", "/api/v1/auth/logout", "", admin, origin), 200)
	mustStatus(t, req(m, "GET", "/api/v1/auth/session", "", admin, ""), 401)
}
func TestCreateUpdateAndRevocation(t *testing.T) {
	_, m := setup(t)
	admin := loginAs(t, m, adminEmail, adminPassword)
	w := req(m, "POST", "/api/v1/users", `{"name":"Second","email":"second@example.test","password":"1234","role":"admin","status":"active"}`, admin, origin)
	mustStatus(t, w, 201)
	id := userID(t, w)
	second := loginAs(t, m, "second@example.test", userPassword)
	mustStatus(t, req(m, "PATCH", "/api/v1/users/"+id, `{"password":"replacement-password-safe"}`, admin, origin), 200)
	mustStatus(t, req(m, "GET", "/api/v1/auth/session", "", second, ""), 401)
	mustStatus(t, req(m, "POST", "/api/v1/auth/login", `{"email":"second@example.test","password":"1234"}`, nil, origin), 401)
	second = loginAs(t, m, "second@example.test", "replacement-password-safe")
	mustStatus(t, req(m, "PATCH", "/api/v1/users/"+id, `{"role":"user"}`, admin, origin), 200)
	mustStatus(t, req(m, "GET", "/api/v1/auth/session", "", second, ""), 401)
	mustStatus(t, req(m, "POST", "/api/v1/users", `{"name":"Dup","email":"SECOND@example.test","password":"member-password-safe","role":"user","status":"active"}`, admin, origin), 409)
}
func TestBootstrapOneTimeAndConcurrent(t *testing.T) {
	s := NewMemoryStore()
	ctx := context.Background()
	var wg sync.WaitGroup
	created := make(chan bool, 24)
	for i := 0; i < 24; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			r := record{User: User{ID: fmt.Sprint(i), Email: fmt.Sprintf("%d@example.test", i), Role: "admin", Status: "active"}, PasswordHash: "hash"}
			ok, err := s.Bootstrap(ctx, r)
			if err != nil {
				t.Error(err)
			}
			created <- ok
		}(i)
	}
	wg.Wait()
	close(created)
	n := 0
	for ok := range created {
		if ok {
			n++
		}
	}
	if n != 1 {
		t.Fatalf("bootstrap winners %d", n)
	}
	all, _ := s.List(ctx)
	if len(all) != 1 {
		t.Fatal(all)
	}
}

func TestBootstrapNeverOverwritesOrPromotes(t *testing.T) {
	ctx := context.Background()
	a, mux := setup(t)
	created, err := a.Bootstrap(ctx, "other@example.test", "replacement-password-safe")
	if err != nil || created {
		t.Fatalf("second bootstrap changed existing store: %v %v", created, err)
	}
	loginAs(t, mux, adminEmail, adminPassword)
	store := NewMemoryStore()
	user := record{User: User{ID: "pending", Email: "pending@example.test", Role: "user", Status: "pending"}, PasswordHash: "hash"}
	if _, err := store.Create(ctx, user, ""); err != nil {
		t.Fatal(err)
	}
	bootstrap, err := New(store, origin, true)
	if err != nil {
		t.Fatal(err)
	}
	created, err = bootstrap.Bootstrap(ctx, adminEmail, adminPassword)
	if err != nil || created {
		t.Fatalf("bootstrap must not create or promote an account after registration: %v %v", created, err)
	}
	users, err := store.List(ctx)
	if err != nil || len(users) != 1 || users[0].Role != "user" || users[0].Status != "pending" {
		t.Fatalf("pending user unexpectedly changed: %v %v", users, err)
	}
}

func TestSessionExpiryAndAtomicLastAdmin(t *testing.T) {
	s := NewMemoryStore()
	ctx := context.Background()
	one := record{User: User{ID: "1", Email: "1@x", Role: "admin", Status: "active"}, PasswordHash: "hash"}
	two := record{User: User{ID: "2", Email: "2@x", Role: "admin", Status: "active"}, PasswordHash: "hash"}
	s.Bootstrap(ctx, one)
	s.Create(ctx, two, "1")
	if err := s.NewSession(ctx, "1", "hash", []byte("expired"), time.Now().Add(-time.Second)); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Session(ctx, []byte("expired")); err != ErrNotFound {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for _, id := range []string{"1", "2"} {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			status := "disabled"
			_, err := s.Update(ctx, "1", id, changes{Status: &status})
			results <- err
		}(id)
	}
	wg.Wait()
	close(results)
	n := 0
	for e := range results {
		if e == nil {
			n++
		}
	}
	if n != 1 {
		t.Fatalf("successful demotions=%d", n)
	}
	users, _ := s.List(ctx)
	active := 0
	for _, u := range users {
		if u.Role == "admin" && u.Status == "active" {
			active++
		}
	}
	if active != 1 {
		t.Fatal(users)
	}
}
func TestLimitsInputAndOrigin(t *testing.T) {
	a, m := setup(t)
	for i := 0; i < 11; i++ {
		w := req(m, "POST", "/api/v1/auth/login", `{"email":"nobody@example.test","password":"long-wrong-password"}`, nil, origin)
		if i < 10 {
			mustStatus(t, w, 401)
		} else {
			mustStatus(t, w, 429)
			if w.Header().Get("Retry-After") == "" {
				t.Fatal("retry header missing")
			}
		}
	}
	mustStatus(t, req(m, "POST", "/api/v1/auth/login", `{"email":"admin@example.test","password":"x"}`+strings.Repeat(" ", 9000), nil, origin), 400)
	admin := loginAs(t, m, adminEmail, adminPassword)
	r := httptest.NewRequest("POST", "/api/v1/auth/logout", bytes.NewBuffer(nil))
	r.Header.Set("Origin", origin)
	r.Header.Set("X-App-Origin", "https://evil.example")
	r.AddCookie(admin)
	w := httptest.NewRecorder()
	m.ServeHTTP(w, r)
	mustStatus(t, w, 403)
	if _, err := New(NewMemoryStore(), "http://app.example.test", true); err == nil {
		t.Fatal("production allowed HTTP origin")
	}
	if _, err := New(NewMemoryStore(), "", true); err == nil {
		t.Fatal("production allowed missing origin")
	}
	if a.secure != true {
		t.Fatal("HTTPS cookie not secure")
	}
}

func TestCookieModesForPreviewAndLocal(t *testing.T) {
	for _, tc := range []struct {
		origin string
		secure bool
		mode   http.SameSite
	}{
		{"http://localhost:3000", false, http.SameSiteStrictMode},
		{"https://app.example.test", true, http.SameSiteNoneMode},
	} {
		a, err := New(NewMemoryStore(), tc.origin, false)
		if err != nil {
			t.Fatal(err)
		}
		w := httptest.NewRecorder()
		a.setCookie(w, "example", time.Now().Add(time.Hour))
		cookies := w.Result().Cookies()
		if len(cookies) != 1 || cookies[0].Secure != tc.secure || cookies[0].SameSite != tc.mode {
			t.Fatalf("origin %s: cookie %v", tc.origin, cookies)
		}
	}
}
