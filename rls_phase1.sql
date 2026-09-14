-- ================================================================
-- LabHive RLS — Complete row-level security for all tables
-- Run this entire script in Supabase SQL Editor (single block).
-- ================================================================
-- Architecture:
--   • Team users:    users.auth_id  = auth.uid(), scoped by organization_id
--   • Solo users:    solo_users.auth_id = auth.uid(), scoped by solo_owner_id / user_id
--   • Super admin:   settings.super_admin_auth_id = auth.uid()::text
--   • After sb.auth.signInWithPassword() all queries run as 'authenticated' role
--
-- Identity columns (user_id, created_by, uploaded_by, sender_id, …) are 'text'
-- in some tables and 'uuid' in others, so every comparison against the
-- uuid-returning helpers casts BOTH sides to ::text.
--
-- Every policy is applied through _apply_rls(), which SKIPS any table that
-- does not exist — so tables referenced only in code (e.g. equipment_list)
-- are ignored rather than aborting the whole script.
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- STEP 1: Helper functions
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM settings
    WHERE key = 'super_admin_auth_id' AND value = auth.uid()::text
  )
$$;

CREATE OR REPLACE FUNCTION my_user_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT id FROM users WHERE auth_id = auth.uid() LIMIT 1
$$;

-- my_user_id() is NON-DETERMINISTIC when one auth account owns several users
-- rows, which is normal here: Login.jsx auto-links every users row sharing an
-- email to the same auth_id, so the demo account (Demo Manager + Demo User)
-- and any "admin added as another role" have 2+ rows. `LIMIT 1` with no
-- ORDER BY then returns an arbitrary one, so an ownership check like
-- `user_id = my_user_id()` could silently evaluate false for rows the user
-- genuinely owns — a notification addressed to their Lab User row was hidden
-- while they were signed in under that very row. Intermittent, because the
-- row Postgres happens to return can change.
--
-- Ownership checks therefore use this set-returning version: every identity
-- behind the same auth account. That is the correct boundary — it is one
-- human, who may sign in as any of their rows via the role picker — and it
-- does NOT widen access across accounts or organizations.
CREATE OR REPLACE FUNCTION my_user_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  -- COALESCE rather than a bare equality test: a NULL is_active must not
  -- lock anyone out.
  -- Deactivating a user has to revoke DATA access, not just block the
  -- login screen — Supabase auth sessions survive deactivation, so
  -- without this a deactivated account keeps reading its org's rows.
  SELECT id FROM users WHERE auth_id = auth.uid() AND COALESCE(is_active, true)
$$;

CREATE OR REPLACE FUNCTION my_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT organization_id FROM users WHERE auth_id = auth.uid() LIMIT 1
$$;

-- Same LIMIT 1 hazard as my_user_id(): one auth account can own users rows in
-- more than one organization (a person who works with two labs), and with no
-- ORDER BY this returns an arbitrary one. Every org-scoped policy would then
-- resolve to a random org — the user sees one org's data at random, and a
-- write whose organization_id came from the app session is REJECTED by
-- WITH CHECK whenever the two disagree. Silent and intermittent.
--
-- Org scoping therefore uses this set-returning version: every organization
-- the account actually belongs to. This does not widen access — a row is only
-- reachable if one of the user's own rows is in that organization.
CREATE OR REPLACE FUNCTION my_org_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT DISTINCT organization_id FROM users
  WHERE auth_id = auth.uid() AND organization_id IS NOT NULL
    AND COALESCE(is_active, true)
$$;

CREATE OR REPLACE FUNCTION my_solo_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT id FROM solo_users WHERE auth_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION my_solo_email()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT email FROM solo_users WHERE auth_id = auth.uid() LIMIT 1
$$;

