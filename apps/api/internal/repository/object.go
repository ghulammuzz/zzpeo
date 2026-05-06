package repository

import (
	"context"
	"fmt"

	"github.com/ghulammuzz/zzpeo/api/internal/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ObjectRepository handles all database operations for Objects and ObjectTypes.
type ObjectRepository struct {
	pool *pgxpool.Pool
}

// NewObjectRepository creates a new ObjectRepository backed by pool.
func NewObjectRepository(pool *pgxpool.Pool) *ObjectRepository {
	return &ObjectRepository{pool: pool}
}

// CreateObjectInput carries the fields required to create a new object.
type CreateObjectInput struct {
	EnvironmentID uuid.UUID
	ObjectTypeID  uuid.UUID
	Name          string
	Host          *string
	Port          *int
	DatabaseName  *string
	Notes         *string
}

// UpdateObjectInput carries replaceable fields for an existing object.
type UpdateObjectInput struct {
	ObjectTypeID uuid.UUID
	Name         string
	Host         *string
	Port         *int
	DatabaseName *string
	Notes        *string
}

// ---------------------------------------------------------------------------
// ObjectType queries
// ---------------------------------------------------------------------------

// ListObjectTypes returns all object type catalog entries ordered by name.
func (r *ObjectRepository) ListObjectTypes(ctx context.Context) ([]model.ObjectType, error) {
	const q = `SELECT id, name FROM object_types ORDER BY name ASC`

	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository.Object.ListObjectTypes: query: %w", err)
	}

	types, err := pgx.CollectRows(rows, pgx.RowToStructByName[model.ObjectType])
	if err != nil {
		return nil, fmt.Errorf("repository.Object.ListObjectTypes: scan: %w", err)
	}

	return types, nil
}

// ---------------------------------------------------------------------------
// Object CRUD
// ---------------------------------------------------------------------------

// Create inserts a new object and returns the persisted record with
// object_type_name populated from a JOIN.
func (r *ObjectRepository) Create(ctx context.Context, in CreateObjectInput) (*model.Object, error) {
	const q = `
		INSERT INTO objects (environment_id, object_type_id, name, host, port, database_name, notes)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, environment_id, object_type_id, name, host, port, database_name, notes,
		          created_at, updated_at`

	rows, err := r.pool.Query(ctx, q,
		in.EnvironmentID, in.ObjectTypeID, in.Name,
		in.Host, in.Port, in.DatabaseName, in.Notes,
	)
	if err != nil {
		return nil, fmt.Errorf("repository.Object.Create: query: %w", err)
	}
	defer rows.Close()

	// Scan without type name first, then fetch it separately.
	var o model.Object
	for rows.Next() {
		if err := rows.Scan(
			&o.ID, &o.EnvironmentID, &o.ObjectTypeID,
			&o.Name, &o.Host, &o.Port, &o.DatabaseName, &o.Notes,
			&o.CreatedAt, &o.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("repository.Object.Create: scan: %w", err)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository.Object.Create: rows: %w", err)
	}

	// Hydrate ObjectTypeName.
	typeName, err := r.fetchTypeName(ctx, o.ObjectTypeID)
	if err != nil {
		return nil, err
	}
	o.ObjectTypeName = typeName

	return &o, nil
}

// List returns all objects in an environment with the object_type_name
// populated via a JOIN on object_types.
func (r *ObjectRepository) List(ctx context.Context, envID uuid.UUID) ([]model.Object, error) {
	const q = `
		SELECT
		    o.id,
		    o.environment_id,
		    o.object_type_id,
		    ot.name AS object_type_name,
		    o.name,
		    o.host,
		    o.port,
		    o.database_name,
		    o.notes,
		    o.created_at,
		    o.updated_at
		FROM   objects      o
		JOIN   object_types ot ON ot.id = o.object_type_id
		WHERE  o.environment_id = $1
		ORDER  BY o.name ASC`

	rows, err := r.pool.Query(ctx, q, envID)
	if err != nil {
		return nil, fmt.Errorf("repository.Object.List: query: %w", err)
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
			return nil, fmt.Errorf("repository.Object.List: scan: %w", err)
		}
		result = append(result, o)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository.Object.List: rows: %w", err)
	}

	return result, nil
}

