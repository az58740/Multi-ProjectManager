package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"net/mail"
	"net/url"
	"os"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

const sessionCookieName = "mpm_session"
const sessionLifetime = 7 * 24 * time.Hour
const maxBody = 8192
const limitWindow = 15 * time.Minute

type Auth struct {
	store         Store
	publicOrigin  string
	allowedOrigins map[string]struct{}
	secure        bool
	dummyHash     []byte
}
type userContextKey struct{}

func New(store Store, origin string, production bool) (*Auth, error) {
	if store == nil {
		return nil, errors.New("auth store is required")
	}
	origin = strings.TrimSpace(origin)
	if origin == "" && !production {
		origin = "http://localhost:3000"
	}
	normalized, err := parseOrigin(origin)
	if err != nil || normalized != strings.TrimRight(origin, "/") || (production && !strings.HasPrefix(normalized, "https://")) {
		return nil, errors.New("PUBLIC_APP_ORIGIN must be an exact HTTPS origin in production (or HTTP(S) origin in development)")
	}
	dummy, err := bcrypt.GenerateFromPassword([]byte("constant-dummy-password-not-a-user"), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	allowedOrigins := map[string]struct{}{normalized: struct{}{}}
	if production {
		for _, host := range []string{os.Getenv("VERCEL_URL"), os.Getenv("VERCEL_PROJECT_PRODUCTION_URL")} {
			if deploymentOrigin, e := parseOrigin("https://" + strings.TrimSpace(host)); e == nil {
				allowedOrigins[deploymentOrigin] = struct{}{}
			}
		}
	}
	return &Auth{store: store, publicOrigin: normalized, allowedOrigins: allowedOrigins, secure: strings.HasPrefix(normalized, "https://"), dummyHash: dummy}, nil
}
func (a *Auth) Bootstrap(ctx context.Context, email, password string) (bool, error) {
	if email == "" && password == "" {
		return false, nil
	}
	if email == "" || password == "" {
		return false, errors.New("both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required")
	}
	email, ok := validEmail(email)
	if !ok || !validPassword(password) {
		return false, errors.New("invalid bootstrap administrator email or password (password must be 4–72 bytes)")
	}
	id, err := newID()
	if err != nil {
		return false, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return false, err
	}
	return a.store.Bootstrap(ctx, record{User: User{ID: id, Name: "مدیر سامانه", Email: email, Role: "admin", Status: "active", CreatedAt: time.Now().UTC()}, PasswordHash: string(hash)})
}
func (a *Auth) Register(mux *http.ServeMux) {
	mux.Handle("POST /api/v1/auth/register", a.RequireSameOrigin(http.HandlerFunc(a.register)))
	mux.Handle("POST /api/v1/auth/login", a.RequireSameOrigin(http.HandlerFunc(a.login)))
	mux.HandleFunc("GET /api/v1/auth/session", a.session)
	mux.Handle("POST /api/v1/auth/logout", a.RequireSameOrigin(http.HandlerFunc(a.logout)))
	mux.Handle("GET /api/v1/users", a.RequireSession(a.requireAdmin(http.HandlerFunc(a.listUsers))))
	mux.Handle("POST /api/v1/users", a.RequireSameOrigin(a.RequireSession(a.requireAdmin(http.HandlerFunc(a.createUser)))))
	mux.Handle("PATCH /api/v1/users/{id}", a.RequireSameOrigin(a.RequireSession(a.requireAdmin(http.HandlerFunc(a.updateUser)))))
}
func parseOrigin(value string) (string, error) {
	u, err := url.Parse(value)
	if err != nil || u.Opaque != "" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || (u.Scheme != "http" && u.Scheme != "https") || (u.Path != "" && u.Path != "/") {
		return "", errors.New("invalid origin")
	}
	return u.Scheme + "://" + u.Host, nil
}
func (a *Auth) RequireSameOrigin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		origin, err := parseOrigin(r.Header.Get("Origin"))
			if err != nil || !a.isAllowedOrigin(origin) {
			writeError(w, http.StatusForbidden, "مبدأ درخواست معتبر نیست.")
			return
		}
		if x := r.Header.Get("X-App-Origin"); x != "" {
			v, e := parseOrigin(x)
				if e != nil || !a.isAllowedOrigin(v) {
				writeError(w, http.StatusForbidden, "مبدأ درخواست معتبر نیست.")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
func (a *Auth) isAllowedOrigin(origin string) bool {
	_, ok := a.allowedOrigins[origin]
	return ok
}
func (a *Auth) CurrentUser(r *http.Request) (User, error) {
	c, err := r.Cookie(sessionCookieName)
	if err != nil {
		return User{}, ErrNotFound
	}
	raw, err := base64.RawURLEncoding.DecodeString(c.Value)
	if err != nil || len(raw) != 32 || len(c.Value) != 43 {
		return User{}, ErrNotFound
	}
	return a.store.Session(r.Context(), tokenHash(c.Value))
}
func (a *Auth) RequireSession(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, err := a.CurrentUser(r)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				writeError(w, 401, "برای ادامه وارد سامانه شوید.")
			} else {
				writeError(w, 503, "بررسی نشست ممکن نشد.")
			}
			return
		}
		ctx := context.WithValue(r.Context(), userContextKey{}, u)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
func UserFromContext(ctx context.Context) (User, bool) {
	u, ok := ctx.Value(userContextKey{}).(User)
	return u, ok
}
func (a *Auth) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := UserFromContext(r.Context())
		if !ok || u.Role != "admin" || u.Status != "active" {
			writeError(w, 403, "دسترسی مدیر لازم است.")
			return
		}
		next.ServeHTTP(w, r)
	})
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		writeError(w, 415, "درخواست باید JSON باشد.")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBody)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err = d.Decode(v); err != nil {
		writeError(w, 400, "بدنهٔ درخواست معتبر نیست.")
		return false
	}
	var extra any
	if err = d.Decode(&extra); err != io.EOF {
		writeError(w, 400, "بدنهٔ درخواست معتبر نیست.")
		return false
	}
	return true
}
func validName(s string) (string, bool) {
	s = strings.TrimSpace(s)
	if !utf8.ValidString(s) || len([]rune(s)) < 1 || len([]rune(s)) > 120 {
		return "", false
	}
	for _, r := range s {
		if unicode.IsControl(r) {
			return "", false
		}
	}
	return s, true
}
func validEmail(s string) (string, bool) {
	s = strings.ToLower(strings.TrimSpace(s))
	if len(s) > 254 || len(s) < 3 || strings.ContainsAny(s, "\r\n\t ") {
		return "", false
	}
	a, err := mail.ParseAddress(s)
	if err != nil || a.Address != s || !strings.Contains(s, "@") {
		return "", false
	}
	return s, true
}
func validPassword(s string) bool {
	return utf8.ValidString(s) && len(s) >= 4 && len(s) <= 72 && !strings.ContainsRune(s, 0)
}
func validRole(s string) bool   { return s == "admin" || s == "user" }
func validStatus(s string) bool { return s == "active" || s == "pending" || s == "disabled" }
func (a *Auth) rate(w http.ResponseWriter, r *http.Request, kind, email string) bool {
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		ip = r.RemoteAddr
	}
	if ip == "" {
		ip = "unknown"
	}
	max := 100
	if kind == "register" {
		max = 20
	}
	ok, err := a.store.Attempt(r.Context(), bucketHash(kind+":ip:"+ip), max, limitWindow)
	if err != nil {
		writeError(w, 503, "بررسی محدودیت درخواست ممکن نشد.")
		return false
	}
	if !ok {
		w.Header().Set("Retry-After", "900")
		writeError(w, 429, "تعداد تلاش‌ها بیش از حد مجاز است؛ بعداً تلاش کنید.")
		return false
	}
	ok, err = a.store.Attempt(r.Context(), bucketHash(kind+":email:"+email), 10, limitWindow)
	if err != nil {
		writeError(w, 503, "بررسی محدودیت درخواست ممکن نشد.")
		return false
	}
	if !ok {
		w.Header().Set("Retry-After", "900")
		writeError(w, 429, "تعداد تلاش‌ها بیش از حد مجاز است؛ بعداً تلاش کنید.")
		return false
	}
	return true
}

