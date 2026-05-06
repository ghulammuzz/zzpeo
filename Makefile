.PHONY: infra-up infra-down migrate-up migrate-down api-dev web-dev dev build test lint prod-up prod-down

# Load .env if it exists (so DATABASE_URL etc. are available to make targets)
-include .env
export

DATABASE_URL ?= postgres://zzpeo:zzpeo@localhost:5432/zzpeo?sslmode=disable

# ── Infrastructure ────────────────────────────────────────────────────────────

# Start postgres + pgAdmin
infra-up:
	docker compose -f infra/docker-compose.yml up -d

infra-down:
	docker compose -f infra/docker-compose.yml down

# ── Migrations ────────────────────────────────────────────────────────────────
# Requires golang-migrate:
#   go install github.com/golang-migrate/migrate/v4/cmd/migrate@latest

migrate-up:
	migrate -path apps/api/internal/db/migrations \
	        -database "$(DATABASE_URL)" up

migrate-down:
	migrate -path apps/api/internal/db/migrations \
	        -database "$(DATABASE_URL)" down 1

# ── Dev servers ───────────────────────────────────────────────────────────────

api-dev:
	cd apps/api && go run ./cmd/server

web-dev:
	cd apps/web && npm run dev

dev:
	$(MAKE) infra-up
	$(MAKE) api-dev & $(MAKE) web-dev

# ── Build ─────────────────────────────────────────────────────────────────────

build:
	cd apps/api && go build -o ../../bin/api ./cmd/server
	cd apps/web && npm run build

# ── Test ──────────────────────────────────────────────────────────────────────

test:
	cd apps/api && go test ./...

# ── Lint ──────────────────────────────────────────────────────────────────────

lint:
	cd apps/api && golangci-lint run
	cd apps/web && npm run lint

# ── Production ────────────────────────────────────────────────────────────────

prod-up:
	docker compose -f infra/docker-compose.prod.yml up -d --build

prod-down:
	docker compose -f infra/docker-compose.prod.yml down
