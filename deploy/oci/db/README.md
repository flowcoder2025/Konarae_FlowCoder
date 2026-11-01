# FlowMate DB on OCI (Postgres 17 + PgBouncer)

Phase 1A of `tasks/renewal-plan-2026-10.md`: the production database moves from Supabase to a
self-hosted Postgres 17 (pgvector) on the OCI VM. This directory is the source of truth; the
deployed copy lives in `/home/ubuntu/flowmate-db/` on OCI.

```
Vercel (icn1) ──TLS──▶ db.jerome87.com:6432  flowmate-pgbouncer (172.21.0.3) ─┐
OCI workers (after cutover) ── docker network flowmate ──────────────────────┼─▶ flowmate-db (172.21.0.2:5432)
Admin (Mini/MBP) ── ssh -L 5433:127.0.0.1:5433 oci ──▶ 127.0.0.1:5433 ───────┘    no public port
```

## Files

| File | Purpose |
|---|---|
| `docker-compose.yml` | `flowmate-db` + `flowmate-pgbouncer`, network `flowmate` (172.21.0.0/24, gw .1, dynamic range .128/25) |
| `postgres/postgresql.conf`, `postgres/conf.d/flowmate.conf` | main config (via `-c config_file`), tuning/logging in `conf.d` |
| `postgres/pg_hba.conf` | who may connect from where (see below) |
| `pgbouncer.ini.template`, `pgbouncer_hba.conf` | PgBouncer config (rendered by `install.sh`) and client HBA |
| `roles.sql` | roles, privileges, `pgbouncer.get_auth()` (no table DDL) |
| `row-counts.sql` | exact row count per `public` table; shared by the shell scripts and `scripts/db/compare-row-counts.ts` |
| `common.sh` | shared shell helpers (env/secret reading, Telegram alert, `apply_roles`) |
| `install.sh` | idempotent install / re-apply |
| `restore.sh` | restore a dump into `flowmate` |
| `backup.sh` | daily dump + row-count manifest + sha256 |
| `verify-restore.sh` | restore a backup into a throwaway container and compare counts |
| `renew-cert.sh` | Let's Encrypt cert for `db.jerome87.com` via Cloudflare DNS-01 |
| `mini/` | Mini-side pull of backups (launchd) |
| `.env.example` | secret names (values only in `/home/ubuntu/flowmate-db/.env`, 600) |

Pinned images (tag + multi-arch index digest, see `docker-compose.yml` / `renew-cert.sh`):

- `pgvector/pgvector:0.8.7-pg17-trixie` — PostgreSQL 17.11, pgvector 0.8.7, libicu76.
  **Must stay on trixie.** A restore of the Supabase dump showed `ORDER BY name` on
  `"SupportProject"` is byte-identical to Supabase only with ICU 76 (bookworm/ICU 72 orders
  U+2018 vs U+0027 differently). Supabase reports `datcollversion=153.120`; this cluster
  records `153.128`. The behaviour matches; the version string does not.
- `edoburu/pgbouncer:v1.26.1-p0` — PgBouncer 1.26.1 (runs as uid 70).
- `certbot/dns-cloudflare:v5.8.0`.

## Security model

- **Public port 6432 (PgBouncer) only**, TLS required (`client_tls_sslmode=require`, TLS 1.2+).
  Docker-published ports bypass ufw, so the DB itself is published only on `127.0.0.1:5433`.
- PgBouncer `auth_type = hba` + `pgbouncer_hba.conf`: only `flowmate_app` → `flowmate` over
  `hostssl` with SCRAM; everything else is rejected. (Without it, `pgbouncer_auth`, which must be in
  `userlist.txt` in plaintext for its own server login, could log in on 6432.)
- `flowmate_app`'s SCRAM verifier comes from `auth_query` → `pgbouncer.get_auth()`
  (SECURITY DEFINER, `search_path=pg_catalog`, own schema, EXECUTE only for `pgbouncer_auth`), which
  returns a row **only** for `flowmate_app`. `postgres` / `flowmate_owner` are unknown to PgBouncer.
- `pg_hba.conf`: `postgres` = local socket (peer) only; `pgbouncer_auth` only from 172.21.0.3;
  `flowmate_owner` only from 172.21.0.1 (the docker gateway — how `127.0.0.1:5433` connections
  arrive through docker-proxy, verified with `inet_client_addr()`); `flowmate_app` from 172.21.0.0/24;
  everything else rejected (v4 and v6). All TCP lines `scram-sha-256`.
