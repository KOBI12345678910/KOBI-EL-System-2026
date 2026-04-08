-- Task 243: PM Module — Risk, Documents, Change Orders & Templates

-- Extend project_risks with new columns
ALTER TABLE project_risks
  ADD COLUMN IF NOT EXISTS response_strategy TEXT DEFAULT 'mitigate',
  ADD COLUMN IF NOT EXISTS contingency_plan TEXT,
  ADD COLUMN IF NOT EXISTS trigger_conditions TEXT,
  ADD COLUMN IF NOT EXISTS residual_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS monitoring_frequency TEXT DEFAULT 'weekly';

-- Risk assessment history table
CREATE TABLE IF NOT EXISTS project_risk_assessments (
  id SERIAL PRIMARY KEY,
  risk_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  assessed_by TEXT,
  probability TEXT NOT NULL DEFAULT 'medium',
  impact TEXT NOT NULL DEFAULT 'medium',
  risk_score NUMERIC(5,2),
  notes TEXT,
  assessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Change orders table
CREATE TABLE IF NOT EXISTS project_change_orders (
  id SERIAL PRIMARY KEY,
  change_number TEXT,
  project_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  reason TEXT,
  scope_impact TEXT,
  schedule_impact INTEGER DEFAULT 0,
  cost_impact NUMERIC(12,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  requested_by TEXT,
  approved_by TEXT,
  approval_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Project documents table
CREATE TABLE IF NOT EXISTS project_documents (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  phase TEXT DEFAULT 'planning',
  document_type TEXT DEFAULT 'general',
  name TEXT NOT NULL,
  file_path TEXT,
  version TEXT DEFAULT '1.0',
  tags TEXT,
  description TEXT,
  uploaded_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Project templates table
CREATE TABLE IF NOT EXISTS project_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  project_type TEXT DEFAULT 'general',
  template_data JSONB,
  created_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed some default templates
INSERT INTO project_templates (name, description, project_type, template_data, created_by) VALUES
('תבנית פרויקט התקנה', 'תבנית סטנדרטית לפרויקטי התקנה', 'installation', '{"tasks":[{"title":"סקר אתר","duration":3,"phase":"planning"},{"title":"הכנת ציוד","duration":5,"phase":"procurement"},{"title":"התקנה","duration":10,"phase":"execution"},{"title":"בדיקות","duration":3,"phase":"execution"},{"title":"מסירה","duration":1,"phase":"closeout"}],"riskCategories":["טכני","לוגיסטי","תקציבי"],"budgetCategories":["עבודה","ציוד","נסיעות"]}', 'system'),
('תבנית פרויקט ייצור', 'תבנית לפרויקטי ייצור ובנייה', 'manufacturing', '{"tasks":[{"title":"עיצוב ותכנון","duration":7,"phase":"planning"},{"title":"רכש חומרים","duration":14,"phase":"procurement"},{"title":"ייצור","duration":20,"phase":"execution"},{"title":"בקרת איכות","duration":5,"phase":"execution"},{"title":"אספקה ומסירה","duration":3,"phase":"closeout"}],"riskCategories":["איכות","לוח זמנים","תקציב","ספקים"],"budgetCategories":["חומרי גלם","כוח אדם","ציוד","תחבורה"]}', 'system'),
('תבנית פרויקט שירות', 'תבנית לפרויקטי שירות ותחזוקה', 'service', '{"tasks":[{"title":"הגדרת דרישות","duration":2,"phase":"planning"},{"title":"הקצאת משאבים","duration":1,"phase":"planning"},{"title":"ביצוע שירות","duration":5,"phase":"execution"},{"title":"תיעוד","duration":1,"phase":"closeout"},{"title":"מעקב לקוח","duration":2,"phase":"closeout"}],"riskCategories":["זמינות","טכני","לקוח"],"budgetCategories":["כוח אדם","חלקי חילוף","נסיעות"]}', 'system')
ON CONFLICT DO NOTHING;
