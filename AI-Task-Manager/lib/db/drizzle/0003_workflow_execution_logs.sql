-- Migration: Add workflow execution log support to automation_execution_logs table
-- This migration makes automation_id nullable and adds workflow_id, execution_type,
-- and entity_id columns to support logging both workflow and automation executions.

ALTER TABLE "automation_execution_logs" ALTER COLUMN "automation_id" DROP NOT NULL;

ALTER TABLE "automation_execution_logs"
  ADD COLUMN IF NOT EXISTS "workflow_id" INTEGER REFERENCES "platform_workflows"("id") ON DELETE CASCADE;

ALTER TABLE "automation_execution_logs"
  ADD COLUMN IF NOT EXISTS "execution_type" TEXT NOT NULL DEFAULT 'automation';

ALTER TABLE "automation_execution_logs"
  ADD COLUMN IF NOT EXISTS "entity_id" INTEGER;
