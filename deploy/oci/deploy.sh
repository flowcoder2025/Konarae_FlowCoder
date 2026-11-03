#!/bin/bash
# FlowMate Worker Services - OCI Deployment
# flowmate-deploy-guard: v1  (validated, create-first start/restart; switch-workers.sh refuses
#                             to run unless the installed deploy.sh carries this marker)
# Usage: ./deploy.sh [build|check|start|stop|restart|status|logs]
#
# check/start/restart validate EVERYTHING before any container is stopped or started (start and
# restart additionally `docker create` all three new containers first; only then are the old
# ones stopped and removed):
#   - docker network `flowmate` exists (workers reach Postgres as flowmate-db:5432)
#   - $PROJECT_DIR/.env.production exists and its DATABASE_URL host is flowmate-db
#     (the single source of truth after the DB cutover; deploy/oci/db/switch-workers.sh edits it).
#     Deploying workers against another DB (e.g. Supabase after a rollback) needs
#     FLOWMATE_ALLOW_NON_OCI_DB=1.
#   - CRAWLER_IMAGE / EMBEDDING_IMAGE / PARSER_IMAGE are set and exist locally
#
# start needs explicit image refs (no implicit :latest -- e.g. the live crawler runs
# flowmate-crawler:pr9 while flowmate-crawler:latest is older):
#   CRAWLER_IMAGE=flowmate-crawler:pr9 EMBEDDING_IMAGE=... PARSER_IMAGE=... ./deploy.sh start
# Current refs: docker inspect -f '{{.Config.Image}}' flowmate-crawler (etc.)
# Host nginx (systemd) owns :80; this script does not run an nginx container.
# For the DB cutover use deploy/oci/db/switch-workers.sh instead (keeps the running config).

set -e

PROJECT_DIR="${FLOWMATE_PROJECT_DIR:-/home/ubuntu/flowmate}"
ENV_FILE="$PROJECT_DIR/.env.production"
# Test hook: FLOWMATE_DOCKER replaces `sudo docker` (tests/deploy-guard.test.sh uses a stub).
if [ -n "${FLOWMATE_DOCKER:-}" ]; then DOCKER=("$FLOWMATE_DOCKER"); else DOCKER=(sudo docker); fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[FlowMate]${NC} $1"; }
warn() { echo -e "${YELLOW}[FlowMate]${NC} $1"; }
error() { echo -e "${RED}[FlowMate]${NC} $1"; }

