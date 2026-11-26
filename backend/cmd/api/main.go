package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/az58740/multi-project-manager/backend/internal/assistant"
	"github.com/az58740/multi-project-manager/backend/internal/auth"
	"github.com/az58740/multi-project-manager/backend/internal/export"
	"github.com/az58740/multi-project-manager/backend/internal/ledger"
	"github.com/az58740/multi-project-manager/backend/internal/personal"
	"github.com/az58740/multi-project-manager/backend/internal/projects"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	production := strings.EqualFold(strings.TrimSpace(os.Getenv("APP_ENV")), "production") || os.Getenv("VERCEL") == "1"
	var projectStore projects.Store
	var exportStore export.Store
	var authStore auth.Store
	var ledgerStore ledger.Store
	var personalStore personal.Store
	var assistantPreferences assistant.PreferenceStore
	dataMode := "database"
	if databaseURL != "" {
		// Project migrations also install the additive authentication and export schemas.
		ps, err := projects.NewPostgresStore(ctx, databaseURL)
		if err != nil {
			return fmt.Errorf("database initialization failed: %w", err)
		}
		defer ps.Close()
		projectStore = ps
		es, err := export.NewPostgresStore(ctx, databaseURL)
		if err != nil {
			return fmt.Errorf("export database initialization failed: %w", err)
		}
		defer es.Close()
		exportStore = es
		as, err := auth.NewPostgresStore(ctx, databaseURL)
		if err != nil {
			return fmt.Errorf("authentication database initialization failed: %w", err)
		}
		defer as.Close()
		authStore = as
		ls, err := ledger.NewPostgresStore(ctx, databaseURL)
		if err != nil {
			return fmt.Errorf("ledger database initialization failed: %w", err)
		}
		defer ls.Close()
		ledgerStore = ls
		personalDB, err := personal.NewPostgresStore(ctx, databaseURL)
		if err != nil {
			return fmt.Errorf("personal account database initialization failed: %w", err)
		}
		defer personalDB.Close()
		personalStore = personalDB
		preferenceDB, err := assistant.NewPostgresStore(ctx, databaseURL)
		if err != nil {
			return fmt.Errorf("assistant preferences database initialization failed: %w", err)
		}
		defer preferenceDB.Close()
		assistantPreferences = preferenceDB
	} else {
		if production {
			return errors.New("DATABASE_URL is required in production; refusing to use ephemeral demo data")
		}
		log.Print("DEMO MODE: project and export data, users and sessions are temporary and stored in process memory")
		dataMode = "demo"
		projectStore = projects.NewMemoryStore(projects.DemoProjects())
		exportStore = export.NewMemoryStore(projectStore)
		authStore = auth.NewMemoryStore()
		ledgerStore = ledger.NewMemoryStore()
		personalStore = &personal.MemoryStore{}
		assistantPreferences = assistant.NewMemoryStore()
	}
	localAuth, err := auth.New(authStore, os.Getenv("PUBLIC_APP_ORIGIN"), production)
	if err != nil {
		return fmt.Errorf("authentication configuration failed: %w", err)
	}
	created, err := localAuth.Bootstrap(ctx, os.Getenv("BOOTSTRAP_ADMIN_EMAIL"), os.Getenv("BOOTSTRAP_ADMIN_PASSWORD"))
	if err != nil {
		return fmt.Errorf("administrator bootstrap failed: %w", err)
	}
	if created {
		log.Print("Initial administrator created from server-side bootstrap credentials")
	}
	users, err := authStore.List(ctx)
	if err != nil {
		return fmt.Errorf("administrator verification failed: %w", err)
	}
	hasAdmin := false
	for _, u := range users {
		if u.Role == "admin" && u.Status == "active" {
			hasAdmin = true
			break
		}
	}
	if !hasAdmin {
		promoted, promoteErr := authStore.PromoteSoleActiveUser(ctx)
		if promoteErr != nil {
			return fmt.Errorf("administrator verification failed: %w", promoteErr)
		}
		if promoted {
			log.Print("The sole active user was promoted to the initial administrator")
			users, err = authStore.List(ctx)
			if err != nil {
				return fmt.Errorf("administrator verification failed: %w", err)
			}
			for _, u := range users {
				if u.Role == "admin" && u.Status == "active" {
					hasAdmin = true
					break
				}
			}
		}
	}
	if !hasAdmin {
		return errors.New("An active administrator is required. For an empty user store, set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD before starting the server")
	}
	mux := http.NewServeMux()
	localAuth.Register(mux)
	projectMux := http.NewServeMux()
	projects.NewHandler(projectStore, dataMode).Register(projectMux)
	export.NewHandler(projectStore, exportStore).Register(projectMux)
	ledger.NewHandler(projectStore, ledgerStore).Register(projectMux)
	personal.NewHandler(projectStore, personalStore).Register(projectMux)
	projectAccess := localAuth.RequireSameOrigin(localAuth.RequireSession(projectMux))
	mux.Handle("/api/v1/projects", projectAccess)
	mux.Handle("/api/v1/projects/", projectAccess)
	assistantMux := http.NewServeMux()
	assistant.NewHandler(assistantPreferences).Register(assistantMux)
	mux.Handle("/api/v1/assistant/", localAuth.RequireSession(localAuth.RequireSameOrigin(assistantMux)))
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
	signalCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	serveErr := make(chan error, 1)
	go func() { serveErr <- server.ListenAndServe() }()
	select {
	case err := <-serveErr:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-signalCtx.Done():
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownCancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			_ = server.Close()
			return fmt.Errorf("HTTP shutdown failed: %w", err)
		}
		if err := <-serveErr; err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	}
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		next.ServeHTTP(w, r)
	})
}
