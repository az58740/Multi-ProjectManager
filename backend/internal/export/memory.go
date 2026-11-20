package export

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/az58740/multi-project-manager/backend/internal/projects"
)

type MemoryStore struct {
	mu             sync.RWMutex
	projects       projects.Store
	counterparties map[string]map[string]Counterparty
	shipments      map[string][]Shipment
}

func NewMemoryStore(projectStore projects.Store) *MemoryStore {
	return &MemoryStore{projects: projectStore, counterparties: make(map[string]map[string]Counterparty), shipments: make(map[string][]Shipment)}
}

func (s *MemoryStore) ListCounterparties(_ context.Context, projectID string) ([]Counterparty, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]Counterparty, 0, len(s.counterparties[projectID]))
	for _, item := range s.counterparties[projectID] {
		item.Roles = append([]string(nil), item.Roles...)
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].CreatedAt.Equal(items[j].CreatedAt) {
			return items[i].ID > items[j].ID
		}
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})
	return items, nil
}

func (s *MemoryStore) CreateCounterparty(ctx context.Context, projectID string, input CounterpartyInput) (Counterparty, error) {
	in, err := prepareCounterparty(input)
	if err != nil {
		return Counterparty{}, err
	}
	if _, err := s.projects.Get(ctx, projectID); err != nil {
		return Counterparty{}, err
	}
	id, err := newID("cp_")
	if err != nil {
		return Counterparty{}, err
	}
	item := Counterparty{ID: id, ProjectID: projectID, CounterpartyInput: in, CreatedAt: time.Now().UTC()}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.counterparties[projectID] == nil {
		s.counterparties[projectID] = make(map[string]Counterparty)
	}
	// Keep returned roles independent of the stored slice.
	stored := item
	stored.Roles = append([]string(nil), item.Roles...)
	s.counterparties[projectID][id] = stored
	return item, nil
}

func (s *MemoryStore) ListShipments(_ context.Context, projectID string) ([]Shipment, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := append([]Shipment{}, s.shipments[projectID]...)
	sort.Slice(items, func(i, j int) bool {
		if items[i].CreatedAt.Equal(items[j].CreatedAt) {
			return items[i].ID > items[j].ID
		}
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})
	return items, nil
}

func (s *MemoryStore) CreateShipment(_ context.Context, projectID string, input ShipmentInput) (Shipment, error) {
	in, err := prepareShipment(input)
	if err != nil {
		return Shipment{}, err
	}
	id, err := newID("shp_")
	if err != nil {
		return Shipment{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	supplier, ok := s.counterparties[projectID][in.SupplierID]
	if !ok || !hasSupplierRole(supplier.Roles) {
		return Shipment{}, ErrInvalidSupplier
	}
	item := Shipment{ID: id, ProjectID: projectID, ShipmentInput: in, CreatedAt: time.Now().UTC()}
	s.shipments[projectID] = append(s.shipments[projectID], item)
	return item, nil
}
