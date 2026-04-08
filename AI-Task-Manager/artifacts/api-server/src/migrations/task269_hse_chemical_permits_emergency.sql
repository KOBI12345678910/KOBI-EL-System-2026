-- Task 269: HSE Module — Chemical Safety, Work Permits & Emergency Preparedness

-- ═══════════════════════════════════════════════════════════
-- CHEMICAL SAFETY / MSDS
-- ═══════════════════════════════════════════════════════════

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
);

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
);

-- ═══════════════════════════════════════════════════════════
-- PERMIT TO WORK
-- ═══════════════════════════════════════════════════════════

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
);

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
);

-- ═══════════════════════════════════════════════════════════
-- EMERGENCY PREPAREDNESS
-- ═══════════════════════════════════════════════════════════

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
);

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
);

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
);

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
);

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
);

-- ═══════════════════════════════════════════════════════════
-- PERMIT TYPES
-- ═══════════════════════════════════════════════════════════

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
);

-- Multi-level approval columns on work permits
ALTER TABLE hse_work_permits
  ADD COLUMN IF NOT EXISTS approval_level INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS required_approval_levels INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'not_started';

-- ═══════════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════════

INSERT INTO hse_work_permit_types (type_code, type_name, description, required_approvers) VALUES
('hot_work', 'עבודה חמה', 'ריתוך, חיתוך, גרינדינג וכל עבודה המייצרת חום או ניצוצות', 2),
('confined_space', 'כניסה למרחב מוגבל', 'כניסה לבורות, מיכלים, צנרת או חלל סגור', 2),
('electrical_isolation', 'בידוד חשמלי', 'עבודה על לוחות חשמל — LOTO נדרש', 2),
('excavation', 'חפירה', 'עבודות חפירה ועבודת עפר', 2),
('working_at_heights', 'עבודה בגובה', 'עבודה בגובה מעל 1.8 מטר', 2)
ON CONFLICT (type_code) DO NOTHING;

INSERT INTO hse_emergency_contacts (contact_type, name, role, organization, phone_primary, phone_secondary, available_hours, priority) VALUES
('emergency', 'חדר מיון ותן אדום', 'חירום', 'מד"א', '101', NULL, '24/7', 1),
('emergency', 'מכבי אש', 'כיבוי', 'כיבוי אש', '102', NULL, '24/7', 2),
('emergency', 'משטרה', 'ביטחון', 'משטרת ישראל', '100', NULL, '24/7', 3),
('internal', 'ממונה בטיחות', 'Safety Officer', 'חברה', '050-1234567', NULL, 'שעות עבודה', 4),
('external', 'מרכז ארסים', 'Poison Control', 'בי"ח בילינסון', '04-7771600', NULL, '24/7', 5)
ON CONFLICT DO NOTHING;

INSERT INTO hse_emergency_equipment (equipment_type, equipment_id_tag, description, building, floor, location_description, next_inspection_date, status) VALUES
('fire_extinguisher', 'EXT-001', 'מטף אבקה 6 ק"ג', 'בניין ראשי', 'קומת קרקע', 'קרוב לכניסה הראשית', CURRENT_DATE + INTERVAL '6 months', 'operational'),
('first_aid_kit', 'FA-001', 'ערכת עזרה ראשונה', 'בניין ראשי', 'קומת קרקע', 'חדר ניהול', CURRENT_DATE + INTERVAL '3 months', 'operational'),
('eye_wash', 'EW-001', 'תחנת שטיפת עיניים', 'מחסן כימיקלים', 'קומת קרקע', 'ליד מדפי הכימיקלים', CURRENT_DATE + INTERVAL '1 month', 'operational'),
('spill_kit', 'SK-001', 'ערכת דליפות', 'מחסן כימיקלים', 'קומת קרקע', 'פינה מערבית', CURRENT_DATE + INTERVAL '12 months', 'operational')
ON CONFLICT DO NOTHING;
