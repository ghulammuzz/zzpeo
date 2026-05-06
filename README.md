# zzpeo

Internal platform for managing servers, services, environment variables, and deployments — replacing manual SSH workflows with a single UI.

**Who is this for:** DevOps / backend engineers managing multiple Linux servers across environments (prod, staging).

## What it does

- Manage projects → environments → servers → services in a hierarchy
- Deploy services via UI — no terminal needed
- Stream real-time deployment logs via SSE
- Store encrypted env vars (AES-256-GCM) per service or shared across services
- Parse and visualize nginx routing config from remote servers

## Stack

| Layer | Tech |
|---|---|
| Backend | Go + Fiber |
| Frontend | Next.js 14 (App Router) |
| Database | PostgreSQL (raw SQL via pgx/v5) |
| SSH | golang.org/x/crypto/ssh |
| UI | shadcn/ui + Tailwind CSS |

## Structure

```
zzpeo/
├── apps/
│   ├── api/          # Go backend (Fiber, handler/service/repository)
│   └── web/          # Next.js frontend
├── infra/
│   ├── docker-compose.yml        # Dev: Postgres + pgAdmin
│   ├── docker-compose.prod.yml   # Production stack
│   └── nginx.conf
├── .env.example
└── Makefile
```

## Quickstart

**Prerequisites:** Go 1.22+, Node.js 20+, Docker, [golang-migrate](https://github.com/golang-migrate/migrate)

```bash
cp .env.example .env
# fill in DATABASE_URL and APP_SECRET_KEY (openssl rand -hex 32)

make dev          # start infra + api + web (hot reload)
make migrate-up   # run DB migrations
```

API runs on `http://localhost:8080`, frontend on `http://localhost:3000`.

## Make Targets

| Target | Description |
|---|---|
| `dev` | Start infra + api + web |
| `infra-up` | Start Postgres + pgAdmin only |
| `migrate-up` | Apply pending migrations |
| `migrate-down` | Roll back last migration |
| `api-dev` | Start Go API only |
| `web-dev` | Start Next.js dev server only |
| `build` | Build Go binary + Next.js bundle |
| `test` | Run Go tests |
| `lint` | Run golangci-lint + ESLint |
| `prod-up` | Build and start production stack |

## Environment Variables

```env
DATABASE_URL=postgres://user:pass@localhost:5432/zzpeo
APP_SECRET_KEY=<32 bytes hex>
API_PORT=8080
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
```
