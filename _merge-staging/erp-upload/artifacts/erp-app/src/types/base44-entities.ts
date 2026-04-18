/**
 * Base44 Entity Type Definitions
 *
 * Type stubs for all entities migrated from the Base44 ERP project.
 * These types allow migrated components to be type-safe without
 * requiring the full Base44 SDK.
 */

export interface Lead {
  id: number | string;
  full_name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
  status?: string;
  stage?: string;
  source?: string;
  assigned_to?: string;
  score?: number;
  notes?: string;
  tags?: string[];
  value?: number;
  currency?: string;
  probability?: number;
  expected_close_date?: string;
  last_contact_date?: string;
  next_action?: string;
  next_action_date?: string;
  created_date?: string;
  updated_date?: string;
  [key: string]: unknown;
}

export interface LeadEvent {
  id: number | string;
  lead_id: number | string;
  type?: string;
  description?: string;
  created_by?: string;
  created_date?: string;
  [key: string]: unknown;
}

export interface LeadActivity {
  id: number | string;
  lead_id: number | string;
  type?: string;
  subject?: string;
  description?: string;
  date?: string;
  status?: string;
  [key: string]: unknown;
}

export interface LeadNote {
  id: number | string;
  lead_id: number | string;
  content?: string;
  created_by?: string;
  created_date?: string;
  [key: string]: unknown;
}

export interface LeadTask {
  id: number | string;
  lead_id: number | string;
  title?: string;
  description?: string;
  due_date?: string;
  status?: string;
  priority?: string;
  assigned_to?: string;
  [key: string]: unknown;
}

export interface LeadDocument {
  id: number | string;
  lead_id: number | string;
  name?: string;
  url?: string;
  type?: string;
  size?: number;
  uploaded_by?: string;
  created_date?: string;
  [key: string]: unknown;
}

