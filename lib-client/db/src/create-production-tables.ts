import { db } from "./index.js";
import { sql } from "drizzle-orm";

const tables = [
  `CREATE TABLE IF NOT EXISTS bom_headers (id SERIAL PRIMARY KEY, bom_number TEXT NOT NULL UNIQUE, name TEXT NOT NULL, product_name TEXT, product_sku TEXT, version TEXT NOT NULL DEFAULT '1.0', status TEXT NOT NULL DEFAULT 'draft', description TEXT, total_cost NUMERIC DEFAULT 0, created_by TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS bom_lines (id SERIAL PRIMARY KEY, bom_header_id INTEGER NOT NULL, component_name TEXT NOT NULL, component_sku TEXT, quantity NUMERIC NOT NULL DEFAULT 1, unit TEXT NOT NULL DEFAULT 'unit', unit_cost NUMERIC DEFAULT 0, total_cost NUMERIC DEFAULT 0, level INTEGER NOT NULL DEFAULT 1, parent_line_id INTEGER, notes TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS production_work_orders (id SERIAL PRIMARY KEY, order_number TEXT NOT NULL UNIQUE, product_name TEXT NOT NULL, bom_id INTEGER, planned_start DATE, planned_end DATE, actual_start DATE, actual_end DATE, quantity_planned NUMERIC NOT NULL DEFAULT 0, quantity_produced NUMERIC DEFAULT 0, status TEXT NOT NULL DEFAULT 'planned', assigned_to TEXT, priority TEXT NOT NULL DEFAULT 'medium', notes TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS production_plans (id SERIAL PRIMARY KEY, plan_number TEXT NOT NULL UNIQUE, name TEXT NOT NULL, period_start DATE, period_end DATE, status TEXT NOT NULL DEFAULT 'draft', notes TEXT, created_by TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS production_plan_lines (id SERIAL PRIMARY KEY, plan_id INTEGER NOT NULL, product_name TEXT NOT NULL, target_quantity NUMERIC NOT NULL DEFAULT 0, bom_id INTEGER, scheduled_start DATE, scheduled_end DATE, work_order_id INTEGER, status TEXT NOT NULL DEFAULT 'pending', notes TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS qc_inspections (id SERIAL PRIMARY KEY, inspection_number TEXT NOT NULL UNIQUE, work_order_id INTEGER, batch_reference TEXT, inspection_date DATE, inspector TEXT, inspection_type TEXT NOT NULL DEFAULT 'in-process', result TEXT NOT NULL DEFAULT 'pending', defects_found INTEGER DEFAULT 0, defect_description TEXT, corrective_action TEXT, status TEXT NOT NULL DEFAULT 'pending', notes TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS machines (id SERIAL PRIMARY KEY, machine_number TEXT NOT NULL UNIQUE, name TEXT NOT NULL, asset_tag TEXT, location TEXT, machine_type TEXT, manufacturer TEXT, model TEXT, serial_number TEXT, status TEXT NOT NULL DEFAULT 'active', purchase_date DATE, notes TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS machine_maintenance_records (id SERIAL PRIMARY KEY, record_number TEXT NOT NULL UNIQUE, machine_id INTEGER NOT NULL, maintenance_type TEXT NOT NULL DEFAULT 'preventive', scheduled_date DATE, completed_date DATE, performed_by TEXT, description TEXT, cost NUMERIC DEFAULT 0, parts_replaced TEXT, next_scheduled_date DATE, status TEXT NOT NULL DEFAULT 'scheduled', notes TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS roadmap_items (id SERIAL PRIMARY KEY, item_number TEXT NOT NULL UNIQUE, title TEXT NOT NULL, product_area TEXT, item_type TEXT NOT NULL DEFAULT 'feature', status TEXT NOT NULL DEFAULT 'backlog', priority TEXT NOT NULL DEFAULT 'medium', target_quarter TEXT, owner TEXT, description TEXT, success_metrics TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS rd_projects (id SERIAL PRIMARY KEY, project_number TEXT NOT NULL UNIQUE, name TEXT NOT NULL, objective TEXT, status TEXT NOT NULL DEFAULT 'ideation', start_date DATE, end_date DATE, budget NUMERIC DEFAULT 0, spent NUMERIC DEFAULT 0, team_members TEXT, milestones TEXT, outcomes TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS feature_requests (id SERIAL PRIMARY KEY, request_number TEXT NOT NULL UNIQUE, title TEXT NOT NULL, description TEXT, submitted_by TEXT, source TEXT NOT NULL DEFAULT 'internal', status TEXT NOT NULL DEFAULT 'new', priority TEXT NOT NULL DEFAULT 'medium', votes INTEGER NOT NULL DEFAULT 0, linked_roadmap_item_id INTEGER, category TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS qa_test_plans (id SERIAL PRIMARY KEY, plan_number TEXT NOT NULL UNIQUE, name TEXT NOT NULL, product_feature TEXT, version TEXT, status TEXT NOT NULL DEFAULT 'draft', created_by TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS qa_test_cases (id SERIAL PRIMARY KEY, case_number TEXT NOT NULL UNIQUE, plan_id INTEGER NOT NULL, title TEXT NOT NULL, steps TEXT, expected_result TEXT, actual_result TEXT, status TEXT NOT NULL DEFAULT 'not-run', tester TEXT, run_date DATE, notes TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`,
];

async function run() {
  for (const t of tables) {
    await db.execute(sql.raw(t));
    const match = t.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
    console.log("Created: " + (match ? match[1] : "unknown"));
  }
  console.log("All tables created successfully");
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
