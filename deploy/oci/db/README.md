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
| `privileges-check.sql` | privilege self-check; any row = violation (run by `install.sh` / `restore.sh`) |
| `row-counts.sql` | exact row count per `public` table; shared by the shell scripts and `scripts/db/compare-row-counts.ts` |
| `common.sh` | shared shell helpers (env/secret reading, Telegram alert, `apply_roles`, `check_privileges`) |
| `install.sh` | idempotent install / re-apply |
| `restore.sh` | validate → restore into a staging db → (confirmed) swap |
| `backup.sh` | daily dump + row-count manifest + sha256, offsite-freshness alert |
| `verify-restore.sh` | restore a backup into a throwaway container and compare counts |
| `renew-cert.sh` | Let's Encrypt cert for `db.jerome87.com` via Cloudflare DNS-01, served-cert check |
| `tests/restore-guard.test.sh` | stub-docker test: nothing touches the live db without confirmation |
| `mini/` | Mini-side pull of backups (launchd) |
| `.env.example` | secret names (values only in `/home/ubuntu/flowmate-db/.env`, 600) |

Pinned images (tag + multi-arch index digest, see `docker-compose.yml` / `renew-cert.sh`):

- `pgvector/pgvector:0.8.7-pg17-trixie` — PostgreSQL 17.11, pgvector 0.8.7, libicu76.
  **Must stay on trixie.** A restore of the Supabase dump showed `ORDER BY name` on
  `"SupportProject"` is byte-identical to Supabase only with ICU 76 (bookworm/ICU 72 orders
  U+2018 vs U+0027 differently). Supabase reports `datcollversion=153.120`; this cluster
  records `153.128`. The behaviour matches on the tested orderings; the version string does not.
- `edoburu/pgbouncer:v1.26.1-p0` — PgBouncer 1.26.1 (runs as uid 70).
- `certbot/dns-cloudflare:v5.8.0`.

## Security model

- **Public port 6432 (PgBouncer) only**, TLS required (`client_tls_sslmode=require`, TLS 1.2+).
  Docker-published ports bypass ufw, so the DB itself is published only on `127.0.0.1:5433`.
- PgBouncer `auth_type = hba` + `pgbouncer_hba.conf`: only `flowmate_app` → `flowmate` over
  `hostssl` with SCRAM; everything else is rejected. (Without it, `pgbouncer_auth`, which must be in
  `userlist.txt` in plaintext for its own server login, could log in on 6432.) PgBouncer looks a user
  up before applying the HBA, so an unknown user still costs one `auth_query` round trip.
- `flowmate_app`'s SCRAM verifier comes from `auth_query` → `pgbouncer.get_auth()`
  (SECURITY DEFINER, `search_path=pg_catalog`, own schema, EXECUTE only for `pgbouncer_auth`), which
  returns a row **only** for `flowmate_app`. `postgres` / `flowmate_owner` are unknown to PgBouncer.
- `pg_hba.conf`: `postgres` = local socket (peer) only; `pgbouncer_auth` only from 172.21.0.3;
  `flowmate_owner` only from 172.21.0.1; `flowmate_app` from 172.21.0.0/24; everything else rejected
  (v4 and v6). All TCP lines `scram-sha-256`.
  - **The `flowmate_owner` rule is host trust, not tunnel trust.** 172.21.0.1 is the docker gateway:
    every connection to `127.0.0.1:5433` arrives from it through docker-proxy (verified with
    `inet_client_addr()`), whether it came through your SSH tunnel or from any process or user on the
    OCI host. The password is the only thing separating them.
  - **Inside the `flowmate` bridge the protocol is plaintext** (pgbouncer → db and, after cutover,
    workers → db). SCRAM never sends the password, but query data is visible to anything that can
    sniff or spoof on that bridge. Mitigation: worker containers run with `--cap-drop NET_RAW`
    (`deploy/oci/deploy.sh`), so they cannot open raw sockets to spoof or sniff.
