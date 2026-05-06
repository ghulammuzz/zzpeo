package model

import (
	"time"

	"github.com/google/uuid"
)

// Environment belongs to a Project and groups servers + env vars by stage.
// Type is one of: "prod", "stg", "custom".
type Environment struct {
	ID        uuid.UUID `db:"id"         json:"id"`
	ProjectID uuid.UUID `db:"project_id" json:"project_id"`
	Name      string    `db:"name"       json:"name"`
	Slug      string    `db:"slug"       json:"slug"`
	Type      string    `db:"type"       json:"type"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
	UpdatedAt time.Time `db:"updated_at" json:"updated_at"`
}

// EnvVar stores an encrypted key/value pair scoped to an Environment.
// ValueEnc is excluded from JSON responses; decryption happens in the service layer.
type EnvVar struct {
	ID            uuid.UUID `db:"id"             json:"id"`
	EnvironmentID uuid.UUID `db:"environment_id" json:"environment_id"`
	Key           string    `db:"key"            json:"key"`
	ValueEnc      []byte    `db:"value_enc"      json:"-"`
	CreatedAt     time.Time `db:"created_at"     json:"created_at"`
	UpdatedAt     time.Time `db:"updated_at"     json:"updated_at"`
}
