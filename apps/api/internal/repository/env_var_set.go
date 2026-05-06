package repository

import (
	"context"
	"fmt"

	"github.com/ghulammuzz/zzpeo/api/internal/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// EnvVarSetRepository handles all database operations for EnvVarSets.
type EnvVarSetRepository struct {
	pool *pgxpool.Pool
}

func NewEnvVarSetRepository(pool *pgxpool.Pool) *EnvVarSetRepository {
	return &EnvVarSetRepository{pool: pool}
}

// ---------------------------------------------------------------------------
// Sets CRUD
// ---------------------------------------------------------------------------

func (r *EnvVarSetRepository) List(ctx context.Context) ([]model.EnvVarSet, error) {
	const q = `SELECT id, name, description, created_at, updated_at FROM env_var_sets ORDER BY name ASC`
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository.EnvVarSet.List: %w", err)
	}
	sets, err := pgx.CollectRows(rows, pgx.RowToStructByName[model.EnvVarSet])
	if err != nil {
		return nil, fmt.Errorf("repository.EnvVarSet.List: scan: %w", err)
	}
	return sets, nil
}

func (r *EnvVarSetRepository) Create(ctx context.Context, name string, description *string) (*model.EnvVarSet, error) {
	const q = `
		INSERT INTO env_var_sets (name, description)
		VALUES ($1, $2)
		RETURNING id, name, description, created_at, updated_at`
	rows, err := r.pool.Query(ctx, q, name, description)
	if err != nil {
		return nil, fmt.Errorf("repository.EnvVarSet.Create: %w", err)
	}
	s, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.EnvVarSet])
	if err != nil {
		return nil, fmt.Errorf("repository.EnvVarSet.Create: scan: %w", err)
	}
	return &s, nil
}

func (r *EnvVarSetRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.EnvVarSet, error) {
	const q = `SELECT id, name, description, created_at, updated_at FROM env_var_sets WHERE id = $1`
	rows, err := r.pool.Query(ctx, q, id)
	if err != nil {
		return nil, fmt.Errorf("repository.EnvVarSet.GetByID: %w", err)
	}
	s, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.EnvVarSet])
	if err != nil {
		return nil, fmt.Errorf("repository.EnvVarSet.GetByID %s: %w", id, err)
	}
	return &s, nil
}

func (r *EnvVarSetRepository) Update(ctx context.Context, id uuid.UUID, name string, description *string) (*model.EnvVarSet, error) {
	const q = `
		UPDATE env_var_sets SET name = $2, description = $3, updated_at = now()
		WHERE id = $1
		RETURNING id, name, description, created_at, updated_at`
	rows, err := r.pool.Query(ctx, q, id, name, description)
	if err != nil {
		return nil, fmt.Errorf("repository.EnvVarSet.Update: %w", err)
	}
	s, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.EnvVarSet])
	if err != nil {
		return nil, fmt.Errorf("repository.EnvVarSet.Update %s: %w", id, err)
	}
	return &s, nil
}

