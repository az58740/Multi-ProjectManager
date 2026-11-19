package auth

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const sessionCookieName = "webdev_app_session"
const stateCookieName = "webdev_oauth_state"
const callbackPath = "/api/v1/auth/callback"

type User struct {
	OpenID string `json:"openId"`
}

type OAuth struct {
	projectID    string
	portalURL    string
	apiURL       string
	jwtSecret    []byte
	publicOrigin string
	allowedIDs   map[string]struct{}
	httpClient   *http.Client
}

type oauthState struct {
	RedirectURI string `json:"redirectUri"`
	Nonce       string `json:"nonce"`
}

type tokenResponse struct {
	AccessToken string `json:"accessToken"`
}

type userInfoResponse struct {
	OpenID string `json:"openId"`
	Name   string `json:"name"`
	Email  string `json:"email"`
}

func NewFromEnv() *OAuth {
	return &OAuth{
		projectID:    strings.TrimSpace(os.Getenv("MANUS_PROJECT_ID")),
		portalURL:    strings.TrimSpace(os.Getenv("MANUS_OAUTH_PORTAL_URL")),
		apiURL:       strings.TrimRight(strings.TrimSpace(os.Getenv("MANUS_OAUTH_API_URL")), "/"),
		jwtSecret:    []byte(os.Getenv("MANUS_JWT_SECRET")),
		publicOrigin: strings.TrimRight(strings.TrimSpace(os.Getenv("PUBLIC_APP_ORIGIN")), "/"),
		allowedIDs:   ParseOpenIDAllowlist(os.Getenv("APP_ALLOWED_OPEN_IDS")),
		httpClient:   &http.Client{Timeout: 15 * time.Second},
	}
}

func ParseOpenIDAllowlist(value string) map[string]struct{} {
	allowed := make(map[string]struct{})
	for _, id := range strings.Split(value, ",") {
		if id = strings.TrimSpace(id); id != "" {
			allowed[id] = struct{}{}
		}
	}
	return allowed
}

func (o *OAuth) HasOpenIDAllowlist() bool {
	return len(o.allowedIDs) > 0
}

func (o *OAuth) Configured() bool {
	requireHTTPS := o.requiresPublicOrigin()
	if o.projectID == "" || len(o.jwtSecret) == 0 || !validProviderBase(o.portalURL, requireHTTPS) || !validProviderBase(o.apiURL, requireHTTPS) {
		return false
	}
	if !requireHTTPS {
		return true
	}
	origin, err := parseOrigin(o.publicOrigin)
	return err == nil && origin == o.publicOrigin && strings.HasPrefix(origin, "https://")
}

func validProviderBase(value string, requireHTTPS bool) bool {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.Opaque != "" {
		return false
	}
	if requireHTTPS {
		return parsed.Scheme == "https"
	}
	return parsed.Scheme == "https" || parsed.Scheme == "http"
}

func (o *OAuth) OpenIDAllowed(openID string) bool {
	if len(o.allowedIDs) == 0 {
		return true // the API refuses persistent storage without an allowlist
	}
	_, ok := o.allowedIDs[openID]
	return ok
}

func (o *OAuth) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/auth/start", o.start)
	mux.HandleFunc("GET /api/v1/auth/callback", o.callback)
	mux.HandleFunc("GET /api/v1/auth/session", o.session)
	mux.Handle("POST /api/v1/auth/logout", o.RequireSameOrigin(http.HandlerFunc(o.logout)))
}