- `flowmate_app`: CONNECT, USAGE on `public`, SELECT/INSERT/UPDATE/DELETE on tables,
  USAGE/SELECT/UPDATE on sequences, EXECUTE on `flowmate_owner`'s functions (e.g. `hybrid_search`,
  used by `src/lib/rag.ts`), default privileges for future `flowmate_owner` objects. No
  CREATE/TEMP/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN, not an owner (no DROP/ALTER).
  `statement_timeout=120s` (same as Supabase). PUBLIC has no EXECUTE on non-extension functions
  (global default privilege revoked for `flowmate_owner`; per-schema defaults cannot revoke) and no
  CONNECT on `postgres` / `template1`. `privileges-check.sql` enforces this after every install/restore.
- Logging: `log_statement=none`, `log_parameter_max_length=0`, `log_parameter_max_length_on_error=0`
  (slow-statement / error logs never contain bind values such as OAuth tokens); `roles.sql`
  additionally switches off error/duration statement logging for its own session, so a failing
  `ALTER ROLE ... PASSWORD` is never logged.
- Secrets: generated once by `install.sh` (`openssl rand -hex 32`, URL-safe) into
  `/home/ubuntu/flowmate-db/.env` (600). Scripts pass them via environment, never argv, and never
  print them. Other secret files: `secrets/postgres_password` (uid 999, 600; initdb only),
  `pgbouncer/userlist.txt` (uid 70, 600). `install.sh` refuses to run unless `~/healthcheck.env`
  (Telegram bot token) is mode 600.
- Backups contain member PII: dirs 700, files 600 on OCI and on the Mini. `verify-restore.sh`
  removes its throwaway container together with the anonymous data volume.

Follow-ups (not done here): fail2ban (or a PgBouncer-side rate limit) for 6432; encryption at rest
for the data directory / backups (user decision).

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
rsync -a --exclude mini/ --exclude tests/ deploy/oci/db/ oci:flowmate-db/
ssh oci ~/flowmate-db/install.sh
```

`install.sh` (idempotent, `flock` shared with `restore.sh`): `~/healthcheck.env` must be 600 →
dirs/perms → `.env` (generated if missing) → superuser password file → certificate (`renew-cert.sh`
if none) → render `pgbouncer.ini` / `pgbouncer_hba.conf` / `userlist.txt` (uid 70, 600; restart
PgBouncer when changed) → `docker compose up -d --wait` → `pg_reload_conf()` + check the logging
settings → `roles.sql` → `privileges-check.sql` → locale check
(`i|en-US|en_US.UTF-8|en_US.UTF-8|153.128|UTF8`) → `ufw allow 6432/tcp` → cron lines (marker
`# flowmate-db:`) → login self-test (`flowmate_owner` via 127.0.0.1:5433, `flowmate_app` via 6432
with `sslmode=verify-full`).

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
Renews when < 30 days remain; installs changed cert+key into `pgbouncer/tls/` (uid 70, 600).
Then **every run** it reads the certificate actually served on 6432
(`openssl s_client -starttls postgres`): if it differs from the current one it sends SIGHUP, then
restarts PgBouncer if needed; it alerts when the served certificate expires in < 14 days
(`FLOWMATE_CERT_MIN_DAYS`) or PgBouncer is not running. Verified 2026-11-02: SIGHUP alone switches
the served certificate on PgBouncer 1.26.1. ACME account has no email.

## Backups

- `backup.sh` (04:00 KST): `pg_dump -Fc` of the whole `flowmate` db via `docker exec -u postgres`
  (local socket) into `~/backup/flowmate-db/flowmate-db-<UTC>.dump`, plus `.counts.tsv` (row counts
  from the **same exported snapshot**: a held REPEATABLE READ session runs `row-counts.sql`, pg_dump
  uses `--snapshot`) and `.sha256` (written last). Atomic (tmp + mv), `flock`, keeps 7 sets, checks
  that the archive has one TABLE DATA entry per counted table. Any failure → Telegram (bot from
  `~/healthcheck.env`, token passed to curl via stdin config). It also alerts when the Mini's pull
  marker `~/backup/flowmate-db/.mini-pulled` is older than 48h (or has not appeared 48h after the
  first backup) — the offsite job is watched from the side that already alerts.
  Alert-path test: `FLOWMATE_BACKUP_DB=does_not_exist ~/flowmate-db/backup.sh`.
  Manifest assumption: `row-counts.sql` counts ordinary and partitioned parents but skips partitions
  (`NOT relispartition`); the schema has no partitioned tables today. Revisit if one is added.
