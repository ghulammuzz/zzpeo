package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// DeployType describes how a service is deployed onto its server.
type DeployType string

const (
	DeployPHP    DeployType = "php"
	DeployPM2    DeployType = "pm2"
	DeployShell  DeployType = "shell"
	DeployDocker DeployType = "docker"
)

// ServiceEnvVar is an env var scoped to a Service.
// Values are AES-256-GCM encrypted; deploy_mode controls injection at deploy time.
// Allowed deploy_mode values: all | build_arg | runtime | both
type ServiceEnvVar struct {
	ID         uuid.UUID `db:"id"          json:"id"`
	ServiceID  uuid.UUID `db:"service_id"  json:"service_id"`
	Key        string    `db:"key"         json:"key"`
	Value      string    `db:"-"           json:"value"`
	ValueEnc   []byte    `db:"value_enc"   json:"-"`
	DeployMode string    `db:"deploy_mode" json:"deploy_mode"`
	CreatedAt  time.Time `db:"created_at"  json:"created_at"`
	UpdatedAt  time.Time `db:"updated_at"  json:"updated_at"`
}

// Service is a deployable unit that lives on a Server.
// DeployConfig is an arbitrary JSON object whose schema depends on DeployType.
type Service struct {
	ID           uuid.UUID       `db:"id"            json:"id"`
	ServerID     uuid.UUID       `db:"server_id"     json:"server_id"`
	Name         string          `db:"name"          json:"name"`
	Workdir      string          `db:"workdir"       json:"workdir"`
	RunAsUser    *string         `db:"run_as_user"   json:"run_as_user,omitempty"`
	LocalPort    *int            `db:"local_port"    json:"local_port,omitempty"`
	LogConfig    json.RawMessage `db:"log_config"    json:"log_config,omitempty"`
	DeployType   DeployType      `db:"deploy_type"   json:"deploy_type"`
	DeployConfig json.RawMessage `db:"deploy_config" json:"deploy_config"`
	CreatedAt    time.Time       `db:"created_at"    json:"created_at"`
	UpdatedAt    time.Time       `db:"updated_at"    json:"updated_at"`
}
