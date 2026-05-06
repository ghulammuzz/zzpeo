package handler

import (
	"errors"
	"fmt"

	"github.com/ghulammuzz/zzpeo/api/internal/repository"
	"github.com/ghulammuzz/zzpeo/api/internal/service"
	appssh "github.com/ghulammuzz/zzpeo/api/internal/ssh"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// NginxHandler handles nginx-inspection routes.
type NginxHandler struct {
	serverRepo *repository.ServerRepository
	ks         *appssh.KeyStore
}

// NewNginxHandler wires up a NginxHandler.
func NewNginxHandler(db *pgxpool.Pool, ks *appssh.KeyStore) *NginxHandler {
	return &NginxHandler{
		serverRepo: repository.NewServerRepository(db),
		ks:         ks,
	}
}

// GetNginxConfig handles GET /servers/:serverId/nginx
// SSHes into the server and returns parsed nginx server blocks as JSON.
func (h *NginxHandler) GetNginxConfig(c *fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("serverId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server id"})
	}

	srv, err := h.serverRepo.GetByIDWithCredentials(c.Context(), serverID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "server not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	blocks, err := service.ReadNginxConfig(srv, h.ks)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": fmt.Sprintf("read nginx config: %v", err),
		})
	}

	if blocks == nil {
		blocks = []service.NginxBlock{}
	}
	return c.JSON(blocks)
}

// ListNginxFiles handles GET /servers/:serverId/nginx/files
func (h *NginxHandler) ListNginxFiles(c *fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("serverId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server id"})
	}

	srv, err := h.serverRepo.GetByIDWithCredentials(c.Context(), serverID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "server not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	files, err := service.ListNginxConfigFiles(srv, h.ks)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
	}
	if files == nil {
		files = []string{}
	}
	return c.JSON(files)
}

// GetRawNginxFile handles GET /servers/:serverId/nginx/raw?file=/path/to/file
func (h *NginxHandler) GetRawNginxFile(c *fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("serverId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server id"})
	}
	filePath := c.Query("file")
	if filePath == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "file query param required"})
	}

	srv, err := h.serverRepo.GetByIDWithCredentials(c.Context(), serverID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "server not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	content, err := service.ReadNginxFile(srv, h.ks, filePath)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"content": content, "file_path": filePath})
}

// UpdateRawNginxConfig handles PUT /servers/:serverId/nginx/raw
func (h *NginxHandler) UpdateRawNginxConfig(c *fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("serverId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server id"})
	}

	var body struct {
		Content  string `json:"content"`
		FilePath string `json:"file_path"`
	}
	if err := c.BodyParser(&body); err != nil || body.FilePath == "" || body.Content == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "content and file_path are required"})
	}

	srv, err := h.serverRepo.GetByIDWithCredentials(c.Context(), serverID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "server not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	result, err := service.WriteNginxConfig(srv, h.ks, body.FilePath, body.Content)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(result)
}
