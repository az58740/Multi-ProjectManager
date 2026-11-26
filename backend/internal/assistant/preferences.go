package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/az58740/multi-project-manager/backend/internal/auth"
)

var ErrInvalidPreference = errors.New("invalid assistant preference")

var projectCodePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$`)

var preferenceValues = map[string]map[string]bool{
	"preferredLanguage": {"fa": true, "en": true},
	"responseStyle":     {"concise": true, "detailed": true, "formal": true},
	"favoriteSection":   {"overview": true, "accounts": true, "catalog": true, "financial": true},
}

type PreferenceStore interface {
	List(context.Context, string) (map[string]string, error)
	Set(context.Context, string, string, string) error
	Delete(context.Context, string, string) error
}

type MemoryStore struct {
	mu    sync.RWMutex
	items map[string]map[string]string
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{items: make(map[string]map[string]string)}
}

func validatePreference(key, value string) (string, string, error) {
	key = strings.TrimSpace(key)
	value = strings.TrimSpace(value)
	if !utf8.ValidString(value) || len([]rune(value)) == 0 || len([]rune(value)) > 80 || strings.ContainsRune(value, 0) {
		return "", "", ErrInvalidPreference
	}
	if allowed, ok := preferenceValues[key]; ok {
		if !allowed[value] {
			return "", "", ErrInvalidPreference
		}
		return key, value, nil
	}
	if key == "defaultProjectCode" && projectCodePattern.MatchString(value) {
		return key, value, nil
	}
	return "", "", ErrInvalidPreference
}

func validatePreferenceKey(key string) bool {
	if _, ok := preferenceValues[key]; ok {
		return true
	}
	return key == "defaultProjectCode"
}

func (s *MemoryStore) List(_ context.Context, userID string) (map[string]string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make(map[string]string, len(s.items[userID]))
	for key, value := range s.items[userID] {
		out[key] = value
	}
	return out, nil
}

func (s *MemoryStore) Set(_ context.Context, userID, key, value string) error {
	key, value, err := validatePreference(key, value)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.items[userID] == nil {
		s.items[userID] = make(map[string]string)
	}
	s.items[userID][key] = value
	return nil
}

func (s *MemoryStore) Delete(_ context.Context, userID, key string) error {
	if !validatePreferenceKey(key) {
		return ErrInvalidPreference
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.items[userID], key)
	return nil
}

type Handler struct {
	store PreferenceStore
}

func NewHandler(store PreferenceStore) *Handler {
	return &Handler{store: store}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/assistant/preferences", h.list)
	mux.HandleFunc("PATCH /api/v1/assistant/preferences", h.set)
	mux.HandleFunc("DELETE /api/v1/assistant/preferences/{key}", h.delete)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "برای ادامه وارد سامانه شوید.")
		return
	}
	items, err := h.store.List(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "دریافت ترجیحات ممکن نشد.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *Handler) set(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "برای ادامه وارد سامانه شوید.")
		return
	}
	var input struct {
		Key   string `json:"key"`
		Value string `json:"value"`
	}
	if !decode(w, r, &input) {
		return
	}
	if err := h.store.Set(r.Context(), user.ID, input.Key, input.Value); err != nil {
		if errors.Is(err, ErrInvalidPreference) {
			writeError(w, http.StatusBadRequest, "ترجیح دستیار معتبر نیست.")
			return
		}
		writeError(w, http.StatusServiceUnavailable, "ذخیرهٔ ترجیح ممکن نشد.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"saved": true, "key": strings.TrimSpace(input.Key)})
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "برای ادامه وارد سامانه شوید.")
		return
	}
	if err := h.store.Delete(r.Context(), user.ID, r.PathValue("key")); err != nil {
		if errors.Is(err, ErrInvalidPreference) {
			writeError(w, http.StatusBadRequest, "کلید ترجیح دستیار معتبر نیست.")
			return
		}
		writeError(w, http.StatusServiceUnavailable, "حذف ترجیح ممکن نشد.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

func decode(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	decoder := json.NewDecoder(r.Body)
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
