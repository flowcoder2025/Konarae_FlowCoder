#!/usr/bin/env bash
# Issue / renew the db.jerome87.com certificate (Let's Encrypt, DNS-01 via the
# Cloudflare API) and install it for PgBouncer. Daily cron; Telegram on failure.
#
#   renew-cert.sh             # issue if missing, renew when < 30 days left
#   renew-cert.sh --dry-run   # staging dry run, installs nothing
#   renew-cert.sh --force     # renew now (key change / incident rotation)
#
# certbot runs in a pinned container as the calling user (no root-owned files);
# its state lives in ~/flowmate-db/letsencrypt/{config,work,logs}. The Cloudflare
# token file (~/.secrets/cloudflare.ini, 600) is mounted read-only.
# ACME account is registered without an email (no PII sent; expiry is covered by
# this daily job + the alert).
# RSA key on purpose: Let's Encrypt RSA chains end at ISRG Root X1, the most widely
# trusted LE root. The ECDSA chain ends at ISRG Root X2, which older client trust
# stores (serverless runtimes, bundled CA lists) may lack.
# When the issued cert differs from the installed one: copy cert+key into
# pgbouncer/tls (uid 70, 600), SIGHUP PgBouncer, confirm the served certificate
# changed; if not, restart PgBouncer and confirm again.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PYTHONUTF8=1 PYTHONIOENCODING=utf-8
set -Eeuo pipefail
umask 077
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

CERTBOT_IMAGE=certbot/dns-cloudflare:v5.8.0@sha256:c45edb002b883da1a1235abb205dff474a7a1a459d878e8d5fdc7f9d83073aea
CF_INI=${CLOUDFLARE_INI:-$HOME/.secrets/cloudflare.ini}
LE_DIR=$FLOWMATE_DB_HOME/letsencrypt
TLS_DIR=$FLOWMATE_DB_HOME/pgbouncer/tls
DOMAIN=$FLOWMATE_DB_DOMAIN

fail() {
  trap - ERR
  log "renew-cert FAILED: $1"
  alert "[FlowMate DB] certificate renewal failed for $DOMAIN on $(hostname -s): $1"
  exit 1
}
trap 'fail "unexpected error at line $LINENO"' ERR

extra=()
case "${1:-}" in
  "") ;;
  --dry-run) extra=(--dry-run) ;;
  --force) extra=(--force-renewal) ;;
  *) echo "usage: $0 [--dry-run|--force]" >&2; exit 2 ;;
esac

[ -r "$CF_INI" ] || fail "Cloudflare credentials $CF_INI not readable"
[ "$(stat -c %a "$CF_INI")" = "600" ] || fail "$CF_INI must be mode 600"
install -d -m 700 "$LE_DIR" "$LE_DIR/config" "$LE_DIR/work" "$LE_DIR/logs"
exec 9>"$LE_DIR/.renew.lock"
flock -n 9 || fail "another renewal is running"

log "certbot certonly $DOMAIN ${extra[*]:-}"
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$LE_DIR/config:/etc/letsencrypt" \
  -v "$LE_DIR/work:/var/lib/letsencrypt" \
  -v "$LE_DIR/logs:/var/log/letsencrypt" \
  -v "$CF_INI:/run/secrets/cloudflare.ini:ro" \
  "$CERTBOT_IMAGE" certonly \
  --non-interactive --agree-tos --register-unsafely-without-email \
  --dns-cloudflare --dns-cloudflare-credentials /run/secrets/cloudflare.ini \
  --dns-cloudflare-propagation-seconds 30 \
  --key-type rsa --rsa-key-size 2048 \
  --keep-until-expiring --max-log-backups 30 \
  --cert-name "$DOMAIN" -d "$DOMAIN" \
  ${extra[@]+"${extra[@]}"} || fail "certbot failed (see $LE_DIR/logs)"

if [ "${extra[*]:-}" = "--dry-run" ]; then
  log "dry run ok"
  exit 0
fi

live="$LE_DIR/config/live/$DOMAIN"
cert="$live/fullchain.pem"
key="$live/privkey.pem"
[ -s "$cert" ] && [ -s "$key" ] || fail "certbot produced no certificate in $live"
checkhost=$(openssl x509 -in "$cert" -noout -checkhost "$DOMAIN")
[[ $checkhost == *"does match"* ]] || fail "certificate does not cover $DOMAIN"
[ "$(openssl x509 -in "$cert" -noout -pubkey | sha256sum)" = "$(openssl pkey -in "$key" -pubout | sha256sum)" ] ||
  fail "certificate and key do not match"

if sudo -n cmp -s "$cert" "$TLS_DIR/fullchain.pem" && sudo -n cmp -s "$key" "$TLS_DIR/privkey.pem"; then
  log "certificate unchanged ($(openssl x509 -in "$cert" -noout -enddate))"
  exit 0
fi

sudo -n install -d -o "$PGB_UID" -g "$PGB_UID" -m 700 "$TLS_DIR"
sudo_write_file "$PGB_UID" 600 "$TLS_DIR/privkey.pem" <"$key"
sudo_write_file "$PGB_UID" 600 "$TLS_DIR/fullchain.pem" <"$cert"
log "installed new certificate ($(openssl x509 -in "$cert" -noout -enddate))"

served_fingerprint() {
  { openssl s_client -starttls postgres -connect 127.0.0.1:6432 -servername "$DOMAIN" </dev/null 2>/dev/null || true; } |
    openssl x509 -noout -fingerprint -sha256 2>/dev/null || true
}

if container_running "$PGB_CONTAINER"; then
  want=$(openssl x509 -in "$cert" -noout -fingerprint -sha256)
  docker kill -s HUP "$PGB_CONTAINER" >/dev/null
  sleep 2
  if [ "$(served_fingerprint)" != "$want" ]; then
    log "SIGHUP did not switch the served certificate -> restarting $PGB_CONTAINER"
    docker restart "$PGB_CONTAINER" >/dev/null
    sleep 3
  fi
  [ "$(served_fingerprint)" = "$want" ] || fail "PgBouncer does not serve the new certificate"
  log "PgBouncer serves the new certificate"
else
  log "$PGB_CONTAINER not running; certificate will be used on start"
fi
