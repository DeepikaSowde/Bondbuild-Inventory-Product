-- ============================================================================
-- verify_schema.sql
-- Purpose: Prove that two PostgreSQL databases have an IDENTICAL structure
--          (tables, columns, functions, indexes, constraints, sequences,
--           triggers) -- regardless of the data inside them.
--
-- Usage:   Run each query on BOTH databases (e.g. DigitalOcean and Neon) and
--          compare the results. Neon's SQL Editor has a "Download CSV" button
--          which makes diffing the larger result sets easy.
--
-- Quick gate: Query 4 returns a single hash. If the hash matches on both
--             databases, the structures are identical -- no eyeballing needed.
--             If it differs, use Query 1 to find WHICH category is off, then
--             Query 2 / 3 to pinpoint the exact table / column.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. ONE-SHOT SUMMARY  (fastest overview -- one row of counts)
--    Run on both; every column should match.
-- ----------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM information_schema.tables            WHERE table_schema='public' AND table_type='BASE TABLE') AS tables,
  (SELECT count(*) FROM information_schema.views             WHERE table_schema='public')                             AS views,
  (SELECT count(*) FROM information_schema.columns           WHERE table_schema='public')                             AS columns,
  (SELECT count(*) FROM information_schema.routines          WHERE routine_schema='public')                           AS functions,
  (SELECT count(*) FROM pg_indexes                           WHERE schemaname='public')                               AS indexes,
  (SELECT count(*) FROM information_schema.sequences         WHERE sequence_schema='public')                          AS sequences,
  (SELECT count(*) FROM information_schema.table_constraints WHERE table_schema='public')                             AS constraints,
  (SELECT count(*) FROM information_schema.triggers          WHERE trigger_schema='public')                           AS triggers;


-- ----------------------------------------------------------------------------
-- 2. PER-TABLE COLUMN COUNTS  (catches a missing/extra column in one table)
--    Compare the two lists side by side.
-- ----------------------------------------------------------------------------
SELECT table_name, count(*) AS cols
FROM information_schema.columns
WHERE table_schema='public'
GROUP BY table_name
ORDER BY table_name;


-- ----------------------------------------------------------------------------
-- 3. FULL COLUMN FINGERPRINT  (the definitive diff)
--    Export both results to CSV and diff them -- zero differences = identical.
-- ----------------------------------------------------------------------------
SELECT
  table_name,
  column_name,
  data_type,
  coalesce(character_maximum_length::text, '') AS len,
  is_nullable,
  coalesce(column_default, '')                 AS dflt
FROM information_schema.columns
WHERE table_schema='public'
ORDER BY table_name, ordinal_position;


-- ----------------------------------------------------------------------------
-- 4. SCHEMA HASH  (single-number pass/fail -- run this first)
--    Same hash on both databases = identical column layout.
-- ----------------------------------------------------------------------------
SELECT md5(string_agg(
         table_name || '|' || column_name || '|' || data_type || '|' || is_nullable,
         ',' ORDER BY table_name, ordinal_position)) AS schema_hash
FROM information_schema.columns
WHERE table_schema='public';


-- ----------------------------------------------------------------------------
-- 5. FUNCTIONS  (names + argument signatures)
-- ----------------------------------------------------------------------------
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
ORDER BY 1, 2;


-- ----------------------------------------------------------------------------
-- 6. INDEXES  (per-table index names -- optional deeper check)
-- ----------------------------------------------------------------------------
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname='public'
ORDER BY tablename, indexname;


-- ----------------------------------------------------------------------------
-- 7. CONSTRAINTS  (primary keys, foreign keys, unique, checks)
-- ----------------------------------------------------------------------------
SELECT table_name, constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_schema='public'
ORDER BY table_name, constraint_type, constraint_name;
