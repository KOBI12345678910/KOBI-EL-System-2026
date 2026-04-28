-- ============================================================================
-- Migration : 00089_demo_seed_data.sql
-- Purpose   : Realistic Israeli ERP demo seed for Techno-Kol Uzi
--             (gates / railings / pergolas).
--             Populates the operational graph end-to-end so 360 pages render
--             with live data:
--               1 tenant, 5 customers, 5 suppliers, 10 products, 3 employees,
--               2 quotes -> 2 orders -> 2 work orders -> 2 invoices,
--               2 RFQs -> 2 POs -> 2 GRNs, 1 bank account,
--               sample journal entries (revenue / expense / VAT 18%).
--
-- IDs/SSNs : All IL ID values are clearly fake 9-digit fillers (e.g. 123456789).
-- Idempotent : every INSERT uses ON CONFLICT DO NOTHING so the migration
--              is safe to re-run.
-- ============================================================================

BEGIN;

-- ─── 1. Tenant (conditional - only if public.tenants exists) ─────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'tenants') THEN
    EXECUTE $sql$
      INSERT INTO public.tenants (id, name)
      VALUES ('00000000-0000-0000-0000-000000000001', 'Techno-Kol Uzi Ltd')
      ON CONFLICT (id) DO NOTHING
    $sql$;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- tenants schema differs from expectation; skip rather than abort.
  RAISE NOTICE '[00089] public.tenants insert skipped: %', SQLERRM;
END $$;

-- Workforce employer (logical tenant in the operational schema)
INSERT INTO workforce.employers
  (employer_number, legal_name, tax_id, phone, email, status)
VALUES
  ('EMP-001', 'Techno-Kol Uzi Ltd', '514785236',
   '03-5551234', 'hr@techno-kol-uzi.co.il', 'active')
ON CONFLICT (employer_number) DO NOTHING;

-- ─── 2. Customers (5: mix Hebrew/English + IL addresses + ת.ז./ח.פ.) ────
INSERT INTO commercial.customers
  (customer_number, legal_name, display_name, customer_type, tax_id,
   phone, email, address_line_1, city, region, postal_code, country,
   billing_contact_name, billing_contact_email, status,
   credit_limit, preferred_currency)
VALUES
  ('CUST-2026-001', 'משפחת כהן - וילה הרצליה', 'משפחת כהן', 'private',
   '123456789', '052-1110001', 'family.cohen@example.co.il',
   'רחוב הרצל 12', 'הרצליה', 'מרכז', '4640012', 'IL',
   'אבי כהן', 'avi.cohen@example.co.il', 'active', 250000, 'ILS'),
  ('CUST-2026-002', 'Aviv Construction Ltd', 'Aviv Construction', 'business',
   '512345670', '03-5552002', 'orders@aviv-construction.co.il',
   'Yigal Allon 98', 'Tel Aviv', 'Tel Aviv', '6789141', 'IL',
   'Dana Aviv', 'dana@aviv-construction.co.il', 'active', 800000, 'ILS'),
  ('CUST-2026-003', 'בית ספר תיכון רעננה', 'תיכון רעננה', 'public',
   '500003003', '09-7710003', 'logistics@raanana-school.muni.il',
   'דרך ההגנה 45', 'רעננה', 'מרכז', '4321001', 'IL',
   'רונית דהן', 'ronit@raanana-school.muni.il', 'active', 500000, 'ILS'),
  ('CUST-2026-004', 'Mediterranean Hotel Group Ltd', 'Med Hotels', 'business',
   '514004004', '04-8884004', 'projects@med-hotels.com',
   'HaYam 7', 'Haifa', 'Haifa', '3303107', 'IL',
   'Yossi Ben-David', 'yossi@med-hotels.com', 'active', 1500000, 'ILS'),
  ('CUST-2026-005', 'משפחת לוי - קוטג'' מודיעין', 'משפחת לוי', 'private',
   '987654321', '054-9990005', 'levi.family@example.co.il',
   'רחוב הזית 8', 'מודיעין', 'מרכז', '7177408', 'IL',
   'מיכל לוי', 'michal.levi@example.co.il', 'active', 180000, 'ILS')
