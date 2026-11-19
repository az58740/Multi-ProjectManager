package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

func TestSessionRoundTripAndAppBinding(t *testing.T) {
	auth := &OAuth{projectID: "project-1", jwtSecret: []byte("test-secret")}
	token, err := auth.signSession("user-123", time.Hour)
	if err != nil {
		t.Fatalf("signSession: %v", err)
	}
	user, err := auth.readSession(token)
	if err != nil {
		t.Fatalf("readSession: %v", err)
	}
	if user.OpenID != "user-123" {
		t.Fatalf("OpenID = %q, want user-123", user.OpenID)
	}

	wrongProject := &OAuth{projectID: "project-2", jwtSecret: []byte("test-secret")}
	if _, err := wrongProject.readSession(token); err == nil {
		t.Fatal("expected a session signed for another project to be rejected")
	}
	wrongSecret := &OAuth{projectID: "project-1", jwtSecret: []byte("different-secret")}
	if _, err := wrongSecret.readSession(token); err == nil {
		t.Fatal("expected a session signed with another secret to be rejected")
	}
}

func TestExpiredSessionRejected(t *testing.T) {
	auth := &OAuth{projectID: "project-1", jwtSecret: []byte("test-secret")}
	token, err := auth.signSession("user-123", -time.Minute)
	if err != nil {
		t.Fatalf("signSession: %v", err)
	}
	if _, err := auth.readSession(token); err == nil {
		t.Fatal("expected expired session to be rejected")
	}
}

func TestRequireAllowedUser(t *testing.T) {
	oauth := &OAuth{allowedIDs: ParseOpenIDAllowlist("owner-1, member-2")}
	endpoint := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	for _, test := range []struct {
		openID string
		status int
	}{
		{openID: "member-2", status: http.StatusNoContent},
		{openID: "outsider", status: http.StatusForbidden},
	} {
		request := httptest.NewRequest(http.MethodGet, "/api/v1/projects", nil)
		ctx := context.WithValue(request.Context(), userContextKey{}, User{OpenID: test.openID})
		response := httptest.NewRecorder()
		oauth.RequireAllowedUser(endpoint).ServeHTTP(response, request.WithContext(ctx))
		if response.Code != test.status {
			t.Errorf("OpenID %q: status = %d, want %d", test.openID, response.Code, test.status)
		}
	}
}

func TestParseOpenIDAllowlist(t *testing.T) {
	allowed := ParseOpenIDAllowlist(" owner-1, member-2, ,owner-1 ")
	if len(allowed) != 2 {
		t.Fatalf("allowlist size = %d, want 2", len(allowed))
	}
	if _, ok := allowed["member-2"]; !ok {
		t.Fatal("expected trimmed member ID in allowlist")
	}
}

func TestRequireSameOrigin(t *testing.T) {
	oauth := &OAuth{publicOrigin: "https://app.example.test"}
	endpoint := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	for _, test := range []struct {
		origin    string
		appOrigin string
		status    int
	}{
		{origin: "https://app.example.test", appOrigin: "https://app.example.test", status: http.StatusNoContent},
		{origin: "https://attacker.example", appOrigin: "https://app.example.test", status: http.StatusForbidden},
		{origin: "https://app.example.test", status: http.StatusForbidden},
	} {
		request := httptest.NewRequest(http.MethodPost, "/api/v1/projects", nil)
		request.Header.Set("Origin", test.origin)
		request.Header.Set("X-App-Origin", test.appOrigin)
		response := httptest.NewRecorder()
		oauth.RequireSameOrigin(endpoint).ServeHTTP(response, request)
		if response.Code != test.status {
			t.Errorf("origin %q / app origin %q: status = %d, want %d", test.origin, test.appOrigin, response.Code, test.status)
		}
	}
}

func TestParseOrigin(t *testing.T) {
	got, err := parseOrigin("https://example.test")
	if err != nil || got != "https://example.test" {
		t.Fatalf("parseOrigin = %q, %v", got, err)
	}
	for _, value := range []string{"//example.test", "https://example.test/path", "https://user@example.test", "javascript:alert(1)"} {
		if _, err := parseOrigin(value); err == nil {
			t.Errorf("parseOrigin(%q) should fail", value)
		}
	}
}

func TestStartRejectsMismatchedBrowserOrigin(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("VERCEL", "")
	auth := &OAuth{
		projectID: "project-1", portalURL: "https://auth.example.test", apiURL: "https://api.example.test", jwtSecret: []byte("secret"),
	}
	request := httptest.NewRequest("POST", "/api/v1/auth/start", nil)
	request.Header.Set("Origin", "https://attacker.example")
	request.Header.Set("X-App-Origin", "https://app.example")
	response := httptest.NewRecorder()
	auth.start(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", response.Code)
	}
}

func TestProductionOAuthRequiresExactHTTPSOrigin(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("VERCEL", "")
	oauth := &OAuth{projectID: "project-1", portalURL: "https://auth.example.test", apiURL: "https://api.example.test", jwtSecret: []byte("secret")}
	request := httptest.NewRequest(http.MethodPost, "/api/v1/auth/start", nil)
	request.Header.Set("Origin", "https://app.example.test")
	request.Header.Set("X-App-Origin", "https://app.example.test")
	response := httptest.NewRecorder()
	oauth.start(response, request)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503 without PUBLIC_APP_ORIGIN", response.Code)
	}
}

func TestProductionProviderURLsRequireHTTPS(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("VERCEL", "")
	t.Setenv("PUBLIC_APP_ORIGIN", "https://app.example.test")
	base := OAuth{
		projectID: "project-1", portalURL: "https://auth.example.test", apiURL: "https://api.example.test",
		jwtSecret: []byte("secret"), publicOrigin: "https://app.example.test",
	}
	if !base.Configured() {
		t.Fatal("expected complete HTTPS production configuration to be accepted")
	}
	base.portalURL = "http://auth.example.test"
	if base.Configured() {
		t.Fatal("expected HTTP OAuth portal to be rejected in production")
	}
	base.portalURL = "https://auth.example.test"
	base.apiURL = "http://api.example.test"
	if base.Configured() {
		t.Fatal("expected HTTP OAuth API to be rejected in production")
	}
}

func TestStartUsesSecureCrossSiteStateCookie(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("VERCEL", "")
	auth := &OAuth{
		projectID: "project-1", portalURL: "https://auth.example.test", apiURL: "https://api.example.test", jwtSecret: []byte("secret"),
		httpClient: &http.Client{Timeout: time.Second},
	}
	request := httptest.NewRequest("POST", "/api/v1/auth/start", nil)
	request.Header.Set("Origin", "https://app.example.test")
	request.Header.Set("X-App-Origin", "https://app.example.test")
	response := httptest.NewRecorder()
	auth.start(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	cookie := response.Result().Cookies()[0]
	if cookie.Name != stateCookieName || !cookie.Secure || cookie.SameSite != http.SameSiteNoneMode || !cookie.HttpOnly {
		t.Fatalf("unexpected OAuth state cookie attributes: %#v", cookie)
	}
	var payload map[string]string
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode authorization response: %v", err)
	}
	authorizationURL, err := url.Parse(payload["authorizationUrl"])
	if err != nil {
		t.Fatalf("parse authorization URL: %v", err)
	}
	if authorizationURL.Path != "/app-auth" || authorizationURL.Query().Get("appId") != "project-1" || authorizationURL.Query().Get("responseType") != "code" {
		t.Fatalf("unexpected authorization URL: %s", authorizationURL)
	}
	if authorizationURL.Query().Get("state") == "" {
		t.Fatal("OAuth state was not populated")
	}
}
