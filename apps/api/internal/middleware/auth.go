package middleware

import (
	"strings"

	"github.com/ghulammuzz/zzpeo/api/internal/jwt"
	"github.com/gofiber/fiber/v2"
)

const (
	LocalsClaims  = "claims"
	LocalsUserID  = "userID"
	LocalsRole    = "role"
	LocalsUsername = "username"
)

// Auth validates the Bearer JWT and stores claims in Locals.
// Falls back to ?token= query param for SSE endpoints (EventSource cannot set headers).
func Auth(secret []byte) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var tokenStr string

		header := c.Get("Authorization")
		if strings.HasPrefix(header, "Bearer ") {
			tokenStr = strings.TrimPrefix(header, "Bearer ")
		} else {
			tokenStr = c.Query("token")
		}

		if tokenStr == "" {
			return fiber.NewError(fiber.StatusUnauthorized, "missing or invalid authorization header")
		}
		claims, err := jwt.Verify(tokenStr, secret)
		if err != nil {
			return fiber.NewError(fiber.StatusUnauthorized, "invalid or expired token")
		}

		c.Locals(LocalsClaims, claims)
		c.Locals(LocalsUserID, claims.Sub)
		c.Locals(LocalsRole, claims.Role)
		c.Locals(LocalsUsername, claims.Username)
		return c.Next()
	}
}

// RequireAdmin rejects non-admin users with 403.
func RequireAdmin(c *fiber.Ctx) error {
	role, _ := c.Locals(LocalsRole).(string)
	if role != "admin" {
		return fiber.NewError(fiber.StatusForbidden, "admin access required")
	}
	return c.Next()
}

// IsAdmin returns true if the current request is from an admin.
func IsAdmin(c *fiber.Ctx) bool {
	role, _ := c.Locals(LocalsRole).(string)
	return role == "admin"
}