ON CONFLICT (customer_number) DO NOTHING;

-- ─── 3. Suppliers (5: steel, paint, fasteners, electronics, transport) ──
INSERT INTO procurement.suppliers
  (supplier_number, legal_name, display_name, supplier_category, tax_id,
   phone, email, address_line_1, city, region, postal_code, country,
   primary_contact_name, primary_contact_email,
   payment_terms, preferred_currency, status, preferred_supplier)
VALUES
  ('SUP-2026-001', 'פלדה מתכת ישראל בע"מ', 'Steel Israel', 'raw_materials',
   '510101001', '03-5610001', 'sales@steel-israel.co.il',
   'אזור התעשייה צפון', 'אשדוד', 'דרום', '7710101', 'IL',
   'מנחם בר', 'menachem@steel-israel.co.il',
   'NET-30', 'ILS', 'Active', true),
  ('SUP-2026-002', 'ColorTech Paints Ltd', 'ColorTech Paints', 'finishing',
   '512020002', '09-7720002', 'orders@colortech.co.il',
   'HaTaasiya 14', 'Petah Tikva', 'מרכז', '4951114', 'IL',
   'Tamar Shalev', 'tamar@colortech.co.il',
   'NET-45', 'ILS', 'Active', true),
  ('SUP-2026-003', 'מהדקים בורגים בע"מ', 'BoltFix Fasteners', 'fasteners',
   '513030003', '08-6630003', 'sales@boltfix.co.il',
   'רחוב המסגר 22', 'באר שבע', 'דרום', '8488422', 'IL',
   'דוד פרץ', 'david@boltfix.co.il',
   'NET-30', 'ILS', 'Active', false),
  ('SUP-2026-004', 'SmartGate Electronics Ltd', 'SmartGate', 'electronics',
   '514040004', '04-8240004', 'b2b@smartgate.co.il',
   'HaCarmel Park 3', 'Haifa', 'Haifa', '3303103', 'IL',
   'Ron Sharon', 'ron@smartgate.co.il',
   'NET-60', 'ILS', 'Active', true),
  ('SUP-2026-005', 'הובלות גליל בע"מ', 'Galil Transport', 'transport',
   '515050005', '04-9050005', 'dispatch@galil-transport.co.il',
   'תעשיית עפולה', 'עפולה', 'צפון', '1810505', 'IL',
   'יעקב גולן', 'yaakov@galil-transport.co.il',
   'NET-15', 'ILS', 'Active', false)
ON CONFLICT (supplier_number) DO NOTHING;

-- ─── 4. Material categories + 10 products (gates/railings/pergolas) ─────
INSERT INTO inventory.material_categories (category_code, category_name) VALUES
  ('CAT-GATE',    'Gates / שערים'),
  ('CAT-RAIL',    'Railings / מעקות'),
  ('CAT-PERGOLA', 'Pergolas / פרגולות')
ON CONFLICT (category_code) DO NOTHING;

INSERT INTO inventory.materials
  (material_code, name, description, category_id, unit_of_measure,
   standard_cost, reorder_point, safety_stock, active)
SELECT mat.code, mat.name, mat.descr,
       (SELECT id FROM inventory.material_categories WHERE category_code = mat.cat),
       mat.uom, mat.cost, mat.reord, mat.safety, true