- `verify-restore.sh <dump>|--latest` (monthly): throwaway container from the running db image with
  the same initdb args, `--network none`, no ports, removed with `docker rm -f -v` (its anonymous
  data volume holds PII); fails if the dangling-volume count grew; restores, runs `row-counts.sql`,
  diffs with `<dump>.counts.tsv`; result line in `~/backup/flowmate-db/verify.log` (best effort, the
  Telegram alert is sent first); exit 0 only on exact match.
  *Deviation from the plan:* the plan says verify-restore calls `compare-row-counts`; OCI has no
  `node_modules`, so it compares manifests produced by the same `row-counts.sql`.
- Mini (`mini/`): `install-launchd.sh` installs `~/.local/bin/flowmate-db-pull-backups.sh` and
  `~/Library/LaunchAgents/com.flowcoder.flowmate-db-backup.plist` (05:30 daily). It rsyncs over
  `ssh oci` (Apple `/usr/bin/rsync`) into `/Volumes/포터블/Backups/FlowMate/daily/` (700/600),
  verifies every set's sha256, fails when the newest dump is older than 36h, prunes to 30 sets only
  after every check passed, then touches `oci:~/backup/flowmate-db/.mini-pulled`. Failures exit
  non-zero with an `ERROR` line in `~/Library/Logs/flowmate-db-backup.log` (and, via the missing
  marker, a Telegram alert from OCI within 48h).
  **One-time macOS permission (user action):** under launchd, TCC denies the removable volume
  (`Operation not permitted`). In System Settings → Privacy & Security → Full Disk Access add
  `/bin/bash` (the job's program, i.e. the responsible process) and `/usr/bin/rsync` (the binary TCC
  denied in testing). Then test with `launchctl kickstart gui/$(id -u)/com.flowcoder.flowmate-db-backup`
  and check the log for `pull ok`.

## Restore

```bash
ssh oci ~/flowmate-db/restore.sh <dump>                                   # stage (+ swap if live is empty)
ssh oci 'FLOWMATE_CONFIRM_SWAP=flowmate ~/flowmate-db/restore.sh <dump>'   # replace a non-empty live db
```

1. **Validate, touching no database:** `<dump>.sha256` must exist and match; `pg_restore -l` must read
   the archive; free disk ≥ 10 × dump size + 1 GiB.
2. **Stage** into `flowmate_restore_<YYYYmmdd_HHMMSS>` (owner `flowmate_owner`, ICU `en-US`):
   `CREATE EXTENSION vector` (as postgres), `pg_restore -n public --no-owner --no-acl
   --role=flowmate_owner --single-transaction --exit-on-error`, `roles.sql` (grants and the pgbouncer
   auth function live inside the db), `privileges-check.sql`, `ANALYZE`, and if `<dump>.counts.tsv`
   exists (backup.sh dumps) exact row counts must match it. `-n public` makes both a Supabase
   `-n public` dump and a whole-db backup.sh dump work.
3. **Swap**, only after 1 and 2 passed. Live db missing or empty (first restore): no confirmation.
   Otherwise `FLOWMATE_CONFIRM_SWAP=flowmate` is required; without it the script stops, leaves the
   staging db for inspection and prints what it would do. Confirmed: fresh `backup.sh` of the live
   db → `ALLOW_CONNECTIONS false` + terminate its sessions → one transaction:
   `flowmate → flowmate_prev_<ts>`, `staging → flowmate`. PgBouncer reconnects by name (a few
   seconds of client errors). **The previous db is never dropped by the script**; it stays as
   `flowmate_prev_<ts>` (connections disabled). Drop it by hand once the new one is verified:
   `docker exec -u postgres flowmate-db psql -c 'DROP DATABASE flowmate_prev_<ts>'`.

