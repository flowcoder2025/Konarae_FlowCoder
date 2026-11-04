-- FlowMate roles, privileges and the PgBouncer auth function.
--
-- Plan-approved exception to "Prisma-first": roles/privileges/auth function only.
-- NO table DDL here — tables come from pg_restore or `prisma db push`.
--
-- Run as the postgres superuser over the local socket (peer auth), in db flowmate or in a
-- restore staging db flowmate_restore_<YYYYmmdd_HHMMSS> (restore.sh; grants on a database
-- object survive its rename).
-- Passwords are read from the environment with \getenv, never from argv:
--   FLOWMATE_OWNER_PASSWORD=... FLOWMATE_APP_PASSWORD=... PGBOUNCER_AUTH_PASSWORD=... \
--   docker exec -i -u postgres -e FLOWMATE_OWNER_PASSWORD -e FLOWMATE_APP_PASSWORD \
--     -e PGBOUNCER_AUTH_PASSWORD -e FLOWMATE_ROTATE_PASSWORDS flowmate-db \
--     psql -X -q -v ON_ERROR_STOP=1 -d flowmate -f - < roles.sql
-- (common.sh `apply_roles` does exactly this.)
--
-- Idempotent. Passwords are only set when a role has none yet, or when
-- FLOWMATE_ROTATE_PASSWORDS=1 (re-setting would change the SCRAM salt for no reason).

\set ON_ERROR_STOP on
\set VERBOSITY terse
\set SHOW_CONTEXT never
SET client_min_messages = warning;

-- Never log statement text from this session: a failing ALTER ROLE ... PASSWORD
-- would otherwise be written to the server log (log_min_error_statement).
SET log_min_error_statement = panic;
SET log_min_duration_statement = -1;
SET log_statement = 'none';

SELECT current_database() ~ '^flowmate(_restore_[0-9]{8}_[0-9]{6})?$' AND current_user = 'postgres' AS roles_ctx_ok,
       current_database() AS target_db \gset
\if :roles_ctx_ok
\else
  \echo 'roles.sql: must run as postgres in database flowmate (or a restore staging db)'
  DO $$ BEGIN RAISE EXCEPTION 'roles.sql: wrong database or user'; END $$;
\endif

\getenv owner_pw FLOWMATE_OWNER_PASSWORD
\getenv app_pw FLOWMATE_APP_PASSWORD
\getenv auth_pw PGBOUNCER_AUTH_PASSWORD
\getenv rotate_pw FLOWMATE_ROTATE_PASSWORDS
\if :{?owner_pw}
\else
  DO $$ BEGIN RAISE EXCEPTION 'roles.sql: FLOWMATE_OWNER_PASSWORD not set'; END $$;
\endif
\if :{?app_pw}
\else
  DO $$ BEGIN RAISE EXCEPTION 'roles.sql: FLOWMATE_APP_PASSWORD not set'; END $$;
\endif
\if :{?auth_pw}
\else
  DO $$ BEGIN RAISE EXCEPTION 'roles.sql: PGBOUNCER_AUTH_PASSWORD not set'; END $$;
\endif
\if :{?rotate_pw}
\else
  \set rotate_pw 0
\endif

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
SELECT format('CREATE ROLE %I', r)
FROM unnest(ARRAY['flowmate_owner', 'flowmate_app', 'pgbouncer_auth']) AS r
WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = r)
\gexec

ALTER ROLE flowmate_owner WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE flowmate_app   WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE pgbouncer_auth WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;

-- Mirror the Supabase source's 2-minute statement timeout for the app role.
ALTER ROLE flowmate_app SET statement_timeout = '120s';

SELECT rolpassword IS NULL OR :'rotate_pw' = '1' AS set_owner_pw
FROM pg_catalog.pg_authid WHERE rolname = 'flowmate_owner' \gset
SELECT rolpassword IS NULL OR :'rotate_pw' = '1' AS set_app_pw
FROM pg_catalog.pg_authid WHERE rolname = 'flowmate_app' \gset
SELECT rolpassword IS NULL OR :'rotate_pw' = '1' AS set_auth_pw
FROM pg_catalog.pg_authid WHERE rolname = 'pgbouncer_auth' \gset