- `flowmate_app`: CONNECT, USAGE on `public`, SELECT/INSERT/UPDATE/DELETE on tables,
  USAGE/SELECT/UPDATE on sequences, default privileges for future `flowmate_owner` objects. No
  CREATE/TEMP/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN, not an owner (no DROP/ALTER).
  `statement_timeout=120s` (same as Supabase).
- Logging: `log_statement=none`; `roles.sql` additionally switches off error/duration statement
  logging for its own session, so a failing `ALTER ROLE ... PASSWORD` is never logged.
- Secrets: generated once by `install.sh` (`openssl rand -hex 32`, URL-safe) into
  `/home/ubuntu/flowmate-db/.env` (600). Scripts pass them via environment, never argv, and never
  print them. Other secret files: `secrets/postgres_password` (uid 999, 600; initdb only),
  `pgbouncer/userlist.txt` (uid 70, 600).
- Backups contain member PII: dirs 700, files 600 on OCI and on the Mini.

## Connection strings (no values here)

| Who | URL |
|---|---|
| Vercel `DATABASE_URL` **and** `DIRECT_URL` (same value) | `postgresql://flowmate_app:<pw>@db.jerome87.com:6432/flowmate?sslmode=require&sslaccept=strict&pgbouncer=true&connection_limit=1` |
| OCI workers (on network `flowmate`) | `postgresql://flowmate_app:<pw>@flowmate-db:5432/flowmate` |
| Admin (restore, `prisma db push`) | `ssh -L 5433:127.0.0.1:5433 oci`, then `postgresql://flowmate_owner:<pw>@127.0.0.1:5433/flowmate` |

`sslaccept=strict` is required: Prisma's default (`accept_invalid_certs`) encrypts without
verifying. The certificate is RSA on purpose (LE chain to ISRG Root X1, the most widely trusted LE
root). Vercel never runs migrations; `DIRECT_URL` = `DATABASE_URL` is fine because the build
(`prisma generate`) does not connect. Schema changes go through the admin tunnel only.

## Install / re-apply

```bash
# from a checkout on the Mini (never use --delete: the target holds .env, data/, certs)
rsync -a --exclude mini/ deploy/oci/db/ oci:flowmate-db/
ssh oci ~/flowmate-db/install.sh
```

`install.sh` (idempotent): dirs/perms → `.env` (generated if missing) → superuser password file →
certificate (`renew-cert.sh` if none) → render `pgbouncer.ini` / `pgbouncer_hba.conf` /
`userlist.txt` (uid 70, 600; restart PgBouncer when changed) → `docker compose up -d --wait` →
`roles.sql` → locale check (`i|en-US|en_US.UTF-8|en_US.UTF-8|153.128|UTF8`) →
`ufw allow 6432/tcp` → cron lines (marker `# flowmate-db:`) → login self-test
(`flowmate_owner` via 127.0.0.1:5433, `flowmate_app` via 6432 with `sslmode=verify-full`).

Password rotation: edit `.env`, then `FLOWMATE_ROTATE_PASSWORDS=1 ~/flowmate-db/install.sh`
(re-sets all three passwords, restarts PgBouncer), then update Vercel / worker env.
Passwords are otherwise only set when a role has none, so reruns don't change SCRAM salts.

Cron (host TZ Asia/Seoul):

```
0 4 * * *   backup.sh          -> ~/backup/flowmate-db/backup.log
30 4 1 * *  verify-restore.sh --latest -> ~/backup/flowmate-db/verify-cron.log (+ verify.log)
17 3 * * *  renew-cert.sh      -> ~/flowmate-db/letsencrypt/renew.log
```

## Certificate

`renew-cert.sh [--dry-run|--force]`: certbot (pinned container, runs as `ubuntu`, state in
`~/flowmate-db/letsencrypt/`) with DNS-01 via `~/.secrets/cloudflare.ini` (600, read-only mount).
Renews when < 30 days remain. When the cert changed it installs cert+key into `pgbouncer/tls/`
(uid 70, 600), sends SIGHUP and checks the served fingerprint with
`openssl s_client -starttls postgres`; if the old cert is still served it restarts PgBouncer.
Verified 2026-11-02: SIGHUP alone switches the served certificate on PgBouncer 1.26.1.
ACME account has no email (expiry is covered by the daily job + Telegram alert).

