package repository

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/ghulammuzz/zzpeo/api/internal/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// nullableJSON returns nil for empty/null JSON so pgx stores a SQL NULL instead of '{}'.
func nullableJSON(raw json.RawMessage) interface{} {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	return []byte(raw)
}

// ServiceRepository handles all database operations for Services and their
// linked Objects (via the service_objects join table).
type ServiceRepository struct {
	pool *pgxpool.Pool
}

// NewServiceRepository creates a new ServiceRepository backed by pool.
func NewServiceRepository(pool *pgxpool.Pool) *ServiceRepository {
	return &ServiceRepository{pool: pool}
}

// CreateServiceInput carries the fields required to create a new service.
type CreateServiceInput struct {
	ServerID     uuid.UUID
	Name         string
	Workdir      string
	RunAsUser    *string
	LocalPort    *int
	LogConfig    json.RawMessage
	DeployType   model.DeployType
	DeployConfig json.RawMessage // defaults to '{}' when nil
}

// UpdateServiceInput carries replaceable fields for an existing service.
type UpdateServiceInput struct {
	Name         string
	Workdir      string
	RunAsUser    *string
	LocalPort    *int
	LogConfig    json.RawMessage
	DeployType   model.DeployType
	DeployConfig json.RawMessage
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

// Create inserts a new service and returns the persisted record.
func (r *ServiceRepository) Create(ctx context.Context, in CreateServiceInput) (*model.Service, error) {
	if len(in.DeployConfig) == 0 {
		in.DeployConfig = json.RawMessage(`{}`)
	}

	const q = `
		INSERT INTO services (server_id, name, workdir, run_as_user, local_port, log_config, deploy_type, deploy_config)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, server_id, name, workdir, run_as_user, local_port, log_config, deploy_type, deploy_config, created_at, updated_at`

	rows, err := r.pool.Query(ctx, q,
		in.ServerID, in.Name, in.Workdir, in.RunAsUser, in.LocalPort, nullableJSON(in.LogConfig), string(in.DeployType), []byte(in.DeployConfig),
	)
	if err != nil {
		return nil, fmt.Errorf("repository.Service.Create: query: %w", err)
	}

	svc, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.Service])
	if err != nil {
		return nil, fmt.Errorf("repository.Service.Create: scan: %w", err)
	}

	return &svc, nil
}

// List returns all services belonging to serverID.
func (r *ServiceRepository) List(ctx context.Context, serverID uuid.UUID) ([]model.Service, error) {
	const q = `
		SELECT id, server_id, name, workdir, run_as_user, local_port, log_config, deploy_type, deploy_config, created_at, updated_at
		FROM   services
		WHERE  server_id = $1
		ORDER  BY name ASC`

	rows, err := r.pool.Query(ctx, q, serverID)
	if err != nil {
		return nil, fmt.Errorf("repository.Service.List: query: %w", err)
	}

	services, err := pgx.CollectRows(rows, pgx.RowToStructByName[model.Service])
	if err != nil {
		return nil, fmt.Errorf("repository.Service.List: scan: %w", err)
	}

	return services, nil
}

// GetByID fetches a single service by its primary key.
func (r *ServiceRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Service, error) {
	const q = `
		SELECT id, server_id, name, workdir, run_as_user, local_port, log_config, deploy_type, deploy_config, created_at, updated_at
		FROM   services
		WHERE  id = $1`

	rows, err := r.pool.Query(ctx, q, id)
	if err != nil {
		return nil, fmt.Errorf("repository.Service.GetByID: query: %w", err)
	}

	svc, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.Service])
	if err != nil {
		return nil, fmt.Errorf("repository.Service.GetByID %s: %w", id, err)
	}

	return &svc, nil
}