FROM (VALUES
  ('PRD-GATE-S-200', 'שער הזזה מתכת 2.0מ',     'Sliding steel gate 2.0m', 'CAT-GATE',    'unit', 4200,  2,  1),
  ('PRD-GATE-S-300', 'שער הזזה מתכת 3.0מ',     'Sliding steel gate 3.0m', 'CAT-GATE',    'unit', 5600,  2,  1),
  ('PRD-GATE-D-180', 'שער כנף כפול 1.8מ',      'Double-leaf gate 1.8m',   'CAT-GATE',    'unit', 3800,  3,  1),
  ('PRD-GATE-PED',   'שער כניסה הולך-רגל',     'Pedestrian access gate',  'CAT-GATE',    'unit', 1900,  4,  2),
  ('PRD-RAIL-G-100', 'מעקה זכוכית 1.0מ',       'Glass railing 1.0m',      'CAT-RAIL',    'm',     820,  20, 10),
  ('PRD-RAIL-S-100', 'מעקה נירוסטה 1.0מ',     'Stainless railing 1.0m',  'CAT-RAIL',    'm',     650,  30, 15),
  ('PRD-RAIL-A-110', 'מעקה אלומיניום 1.1מ',    'Aluminum railing 1.1m',   'CAT-RAIL',    'm',     480,  40, 20),
  ('PRD-PERG-3X4',   'פרגולה אלומיניום 3x4מ',  'Aluminum pergola 3x4m',   'CAT-PERGOLA', 'unit', 9800,  1,  1),
  ('PRD-PERG-4X6',   'פרגולה אלומיניום 4x6מ',  'Aluminum pergola 4x6m',   'CAT-PERGOLA', 'unit', 14500, 1,  1),
  ('PRD-PERG-LV-3',  'פרגולה הזזה עם לוברים 3מ','Louvered pergola 3m',    'CAT-PERGOLA', 'unit', 18900, 1,  1)
) AS mat(code, name, descr, cat, uom, cost, reord, safety)
ON CONFLICT (material_code) DO NOTHING;

-- ─── 5. Employees (3 with IL ת.ז. + roles) ─────────────────────────────
INSERT INTO workforce.employees
  (employee_number, full_name, phone, email,
   employer_id, role_title, department, employment_type,
   hourly_rate, salary_base, status, start_date, national_id)
SELECT emp.num, emp.name, emp.phone, emp.email,
       (SELECT id FROM workforce.employers WHERE employer_number = 'EMP-001'),
       emp.role, emp.dept, emp.etype, emp.hourly, emp.salary, 'Active',
       emp.start::date, emp.nid
FROM (VALUES
  ('EMP-2026-001', 'אבי שמעוני',  '050-1001003', 'avi.sh@techno-kol-uzi.co.il',
     'Production Foreman / מנהל ייצור', 'Production',   'full_time',
     85.00,  18500, '2024-03-15', '111222333'),
  ('EMP-2026-002', 'דנה ברק',     '050-1001002', 'dana@techno-kol-uzi.co.il',
     'Sales Manager / מנהלת מכירות',    'Commercial',   'full_time',
     95.00,  21000, '2023-11-01', '222333444'),
  ('EMP-2026-003', 'יוסי פרץ',    '050-1001005', 'yossi.p@techno-kol-uzi.co.il',
     'Lead Installer / מתקין ראשי',     'Installation', 'full_time',
     70.00,  15200, '2025-01-20', '333444555')
) AS emp(num, name, phone, email, role, dept, etype, hourly, salary, start, nid)
ON CONFLICT (employee_number) DO NOTHING;

-- ─── 6. Quote-to-Cash chain: 2 quotes -> 2 orders (proxy) ->
--      2 work orders -> 2 invoices ─────────────────────────────────────
-- Quotes
INSERT INTO commercial.quotes
  (quote_number, customer_id, quote_date, valid_until,
   subtotal, vat_total, grand_total, currency,
   approval_status, state)
SELECT q.qn,
       (SELECT id FROM commercial.customers WHERE customer_number = q.cn),
       q.qdate::date, q.vu::date, q.sub, q.vat, q.gt, 'ILS',
       'approved', 'Accepted'
FROM (VALUES
  ('Q-2026-0001', 'CUST-2026-001', '2026-03-10', '2026-04-10',
     12500.00, 2250.00, 14750.00),
  ('Q-2026-0002', 'CUST-2026-002', '2026-03-22', '2026-04-22',
     48000.00, 8640.00, 56640.00)
) AS q(qn, cn, qdate, vu, sub, vat, gt)
ON CONFLICT (quote_number) DO NOTHING;

