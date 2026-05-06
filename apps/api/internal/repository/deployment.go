package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/ghulammuzz/zzpeo/api/internal/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DeploymentRepository handles all database operations for Deployments.
type DeploymentRepository struct {
	pool *pgxpool.Pool
}

// NewDeploymentRepository creates a new DeploymentRepository backed by pool.
func NewDeploymentRepository(pool *pgxpool.Pool) *DeploymentRepository {
	return &DeploymentRepository{pool: pool}
}

const deploymentCols = `
	id, service_id, triggered_by, status, log, container_log, started_at, finished_at, created_at`

// Create inserts a new deployment record in "pending" status and returns it.
func (r *DeploymentRepository) Create(ctx context.Context, serviceID uuid.UUID, triggeredBy *string) (*model.Deployment, error) {
	const q = `
		INSERT INTO deployments (service_id, triggered_by, status)
		VALUES ($1, $2, $3)
		RETURNING ` + deploymentCols

	rows, err := r.pool.Query(ctx, q, serviceID, triggeredBy, string(model.StatusPending))
	if err != nil {
		return nil, fmt.Errorf("repository.Deployment.Create: query: %w", err)
	}

	dep, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.Deployment])
	if err != nil {
		return nil, fmt.Errorf("repository.Deployment.Create: scan: %w", err)
	}

	return &dep, nil
}

// UpdateStatus updates the status, log, container_log, and finished_at of a deployment.
// Pass nil for log/containerLog to preserve existing values.
func (r *DeploymentRepository) UpdateStatus(
	ctx context.Context,
	id uuid.UUID,
	status model.DeployStatus,
	log *string,
	containerLog *string,
	finishedAt *time.Time,
) (*model.Deployment, error) {
	const q = `
		UPDATE deployments
		SET    status        = $2,
		       log           = COALESCE($3, log),
		       container_log = COALESCE($4, container_log),
		       finished_at   = COALESCE($5, finished_at),
		       started_at    = CASE
		                         WHEN $2 = 'running' AND started_at IS NULL
		                         THEN now()
		                         ELSE started_at
		                       END
		WHERE  id = $1
		RETURNING ` + deploymentCols

	rows, err := r.pool.Query(ctx, q, id, string(status), log, containerLog, finishedAt)
	if err != nil {
		return nil, fmt.Errorf("repository.Deployment.UpdateStatus: query: %w", err)
	}

	dep, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.Deployment])
	if err != nil {
		return nil, fmt.Errorf("repository.Deployment.UpdateStatus %s: %w", id, err)
	}

	return &dep, nil
}

// ListByService returns all deployments for a service ordered by creation time descending.
func (r *DeploymentRepository) ListByService(ctx context.Context, serviceID uuid.UUID) ([]model.Deployment, error) {
	q := `
		SELECT ` + deploymentCols + `
		FROM   deployments
		WHERE  service_id = $1
		ORDER  BY created_at DESC`

	rows, err := r.pool.Query(ctx, q, serviceID)
	if err != nil {
		return nil, fmt.Errorf("repository.Deployment.ListByService: query: %w", err)
	}

	deps, err := pgx.CollectRows(rows, pgx.RowToStructByName[model.Deployment])
	if err != nil {
		return nil, fmt.Errorf("repository.Deployment.ListByService: scan: %w", err)
	}

	return deps, nil
}

// GetByID fetches a single deployment by its primary key.
func (r *DeploymentRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Deployment, error) {
	q := `SELECT ` + deploymentCols + ` FROM deployments WHERE id = $1`

	rows, err := r.pool.Query(ctx, q, id)
	if err != nil {
		return nil, fmt.Errorf("repository.Deployment.GetByID: query: %w", err)
	}

	dep, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[model.Deployment])
	if err != nil {
		return nil, fmt.Errorf("repository.Deployment.GetByID %s: %w", id, err)
	}

	return &dep, nil
}
