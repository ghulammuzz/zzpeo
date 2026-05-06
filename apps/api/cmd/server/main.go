package main

import (
	"log"

	"github.com/ghulammuzz/zzpeo/api/internal/config"
	"github.com/ghulammuzz/zzpeo/api/internal/db"
	"github.com/ghulammuzz/zzpeo/api/internal/handler"
	appssh "github.com/ghulammuzz/zzpeo/api/internal/ssh"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env if present; not fatal if it doesn't exist.
	_ = godotenv.Load()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	pool, err := db.New(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer pool.Close()

	// Build KeyStore from the pre-decoded 32-byte secret.
	ks, err := appssh.NewKeyStoreFromBytes(cfg.SecretKey)
	if err != nil {
		log.Fatalf("keystore: %v", err)
	}

	app := fiber.New(fiber.Config{
		// Return a clean JSON error body rather than an HTML page.
		DisableStartupMessage: true,
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})

	app.Use(logger.New())
	app.Use(recover.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET,POST,PATCH,DELETE,PUT,OPTIONS",
	}))

	v1 := app.Group("/api/v1")

	// -------------------------------------------------------------------------
	// Projects
	// -------------------------------------------------------------------------
	ph := handler.NewProjectHandler(pool)
	v1.Get("/projects", ph.List)
	v1.Post("/projects", ph.Create)
	v1.Get("/projects/:projectId", ph.GetByID)
	v1.Patch("/projects/:projectId", ph.Update)
	v1.Delete("/projects/:projectId", ph.Delete)

	// -------------------------------------------------------------------------
	// Environments + env-vars
	// -------------------------------------------------------------------------
	eh := handler.NewEnvironmentHandler(pool, ks)
	v1.Get("/projects/:projectId/environments", eh.List)
	v1.Post("/projects/:projectId/environments", eh.Create)
	v1.Get("/projects/:projectId/environments/:envId", eh.GetByID)
	v1.Patch("/projects/:projectId/environments/:envId", eh.Update)
	v1.Delete("/projects/:projectId/environments/:envId", eh.Delete)
	v1.Get("/environments/:envId/env-vars", eh.ListEnvVars)
	v1.Put("/environments/:envId/env-vars", eh.UpsertEnvVars)
	v1.Delete("/environments/:envId/env-vars/:key", eh.DeleteEnvVar)

	// -------------------------------------------------------------------------
	// Servers
	// -------------------------------------------------------------------------
	sh := handler.NewServerHandler(pool, ks)
	v1.Get("/environments/:envId/servers", sh.List)
	v1.Post("/environments/:envId/servers", sh.Create)
	v1.Get("/environments/:envId/servers/:serverId", sh.GetByID)
	v1.Patch("/environments/:envId/servers/:serverId", sh.Update)
	v1.Delete("/environments/:envId/servers/:serverId", sh.Delete)
	v1.Post("/environments/:envId/servers/:serverId/test-connection", sh.TestConnection)

	// -------------------------------------------------------------------------
	// Services
	// -------------------------------------------------------------------------
	svcH := handler.NewServiceHandler(pool, ks)
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

	// -------------------------------------------------------------------------
	// Objects
	// -------------------------------------------------------------------------
	oh := handler.NewObjectHandler(pool)
	v1.Get("/environments/:envId/objects", oh.List)
	v1.Post("/environments/:envId/objects", oh.Create)
	v1.Get("/environments/:envId/objects/:objectId", oh.GetByID)
	v1.Patch("/environments/:envId/objects/:objectId", oh.Update)
	v1.Delete("/environments/:envId/objects/:objectId", oh.Delete)
	v1.Get("/object-types", oh.ListObjectTypes)

	// -------------------------------------------------------------------------
	// Deployments
	// -------------------------------------------------------------------------
	dh := handler.NewDeployHandler(pool, ks)
	v1.Post("/services/:serviceId/deploy", dh.TriggerDeploy)
	v1.Get("/services/:serviceId/deployments", dh.ListDeployments)
	v1.Get("/deployments/:deploymentId", dh.GetDeployment)
	v1.Get("/deployments/:deploymentId/stream", dh.StreamDeployment)

	// -------------------------------------------------------------------------
	// Service live logs
	// -------------------------------------------------------------------------
	lh := handler.NewLogsHandler(pool, ks)
	v1.Get("/services/:serviceId/logs", lh.StreamServiceLogs)

	// -------------------------------------------------------------------------
	// Git operations
	// -------------------------------------------------------------------------
	gh2 := handler.NewGitHandler(pool, ks)
	v1.Get("/services/:serviceId/git-info", gh2.GitInfo)
	v1.Post("/services/:serviceId/git-pull", gh2.GitPull)

	// -------------------------------------------------------------------------
	// Nginx inspection
	// -------------------------------------------------------------------------
	nh := handler.NewNginxHandler(pool, ks)
	v1.Get("/servers/:serverId/nginx", nh.GetNginxConfig)
	v1.Get("/servers/:serverId/nginx/files", nh.ListNginxFiles)
	v1.Get("/servers/:serverId/nginx/raw", nh.GetRawNginxFile)
	v1.Put("/servers/:serverId/nginx/raw", nh.UpdateRawNginxConfig)

	// -------------------------------------------------------------------------
	// Global list endpoints (for sidebar)
	// -------------------------------------------------------------------------
	gh := handler.NewGlobalHandler(pool)
	v1.Get("/servers", gh.ListServers)
	v1.Get("/services", gh.ListServices)
	v1.Get("/objects", gh.ListObjects)

	// -------------------------------------------------------------------------
	// Env var sets
	// -------------------------------------------------------------------------
	evsh := handler.NewEnvVarSetHandler(pool, ks)
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

	log.Printf("starting server on :%s", cfg.APIPort)
	log.Fatal(app.Listen(":" + cfg.APIPort))
}
