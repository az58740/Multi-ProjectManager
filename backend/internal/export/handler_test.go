package export

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/az58740/multi-project-manager/backend/internal/auth"
	"github.com/az58740/multi-project-manager/backend/internal/projects"
)

func testProjectStore() *projects.MemoryStore {
	return projects.NewMemoryStore([]projects.Project{
		{ID: "project-a", Code: "CODE-A", Type: "export"},
		{ID: "project-b", Code: "CODE-B", Type: "export"},
		{ID: "project-other", Code: "CODE-OTHER", Type: "construction"},
	})
}

func testMux() *http.ServeMux {
	ps := testProjectStore()
	return httpMux(ps, NewMemoryStore(ps))
}
func httpMux(projectStore projects.Store, store Store) *http.ServeMux {
	mux := http.NewServeMux()
	projects.NewHandler(projectStore, "demo").Register(mux)
	NewHandler(projectStore, store).Register(mux)
	return mux
}

func request(handler http.Handler, method, path, body string, cookie *http.Cookie, origin string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	if cookie != nil {
		req.AddCookie(cookie)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	return response
}

func mustStatus(t *testing.T, resp *httptest.ResponseRecorder, status int) {
	t.Helper()
	if resp.Code != status {
		t.Fatalf("status=%d want=%d body=%s", resp.Code, status, resp.Body.String())
	}
	if !strings.HasPrefix(resp.Header().Get("Content-Type"), "application/json") {
		t.Fatalf("content type: %q", resp.Header().Get("Content-Type"))
	}
}

func decodeResponse[T any](t *testing.T, resp *httptest.ResponseRecorder) T {
	t.Helper()
	var value T
	if err := json.Unmarshal(resp.Body.Bytes(), &value); err != nil {
		t.Fatalf("decode %s: %v", resp.Body.String(), err)
	}
	return value
}

func makeCounterparty(t *testing.T, mux http.Handler, code, name, roles string) Counterparty {
	t.Helper()
	body := fmt.Sprintf(`{"name":%q,"roles":%s,"phone":"123","country":"Iran","notes":"n"}`, name, roles)
	r := request(mux, "POST", "/api/v1/projects/"+code+"/export/counterparties", body, nil, "")
	mustStatus(t, r, 201)
	return decodeResponse[Counterparty](t, r)
}

func shipmentBody(supplierID, weight, status string) string {
	return fmt.Sprintf(`{"reference":"R-1","supplierId":%q,"palletCount":2,"weightKg":%q,"destination":"Moscow","status":%q,"notes":"note"}`, supplierID, weight, status)
}

func TestExportCreateListAndProjectIsolation(t *testing.T) {
	mux := testMux()
	baseA := "/api/v1/projects/CODE-A/export/"
	baseB := "/api/v1/projects/CODE-B/export/"
	mustStatus(t, request(mux, "GET", "/api/v1/projects/project-a", "", nil, ""), 200)
	for _, collection := range []string{"counterparties", "shipments"} {
		r := request(mux, "GET", baseA+collection, "", nil, "")
		mustStatus(t, r, 200)
		if r.Body.String() != "{\"items\":[]}\n" {
			t.Fatalf("empty list must be an array: %s", r.Body)
		}
	}
	a := makeCounterparty(t, mux, "CODE-A", "Supplier A", `["supplier","customer"]`)
	b := makeCounterparty(t, mux, "CODE-B", "Supplier B", `["supplier"]`)
	if a.ID == "" || a.ProjectID != "project-a" || a.Name != "Supplier A" || len(a.Roles) != 2 || a.Phone != "123" || a.Country != "Iran" || a.Notes != "n" || a.CreatedAt.IsZero() {
		t.Fatalf("counterparty: %+v", a)
	}
	r := request(mux, "GET", baseA+"counterparties", "", nil, "")
	mustStatus(t, r, 200)
	list := decodeResponse[struct {
		Items []Counterparty `json:"items"`
	}](t, r)
	if len(list.Items) != 1 || list.Items[0].ID != a.ID {
		t.Fatalf("A counterparties: %+v", list)
	}
	r = request(mux, "GET", baseB+"counterparties", "", nil, "")
	list = decodeResponse[struct {
		Items []Counterparty `json:"items"`
	}](t, r)
	if len(list.Items) != 1 || list.Items[0].ID != b.ID {
		t.Fatalf("B counterparties: %+v", list)
	}

	// This value cannot be represented exactly by float64; retain its scale too.
	weight := "12345678901234567890.123456789012345678900"
	r = request(mux, "POST", baseA+"shipments", shipmentBody(a.ID, weight, "in_transit"), nil, "")
	mustStatus(t, r, 201)
	shipment := decodeResponse[Shipment](t, r)
	if shipment.ID == "" || shipment.ProjectID != "project-a" || shipment.Reference != "R-1" || shipment.SupplierID != a.ID || shipment.PalletCount != 2 || shipment.WeightKg != weight || shipment.Destination != "Moscow" || shipment.Status != "in_transit" || shipment.Notes != "note" || shipment.CreatedAt.IsZero() {
		t.Fatalf("shipment: %+v", shipment)
	}
	r = request(mux, "GET", baseA+"shipments", "", nil, "")
	mustStatus(t, r, 200)
	shipments := decodeResponse[struct {
		Items []Shipment `json:"items"`
	}](t, r)
	if len(shipments.Items) != 1 || shipments.Items[0].ID != shipment.ID || shipments.Items[0].WeightKg != weight {
		t.Fatalf("A shipments: %+v", shipments)
	}
	r = request(mux, "GET", baseB+"shipments", "", nil, "")
	shipments = decodeResponse[struct {
		Items []Shipment `json:"items"`
	}](t, r)
	if shipments.Items == nil || len(shipments.Items) != 0 {
		t.Fatalf("B shipments: %+v", shipments)
	}
	for _, status := range []string{"planning", "delivered", "sold"} {
		mustStatus(t, request(mux, "POST", baseB+"shipments", shipmentBody(b.ID, "0001.2500", status), nil, ""), 201)
	}
}

func TestWrongProjectsAndSuppliers(t *testing.T) {
	mux := testMux()
	for _, code := range []string{"MISSING", "CODE-OTHER", "project-a"} {
		for _, path := range []string{"counterparties", "shipments"} {
			for _, method := range []string{"GET", "POST"} {
				mustStatus(t, request(mux, method, "/api/v1/projects/"+code+"/export/"+path, "{}", nil, ""), 404)
			}
		}
	}
	a := makeCounterparty(t, mux, "CODE-A", "Supplier", `["supplier"]`)
	customer := makeCounterparty(t, mux, "CODE-B", "Customer", `["customer"]`)
	path := "/api/v1/projects/CODE-B/export/shipments"
	for _, id := range []string{a.ID, customer.ID, "missing"} {
		mustStatus(t, request(mux, "POST", path, shipmentBody(id, "1.00", "planning"), nil, ""), 400)
	}
	r := request(mux, "GET", path, "", nil, "")
	if r.Body.String() != "{\"items\":[]}\n" {
		t.Fatalf("invalid supplier created shipment: %s", r.Body)
	}
}

func TestCounterpartyValidationAndStrictJSON(t *testing.T) {
	mux := testMux()
	path := "/api/v1/projects/CODE-A/export/counterparties"
	invalid := []string{
		`{}`, `{"name":" ","roles":["supplier"]}`,
		`{"name":"A","roles":[]}`, `{"name":"A","roles":["supplier","wrong"]}`,
		`{"name":"A","roles":[null]}`, `{"name":"A","roles":"supplier"}`,
		`{"name":"A","roles":["supplier"],"projectId":"project-b"}`,
		`{"name":"A","roles":["supplier"],"phone":null}`,
		`{"name":"A\u0000x","roles":["supplier"]}`,
		`{"name":"A","roles":["supplier"]} {}`,
		`null`, `[]`, ``, `{"name":"` + strings.Repeat("x", maxRequestBody) + `","roles":["supplier"]}`,
	}
	for i, body := range invalid {
		t.Run(fmt.Sprint(i), func(t *testing.T) { mustStatus(t, request(mux, "POST", path, body, nil, ""), 400) })
	}
	for _, role := range []string{"supplier", "customer", "intermediary"} {
		mustStatus(t, request(mux, "POST", path, `{"name":"A","roles":["`+role+`"]}`, nil, ""), 201)
	}
}

func TestShipmentValidation(t *testing.T) {
	mux := testMux()
	a := makeCounterparty(t, mux, "CODE-A", "Supplier", `["supplier"]`)
	path := "/api/v1/projects/CODE-A/export/shipments"
	valid := shipmentBody(a.ID, "1.00", "planning")
	invalid := []string{
		strings.Replace(valid, `"R-1"`, `"  "`, 1),
		strings.Replace(valid, `"supplierId":`+fmt.Sprintf("%q", a.ID), `"supplierId":""`, 1),
		strings.Replace(valid, `"palletCount":2`, `"palletCount":0`, 1),
		strings.Replace(valid, `"palletCount":2`, `"palletCount":-1`, 1),
		strings.Replace(valid, `"palletCount":2`, `"palletCount":1.5`, 1),
		strings.Replace(valid, `"status":"planning"`, `"status":"unknown"`, 1),
		strings.Replace(valid, `"weightKg":"1.00"`, `"weightKg":1.00`, 1),
		strings.Replace(valid, `"notes":"note"`, `"notes":null`, 1),
		strings.Replace(valid, `"notes":"note"`, `"projectId":"project-b"`, 1),
	}
	for _, weight := range []string{"", "0", "0.00", "-1", "+1", ".1", "1.", "1e3", "NaN", "Infinity", "1.2.3", "۱", "0." + strings.Repeat("0", 16383) + "1"} {
		invalid = append(invalid, shipmentBody(a.ID, weight, "planning"))
	}
	for i, body := range invalid {
		t.Run(fmt.Sprint(i), func(t *testing.T) { mustStatus(t, request(mux, "POST", path, body, nil, ""), 400) })
	}
	r := request(mux, "POST", path, shipmentBody(a.ID, "0000.001200", "sold"), nil, "")
	mustStatus(t, r, 201)
	if got := decodeResponse[Shipment](t, r).WeightKg; got != "0.001200" {
		t.Fatalf("normalized weight: %q", got)
	}
}

func TestMemoryStoreDoesNotExposeMutableRoles(t *testing.T) {
	s := NewMemoryStore(testProjectStore())
	input := CounterpartyInput{Name: "S", Roles: []string{"supplier"}}
	if _, err := s.CreateCounterparty(context.Background(), "missing", input); !errors.Is(err, projects.ErrNotFound) {
		t.Fatalf("missing project accepted: %v", err)
	}
	created, err := s.CreateCounterparty(context.Background(), "project-a", input)
	if err != nil {
		t.Fatal(err)
	}
	input.Roles[0] = "customer"
	created.Roles[0] = "intermediary"
	list, _ := s.ListCounterparties(context.Background(), "project-a")
	if list[0].Roles[0] != "supplier" {
		t.Fatal(list)
	}
	list[0].Roles[0] = "customer"
	again, _ := s.ListCounterparties(context.Background(), "project-a")
	if again[0].Roles[0] != "supplier" {
		t.Fatal(again)
	}
}

func TestMemoryStoreConcurrentShipments(t *testing.T) {
	s := NewMemoryStore(testProjectStore())
	ctx := context.Background()
	supplier, err := s.CreateCounterparty(ctx, "project-a", CounterpartyInput{Name: "S", Roles: []string{"supplier"}})
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := s.CreateShipment(ctx, "project-a", ShipmentInput{Reference: "R", SupplierID: supplier.ID, PalletCount: 1, WeightKg: "0.0001", Status: "planning"})
			if err != nil {
				t.Error(err)
			}
			if _, err := s.ListShipments(ctx, "project-b"); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	items, err := s.ListShipments(ctx, "project-a")
	if err != nil || len(items) != 50 {
		t.Fatalf("concurrent shipments=%d err=%v", len(items), err)
	}
	other, err := s.ListShipments(ctx, "project-b")
	if err != nil || len(other) != 0 {
		t.Fatalf("other project shipments=%d err=%v", len(other), err)
	}
}

type failingProjects struct{ projects.Store }

func (f failingProjects) GetByCode(context.Context, string) (projects.Project, error) {
	return projects.Project{}, errors.New("internal")
}

type failingExport struct{ Store }

func (f failingExport) ListCounterparties(context.Context, string) ([]Counterparty, error) {
	return nil, errors.New("internal")
}
func (f failingExport) CreateCounterparty(context.Context, string, CounterpartyInput) (Counterparty, error) {
	return Counterparty{}, errors.New("internal")
}
func (f failingExport) ListShipments(context.Context, string) ([]Shipment, error) {
	return nil, errors.New("internal")
}
func (f failingExport) CreateShipment(context.Context, string, ShipmentInput) (Shipment, error) {
	return Shipment{}, errors.New("internal")
}

func TestDatabaseErrorsReturn500(t *testing.T) {
	path := "/api/v1/projects/CODE-A/export/"
	mux := http.NewServeMux()
	ps := testProjectStore()
	NewHandler(failingProjects{ps}, NewMemoryStore(ps)).Register(mux)
	mustStatus(t, request(mux, "GET", path+"shipments", "", nil, ""), 500)
	mux = http.NewServeMux()
	NewHandler(ps, failingExport{NewMemoryStore(ps)}).Register(mux)
	for _, collection := range []string{"counterparties", "shipments"} {
		for _, method := range []string{"GET", "POST"} {
			mustStatus(t, request(mux, method, path+collection, `{}`, nil, ""), 500)
		}
	}
}

func TestExportRoutesUseExistingSessionAndOrigin(t *testing.T) {
	const origin = "https://app.example.test"
	a, err := auth.New(auth.NewMemoryStore(), origin, true)
	if err != nil {
		t.Fatal(err)
	}
	created, err := a.Bootstrap(context.Background(), "admin@example.test", "admin-password-very-safe")
	if err != nil || !created {
		t.Fatalf("bootstrap: %v %v", created, err)
	}
	root, projectMux := http.NewServeMux(), http.NewServeMux()
	a.Register(root)
	ps := testProjectStore()
	projects.NewHandler(ps, "demo").Register(projectMux)
	NewHandler(ps, NewMemoryStore(ps)).Register(projectMux)
	root.Handle("/api/v1/projects/", a.RequireSameOrigin(a.RequireSession(projectMux)))
	path := "/api/v1/projects/CODE-A/export/counterparties"
	body := `{"name":"S","roles":["supplier"]}`
	mustStatus(t, request(root, "GET", path, "", nil, ""), 401)
	mustStatus(t, request(root, "POST", path, body, nil, origin), 401)
	mustStatus(t, request(root, "POST", path, body, nil, "https://evil.example"), 403)
	mustStatus(t, request(root, "POST", "/api/v1/auth/register", `{"name":"Member","email":"member@example.test","password":"1234"}`, nil, origin), 201)
	login := request(root, "POST", "/api/v1/auth/login", `{"email":"member@example.test","password":"1234"}`, nil, origin)
	mustStatus(t, login, 200)
	cookies := login.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("cookies=%v", cookies)
	}
	mustStatus(t, request(root, "POST", path, body, cookies[0], "https://evil.example"), 403)
	mustStatus(t, request(root, "POST", path, body, cookies[0], origin), 201)
	mustStatus(t, request(root, "GET", path, "", cookies[0], ""), 200)
	// Active non-admin users have access to all projects, not a project membership list.
	mustStatus(t, request(root, "POST", "/api/v1/projects/CODE-B/export/counterparties", body, cookies[0], origin), 201)
}