INSERT INTO commercial.quote_lines
  (quote_id, line_number, item_type, item_code, description,
   quantity, unit_of_measure, unit_price,
   line_subtotal, vat_percent, vat_amount, line_total)
SELECT (SELECT id FROM commercial.quotes WHERE quote_number = ql.qn),
       ql.ln, 'product', ql.code, ql.descr,
       ql.qty, ql.uom, ql.up,
       ql.sub, 18.00, ql.vat, ql.tot
FROM (VALUES
  ('Q-2026-0001', 1, 'PRD-GATE-S-300', 'שער הזזה מתכת 3.0מ - וילה הרצליה',
      1, 'unit',  6500.00,  6500.00, 1170.00,  7670.00),
  ('Q-2026-0001', 2, 'PRD-RAIL-G-100', 'מעקה זכוכית - 6 מטר רץ',
      6, 'm',     1000.00,  6000.00, 1080.00,  7080.00),
  ('Q-2026-0002', 1, 'PRD-PERG-4X6',   'פרגולה אלומיניום 4x6מ',
      1, 'unit', 19000.00, 19000.00, 3420.00, 22420.00),
  ('Q-2026-0002', 2, 'PRD-PERG-LV-3',  'פרגולה הזזה עם לוברים 3מ',
      1, 'unit', 22000.00, 22000.00, 3960.00, 25960.00),
  ('Q-2026-0002', 3, 'PRD-RAIL-S-100', 'מעקה נירוסטה - 10 מטר',
     10, 'm',      700.00,  7000.00, 1260.00,  8260.00)
) AS ql(qn, ln, code, descr, qty, uom, up, sub, vat, tot)
ON CONFLICT (quote_id, line_number) DO NOTHING;

-- Projects (the "sales order" in this ERP - converted from quotes)
INSERT INTO execution.projects
  (project_number, project_name, customer_id, quote_id,
   project_type, location_name, city, budget_amount,
   planned_start_date, planned_end_date, billable, state)
SELECT p.pn, p.name,
       (SELECT id FROM commercial.customers WHERE customer_number = p.cn),
       (SELECT id FROM commercial.quotes WHERE quote_number = p.qn),
       p.ptype, p.loc, p.city, p.bud,
       p.pstart::date, p.pend::date, true, 'In Progress'
FROM (VALUES
  ('PRJ-2026-0001', 'Cohen Villa - Gate + Glass Railings',
     'CUST-2026-001', 'Q-2026-0001', 'gate_install',
     'Cohen Villa', 'הרצליה', 14750.00, '2026-04-01', '2026-05-15'),
  ('PRJ-2026-0002', 'Aviv Construction - Pergolas + Stainless Rails',
     'CUST-2026-002', 'Q-2026-0002', 'pergola_install',
     'Aviv HQ Roof', 'Tel Aviv', 56640.00, '2026-04-10', '2026-06-20')
) AS p(pn, name, cn, qn, ptype, loc, city, bud, pstart, pend)
ON CONFLICT (project_number) DO NOTHING;

-- Work orders (one per project)
INSERT INTO execution.work_orders
  (work_order_number, project_id, title, description,
   location_name, required_start_date, required_end_date,
   state, assigned_team_name)
SELECT w.wn,
       (SELECT id FROM execution.projects WHERE project_number = w.pn),
       w.title, w.descr, w.loc,
       w.rs::date, w.re::date, 'In Progress', w.team
FROM (VALUES
  ('WO-2026-0001', 'PRJ-2026-0001',
     'Install gate + railing - Cohen Villa',
     'Mount sliding gate 3.0m + 6m glass railing',
     'הרצליה - וילה כהן', '2026-04-15', '2026-04-30',
     'Team A - Installation'),
  ('WO-2026-0002', 'PRJ-2026-0002',
     'Install pergolas + stainless rails - Aviv',
     'Two pergolas (4x6 + louvered 3m) and 10m stainless railing',
     'Tel Aviv - Aviv HQ Roof', '2026-04-25', '2026-06-15',
     'Team B - Pergola Specialists')
) AS w(wn, pn, title, descr, loc, rs, re, team)
ON CONFLICT (work_order_number) DO NOTHING;

