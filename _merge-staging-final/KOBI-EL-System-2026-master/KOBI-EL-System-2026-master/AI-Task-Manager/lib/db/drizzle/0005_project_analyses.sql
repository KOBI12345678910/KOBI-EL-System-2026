CREATE TABLE IF NOT EXISTS "project_analyses" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_code" text NOT NULL UNIQUE,
  "project_name" text NOT NULL,
  "customer_name" text,
  "manager_name" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "start_date" text,
  "end_date" text,
  "description" text,
  "labor_cost" numeric DEFAULT '0',
  "installation_cost" numeric DEFAULT '0',
  "transport_cost" numeric DEFAULT '0',
  "insurance_cost" numeric DEFAULT '0',
  "storage_cost" numeric DEFAULT '0',
  "customs_cost" numeric DEFAULT '0',
  "packaging_cost" numeric DEFAULT '0',
  "overhead_cost" numeric DEFAULT '0',
  "payment_terms" text,
  "number_of_payments" integer DEFAULT 1,
  "credit_fee_percent" numeric DEFAULT '0',
  "contingency_percent" numeric DEFAULT '0',
  "operational_overhead_percent" numeric DEFAULT '0',
  "target_margin_percent" numeric DEFAULT '0',
  "proposed_sale_price" numeric DEFAULT '0',
  "actual_sale_price" numeric DEFAULT '0',
  "risk_score" numeric DEFAULT '5',
  "supplier_risk" numeric DEFAULT '5',
  "currency_risk" numeric DEFAULT '5',
  "market_risk" numeric DEFAULT '5',
  "operational_risk" numeric DEFAULT '5',
  "notes" text,
  "audit_trail" jsonb DEFAULT '[]',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "project_analysis_materials" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_analysis_id" integer NOT NULL,
  "raw_material_id" integer,
  "material_name" text NOT NULL,
  "material_number" text,
  "quantity" numeric DEFAULT '1',
  "unit" text DEFAULT 'יחידה',
  "unit_price" numeric DEFAULT '0',
  "total_price" numeric DEFAULT '0',
  "vat_amount" numeric DEFAULT '0',
  "supplier_discount" numeric DEFAULT '0',
  "price_per_meter" numeric,
  "supplier_id" integer,
  "supplier_name" text,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "project_analysis_costs" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_analysis_id" integer NOT NULL,
  "cost_type" text NOT NULL,
  "description" text,
  "amount" numeric DEFAULT '0',
  "currency" text DEFAULT 'ILS',
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "project_analysis_simulations" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_analysis_id" integer NOT NULL,
  "simulation_type" text NOT NULL,
  "scenario_name" text NOT NULL,
  "parameters" jsonb DEFAULT '{}',
  "results" jsonb DEFAULT '{}',
  "created_at" timestamp DEFAULT now() NOT NULL
);
