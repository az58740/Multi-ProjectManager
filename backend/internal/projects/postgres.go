package projects

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"time"

	"github.com/az58740/multi-project-manager/backend/internal/dbconfig"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

type PostgresStore struct {
	pool *pgxpool.Pool
}

func NewPostgresStore(ctx context.Context, databaseURL string) (*PostgresStore, error) {
	config, err := parsePoolConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("configure PostgreSQL pool: %w", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("configure PostgreSQL pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("connect to PostgreSQL: %w", err)
	}
	if err := applyMigrations(ctx, pool); err != nil {
		pool.Close()
		return nil, err
	}
	return &PostgresStore{pool: pool}, nil
}

func parsePoolConfig(databaseURL string) (*pgxpool.Config, error) {
	return dbconfig.ParsePoolConfig(databaseURL)
}

func applyMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	// CREATE TABLE IF NOT EXISTS alone is not concurrency-safe across fresh instances.
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin migration ledger: %w", err)
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, "multi-project-manager:migrations"); err != nil {
		return fmt.Errorf("lock migration ledger: %w", err)
	}
	_, err = tx.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`)
	if err != nil {
		return fmt.Errorf("prepare migration ledger: %w", err)
	}
	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit migration ledger: %w", err)
	}

	files, err := fs.Glob(migrationFiles, "migrations/*.sql")
	if err != nil {
		return fmt.Errorf("list migrations: %w", err)
	}
	sort.Strings(files)
	for _, name := range files {
		migration, readErr := migrationFiles.ReadFile(name)
		if readErr != nil {
			return fmt.Errorf("read migration %s: %w", name, readErr)
		}
		err := func() error {
			tx, beginErr := pool.Begin(ctx)
			if beginErr != nil {
				return fmt.Errorf("begin migration %s: %w", name, beginErr)
			}
			defer tx.Rollback(ctx)

			if _, lockErr := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, "multi-project-manager:migrations"); lockErr != nil {
				return fmt.Errorf("lock migration %s: %w", name, lockErr)
			}
			var applied bool
			if scanErr := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`, name).Scan(&applied); scanErr != nil {
				return fmt.Errorf("check migration %s: %w", name, scanErr)
			}
			if !applied {
				if _, execErr := tx.Exec(ctx, string(migration)); execErr != nil {
					return fmt.Errorf("apply migration %s: %w", name, execErr)
				}
				if _, insertErr := tx.Exec(ctx, `INSERT INTO schema_migrations (version) VALUES ($1)`, name); insertErr != nil {
					return fmt.Errorf("record migration %s: %w", name, insertErr)
				}
			}
			if commitErr := tx.Commit(ctx); commitErr != nil {
				return fmt.Errorf("commit migration %s: %w", name, commitErr)
			}
			return nil
		}()
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *PostgresStore) Close() {
	s.pool.Close()
}

const projectColumns = `id, code, name, type, location, destination, manager, accountant, status, start_date, end_date, description, default_cost_currency, default_sales_currency, created_at, updated_at`

func scanProject(row interface{ Scan(...any) error }) (Project, error) {
	var item Project
	err := row.Scan(
		&item.ID, &item.Code, &item.Name, &item.Type, &item.Location, &item.Destination,
		&item.Manager, &item.Accountant, &item.Status, &item.StartDate, &item.EndDate,
		&item.Description, &item.DefaultCostCurrency, &item.DefaultSalesCurrency,
		&item.CreatedAt, &item.UpdatedAt,
	)
	return item, err
}

func (s *PostgresStore) List(ctx context.Context) ([]Project, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+projectColumns+` FROM projects ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]Project, 0)
	for rows.Next() {
		item, scanErr := scanProject(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *PostgresStore) Create(ctx context.Context, in CreateInput) (Project, error) {
	var item Project
	err := s.pool.QueryRow(ctx, `
		INSERT INTO projects (
			id, code, name, type, location, destination, manager, accountant, status,
			start_date, end_date, description, default_cost_currency, default_sales_currency,
			created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
		RETURNING `+projectColumns,
		newID(), newProjectCode(time.Now().UTC()), in.Name, in.Type, in.Location, in.Destination,
		in.Manager, in.Accountant, in.Status, in.StartDate, in.EndDate, in.Description,
		in.DefaultCostCurrency, in.DefaultSalesCurrency, time.Now().UTC(),
	).Scan(
		&item.ID, &item.Code, &item.Name, &item.Type, &item.Location, &item.Destination,
		&item.Manager, &item.Accountant, &item.Status, &item.StartDate, &item.EndDate,
		&item.Description, &item.DefaultCostCurrency, &item.DefaultSalesCurrency,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		return Project{}, err
	}
	return item, nil
}

func (s *PostgresStore) Get(ctx context.Context, id string) (Project, error) {
	item, err := scanProject(s.pool.QueryRow(ctx, `SELECT `+projectColumns+` FROM projects WHERE id = $1`, id))
	if err != nil {
		if isNoRows(err) {
			return Project{}, ErrNotFound
		}
		return Project{}, err
	}
	return item, nil
}

func (s *PostgresStore) GetByCode(ctx context.Context, code string) (Project, error) {
	item, err := scanProject(s.pool.QueryRow(ctx, `SELECT `+projectColumns+` FROM projects WHERE code = $1`, code))
	if err != nil {
		if isNoRows(err) {
			return Project{}, ErrNotFound
		}
		return Project{}, err
	}
	return item, nil
}

func (s *PostgresStore) Update(ctx context.Context, id string, in CreateInput) (Project, error) {
	item, err := scanProject(s.pool.QueryRow(ctx, `
		UPDATE projects SET
			name = $2, type = $3, location = $4, destination = $5, manager = $6,
			accountant = $7, status = $8, start_date = $9, end_date = $10,
			description = $11, default_cost_currency = $12, default_sales_currency = $13,
			updated_at = $14
		WHERE id = $1
		RETURNING `+projectColumns,
		id, in.Name, in.Type, in.Location, in.Destination, in.Manager, in.Accountant,
		in.Status, in.StartDate, in.EndDate, in.Description, in.DefaultCostCurrency,
		in.DefaultSalesCurrency, time.Now().UTC(),
	))
	if err != nil {
		if isNoRows(err) {
			return Project{}, ErrNotFound
		}
		return Project{}, err
	}
	return item, nil
}

func isNoRows(err error) bool {
	return err == pgx.ErrNoRows
}
