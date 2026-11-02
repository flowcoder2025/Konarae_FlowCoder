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
| `latest-writes.sql` | newest timestamps + counts of the write-hot tables (cutover lost-write gate) |
| `table-checksums.sql` | per-table order-independent content checksum + count (cutover content gates) |
| `common.sh` | shared shell helpers (env/secret reading, Telegram alert, `apply_roles`, `check_privileges`) |
| `install.sh` | idempotent install / re-apply |
| `restore.sh` | validate → restore into a staging db → verify against the manifest → (confirmed) swap |
| `switch-workers.sh` | cutover: edit `.env.production` (single source) and recreate the workers on the OCI DB; resumable, `--rollback` |
| `backup.sh` | daily dump + row-count manifest + sha256, offsite-freshness alert |
| `verify-restore.sh` | restore a backup into a throwaway container and compare counts |
| `renew-cert.sh` | Let's Encrypt cert for `db.jerome87.com` via Cloudflare DNS-01, served-cert check |
| `tests/restore-guard.test.sh` | stub-docker test of restore.sh's guards |
| `tests/privileges-check.test.sh` | throwaway-container regression test of `privileges-check.sql` |
| `tests/switch-workers.test.sh` | throwaway-container tests of `switch-workers.sh` (apply, rollback, abort, crash/HUP resume, crash loop, preflight) |
| `tests/deploy-guard.test.sh` | stub-docker test: `deploy.sh` validates everything before stopping workers |
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
(`i|en-US|en_US.UTF-8|en_US.UTF-8|153.128|UTF8`) → `ufw allow 6432/tcp` → cron file
`/etc/cron.d/flowmate-db` → login self-test (`flowmate_owner` via 127.0.0.1:5433, `flowmate_app` via 6432
with `sslmode=verify-full`).

The rendered `userlist.txt` (pgbouncer_auth password) only ever exists in a private `mktemp -d`
scratch dir that is removed on exit.

Password rotation: edit `.env`, then `FLOWMATE_ROTATE_PASSWORDS=1 ~/flowmate-db/install.sh`
(re-sets all three passwords, restarts PgBouncer), then update Vercel / worker env.
Passwords are otherwise only set when a role has none, so reruns don't change SCRAM salts.

