# FlowMate OCI Deployment

## Prerequisites
- OCI VM: Ampere A1.Flex (2 OCPU, 12GB RAM, ARM64, ap-chuncheon-1), public IP 158.180.81.7
- SSH: `ssh oci` over Tailscale (100.126.53.122); public port 22 is blocked
- Docker installed
- Cloudflare DNS: worker.jerome87.com -> 158.180.81.7 (Proxy ON), db.jerome87.com -> 158.180.81.7 (DNS only)

## Setup
1. Clone repo: `git clone <repo> /home/ubuntu/flowmate`
2. Copy env: `cp .env.example .env.production` and fill values
3. Build: `./deploy/oci/deploy.sh build` (tags images with the git short SHA and prints the start command)
4. Start: `CRAWLER_IMAGE=flowmate-crawler:<tag> EMBEDDING_IMAGE=flowmate-embedding:<tag> PARSER_IMAGE=flowmate-parser:<tag> ./deploy/oci/deploy.sh start`
   (explicit refs are required; there is no implicit `:latest`. Currently running refs:
   `docker inspect -f '{{.Config.Image}}' flowmate-crawler`, etc.)
   `check`, `start` and `restart` all need the three `*_IMAGE` variables. They validate everything first
   (network `flowmate`, image refs, exactly one `DATABASE_URL` in `.env.production` whose host is
   `flowmate-db`; override for a rollback: `FLOWMATE_ALLOW_NON_OCI_DB=1`); `check` runs only the
   validation. `start`/`restart` then `docker create` all three new containers (so docker parses the env
   file and options) and only after that stop and remove the old ones. Workers run with
   `--restart unless-stopped`; their memory limits are revisited in Phase 1B.7.
5. Verify: `./deploy/oci/deploy.sh status`

## Services

| Container | Port | Role |
|-----------|------|------|
| flowmate-crawler | 3001 | Crawl job processing |
| flowmate-embedding | 3002 | Embedding generation + RAG matching |
| flowmate-parser | 8000 | HWP/HWPX/PDF text extraction |

Port 80 is served by the **host** nginx (systemd, `/etc/nginx/sites-available/worker`), which proxies to
the worker ports; there is no nginx container (`deploy/oci/nginx/` is only a reference config).

## Database (Phase 1A)

Postgres 17 + PgBouncer run as a separate compose stack: source `deploy/oci/db/`, deployed to
`/home/ubuntu/flowmate-db/`. See [`db/README.md`](db/README.md) for install, backups, restore and
the cutover runbook.

| Container | Port | Role |
|-----------|------|------|
| flowmate-db | 127.0.0.1:5433 only (admin via SSH tunnel) | Postgres 17 + pgvector, docker network `flowmate` |
| flowmate-pgbouncer | 6432 (public, TLS required) | Pooler for Vercel; only `flowmate_app` |

Workers reach the DB as `flowmate-db:5432` on the `flowmate` network. At the cutover they are
recreated by `deploy/oci/db/switch-workers.sh` (running image + env, DB URL swapped, `--network
flowmate --cap-drop NET_RAW`, `--rollback` available). Later redeploys use `deploy.sh start`, which
also runs the workers with `--network flowmate --cap-drop NET_RAW`. `.env.production` is the single
source of the worker env: the cutover edits its DB URLs (backup kept), rollback restores it.

## Commands
- `./deploy.sh build` - Build all Docker images
- `CRAWLER_IMAGE=... EMBEDDING_IMAGE=... PARSER_IMAGE=... ./deploy.sh start` - Start all services
- `./deploy.sh stop` - Stop all services
- `./deploy.sh restart` - Restart all services
- `./deploy.sh status` - Health check all services
- `./deploy.sh logs [service]` - Tail service logs