-- Applies a single policy to a table.
--   • Skips tables that don't exist.
--   • Drops the common blanket policies (allow_all/anon_all) for THIS table
--     only — so tables we don't cover keep their existing open policy and are
--     never locked out.
--   • If the policy body references a column/type that doesn't exist, it
--     DISABLES RLS on the table (leaving it open, as it is today) and reports
--     the problem via NOTICE instead of aborting the whole script.
-- body = everything after "CREATE POLICY <name> ON <table> "
CREATE OR REPLACE FUNCTION _apply_rls(tbl text, pol text, body text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass('public.' || tbl) IS NULL THEN
    RAISE NOTICE 'SKIP (no table): %', tbl;
    RETURN;
  END IF;
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'allow_all', tbl);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'anon_all', tbl);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
  BEGIN
    EXECUTE format('CREATE POLICY %I ON public.%I %s', pol, tbl, body);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  EXCEPTION WHEN OTHERS THEN
    -- leave the table OPEN rather than locked-out; report for manual fix
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl);
    RAISE NOTICE 'SKIP (mismatch) %/%  [%] %', tbl, pol, SQLSTATE, SQLERRM;
  END;
END $$;


-- ────────────────────────────────────────────────────────────────
-- STEP 3: settings
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('settings', 'settings_read_anon', $b$
FOR SELECT TO anon
USING (key NOT IN ('admin_password','admin_email','super_admin_auth_id'))
$b$);

-- Authenticated users may read super_admin_auth_id (it's only a UUID and the
-- login flow compares it after signInWithPassword). Credentials stay hidden.
SELECT _apply_rls('settings', 'settings_read_auth', $b$
FOR SELECT TO authenticated
USING (is_super_admin() OR key NOT IN ('admin_password','admin_email'))
$b$);

SELECT _apply_rls('settings', 'settings_write', $b$
FOR ALL TO authenticated
USING (is_super_admin()) WITH CHECK (is_super_admin())
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 4: organizations
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('organizations', 'orgs_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR id IN (SELECT oid FROM my_org_ids() AS oid))
WITH CHECK (is_super_admin() OR id IN (SELECT oid FROM my_org_ids() AS oid))
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 5: users
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('users', 'users_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 6: solo_users
-- ────────────────────────────────────────────────────────────────

-- Solo profiles support the same avatar picker as team profiles, and the
-- session already reads solo_users.avatar. A SELECT on a missing column just
-- yields undefined, so the gap only shows on WRITE — picking an avatar as a
-- solo user would fail. Added here so the two user tables stay in step.
ALTER TABLE solo_users ADD COLUMN IF NOT EXISTS avatar TEXT;

SELECT _apply_rls('solo_users', 'solo_users_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR auth_id = auth.uid())
WITH CHECK (is_super_admin() OR auth_id = auth.uid())
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 7: user_screen_access, user_dashboard_prefs
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('user_screen_access', 'user_screen_access_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
$b$);

SELECT _apply_rls('user_dashboard_prefs', 'user_dashboard_prefs_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 8: equipment_inventory + org metadata tables
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('equipment_inventory', 'equipment_inventory_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR (login_mode = 'solo' AND solo_owner_id = my_solo_id())
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR (login_mode = 'solo' AND solo_owner_id = my_solo_id())
)
$b$);

SELECT _apply_rls('equipment_categories', 'equipment_categories_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
$b$);

SELECT _apply_rls('equipment_locations', 'equipment_locations_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
$b$);

SELECT _apply_rls('equipment_booking_settings', 'equipment_booking_settings_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE login_mode = 'solo' AND solo_owner_id = my_solo_id())
)
WITH CHECK (
  is_super_admin()
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE login_mode = 'solo' AND solo_owner_id = my_solo_id())
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 9: equipment_bookings, booking_notifications, equipment_booking_blocks
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('equipment_bookings', 'equipment_bookings_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE login_mode = 'solo' AND solo_owner_id = my_solo_id())
)
WITH CHECK (
  is_super_admin()
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE login_mode = 'solo' AND solo_owner_id = my_solo_id())
)
$b$);

SELECT _apply_rls('booking_notifications', 'booking_notifications_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
$b$);

SELECT _apply_rls('equipment_booking_blocks', 'equipment_booking_blocks_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 10: equipment hub (SOPs, videos, exams, calibration, details, …)
-- ────────────────────────────────────────────────────────────────

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'equipment_sop','equipment_videos','equipment_standards',
    'equipment_exam_questions','equipment_exam_results',
    'equipment_calibration','equipment_temp_access',
    'equipment_material_progress','equipment_details'
  ]
  LOOP
    PERFORM _apply_rls(t, 'eq_hub_policy', $b$
      FOR ALL TO authenticated
      USING (
        is_super_admin()
        OR equipment_id IN (
          SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid)
          UNION ALL
          SELECT id FROM equipment_inventory WHERE login_mode = 'solo' AND solo_owner_id = my_solo_id()
        )
      )
      WITH CHECK (
        is_super_admin()
        OR equipment_id IN (
          SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid)
          UNION ALL
          SELECT id FROM equipment_inventory WHERE login_mode = 'solo' AND solo_owner_id = my_solo_id()
        )
      )
    $b$);
  END LOOP;
