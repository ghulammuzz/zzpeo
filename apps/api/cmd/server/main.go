package main

import (
	"context"
	"log"

	"github.com/ghulammuzz/zzpeo/api/internal/config"
	"github.com/ghulammuzz/zzpeo/api/internal/db"
	"github.com/ghulammuzz/zzpeo/api/internal/model"
	"github.com/ghulammuzz/zzpeo/api/internal/repository"
	appssh "github.com/ghulammuzz/zzpeo/api/internal/ssh"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/joho/godotenv"
)

func main() {
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

	ks, err := appssh.NewKeyStoreFromBytes(cfg.SecretKey)
	if err != nil {
		log.Fatalf("keystore: %v", err)
	}

	userRepo := repository.NewUserRepository(pool)

	// Seed initial admin on first run
	if cfg.AdminUsername != "" && cfg.AdminPassword != "" {
		if err := seedAdmin(context.Background(), userRepo, cfg); err != nil {
			log.Printf("warn: admin seed: %v", err)
		}
	}

	app := fiber.New(fiber.Config{
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

	registerRoutes(app, pool, ks, userRepo, cfg)

	log.Printf("starting server on :%s", cfg.APIPort)
	log.Fatal(app.Listen(":" + cfg.APIPort))
}

func seedAdmin(ctx context.Context, userRepo *repository.UserRepository, cfg *config.Config) error {
	exists, err := userRepo.AdminExists(ctx)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}

	user, err := userRepo.Create(ctx, cfg.AdminUsername, model.RoleAdmin, nil)
	if err != nil {
		return err
	}
	if err := userRepo.SetPassword(ctx, user.ID, cfg.AdminPassword); err != nil {
		return err
	}

	log.Printf("admin user created: %s", cfg.AdminUsername)
	return nil
}
