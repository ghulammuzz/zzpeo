package model

import (
	"time"

	"github.com/google/uuid"
)

// Server represents an SSH-accessible machine attached to an Environment.
// AuthType is one of: "key" | "password".
// SSHKeyEnc and PasswordEnc hold AES-GCM encrypted blobs and are never
// exposed via JSON.
type Server struct {
	ID               uuid.UUID `db:"id"             json:"id"`
	EnvironmentID    uuid.UUID `db:"environment_id" json:"environment_id"`
	Name             string    `db:"name"           json:"name"`
	Host             string    `db:"host"           json:"host"`
	Port             int       `db:"port"           json:"port"`
	User             string    `db:"user"           json:"user"`
	AuthType         string    `db:"auth_type"      json:"auth_type"`
	SSHKeyEnc        []byte    `db:"ssh_key_enc"        json:"-"`
	PasswordEnc      []byte    `db:"password_enc"       json:"-"`
	KeyPassphraseEnc []byte    `db:"key_passphrase_enc" json:"-"`
	Fingerprint      *string   `db:"fingerprint"    json:"fingerprint,omitempty"`
	CreatedAt        time.Time `db:"created_at"     json:"created_at"`
	UpdatedAt        time.Time `db:"updated_at"     json:"updated_at"`
}
