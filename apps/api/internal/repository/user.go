package repository

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"time"

	"github.com/ghulammuzz/zzpeo/api/internal/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type UserRepository struct {
	pool *pgxpool.Pool
}

func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

func (r *UserRepository) Create(ctx context.Context, username string, role model.UserRole, createdBy *uuid.UUID) (*model.User, error) {
	const q = `
		INSERT INTO users (username, role, created_by)
		VALUES ($1, $2, $3)
		RETURNING id, username, password_hash, role, created_by, created_at, updated_at`

	rows, err := r.pool.Query(ctx, q, username, string(role), createdBy)
	if err != nil {
		return nil, fmt.Errorf("repository.User.Create: %w", err)
	}
	u, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.User])
	if err != nil {
		return nil, fmt.Errorf("repository.User.Create: scan: %w", err)
	}
	return &u, nil
}

func (r *UserRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.User, error) {
	const q = `
		SELECT id, username, password_hash, role, created_by, created_at, updated_at
		FROM users WHERE id = $1`

	rows, err := r.pool.Query(ctx, q, id)
	if err != nil {
		return nil, fmt.Errorf("repository.User.GetByID: %w", err)
	}
	u, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.User])
	if err != nil {
		return nil, fmt.Errorf("repository.User.GetByID: %w", err)
	}
	return &u, nil
}

func (r *UserRepository) GetByUsername(ctx context.Context, username string) (*model.User, error) {
	const q = `
		SELECT id, username, password_hash, role, created_by, created_at, updated_at
		FROM users WHERE username = $1`

	rows, err := r.pool.Query(ctx, q, username)
	if err != nil {
		return nil, fmt.Errorf("repository.User.GetByUsername: %w", err)
	}
	u, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.User])
	if err != nil {
		return nil, fmt.Errorf("repository.User.GetByUsername: %w", err)
	}
	return &u, nil
}

func (r *UserRepository) List(ctx context.Context) ([]model.User, error) {
	const q = `
		SELECT id, username, password_hash, role, created_by, created_at, updated_at
		FROM users ORDER BY created_at ASC`

	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository.User.List: %w", err)
	}
	users, err := pgx.CollectRows(rows, pgx.RowToStructByName[model.User])
	if err != nil {
		return nil, fmt.Errorf("repository.User.List: scan: %w", err)
	}
	return users, nil
}

func (r *UserRepository) Delete(ctx context.Context, id uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("repository.User.Delete: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return fmt.Errorf("repository.User.Delete %s: %w", id, pgx.ErrNoRows)
	}
	return nil
}

func (r *UserRepository) SetPassword(ctx context.Context, id uuid.UUID, password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("repository.User.SetPassword: bcrypt: %w", err)
	}
	_, err = r.pool.Exec(ctx, `
		UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`,
		id, string(hash))
	if err != nil {
		return fmt.Errorf("repository.User.SetPassword: %w", err)
	}
	return nil
}

func (r *UserRepository) CheckPassword(ctx context.Context, user *model.User, password string) bool {
	if user.PasswordHash == nil {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(password)) == nil
}

func (r *UserRepository) AdminExists(ctx context.Context) (bool, error) {
	var count int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE role = 'admin'`).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("repository.User.AdminExists: %w", err)
	}
	return count > 0, nil
}

// Registration tokens

func (r *UserRepository) CreateRegToken(ctx context.Context, userID uuid.UUID) (*model.RegistrationToken, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return nil, fmt.Errorf("repository.User.CreateRegToken: rand: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(b)

	// Invalidate any existing unused tokens for this user
	_, _ = r.pool.Exec(ctx, `
		UPDATE registration_tokens SET used_at = now()
		WHERE user_id = $1 AND used_at IS NULL`, userID)

	const q = `
		INSERT INTO registration_tokens (user_id, token, expires_at)
		VALUES ($1, $2, $3)
		RETURNING id, user_id, token, expires_at, used_at, created_at`

	rows, err := r.pool.Query(ctx, q, userID, token, time.Now().Add(7*24*time.Hour))
	if err != nil {
		return nil, fmt.Errorf("repository.User.CreateRegToken: %w", err)
	}
	rt, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.RegistrationToken])
	if err != nil {
		return nil, fmt.Errorf("repository.User.CreateRegToken: scan: %w", err)
	}
	return &rt, nil
}

func (r *UserRepository) GetValidRegToken(ctx context.Context, token string) (*model.RegistrationToken, error) {
	const q = `
		SELECT id, user_id, token, expires_at, used_at, created_at
		FROM registration_tokens
		WHERE token = $1 AND used_at IS NULL AND expires_at > now()`

	rows, err := r.pool.Query(ctx, q, token)
	if err != nil {
		return nil, fmt.Errorf("repository.User.GetValidRegToken: %w", err)
	}
	rt, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.RegistrationToken])
	if err != nil {
		return nil, fmt.Errorf("repository.User.GetValidRegToken: %w", err)
	}
	return &rt, nil
}

func (r *UserRepository) MarkRegTokenUsed(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `UPDATE registration_tokens SET used_at = now() WHERE id = $1`, id)
	return err
}

func (r *UserRepository) GetActiveRegToken(ctx context.Context, userID uuid.UUID) (string, error) {
	var token string
	err := r.pool.QueryRow(ctx, `
		SELECT token FROM registration_tokens
		WHERE user_id = $1 AND used_at IS NULL AND expires_at > now()
		ORDER BY created_at DESC LIMIT 1`, userID).Scan(&token)
	if err != nil {
		return "", nil // no active token is OK
	}
	return token, nil
}

// Permissions

func (r *UserRepository) SetPermissions(ctx context.Context, userID uuid.UUID, projectIDs []uuid.UUID) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("repository.User.SetPermissions: begin: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM user_permissions WHERE user_id = $1`, userID); err != nil {
		return fmt.Errorf("repository.User.SetPermissions: delete: %w", err)
	}

	for _, pid := range projectIDs {
		if _, err := tx.Exec(ctx, `
			INSERT INTO user_permissions (user_id, project_id) VALUES ($1, $2)
			ON CONFLICT DO NOTHING`, userID, pid); err != nil {
			return fmt.Errorf("repository.User.SetPermissions: insert %s: %w", pid, err)
		}
	}

	return tx.Commit(ctx)
}

func (r *UserRepository) ListPermissions(ctx context.Context, userID uuid.UUID) ([]model.UserPermission, error) {
	const q = `
		SELECT up.id, up.user_id, up.project_id, p.name AS project_name, up.created_at
		FROM user_permissions up
		JOIN projects p ON p.id = up.project_id
		WHERE up.user_id = $1
		ORDER BY p.name ASC`

	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, fmt.Errorf("repository.User.ListPermissions: %w", err)
	}
	perms, err := pgx.CollectRows(rows, pgx.RowToStructByName[model.UserPermission])
	if err != nil {
		return nil, fmt.Errorf("repository.User.ListPermissions: scan: %w", err)
	}
	return perms, nil
}

func (r *UserRepository) HasProjectAccess(ctx context.Context, userID uuid.UUID, projectID uuid.UUID) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM user_permissions
			WHERE user_id = $1 AND project_id = $2
		)`, userID, projectID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("repository.User.HasProjectAccess: %w", err)
	}
	return exists, nil
}

func (r *UserRepository) ListPermittedProjectIDs(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT project_id FROM user_permissions WHERE user_id = $1`, userID)
	if err != nil {
		return nil, fmt.Errorf("repository.User.ListPermittedProjectIDs: %w", err)
	}
	defer rows.Close()

	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}
