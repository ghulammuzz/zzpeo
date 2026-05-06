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
)

// EnvVarSetHandler handles routes for global env var sets.
type EnvVarSetHandler struct {
	repo    repository.EnvVarSetRepo
	ks      *appssh.KeyStore
	svcRepo repository.ServiceRepo
}

func NewEnvVarSetHandler(repo repository.EnvVarSetRepo, svcRepo repository.ServiceRepo, ks *appssh.KeyStore) *EnvVarSetHandler {
	return &EnvVarSetHandler{repo: repo, ks: ks, svcRepo: svcRepo}
}

// List handles GET /env-var-sets
func (h *EnvVarSetHandler) List(c *fiber.Ctx) error {
	sets, err := h.repo.List(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if sets == nil {
		sets = []model.EnvVarSet{}
	}
	return c.JSON(sets)
}

// Create handles POST /env-var-sets
func (h *EnvVarSetHandler) Create(c *fiber.Ctx) error {
	var req struct {
		Name        string  `json:"name"`
		Description *string `json:"description"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name is required"})
	}
	set, err := h.repo.Create(c.Context(), req.Name, req.Description)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(set)
}

// GetByID handles GET /env-var-sets/:id
func (h *EnvVarSetHandler) GetByID(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id"})
	}
	set, err := h.repo.GetByID(c.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(set)
}

// Update handles PATCH /env-var-sets/:id
func (h *EnvVarSetHandler) Update(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id"})
	}
	var req struct {
		Name        string  `json:"name"`
		Description *string `json:"description"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	set, err := h.repo.Update(c.Context(), id, req.Name, req.Description)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(set)
}

// Delete handles DELETE /env-var-sets/:id
func (h *EnvVarSetHandler) Delete(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id"})
	}
	if err := h.repo.Delete(c.Context(), id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

type maskedSetItem struct {
	ID        uuid.UUID `json:"id"`
	SetID     uuid.UUID `json:"set_id"`
	Key       string    `json:"key"`
	Value     string    `json:"value"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ListItems handles GET /env-var-sets/:id/items
func (h *EnvVarSetHandler) ListItems(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id"})
	}
	items, err := h.repo.ListItems(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	result := make([]maskedSetItem, len(items))
	for i, v := range items {
		result[i] = maskedSetItem{ID: v.ID, SetID: v.SetID, Key: v.Key, Value: "****", CreatedAt: v.CreatedAt, UpdatedAt: v.UpdatedAt}
	}
	return c.JSON(result)
}

type setItemUpsertReq struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// UpsertItems handles PUT /env-var-sets/:id/items
func (h *EnvVarSetHandler) UpsertItems(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id"})
	}
	var items []setItemUpsertReq
	if err := c.BodyParser(&items); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	for _, item := range items {
		if item.Key == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "key must not be empty"})
		}
		if item.Value == "****" {
			continue
		}
		enc, err := h.ks.Encrypt([]byte(item.Value), id)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "encryption failed"})
		}
		if _, err := h.repo.UpsertItem(c.Context(), id, item.Key, enc); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}
	return c.JSON(fiber.Map{"message": "ok", "count": len(items)})
}

// DeleteItem handles DELETE /env-var-sets/:id/items/:key
func (h *EnvVarSetHandler) DeleteItem(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id"})
	}
	key := c.Params("key")
	if key == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "key is required"})
	}
	if err := h.repo.DeleteItem(c.Context(), id, key); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "item not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// RevealItems handles GET /env-var-sets/:id/items/reveal
func (h *EnvVarSetHandler) RevealItems(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id"})
	}
	items, err := h.repo.ListItems(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	type revealed struct {
		Key   string `json:"key"`
		Value string `json:"value"`
	}
	result := make([]revealed, 0, len(items))
	for _, v := range items {
		plain, err := h.ks.Decrypt(v.ValueEnc, id)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "decryption failed"})
		}
		result = append(result, revealed{Key: v.Key, Value: string(plain)})
	}
	return c.JSON(result)
}

// ---------------------------------------------------------------------------
// Service linking
// ---------------------------------------------------------------------------

// ListLinkedSets handles GET /services/:serviceId/env-var-sets
func (h *EnvVarSetHandler) ListLinkedSets(c *fiber.Ctx) error {
	serviceID, err := uuid.Parse(c.Params("serviceId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid service id"})
	}
	sets, err := h.repo.ListLinkedSets(c.Context(), serviceID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if sets == nil {
		sets = []model.LinkedEnvVarSet{}
	}
	return c.JSON(sets)
}

// LinkService handles POST /services/:serviceId/env-var-sets/:setId
func (h *EnvVarSetHandler) LinkService(c *fiber.Ctx) error {
	serviceID, err := uuid.Parse(c.Params("serviceId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid service id"})
	}
	setID, err := uuid.Parse(c.Params("setId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid set id"})
	}
	var req struct {
		DeployMode string `json:"deploy_mode"`
	}
	_ = c.BodyParser(&req)
	if err := h.repo.LinkService(c.Context(), serviceID, setID, req.DeployMode); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"message": "linked"})
}

// UpdateLinkDeployMode handles PATCH /services/:serviceId/env-var-sets/:setId
func (h *EnvVarSetHandler) UpdateLinkDeployMode(c *fiber.Ctx) error {
	serviceID, err := uuid.Parse(c.Params("serviceId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid service id"})
	}
	setID, err := uuid.Parse(c.Params("setId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid set id"})
	}
	var req struct {
		DeployMode string `json:"deploy_mode"`
	}
	if err := c.BodyParser(&req); err != nil || req.DeployMode == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "deploy_mode is required"})
	}
	if err := h.repo.UpdateLinkDeployMode(c.Context(), serviceID, setID, req.DeployMode); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "link not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"message": "updated"})
}

// UnlinkService handles DELETE /services/:serviceId/env-var-sets/:setId
func (h *EnvVarSetHandler) UnlinkService(c *fiber.Ctx) error {
	serviceID, err := uuid.Parse(c.Params("serviceId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid service id"})
	}
	setID, err := uuid.Parse(c.Params("setId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid set id"})
	}
	if err := h.repo.UnlinkService(c.Context(), serviceID, setID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "link not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(fiber.StatusNoContent)
}
