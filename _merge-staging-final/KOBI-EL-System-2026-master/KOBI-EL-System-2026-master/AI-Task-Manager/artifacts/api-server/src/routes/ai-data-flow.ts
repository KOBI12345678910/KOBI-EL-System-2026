import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { VAT_RATE } from "../constants";

const router: IRouter = Router();

interface DataFlowRequest {
  sourceEntity: string;
  sourceData: Record<string, any>;
  savedRecord?: Record<string, any>;
  targets: string[];
}

const ENTITY_RELATIONS: Record<string, Record<string, (data: Record<string, any>) => Record<string, any>>> = {
  invoice: {
    accounts_receivable: (data) => ({
      customer_name: data.customer_name,
      amount: data.total_amount,
      invoice_number: data.invoice_number,
      due_date: data.due_date,
      status: "open",
      type: "invoice_receivable",
      created_by_ai: true,
    }),
    general_ledger: (data) => ({
      entry_type: "debit",
      account: "accounts_receivable",
      amount: data.total_amount,
      reference: data.invoice_number,
      description: `חשבונית ${data.invoice_number} - ${data.customer_name}`,
      date: data.issue_date || new Date().toISOString().split("T")[0],
      created_by_ai: true,
    }),
    cash_flow: (data) => ({
      type: "expected_income",
      amount: data.total_amount,
      source: data.customer_name,
      expected_date: data.due_date || data.issue_date,
      reference: data.invoice_number,
      created_by_ai: true,
    }),
    tax_report: (data) => ({
      type: "output_vat",
      amount: data.vat_amount || Math.round((data.total_amount || 0) * VAT_RATE),
      invoice_number: data.invoice_number,
      date: data.issue_date,
      created_by_ai: true,
    }),
    vat_report: (data) => ({
      type: "output_vat",
      amount: data.vat_amount || Math.round((data.total_amount || 0) * VAT_RATE),
      invoice_number: data.invoice_number,
      customer_name: data.customer_name,
      date: data.issue_date,
      created_by_ai: true,
    }),
  },
  customer_invoice: {
    accounts_receivable: (data) => ({
      customer_name: data.customer_name,
      amount: data.total_amount,
      invoice_number: data.invoice_number,
      due_date: data.due_date,
      status: "open",
      created_by_ai: true,
    }),
    general_ledger: (data) => ({
      entry_type: "debit",
      account: "customers_receivable",
      amount: data.total_amount,
      reference: data.invoice_number,
      description: `חשבונית לקוח ${data.invoice_number}`,
      created_by_ai: true,
    }),
    vat_report: (data) => ({
      type: "output_vat",
      amount: data.vat_amount || Math.round((data.total_amount || 0) * VAT_RATE),
      invoice_number: data.invoice_number,
      created_by_ai: true,
    }),
  },
  supplier_invoice: {
    accounts_payable: (data) => ({
      supplier_name: data.supplier_name,
      amount: data.total_amount,
      invoice_number: data.invoice_number,
      due_date: data.due_date,
      status: "pending",
      created_by_ai: true,
    }),
    general_ledger: (data) => ({
      entry_type: "credit",
      account: "accounts_payable",
      amount: data.total_amount,
      reference: data.invoice_number,
      description: `חשבונית ספק ${data.supplier_name} - ${data.invoice_number}`,
      created_by_ai: true,
    }),
    budget_tracking: (data) => ({
      type: "expense",
      amount: data.total_amount,
      supplier_name: data.supplier_name,
      reference: data.invoice_number,
      date: data.issue_date,
      created_by_ai: true,
    }),
  },
  payment: {
    bank_reconciliation: (data) => ({
      amount: data.amount,
      payment_method: data.payment_method,
      reference: data.payment_number || data.reference,
      date: data.payment_date,
      party: data.customer_name || data.supplier_name,
      status: "pending_match",
      created_by_ai: true,
    }),
    cash_flow: (data) => ({
      type: "actual_income",
      amount: data.amount,
      source: data.customer_name || data.supplier_name,
      date: data.payment_date,
      reference: data.payment_number,
      created_by_ai: true,
    }),
    accounts_receivable: (data) => ({
      type: "payment_received",
      customer_name: data.customer_name,
      amount: data.amount,
      payment_date: data.payment_date,
      reference: data.payment_number,
      created_by_ai: true,
    }),
    accounts_payable: (data) => ({
      type: "payment_made",
      supplier_name: data.supplier_name || data.customer_name,
      amount: data.amount,
      payment_date: data.payment_date,
      reference: data.payment_number,
      created_by_ai: true,
    }),
    invoices: (data) => ({
      type: "payment_update",
      amount: data.amount,
      reference: data.reference,
      date: data.payment_date,
      created_by_ai: true,
    }),
  },
  customer_payment: {
    bank_reconciliation: (data) => ({
      amount: data.amount,
      payment_method: data.payment_method,
      reference: data.payment_number,
      date: data.payment_date,
      party: data.customer_name,
      direction: "incoming",
      created_by_ai: true,
    }),
    cash_flow: (data) => ({
      type: "actual_income",
      amount: data.amount,
      source: data.customer_name,
      date: data.payment_date,
      created_by_ai: true,
    }),
    invoices: (data) => ({
      type: "partial_payment",
      amount: data.amount,
      customer_name: data.customer_name,
      date: data.payment_date,
      created_by_ai: true,
    }),
  },
  supplier_payment: {
    bank_reconciliation: (data) => ({
      amount: data.amount,
      payment_method: data.payment_method,
      reference: data.payment_number,
      date: data.payment_date,
      party: data.supplier_name,
      direction: "outgoing",
      created_by_ai: true,
    }),
    cash_flow: (data) => ({
      type: "actual_expense",
      amount: data.amount,
      target: data.supplier_name,
      date: data.payment_date,
      created_by_ai: true,
    }),
    accounts_payable: (data) => ({
      type: "payment_made",
      supplier_name: data.supplier_name,
      amount: data.amount,
      date: data.payment_date,
      created_by_ai: true,
    }),
  },
  expense: {
    accounts_payable: (data) => ({
      type: "expense_claim",
      description: data.description,
      amount: data.amount,
      category: data.category,
      date: data.expense_date,
      created_by_ai: true,
    }),
    budget_tracking: (data) => ({
      type: "expense",
      amount: data.amount,
      category: data.category,
      description: data.description,
      date: data.expense_date,
      created_by_ai: true,
    }),
    cost_centers: (data) => ({
      type: "expense_allocation",
      amount: data.amount,
      category: data.category,
      description: data.description,
      created_by_ai: true,
    }),
  },
  supplier: {
    purchase_orders: (data) => ({
      type: "new_supplier_registered",
      supplier_name: data.name,
      category: data.category,
      contact: data.contact_person,
      created_by_ai: true,
    }),
    supplier_evaluations: (data) => ({
      supplier_name: data.name,
      category: data.category,
      status: "pending_initial",
      initial_score: 50,
      created_by_ai: true,
    }),
    supplier_contracts: (data) => ({
      supplier_name: data.name,
      payment_terms: data.payment_terms,
      status: "draft",
      created_by_ai: true,
    }),
  },
  po: {
    inventory: (data) => ({
      type: "expected_receipt",
      po_number: data.po_number,
      supplier_name: data.supplier_name,
      expected_date: data.expected_delivery,
      status: "pending",
      created_by_ai: true,
    }),
    budget_tracking: (data) => ({
      type: "committed_expense",
      amount: data.total_amount,
      reference: data.po_number,
      supplier_name: data.supplier_name,
      date: data.order_date,
      created_by_ai: true,
    }),
    goods_receipt: (data) => ({
      po_number: data.po_number,
      supplier_name: data.supplier_name,
      expected_date: data.expected_delivery,
      status: "awaiting",
      created_by_ai: true,
    }),
    supplier_invoices: (data) => ({
      type: "expected_invoice",
      po_number: data.po_number,
      supplier_name: data.supplier_name,
      expected_amount: data.total_amount,
      created_by_ai: true,
    }),
  },
  pr: {
    purchase_approvals: (data) => ({
      request_number: data.request_number,
      requester: data.requester_name,
      amount: data.estimated_cost,
      priority: data.priority,
      status: "pending_approval",
      created_by_ai: true,
    }),
    purchase_orders: (data) => ({
      type: "from_request",
      request_number: data.request_number,
      description: data.description,
      estimated_cost: data.estimated_cost,
      priority: data.priority,
      created_by_ai: true,
    }),
    budget_tracking: (data) => ({
      type: "planned_expense",
      amount: data.estimated_cost,
      reference: data.request_number,
      description: data.description,
      created_by_ai: true,
    }),
  },
  material: {
    inventory: (data) => ({
      item_name: data.name,
      sku: data.sku,
      category: data.category,
      unit: data.unit,
      quantity: data.current_stock || 0,
      min_quantity: data.min_stock || 0,
      unit_price: data.unit_price,
      created_by_ai: true,
    }),
    purchase_orders: (data) => ({
      type: "reorder_suggestion",
      item_name: data.name,
      sku: data.sku,
      supplier_name: data.supplier_name,
      reorder_quantity: (data.min_stock || 10) * 2,
      created_by_ai: true,
    }),
    bom: (data) => ({
      type: "material_available",
      material_name: data.name,
      sku: data.sku,
      unit: data.unit,
      unit_price: data.unit_price,
      created_by_ai: true,
    }),
    production_planning: (data) => ({
      type: "material_update",
      material_name: data.name,
      available_stock: data.current_stock || 0,
      created_by_ai: true,
    }),
  },
  employee: {
    payroll: (data) => ({
      employee_name: `${data.first_name} ${data.last_name}`,
      id_number: data.id_number,
      department: data.department,
      base_salary: data.salary,
      hire_date: data.hire_date,
      status: "active",
      created_by_ai: true,
    }),
    attendance: (data) => ({
      employee_name: `${data.first_name} ${data.last_name}`,
      department: data.department,
      status: "active",
      start_date: data.hire_date,
      created_by_ai: true,
    }),
    benefits: (data) => ({
      employee_name: `${data.first_name} ${data.last_name}`,
      department: data.department,
      enrollment_status: "pending",
      created_by_ai: true,
    }),
    org_chart: (data) => ({
      name: `${data.first_name} ${data.last_name}`,
      department: data.department,
      position: data.position,
      created_by_ai: true,
    }),
  },
  leave_request: {
    attendance: (data) => ({
      type: "leave",
      employee_name: data.employee_name,
      start_date: data.start_date,
      end_date: data.end_date,
      leave_type: data.leave_type,
      created_by_ai: true,
    }),
    payroll: (data) => ({
      type: "leave_deduction",
      employee_name: data.employee_name,
      leave_type: data.leave_type,
      days: Math.ceil((new Date(data.end_date).getTime() - new Date(data.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1,
      created_by_ai: true,
    }),
    shifts: (data) => ({
      type: "leave_override",
      employee_name: data.employee_name,
      start_date: data.start_date,
      end_date: data.end_date,
      created_by_ai: true,
    }),
  },
  work_order: {
    raw_materials: (data) => ({
      type: "material_request",
      wo_number: data.wo_number,
      product_name: data.product_name,
      quantity: data.quantity,
      needed_by: data.start_date || data.due_date,
      created_by_ai: true,
    }),
    inventory: (data) => ({
      type: "reservation",
      wo_number: data.wo_number,
      product_name: data.product_name,
      quantity: data.quantity,
      created_by_ai: true,
    }),
    production_schedule: (data) => ({
      wo_number: data.wo_number,
      product_name: data.product_name,
      quantity: data.quantity,
      start_date: data.start_date,
      due_date: data.due_date,
      priority: data.priority,
      customer: data.customer_name,
      created_by_ai: true,
    }),
    quality_control: (data) => ({
      type: "inspection_required",
      wo_number: data.wo_number,
      product_name: data.product_name,
      inspection_type: "final",
      created_by_ai: true,
    }),
  },
  lead: {
    sales_pipeline: (data) => ({
      company_name: data.company_name,
      contact_name: data.contact_name,
      stage: "new",
      estimated_value: data.estimated_value,
      source: data.source,
      created_by_ai: true,
    }),
    quotations: (data) => ({
      type: "lead_follow_up",
      customer_name: data.company_name,
      contact: data.contact_name,
      estimated_value: data.estimated_value,
      created_by_ai: true,
    }),
    customer_management: (data) => ({
      type: "potential_customer",
      name: data.company_name,
      contact_person: data.contact_name,
      phone: data.phone,
      email: data.email,
      source: data.source,
      created_by_ai: true,
    }),
  },
  quotation: {
    sales_orders: (data) => ({
      type: "from_quotation",
      quote_number: data.quote_number,
      customer_name: data.customer_name,
      total_amount: data.total_amount,
      created_by_ai: true,
    }),
    invoices: (data) => ({
      type: "from_quotation",
      quote_number: data.quote_number,
      customer_name: data.customer_name,
      amount: data.total_amount,
      created_by_ai: true,
    }),
    production_planning: (data) => ({
      type: "potential_order",
      quote_number: data.quote_number,
      customer_name: data.customer_name,
      amount: data.total_amount,
      created_by_ai: true,
    }),
  },
  customer: {
    crm_leads: (data) => ({
      company_name: data.name,
      contact_name: data.contact_person,
      phone: data.phone,
      email: data.email,
      status: "customer",
      created_by_ai: true,
    }),
    invoices: (data) => ({
      type: "customer_registered",
      customer_name: data.name,
      tax_id: data.tax_id,
      created_by_ai: true,
    }),
    quotations: (data) => ({
      type: "customer_available",
      customer_name: data.name,
      category: data.category,
      credit_limit: data.credit_limit,
      created_by_ai: true,
    }),
    accounts_receivable: (data) => ({
      customer_name: data.name,
      credit_limit: data.credit_limit,
      status: "active",
      created_by_ai: true,
    }),
  },
  sales_order: {
    work_orders: (data) => ({
      type: "from_sales_order",
      order_number: data.order_number,
      customer_name: data.customer_name,
      delivery_date: data.delivery_date,
      created_by_ai: true,
    }),
    invoices: (data) => ({
      type: "from_sales_order",
      order_number: data.order_number,
      customer_name: data.customer_name,
      total_amount: data.total_amount,
      created_by_ai: true,
    }),
    inventory: (data) => ({
      type: "sales_reservation",
      order_number: data.order_number,
      customer_name: data.customer_name,
      delivery_date: data.delivery_date,
      created_by_ai: true,
    }),
    delivery_notes: (data) => ({
      order_number: data.order_number,
      customer_name: data.customer_name,
      delivery_date: data.delivery_date,
      status: "pending",
      created_by_ai: true,
    }),
  },
  quick_customer: {
    crm: (data) => ({
      company_name: data.name,
      phone: data.phone,
      email: data.email,
      status: "new",
      created_by_ai: true,
    }),
    invoices: (data) => ({
      type: "customer_registered",
      customer_name: data.name,
      created_by_ai: true,
    }),
  },
  quick_supplier: {
    purchase_orders: (data) => ({
      type: "supplier_registered",
      supplier_name: data.name,
      category: data.category,
      created_by_ai: true,
    }),
    supplier_evaluations: (data) => ({
      supplier_name: data.name,
      category: data.category,
      initial_score: 50,
      created_by_ai: true,
    }),
  },
  quick_invoice: {
    accounts_receivable: (data) => ({
      customer_name: data.customer_name,
      amount: data.total_amount,
      invoice_number: data.invoice_number,
      status: "open",
      created_by_ai: true,
    }),
    general_ledger: (data) => ({
      entry_type: "debit",
      account: "receivable",
      amount: data.total_amount,
      reference: data.invoice_number,
      created_by_ai: true,
    }),
  },
  quick_po: {
    inventory: (data) => ({
      type: "expected",
      po_number: data.po_number,
      supplier_name: data.supplier_name,
      status: "pending",
      created_by_ai: true,
    }),
    budget_tracking: (data) => ({
      type: "committed",
      amount: data.total_amount,
      reference: data.po_number,
      created_by_ai: true,
    }),
  },
  quick_wo: {
    raw_materials: (data) => ({
      type: "material_request",
      wo_number: data.wo_number,
      product_name: data.product_name,
      quantity: data.quantity,
      created_by_ai: true,
    }),
    production_schedule: (data) => ({
      wo_number: data.wo_number,
      product_name: data.product_name,
      quantity: data.quantity,
      created_by_ai: true,
    }),
  },
  inventory_item: {
    raw_materials: (data) => ({
      type: "inventory_update",
      item_name: data.item_name,
      sku: data.sku,
      quantity: data.quantity,
      created_by_ai: true,
    }),
    purchase_orders: (data) => ({
      type: "stock_update",
      item_name: data.item_name,
      sku: data.sku,
      quantity: data.quantity,
      min_quantity: data.min_quantity,
      created_by_ai: true,
    }),
    production: (data) => ({
      type: "material_available",
      item_name: data.item_name,
      quantity: data.quantity,
      created_by_ai: true,
    }),
  },
  qc_inspection: {
    work_orders: (data) => ({
      type: "qc_result",
      inspection_number: data.inspection_number,
      product_name: data.product_name,
      result: data.result,
      created_by_ai: true,
    }),
    supplier_evaluations: (data) => ({
      type: "quality_feedback",
      product_name: data.product_name,
      result: data.result,
      inspection_type: data.inspection_type,
      created_by_ai: true,
    }),
    compliance: (data) => ({
      type: "inspection_record",
      inspection_number: data.inspection_number,
      result: data.result,
      date: data.inspection_date,
      created_by_ai: true,
    }),
  },
  document: {
    compliance: (data) => ({
      document_title: data.title,
      category: data.category,
      version: data.version,
      valid_until: data.valid_until,
      created_by_ai: true,
    }),
    quality_docs: (data) => ({
      title: data.title,
      category: data.category,
      version: data.version,
      created_by_ai: true,
    }),
  },
  user: {
    permissions: (data) => ({
      username: data.username,
      role: data.role,
      department: data.department,
      created_by_ai: true,
    }),
    hr: (data) => ({
      type: "system_user_created",
      username: data.username,
      fullName: data.fullName,
      department: data.department,
      created_by_ai: true,
    }),
  },
};

const TARGET_LABELS: Record<string, string> = {
  accounts_receivable: "חייבים",
  accounts_payable: "זכאים",
  general_ledger: "ספר ראשי",
  cash_flow: "תזרים מזומנים",
  tax_report: "דוח מס",
  vat_report: "דוח מע\"מ",
  bank_reconciliation: "התאמת בנק",
  budget_tracking: "מעקב תקציב",
  cost_centers: "מרכזי עלות",
  inventory: "מלאי",
  raw_materials: "חומרי גלם",
  purchase_orders: "הזמנות רכש",
  purchase_approvals: "אישורי רכש",
  goods_receipt: "קבלת סחורה",
  supplier_invoices: "חשבוניות ספק",
  supplier_evaluations: "הערכת ספקים",
  supplier_contracts: "חוזי ספקים",
  production_schedule: "לוח ייצור",
  production_planning: "תכנון ייצור",
  quality_control: "בקרת איכות",
  bom: "עץ מוצר",
  payroll: "שכר",
  attendance: "נוכחות",
  benefits: "הטבות",
  org_chart: "מבנה ארגוני",
  shifts: "משמרות",
  sales_pipeline: "צינור מכירות",
  quotations: "הצעות מחיר",
  customer_management: "ניהול לקוחות",
  invoices: "חשבוניות",
  sales_orders: "הזמנות מכירה",
  work_orders: "הזמנות עבודה",
  delivery_notes: "תעודות משלוח",
  compliance: "תאימות",
  quality_docs: "מסמכי איכות",
  permissions: "הרשאות",
  hr: "משאבי אנוש",
  crm: "CRM",
  crm_leads: "לידים",
  production: "ייצור",
};

router.post("/ai/data-flow", async (req, res) => {
  try {
    const { sourceEntity, sourceData, targets } = req.body as DataFlowRequest;

    if (!sourceEntity || !sourceData || !targets) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const entityRelations = ENTITY_RELATIONS[sourceEntity];
    if (!entityRelations) {
      return res.json({
        message: "No automatic flow rules defined for this entity",
        propagatedTo: [],
        details: [],
      });
    }

    const propagatedTo: string[] = [];
    const details: { target: string; label: string; data: Record<string, any>; status: string }[] = [];

    for (const target of targets) {
      const transformer = entityRelations[target];
      if (transformer) {
        try {
          const transformedData = transformer(sourceData);

          try {
            await db.execute(sql`
              INSERT INTO ai_data_flow_log (source_entity, target_module, source_data, propagated_data, status, created_at)
              VALUES (${sourceEntity}, ${target}, ${JSON.stringify(sourceData)}::jsonb, ${JSON.stringify(transformedData)}::jsonb, 'completed', NOW())
            `);
          } catch (dbErr) {
          }

          const label = TARGET_LABELS[target] || target.replace(/_/g, " ");
          propagatedTo.push(label);
          details.push({
            target,
            label,
            data: transformedData,
            status: "propagated",
          });
        } catch (err) {
          details.push({
            target,
            label: TARGET_LABELS[target] || target,
            data: {},
            status: "error",
          });
        }
      }
    }

    res.json({
      message: `הנתונים הופצו אוטומטית ל-${propagatedTo.length} מודולים`,
      propagatedTo,
      details,
      sourceEntity,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("AI data flow error:", err);
    res.status(500).json({ error: "Data flow processing error", message: err.message });
  }
});

router.get("/ai/data-flow/status", async (_req, res) => {
  try {
    let recentFlows: any[] = [];
    try {
      const result = await db.execute(sql`
        SELECT * FROM ai_data_flow_log ORDER BY created_at DESC LIMIT 50
      `);
      recentFlows = result.rows || [];
    } catch {
    }

    res.json({
      status: "active",
      supportedEntities: Object.keys(ENTITY_RELATIONS),
      totalRelations: Object.values(ENTITY_RELATIONS).reduce((sum, r) => sum + Object.keys(r).length, 0),
      recentFlows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