# Host of a postgres URL on a strict parse only; anything else is reported as "unparseable"
# (a guard message must never echo a raw value).
db_url_host() {
  local v=$1 re='^postgres(ql)?://[^@/[:space:]]+@([A-Za-z0-9.-]+)(:[0-9]{1,5})?/[A-Za-z0-9_.-]+([?][^[:space:]]*)?$'
  v=${v#\"}
  v=${v%\"}
  if [[ $v =~ $re ]]; then printf '%s' "${BASH_REMATCH[2]}"; else printf 'unparseable'; fi
}
# DATABASE_URL as docker --env-file reads it (leading whitespace stripped, verbatim value).
env_database_url_count() { sed -E 's/^[[:space:]]+//' "$ENV_FILE" | grep -c '^DATABASE_URL=' || true; }
env_database_url() { sed -E 's/^[[:space:]]+//' "$ENV_FILE" | sed -n 's/^DATABASE_URL=//p' | tail -n 1; }

# All start prerequisites; returns non-zero (with a message) before anything is touched.
validate_start() {
  local var ref host n
  "${DOCKER[@]}" network inspect flowmate >/dev/null 2>&1 || {
    error "docker network 'flowmate' missing: install deploy/oci/db first"
    return 1
  }
  [ -r "$ENV_FILE" ] || { error "$ENV_FILE not found or not readable"; return 1; }
  n=$(env_database_url_count)
  [ "$n" = 1 ] || { error "$ENV_FILE must define DATABASE_URL exactly once (found $n)"; return 1; }
  host=$(db_url_host "$(env_database_url)")
  if [ "$host" != flowmate-db ]; then
    if [ "${FLOWMATE_ALLOW_NON_OCI_DB:-0}" = 1 ]; then
      warn "DATABASE_URL host is $host, not flowmate-db (allowed by FLOWMATE_ALLOW_NON_OCI_DB=1)"
    else
      error "DATABASE_URL in $ENV_FILE: host is $host, not flowmate-db. After the DB cutover the workers must use the OCI DB; if this is intended (rollback), set FLOWMATE_ALLOW_NON_OCI_DB=1"
      return 1
    fi
  fi
  for var in CRAWLER_IMAGE EMBEDDING_IMAGE PARSER_IMAGE; do
    ref="${!var:-}"
    if [ -z "$ref" ]; then
      error "$var is not set: pass an explicit image ref (see: docker inspect -f '{{.Config.Image}}' <container>)"
      return 1
    fi
    "${DOCKER[@]}" image inspect "$ref" >/dev/null 2>&1 || { error "$var=$ref: image not found"; return 1; }
  done
  log "start prerequisites ok (network flowmate, DB host $host, images $CRAWLER_IMAGE $EMBEDDING_IMAGE $PARSER_IMAGE)"
}

# Create all three new containers under temporary names first (docker parses the env file,
# images and every option here). Only if all three succeed is anything stopped.
# --restart unless-stopped matches the running crawler and CLAUDE.md 9.5. NOTE: embedding and
# parser currently run with `always`; the first redeploy through this script moves them to
# unless-stopped (they then stay down after a manual `docker stop`, also across reboots).
# Memory limits are unchanged here (crawler 2g, embedding 1g, parser default); Phase 1B.7.
CANDIDATES=()
create_candidates() {
  local ts c
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  CANDIDATES=()
  c="flowmate-crawler-next-$ts"
  "${DOCKER[@]}" create --name "$c" --restart unless-stopped --network flowmate --cap-drop NET_RAW \
    -p 3001:3001 --memory 2g --memory-swap 2g --env-file "$ENV_FILE" \
    -e PORT=3001 -e NODE_OPTIONS="--max-old-space-size=1024 --expose-gc" "$CRAWLER_IMAGE" >/dev/null || { drop_candidates; return 1; }
  CANDIDATES+=("flowmate-crawler=$c")
  c="flowmate-embedding-next-$ts"
  "${DOCKER[@]}" create --name "$c" --restart unless-stopped --network flowmate --cap-drop NET_RAW \
    -p 3002:3002 --memory 1g --memory-swap 1g --env-file "$ENV_FILE" \
    -e PORT=3002 -e NODE_OPTIONS="--max-old-space-size=768 --expose-gc" "$EMBEDDING_IMAGE" >/dev/null || { drop_candidates; return 1; }
  CANDIDATES+=("flowmate-embedding=$c")
  c="flowmate-parser-next-$ts"
  "${DOCKER[@]}" create --name "$c" --restart unless-stopped --network flowmate --cap-drop NET_RAW \
    -p 8000:8000 --env-file "$ENV_FILE" -e PORT=8000 "$PARSER_IMAGE" >/dev/null || { drop_candidates; return 1; }
  CANDIDATES+=("flowmate-parser=$c")
}
drop_candidates() {
  local pair
  for pair in ${CANDIDATES[@]+"${CANDIDATES[@]}"}; do "${DOCKER[@]}" rm -f "${pair#*=}" >/dev/null 2>&1 || true; done
  CANDIDATES=()
  error "creating the new containers failed; nothing was stopped (new containers removed)"
}
# If this fails half-way (e.g. a port still busy), the services already promoted run the new
# containers, the rest are stopped/removed and their new container is left created but not started
# as flowmate-<svc>-next-<ts>. Manual recovery: `docker rename flowmate-<svc>-next-<ts> flowmate-<svc>`
# then `docker start flowmate-<svc>` for each left-over -next- container (`docker ps -a | grep -- -next-`).
promote_candidates() { # stop + remove the old container, give the candidate its name, start it
  local pair name cand
  for pair in "${CANDIDATES[@]}"; do
    name=${pair%%=*}
    cand=${pair#*=}
    "${DOCKER[@]}" stop "$name" >/dev/null 2>&1 || true
    "${DOCKER[@]}" rm "$name" >/dev/null 2>&1 || true
    "${DOCKER[@]}" rename "$cand" "$name"
    "${DOCKER[@]}" start "$name" >/dev/null
    log "started $name"
  done
}

case "${1:-help}" in
  build)
    log "Building Docker images..."
    cd "$PROJECT_DIR"
    git pull origin main

    TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD)}"

    log "Building flowmate-crawler:$TAG..."
    "${DOCKER[@]}" build -t "flowmate-crawler:$TAG" -f deploy/oci/crawler/Dockerfile .

    log "Building flowmate-embedding:$TAG..."
    "${DOCKER[@]}" build -t "flowmate-embedding:$TAG" -f deploy/oci/embedding/Dockerfile .

    log "Building flowmate-parser:$TAG..."
    "${DOCKER[@]}" build -t "flowmate-parser:$TAG" -f deploy/oci/parser/Dockerfile .

    log "All images built. Start them with:"
    echo "  CRAWLER_IMAGE=flowmate-crawler:$TAG EMBEDDING_IMAGE=flowmate-embedding:$TAG PARSER_IMAGE=flowmate-parser:$TAG $0 start"
    ;;

  check)
    validate_start || exit 1
    ;;

  start)
    log "Starting FlowMate services..."
    # Workers reach Postgres as flowmate-db:5432 on the `flowmate` network (deploy/oci/db).
    # NET_RAW is dropped so a compromised worker cannot spoof traffic on that bridge.
    validate_start || exit 1
    for name in flowmate-crawler flowmate-embedding flowmate-parser; do
      if "${DOCKER[@]}" container inspect "$name" >/dev/null 2>&1; then
        error "$name already exists: use '$0 restart'"
        exit 1
      fi
    done
    create_candidates || exit 1
    promote_candidates
    log "All services started!"
    ;;

  stop)
    log "Stopping FlowMate services..."
    "${DOCKER[@]}" stop flowmate-crawler flowmate-embedding flowmate-parser 2>/dev/null || true
    "${DOCKER[@]}" rm flowmate-crawler flowmate-embedding flowmate-parser 2>/dev/null || true
    log "All services stopped."
    ;;

  restart)
    # Validate and create all new containers BEFORE stopping anything: a bad env file, image or
    # option must not leave the workers deleted.
    validate_start || { error "restart aborted before stopping anything"; exit 1; }
    create_candidates || { error "restart aborted before stopping anything"; exit 1; }
    promote_candidates
    log "All services restarted!"
    ;;

  status)
    log "Service Status:"
    echo ""
    "${DOCKER[@]}" ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" \
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
    "${DOCKER[@]}" logs --tail 100 -f "$SERVICE"
    ;;

  *)
    echo "Usage: $0 {build|check|start|stop|restart|status|logs [service]}"
    echo "Services: flowmate-crawler, flowmate-embedding, flowmate-parser (host nginx serves :80)"
    ;;
esac
