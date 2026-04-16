-- ============================================================
-- FILE: supabase/migrations/016_seed_base_roles_permissions.sql
-- ============================================================

insert into governance.roles (role_code, role_name, description, is_system_role)
values
  ('admin', 'Admin', 'System administrator', true),
  ('executive', 'Executive', 'Executive management', true),
  ('sales', 'Sales', 'Sales operator', true),
  ('sales_manager', 'Sales Manager', 'Sales manager', true),
  ('procurement', 'Procurement', 'Procurement operator', true),
  ('procurement_manager', 'Procurement Manager', 'Procurement manager', true),
  ('ops', 'Operations', 'Operations operator', true),
  ('ops_manager', 'Operations Manager', 'Operations manager', true),
  ('finance', 'Finance', 'Finance operator', true),
  ('finance_manager', 'Finance Manager', 'Finance manager', true),
  ('hr', 'HR', 'HR operator', true),
  ('hr_manager', 'HR Manager', 'HR manager', true),
  ('payroll', 'Payroll', 'Payroll operator', true),
  ('payroll_manager', 'Payroll Manager', 'Payroll manager', true),
  ('inventory_manager', 'Inventory Manager', 'Inventory manager', true),
  ('ai_analyst', 'AI Analyst', 'AI analyst', true),
  ('platform_admin', 'Platform Admin', 'Platform admin', true)
on conflict (role_code) do nothing;

