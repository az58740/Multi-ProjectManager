package export

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/az58740/multi-project-manager/backend/internal/projects"
)

const maxRequestBody = 64 << 10

type Handler struct {
	projects projects.Store
	store    Store
}

func NewHandler(projectsStore projects.Store, store Store) *Handler {
	return &Handler{projects: projectsStore, store: store}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/projects/{code}/export/counterparties", h.listCounterparties)
	mux.HandleFunc("POST /api/v1/projects/{code}/export/counterparties", h.createCounterparty)
	mux.HandleFunc("GET /api/v1/projects/{code}/export/shipments", h.listShipments)
	mux.HandleFunc("POST /api/v1/projects/{code}/export/shipments", h.createShipment)
}

// Project codes are resolved only by the project store; a client-supplied
// project ID is never accepted. Non-export and unknown projects look alike.
func (h *Handler) resolveProject(w http.ResponseWriter, r *http.Request) (projects.Project, bool) {
	project, err := h.projects.GetByCode(r.Context(), r.PathValue("code"))
	if errors.Is(err, projects.ErrNotFound) || (err == nil && project.Type != "export") {
		writeError(w, http.StatusNotFound, "پروژه صادراتی پیدا نشد.")
		return projects.Project{}, false
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "دریافت پروژه ممکن نشد.")
		return projects.Project{}, false
	}
	return project, true
}

func (h *Handler) listCounterparties(w http.ResponseWriter, r *http.Request) {
	project, ok := h.resolveProject(w, r)
	if !ok {
		return
	}
	items, err := h.store.ListCounterparties(r.Context(), project.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "دریافت طرف‌های تجاری ممکن نشد.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *Handler) createCounterparty(w http.ResponseWriter, r *http.Request) {
	project, ok := h.resolveProject(w, r)
	if !ok {
		return
	}
	var input CounterpartyInput
	if !decode(w, r, &input) {
		return
	}
	item, err := h.store.CreateCounterparty(r.Context(), project.ID, input)
	if errors.Is(err, ErrInvalidInput) {
		writeError(w, http.StatusBadRequest, "اطلاعات طرف تجاری معتبر نیست.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "ثبت طرف تجاری ممکن نشد.")
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (h *Handler) listShipments(w http.ResponseWriter, r *http.Request) {
	project, ok := h.resolveProject(w, r)
	if !ok {
		return
	}
	items, err := h.store.ListShipments(r.Context(), project.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "دریافت محموله‌ها ممکن نشد.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *Handler) createShipment(w http.ResponseWriter, r *http.Request) {
	project, ok := h.resolveProject(w, r)
	if !ok {
		return
	}
	var input ShipmentInput
	if !decode(w, r, &input) {
		return
	}
	item, err := h.store.CreateShipment(r.Context(), project.ID, input)
	if errors.Is(err, ErrInvalidSupplier) {
		writeError(w, http.StatusBadRequest, "تأمین‌کننده معتبر در این پروژه پیدا نشد.")
		return
	}
	if errors.Is(err, ErrInvalidInput) {
		writeError(w, http.StatusBadRequest, "اطلاعات محموله معتبر نیست.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "ثبت محموله ممکن نشد.")
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func decode(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBody)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "بدنهٔ درخواست معتبر نیست.")
		return false
	}
	// Require an object and reject explicit null for fields whose contract is
	// string, number, or array. Missing optional text fields default to empty.
	var object map[string]json.RawMessage
	if err := json.Unmarshal(body, &object); err != nil || object == nil {
		writeError(w, http.StatusBadRequest, "بدنهٔ درخواست معتبر نیست.")
		return false
	}
	for _, value := range object {
		if bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			writeError(w, http.StatusBadRequest, "بدنهٔ درخواست معتبر نیست.")
			return false
		}
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "بدنهٔ درخواست معتبر نیست.")
		return false
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		writeError(w, http.StatusBadRequest, "بدنهٔ درخواست معتبر نیست.")
		return false
	}
	return true
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