-- Sales invoices (Q2C closure)
INSERT INTO finance.invoices
  (invoice_number, invoice_type, customer_id, project_id,
   issue_date, due_date,
   subtotal, vat_total, grand_total, balance_due,
   currency, state, notes)
SELECT i.inv, 'sales',
       (SELECT id FROM commercial.customers WHERE customer_number = i.cn),
       (SELECT id FROM execution.projects   WHERE project_number  = i.pn),
       i.issued::date, i.due::date,
       i.sub, i.vat, i.gt, i.gt, 'ILS', 'Issued', i.notes
FROM (VALUES
  ('INV-2026-0001', 'CUST-2026-001', 'PRJ-2026-0001',
     '2026-04-29', '2026-05-29',
     12500.00, 2250.00, 14750.00,
     'חשבונית סופית - שער + מעקה זכוכית'),
  ('INV-2026-0002', 'CUST-2026-002', 'PRJ-2026-0002',
     '2026-04-29', '2026-05-29',
     48000.00, 8640.00, 56640.00,
     'Final invoice - Pergolas + stainless railings')
) AS i(inv, cn, pn, issued, due, sub, vat, gt, notes)
ON CONFLICT (invoice_number) DO NOTHING;

INSERT INTO finance.invoice_lines
  (invoice_id, line_number, description,
   quantity, unit_price, line_subtotal,
   vat_percent, vat_amount, line_total)
SELECT (SELECT id FROM finance.invoices WHERE invoice_number = il.inv),
       il.ln, il.descr, il.qty, il.up, il.sub, 18.00, il.vat, il.tot
FROM (VALUES
  ('INV-2026-0001', 1, 'שער הזזה 3.0מ + התקנה',
     1.00,  6500.00,  6500.00, 1170.00,  7670.00),
  ('INV-2026-0001', 2, 'מעקה זכוכית 6 מטר רץ',
     6.00,  1000.00,  6000.00, 1080.00,  7080.00),
  ('INV-2026-0002', 1, 'Aluminum pergola 4x6m + install',
     1.00, 19000.00, 19000.00, 3420.00, 22420.00),
  ('INV-2026-0002', 2, 'Louvered pergola 3m + install',
     1.00, 22000.00, 22000.00, 3960.00, 25960.00),
  ('INV-2026-0002', 3, 'Stainless railing 10m',
    10.00,   700.00,  7000.00, 1260.00,  8260.00)
) AS il(inv, ln, descr, qty, up, sub, vat, tot)
ON CONFLICT (invoice_id, line_number) DO NOTHING;

-- ─── 7. Procure-to-Pay chain: 2 RFQs -> 2 POs -> 2 GRNs ────────────────
INSERT INTO procurement.rfqs
  (rfq_number, requested_date, response_deadline,
   approval_status, state, internal_notes)
VALUES
  ('RFQ-2026-0001', '2026-04-01', '2026-04-08',
     'approved', 'Closed',  'Steel + paint for Cohen + Aviv jobs'),
  ('RFQ-2026-0002', '2026-04-05', '2026-04-12',
     'approved', 'Closed',  'Electronics + fasteners for SmartGate kits')
ON CONFLICT (rfq_number) DO NOTHING;

INSERT INTO procurement.rfq_items
  (rfq_id, line_number, requested_code, description,
   quantity, unit_of_measure, target_delivery_date)
SELECT (SELECT id FROM procurement.rfqs WHERE rfq_number = ri.rn),
       ri.ln, ri.code, ri.descr, ri.qty, ri.uom, ri.tgt::date
