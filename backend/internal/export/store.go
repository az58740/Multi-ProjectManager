// Package export implements project-scoped export counterparties and shipments.
package export

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrInvalidInput    = errors.New("invalid export input")
	ErrInvalidSupplier = errors.New("supplier not found in this project or lacks supplier role")
)

type CounterpartyInput struct {
	Name    string   `json:"name"`
	Roles   []string `json:"roles"`
	Phone   string   `json:"phone"`
	Country string   `json:"country"`
	Notes   string   `json:"notes"`
}

type Counterparty struct {
	ID        string `json:"id"`
	ProjectID string `json:"projectId"`
	CounterpartyInput
	CreatedAt time.Time `json:"createdAt"`
}

type ShipmentInput struct {
	Reference   string `json:"reference"`
	SupplierID  string `json:"supplierId"`
	PalletCount int64  `json:"palletCount"`
	WeightKg    string `json:"weightKg"`
	Destination string `json:"destination"`
	Status      string `json:"status"`
	Notes       string `json:"notes"`
}

type Shipment struct {
	ID        string `json:"id"`
	ProjectID string `json:"projectId"`
	ShipmentInput
	CreatedAt time.Time `json:"createdAt"`
}

type Store interface {
	ListCounterparties(context.Context, string) ([]Counterparty, error)
	CreateCounterparty(context.Context, string, CounterpartyInput) (Counterparty, error)
	ListShipments(context.Context, string) ([]Shipment, error)
	CreateShipment(context.Context, string, ShipmentInput) (Shipment, error)
}

func prepareCounterparty(in CounterpartyInput) (CounterpartyInput, error) {
	in.Name = strings.TrimSpace(in.Name)
	in.Phone = strings.TrimSpace(in.Phone)
	in.Country = strings.TrimSpace(in.Country)
	in.Notes = strings.TrimSpace(in.Notes)
	if in.Name == "" || len(in.Roles) == 0 || !validText(in.Name, in.Phone, in.Country, in.Notes) {
		return CounterpartyInput{}, ErrInvalidInput
	}
	// Copy the slice so the caller cannot mutate stored data.
	in.Roles = append([]string(nil), in.Roles...)
	for _, role := range in.Roles {
		if role != "supplier" && role != "customer" && role != "intermediary" {
			return CounterpartyInput{}, ErrInvalidInput
		}
	}
	return in, nil
}

func prepareShipment(in ShipmentInput) (ShipmentInput, error) {
	in.Reference = strings.TrimSpace(in.Reference)
	in.SupplierID = strings.TrimSpace(in.SupplierID)
	in.Destination = strings.TrimSpace(in.Destination)
	in.Status = strings.TrimSpace(in.Status)
	in.Notes = strings.TrimSpace(in.Notes)
	in.WeightKg = strings.TrimSpace(in.WeightKg)
	if in.Reference == "" || in.SupplierID == "" || in.PalletCount <= 0 || !validText(in.Reference, in.SupplierID, in.Destination, in.Notes) {
		return ShipmentInput{}, ErrInvalidInput
	}
	switch in.Status {
	case "planning", "in_transit", "delivered", "sold":
	default:
		return ShipmentInput{}, ErrInvalidInput
	}
	weight, ok := normalizeWeight(in.WeightKg)
	if !ok {
		return ShipmentInput{}, ErrInvalidInput
	}
	in.WeightKg = weight
	return in, nil
}

func validText(values ...string) bool {
	for _, value := range values {
		if !utf8.ValidString(value) || strings.ContainsRune(value, 0) {
			return false
		}
	}
	return true
}

// PostgreSQL NUMERIC supports up to 131072 integer and 16383 fractional digits.
// Restrict syntax to non-negative, plain base-10 decimals and never parse a float.
// Normalizing leading zeroes matches NUMERIC::text while retaining fractional scale.
func normalizeWeight(value string) (string, bool) {
	parts := strings.Split(value, ".")
	if len(parts) > 2 || len(parts[0]) == 0 || len(parts[0]) > 131072 || (len(parts) == 2 && (len(parts[1]) == 0 || len(parts[1]) > 16383)) {
		return "", false
	}
	positive := false
	for _, part := range parts {
		for _, digit := range part {
			if digit < '0' || digit > '9' {
				return "", false
			}
			if digit != '0' {
				positive = true
			}
		}
	}
	if !positive {
		return "", false
	}
	integer := strings.TrimLeft(parts[0], "0")
	if integer == "" {
		integer = "0"
	}
	if len(parts) == 2 {
		return integer + "." + parts[1], true
	}
	return integer, true
}

func hasSupplierRole(roles []string) bool {
	for _, role := range roles {
		if role == "supplier" {
			return true
		}
	}
	return false
}

func newID(prefix string) (string, error) {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", err
	}
	return prefix + hex.EncodeToString(bytes[:]), nil
}
