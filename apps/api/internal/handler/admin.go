package handler

import (
	"github.com/ghulammuzz/zzpeo/api/internal/middleware"
	"github.com/ghulammuzz/zzpeo/api/internal/model"
	"github.com/ghulammuzz/zzpeo/api/internal/repository"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type AdminHandler struct {
	userRepo    *repository.UserRepository
	projectRepo repository.ProjectRepo
	appURL      string
}

func NewAdminHandler(userRepo *repository.UserRepository, projectRepo repository.ProjectRepo, appURL string) *AdminHandler {
	return &AdminHandler{userRepo: userRepo, projectRepo: projectRepo, appURL: appURL}
}

// GET /api/v1/admin/users
func (h *AdminHandler) ListUsers(c *fiber.Ctx) error {
	users, err := h.userRepo.List(c.Context())
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	result := make([]fiber.Map, 0, len(users))
	for _, u := range users {
		registered := u.PasswordHash != nil
		regToken := ""
		if !registered {
			regToken, _ = h.userRepo.GetActiveRegToken(c.Context(), u.ID)
		}

		entry := fiber.Map{
			"id":         u.ID,
			"username":   u.Username,
			"role":       u.Role,
			"registered": registered,
			"created_at": u.CreatedAt,
		}
		if regToken != "" {
			entry["reg_url"] = h.appURL + "/register/" + regToken
		}
		result = append(result, entry)
	}

	return c.JSON(result)
}

// POST /api/v1/admin/users
func (h *AdminHandler) CreateUser(c *fiber.Ctx) error {
	var body struct {
		Username string `json:"username"`
		Role     string `json:"role"`
	}
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}
	if body.Username == "" {
		return fiber.NewError(fiber.StatusBadRequest, "username required")
	}

	role := model.RoleUser
	if body.Role == "admin" {
		role = model.RoleAdmin
	}

	callerIDStr, _ := c.Locals(middleware.LocalsUserID).(string)
	callerID, _ := uuid.Parse(callerIDStr)

	user, err := h.userRepo.Create(c.Context(), body.Username, role, &callerID)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "username already exists or invalid")
	}

	rt, err := h.userRepo.CreateRegToken(c.Context(), user.ID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "failed to create registration token")
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"id":       user.ID,
		"username": user.Username,
		"role":     user.Role,
		"reg_url":  h.appURL + "/register/" + rt.Token,
	})
}

// DELETE /api/v1/admin/users/:id
func (h *AdminHandler) DeleteUser(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid user id")
	}

	// Prevent self-delete
	callerIDStr, _ := c.Locals(middleware.LocalsUserID).(string)
	if id.String() == callerIDStr {
		return fiber.NewError(fiber.StatusBadRequest, "cannot delete your own account")
	}

	if err := h.userRepo.Delete(c.Context(), id); err != nil {
		return fiber.NewError(fiber.StatusNotFound, "user not found")
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// POST /api/v1/admin/users/:id/reg-token — regenerate registration link
func (h *AdminHandler) RegenerateToken(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid user id")
	}

	rt, err := h.userRepo.CreateRegToken(c.Context(), id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "failed to create registration token")
	}

	return c.JSON(fiber.Map{
		"reg_url": h.appURL + "/register/" + rt.Token,
	})
}

// GET /api/v1/admin/users/:id/permissions
func (h *AdminHandler) ListPermissions(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid user id")
	}

	perms, err := h.userRepo.ListPermissions(c.Context(), id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	return c.JSON(perms)
}

// PUT /api/v1/admin/users/:id/permissions
func (h *AdminHandler) SetPermissions(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid user id")
	}

	var body struct {
		ProjectIDs []string `json:"project_ids"`
	}
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}

	projectIDs := make([]uuid.UUID, 0, len(body.ProjectIDs))
	for _, s := range body.ProjectIDs {
		pid, err := uuid.Parse(s)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "invalid project id: "+s)
		}
		projectIDs = append(projectIDs, pid)
	}

	if err := h.userRepo.SetPermissions(c.Context(), id, projectIDs); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	return c.SendStatus(fiber.StatusNoContent)
}
