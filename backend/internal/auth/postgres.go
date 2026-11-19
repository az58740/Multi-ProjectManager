package auth

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/az58740/multi-project-manager/backend/internal/dbconfig"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct{ pool *pgxpool.Pool }

func NewPostgresStore(ctx context.Context, databaseURL string) (*PostgresStore, error) {
	cfg, err := dbconfig.ParsePoolConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err = pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &PostgresStore{pool}, nil
}
func (s *PostgresStore) Close() { s.pool.Close() }

const columns = `id, name, email, role, status, created_at`

func scanUser(row interface{ Scan(...any) error }) (User, error) {
	var u User
	e := row.Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.Status, &u.CreatedAt)
	if errors.Is(e, pgx.ErrNoRows) {
		return u, ErrNotFound
	}
	return u, e
}
func lockUsers(ctx context.Context, tx pgx.Tx) error {
	_, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, "multi-project-manager:auth-users")
	return err
}
func isUnique(err error) bool { var e *pgconn.PgError; return errors.As(err, &e) && e.Code == "23505" }
func insertUser(ctx context.Context, tx pgx.Tx, r record) error {
	_, err := tx.Exec(ctx, `INSERT INTO auth_users (id,name,email,password_hash,role,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, r.ID, r.Name, r.Email, r.PasswordHash, r.Role, r.Status, r.CreatedAt)
	if isUnique(err) {
		return ErrConflict
	}
	return err
}
func admin(ctx context.Context, tx pgx.Tx, id string) error {
	var ok bool
	err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM auth_users WHERE id=$1 AND role='admin' AND status='active')`, id).Scan(&ok)
	if err != nil {
		return err
	}
	if !ok {
		return ErrForbidden
	}
	return nil
}
func (s *PostgresStore) Bootstrap(ctx context.Context, r record) (bool, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	if err = lockUsers(ctx, tx); err != nil {
		return false, err
	}
	var n int
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM auth_users`).Scan(&n); err != nil {
		return false, err
	}
	if n != 0 {
		return false, tx.Commit(ctx)
	}
	if err = insertUser(ctx, tx, r); err != nil {
		return false, err
	}
	return true, tx.Commit(ctx)
}
func (s *PostgresStore) Create(ctx context.Context, r record, actor string) (User, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback(ctx)
	if err = lockUsers(ctx, tx); err != nil {
		return User{}, err
	}
	if actor != "" {
		if err = admin(ctx, tx, actor); err != nil {
			return User{}, err
		}
	}
	if err = insertUser(ctx, tx, r); err != nil {
		return User{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return User{}, err
	}
	return r.User, nil
}
func (s *PostgresStore) ByEmail(ctx context.Context, email string) (record, error) {
	var r record
	err := s.pool.QueryRow(ctx, `SELECT `+columns+`, password_hash FROM auth_users WHERE email=$1`, email).Scan(&r.ID, &r.Name, &r.Email, &r.Role, &r.Status, &r.CreatedAt, &r.PasswordHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return r, ErrNotFound
	}
	return r, err
}
func (s *PostgresStore) List(ctx context.Context) ([]User, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+columns+` FROM auth_users ORDER BY created_at,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []User{}
	for rows.Next() {
		u, e := scanUser(rows)
		if e != nil {
			return nil, e
		}
		out = append(out, u)
	}
	return out, rows.Err()
}
func (s *PostgresStore) Update(ctx context.Context, actor, id string, c changes) (User, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback(ctx)
	if err = lockUsers(ctx, tx); err != nil {
		return User{}, err
	}
	if err = admin(ctx, tx, actor); err != nil {
		return User{}, err
	}
	var r record
	err = tx.QueryRow(ctx, `SELECT `+columns+`,password_hash FROM auth_users WHERE id=$1 FOR UPDATE`, id).Scan(&r.ID, &r.Name, &r.Email, &r.Role, &r.Status, &r.CreatedAt, &r.PasswordHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, err
	}
	role, status := r.Role, r.Status
	if c.Role != nil {
		role = *c.Role
	}
	if c.Status != nil {
		status = *c.Status
	}
	if r.Role == "admin" && r.Status == "active" && (role != "admin" || status != "active") {
		var n int
		if err = tx.QueryRow(ctx, `SELECT count(*) FROM auth_users WHERE role='admin' AND status='active'`).Scan(&n); err != nil {
			return User{}, err
		}
		if n <= 1 {
			return User{}, ErrLastAdmin
		}
	}
	changed := role != r.Role || status != r.Status || c.PasswordHash != nil
	if c.Name != nil {
		r.Name = *c.Name
	}
	r.Role = role
	r.Status = status
	if c.PasswordHash != nil {
		r.PasswordHash = *c.PasswordHash
	}
	_, err = tx.Exec(ctx, `UPDATE auth_users SET name=$2,role=$3,status=$4,password_hash=$5 WHERE id=$1`, id, r.Name, r.Role, r.Status, r.PasswordHash)
	if err != nil {
		return User{}, err
	}
	if changed {
		if _, err = tx.Exec(ctx, `DELETE FROM auth_sessions WHERE user_id=$1`, id); err != nil {
			return User{}, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return User{}, err
	}
	return r.User, nil
}
func (s *PostgresStore) NewSession(ctx context.Context, id, hash string, token []byte, expiry time.Time) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err = lockUsers(ctx, tx); err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, `INSERT INTO auth_sessions (token_hash,user_id,expires_at) SELECT $1,id,$2 FROM auth_users WHERE id=$3 AND password_hash=$4 AND status='active'`, token, expiry, id, hash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ErrStale
	}
	if _, err = tx.Exec(ctx, `DELETE FROM auth_sessions WHERE expires_at <= now()`); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func (s *PostgresStore) Session(ctx context.Context, token []byte) (User, error) {
	return scanUser(s.pool.QueryRow(ctx, `SELECT u.id,u.name,u.email,u.role,u.status,u.created_at FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active'`, token))
}
func (s *PostgresStore) DeleteSession(ctx context.Context, token []byte) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM auth_sessions WHERE token_hash=$1`, token)
	return err
}
func (s *PostgresStore) Attempt(ctx context.Context, key []byte, max int, window time.Duration) (bool, error) {
	var count int
	err := s.pool.QueryRow(ctx, `INSERT INTO auth_rate_limits (bucket_hash,attempts,expires_at) VALUES ($1,1,now()+$2::interval) ON CONFLICT (bucket_hash) DO UPDATE SET attempts=CASE WHEN auth_rate_limits.expires_at<=now() THEN 1 ELSE auth_rate_limits.attempts+1 END, expires_at=CASE WHEN auth_rate_limits.expires_at<=now() THEN now()+$2::interval ELSE auth_rate_limits.expires_at END RETURNING attempts`, key, fmt.Sprintf("%f seconds", window.Seconds())).Scan(&count)
	if err != nil {
		return false, err
	}
	if count == 1 {
		_, err = s.pool.Exec(ctx, `DELETE FROM auth_rate_limits WHERE expires_at<=now()`)
		if err != nil {
			return false, err
		}
	}
	return count <= max, nil
}
