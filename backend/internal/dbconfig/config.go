// Package dbconfig applies shared PostgreSQL connection settings.
package dbconfig

import (
	"errors"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ParsePoolConfig keeps local PostgreSQL settings intact while ensuring that
// managed Neon connections verify the server certificate and hostname.
func ParsePoolConfig(databaseURL string) (*pgxpool.Config, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	if password, ok := os.LookupEnv("PGPASSWORD"); ok {
		config.ConnConfig.Password = password
	}

	conn := config.ConnConfig
	host := strings.TrimSuffix(strings.ToLower(conn.Host), ".")
	if strings.HasSuffix(host, ".neon.tech") {
		if conn.TLSConfig == nil {
			return nil, errors.New("Neon database connections require TLS")
		}
		// sslmode=require encrypts but does not verify certificates in pgx.
		// Neon uses a publicly trusted certificate, so enforce verify-full.
		conn.TLSConfig.InsecureSkipVerify = false
		conn.TLSConfig.VerifyPeerCertificate = nil
		conn.TLSConfig.ServerName = conn.Host
		// Never fall back to plaintext or to an unverified alternate host.
		conn.Fallbacks = nil
	}
	return config, nil
}
