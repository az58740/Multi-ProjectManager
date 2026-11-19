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
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	production := strings.EqualFold(strings.TrimSpace(os.Getenv("APP_ENV")), "production") || os.Getenv("VERCEL") == "1"
	var projectStore projects.Store
	var authStore auth.Store
	dataMode := "database"
	if databaseURL != "" {
		// Project migrations also install the additive authentication schema.
		ps, err := projects.NewPostgresStore(ctx, databaseURL)
		if err != nil {
			log.Fatalf("database initialization failed: %v", err)
		}
		defer ps.Close()
		projectStore = ps
		as, err := auth.NewPostgresStore(ctx, databaseURL)
		if err != nil {
			log.Fatalf("authentication database initialization failed: %v", err)
		}
		defer as.Close()
		authStore = as
	} else {
		if production {
			log.Fatal("DATABASE_URL is required in production; refusing to use ephemeral demo data")
		}
		log.Print("DEMO MODE: project data, users and sessions are temporary and stored in process memory")
		dataMode = "demo"
		projectStore = projects.NewMemoryStore(projects.DemoProjects())
		authStore = auth.NewMemoryStore()
	}
	localAuth, err := auth.New(authStore, os.Getenv("PUBLIC_APP_ORIGIN"), production)
	if err != nil {
		log.Fatalf("authentication configuration failed: %v", err)
	}
	created, err := localAuth.Bootstrap(ctx, os.Getenv("BOOTSTRAP_ADMIN_EMAIL"), os.Getenv("BOOTSTRAP_ADMIN_PASSWORD"))
	if err != nil {
		log.Fatalf("administrator bootstrap failed: %v", err)
	}
	if created {
		log.Print("Initial administrator created from server-side bootstrap credentials")
	}
	users, err := authStore.List(ctx)
	if err != nil {
		log.Fatalf("administrator verification failed: %v", err)
	}
	hasAdmin := false
	for _, u := range users {
		if u.Role == "admin" && u.Status == "active" {
			hasAdmin = true
			break
		}
	}
	if !hasAdmin {
		log.Fatal("An active administrator is required. For an empty user store, set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD before starting the server; existing users are never auto-promoted")
	}
	mux := http.NewServeMux()
	localAuth.Register(mux)
	projectMux := http.NewServeMux()
	projects.NewHandler(projectStore, dataMode).Register(projectMux)
	projectAccess := localAuth.RequireSameOrigin(localAuth.RequireSession(projectMux))
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
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ready", "dataMode": dataMode})
	})
	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "8080"
	}
	server := &http.Server{Addr: ":" + port, Handler: securityHeaders(mux), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
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
