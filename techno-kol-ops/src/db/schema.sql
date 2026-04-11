-- TECHNO-KOL FULL DATABASE SCHEMA

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────
-- CLIENTS
-- ─────────────────────────────────────
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL, -- contractor / developer / hotel / corporate
  contact_name VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  credit_limit DECIMAL(12,2) DEFAULT 50000,
  balance_due DECIMAL(12,2) DEFAULT 0,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────
-- SUPPLIERS
-- ─────────────────────────────────────
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL, -- iron / aluminum / stainless / glass / consumables
  contact_name VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  payment_terms VARCHAR(100) DEFAULT 'NET30',
  lead_days INTEGER DEFAULT 5,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────
-- EMPLOYEES
-- ─────────────────────────────────────
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100) NOT NULL,
  department VARCHAR(100) NOT NULL, -- production / installation / management / painting
  phone VARCHAR(50),
  id_number VARCHAR(20),
  salary DECIMAL(10,2) NOT NULL,
  employment_type VARCHAR(50) DEFAULT 'full', -- full / part / subcontractor
  start_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────
-- ATTENDANCE
-- ─────────────────────────────────────
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  date DATE NOT NULL,
  check_in TIME,
  check_out TIME,
  location VARCHAR(50) DEFAULT 'factory', -- factory / field / absent / sick / vacation
  hours_worked DECIMAL(4,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, date)
);

CREATE INDEX idx_attendance_employee ON attendance(employee_id);
CREATE INDEX idx_attendance_date ON attendance(date);

-- ─────────────────────────────────────
-- WORK ORDERS
-- ─────────────────────────────────────
CREATE TABLE work_orders (
  id VARCHAR(20) PRIMARY KEY, -- TK-XXXX
  client_id UUID NOT NULL REFERENCES clients(id),
  product VARCHAR(255) NOT NULL,
  description TEXT,
  material_primary VARCHAR(100) NOT NULL, -- iron / aluminum / stainless / glass / mixed
  category VARCHAR(100) NOT NULL, -- railings / gates / fences / pergolas / stairs / glass
  quantity DECIMAL(10,2),
  unit VARCHAR(20) DEFAULT 'מ׳',
  price DECIMAL(12,2) NOT NULL,
  cost_estimate DECIMAL(12,2),
  cost_actual DECIMAL(12,2) DEFAULT 0,
  advance_paid DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending', -- pending / production / finishing / ready / delivered / cancelled
  progress INTEGER DEFAULT 0,
  priority VARCHAR(20) DEFAULT 'normal', -- low / normal / high / urgent
  open_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date DATE NOT NULL,
  delivered_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_status ON work_orders(status);
CREATE INDEX idx_orders_client ON work_orders(client_id);
CREATE INDEX idx_orders_delivery ON work_orders(delivery_date);

-- ─────────────────────────────────────
-- WORK ORDER EMPLOYEES (assignments)
-- ─────────────────────────────────────
CREATE TABLE work_order_employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id VARCHAR(20) NOT NULL REFERENCES work_orders(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  hours_logged DECIMAL(6,2) DEFAULT 0,
  role_on_order VARCHAR(100),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id, employee_id)
);

CREATE INDEX idx_woe_order ON work_order_employees(order_id);
CREATE INDEX idx_woe_employee ON work_order_employees(employee_id);

-- ─────────────────────────────────────
-- MATERIAL ITEMS (inventory)
-- ─────────────────────────────────────
CREATE TABLE material_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(100),
  category VARCHAR(100) NOT NULL, -- iron / aluminum / stainless / glass / consumables
  subcategory VARCHAR(100),
  qty DECIMAL(12,2) NOT NULL DEFAULT 0,
  unit VARCHAR(20) NOT NULL,
  min_threshold DECIMAL(12,2) NOT NULL DEFAULT 0,
  max_stock DECIMAL(12,2),
  cost_per_unit DECIMAL(10,4) NOT NULL DEFAULT 0,
  supplier_id UUID REFERENCES suppliers(id),
  location VARCHAR(100), -- warehouse zone
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_materials_category ON material_items(category);
CREATE INDEX idx_materials_supplier ON material_items(supplier_id);

