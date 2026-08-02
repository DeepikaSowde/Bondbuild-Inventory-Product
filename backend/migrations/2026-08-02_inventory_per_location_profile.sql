-- Allow the same Profile Code (item_code) to exist in more than one location,
-- each as its own inventory row with an independent quantity.
--
-- Before: UNIQUE (item_code)                -- one row per profile code, globally
-- After:  UNIQUE (item_code, location_id)   -- one row per profile code PER location
--
-- location_id is made NOT NULL because Postgres treats NULLs as distinct: a
-- composite unique that includes a nullable column would silently allow
-- unlimited duplicate rows whenever location_id IS NULL. The POST/PUT and Excel
-- import paths already resolve (and create) a location_id for every row, so the
-- NOT NULL is safe for new writes; the backfill below covers existing rows.
--
-- Wrapped in a transaction so a failed guard rolls the whole thing back and
-- leaves the old constraint intact. Run separately on prod (DigitalOcean) and
-- dev (Neon) — they are migrated independently.

BEGIN;

-- 1. Backfill location_id for legacy rows that only carry location_code.
UPDATE inventory AS inv
   SET location_id = sl.id
  FROM storage_locations sl
 WHERE inv.location_id IS NULL
   AND inv.location_code IS NOT NULL
   AND inv.location_code = sl.location_code;

-- 2. Fail loudly (clear message) if any row still lacks a location. Fix the
--    data — assign a location — then re-run; do not weaken the constraint.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM inventory WHERE location_id IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Cannot add per-location constraint: % inventory row(s) have no location_id. Assign a location to these rows first.', n;
  END IF;
END $$;

-- 3. Fail loudly if the new rule is already violated (true duplicates of the
--    same code in the same location). These must be merged before migrating.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT item_code, location_id
      FROM inventory
     GROUP BY item_code, location_id
    HAVING count(*) > 1
  ) d;
  IF n > 0 THEN
    RAISE EXCEPTION 'Cannot add per-location constraint: % duplicate (item_code, location_id) group(s) exist. Merge them first.', n;
  END IF;
END $$;

-- 4. Enforce location presence, then swap the global unique for a per-location one.
ALTER TABLE inventory
  ALTER COLUMN location_id SET NOT NULL;

ALTER TABLE inventory
  DROP CONSTRAINT IF EXISTS inventory_item_code_key;

ALTER TABLE inventory
  ADD CONSTRAINT inventory_item_code_location_key UNIQUE (item_code, location_id);

COMMIT;

-- Rollback:
--   BEGIN;
--   ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_item_code_location_key;
--   ALTER TABLE inventory ADD  CONSTRAINT inventory_item_code_key UNIQUE (item_code);
--   ALTER TABLE inventory ALTER COLUMN location_id DROP NOT NULL;
--   COMMIT;
