BEGIN;

CREATE TABLE region_catalog (
  region_code TEXT PRIMARY KEY,
  sido TEXT NOT NULL,
  sigungu TEXT,
  locality TEXT,
  parent_region_code TEXT,
  level TEXT NOT NULL CHECK (level IN ('SIDO','SIGUNGU','EUPMYEONDONG')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  source_updated_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX region_catalog_selector_idx
  ON region_catalog(level, sido, sigungu, locality);
CREATE INDEX region_catalog_parent_active_idx
  ON region_catalog(parent_region_code, active);

ALTER TABLE waste_schedules
  ADD COLUMN source_row_key TEXT,
  ADD COLUMN source_scope_name TEXT,
  ADD COLUMN synced_at TIMESTAMPTZ,
  ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE UNIQUE INDEX waste_schedules_source_row_key_idx
  ON waste_schedules(source_row_key)
  WHERE source_row_key IS NOT NULL;
CREATE INDEX waste_schedules_active_region_idx
  ON waste_schedules(active, region_code);

COMMIT;