`tests/restore-guard.test.sh` (stub `docker`, run on any Linux with bash ≥ 4.4) proves that without
the confirmation nothing renames, terminates, blocks or drops anything, and that a bad checksum,
missing `.sha256`, unreadable archive, low disk, failed restore, failed privilege check or manifest
mismatch stops before any swap.

## Cutover runbook (plan 1A.3 — run only with the user's go)

0. Pick a window away from the Vercel crons (14·17·20·21·00 UTC). Crawl + digest must still be
   paused (Phase 0). Note the `/projects` TTFB before the switch.
1. **Supabase pre-check** (`.env.local` loaded, `PG*` env as in step 3): no running/pending jobs;
   mark the 10-30 hung crawl jobs failed now (it is a write — confirm first; after step 2 writes fail).
   ```sql
   SELECT 'CrawlJob', status, count(*) FROM "CrawlJob" WHERE status IN ('running','pending') GROUP BY 2
   UNION ALL SELECT 'pipeline_jobs', status, count(*) FROM pipeline_jobs WHERE status IN ('running','pending') GROUP BY 2;
   ```
2. **Write fence on Supabase** (app + workers connect as role `postgres` to db `postgres`). From here
   the public site still serves reads; logins and any other writes fail until the switch.
   ```sql
   ALTER ROLE postgres IN DATABASE postgres SET default_transaction_read_only = on;
   -- existing sessions keep their old default: end them (pooled server conns reconnect read-only)
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE usename = 'postgres' AND datname = 'postgres' AND pid <> pg_backend_pid() AND backend_type = 'client backend';
   ```
   Check from a **new** session (the setting applies at session start):
   ```sql
   SHOW default_transaction_read_only;                              -- on
   UPDATE "CrawlSource" SET "updatedAt" = "updatedAt" WHERE false;  -- must fail: read-only transaction
   SELECT count(*) FROM "SupportProject";                           -- reads still work
   ```
3. **Final dumps on the Mini** (client `postgres:17` ≥ 17.6; connection from `DIRECT_URL` via PG* env,
   never argv) + a `.sha256` next to each dump (`restore.sh` requires it):
   ```bash
   cd /Volumes/포터블/Production/FlowMate && set -a && source .env.local && set +a
   eval "$(node -e 'const u=new URL(process.env.DIRECT_URL);const q=s=>"\x27"+String(s).replace(/\x27/g,"\x27\\\x27\x27")+"\x27";console.log(`export PGHOST=${q(u.hostname)} PGPORT=${q(u.port||5432)} PGUSER=${q(decodeURIComponent(u.username))} PGPASSWORD=${q(decodeURIComponent(u.password))} PGDATABASE=${q(u.pathname.slice(1))} PGSSLMODE=require`)')"
   umask 077; STAMP=$(date -u +%Y%m%d-%H%M); OUT=/Volumes/포터블/Backups/FlowMate
   F=(-Fc -n public --no-owner --no-acl --no-publications --no-subscriptions)
   D() { docker run --rm -i -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE -e PGSSLMODE postgres:17 pg_dump "$@"; }
   D "${F[@]}" > "$OUT/flowmate-public-full-$STAMP.dump"
   D "${F[@]}" --exclude-table-data=document_embeddings > "$OUT/flowmate-public-migrate-$STAMP.dump"
   cd "$OUT"
   shasum -a 256 flowmate-public-*-$STAMP.dump >> SHA256SUMS-$STAMP.txt
   shasum -a 256 flowmate-public-migrate-$STAMP.dump > flowmate-public-migrate-$STAMP.dump.sha256
   ```
4. **Copy + restore** (live `flowmate` holds the rehearsal data → confirmation needed):
   ```bash
   rsync -t --chmod=F600 "$OUT/flowmate-public-migrate-$STAMP.dump" "$OUT/flowmate-public-migrate-$STAMP.dump.sha256" oci:backup/flowmate-migrate/
   ssh oci "FLOWMATE_CONFIRM_SWAP=flowmate ~/flowmate-db/restore.sh ~/backup/flowmate-migrate/flowmate-public-migrate-$STAMP.dump"
   ```
