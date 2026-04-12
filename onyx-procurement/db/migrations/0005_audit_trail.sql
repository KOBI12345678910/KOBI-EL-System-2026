-- Migration : 0005_audit_trail.sql
-- Original  : audit trail — יומן ביקורת מערכתי
-- Created   : 2026-04-11
-- Rule      : לא מוחקים רק משדרגים ומגדלים

-- +migrate Up
CREATE TABLE IF NOT EXISTS audit_events (
  id           BIGSERIAL PRIMARY KEY,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id     UUID,                       -- auth.users.id if logged in
  actor_label  TEXT,                       -- fallback text (CLI user, webhook, etc.)
  entity_type  TEXT NOT NULL,              -- suppliers / invoices / po / ...
  entity_id    TEXT NOT NULL,              -- stringified PK (supports int and uuid)
  action       TEXT NOT NULL,              -- create / update / delete / login / ...
  before_data  JSONB,
  after_data   JSONB,
  ip_address   INET,
  user_agent   TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_occurred  ON audit_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity    ON audit_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor     ON audit_events (actor_id);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY audit_read_auth ON audit_events
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- +migrate Down
DROP TABLE IF EXISTS audit_events;
