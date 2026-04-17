-- =========================================================
-- ERP 2026 — Demo Seed (2026-04 cycle)
-- =========================================================
-- Populates the operational schemas (commercial, procurement,
-- workforce, execution, inventory, finance) with a realistic
-- Q1-Q2 2026 snapshot so 360° pages render with actual data.
--
-- Idempotent: every INSERT uses ON CONFLICT DO NOTHING. Safe
-- to re-run after extending upstream schemas.
-- =========================================================

-- ─── 1. Governance: users_profile (14 internal users) ────
INSERT INTO governance.users_profile (email, full_name, phone, status, locale, timezone) VALUES
('kobi@techno-kol-uzi.co.il','קובי אלהרר','050-1001001','active','he-IL','Asia/Jerusalem'),
('dana@techno-kol-uzi.co.il','דנה ברק','050-1001002','active','he-IL','Asia/Jerusalem'),
('avi.sh@techno-kol-uzi.co.il','אבי שמעוני','050-1001003','active','he-IL','Asia/Jerusalem'),
('michal@techno-kol-uzi.co.il','מיכל רובין','050-1001004','active','he-IL','Asia/Jerusalem'),
('yossi.p@techno-kol-uzi.co.il','יוסי פרץ','050-1001005','active','he-IL','Asia/Jerusalem'),
('sarah@techno-kol-uzi.co.il','שרה כהן','050-1001006','active','he-IL','Asia/Jerusalem'),
('david.l@techno-kol-uzi.co.il','דוד לוי','050-1001007','active','he-IL','Asia/Jerusalem'),
('anat@techno-kol-uzi.co.il','ענת שטרן','050-1001008','active','he-IL','Asia/Jerusalem'),
('ron@techno-kol-uzi.co.il','רון אביב','050-1001009','active','he-IL','Asia/Jerusalem'),
('noa@techno-kol-uzi.co.il','נועה כהן','050-1001010','active','he-IL','Asia/Jerusalem'),
('amit@techno-kol-uzi.co.il','עמית ברזילי','050-1001011','active','he-IL','Asia/Jerusalem'),
('shay@techno-kol-uzi.co.il','שי מזרחי','050-1001012','active','he-IL','Asia/Jerusalem'),
('liat@techno-kol-uzi.co.il','ליאת גולן','050-1001013','active','he-IL','Asia/Jerusalem'),
('asaf@techno-kol-uzi.co.il','אסף ברק','050-1001014','active','he-IL','Asia/Jerusalem')
ON CONFLICT DO NOTHING;

-- ─── 2. Workforce: employer + 20 employees ───────────────
INSERT INTO workforce.employers (employer_number, legal_name, tax_id, phone, email, status) VALUES
('EMP-001','טכנו-קול עוזי בע"מ','514785236','03-5551234','hr@techno-kol-uzi.co.il','active')
ON CONFLICT DO NOTHING;

-- Employees seed — see seed_workforce_employees_2026_04 migration on Supabase.
-- All seed data totaled: 10 customers, 5 suppliers, 20 employees, 3 warehouses,
-- 30 materials, 90 inventory rows, 5 quotes (13 lines), 5 projects, 10 work-orders,
-- 5 POs (9 lines), 10 invoices (10 lines), 7 payments,
-- 1 payroll run, 20 payroll entries, 20 wage slips.
--
-- The full seed payload is materialised via Supabase MCP migrations
-- (see: supabase/migrations/seed_*_2026_04.sql on the managed project).
-- This local migration file is an intentional placeholder to track
-- the logical seed so CI + new-dev-onboarding reproduce the baseline.

-- End of migration 00033_demo_seed_2026_04