func (r *EnvVarSetRepository) Delete(ctx context.Context, id uuid.UUID) error {
	const q = `DELETE FROM env_var_sets WHERE id = $1`
	ct, err := r.pool.Exec(ctx, q, id)
	if err != nil {
		return fmt.Errorf("repository.EnvVarSet.Delete: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return fmt.Errorf("repository.EnvVarSet.Delete %s: %w", id, pgx.ErrNoRows)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

func (r *EnvVarSetRepository) ListItems(ctx context.Context, setID uuid.UUID) ([]model.EnvVarSetItem, error) {
	const q = `
		SELECT id, set_id, key, value_enc, created_at, updated_at
		FROM   env_var_set_items
		WHERE  set_id = $1
		ORDER  BY key ASC`
	rows, err := r.pool.Query(ctx, q, setID)
	if err != nil {
		return nil, fmt.Errorf("repository.EnvVarSet.ListItems: %w", err)
	}
	defer rows.Close()

	var result []model.EnvVarSetItem
	for rows.Next() {
		var item model.EnvVarSetItem
		if err := rows.Scan(&item.ID, &item.SetID, &item.Key, &item.ValueEnc, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, fmt.Errorf("repository.EnvVarSet.ListItems: scan: %w", err)
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (r *EnvVarSetRepository) UpsertItem(ctx context.Context, setID uuid.UUID, key string, valueEnc []byte) (*model.EnvVarSetItem, error) {
	const q = `
		INSERT INTO env_var_set_items (set_id, key, value_enc)
		VALUES ($1, $2, $3)
		ON CONFLICT (set_id, key) DO UPDATE
		    SET value_enc = EXCLUDED.value_enc,
		        updated_at = now()
		RETURNING id, set_id, key, value_enc, created_at, updated_at`
	var item model.EnvVarSetItem
	err := r.pool.QueryRow(ctx, q, setID, key, valueEnc).Scan(
		&item.ID, &item.SetID, &item.Key, &item.ValueEnc, &item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("repository.EnvVarSet.UpsertItem: %w", err)
	}
	return &item, nil
}

func (r *EnvVarSetRepository) DeleteItem(ctx context.Context, setID uuid.UUID, key string) error {
	const q = `DELETE FROM env_var_set_items WHERE set_id = $1 AND key = $2`
	ct, err := r.pool.Exec(ctx, q, setID, key)
	if err != nil {
		return fmt.Errorf("repository.EnvVarSet.DeleteItem: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return fmt.Errorf("repository.EnvVarSet.DeleteItem %s: %w", key, pgx.ErrNoRows)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Service linking
// ---------------------------------------------------------------------------

func (r *EnvVarSetRepository) LinkService(ctx context.Context, serviceID, setID uuid.UUID, deployMode string) error {
	if deployMode == "" {
		deployMode = "all"
	}
	const q = `
		INSERT INTO service_env_var_sets (service_id, set_id, deploy_mode)
		VALUES ($1, $2, $3)
		ON CONFLICT (service_id, set_id) DO UPDATE SET deploy_mode = EXCLUDED.deploy_mode`
	_, err := r.pool.Exec(ctx, q, serviceID, setID, deployMode)
	if err != nil {
		return fmt.Errorf("repository.EnvVarSet.LinkService: %w", err)
	}
	return nil
}

func (r *EnvVarSetRepository) UpdateLinkDeployMode(ctx context.Context, serviceID, setID uuid.UUID, deployMode string) error {
	const q = `UPDATE service_env_var_sets SET deploy_mode = $3 WHERE service_id = $1 AND set_id = $2`
	ct, err := r.pool.Exec(ctx, q, serviceID, setID, deployMode)
	if err != nil {
		return fmt.Errorf("repository.EnvVarSet.UpdateLinkDeployMode: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return fmt.Errorf("repository.EnvVarSet.UpdateLinkDeployMode service=%s set=%s: %w", serviceID, setID, pgx.ErrNoRows)
	}
	return nil
}

func (r *EnvVarSetRepository) UnlinkService(ctx context.Context, serviceID, setID uuid.UUID) error {
	const q = `DELETE FROM service_env_var_sets WHERE service_id = $1 AND set_id = $2`
	ct, err := r.pool.Exec(ctx, q, serviceID, setID)
	if err != nil {
		return fmt.Errorf("repository.EnvVarSet.UnlinkService: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return fmt.Errorf("repository.EnvVarSet.UnlinkService service=%s set=%s: %w", serviceID, setID, pgx.ErrNoRows)
	}
	return nil
}

// ListLinkedSets returns all env var sets linked to a service, including the link's deploy_mode.
func (r *EnvVarSetRepository) ListLinkedSets(ctx context.Context, serviceID uuid.UUID) ([]model.LinkedEnvVarSet, error) {
	const q = `
		SELECT s.id, s.name, s.description, l.deploy_mode, s.created_at, s.updated_at
		FROM   env_var_sets s
		JOIN   service_env_var_sets l ON l.set_id = s.id
		WHERE  l.service_id = $1
		ORDER  BY s.name ASC`
	rows, err := r.pool.Query(ctx, q, serviceID)
	if err != nil {
		return nil, fmt.Errorf("repository.EnvVarSet.ListLinkedSets: %w", err)
	}
	sets, err := pgx.CollectRows(rows, pgx.RowToStructByName[model.LinkedEnvVarSet])
	if err != nil {
		return nil, fmt.Errorf("repository.EnvVarSet.ListLinkedSets: scan: %w", err)
	}
	return sets, nil
}

// ListLinkedServiceIDs returns service IDs linked to a set.
func (r *EnvVarSetRepository) ListLinkedServiceIDs(ctx context.Context, setID uuid.UUID) ([]uuid.UUID, error) {
	const q = `SELECT service_id FROM service_env_var_sets WHERE set_id = $1`
	rows, err := r.pool.Query(ctx, q, setID)
	if err != nil {
		return nil, fmt.Errorf("repository.EnvVarSet.ListLinkedServiceIDs: %w", err)
	}
	defer rows.Close()
	var result []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("repository.EnvVarSet.ListLinkedServiceIDs: scan: %w", err)
		}
		result = append(result, id)
	}
	return result, rows.Err()
}
