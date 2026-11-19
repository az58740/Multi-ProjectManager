package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/az58740/multi-project-manager/backend/internal/auth"
	"github.com/az58740/multi-project-manager/backend/internal/projects"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	oauth := auth.NewFromEnv()
	if databaseURL != "" && !oauth.HasOpenIDAllowlist() {
		log.Fatal("APP_ALLOWED_OPEN_IDS is required when DATABASE_URL is configured")
	}
	var store projects.Store
	var closeStore func()
	dataMode := "database"
	if databaseURL != "" {
		postgresStore, err := projects.NewPostgresStore(ctx, databaseURL)
		if err != nil {
			log.Fatalf("database initialization failed: %v", err)
		}
		store = postgresStore
		closeStore = postgresStore.Close
	} else {
		if strings.EqualFold(os.Getenv("APP_ENV"), "production") || os.Getenv("VERCEL") == "1" {
			log.Fatal("DATABASE_URL is required in production; refusing to use ephemeral demo data")
		}
		log.Print("DEMO MODE: no DATABASE_URL configured; project data is temporary and stored in process memory")
		dataMode = "demo"
		store = projects.NewMemoryStore(projects.DemoProjects())
	}
	if closeStore != nil {
		defer closeStore()
	}

	mux := http.NewServeMux()
	oauth.Register(mux)

	projectMux := http.NewServeMux()
	projects.NewHandler(store, dataMode).Register(projectMux)
	projectAccess := oauth.RequireSession(oauth.RequireAllowedUser(oauth.RequireSameOrigin(projectMux)))
	mux.Handle("/api/v1/projects", projectAccess)
	mux.Handle("/api/v1/projects/", projectAccess)

	mux.HandleFunc("GET /_health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /_ready", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		if !oauth.Configured() {
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]string{"status": "not_ready", "reason": "oauth_not_configured"})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ready", "dataMode": dataMode})
	})

	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "8080"
	}
	server := &http.Server{
		Addr:              ":" + port,
		Handler:           securityHeaders(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("Go API listening on :%s", port)
	log.Fatal(server.ListenAndServe())
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		next.ServeHTTP(w, r)
	})
}
