package ledger

import (
	"encoding/json"
	"errors"
	"github.com/az58740/multi-project-manager/backend/internal/auth"
	"github.com/az58740/multi-project-manager/backend/internal/projects"
	"io"
	"net/http"
)

type Handler struct {
	projects projects.Store
	store    Store
}

func NewHandler(p projects.Store, s Store) *Handler { return &Handler{projects: p, store: s} }
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/projects/{code}/ledger/accounts", h.accounts)
	mux.HandleFunc("POST /api/v1/projects/{code}/ledger/accounts", h.createAccount)
	mux.HandleFunc("GET /api/v1/projects/{code}/ledger/entries", h.entries)
	mux.HandleFunc("POST /api/v1/projects/{code}/ledger/entries", h.createEntry)
}
func (h *Handler) project(w http.ResponseWriter, r *http.Request) (projects.Project, bool) {
	p, e := h.projects.GetByCode(r.Context(), r.PathValue("code"))
	if e != nil {
		writeError(w, 404, "پروژه پیدا نشد.")
		return projects.Project{}, false
	}
	return p, true
}
func (h *Handler) accounts(w http.ResponseWriter, r *http.Request) {
	p, ok := h.project(w, r)
	if !ok {
		return
	}
	items, e := h.store.ListAccounts(r.Context(), p.ID)
	if e != nil {
		writeError(w, 500, "دریافت حساب‌ها ممکن نشد.")
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}
func (h *Handler) createAccount(w http.ResponseWriter, r *http.Request) {
	p, ok := h.project(w, r)
	if !ok {
		return
	}
	var in AccountInput
	if !decode(w, r, &in) {
		return
	}
	a, e := h.store.CreateAccount(r.Context(), p.ID, in)
	if errors.Is(e, ErrInvalidInput) {
		writeError(w, 400, "اطلاعات حساب معتبر نیست.")
		return
	}
	if errors.Is(e, ErrConflict) {
		writeError(w, 409, "کد حساب تکراری است.")
		return
	}
	if e != nil {
		writeError(w, 500, "ثبت حساب ممکن نشد.")
		return
	}
	writeJSON(w, 201, a)
}
func (h *Handler) entries(w http.ResponseWriter, r *http.Request) {
	p, ok := h.project(w, r)
	if !ok {
		return
	}
	items, e := h.store.ListEntries(r.Context(), p.ID)
	if e != nil {
		writeError(w, 500, "دریافت سندها ممکن نشد.")
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}
func (h *Handler) createEntry(w http.ResponseWriter, r *http.Request) {
	p, ok := h.project(w, r)
	if !ok {
		return
	}
	var in EntryInput
	if !decode(w, r, &in) {
		return
	}
	u, _ := auth.UserFromContext(r.Context())
	e, err := h.store.CreateEntry(r.Context(), p.ID, u.ID, in)
	if errors.Is(err, ErrInvalidInput) {
		writeError(w, 400, "سند نامعتبر یا نامتراز است.")
		return
	}
	if errors.Is(err, ErrAccountNotFound) {
		writeError(w, 400, "حساب برای این پروژه پیدا نشد.")
		return
	}
	if err != nil {
		writeError(w, 500, "ثبت سند ممکن نشد.")
		return
	}
	writeJSON(w, 201, e)
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 128<<10)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if d.Decode(v) != nil {
		writeError(w, 400, "بدنهٔ درخواست معتبر نیست.")
		return false
	}
	var x any
	if d.Decode(&x) != io.EOF {
		writeError(w, 400, "بدنهٔ درخواست معتبر نیست.")
		return false
	}
	return true
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
