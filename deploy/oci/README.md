# FlowMate OCI Deployment

## Prerequisites
- OCI VM: Ampere A1.Flex (2 OCPU, 12GB RAM, ARM64, ap-chuncheon-1), public IP 158.180.81.7
- SSH: `ssh oci` over Tailscale (100.126.53.122); public port 22 is blocked
- Docker installed
- Cloudflare DNS: worker.jerome87.com -> 158.180.81.7 (Proxy ON), db.jerome87.com -> 158.180.81.7 (DNS only)

## Setup
1. Clone repo: `git clone <repo> /home/ubuntu/flowmate`
2. Copy env: `cp .env.example .env.production` and fill values
3. Build: `./deploy/oci/deploy.sh build`
4. Start: `./deploy/oci/deploy.sh start`
5. Verify: `./deploy/oci/deploy.sh status`

## Services

| Container | Port | Role |
|-----------|------|------|
| flowmate-nginx | 80 | Reverse proxy (SSL via Cloudflare) |
| flowmate-crawler | 3001 | Crawl job processing |
| flowmate-embedding | 3002 | Embedding generation + RAG matching |
| flowmate-parser | 8000 | HWP/HWPX/PDF text extraction |

## Database (Phase 1A)

Postgres 17 + PgBouncer run as a separate compose stack: source `deploy/oci/db/`, deployed to
`/home/ubuntu/flowmate-db/`. See [`db/README.md`](db/README.md) for install, backups, restore and
the cutover runbook.

| Container | Port | Role |
|-----------|------|------|
| flowmate-db | 127.0.0.1:5433 only (admin via SSH tunnel) | Postgres 17 + pgvector, docker network `flowmate` |
| flowmate-pgbouncer | 6432 (public, TLS required) | Pooler for Vercel; only `flowmate_app` |

Workers reach the DB as `flowmate-db:5432` after being attached to the `flowmate` network
(`docker network connect flowmate <container>`, part of the cutover).

## Commands
- `./deploy.sh build` - Build all Docker images
- `./deploy.sh start` - Start all services
- `./deploy.sh stop` - Stop all services
- `./deploy.sh restart` - Restart all services
- `./deploy.sh status` - Health check all services
- `./deploy.sh logs [service]` - Tail service logs