Cron: `/etc/cron.d/flowmate-db` (root-owned, 644, jobs run as `ubuntu`, host TZ Asia/Seoul). Not the
user crontab: rewriting it after a transient `crontab -l` failure could drop `healthcheck.sh`.
`install.sh` removes the old `# flowmate-db:` lines from the user crontab once and keeps the rest.

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
(`FLOWMATE_CERT_MIN_DAYS`) or PgBouncer is not running. Every TLS probe runs under `timeout`
(15 s; a hang is an alerted failure, never a reason to restart PgBouncer), certbot under
`timeout` (600 s), and a watchdog bounds the whole run (1200 s, alert + stop). Verified 2026-11-02: SIGHUP alone switches
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
  the same initdb args, `--network none`, no ports; records its own volume names right after start;
  restores, runs `row-counts.sql`, diffs with `<dump>.counts.tsv`; then `docker rm -f -v` and proves
  the container and exactly those volumes are gone (they hold PII). A cleanup failure is alerted and
  logged as `CLEANUP-FAIL` separately from the restore result (exit 3). Result lines in
  `~/backup/flowmate-db/verify.log` (best effort, the Telegram alert is sent first); exit 0 only on
  exact match and clean removal.
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
ssh oci ~/flowmate-db/restore.sh [--manifest-exclude t1,t2] [--allow-missing-live-tables] <dump>
ssh oci 'FLOWMATE_CONFIRM_SWAP=<dump basename> ~/flowmate-db/restore.sh ... <dump>'   # replace a non-empty live db
```

Next to the dump: `<dump>.sha256` and `<dump>.counts.tsv` — the `row-counts.sql` output of the
**source at dump time** (backup.sh writes one; the cutover writes one from Supabase, step 3).

1. **Validate, touching no database:** sha256 matches; manifest present and well-formed; `pg_restore -l`
   reads the archive and it has `TABLE DATA` entries (schema-only dumps are refused); free disk ≥ 10 ×
   dump size + 1 GiB. Existing `flowmate_restore_*` / `flowmate_prev_*` databases are listed with sizes.
2. **Stage** into `flowmate_restore_<YYYYmmdd_HHMMSS>` (owner `flowmate_owner`, ICU `en-US`):
   `CREATE EXTENSION vector` (as postgres), `pg_restore -n public --no-owner --no-acl
   --role=flowmate_owner --single-transaction --exit-on-error`, `roles.sql` (grants and the pgbouncer
   auth function live inside the db), `privileges-check.sql`, `ANALYZE`; if `<dump>.checksums.tsv`
   exists, every non-excluded table's content checksum must match it too. `-n public` makes both a
   Supabase `-n public` dump and a whole-db backup.sh dump work.
3. **Verify staging** before any swap: > 0 tables; exact row counts equal the manifest, except tables
   named in `--manifest-exclude`, which must exist with **0** rows (the migrate dump has no
   `document_embeddings` data on purpose); when the live db is non-empty every live table must exist
   in staging (override `--allow-missing-live-tables`).
4. **Swap.** Live db missing or empty (first restore): no confirmation. Otherwise
   `FLOWMATE_CONFIRM_SWAP` must equal the dump's file name (the unconfirmed run prints the exact
   command); without it the script stops, leaves staging for inspection and prints the plan.
   Confirmed: fresh `backup.sh` of the live db → `ALLOW_CONNECTIONS false` + terminate sessions on
   **staging and live** → one transaction: `flowmate → flowmate_prev_<ts>`, `staging → flowmate`,
   `ALLOW_CONNECTIONS true` on the new one. PgBouncer reconnects by name (~4 s of client errors in the
   rehearsal). If the transaction fails the live db gets its connections back; if *that* fails a
   Telegram alert is sent. **The previous db is never dropped by the script** (`flowmate_prev_<ts>`,
   connections disabled).

If the staging db cannot be fenced (a session refuses to go away within 30 s), its connections are
re-enabled and the script stops before the live db is touched.

**Manual recovery** — if restore.sh is killed (SIGKILL, lost SSH without `nohup`) between "block
connections" and the rename, the live db keeps refusing connections:
```bash
ssh oci "docker exec -u postgres flowmate-db psql -c 'ALTER DATABASE flowmate WITH ALLOW_CONNECTIONS true'"
```
(check first with `SELECT datname, datallowconn FROM pg_database WHERE datname LIKE 'flowmate%'`).

Tests (run on OCI, bash ≥ 4.4): `tests/restore-guard.test.sh` (stub docker: no swap without the
token, a missing/mismatching manifest, schema-only or zero-table staging, a staging db missing a live
table, failed restore/privilege check; staging is fenced before the rename; a failed rename re-enables
the live db; nothing ever DROPs), `tests/privileges-check.test.sh` (throwaway container: a SELECT-only
grant, an extra TRUNCATE grant and a wrongly owned table all fail the check).

## Cutover runbook (plan 1A.3 — run only with the user's go)

Principle: every check compares against something that **cannot move**. OCI is checked against a
Supabase manifest frozen at dump time, and Supabase is later checked against that same manifest —
never "Supabase vs OCI" after the switch (legitimate logins make OCI diverge) and never through
`DIRECT_URL` once `.env.local` might point at OCI.

0. **Window:** outside the Vercel crons (14·17·20·21·00 UTC). Even with crawling paused those runs
   write: the 2026-11-01 17:00 UTC run changed `SupportProject.status` on 24 rows. The fence (step 2)
   and the checksum gate (step 8) cover anything that still slips through. Crawl + digest still
   paused (Phase 0). Note the `/projects` TTFB. In the operator shell on the Mini (bash or zsh),
   **before any `.env.local` change**:
   ```bash
   cd /Volumes/포터블/Production/FlowMate && set -a && source .env.local && set +a
   umask 077; cp -p .env.local ~/.flowmate-cutover.env.local && chmod 600 ~/.flowmate-cutover.env.local   # rollback restores it
   printf 'SUPABASE_SOURCE_URL=%q\n' "$DIRECT_URL" > ~/.flowmate-cutover.env   # %q: safe to `source` (& # spaces); never echoed
   set -a && source ~/.flowmate-cutover.env && set +a
   eval "$(SRC=$SUPABASE_SOURCE_URL node -e 'const u=new URL(process.env.SRC);const q=s=>"\x27"+String(s).replace(/\x27/g,"\x27\\\x27\x27")+"\x27";console.log(`export PGHOST=${q(u.hostname)} PGPORT=${q(u.port||5432)} PGUSER=${q(decodeURIComponent(u.username))} PGPASSWORD=${q(decodeURIComponent(u.password))} PGDATABASE=${q(u.pathname.slice(1))} PGSSLMODE=require`)')"
   SB() { docker run --rm -i -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE -e PGSSLMODE postgres:17 "$@"; }   # Supabase client
   ```
   `scripts/db/compare-row-counts.ts` exits 2 if source and target are the same database — checked by
   query (`pg_control_system().system_identifier` + the database oid; if the two sides can only be
   identified by different methods it also exits 2), so OCI via 6432, via the tunnel and via
   `flowmate-db:5432` are all recognised as one db and a repointed env cannot produce a fake
   "0 mismatches".

   **0b. Deploy exactly this branch's scripts to OCI and verify them:**
   ```bash
   rsync -a --exclude mini/ --exclude tests/ --exclude .DS_Store deploy/oci/db/ oci:flowmate-db/
   (cd deploy/oci/db && find . -type f ! -path './mini/*' ! -path './tests/*' ! -name .DS_Store -print0 | xargs -0 shasum -a 256) |
     ssh oci 'cd ~/flowmate-db && sha256sum -c --quiet' && echo "OCI scripts == branch"
   ssh oci ~/flowmate-db/install.sh          # idempotent; must end with "install ok"
   ```
1. **Supabase pre-check:** no running/pending jobs; mark the 10-30 hung crawl jobs failed now (a
   write — confirm first; after step 2 writes fail). Also list which roles hold sessions — every app
   role must be covered by the fence (expected: only `postgres` via the pooler):
   ```bash
   SB psql -X -v ON_ERROR_STOP=1 <<'SQL'
   SELECT 'CrawlJob', status, count(*) FROM "CrawlJob" WHERE status IN ('running','pending') GROUP BY 2
   UNION ALL SELECT 'pipeline_jobs', status, count(*) FROM pipeline_jobs WHERE status IN ('running','pending') GROUP BY 2;
   SELECT usename, count(*) FROM pg_stat_activity WHERE backend_type = 'client backend' GROUP BY 1;
   SQL
   ```
2. **Write fence on Supabase.** Run it in an explicit `BEGIN READ WRITE` transaction so the admin
   session can never get stuck read-only, then end the existing sessions (they keep their old default):
   ```bash
   SB psql -X -v ON_ERROR_STOP=1 <<'SQL'
   BEGIN READ WRITE;
   ALTER ROLE postgres IN DATABASE postgres SET default_transaction_read_only = on;
   COMMIT;
   SELECT count(pg_terminate_backend(pid)) FROM pg_stat_activity
   WHERE usename = 'postgres' AND datname = 'postgres' AND pid <> pg_backend_pid() AND backend_type = 'client backend';
   SQL
   ```
   Check from a **new** session (the default applies at session start; no ON_ERROR_STOP, the
   UPDATE is expected to fail):
   ```bash
   SB psql -X <<'SQL'
   SHOW default_transaction_read_only;                              -- on
   UPDATE "CrawlSource" SET "updatedAt" = "updatedAt" WHERE false;  -- ERROR: cannot execute UPDATE in a read-only transaction
   SELECT count(*) FROM "SupportProject";                           -- reads still work
   SQL
   ```
   **The fence is a soft convention, not enforcement:** any session can still write with
   `BEGIN READ WRITE` (verified on a throwaway pg17). It holds for this app because Prisma never
   issues `BEGIN READ WRITE`; the lost-write gate (step 8) checks that it held. From now on the public
   site serves reads; logins and other writes fail until the switch.
3. **Manifests → dumps → manifests on the Mini** (client `postgres:17` ≥ 17.6, connection via PG* env).
   Three Supabase manifests at dump time: row counts, latest writes, and per-table **content checksums**
   (`table-checksums.sql`: order-independent md5 of every row under pinned TimeZone/DateStyle/float/
   bytea output; vector columns hashed as `real[]`). Content checksums catch UPDATEs that counts and
   timestamps cannot (e.g. `credits` balances, `Account` tokens). Runtime on Supabase: ~38 s (~11 s
   without `document_embeddings`), measured 2026-11-02.
   ```bash
   STAMP=$(date -u +%Y%m%d-%H%M); OUT=/Volumes/포터블/Backups/FlowMate
   M="$OUT/flowmate-public-migrate-$STAMP.dump"; FULL="$OUT/flowmate-public-full-$STAMP.dump"
   TAB=$(printf '\t'); Q() { SB psql -X -q -At -F "$TAB" -v ON_ERROR_STOP=1 -f - < "deploy/oci/db/$1"; }
   Q row-counts.sql > "$M.counts.tsv"; Q latest-writes.sql > "$M.latest.tsv"; Q table-checksums.sql > "$M.checksums.tsv"
   F=(-Fc -n public --no-owner --no-acl --no-publications --no-subscriptions)
   SB pg_dump "${F[@]}" > "$FULL"
   SB pg_dump "${F[@]}" --exclude-table-data=document_embeddings > "$M"
   # the manifests must not have moved while dumping (proves they describe the dumps):
   diff "$M.counts.tsv" <(Q row-counts.sql) && diff "$M.latest.tsv" <(Q latest-writes.sql) && diff "$M.checksums.tsv" <(Q table-checksums.sql)
   # the full dump gets the same manifests (it also has document_embeddings data), so it can feed
   # restore.sh / verify-restore.sh in an incident:
   cp "$M.counts.tsv" "$FULL.counts.tsv"; cp "$M.checksums.tsv" "$FULL.checksums.tsv"
   (cd "$OUT" && shasum -a 256 "$(basename "$FULL")" "$(basename "$M")" >> "SHA256SUMS-$STAMP.txt" \
     && shasum -a 256 "$(basename "$M")" > "$M.sha256" && shasum -a 256 "$(basename "$FULL")" > "$FULL.sha256")
   ```
4. **Copy + restore** (live `flowmate` holds the rehearsal data → token needed). `restore.sh` checks
   staging against the counts manifest AND the content checksums: that is the proof "OCI staging ==
   Supabase at dump time" (`document_embeddings` excluded and required to be empty):
   ```bash
   rsync -t --chmod=F600 "$M" "$M.sha256" "$M.counts.tsv" "$M.latest.tsv" "$M.checksums.tsv" oci:backup/flowmate-migrate/
   B=$(basename "$M")
   ssh oci "~/flowmate-db/restore.sh --require-checksums --manifest-exclude document_embeddings ~/backup/flowmate-migrate/$B"          # stage + verify, prints the token
   ssh oci "FLOWMATE_CONFIRM_SWAP=$B ~/flowmate-db/restore.sh --require-checksums --manifest-exclude document_embeddings ~/backup/flowmate-migrate/$B"
   ```
5. **Extra pre-switch checks** (Supabase is fenced, so it is still at the dump state). Tunnel and
   admin URL, the password read over SSH into the variable, never printed:
   ```bash
   ssh -f -N -o ControlMaster=no -o ControlPath=none -L 5433:127.0.0.1:5433 oci
   export OCI_OWNER_URL="postgresql://flowmate_owner:$(ssh oci "sed -n 's/^FLOWMATE_OWNER_PASSWORD=//p' ~/flowmate-db/.env")@127.0.0.1:5433/flowmate?sslmode=disable"
   npx tsx scripts/db/compare-row-counts.ts --source-env SUPABASE_SOURCE_URL --target-env OCI_OWNER_URL --exclude document_embeddings   # exit 0
   DATABASE_URL=$OCI_OWNER_URL DIRECT_URL=$OCI_OWNER_URL npx prisma migrate diff \
     --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code                       # "No difference detected."
   ssh oci "docker exec -i -u postgres flowmate-db psql -X -q -At -F '$TAB' -d flowmate -f -" < deploy/oci/db/latest-writes.sql | diff "$M.latest.tsv" -
   # collation: identical ordering on both sides
   C='SELECT id FROM "SupportProject" ORDER BY name, id'
   diff <(SB psql -X -At -c "$C" | shasum -a 256) <(printf '%s' "$C" | ssh oci 'docker exec -i -u postgres flowmate-db psql -X -At -d flowmate' | shasum -a 256)
   # sequences: none on either side (nothing to sync)
   SB psql -X -At -c "SELECT count(*) FROM pg_sequences WHERE schemaname = 'public'"                                  # 0
   ssh oci "docker exec -u postgres flowmate-db psql -X -At -d flowmate -c \"SELECT count(*) FROM pg_sequences WHERE schemaname = 'public'\""   # 0
   ```
6. **Switch the OCI workers first** (idle while crawl/digest are paused) with `switch-workers.sh`
   (independent of the `~/flowmate` git checkout, which has local changes). `~/flowmate/.env.production`
   is the **single source of truth** for the worker env: the script backs it up as
   `.env.production.pre-cutover-<ts>` (600), rewrites only `DATABASE_URL`/`DIRECT_URL` to the worker URL
   (file becomes 600; every other line verified byte-identical, values never printed), and recreates
   each worker from that file + keys only the running container has (`PORT`, `NODE_OPTIONS`), with
   the running image, ports, restart policy, memory etc., plus `--network flowmate --cap-drop
   NET_RAW`. Before stopping anything it logs in as `flowmate_app` from a throwaway container on
   network `flowmate`, refuses containers with mounts, and `docker create`s each new container: its
   Config/HostConfig must equal the running one (only name, network, NET_RAW and env may differ) and
   its env must hold exactly one `DATABASE_URL` and one `DIRECT_URL`, both on `flowmate-db`. Progress
   is kept in `~/flowmate-db/workers/switch.state`; an interrupted run (lost SSH, Ctrl-C) is resumed
   by `--apply` (only while the recorded direction is still "switch") or undone by `--rollback`. Run
   it inside `tmux` anyway. Old containers stay stopped as `<name>-pre-oci-<ts>`. Later redeploys
   (`deploy.sh start`/`restart`, CLAUDE.md §9.5) read the edited `.env.production`; `deploy.sh`
   refuses when its `DATABASE_URL` host is not `flowmate-db` unless `FLOWMATE_ALLOW_NON_OCI_DB=1`.
   ```bash
   ssh oci ~/flowmate-db/switch-workers.sh            # dry run: preflight, candidates checked and removed, nothing changed
   ssh oci ~/flowmate-db/switch-workers.sh --apply
   ```
   `--rollback` is valid **only until `switch-workers.sh --done` or the first `deploy.sh restart`,
   whichever comes first** (it refuses, without touching anything, if a container was replaced or an
   original removed, and prints the manual path). After step 9 succeeds: `ssh oci
   ~/flowmate-db/switch-workers.sh --done`.
   **Verify real DB connectivity** (`/health` only reports memory). Prints `db ok` / `db FAIL <code>`, never the URL:
   ```bash
   for c in flowmate-crawler flowmate-embedding; do
     ssh oci "docker exec $c node -e 'const t=setTimeout(()=>{console.log(\"db FAIL timeout\");process.exit(2)},15000);let P;try{P=require(\"@prisma/client\").PrismaClient}catch(e){console.log(\"db FAIL no-prisma-client\");process.exit(2)}const p=new P({errorFormat:\"minimal\"});p.\$queryRawUnsafe(\"SELECT 1 AS ok\").then(()=>{console.log(\"db ok\")},e=>{console.log(\"db FAIL \"+(e.errorCode||e.code||e.name));process.exitCode=1}).finally(()=>{clearTimeout(t);return p.\$disconnect()})' 2>/dev/null"
   done
   ssh oci "docker exec -u postgres flowmate-db psql -X -At -d flowmate -c \"SELECT usename, client_addr, count(*) FROM pg_stat_activity WHERE usename = 'flowmate_app' AND client_addr << '172.21.0.128/25'::inet GROUP BY 1, 2\""
   ```
   (The parser container has a SQLAlchemy module, but in the current image it fails to import —
   `Settings` has no `DEBUG` — so it holds no DB connection; check it with `/health` only.)
   Any failure: `ssh oci ~/flowmate-db/switch-workers.sh --rollback` (restores the previous
   containers with their original env and network, and `.env.production` from the backup).
7. **Vercel** (load the `vercel-account` skill first: flowcoder25 ↔ flowcoder25-1055): **Preview**
   `DATABASE_URL` and `DIRECT_URL` = the Vercel URL; preview deploy; check `/projects`,
   `/projects/[id]`, `/admin`. Then Production env + redeploy. Only now update the Mini
   `.env.local` (`SUPABASE_SOURCE_URL` stays in `~/.flowmate-cutover.env`).
8. **Mandatory lost-write gate on Supabase** (right after the switch, and again before you close the
   window): Supabase must still equal the dump-time manifest, i.e. nothing was written there after
   the dump. Do not compare against OCI here.
   ```bash
   Q row-counts.sql      | diff "$M.counts.tsv" -      # no output
   Q latest-writes.sql   | diff "$M.latest.tsv" -      # no output
   Q table-checksums.sql | diff "$M.checksums.tsv" -   # no output: no row of any table changed on Supabase
   ```
   Any difference = a write reached Supabase after the dump and is missing on OCI: reconcile it
   before going on (or roll back).
9. After: `/projects` TTFB within +100ms of before (~0.7s), the step-6 DB checks, `/admin` opens,
   logins work (writes now go to OCI), 24h of logs (`docker logs flowmate-pgbouncer`,
   `docker logs flowmate-db`, Vercel).

### Rollback

1. **Dump OCI first** — it holds every write since the switch: `ssh oci ~/flowmate-db/backup.sh`
   (keep that file; reconcile those writes into Supabase by hand if they matter).
2. Revert the env: Vercel Production (then Preview) back to the Supabase `DATABASE_URL`/`DIRECT_URL`
   and redeploy; workers: `ssh oci ~/flowmate-db/switch-workers.sh --rollback` (also restores
   `~/flowmate/.env.production` from `.env.production.pre-cutover-<ts>`, sha256-checked; afterwards
   `deploy.sh` needs `FLOWMATE_ALLOW_NON_OCI_DB=1`, since the file points at Supabase again). If
   `--rollback` refuses (after `--done` or a `deploy.sh restart`), follow the manual path it prints:
   `cp -p ~/flowmate/.env.production.pre-cutover-<ts> ~/flowmate/.env.production`, then
   `FLOWMATE_ALLOW_NON_OCI_DB=1 CRAWLER_IMAGE=… EMBEDDING_IMAGE=… PARSER_IMAGE=… ~/flowmate/deploy/oci/deploy.sh restart`.
   Mini: `cp -p ~/.flowmate-cutover.env.local /Volumes/포터블/Production/FlowMate/.env.local`.
3. Lift the fence on Supabase — only now, so nothing writes to both sides. A new session is
   read-only, so the `RESET` must run in an explicit read-write transaction (a bare `ALTER ROLE ...
   RESET` fails with "cannot execute ALTER ROLE in a read-only transaction"); then end the pooled
   sessions so they reconnect writable:
   ```bash
   SB psql -X -v ON_ERROR_STOP=1 <<'SQL'
   BEGIN READ WRITE;
   ALTER ROLE postgres IN DATABASE postgres RESET default_transaction_read_only;
   COMMIT;
   SELECT count(pg_terminate_backend(pid)) FROM pg_stat_activity
   WHERE usename = 'postgres' AND datname = 'postgres' AND pid <> pg_backend_pid() AND backend_type = 'client backend';
   SQL
   SB psql -X -At -c 'SHOW default_transaction_read_only'     # new session: off
   ```

Keep the observation window short: every hour on OCI is an hour of writes to reconcile on rollback.

### Post-cutover cleanup checklist (each item needs the user's approval; nothing is deleted automatically)

| Item | Where | Notes |
|---|---|---|
| Staging/previous databases | `flowmate_restore_*`, `flowmate_prev_*` in flowmate-db | listed with sizes by every `restore.sh` run; `DROP DATABASE <name>` once the live db is verified |
| Pre-switch worker containers | `flowmate-*-pre-oci-<ts>` (stopped, restart=no) | only AFTER `switch-workers.sh --done` (they are what `--rollback` restores): `docker rm <name>`; also `*-oci-rolledback-*` after a rollback |
| First (bookworm) rehearsal cluster | `/home/ubuntu/flowmate-db/data.bookworm-20261102` (uid 999, 700, ~326MB) | PII; `sudo rm -rf` after approval |
| Leaked verify-restore volumes | `69911ab8…`, `8808177c…` (from runs before the `rm -v` fix) | PII; `docker volume rm <id>` after approval (`04cf968a…` from 2026-09-29 is not ours) |
| Rehearsal migrate dump | `~/backup/flowmate-migrate/flowmate-public-migrate-20261101-2150.dump*` | PII |
| Supabase dumps on the portable drive | `/Volumes/포터블/Backups/FlowMate/flowmate-public-*-20261101-2150.dump` + `SHA256SUMS-20261101-2150.txt` | keep until Phase 4 decides on Supabase |
| `~/.flowmate-cutover.env` on the Mini | holds the Supabase URL (600) | delete after the observation window |
| `.env.production.pre-cutover-<ts>` on OCI | `~/flowmate/` (600, Supabase credentials) | keep until rollback is no longer an option |
| `switch.state*` | `~/flowmate-db/workers/` | `.done-*` / `.failed-*` / `.rolledback-*` are history only (no env copies are kept there) |

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
