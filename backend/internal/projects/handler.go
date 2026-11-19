package projects

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

const maxRequestBody = 64 << 10

type Handler struct {
	store    Store
	dataMode string
}

func NewHandler(store Store, dataMode string) *Handler {
	return &Handler{store: store, dataMode: dataMode}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/projects", h.list)
	mux.HandleFunc("POST /api/v1/projects", h.create)
	mux.HandleFunc("GET /api/v1/projects/{id}", h.get)
	mux.HandleFunc("PUT /api/v1/projects/{id}", h.update)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	items, err := h.store.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "دریافت فهرست پروژه‌ها ممکن نشد.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "dataMode": h.dataMode})
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	input, ok := decodeInput(w, r)
	if !ok {
		return
	}
	if input.Status == "" {
		input.Status = "planning"
	}
	if message := validateInput(input); message != "" {
		writeError(w, http.StatusBadRequest, message)
		return
	}
	item, err := h.store.Create(r.Context(), input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "ثبت پروژه انجام نشد.")
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	item, err := h.store.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		writeStoreError(w, err, "دریافت پروژه ممکن نشد.")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	input, ok := decodeInput(w, r)
	if !ok {
		return
	}
	if message := validateInput(input); message != "" {
		writeError(w, http.StatusBadRequest, message)
		return
	}
	item, err := h.store.Update(r.Context(), r.PathValue("id"), input)
	if err != nil {
		writeStoreError(w, err, "به‌روزرسانی پروژه انجام نشد.")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func decodeInput(w http.ResponseWriter, r *http.Request) (CreateInput, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBody)
	decoder := json.NewDecoder(r.Body)
	var input CreateInput
	if err := decoder.Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "بدنهٔ درخواست معتبر نیست.")
		return CreateInput{}, false
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		writeError(w, http.StatusBadRequest, "بدنهٔ درخواست معتبر نیست.")
		return CreateInput{}, false
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Type = strings.TrimSpace(input.Type)
	input.Location = strings.TrimSpace(input.Location)
	input.Destination = strings.TrimSpace(input.Destination)
	input.Manager = strings.TrimSpace(input.Manager)
	input.Accountant = strings.TrimSpace(input.Accountant)
	input.Status = strings.TrimSpace(input.Status)
	input.StartDate = strings.TrimSpace(input.StartDate)
	input.EndDate = strings.TrimSpace(input.EndDate)
	input.Description = strings.TrimSpace(input.Description)
	input.DefaultCostCurrency = strings.TrimSpace(input.DefaultCostCurrency)
	input.DefaultSalesCurrency = strings.TrimSpace(input.DefaultSalesCurrency)
	return input, true
}

func validateInput(input CreateInput) string {
	if input.Name == "" || runeCount(input.Name) > 120 {
		return "نام پروژه الزامی است و باید حداکثر ۱۲۰ نویسه باشد."
	}
	if !validProjectType(input.Type) {
		return "نوع پروژه معتبر نیست."
	}
	if !validProjectStatus(input.Status) {
		return "وضعیت پروژه معتبر نیست."
	}
	if runeCount(input.Location) > 120 || runeCount(input.Destination) > 120 || runeCount(input.Manager) > 120 || runeCount(input.Accountant) > 120 {
		return "موقعیت، مقصد، مسئول و حسابدار باید حداکثر ۱۲۰ نویسه باشند."
	}
	if runeCount(input.Description) > 1000 {
		return "شرح پروژه باید حداکثر ۱۰۰۰ نویسه باشد."
	}
	start, startOK := validDate(input.StartDate)
	end, endOK := validDate(input.EndDate)
	if !startOK || !endOK {
		return "تاریخ باید خالی یا به قالب YYYY-MM-DD معتبر باشد."
	}
	if input.StartDate != "" && input.EndDate != "" && end.Before(start) {
		return "تاریخ پایان نمی‌تواند پیش از تاریخ شروع باشد."
	}
	if !validCurrency(input.DefaultCostCurrency) || !validCurrency(input.DefaultSalesCurrency) {
		return "ارز پیش‌فرض باید خالی یا کد سه‌حرفی بزرگ انگلیسی باشد."
	}
	return ""
}

func validProjectType(value string) bool {
	switch value {
	case "export", "cold-storage", "sorting", "construction", "rental", "other":
		return true
	default:
		return false
	}
}

func validProjectStatus(value string) bool {
	switch value {
	case "planning", "active", "paused", "completed":
		return true
	default:
		return false
	}
}

func validDate(value string) (time.Time, bool) {
	if value == "" {
		return time.Time{}, true
	}
	parsed, err := time.Parse("2006-01-02", value)
	return parsed, err == nil && parsed.Format("2006-01-02") == value
}

func validCurrency(value string) bool {
	if value == "" {
		return true
	}
	if len(value) != 3 {
		return false
	}
	for _, char := range value {
		if char < 'A' || char > 'Z' {
			return false
		}
	}
	return true
}

func runeCount(value string) int {
	if !utf8.ValidString(value) {
		return maxRequestBody
	}
	return len([]rune(value))
}

func newID() string {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err == nil {
		return "prj_" + hex.EncodeToString(raw[:])
	}
	return fmt.Sprintf("prj_%d", time.Now().UTC().UnixNano())
}

func newProjectCode(now time.Time) string {
	var raw [6]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return fmt.Sprintf("PRJ-%s-%012X", now.UTC().Format("20060102"), uint64(now.UTC().UnixNano())&0xffffffffffff)
	}
	return "PRJ-" + now.UTC().Format("20060102") + "-" + strings.ToUpper(hex.EncodeToString(raw[:]))
}

func writeStoreError(w http.ResponseWriter, err error, genericMessage string) {
	if err == ErrNotFound {
		writeError(w, http.StatusNotFound, "پروژه پیدا نشد.")
		return
	}
	writeError(w, http.StatusInternalServerError, genericMessage)
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
