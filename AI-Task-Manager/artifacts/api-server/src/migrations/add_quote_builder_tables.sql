-- Migration: Quote Builder & Pricing Engine tables
-- Applies: CREATE TABLE IF NOT EXISTS (idempotent, safe to re-run)

CREATE TABLE IF NOT EXISTS quote_discount_approvals (
  id SERIAL PRIMARY KEY,
  quote_id INTEGER NOT NULL,
  quote_number TEXT,
  customer_name TEXT,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  threshold_percent NUMERIC(5,2) DEFAULT 15,
  status TEXT DEFAULT 'pending',
  requested_by TEXT,
  approved_by TEXT,
  rejected_by TEXT,
  approval_notes TEXT,
  rejection_reason TEXT,
  requested_at TIMESTAMP DEFAULT NOW(),
  decided_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_specific_prices (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER,
  customer_name TEXT,
  product_name TEXT NOT NULL,
  product_code TEXT,
  price NUMERIC(15,2) NOT NULL,
  currency TEXT DEFAULT 'ILS',
  valid_from DATE,
  valid_until DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS volume_discount_tiers (
  id SERIAL PRIMARY KEY,
  price_list_id INTEGER,
  product_name TEXT,
  product_code TEXT,
  min_quantity NUMERIC(10,2) NOT NULL,
  max_quantity NUMERIC(10,2),
  discount_percent NUMERIC(5,2) NOT NULL,
  fixed_price NUMERIC(15,2),
  currency TEXT DEFAULT 'ILS',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promotional_pricing (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  product_name TEXT,
  product_code TEXT,
  customer_category TEXT,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  fixed_price NUMERIC(15,2),
  currency TEXT DEFAULT 'ILS',
  valid_from DATE NOT NULL,
  valid_until DATE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id SERIAL PRIMARY KEY,
  order_id INTEGER,
  quote_id INTEGER,
  product_name TEXT NOT NULL,
  quantity_reserved NUMERIC(10,2) NOT NULL,
  status TEXT DEFAULT 'reserved',
  reserved_at TIMESTAMP DEFAULT NOW(),
  released_at TIMESTAMP,
  notes TEXT
);

-- Seed default discount threshold setting (idempotent upsert)
INSERT INTO platform_settings (key, value, category, description, is_system)
VALUES ('quote.discount_approval_threshold', '15', 'sales', 'Minimum discount percentage requiring manager approval on sales quotations', true)
ON CONFLICT (key) DO NOTHING;

-- Seed default company branding settings (idempotent upsert)
INSERT INTO platform_settings (key, value, category, description, is_system)
VALUES ('company.name', 'Our Company', 'branding', 'Company display name used in PDFs and reports', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_settings (key, value, category, description, is_system)
VALUES ('company.address', 'Tel Aviv, Israel', 'branding', 'Company address used in PDFs and reports', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_settings (key, value, category, description, is_system)
VALUES ('company.phone', '03-1234567', 'branding', 'Company phone number used in PDFs', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_settings (key, value, category, description, is_system)
VALUES ('company.email', 'info@company.co.il', 'branding', 'Company email used in PDFs', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_settings (key, value, category, description, is_system)
VALUES ('company.logo_url', '', 'branding', 'URL or base64 data URI of the company logo used in PDFs', false)
ON CONFLICT (key) DO NOTHING;
