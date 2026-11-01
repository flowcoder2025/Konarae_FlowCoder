#!/bin/bash
# FlowMate Worker Services - OCI Deployment
# Usage: ./deploy.sh [build|start|stop|restart|status|logs]
#
# start needs explicit image refs (no implicit :latest -- e.g. the live crawler runs
# flowmate-crawler:pr9 while flowmate-crawler:latest is older):
#   CRAWLER_IMAGE=flowmate-crawler:pr9 EMBEDDING_IMAGE=... PARSER_IMAGE=... ./deploy.sh start
# Current refs: docker inspect -f '{{.Config.Image}}' flowmate-crawler (etc.)
# Host nginx (systemd) owns :80; this script does not run an nginx container.
# For the DB cutover use deploy/oci/db/switch-workers.sh instead (keeps the running config).

set -e

PROJECT_DIR="/home/ubuntu/flowmate"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[FlowMate]${NC} $1"; }
warn() { echo -e "${YELLOW}[FlowMate]${NC} $1"; }
error() { echo -e "${RED}[FlowMate]${NC} $1"; }

case "${1:-help}" in
  build)
    log "Building Docker images..."
    cd "$PROJECT_DIR"
    git pull origin main

    TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD)}"

    log "Building flowmate-crawler:$TAG..."
    sudo docker build -t "flowmate-crawler:$TAG" -f deploy/oci/crawler/Dockerfile .

    log "Building flowmate-embedding:$TAG..."
    sudo docker build -t "flowmate-embedding:$TAG" -f deploy/oci/embedding/Dockerfile .

    log "Building flowmate-parser:$TAG..."
    sudo docker build -t "flowmate-parser:$TAG" -f deploy/oci/parser/Dockerfile .

    log "All images built. Start them with:"
    echo "  CRAWLER_IMAGE=flowmate-crawler:$TAG EMBEDDING_IMAGE=flowmate-embedding:$TAG PARSER_IMAGE=flowmate-parser:$TAG $0 start"
    ;;

  start)
    log "Starting FlowMate services..."
    # Workers reach Postgres as flowmate-db:5432 on the `flowmate` network (deploy/oci/db).
    # Without it a redeploy after the DB cutover would silently lose DB access.
    # NET_RAW is dropped so a compromised worker cannot spoof traffic on that bridge.
    sudo docker network inspect flowmate >/dev/null 2>&1 || {
      error "docker network 'flowmate' missing: install deploy/oci/db first"
      exit 1
    }
    for var in CRAWLER_IMAGE EMBEDDING_IMAGE PARSER_IMAGE; do
      ref="${!var:-}"
      if [ -z "$ref" ]; then
        error "$var is not set: pass an explicit image ref (see: docker inspect -f '{{.Config.Image}}' <container>)"
        exit 1
      fi
      sudo docker image inspect "$ref" >/dev/null 2>&1 || { error "$var=$ref: image not found"; exit 1; }
    done

    sudo docker run -d \
      --restart always \
      --name flowmate-crawler \
      --network flowmate \
      --cap-drop NET_RAW \
      -p 3001:3001 \
      --memory 2g \
      --memory-swap 2g \
      --env-file "$PROJECT_DIR/.env.production" \
      -e PORT=3001 \
      -e NODE_OPTIONS="--max-old-space-size=1024 --expose-gc" \
      "$CRAWLER_IMAGE"

    sudo docker run -d \
      --restart always \
      --name flowmate-embedding \
      --network flowmate \
      --cap-drop NET_RAW \
      -p 3002:3002 \
      --memory 1g \
      --memory-swap 1g \
      --env-file "$PROJECT_DIR/.env.production" \
      -e PORT=3002 \
      -e NODE_OPTIONS="--max-old-space-size=768 --expose-gc" \
      "$EMBEDDING_IMAGE"

    sudo docker run -d \
      --restart always \
      --name flowmate-parser \
      --network flowmate \
      --cap-drop NET_RAW \
      -p 8000:8000 \
      --env-file "$PROJECT_DIR/.env.production" \
      -e PORT=8000 \
      "$PARSER_IMAGE"

    log "All services started!"
    ;;

  stop)
    log "Stopping FlowMate services..."
    sudo docker stop flowmate-crawler flowmate-embedding flowmate-parser 2>/dev/null || true
    sudo docker rm flowmate-crawler flowmate-embedding flowmate-parser 2>/dev/null || true
    log "All services stopped."
    ;;

  restart)
    $0 stop
    sleep 2
    $0 start
    ;;

  status)
    log "Service Status:"
    echo ""
    sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" \
      --filter "name=flowmate-" 2>/dev/null || echo "No services running"
    echo ""

    for svc in "crawler:3001" "embedding:3002" "parser:8000"; do
      name="${svc%%:*}"
      port="${svc##*:}"
      status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port/health" 2>/dev/null || echo "000")
      if [ "$status" = "200" ]; then
        echo -e "  ${GREEN}ok${NC} $name (:$port)"
      else
        echo -e "  ${RED}fail${NC} $name (:$port) - HTTP $status"
      fi
    done
    ;;

  logs)
    SERVICE="${2:-flowmate-crawler}"
    sudo docker logs --tail 100 -f "$SERVICE"
    ;;

  *)
    echo "Usage: $0 {build|start|stop|restart|status|logs [service]}"
    echo "Services: flowmate-crawler, flowmate-embedding, flowmate-parser (host nginx serves :80)"
    ;;
esac
