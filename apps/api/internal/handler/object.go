package handler

import (
	"errors"

	"github.com/ghulammuzz/zzpeo/api/internal/model"
	"github.com/ghulammuzz/zzpeo/api/internal/repository"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ObjectHandler handles all object-related routes.
type ObjectHandler struct {
	repo *repository.ObjectRepository
}

// NewObjectHandler wires up an ObjectHandler.
func NewObjectHandler(db *pgxpool.Pool) *ObjectHandler {
	return &ObjectHandler{repo: repository.NewObjectRepository(db)}
}

// List handles GET /environments/:envId/objects
func (h *ObjectHandler) List(c *fiber.Ctx) error {
	envID, err := uuid.Parse(c.Params("envId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid environment id"})
	}

	objects, err := h.repo.List(c.Context(), envID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if objects == nil {
		objects = []model.Object{}
	}
	return c.JSON(objects)
}

type createObjectRequest struct {
	ObjectTypeID uuid.UUID `json:"object_type_id"`
	Name         string    `json:"name"`
	Host         *string   `json:"host"`
	Port         *int      `json:"port"`
	DatabaseName *string   `json:"database_name"`
	Notes        *string   `json:"notes"`
}

// Create handles POST /environments/:envId/objects
func (h *ObjectHandler) Create(c *fiber.Ctx) error {
	envID, err := uuid.Parse(c.Params("envId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid environment id"})
	}

	var req createObjectRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name is required"})
	}
	if req.ObjectTypeID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "object_type_id is required"})
	}

	obj, err := h.repo.Create(c.Context(), repository.CreateObjectInput{
		EnvironmentID: envID,
		ObjectTypeID:  req.ObjectTypeID,
		Name:          req.Name,
		Host:          req.Host,
		Port:          req.Port,
		DatabaseName:  req.DatabaseName,
		Notes:         req.Notes,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(obj)
}

// GetByID handles GET /environments/:envId/objects/:objectId
func (h *ObjectHandler) GetByID(c *fiber.Ctx) error {
	objectID, err := uuid.Parse(c.Params("objectId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid object id"})
	}

	obj, err := h.repo.GetByID(c.Context(), objectID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "object not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(obj)
}

type updateObjectRequest struct {
	ObjectTypeID uuid.UUID `json:"object_type_id"`
	Name         string    `json:"name"`
	Host         *string   `json:"host"`
	Port         *int      `json:"port"`
	DatabaseName *string   `json:"database_name"`
	Notes        *string   `json:"notes"`
}

// Update handles PATCH /environments/:envId/objects/:objectId
func (h *ObjectHandler) Update(c *fiber.Ctx) error {
	objectID, err := uuid.Parse(c.Params("objectId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid object id"})
	}

	var req updateObjectRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	obj, err := h.repo.Update(c.Context(), objectID, repository.UpdateObjectInput{
		ObjectTypeID: req.ObjectTypeID,
		Name:         req.Name,
		Host:         req.Host,
		Port:         req.Port,
		DatabaseName: req.DatabaseName,
		Notes:        req.Notes,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "object not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(obj)
}

// Delete handles DELETE /environments/:envId/objects/:objectId
func (h *ObjectHandler) Delete(c *fiber.Ctx) error {
	objectID, err := uuid.Parse(c.Params("objectId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid object id"})
	}

	if err := h.repo.Delete(c.Context(), objectID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "object not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// ListObjectTypes handles GET /object-types
func (h *ObjectHandler) ListObjectTypes(c *fiber.Ctx) error {
	types, err := h.repo.ListObjectTypes(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if types == nil {
		types = []model.ObjectType{}
	}
	return c.JSON(types)
}
