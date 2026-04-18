-- Kobi ERP - Initial Schema
-- Techno-Kol Uzi (iron/aluminum factory) + Kobi Elkayam Real Estate

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- User profiles
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'manager', 'employee', 'accountant', 'sales')),
    company TEXT NOT NULL DEFAULT 'techno-kol' CHECK (company IN ('techno-kol', 'real-estate', 'both')),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

-- Customers
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    tax_id TEXT UNIQUE,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    balance NUMERIC(14,2) DEFAULT 0,
    credit_limit NUMERIC(14,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

-- Suppliers
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    tax_id TEXT UNIQUE,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    payment_terms INTEGER DEFAULT 30,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

-- Inventory (iron and aluminum)
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT CHECK (category IN ('iron', 'aluminum', 'hardware', 'tool', 'other')),
    unit TEXT DEFAULT 'unit' CHECK (unit IN ('unit', 'kg', 'meter', 'sheet', 'bar')),
    quantity NUMERIC(12,3) DEFAULT 0,
    min_quantity NUMERIC(12,3) DEFAULT 0,
    cost_price NUMERIC(12,2) DEFAULT 0,
    sale_price NUMERIC(12,2) DEFAULT 0,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    location TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

-- Orders
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL,
    customer_id UUID REFERENCES public.customers(id),
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'in_production', 'shipped', 'delivered', 'invoiced', 'paid', 'cancelled')),
    order_date DATE DEFAULT CURRENT_DATE,
    delivery_date DATE,
    subtotal NUMERIC(14,2) DEFAULT 0,
    vat NUMERIC(14,2) DEFAULT 0,
    total NUMERIC(14,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

-- Employees
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_number TEXT UNIQUE,
    full_name TEXT NOT NULL,
    position TEXT,
    department TEXT CHECK (department IN ('production', 'sales', 'office', 'logistics', 'management')),
    phone TEXT,
    email TEXT,
    hourly_rate NUMERIC(8,2),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

-- Properties (real estate)
CREATE TABLE IF NOT EXISTS public.properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_type TEXT CHECK (property_type IN ('apartment', 'house', 'commercial', 'land', 'industrial')),
    address TEXT NOT NULL,
    city TEXT,
    size_sqm NUMERIC(8,2),
    rooms INTEGER,
    purchase_price NUMERIC(14,2),
    current_value NUMERIC(14,2),
    monthly_rent NUMERIC(10,2),
    tenant_name TEXT,
    status TEXT DEFAULT 'owned' CHECK (status IN ('owned', 'rented', 'for_sale', 'sold', 'vacant')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

-- Enable Row Level Security
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