// GetByID fetches a single object by its primary key, with object_type_name populated.
func (r *ObjectRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Object, error) {
	const q = `
		SELECT
		    o.id,
		    o.environment_id,
		    o.object_type_id,
		    ot.name AS object_type_name,
		    o.name,
		    o.host,
		    o.port,
		    o.database_name,
		    o.notes,
		    o.created_at,
		    o.updated_at
		FROM   objects      o
		JOIN   object_types ot ON ot.id = o.object_type_id
		WHERE  o.id = $1`

	rows, err := r.pool.Query(ctx, q, id)
	if err != nil {
		return nil, fmt.Errorf("repository.Object.GetByID: query: %w", err)
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("repository.Object.GetByID %s: %w", id, err)
		}
		return nil, fmt.Errorf("repository.Object.GetByID %s: %w", id, pgx.ErrNoRows)
	}

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
		return nil, fmt.Errorf("repository.Object.GetByID %s: scan: %w", id, err)
	}

	return &o, nil
}

// Update replaces the mutable fields of an object and bumps updated_at.
// Returns the updated record with object_type_name populated.
func (r *ObjectRepository) Update(ctx context.Context, id uuid.UUID, in UpdateObjectInput) (*model.Object, error) {
	const q = `
		UPDATE objects
		SET    object_type_id = $2,
		       name           = $3,
		       host           = $4,
		       port           = $5,
		       database_name  = $6,
		       notes          = $7,
		       updated_at     = now()
		WHERE  id = $1
		RETURNING id, environment_id, object_type_id, name, host, port, database_name, notes,
		          created_at, updated_at`

	rows, err := r.pool.Query(ctx, q,
		id, in.ObjectTypeID, in.Name, in.Host, in.Port, in.DatabaseName, in.Notes,
	)
	if err != nil {
		return nil, fmt.Errorf("repository.Object.Update: query: %w", err)
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("repository.Object.Update %s: %w", id, err)
		}
		return nil, fmt.Errorf("repository.Object.Update %s: %w", id, pgx.ErrNoRows)
	}

	var o model.Object
	if err := rows.Scan(
		&o.ID, &o.EnvironmentID, &o.ObjectTypeID,
		&o.Name, &o.Host, &o.Port, &o.DatabaseName, &o.Notes,
		&o.CreatedAt, &o.UpdatedAt,
	); err != nil {
		return nil, fmt.Errorf("repository.Object.Update %s: scan: %w", id, err)
	}

	typeName, err := r.fetchTypeName(ctx, o.ObjectTypeID)
	if err != nil {
		return nil, err
	}
	o.ObjectTypeName = typeName

	return &o, nil
}

// Delete removes an object by ID. Also removes service_objects rows via CASCADE.
func (r *ObjectRepository) Delete(ctx context.Context, id uuid.UUID) error {
	const q = `DELETE FROM objects WHERE id = $1`

	ct, err := r.pool.Exec(ctx, q, id)
	if err != nil {
		return fmt.Errorf("repository.Object.Delete: %w", err)
	}

	if ct.RowsAffected() == 0 {
		return fmt.Errorf("repository.Object.Delete %s: %w", id, pgx.ErrNoRows)
	}

	return nil
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// fetchTypeName retrieves the name for an object_type row by its ID.
func (r *ObjectRepository) fetchTypeName(ctx context.Context, typeID uuid.UUID) (string, error) {
	const q = `SELECT name FROM object_types WHERE id = $1`

	var name string
	if err := r.pool.QueryRow(ctx, q, typeID).Scan(&name); err != nil {
		return "", fmt.Errorf("repository.Object.fetchTypeName %s: %w", typeID, err)
	}

	return name, nil
}
