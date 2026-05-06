package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// GlobalRepository provides cross-table list queries for sidebar/global views.
type GlobalRepository struct {
	pool *pgxpool.Pool
}

func NewGlobalRepository(pool *pgxpool.Pool) *GlobalRepository {
	return &GlobalRepository{pool: pool}
}

// GlobalServer is a server with project/env context for global list.
type GlobalServer struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Host        string    `json:"host"`
	EnvID       uuid.UUID `json:"env_id"`
	EnvName     string    `json:"env_name"`
	ProjectID   uuid.UUID `json:"project_id"`
	ProjectName string    `json:"project_name"`
	CreatedAt   time.Time `json:"created_at"`
}

// GlobalService is a service with server/project/env context for global list.
type GlobalService struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	DeployType  string    `json:"deploy_type"`
	ServerID    uuid.UUID `json:"server_id"`
	ServerName  string    `json:"server_name"`
	EnvID       uuid.UUID `json:"env_id"`
	EnvName     string    `json:"env_name"`
	ProjectID   uuid.UUID `json:"project_id"`
	ProjectName string    `json:"project_name"`
	CreatedAt   time.Time `json:"created_at"`
}

// GlobalObject is an object with project/env context for global list.
type GlobalObject struct {
	ID             uuid.UUID `json:"id"`
	Name           string    `json:"name"`
	ObjectTypeName string    `json:"object_type_name"`
	EnvID          uuid.UUID `json:"env_id"`
	EnvName        string    `json:"env_name"`
	ProjectID      uuid.UUID `json:"project_id"`
	ProjectName    string    `json:"project_name"`
	CreatedAt      time.Time `json:"created_at"`
}

func (r *GlobalRepository) ListServers(ctx context.Context) ([]GlobalServer, error) {
	const q = `
		SELECT
		    s.id, s.name, s.host,
		    e.id   AS env_id,    e.name AS env_name,
		    p.id   AS project_id, p.name AS project_name,
		    s.created_at
		FROM   servers      s
		JOIN   environments e ON e.id = s.environment_id
		JOIN   projects     p ON p.id = e.project_id
		ORDER  BY p.name ASC, e.name ASC, s.name ASC`

	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository.Global.ListServers: %w", err)
	}
	defer rows.Close()

	var result []GlobalServer
	for rows.Next() {
		var s GlobalServer
		if err := rows.Scan(&s.ID, &s.Name, &s.Host, &s.EnvID, &s.EnvName, &s.ProjectID, &s.ProjectName, &s.CreatedAt); err != nil {
			return nil, fmt.Errorf("repository.Global.ListServers: scan: %w", err)
		}
		result = append(result, s)
	}
	return result, rows.Err()
}

func (r *GlobalRepository) ListServices(ctx context.Context) ([]GlobalService, error) {
	const q = `
		SELECT
		    svc.id, svc.name, svc.deploy_type,
		    srv.id   AS server_id,  srv.name AS server_name,
		    e.id     AS env_id,     e.name   AS env_name,
		    p.id     AS project_id, p.name   AS project_name,
		    svc.created_at
		FROM   services     svc
		JOIN   servers      srv ON srv.id = svc.server_id
		JOIN   environments e   ON e.id   = srv.environment_id
		JOIN   projects     p   ON p.id   = e.project_id
		ORDER  BY p.name ASC, e.name ASC, srv.name ASC, svc.name ASC`

	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository.Global.ListServices: %w", err)
	}
	defer rows.Close()

	var result []GlobalService
	for rows.Next() {
		var s GlobalService
		if err := rows.Scan(&s.ID, &s.Name, &s.DeployType, &s.ServerID, &s.ServerName, &s.EnvID, &s.EnvName, &s.ProjectID, &s.ProjectName, &s.CreatedAt); err != nil {
			return nil, fmt.Errorf("repository.Global.ListServices: scan: %w", err)
		}
		result = append(result, s)
	}
	return result, rows.Err()
}

func (r *GlobalRepository) ListObjects(ctx context.Context) ([]GlobalObject, error) {
	const q = `
		SELECT
		    o.id, o.name, ot.name AS object_type_name,
		    e.id   AS env_id,    e.name AS env_name,
		    p.id   AS project_id, p.name AS project_name,
		    o.created_at
		FROM   objects      o
		JOIN   object_types ot ON ot.id = o.object_type_id
		JOIN   environments e  ON e.id  = o.environment_id
		JOIN   projects     p  ON p.id  = e.project_id
		ORDER  BY p.name ASC, e.name ASC, o.name ASC`

	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository.Global.ListObjects: %w", err)
	}
	defer rows.Close()

	var result []GlobalObject
	for rows.Next() {
		var o GlobalObject
		if err := rows.Scan(&o.ID, &o.Name, &o.ObjectTypeName, &o.EnvID, &o.EnvName, &o.ProjectID, &o.ProjectName, &o.CreatedAt); err != nil {
			return nil, fmt.Errorf("repository.Global.ListObjects: scan: %w", err)
		}
		result = append(result, o)
	}
	return result, rows.Err()
}
