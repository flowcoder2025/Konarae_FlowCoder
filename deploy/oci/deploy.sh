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
# Current refs: docker container inspect -f '{{.Config.Image}}' flowmate-crawler (etc.)
# build: runs `git pull origin main` in ~/flowmate. After the DB runbook step 0b that checkout is
# NOT pull-able until a follow-up reconciles it to main (deploy/oci/db/README.md, "~/flowmate after
# step 0b (deferred)"): don't run build there, and never stash, commit -a or discard the guarded
# deploy.sh. Redeploying the running images (restart with explicit *_IMAGE refs) needs no pull.
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
      error "$var is not set: pass an explicit image ref (see: docker container inspect -f '{{.Config.Image}}' <container>)"
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
# Promotion, per service in order: stop old -> rm old -> rename candidate -> start. If a step
# fails, the script stops there and prints the ACTUAL state of every service with the commands to
# finish or undo it (print_promotion_recovery): services before the failed one are promoted;
# the failed one depends on the step (e.g. a failed start leaves the old container removed and
# the new one named <service> but only "Created"); services after it are untouched (old container
# still running) and only their unused <service>-next-<ts> candidate has to be removed.
print_promotion_recovery() { # FAILED_INDEX STEP OLD_IMAGE
  local failed_idx=$1 step=$2 old_image=$3 i pair name cand new gone="the old container was removed"
  [ -n "$old_image" ] || gone="there was no old container"
  error "promotion stopped at step '$step'. Actual state and recovery, per service:"
  for i in "${!CANDIDATES[@]}"; do
    pair=${CANDIDATES[$i]}
    name=${pair%%=*}
    cand=${pair#*=}
    if [ "$i" -lt "$failed_idx" ]; then
      echo "  - $name: promoted (new container running). Nothing to do."
    elif [ "$i" -gt "$failed_idx" ]; then
      if "${DOCKER[@]}" container inspect "$name" >/dev/null 2>&1; then
        echo "  - $name: untouched (old container still running). Remove the unused new container: ${DOCKER[*]} rm $cand"
      else # `start` path: there was no old container
        echo "  - $name: no old container; the new one is still named $cand (not started). Finish: ${DOCKER[*]} rename $cand $name && ${DOCKER[*]} start $name ; or remove it: ${DOCKER[*]} rm $cand"
      fi
    else
      case "$step" in
        stop) echo "  - $name: FAILED to stop the old container (it may still be running). The new container was not used: ${DOCKER[*]} rm $cand" ;;
        rm) echo "  - $name: FAILED to remove the old container; it is stopped. Bring it back: ${DOCKER[*]} start $name ; remove the unused new container: ${DOCKER[*]} rm $cand" ;;
        rename) echo "  - $name: $gone; the new one is still named $cand. Finish: ${DOCKER[*]} rename $cand $name && ${DOCKER[*]} start $name" ;;
        start) echo "  - $name: $gone; the new one is named $name but NOT started (Created). Fix the cause (e.g. free its port), then: ${DOCKER[*]} start $name" ;;
      esac
      # Only after rename/start is there a NEW container to remove: at stop/rm $name is still the
      # old one (maybe running), so "rm $name" there would destroy the service. After a failed
      # rename the new container is still called $cand; after a failed start it is $name.
      case "$step" in
        rename | start)
          new=$name
          [ "$step" = rename ] && new=$cand
          if [ -n "$old_image" ]; then
            echo "      previous image of $name: $old_image. To go back instead: ${DOCKER[*]} rm $new, then re-create $name from that image (same options as in this script). Use the sha256 id: the tag may already point at the new build."
          else
            echo "      to undo instead: ${DOCKER[*]} rm $new"
          fi ;;
      esac
    fi
  done
}
promote_candidates() { # stop + remove the old container, give the candidate its name, start it
  local i pair name cand old_image
  for i in "${!CANDIDATES[@]}"; do
    pair=${CANDIDATES[$i]}
    name=${pair%%=*}
    cand=${pair#*=}
    old_image=""
    if "${DOCKER[@]}" container inspect "$name" >/dev/null 2>&1; then
      old_image=$("${DOCKER[@]}" container inspect -f '{{.Config.Image}} ({{.Image}})' "$name" 2>/dev/null || true)
      "${DOCKER[@]}" stop "$name" >/dev/null || { print_promotion_recovery "$i" stop "$old_image"; exit 1; }
      "${DOCKER[@]}" rm "$name" >/dev/null || { print_promotion_recovery "$i" rm "$old_image"; exit 1; }
    fi
    "${DOCKER[@]}" rename "$cand" "$name" || { print_promotion_recovery "$i" rename "$old_image"; exit 1; }
    "${DOCKER[@]}" start "$name" >/dev/null || { print_promotion_recovery "$i" start "$old_image"; exit 1; }
    log "started $name"
  done
}

case "${1:-help}" in
  build)
    log "Building Docker images..."
    cd "$PROJECT_DIR"
    git pull origin main || {
      error "git pull failed. After the DB runbook step 0b, $PROJECT_DIR is not pull-able until a follow-up reconciles it to main (deploy/oci/db/README.md, '~/flowmate after step 0b (deferred)'). Do not stash, commit -a or discard the guarded deploy/oci/deploy.sh; redeploy the running images with restart + explicit *_IMAGE refs instead."
      exit 1
    }

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
