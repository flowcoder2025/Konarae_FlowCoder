-- Privilege self-check for the flowmate schema (read-only). Run by install.sh and restore.sh
-- (as postgres, in the target db). Every returned row is a violation; the scripts fail on any.
SELECT 'table not owned by flowmate_owner: ' || c.relname || ' (owner ' || pg_catalog.pg_get_userbyid(c.relowner) || ')'
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
  AND c.relowner <> 'flowmate_owner'::regrole
UNION ALL
-- One check per privilege: has_table_privilege(..., 'A, B') is true if ANY of them is held.
SELECT 'flowmate_app lacks ' || p.priv || ' on ' || c.relname
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(priv)
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  AND NOT pg_catalog.has_table_privilege('flowmate_app', c.oid, p.priv)
UNION ALL
SELECT 'flowmate_app has ' || p.priv || ' on ' || c.relname
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN (VALUES ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) AS p(priv)
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  AND pg_catalog.has_table_privilege('flowmate_app', c.oid, p.priv)
UNION ALL
SELECT 'flowmate_app lacks USAGE on sequence ' || c.relname
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'S'
  -- CASE: the planner may evaluate this for non-sequences first (has_sequence_privilege errors on them)
  AND CASE WHEN c.relkind = 'S' THEN NOT pg_catalog.has_sequence_privilege('flowmate_app', c.oid, 'USAGE') ELSE false END
UNION ALL
SELECT 'flowmate_app can CREATE in schema public'
WHERE pg_catalog.has_schema_privilege('flowmate_app', 'public', 'CREATE')
UNION ALL
SELECT 'PUBLIC can execute ' || p.oid::regprocedure::text
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'pgbouncer')
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend AS d
                  WHERE d.classid = 'pg_catalog.pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(p.proacl) AS a WHERE a.grantee = 0))
UNION ALL
SELECT 'pgbouncer.get_auth missing or not SECURITY DEFINER owned by postgres'
WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p
                  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'pgbouncer' AND p.proname = 'get_auth'
                    AND p.prosecdef AND p.proowner = 'postgres'::regrole);
