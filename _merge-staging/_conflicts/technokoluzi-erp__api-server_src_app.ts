import express, { type Express } from "express";
import cors from "cors";
import { requestLogger } from "./middlewares/request-logger";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { initializeWorkflowEngine } from "./lib/workflow-engine";
import { initializeAIEnrichment } from "./lib/ai-enrichment-service";
import { initLiveOpsBridge } from "./lib/live-ops-bridge";
import { attachPermissions } from "./lib/permission-middleware";
import { ensureSuperAdminRole, ensureExecutiveManagerRole, ensureDefaultWorkerRoles } from "./lib/permission-engine";
import { runCrmSeed } from "./routes/crm-seed";
import { seedAllModules } from "./lib/seed-modules";
import { seedDefaultChannels } from "./routes/chat";
import { seedDefaultDocumentFolders } from "./routes/documents";
import { auditMiddleware } from "./lib/audit-middleware";
import { globalErrorHandler } from "./middlewares/error-handler";
import { sanitizeMiddleware } from "./middlewares/sanitize";
import { logger } from "./lib/logger";
import { startSessionCleanup } from "./lib/session-cleanup";
import { startEscalationCron } from "./lib/escalation-engine";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

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
    ];
    await db.transaction(async (tx) => {
      for (const col of rawMatCols) {
        await tx.execute(sql.raw(`ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS ${col}`));
      }
    });
    logger.info("[Migrations] raw_materials columns ensured");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[Migrations] raw_materials columns:", { error: msg });
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
      await db.execute(sql.raw(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS preferred_notification_channel VARCHAR(30) DEFAULT 'whatsapp'`));
      await db.execute(sql.raw(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS notification_opt_out BOOLEAN DEFAULT false`));
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
      allocation_percent INTEGER DEFAULT 100,
      cost_per_hour NUMERIC DEFAULT 0,
      start_date DATE,
      end_date DATE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`],
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
}

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
        connectSrc: ["'self'", "https://oauth2.googleapis.com", "https://accounts.google.com", ...(isProduction ? [] : ["ws:", "wss:"])],
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
  max: isProduction ? 500 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  skip: (req) => req.path === "/healthz",
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again later." },
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
    if (req.url?.includes("/webhook/")) {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    }
  },
}));
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

app.use("/api/auth/login", authLimiter);
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

const UPLOAD_PATH_RE = /^\/api\/(document-files\/upload|platform\/entities\/[^/]+\/records\/import(\/preview)?|products\/[^/]+\/image|chat\/upload|kobi\/upload)$/;
app.use((req, res, next) => {
  if (UPLOAD_PATH_RE.test(req.path)) {
    fileUploadLimiter(req, res, next);
    return;
  }
  next();
});

const REQUEST_TIMEOUT_MS = 15_000;
const LONG_TIMEOUT_PATHS = ["/kimi/chat", "/kimi/swarm", "/kimi/dev/", "/kobi/chat", "/super-agent/chat", "/super-agent/autonomous", "/live-ops/stream"];
const requestTimeout: express.RequestHandler = (req, res, next) => {
  const isLong = LONG_TIMEOUT_PATHS.some(p => req.path.startsWith(p));
  const ms = isLong ? 180_000 : REQUEST_TIMEOUT_MS;
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: "Request timeout — מסד הנתונים לא זמין כרגע" });
    }
  }, ms);
  res.on("close", () => clearTimeout(timer));
  res.on("finish", () => clearTimeout(timer));
  next();
};

app.use("/api", apiLimiter, requestTimeout, attachPermissions, auditMiddleware, router);

app.use(globalErrorHandler);

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

  // === Production Infrastructure - אינדקסים, audit log, sessions ===
  try {
    const { initProductionInfrastructure } = await import("./middleware/database-hardening");
    const result = await initProductionInfrastructure();
    logger.info("[Production] Infrastructure initialized", result);
  } catch (err: any) {
    logger.warn("[Production] Infrastructure init skipped", { error: err.message });
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

  startSessionCleanup();
  startEscalationCron();
}

export default app;
