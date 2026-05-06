package handler

import (
	"github.com/ghulammuzz/zzpeo/api/internal/repository"
	"github.com/gofiber/fiber/v2"
)

// GlobalHandler handles global list endpoints used by the sidebar.
type GlobalHandler struct {
	repo repository.GlobalRepo
}

func NewGlobalHandler(repo repository.GlobalRepo) *GlobalHandler {
	return &GlobalHandler{repo: repo}
}

// ListServers handles GET /servers
func (h *GlobalHandler) ListServers(c *fiber.Ctx) error {
	servers, err := h.repo.ListServers(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if servers == nil {
		servers = []repository.GlobalServer{}
	}
	return c.JSON(servers)
}

// ListServices handles GET /services
func (h *GlobalHandler) ListServices(c *fiber.Ctx) error {
	services, err := h.repo.ListServices(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if services == nil {
		services = []repository.GlobalService{}
	}
	return c.JSON(services)
}

// ListObjects handles GET /objects
func (h *GlobalHandler) ListObjects(c *fiber.Ctx) error {
	objects, err := h.repo.ListObjects(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if objects == nil {
		objects = []repository.GlobalObject{}
	}
	return c.JSON(objects)
}
