-- ═══════════════════════════════════════════════════════════════════════
-- ONYX PROCUREMENT SYSTEM — Supabase Database Schema
-- Run this in Supabase SQL Editor (supabase.com → project → SQL Editor)
-- ═══════════════════════════════════════════════════════════════════════

-- ═══ 1. SUPPLIERS — ספקים ═══

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  whatsapp TEXT,
  address TEXT,
  country TEXT DEFAULT 'ישראל',
  preferred_channel TEXT DEFAULT 'whatsapp' CHECK (preferred_channel IN ('whatsapp', 'email', 'sms')),
  default_payment_terms TEXT DEFAULT 'שוטף + 30',
  avg_delivery_days INTEGER DEFAULT 7,
  distance_km NUMERIC,
  rating NUMERIC DEFAULT 5 CHECK (rating >= 1 AND rating <= 10),
  delivery_reliability NUMERIC DEFAULT 5 CHECK (delivery_reliability >= 1 AND delivery_reliability <= 10),
  quality_score NUMERIC DEFAULT 5 CHECK (quality_score >= 1 AND quality_score <= 10),
  overall_score NUMERIC DEFAULT 70,
  -- stats
  total_orders INTEGER DEFAULT 0,
  total_spent NUMERIC DEFAULT 0,
  avg_response_time_hours NUMERIC DEFAULT 0,
  on_time_delivery_rate NUMERIC DEFAULT 100,
  total_negotiated_savings NUMERIC DEFAULT 0,
  last_order_date TIMESTAMPTZ,
  -- risk
  risk_score NUMERIC DEFAULT 30,
  --
  active BOOLEAN DEFAULT true,
  notes TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 2. SUPPLIER PRODUCTS — מוצרי ספקים ═══

CREATE TABLE IF NOT EXISTS supplier_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT,
  current_price NUMERIC,
  currency TEXT DEFAULT 'ILS',
  unit TEXT NOT NULL,
  min_order_qty NUMERIC,
  lead_time_days INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_supplier_products_category ON supplier_products(category);
CREATE INDEX idx_supplier_products_supplier ON supplier_products(supplier_id);

-- ═══ 3. PRICE HISTORY — היסטוריית מחירים ═══

CREATE TABLE IF NOT EXISTS price_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES supplier_products(id),
  product_key TEXT NOT NULL,
  price NUMERIC NOT NULL,
  currency TEXT DEFAULT 'ILS',
  quantity NUMERIC,
  source TEXT DEFAULT 'quote' CHECK (source IN ('quote', 'invoice', 'market', 'negotiated')),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_price_history_supplier ON price_history(supplier_id);
CREATE INDEX idx_price_history_product ON price_history(product_key);

-- ═══ 4. PURCHASE REQUESTS — בקשות רכש ═══

CREATE TABLE IF NOT EXISTS purchase_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requested_by TEXT NOT NULL,
  urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('critical', 'high', 'normal', 'low')),
  required_by_date DATE,
  project_id TEXT,
  project_name TEXT,
  notes TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'rfq_sent', 'quotes_received', 'decided', 'ordered', 'delivered', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 5. PURCHASE REQUEST ITEMS — פריטי בקשת רכש ═══

CREATE TABLE IF NOT EXISTS purchase_request_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  specs TEXT,
  max_budget NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pr_items_request ON purchase_request_items(request_id);

-- ═══ 6. RFQs — בקשות להצעת מחיר ═══

CREATE TABLE IF NOT EXISTS rfqs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_request_id UUID REFERENCES purchase_requests(id),
  message_text TEXT,
  response_deadline TIMESTAMPTZ NOT NULL,
  response_window_hours INTEGER DEFAULT 24,
  reminder_after_hours INTEGER DEFAULT 12,
  min_quotes_before_decision INTEGER DEFAULT 2,
  auto_close_on_deadline BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'collecting', 'closed', 'decided', 'cancelled')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 7. RFQ RECIPIENTS — נמעני RFQ ═══

CREATE TABLE IF NOT EXISTS rfq_recipients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  supplier_name TEXT NOT NULL,
  sent_via TEXT DEFAULT 'whatsapp',
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered BOOLEAN DEFAULT false,
  reminder_sent BOOLEAN DEFAULT false,
  reminder_sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'viewed', 'quoted', 'declined', 'no_response')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rfq_recipients_rfq ON rfq_recipients(rfq_id);
