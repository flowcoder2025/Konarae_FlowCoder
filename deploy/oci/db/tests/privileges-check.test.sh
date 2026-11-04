#!/usr/bin/env bash
# Regression test for privileges-check.sql against a throwaway Postgres container
# (--network none, removed with its volume). Needs docker and the flowmate-db image.
# The probe tables below exist only in that container (test fixtures, not schema).
#
#   bash deploy/oci/db/tests/privileges-check.test.sh [IMAGE]   # default: image of flowmate-db
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PYTHONUTF8=1 PYTHONIOENCODING=utf-8
set -euo pipefail
DB_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
image=${1:-$(docker container inspect -f '{{.Config.Image}}' flowmate-db)}
name="flowmate-privtest-$$"
trap 'docker rm -f -v "$name" >/dev/null 2>&1 || true' EXIT

POSTGRES_PASSWORD=$(openssl rand -hex 16) docker run -d --name "$name" --network none \
  -e POSTGRES_PASSWORD -e POSTGRES_DB=flowmate "$image" >/dev/null
for _ in $(seq 1 60); do
  docker logs "$name" 2>&1 | grep -q 'PostgreSQL init process complete' &&
    docker exec "$name" pg_isready -q -U postgres -d flowmate && break
  sleep 1
done
psql_c() { docker exec -i -u postgres "$name" psql -X -q -At -v ON_ERROR_STOP=1 -d flowmate "$@"; }
check() { psql_c -f - <"$DB_DIR/privileges-check.sql"; }

pw=$(openssl rand -hex 32)
FLOWMATE_OWNER_PASSWORD=$pw FLOWMATE_APP_PASSWORD=$pw PGBOUNCER_AUTH_PASSWORD=$pw \
  docker exec -i -u postgres -e FLOWMATE_OWNER_PASSWORD -e FLOWMATE_APP_PASSWORD -e PGBOUNCER_AUTH_PASSWORD \
  "$name" psql -X -q -v ON_ERROR_STOP=1 -d flowmate -f - <"$DB_DIR/roles.sql" >/dev/null

pass=0
fail=0
expect() { # LABEL EXPECTED_OUTPUT
  local got
  got=$(check | sort)
  if [ "$got" = "$2" ]; then echo "ok   $1"; pass=$((pass + 1)); else
    echo "FAIL $1"; printf '  expected: %s\n  got:      %s\n' "${2:-<none>}" "${got:-<none>}"; fail=$((fail + 1)); fi
}

psql_c -c "SET ROLE flowmate_owner" -c "CREATE TABLE probe_ok (id int)" -c "CREATE TABLE probe_sel (id int)"
expect "default privileges: no violations" ""

psql_c -c "REVOKE INSERT, UPDATE, DELETE ON probe_sel FROM flowmate_app"
expect "SELECT-only grant fails the check" "$(printf '%s\n' 'flowmate_app lacks DELETE on probe_sel' 'flowmate_app lacks INSERT on probe_sel' 'flowmate_app lacks UPDATE on probe_sel' | sort)"

psql_c -c "GRANT INSERT, UPDATE, DELETE ON probe_sel TO flowmate_app" -c "GRANT TRUNCATE ON probe_ok TO flowmate_app"
expect "extra TRUNCATE grant fails the check" "flowmate_app has TRUNCATE on probe_ok"

psql_c -c "REVOKE TRUNCATE ON probe_ok FROM flowmate_app" -c "CREATE TABLE probe_super (id int)"
expect "table owned by postgres fails the check" "$(printf '%s\n' 'flowmate_app lacks DELETE on probe_super' 'flowmate_app lacks INSERT on probe_super' 'flowmate_app lacks SELECT on probe_super' 'flowmate_app lacks UPDATE on probe_super' 'table not owned by flowmate_owner: probe_super (owner postgres)' | sort)"

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
