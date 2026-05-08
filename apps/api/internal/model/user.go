package model

import (
	"time"

	"github.com/google/uuid"
)

type UserRole string

const (
	RoleAdmin UserRole = "admin"
	RoleUser  UserRole = "user"
)

type User struct {
	ID           uuid.UUID  `db:"id"         json:"id"`
	Username     string     `db:"username"   json:"username"`
	PasswordHash *string    `db:"password_hash" json:"-"`
	Role         UserRole   `db:"role"       json:"role"`
	CreatedBy    *uuid.UUID `db:"created_by" json:"created_by,omitempty"`
	CreatedAt    time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt    time.Time  `db:"updated_at" json:"updated_at"`
}

type RegistrationToken struct {
	ID        uuid.UUID  `db:"id"`
	UserID    uuid.UUID  `db:"user_id"`
	Token     string     `db:"token"`
	ExpiresAt time.Time  `db:"expires_at"`
	UsedAt    *time.Time `db:"used_at"`
	CreatedAt time.Time  `db:"created_at"`
}

type UserWithStatus struct {
	User
	Registered bool   `json:"registered"` // password_hash is set
	RegToken   string `json:"reg_token,omitempty"`
}

type UserPermission struct {
	ID          uuid.UUID `db:"id"           json:"id"`
	UserID      uuid.UUID `db:"user_id"      json:"user_id"`
	ProjectID   uuid.UUID `db:"project_id"   json:"project_id"`
	ProjectName string    `db:"project_name" json:"project_name"`
	CreatedAt   time.Time `db:"created_at"   json:"created_at"`
}
