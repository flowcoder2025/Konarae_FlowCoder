-- Latest-write fingerprint for the cutover lost-write gate (read-only).
-- Two text columns: key, value. Run on SUPABASE at dump time (saved next to the migrate dump as
-- <dump>.latest.tsv, together with row-counts.sql as <dump>.counts.tsv) and again on SUPABASE after
-- the switch: identical output = nothing was written to Supabase after the dump.
-- Only "User" and "SupportProject" have "updatedAt"; the others use their newest timestamp column
-- plus a row count. Updates to tables without a timestamp are not visible here; the write fence
-- (README, cutover step 2) is what prevents them, this only checks that it held.
SELECT 'User.updatedAt' AS key, coalesce(max("updatedAt")::text, '-') AS value FROM "User"
UNION ALL SELECT 'Account.expires_at/count', coalesce(max(expires_at)::text, '-') || '/' || count(*) FROM "Account"
UNION ALL SELECT 'Session.expires/count', coalesce(max(expires)::text, '-') || '/' || count(*) FROM "Session"
UNION ALL SELECT 'CrawlJob.createdAt/completedAt', coalesce(max("createdAt")::text, '-') || '/' || coalesce(max("completedAt")::text, '-') FROM "CrawlJob"
UNION ALL SELECT 'SupportProject.updatedAt', coalesce(max("updatedAt")::text, '-') FROM "SupportProject"
ORDER BY 1;