CREATE INDEX idx_rfq_recipients_supplier ON rfq_recipients(supplier_id);

-- ═══ 8. SUPPLIER QUOTES — הצעות מחיר מספקים ═══

CREATE TABLE IF NOT EXISTS supplier_quotes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rfq_id UUID NOT NULL REFERENCES rfqs(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  supplier_name TEXT NOT NULL,
  total_price NUMERIC NOT NULL,
  vat_included BOOLEAN DEFAULT false,
  vat_amount NUMERIC DEFAULT 0,
  total_with_vat NUMERIC NOT NULL,
  delivery_fee NUMERIC DEFAULT 0,
  free_delivery BOOLEAN DEFAULT false,
  delivery_days INTEGER NOT NULL,
  payment_terms TEXT DEFAULT 'שוטף + 30',
  valid_for_days INTEGER DEFAULT 14,
  notes TEXT,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'whatsapp_reply', 'email_reply', 'api')),
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quotes_rfq ON supplier_quotes(rfq_id);
CREATE INDEX idx_quotes_supplier ON supplier_quotes(supplier_id);

-- ═══ 9. QUOTE LINE ITEMS — שורות הצעת מחיר ═══

CREATE TABLE IF NOT EXISTS quote_line_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID NOT NULL REFERENCES supplier_quotes(id) ON DELETE CASCADE,
  item_id UUID REFERENCES purchase_request_items(id),
  name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  unit_price NUMERIC NOT NULL,
  discount_percent NUMERIC DEFAULT 0,
  total_price NUMERIC NOT NULL,
  lead_time_days INTEGER,
  notes TEXT
);

CREATE INDEX idx_quote_lines_quote ON quote_line_items(quote_id);

-- ═══ 10. PURCHASE ORDERS — הזמנות רכש ═══

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rfq_id UUID REFERENCES rfqs(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  supplier_name TEXT NOT NULL,
  subtotal NUMERIC NOT NULL,
  delivery_fee NUMERIC DEFAULT 0,
  vat_amount NUMERIC DEFAULT 0,
  total NUMERIC NOT NULL,
  currency TEXT DEFAULT 'ILS',
  payment_terms TEXT DEFAULT 'שוטף + 30',
  expected_delivery DATE,
  delivery_address TEXT DEFAULT 'ריבל 37, תל אביב',
  requested_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  project_id TEXT,
  project_name TEXT,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'rfq', 'auction', 'auto_reorder', 'predictive', 'bundle')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'confirmed', 'shipped', 'delivered', 'inspected', 'closed', 'cancelled', 'disputed')),
  -- negotiation
  original_price NUMERIC,
  negotiated_savings NUMERIC DEFAULT 0,
  negotiation_strategy TEXT,
  -- quality
  quality_score NUMERIC,
  quality_result TEXT CHECK (quality_result IN ('passed', 'failed', 'partial', NULL)),
  -- tracking
  tracking_number TEXT,
  carrier TEXT,
  actual_delivery DATE,
  --
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_po_status ON purchase_orders(status);
CREATE INDEX idx_po_project ON purchase_orders(project_id);

-- ═══ 11. PO LINE ITEMS — שורות הזמנת רכש ═══

CREATE TABLE IF NOT EXISTS po_line_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  unit_price NUMERIC NOT NULL,
  discount_percent NUMERIC DEFAULT 0,
  total_price NUMERIC NOT NULL,
  lead_time_days INTEGER,
  market_price NUMERIC,
  savings_vs_market NUMERIC,
  notes TEXT
);

CREATE INDEX idx_po_lines_po ON po_line_items(po_id);

-- ═══ 12. PROCUREMENT DECISIONS — החלטות רכש ═══

CREATE TABLE IF NOT EXISTS procurement_decisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rfq_id UUID REFERENCES rfqs(id),
  purchase_request_id UUID REFERENCES purchase_requests(id),
  purchase_order_id UUID REFERENCES purchase_orders(id),
  selected_supplier_id UUID REFERENCES suppliers(id),
  selected_supplier_name TEXT,
  selected_total_cost NUMERIC,
  highest_cost NUMERIC,
  savings_amount NUMERIC,
  savings_percent NUMERIC,
  reasoning JSONB,
  quotes_compared INTEGER,
  decision_method TEXT DEFAULT 'weighted_score',
  decided_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 13. SUBCONTRACTORS — קבלני משנה ═══