## Backups

- `backup.sh` (04:00 KST): `pg_dump -Fc` of the whole `flowmate` db via `docker exec -u postgres`
  (local socket) into `~/backup/flowmate-db/flowmate-db-<UTC>.dump`, plus `.counts.tsv` (row counts
  from the **same exported snapshot**: a held REPEATABLE READ session runs `row-counts.sql`, pg_dump
  uses `--snapshot`) and `.sha256` (written last). Atomic (tmp + mv), `flock`, keeps 7 sets, checks
  that the archive has one TABLE DATA entry per counted table. Any failure → Telegram (bot from
  `~/healthcheck.env`, token passed to curl via stdin config). Alert-path test:
  `FLOWMATE_BACKUP_DB=does_not_exist ~/flowmate-db/backup.sh`.
- `verify-restore.sh <dump>|--latest` (monthly): throwaway container from the running db image with
  the same initdb args, `--network none`, no ports, always removed; restores, runs
  `row-counts.sql`, diffs with `<dump>.counts.tsv`; result line in `~/backup/flowmate-db/verify.log`;
  exit 0 only on exact match; Telegram on failure.
  *Deviation from the plan:* the plan says verify-restore calls `compare-row-counts`; OCI has no
  `node_modules`, so it compares manifests produced by the same `row-counts.sql`.
- Mini (`mini/`): `install-launchd.sh` installs `~/.local/bin/flowmate-db-pull-backups.sh` and
  `~/Library/LaunchAgents/com.flowcoder.flowmate-db-backup.plist` (05:30 daily). It rsyncs over
  `ssh oci` into `/Volumes/포터블/Backups/FlowMate/daily/` (700/600), verifies every set's sha256,
  keeps 30 sets, and exits non-zero with an `ERROR` line in `~/Library/Logs/flowmate-db-backup.log`
  when the volume is not mounted, rsync fails, or a checksum mismatches.
  **One-time macOS permission:** under launchd, TCC denies access to the removable volume
  (`Operation not permitted`). Grant Full Disk Access (or Files and Folders → Removable Volumes) to
  `/bin/bash` and `/usr/bin/rsync`, then test with
  `launchctl kickstart gui/$(id -u)/com.flowcoder.flowmate-db-backup`.

## Restore

```bash
ssh oci ~/flowmate-db/restore.sh <dump> [--recreate]
```

Restores only schema `public` (`pg_restore -n public`), so it accepts both a Supabase `-n public`
dump and a whole-db dump from `backup.sh`. Creates `vector` in `public` first (as postgres),
restores with `--no-owner --no-acl --role=flowmate_owner --single-transaction --exit-on-error`,
re-applies `roles.sql` (grants + auth function, which lives inside the db), runs `ANALYZE`, prints
row counts. Refuses a non-empty target unless `--recreate` (drops `flowmate` WITH FORCE, recreates
it owned by `flowmate_owner` with ICU `en-US`).

## Cutover runbook (plan 1A.3 — run only with the user's go)

0. Pick a window away from the Vercel crons (14·17·20·21·00 UTC). Crawl + digest must still be paused (Phase 0).
1. Supabase pre-check (`.env.local` loaded): no running/pending jobs; mark the 10-30 hung crawl jobs failed (write — confirm first).
   ```sql
   SELECT 'CrawlJob', status, count(*) FROM "CrawlJob" WHERE status IN ('running','pending') GROUP BY 2
   UNION ALL SELECT 'pipeline_jobs', status, count(*) FROM pipeline_jobs WHERE status IN ('running','pending') GROUP BY 2;
   ```