END $$;

SELECT _apply_rls('equipment_sop_notes', 'equipment_sop_notes_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
$b$);

SELECT _apply_rls('equipment_list', 'equipment_list_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin())
WITH CHECK (is_super_admin())
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 11: rooms, supplies, inspections
-- ────────────────────────────────────────────────────────────────

-- These three tables serve BOTH team users (organization_id) and solo users.
-- solo_owner_id added Sept 2026: without it a solo user's rows carry
-- organization_id = NULL, so `organization_id IN (SELECT oid FROM my_org_ids() AS oid)` evaluates to NULL
-- (never true) and every solo INSERT was silently rejected and every SELECT
-- returned nothing. Do NOT drop the solo branch from these policies.
ALTER TABLE rooms       ADD COLUMN IF NOT EXISTS solo_owner_id uuid;
ALTER TABLE supplies    ADD COLUMN IF NOT EXISTS solo_owner_id uuid;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS solo_owner_id uuid;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['rooms','supplies','inspections']
  LOOP
    PERFORM _apply_rls(t, 'org_scope_policy', $b$
      FOR ALL TO authenticated
      USING (
        is_super_admin()
        OR (organization_id IS NOT NULL AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
        OR (solo_owner_id  IS NOT NULL AND solo_owner_id  = my_solo_id())
      )
      WITH CHECK (
        is_super_admin()
        OR (organization_id IS NOT NULL AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
        OR (solo_owner_id  IS NOT NULL AND solo_owner_id  = my_solo_id())
      )
    $b$);
  END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────────
-- STEP 12: floor_plans, storage_locations, student_lockers
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('floor_plans', 'floor_plans_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
$b$);

SELECT _apply_rls('storage_locations', 'storage_locations_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR (organization_id IS NULL AND my_solo_id() IS NOT NULL)
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR (organization_id IS NULL AND my_solo_id() IS NOT NULL)
)
$b$);

-- lab_user_lockers schema repair. The two projects' locker tables had drifted
-- apart: ICT-Lab was missing assigned_at and notes entirely, so assigning a
-- locker failed with "Could not find the 'assigned_at' column" — the shared
-- TrainingRecords upsert writes both. Added with IF NOT EXISTS so whichever
-- project already has them is untouched.
ALTER TABLE lab_user_lockers ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE lab_user_lockers ADD COLUMN IF NOT EXISTS notes       TEXT;

-- The assign upsert uses onConflict 'organization_id,locker_number', and
-- Postgres rejects that outright without a matching unique index (same trap as
-- feedback_responses). Created only when no duplicate pair exists, so a table
-- with existing duplicates reports instead of failing the whole script.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM lab_user_lockers
    GROUP BY organization_id, locker_number HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS lab_user_lockers_org_number_uniq
      ON lab_user_lockers (organization_id, locker_number);
  ELSE
    RAISE NOTICE 'lab_user_lockers: duplicate (organization_id, locker_number) rows — unique index NOT created; locker assignment will keep failing until they are resolved';
  END IF;
END $$;

SELECT _apply_rls('lab_user_lockers', 'lab_user_lockers_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 13: projects + child tables
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('projects', 'projects_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR solo_owner_id = my_solo_id()
  OR solo_owner_id IN (SELECT owner_id FROM solo_workspace_members WHERE member_id = my_solo_id())
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR solo_owner_id = my_solo_id()
)
$b$);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_files','project_results','project_links']
  LOOP
    PERFORM _apply_rls(t, 'project_child_policy', $b$
      FOR ALL TO authenticated
      USING (
        is_super_admin()
        OR project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid) OR solo_owner_id = my_solo_id())
      )
      WITH CHECK (
        is_super_admin()
        OR project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid) OR solo_owner_id = my_solo_id())
      )
    $b$);
  END LOOP;