CREATE TABLE IF NOT EXISTS subcontractors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  specialties TEXT[] DEFAULT '{}',
  quality_rating NUMERIC DEFAULT 5,
  reliability_rating NUMERIC DEFAULT 5,
  available BOOLEAN DEFAULT true,
  notes TEXT DEFAULT '',
  total_projects INTEGER DEFAULT 0,
  completed_on_time INTEGER DEFAULT 0,
  total_revenue NUMERIC DEFAULT 0,
  complaints INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 14. SUBCONTRACTOR PRICING — מחירון קבלנים ═══

CREATE TABLE IF NOT EXISTS subcontractor_pricing (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subcontractor_id UUID NOT NULL REFERENCES subcontractors(id) ON DELETE CASCADE,
  work_type TEXT NOT NULL,
  percentage_rate NUMERIC NOT NULL,
  price_per_sqm NUMERIC NOT NULL,
  minimum_price NUMERIC,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(subcontractor_id, work_type)
);

CREATE INDEX idx_sub_pricing_sub ON subcontractor_pricing(subcontractor_id);
CREATE INDEX idx_sub_pricing_type ON subcontractor_pricing(work_type);

-- ═══ 15. SUBCONTRACTOR DECISIONS — החלטות קבלנים ═══

CREATE TABLE IF NOT EXISTS subcontractor_decisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT,
  project_name TEXT,
  client_name TEXT,
  work_type TEXT NOT NULL,
  project_value NUMERIC NOT NULL,
  area_sqm NUMERIC NOT NULL,
  selected_subcontractor_id UUID REFERENCES subcontractors(id),
  selected_subcontractor_name TEXT,
  selected_pricing_method TEXT CHECK (selected_pricing_method IN ('percentage', 'per_sqm')),
  selected_cost NUMERIC,
  alternative_cost NUMERIC,
  savings_amount NUMERIC,
  savings_percent NUMERIC,
  reasoning JSONB,
  work_order_sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  sent_via TEXT,
  decided_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 16. AUDIT LOG — לוג פעולות ═══

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail TEXT,
  previous_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- ═══ 17. SYSTEM EVENTS — אירועי מערכת ═══

CREATE TABLE IF NOT EXISTS system_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  acknowledged BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_type ON system_events(type);
CREATE INDEX idx_events_severity ON system_events(severity);

-- ═══ 18. NOTIFICATIONS — התראות ═══

CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient TEXT NOT NULL,
  channel TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT DEFAULT 'info',
  related_entity_type TEXT,
  related_entity_id UUID,
  sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  delivered BOOLEAN DEFAULT false,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient ON notifications(recipient);
CREATE INDEX idx_notifications_sent ON notifications(sent);

-- ═══ FUNCTIONS ═══

