-- Order-independent content checksum + row count of every table in schema public (read-only).
-- Three text columns: table_name, row_count, checksum (md5 of the sorted md5s of every row).
-- Used by the cutover gates (README): Supabase at dump time vs OCI staging (restore.sh, when
-- <dump>.checksums.tsv exists) and Supabase at dump time vs Supabase after the switch (catches
-- UPDATEs that row counts and max timestamps cannot see).
--
--   psql -X -q -At -F '<TAB>' -v ON_ERROR_STOP=1 -f table-checksums.sql
--
-- Text output is pinned for this transaction so both servers render values identically. Columns of
-- type vector are hashed as real[] (float4 output is defined by PostgreSQL, not by the pgvector
-- version; vector_out formatting may differ between pgvector releases). Dropped columns are
-- skipped, columns are taken in attnum order (pg_dump preserves it).
-- One transaction with SET LOCAL: the pinned settings hold for the SELECT even through PgBouncer
-- transaction pooling (a plain SET could land on another server connection).
BEGIN;
SET LOCAL TimeZone = 'UTC';
SET LOCAL DateStyle = 'ISO, MDY';
SET LOCAL IntervalStyle = 'postgres';
SET LOCAL extra_float_digits = 1;
SET LOCAL bytea_output = 'hex';
SET LOCAL lc_monetary = 'C';
SET LOCAL lc_numeric = 'C';
SET LOCAL standard_conforming_strings = on;
SET LOCAL search_path = pg_catalog;
SELECT
  c.relname::text AS table_name,
  (xpath('/row/n/text()', x.r))[1]::text AS row_count,
  (xpath('/row/cs/text()', x.r))[1]::text AS checksum
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN LATERAL (
  SELECT string_agg(
           CASE WHEN pg_catalog.format_type(a.atttypid, NULL) IN ('vector', 'public.vector')
                THEN pg_catalog.format('%I::real[]', a.attname)
                ELSE pg_catalog.format('%I', a.attname) END,
           ', ' ORDER BY a.attnum) AS cols
  FROM pg_catalog.pg_attribute AS a
  WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
) AS col
CROSS JOIN LATERAL (
  SELECT pg_catalog.query_to_xml(pg_catalog.format(
    'SELECT count(*) AS n, md5(coalesce(string_agg(h, %L ORDER BY h COLLATE "C"), %L)) AS cs '
    'FROM (SELECT md5(ROW(%s)::text) AS h FROM %I.%I) AS s',
    '', '', col.cols, n.nspname, c.relname), false, true, '') AS r
) AS x
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND NOT c.relispartition
ORDER BY c.relname COLLATE "C";
COMMIT;
