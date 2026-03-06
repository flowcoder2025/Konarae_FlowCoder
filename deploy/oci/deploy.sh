#!/bin/bash
# FlowMate Worker Services - OCI Deployment
# Usage: ./deploy.sh [build|start|stop|restart|status|logs]

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

    log "Building flowmate-nginx..."
    sudo docker build -t flowmate-nginx -f deploy/oci/nginx/Dockerfile deploy/oci/nginx/

    log "Building flowmate-crawler..."
    sudo docker build -t flowmate-crawler -f deploy/oci/crawler/Dockerfile .

    log "Building flowmate-embedding..."
    sudo docker build -t flowmate-embedding -f deploy/oci/embedding/Dockerfile .

    log "Building flowmate-parser..."
    sudo docker build -t flowmate-parser -f deploy/oci/parser/Dockerfile .

    log "All images built successfully!"
    ;;

  start)
    log "Starting FlowMate services..."

    sudo docker run -d \
      --restart always \
      --name flowmate-crawler \
      -p 3001:3001 \
      --env-file "$PROJECT_DIR/.env.production" \
      -e PORT=3001 \
      flowmate-crawler

    sudo docker run -d \
      --restart always \
      --name flowmate-embedding \
      -p 3002:3002 \
      --env-file "$PROJECT_DIR/.env.production" \
      -e PORT=3002 \
      flowmate-embedding

    sudo docker run -d \
      --restart always \
      --name flowmate-parser \
      -p 8000:8000 \
      --env-file "$PROJECT_DIR/.env.production" \
      -e PORT=8000 \
      flowmate-parser

    sudo docker run -d \
      --restart always \
      --name flowmate-nginx \
      -p 80:80 \
      flowmate-nginx

    log "All services started!"
    ;;

  stop)
    log "Stopping FlowMate services..."
    sudo docker stop flowmate-nginx flowmate-crawler flowmate-embedding flowmate-parser 2>/dev/null || true
    sudo docker rm flowmate-nginx flowmate-crawler flowmate-embedding flowmate-parser 2>/dev/null || true
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

    status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:80/health/nginx" 2>/dev/null || echo "000")
    if [ "$status" = "200" ]; then
      echo -e "  ${GREEN}ok${NC} nginx (:80)"
    else
      echo -e "  ${RED}fail${NC} nginx (:80) - HTTP $status"
    fi
    ;;

  logs)
    SERVICE="${2:-flowmate-crawler}"
    sudo docker logs --tail 100 -f "$SERVICE"
    ;;

  *)
    echo "Usage: $0 {build|start|stop|restart|status|logs [service]}"
    echo "Services: flowmate-crawler, flowmate-embedding, flowmate-parser, flowmate-nginx"
    ;;
esac
