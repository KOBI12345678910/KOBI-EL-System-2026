-- ════════════════════════════════════════════════════════════════════════════════
-- TECHNO-KOL PLATFORM v2.0 — FULL MIGRATION
-- כל הטבלאות החדשות: Brain, AI Engines, Documents, Signatures,
-- Ontology, AIP, Apollo, Event Bus
-- ════════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────
-- BRAIN ENGINE TABLES
-- ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brain_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_brain_snapshots_created ON brain_snapshots(created_at);

CREATE TABLE IF NOT EXISTS brain_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_brain_reports_created ON brain_reports(created_at);

CREATE TABLE IF NOT EXISTS brain_decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  context TEXT,
  decision TEXT,
  reasoning TEXT,
  impact TEXT,
  outcome TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brain_learning_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cycle_date DATE,
  actions_taken INTEGER DEFAULT 0,
  successful INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  problems_detected INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- 14 AI ENGINES SUPPORTING TABLES
-- ──────────────────────────────────────────

-- Pricing Engine
CREATE TABLE IF NOT EXISTS market_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category VARCHAR(100),
  material VARCHAR(100),
  market_price DECIMAL(12,4),
  source VARCHAR(100),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_market_prices_cat_mat ON market_prices(category, material);

-- Competitor Engine
CREATE TABLE IF NOT EXISTS competitor_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  competitor_name VARCHAR(255),
  category VARCHAR(100),
  material VARCHAR(100),
  price_per_unit DECIMAL(12,4),
  total_price DECIMAL(12,2),
  source VARCHAR(100),
  client_id UUID REFERENCES clients(id),
  notes TEXT,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sales Agent Engine
CREATE TABLE IF NOT EXISTS sales_targets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES employees(id),
  month VARCHAR(20) NOT NULL,
  targets JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, month)
);

CREATE TABLE IF NOT EXISTS sales_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES employees(id),
  lead_id UUID REFERENCES leads(id),
  type VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recording Engine
CREATE TABLE IF NOT EXISTS call_recordings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES employees(id),
  lead_id UUID REFERENCES leads(id),
  transcript TEXT,
  duration_seconds INTEGER,
  call_date DATE,
  sentiment_score INTEGER,
  talk_ratio_agent DECIMAL(4,2),
  objections_detected JSONB,
  price_mentioned BOOLEAN,
  next_step_defined BOOLEAN,
  analysis JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fraud Engine
CREATE TABLE IF NOT EXISTS fraud_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(100),
  risk VARCHAR(20),
  title VARCHAR(255),
  description TEXT,
  entity_id VARCHAR(100),
  entity_type VARCHAR(50),
  metadata JSONB,
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_unresolved ON fraud_alerts(is_resolved, created_at);

-- Payroll Engine
CREATE TABLE IF NOT EXISTS payroll_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  month VARCHAR(10),
  year INTEGER,
  employees_count INTEGER,
  total_gross DECIMAL(14,2),
  total_net DECIMAL(14,2),
  total_employer_cost DECIMAL(14,2),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(month, year)
);

-- Goals Engine
CREATE TABLE IF NOT EXISTS company_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quarter VARCHAR(5),
  year INTEGER,
  okrs JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(quarter, year)
);

-- ──────────────────────────────────────────
-- DOCUMENTS & SIGNATURES SYSTEM
-- ──────────────────────────────────────────

-- Documents (legacy generated_documents — keep)
CREATE TABLE IF NOT EXISTS generated_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  order_id VARCHAR(20) REFERENCES work_orders(id),
  type VARCHAR(50) NOT NULL,
  invoice_number VARCHAR(50),
  amount DECIMAL(12,2),
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gendocs_project ON generated_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_gendocs_order ON generated_documents(order_id);
CREATE INDEX IF NOT EXISTS idx_gendocs_type ON generated_documents(type);

-- Signature Service Tables
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  project_id UUID REFERENCES projects(id),
  order_id VARCHAR(20) REFERENCES work_orders(id),
  employee_id UUID REFERENCES employees(id),
  client_id UUID REFERENCES clients(id),
  created_by UUID REFERENCES users(id),
  status VARCHAR(30) DEFAULT 'draft',
  version INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id),
  recipient_type VARCHAR(20) NOT NULL,
  recipient_name VARCHAR(255) NOT NULL,
  recipient_phone VARCHAR(50),
  recipient_email VARCHAR(255),
  employee_id UUID REFERENCES employees(id),
  client_id UUID REFERENCES clients(id),
  signing_order INTEGER DEFAULT 1,
  is_required BOOLEAN DEFAULT true,
  status VARCHAR(30) DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id),
  recipient_id UUID NOT NULL REFERENCES document_recipients(id),
  signature_data TEXT NOT NULL,
  signature_type VARCHAR(20) DEFAULT 'drawn',
  signed_name VARCHAR(255),
  signed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address VARCHAR(50),
  user_agent TEXT,
  location_lat DECIMAL(10,8),
  location_lng DECIMAL(11,8),
  device_info JSONB DEFAULT '{}',
  is_valid BOOLEAN DEFAULT true,
  validation_hash VARCHAR(128)
);

CREATE TABLE IF NOT EXISTS document_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id),
  recipient_id UUID NOT NULL REFERENCES document_recipients(id),
  token VARCHAR(128) UNIQUE NOT NULL,
  purpose VARCHAR(30) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id),
  action VARCHAR(50) NOT NULL,
  actor_type VARCHAR(20),
  actor_id VARCHAR(100),
  actor_name VARCHAR(255),
  ip_address VARCHAR(50),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  description TEXT,
  html_template TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- אינדקסים
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_client ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_employee ON documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_recipients_document ON document_recipients(document_id);
CREATE INDEX IF NOT EXISTS idx_recipients_status ON document_recipients(status);
CREATE INDEX IF NOT EXISTS idx_signatures_document ON signatures(document_id);
CREATE INDEX IF NOT EXISTS idx_tokens_token ON document_tokens(token);
CREATE INDEX IF NOT EXISTS idx_audit_document ON document_audit_log(document_id);

-- ──────────────────────────────────────────
-- AIP & APOLLO & ONTOLOGY
-- ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS aip_queries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aip_queries_user ON aip_queries(user_id);

CREATE TABLE IF NOT EXISTS apollo_deployments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version VARCHAR(20),
  targets JSONB,
  data_type VARCHAR(100),
  deployed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ontology_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_type VARCHAR(50),
  object_id VARCHAR(100),
  data JSONB,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '5 minutes',
  UNIQUE(object_type, object_id)
);

-- ──────────────────────────────────────────
-- EVENT BUS
-- ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(100) NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_type ON system_events(type);
CREATE INDEX IF NOT EXISTS idx_events_created ON system_events(created_at);

-- ──────────────────────────────────────────
-- CLEANUP FUNCTION
-- ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_old_events()
RETURNS void AS $$
BEGIN
  DELETE FROM system_events WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM gps_locations WHERE timestamp < NOW() - INTERVAL '24 hours';
  DELETE FROM brain_snapshots WHERE created_at < NOW() - INTERVAL '7 days';
  DELETE FROM document_tokens WHERE expires_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- ──────────────────────────────────────────
-- updated_at trigger function (for documents)
-- ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_documents_updated') THEN
    CREATE TRIGGER trg_documents_updated
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
