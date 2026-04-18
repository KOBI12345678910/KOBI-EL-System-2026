ALTER TABLE "notification_routing_rules"
  ADD COLUMN IF NOT EXISTS "quiet_hours_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "quiet_hours_from" text NOT NULL DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS "quiet_hours_to" text NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS "quiet_hours_bypass_priority" text NOT NULL DEFAULT 'critical';