// Update replaces the mutable fields of a service and bumps updated_at.
func (r *ServiceRepository) Update(ctx context.Context, id uuid.UUID, in UpdateServiceInput) (*model.Service, error) {
	if len(in.DeployConfig) == 0 {
		in.DeployConfig = json.RawMessage(`{}`)
	}

	const q = `
		UPDATE services
		SET    name          = $2,
		       workdir       = $3,
		       run_as_user   = $4,
		       local_port    = $5,
		       log_config    = $6,
		       deploy_type   = $7,
		       deploy_config = $8,
		       updated_at    = now()
		WHERE  id = $1
		RETURNING id, server_id, name, workdir, run_as_user, local_port, log_config, deploy_type, deploy_config, created_at, updated_at`

	rows, err := r.pool.Query(ctx, q,
		id, in.Name, in.Workdir, in.RunAsUser, in.LocalPort, nullableJSON(in.LogConfig), string(in.DeployType), []byte(in.DeployConfig),
	)
	if err != nil {
		return nil, fmt.Errorf("repository.Service.Update: query: %w", err)
	}

	svc, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.Service])
	if err != nil {
		return nil, fmt.Errorf("repository.Service.Update %s: %w", id, err)
	}

	return &svc, nil
}

// Delete removes a service by ID. Cascades to deployments and service_objects.
func (r *ServiceRepository) Delete(ctx context.Context, id uuid.UUID) error {
	const q = `DELETE FROM services WHERE id = $1`

	ct, err := r.pool.Exec(ctx, q, id)
	if err != nil {
		return fmt.Errorf("repository.Service.Delete: %w", err)
	}

	if ct.RowsAffected() == 0 {
		return fmt.Errorf("repository.Service.Delete %s: %w", id, pgx.ErrNoRows)
	}

	return nil
}

// ---------------------------------------------------------------------------
// Object linking
// ---------------------------------------------------------------------------

// LinkObject creates an association between a service and an object.
// Silently succeeds if the link already exists (ON CONFLICT DO NOTHING).
func (r *ServiceRepository) LinkObject(ctx context.Context, serviceID, objectID uuid.UUID) error {
	const q = `
		INSERT INTO service_objects (service_id, object_id)
		VALUES ($1, $2)
		ON CONFLICT (service_id, object_id) DO NOTHING`

	_, err := r.pool.Exec(ctx, q, serviceID, objectID)
	if err != nil {
		return fmt.Errorf("repository.Service.LinkObject service=%s object=%s: %w", serviceID, objectID, err)
	}

	return nil
}

// UnlinkObject removes the association between a service and an object.
func (r *ServiceRepository) UnlinkObject(ctx context.Context, serviceID, objectID uuid.UUID) error {
	const q = `DELETE FROM service_objects WHERE service_id = $1 AND object_id = $2`

	ct, err := r.pool.Exec(ctx, q, serviceID, objectID)
	if err != nil {
		return fmt.Errorf("repository.Service.UnlinkObject: %w", err)
	}

	if ct.RowsAffected() == 0 {
		return fmt.Errorf("repository.Service.UnlinkObject service=%s object=%s: %w",
			serviceID, objectID, pgx.ErrNoRows)
	}

	return nil
}

// ---------------------------------------------------------------------------
// Service env vars
// ---------------------------------------------------------------------------

// ListServiceEnvVars returns all env vars for a service (value_enc included for decryption).
func (r *ServiceRepository) ListServiceEnvVars(ctx context.Context, serviceID uuid.UUID) ([]model.ServiceEnvVar, error) {
	const q = `
		SELECT id, service_id, key, value_enc, deploy_mode, created_at, updated_at
		FROM   service_env_vars
		WHERE  service_id = $1
		ORDER  BY key ASC`

	rows, err := r.pool.Query(ctx, q, serviceID)
	if err != nil {
		return nil, fmt.Errorf("repository.Service.ListServiceEnvVars: %w", err)
	}
	defer rows.Close()

	var result []model.ServiceEnvVar
	for rows.Next() {
		var v model.ServiceEnvVar
		if err := rows.Scan(&v.ID, &v.ServiceID, &v.Key, &v.ValueEnc, &v.DeployMode, &v.CreatedAt, &v.UpdatedAt); err != nil {
			return nil, fmt.Errorf("repository.Service.ListServiceEnvVars: scan: %w", err)
		}
		result = append(result, v)
	}
	return result, rows.Err()
}

