package projects

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func testMux() *http.ServeMux {
	mux := http.NewServeMux()
	NewHandler(NewMemoryStore(nil), "demo").Register(mux)
	return mux
}

func TestCreateProjectAndList(t *testing.T) {
	mux := testMux()
	body := `{"name":"صادرات روسیه","type":"export","location":"روسیه","destination":"مسکو","manager":"مدیر یک","accountant":"حسابدار","startDate":"2026-01-02","endDate":"2026-02-03","description":"توضیحات","defaultCostCurrency":"IRR","defaultSalesCurrency":"USD"}`
	response := request(mux, http.MethodPost, "/api/v1/projects", body)
	if response.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", response.Code, response.Body.String())
	}
	var created Project
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if created.Name != "صادرات روسیه" || created.Status != "planning" || !strings.HasPrefix(created.Code, "PRJ-") || created.ID == "" {
		t.Fatalf("unexpected created project: %#v", created)
	}
	if created.Destination != "مسکو" || created.Accountant != "حسابدار" || created.StartDate != "2026-01-02" || created.EndDate != "2026-02-03" || created.Description != "توضیحات" || created.DefaultCostCurrency != "IRR" || created.DefaultSalesCurrency != "USD" {
		t.Fatalf("project details missing: %#v", created)
	}
	if created.CreatedAt.IsZero() || created.UpdatedAt.IsZero() {
		t.Fatalf("timestamps missing: %#v", created)
	}

	var serialized map[string]json.RawMessage
	if err := json.Unmarshal(response.Body.Bytes(), &serialized); err != nil {
		t.Fatalf("decode serialized project: %v", err)
	}
	wantKeys := []string{"id", "code", "name", "type", "location", "destination", "manager", "accountant", "status", "startDate", "endDate", "description", "defaultCostCurrency", "defaultSalesCurrency", "createdAt", "updatedAt"}
	if len(serialized) != len(wantKeys) {
		t.Fatalf("serialized project has %d fields, want %d: %v", len(serialized), len(wantKeys), serialized)
	}
	for _, key := range wantKeys {
		if _, ok := serialized[key]; !ok {
			t.Errorf("serialized project missing %q", key)
		}
	}

	listResponse := request(mux, http.MethodGet, "/api/v1/projects", "")
	if listResponse.Code != http.StatusOK {
		t.Fatalf("list status = %d, body = %s", listResponse.Code, listResponse.Body.String())
	}
	var payload struct {
		Items    []Project `json:"items"`
		DataMode string    `json:"dataMode"`
	}
	if err := json.Unmarshal(listResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(payload.Items) != 1 || payload.Items[0].ID != created.ID || payload.DataMode != "demo" {
		t.Fatalf("unexpected list response: %#v", payload)
	}
}

func TestCreateAndUpdateGetProject(t *testing.T) {
	mux := testMux()
	createdResponse := request(mux, http.MethodPost, "/api/v1/projects", `{"name":"پروژه","type":"sorting"}`)
	if createdResponse.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", createdResponse.Code, createdResponse.Body.String())
	}
	var created Project
	if err := json.Unmarshal(createdResponse.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}

	getResponse := request(mux, http.MethodGet, "/api/v1/projects/"+created.ID, "")
	if getResponse.Code != http.StatusOK {
		t.Fatalf("get status = %d, body = %s", getResponse.Code, getResponse.Body.String())
	}
	var fetched Project
	if err := json.Unmarshal(getResponse.Body.Bytes(), &fetched); err != nil || fetched.ID != created.ID {
		t.Fatalf("get response = %#v, decode err = %v", fetched, err)
	}

	updateBody := `{"name":"نام تازه","type":"sorting","status":"paused","location":"تهران","destination":"اصفهان","manager":"مدیر جدید","accountant":"حسابدار جدید","startDate":"2026-04-01","endDate":"2026-04-30","description":"شرح جدید","defaultCostCurrency":"USD","defaultSalesCurrency":"EUR"}`
	updateResponse := request(mux, http.MethodPut, "/api/v1/projects/"+created.ID, updateBody)
	if updateResponse.Code != http.StatusOK {
		t.Fatalf("update status = %d, body = %s", updateResponse.Code, updateResponse.Body.String())
	}
	var updated Project
	if err := json.Unmarshal(updateResponse.Body.Bytes(), &updated); err != nil {
		t.Fatal(err)
	}
	if updated.Name != "نام تازه" || updated.Status != "paused" || updated.Location != "تهران" || updated.Destination != "اصفهان" || updated.Accountant != "حسابدار جدید" || updated.DefaultSalesCurrency != "EUR" {
		t.Fatalf("update did not persist project fields: %#v", updated)
	}
	if updated.ID != created.ID || updated.Code != created.Code || !updated.CreatedAt.Equal(created.CreatedAt) || updated.UpdatedAt.Before(created.UpdatedAt) {
		t.Fatalf("update changed stable fields or lost updatedAt: before=%#v after=%#v", created, updated)
	}
}

