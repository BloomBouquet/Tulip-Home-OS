BEGIN;

DROP INDEX IF EXISTS homes_owner_id_idx;
CREATE UNIQUE INDEX homes_owner_id_idx ON homes(owner_id);

COMMIT;
