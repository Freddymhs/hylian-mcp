-- FASE_2: soft delete for reviews (delete_review sets deleted_at; reads filter deleted_at IS NULL).
--
-- Only needed on a database created from the FASE_1 version of src/db/schema.sql.
-- Fresh installs already get the column from schema.sql. Safe to re-run.
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
