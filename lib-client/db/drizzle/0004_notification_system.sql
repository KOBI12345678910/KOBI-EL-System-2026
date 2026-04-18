-- Migration: Add notification system enhancements
-- Adds per-user columns to notifications table and creates notification_preferences table

ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "user_id" INTEGER;

ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'normal';

ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'system';

ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "action_url" TEXT;

ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP;

CREATE INDEX IF NOT EXISTS "idx_notifications_user_read_archived"
  ON "notifications" ("user_id", "is_read", "archived_at");

CREATE INDEX IF NOT EXISTS "idx_notifications_user_category"
  ON "notifications" ("user_id", "category");

CREATE INDEX IF NOT EXISTS "idx_notifications_user_priority"
  ON "notifications" ("user_id", "priority");

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL,
  "category" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "min_priority" TEXT NOT NULL DEFAULT 'low',
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE ("user_id", "category")
);