func TestExportProjectAcceptsAlternateDefaultCostCurrency(t *testing.T) {
	response := request(testMux(), http.MethodPost, "/api/v1/projects", `{"name":"صادرات ویژه","type":"export","defaultCostCurrency":"USD"}`)
	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body = %s", response.Code, response.Body.String())
	}
	var created Project
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.DefaultCostCurrency != "USD" {
		t.Fatalf("default cost currency = %q, want USD", created.DefaultCostCurrency)
	}
}

func TestGetAndUpdateReturn404(t *testing.T) {
	mux := testMux()
	getResponse := request(mux, http.MethodGet, "/api/v1/projects/missing", "")
	if getResponse.Code != http.StatusNotFound {
		t.Fatalf("get status = %d, want 404", getResponse.Code)
	}
	updateResponse := request(mux, http.MethodPut, "/api/v1/projects/missing", `{"name":"X","type":"other","status":"planning"}`)
	if updateResponse.Code != http.StatusNotFound {
		t.Fatalf("update status = %d, want 404", updateResponse.Code)
	}
}

func TestCreateRejectsInvalidValues(t *testing.T) {
	valid := CreateInput{Name: "پروژه", Type: "other", Status: "planning"}
	long := strings.Repeat("x", 121)
	longDescription := strings.Repeat("x", 1001)
	cases := []struct {
		name  string
		input CreateInput
	}{
		{"name required", CreateInput{Type: "other", Status: "planning"}},
		{"name too long", CreateInput{Name: long, Type: "other", Status: "planning"}},
		{"invalid type", CreateInput{Name: "X", Type: "unknown", Status: "planning"}},
		{"invalid status", CreateInput{Name: "X", Type: "other", Status: "unknown"}},
		{"location too long", withInput(valid, func(in *CreateInput) { in.Location = long })},
		{"destination too long", withInput(valid, func(in *CreateInput) { in.Destination = long })},
		{"manager too long", withInput(valid, func(in *CreateInput) { in.Manager = long })},
		{"accountant too long", withInput(valid, func(in *CreateInput) { in.Accountant = long })},
		{"description too long", withInput(valid, func(in *CreateInput) { in.Description = longDescription })},
		{"malformed date", withInput(valid, func(in *CreateInput) { in.StartDate = "2026-02-30" })},
		{"wrong date format", withInput(valid, func(in *CreateInput) { in.EndDate = "01/02/2026" })},
		{"end date before start", withInput(valid, func(in *CreateInput) { in.StartDate = "2026-03-02"; in.EndDate = "2026-03-01" })},
		{"lowercase currency", withInput(valid, func(in *CreateInput) { in.DefaultSalesCurrency = "usd" })},
		{"non-ASCII currency", withInput(valid, func(in *CreateInput) { in.DefaultSalesCurrency = "IR۱" })},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			body, err := json.Marshal(tc.input)
			if err != nil {
				t.Fatal(err)
			}
			response := request(testMux(), http.MethodPost, "/api/v1/projects", string(body))
			if response.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400; body = %s", response.Code, response.Body.String())
			}
		})
	}
}

func TestCreateRejectsOversizedAndMalformedBody(t *testing.T) {
	mux := testMux()
	largeBody := `{"name":"` + strings.Repeat("x", maxRequestBody) + `","type":"other"}`
	if response := request(mux, http.MethodPost, "/api/v1/projects", largeBody); response.Code != http.StatusBadRequest {
		t.Fatalf("oversized body status = %d, want 400", response.Code)
	}
	if response := request(mux, http.MethodPost, "/api/v1/projects", `{"name":"X","type":"other"} {}`); response.Code != http.StatusBadRequest {
		t.Fatalf("trailing JSON status = %d, want 400", response.Code)
	}
}

func TestMemoryStoreReturnsIndependentList(t *testing.T) {
	store := NewMemoryStore([]Project{{ID: "1", Name: "A"}})
	items, err := store.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	items[0].Name = "changed"
	again, err := store.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if again[0].Name != "A" {
		t.Fatalf("returned project slice must be independent, got %q", again[0].Name)
	}
}

func request(mux *http.ServeMux, method, path, body string) *httptest.ResponseRecorder {
	var reader *bytes.Reader
	if body == "" {
		reader = bytes.NewReader(nil)
	} else {
		reader = bytes.NewReader([]byte(body))
	}
	req := httptest.NewRequest(method, path, reader)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, req)
	return response
}

func withInput(input CreateInput, update func(*CreateInput)) CreateInput {
	update(&input)
	return input
}
