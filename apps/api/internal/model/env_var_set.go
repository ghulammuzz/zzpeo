package model

import (
	"time"

	"github.com/google/uuid"
)

// EnvVarSet is a named, reusable collection of encrypted env vars.
type EnvVarSet struct {
	ID          uuid.UUID `db:"id"          json:"id"`
	Name        string    `db:"name"        json:"name"`
	Description *string   `db:"description" json:"description,omitempty"`
	CreatedAt   time.Time `db:"created_at"  json:"created_at"`
	UpdatedAt   time.Time `db:"updated_at"  json:"updated_at"`
}

// LinkedEnvVarSet is an EnvVarSet as seen from a service link, including the link's deploy_mode.
type LinkedEnvVarSet struct {
	ID          uuid.UUID `db:"id"          json:"id"`
	Name        string    `db:"name"        json:"name"`
	Description *string   `db:"description" json:"description,omitempty"`
	DeployMode  string    `db:"deploy_mode" json:"deploy_mode"`
	CreatedAt   time.Time `db:"created_at"  json:"created_at"`
	UpdatedAt   time.Time `db:"updated_at"  json:"updated_at"`
}

// EnvVarSetItem is a single key/value pair within an EnvVarSet.
// Values are AES-256-GCM encrypted; the set ID is used as the HKDF salt.
type EnvVarSetItem struct {
	ID        uuid.UUID `db:"id"         json:"id"`
	SetID     uuid.UUID `db:"set_id"     json:"set_id"`
	Key       string    `db:"key"        json:"key"`
	Value     string    `db:"-"          json:"value"`
	ValueEnc  []byte    `db:"value_enc"  json:"-"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
	UpdatedAt time.Time `db:"updated_at" json:"updated_at"`
}