\if :set_owner_pw
  ALTER ROLE flowmate_owner PASSWORD :'owner_pw';
  \echo 'roles.sql: flowmate_owner password set'
\endif
\if :set_app_pw
  ALTER ROLE flowmate_app PASSWORD :'app_pw';
  \echo 'roles.sql: flowmate_app password set'
\endif
\if :set_auth_pw
  ALTER ROLE pgbouncer_auth PASSWORD :'auth_pw';
  \echo 'roles.sql: pgbouncer_auth password set'
\endif

-- ---------------------------------------------------------------------------
-- Database
-- ---------------------------------------------------------------------------
-- Owner => member of pg_database_owner => owns schema public (CREATE for
-- pg_restore --role=flowmate_owner and prisma db push).
ALTER DATABASE :"target_db" OWNER TO flowmate_owner;
REVOKE ALL ON DATABASE :"target_db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"target_db" TO flowmate_app, pgbouncer_auth;
-- Nobody but the superuser needs the maintenance databases.
REVOKE CONNECT ON DATABASE postgres, template1 FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Schema public: flowmate_app gets DML only. No CREATE, TRUNCATE, REFERENCES,
-- TRIGGER, MAINTAIN; not the owner, so no DROP/ALTER either.
-- ---------------------------------------------------------------------------
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM flowmate_app;
GRANT USAGE ON SCHEMA public TO flowmate_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO flowmate_app;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON ALL TABLES IN SCHEMA public FROM flowmate_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO flowmate_app;

-- Future objects created by flowmate_owner (prisma db push, pg_restore --role).
ALTER DEFAULT PRIVILEGES FOR ROLE flowmate_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO flowmate_app;
ALTER DEFAULT PRIVILEGES FOR ROLE flowmate_owner IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO flowmate_app;

-- Functions: no EXECUTE for PUBLIC on flowmate_owner's functions, explicit grant to the app.
-- The REVOKE must be the global (no IN SCHEMA) form: per-schema default privileges can only
-- add to the global defaults, so `IN SCHEMA public REVOKE ... FROM PUBLIC` would be a no-op.
ALTER DEFAULT PRIVILEGES FOR ROLE flowmate_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE flowmate_owner IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO flowmate_app;
-- Existing functions in public that came from a restore (e.g. hybrid_search, called by
-- src/lib/rag.ts). Extension members (pgvector) keep their defaults: vector operators need them.
SELECT format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', p.oid::regprocedure),
       format('GRANT EXECUTE ON FUNCTION %s TO flowmate_app', p.oid::regprocedure)
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend AS d
                  WHERE d.classid = 'pg_catalog.pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
\gexec

-- ---------------------------------------------------------------------------
-- PgBouncer auth_query function. Own schema (not public) so it stays out of
-- `prisma migrate diff` and `-n public` dumps. Owned by postgres (needs pg_authid).
-- Returns a verifier ONLY for flowmate_app, so even a loosened pg_hba would not
-- let postgres / flowmate_owner authenticate through PgBouncer.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS pgbouncer AUTHORIZATION postgres;
ALTER SCHEMA pgbouncer OWNER TO postgres;
REVOKE ALL ON SCHEMA pgbouncer FROM PUBLIC;
GRANT USAGE ON SCHEMA pgbouncer TO pgbouncer_auth;

CREATE OR REPLACE FUNCTION pgbouncer.get_auth(p_username text)
RETURNS TABLE (username text, password text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT a.rolname::text, a.rolpassword
  FROM pg_catalog.pg_authid AS a
  WHERE a.rolname = p_username
    AND a.rolname = 'flowmate_app'
    AND a.rolcanlogin
    AND NOT a.rolsuper
    AND (a.rolvaliduntil IS NULL OR a.rolvaliduntil > pg_catalog.now())
$fn$;

ALTER FUNCTION pgbouncer.get_auth(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION pgbouncer.get_auth(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pgbouncer.get_auth(text) TO pgbouncer_auth;

\echo 'roles.sql: ok'