-- פונקציה לעדכון updated_at אוטומטי
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- triggers
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_supplier_products_updated BEFORE UPDATE ON supplier_products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_purchase_requests_updated BEFORE UPDATE ON purchase_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_purchase_orders_updated BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_subcontractors_updated BEFORE UPDATE ON subcontractors FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- פונקציה לחישוב ציון ספק
CREATE OR REPLACE FUNCTION calculate_supplier_score(p_supplier_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_score NUMERIC;
  v_supplier suppliers%ROWTYPE;
BEGIN
  SELECT * INTO v_supplier FROM suppliers WHERE id = p_supplier_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  
  v_score := (
    (10 - LEAST(v_supplier.risk_score / 10, 10)) * 3 +   -- 30% risk (inverted)
    v_supplier.on_time_delivery_rate / 100 * 10 * 2.5 +    -- 25% delivery
    v_supplier.quality_score * 2.5 +                        -- 25% quality
    GREATEST(0, 10 - v_supplier.avg_response_time_hours) +  -- 10% response
    (10 - LEAST(v_supplier.rating, 10)) * 1                 -- 10% rating
  );
  
  UPDATE suppliers SET overall_score = v_score WHERE id = p_supplier_id;
  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- View: סיכום RFQ עם הצעות
CREATE OR REPLACE VIEW rfq_summary AS
SELECT 
  r.id AS rfq_id,
  r.status,
  r.response_deadline,
  r.sent_at,
  pr.requested_by,
  pr.urgency,
  pr.project_name,
  COUNT(DISTINCT rr.id) AS suppliers_contacted,
  COUNT(DISTINCT rr.id) FILTER (WHERE rr.status = 'quoted') AS quotes_received,
  COUNT(DISTINCT rr.id) FILTER (WHERE rr.status = 'no_response') AS no_responses,
  MIN(sq.total_price) AS lowest_quote,
  MAX(sq.total_price) AS highest_quote,
  AVG(sq.total_price) AS avg_quote,
  MAX(sq.total_price) - MIN(sq.total_price) AS price_spread
FROM rfqs r
LEFT JOIN purchase_requests pr ON r.purchase_request_id = pr.id
LEFT JOIN rfq_recipients rr ON rr.rfq_id = r.id
LEFT JOIN supplier_quotes sq ON sq.rfq_id = r.id
GROUP BY r.id, r.status, r.response_deadline, r.sent_at, pr.requested_by, pr.urgency, pr.project_name;

-- View: דשבורד ספקים
CREATE OR REPLACE VIEW supplier_dashboard AS
SELECT 
  s.id,
  s.name,
  s.phone,
  s.rating,
  s.overall_score,
  s.risk_score,
  s.total_orders,
  s.total_spent,
  s.on_time_delivery_rate,
  s.quality_score AS quality,
  s.active,
  COUNT(DISTINCT sp.id) AS product_count,
  COUNT(DISTINCT po.id) AS open_orders,
  MAX(po.created_at) AS last_order
FROM suppliers s
LEFT JOIN supplier_products sp ON sp.supplier_id = s.id
LEFT JOIN purchase_orders po ON po.supplier_id = s.id AND po.status NOT IN ('closed', 'cancelled')
GROUP BY s.id;

-- View: דשבורד רכש
CREATE OR REPLACE VIEW procurement_dashboard AS
SELECT
  (SELECT COUNT(*) FROM purchase_orders WHERE status NOT IN ('closed', 'cancelled', 'delivered')) AS active_orders,
  (SELECT COUNT(*) FROM purchase_orders) AS total_orders,
  (SELECT COALESCE(SUM(total), 0) FROM purchase_orders WHERE status != 'cancelled') AS total_spent,
  (SELECT COALESCE(SUM(negotiated_savings), 0) FROM purchase_orders) AS total_savings,
  (SELECT COUNT(*) FROM rfqs WHERE status IN ('sent', 'collecting')) AS open_rfqs,
  (SELECT COUNT(*) FROM purchase_orders WHERE status = 'pending_approval') AS pending_approvals,
  (SELECT COUNT(*) FROM suppliers WHERE active = true) AS active_suppliers,
  (SELECT COUNT(*) FROM purchase_orders WHERE status = 'delivered' AND quality_result = 'passed') AS quality_passed,
  (SELECT AVG(quality_score) FROM purchase_orders WHERE quality_score IS NOT NULL) AS avg_quality;

-- ═══ RLS (Row Level Security) — אם רוצים הרשאות ═══
-- ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all for authenticated" ON suppliers FOR ALL USING (auth.role() = 'authenticated');

-- ═══ SEED DATA — נתוני דוגמה ═══

-- ספקים לדוגמה
INSERT INTO suppliers (name, contact_person, phone, email, whatsapp, address, rating, delivery_reliability, quality_score)
VALUES
  ('מתכת מקס', 'אבי כהן', '+972501111111', 'avi@metalmax.co.il', '+972501111111', 'אזור תעשייה חולון', 8, 7, 8),
  ('סטיל פרו', 'משה לוי', '+972502222222', 'moshe@steelpro.co.il', '+972502222222', 'אזור תעשייה ראשלצ', 9, 9, 9),
  ('עיר הברזל', 'יוסי אברהם', '+972503333333', NULL, '+972503333333', 'אזור תעשייה יהוד', 6, 8, 7),
  ('אלומיניום ישראל', 'דני רז', '+972504444444', 'dani@aluisrael.co.il', '+972504444444', 'אזור תעשייה נתניה', 7, 7, 8),
  ('זכוכית השרון', 'רונן גלד', '+972505555555', 'ronen@glass-sharon.co.il', '+972505555555', 'כפר סבא', 8, 6, 9)
ON CONFLICT DO NOTHING;

-- מוצרים לכל ספק
INSERT INTO supplier_products (supplier_id, category, name, unit, current_price, currency, lead_time_days)
SELECT s.id, p.category, p.name, p.unit, p.price, 'ILS', p.lead
FROM suppliers s
CROSS JOIN (VALUES
  ('מתכת מקס', 'ברזל', 'ברזל 12 מ"מ', 'מטר', 45, 3),
  ('מתכת מקס', 'ברזל', 'פרופיל 40×40', 'מטר', 62, 3),
  ('מתכת מקס', 'ברזל', 'פח 2 מ"מ', 'מ"ר', 85, 3),
  ('סטיל פרו', 'ברזל', 'ברזל 12 מ"מ', 'מטר', 42, 5),
  ('סטיל פרו', 'ברזל', 'פרופיל 40×40', 'מטר', 58, 5),
  ('סטיל פרו', 'נירוסטה', 'צינור נירוסטה 50 מ"מ', 'מטר', 120, 7),
  ('עיר הברזל', 'ברזל', 'ברזל 12 מ"מ', 'מטר', 48, 2),
  ('עיר הברזל', 'ברזל', 'ברזל 16 מ"מ', 'מטר', 55, 2),
  ('אלומיניום ישראל', 'אלומיניום', 'פרופיל אלומיניום 50×30', 'מטר', 75, 5),
  ('אלומיניום ישראל', 'אלומיניום', 'פח אלומיניום 1.5 מ"מ', 'מ"ר', 95, 5),
  ('זכוכית השרון', 'זכוכית', 'זכוכית מחוסמת 10 מ"מ', 'מ"ר', 280, 10),
  ('זכוכית השרון', 'זכוכית', 'זכוכית למינציה 8+8', 'מ"ר', 420, 14)
) AS p(supplier_name, category, name, unit, price, lead)
WHERE s.name = p.supplier_name
ON CONFLICT DO NOTHING;

-- קבלני משנה לדוגמה
INSERT INTO subcontractors (name, phone, specialties, quality_rating, reliability_rating)
VALUES
  ('משה מעקות', '+972506666666', ARRAY['מעקות_ברזל', 'מעקות_אלומיניום'], 8, 9),
  ('דוד מסגריה', '+972507777777', ARRAY['מעקות_ברזל', 'שערים', 'גדרות'], 7, 7),
  ('יוסי התקנות', '+972508888888', ARRAY['התקנה', 'מעקות_ברזל'], 9, 6),
  ('אמיר פרגולות', '+972509999999', ARRAY['פרגולות', 'גדרות'], 8, 8)
ON CONFLICT DO NOTHING;

-- מחירון קבלנים
INSERT INTO subcontractor_pricing (subcontractor_id, work_type, percentage_rate, price_per_sqm, minimum_price)
SELECT s.id, p.work_type, p.pct, p.sqm, p.min_price
FROM subcontractors s
CROSS JOIN (VALUES
  ('משה מעקות', 'מעקות_ברזל', 15, 350, 5000),
  ('משה מעקות', 'מעקות_אלומיניום', 12, 400, 5000),
  ('דוד מסגריה', 'מעקות_ברזל', 18, 300, 4000),
  ('דוד מסגריה', 'שערים', 20, 500, 6000),
  ('דוד מסגריה', 'גדרות', 15, 280, 3000),
  ('יוסי התקנות', 'מעקות_ברזל', 14, 380, 5000),
  ('יוסי התקנות', 'התקנה', 10, 200, 3000),
  ('אמיר פרגולות', 'פרגולות', 22, 600, 8000),
  ('אמיר פרגולות', 'גדרות', 16, 300, 4000)
) AS p(sub_name, work_type, pct, sqm, min_price)
WHERE s.name = p.sub_name
ON CONFLICT (subcontractor_id, work_type) DO UPDATE 
  SET percentage_rate = EXCLUDED.percentage_rate,
      price_per_sqm = EXCLUDED.price_per_sqm,
      minimum_price = EXCLUDED.minimum_price;

SELECT 'ONYX Database Schema created successfully!' AS result;
SELECT '  Suppliers: ' || COUNT(*) FROM suppliers;
SELECT '  Products: ' || COUNT(*) FROM supplier_products;
SELECT '  Subcontractors: ' || COUNT(*) FROM subcontractors;
SELECT '  Pricing rules: ' || COUNT(*) FROM subcontractor_pricing;