FROM (VALUES
  ('RFQ-2026-0001', 1, 'STEEL-PROFILE-60X40',
     'Steel profile 60x40 / פרופיל פלדה', 120, 'm', '2026-04-15'),
  ('RFQ-2026-0001', 2, 'PAINT-POWDER-BLACK',
     'Powder coating black 25kg',           4, 'bag', '2026-04-15'),
  ('RFQ-2026-0002', 1, 'CTRL-SMARTGATE-PRO',
     'SmartGate Pro controller',            2, 'unit', '2026-04-20'),
  ('RFQ-2026-0002', 2, 'BOLT-M10X80-SS',
     'Stainless bolt M10x80',             500, 'unit', '2026-04-20')
) AS ri(rn, ln, code, descr, qty, uom, tgt)
ON CONFLICT (rfq_id, line_number) DO NOTHING;

-- Purchase orders
INSERT INTO procurement.purchase_orders
  (po_number, supplier_id, rfq_id, order_date, expected_delivery_date,
   currency, subtotal, vat_total, grand_total,
   approval_status, receiving_status, state, delivery_address)
SELECT p.po,
       (SELECT id FROM procurement.suppliers WHERE supplier_number = p.sn),
       (SELECT id FROM procurement.rfqs      WHERE rfq_number      = p.rn),
       p.od::date, p.exp::date, 'ILS',
       p.sub, p.vat, p.gt,
       'approved', 'received', 'Confirmed',
       'מחסן מרכזי - רחוב התעשייה 5, באר שבע'
FROM (VALUES
  ('PO-2026-0001', 'SUP-2026-001', 'RFQ-2026-0001',
     '2026-04-09', '2026-04-15', 18000.00, 3240.00, 21240.00),
  ('PO-2026-0002', 'SUP-2026-004', 'RFQ-2026-0002',
     '2026-04-13', '2026-04-22',  6500.00, 1170.00,  7670.00)
) AS p(po, sn, rn, od, exp, sub, vat, gt)
ON CONFLICT (po_number) DO NOTHING;

INSERT INTO procurement.purchase_order_lines
  (po_id, line_number, description,
   quantity_ordered, quantity_received, quantity_open,
   unit_of_measure, unit_price, line_subtotal,
   vat_percent, vat_amount, line_total)
SELECT (SELECT id FROM procurement.purchase_orders WHERE po_number = pl.po),
       pl.ln, pl.descr, pl.qty, pl.qty, 0,
       pl.uom, pl.up, pl.sub, 18.00, pl.vat, pl.tot
FROM (VALUES
  ('PO-2026-0001', 1, 'Steel profile 60x40 / פרופיל פלדה 60x40',
     120, 'm',   125.00, 15000.00, 2700.00, 17700.00),
  ('PO-2026-0001', 2, 'Powder coating black 25kg',
       4, 'bag', 750.00,  3000.00,  540.00,  3540.00),
  ('PO-2026-0002', 1, 'SmartGate Pro controller',
       2, 'unit',2750.00, 5500.00,  990.00,  6490.00),
  ('PO-2026-0002', 2, 'Stainless bolt M10x80',
     500, 'unit',   2.00, 1000.00,  180.00,  1180.00)
) AS pl(po, ln, descr, qty, uom, up, sub, vat, tot)
ON CONFLICT (po_id, line_number) DO NOTHING;

-- GRNs - Goods Receipts (in master schema as inventory_receipts)
-- Default warehouse first
INSERT INTO inventory.warehouses
  (warehouse_code, name, location_name, city, warehouse_type, active)
VALUES
  ('WH-MAIN', 'מחסן מרכזי באר שבע', 'מחסן מרכזי',
   'באר שבע', 'main', true)
ON CONFLICT (warehouse_code) DO NOTHING;

INSERT INTO inventory.inventory_receipts
  (receipt_number, po_id, material_id, warehouse_id,
   quantity_received, unit_cost, receipt_date, notes)
SELECT r.rn,
       (SELECT id FROM procurement.purchase_orders WHERE po_number      = r.po),
       (SELECT id FROM inventory.materials         WHERE material_code  = r.mc),
       (SELECT id FROM inventory.warehouses        WHERE warehouse_code = 'WH-MAIN'),
       r.qty, r.cost, r.rd::date, r.notes
