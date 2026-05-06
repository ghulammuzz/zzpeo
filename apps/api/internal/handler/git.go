package handler

import (
	"errors"
	"strings"

	"github.com/ghulammuzz/zzpeo/api/internal/repository"
	appssh "github.com/ghulammuzz/zzpeo/api/internal/ssh"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// GitHandler handles git info and git pull operations for services.
type GitHandler struct {
	svcRepo    *repository.ServiceRepository
	serverRepo *repository.ServerRepository
	ks         *appssh.KeyStore
}

func NewGitHandler(db *pgxpool.Pool, ks *appssh.KeyStore) *GitHandler {
	return &GitHandler{
		svcRepo:    repository.NewServiceRepository(db),
		serverRepo: repository.NewServerRepository(db),
		ks:         ks,
	}
}

// GitInfo handles GET /services/:serviceId/git-info
// Returns the current branch and latest commit for the service workdir.
func (h *GitHandler) GitInfo(c *fiber.Ctx) error {
	serviceID, err := uuid.Parse(c.Params("serviceId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid service id"})
	}

	svc, err := h.svcRepo.GetByID(c.Context(), serviceID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "service not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	srv, err := h.serverRepo.GetByIDWithCredentials(c.Context(), svc.ServerID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	client, err := appssh.NewClientFromServer(srv, h.ks)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "SSH connect failed: " + err.Error()})
	}
	defer client.Close()

	runAsUser := ""
	if svc.RunAsUser != nil {
		runAsUser = *svc.RunAsUser
	}

	branch, _ := client.RunCaptured(svc.Workdir, runAsUser, "git rev-parse --abbrev-ref HEAD")
	branch = strings.TrimSpace(branch)

	commit, _ := client.RunCaptured(svc.Workdir, runAsUser, "git log --oneline -1")
	commit = strings.TrimSpace(commit)

	if branch == "" {
		branch = "unknown"
	}

	commitHash := ""
	commitMessage := ""
	if parts := strings.SplitN(commit, " ", 2); len(parts) == 2 {
		commitHash = parts[0]
		commitMessage = parts[1]
	} else if len(parts) == 1 {
		commitHash = parts[0]
	}

	return c.JSON(fiber.Map{
		"branch":         branch,
		"commit_hash":    commitHash,
		"commit_message": commitMessage,
	})
}

// GitPull handles POST /services/:serviceId/git-pull
// Runs `git pull` in the service workdir and returns the output.
func (h *GitHandler) GitPull(c *fiber.Ctx) error {
	serviceID, err := uuid.Parse(c.Params("serviceId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid service id"})
	}

	svc, err := h.svcRepo.GetByID(c.Context(), serviceID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "service not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	srv, err := h.serverRepo.GetByIDWithCredentials(c.Context(), svc.ServerID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	client, err := appssh.NewClientFromServer(srv, h.ks)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "SSH connect failed: " + err.Error()})
	}
	defer client.Close()

	runAsUser := ""
	if svc.RunAsUser != nil {
		runAsUser = *svc.RunAsUser
	}

	output, pullErr := client.RunCaptured(svc.Workdir, runAsUser, "git pull")
	output = strings.TrimSpace(output)

	if pullErr != nil {
		return c.JSON(fiber.Map{
			"success": false,
			"output":  output,
			"error":   pullErr.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"output":  output,
	})
}
