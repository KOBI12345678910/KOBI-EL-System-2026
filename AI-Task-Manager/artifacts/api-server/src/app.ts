import express, { type Express, Router, type Request, type Response, type NextFunction } from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "cors";
import { requestLogger } from "./middleware/request-logger";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { initializeWorkflowEngine } from "./lib/workflow-engine";
import { initializeAIEnrichment } from "./lib/ai-enrichment-service";
import { initLiveOpsBridge } from "./lib/live-ops-bridge";
import { attachPermissions } from "./lib/permission-middleware";
import { validateSession } from "./lib/auth";
import { ensureSuperAdminRole, ensureExecutiveManagerRole, ensureDefaultWorkerRoles } from "./lib/permission-engine";
import { runCrmSeed } from "./routes/crm-seed";
import { seedAllModules } from "./lib/seed-modules";
import { seedDefaultChannels } from "./routes/chat";
import { seedDefaultDocumentFolders } from "./routes/documents";
import { seedContractTemplates, contractSigningPageHandler, contractSigningSubmitHandler, contractDeclineHandler, eSignatureWebhookHandler } from "./routes/contract-templates";
import { auditMiddleware } from "./lib/audit-middleware";
import { globalErrorHandler } from "./middleware/error-handler";
import { sanitizeMiddleware } from "./middleware/sanitize";
import { logger } from "./lib/logger";
import { initSentry, setupSentryErrorHandler } from "./lib/sentry";
import { startSessionCleanup } from "./lib/session-cleanup";
import { startEscalationCron } from "./lib/escalation-engine";
import { startNurtureProcessor } from "./routes/crm-sales-pipeline";
import { startCrmFollowupEngine } from "./lib/crm-followup-engine";
import pg from "pg";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  perUserRateLimit,
  apiKeyAuthMiddleware,
  requestTransformMiddleware,
  responseTransformMiddleware,
  gatewayCacheMiddleware,
  createApiKeyRoutes,
} from "./lib/api-gateway";
import openapiRouter, { apiDocsRouter } from "./routes/openapi";
import graphqlRouter from "./routes/graphql";
import { setExpressApp } from "./lib/openapi-spec";
import securityRouter from "./routes/security";
import hseRouter, { startPermitExpirationScheduler } from "./routes/hse-routes";
import qualityManagementRouter from "./routes/quality-management";
import accountingExportRouter from "./routes/accounting-export";
import serverHealthRouter from "./routes/server-health";
import { ipFilterMiddleware } from "./lib/ip-filter";
import { dynamicRateLimitMiddleware } from "./lib/dynamic-rate-limit";
import { webhookVerifyMiddleware } from "./lib/webhook-verify";
import { clearKpiCache } from "./routes/dashboard-kpi";

