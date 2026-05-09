package handler

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strconv"

	"github.com/ghulammuzz/zzpeo/api/internal/dokploy"
	"github.com/ghulammuzz/zzpeo/api/internal/model"
	"github.com/ghulammuzz/zzpeo/api/internal/repository"
	"github.com/ghulammuzz/zzpeo/api/internal/service"
	appssh "github.com/ghulammuzz/zzpeo/api/internal/ssh"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/valyala/fasthttp"
)

// LogsHandler streams live service logs over SSE.
type LogsHandler struct {
	svcRepo    repository.ServiceRepo
	serverRepo repository.ServerRepo
	ks         *appssh.KeyStore
}

// NewLogsHandler wires up a LogsHandler with injected repos.
func NewLogsHandler(svcRepo repository.ServiceRepo, serverRepo repository.ServerRepo, ks *appssh.KeyStore) *LogsHandler {
	return &LogsHandler{svcRepo: svcRepo, serverRepo: serverRepo, ks: ks}
}

// LogConfig is stored as JSONB in services.log_config.
type LogConfig struct {
	Type          string `json:"type"`           // docker_logs | pm2 | file | docker_exec_file | journalctl | dokploy
	ContainerName string `json:"container_name"` // docker_logs, docker_exec_file
	AppName       string `json:"app_name"`       // pm2
	Path          string `json:"path"`           // file, docker_exec_file
	Unit          string `json:"unit"`           // journalctl
	ApplicationID string `json:"application_id"` // dokploy
}

// validSince allows safe duration strings passed to docker --since
var validSince = regexp.MustCompile(`^\d+[smhd]$`)

