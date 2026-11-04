-- Exact row count of every table in schema public, sorted by table name (C order).
-- Read-only. Two text columns: table_name, row_count.
--
-- Shared by:
--   backup.sh / verify-restore.sh  psql -X -q -At -F '<TAB>' -f row-counts.sql  -> "<table>\t<count>" lines
--   scripts/db/compare-row-counts.ts  (Prisma $queryRawUnsafe on this file's text)
-- Keep it a single statement without psql meta-commands (the TS loader strips the final ";").
-- Partitions are skipped (NOT relispartition): a partitioned parent counts its children.
-- The schema has no partitioned tables today; revisit the manifests if one is added.
SELECT
  c.relname::text AS table_name,
  (xpath(
    '/row/cnt/text()',
    query_to_xml(format('SELECT count(*) AS cnt FROM %I.%I', n.nspname, c.relname), false, true, '')
  ))[1]::text AS row_count
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND NOT c.relispartition
ORDER BY c.relname COLLATE "C";
