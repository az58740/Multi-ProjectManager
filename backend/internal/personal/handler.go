package personal

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/az58740/multi-project-manager/backend/internal/projects"
)

type Handler struct {
	projects projects.Store
	store    Store
}

func NewHandler(projectsStore projects.Store, store Store) *Handler {
	return &Handler{projects: projectsStore, store: store}
}
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/projects/{code}/personal/counterparties", h.list)
	mux.HandleFunc("POST /api/v1/projects/{code}/personal/counterparties", h.create)
	mux.HandleFunc("PUT /api/v1/projects/{code}/personal/counterparties/{id}", h.update)
}
func (h *Handler) resolve(w http.ResponseWriter, r *http.Request) (projects.Project, bool) {
	project, err := h.projects.GetByCode(r.Context(), r.PathValue("code"))
	if errors.Is(err, projects.ErrNotFound) || (err == nil && project.Type != "personal-account") {
		writeError(w, http.StatusNotFound, "پروژه مدیریت حساب شخص پیدا نشد.")
		return projects.Project{}, false
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "دریافت پروژه ممکن نشد.")
		return projects.Project{}, false
	}
	return project, true
}
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	project, ok := h.resolve(w, r)
	if !ok {
		return
	}
	items, err := h.store.List(r.Context(), project.ID)
	if err != nil {
		writeError(w, 500, "دریافت طرف‌حساب‌ها ممکن نشد.")
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}
func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	project, ok := h.resolve(w, r)
	if !ok {
		return
	}
	var input CounterpartyInput
	if !decode(w, r, &input) {
		return
	}
	item, err := h.store.Create(r.Context(), project.ID, input)
	h.respond(w, item, err, true)
}
func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	project, ok := h.resolve(w, r)
	if !ok {
		return
	}
	var input CounterpartyInput
	if !decode(w, r, &input) {
		return
	}
	item, err := h.store.Update(r.Context(), project.ID, r.PathValue("id"), input)
	h.respond(w, item, err, false)
}
func (h *Handler) respond(w http.ResponseWriter, item Counterparty, err error, created bool) {
	if errors.Is(err, ErrInvalidInput) {
		writeError(w, 400, "اطلاعات طرف‌حساب معتبر نیست.")
		return
	}
	if errors.Is(err, ErrConflict) {
		writeError(w, 409, "این شماره شناسایی قبلاً برای همین پروژه ثبت شده است.")
		return
	}
	if errors.Is(err, ErrNotFound) {
		writeError(w, 404, "طرف‌حساب پیدا نشد.")
		return
	}
	if err != nil {
		writeError(w, 500, "ذخیره طرف‌حساب ممکن نشد.")
		return
	}
	if created {
		writeJSON(w, 201, item)
	} else {
		writeJSON(w, 200, item)
	}
}
func decode(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, 400, "بدنه درخواست معتبر نیست.")
		return false
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		writeError(w, 400, "بدنه درخواست معتبر نیست.")
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