-- ─────────────────────────────────────
-- MATERIAL MOVEMENTS (in/out)
-- ─────────────────────────────────────
CREATE TABLE material_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES material_items(id),
  order_id VARCHAR(20) REFERENCES work_orders(id),
  type VARCHAR(20) NOT NULL, -- receive / consume / adjust / return
  qty DECIMAL(12,2) NOT NULL,
  cost_per_unit DECIMAL(10,4),
  supplier_id UUID REFERENCES suppliers(id),
  employee_id UUID REFERENCES employees(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_movements_item ON material_movements(item_id);
CREATE INDEX idx_movements_order ON material_movements(order_id);
CREATE INDEX idx_movements_created ON material_movements(created_at);

-- ─────────────────────────────────────
-- ALERTS
-- ─────────────────────────────────────
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(100) NOT NULL, -- material_low / order_delayed / payment_due / attendance / quality
  severity VARCHAR(20) NOT NULL DEFAULT 'warning', -- info / warning / danger / critical
  title VARCHAR(255) NOT NULL,
  message TEXT,
  entity_type VARCHAR(50), -- order / material / employee / client
  entity_id VARCHAR(100),
  is_resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES employees(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_resolved ON alerts(is_resolved);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_created ON alerts(created_at);

-- ─────────────────────────────────────
-- FINANCIAL TRANSACTIONS
-- ─────────────────────────────────────
CREATE TABLE financial_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id VARCHAR(20) REFERENCES work_orders(id),
  client_id UUID REFERENCES clients(id),
  type VARCHAR(50) NOT NULL, -- income / advance / expense / salary / material_cost
  category VARCHAR(100),
  amount DECIMAL(12,2) NOT NULL,
  description TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  reference VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_financial_order ON financial_transactions(order_id);
CREATE INDEX idx_financial_date ON financial_transactions(date);
CREATE INDEX idx_financial_type ON financial_transactions(type);

-- ─────────────────────────────────────
-- USERS (system login)
-- ─────────────────────────────────────
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'viewer', -- admin / manager / viewer
  employee_id UUID REFERENCES employees(id),
  last_login TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────
-- ORDER TIMELINE EVENTS
-- ─────────────────────────────────────
CREATE TABLE order_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id VARCHAR(20) NOT NULL REFERENCES work_orders(id),
  event_type VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_order ON order_events(order_id);

-- ─────────────────────────────────────
-- TRIGGER: updated_at auto-update
-- ─────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON work_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_materials_updated BEFORE UPDATE ON material_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ════════════════════════════════════════════════════════════════
-- EXTENSIONS — GPS, Tasks, Messages, Leads
-- ════════════════════════════════════════════════════════════════

-- GPS TRACKING
CREATE TABLE gps_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  lat DECIMAL(10, 8) NOT NULL,
  lng DECIMAL(11, 8) NOT NULL,
  accuracy DECIMAL(8, 2),
  speed DECIMAL(8, 2),
  heading DECIMAL(5, 2),
  battery_level INTEGER,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gps_employee ON gps_locations(employee_id);
CREATE INDEX idx_gps_timestamp ON gps_locations(timestamp);

-- CURRENT POSITION (materialized view - fastest query)
CREATE TABLE employee_current_location (
  employee_id UUID PRIMARY KEY REFERENCES employees(id),
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  accuracy DECIMAL(8, 2),
  speed DECIMAL(8, 2),
  battery_level INTEGER,
  last_seen TIMESTAMPTZ,
  status VARCHAR(50) DEFAULT 'unknown',
  address TEXT
);

-- TASKS (for field workers)
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id VARCHAR(20) REFERENCES work_orders(id),
  employee_id UUID REFERENCES employees(id),
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  address TEXT NOT NULL,
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  scheduled_date DATE,
  scheduled_time TIME,
  status VARCHAR(50) DEFAULT 'pending',
  arrived_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  photos JSONB DEFAULT '[]',
  signature TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_employee ON tasks(employee_id);
CREATE INDEX idx_tasks_order ON tasks(order_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_date ON tasks(scheduled_date);

-- MESSAGES (internal chat)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_user_id UUID REFERENCES users(id),
  to_employee_id UUID REFERENCES employees(id),
  content TEXT NOT NULL,
  type VARCHAR(20) DEFAULT 'text',
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_to ON messages(to_employee_id);
CREATE INDEX idx_messages_read ON messages(is_read);

-- SALES LEADS
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  address TEXT,
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  product_interest VARCHAR(255),
  estimated_value DECIMAL(12, 2),
  source VARCHAR(100),
  assigned_to UUID REFERENCES employees(id),
  status VARCHAR(50) DEFAULT 'new',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
-- SUPPLY CHAIN PIPELINE — 20-stage project lifecycle
-- ════════════════════════════════════════════════════════════════

CREATE TYPE pipeline_stage AS ENUM (
  'deal_closed',
  'measurement_scheduled',
  'measurement_done',
  'contract_sent',
  'contract_signed',
  'materials_ordered',
  'materials_arrived',
  'production_assigned',
  'production_started',
  'production_progress',
  'production_done',
  'sent_to_paint',
  'returned_from_paint',
  'installation_scheduled',
  'installation_started',
  'installation_done',
  'survey_sent',
  'payment_requested',
  'payment_received',
  'project_closed'
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_number VARCHAR(20) UNIQUE NOT NULL,
  order_id VARCHAR(20) REFERENCES work_orders(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  address TEXT NOT NULL,
  lat DECIMAL(10,8),
  lng DECIMAL(11,8),
  total_price DECIMAL(12,2) NOT NULL,
  advance_paid DECIMAL(12,2) DEFAULT 0,
  balance_due DECIMAL(12,2) GENERATED ALWAYS AS (total_price - advance_paid) STORED,
  current_stage pipeline_stage DEFAULT 'deal_closed',
  stage_updated_at TIMESTAMPTZ DEFAULT NOW(),
  surveyor_id UUID REFERENCES employees(id),
  production_manager_id UUID REFERENCES employees(id),
  contractor_id UUID REFERENCES employees(id),
  installer_id UUID REFERENCES employees(id),
  driver_id UUID REFERENCES employees(id),
  project_manager_id UUID REFERENCES employees(id),
  measurement_date TIMESTAMPTZ,
  contract_sent_at TIMESTAMPTZ,
  contract_signed_at TIMESTAMPTZ,
  materials_ordered_at TIMESTAMPTZ,
  materials_arrived_at TIMESTAMPTZ,
  production_start_at TIMESTAMPTZ,
  production_end_at TIMESTAMPTZ,
  paint_sent_at TIMESTAMPTZ,
  paint_returned_at TIMESTAMPTZ,
  installation_date DATE,
  installation_time TIME,
  installation_started_at TIMESTAMPTZ,
  installation_done_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  contract_url TEXT,
  contract_signed_url TEXT,
  survey_score INTEGER,
  survey_feedback TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_stage ON projects(current_stage);
CREATE INDEX idx_projects_client ON projects(client_id);
CREATE INDEX idx_projects_order ON projects(order_id);
CREATE INDEX idx_projects_contractor ON projects(contractor_id);
CREATE INDEX idx_projects_installer ON projects(installer_id);

CREATE TABLE pipeline_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id),
  stage pipeline_stage NOT NULL,
  action VARCHAR(100) NOT NULL,
  performed_by UUID REFERENCES employees(id),
  performed_by_role VARCHAR(50),
  notes TEXT,
  photos JSONB DEFAULT '[]',
  signature TEXT,
  location_lat DECIMAL(10,8),
  location_lng DECIMAL(11,8),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pipeline_events_project ON pipeline_events(project_id);
CREATE INDEX idx_pipeline_events_stage ON pipeline_events(stage);

CREATE TABLE approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id),
  stage pipeline_stage NOT NULL,
  required_from VARCHAR(50) NOT NULL,
  required_from_employee UUID REFERENCES employees(id),
  required_from_client UUID REFERENCES clients(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_approvals_project ON approvals(project_id);
CREATE INDEX idx_approvals_status ON approvals(status);
CREATE INDEX idx_approvals_employee ON approvals(required_from_employee);

CREATE TABLE pipeline_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  recipient_type VARCHAR(20) NOT NULL,
  recipient_employee_id UUID REFERENCES employees(id),
  recipient_client_id UUID REFERENCES clients(id),
  channel VARCHAR(20) NOT NULL,
  template VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE client_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  token VARCHAR(128) UNIQUE NOT NULL,
  purpose VARCHAR(50) NOT NULL,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_client_tokens_token ON client_tokens(token);
CREATE INDEX idx_client_tokens_project ON client_tokens(project_id);

CREATE TABLE survey_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  q1_overall INTEGER CHECK (q1_overall BETWEEN 1 AND 5),
  q2_quality INTEGER CHECK (q2_quality BETWEEN 1 AND 5),
  q3_timeliness INTEGER CHECK (q3_timeliness BETWEEN 1 AND 5),
  q4_communication INTEGER CHECK (q4_communication BETWEEN 1 AND 5),
  q5_would_recommend BOOLEAN,
  free_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payment_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id),
  amount DECIMAL(12,2) NOT NULL,
  description TEXT,
  link_token VARCHAR(128) UNIQUE NOT NULL,
  payment_method VARCHAR(20) DEFAULT 'both',
  bank_details JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  paid_amount DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