// StreamServiceLogs handles GET /services/:serviceId/logs (SSE).
// Query params:
//
//	tail  — historical lines (default 200, max 5000)
//	since — docker --since value: "30m", "1h", "24h" (docker_logs only)
func (h *LogsHandler) StreamServiceLogs(c *fiber.Ctx) error {
	serviceID, err := uuid.Parse(c.Params("serviceId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid service id"})
	}

	tail := 200
	if t := c.Query("tail"); t != "" {
		if n, err := strconv.Atoi(t); err == nil && n > 0 && n <= 5000 {
			tail = n
		}
	}
	since := c.Query("since")
	if since != "" && !validSince.MatchString(since) {
		since = ""
	}

	ctx := c.Context()

	svc, err := h.svcRepo.GetByID(ctx, serviceID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "service not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Resolve Dokploy log type: explicit log_config.type=dokploy OR deploy_type=dokploy fallback.
	dokployAppID := ""
	if len(svc.LogConfig) > 0 && string(svc.LogConfig) != "null" {
		var lcfg LogConfig
		if json.Unmarshal(svc.LogConfig, &lcfg) == nil && lcfg.Type == "dokploy" {
			dokployAppID = lcfg.ApplicationID
		}
	}
	if dokployAppID == "" && svc.DeployType == model.DeployDokploy {
		var dcfg service.DokployDeployConfig
		if json.Unmarshal(svc.DeployConfig, &dcfg) == nil {
			dokployAppID = dcfg.ApplicationID
		}
	}

	srv, err := h.serverRepo.GetByIDWithCredentials(ctx, svc.ServerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "server not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// ── Dokploy path ──────────────────────────────────────────────────────────
	if dokployAppID != "" {
		tokenBytes, err := h.ks.Decrypt(srv.PasswordEnc, srv.ID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "decrypt token failed"})
		}
		baseURL := fmt.Sprintf("http://%s:%d", srv.Host, srv.Port)
		dk := dokploy.NewClient(baseURL, string(tokenBytes))
		appID := dokployAppID

		c.Set("Content-Type", "text/event-stream")
		c.Set("Cache-Control", "no-cache")
		c.Set("Connection", "keep-alive")
		c.Set("Transfer-Encoding", "chunked")
		c.Set("X-Accel-Buffering", "no")

		// Preferred: if the Dokploy server has an SSH key stored, use SSH +
		// `docker logs -f <full_container_name>` (works for Swarm task containers).
		if len(srv.SSHKeyEnc) > 0 {
			c.Context().SetBodyStreamWriter(fasthttp.StreamWriter(func(w *bufio.Writer) {
				// Resolve app name from Dokploy API, then find the running container.
				app, err := dk.GetApplication(ctx, appID)
				if err != nil {
					fmt.Fprintf(w, "event: error\ndata: resolve app failed: %s\n\n", err.Error())
					_ = w.Flush()
					return
				}
				appName := app.AppName
				if appName == "" {
					appName = app.ContainerName
				}
				if appName == "" {
					fmt.Fprintf(w, "event: error\ndata: could not resolve app name for %s\n\n", appID)
					_ = w.Flush()
					return
				}

				// Find the full container name (e.g. shortie-app.1.abc123) via docker.getContainers.
				// docker logs -f <full_name> works for Swarm task containers directly.
				_, fullContainerName, findErr := dk.FindContainerID(ctx, appName)
				logTarget := appName // fallback: use service name with docker service logs
				useServiceLogs := true
				if findErr == nil && fullContainerName != "" {
					logTarget = fullContainerName
					useServiceLogs = false
				}

				var logCmd string
				if useServiceLogs {
					logCmd = fmt.Sprintf("docker service logs -f --no-task-ids --raw --tail=%d %s 2>&1", tail, logTarget)
				} else {
					logCmd = fmt.Sprintf("docker logs -f --tail=%d %s 2>&1", tail, logTarget)
				}

				sshClient, err := appssh.NewClientFromServer(srv, h.ks)
				if err != nil {
					fmt.Fprintf(w, "event: error\ndata: SSH connect failed: %s\n\n", err.Error())
					_ = w.Flush()
					return
				}
				defer sshClient.Close()

				exec := appssh.NewExecutor(sshClient)
				lines := make(chan string, 512)
				done := make(chan error, 1)
				go func() {
					// Use root workdir "/" — docker logs/service logs don't need workdir.
					// runAsUser="" — Dokploy server user (root) can run docker directly.
					done <- exec.RunCommands(ctx, "/", "", []string{logCmd}, lines)
				}()
				for {
					select {
					case line, ok := <-lines:
						if !ok {
							return
						}
						fmt.Fprintf(w, "event: log\ndata: %s\n\n", line)
						_ = w.Flush()
					case runErr := <-done:
						for {
							select {
							case line := <-lines:
								fmt.Fprintf(w, "event: log\ndata: %s\n\n", line)
								_ = w.Flush()
							default:
								if runErr != nil && ctx.Err() == nil {
									fmt.Fprintf(w, "event: error\ndata: %s\n\n", runErr.Error())
									_ = w.Flush()
								}
								return
							}
						}
					}
				}
			}))
			return nil
		}

		// Fallback: poll Dokploy API (works for non-Swarm Docker containers).
		c.Context().SetBodyStreamWriter(fasthttp.StreamWriter(func(w *bufio.Writer) {
			streamErr := dk.StreamContainerLogs(ctx, appID, tail, func(line string) {
				fmt.Fprintf(w, "event: log\ndata: %s\n\n", line)
				_ = w.Flush()
			})
			if streamErr != nil && ctx.Err() == nil {
				fmt.Fprintf(w, "event: error\ndata: %s\n\n", streamErr.Error())
				_ = w.Flush()
			}
		}))
		return nil
	}

	// ── SSH path ──────────────────────────────────────────────────────────────
	logCmd, err := buildLogCmd(svc, tail, since)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("Transfer-Encoding", "chunked")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(fasthttp.StreamWriter(func(w *bufio.Writer) {
		client, err := appssh.NewClientFromServer(srv, h.ks)
		if err != nil {
			fmt.Fprintf(w, "event: error\ndata: failed to connect: %s\n\n", err.Error())
			_ = w.Flush()
			return
		}
		defer client.Close()

		exec := appssh.NewExecutor(client)
		runAsUser := ""
		if svc.RunAsUser != nil {
			runAsUser = *svc.RunAsUser
		}

		lines := make(chan string, 512)
		done := make(chan error, 1)

		go func() {
			done <- exec.RunCommands(ctx, svc.Workdir, runAsUser, []string{logCmd}, lines)
		}()

		for {
			select {
			case line, ok := <-lines:
				if !ok {
					return
				}
				fmt.Fprintf(w, "event: log\ndata: %s\n\n", line)
				_ = w.Flush()
			case err := <-done:
				for {
					select {
					case line := <-lines:
						fmt.Fprintf(w, "event: log\ndata: %s\n\n", line)
						_ = w.Flush()
					default:
						if err != nil {
							fmt.Fprintf(w, "event: error\ndata: %s\n\n", err.Error())
							_ = w.Flush()
						}
						return
					}
				}
			}
		}
	}))

	return nil
}