5. **Verify** (tunnel open: `ssh -f -N -L 5433:127.0.0.1:5433 oci`; `OCI_OWNER_URL` = admin URL):
   ```bash
   npx tsx scripts/db/compare-row-counts.ts --source-env DIRECT_URL --target-env OCI_OWNER_URL --exclude document_embeddings   # exit 0
   DATABASE_URL=$OCI_OWNER_URL DIRECT_URL=$OCI_OWNER_URL npx prisma migrate diff \
     --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code              # "No difference detected."
   # collation: sha256 of `SELECT id FROM "SupportProject" ORDER BY name, id` equal on both sides
   # sequences: SELECT count(*) FROM pg_sequences WHERE schemaname='public'  -> 0 on both sides (nothing to sync)
   ```
6. **Switch the OCI workers first** (idle while crawl/digest are paused): set `DATABASE_URL` (and
   `DIRECT_URL` if present) in `~/flowmate/.env.production` to the worker URL, then recreate them
   with `deploy/oci/deploy.sh` (now runs them with `--network flowmate --cap-drop NET_RAW`;
   `--env-file` is only read at `docker run`, a restart keeps old values). For a container that is
   not recreated, `docker network connect flowmate <name>` attaches it (persists across restarts,
   not across `docker rm`). Check `/health` of each worker.
7. **Vercel** (load the `vercel-account` skill first: flowcoder25 ↔ flowcoder25-1055): set **Preview**
   `DATABASE_URL` and `DIRECT_URL` to the Vercel URL, deploy a preview, check `/projects`,
   `/projects/[id]`, `/admin`. Then Production env + redeploy. Update the Mini `.env.local` too.
8. **Mandatory delta gate** (right after the switch; Supabase is still read-only, so it must match):
   ```bash
   npx tsx scripts/db/compare-row-counts.ts --source-env DIRECT_URL --target-env OCI_OWNER_URL --exclude document_embeddings   # exit 0
   ```
   ```sql
   -- run on Supabase and on OCI; every row must be equal (a newer/larger value on Supabase = a lost write).
   -- Only User and SupportProject have "updatedAt"; the others use their latest timestamp column.
   SELECT 'User.updatedAt' AS k, max("updatedAt")::text AS v FROM "User"
   UNION ALL SELECT 'Account.expires_at+count', max(expires_at)::text || '/' || count(*) FROM "Account"
   UNION ALL SELECT 'Session.expires+count', max(expires)::text || '/' || count(*) FROM "Session"
   UNION ALL SELECT 'CrawlJob.createdAt/completedAt', max("createdAt")::text || '/' || max("completedAt")::text FROM "CrawlJob"
   UNION ALL SELECT 'SupportProject.updatedAt', max("updatedAt")::text FROM "SupportProject";
   ```
9. After: `/projects` TTFB within +100ms of before (~0.7s), worker `/health` OK, `/admin` opens,
   logins work (writes now go to OCI), watch logs for 24h (`docker logs flowmate-pgbouncer`,
   `docker logs flowmate-db`, Vercel).

### Rollback

1. **Dump OCI first** — it holds every write since the switch: `ssh oci ~/flowmate-db/backup.sh`
   (keep that file; reconcile those writes into Supabase by hand if they matter).
2. Revert the env: Vercel Production (then Preview) back to the Supabase `DATABASE_URL`/`DIRECT_URL`
   and redeploy; restore the old `~/flowmate/.env.production` and recreate the workers.
3. Lift the fence on Supabase (only now, so nothing writes to both sides):
   ```sql
   ALTER ROLE postgres IN DATABASE postgres RESET default_transaction_read_only;
   ```
   New sessions are writable again; terminate old pooled sessions as in step 2 if any stay read-only.

Keep the observation window short: every hour on OCI is an hour of writes to reconcile on rollback.

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
