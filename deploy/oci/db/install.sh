#!/usr/bin/env bash
# Install / re-apply the FlowMate DB stack on the OCI VM. Idempotent; safe to rerun.
#
#   rsync -a --exclude mini/ deploy/oci/db/ oci:flowmate-db/     # from a checkout (never --delete)
#   ssh oci /home/ubuntu/flowmate-db/install.sh
#
# Steps: dirs/perms -> .env (generate once) -> superuser pw file -> TLS cert
# (renew-cert.sh) -> render pgbouncer.ini + pgbouncer_hba.conf + userlist.txt
# -> compose up -> roles.sql
# -> locale check -> ufw 6432 -> cron -> login self-test.
# Env: FLOWMATE_ROTATE_PASSWORDS=1 re-sets role passwords from .env (then restart pgbouncer).
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PYTHONUTF8=1 PYTHONIOENCODING=utf-8
set -Eeuo pipefail
umask 077
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

[ "$(id -un)" = "ubuntu" ] || die "run as ubuntu (not root)"
[ "$SCRIPT_DIR" = "$FLOWMATE_DB_HOME" ] || die "run the deployed copy: $FLOWMATE_DB_HOME/install.sh"
sudo -n true 2>/dev/null || die "passwordless sudo required"
command -v docker >/dev/null || die "docker missing"
cd "$FLOWMATE_DB_HOME"
exec 8>"$FLOWMATE_DB_HOME/.admin.lock"
flock -n 8 || die "another install.sh/restore.sh is running"
# Private scratch dir (holds the rendered userlist.txt with the pgbouncer_auth password).
INSTALL_TMP=$(mktemp -d)
trap 'rm -rf -- "$INSTALL_TMP"' EXIT
# The Telegram bot token used by every alert must not be readable by other local accounts.
require_private_file "$TELEGRAM_ENV_FILE"

