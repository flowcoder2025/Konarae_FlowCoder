# FlowMate OCI Deployment

## Prerequisites
- OCI VM: Ampere A1.Flex (4 OCPU, 24GB RAM) at 158.180.81.7
- Docker installed
- Cloudflare DNS: worker.jerome87.com -> 158.180.81.7 (Proxy ON)

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

## Commands
- `./deploy.sh build` - Build all Docker images
- `./deploy.sh start` - Start all services
- `./deploy.sh stop` - Stop all services
- `./deploy.sh restart` - Restart all services
- `./deploy.sh status` - Health check all services
- `./deploy.sh logs [service]` - Tail service logs