END $$;

-- project_materials is NOT a simple project child: materials can exist
-- "standalone" (project_id NULL, e.g. NewMaterialModal's "None / standalone"
-- option) and app code scopes those directly by organization_id/solo_owner_id
-- columns on this table (dozens of query filters in ProjectMaterial.jsx).
-- Those two columns were missing from the schema entirely (Sept 2026 bug —
-- blocked ALL material creation for every org and solo user, not just one).
ALTER TABLE project_materials ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE project_materials ADD COLUMN IF NOT EXISTS solo_owner_id UUID;
-- storage_date was also missing (found immediately after the above fix) —
-- NewMaterialModal's payload has always included it alongside sampling_date.
ALTER TABLE project_materials ADD COLUMN IF NOT EXISTS storage_date DATE;

-- agg_sieve_sizes was typed `text` instead of `jsonb`, unlike its sibling
-- array columns (locations, photos) on this same table. The app always sends
-- a real JS array; against a `text` column the Supabase client JSON.stringifies
-- it before insert, and PostgREST hands it back as a literal string on read
-- (e.g. '["2\""]') instead of a parsed array. The Materials tab does
-- `(m.agg_sieve_sizes || []).map(...)` — since a non-empty string is truthy,
-- it skips the `|| []` fallback and calls .map() on a string, which crashes
-- the whole screen (Sept 2026, hit on any aggregate material with a sieve
-- size set, for every org).
UPDATE project_materials SET agg_sieve_sizes = NULL
WHERE agg_sieve_sizes IS NOT NULL AND agg_sieve_sizes::text !~ '^\s*\[.*\]\s*$';
ALTER TABLE project_materials
  ALTER COLUMN agg_sieve_sizes TYPE jsonb
  USING CASE
    WHEN agg_sieve_sizes IS NULL OR agg_sieve_sizes::text = '' THEN '[]'::jsonb
    ELSE agg_sieve_sizes::jsonb
  END;
ALTER TABLE project_materials ALTER COLUMN agg_sieve_sizes SET DEFAULT '[]'::jsonb;

-- project_materials.project_id had NO foreign key constraint at all — the
-- Materials tab's load query embeds `projects(id, name, project_id)` via
-- PostgREST, which requires a real FK to resolve the relationship. Without
-- it the ENTIRE query errors out (not just rows missing a project), and
-- loadAllMaterials() doesn't check the error, so the Materials list silently
-- renders empty for every org and solo user, standalone or not (Sept 2026).
-- Nullify any orphaned references first so the ADD CONSTRAINT doesn't fail.
UPDATE project_materials SET project_id = NULL
WHERE project_id IS NOT NULL AND project_id NOT IN (SELECT id FROM projects);