async function runMigrations() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE NOT NULL,
        value TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    logger.info("[Migrations] system_settings table ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] system_settings:", { error: msg });
  }

  try {
    await db.execute(sql`
      ALTER TABLE chat_channels ADD COLUMN IF NOT EXISTS icon VARCHAR(50)
    `);
    logger.info("[Migrations] chat_channels.icon column ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] Could not add icon column to chat_channels:", { error: msg });
  }

  try {
    await db.execute(sql`
      ALTER TABLE chat_channels ADD COLUMN IF NOT EXISTS description TEXT
    `);
    logger.info("[Migrations] chat_channels.description column ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] Could not add description column to chat_channels:", { error: msg });
  }
  try {
    await db.execute(sql`
      ALTER TABLE kimi_conversations ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT ''
    `);
    logger.info("[Migrations] kimi_conversations.user_id column ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] Could not add user_id column to kimi_conversations:", { error: msg });
  }

  try {
    await db.execute(sql`
      ALTER TABLE detail_definitions ADD COLUMN IF NOT EXISTS header_fields JSONB DEFAULT '[]'::jsonb
    `);
    await db.execute(sql`
      ALTER TABLE detail_definitions ADD COLUMN IF NOT EXISTS tabs JSONB DEFAULT '[]'::jsonb
    `);
    await db.execute(sql`
      ALTER TABLE detail_definitions ADD COLUMN IF NOT EXISTS related_lists JSONB DEFAULT '[]'::jsonb
    `);
    await db.execute(sql`
      ALTER TABLE detail_definitions ADD COLUMN IF NOT EXISTS action_bar JSONB DEFAULT '[]'::jsonb
    `);
    logger.info("[Migrations] detail_definitions columns ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] detail_definitions columns:", { error: msg });
  }

  try {
    const rawMatCols = [
      "material_type TEXT",
      "finish TEXT",
      "thickness NUMERIC",
      "width NUMERIC",
      "height NUMERIC",
      "diameter NUMERIC",
      "inner_diameter NUMERIC",
      "inner_type TEXT",
      "standard TEXT",
      "country_of_origin TEXT",
      "color TEXT",
      "minimum_order NUMERIC",
      "delivery_days INTEGER",
      "warranty_months INTEGER",
      "barcode TEXT",
      "hazard_class TEXT",
      "shelf_life_days INTEGER",
      "lot_tracking BOOLEAN DEFAULT FALSE",
      "serial_tracking BOOLEAN DEFAULT FALSE",
      "inspection_required BOOLEAN DEFAULT FALSE",
      "quality_grade TEXT",
      "preferred_supplier_id INTEGER",
      "alternate_supplier_id INTEGER",
      "economic_order_qty NUMERIC",
      "safety_stock NUMERIC DEFAULT 0",
      "last_purchase_price NUMERIC",
      "average_cost NUMERIC",
      "standard_cost NUMERIC",
      "customs_tariff_code TEXT",
      "storage_conditions TEXT",
      "handling_instructions TEXT",
      "msds_url TEXT",
      "image_url TEXT",
      "sku TEXT",
      "unit_price NUMERIC",
    ];
    await db.transaction(async (tx) => {
      for (const col of rawMatCols) {
        await tx.execute(sql`ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS ${sql.raw(col)}`);
      }
    });
    logger.info("[Migrations] raw_materials columns ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] raw_materials columns:", { error: msg });
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_role_assignments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        role_id INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, role_id)
      )
    `);
    logger.info("[Migrations] roles and user_role_assignments tables ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] roles/user_role_assignments tables:", { error: msg });
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notification_routing_rules (
        id SERIAL PRIMARY KEY,
        notification_type TEXT NOT NULL DEFAULT '*',
        category TEXT NOT NULL DEFAULT 'system',
        role_name TEXT,
        user_id INTEGER,
        channel_in_app BOOLEAN NOT NULL DEFAULT TRUE,
        channel_email BOOLEAN NOT NULL DEFAULT FALSE,
        channel_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
        min_priority_in_app TEXT NOT NULL DEFAULT 'low',
        min_priority_email TEXT NOT NULL DEFAULT 'high',
        min_priority_whatsapp TEXT NOT NULL DEFAULT 'critical',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    logger.info("[Migrations] notification_routing_rules table ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] notification_routing_rules:", { error: msg });
  }

  try {
    await db.execute(sql`
      ALTER TABLE notification_routing_rules
        ADD COLUMN IF NOT EXISTS channel_slack BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS min_priority_slack TEXT NOT NULL DEFAULT 'high'
    `);
    logger.info("[Migrations] notification_routing_rules.channel_slack ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] channel_slack migration:", { error: msg });
  }

  try {
    await db.execute(sql`
      ALTER TABLE notification_routing_rules
        ADD COLUMN IF NOT EXISTS channel_sms BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS channel_telegram BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS min_priority_sms TEXT NOT NULL DEFAULT 'critical',
        ADD COLUMN IF NOT EXISTS min_priority_telegram TEXT NOT NULL DEFAULT 'high'
    `);
    logger.info("[Migrations] notification_routing_rules SMS/Telegram columns ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] SMS/Telegram routing migration:", { error: msg });
  }

  try {
    await db.execute(sql`
      ALTER TABLE notification_routing_rules
        ADD COLUMN IF NOT EXISTS quiet_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS quiet_hours_from TEXT NOT NULL DEFAULT '22:00',
        ADD COLUMN IF NOT EXISTS quiet_hours_to TEXT NOT NULL DEFAULT '08:00',
        ADD COLUMN IF NOT EXISTS quiet_hours_bypass_priority TEXT NOT NULL DEFAULT 'critical'
    `);
    logger.info("[Migrations] notification_routing_rules quiet_hours columns ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] quiet_hours migration:", { error: msg });
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notification_delivery_log (
        id SERIAL PRIMARY KEY,
        notification_id INTEGER NOT NULL,
        channel TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        recipient_user_id INTEGER,
        recipient_email TEXT,
        recipient_phone TEXT,
        error_message TEXT,
        sent_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        metadata JSONB
      )
    `);
    logger.info("[Migrations] notification_delivery_log table ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] notification_delivery_log:", { error: msg });
  }

  try {
    await db.execute(sql`ALTER TABLE notification_delivery_log ALTER COLUMN notification_id DROP NOT NULL`);
    logger.info("[Migrations] notification_delivery_log.notification_id made nullable");
  } catch (_err: unknown) {
    // Column may already be nullable — ignore
  }

  try {
    await db.execute(sql`ALTER TABLE notification_delivery_log ADD COLUMN IF NOT EXISTS external_id VARCHAR(100)`);
    logger.info("[Migrations] notification_delivery_log.external_id column ensured");
  } catch (_err: unknown) {
    // Column may already exist — ignore
  }

  const entityNotifTables = ["suppliers", "customers", "employees", "sales_orders", "sales_customers"];
  for (const tbl of entityNotifTables) {
    try {
      await db.execute(sql`ALTER TABLE ${sql.identifier(tbl)} ADD COLUMN IF NOT EXISTS preferred_notification_channel VARCHAR(30) DEFAULT 'whatsapp'`);
      await db.execute(sql`ALTER TABLE ${sql.identifier(tbl)} ADD COLUMN IF NOT EXISTS notification_opt_out BOOLEAN DEFAULT false`);
    } catch (_err: unknown) {
      // Table may not exist or column may already exist — ignore
    }
  }
  logger.info("[Migrations] preferred_notification_channel columns ensured on business entities");

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS expense_upload (
        id SERIAL PRIMARY KEY,
        file_name VARCHAR(500),
        upload_date DATE DEFAULT CURRENT_DATE,
        source VARCHAR(100) DEFAULT 'manual',
        amount NUMERIC(15, 2) DEFAULT 0,
        vendor_name VARCHAR(500),
        category VARCHAR(255),
        status VARCHAR(100) DEFAULT 'pending',
        description TEXT,
        receipt_number VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    logger.info("[Migrations] expense_upload table ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] expense_upload table:", { error: msg });
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        key_hash VARCHAR(128) NOT NULL UNIQUE,
        key_prefix VARCHAR(20) NOT NULL,
        user_id INTEGER NOT NULL,
        scopes JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT true,
        usage_count INTEGER DEFAULT 0,
        last_used_at TIMESTAMP,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)`);
    logger.info("[Migrations] api_keys table ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] api_keys table:", { error: msg });
  }

  const ensureTables: Array<[string, string]> = [
    ["support_tickets", `CREATE TABLE IF NOT EXISTS support_tickets (
      id SERIAL PRIMARY KEY,
      subject TEXT,
      description TEXT,
      status VARCHAR(50) DEFAULT 'open',
      priority VARCHAR(50) DEFAULT 'medium',
      customer_id INTEGER,
      assigned_to INTEGER,
      resolved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["strategic_goals", `CREATE TABLE IF NOT EXISTS strategic_goals (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status VARCHAR(50) DEFAULT 'active',
      target_date DATE,
      progress INTEGER DEFAULT 0,
      owner_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["swot_items", `CREATE TABLE IF NOT EXISTS swot_items (
      id SERIAL PRIMARY KEY,
      category VARCHAR(20) NOT NULL DEFAULT 'strength',
      title TEXT NOT NULL,
      description TEXT,
      impact VARCHAR(20) DEFAULT 'medium',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["bsc_objectives", `CREATE TABLE IF NOT EXISTS bsc_objectives (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      perspective VARCHAR(50) DEFAULT 'financial',
      target NUMERIC,
      actual NUMERIC,
      weight INTEGER DEFAULT 1,
      status VARCHAR(50) DEFAULT 'on_track',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["competitors", `CREATE TABLE IF NOT EXISTS competitors (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      market_share NUMERIC,
      strengths TEXT,
      weaknesses TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["project_risks", `CREATE TABLE IF NOT EXISTS project_risks (
      id SERIAL PRIMARY KEY,
      project_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      probability VARCHAR(20) DEFAULT 'medium',
      impact VARCHAR(20) DEFAULT 'medium',
      mitigation TEXT,
      status VARCHAR(50) DEFAULT 'open',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["timesheet_entries", `CREATE TABLE IF NOT EXISTS timesheet_entries (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER,
      project_id INTEGER,
      task_description TEXT,
      date DATE DEFAULT CURRENT_DATE,
      hours_worked NUMERIC DEFAULT 0,
      billable BOOLEAN DEFAULT TRUE,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["marketing_budgets", `CREATE TABLE IF NOT EXISTS marketing_budgets (
      id SERIAL PRIMARY KEY,
      year INTEGER DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER,
      quarter INTEGER,
      department TEXT,
      allocated NUMERIC DEFAULT 0,
      spent NUMERIC DEFAULT 0,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["content_calendar_items", `CREATE TABLE IF NOT EXISTS content_calendar_items (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content_type VARCHAR(50) DEFAULT 'post',
      channel VARCHAR(50),
      scheduled_date DATE,
      status VARCHAR(50) DEFAULT 'draft',
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["social_media_posts", `CREATE TABLE IF NOT EXISTS social_media_posts (
      id SERIAL PRIMARY KEY,
      platform VARCHAR(50) NOT NULL,
      content TEXT,
      status VARCHAR(50) DEFAULT 'draft',
      scheduled_at TIMESTAMP,
      published_at TIMESTAMP,
      engagement INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["email_campaigns", `CREATE TABLE IF NOT EXISTS email_campaigns (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT,
      status VARCHAR(50) DEFAULT 'draft',
      sent_count INTEGER DEFAULT 0,
      open_rate NUMERIC DEFAULT 0,
      click_rate NUMERIC DEFAULT 0,
      scheduled_at TIMESTAMP,
      sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["feature_requests", `CREATE TABLE IF NOT EXISTS feature_requests (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      priority VARCHAR(50) DEFAULT 'medium',
      status VARCHAR(50) DEFAULT 'submitted',
      votes INTEGER DEFAULT 0,
      requested_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["product_roadmap_items", `CREATE TABLE IF NOT EXISTS product_roadmap_items (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      quarter VARCHAR(20),
      year INTEGER,
      status VARCHAR(50) DEFAULT 'planned',
      priority VARCHAR(50) DEFAULT 'medium',
      category VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["qa_test_cases", `CREATE TABLE IF NOT EXISTS qa_test_cases (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      test_type VARCHAR(50) DEFAULT 'manual',
      status VARCHAR(50) DEFAULT 'pending',
      priority VARCHAR(50) DEFAULT 'medium',
      expected_result TEXT,
      actual_result TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["rd_projects", `CREATE TABLE IF NOT EXISTS rd_projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      budget NUMERIC DEFAULT 0,
      spent NUMERIC DEFAULT 0,
      status VARCHAR(50) DEFAULT 'planning',
      start_date DATE,
      end_date DATE,
      lead_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["data_flow_definitions", `CREATE TABLE IF NOT EXISTS data_flow_definitions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      source_module TEXT,
      target_module TEXT,
      trigger_type VARCHAR(50) DEFAULT 'manual',
      status VARCHAR(50) DEFAULT 'active',
      last_run TIMESTAMP,
      config JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["document_templates", `CREATE TABLE IF NOT EXISTS document_templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category VARCHAR(100),
      content TEXT,
      status VARCHAR(50) DEFAULT 'active',
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["cash_flow_records", `CREATE TABLE IF NOT EXISTS cash_flow_records (
      id SERIAL PRIMARY KEY,
      record_date DATE DEFAULT CURRENT_DATE,
      description TEXT,
      amount NUMERIC DEFAULT 0,
      flow_type VARCHAR(20) DEFAULT 'inflow',
      category VARCHAR(100),
      account_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["bank_reconciliations", `CREATE TABLE IF NOT EXISTS bank_reconciliations (
      id SERIAL PRIMARY KEY,
      bank_account_id INTEGER,
      reconciliation_date DATE DEFAULT CURRENT_DATE,
      statement_balance NUMERIC DEFAULT 0,
      book_balance NUMERIC DEFAULT 0,
      difference NUMERIC DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["standing_orders", `CREATE TABLE IF NOT EXISTS standing_orders (
      id SERIAL PRIMARY KEY,
      description TEXT NOT NULL,
      amount NUMERIC DEFAULT 0,
      frequency VARCHAR(50) DEFAULT 'monthly',
      start_date DATE,
      end_date DATE,
      next_run DATE,
      status VARCHAR(50) DEFAULT 'active',
      supplier_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["payment_anomalies", `CREATE TABLE IF NOT EXISTS payment_anomalies (
      id SERIAL PRIMARY KEY,
      transaction_id INTEGER,
      anomaly_type VARCHAR(100),
      severity VARCHAR(20) DEFAULT 'medium',
      description TEXT,
      status VARCHAR(50) DEFAULT 'open',
      detected_at TIMESTAMP DEFAULT NOW(),
      resolved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["collection_management", `CREATE TABLE IF NOT EXISTS collection_management (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      type VARCHAR(50) DEFAULT 'general',
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["price_lists_ent", `CREATE TABLE IF NOT EXISTS price_lists_ent (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      currency VARCHAR(10) DEFAULT 'ILS',
      effective_date DATE DEFAULT CURRENT_DATE,
      expiry_date DATE,
      status VARCHAR(50) DEFAULT 'active',
      discount_percent NUMERIC DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["cost_calculations", `CREATE TABLE IF NOT EXISTS cost_calculations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      product_id INTEGER,
      material_cost NUMERIC DEFAULT 0,
      labor_cost NUMERIC DEFAULT 0,
      overhead_cost NUMERIC DEFAULT 0,
      total_cost NUMERIC DEFAULT 0,
      margin_percent NUMERIC DEFAULT 0,
      selling_price NUMERIC DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["production_reports", `CREATE TABLE IF NOT EXISTS production_reports (
      id SERIAL PRIMARY KEY,
      report_date DATE DEFAULT CURRENT_DATE,
      shift VARCHAR(20),
      units_produced INTEGER DEFAULT 0,
      units_rejected INTEGER DEFAULT 0,
      efficiency_percent NUMERIC DEFAULT 0,
      downtime_minutes INTEGER DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["crm_sla_rules", `CREATE TABLE IF NOT EXISTS crm_sla_rules (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      priority VARCHAR(20) DEFAULT 'medium',
      response_hours INTEGER DEFAULT 24,
      resolution_hours INTEGER DEFAULT 72,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["smart_routing_rules", `CREATE TABLE IF NOT EXISTS smart_routing_rules (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      condition_field TEXT,
      condition_value TEXT,
      assign_to INTEGER,
      priority INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["collection_cases", `CREATE TABLE IF NOT EXISTS collection_cases (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER,
      invoice_id INTEGER,
      amount_due NUMERIC DEFAULT 0,
      days_overdue INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'open',
      assigned_to INTEGER,
      last_contact DATE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["field_agents", `CREATE TABLE IF NOT EXISTS field_agents (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER,
      name TEXT NOT NULL,
      region TEXT,
      status VARCHAR(50) DEFAULT 'active',
      current_location TEXT,
      phone TEXT,
      email TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["dynamic_pricing_rules", `CREATE TABLE IF NOT EXISTS dynamic_pricing_rules (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      product_id INTEGER,
      customer_segment TEXT,
      adjustment_type VARCHAR(20) DEFAULT 'percent',
      adjustment_value NUMERIC DEFAULT 0,
      conditions JSONB DEFAULT '{}'::jsonb,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["general_ledger", `CREATE TABLE IF NOT EXISTS general_ledger (
      id SERIAL PRIMARY KEY,
      journal_entry_id INTEGER,
      account_id INTEGER,
      debit NUMERIC DEFAULT 0,
      credit NUMERIC DEFAULT 0,
      balance NUMERIC DEFAULT 0,
      transaction_date DATE DEFAULT CURRENT_DATE,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`],
    ["aging_snapshots", `CREATE TABLE IF NOT EXISTS aging_snapshots (
      id SERIAL PRIMARY KEY,
      snapshot_date DATE DEFAULT CURRENT_DATE,
      customer_id INTEGER,
      supplier_id INTEGER,
      entity_type VARCHAR(20) DEFAULT 'customer',
      current_amount NUMERIC DEFAULT 0,
      days_30 NUMERIC DEFAULT 0,
      days_60 NUMERIC DEFAULT 0,
      days_90 NUMERIC DEFAULT 0,
      days_90_plus NUMERIC DEFAULT 0,
      total NUMERIC DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )`],
    ["withholding_tax", `CREATE TABLE IF NOT EXISTS withholding_tax (
      id SERIAL PRIMARY KEY,
      vendor_id INTEGER,
      invoice_id INTEGER,
      tax_rate NUMERIC DEFAULT 0,
      gross_amount NUMERIC DEFAULT 0,
      tax_amount NUMERIC DEFAULT 0,
      net_amount NUMERIC DEFAULT 0,
      period_month INTEGER,
      period_year INTEGER,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["payment_runs", `CREATE TABLE IF NOT EXISTS payment_runs (
      id SERIAL PRIMARY KEY,
      run_date DATE DEFAULT CURRENT_DATE,
      total_amount NUMERIC DEFAULT 0,
      invoice_count INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      payment_method VARCHAR(50),
      bank_account_id INTEGER,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["petty_cash", `CREATE TABLE IF NOT EXISTS petty_cash (
      id SERIAL PRIMARY KEY,
      date DATE DEFAULT CURRENT_DATE,
      description TEXT NOT NULL,
      amount NUMERIC DEFAULT 0,
      transaction_type VARCHAR(20) DEFAULT 'expense',
      category VARCHAR(100),
      receipt_number TEXT,
      balance NUMERIC DEFAULT 0,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["expense_reports", `CREATE TABLE IF NOT EXISTS expense_reports (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER,
      title TEXT NOT NULL,
      total_amount NUMERIC DEFAULT 0,
      status VARCHAR(50) DEFAULT 'draft',
      submitted_at TIMESTAMP,
      approved_at TIMESTAMP,
      approved_by INTEGER,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["checks", `CREATE TABLE IF NOT EXISTS checks (
      id SERIAL PRIMARY KEY,
      check_number TEXT,
      bank_name TEXT,
      branch TEXT,
      account_number TEXT,
      amount NUMERIC DEFAULT 0,
      due_date DATE,
      status VARCHAR(50) DEFAULT 'pending',
      entity_type VARCHAR(20) DEFAULT 'supplier',
      entity_id INTEGER,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["crm_automations", `CREATE TABLE IF NOT EXISTS crm_automations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      trigger_type VARCHAR(100),
      action_type VARCHAR(100),
      conditions JSONB DEFAULT '[]'::jsonb,
      actions JSONB DEFAULT '[]'::jsonb,
      is_active BOOLEAN DEFAULT TRUE,
      run_count INTEGER DEFAULT 0,
      last_run TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["quotes", `CREATE TABLE IF NOT EXISTS quotes (
      id SERIAL PRIMARY KEY,
      quote_number TEXT,
      customer_id INTEGER,
      total_amount NUMERIC DEFAULT 0,
      status VARCHAR(50) DEFAULT 'draft',
      valid_until DATE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["contacts", `CREATE TABLE IF NOT EXISTS contacts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      company_name TEXT,
      title TEXT,
      type VARCHAR(50) DEFAULT 'contact',
      customer_id INTEGER,
      supplier_id INTEGER,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["alerts", `CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT,
      severity VARCHAR(20) DEFAULT 'info',
      module VARCHAR(100),
      entity_type TEXT,
      entity_id INTEGER,
      is_read BOOLEAN DEFAULT FALSE,
      user_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["tax_records", `CREATE TABLE IF NOT EXISTS tax_records (
      id SERIAL PRIMARY KEY,
      period_month INTEGER,
      period_year INTEGER,
      tax_type VARCHAR(50) DEFAULT 'vat',
      taxable_amount NUMERIC DEFAULT 0,
      tax_amount NUMERIC DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      due_date DATE,
      paid_at TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["crm_contacts", `CREATE TABLE IF NOT EXISTS crm_contacts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      company TEXT,
      title TEXT,
      customer_id INTEGER,
      tags TEXT[],
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["crm_opportunities", `CREATE TABLE IF NOT EXISTS crm_opportunities (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      customer_id INTEGER,
      amount NUMERIC DEFAULT 0,
      probability INTEGER DEFAULT 50,
      stage VARCHAR(100) DEFAULT 'prospect',
      expected_close DATE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["financial_transactions", `CREATE TABLE IF NOT EXISTS financial_transactions (
      id SERIAL PRIMARY KEY,
      transaction_date DATE DEFAULT CURRENT_DATE,
      description TEXT NOT NULL,
      amount NUMERIC DEFAULT 0,
      transaction_type VARCHAR(50) DEFAULT 'debit',
      account_id INTEGER,
      reference TEXT,
      status VARCHAR(50) DEFAULT 'posted',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["production_lines", `CREATE TABLE IF NOT EXISTS production_lines (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      capacity INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'active',
      location TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["crm_pipeline_stages", `CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      probability INTEGER DEFAULT 50,
      is_won BOOLEAN DEFAULT FALSE,
      is_lost BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )`],
    ["marketing_campaigns", `CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      campaign_type VARCHAR(50) DEFAULT 'email',
      status VARCHAR(50) DEFAULT 'draft',
      budget NUMERIC DEFAULT 0,
      spent NUMERIC DEFAULT 0,
      start_date DATE,
      end_date DATE,
      target_audience TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["project_milestones", `CREATE TABLE IF NOT EXISTS project_milestones (
      id SERIAL PRIMARY KEY,
      project_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      due_date DATE,
      status VARCHAR(50) DEFAULT 'pending',
      completion_percent INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["project_budgets", `CREATE TABLE IF NOT EXISTS project_budgets (
      id SERIAL PRIMARY KEY,
      project_id INTEGER,
      category TEXT NOT NULL,
      allocated NUMERIC DEFAULT 0,
      spent NUMERIC DEFAULT 0,
      forecast NUMERIC DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["project_resources", `CREATE TABLE IF NOT EXISTS project_resources (
      id SERIAL PRIMARY KEY,
      project_id INTEGER,
      resource_type VARCHAR(50) DEFAULT 'human',
      name TEXT NOT NULL,
      allocation_pct INTEGER DEFAULT 100,
      cost_per_hour NUMERIC DEFAULT 0,
      start_date DATE,
      end_date DATE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["project_resources_allocation_pct_col", `ALTER TABLE project_resources ADD COLUMN IF NOT EXISTS allocation_pct INTEGER DEFAULT 100`],
    ["project_tasks", `CREATE TABLE IF NOT EXISTS project_tasks (
      id SERIAL PRIMARY KEY,
      project_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      status VARCHAR(50) DEFAULT 'todo',
      priority VARCHAR(20) DEFAULT 'medium',
      assigned_to INTEGER,
      due_date DATE,
      completion_percent INTEGER DEFAULT 0,
      parent_task_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["project_portal_access", `CREATE TABLE IF NOT EXISTS project_portal_access (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL,
      customer_id INTEGER,
      contact_email VARCHAR(255),
      access_token VARCHAR(512) UNIQUE NOT NULL,
      permissions JSONB DEFAULT '{"view_progress":true,"view_documents":true,"approve_milestones":false,"submit_comments":true}',
      is_active BOOLEAN DEFAULT true,
      expires_at TIMESTAMP,
      last_accessed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["project_comments", `CREATE TABLE IF NOT EXISTS project_comments (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL,
      task_id INTEGER,
      milestone_id INTEGER,
      author_type VARCHAR(20) DEFAULT 'internal',
      author_name VARCHAR(200),
      author_email VARCHAR(255),
      message TEXT NOT NULL,
      attachments JSONB DEFAULT '[]',
      is_resolved BOOLEAN DEFAULT false,
      parent_comment_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["project_work_order_links", `CREATE TABLE IF NOT EXISTS project_work_order_links (
      id SERIAL PRIMARY KEY,
      project_task_id INTEGER NOT NULL,
      work_order_id INTEGER NOT NULL,
      link_type VARCHAR(50) DEFAULT 'linked',
      sync_status VARCHAR(50) DEFAULT 'synced',
      last_synced_at TIMESTAMP DEFAULT NOW(),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(project_task_id, work_order_id)
    )`],
    ["inventory_transactions", `CREATE TABLE IF NOT EXISTS inventory_transactions (
      id SERIAL PRIMARY KEY,
      product_id INTEGER,
      warehouse_id INTEGER,
      transaction_type VARCHAR(50) DEFAULT 'receipt',
      quantity NUMERIC DEFAULT 0,
      unit_cost NUMERIC DEFAULT 0,
      reference_type TEXT,
      reference_id INTEGER,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`],
    ["warehouse_locations", `CREATE TABLE IF NOT EXISTS warehouse_locations (
      id SERIAL PRIMARY KEY,
      warehouse_id INTEGER,
      zone TEXT,
      aisle TEXT,
      shelf TEXT,
      bin TEXT,
      capacity NUMERIC DEFAULT 0,
      occupied NUMERIC DEFAULT 0,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["sales_territories", `CREATE TABLE IF NOT EXISTS sales_territories (
      id SERIAL PRIMARY KEY,
      territory_number TEXT UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      type VARCHAR(50) DEFAULT 'geographic',
      region TEXT,
      country TEXT,
      cities TEXT,
      zip_codes TEXT,
      assigned_rep TEXT,
      assigned_rep_id INTEGER,
      manager TEXT,
      status VARCHAR(50) DEFAULT 'active',
      target_revenue NUMERIC DEFAULT 0,
      actual_revenue NUMERIC DEFAULT 0,
      customer_count INTEGER DEFAULT 0,
      lead_count INTEGER DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["sales_nurture_sequences", `CREATE TABLE IF NOT EXISTS sales_nurture_sequences (
      id SERIAL PRIMARY KEY,
      sequence_number TEXT UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      trigger_stage TEXT,
      status VARCHAR(50) DEFAULT 'active',
      steps JSONB DEFAULT '[]',
      total_steps INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["sales_commission_rules", `CREATE TABLE IF NOT EXISTS sales_commission_rules (
      id SERIAL PRIMARY KEY,
      rule_number TEXT UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      rule_type VARCHAR(50) DEFAULT 'flat_percent',
      rate NUMERIC DEFAULT 0,
      tiers JSONB DEFAULT '[]',
      applies_to TEXT DEFAULT 'all',
      min_deal_value NUMERIC DEFAULT 0,
      max_deal_value NUMERIC,
      status VARCHAR(50) DEFAULT 'active',
      effective_from DATE,
      effective_to DATE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["sales_commission_records", `CREATE TABLE IF NOT EXISTS sales_commission_records (
      id SERIAL PRIMARY KEY,
      rep_name TEXT NOT NULL,
      opportunity_id INTEGER,
      opportunity_name TEXT,
      deal_value NUMERIC DEFAULT 0,
      commission_rate NUMERIC DEFAULT 0,
      commission_amount NUMERIC DEFAULT 0,
      rule_id INTEGER,
      rule_name TEXT,
      status VARCHAR(50) DEFAULT 'pending',
      closed_date DATE,
      paid_date DATE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["sales_scoring_rules", `CREATE TABLE IF NOT EXISTS sales_scoring_rules (
      id SERIAL PRIMARY KEY,
      rule_number TEXT UNIQUE,
      name TEXT NOT NULL,
      criteria TEXT NOT NULL,
      weight INTEGER DEFAULT 10,
      max_score INTEGER DEFAULT 10,
      description TEXT,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
    ["crm_custom_reports", `CREATE TABLE IF NOT EXISTS crm_custom_reports (
      id SERIAL PRIMARY KEY,
      report_number TEXT,
      name TEXT NOT NULL,
      description TEXT,
      data_source TEXT DEFAULT 'leads',
      report_type TEXT DEFAULT 'table',
      fields TEXT DEFAULT '{}',
      filters TEXT DEFAULT '{}',
      schedule TEXT DEFAULT 'manual',
      status TEXT DEFAULT 'active',
      row_count INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )`],
    ["crm_cohorts", `CREATE TABLE IF NOT EXISTS crm_cohorts (
      id SERIAL PRIMARY KEY,
      cohort_number TEXT,
      name TEXT NOT NULL,
      description TEXT,
      segment_criteria TEXT,
      customer_count INTEGER DEFAULT 0,
      total_revenue NUMERIC DEFAULT 0,
      retention_rate NUMERIC DEFAULT 0,
      growth_rate NUMERIC DEFAULT 0,
      avg_ltv NUMERIC DEFAULT 0,
      avg_cac NUMERIC DEFAULT 0,
      color TEXT DEFAULT 'blue',
      status TEXT DEFAULT 'active',
      updated_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )`],
    ["crm_sync_devices", `CREATE TABLE IF NOT EXISTS crm_sync_devices (
      id SERIAL PRIMARY KEY,
      device_name TEXT NOT NULL,
      device_type TEXT DEFAULT 'desktop',
      os TEXT,
      user_name TEXT,
      last_sync TIMESTAMP,
      sync_status TEXT DEFAULT 'synced',
      sync_frequency TEXT DEFAULT '30 seconds',
      data_size TEXT DEFAULT '0 MB',
      ip_address TEXT,
      updated_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )`],
    ["crm_win_loss_reasons", `CREATE TABLE IF NOT EXISTS crm_win_loss_reasons (
      id SERIAL PRIMARY KEY,
      opportunity_id INTEGER,
      opportunity_name TEXT,
      outcome TEXT NOT NULL,
      reason TEXT,
      reason_category TEXT,
      competitor TEXT,
      deal_value NUMERIC DEFAULT 0,
      rep_name TEXT,
      stage_lost TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`],
  ];

  for (const [tableName, createSql] of ensureTables) {
    try {
      await db.execute(sql.raw(createSql));
      logger.info(`[Migrations] ${tableName} table ensured`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[Migrations] ${tableName}:`, { error: msg });
    }
  }

  // Ensure crm_opportunities has all columns required by the sales pipeline module
  const crmOppColumns: [string, string][] = [
    ["opportunity_number", "TEXT UNIQUE"],
    ["name", "TEXT"],
    ["customer_name", "TEXT"],
    ["contact_name", "TEXT"],
    ["email", "TEXT"],
    ["phone", "TEXT"],
    ["value", "NUMERIC DEFAULT 0"],
    ["expected_close_date", "DATE"],
    ["assigned_rep", "TEXT"],
    ["assigned_rep_id", "INTEGER"],
    ["source", "TEXT"],
    ["territory", "TEXT"],
    ["lead_score", "INTEGER DEFAULT 0"],
  ];
  for (const [col, def] of crmOppColumns) {
    try {
      await db.execute(sql.raw(`ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS ${col} ${def}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[Migrations] crm_opportunities.${col}:`, { error: msg });
    }
  }
  logger.info("[Migrations] crm_opportunities extended columns ensured");

  // Ensure crm_pipeline_stages has all required columns + stage_key
  try {
    await pool.query(`ALTER TABLE crm_pipeline_stages ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE crm_pipeline_stages ADD COLUMN IF NOT EXISTS probability INTEGER DEFAULT 50`);
    await pool.query(`ALTER TABLE crm_pipeline_stages ADD COLUMN IF NOT EXISTS is_won BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE crm_pipeline_stages ADD COLUMN IF NOT EXISTS is_lost BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE crm_pipeline_stages ADD COLUMN IF NOT EXISTS stage_key VARCHAR(50)`);
    // Check if there are rows with null stage_key
    const nullRows = await pool.query(`SELECT COUNT(*) FROM crm_pipeline_stages WHERE stage_key IS NULL`);
    if (Number(nullRows.rows[0]?.count || 0) > 0) {
      // Update stage_key based on row id order (most reliable if no sort_order set yet)
      await pool.query(`
        UPDATE crm_pipeline_stages t SET stage_key = s.stage_key
        FROM (
          SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM crm_pipeline_stages WHERE stage_key IS NULL
        ) ranked
        JOIN (VALUES (1,'lead'),(2,'qualified'),(3,'proposal'),(4,'negotiation'),(5,'won'),(6,'lost')) AS s(rn, stage_key)
          ON ranked.rn = s.rn
        WHERE t.id = ranked.id
      `);
    }
    logger.info("[Migrations] crm_pipeline_stages columns and stage_key ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] crm_pipeline_stages.stage_key:", { error: msg });
  }

  // Ensure crm_leads has all necessary columns for manual capture
  const crmLeadsColumns: [string, string][] = [
    ["assigned_to", "TEXT"],
    ["priority", "VARCHAR(20) DEFAULT 'medium'"],
    ["estimated_value", "NUMERIC DEFAULT 0"],
  ];
  for (const [col, def] of crmLeadsColumns) {
    try {
      await db.execute(sql.raw(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS ${col} ${def}`));
    } catch {}
  }

  // ─── QMS: Inspection Workflows & SPC ───────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS inspection_plans (
        id SERIAL PRIMARY KEY,
        plan_name TEXT NOT NULL,
        plan_code TEXT,
        inspection_type TEXT NOT NULL DEFAULT 'incoming',
        material_id INTEGER,
        material_name TEXT,
        supplier_id INTEGER,
        supplier_name TEXT,
        sample_size INTEGER DEFAULT 1,
        sampling_method TEXT DEFAULT 'random',
        acceptance_level NUMERIC DEFAULT 0,
        rejection_level NUMERIC,
        description TEXT,
        notes TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    logger.info("[Migrations] inspection_plans table ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] inspection_plans:", { error: msg });
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS inspection_plan_items (
        id SERIAL PRIMARY KEY,
        plan_id INTEGER NOT NULL,
        item_name TEXT NOT NULL,
        parameter_type TEXT DEFAULT 'measurement',
        min_value NUMERIC,
        max_value NUMERIC,
        target_value NUMERIC,
        unit TEXT,
        test_method TEXT,
        is_required BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    logger.info("[Migrations] inspection_plan_items table ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] inspection_plan_items:", { error: msg });
  }

  try {
    await db.execute(sql`
      ALTER TABLE qc_inspections
        ADD COLUMN IF NOT EXISTS plan_id INTEGER,
        ADD COLUMN IF NOT EXISTS material_id INTEGER,
        ADD COLUMN IF NOT EXISTS material_name TEXT,
        ADD COLUMN IF NOT EXISTS supplier_id INTEGER,
        ADD COLUMN IF NOT EXISTS supplier_name TEXT,
        ADD COLUMN IF NOT EXISTS sample_size INTEGER DEFAULT 1,
        ADD COLUMN IF NOT EXISTS disposition TEXT DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS certificate_id INTEGER
    `);
    logger.info("[Migrations] qc_inspections columns expanded");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] qc_inspections expand:", { error: msg });
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS inspection_results (
        id SERIAL PRIMARY KEY,
        inspection_id INTEGER NOT NULL,
        plan_item_id INTEGER,
        measured_value NUMERIC,
        result TEXT DEFAULT 'pending',
        notes TEXT,
        recorded_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    logger.info("[Migrations] inspection_results table ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] inspection_results:", { error: msg });
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS spc_control_charts (
        id SERIAL PRIMARY KEY,
        process_name TEXT NOT NULL,
        parameter_name TEXT NOT NULL,
        chart_type TEXT DEFAULT 'xbar',
        ucl NUMERIC,
        lcl NUMERIC,
        cl NUMERIC,
        usl NUMERIC,
        lsl NUMERIC,
        target NUMERIC,
        unit TEXT,
        subgroup_size INTEGER DEFAULT 5,
        chart_status TEXT DEFAULT 'in_control',
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    logger.info("[Migrations] spc_control_charts table ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] spc_control_charts:", { error: msg });
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS spc_measurements (
        id SERIAL PRIMARY KEY,
        chart_id INTEGER NOT NULL,
        value NUMERIC NOT NULL,
        subgroup_values JSONB,
        inspector TEXT,
        violation_flags JSONB,
        is_out_of_control BOOLEAN DEFAULT FALSE,
        notes TEXT,
        recorded_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    logger.info("[Migrations] spc_measurements table ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] spc_measurements:", { error: msg });
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS quality_certificates (
        id SERIAL PRIMARY KEY,
        cert_number TEXT UNIQUE NOT NULL,
        inspection_id INTEGER,
        cert_type TEXT DEFAULT 'CoC',
        batch_reference TEXT,
        product_name TEXT,
        material_name TEXT,
        supplier_name TEXT,
        inspector_name TEXT,
        test_results JSONB,
        overall_result TEXT DEFAULT 'pass',
        remarks TEXT,
        cert_status TEXT DEFAULT 'issued',
        issued_at TIMESTAMP DEFAULT NOW(),
        expiry_date DATE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    logger.info("[Migrations] quality_certificates table ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] quality_certificates:", { error: msg });
  }
  // ─── end QMS migrations ────────────────────────────────────────────────────

  // ─── Security Hardening migrations ─────────────────────────────────────────
  const securityTables: Array<[string, string]> = [
    ["security_ip_rules", `CREATE TABLE IF NOT EXISTS security_ip_rules (
      id SERIAL PRIMARY KEY,
      ip_address VARCHAR(50) NOT NULL,
      rule_type VARCHAR(20) NOT NULL DEFAULT 'blacklist',
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(ip_address, rule_type)
    )`],
    ["security_geo_rules", `CREATE TABLE IF NOT EXISTS security_geo_rules (
      id SERIAL PRIMARY KEY,
      country_code VARCHAR(5) NOT NULL UNIQUE,
      country_name VARCHAR(100),
      rule_type VARCHAR(10) NOT NULL DEFAULT 'deny',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`],
    ["security_blocked_attempts", `CREATE TABLE IF NOT EXISTS security_blocked_attempts (
      id SERIAL PRIMARY KEY,
      ip_address VARCHAR(50),
      reason TEXT,
      request_path TEXT,
      request_method VARCHAR(10),
      user_agent TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`],
    ["security_vulnerabilities", `CREATE TABLE IF NOT EXISTS security_vulnerabilities (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      severity VARCHAR(20) NOT NULL DEFAULT 'medium',
      status VARCHAR(30) NOT NULL DEFAULT 'open',
      category VARCHAR(100),
      affected_component TEXT,
      cve_id VARCHAR(50),
      assigned_to TEXT,
      scanner_source VARCHAR(100) DEFAULT 'manual',
      remediation_notes TEXT,
      resolved_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`],
    ["security_rate_limit_config", `CREATE TABLE IF NOT EXISTS security_rate_limit_config (
      id SERIAL PRIMARY KEY,
      endpoint_pattern VARCHAR(200) NOT NULL UNIQUE,
      max_requests INTEGER NOT NULL DEFAULT 100,
      window_seconds INTEGER NOT NULL DEFAULT 60,
      scope VARCHAR(30) NOT NULL DEFAULT 'per_user',
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`],
    ["security_cors_policy", `CREATE TABLE IF NOT EXISTS security_cors_policy (
      id SERIAL PRIMARY KEY,
      origin VARCHAR(500) NOT NULL UNIQUE,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`],
    ["security_webhook_secrets", `CREATE TABLE IF NOT EXISTS security_webhook_secrets (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      endpoint_path VARCHAR(500) NOT NULL,
      secret_hash VARCHAR(128) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_used_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`],
  ];

  for (const [tableName, createSql] of securityTables) {
    try {
      await db.execute(sql.raw(createSql));
      logger.info(`[Migrations] ${tableName} table ensured`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[Migrations] ${tableName}:`, { error: msg });
    }
  }

  try {
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_security_blocked_ip ON security_blocked_attempts(ip_address)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_security_blocked_ts ON security_blocked_attempts(created_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_security_vulns_status ON security_vulnerabilities(status, severity)`);
  } catch {}
  // ─── end Security Hardening migrations ─────────────────────────────────────

  // ─── Task 269: HSE Module ───────────────────────────────────────────────────
  try {
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS hse_chemicals (
        id SERIAL PRIMARY KEY,
        chemical_name TEXT NOT NULL,
        trade_name TEXT,
        cas_number TEXT,
        un_number TEXT,
        ghs_hazard_classes TEXT[],
        physical_state TEXT DEFAULT 'solid',
        color TEXT,
        odor TEXT,
        manufacturer TEXT,
        supplier TEXT,
        location TEXT,
        storage_area TEXT,
        quantity NUMERIC(12,3) DEFAULT 0,
        unit TEXT DEFAULT 'kg',
        max_quantity NUMERIC(12,3),
        required_ppe TEXT[],
        handling_precautions TEXT,
        storage_conditions TEXT,
        incompatible_materials TEXT,
        spill_response TEXT,
        fire_response TEXT,
        first_aid_inhalation TEXT,
        first_aid_skin TEXT,
        first_aid_eyes TEXT,
        first_aid_ingestion TEXT,
        disposal_method TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        is_active BOOLEAN DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS hse_msds_documents (
        id SERIAL PRIMARY KEY,
        chemical_id INTEGER NOT NULL REFERENCES hse_chemicals(id) ON DELETE CASCADE,
        document_number TEXT,
        revision TEXT DEFAULT '1.0',
        language TEXT DEFAULT 'he',
        file_name TEXT,
        file_path TEXT,
        file_size INTEGER,
        issue_date DATE,
        expiry_date DATE,
        supplier TEXT,
        is_current BOOLEAN DEFAULT TRUE,
        status TEXT NOT NULL DEFAULT 'active',
        uploaded_by TEXT DEFAULT 'system',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS hse_work_permit_types (
        id SERIAL PRIMARY KEY,
        type_code TEXT NOT NULL UNIQUE,
        type_name TEXT NOT NULL,
        description TEXT,
        checklist_items JSONB DEFAULT '[]',
        required_approvers INTEGER DEFAULT 2,
        icon TEXT,
        color TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS hse_work_permits (
        id SERIAL PRIMARY KEY,
        permit_number TEXT,
        permit_type TEXT NOT NULL DEFAULT 'hot_work',
        title TEXT NOT NULL,
        description TEXT,
        location TEXT,
        area TEXT,
        work_area_description TEXT,
        requester_name TEXT,
        requester_department TEXT,
        requester_phone TEXT,
        contractor_name TEXT,
        workers_count INTEGER DEFAULT 1,
        planned_start TIMESTAMPTZ,
        planned_end TIMESTAMPTZ,
        actual_start TIMESTAMPTZ,
        actual_end TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'draft',
        approval_level INTEGER DEFAULT 0,
        required_approval_levels INTEGER DEFAULT 2,
        approval_status TEXT DEFAULT 'not_started',
        checklist_verified BOOLEAN DEFAULT FALSE,
        checklist_data JSONB,
        hazards_identified TEXT,
        control_measures TEXT,
        emergency_procedure TEXT,
        required_ppe TEXT[],
        required_equipment TEXT,
        gas_test_required BOOLEAN DEFAULT FALSE,
        gas_test_result TEXT,
        fire_watch_required BOOLEAN DEFAULT FALSE,
        standby_person TEXT,
        isolation_points TEXT,
        approved_by_safety TEXT,
        approved_by_manager TEXT,
        approved_at TIMESTAMPTZ,
        closed_by TEXT,
        closed_at TIMESTAMPTZ,
        closure_notes TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS hse_permit_approvals (
        id SERIAL PRIMARY KEY,
        permit_id INTEGER NOT NULL REFERENCES hse_work_permits(id) ON DELETE CASCADE,
        approver_name TEXT NOT NULL,
        approver_role TEXT NOT NULL,
        approver_level INTEGER DEFAULT 1,
        decision TEXT NOT NULL DEFAULT 'pending',
        comments TEXT,
        approved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));
    // Add missing columns to existing hse_work_permits if they already exist without them
    await db.execute(sql`ALTER TABLE hse_work_permits ADD COLUMN IF NOT EXISTS approval_level INTEGER DEFAULT 0`);
    await db.execute(sql`ALTER TABLE hse_work_permits ADD COLUMN IF NOT EXISTS required_approval_levels INTEGER DEFAULT 2`);
    await db.execute(sql`ALTER TABLE hse_work_permits ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'not_started'`);
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS hse_emergency_contacts (
        id SERIAL PRIMARY KEY,
        contact_type TEXT NOT NULL DEFAULT 'internal',
        name TEXT NOT NULL,
        role TEXT,
        organization TEXT,
        phone_primary TEXT,
        phone_secondary TEXT,
        email TEXT,
        available_hours TEXT DEFAULT '24/7',
        priority INTEGER DEFAULT 1,
        is_active BOOLEAN DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS hse_evacuation_plans (
        id SERIAL PRIMARY KEY,
        building TEXT NOT NULL,
        floor TEXT,
        area_description TEXT,
        assembly_point TEXT,
        primary_exit TEXT,
        secondary_exit TEXT,
        warden_name TEXT,
        warden_phone TEXT,
        deputy_warden_name TEXT,
        max_occupancy INTEGER,
        special_needs_procedure TEXT,
        plan_file_path TEXT,
        last_review_date DATE,
        next_review_date DATE,
        status TEXT NOT NULL DEFAULT 'active',
        is_active BOOLEAN DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS hse_drill_schedules (
        id SERIAL PRIMARY KEY,
        drill_type TEXT NOT NULL DEFAULT 'fire',
        title TEXT NOT NULL,
        description TEXT,
        scheduled_date DATE,
        scheduled_time TEXT,
        building TEXT,
        area TEXT,
        frequency TEXT DEFAULT 'annual',
        duration_minutes INTEGER DEFAULT 30,
        coordinator_name TEXT,
        coordinator_phone TEXT,
        status TEXT NOT NULL DEFAULT 'scheduled',
        notification_sent BOOLEAN DEFAULT FALSE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS hse_drill_records (
        id SERIAL PRIMARY KEY,
        schedule_id INTEGER REFERENCES hse_drill_schedules(id),
        drill_type TEXT NOT NULL DEFAULT 'fire',
        title TEXT NOT NULL,
        drill_date DATE NOT NULL,
        start_time TEXT,
        end_time TEXT,
        actual_duration_minutes INTEGER,
        building TEXT,
        area TEXT,
        participants_count INTEGER DEFAULT 0,
        attendance_notes TEXT,
        coordinator_name TEXT,
        scenario_description TEXT,
        evacuation_time_seconds INTEGER,
        issues_found TEXT,
        improvement_items TEXT,
        overall_rating TEXT DEFAULT 'good',
        follow_up_actions TEXT,
        follow_up_deadline DATE,
        attachments TEXT,
        status TEXT NOT NULL DEFAULT 'completed',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS hse_emergency_equipment (
        id SERIAL PRIMARY KEY,
        equipment_type TEXT NOT NULL DEFAULT 'fire_extinguisher',
        equipment_id_tag TEXT,
        description TEXT,
        building TEXT,
        floor TEXT,
        location_description TEXT,
        latitude NUMERIC(10,7),
        longitude NUMERIC(10,7),
        installation_date DATE,
        last_inspection_date DATE,
        next_inspection_date DATE,
        inspection_frequency_months INTEGER DEFAULT 12,
        inspector_name TEXT,
        status TEXT NOT NULL DEFAULT 'operational',
        condition TEXT DEFAULT 'good',
        quantity INTEGER DEFAULT 1,
        specification TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));
    // Seed permit types (codes match CHECKLIST_BY_TYPE keys in hse-routes.ts)
    await db.execute(sql.raw(`
      INSERT INTO hse_work_permit_types (type_code, type_name, description, required_approvers) VALUES
      ('hot_work', 'עבודה חמה', 'ריתוך, חיתוך, גרינדינג וכל עבודה המייצרת חום או ניצוצות', 2),
      ('confined_space', 'כניסה למרחב מוגבל', 'כניסה לבורות, מיכלים, צנרת או חלל סגור', 2),
      ('electrical_isolation', 'בידוד חשמלי', 'עבודה על לוחות חשמל — LOTO נדרש', 2),
      ('excavation', 'חפירה', 'עבודות חפירה ועבודת עפר', 2),
      ('working_at_heights', 'עבודה בגובה', 'עבודה בגובה מעל 1.8 מטר', 2)
      ON CONFLICT (type_code) DO NOTHING
    `));
    // Seed emergency contacts (guard: only seed if table is empty)
    const { rows: ecRows } = await pool.query(`SELECT COUNT(*) FROM hse_emergency_contacts`);
    if (parseInt(ecRows[0].count, 10) === 0) {
      await db.execute(sql.raw(`
        INSERT INTO hse_emergency_contacts (contact_type, name, role, organization, phone_primary, available_hours, priority) VALUES
        ('emergency', 'מד"א', 'חירום', 'מד"א', '101', '24/7', 1),
        ('emergency', 'כיבוי אש', 'כיבוי', 'כיבוי אש', '102', '24/7', 2),
        ('emergency', 'משטרה', 'ביטחון', 'משטרת ישראל', '100', '24/7', 3),
        ('internal', 'ממונה בטיחות', 'Safety Officer', 'חברה', '050-1234567', 'שעות עבודה', 4)
      `));
    }
    // Seed emergency equipment (guard: only seed if table is empty)
    const { rows: eeRows } = await pool.query(`SELECT COUNT(*) FROM hse_emergency_equipment`);
    if (parseInt(eeRows[0].count, 10) === 0) {
      await db.execute(sql.raw(`
        INSERT INTO hse_emergency_equipment (equipment_type, equipment_id_tag, description, building, floor, location_description, next_inspection_date, status) VALUES
        ('fire_extinguisher', 'EXT-001', 'מטף אבקה 6 ק"ג', 'בניין ראשי', 'קומת קרקע', 'קרוב לכניסה הראשית', CURRENT_DATE + INTERVAL '6 months', 'operational'),
        ('first_aid_kit', 'FA-001', 'ערכת עזרה ראשונה', 'בניין ראשי', 'קומת קרקע', 'חדר ניהול', CURRENT_DATE + INTERVAL '3 months', 'operational')
      `));
    }
    logger.info("[Migrations] Task 269 HSE Module tables ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] Task 269 HSE:", { error: msg });
  }
  // ─── end Task 269 ───────────────────────────────────────────────────────────

  // ─── FTS Indexes (Hebrew Full-Text Search) ────────────────────────────────
  // Helper: get the set of column names actually present in a table (returns empty set if table missing)
  async function getTableColumns(tableName: string): Promise<Set<string>> {
    try {
      const result = await db.execute(sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = ${tableName} AND table_schema = 'public'
      `);
      const cols = new Set<string>();
      for (const row of result.rows as Record<string, unknown>[]) {
        if (typeof row.column_name === "string") cols.add(row.column_name);
      }
      return cols;
    } catch {
      return new Set<string>();
    }
  }

  try {
    const custCols = await getTableColumns("customers");
    if (custCols.size === 0) {
      logger.info("[Migrations] customers table not found — skipping FTS index");
    } else {
      // prefer customer_name (schema definition), fall back to name (legacy DB column)
      const nameCol = custCols.has("customer_name")
        ? "customer_name"
        : custCols.has("name")
          ? "name"
          : null;
      if (!nameCol) {
        logger.info("[Migrations] customers FTS index — no usable name column found, skipping");
      } else {
        const hasCp = custCols.has("contact_person");
        const hasEmail = custCols.has("email");
        const hasCity = custCols.has("city");
        const parts = [
          `coalesce(${nameCol}, '')`,
          hasCp ? "coalesce(contact_person, '')" : "''",
          hasEmail ? "coalesce(email, '')" : "''",
          hasCity ? "coalesce(city, '')" : "''",
        ].join(" || ' ' || ");
        await db.execute(sql.raw(`
          CREATE INDEX IF NOT EXISTS idx_customers_fts ON customers
          USING GIN (to_tsvector('simple', ${parts}))
        `));
        logger.info("[Migrations] FTS index on customers ensured");
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.info("[Migrations] customers FTS index skipped", { reason: msg });
  }

  try {
    const empCols = await getTableColumns("employees");
    if (empCols.size === 0) {
      logger.info("[Migrations] employees table not found — skipping FTS index");
    } else {
      const namePart = empCols.has("full_name")
        ? "coalesce(full_name, '')"
        : empCols.has("first_name")
          ? "coalesce(first_name, '') || ' ' || coalesce(last_name, '')"
          : "''";
      const emailPart = empCols.has("email") ? "coalesce(email, '')" : "''";
      const phonePart = empCols.has("phone") ? "coalesce(phone, '')" : "''";
      const deptPart = empCols.has("department") ? "coalesce(department, '')" : "''";
      const parts = `${namePart} || ' ' || ${emailPart} || ' ' || ${phonePart} || ' ' || ${deptPart}`;
      await db.execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS idx_employees_fts ON employees
        USING GIN (to_tsvector('simple', ${parts}))
      `));
      logger.info("[Migrations] FTS index on employees ensured");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.info("[Migrations] employees FTS index skipped", { reason: msg });
  }

  try {
    const woCols = await getTableColumns("production_work_orders");
    if (woCols.size === 0) {
      logger.info("[Migrations] production_work_orders table not found — skipping FTS index");
    } else {
      // order_number is always present; prefer product_name + notes; fall back to description if present
      const hasOrderNum = woCols.has("order_number");
      const hasProductName = woCols.has("product_name");
      const hasDescription = woCols.has("description");
      const hasNotes = woCols.has("notes");
      const descPart = hasProductName
        ? "coalesce(product_name, '')"
        : hasDescription
          ? "coalesce(description, '')"
          : "''";
      const notesPart = hasNotes ? "coalesce(notes, '')" : "''";
      const orderPart = hasOrderNum ? "coalesce(order_number, '')" : "''";
      const parts = `${orderPart} || ' ' || ${descPart} || ' ' || ${notesPart}`;
      await db.execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS idx_production_work_orders_fts ON production_work_orders
        USING GIN (to_tsvector('simple', ${parts}))
      `));
      logger.info("[Migrations] FTS index on production_work_orders ensured");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.info("[Migrations] production_work_orders FTS index skipped", { reason: msg });
  }

  try {
    const invCols = await getTableColumns("inventory");
    if (invCols.size === 0) {
      logger.info("[Migrations] inventory table not yet created — skipping FTS index");
    } else {
      const hasItemCode = invCols.has("item_code");
      const hasName = invCols.has("name");
      const hasCategory = invCols.has("category");
      const parts = [
        hasItemCode ? "coalesce(item_code, '')" : "''",
        hasName ? "coalesce(name, '')" : "''",
        hasCategory ? "coalesce(category, '')" : "''",
      ].join(" || ' ' || ");
      await db.execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS idx_inventory_fts ON inventory
        USING GIN (to_tsvector('simple', ${parts}))
      `));
      logger.info("[Migrations] FTS index on inventory ensured");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.info("[Migrations] inventory FTS index skipped", { reason: msg });
  }
  // ─── end FTS Indexes ────────────────────────────────────────────────────────
}

initSentry();

const app: Express = express();

const isProduction = process.env.NODE_ENV === "production";

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com", "https://apis.google.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", "https://oauth2.googleapis.com", "https://accounts.google.com"],
        frameSrc: ["https://accounts.google.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    xFrameOptions: { action: "deny" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);

app.use(compression());

app.use(requestLogger);

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : null;

if (isProduction && !allowedOrigins) {
  logger.warn("CORS_ORIGINS not set in production - defaulting to same-origin only");
}

app.use(
  cors({
    origin: isProduction
      ? allowedOrigins
        ? (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
              callback(null, true);
            } else {
              callback(new Error("Not allowed by CORS"));
            }
          }
        : false
      : true,
    credentials: true,
  }),
);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 1000 : 50000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "יותר מדי בקשות, אנא נסה שוב מאוחר יותר." },
  skip: (req) => req.path === "/healthz",
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "ניסיונות התחברות רבים מדי, אנא נסה שוב מאוחר יותר." },
});

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100, // 100 requests per minute for search
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "יותר מדי בקשות חיפוש, אנא חכה לפני ניסיון שוב." },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProduction ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many AI requests, please wait before trying again." },
});

const fileUploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProduction ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many file upload requests, please wait before trying again." },
});

app.use(express.json({
  limit: "10mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(
  /^\/api\/edi\/webhook\//,
  express.text({
    type: ["text/plain", "application/edi-x12", "application/edifact", "application/octet-stream", "*/*"],
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(sanitizeMiddleware);

app.set("trust proxy", 1);

const csrfSafeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
app.use("/api", (req, res, next) => {
  if (csrfSafeMethods.has(req.method)) return next();
  if (req.path.includes("/webhook/")) return next();
  
  const origin = req.get("origin");
  const referer = req.get("referer");
  const host = req.get("host");
  
  const allowedHosts = new Set<string>();
  if (host) allowedHosts.add(host);
  if (allowedOrigins) {
    for (const o of allowedOrigins) {
      try { allowedHosts.add(new URL(o).host); } catch {}
    }
  }
  if (process.env.REPLIT_DEV_DOMAIN) allowedHosts.add(process.env.REPLIT_DEV_DOMAIN);
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    allowedHosts.add(`${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
  }
  const replitAppDomain = process.env.REPLIT_APP_DOMAIN;
  if (replitAppDomain) allowedHosts.add(replitAppDomain);

  const sourceHeader = origin || referer;
  
  if (!sourceHeader) {
    const contentType = req.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return next();
    }
    if (isProduction) {
      logger.warn("CSRF missing origin/referer blocked", { method: req.method, path: req.path });
      return res.status(403).json({ error: "Origin header required" });
    }
    return next();
  }
  
  let requestHost = "";
  try {
    requestHost = new URL(sourceHeader).host;
  } catch {
    if (isProduction) {
      logger.warn("CSRF unparsable origin blocked", { origin, referer });
      return res.status(403).json({ error: "Invalid origin" });
    }
    return next();
  }
  
  if (!requestHost || !allowedHosts.has(requestHost)) {
    if (isProduction) {
      logger.warn("CSRF origin mismatch blocked", { origin, referer, host, requestHost });
      return res.status(403).json({ error: "Origin not allowed" });
    }
  }
  
  next();
});

app.use((req, _res, next) => {
  const versionMatch = req.url.match(/^\/api\/(v[12])(\/|$)/);
  if (versionMatch) {
    const ver = versionMatch[1];
    (req as Record<string, unknown>).apiVersion = ver;
    req.headers["x-api-version"] = ver;
    const rest = req.url.substring(`/api/${ver}`.length);
    req.url = "/api" + (rest || "/");
  } else if (req.url.startsWith("/api/") || req.url === "/api") {
    (req as Record<string, unknown>).apiVersion = "v1";
  }
  next();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 30 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "ניסיונות התחברות רבים מדי, אנא נסה שוב מאוחר יותר." },
});
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/google", authLimiter);

const AI_PATH_RE = /^\/api\/(claude|kimi|ai-[^/]*)/;
app.use((req, res, next) => {
  if (AI_PATH_RE.test(req.path)) {
    aiLimiter(req, res, next);
    return;
  }
  next();
});

const UPLOAD_PATH_RE = /^\/api\/(document-files\/upload|platform\/entities\/[^/]+\/records\/import(\/preview)?|products\/[^/]+\/image|chat\/upload|kobi\/upload|data-migration\/(preview|import)\/[^/]+)$/;
app.use((req, res, next) => {
  if (UPLOAD_PATH_RE.test(req.path)) {
    fileUploadLimiter(req, res, next);
    return;
  }
  next();
});

const REQUEST_TIMEOUT_MS = 30_000;
const requestTimeout: express.RequestHandler = (req, res, next) => {
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: "Gateway Timeout" });
    }
  }, REQUEST_TIMEOUT_MS);
  res.on("close", () => clearTimeout(timer));
  res.on("finish", () => clearTimeout(timer));
  next();
};

app.use("/api", requestTimeout);

app.use(requestTransformMiddleware);
app.use(responseTransformMiddleware);

app.get("/api/version", (_req, res) => {
  res.json({
    current: "v1",
    supported: ["v1", "v2"],
    deprecated: [],
    info: "Use /api/v1/ or /api/v2/ for version-locked access. Unversioned /api/ defaults to v1.",
  });
});

// ─── PUBLIC PORTAL ENDPOINTS (no ERP auth, token-scoped access) ─────────────
app.get("/api/public/project-portal/:token", apiLimiter, async (req, res) => {
  try {
    const { token } = req.params;
    const { rows } = await pool.query(
      `SELECT pa.*, p.project_name, p.project_number, p.status, p.completion_pct,
              p.start_date, p.end_date, p.customer_name, p.description, p.manager_name
       FROM project_portal_access pa
       JOIN projects p ON p.id = pa.project_id
       WHERE pa.access_token = $1 AND pa.is_active = true
         AND (pa.expires_at IS NULL OR pa.expires_at > NOW())`,
      [token]
    );
    if (!rows.length) return res.status(401).json({ error: "Invalid or expired access token" });
    await pool.query(`UPDATE project_portal_access SET last_accessed_at = NOW() WHERE access_token = $1`, [token]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get("/api/public/project-portal/:token/milestones", apiLimiter, async (req, res) => {
  try {
    const { token } = req.params;
    const { rows: access } = await pool.query(
      `SELECT * FROM project_portal_access WHERE access_token = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())`,
      [token]
    );
    if (!access.length) return res.status(401).json({ error: "Invalid or expired access token" });
    const { rows } = await pool.query(
      `SELECT * FROM project_milestones WHERE project_id = $1 ORDER BY target_date ASC, created_at ASC`,
      [access[0].project_id]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post("/api/public/project-portal/:token/milestones/:milestoneId/approve", apiLimiter, express.json(), async (req, res) => {
  try {
    const { token } = req.params;
    const milestoneId = parseInt(req.params.milestoneId, 10);
    if (!milestoneId) return res.status(400).json({ error: "Invalid milestoneId" });
    const { rows: access } = await pool.query(
      `SELECT * FROM project_portal_access WHERE access_token = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())`,
      [token]
    );
    if (!access.length) return res.status(401).json({ error: "Invalid or expired access token" });
    const perms = access[0].permissions || {};
    if (!perms.approve_milestones) return res.status(403).json({ error: "No milestone approval permission" });
    const { rows } = await pool.query(
      `UPDATE project_milestones SET status = 'approved', updated_at = NOW() WHERE id = $1 AND project_id = $2 RETURNING *`,
      [milestoneId, access[0].project_id]
    );
    if (!rows.length) return res.status(404).json({ error: "Milestone not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get("/api/public/project-portal/:token/comments", apiLimiter, async (req, res) => {
  try {
    const { token } = req.params;
    const { rows: access } = await pool.query(
      `SELECT * FROM project_portal_access WHERE access_token = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())`,
      [token]
    );
    if (!access.length) return res.status(401).json({ error: "Invalid or expired access token" });
    const { rows } = await pool.query(
      `SELECT * FROM project_comments WHERE project_id = $1 ORDER BY created_at ASC`,
      [access[0].project_id]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post("/api/public/project-portal/:token/comments", apiLimiter, express.json(), async (req, res) => {
  try {
    const { token } = req.params;
    const { rows: access } = await pool.query(
      `SELECT * FROM project_portal_access WHERE access_token = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())`,
      [token]
    );
    if (!access.length) return res.status(401).json({ error: "Invalid or expired access token" });
    const perms = access[0].permissions || {};
    if (!perms.submit_comments) return res.status(403).json({ error: "No comment submission permission" });
    const { message, authorName, milestoneId } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });
    const { rows } = await pool.query(
      `INSERT INTO project_comments (project_id, milestone_id, author_type, author_name, author_email, message)
       VALUES ($1,$2,'external',$3,$4,$5) RETURNING *`,
      [access[0].project_id, milestoneId || null, authorName || access[0].contact_email || "Customer", access[0].contact_email || null, message]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
// Public: get change orders for portal (token-scoped, view_documents permission — shows CO status to client)
app.get("/api/public/project-portal/:token/change-orders", apiLimiter, async (req, res) => {
  try {
    const { token } = req.params;
    const { rows: access } = await pool.query(
      `SELECT * FROM project_portal_access WHERE access_token = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())`,
      [token]
    );
    if (!access.length) return res.status(401).json({ error: "Invalid or expired access token" });
    const perms = access[0].permissions || {};
    if (!perms.view_documents) return res.status(403).json({ error: "No change order access permission" });
    const projectId = access[0].project_id;
    const { rows } = await pool.query(
      `SELECT change_number, title, description, reason, status, cost_impact, schedule_impact, scope_impact, requested_by, approved_by, approval_date, created_at
       FROM project_change_orders
       WHERE project_id = $1
       ORDER BY created_at DESC`,
      [projectId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
// Public: get approved documents + linked work orders for portal
// Documents are scoped strictly to this project via project_id column or explicit join.
// No fuzzy/name-based matching is used to prevent cross-project data exposure.
app.get("/api/public/project-portal/:token/documents", apiLimiter, async (req, res) => {
  try {
    const { token } = req.params;
    const { rows: access } = await pool.query(
      `SELECT * FROM project_portal_access WHERE access_token = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())`,
      [token]
    );
    if (!access.length) return res.status(401).json({ error: "Invalid or expired access token" });
    const perms = access[0].permissions || {};
    if (!perms.view_documents) return res.status(403).json({ error: "No document access permission" });
    const projectId = access[0].project_id;
    // Scope documents strictly to this project (project_id FK or work-order-linked doc refs).
    // Fall back to empty if no project_id column exists in documents table.
    let docs: any[] = [];
    try {
      const { rows } = await pool.query(
        `SELECT id, title, type, category, description, version, status, created_at, updated_at
         FROM documents
         WHERE project_id = $1
           AND (status = 'approved' OR status = 'published' OR status = 'active')
         ORDER BY created_at DESC LIMIT 50`,
        [projectId]
      );
      docs = rows;
    } catch (_colErr) {
      // If project_id column doesn't exist in documents table, return empty array (safe default)
      docs = [];
    }
    // Return work orders linked to this project's tasks (scoped by project_id via FK join)
    const { rows: woLinks } = await pool.query(
      `SELECT wo.order_number, wo.product_name AS title, wo.status, wo.completion_percentage, wo.planned_end AS due_date, wo.notes
       FROM project_work_order_links pwl
       JOIN production_work_orders wo ON wo.id = pwl.work_order_id
       JOIN project_tasks pt ON pt.id = pwl.project_task_id
       WHERE pt.project_id = $1
       ORDER BY wo.created_at DESC LIMIT 20`,
      [projectId]
    );
    res.json({ documents: docs, workOrders: woLinks });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
// ─────────────────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== "production") {
  app.use("/api/docs", openapiRouter);
  app.use("/api-docs", apiDocsRouter);
}

const AUTH_WHITELIST = [
  "/auth/login",
  "/auth/mfa-login",
  "/auth/register",
  "/auth/refresh",
  "/auth/refresh-session",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/google",
  "/auth/google/client-id",
  "/auth/logout",
  "/auth/public-register",
  "/healthz",
  "/health",
  "/e-signature/sign",
  "/e-signature/decline",
  "/e-signature-webhook",
  "/integration-hub/incoming",
  "/chat/stream",
  "/chat/online-users",
  "/live-ops/stream",
];

async function globalApiAuthGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const reqPath = req.path;
  const isWhitelisted = AUTH_WHITELIST.some(
    (p) => reqPath === p || reqPath.startsWith(p + "/")
  );
  if (isWhitelisted) {
    return next();
  }

  if (req.headers["x-api-key"]) {
    return next();
  }

  let token: string | null = null;
  if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  } else {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else if (req.query?.token && typeof req.query.token === "string") {
      // Support query param token for SSE EventSource connections
      token = req.query.token;
    }
  }

  if (!token) {
    res.status(401).json({ error: "נדרשת התחברות" });
    return;
  }

  try {
    const { user, error } = await validateSession(token);
    if (error || !user) {
      res.status(401).json({ error: error || "לא מחובר" });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: "טוקן לא תקין" });
  }
}

const combinedApiRouter = Router();
combinedApiRouter.get("/e-signature/sign/:token", contractSigningPageHandler);
combinedApiRouter.post("/e-signature/sign/:token", contractSigningSubmitHandler);
combinedApiRouter.post("/e-signature/decline/:token", contractDeclineHandler);
combinedApiRouter.post("/e-signature-webhook/:provider", eSignatureWebhookHandler);
combinedApiRouter.use(securityRouter);
combinedApiRouter.use(accountingExportRouter);
combinedApiRouter.get("/graphql", (_req, res) => {
  res.send(`<!DOCTYPE html><html><head><title>GraphQL — טכנו-כל עוזי</title><link rel="stylesheet" href="https://unpkg.com/graphiql@3.0.6/graphiql.min.css"/></head><body style="height:100vh;margin:0"><div id="graphiql" style="height:100vh"></div><script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script><script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script><script crossorigin src="https://unpkg.com/graphiql@3.0.6/graphiql.min.js"></script><script>const f=GraphiQL.createFetcher({url:window.location.origin+'/api/graphql',headers:{'Authorization':'Bearer '+(localStorage.getItem('erp_auth_token')||'')}});ReactDOM.createRoot(document.getElementById('graphiql')).render(React.createElement(GraphiQL,{fetcher:f}))</script></body></html>`);
});
combinedApiRouter.use(hseRouter);
combinedApiRouter.use(router);
combinedApiRouter.use(serverHealthRouter);
combinedApiRouter.use(graphqlRouter);
combinedApiRouter.use(createApiKeyRoutes());

// Public static serving for HSE MSDS files (safety data sheets — not sensitive)
const hseUploadsDir = path.join(process.cwd(), "uploads", "hse-msds");
app.use("/hse-files", express.static(hseUploadsDir));

app.use(ipFilterMiddleware);
app.use(webhookVerifyMiddleware);

const HEALTHZ_DB_TIMEOUT_MS = 2000;

async function probeDbHealth(): Promise<"ok" | "timeout" | "error"> {
  const client = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  const timeoutHandle = setTimeout(() => {
    client.end().catch(() => {});
  }, HEALTHZ_DB_TIMEOUT_MS);
  try {
    await client.connect();
    await client.query("SELECT 1");
    return "ok";
  } catch (err) {
    const msg = (err as Error)?.message ?? "";
    return msg.includes("timeout") || msg.includes("ETIMEDOUT") ? "timeout" : "error";
  } finally {
    clearTimeout(timeoutHandle);
    client.end().catch(() => {});
  }
}

app.get("/api/healthz", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  const checks: Record<string, string> = {};
  const start = Date.now();
  const probeResult = await Promise.race([
    probeDbHealth(),
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), HEALTHZ_DB_TIMEOUT_MS + 500)),
  ]);
  if (probeResult === "ok") {
    checks.database = `ok (${Date.now() - start}ms)`;
  } else {
    checks.database = probeResult;
  }
  checks.memory = `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`;
  checks.uptime = `${Math.round(process.uptime())}s`;
  const healthy = checks.database.startsWith("ok");
  if (!healthy) {
    const reason = checks.database === "timeout" ? "db_timeout" : "db_error";
    res.status(503).json({ status: "degraded", reason, checks });
    return;
  }
  res.status(200).json({ status: "ok", checks });
});

app.get("/api/health", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  const mem = process.memoryUsage();
  let dbStatus: "ok" | "error" = "ok";
  const DB_PROBE_MS = 2500;
  const dbProbe = (async () => {
    const c = await pool.connect();
    try {
      await c.query(`SET statement_timeout = ${DB_PROBE_MS}`);
      await c.query("SELECT 1");
      await c.query("RESET statement_timeout").catch(() => {});
    } finally {
      c.release();
    }
  })();
  const timeout = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), DB_PROBE_MS)
  );
  const result = await Promise.race([dbProbe.then(() => "ok" as const).catch(() => "error" as const), timeout]);
  if (result !== "ok") {
    dbStatus = "error";
  }
  res.status(200).json({
    status: "ok",
    db: dbStatus,
    uptime: Math.round(process.uptime()),
    memory: {
      used: Math.round(mem.rss / 1024 / 1024),
      total: Math.round((mem.rss + mem.external) / 1024 / 1024),
    },
  });
});

const USER_OWNED_DELETE_PATHS = [
  "/field-ops/gps/saved-locations/",
  "/field-ops/gps/share/",
];

function globalSuperAdminDeleteGuard(req: Request, res: Response, next: NextFunction) {
  const isDeleteMethod = req.method === "DELETE";
  const isDestructivePost = req.method === "POST" && (
    req.path.endsWith("/bulk-delete") ||
    req.path.endsWith("/bulk/delete") ||
    req.path.endsWith("/delete") ||
    req.path.endsWith("/permanent-delete") ||
    req.path.endsWith("/hard-delete")
  );
  if (!isDeleteMethod && !isDestructivePost) return next();
  if (isDeleteMethod && USER_OWNED_DELETE_PATHS.some(p => req.path.includes(p))) return next();
  const permissions = (req as any).permissions;
  if (!permissions?.isSuperAdmin) {
    return res.status(403).json({ error: "מחיקה מותרת רק למנהל מערכת ראשי" });
  }
  return next();
}

app.post("/api/integration-hub/webhooks/:token/receive", express.json(), async (req, res) => {
  try {
    const { token } = req.params;
    const { pool: dbPool } = await import("@workspace/db");
    const { rows } = await dbPool.query(
      `SELECT * FROM integration_webhooks WHERE unique_id = $1 LIMIT 1`,
      [token]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: "Webhook not found" });
    const wh = rows[0];
    if (!wh.is_active) return res.status(410).json({ ok: false, error: "Webhook disabled" });
    const whSecret = wh.secret || wh.webhook_secret || wh.secret_key;
    if (whSecret) {
      const sig = req.headers["x-webhook-signature"] || req.headers["x-webhook-secret"];
      if (!sig || sig !== whSecret) return res.status(401).json({ ok: false, error: "Invalid signature" });
    }
    const payload = req.body || {};
    const eventType = payload.event || payload.event_type || req.headers["x-event-type"] || "incoming";
    await dbPool.query(
      `INSERT INTO integration_events (webhook_id, event_type, direction, status, payload) VALUES ($1,$2,'incoming','received',$3)`,
      [wh.id, eventType, JSON.stringify(payload)]
    );
    try {
      await dbPool.query(`UPDATE integration_webhooks SET last_triggered = NOW(), last_status = 'received' WHERE id = $1`, [wh.id]);
    } catch {
      try { await dbPool.query(`UPDATE integration_webhooks SET last_triggered_at = NOW(), last_status = 'received' WHERE id = $1`, [wh.id]); } catch {}
    }
    res.json({ ok: true, received: true, webhook: wh.name, event: eventType });
  } catch (err: any) {
    console.error("[Webhook Receive] Error:", err.message, err.stack?.split("\n")[1]);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

app.post("/api/integration-hub/incoming", express.json(), async (req, res) => {
  try {
    const { pool: dbPool } = await import("@workspace/db");
    const { rows: secretRows } = await dbPool.query(`SELECT value FROM system_settings WHERE key = 'n8n_incoming_secret' LIMIT 1`).catch(() => ({ rows: [] }));
    const secret = secretRows[0]?.value;
    if (secret) {
      const signature = req.headers["x-webhook-signature"] || req.headers["x-hub-signature-256"] || req.headers["x-n8n-signature"];
      if (!signature) return res.status(401).json({ ok: false, error: "Missing webhook signature" });
      const crypto = await import("crypto");
      const expected = crypto.createHmac("sha256", secret).update(JSON.stringify(req.body || {})).digest("hex");
      const sigStr = String(signature).replace(/^sha256=/, "");
      if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sigStr.padEnd(expected.length)))) {
        return res.status(403).json({ ok: false, error: "Invalid webhook signature" });
      }
    }
    const payload = req.body || {};
    const eventType = payload.event || payload.type || "incoming";
    await dbPool.query(
      `INSERT INTO integration_events (event_type, direction, status, payload, response_code, latency_ms) VALUES ($1, $2, $3, $4, $5, $6)`,
      [eventType, "incoming", "received", JSON.stringify(payload), 200, 0]
    );
    res.json({ ok: true, received: true, event: eventType, timestamp: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
app.use("/api", apiLimiter, globalApiAuthGuard, apiKeyAuthMiddleware, attachPermissions, dynamicRateLimitMiddleware, perUserRateLimit, gatewayCacheMiddleware(), auditMiddleware, globalSuperAdminDeleteGuard, combinedApiRouter);
app.use(apiLimiter, apiKeyAuthMiddleware, attachPermissions, globalSuperAdminDeleteGuard, qualityManagementRouter);

setExpressApp(app);

setupSentryErrorHandler(app);
app.use(globalErrorHandler);

// deferredStartup: Heavy initialization (DB seeding, workflow engine,
// AI enrichment, live-ops bridge) is deferred so that the HTTP server
// can start listening immediately. This keeps the process responsive
// to health-checks (/healthz) during boot, preventing premature
// container restarts in Autoscale deployments.
export async function deferredStartup() {
  try {
    await runMigrations();
  } catch (err: any) {
    logger.error("Failed to run migrations", { error: err.message });
  }

  try {
    await ensureSuperAdminRole();
  } catch (err: any) {
    logger.error("Failed to ensure Super Admin role", { error: err.message });
  }

  try {
    await ensureExecutiveManagerRole();
  } catch (err: any) {
    logger.error("Failed to ensure Executive Manager role", { error: err.message });
  }

  try {
    await ensureDefaultWorkerRoles();
  } catch (err: any) {
    logger.error("Failed to seed default worker roles", { error: err.message });
  }

  try {
    await seedAllModules();
  } catch (err: any) {
    logger.error("Failed to seed modules", { error: err.message });
  }

  try {
    await runCrmSeed();
  } catch (err: any) {
    logger.error("CRM seed init error", { error: err.message });
  }

  initializeWorkflowEngine();
  initializeAIEnrichment();
  initLiveOpsBridge();

  seedDefaultChannels().catch(err => {
    logger.error("[Chat] Failed to seed default channels:", { error: err.message });
  });

  seedDefaultDocumentFolders().catch(err => {
    logger.error("[Documents] Failed to seed default folders:", { error: err.message });
  });

  seedContractTemplates().catch(err => {
    logger.error("[ContractTemplates] Failed to seed templates:", { error: err.message });
  });

  startSessionCleanup();
  startEscalationCron();
  startNurtureProcessor();
  startCrmFollowupEngine();

  import("./routes/data-migration").then(({ ensureDataMigrationTable }) => {
    ensureDataMigrationTable().catch((err: Error) => {
      logger.error("[DataMigration] Failed to ensure table", { error: err.message });
    });
  }).catch(() => {/* ignore */});

  try {
    clearKpiCache();
  } catch (err: any) {
    logger.warn("Failed to clear KPI cache on startup", { error: err.message });
  }

}

// ─── Production static file serving ──────────────────────────────────────────
// In production, serve the built ERP app from dist/public and fall back to
// index.html for any non-API, non-file route (SPA client-side routing).
if (process.env["NODE_ENV"] === "production") {
  // Resolve relative to THIS file so the path works regardless of cwd.
  // In development (tsx): import.meta.url → file:///…/artifacts/api-server/src/app.ts
  // In production (esbuild CJS): import.meta.url → file:///…/artifacts/api-server/dist/index.cjs
  // Both resolve correctly to the workspace root when we go up the right number of dirs.
  const __fileDir = path.dirname(fileURLToPath(import.meta.url));
  // src/app.ts  → up 2 dirs = artifacts/api-server → up 1 more = artifacts → up 1 = workspace root
  // dist/index.cjs → up 2 dirs = artifacts/api-server → same
  const serverRoot = path.resolve(__fileDir, "..");
  const distPublic = path.resolve(serverRoot, "..", "erp-app", "dist", "public");
  const indexHtmlPath = path.join(distPublic, "index.html");

  // Startup check: log whether index.html actually exists at the resolved path.
  if (existsSync(indexHtmlPath)) {
    logger.info("production_static_serving_enabled", { distPublic, indexHtmlPath });
  } else {
    logger.error("production_index_html_missing", {
      distPublic,
      indexHtmlPath,
      cwd: process.cwd(),
      hint: "Run 'pnpm --filter @workspace/erp-app build' to generate the frontend bundle.",
    });
  }

  // Defence-in-depth: deny requests to raw source files / src directory.
  // The production build never exposes these, but an explicit 403 prevents
  // any accidental leakage if middleware ordering changes in future.
  app.use((req, res, next) => {
    const p = req.path;
    if (
      p.startsWith("/src/") ||
      p.endsWith(".tsx") ||
      (p.endsWith(".ts") && !p.endsWith(".d.ts") && !p.endsWith(".min.ts"))
    ) {
      logger.warn("source_file_access_denied", { path: p, ip: req.ip });
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  });

  app.use(express.static(distPublic, { maxAge: "1y", immutable: true }));
  app.get(/^\/(?!api(?:\/|$))/, (req, res, next) => {
    const ext = path.extname(req.path);
    if (ext && ext !== ".html") {
      return next();
    }
    if (!existsSync(indexHtmlPath)) {
      logger.error("spa_fallback_index_html_missing", { path: req.path, indexHtmlPath });
      return res.status(503).json({
        error: "Frontend bundle not found. The app may not have been built yet.",
      });
    }
    res.sendFile(indexHtmlPath);
  });
}

export default app;