2. Dumps on the Mini (client `postgres:17` ≥ 17.6; connection from `DIRECT_URL` via PG* env, never argv):
   ```bash
   cd /Volumes/포터블/Production/FlowMate && set -a && source .env.local && set +a
   eval "$(node -e 'const u=new URL(process.env.DIRECT_URL);const q=s=>"\x27"+String(s).replace(/\x27/g,"\x27\\\x27\x27")+"\x27";console.log(`export PGHOST=${q(u.hostname)} PGPORT=${q(u.port||5432)} PGUSER=${q(decodeURIComponent(u.username))} PGPASSWORD=${q(decodeURIComponent(u.password))} PGDATABASE=${q(u.pathname.slice(1))} PGSSLMODE=require`)')"
   umask 077; STAMP=$(date -u +%Y%m%d-%H%M); OUT=/Volumes/포터블/Backups/FlowMate
   F=(-Fc -n public --no-owner --no-acl --no-publications --no-subscriptions)
   D() { docker run --rm -i -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE -e PGSSLMODE postgres:17 pg_dump "$@"; }
   D "${F[@]}" > "$OUT/flowmate-public-full-$STAMP.dump"
   D "${F[@]}" --exclude-table-data=document_embeddings > "$OUT/flowmate-public-migrate-$STAMP.dump"
   (cd "$OUT" && shasum -a 256 flowmate-public-*-$STAMP.dump >> SHA256SUMS-$STAMP.txt)
   ```
3. Copy + restore:
   ```bash
   rsync -t --chmod=F600 "$OUT/flowmate-public-migrate-$STAMP.dump" oci:backup/flowmate-migrate/
   ssh oci "~/flowmate-db/restore.sh ~/backup/flowmate-migrate/flowmate-public-migrate-$STAMP.dump --recreate"
   ```
4. Verify (tunnel open: `ssh -f -N -L 5433:127.0.0.1:5433 oci`; `OCI_OWNER_URL` = admin URL above):
   ```bash
   npx tsx scripts/db/compare-row-counts.ts --source-env DIRECT_URL --target-env OCI_OWNER_URL --exclude document_embeddings   # exit 0
   DATABASE_URL=$OCI_OWNER_URL DIRECT_URL=$OCI_OWNER_URL npx prisma migrate diff \
     --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code              # "No difference detected."
   # collation: sha256 of `SELECT id FROM "SupportProject" ORDER BY name, id` equal on both sides
   # sequences: SELECT count(*) FROM pg_sequences WHERE schemaname='public'  -> 0 on both sides (nothing to sync)
   ```
5. Vercel (load the `vercel-account` skill first: flowcoder25 ↔ flowcoder25-1055): set **Preview**
   `DATABASE_URL` and `DIRECT_URL` to the Vercel URL above, deploy a preview, check `/projects`,
   `/projects/[id]`, `/admin`. Then Production env + redeploy.
6. Workers: set `DATABASE_URL` (and `DIRECT_URL` if present) in `~/flowmate/.env.production` to the
   worker URL, then
   ```bash
   for c in flowmate-crawler flowmate-embedding flowmate-parser; do docker network connect flowmate $c; done
   ```
   and recreate/restart the containers so they read the new env (`--env-file` is read at
   `docker run`; a plain restart keeps the old values). `docker network connect` persists across
   restarts but not across `docker rm` + `deploy.sh start`: run it again after any redeploy.
   Update the Mini `.env.local` too.
7. After: `/projects` TTFB within +100ms of before (~0.7s), worker `/health` OK, `/admin` opens,
   watch logs for 24h (`docker logs flowmate-pgbouncer`, `docker logs flowmate-db`, Vercel).

### Rollback

Put the Supabase `DATABASE_URL`/`DIRECT_URL` back in Vercel (Production, then Preview) and
redeploy; restore the old `~/flowmate/.env.production` and recreate the workers. Supabase is left
exactly as it was at cutover. Anything written to OCI after cutover is not in Supabase — before
rolling back, take `~/flowmate-db/backup.sh` so it can be reconciled by hand. Keep the observation
window short.

## Ops quick reference

```bash
ssh oci 'docker ps --filter name=flowmate-'                         # both healthy
ssh oci 'docker logs --tail 50 flowmate-pgbouncer'
ssh oci 'docker exec -u postgres flowmate-db psql -d flowmate'      # superuser, local socket
ssh oci 'tail ~/backup/flowmate-db/backup.log ~/backup/flowmate-db/verify.log'
ssh oci 'docker kill -s HUP flowmate-pgbouncer'                     # reload pgbouncer.ini / hba / TLS
ssh oci 'docker exec -u postgres flowmate-db psql -c "SELECT pg_reload_conf()"'   # reload pg_hba / conf
```

Pending: VM reboot test (both containers are `restart: unless-stopped` and `docker.service` is
enabled; a reboot also restarts unrelated services, so it needs the user's approval).