ALTER TABLE project_materials DROP CONSTRAINT IF EXISTS project_materials_project_id_fkey;
ALTER TABLE project_materials
  ADD CONSTRAINT project_materials_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

-- barcode_id identifies a physically printed label, so duplicates are a real
-- hazard: two containers scanning to the same record. There was no constraint
-- at all, and the old generator numbered by position within the loaded list,
-- so collisions were easy to produce. Guarded so a table that already holds
-- duplicates reports them instead of failing the whole script.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM project_materials
    WHERE barcode_id IS NOT NULL
    GROUP BY barcode_id HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'project_materials: duplicate barcode_id values — unique index NOT created. Resolve them, then re-run.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS project_materials_barcode_id_uniq
      ON project_materials (barcode_id) WHERE barcode_id IS NOT NULL;
  END IF;
END $$;

-- Material reduction: a derived material (e.g. one sieve fraction) points back
-- at the material it came from. Kept on project_materials rather than a join
-- table because a fraction IS a material — it needs its own barcode, storage
-- location, quantity and QR label like any other.
ALTER TABLE project_materials ADD COLUMN IF NOT EXISTS parent_material_id UUID;
ALTER TABLE project_materials ADD COLUMN IF NOT EXISTS reduction_method   TEXT;
ALTER TABLE project_materials ADD COLUMN IF NOT EXISTS reduction_value    TEXT;
CREATE INDEX IF NOT EXISTS project_materials_parent_idx ON project_materials(parent_material_id);

-- ON DELETE SET NULL, not CASCADE: deleting a parent must not silently destroy
-- fractions that physically exist on a shelf.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_materials_parent_fkey') THEN
    ALTER TABLE project_materials
      ADD CONSTRAINT project_materials_parent_fkey
      FOREIGN KEY (parent_material_id) REFERENCES project_materials(id) ON DELETE SET NULL;
  END IF;
END $$;

SELECT _apply_rls('project_materials', 'project_materials_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR (organization_id IS NOT NULL AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR (solo_owner_id IS NOT NULL AND solo_owner_id = my_solo_id())
  OR project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid) OR solo_owner_id = my_solo_id())
)
WITH CHECK (
  is_super_admin()
  OR (organization_id IS NOT NULL AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR (solo_owner_id IS NOT NULL AND solo_owner_id = my_solo_id())
  OR project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid) OR solo_owner_id = my_solo_id())
)
$b$);

SELECT _apply_rls('project_record_files', 'project_record_files_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid) OR solo_owner_id = my_solo_id())
)
WITH CHECK (
  is_super_admin()
  OR project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid) OR solo_owner_id = my_solo_id())
)
$b$);

SELECT _apply_rls('project_supplies', 'project_supplies_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR project_id IN (SELECT id FROM projects WHERE solo_owner_id = my_solo_id())
)
WITH CHECK (
  is_super_admin()
  OR project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR project_id IN (SELECT id FROM projects WHERE solo_owner_id = my_solo_id())
)
$b$);