FROM (VALUES
  ('GRN-2026-0001', 'PO-2026-0001', 'PRD-GATE-S-300',
     1, 6500.00, '2026-04-15', 'Goods received - steel + paint batch'),
  ('GRN-2026-0002', 'PO-2026-0002', 'PRD-GATE-PED',
     2, 1900.00, '2026-04-22', 'Goods received - electronics + fasteners')
) AS r(rn, po, mc, qty, cost, rd, notes)
ON CONFLICT (receipt_number) DO NOTHING;

-- ─── 8. Bank account ────────────────────────────────────────────────────
INSERT INTO treasury.bank_accounts
  (account_number_masked, bank_name, branch_name,
   currency, account_type, current_balance, active, owner_company_name)
SELECT '***1234', 'Bank Leumi', 'Ramat Gan',
       'ILS', 'checking', 1250000.00, true, 'Techno-Kol Uzi Ltd'
WHERE NOT EXISTS (
  SELECT 1 FROM treasury.bank_accounts
   WHERE account_number_masked = '***1234' AND bank_name = 'Bank Leumi'
);

-- ─── 9. Sample journal entries (revenue / expense / VAT 18%) ───────────
-- Each invoice/PO produces a balanced double-entry pair in finance.gl_transactions.
INSERT INTO finance.gl_transactions
  (transaction_number, entry_date, account_code,
   debit_amount, credit_amount, currency,
   linked_entity_type, linked_entity_id, description)
SELECT g.tn, g.ed::date, g.acct, g.dr, g.cr, 'ILS',
       g.et,
       (CASE g.et
          WHEN 'invoice'        THEN (SELECT id FROM finance.invoices             WHERE invoice_number = g.ref)
          WHEN 'purchase_order' THEN (SELECT id FROM procurement.purchase_orders  WHERE po_number      = g.ref)
        END),
       g.descr
FROM (VALUES
  -- INV-2026-0001: revenue 12,500 + VAT 2,250 = AR 14,750
  ('JE-2026-0001', '2026-04-29', '1100', 14750.00,    0.00, 'invoice',        'INV-2026-0001', 'AR - Cohen invoice'),
  ('JE-2026-0002', '2026-04-29', '4000',     0.00, 12500.00, 'invoice',        'INV-2026-0001', 'Revenue - gate + railing'),
  ('JE-2026-0003', '2026-04-29', '2210',     0.00,  2250.00, 'invoice',        'INV-2026-0001', 'VAT output 18%'),
  -- INV-2026-0002: revenue 48,000 + VAT 8,640 = AR 56,640
  ('JE-2026-0004', '2026-04-29', '1100', 56640.00,    0.00, 'invoice',        'INV-2026-0002', 'AR - Aviv invoice'),
  ('JE-2026-0005', '2026-04-29', '4000',     0.00, 48000.00, 'invoice',        'INV-2026-0002', 'Revenue - pergolas + rails'),
  ('JE-2026-0006', '2026-04-29', '2210',     0.00,  8640.00, 'invoice',        'INV-2026-0002', 'VAT output 18%'),
  -- PO-2026-0001: expense 18,000 + VAT input 3,240 = AP 21,240
  ('JE-2026-0007', '2026-04-15', '5100', 18000.00,    0.00, 'purchase_order', 'PO-2026-0001',  'Expense - steel + paint'),
  ('JE-2026-0008', '2026-04-15', '1220',  3240.00,    0.00, 'purchase_order', 'PO-2026-0001',  'VAT input 18%'),
  ('JE-2026-0009', '2026-04-15', '2100',     0.00, 21240.00, 'purchase_order', 'PO-2026-0001',  'AP - Steel Israel'),
  -- PO-2026-0002: expense 6,500 + VAT input 1,170 = AP 7,670
  ('JE-2026-0010', '2026-04-22', '5100',  6500.00,    0.00, 'purchase_order', 'PO-2026-0002',  'Expense - electronics + bolts'),
  ('JE-2026-0011', '2026-04-22', '1220',  1170.00,    0.00, 'purchase_order', 'PO-2026-0002',  'VAT input 18%'),
  ('JE-2026-0012', '2026-04-22', '2100',     0.00,  7670.00, 'purchase_order', 'PO-2026-0002',  'AP - SmartGate')
) AS g(tn, ed, acct, dr, cr, et, ref, descr)
ON CONFLICT (transaction_number) DO NOTHING;

