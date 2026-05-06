package repository

import (
	"context"
	"fmt"

	"github.com/ghulammuzz/zzpeo/api/internal/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ServerRepository handles all database operations for Servers.
type ServerRepository struct {
	pool *pgxpool.Pool
}

// NewServerRepository creates a new ServerRepository backed by pool.
func NewServerRepository(pool *pgxpool.Pool) *ServerRepository {
	return &ServerRepository{pool: pool}
}

// CreateServerInput carries the fields required to create a new server record.
type CreateServerInput struct {
	EnvironmentID    uuid.UUID
	Name             string
	Host             string
	Port             int
	User             string
	AuthType         string // "key" | "password"
	SSHKeyEnc        []byte
	PasswordEnc      []byte
	KeyPassphraseEnc []byte
	Fingerprint      *string
}

// UpdateServerInput carries replaceable fields for an existing server.
// Credential blobs must always be provided (re-encrypted by the caller if
// unchanged to keep the interface simple).
type UpdateServerInput struct {
	Name             string
	Host             string
	Port             int
	User             string
	AuthType         string
	SSHKeyEnc        []byte
	PasswordEnc      []byte
	KeyPassphraseEnc []byte
	Fingerprint      *string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// publicColumns are the columns returned for list/get operations that must NOT
// expose raw credential blobs.  Credentials are loaded only via
// GetByIDWithCredentials.
const serverPublicCols = `
	id, environment_id, name, host, port, "user" AS "user",
	auth_type, fingerprint, created_at, updated_at`

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

// Create inserts a new server and returns the public (non-credential) record.
func (r *ServerRepository) Create(ctx context.Context, in CreateServerInput) (*model.Server, error) {
	const q = `
		INSERT INTO servers
		    (environment_id, name, host, port, "user", auth_type, ssh_key_enc, password_enc, key_passphrase_enc, fingerprint)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING ` + serverPublicCols

	rows, err := r.pool.Query(ctx, q,
		in.EnvironmentID, in.Name, in.Host, in.Port, in.User,
		in.AuthType, in.SSHKeyEnc, in.PasswordEnc, in.KeyPassphraseEnc, in.Fingerprint,
	)
	if err != nil {
		return nil, fmt.Errorf("repository.Server.Create: query: %w", err)
	}

	srv, err := pgx.CollectOneRow(rows, pgx.RowToStructByNameLax[model.Server])
	if err != nil {
		return nil, fmt.Errorf("repository.Server.Create: scan: %w", err)
	}

	return &srv, nil
}

// List returns all servers in an environment (without credential blobs).
func (r *ServerRepository) List(ctx context.Context, envID uuid.UUID) ([]model.Server, error) {
	q := `
		SELECT ` + serverPublicCols + `
		FROM   servers
		WHERE  environment_id = $1
		ORDER  BY name ASC`

	rows, err := r.pool.Query(ctx, q, envID)
	if err != nil {
		return nil, fmt.Errorf("repository.Server.List: query: %w", err)
	}

	servers, err := pgx.CollectRows(rows, pgx.RowToStructByNameLax[model.Server])
	if err != nil {
		return nil, fmt.Errorf("repository.Server.List: scan: %w", err)
	}

	return servers, nil
}

// GetByID fetches a server by ID without credential blobs.
func (r *ServerRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Server, error) {
	q := `SELECT ` + serverPublicCols + ` FROM servers WHERE id = $1`

	rows, err := r.pool.Query(ctx, q, id)
	if err != nil {
		return nil, fmt.Errorf("repository.Server.GetByID: query: %w", err)
	}

	srv, err := pgx.CollectOneRow(rows, pgx.RowToStructByNameLax[model.Server])
	if err != nil {
		return nil, fmt.Errorf("repository.Server.GetByID %s: %w", id, err)
	}

	return &srv, nil
}

// GetByIDWithCredentials fetches a server including the encrypted ssh_key_enc
// and password_enc blobs — use only in the SSH dialer, never in API responses.
func (r *ServerRepository) GetByIDWithCredentials(ctx context.Context, id uuid.UUID) (*model.Server, error) {
	const q = `
		SELECT
		    id, environment_id, name, host, port, "user" AS "user",
		    auth_type, ssh_key_enc, password_enc, key_passphrase_enc, fingerprint,
		    created_at, updated_at
		FROM servers
		WHERE id = $1`

	rows, err := r.pool.Query(ctx, q, id)
	if err != nil {
		return nil, fmt.Errorf("repository.Server.GetByIDWithCredentials: query: %w", err)
	}

	srv, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.Server])
	if err != nil {
		return nil, fmt.Errorf("repository.Server.GetByIDWithCredentials %s: %w", id, err)
	}

	return &srv, nil
}

