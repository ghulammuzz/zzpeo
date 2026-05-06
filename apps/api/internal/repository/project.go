package repository

import (
	"context"
	"fmt"

	"github.com/ghulammuzz/zzpeo/api/internal/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ProjectRepository handles all database operations for Projects.
type ProjectRepository struct {
	pool *pgxpool.Pool
}

// NewProjectRepository creates a new ProjectRepository backed by pool.
func NewProjectRepository(pool *pgxpool.Pool) *ProjectRepository {
	return &ProjectRepository{pool: pool}
}

// CreateProjectInput carries the fields required to create a new project.
type CreateProjectInput struct {
	Name        string
	Slug        string
	Description *string
}

// UpdateProjectInput carries fields that may be patched on an existing project.
// All fields are treated as replacements (not partial); callers should fill
// in unchanged values from the existing record before calling Update.
type UpdateProjectInput struct {
	Name        string
	Slug        string
	Description *string
}

// Create inserts a new project and returns the persisted record.
func (r *ProjectRepository) Create(ctx context.Context, in CreateProjectInput) (*model.Project, error) {
	const q = `
		INSERT INTO projects (name, slug, description)
		VALUES ($1, $2, $3)
		RETURNING id, name, slug, description, created_at, updated_at`

	rows, err := r.pool.Query(ctx, q, in.Name, in.Slug, in.Description)
	if err != nil {
		return nil, fmt.Errorf("repository.Project.Create: query: %w", err)
	}

	project, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.Project])
	if err != nil {
		return nil, fmt.Errorf("repository.Project.Create: scan: %w", err)
	}

	return &project, nil
}

// List returns all projects ordered by name.
func (r *ProjectRepository) List(ctx context.Context) ([]model.Project, error) {
	const q = `
		SELECT id, name, slug, description, created_at, updated_at
		FROM projects
		ORDER BY name ASC`

	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository.Project.List: query: %w", err)
	}

	projects, err := pgx.CollectRows(rows, pgx.RowToStructByName[model.Project])
	if err != nil {
		return nil, fmt.Errorf("repository.Project.List: scan: %w", err)
	}

	return projects, nil
}

// GetByID fetches a single project by its primary key.
// Returns pgx.ErrNoRows (wrapped) when not found.
func (r *ProjectRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Project, error) {
	const q = `
		SELECT id, name, slug, description, created_at, updated_at
		FROM projects
		WHERE id = $1`

	rows, err := r.pool.Query(ctx, q, id)
	if err != nil {
		return nil, fmt.Errorf("repository.Project.GetByID: query: %w", err)
	}

	project, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.Project])
	if err != nil {
		return nil, fmt.Errorf("repository.Project.GetByID %s: %w", id, err)
	}

	return &project, nil
}

// GetBySlug fetches a single project by its unique slug.
// Returns pgx.ErrNoRows (wrapped) when not found.
func (r *ProjectRepository) GetBySlug(ctx context.Context, slug string) (*model.Project, error) {
	const q = `
		SELECT id, name, slug, description, created_at, updated_at
		FROM projects
		WHERE slug = $1`

	rows, err := r.pool.Query(ctx, q, slug)
	if err != nil {
		return nil, fmt.Errorf("repository.Project.GetBySlug: query: %w", err)
	}

	project, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.Project])
	if err != nil {
		return nil, fmt.Errorf("repository.Project.GetBySlug %q: %w", slug, err)
	}

	return &project, nil
}

// Update replaces the mutable fields of an existing project and bumps updated_at.
// Returns the updated record.
func (r *ProjectRepository) Update(ctx context.Context, id uuid.UUID, in UpdateProjectInput) (*model.Project, error) {
	const q = `
		UPDATE projects
		SET    name        = $2,
		       slug        = $3,
		       description = $4,
		       updated_at  = now()
		WHERE  id = $1
		RETURNING id, name, slug, description, created_at, updated_at`

	rows, err := r.pool.Query(ctx, q, id, in.Name, in.Slug, in.Description)
	if err != nil {
		return nil, fmt.Errorf("repository.Project.Update: query: %w", err)
	}

	project, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.Project])
	if err != nil {
		return nil, fmt.Errorf("repository.Project.Update %s: %w", id, err)
	}

	return &project, nil
}

// Delete removes a project by ID. Cascades to child environments.
func (r *ProjectRepository) Delete(ctx context.Context, id uuid.UUID) error {
	const q = `DELETE FROM projects WHERE id = $1`

	ct, err := r.pool.Exec(ctx, q, id)
	if err != nil {
		return fmt.Errorf("repository.Project.Delete: %w", err)
	}

	if ct.RowsAffected() == 0 {
		return fmt.Errorf("repository.Project.Delete %s: %w", id, pgx.ErrNoRows)
	}

	return nil
}
