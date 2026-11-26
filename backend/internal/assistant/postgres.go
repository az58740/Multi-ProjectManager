package assistant

import (
	"context"
	"github.com/az58740/multi-project-manager/backend/internal/dbconfig"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct {
	pool *pgxpool.Pool
}

func NewPostgresStore(ctx context.Context, databaseURL string) (*PostgresStore, error) {
	config, err := dbconfig.ParsePoolConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &PostgresStore{pool: pool}, nil
}

func (s *PostgresStore) Close() {
	s.pool.Close()
}

func (s *PostgresStore) List(ctx context.Context, userID string) (map[string]string, error) {
	rows, err := s.pool.Query(ctx, `SELECT preference_key, preference_value FROM assistant_preferences WHERE user_id=$1 ORDER BY preference_key`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make(map[string]string)
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, err
		}
		items[key] = value
	}
	return items, rows.Err()
}

func (s *PostgresStore) Set(ctx context.Context, userID, key, value string) error {
	key, value, err := validatePreference(key, value)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, `INSERT INTO assistant_preferences (user_id, preference_key, preference_value) VALUES ($1,$2,$3) ON CONFLICT (user_id, preference_key) DO UPDATE SET preference_value=EXCLUDED.preference_value, updated_at=NOW()`, userID, key, value)
	return err
}

func (s *PostgresStore) Delete(ctx context.Context, userID, key string) error {
	if !validatePreferenceKey(key) {
		return ErrInvalidPreference
	}
	_, err := s.pool.Exec(ctx, `DELETE FROM assistant_preferences WHERE user_id=$1 AND preference_key=$2`, userID, key)
	return err
}