func (o *OAuth) RequireSession(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !o.Configured() {
			writeError(w, http.StatusServiceUnavailable, "احراز هویت در این محیط پیکربندی نشده است.")
			return
		}
		cookie, err := r.Cookie(sessionCookieName)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "برای ادامه وارد سامانه شوید.")
			return
		}
		user, err := o.readSession(cookie.Value)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "نشست معتبر نیست؛ دوباره وارد شوید.")
			return
		}
		ctx := context.WithValue(r.Context(), userContextKey{}, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (o *OAuth) RequireAllowedUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := UserFromContext(r.Context())
		if !ok {
			writeError(w, http.StatusUnauthorized, "برای ادامه وارد سامانه شوید.")
			return
		}
		if !o.OpenIDAllowed(user.OpenID) {
			writeError(w, http.StatusForbidden, "این حساب کاربری برای دسترسی به داده‌های شرکت مجاز نشده است.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (o *OAuth) RequireSameOrigin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		origin, originErr := parseOrigin(r.Header.Get("Origin"))
		appOrigin, appOriginErr := parseOrigin(r.Header.Get("X-App-Origin"))
		if originErr != nil || appOriginErr != nil || origin != appOrigin || (o.publicOrigin != "" && origin != o.publicOrigin) {
			writeError(w, http.StatusForbidden, "مبدأ درخواست معتبر نیست.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

type userContextKey struct{}

func UserFromContext(ctx context.Context) (User, bool) {
	user, ok := ctx.Value(userContextKey{}).(User)
	return user, ok
}

func (o *OAuth) CurrentUser(r *http.Request) (User, error) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return User{}, errors.New("no session")
	}
	return o.readSession(cookie.Value)
}

func (o *OAuth) start(w http.ResponseWriter, r *http.Request) {
	if !o.Configured() {
		writeError(w, http.StatusServiceUnavailable, "ورود با حساب Manus در این محیط هنوز پیکربندی نشده است.")
		return
	}

	origin, err := parseOrigin(r.Header.Get("X-App-Origin"))
	requestOrigin, originErr := parseOrigin(r.Header.Get("Origin"))
	if err != nil || originErr != nil || origin != requestOrigin {
		writeError(w, http.StatusForbidden, "مبدأ درخواست ورود معتبر نیست.")
		return
	}
	if o.publicOrigin != "" && origin != o.publicOrigin {
		writeError(w, http.StatusForbidden, "این نشانی برای ورود مجاز نیست.")
		return
	}

	nonce, err := randomToken(32)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "آغاز ورود ممکن نشد.")
		return
	}
	redirectURI := origin + callbackPath
	stateBytes, err := json.Marshal(oauthState{RedirectURI: redirectURI, Nonce: nonce})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "آغاز ورود ممکن نشد.")
		return
	}
	state := base64.RawURLEncoding.EncodeToString(stateBytes)
	setCookie(w, stateCookieName, nonce, origin, 5*time.Minute, true)

	portal, err := url.Parse(o.portalURL)
	if err != nil || portal.Host == "" {
		writeError(w, http.StatusServiceUnavailable, "نشانی سرویس ورود معتبر نیست.")
		return
	}
	portal.Path = strings.TrimRight(portal.Path, "/") + "/app-auth"
	query := portal.Query()
	query.Set("appId", o.projectID)
	query.Set("redirectUri", redirectURI)
	query.Set("state", state)
	query.Set("responseType", "code")
	portal.RawQuery = query.Encode()
	writeJSON(w, http.StatusOK, map[string]string{"authorizationUrl": portal.String()})
}

func (o *OAuth) callback(w http.ResponseWriter, r *http.Request) {
	stateCookie, cookieErr := r.Cookie(stateCookieName)
	stateValue := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")
	state, stateErr := decodeState(stateValue)
	if cookieErr != nil || stateErr != nil || subtle.ConstantTimeCompare([]byte(state.Nonce), []byte(stateCookie.Value)) != 1 {
		clearCookie(w, stateCookieName, "")
		http.Error(w, "ورود کامل نشد؛ لطفاً دوباره تلاش کنید.", http.StatusBadRequest)
		return
	}
	origin, err := originFromRedirectURI(state.RedirectURI)
	if err != nil || !o.Configured() {
		clearCookie(w, stateCookieName, "")
		http.Error(w, "پیکربندی ورود کامل نیست.", http.StatusServiceUnavailable)
		return
	}
	if o.requiresPublicOrigin() && origin != o.publicOrigin {
		http.Error(w, "نشانی بازگشت ورود مجاز نیست.", http.StatusForbidden)
		return
	}
	if o.publicOrigin != "" && origin != o.publicOrigin {
		http.Error(w, "نشانی بازگشت ورود مجاز نیست.", http.StatusForbidden)
		return
	}
	if providerError := r.URL.Query().Get("error"); providerError != "" {
		clearCookie(w, stateCookieName, origin)
		http.Redirect(w, r, origin+"/login?error=oauth", http.StatusSeeOther)
		return
	}
	if code == "" {
		clearCookie(w, stateCookieName, origin)
		http.Error(w, "ورود کامل نشد؛ لطفاً دوباره تلاش کنید.", http.StatusBadRequest)
		return
	}

	var exchanged tokenResponse
	err = o.postJSON(r.Context(), "/webdev.v1.WebDevAuthPublicService/ExchangeToken", map[string]string{
		"clientId":    o.projectID,
		"grantType":   "authorization_code",
		"code":        code,
		"redirectUri": state.RedirectURI,
	}, &exchanged)
	if err != nil || exchanged.AccessToken == "" {
		log.Printf("OAuth token exchange failed: %v", safeError(err))
		clearCookie(w, stateCookieName, origin)
		http.Redirect(w, r, origin+"/login?error=oauth", http.StatusSeeOther)
		return
	}

	var profile userInfoResponse
	err = o.postJSON(r.Context(), "/webdev.v1.WebDevAuthPublicService/GetUserInfo", map[string]string{
		"accessToken": exchanged.AccessToken,
	}, &profile)
	if err != nil || profile.OpenID == "" {
		log.Printf("OAuth identity lookup failed: %v", safeError(err))
		clearCookie(w, stateCookieName, origin)
		http.Redirect(w, r, origin+"/login?error=oauth", http.StatusSeeOther)
		return
	}

	session, err := o.signSession(profile.OpenID, 7*24*time.Hour)
	if err != nil {
		log.Printf("OAuth session creation failed: %v", err)
		clearCookie(w, stateCookieName, origin)
		http.Error(w, "ساخت نشست ورود ممکن نشد.", http.StatusInternalServerError)
		return
	}
	setCookie(w, sessionCookieName, session, origin, 7*24*time.Hour, true)
	clearCookie(w, stateCookieName, origin)
	http.Redirect(w, r, origin+"/dashboard", http.StatusSeeOther)
}