// Update replaces the mutable fields of a server and bumps updated_at.
// Returns the updated record (without credential blobs).
func (r *ServerRepository) Update(ctx context.Context, id uuid.UUID, in UpdateServerInput) (*model.Server, error) {
	q := `
		UPDATE servers
		SET    name              = $2,
		       host              = $3,
		       port              = $4,
		       "user"            = $5,
		       auth_type         = $6,
		       ssh_key_enc       = $7,
		       password_enc      = $8,
		       key_passphrase_enc = $9,
		       fingerprint       = $10,
		       updated_at        = now()
		WHERE  id = $1
		RETURNING ` + serverPublicCols

	rows, err := r.pool.Query(ctx, q,
		id, in.Name, in.Host, in.Port, in.User,
		in.AuthType, in.SSHKeyEnc, in.PasswordEnc, in.KeyPassphraseEnc, in.Fingerprint,
	)
	if err != nil {
		return nil, fmt.Errorf("repository.Server.Update: query: %w", err)
	}

	srv, err := pgx.CollectOneRow(rows, pgx.RowToStructByNameLax[model.Server])
	if err != nil {
		return nil, fmt.Errorf("repository.Server.Update %s: %w", id, err)
	}

	return &srv, nil
}

// Delete removes a server by ID. Cascades to services.
func (r *ServerRepository) Delete(ctx context.Context, id uuid.UUID) error {
	const q = `DELETE FROM servers WHERE id = $1`

	ct, err := r.pool.Exec(ctx, q, id)
	if err != nil {
		return fmt.Errorf("repository.Server.Delete: %w", err)
	}

	if ct.RowsAffected() == 0 {
		return fmt.Errorf("repository.Server.Delete %s: %w", id, pgx.ErrNoRows)
	}

	return nil
}

// ExistsByHost returns true when a server with the given host already exists
// in the environment (excluding a specific server ID when updating).
func (r *ServerRepository) ExistsByHost(ctx context.Context, envID uuid.UUID, host string, excludeID *uuid.UUID) (bool, error) {
	var count int
	if excludeID != nil {
		const q = `SELECT COUNT(*) FROM servers WHERE environment_id = $1 AND host = $2 AND id != $3`
		if err := r.pool.QueryRow(ctx, q, envID, host, *excludeID).Scan(&count); err != nil {
			return false, fmt.Errorf("repository.Server.ExistsByHost: %w", err)
		}
	} else {
		const q = `SELECT COUNT(*) FROM servers WHERE environment_id = $1 AND host = $2`
		if err := r.pool.QueryRow(ctx, q, envID, host).Scan(&count); err != nil {
			return false, fmt.Errorf("repository.Server.ExistsByHost: %w", err)
		}
	}
	return count > 0, nil
}

// UpdateFingerprint stores the SSH host key fingerprint collected during the
// first successful connection to a server.
func (r *ServerRepository) UpdateFingerprint(ctx context.Context, id uuid.UUID, fingerprint string) error {
	const q = `
		UPDATE servers
		SET    fingerprint = $2,
		       updated_at  = now()
		WHERE  id = $1`

	ct, err := r.pool.Exec(ctx, q, id, fingerprint)
	if err != nil {
		return fmt.Errorf("repository.Server.UpdateFingerprint: %w", err)
	}

	if ct.RowsAffected() == 0 {
		return fmt.Errorf("repository.Server.UpdateFingerprint %s: %w", id, pgx.ErrNoRows)
	}

	return nil
}