# --- 1. directories ----------------------------------------------------------
chmod 750 "$FLOWMATE_DB_HOME"
install -d -m 700 "$FLOWMATE_DB_HOME/secrets" "$FLOWMATE_DB_HOME/letsencrypt" "$FLOWMATE_BACKUP_DIR"
chmod 700 "$FLOWMATE_BACKUP_DIR"
[ -d "$FLOWMATE_DB_HOME/data" ] || install -d -m 700 "$FLOWMATE_DB_HOME/data"   # entrypoint chowns to 999
sudo -n install -d -o "$PGB_UID" -g "$PGB_UID" -m 700 "$FLOWMATE_DB_HOME/pgbouncer" "$FLOWMATE_DB_HOME/pgbouncer/tls"
chmod 644 postgres/postgresql.conf postgres/pg_hba.conf postgres/conf.d/*.conf roles.sql row-counts.sql privileges-check.sql
chmod 755 postgres postgres/conf.d

# --- 2. secrets (.env) -------------------------------------------------------
SECRET_KEYS=(POSTGRES_SUPERUSER_PASSWORD FLOWMATE_OWNER_PASSWORD FLOWMATE_APP_PASSWORD PGBOUNCER_AUTH_PASSWORD)
if [ ! -e "$FLOWMATE_ENV_FILE" ]; then
  log "generating $FLOWMATE_ENV_FILE (values are never printed)"
  {
    printf '# FlowMate DB secrets, generated %s by install.sh. Never commit or print.\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    for k in "${SECRET_KEYS[@]}"; do printf '%s=%s\n' "$k" "$(openssl rand -hex 32)"; done
  } >"$FLOWMATE_ENV_FILE.tmp"
  mv "$FLOWMATE_ENV_FILE.tmp" "$FLOWMATE_ENV_FILE"
fi
chmod 600 "$FLOWMATE_ENV_FILE"
for k in "${SECRET_KEYS[@]}"; do secret_get "$k" >/dev/null; done

# Superuser password file: only used by the image entrypoint at first initdb.
if ! sudo -n test -s "$FLOWMATE_DB_HOME/secrets/postgres_password"; then
  secret_get POSTGRES_SUPERUSER_PASSWORD | sudo_write_file "$PG_UID" 600 "$FLOWMATE_DB_HOME/secrets/postgres_password"
fi

# --- 3. TLS certificate --------------------------------------------------------
if ! sudo -n test -s "$FLOWMATE_DB_HOME/pgbouncer/tls/fullchain.pem"; then
  log "no TLS certificate installed yet -> renew-cert.sh"
  FLOWMATE_CERT_INSTALL_ONLY=1 "$SCRIPT_DIR/renew-cert.sh"
fi

# --- 4. render pgbouncer.ini + userlist.txt -----------------------------------
num_opt() {
  local v
  v=$(env_get_opt "$1" "$2")
  [[ $v =~ ^[0-9]{1,5}$ ]] || die "$1 must be an integer"
  printf '%s' "$v"
}
max_client_conn=$(num_opt PGBOUNCER_MAX_CLIENT_CONN 500)
default_pool_size=$(num_opt PGBOUNCER_DEFAULT_POOL_SIZE 15)
max_db_connections=$(num_opt PGBOUNCER_MAX_DB_CONNECTIONS 30)
rendered=$(sed \
  -e "s/@FLOWMATE_DB_IP@/$FLOWMATE_DB_IP/g" \
  -e "s/@MAX_CLIENT_CONN@/$max_client_conn/g" \
  -e "s/@DEFAULT_POOL_SIZE@/$default_pool_size/g" \
  -e "s/@MAX_DB_CONNECTIONS@/$max_db_connections/g" \
  "$SCRIPT_DIR/pgbouncer.ini.template")
if grep -qE '@[A-Z_]+@' <<<"$rendered"; then die "unrendered placeholder in pgbouncer.ini"; fi

pgb_changed=0
# Must run in THIS shell (redirect, not a pipe): a pipeline would run it in a subshell and
# lose pgb_changed=1, leaving PgBouncer on its old config.
write_if_changed() { # DEST (content on stdin)
  local dest=$1 tmp="$INSTALL_TMP/write_if_changed"
  cat >"$tmp"
  if sudo -n cmp -s "$tmp" "$dest" 2>/dev/null; then
    rm -f -- "$tmp"
    return 0
  fi
  sudo_write_file "$PGB_UID" 600 "$dest" <"$tmp"
  rm -f -- "$tmp"
  pgb_changed=1
  log "updated $dest"
}
write_if_changed "$FLOWMATE_DB_HOME/pgbouncer/pgbouncer.ini" < <(printf '%s\n' "$rendered")
write_if_changed "$FLOWMATE_DB_HOME/pgbouncer/pgbouncer_hba.conf" <"$SCRIPT_DIR/pgbouncer_hba.conf"
# auth_user's own server login needs the plaintext password (SCRAM verifiers in
# auth_file only work for client auth). App users are NOT listed (auth_query).
auth_pw=$(secret_get PGBOUNCER_AUTH_PASSWORD)
write_if_changed "$FLOWMATE_DB_HOME/pgbouncer/userlist.txt" < <(printf '"pgbouncer_auth" "%s"\n' "$auth_pw")
unset auth_pw

# --- 5. containers -------------------------------------------------------------
docker compose -f "$FLOWMATE_DB_HOME/docker-compose.yml" up -d --wait --wait-timeout 300
wait_db_healthy
# Config dir is a bind mount: edits to postgresql.conf / conf.d / pg_hba.conf need a reload.
db_psql -d postgres -At -c "SELECT pg_reload_conf()" >/dev/null
sleep 1
for setting in log_parameter_max_length log_parameter_max_length_on_error log_statement; do
  want=0; [ "$setting" = log_statement ] && want=none
  got=$(db_psql -d postgres -At -c "SHOW $setting")
  [ "$got" = "$want" ] || die "$setting is '$got', expected '$want'"
done
log "postgres config reloaded (log_parameter_max_length*=0, log_statement=none)"

# --- 6. roles / privileges / auth function -------------------------------------
apply_roles
check_privileges flowmate || die "privilege check failed"
if [ "$pgb_changed" = 1 ] || [ "${FLOWMATE_ROTATE_PASSWORDS:-0}" = 1 ]; then
  log "pgbouncer config changed -> restart $PGB_CONTAINER"
  docker restart "$PGB_CONTAINER" >/dev/null
fi

# --- 7. locale: ICU en-US like the Supabase source. 153.128 = ICU 76 (trixie image),
#        which reproduces Supabase's ordering (see docker-compose.yml) ------------
locale_row=$(db_psql -d postgres -At -F '|' -c \
  "SELECT datlocprovider, datlocale, datcollate, datctype, datcollversion, pg_encoding_to_char(encoding) FROM pg_database WHERE datname = 'flowmate'")
log "flowmate locale: $locale_row"
[ "$locale_row" = "i|en-US|en_US.UTF-8|en_US.UTF-8|153.128|UTF8" ] ||
  die "locale/collation mismatch (expected i|en-US|en_US.UTF-8|en_US.UTF-8|153.128|UTF8)"

# --- 8. firewall -----------------------------------------------------------------
# Docker-published ports bypass ufw anyway; the rule documents intent. 5432/5433 stay closed.
sudo -n ufw allow 6432/tcp comment 'flowmate pgbouncer TLS' >/dev/null

# --- 9. cron: /etc/cron.d/flowmate-db (host TZ is Asia/Seoul) ------------------------
# A system cron file instead of the user crontab: rewriting the user crontab after a
# transient `crontab -l` failure could drop unrelated jobs (healthcheck.sh).
cron_file=/etc/cron.d/flowmate-db
cat >"$INSTALL_TMP/cron" <<CRON
# FlowMate DB jobs. Managed by $FLOWMATE_DB_HOME/install.sh, do not edit by hand.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
HOME=$HOME
0 4 * * * ubuntu $FLOWMATE_DB_HOME/backup.sh >> $FLOWMATE_BACKUP_DIR/backup.log 2>&1
30 4 1 * * ubuntu $FLOWMATE_DB_HOME/verify-restore.sh --latest >> $FLOWMATE_BACKUP_DIR/verify-cron.log 2>&1
17 3 * * * ubuntu $FLOWMATE_DB_HOME/renew-cert.sh >> $FLOWMATE_DB_HOME/letsencrypt/renew.log 2>&1
CRON
if ! sudo -n cmp -s "$INSTALL_TMP/cron" "$cron_file" 2>/dev/null; then
  sudo_write_file 0 644 "$cron_file" <"$INSTALL_TMP/cron"
  log "installed $cron_file"
fi
# One-time migration: drop our tagged lines from the user crontab, keep everything else.
if user_cron=$(crontab -l 2>"$INSTALL_TMP/crontab.err"); then
  if grep -q '# flowmate-db:' <<<"$user_cron"; then
    keep=$(grep -v '# flowmate-db:' <<<"$user_cron" || true)
    printf '%s\n' "$keep" | crontab -
    [ "$(crontab -l | grep -vc '# flowmate-db:')" = "$(grep -vc '# flowmate-db:' <<<"$user_cron")" ] ||
      die "user crontab changed unexpectedly while removing flowmate-db lines; check crontab -l"
    log "removed flowmate-db lines from the user crontab ($(grep -c . <<<"$keep") other lines kept)"
  fi
else
  grep -q 'no crontab for' "$INSTALL_TMP/crontab.err" || die "crontab -l failed: $(head -c 200 "$INSTALL_TMP/crontab.err")"
fi
log "cron: $(grep -cE '^[0-9*]' "$INSTALL_TMP/cron") jobs in $cron_file"

# --- 10. self-test: owner via loopback 5433, app via PgBouncer TLS (verify-full) -----
image=$(db_image)
FLOWMATE_OWNER_PASSWORD=$(secret_get FLOWMATE_OWNER_PASSWORD) \
  docker run --rm --network host -e FLOWMATE_OWNER_PASSWORD "$image" \
  sh -c 'PGPASSWORD=$FLOWMATE_OWNER_PASSWORD exec psql -X -At "host=127.0.0.1 port=5433 user=flowmate_owner dbname=flowmate sslmode=disable connect_timeout=10" -c "SELECT current_user"' |
  grep -qx flowmate_owner || die "self-test: flowmate_owner login via 127.0.0.1:5433 failed"
FLOWMATE_APP_PASSWORD=$(secret_get FLOWMATE_APP_PASSWORD) \
  docker run --rm --network host -e FLOWMATE_APP_PASSWORD \
  -v /etc/ssl/certs/ca-certificates.crt:/etc/ssl/certs/ca-certificates.crt:ro "$image" \
  sh -c "PGPASSWORD=\$FLOWMATE_APP_PASSWORD exec psql -X -At \"host=$FLOWMATE_DB_DOMAIN hostaddr=127.0.0.1 port=6432 user=flowmate_app dbname=flowmate sslmode=verify-full sslrootcert=/etc/ssl/certs/ca-certificates.crt connect_timeout=10\" -c 'SELECT current_user'" |
  grep -qx flowmate_app || die "self-test: flowmate_app login via pgbouncer (TLS verify-full) failed"
log "install ok: db healthy, roles applied, owner@5433 and app@6432 logins verified"
