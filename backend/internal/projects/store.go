package projects

import (
	"context"
	"errors"
	"sort"
	"sync"
	"time"
)

var ErrNotFound = errors.New("project not found")

type Project struct {
	ID                   string    `json:"id"`
	Code                 string    `json:"code"`
	Name                 string    `json:"name"`
	Type                 string    `json:"type"`
	Location             string    `json:"location"`
	Destination          string    `json:"destination"`
	Manager              string    `json:"manager"`
	Accountant           string    `json:"accountant"`
	Status               string    `json:"status"`
	StartDate            string    `json:"startDate"`
	EndDate              string    `json:"endDate"`
	Description          string    `json:"description"`
	DefaultCostCurrency  string    `json:"defaultCostCurrency"`
	DefaultSalesCurrency string    `json:"defaultSalesCurrency"`
	CreatedAt            time.Time `json:"createdAt"`
	UpdatedAt            time.Time `json:"updatedAt"`
}

type CreateInput struct {
	Name                 string `json:"name"`
	Type                 string `json:"type"`
	Location             string `json:"location"`
	Destination          string `json:"destination"`
	Manager              string `json:"manager"`
	Accountant           string `json:"accountant"`
	Status               string `json:"status"`
	StartDate            string `json:"startDate"`
	EndDate              string `json:"endDate"`
	Description          string `json:"description"`
	DefaultCostCurrency  string `json:"defaultCostCurrency"`
	DefaultSalesCurrency string `json:"defaultSalesCurrency"`
}

type Store interface {
	List(context.Context) ([]Project, error)
	Create(context.Context, CreateInput) (Project, error)
	Get(context.Context, string) (Project, error)
	Update(context.Context, string, CreateInput) (Project, error)
}

type MemoryStore struct {
	mu       sync.RWMutex
	projects []Project
}

func NewMemoryStore(seed []Project) *MemoryStore {
	return &MemoryStore{projects: append([]Project(nil), seed...)}
}

func (s *MemoryStore) List(_ context.Context) ([]Project, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := append([]Project(nil), s.projects...)
	sort.Slice(items, func(i, j int) bool { return items[i].CreatedAt.After(items[j].CreatedAt) })
	return items, nil
}

func (s *MemoryStore) Create(_ context.Context, in CreateInput) (Project, error) {
	now := time.Now().UTC()
	project := projectFromInput(in)
	project.ID = newID()
	project.Code = newProjectCode(now)
	project.CreatedAt = now
	project.UpdatedAt = now

	s.mu.Lock()
	defer s.mu.Unlock()
	for codeExists(s.projects, project.Code) {
		project.Code = newProjectCode(time.Now().UTC())
	}
	s.projects = append(s.projects, project)
	return project, nil
}

func (s *MemoryStore) Get(_ context.Context, id string) (Project, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, project := range s.projects {
		if project.ID == id {
			return project, nil
		}
	}
	return Project{}, ErrNotFound
}

func (s *MemoryStore) Update(_ context.Context, id string, in CreateInput) (Project, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, existing := range s.projects {
		if existing.ID == id {
			updated := projectFromInput(in)
			updated.ID = existing.ID
			updated.Code = existing.Code
			updated.CreatedAt = existing.CreatedAt
			updated.UpdatedAt = time.Now().UTC()
			s.projects[i] = updated
			return updated, nil
		}
	}
	return Project{}, ErrNotFound
}

func projectFromInput(in CreateInput) Project {
	return Project{
		Name: in.Name, Type: in.Type, Location: in.Location, Destination: in.Destination,
		Manager: in.Manager, Accountant: in.Accountant, Status: in.Status,
		StartDate: in.StartDate, EndDate: in.EndDate, Description: in.Description,
		DefaultCostCurrency: in.DefaultCostCurrency, DefaultSalesCurrency: in.DefaultSalesCurrency,
	}
}

func codeExists(items []Project, code string) bool {
	for _, item := range items {
		if item.Code == code {
			return true
		}
	}
	return false
}

func DemoProjects() []Project {
	now := time.Now().UTC()
	return []Project{
		{ID: "demo-russia", Code: "PRJ-DEMO-001", Name: "صادرات میوه به روسیه", Type: "export", Location: "روسیه", Manager: "علی رضایی", Status: "active", CreatedAt: now.Add(-24 * time.Hour), UpdatedAt: now.Add(-24 * time.Hour)},
		{ID: "demo-city", Code: "PRJ-DEMO-002", Name: "پروژه شهرک", Type: "construction", Location: "ایران", Manager: "مریم احمدی", Status: "active", CreatedAt: now.Add(-72 * time.Hour), UpdatedAt: now.Add(-72 * time.Hour)},
		{ID: "demo-cold", Code: "PRJ-DEMO-003", Name: "سردخانه مرکزی", Type: "cold-storage", Location: "ایران", Manager: "رضا کریمی", Status: "planning", CreatedAt: now.Add(-120 * time.Hour), UpdatedAt: now.Add(-120 * time.Hour)},
	}
}
