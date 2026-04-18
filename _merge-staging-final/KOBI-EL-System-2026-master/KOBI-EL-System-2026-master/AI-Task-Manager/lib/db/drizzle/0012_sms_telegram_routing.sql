ALTER TABLE "notification_routing_rules"
  ADD COLUMN IF NOT EXISTS "channel_sms" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "channel_telegram" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "min_priority_sms" text NOT NULL DEFAULT 'critical',
  ADD COLUMN IF NOT EXISTS "min_priority_telegram" text NOT NULL DEFAULT 'high';
