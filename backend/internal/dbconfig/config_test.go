package dbconfig

import "testing"

func TestNeonEnforcesVerifiedTLS(t *testing.T) {
	cfg, err := ParsePoolConfig("postgres://app:password@ep-example-pooler.us-east-1.aws.neon.tech/db?sslmode=require")
	if err != nil {
		t.Fatal(err)
	}
	tls := cfg.ConnConfig.TLSConfig
	if tls == nil || tls.InsecureSkipVerify || tls.ServerName != cfg.ConnConfig.Host || len(cfg.ConnConfig.Fallbacks) != 0 {
		t.Fatalf("Neon TLS must verify certificate and hostname without fallbacks: %#v", tls)
	}
}

func TestNeonRejectsDisabledTLS(t *testing.T) {
	_, err := ParsePoolConfig("postgres://app@ep-example.aws.neon.tech/db?sslmode=disable")
	if err == nil {
		t.Fatal("expected Neon connection without TLS to fail")
	}
}

func TestLocalSettingsPreserved(t *testing.T) {
	t.Setenv("PGPASSWORD", "special:@/?#")
	cfg, err := ParsePoolConfig("postgres://app@db/db?sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ConnConfig.TLSConfig != nil || cfg.ConnConfig.Password != "special:@/?#" {
		t.Fatal("local TLS or password settings changed")
	}
}