// UpsertServiceEnvVar inserts or updates a single env var for a service.
func (r *ServiceRepository) UpsertServiceEnvVar(ctx context.Context, serviceID uuid.UUID, key string, valueEnc []byte, deployMode string) (*model.ServiceEnvVar, error) {
	const q = `
		INSERT INTO service_env_vars (service_id, key, value_enc, deploy_mode)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (service_id, key) DO UPDATE
		    SET value_enc  = EXCLUDED.value_enc,
		        deploy_mode = EXCLUDED.deploy_mode,
		        updated_at  = now()
		RETURNING id, service_id, key, value_enc, deploy_mode, created_at, updated_at`

	var v model.ServiceEnvVar
	err := r.pool.QueryRow(ctx, q, serviceID, key, valueEnc, deployMode).Scan(
		&v.ID, &v.ServiceID, &v.Key, &v.ValueEnc, &v.DeployMode, &v.CreatedAt, &v.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("repository.Service.UpsertServiceEnvVar: %w", err)
	}
	return &v, nil
}

// UpdateServiceEnvVarMode updates only the deploy_mode for an existing env var.
func (r *ServiceRepository) UpdateServiceEnvVarMode(ctx context.Context, serviceID uuid.UUID, key string, deployMode string) error {
	const q = `UPDATE service_env_vars SET deploy_mode = $3, updated_at = now() WHERE service_id = $1 AND key = $2`
	_, err := r.pool.Exec(ctx, q, serviceID, key, deployMode)
	if err != nil {
		return fmt.Errorf("repository.Service.UpdateServiceEnvVarMode: %w", err)
	}
	return nil
}

// DeleteServiceEnvVar removes an env var by service ID + key.
func (r *ServiceRepository) DeleteServiceEnvVar(ctx context.Context, serviceID uuid.UUID, key string) error {
	const q = `DELETE FROM service_env_vars WHERE service_id = $1 AND key = $2`
	ct, err := r.pool.Exec(ctx, q, serviceID, key)
	if err != nil {
		return fmt.Errorf("repository.Service.DeleteServiceEnvVar: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return fmt.Errorf("repository.Service.DeleteServiceEnvVar %s: %w", key, pgx.ErrNoRows)
	}
	return nil
}

// objectWithTypeName is a helper scan target for the JOIN query below.
type objectWithTypeName struct {
	model.Object
	TypeName string `db:"object_type_name"`
}

// ListLinkedObjects returns all objects linked to a service, with the object
// type name populated via a JOIN on object_types.
func (r *ServiceRepository) ListLinkedObjects(ctx context.Context, serviceID uuid.UUID) ([]model.Object, error) {
	const q = `
		SELECT
		    o.id,
		    o.environment_id,
		    o.object_type_id,
		    ot.name          AS object_type_name,
		    o.name,
		    o.host,
		    o.port,
		    o.database_name,
		    o.notes,
		    o.created_at,
		    o.updated_at
		FROM   service_objects so
		JOIN   objects          o  ON o.id  = so.object_id
		JOIN   object_types     ot ON ot.id = o.object_type_id
		WHERE  so.service_id = $1
		ORDER  BY o.name ASC`

	rows, err := r.pool.Query(ctx, q, serviceID)
	if err != nil {
		return nil, fmt.Errorf("repository.Service.ListLinkedObjects: query: %w", err)
	}
	defer rows.Close()

	var result []model.Object

	for rows.Next() {
		var o model.Object
		if err := rows.Scan(
			&o.ID,
			&o.EnvironmentID,
			&o.ObjectTypeID,
			&o.ObjectTypeName,
			&o.Name,
			&o.Host,
			&o.Port,
			&o.DatabaseName,
			&o.Notes,
			&o.CreatedAt,
			&o.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("repository.Service.ListLinkedObjects: scan: %w", err)
		}
		result = append(result, o)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository.Service.ListLinkedObjects: rows: %w", err)
	}

	return result, nil
}