SELECT _apply_rls('test_result_entries', 'test_result_entries_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR project_id IN (SELECT id FROM projects WHERE solo_owner_id = my_solo_id())
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
WITH CHECK (
  is_super_admin()
  OR project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR project_id IN (SELECT id FROM projects WHERE solo_owner_id = my_solo_id())
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
$b$);

-- analysis_comments was never created, so the Test Results discussion thread
-- silently read back empty forever (the SELECT errored, the call site did
-- `c.data || []`, and the UI just said "No comments yet"). Created here so the
-- policy below actually has a table to attach to.
CREATE TABLE IF NOT EXISTS analysis_comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID REFERENCES equipment_inventory(id) ON DELETE CASCADE,
  author       TEXT,
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS analysis_comments_equipment_idx ON analysis_comments(equipment_id);

SELECT _apply_rls('analysis_comments', 'analysis_comments_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE login_mode = 'solo' AND solo_owner_id = my_solo_id())
)
WITH CHECK (
  is_super_admin()
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR equipment_id IN (SELECT id FROM equipment_inventory WHERE login_mode = 'solo' AND solo_owner_id = my_solo_id())
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 14: training tables
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('training_schedule', 'training_schedule_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
$b$);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'training_fresh','training_golf_car',
    'training_building_alarm','training_equipment'
  ]
  LOOP
    PERFORM _apply_rls(t, 'training_policy', $b$
      FOR ALL TO authenticated
      USING (
        is_super_admin()
        OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
        OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
      )
      WITH CHECK (
        is_super_admin()
        OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
        OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
      )
    $b$);
  END LOOP;
END $$;

SELECT _apply_rls('retraining_requests', 'retraining_requests_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid) OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid))
WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid) OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid))
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 15: tasks, attachments, comments, out-of-lab, reminders, groups
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('tasks', 'tasks_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR (login_mode = 'team' AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR (login_mode = 'solo' AND created_by::text = my_solo_id()::text)
  OR assigned_to::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR assigned_to::text = my_solo_id()::text
)
WITH CHECK (
  is_super_admin()
  OR (login_mode = 'team' AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR (login_mode = 'solo' AND created_by::text = my_solo_id()::text)
)
$b$);

SELECT _apply_rls('task_attachments', 'task_attachments_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'team' AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'solo' AND created_by::text = my_solo_id()::text)
)
WITH CHECK (
  is_super_admin()
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'team' AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'solo' AND created_by::text = my_solo_id()::text)
)
$b$);

SELECT _apply_rls('task_comments', 'task_comments_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'team' AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR task_id IN (SELECT id FROM tasks WHERE login_mode = 'team' AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
$b$);