func (o *OAuth) session(w http.ResponseWriter, r *http.Request) {
	if !o.Configured() {
		writeError(w, http.StatusServiceUnavailable, "احراز هویت در این محیط هنوز پیکربندی نشده است.")
		return
	}
	user, err := o.CurrentUser(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "نشست فعالی پیدا نشد.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"authenticated": true,
		"authorized":    o.OpenIDAllowed(user.OpenID),
		"user":          map[string]string{"openId": user.OpenID},
	})
}

func (o *OAuth) logout(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if parsed, err := parseOrigin(origin); err == nil {
		clearCookie(w, sessionCookieName, parsed)
	} else {
		clearCookie(w, sessionCookieName, "")
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (o *OAuth) postJSON(ctx context.Context, endpoint string, requestBody any, result any) error {
	body, err := json.Marshal(requestBody)
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, o.apiURL+endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := o.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("OAuth provider returned HTTP %d", response.StatusCode)
	}
	limited := io.LimitReader(response.Body, 1<<20)
	return json.NewDecoder(limited).Decode(result)
}

func parseOrigin(value string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Scheme != "https" && parsed.Scheme != "http") || (parsed.Path != "" && parsed.Path != "/") {
		return "", errors.New("invalid origin")
	}
	return parsed.Scheme + "://" + parsed.Host, nil
}

func (o *OAuth) requiresPublicOrigin() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("APP_ENV")), "production") || os.Getenv("VERCEL") == "1"
}

func originFromRedirectURI(value string) (string, error) {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Path != callbackPath || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("invalid callback URI")
	}
	return parseOrigin(parsed.Scheme + "://" + parsed.Host)
}

func decodeState(value string) (oauthState, error) {
	var state oauthState
	data, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return state, err
	}
	err = json.Unmarshal(data, &state)
	if err != nil || state.Nonce == "" {
		return state, errors.New("invalid OAuth state")
	}
	return state, nil
}

func randomToken(byteCount int) (string, error) {
	value := make([]byte, byteCount)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func setCookie(w http.ResponseWriter, name, value, origin string, lifetime time.Duration, httpOnly bool) {
	secure := strings.HasPrefix(origin, "https://")
	sameSite := http.SameSiteLaxMode
	if secure {
		sameSite = http.SameSiteNoneMode
	}
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		HttpOnly: httpOnly,
		Secure:   secure,
		SameSite: sameSite,
		MaxAge:   int(lifetime.Seconds()),
		Expires:  time.Now().Add(lifetime),
	})
}

func clearCookie(w http.ResponseWriter, name, origin string) {
	secure := strings.HasPrefix(origin, "https://")
	sameSite := http.SameSiteLaxMode
	if secure {
		sameSite = http.SameSiteNoneMode
	}
	http.SetCookie(w, &http.Cookie{
		Name: name, Value: "", Path: "/", HttpOnly: true,
		Secure: secure, SameSite: sameSite, MaxAge: -1, Expires: time.Unix(0, 0),
	})
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

func safeError(err error) any {
	if err == nil {
		return "missing provider response"
	}
	return err
}
