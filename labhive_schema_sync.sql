-- ===========================================================================
-- LabHive schema sync — found by scripts/schema-audit.mjs (Sept 20 2026)
-- ===========================================================================
-- Idempotent; safe to re-run.

-- project_record_files is an older shape than the code: it has name/url/
-- uploaded_by, while every insert and the FileLink renderer use file_name/
-- file_url/created_by, and fileMap is keyed by test_result_id. So uploading a
-- record file failed outright, and no file could ever appear against a test
-- result. ProjectMaterial.jsx:605 even toasts "Run the project_record_files
-- SQL migration" — this is that migration, never applied.
--
-- The old name/url/uploaded_by columns are left in place: existing rows may
-- still use them, and dropping data to tidy a schema is not worth it.
ALTER TABLE project_record_files ADD COLUMN IF NOT EXISTS test_result_id UUID;
ALTER TABLE project_record_files ADD COLUMN IF NOT EXISTS equipment_id   UUID;
ALTER TABLE project_record_files ADD COLUMN IF NOT EXISTS file_name      TEXT;
ALTER TABLE project_record_files ADD COLUMN IF NOT EXISTS file_path      TEXT;
ALTER TABLE project_record_files ADD COLUMN IF NOT EXISTS file_url       TEXT;
ALTER TABLE project_record_files ADD COLUMN IF NOT EXISTS file_size      BIGINT;
ALTER TABLE project_record_files ADD COLUMN IF NOT EXISTS created_by     TEXT;
CREATE INDEX IF NOT EXISTS project_record_files_result_idx
  ON project_record_files (test_result_id);

-- DEFAULT TRUE on purpose: the toggle inserts a row only to turn bookability
-- OFF, so equipment with no settings row must read as bookable.
ALTER TABLE equipment_booking_settings ADD COLUMN IF NOT EXISTS bookable BOOLEAN DEFAULT TRUE;

-- Profile reads and writes it; the whole solo profile save was rejected.
ALTER TABLE solo_users ADD COLUMN IF NOT EXISTS phone TEXT;

NOTIFY pgrst, 'reload schema';
SELECT 'labhive schema sync applied' AS result;
