package handler

import (
	"github.com/ghulammuzz/zzpeo/api/internal/jwt"
	"github.com/ghulammuzz/zzpeo/api/internal/model"
	"github.com/ghulammuzz/zzpeo/api/internal/repository"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type AuthHandler struct {
	userRepo  *repository.UserRepository
	secretKey []byte
}

func NewAuthHandler(userRepo *repository.UserRepository, secretKey []byte) *AuthHandler {
	return &AuthHandler{userRepo: userRepo, secretKey: secretKey}
}

// POST /api/v1/auth/login
func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}
	if body.Username == "" || body.Password == "" {
		return fiber.NewError(fiber.StatusBadRequest, "username and password required")
	}

	user, err := h.userRepo.GetByUsername(c.Context(), body.Username)
	if err != nil {
		return fiber.NewError(fiber.StatusUnauthorized, "invalid credentials")
	}

	if !h.userRepo.CheckPassword(c.Context(), user, body.Password) {
		return fiber.NewError(fiber.StatusUnauthorized, "invalid credentials")
	}

	if user.PasswordHash == nil {
		return fiber.NewError(fiber.StatusForbidden, "account not yet activated — use registration link")
	}

	claims := jwt.NewClaims(user.ID.String(), user.Username, string(user.Role))
	token, err := jwt.Sign(claims, h.secretKey)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "failed to issue token")
	}

	return c.JSON(fiber.Map{
		"token": token,
		"user": fiber.Map{
			"id":       user.ID,
			"username": user.Username,
			"role":     user.Role,
		},
	})
}

// POST /api/v1/auth/register/:token
func (h *AuthHandler) Register(c *fiber.Ctx) error {
	tokenStr := c.Params("token")

	var body struct {
		Password string `json:"password"`
	}
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}
	if len(body.Password) < 8 {
		return fiber.NewError(fiber.StatusBadRequest, "password must be at least 8 characters")
	}

	rt, err := h.userRepo.GetValidRegToken(c.Context(), tokenStr)
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "registration link is invalid or expired")
	}

	if err := h.userRepo.SetPassword(c.Context(), rt.UserID, body.Password); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "failed to set password")
	}

	if err := h.userRepo.MarkRegTokenUsed(c.Context(), rt.ID); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "failed to finalize registration")
	}

	user, err := h.userRepo.GetByID(c.Context(), rt.UserID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "failed to load user")
	}

	claims := jwt.NewClaims(user.ID.String(), user.Username, string(user.Role))
	token, err := jwt.Sign(claims, h.secretKey)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "failed to issue token")
	}

	return c.JSON(fiber.Map{
		"token": token,
		"user": fiber.Map{
			"id":       user.ID,
			"username": user.Username,
			"role":     user.Role,
		},
	})
}

// GET /api/v1/auth/register-info/:token — returns username for the registration page
func (h *AuthHandler) RegisterInfo(c *fiber.Ctx) error {
	tokenStr := c.Params("token")

	rt, err := h.userRepo.GetValidRegToken(c.Context(), tokenStr)
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "registration link is invalid or expired")
	}

	user, err := h.userRepo.GetByID(c.Context(), rt.UserID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "failed to load user")
	}

	return c.JSON(fiber.Map{
		"username":   user.Username,
		"expires_at": rt.ExpiresAt,
	})
}

// GET /api/v1/auth/me
func (h *AuthHandler) Me(c *fiber.Ctx) error {
	userIDStr, _ := c.Locals("userID").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return fiber.ErrUnauthorized
	}

	user, err := h.userRepo.GetByID(c.Context(), userID)
	if err != nil {
		return fiber.ErrUnauthorized
	}

	perms, _ := h.userRepo.ListPermissions(c.Context(), user.ID)
	projectIDs := make([]uuid.UUID, len(perms))
	for i, p := range perms {
		projectIDs[i] = p.ProjectID
	}

	return c.JSON(fiber.Map{
		"id":         user.ID,
		"username":   user.Username,
		"role":       user.Role,
		"project_ids": projectIDs,
	})
}

// Registered tells if user exists and is pending (no password yet)
func userIsRegistered(u *model.User) bool {
	return u.PasswordHash != nil
}
