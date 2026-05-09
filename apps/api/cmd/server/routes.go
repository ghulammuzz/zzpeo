package main

import (
	"github.com/ghulammuzz/zzpeo/api/internal/config"
	"github.com/ghulammuzz/zzpeo/api/internal/handler"
	"github.com/ghulammuzz/zzpeo/api/internal/middleware"
	"github.com/ghulammuzz/zzpeo/api/internal/repository"
	appssh "github.com/ghulammuzz/zzpeo/api/internal/ssh"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func registerRoutes(app *fiber.App, pool *pgxpool.Pool, ks *appssh.KeyStore, userRepo *repository.UserRepository, cfg *config.Config) {
	projectRepo    := repository.NewProjectRepository(pool)
	envRepo        := repository.NewEnvironmentRepository(pool)
	serverRepo     := repository.NewServerRepository(pool)
	serviceRepo    := repository.NewServiceRepository(pool)
	objectRepo     := repository.NewObjectRepository(pool)
	deploymentRepo := repository.NewDeploymentRepository(pool)
	globalRepo     := repository.NewGlobalRepository(pool)
	evsRepo        := repository.NewEnvVarSetRepository(pool)

	v1 := app.Group("/api/v1")

	// ── Public auth routes ────────────────────────────────────────
	authH := handler.NewAuthHandler(userRepo, cfg.SecretKey)
	v1.Post("/auth/login", authH.Login)
	v1.Get("/auth/register-info/:token", authH.RegisterInfo)
	v1.Post("/auth/register/:token", authH.Register)

	// ── Protected routes — require valid JWT ──────────────────────
	protected := v1.Group("", middleware.Auth(cfg.SecretKey))

	protected.Get("/auth/me", authH.Me)

	// ── Admin-only routes ─────────────────────────────────────────
	adminH := handler.NewAdminHandler(userRepo, projectRepo, cfg.AppURL)
	admin := protected.Group("/admin", middleware.RequireAdmin)
	admin.Get("/users", adminH.ListUsers)
	admin.Post("/users", adminH.CreateUser)
	admin.Delete("/users/:id", adminH.DeleteUser)
	admin.Post("/users/:id/reg-token", adminH.RegenerateToken)
	admin.Get("/users/:id/permissions", adminH.ListPermissions)
	admin.Put("/users/:id/permissions", adminH.SetPermissions)

	// ── Projects ──────────────────────────────────────────────────
	ph := handler.NewProjectHandler(projectRepo)
	protected.Get("/projects", ph.List)
	protected.Get("/projects/:projectId", ph.GetByID)
	protected.Post("/projects", middleware.RequireAdmin, ph.Create)
	protected.Patch("/projects/:projectId", middleware.RequireAdmin, ph.Update)
	protected.Delete("/projects/:projectId", middleware.RequireAdmin, ph.Delete)

	// ── Environments + env-vars ───────────────────────────────────
	eh := handler.NewEnvironmentHandler(envRepo, ks)
	protected.Get("/projects/:projectId/environments", eh.List)
	protected.Get("/projects/:projectId/environments/:envId", eh.GetByID)
	protected.Post("/projects/:projectId/environments", middleware.RequireAdmin, eh.Create)
	protected.Patch("/projects/:projectId/environments/:envId", middleware.RequireAdmin, eh.Update)
	protected.Delete("/projects/:projectId/environments/:envId", middleware.RequireAdmin, eh.Delete)
	protected.Get("/environments/:envId/env-vars", eh.ListEnvVars)
	protected.Put("/environments/:envId/env-vars", middleware.RequireAdmin, eh.UpsertEnvVars)
	protected.Delete("/environments/:envId/env-vars/:key", middleware.RequireAdmin, eh.DeleteEnvVar)

	// ── Servers ───────────────────────────────────────────────────
	sh := handler.NewServerHandler(serverRepo, ks)
	protected.Get("/environments/:envId/servers", sh.List)
	protected.Get("/environments/:envId/servers/:serverId", sh.GetByID)
	protected.Post("/environments/:envId/servers", middleware.RequireAdmin, sh.Create)
	protected.Patch("/environments/:envId/servers/:serverId", middleware.RequireAdmin, sh.Update)
	protected.Delete("/environments/:envId/servers/:serverId", middleware.RequireAdmin, sh.Delete)
	protected.Post("/environments/:envId/servers/:serverId/test-connection", middleware.RequireAdmin, sh.TestConnection)
	protected.Post("/servers/test-ssh", middleware.RequireAdmin, sh.TestRawSSH)

	// ── Services ──────────────────────────────────────────────────
	svcH := handler.NewServiceHandler(serviceRepo, ks)
	protected.Get("/servers/:serverId/services", svcH.List)
	protected.Get("/servers/:serverId/services/:serviceId", svcH.GetByID)
	protected.Post("/servers/:serverId/services", middleware.RequireAdmin, svcH.Create)
	protected.Patch("/servers/:serverId/services/:serviceId", middleware.RequireAdmin, svcH.Update)
	protected.Delete("/servers/:serverId/services/:serviceId", middleware.RequireAdmin, svcH.Delete)
	protected.Get("/services/:serviceId/objects", svcH.ListLinkedObjects)
	protected.Post("/services/:serviceId/objects/:objectId", middleware.RequireAdmin, svcH.LinkObject)
	protected.Delete("/services/:serviceId/objects/:objectId", middleware.RequireAdmin, svcH.UnlinkObject)
	protected.Get("/services/:serviceId/env-vars", svcH.ListServiceEnvVars)
	protected.Get("/services/:serviceId/env-vars/reveal", svcH.RevealServiceEnvVars)
	protected.Put("/services/:serviceId/env-vars", middleware.RequireAdmin, svcH.UpsertServiceEnvVars)
	protected.Delete("/services/:serviceId/env-vars/:key", middleware.RequireAdmin, svcH.DeleteServiceEnvVar)

	// ── Objects ───────────────────────────────────────────────────
	oh := handler.NewObjectHandler(objectRepo)
	protected.Get("/environments/:envId/objects", oh.List)
	protected.Get("/environments/:envId/objects/:objectId", oh.GetByID)
	protected.Get("/object-types", oh.ListObjectTypes)
	protected.Post("/environments/:envId/objects", middleware.RequireAdmin, oh.Create)
	protected.Patch("/environments/:envId/objects/:objectId", middleware.RequireAdmin, oh.Update)
	protected.Delete("/environments/:envId/objects/:objectId", middleware.RequireAdmin, oh.Delete)

	// ── Deployments ───────────────────────────────────────────────
	dh := handler.NewDeployHandler(serviceRepo, serverRepo, deploymentRepo, evsRepo, ks)
	protected.Post("/services/:serviceId/deploy", middleware.RequireAdmin, dh.TriggerDeploy)
	protected.Post("/deployments/:deploymentId/cancel", middleware.RequireAdmin, dh.CancelDeploy)
	protected.Get("/services/:serviceId/deployments", dh.ListDeployments)
	protected.Get("/deployments/:deploymentId", dh.GetDeployment)
	protected.Get("/deployments/:deploymentId/stream", dh.StreamDeployment)

	// ── Service live logs ─────────────────────────────────────────
	lh := handler.NewLogsHandler(serviceRepo, serverRepo, ks)
	protected.Get("/services/:serviceId/logs", lh.StreamServiceLogs)

	// ── Git operations ────────────────────────────────────────────
	gh2 := handler.NewGitHandler(serviceRepo, serverRepo, ks)
	protected.Get("/services/:serviceId/git-info", gh2.GitInfo)
	protected.Post("/services/:serviceId/git-pull", middleware.RequireAdmin, gh2.GitPull)

	// ── Nginx ─────────────────────────────────────────────────────
	nh := handler.NewNginxHandler(serverRepo, ks)
	protected.Get("/servers/:serverId/nginx", nh.GetNginxConfig)
	protected.Get("/servers/:serverId/nginx/files", nh.ListNginxFiles)
	protected.Get("/servers/:serverId/nginx/raw", nh.GetRawNginxFile)
	protected.Put("/servers/:serverId/nginx/raw", middleware.RequireAdmin, nh.UpdateRawNginxConfig)

	// ── Global lists (sidebar) ────────────────────────────────────
	gh := handler.NewGlobalHandler(globalRepo)
	protected.Get("/servers", gh.ListServers)
	protected.Get("/services", gh.ListServices)
	protected.Get("/objects", gh.ListObjects)

	// ── Env var sets ──────────────────────────────────────────────
	evsh := handler.NewEnvVarSetHandler(evsRepo, serviceRepo, ks)
	protected.Get("/env-var-sets", evsh.List)
	protected.Get("/env-var-sets/:id", evsh.GetByID)
	protected.Get("/env-var-sets/:id/items", evsh.ListItems)
	protected.Get("/env-var-sets/:id/items/reveal", evsh.RevealItems)
	protected.Get("/services/:serviceId/env-var-sets", evsh.ListLinkedSets)
	protected.Post("/env-var-sets", middleware.RequireAdmin, evsh.Create)
	protected.Patch("/env-var-sets/:id", middleware.RequireAdmin, evsh.Update)
	protected.Delete("/env-var-sets/:id", middleware.RequireAdmin, evsh.Delete)
	protected.Put("/env-var-sets/:id/items", middleware.RequireAdmin, evsh.UpsertItems)
	protected.Delete("/env-var-sets/:id/items/:key", middleware.RequireAdmin, evsh.DeleteItem)
	protected.Post("/services/:serviceId/env-var-sets/:setId", middleware.RequireAdmin, evsh.LinkService)
	protected.Patch("/services/:serviceId/env-var-sets/:setId", middleware.RequireAdmin, evsh.UpdateLinkDeployMode)
	protected.Delete("/services/:serviceId/env-var-sets/:setId", middleware.RequireAdmin, evsh.UnlinkService)
}
