package handler

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/ghulammuzz/zzpeo/api/internal/model"
	"github.com/ghulammuzz/zzpeo/api/internal/repository"
	appssh "github.com/ghulammuzz/zzpeo/api/internal/ssh"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ServiceHandler handles all service-related routes.
type ServiceHandler struct {
	repo repository.ServiceRepo
	ks   *appssh.KeyStore
}

// NewServiceHandler wires up a ServiceHandler with the given repo.
func NewServiceHandler(repo repository.ServiceRepo, ks *appssh.KeyStore) *ServiceHandler {
	return &ServiceHandler{repo: repo, ks: ks}
}

// List handles GET /servers/:serverId/services
func (h *ServiceHandler) List(c *fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("serverId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server id"})
	}

	services, err := h.repo.List(c.Context(), serverID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if services == nil {
		services = []model.Service{}
	}
	return c.JSON(services)
}

type createServiceRequest struct {
	Name         string          `json:"name"`
	Workdir      string          `json:"workdir"`
	RunAsUser    *string         `json:"run_as_user"`
	LocalPort    *int            `json:"local_port"`
	LogConfig    json.RawMessage `json:"log_config"`
	DeployType   string          `json:"deploy_type"`
	DeployConfig json.RawMessage `json:"deploy_config"`
}

// Create handles POST /servers/:serverId/services
func (h *ServiceHandler) Create(c *fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("serverId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server id"})
	}

	var req createServiceRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.Name == "" || req.Workdir == "" || req.DeployType == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name, workdir, and deploy_type are required"})
	}

	svc, err := h.repo.Create(c.Context(), repository.CreateServiceInput{
		ServerID:     serverID,
		Name:         req.Name,
		Workdir:      req.Workdir,
		RunAsUser:    req.RunAsUser,
		LocalPort:    req.LocalPort,
		LogConfig:    json.RawMessage(req.LogConfig),
		DeployType:   model.DeployType(req.DeployType),
		DeployConfig: json.RawMessage(req.DeployConfig),
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(svc)
}

// GetByID handles GET /servers/:serverId/services/:serviceId
func (h *ServiceHandler) GetByID(c *fiber.Ctx) error {
	serviceID, err := uuid.Parse(c.Params("serviceId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid service id"})
	}

	svc, err := h.repo.GetByID(c.Context(), serviceID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "service not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(svc)
}

type updateServiceRequest struct {
	Name         string          `json:"name"`
	Workdir      string          `json:"workdir"`
	RunAsUser    *string         `json:"run_as_user"`
	LocalPort    *int            `json:"local_port"`
	LogConfig    json.RawMessage `json:"log_config"`
	DeployType   string          `json:"deploy_type"`
	DeployConfig json.RawMessage `json:"deploy_config"`
}

// Update handles PATCH /servers/:serverId/services/:serviceId
func (h *ServiceHandler) Update(c *fiber.Ctx) error {
	serviceID, err := uuid.Parse(c.Params("serviceId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid service id"})
	}

	var req updateServiceRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	svc, err := h.repo.Update(c.Context(), serviceID, repository.UpdateServiceInput{
		Name:         req.Name,
		Workdir:      req.Workdir,
		RunAsUser:    req.RunAsUser,
		LocalPort:    req.LocalPort,
		LogConfig:    json.RawMessage(req.LogConfig),
		DeployType:   model.DeployType(req.DeployType),
		DeployConfig: json.RawMessage(req.DeployConfig),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "service not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(svc)
}

// Delete handles DELETE /servers/:serverId/services/:serviceId
func (h *ServiceHandler) Delete(c *fiber.Ctx) error {
	serviceID, err := uuid.Parse(c.Params("serviceId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid service id"})
	}

	if err := h.repo.Delete(c.Context(), serviceID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "service not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// ListLinkedObjects handles GET /services/:serviceId/objects
func (h *ServiceHandler) ListLinkedObjects(c *fiber.Ctx) error {
	serviceID, err := uuid.Parse(c.Params("serviceId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid service id"})
	}

	objects, err := h.repo.ListLinkedObjects(c.Context(), serviceID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if objects == nil {
		objects = []model.Object{}
	}
	return c.JSON(objects)
}

// LinkObject handles POST /services/:serviceId/objects/:objectId
func (h *ServiceHandler) LinkObject(c *fiber.Ctx) error {
	serviceID, err := uuid.Parse(c.Params("serviceId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid service id"})
	}
	objectID, err := uuid.Parse(c.Params("objectId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid object id"})
	}

	if err := h.repo.LinkObject(c.Context(), serviceID, objectID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"message": "linked"})
}