export interface LeadScore {
  id: number | string;
  lead_id: number | string;
  score?: number;
  factors?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LeadScoringRule {
  id: number | string;
  name?: string;
  field?: string;
  condition?: string;
  value?: string;
  points?: number;
  active?: boolean;
  [key: string]: unknown;
}

export interface LeadSource {
  id: number | string;
  name?: string;
  type?: string;
  active?: boolean;
  [key: string]: unknown;
}

export interface LeadRoutingRule {
  id: number | string;
  name?: string;
  conditions?: Record<string, unknown>;
  target_user?: string;
  active?: boolean;
  [key: string]: unknown;
}

export interface Customer {
  id: number | string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  city?: string;
  status?: string;
  type?: string;
  notes?: string;
  tags?: string[];
  created_date?: string;
  [key: string]: unknown;
}

export interface Contact {
  id: number | string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company_id?: number | string;
  position?: string;
  [key: string]: unknown;
}

export interface Company {
  id: number | string;
  name?: string;
  domain?: string;
  industry?: string;
  size?: string;
  address?: string;
  phone?: string;
  website?: string;
  [key: string]: unknown;
}

export interface Deal {
  id: number | string;
  title?: string;
  value?: number;
  currency?: string;
  stage?: string;
  probability?: number;
  expected_close_date?: string;
  customer_id?: number | string;
  lead_id?: number | string;
  assigned_to?: string;
  status?: string;
  notes?: string;
  created_date?: string;
  [key: string]: unknown;
}

export interface Opportunity {
  id: number | string;
  name?: string;
  value?: number;
  stage?: string;
  probability?: number;
  close_date?: string;
  account_id?: number | string;
  [key: string]: unknown;
}

export interface Task {
  id: number | string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  due_date?: string;
  assigned_to?: string;
  related_to?: string;
  related_id?: number | string;
  [key: string]: unknown;
}

export interface Activity {
  id: number | string;
  type?: string;
  subject?: string;
  description?: string;
  date?: string;
  status?: string;
  related_to?: string;
  related_id?: number | string;
  [key: string]: unknown;
}

export interface Meeting {
  id: number | string;
  title?: string;
  description?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  attendees?: string[];
  status?: string;
  [key: string]: unknown;
}

export interface Invoice {
  id: number | string;
  number?: string;
  customer_id?: number | string;
  amount?: number;
  tax?: number;
  total?: number;
  status?: string;
  due_date?: string;
  issue_date?: string;
  items?: unknown[];
  [key: string]: unknown;
}

export interface Payment {
  id: number | string;
  invoice_id?: number | string;
  amount?: number;
  method?: string;
  date?: string;
  status?: string;
  reference?: string;
  [key: string]: unknown;
}

export interface Quote {
  id: number | string;
  number?: string;
  customer_id?: number | string;
  lead_id?: number | string;
  amount?: number;
  status?: string;
  valid_until?: string;
  items?: unknown[];
  [key: string]: unknown;
}

export interface Order {
  id: number | string;
  number?: string;
  customer_id?: number | string;
  status?: string;
  total?: number;
  items?: unknown[];
  delivery_date?: string;
  [key: string]: unknown;
}

export interface Product {
  id: number | string;
  name?: string;
  sku?: string;
  description?: string;
  price?: number;
  cost?: number;
  category?: string;
  stock_quantity?: number;
  unit?: string;
  active?: boolean;
  [key: string]: unknown;
}

export interface Supplier {
  id: number | string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  category?: string;
  rating?: number;
  status?: string;
  [key: string]: unknown;
}

export interface Employee {
  id: number | string;
  name?: string;
  email?: string;
  phone?: string;
  department?: string;
  position?: string;
  hire_date?: string;
  status?: string;
  manager_id?: number | string;
  [key: string]: unknown;
}

export interface Department {
  id: number | string;
  name?: string;
  description?: string;
  manager_id?: number | string;
  parent_id?: number | string;
  [key: string]: unknown;
}

export interface Project {
  id: number | string;
  name?: string;
  description?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  budget?: number;
  manager_id?: number | string;
  [key: string]: unknown;
}

export interface Workflow {
  id: number | string;
  name?: string;
  description?: string;
  trigger_type?: string;
  trigger_entity?: string;
  conditions?: unknown[];
  actions?: unknown[];
  active?: boolean;
  [key: string]: unknown;
}

export interface Automation {
  id: number | string;
  name?: string;
  description?: string;
  trigger?: string;
  conditions?: unknown[];
  actions?: unknown[];
  active?: boolean;
  [key: string]: unknown;
}

export interface Alert {
  id: number | string;
  title?: string;
  message?: string;
  severity?: string;
  type?: string;
  status?: string;
  entity_type?: string;
  entity_id?: number | string;
  [key: string]: unknown;
}

export interface AlertRule {
  id: number | string;
  name?: string;
  conditions?: unknown[];
  actions?: unknown[];
  active?: boolean;
  [key: string]: unknown;
}

export interface Notification {
  id: number | string;
  title?: string;
  message?: string;
  type?: string;
  read?: boolean;
  user_id?: number | string;
  created_date?: string;
  [key: string]: unknown;
}

export interface Report {
  id: number | string;
  name?: string;
  type?: string;
  entity?: string;
  filters?: Record<string, unknown>;
  columns?: string[];
  [key: string]: unknown;
}

export interface Dashboard {
  id: number | string;
  name?: string;
  layout?: unknown[];
  widgets?: unknown[];
  [key: string]: unknown;
}

export interface Role {
  id: number | string;
  name?: string;
  permissions?: string[];
  description?: string;
  [key: string]: unknown;
}

export interface User {
  id: number | string;
  name?: string;
  email?: string;
  role?: string;
  department?: string;
  avatar_url?: string;
  status?: string;
  [key: string]: unknown;
}

export interface Campaign {
  id: number | string;
  name?: string;
  type?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  budget?: number;
  [key: string]: unknown;
}

export interface Contract {
  id: number | string;
  title?: string;
  customer_id?: number | string;
  value?: number;
  start_date?: string;
  end_date?: string;
  status?: string;
  [key: string]: unknown;
}

export interface Document {
  id: number | string;
  name?: string;
  type?: string;
  url?: string;
  size?: number;
  folder_id?: number | string;
  [key: string]: unknown;
}

export interface ProductionOrder {
  id: number | string;
  number?: string;
  product_id?: number | string;
  quantity?: number;
  status?: string;
  start_date?: string;
  end_date?: string;
  [key: string]: unknown;
}

export interface BOM {
  id: number | string;
  name?: string;
  product_id?: number | string;
  items?: unknown[];
  version?: string;
  status?: string;
  [key: string]: unknown;
}

export interface PurchaseOrder {
  id: number | string;
  number?: string;
  supplier_id?: number | string;
  items?: unknown[];
  total?: number;
  status?: string;
  [key: string]: unknown;
}

export interface Attendance {
  id: number | string;
  employee_id?: number | string;
  date?: string;
  check_in?: string;
  check_out?: string;
  status?: string;
  [key: string]: unknown;
}

export interface TimeEntry {
  id: number | string;
  employee_id?: number | string;
  project_id?: number | string;
  task_id?: number | string;
  date?: string;
  hours?: number;
  description?: string;
  [key: string]: unknown;
}

export interface SupportTicket {
  id: number | string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  customer_id?: number | string;
  assigned_to?: string;
  [key: string]: unknown;
}

export interface KnowledgeBase {
  id: number | string;
  title?: string;
  content?: string;
  category?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface EmailTemplate {
  id: number | string;
  name?: string;
  subject?: string;
  body?: string;
  type?: string;
  [key: string]: unknown;
}

export interface ChatMessage {
  id: number | string;
  sender_id?: number | string;
  receiver_id?: number | string;
  content?: string;
  type?: string;
  read?: boolean;
  created_date?: string;
  [key: string]: unknown;
}

// Generic entity type for unknown/dynamic entities
export interface GenericEntity {
  id: number | string;
  [key: string]: unknown;
}
