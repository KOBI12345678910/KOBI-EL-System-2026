/**
 * KOBI-EL System 2026 — Supabase Database Types
 * Project: kobi-el-system-2026 (ponypxhushxeskxgrmha)
 * Generated: 2026-04-17
 *
 * Covers all schemas: public, governance, commercial, procurement,
 * execution, inventory, workforce, finance, comms, crm, service,
 * quality, compliance, treasury, planning, maintenance, pricing,
 * routing, documents, analytics, orchestration.
 *
 * To regenerate from live DB:
 *   supabase gen types typescript --project-id ponypxhushxeskxgrmha
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ─── Public Schema ────────────────────────────────────────────────────────────

export interface Role {
  id: number;
  name: string;
  description: string | null;
  created_at: string | null;
}

export interface AppMenu {
  id: number;
  label: string;
  route: string | null;
  icon: string | null;
  parent_id: number | null;
  order_index: number | null;
  is_visible: boolean | null;
  required_permission: string | null;
  created_at: string | null;
}

// ─── Governance Schema ────────────────────────────────────────────────────────

export interface UserProfile {
  id: number;
  public_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  status: string;
  locale: string | null;
  timezone: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GovRole {
  id: number;
  role_code: string;
  role_name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
}

export interface Permission {
  id: number;
  permission_code: string;
  permission_name: string;
  resource: string | null;
  action: string | null;
  description: string | null;
  created_at: string;
}

export interface RolePermission {
  id: number;
  role_id: number;
  permission_id: number;
  created_at: string;
}

export interface UserRole {
  id: number;
  user_id: number;
  role_id: number;
  assigned_at: string;
  assigned_by: number | null;
}

export interface AuditLog {
  id: number;
  user_id: number | null;
  event_type: string;
  entity_type: string | null;
  entity_id: number | null;
  old_data: Json | null;
  new_data: Json | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface DomainEvent {
  id: number;
  public_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Json;
  metadata: Json | null;
  version: number;
  occurred_at: string;
  processed_at: string | null;
}

export interface FeatureFlag {
  id: number;
  flag_code: string;
  flag_name: string;
  enabled: boolean;
  rollout_percent: number;
  conditions: Json | null;
  created_at: string;
  updated_at: string;
}

export interface ConfigEntry {
  id: number;
  config_key: string;
  config_value: Json;
  description: string | null;
  is_secret: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Commercial Schema ────────────────────────────────────────────────────────

export interface PipelineStage {
  id: number;
  stage_code: string;
  stage_name: string;
  stage_order: number;
  default_probability_percent: number;
  active: boolean;
  created_at: string;
}

export interface Customer {
  id: number;
  public_id: string;
  customer_number: string;
  legal_name: string;
  display_name: string;
  customer_type: string | null;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  billing_contact_name: string | null;
  billing_contact_phone: string | null;
  billing_contact_email: string | null;
  account_manager_user_id: number | null;
  status: string;
  credit_limit: number | null;
  current_balance: number;
  preferred_currency: string | null;
  risk_level: string | null;
  internal_notes: string | null;
  external_notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  deleted_at: string | null;
}

export interface Lead {
  id: number;
  public_id: string;
  lead_number: string;
  source_channel: string | null;
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  stage_id: number | null;
  lead_status: string;
  assigned_user_id: number | null;
  estimated_value: number;
  probability_percent: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Opportunity {
  id: number;
  public_id: string;
  opportunity_number: string;
  customer_id: number | null;
  lead_id: number | null;
  stage_id: number | null;
  title: string | null;
  probability_percent: number;
  expected_close_date: string | null;
  opportunity_value: number;
  state: string;
  owner_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Quote {
  id: number;
  public_id: string;
  quote_number: string;
  customer_id: number | null;
  opportunity_id: number | null;
  quote_date: string | null;
  valid_until: string | null;
  currency: string | null;
  subtotal: number;
  discount_total: number;
  vat_total: number;
  grand_total: number;
  state: string;
  title: string | null;
  notes: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
}

export interface QuoteLine {
  id: number;
  quote_id: number;
  line_number: number;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  line_subtotal: number;
  vat_percent: number;
  vat_amount: number;
  line_total: number;
  material_id: number | null;
  created_at: string;
  updated_at: string;
}

// ─── Procurement Schema ───────────────────────────────────────────────────────

export interface Supplier {
  id: number;
  public_id: string;
  supplier_number: string;
  legal_name: string;
  display_name: string | null;
  supplier_category: string | null;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  primary_contact_email: string | null;
  payment_terms: string | null;
  delivery_terms: string | null;
  preferred_currency: string | null;
  status: string;
  risk_level: string | null;
  performance_score: number | null;
  preferred_supplier: boolean;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  deleted_at: string | null;
}

export interface PurchaseOrder {
  id: number;
  public_id: string;
  po_number: string;
  supplier_id: number;
  project_id: number | null;
  po_date: string | null;
  expected_delivery_date: string | null;
  currency: string | null;
  subtotal: number;
  vat_total: number;
  grand_total: number;
  state: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
}

export interface PurchaseOrderLine {
  id: number;
  po_id: number;
  line_number: number;
  material_id: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  received_quantity: number;
  state: string;
  created_at: string;
  updated_at: string;
}

// ─── Execution Schema ─────────────────────────────────────────────────────────

export interface Project {
  id: number;
  public_id: string;
  project_number: string;
  project_name: string;
  customer_id: number;
  quote_id: number | null;
  contract_id: number | null;
  project_type: string | null;
  location_name: string | null;
  address_line_1: string | null;
  city: string | null;
  region: string | null;
  owner_user_id: number | null;
  budget_amount: number;
  actual_cost: number;
  billed_amount: number;
  collected_amount: number;
  progress_percent: number;
  priority: string | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  billable: boolean;
  state: string;
  internal_notes: string | null;
  external_notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface WorkOrder {
  id: number;
  public_id: string;
  work_order_number: string;
  project_id: number;
  title: string;
  description: string | null;
  location_name: string | null;
  required_start_date: string | null;
  required_end_date: string | null;
  actual_start_at: string | null;
  actual_end_at: string | null;
  progress_percent: number;
  quality_status: string | null;
  signature_status: string | null;
  state: string;
  priority: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface Alert {
  id: number;
  public_id: string;
  alert_number: string;
  category: string;
  severity: string;
  parent_entity_type: string | null;
  parent_entity_id: number | null;
  title: string;
  description: string | null;
  assigned_to_user_id: number | null;
  state: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectPhase {
  id: number;
  project_id: number;
  phase_code: string | null;
  phase_name: string;
  phase_order: number;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  progress_percent: number;
  state: string;
  created_at: string;
  updated_at: string;
}

// ─── Inventory Schema ─────────────────────────────────────────────────────────

export interface MaterialCategory {
  id: number;
  category_code: string;
  category_name: string;
  parent_category_id: number | null;
  active: boolean;
  created_at: string;
}

export interface Material {
  id: number;
  public_id: string;
  material_number: string;
  material_name: string;
  material_description: string | null;
  unit_of_measure: string | null;
  unit_cost: number | null;
  standard_cost: number | null;
  category_id: number | null;
  preferred_supplier_id: number | null;
  status: string;
  is_stockable: boolean;
  minimum_order_quantity: number;
  lead_time_days: number;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Warehouse {
  id: number;
  public_id: string;
  warehouse_code: string;
  warehouse_name: string;
  address_line_1: string | null;
  city: string | null;
  country: string | null;
  active: boolean;
  manager_user_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Inventory {
  id: number;
  material_id: number;
  warehouse_id: number;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  reorder_point: number;
  reorder_quantity: number;
  bin_location: string | null;
  last_counted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryReceipt {
  id: number;
  public_id: string;
  receipt_number: string;
  material_id: number;
  warehouse_id: number;
  quantity: number;
  unit_cost: number | null;
  po_line_id: number | null;
  received_by_user_id: number | null;
  received_at: string;
  notes: string | null;
  created_at: string;
}

export interface InventoryIssue {
  id: number;
  public_id: string;
  issue_number: string;
  material_id: number;
  warehouse_id: number;
  quantity: number;
  project_id: number | null;
  work_order_id: number | null;
  issued_by_user_id: number | null;
  issued_at: string;
  notes: string | null;
  created_at: string;
}

// ─── Workforce Schema ─────────────────────────────────────────────────────────

export interface Employer {
  id: number;
  public_id: string;
  employer_number: string;
  legal_name: string;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: number;
  public_id: string;
  employee_number: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  employer_id: number;
  role_title: string | null;
  department: string | null;
  employment_type: string | null;
  hourly_rate: number | null;
  salary_base: number | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  national_id: string | null;
  bank_account_reference: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  deleted_at: string | null;
}

export interface HrProfile {
  id: number;
  employee_id: number;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  address_line_1: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkforceAssignment {
  id: number;
  employee_id: number;
  project_id: number | null;
  work_order_id: number | null;
  assigned_at: string;
  released_at: string | null;
  assignment_role: string | null;
  state: string;
  assigned_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Attendance {
  id: number;
  public_id: string;
  attendance_number: string;
  employee_id: number;
  project_id: number | null;
  work_order_id: number | null;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  regular_hours: number;
  overtime_hours: number;
  source: string | null;
  approval_status: string;
  state: string;
  approved_by_user_id: number | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollRun {
  id: number;
  public_id: string;
  payroll_run_number: string;
  payroll_period_start: string;
  payroll_period_end: string;
  employer_id: number | null;
  state: string;
  calculated_at: string | null;
  approved_at: string | null;
  exported_at: string | null;
  paid_at: string | null;
  created_by: number | null;
  approved_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollEntry {
  id: number;
  payroll_run_id: number;
  employee_id: number;
  gross_pay: number;
  deductions: number;
  net_pay: number;
  pension_total: number;
  overtime_pay: number;
  attendance_hours: number;
  expense_reimbursements: number;
  state: string;
  created_at: string;
  updated_at: string;
}

export interface WageSlip {
  id: number;
  public_id: string;
  wage_slip_number: string;
  payroll_entry_id: number;
  employee_id: number;
  period_start: string;
  period_end: string;
  gross_pay: number;
  deductions: number;
  net_pay: number;
  generated_at: string | null;
  sent_at: string | null;
  state: string;
  created_at: string;
  updated_at: string;
}

// ─── Finance Schema ───────────────────────────────────────────────────────────

export interface Invoice {
  id: number;
  public_id: string;
  invoice_number: string;
  invoice_type: string;
  customer_id: number | null;
  supplier_id: number | null;
  project_id: number | null;
  po_id: number | null;
  issue_date: string | null;
  due_date: string | null;
  subtotal: number;
  discount_total: number;
  vat_total: number;
  grand_total: number;
  paid_total: number;
  balance_due: number;
  currency: string | null;
  state: string;
  sent_at: string | null;
  cancelled_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface InvoiceLine {
  id: number;
  invoice_id: number;
  line_number: number;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  line_subtotal: number;
  vat_percent: number;
  vat_amount: number;
  line_total: number;
  linked_entity_type: string | null;
  linked_entity_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Receipt {
  id: number;
  public_id: string;
  receipt_number: string;
  invoice_id: number | null;
  customer_id: number | null;
  amount: number;
  currency: string | null;
  payment_method: string | null;
  reference: string | null;
  state: string;
  received_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: number;
  public_id: string;
  payment_number: string;
  supplier_id: number | null;
  po_id: number | null;
  supplier_invoice_id: number | null;
  amount: number;
  currency: string | null;
  payment_method: string | null;
  reference: string | null;
  state: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VatRecord {
  id: number;
  invoice_id: number | null;
  vat_type: string;
  vat_percent: number;
  base_amount: number;
  vat_amount: number;
  period_start: string | null;
  period_end: string | null;
  submitted: boolean;
  created_at: string;
}

// ─── Comms Schema ─────────────────────────────────────────────────────────────

export interface Notification {
  id: number;
  public_id: string;
  user_id: number | null;
  portal_user_id: number | null;
  notification_type: string;
  title: string;
  body: string | null;
  severity: string | null;
  linked_entity_type: string | null;
  linked_entity_id: number | null;
  read_at: string | null;
  created_at: string;
}

export interface CommsThread {
  id: number;
  public_id: string;
  thread_type: string | null;
  subject: string | null;
  linked_entity_type: string | null;
  linked_entity_id: number | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

// ─── CRM Schema ───────────────────────────────────────────────────────────────

export interface CrmLead {
  id: number;
  public_id: string;
  lead_number: string;
  source_channel: string | null;
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  lead_status: string;
  score: number;
  owner_user_id: number | null;
  estimated_value: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmOpportunity {
  id: number;
  public_id: string;
  opportunity_number: string;
  lead_id: number | null;
  stage: string | null;
  probability_percent: number;
  expected_close_date: string | null;
  opportunity_value: number;
  state: string;
  created_at: string;
  updated_at: string;
}

// ─── Service Schema ───────────────────────────────────────────────────────────

export interface ServiceTicket {
  id: number;
  public_id: string;
  ticket_number: string;
  title: string;
  description: string | null;
  customer_id: number | null;
  project_id: number | null;
  severity: string | null;
  priority: string | null;
  assigned_user_id: number | null;
  state: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Treasury Schema ──────────────────────────────────────────────────────────

export interface BankAccount {
  id: number;
  account_number_masked: string | null;
  bank_name: string | null;
  branch_name: string | null;
  currency: string | null;
  account_type: string | null;
  current_balance: number;
  active: boolean;
  owner_company_name: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Maintenance Schema ───────────────────────────────────────────────────────

export interface Asset {
  id: number;
  public_id: string;
  asset_number: string;
  asset_name: string;
  asset_type: string | null;
  serial_number: string | null;
  location_name: string | null;
  operational_status: string;
  criticality: string | null;
  purchase_date: string | null;
  warranty_expiry: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Quality Schema ───────────────────────────────────────────────────────────

export interface InspectionPlan {
  id: number;
  plan_code: string;
  plan_name: string;
  scope_type: string | null;
  checklist_payload: Json | null;
  active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

// ─── Compliance Schema ────────────────────────────────────────────────────────

export interface CompliancePolicy {
  id: number;
  policy_code: string;
  policy_name: string;
  category: string | null;
  policy_text: string | null;
  active: boolean;
  effective_from: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

// ─── Utility Types ────────────────────────────────────────────────────────────

/** Generic paginated response wrapper */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Common entity state values used across schemas */
export type EntityState =
  | 'Draft'
  | 'Open'
  | 'In Progress'
  | 'Active'
  | 'Completed'
  | 'Cancelled'
  | 'Paid'
  | 'Approved'
  | 'Sent'
  | 'Planning';

/** Common severity levels */
export type Severity = 'low' | 'medium' | 'high' | 'critical';

/** Common employment types */
export type EmploymentType = 'full_time' | 'part_time' | 'contractor' | 'intern';

// ─── Supabase Database type (public schema — PostgREST accessible) ────────────

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      app_menu: {
        Row: AppMenu;
        Insert: Omit<AppMenu, 'id' | 'created_at'> & { id?: number; created_at?: string | null };
        Update: Partial<Omit<AppMenu, 'id'>>;
        Relationships: [
          {
            foreignKeyName: 'app_menu_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'app_menu';
            referencedColumns: ['id'];
          }
        ];
      };
      roles: {
        Row: Role;
        Insert: Omit<Role, 'id' | 'created_at'> & { id?: number; created_at?: string | null };
        Update: Partial<Omit<Role, 'id'>>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<T extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][T]['Update'];

export const Constants = {
  public: { Enums: {} },
} as const;
