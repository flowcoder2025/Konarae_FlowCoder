# shellcheck shell=bash
# Shared helpers for the FlowMate DB scripts. Sourced, not executed.
# Rule: never print secret values. Secrets are read from $FLOWMATE_ENV_FILE with
# env_get and handed to child processes through the environment, never argv.

# shellcheck disable=SC2034  # constants are used by the sourcing scripts
shopt -s inherit_errexit

FLOWMATE_DB_HOME=${FLOWMATE_DB_HOME:-/home/ubuntu/flowmate-db}
FLOWMATE_ENV_FILE=${FLOWMATE_ENV_FILE:-$FLOWMATE_DB_HOME/.env}
FLOWMATE_BACKUP_DIR=${FLOWMATE_BACKUP_DIR:-$HOME/backup/flowmate-db}
FLOWMATE_DB_DOMAIN=${FLOWMATE_DB_DOMAIN:-db.jerome87.com}
DB_CONTAINER=flowmate-db
PGB_CONTAINER=flowmate-pgbouncer
FLOWMATE_DB_IP=172.21.0.2      # must match docker-compose.yml / pg_hba.conf
PG_UID=999     # postgres user in pgvector/pgvector (Debian)
PGB_UID=70     # postgres user in edoburu/pgbouncer (Alpine)
TELEGRAM_ENV_FILE=${TELEGRAM_ENV_FILE:-$HOME/healthcheck.env}

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# Telegram alert via the existing healthcheck.sh bot. The token goes to curl via a
# config on stdin (not argv). Messages must never contain secrets.
alert() {
  local msg=$1
  (
    set +u
    # shellcheck disable=SC1090
    [ -r "$TELEGRAM_ENV_FILE" ] && . "$TELEGRAM_ENV_FILE"
    if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
      log "alert: telegram not configured ($TELEGRAM_ENV_FILE)"
      exit 1
    fi
    printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$TELEGRAM_BOT_TOKEN" |
      curl -sf -m 20 -K - -X POST -d "chat_id=${TELEGRAM_CHAT_ID}" --data-urlencode "text=$msg" >/dev/null
  ) || log "alert: telegram send failed"
}

# env_get KEY -> value of KEY from the .env file (KEY=value lines, no quoting).
env_get() {
  local key=$1 line
  [ -r "$FLOWMATE_ENV_FILE" ] || die "missing $FLOWMATE_ENV_FILE"
  line=$(grep -E "^${key}=" "$FLOWMATE_ENV_FILE" | tail -n 1) || true
  [ -n "$line" ] || die "$key missing in $FLOWMATE_ENV_FILE"
  printf '%s' "${line#*=}"
}

# env_get_opt KEY DEFAULT -> value of KEY, or DEFAULT when absent.
env_get_opt() {
  local key=$1 default=$2 line
  line=$(grep -E "^${key}=" "$FLOWMATE_ENV_FILE" 2>/dev/null | tail -n 1) || true
  if [ -n "$line" ]; then printf '%s' "${line#*=}"; else printf '%s' "$default"; fi
}

# sudo_write_file OWNER_UID MODE DEST  (content on stdin; atomic within DEST's dir)
sudo_write_file() {
  local owner=$1 mode=$2 dest=$3 tmp
  tmp="$(dirname -- "$dest")/.$(basename -- "$dest").tmp.$$"
  sudo -n sh -c 'umask 077 && cat > "$1"' sh "$tmp"
  sudo -n chown "$owner:$owner" "$tmp"
  sudo -n chmod "$mode" "$tmp"
  sudo -n mv -f "$tmp" "$dest"
}

# Secrets go into connection strings, so they must be URL-safe.
is_valid_secret() { [[ $1 =~ ^[A-Za-z0-9_-]{32,128}$ ]]; }

secret_get() {
  local key=$1 value
  value=$(env_get "$key")
  is_valid_secret "$value" || die "$key in $FLOWMATE_ENV_FILE must match [A-Za-z0-9_-]{32,128}"
  printf '%s' "$value"
}

container_running() {
  [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null || true)" = "true" ]
}

wait_db_healthy() {
  local status=""
  for _ in $(seq 1 60); do
    status=$(docker inspect -f '{{.State.Health.Status}}' "$DB_CONTAINER" 2>/dev/null || true)
    [ "$status" = "healthy" ] && return 0
    sleep 2
  done
  die "$DB_CONTAINER not healthy (last status: ${status:-none})"
}

# psql as the postgres superuser over the container's local socket (peer auth).
db_psql() {
  docker exec -i -u postgres "$DB_CONTAINER" psql -X -q -v ON_ERROR_STOP=1 "$@"
}

# Apply roles.sql (idempotent). Set FLOWMATE_ROTATE_PASSWORDS=1 to re-set passwords.
apply_roles() {
  local owner app auth
  owner=$(secret_get FLOWMATE_OWNER_PASSWORD)
  app=$(secret_get FLOWMATE_APP_PASSWORD)
  auth=$(secret_get PGBOUNCER_AUTH_PASSWORD)
  FLOWMATE_OWNER_PASSWORD=$owner \
  FLOWMATE_APP_PASSWORD=$app \
  PGBOUNCER_AUTH_PASSWORD=$auth \
  FLOWMATE_ROTATE_PASSWORDS=${FLOWMATE_ROTATE_PASSWORDS:-0} \
    docker exec -i -u postgres \
      -e FLOWMATE_OWNER_PASSWORD -e FLOWMATE_APP_PASSWORD -e PGBOUNCER_AUTH_PASSWORD \
      -e FLOWMATE_ROTATE_PASSWORDS \
      "$DB_CONTAINER" psql -X -q -v ON_ERROR_STOP=1 -d flowmate -f - <"$FLOWMATE_DB_HOME/roles.sql"
}

# Image reference of the running db container (verify-restore uses the same one).
db_image() { docker inspect -f '{{.Config.Image}}' "$DB_CONTAINER"; }

db_initdb_args() {
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$DB_CONTAINER" |
    sed -n 's/^POSTGRES_INITDB_ARGS=//p'
}
