package export

import (
	"context"
	"errors"
	"fmt"

	"github.com/az58740/multi-project-manager/backend/internal/dbconfig"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct{ pool *pgxpool.Pool }

// NewPostgresStore expects the project migration engine to have run first.
func NewPostgresStore(ctx context.Context, databaseURL string) (*PostgresStore, error) {
	config, err := dbconfig.ParsePoolConfig(databaseURL)
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
	return &PostgresStore{pool: pool}, nil
}

func (s *PostgresStore) Close() { s.pool.Close() }

const counterpartyColumns = `id, project_id, name, roles, phone, country, notes, created_at`
const shipmentColumns = `id, project_id, reference, supplier_id, pallet_count, weight_kg::text, destination, status, notes, created_at`

type scanner interface{ Scan(...any) error }

func scanCounterparty(row scanner) (Counterparty, error) {
	var item Counterparty
	err := row.Scan(&item.ID, &item.ProjectID, &item.Name, &item.Roles, &item.Phone, &item.Country, &item.Notes, &item.CreatedAt)
	return item, err
}

func scanShipment(row scanner) (Shipment, error) {
	var item Shipment
	err := row.Scan(&item.ID, &item.ProjectID, &item.Reference, &item.SupplierID, &item.PalletCount, &item.WeightKg, &item.Destination, &item.Status, &item.Notes, &item.CreatedAt)
	return item, err
}

func (s *PostgresStore) ListCounterparties(ctx context.Context, projectID string) ([]Counterparty, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+counterpartyColumns+` FROM export_counterparties WHERE project_id = $1 ORDER BY created_at DESC, id DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Counterparty, 0)
	for rows.Next() {
		item, err := scanCounterparty(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *PostgresStore) CreateCounterparty(ctx context.Context, projectID string, input CounterpartyInput) (Counterparty, error) {
	in, err := prepareCounterparty(input)
	if err != nil {
		return Counterparty{}, err
	}
	id, err := newID("cp_")
	if err != nil {
		return Counterparty{}, err
	}
	return scanCounterparty(s.pool.QueryRow(ctx, `INSERT INTO export_counterparties (id, project_id, name, roles, phone, country, notes)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING `+counterpartyColumns,
		id, projectID, in.Name, in.Roles, in.Phone, in.Country, in.Notes))
}

func (s *PostgresStore) ListShipments(ctx context.Context, projectID string) ([]Shipment, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+shipmentColumns+` FROM export_shipments WHERE project_id = $1 ORDER BY created_at DESC, id DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Shipment, 0)
	for rows.Next() {
		item, err := scanShipment(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *PostgresStore) CreateShipment(ctx context.Context, projectID string, input ShipmentInput) (Shipment, error) {
	in, err := prepareShipment(input)
	if err != nil {
		return Shipment{}, err
	}
	id, err := newID("shp_")
	if err != nil {
		return Shipment{}, err
	}
	// The predicate only examines a supplier within this project; the composite
	// foreign key independently prevents cross-project references.
	item, err := scanShipment(s.pool.QueryRow(ctx, `INSERT INTO export_shipments
		(id, project_id, reference, supplier_id, pallet_count, weight_kg, destination, status, notes)
		SELECT $1, $2, $3, $4, $5, $6::text::numeric, $7, $8, $9
		WHERE EXISTS (SELECT 1 FROM export_counterparties WHERE project_id = $2 AND id = $4 AND 'supplier' = ANY(roles))
		RETURNING `+shipmentColumns,
		id, projectID, in.Reference, in.SupplierID, in.PalletCount, in.WeightKg, in.Destination, in.Status, in.Notes))
	if errors.Is(err, pgx.ErrNoRows) {
		return Shipment{}, ErrInvalidSupplier
	}
	return item, err
}
