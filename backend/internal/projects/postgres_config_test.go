package projects

import "testing"

func TestParsePoolConfigUsesSeparatePassword(t *testing.T) {
	password := `p@ss:/?#%[]`
	t.Setenv("PGPASSWORD", password)

	config, err := parsePoolConfig("postgres://app@db:5432/multi_project_manager?sslmode=disable")
	if err != nil {
		t.Fatalf("parse PostgreSQL config: %v", err)
	}
	if config.ConnConfig.Password != password {
		t.Fatalf("password = %q, want unchanged special-character password", config.ConnConfig.Password)
	}
}
