package handler

import (
	"errors"
	"time"

	"github.com/ghulammuzz/zzpeo/api/internal/model"
	"github.com/ghulammuzz/zzpeo/api/internal/repository"
	appssh "github.com/ghulammuzz/zzpeo/api/internal/ssh"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// EnvironmentHandler handles environment and env-var routes.
type EnvironmentHandler struct {
	repo *repository.EnvironmentRepository
	ks   *appssh.KeyStore
}

// NewEnvironmentHandler wires up an EnvironmentHandler.
func NewEnvironmentHandler(db *pgxpool.Pool, ks *appssh.KeyStore) *EnvironmentHandler {
	return &EnvironmentHandler{
		repo: repository.NewEnvironmentRepository(db),
		ks:   ks,
	}
}

// ---------------------------------------------------------------------------
// Environment CRUD
// ---------------------------------------------------------------------------

// List handles GET /projects/:projectId/environments
func (h *EnvironmentHandler) List(c *fiber.Ctx) error {
	projectID, err := uuid.Parse(c.Params("projectId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid project id"})
	}

	envs, err := h.repo.List(c.Context(), projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if envs == nil {
		envs = []model.Environment{}
	}
	return c.JSON(envs)
}

type createEnvironmentRequest struct {
	Name string `json:"name"`
	Slug string `json:"slug"`
	Type string `json:"type"`
}

// Create handles POST /projects/:projectId/environments
func (h *EnvironmentHandler) Create(c *fiber.Ctx) error {
	projectID, err := uuid.Parse(c.Params("projectId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid project id"})
	}

	var req createEnvironmentRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.Name == "" || req.Slug == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name and slug are required"})
	}
	if req.Type == "" {
		req.Type = "custom"
	}

	env, err := h.repo.Create(c.Context(), repository.CreateEnvironmentInput{
		ProjectID: projectID,
		Name:      req.Name,
		Slug:      req.Slug,
		Type:      req.Type,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "an environment with this slug already exists in the project"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(env)
}

// GetByID handles GET /projects/:projectId/environments/:envId
func (h *EnvironmentHandler) GetByID(c *fiber.Ctx) error {
	envID, err := uuid.Parse(c.Params("envId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid environment id"})
	}

	env, err := h.repo.GetByID(c.Context(), envID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "environment not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(env)
}

type updateEnvironmentRequest struct {
	Name string `json:"name"`
	Slug string `json:"slug"`
	Type string `json:"type"`
}

// Update handles PATCH /projects/:projectId/environments/:envId
func (h *EnvironmentHandler) Update(c *fiber.Ctx) error {
	envID, err := uuid.Parse(c.Params("envId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid environment id"})
	}

	var req updateEnvironmentRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	env, err := h.repo.Update(c.Context(), envID, repository.UpdateEnvironmentInput{
		Name: req.Name,
		Slug: req.Slug,
		Type: req.Type,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "environment not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(env)
}

// Delete handles DELETE /projects/:projectId/environments/:envId
func (h *EnvironmentHandler) Delete(c *fiber.Ctx) error {
	envID, err := uuid.Parse(c.Params("envId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid environment id"})
	}

	if err := h.repo.Delete(c.Context(), envID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "environment not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// ---------------------------------------------------------------------------
// Env-var operations
// ---------------------------------------------------------------------------

// maskedEnvVar is the response shape for list — values are always masked.
type maskedEnvVar struct {
	ID            uuid.UUID `json:"id"`
	EnvironmentID uuid.UUID `json:"environment_id"`
	Key           string    `json:"key"`
	Value         string    `json:"value"` // always "****"
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// ListEnvVars handles GET /environments/:envId/env-vars
// Values are masked as "****" — use this for the UI overview.
func (h *EnvironmentHandler) ListEnvVars(c *fiber.Ctx) error {
	envID, err := uuid.Parse(c.Params("envId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid environment id"})
	}

	vars, err := h.repo.ListEnvVars(c.Context(), envID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if vars == nil {
		vars = []model.EnvVar{}
	}

	result := make([]maskedEnvVar, len(vars))
	for i, v := range vars {
		result[i] = maskedEnvVar{
			ID:            v.ID,
			EnvironmentID: v.EnvironmentID,
			Key:           v.Key,
			Value:         "****",
			CreatedAt:     v.CreatedAt,
			UpdatedAt:     v.UpdatedAt,
		}
	}
	return c.JSON(result)
}

type envVarUpsertItem struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// UpsertEnvVars handles PUT /environments/:envId/env-vars
// Body: [{key, value}, ...]  — bulk upsert with AES-GCM encryption.
func (h *EnvironmentHandler) UpsertEnvVars(c *fiber.Ctx) error {
	envID, err := uuid.Parse(c.Params("envId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid environment id"})
	}

	var items []envVarUpsertItem
	if err := c.BodyParser(&items); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	for _, item := range items {
		if item.Key == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "key must not be empty"})
		}
		// Encrypt the value using the environment UUID as the per-record derivation key.
		enc, err := h.ks.Encrypt([]byte(item.Value), envID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "encryption failed"})
		}
		if _, err := h.repo.UpsertEnvVar(c.Context(), envID, item.Key, enc); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}
	return c.JSON(fiber.Map{"message": "ok", "count": len(items)})
}

// DeleteEnvVar handles DELETE /environments/:envId/env-vars/:key
func (h *EnvironmentHandler) DeleteEnvVar(c *fiber.Ctx) error {
	envID, err := uuid.Parse(c.Params("envId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid environment id"})
	}
	key := c.Params("key")
	if key == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "key is required"})
	}

	if err := h.repo.DeleteEnvVar(c.Context(), envID, key); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "env var not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(fiber.StatusNoContent)
}
