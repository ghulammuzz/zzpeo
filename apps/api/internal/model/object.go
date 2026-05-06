package model

import (
	"time"

	"github.com/google/uuid"
)

// ObjectType is a catalog entry (e.g. "mysql", "redis") used to tag Objects.
type ObjectType struct {
	ID   uuid.UUID `db:"id"   json:"id"`
	Name string    `db:"name" json:"name"`
}

// Object represents an external dependency (database, cache, queue, storage…)
// that one or more Services may reference.
// ObjectTypeName is populated by JOIN queries and is not stored in the objects table.
type Object struct {
	ID             uuid.UUID `db:"id"              json:"id"`
	EnvironmentID  uuid.UUID `db:"environment_id"  json:"environment_id"`
	ObjectTypeID   uuid.UUID `db:"object_type_id"  json:"object_type_id"`
	ObjectTypeName string    `db:"-"               json:"object_type_name"`
	Name           string    `db:"name"            json:"name"`
	Host           *string   `db:"host"            json:"host,omitempty"`
	Port           *int      `db:"port"            json:"port,omitempty"`
	DatabaseName   *string   `db:"database_name"   json:"database_name,omitempty"`
	Notes          *string   `db:"notes"           json:"notes,omitempty"`
	CreatedAt      time.Time `db:"created_at"      json:"created_at"`
	UpdatedAt      time.Time `db:"updated_at"      json:"updated_at"`
}