type newUserInput struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role,omitempty"`
	Status   string `json:"status,omitempty"`
}

func (a *Auth) makeRecord(in newUserInput) (record, error) {
	name, ok := validName(in.Name)
	if !ok {
		return record{}, errors.New("name")
	}
	email, ok := validEmail(in.Email)
	if !ok || !validPassword(in.Password) || !validRole(in.Role) || !validStatus(in.Status) {
		return record{}, errors.New("invalid user")
	}
	id, err := newID()
	if err != nil {
		return record{}, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return record{}, err
	}
	return record{User: User{ID: id, Name: name, Email: email, Role: in.Role, Status: in.Status, CreatedAt: time.Now().UTC()}, PasswordHash: string(hash)}, nil
}
func (a *Auth) register(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decode(w, r, &in) {
		return
	}
	email, ok := validEmail(in.Email)
	if !ok || !validPassword(in.Password) {
		writeError(w, 400, "ایمیل یا رمز عبور معتبر نیست؛ رمز باید ۴ تا ۷۲ بایت باشد.")
		return
	}
	if _, ok = validName(in.Name); !ok {
		writeError(w, 400, "نام معتبر نیست.")
		return
	}
	if !a.rate(w, r, "register", email) {
		return
	}
	rec, err := a.makeRecord(newUserInput{Name: in.Name, Email: email, Password: in.Password, Role: "user", Status: "active"})
	if err != nil {
		writeError(w, 500, "ثبت‌نام ممکن نشد.")
		return
	}
	_, err = a.store.Create(r.Context(), rec, "")
	if err != nil {
		storeError(w, err)
		return
	}
	writeJSON(w, 201, map[string]string{"message": "حساب با موفقیت ایجاد شد؛ اکنون می‌توانید وارد شوید.", "status": "active"})
}
func (a *Auth) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decode(w, r, &in) {
		return
	}
	email, ok := validEmail(in.Email)
	if !ok || len(in.Password) == 0 || len(in.Password) > 72 {
		writeError(w, 400, "ایمیل یا رمز عبور نادرست است.")
		return
	}
	if !a.rate(w, r, "login", email) {
		return
	}
	u, err := a.store.ByEmail(r.Context(), email)
	if err != nil && !errors.Is(err, ErrNotFound) {
		writeError(w, 503, "ورود موقتاً ممکن نیست.")
		return
	}
	hash := a.dummyHash
	if err == nil {
		hash = []byte(u.PasswordHash)
	}
	check := bcrypt.CompareHashAndPassword(hash, []byte(in.Password))
	if err != nil || check != nil {
		writeError(w, 401, "ایمیل یا رمز عبور نادرست است.")
		return
	}
	if u.Status == "pending" {
		writeJSON(w, 403, map[string]string{"code": "pending", "error": "حساب در انتظار تأیید مدیر است."})
		return
	}
	if u.Status != "active" {
		writeJSON(w, 403, map[string]string{"code": "disabled", "error": "حساب غیرفعال است."})
		return
	}
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		writeError(w, 500, "ساخت نشست ممکن نشد.")
		return
	}
	token := base64.RawURLEncoding.EncodeToString(b)
	expiry := time.Now().UTC().Add(sessionLifetime)
	if err = a.store.NewSession(r.Context(), u.ID, u.PasswordHash, tokenHash(token), expiry); err != nil {
		if errors.Is(err, ErrStale) {
			writeError(w, 401, "حساب تغییر کرده است؛ دوباره وارد شوید.")
		} else {
			writeError(w, 503, "ساخت نشست ممکن نشد.")
		}
		return
	}
	if old, e := r.Cookie(sessionCookieName); e == nil && old.Value != token {
		if err = a.store.DeleteSession(r.Context(), tokenHash(old.Value)); err != nil {
			_ = a.store.DeleteSession(r.Context(), tokenHash(token))
			writeError(w, 503, "ساخت نشست ممکن نشد.")
			return
		}
	}
	a.setCookie(w, token, expiry)
	writeSession(w, u.User)
}
func (a *Auth) session(w http.ResponseWriter, r *http.Request) {
	u, err := a.CurrentUser(r)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			writeError(w, 401, "نشست فعالی پیدا نشد.")
		} else {
			writeError(w, 503, "بررسی نشست ممکن نشد.")
		}
		return
	}
	writeSession(w, u)
}
func writeSession(w http.ResponseWriter, u User) {
	writeJSON(w, 200, map[string]any{"authenticated": true, "authorized": true, "user": map[string]string{"id": u.ID, "name": u.Name, "email": u.Email, "role": u.Role, "status": u.Status}})
}
func (a *Auth) cookieSameSite() http.SameSite {
	// HTTPS Preview may be embedded on another site. Local HTTP remains strict.
	if a.secure {
		return http.SameSiteNoneMode
	}
	return http.SameSiteStrictMode
}
func (a *Auth) setCookie(w http.ResponseWriter, value string, expiry time.Time) {
	http.SetCookie(w, &http.Cookie{Name: sessionCookieName, Value: value, Path: "/", HttpOnly: true, Secure: a.secure, SameSite: a.cookieSameSite(), MaxAge: int(sessionLifetime.Seconds()), Expires: expiry})
}
func (a *Auth) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookieName); err == nil {
		if err = a.store.DeleteSession(r.Context(), tokenHash(c.Value)); err != nil {
			writeError(w, 503, "خروج ممکن نشد.")
			return
		}
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookieName, Value: "", Path: "/", HttpOnly: true, Secure: a.secure, SameSite: a.cookieSameSite(), MaxAge: -1, Expires: time.Unix(0, 0)})
	writeJSON(w, 200, map[string]bool{"ok": true})
}
func (a *Auth) listUsers(w http.ResponseWriter, r *http.Request) {
	items, err := a.store.List(r.Context())
	if err != nil {
		writeError(w, 503, "دریافت کاربران ممکن نشد.")
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}
func (a *Auth) createUser(w http.ResponseWriter, r *http.Request) {
	var in newUserInput
	if !decode(w, r, &in) {
		return
	}
	if _, ok := validName(in.Name); !ok {
		writeError(w, 400, "نام معتبر نیست.")
		return
	}
	if _, ok := validEmail(in.Email); !ok || !validPassword(in.Password) || !validRole(in.Role) || !validStatus(in.Status) {
		writeError(w, 400, "ورودی کاربر معتبر نیست؛ رمز باید ۴ تا ۷۲ بایت باشد.")
		return
	}
	rec, err := a.makeRecord(in)
	if err != nil {
		writeError(w, 500, "ساخت کاربر ممکن نشد.")
		return
	}
	actor, _ := UserFromContext(r.Context())
	u, err := a.store.Create(r.Context(), rec, actor.ID)
	if err != nil {
		storeError(w, err)
		return
	}
	writeJSON(w, 201, u)
}
func (a *Auth) updateUser(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name     *string `json:"name"`
		Role     *string `json:"role"`
		Status   *string `json:"status"`
		Password *string `json:"password"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Name == nil && in.Role == nil && in.Status == nil && in.Password == nil {
		writeError(w, 400, "حداقل یک تغییر لازم است.")
		return
	}
	if in.Name != nil {
		n, ok := validName(*in.Name)
		if !ok {
			writeError(w, 400, "نام معتبر نیست.")
			return
		}
		in.Name = &n
	}
	if (in.Role != nil && !validRole(*in.Role)) || (in.Status != nil && !validStatus(*in.Status)) || (in.Password != nil && !validPassword(*in.Password)) {
		writeError(w, 400, "ورودی کاربر معتبر نیست؛ رمز باید ۴ تا ۷۲ بایت باشد.")
		return
	}
	c := changes{Name: in.Name, Role: in.Role, Status: in.Status}
	if in.Password != nil {
		h, err := bcrypt.GenerateFromPassword([]byte(*in.Password), bcrypt.DefaultCost)
		if err != nil {
			writeError(w, 500, "تغییر رمز ممکن نشد.")
			return
		}
		v := string(h)
		c.PasswordHash = &v
	}
	actor, _ := UserFromContext(r.Context())
	u, err := a.store.Update(r.Context(), actor.ID, r.PathValue("id"), c)
	if err != nil {
		storeError(w, err)
		return
	}
	writeJSON(w, 200, u)
}
func storeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrConflict):
		writeError(w, 409, "این ایمیل قبلاً ثبت شده است.")
	case errors.Is(err, ErrLastAdmin):
		writeError(w, 409, "حداقل یک مدیر فعال باید باقی بماند.")
	case errors.Is(err, ErrNotFound):
		writeError(w, 404, "کاربر پیدا نشد.")
	case errors.Is(err, ErrForbidden):
		writeError(w, 403, "دسترسی مدیر لازم است.")
	default:
		writeError(w, 503, "عملیات موقتاً ممکن نیست.")
	}
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