// UnlinkObject handles DELETE /services/:serviceId/objects/:objectId
func (h *ServiceHandler) UnlinkObject(c *fiber.Ctx) error {
	serviceID, err := uuid.Parse(c.Params("serviceId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid service id"})
	}
	objectID, err := uuid.Parse(c.Params("objectId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid object id"})
	}

	if err := h.repo.UnlinkObject(c.Context(), serviceID, objectID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "link not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// ---------------------------------------------------------------------------
// Service env vars
// ---------------------------------------------------------------------------

type maskedServiceEnvVar struct {
	ID         uuid.UUID `json:"id"`
	ServiceID  uuid.UUID `json:"service_id"`
	Key        string    `json:"key"`
	Value      string    `json:"value"` // always "****"
	DeployMode string    `json:"deploy_mode"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// ListServiceEnvVars handles GET /services/:serviceId/env-vars
func (h *ServiceHandler) ListServiceEnvVars(c *fiber.Ctx) error {
	serviceID, err := uuid.Parse(c.Params("serviceId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid service id"})
	}

	vars, err := h.repo.ListServiceEnvVars(c.Context(), serviceID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if vars == nil {
		vars = []model.ServiceEnvVar{}
	}

	result := make([]maskedServiceEnvVar, len(vars))
	for i, v := range vars {
		result[i] = maskedServiceEnvVar{
			ID:         v.ID,
			ServiceID:  v.ServiceID,
			Key:        v.Key,
			Value:      "****",
			DeployMode: v.DeployMode,
			CreatedAt:  v.CreatedAt,
			UpdatedAt:  v.UpdatedAt,
		}
	}
	return c.JSON(result)
}

type serviceEnvVarUpsertItem struct {
	Key        string `json:"key"`
	Value      string `json:"value"`
	DeployMode string `json:"deploy_mode"`
}

// UpsertServiceEnvVars handles PUT /services/:serviceId/env-vars
func (h *ServiceHandler) UpsertServiceEnvVars(c *fiber.Ctx) error {
	serviceID, err := uuid.Parse(c.Params("serviceId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid service id"})
	}

	var items []serviceEnvVarUpsertItem
	if err := c.BodyParser(&items); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	for _, item := range items {
		if item.Key == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "key must not be empty"})
		}
		deployMode := item.DeployMode
		if deployMode == "" {
			deployMode = "all"
		}
		// "****" sentinel = mode-only update (don't overwrite encrypted value).
		if item.Value == "****" {
			if err := h.repo.UpdateServiceEnvVarMode(c.Context(), serviceID, item.Key, deployMode); err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
			}
			continue
		}
		enc, err := h.ks.Encrypt([]byte(item.Value), serviceID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "encryption failed"})
		}
		if _, err := h.repo.UpsertServiceEnvVar(c.Context(), serviceID, item.Key, enc, deployMode); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}
	return c.JSON(fiber.Map{"message": "ok", "count": len(items)})
}

// RevealServiceEnvVars handles GET /services/:serviceId/env-vars/reveal
// Returns decrypted values — use only over HTTPS.
func (h *ServiceHandler) RevealServiceEnvVars(c *fiber.Ctx) error {
	serviceID, err := uuid.Parse(c.Params("serviceId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid service id"})
	}

	vars, err := h.repo.ListServiceEnvVars(c.Context(), serviceID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	type revealed struct {
		Key        string `json:"key"`
		Value      string `json:"value"`
		DeployMode string `json:"deploy_mode"`
	}
	result := make([]revealed, 0, len(vars))
	for _, v := range vars {
		plain, err := h.ks.Decrypt(v.ValueEnc, serviceID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "decryption failed"})
		}
		result = append(result, revealed{Key: v.Key, Value: string(plain), DeployMode: v.DeployMode})
	}
	return c.JSON(result)
}

// DeleteServiceEnvVar handles DELETE /services/:serviceId/env-vars/:key
func (h *ServiceHandler) DeleteServiceEnvVar(c *fiber.Ctx) error {
	serviceID, err := uuid.Parse(c.Params("serviceId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid service id"})
	}
	key := c.Params("key")
	if key == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "key is required"})
	}

	if err := h.repo.DeleteServiceEnvVar(c.Context(), serviceID, key); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "env var not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(fiber.StatusNoContent)
}
