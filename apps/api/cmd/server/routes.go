package main

import (
	"github.com/ghulammuzz/zzpeo/api/internal/handler"
	"github.com/ghulammuzz/zzpeo/api/internal/repository"
	appssh "github.com/ghulammuzz/zzpeo/api/internal/ssh"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func registerRoutes(app *fiber.App, pool *pgxpool.Pool, ks *appssh.KeyStore) {
	// Repositories — created once, shared across handlers.
	projectRepo    := repository.NewProjectRepository(pool)
	envRepo        := repository.NewEnvironmentRepository(pool)
	serverRepo     := repository.NewServerRepository(pool)
	serviceRepo    := repository.NewServiceRepository(pool)
	objectRepo     := repository.NewObjectRepository(pool)
	deploymentRepo := repository.NewDeploymentRepository(pool)
	globalRepo     := repository.NewGlobalRepository(pool)
	evsRepo        := repository.NewEnvVarSetRepository(pool)

	v1 := app.Group("/api/v1")

	// Projects
	ph := handler.NewProjectHandler(projectRepo)
	v1.Get("/projects", ph.List)
	v1.Post("/projects", ph.Create)
	v1.Get("/projects/:projectId", ph.GetByID)
	v1.Patch("/projects/:projectId", ph.Update)
	v1.Delete("/projects/:projectId", ph.Delete)

	// Environments + env-vars
	eh := handler.NewEnvironmentHandler(envRepo, ks)
	v1.Get("/projects/:projectId/environments", eh.List)
	v1.Post("/projects/:projectId/environments", eh.Create)
	v1.Get("/projects/:projectId/environments/:envId", eh.GetByID)
	v1.Patch("/projects/:projectId/environments/:envId", eh.Update)
	v1.Delete("/projects/:projectId/environments/:envId", eh.Delete)
	v1.Get("/environments/:envId/env-vars", eh.ListEnvVars)
	v1.Put("/environments/:envId/env-vars", eh.UpsertEnvVars)
	v1.Delete("/environments/:envId/env-vars/:key", eh.DeleteEnvVar)

	// Servers
	sh := handler.NewServerHandler(serverRepo, ks)
	v1.Get("/environments/:envId/servers", sh.List)
	v1.Post("/environments/:envId/servers", sh.Create)
	v1.Get("/environments/:envId/servers/:serverId", sh.GetByID)
	v1.Patch("/environments/:envId/servers/:serverId", sh.Update)
	v1.Delete("/environments/:envId/servers/:serverId", sh.Delete)
	v1.Post("/environments/:envId/servers/:serverId/test-connection", sh.TestConnection)

	// Services
	svcH := handler.NewServiceHandler(serviceRepo, ks)
	v1.Get("/servers/:serverId/services", svcH.List)
	v1.Post("/servers/:serverId/services", svcH.Create)
	v1.Get("/servers/:serverId/services/:serviceId", svcH.GetByID)
	v1.Patch("/servers/:serverId/services/:serviceId", svcH.Update)
	v1.Delete("/servers/:serverId/services/:serviceId", svcH.Delete)
	v1.Get("/services/:serviceId/objects", svcH.ListLinkedObjects)
	v1.Post("/services/:serviceId/objects/:objectId", svcH.LinkObject)
	v1.Delete("/services/:serviceId/objects/:objectId", svcH.UnlinkObject)
	v1.Get("/services/:serviceId/env-vars", svcH.ListServiceEnvVars)
	v1.Get("/services/:serviceId/env-vars/reveal", svcH.RevealServiceEnvVars)
	v1.Put("/services/:serviceId/env-vars", svcH.UpsertServiceEnvVars)
	v1.Delete("/services/:serviceId/env-vars/:key", svcH.DeleteServiceEnvVar)

	// Objects
	oh := handler.NewObjectHandler(objectRepo)
	v1.Get("/environments/:envId/objects", oh.List)
	v1.Post("/environments/:envId/objects", oh.Create)
	v1.Get("/environments/:envId/objects/:objectId", oh.GetByID)
	v1.Patch("/environments/:envId/objects/:objectId", oh.Update)
	v1.Delete("/environments/:envId/objects/:objectId", oh.Delete)
	v1.Get("/object-types", oh.ListObjectTypes)

	// Deployments
	dh := handler.NewDeployHandler(serviceRepo, serverRepo, deploymentRepo, evsRepo, ks)
	v1.Post("/services/:serviceId/deploy", dh.TriggerDeploy)
	v1.Get("/services/:serviceId/deployments", dh.ListDeployments)
	v1.Get("/deployments/:deploymentId", dh.GetDeployment)
	v1.Get("/deployments/:deploymentId/stream", dh.StreamDeployment)

	// Service live logs
	lh := handler.NewLogsHandler(serviceRepo, serverRepo, ks)
	v1.Get("/services/:serviceId/logs", lh.StreamServiceLogs)

	// Git operations
	gh2 := handler.NewGitHandler(serviceRepo, serverRepo, ks)
	v1.Get("/services/:serviceId/git-info", gh2.GitInfo)
	v1.Post("/services/:serviceId/git-pull", gh2.GitPull)

	// Nginx inspection
	nh := handler.NewNginxHandler(serverRepo, ks)
	v1.Get("/servers/:serverId/nginx", nh.GetNginxConfig)
	v1.Get("/servers/:serverId/nginx/files", nh.ListNginxFiles)
	v1.Get("/servers/:serverId/nginx/raw", nh.GetRawNginxFile)
	v1.Put("/servers/:serverId/nginx/raw", nh.UpdateRawNginxConfig)

	// Global list endpoints (sidebar)
	gh := handler.NewGlobalHandler(globalRepo)
	v1.Get("/servers", gh.ListServers)
	v1.Get("/services", gh.ListServices)
	v1.Get("/objects", gh.ListObjects)

	// Env var sets
	evsh := handler.NewEnvVarSetHandler(evsRepo, serviceRepo, ks)
	v1.Get("/env-var-sets", evsh.List)
	v1.Post("/env-var-sets", evsh.Create)
	v1.Get("/env-var-sets/:id", evsh.GetByID)
	v1.Patch("/env-var-sets/:id", evsh.Update)
	v1.Delete("/env-var-sets/:id", evsh.Delete)
	v1.Get("/env-var-sets/:id/items", evsh.ListItems)
	v1.Put("/env-var-sets/:id/items", evsh.UpsertItems)
	v1.Delete("/env-var-sets/:id/items/:key", evsh.DeleteItem)
	v1.Get("/env-var-sets/:id/items/reveal", evsh.RevealItems)
	v1.Get("/services/:serviceId/env-var-sets", evsh.ListLinkedSets)
	v1.Post("/services/:serviceId/env-var-sets/:setId", evsh.LinkService)
	v1.Patch("/services/:serviceId/env-var-sets/:setId", evsh.UpdateLinkDeployMode)
	v1.Delete("/services/:serviceId/env-var-sets/:setId", evsh.UnlinkService)
}