insert into governance.permissions (permission_code, permission_name, domain, action, entity_type, description)
values
  ('customers.read', 'Read Customers', 'commercial', 'read', 'Customer', 'Read customers'),
  ('customers.create', 'Create Customers', 'commercial', 'create', 'Customer', 'Create customers'),
  ('customers.update', 'Update Customers', 'commercial', 'update', 'Customer', 'Update customers'),

  ('quotes.read', 'Read Quotes', 'commercial', 'read', 'Quote', 'Read quotes'),
  ('quotes.create', 'Create Quotes', 'commercial', 'create', 'Quote', 'Create quotes'),
  ('quotes.update', 'Update Quotes', 'commercial', 'update', 'Quote', 'Update quotes'),
  ('quotes.send', 'Send Quotes', 'commercial', 'send', 'Quote', 'Send quotes'),
  ('quotes.approve', 'Approve Quotes', 'commercial', 'approve', 'Quote', 'Approve quotes'),
  ('quotes.reject', 'Reject Quotes', 'commercial', 'reject', 'Quote', 'Reject quotes'),
  ('quotes.convert_to_project', 'Convert Quote To Project', 'commercial', 'convert', 'Quote', 'Convert quote to project'),

  ('suppliers.read', 'Read Suppliers', 'procurement', 'read', 'Supplier', 'Read suppliers'),
  ('suppliers.create', 'Create Suppliers', 'procurement', 'create', 'Supplier', 'Create suppliers'),
  ('suppliers.update', 'Update Suppliers', 'procurement', 'update', 'Supplier', 'Update suppliers'),
  ('suppliers.block', 'Block Suppliers', 'procurement', 'block', 'Supplier', 'Block suppliers'),

  ('rfq.read', 'Read RFQ', 'procurement', 'read', 'RFQ', 'Read RFQs'),
  ('rfq.create', 'Create RFQ', 'procurement', 'create', 'RFQ', 'Create RFQs'),
  ('rfq.send', 'Send RFQ', 'procurement', 'send', 'RFQ', 'Send RFQs'),
  ('rfq.approve', 'Approve RFQ', 'procurement', 'approve', 'RFQ', 'Approve RFQs'),
  ('rfq.reject', 'Reject RFQ', 'procurement', 'reject', 'RFQ', 'Reject RFQs'),
  ('rfq.convert_to_po', 'Convert RFQ To PO', 'procurement', 'convert', 'RFQ', 'Convert RFQ to PO'),

  ('po.read', 'Read PO', 'procurement', 'read', 'PurchaseOrder', 'Read purchase orders'),
  ('po.create', 'Create PO', 'procurement', 'create', 'PurchaseOrder', 'Create purchase orders'),
  ('po.request_approval', 'Request PO Approval', 'procurement', 'request_approval', 'PurchaseOrder', 'Request PO approval'),
  ('po.approve', 'Approve PO', 'procurement', 'approve', 'PurchaseOrder', 'Approve PO'),
  ('po.send', 'Send PO', 'procurement', 'send', 'PurchaseOrder', 'Send PO'),
  ('po.receive', 'Receive PO', 'procurement', 'receive', 'PurchaseOrder', 'Receive PO'),

  ('projects.read', 'Read Projects', 'execution', 'read', 'Project', 'Read projects'),
  ('projects.create', 'Create Projects', 'execution', 'create', 'Project', 'Create projects'),
  ('projects.update', 'Update Projects', 'execution', 'update', 'Project', 'Update projects'),
  ('projects.change_state', 'Change Project State', 'execution', 'change_state', 'Project', 'Change project state'),
  ('projects.create_work_order', 'Create Work Order', 'execution', 'create_work_order', 'Project', 'Create work orders'),
  ('projects.request_materials', 'Request Materials', 'execution', 'request_materials', 'Project', 'Request materials'),
  ('projects.create_invoice', 'Create Invoice From Project', 'execution', 'create_invoice', 'Project', 'Create invoice from project'),

  ('workorders.read', 'Read Work Orders', 'execution', 'read', 'WorkOrder', 'Read work orders'),
  ('workorders.create', 'Create Work Orders', 'execution', 'create', 'WorkOrder', 'Create work orders'),
  ('workorders.assign', 'Assign Work Orders', 'execution', 'assign', 'WorkOrder', 'Assign work orders'),
  ('workorders.start', 'Start Work Orders', 'execution', 'start', 'WorkOrder', 'Start work orders'),
  ('workorders.update', 'Update Work Orders', 'execution', 'update', 'WorkOrder', 'Update work orders'),
  ('workorders.complete', 'Complete Work Orders', 'execution', 'complete', 'WorkOrder', 'Complete work orders'),

  ('invoices.read', 'Read Invoices', 'finance', 'read', 'Invoice', 'Read invoices'),
  ('invoices.create', 'Create Invoices', 'finance', 'create', 'Invoice', 'Create invoices'),
  ('invoices.issue', 'Issue Invoices', 'finance', 'issue', 'Invoice', 'Issue invoices'),

  ('payments.read', 'Read Payments', 'finance', 'read', 'Payment', 'Read payments'),
  ('payments.create', 'Create Payments', 'finance', 'create', 'Payment', 'Create payments'),
  ('payments.update', 'Update Payments', 'finance', 'update', 'Payment', 'Update payments'),
  ('payments.reconcile', 'Reconcile Payments', 'finance', 'reconcile', 'Payment', 'Reconcile payments'),

  ('employees.read', 'Read Employees', 'workforce', 'read', 'Employee', 'Read employees'),
  ('employees.create', 'Create Employees', 'workforce', 'create', 'Employee', 'Create employees'),
  ('employees.update', 'Update Employees', 'workforce', 'update', 'Employee', 'Update employees'),

  ('attendance.create', 'Create Attendance', 'workforce', 'create', 'Attendance', 'Create attendance'),
  ('attendance.update', 'Update Attendance', 'workforce', 'update', 'Attendance', 'Update attendance'),
  ('attendance.approve', 'Approve Attendance', 'workforce', 'approve', 'Attendance', 'Approve attendance'),

  ('payroll.create', 'Create Payroll', 'workforce', 'create', 'PayrollRun', 'Create payroll'),
  ('payroll.approve', 'Approve Payroll', 'workforce', 'approve', 'PayrollRun', 'Approve payroll'),
  ('payroll.export', 'Export Payroll', 'workforce', 'export', 'PayrollRun', 'Export payroll'),

  ('documents.create', 'Create Documents', 'docs', 'create', 'Document', 'Upload documents'),
  ('documents.update', 'Update Documents', 'docs', 'update', 'Document', 'Update documents'),
  ('documents.read', 'Read Documents', 'docs', 'read', 'Document', 'Read documents'),

  ('ai.read', 'Read AI', 'intelligence', 'read', 'AIInsight', 'Read AI outputs'),
  ('ai.acknowledge', 'Acknowledge AI', 'intelligence', 'acknowledge', 'AIInsight', 'Acknowledge AI insight'),
  ('ai.create_task', 'Create Task From AI', 'intelligence', 'create_task', 'AIInsight', 'Create task from AI'),
  ('ai.convert_anomaly_to_alert', 'Convert Anomaly To Alert', 'intelligence', 'convert', 'AnomalyCase', 'Convert anomaly to alert')
on conflict (permission_code) do nothing;
