package repository

import (
	"context"
	"fmt"

	"github.com/ghulammuzz/zzpeo/api/internal/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// EnvironmentRepository handles all database operations for Environments and EnvVars.
type EnvironmentRepository struct {
	pool *pgxpool.Pool
}

// NewEnvironmentRepository creates a new EnvironmentRepository backed by pool.
func NewEnvironmentRepository(pool *pgxpool.Pool) *EnvironmentRepository {
	return &EnvironmentRepository{pool: pool}
}

// CreateEnvironmentInput carries the fields required to create a new environment.
type CreateEnvironmentInput struct {
	ProjectID uuid.UUID
	Name      string
	Slug      string
	Type      string // "prod" | "stg" | "custom"
}

// UpdateEnvironmentInput carries replaceable fields for an existing environment.
type UpdateEnvironmentInput struct {
	Name string
	Slug string
	Type string
}

// ---------------------------------------------------------------------------
// Environment CRUD
// ---------------------------------------------------------------------------

// Create inserts a new environment scoped to a project and returns the record.
func (r *EnvironmentRepository) Create(ctx context.Context, in CreateEnvironmentInput) (*model.Environment, error) {
	const q = `
		INSERT INTO environments (project_id, name, slug, type)
		VALUES ($1, $2, $3, $4)
		RETURNING id, project_id, name, slug, type, created_at, updated_at`

	rows, err := r.pool.Query(ctx, q, in.ProjectID, in.Name, in.Slug, in.Type)
	if err != nil {
		return nil, fmt.Errorf("repository.Environment.Create: query: %w", err)
	}

	env, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.Environment])
	if err != nil {
		return nil, fmt.Errorf("repository.Environment.Create: scan: %w", err)
	}

	return &env, nil
}

// List returns all environments belonging to projectID ordered by name.
func (r *EnvironmentRepository) List(ctx context.Context, projectID uuid.UUID) ([]model.Environment, error) {
	const q = `
		SELECT id, project_id, name, slug, type, created_at, updated_at
		FROM   environments
		WHERE  project_id = $1
		ORDER  BY name ASC`

	rows, err := r.pool.Query(ctx, q, projectID)
	if err != nil {
		return nil, fmt.Errorf("repository.Environment.List: query: %w", err)
	}

	envs, err := pgx.CollectRows(rows, pgx.RowToStructByName[model.Environment])
	if err != nil {
		return nil, fmt.Errorf("repository.Environment.List: scan: %w", err)
	}

	return envs, nil
}

// GetByID fetches a single environment by its primary key.
func (r *EnvironmentRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Environment, error) {
	const q = `
		SELECT id, project_id, name, slug, type, created_at, updated_at
		FROM   environments
		WHERE  id = $1`

	rows, err := r.pool.Query(ctx, q, id)
	if err != nil {
		return nil, fmt.Errorf("repository.Environment.GetByID: query: %w", err)
	}

	env, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.Environment])
	if err != nil {
		return nil, fmt.Errorf("repository.Environment.GetByID %s: %w", id, err)
	}

	return &env, nil
}

// Update replaces the mutable fields of an environment and bumps updated_at.
func (r *EnvironmentRepository) Update(ctx context.Context, id uuid.UUID, in UpdateEnvironmentInput) (*model.Environment, error) {
	const q = `
		UPDATE environments
		SET    name       = $2,
		       slug       = $3,
		       type       = $4,
		       updated_at = now()
		WHERE  id = $1
		RETURNING id, project_id, name, slug, type, created_at, updated_at`

	rows, err := r.pool.Query(ctx, q, id, in.Name, in.Slug, in.Type)
	if err != nil {
		return nil, fmt.Errorf("repository.Environment.Update: query: %w", err)
	}

	env, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.Environment])
	if err != nil {
		return nil, fmt.Errorf("repository.Environment.Update %s: %w", id, err)
	}

	return &env, nil
}

// Delete removes an environment by ID. Cascades to servers and env vars.
func (r *EnvironmentRepository) Delete(ctx context.Context, id uuid.UUID) error {
	const q = `DELETE FROM environments WHERE id = $1`

	ct, err := r.pool.Exec(ctx, q, id)
	if err != nil {
		return fmt.Errorf("repository.Environment.Delete: %w", err)
	}

	if ct.RowsAffected() == 0 {
		return fmt.Errorf("repository.Environment.Delete %s: %w", id, pgx.ErrNoRows)
	}

	return nil
}

// ---------------------------------------------------------------------------
// EnvVar operations
// ---------------------------------------------------------------------------

// ListEnvVars returns all env vars for the given environment, ordered by key.
// ValueEnc (the encrypted blob) is included for callers that need to decrypt.
func (r *EnvironmentRepository) ListEnvVars(ctx context.Context, envID uuid.UUID) ([]model.EnvVar, error) {
	const q = `
		SELECT id, environment_id, key, value_enc, created_at, updated_at
		FROM   env_vars
		WHERE  environment_id = $1
		ORDER  BY key ASC`

	rows, err := r.pool.Query(ctx, q, envID)
	if err != nil {
		return nil, fmt.Errorf("repository.Environment.ListEnvVars: query: %w", err)
	}

	vars, err := pgx.CollectRows(rows, pgx.RowToStructByName[model.EnvVar])
	if err != nil {
		return nil, fmt.Errorf("repository.Environment.ListEnvVars: scan: %w", err)
	}

	return vars, nil
}

// UpsertEnvVar inserts a new env var or updates value_enc + updated_at when the
// (environment_id, key) pair already exists.
func (r *EnvironmentRepository) UpsertEnvVar(ctx context.Context, envID uuid.UUID, key string, valueEnc []byte) (*model.EnvVar, error) {
	const q = `
		INSERT INTO env_vars (environment_id, key, value_enc)
		VALUES ($1, $2, $3)
		ON CONFLICT (environment_id, key)
		DO UPDATE SET
		    value_enc = EXCLUDED.value_enc,
		    updated_at = now()
		RETURNING id, environment_id, key, value_enc, created_at, updated_at`

	rows, err := r.pool.Query(ctx, q, envID, key, valueEnc)
	if err != nil {
		return nil, fmt.Errorf("repository.Environment.UpsertEnvVar: query: %w", err)
	}

	ev, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.EnvVar])
	if err != nil {
		return nil, fmt.Errorf("repository.Environment.UpsertEnvVar: scan: %w", err)
	}

	return &ev, nil
}

// DeleteEnvVar removes a single env var identified by (envID, key).
func (r *EnvironmentRepository) DeleteEnvVar(ctx context.Context, envID uuid.UUID, key string) error {
	const q = `DELETE FROM env_vars WHERE environment_id = $1 AND key = $2`

	ct, err := r.pool.Exec(ctx, q, envID, key)
	if err != nil {
		return fmt.Errorf("repository.Environment.DeleteEnvVar: %w", err)
	}

	if ct.RowsAffected() == 0 {
		return fmt.Errorf("repository.Environment.DeleteEnvVar env=%s key=%q: %w", envID, key, pgx.ErrNoRows)
	}

	return nil
}
