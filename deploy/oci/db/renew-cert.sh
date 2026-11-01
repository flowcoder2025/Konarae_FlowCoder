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
# pgbouncer/tls (uid 70, 600). Then, on EVERY run: compare the certificate actually
# served on 6432 with the current one; if it differs, SIGHUP PgBouncer, and if that
# does not help, restart it. Alert when the served certificate expires in < 14 days
# or PgBouncer is not running. Every network probe runs under `timeout` (a hang is an
# alerted failure) and a watchdog bounds the whole run (FLOWMATE_RENEW_MAX_SECONDS, 1200 s).
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
MIN_DAYS=${FLOWMATE_CERT_MIN_DAYS:-14}   # alert when the SERVED cert expires sooner
PROBE_ADDR=${FLOWMATE_CERT_PROBE_ADDR:-127.0.0.1:6432}
PROBE_TIMEOUT=${FLOWMATE_CERT_PROBE_TIMEOUT:-15}      # seconds per TLS probe
CERTBOT_TIMEOUT=${FLOWMATE_CERTBOT_TIMEOUT:-600}      # seconds for the certbot container
MAX_SECONDS=${FLOWMATE_RENEW_MAX_SECONDS:-1200}       # whole run
certbot_name="flowmate-certbot-$$"

fail() {
  trap - ERR
  log "renew-cert FAILED: $1"
  alert "[FlowMate DB] certificate renewal failed for $DOMAIN on $(hostname -s): $1"
  exit 1
}
trap 'fail "unexpected error at line $LINENO"' ERR

# Whole-run bound: a watchdog alerts and stops the script (and a stuck certbot container).
main_pid=$$
(
  trap - ERR
  set +e
  trap 'kill "$s" 2>/dev/null; exit 0' TERM
  sleep "$MAX_SECONDS" &
  s=$!
  wait "$s" || exit 0
  log "renew-cert FAILED: run exceeded ${MAX_SECONDS}s"
  alert "[FlowMate DB] certificate renewal for $DOMAIN on $(hostname -s) exceeded ${MAX_SECONDS}s and was stopped"
  docker rm -f "$certbot_name" >/dev/null 2>&1
  kill -TERM "$main_pid" 2>/dev/null
) &
watchdog_pid=$!
on_exit() {
  kill "$watchdog_pid" 2>/dev/null || true
  docker rm -f "$certbot_name" >/dev/null 2>&1 || true
}
trap on_exit EXIT

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
timeout --kill-after=10 "$CERTBOT_TIMEOUT" docker run --rm --name "$certbot_name" --user "$(id -u):$(id -g)" \
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
  ${extra[@]+"${extra[@]}"} || {
  rc=$?
  [ "$rc" = 124 ] && fail "certbot timed out after ${CERTBOT_TIMEOUT}s"
  fail "certbot failed (exit $rc, see $LE_DIR/logs)"
}

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
  log "certificate files unchanged ($(openssl x509 -in "$cert" -noout -enddate))"
else
  sudo -n install -d -o "$PGB_UID" -g "$PGB_UID" -m 700 "$TLS_DIR"
  sudo_write_file "$PGB_UID" 600 "$TLS_DIR/privkey.pem" <"$key"
  sudo_write_file "$PGB_UID" 600 "$TLS_DIR/fullchain.pem" <"$cert"
  log "installed new certificate files ($(openssl x509 -in "$cert" -noout -enddate))"
fi

if [ "${FLOWMATE_CERT_INSTALL_ONLY:-0}" = 1 ]; then
  log "install-only mode (first install, PgBouncer not started yet)"
  exit 0
fi

# Every run, files changed or not: what does 6432 actually serve? Every probe is bounded by
# `timeout`; a timeout is a failure (alert), never a reason to restart PgBouncer.
probe_file=$(mktemp)
trap 'on_exit; rm -f -- "$probe_file"' EXIT
probe() { # writes the served leaf certificate (PEM) to $probe_file
  local out rc=0
  out=$(timeout --kill-after=5 "$PROBE_TIMEOUT" openssl s_client -starttls postgres -connect "$PROBE_ADDR" \
    -servername "$DOMAIN" </dev/null 2>/dev/null) || rc=$?
  [ "$rc" = 124 ] || [ "$rc" = 137 ] && fail "TLS probe of $PROBE_ADDR timed out after ${PROBE_TIMEOUT}s"
  openssl x509 <<<"$out" >"$probe_file" 2>/dev/null || : >"$probe_file"
}
fingerprint() { openssl x509 -noout -fingerprint -sha256 2>/dev/null || true; }

container_running "$PGB_CONTAINER" || fail "$PGB_CONTAINER is not running (6432 serves nothing)"
want=$(fingerprint <"$cert")
probe
if [ "$(fingerprint <"$probe_file")" != "$want" ]; then
  log "6432 serves a different certificate than $cert -> SIGHUP $PGB_CONTAINER"
  timeout 30 docker kill -s HUP "$PGB_CONTAINER" >/dev/null || fail "SIGHUP to $PGB_CONTAINER failed"
  sleep 2
  probe
  if [ "$(fingerprint <"$probe_file")" != "$want" ]; then
    log "SIGHUP did not switch the served certificate -> restarting $PGB_CONTAINER"
    timeout 90 docker restart "$PGB_CONTAINER" >/dev/null || fail "restart of $PGB_CONTAINER failed or timed out"
    sleep 3
    probe
  fi
  [ "$(fingerprint <"$probe_file")" = "$want" ] || fail "PgBouncer does not serve the current certificate"
  log "PgBouncer now serves the current certificate"
fi

[ -s "$probe_file" ] || fail "could not read the certificate served on $PROBE_ADDR"
enddate=$(openssl x509 -noout -enddate <"$probe_file" | cut -d= -f2)
if ! openssl x509 -noout -checkend $((MIN_DAYS * 86400)) <"$probe_file" >/dev/null; then
  fail "served certificate expires in less than $MIN_DAYS days ($enddate)"
fi
log "6432 serves the current certificate, valid until $enddate"
