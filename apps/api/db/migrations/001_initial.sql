BEGIN;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  bouquet_user_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE homes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  region_code TEXT NOT NULL,
  sido TEXT NOT NULL,
  sigungu TEXT NOT NULL,
  eupmyeondong TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX homes_owner_id_idx ON homes(owner_id);
CREATE INDEX homes_region_code_idx ON homes(region_code);

CREATE TABLE routines (
  id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('CLEANING','LAUNDRY','KITCHEN','BATHROOM','ETC')),
  recurrence JSONB NOT NULL,
  next_due_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX routines_home_due_idx ON routines(home_id, next_due_at);

CREATE TABLE home_items (
  id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('APPLIANCE','FILTER','CONSUMABLE','BATTERY','ETC')),
  purchased_at TIMESTAMPTZ,
  warranty_ends_at TIMESTAMPTZ,
  replacement_interval_days INTEGER CHECK (replacement_interval_days IS NULL OR replacement_interval_days > 0),
  inspection_interval_days INTEGER CHECK (inspection_interval_days IS NULL OR inspection_interval_days > 0),
  next_action_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX home_items_home_action_idx ON home_items(home_id, next_action_at);

CREATE TABLE waste_schedules (
  id TEXT PRIMARY KEY,
  region_code TEXT NOT NULL,
  waste_type TEXT NOT NULL CHECK (waste_type IN ('GENERAL','FOOD','RECYCLING','OTHER')),
  weekdays SMALLINT[] NOT NULL,
  start_time TEXT,
  end_time TEXT,
  place_description TEXT,
  method_description TEXT,
  source_updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX waste_schedules_region_idx ON waste_schedules(region_code);

CREATE TABLE task_occurrences (
  id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('ROUTINE','HOME_ITEM','WASTE')),
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING','DONE','SKIPPED')),
  completed_at TIMESTAMPTZ,
  UNIQUE (home_id, source_type, source_id, due_at)
);
CREATE INDEX task_occurrences_home_due_idx ON task_occurrences(home_id, due_at);
CREATE INDEX task_occurrences_history_idx ON task_occurrences(home_id, completed_at DESC) WHERE status = 'DONE';

COMMIT;
