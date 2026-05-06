package model

import (
	"time"

	"github.com/google/uuid"
)

// DeployStatus tracks the lifecycle of a single deployment run.
type DeployStatus string

const (
	StatusPending DeployStatus = "pending"
	StatusRunning DeployStatus = "running"
	StatusSuccess DeployStatus = "success"
	StatusFailed  DeployStatus = "failed"
)

// Deployment records one execution of a service's deploy pipeline.
type Deployment struct {
	ID           uuid.UUID    `db:"id"            json:"id"`
	ServiceID    uuid.UUID    `db:"service_id"    json:"service_id"`
	TriggeredBy  *string      `db:"triggered_by"  json:"triggered_by,omitempty"`
	Status       DeployStatus `db:"status"        json:"status"`
	Log          *string      `db:"log"           json:"log,omitempty"`
	ContainerLog *string      `db:"container_log" json:"container_log,omitempty"`
	StartedAt    *time.Time   `db:"started_at"    json:"started_at,omitempty"`
	FinishedAt   *time.Time   `db:"finished_at"   json:"finished_at,omitempty"`
	CreatedAt    time.Time    `db:"created_at"    json:"created_at"`
}