-- ─── 10. VAT records (period 2026-04, 18%) ────────────────────────────
-- finance.vat_records has no natural unique constraint - guard with NOT EXISTS
-- so the insert stays idempotent on re-run.
INSERT INTO finance.vat_records
  (invoice_id, tax_period, vat_type, taxable_amount, vat_amount, filed)
SELECT (SELECT id FROM finance.invoices WHERE invoice_number = v.inv),
       '2026-04', 'output', v.taxable, v.vat, false
FROM (VALUES
  ('INV-2026-0001', 12500.00, 2250.00),
  ('INV-2026-0002', 48000.00, 8640.00)
) AS v(inv, taxable, vat)
WHERE NOT EXISTS (
  SELECT 1 FROM finance.vat_records vr
   WHERE vr.invoice_id = (SELECT id FROM finance.invoices WHERE invoice_number = v.inv)
     AND vr.tax_period = '2026-04'
     AND vr.vat_type   = 'output'
);

COMMIT;

-- ============================================================================
-- ROLLBACK GUIDANCE (manual):
--   DELETE FROM finance.vat_records       WHERE tax_period = '2026-04';
--   DELETE FROM finance.gl_transactions   WHERE transaction_number LIKE 'JE-2026-%';
--   DELETE FROM treasury.bank_accounts    WHERE account_number_masked = '***1234'
--                                           AND owner_company_name = 'Techno-Kol Uzi Ltd';
--   DELETE FROM inventory.inventory_receipts WHERE receipt_number LIKE 'GRN-2026-%';
--   DELETE FROM procurement.purchase_order_lines
--     WHERE po_id IN (SELECT id FROM procurement.purchase_orders
--                     WHERE po_number LIKE 'PO-2026-%');
--   DELETE FROM procurement.purchase_orders WHERE po_number LIKE 'PO-2026-%';
--   DELETE FROM procurement.rfq_items
--     WHERE rfq_id IN (SELECT id FROM procurement.rfqs WHERE rfq_number LIKE 'RFQ-2026-%');
--   DELETE FROM procurement.rfqs        WHERE rfq_number   LIKE 'RFQ-2026-%';
--   DELETE FROM finance.invoice_lines
--     WHERE invoice_id IN (SELECT id FROM finance.invoices WHERE invoice_number LIKE 'INV-2026-%');
--   DELETE FROM finance.invoices        WHERE invoice_number LIKE 'INV-2026-%';
--   DELETE FROM execution.work_orders   WHERE work_order_number LIKE 'WO-2026-%';
--   DELETE FROM execution.projects      WHERE project_number    LIKE 'PRJ-2026-%';
--   DELETE FROM commercial.quote_lines
--     WHERE quote_id IN (SELECT id FROM commercial.quotes WHERE quote_number LIKE 'Q-2026-%');
--   DELETE FROM commercial.quotes       WHERE quote_number      LIKE 'Q-2026-%';
--   DELETE FROM workforce.employees     WHERE employee_number   LIKE 'EMP-2026-%';
--   DELETE FROM inventory.materials     WHERE material_code     LIKE 'PRD-%';
--   DELETE FROM inventory.material_categories WHERE category_code LIKE 'CAT-%';
--   DELETE FROM procurement.suppliers   WHERE supplier_number   LIKE 'SUP-2026-%';
--   DELETE FROM commercial.customers    WHERE customer_number   LIKE 'CUST-2026-%';
--   DELETE FROM workforce.employers     WHERE employer_number   = 'EMP-001';
-- ============================================================================