// buildLogCmd resolves the log-follow command from the service config.
// Priority: explicit log_config > auto-detect from deploy_type.
func buildLogCmd(svc *model.Service, tail int, since string) (string, error) {
	// Explicit log_config overrides auto-detection for all deploy types.
	if len(svc.LogConfig) > 0 && string(svc.LogConfig) != "null" {
		var cfg LogConfig
		if err := json.Unmarshal(svc.LogConfig, &cfg); err != nil {
			return "", fmt.Errorf("parse log_config: %w", err)
		}
		return logCmdFromConfig(cfg, tail, since)
	}

	// Auto-detect for docker and pm2 when no explicit config is set.
	switch svc.DeployType {
	case model.DeployDocker:
		var cfg service.DockerDeployConfig
		if err := json.Unmarshal(svc.DeployConfig, &cfg); err != nil {
			return "", fmt.Errorf("parse docker deploy config: %w", err)
		}
		if cfg.ContainerName == "" {
			return "", fmt.Errorf("docker container_name not set — configure Log Source on the service")
		}
		return dockerLogsCmd(cfg.ContainerName, tail, since), nil

	case model.DeployPM2:
		var cfg service.PM2DeployConfig
		if err := json.Unmarshal(svc.DeployConfig, &cfg); err != nil {
			return "", fmt.Errorf("parse pm2 deploy config: %w", err)
		}
		if cfg.PM2AppName == "" {
			return "", fmt.Errorf("pm2 app name not set — configure Log Source on the service")
		}
		return fmt.Sprintf("pm2 logs %s --raw --lines %d 2>&1", cfg.PM2AppName, tail), nil

	default:
		return "", fmt.Errorf("no log source configured for this service — set Log Source in service settings")
	}
}

func logCmdFromConfig(cfg LogConfig, tail int, since string) (string, error) {
	switch cfg.Type {
	case "docker_logs":
		if cfg.ContainerName == "" {
			return "", fmt.Errorf("log_config.container_name is required for docker_logs")
		}
		return dockerLogsCmd(cfg.ContainerName, tail, since), nil

	case "pm2":
		if cfg.AppName == "" {
			return "", fmt.Errorf("log_config.app_name is required for pm2")
		}
		return fmt.Sprintf("pm2 logs %s --raw --lines %d 2>&1", cfg.AppName, tail), nil

	case "file":
		if cfg.Path == "" {
			return "", fmt.Errorf("log_config.path is required for file")
		}
		return fmt.Sprintf("tail -f -n %d %s 2>&1", tail, cfg.Path), nil

	case "docker_exec_file":
		if cfg.ContainerName == "" {
			return "", fmt.Errorf("log_config.container_name is required for docker_exec_file")
		}
		if cfg.Path == "" {
			return "", fmt.Errorf("log_config.path is required for docker_exec_file")
		}
		return fmt.Sprintf("docker exec %s tail -f -n %d %s 2>&1", cfg.ContainerName, tail, cfg.Path), nil

	case "journalctl":
		if cfg.Unit == "" {
			return "", fmt.Errorf("log_config.unit is required for journalctl")
		}
		return fmt.Sprintf("journalctl -u %s -f --lines=%d --no-pager 2>&1", cfg.Unit, tail), nil

	case "dokploy":
		// Handled via HTTP API before buildLogCmd is called — should not reach here.
		return "", fmt.Errorf("dokploy log source requires Dokploy API path")

	default:
		return "", fmt.Errorf("unknown log source type %q", cfg.Type)
	}
}

func dockerLogsCmd(container string, tail int, since string) string {
	cmd := fmt.Sprintf("docker logs -f --tail=%d", tail)
	if since != "" {
		cmd += fmt.Sprintf(" --since=%s", since)
	}
	return cmd + fmt.Sprintf(" %s 2>&1", container)
}
