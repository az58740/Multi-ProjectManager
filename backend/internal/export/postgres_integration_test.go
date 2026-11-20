package export

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/az58740/multi-project-manager/backend/internal/projects"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TEST_DATABASE_URL must point to a disposable database with CREATE SCHEMA rights.
// This test uses and deletes its own schema; it never drops the public schema.
func TestPostgresExportMigrationAndPersistence(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	admin, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	schema, err := newID("export_test_")
	if err != nil {
		t.Fatal(err)
	}
	quotedSchema := pgx.Identifier{schema}.Sanitize()
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+quotedSchema); err != nil {
		t.Fatal(err)
	}
	defer func() {
		cleanupCtx, done := context.WithTimeout(context.Background(), 10*time.Second)
		defer done()
		if _, err := admin.Exec(cleanupCtx, "DROP SCHEMA "+quotedSchema+" CASCADE"); err != nil {
			t.Errorf("drop test schema: %v", err)
		}
	}()
	if strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
		u, err := url.Parse(dsn)
		if err != nil {
			t.Fatal(err)
		}
		q := u.Query()
		q.Set("search_path", schema)
		u.RawQuery = q.Encode()
		dsn = u.String()
	} else {
		dsn += " search_path=" + schema
	}
	projectStore, err := projects.NewPostgresStore(ctx, dsn)
	if err != nil {
		t.Fatalf("run project migrations: %v", err)
	}
	defer projectStore.Close()
	exportStore, err := NewPostgresStore(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer exportStore.Close()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	var migrated bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = 'migrations/005_export_core.sql')`).Scan(&migrated); err != nil || !migrated {
		t.Fatalf("migration recorded=%v err=%v", migrated, err)
	}
	createProject := func(name, typ string) projects.Project {
		t.Helper()
		p, err := projectStore.Create(ctx, projects.CreateInput{Name: name, Type: typ, Status: "planning"})
		if err != nil {
			t.Fatal(err)
		}
		return p
	}
	a, b, other := createProject("A", "export"), createProject("B", "export"), createProject("Other", "construction")
	gotProject, err := projectStore.GetByCode(ctx, a.Code)
	if err != nil || gotProject.ID != a.ID {
		t.Fatalf("lookup by code: %+v %v", gotProject, err)
	}
	if _, err := projectStore.GetByCode(ctx, "missing"); !errors.Is(err, projects.ErrNotFound) {
		t.Fatalf("missing code error: %v", err)
	}
	mux := httpMux(projectStore, exportStore)
	urlA := "/api/v1/projects/" + a.Code + "/export/"
	urlB := "/api/v1/projects/" + b.Code + "/export/"
	mustStatus(t, request(mux, "GET", "/api/v1/projects/"+other.Code+"/export/shipments", "", nil, ""), 404)
	mustStatus(t, request(mux, "GET", "/api/v1/projects/missing/export/shipments", "", nil, ""), 404)
	supplier := makeCounterparty(t, mux, a.Code, "supplier A", `["customer","supplier"]`)
	customer := makeCounterparty(t, mux, b.Code, "customer B", `["customer"]`)
	weight := "12345678901234567890.123456789012345678900"
	created := request(mux, "POST", urlA+"shipments", shipmentBody(supplier.ID, weight, "planning"), nil, "")
	mustStatus(t, created, 201)
	shipment := decodeResponse[Shipment](t, created)
	if shipment.WeightKg != weight || shipment.ProjectID != a.ID || shipment.SupplierID != supplier.ID {
		t.Fatalf("created shipment: %+v", shipment)
	}
	mustStatus(t, request(mux, "POST", urlB+"shipments", shipmentBody(supplier.ID, "1", "planning"), nil, ""), 400)
	mustStatus(t, request(mux, "POST", urlB+"shipments", shipmentBody(customer.ID, "1", "planning"), nil, ""), 400)
	mustStatus(t, request(mux, "POST", urlB+"shipments", shipmentBody("missing", "1", "planning"), nil, ""), 400)
	listed := request(mux, "GET", urlB+"shipments", "", nil, "")
	mustStatus(t, listed, 200)
	if listed.Body.String() != "{\"items\":[]}\n" {
		t.Fatalf("cross-project leakage: %s", listed.Body)
	}

	// Bypass the application to prove that PostgreSQL rejects cross-project links,
	// invalid project IDs, invalid roles and invalid decimal weights independently.
	_, err = pool.Exec(ctx, `INSERT INTO export_shipments (id,project_id,reference,supplier_id,pallet_count,weight_kg,status) VALUES ('bad', $1, 'R', $2, 1, 1, 'planning')`, b.ID, supplier.ID)
	assertPGCode(t, err, "23503")
	_, err = pool.Exec(ctx, `INSERT INTO export_counterparties (id,project_id,name,roles) VALUES ('bad-project', 'missing', 'X', ARRAY['supplier'])`)
	assertPGCode(t, err, "23503")
	_, err = pool.Exec(ctx, `INSERT INTO export_counterparties (id,project_id,name,roles) VALUES ('bad-role', $1, 'X', ARRAY['invalid'])`, a.ID)
	assertPGCode(t, err, "23514")
	for _, weight := range []string{"0", "NaN", "Infinity", "-1"} {
		_, err = pool.Exec(ctx, `INSERT INTO export_shipments (id,project_id,reference,supplier_id,pallet_count,weight_kg,status) VALUES ($1,$2,'R',$3,1,$4::text::numeric,'planning')`, "bad-weight-"+weight, a.ID, supplier.ID, weight)
		assertPGCode(t, err, "23514")
	}
	_, err = pool.Exec(ctx, `INSERT INTO export_shipments (id,project_id,reference,supplier_id,pallet_count,weight_kg,status) VALUES ('bad-status',$1,'R',$2,1,1,'unknown')`, a.ID, supplier.ID)
	assertPGCode(t, err, "23514")

	// A new connection observes durable writes and preserves the exact decimal.
	reopened, err := NewPostgresStore(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	items, err := reopened.ListShipments(ctx, a.ID)
	if err != nil || len(items) != 1 || items[0].ID != shipment.ID || items[0].WeightKg != weight {
		t.Fatalf("reopened shipments=%+v err=%v", items, err)
	}
	if result, err := reopened.ListCounterparties(ctx, b.ID); err != nil || len(result) != 1 || result[0].ID != customer.ID {
		t.Fatalf("reopened B=%+v err=%v", result, err)
	}
}

func assertPGCode(t *testing.T, err error, code string) {
	t.Helper()
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != code {
		t.Fatalf("PostgreSQL error=%v, want SQLSTATE %s", err, code)
	}
}

func Example_normalizeWeight() {
	value, valid := normalizeWeight("00012.3000")
	fmt.Println(value, valid)
	// Output: 12.3000 true
}