SELECT _apply_rls('user_out_of_lab', 'user_out_of_lab_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR (login_mode = 'team' AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
WITH CHECK (
  is_super_admin()
  OR (login_mode = 'team' AND organization_id IN (SELECT oid FROM my_org_ids() AS oid))
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
$b$);

-- 'reminders' IS the table the app actually uses — PM.jsx reads and writes it
-- in 8 places and Admin.jsx deletes from it, while 'task_reminders' below is
-- referenced nowhere in src/. The old comment claiming otherwise meant this
-- table went unsecured: it holds per-user reminders keyed only by user_id, and
-- the client filters by user_id alone, so without a policy any authenticated
-- user could read or edit anyone else's. Both names are covered here —
-- _apply_rls skips whichever does not exist.
SELECT _apply_rls('reminders', 'reminders_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
$b$);

-- lab_safety_progress — per-user safety step completion (user_id,
-- organization_id, step_number). Was missing entirely; TrainingRecords.jsx
-- queries it by user_id list with no org filter, relying purely on RLS.
SELECT _apply_rls('lab_safety_progress', 'lab_safety_progress_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
$b$);

SELECT _apply_rls('task_reminders', 'task_reminders_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
$b$);

SELECT _apply_rls('team_task_groups', 'team_task_groups_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
$b$);

SELECT _apply_rls('team_task_group_members', 'team_task_group_members_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR group_id IN (SELECT id FROM team_task_groups WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
WITH CHECK (
  is_super_admin()
  OR group_id IN (SELECT id FROM team_task_groups WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 16: meetings
-- ────────────────────────────────────────────────────────────────

SELECT _apply_rls('meetings', 'meetings_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 17: messages, re_messages
-- ────────────────────────────────────────────────────────────────

-- messages: real columns are user_id (text) + organization_id. Org-scoped.
SELECT _apply_rls('messages', 'messages_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
$b$);

SELECT _apply_rls('re_messages', 're_messages_policy', $b$
FOR ALL TO authenticated
USING    (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
WITH CHECK (is_super_admin() OR organization_id IN (SELECT oid FROM my_org_ids() AS oid))
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 18: notifications, admin_notifications, feedback_responses,
--          notification_prefs, support_messages, account_deletion_requests
-- ────────────────────────────────────────────────────────────────

-- notifications has only user_id (no organization_id). Managers create
-- notifications for their students, so INSERT is open; reads are owner-only.
SELECT _apply_rls('notifications', 'notifications_insert',
  $b$FOR INSERT TO authenticated WITH CHECK (true)$b$);
SELECT _apply_rls('notifications', 'notifications_select', $b$
FOR SELECT TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
$b$);
SELECT _apply_rls('notifications', 'notifications_update', $b$
FOR UPDATE TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
$b$);
SELECT _apply_rls('notifications', 'notifications_delete', $b$
FOR DELETE TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
$b$);

SELECT _apply_rls('admin_notifications', 'admin_notif_insert',
  $b$FOR INSERT TO authenticated WITH CHECK (true)$b$);
SELECT _apply_rls('admin_notifications', 'admin_notif_select',
  $b$FOR SELECT TO authenticated USING (is_super_admin())$b$);
SELECT _apply_rls('admin_notifications', 'admin_notif_update',
  $b$FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin())$b$);

SELECT _apply_rls('feedback_responses', 'feedback_responses_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
)
$b$);

SELECT _apply_rls('notification_prefs', 'notification_prefs_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
WITH CHECK (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
)
$b$);

-- Same-org members may READ each other's prefs: email notifications are
-- gated on the SENDER's session (team invites, lab messages, training) —
-- without this read the sender always sees NULL and no email is ever queued.
SELECT _apply_rls('notification_prefs', 'notification_prefs_select_org', $b$
FOR SELECT TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
$b$);

SELECT _apply_rls('support_messages', 'support_messages_insert',
  $b$FOR INSERT TO authenticated, anon WITH CHECK (true)$b$);
SELECT _apply_rls('support_messages', 'support_messages_select',
  $b$FOR SELECT TO authenticated USING (is_super_admin() OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid))$b$);

SELECT _apply_rls('account_deletion_requests', 'account_deletion_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 19: email_notifications_queue
-- ────────────────────────────────────────────────────────────────

-- Explicit safety net (Sept 2026): Supabase's linter flagged this table with
-- policies present but RLS disabled — _apply_rls() already re-enables RLS
-- every time it (re)creates these policies below, so a stale/out-of-band
-- toggle (e.g. via the dashboard) is the only way this table would ever be
-- left open. This line makes re-enabling it explicit and independent of
-- _apply_rls's internal behavior, in case that ever changes.
ALTER TABLE email_notifications_queue ENABLE ROW LEVEL SECURITY;

SELECT _apply_rls('email_notifications_queue', 'email_queue_insert',
  $b$FOR INSERT TO authenticated WITH CHECK (true)$b$);
SELECT _apply_rls('email_notifications_queue', 'email_queue_select', $b$
FOR SELECT TO authenticated
USING (
  is_super_admin()
  OR user_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR user_id::text = my_solo_id()::text
  OR user_id::text IN (SELECT id::text FROM users WHERE organization_id IN (SELECT oid FROM my_org_ids() AS oid))
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 20: solo workspace tables
-- ────────────────────────────────────────────────────────────────

-- solo_workspace_invites: owner_id + invitee_email (no invitee_id).
SELECT _apply_rls('solo_workspace_invites', 'solo_workspace_invites_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR owner_id = my_solo_id()
  OR invitee_email = my_solo_email()
)
WITH CHECK (
  is_super_admin()
  OR owner_id = my_solo_id()
)
$b$);

SELECT _apply_rls('solo_workspace_members', 'solo_workspace_members_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR owner_id = my_solo_id()
  OR member_id = my_solo_id()
)
WITH CHECK (
  is_super_admin()
  OR owner_id = my_solo_id()
)
$b$);

-- solo_workspace_transfer_requests: owner_id + member_id (both FK solo_users).
SELECT _apply_rls('solo_workspace_transfer_requests', 'solo_transfer_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR owner_id  = my_solo_id()
  OR member_id = my_solo_id()
)
WITH CHECK (
  is_super_admin()
  OR owner_id  = my_solo_id()
  OR member_id = my_solo_id()
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 21: team workspace sharing
-- ────────────────────────────────────────────────────────────────

-- team_workspace_invites: inviter_id + invitee_id + organization_id.
SELECT _apply_rls('team_workspace_invites', 'team_workspace_invites_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR inviter_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR invitee_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT oid FROM my_org_ids() AS oid)
  OR inviter_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
$b$);

SELECT _apply_rls('team_workspace_members', 'team_workspace_members_policy', $b$
FOR ALL TO authenticated
USING (
  is_super_admin()
  OR owner_id::text  IN (SELECT uid::text FROM my_user_ids() AS uid)
  OR member_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
WITH CHECK (
  is_super_admin()
  OR owner_id::text IN (SELECT uid::text FROM my_user_ids() AS uid)
)
$b$);


-- ────────────────────────────────────────────────────────────────
-- STEP 22: Remove leftover permissive policies from earlier RLS attempts.
--
-- Postgres OR-combines permissive policies, so a stray "auth only" (public,
-- ALL) or "org_access" policy would grant everything and defeat the policies
-- above. We drop every policy on a table that ISN'T one we just created —
-- but only for tables that DID receive one of our policies, so any table we
-- couldn't secure (or don't manage) keeps its existing policy and is never
-- locked out.
-- ────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
  keep text[] := ARRAY[
    'settings_read_anon','settings_read_auth','settings_write',
    'orgs_policy','users_policy','solo_users_policy',
    'user_screen_access_policy','user_dashboard_prefs_policy',
    'equipment_inventory_policy','equipment_categories_policy','equipment_locations_policy',
    'equipment_booking_settings_policy','equipment_bookings_policy','booking_notifications_policy',
    'equipment_booking_blocks_policy','eq_hub_policy','equipment_sop_notes_policy','equipment_list_policy',
    'org_scope_policy','floor_plans_policy','storage_locations_policy','lab_user_lockers_policy',
    'projects_policy','project_child_policy','project_materials_policy','project_record_files_policy','project_supplies_policy',
    'test_result_entries_policy','analysis_comments_policy',
    'training_schedule_policy','training_policy','retraining_requests_policy',
    'tasks_policy','task_attachments_policy','task_comments_policy','user_out_of_lab_policy',
    'task_reminders_policy','reminders_policy','lab_safety_progress_policy',
    'team_task_groups_policy','team_task_group_members_policy',
    'meetings_policy','messages_policy','re_messages_policy',
    'notifications_insert','notifications_select','notifications_update','notifications_delete',
    'admin_notif_insert','admin_notif_select','admin_notif_update',
    'feedback_responses_policy','notification_prefs_policy','notification_prefs_select_org',
    'support_messages_insert','support_messages_select',
    'account_deletion_policy','email_queue_insert','email_queue_select',
    'solo_workspace_invites_policy','solo_workspace_members_policy','solo_transfer_policy',
    'team_workspace_invites_policy','team_workspace_members_policy'
  ];
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
  LOOP
    IF r.policyname = ANY(keep) THEN CONTINUE; END IF;
    -- only prune tables we actually secured with one of our policies
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = r.tablename
        AND policyname = ANY(keep)
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
      RAISE NOTICE 'pruned legacy policy %.%', r.tablename, r.policyname;
    END IF;
  END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────────
-- CLEANUP + VERIFY
-- ────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS _apply_rls(text, text, text);

-- After running, every table below should show ONLY our own policies.
-- Any table still showing 'auth only' / 'org_access' / etc. was NOT secured
-- (its policy failed) — check the NOTICE output for the reason.
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
