import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Plus, X, Save, Loader2, Sparkles, ChevronDown } from "lucide-react";
import { authFetch } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

const API = "/api";

interface QuickAddField {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "textarea" | "email" | "tel";
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

interface QuickAddEntity {
  id: string;
  label: string;
  icon: string;
  apiEndpoint: string;
  fields: QuickAddField[];
  aiFlowTargets?: string[];
}

const ROUTE_ENTITIES: Record<string, QuickAddEntity[]> = {
  "/finance": [
    {
      id: "payment", label: "תשלום חדש", icon: "💰",
      apiEndpoint: "/finance/payments",
      fields: [
        { key: "type", label: "סוג", type: "select", required: true, options: ["income", "expense", "transfer"] },
        { key: "amount", label: "סכום", type: "number", required: true },
        { key: "method", label: "אמצעי תשלום", type: "select", options: ["cash", "check", "bank_transfer", "credit_card"] },
        { key: "date", label: "תאריך", type: "date", required: true },
        { key: "from_entity", label: "מאת", type: "text" },
        { key: "to_entity", label: "אל", type: "text" },
        { key: "reference_number", label: "אסמכתא", type: "text" },
        { key: "description", label: "תיאור", type: "textarea" },
      ],
      aiFlowTargets: ["bank_reconciliation", "cash_flow", "accounts_receivable"],
    },
    {
      id: "expense", label: "הוצאה חדשה", icon: "📋",
      apiEndpoint: "/finance/expenses",
      fields: [
        { key: "description", label: "תיאור", type: "text", required: true },
        { key: "amount", label: "סכום", type: "number", required: true },
        { key: "category", label: "קטגוריה", type: "select", options: ["travel", "office", "meals", "transport", "equipment", "raw_materials", "services", "other"] },
        { key: "expense_date", label: "תאריך הוצאה", type: "date", required: true },
        { key: "vendor_name", label: "ספק/חנות", type: "text" },
        { key: "receipt_number", label: "מספר קבלה", type: "text" },
        { key: "payment_method", label: "אמצעי תשלום", type: "select", options: ["cash", "check", "bank_transfer", "credit_card"] },
        { key: "department", label: "מחלקה", type: "text" },
        { key: "notes", label: "הערות", type: "textarea" },
      ],
      aiFlowTargets: ["accounts_payable", "budget_tracking", "cost_centers"],
    },
    {
      id: "accounts_receivable", label: "חוב לקוח חדש", icon: "📄",
      apiEndpoint: "/finance/accounts_receivable",
      fields: [
        { key: "customer_name", label: "שם לקוח", type: "text", required: true },
        { key: "invoice_number", label: "מספר חשבונית", type: "text", required: true },
        { key: "amount", label: "סכום", type: "number", required: true },
        { key: "due_date", label: "תאריך לתשלום", type: "date" },
        { key: "invoice_date", label: "תאריך חשבונית", type: "date" },
        { key: "status", label: "סטטוס", type: "select", options: ["open", "partial", "paid", "overdue", "cancelled"] },
        { key: "payment_terms", label: "תנאי תשלום", type: "text" },
        { key: "notes", label: "הערות", type: "textarea" },
      ],
      aiFlowTargets: ["general_ledger", "cash_flow", "tax_report"],
    },
    {
      id: "accounts_payable", label: "חוב ספק חדש", icon: "📑",
      apiEndpoint: "/finance/accounts_payable",
      fields: [
        { key: "supplier_name", label: "שם ספק", type: "text", required: true },
        { key: "invoice_number", label: "מספר חשבונית", type: "text", required: true },
        { key: "amount", label: "סכום", type: "number", required: true },
        { key: "due_date", label: "תאריך לתשלום", type: "date" },
        { key: "invoice_date", label: "תאריך חשבונית", type: "date" },
        { key: "status", label: "סטטוס", type: "select", options: ["pending", "partial", "paid", "overdue"] },
        { key: "payment_terms", label: "תנאי תשלום", type: "text" },
        { key: "notes", label: "הערות", type: "textarea" },
      ],
      aiFlowTargets: ["general_ledger", "budget_tracking"],
    },
    {
      id: "financial_transaction", label: "תנועה כספית", icon: "🔄",
      apiEndpoint: "/finance/financial_transactions",
      fields: [
        { key: "type", label: "סוג", type: "select", required: true, options: ["debit", "credit", "transfer", "adjustment"] },
        { key: "amount", label: "סכום", type: "number", required: true },
        { key: "description", label: "תיאור", type: "text", required: true },
        { key: "date", label: "תאריך", type: "date", required: true },
        { key: "category", label: "קטגוריה", type: "text" },
        { key: "reference_number", label: "מספר אסמכתא", type: "text" },
        { key: "from_account", label: "מחשבון", type: "text" },
        { key: "to_account", label: "לחשבון", type: "text" },
      ],
      aiFlowTargets: ["general_ledger", "cash_flow"],
    },
  ],
  "/finance/customers": [
    {
      id: "customer_invoice", label: "חשבונית לקוח", icon: "📄",
      apiEndpoint: "/finance/accounts_receivable",
      fields: [
        { key: "customer_name", label: "שם לקוח", type: "text", required: true },
        { key: "invoice_number", label: "מספר חשבונית", type: "text", required: true },
        { key: "amount", label: "סכום", type: "number", required: true },
        { key: "due_date", label: "תאריך לתשלום", type: "date" },
        { key: "invoice_date", label: "תאריך", type: "date" },
        { key: "status", label: "סטטוס", type: "select", options: ["open", "partial", "paid", "overdue"] },
      ],
      aiFlowTargets: ["general_ledger", "cash_flow", "vat_report"],
    },
    {
      id: "customer_payment", label: "תשלום מלקוח", icon: "💳",
      apiEndpoint: "/finance/payments",
      fields: [
        { key: "type", label: "סוג", type: "select", required: true, options: ["income"] },
        { key: "amount", label: "סכום", type: "number", required: true },
        { key: "method", label: "אמצעי תשלום", type: "select", options: ["cash", "check", "bank_transfer", "credit_card"] },
        { key: "date", label: "תאריך", type: "date", required: true },
        { key: "from_entity", label: "שם לקוח", type: "text", required: true },
        { key: "reference_number", label: "אסמכתא", type: "text" },
      ],
      aiFlowTargets: ["bank_reconciliation", "cash_flow", "accounts_receivable"],
    },
  ],
  "/finance/suppliers": [
    {
      id: "supplier_invoice", label: "חשבונית ספק", icon: "📄",
      apiEndpoint: "/finance/accounts_payable",
      fields: [
        { key: "supplier_name", label: "שם ספק", type: "text", required: true },
        { key: "invoice_number", label: "מספר חשבונית", type: "text", required: true },
        { key: "amount", label: "סכום", type: "number", required: true },
        { key: "due_date", label: "תאריך לתשלום", type: "date" },
        { key: "invoice_date", label: "תאריך", type: "date" },
        { key: "status", label: "סטטוס", type: "select", options: ["pending", "partial", "paid"] },
      ],
      aiFlowTargets: ["general_ledger", "budget_tracking"],
    },
    {
      id: "supplier_payment", label: "תשלום לספק", icon: "💳",
      apiEndpoint: "/finance/payments",
      fields: [
        { key: "type", label: "סוג", type: "select", required: true, options: ["expense"] },
        { key: "amount", label: "סכום", type: "number", required: true },
        { key: "method", label: "אמצעי תשלום", type: "select", options: ["cash", "check", "bank_transfer", "credit_card"] },
        { key: "date", label: "תאריך", type: "date", required: true },
        { key: "to_entity", label: "שם ספק", type: "text", required: true },
        { key: "reference_number", label: "אסמכתא", type: "text" },
      ],
      aiFlowTargets: ["bank_reconciliation", "cash_flow", "accounts_payable"],
    },
  ],
  "/suppliers": [
    {
      id: "supplier", label: "ספק חדש", icon: "🏭",
      apiEndpoint: "/suppliers",
      fields: [
        { key: "supplierNumber", label: "מספר ספק", type: "text", required: true, placeholder: "SUP-001" },
        { key: "supplierName", label: "שם ספק", type: "text", required: true },
        { key: "contactPerson", label: "איש קשר", type: "text" },
        { key: "phone", label: "טלפון", type: "tel" },
        { key: "email", label: "אימייל", type: "email" },
        { key: "address", label: "כתובת", type: "text" },
        { key: "taxId", label: "ח.פ./ע.מ.", type: "text" },
        { key: "category", label: "קטגוריה", type: "select", options: ["metal", "aluminum", "glass", "stainless_steel", "raw_materials", "services", "equipment", "other"] },
        { key: "paymentTerms", label: "תנאי תשלום", type: "select", options: ["immediate", "net30", "net60", "net90"] },
        { key: "notes", label: "הערות", type: "textarea" },
      ],
      aiFlowTargets: ["purchase_orders", "supplier_evaluations", "supplier_contracts"],
    },
  ],
  "/purchase-orders": [
    {
      id: "po", label: "הזמנת רכש חדשה", icon: "📦",
      apiEndpoint: "/purchase-orders",
      fields: [
        { key: "poNumber", label: "מספר הזמנה", type: "text", required: true, placeholder: "PO-001" },
        { key: "supplierName", label: "ספק", type: "text", required: true },
        { key: "totalAmount", label: "סכום כולל", type: "number", required: true },
        { key: "orderDate", label: "תאריך הזמנה", type: "date", required: true },
        { key: "expectedDelivery", label: "תאריך אספקה צפוי", type: "date" },
        { key: "priority", label: "עדיפות", type: "select", options: ["low", "medium", "high", "urgent"] },
        { key: "notes", label: "הערות", type: "textarea" },
      ],
      aiFlowTargets: ["inventory", "budget_tracking", "goods_receipt"],
    },
  ],
  "/purchase-requests": [
    {
      id: "pr", label: "בקשת רכש חדשה", icon: "📋",
      apiEndpoint: "/purchase-requests",
      fields: [
        { key: "requestNumber", label: "מספר בקשה", type: "text", required: true },
        { key: "requesterName", label: "מבקש", type: "text", required: true },
        { key: "description", label: "תיאור", type: "text", required: true },
        { key: "estimatedCost", label: "עלות משוערת", type: "number" },
        { key: "priority", label: "עדיפות", type: "select", options: ["low", "medium", "high", "urgent"] },
        { key: "neededBy", label: "דרוש עד", type: "date" },
        { key: "justification", label: "הצדקה", type: "textarea" },
      ],
      aiFlowTargets: ["purchase_approvals", "purchase_orders", "budget_tracking"],
    },
  ],
  "/raw-materials": [
    {
      id: "material", label: "חומר גלם חדש", icon: "🔩",
      apiEndpoint: "/raw-materials",
      fields: [
        { key: "name", label: "שם חומר", type: "text", required: true },
        { key: "sku", label: "מק\"ט", type: "text", required: true },
        { key: "category", label: "קטגוריה", type: "select", options: ["metal", "aluminum", "stainless_steel", "glass", "fasteners", "coatings", "profiles", "other"] },
        { key: "unit", label: "יחידת מידה", type: "select", options: ["kg", "meter", "unit", "liter", "sqm", "sheet"] },
        { key: "unitPrice", label: "מחיר יחידה", type: "number" },
        { key: "minStock", label: "מלאי מינימום", type: "number" },
        { key: "currentStock", label: "מלאי נוכחי", type: "number" },
      ],
      aiFlowTargets: ["inventory", "purchase_orders", "production_planning"],
    },
  ],
  "/hr": [
    {
      id: "employee", label: "עובד חדש", icon: "👤",
      apiEndpoint: "/hr/employees",
      fields: [
        { key: "firstName", label: "שם פרטי", type: "text", required: true },
        { key: "lastName", label: "שם משפחה", type: "text", required: true },
        { key: "idNumber", label: "תעודת זהות", type: "text", required: true },
        { key: "email", label: "אימייל", type: "email" },
        { key: "phone", label: "טלפון", type: "tel" },
        { key: "department", label: "מחלקה", type: "select", options: ["production", "sales", "finance", "hr", "logistics", "management", "engineering", "quality"] },
        { key: "position", label: "תפקיד", type: "text" },
        { key: "hireDate", label: "תאריך גיוס", type: "date", required: true },
        { key: "baseSalary", label: "שכר בסיס", type: "number" },
      ],
      aiFlowTargets: ["payroll", "attendance", "benefits", "org_chart"],
    },
  ],
  "/production": [
    {
      id: "work_order", label: "הזמנת עבודה חדשה", icon: "🔧",
      apiEndpoint: "/production/work-orders",
      fields: [
        { key: "woNumber", label: "מספר הזמנה", type: "text", required: true },
        { key: "productName", label: "שם מוצר", type: "text", required: true },
        { key: "quantity", label: "כמות", type: "number", required: true },
        { key: "priority", label: "עדיפות", type: "select", options: ["low", "medium", "high", "urgent"] },
        { key: "startDate", label: "תאריך התחלה", type: "date" },
        { key: "dueDate", label: "תאריך יעד", type: "date", required: true },
        { key: "customerName", label: "לקוח", type: "text" },
        { key: "notes", label: "הערות", type: "textarea" },
      ],
      aiFlowTargets: ["raw_materials", "inventory", "production_schedule", "quality_control"],
    },
  ],
  "/crm": [
    {
      id: "lead", label: "ליד חדש", icon: "🎯",
      apiEndpoint: "/finance/projects",
      fields: [
        { key: "name", label: "שם חברה/לקוח", type: "text", required: true },
        { key: "client_name", label: "איש קשר", type: "text" },
        { key: "description", label: "פרטים", type: "textarea" },
        { key: "estimated_revenue", label: "ערך מוערך", type: "number" },
        { key: "status", label: "סטטוס", type: "select", options: ["new", "contacted", "qualified", "negotiating", "won", "lost"] },
        { key: "category", label: "מקור", type: "select", options: ["website", "referral", "cold_call", "exhibition", "social_media", "other"] },
        { key: "priority", label: "עדיפות", type: "select", options: ["low", "medium", "high"] },
      ],
      aiFlowTargets: ["sales_pipeline", "quotations"],
    },
  ],
  "/sales": [
    {
      id: "project", label: "פרויקט/הזמנה חדשה", icon: "📝",
      apiEndpoint: "/finance/projects",
      fields: [
        { key: "name", label: "שם פרויקט", type: "text", required: true },
        { key: "client_name", label: "לקוח", type: "text", required: true },
        { key: "budget", label: "תקציב", type: "number" },
        { key: "start_date", label: "תאריך התחלה", type: "date" },
        { key: "end_date", label: "תאריך סיום", type: "date" },
        { key: "status", label: "סטטוס", type: "select", options: ["draft", "active", "completed", "cancelled"] },
        { key: "priority", label: "עדיפות", type: "select", options: ["low", "medium", "high"] },
        { key: "notes", label: "הערות", type: "textarea" },
      ],
      aiFlowTargets: ["work_orders", "invoices", "inventory"],
    },
  ],
  "/documents": [
    {
      id: "budget", label: "תקציב חדש", icon: "📊",
      apiEndpoint: "/finance/budgets",
      fields: [
        { key: "name", label: "שם תקציב", type: "text", required: true },
        { key: "department", label: "מחלקה", type: "text" },
        { key: "category", label: "קטגוריה", type: "text" },
        { key: "amount", label: "סכום", type: "number", required: true },
        { key: "period_start", label: "תחילת תקופה", type: "date" },
        { key: "period_end", label: "סוף תקופה", type: "date" },
        { key: "notes", label: "הערות", type: "textarea" },
      ],
      aiFlowTargets: ["budget_tracking"],
    },
  ],
};

const GLOBAL_QUICK_ADD: QuickAddEntity[] = [
  {
    id: "quick_supplier", label: "ספק חדש", icon: "🏭",
    apiEndpoint: "/suppliers",
    fields: [
      { key: "supplierNumber", label: "מספר ספק", type: "text", required: true, placeholder: "SUP-001" },
      { key: "supplierName", label: "שם ספק", type: "text", required: true },
      { key: "phone", label: "טלפון", type: "tel" },
      { key: "category", label: "קטגוריה", type: "select", options: ["metal", "aluminum", "glass", "stainless_steel", "other"] },
    ],
    aiFlowTargets: ["purchase_orders", "supplier_evaluations"],
  },
  {
    id: "quick_payment", label: "תשלום חדש", icon: "💰",
    apiEndpoint: "/finance/payments",
    fields: [
      { key: "type", label: "סוג", type: "select", required: true, options: ["income", "expense"] },
      { key: "amount", label: "סכום", type: "number", required: true },
      { key: "method", label: "אמצעי תשלום", type: "select", options: ["cash", "check", "bank_transfer", "credit_card"] },
      { key: "date", label: "תאריך", type: "date", required: true },
      { key: "description", label: "תיאור", type: "text" },
    ],
    aiFlowTargets: ["bank_reconciliation", "cash_flow"],
  },
  {
    id: "quick_expense", label: "הוצאה חדשה", icon: "📋",
    apiEndpoint: "/finance/expenses",
    fields: [
      { key: "description", label: "תיאור", type: "text", required: true },
      { key: "amount", label: "סכום", type: "number", required: true },
      { key: "category", label: "קטגוריה", type: "select", options: ["office", "travel", "equipment", "raw_materials", "services", "other"] },
      { key: "expense_date", label: "תאריך", type: "date", required: true },
    ],
    aiFlowTargets: ["accounts_payable", "budget_tracking"],
  },
  {
    id: "quick_employee", label: "עובד חדש", icon: "👤",
    apiEndpoint: "/hr/employees",
    fields: [
      { key: "firstName", label: "שם פרטי", type: "text", required: true },
      { key: "lastName", label: "שם משפחה", type: "text", required: true },
      { key: "idNumber", label: "ת.ז.", type: "text", required: true },
      { key: "department", label: "מחלקה", type: "select", options: ["production", "sales", "finance", "hr", "logistics", "management"] },
      { key: "hireDate", label: "תאריך גיוס", type: "date", required: true },
    ],
    aiFlowTargets: ["payroll", "attendance"],
  },
  {
    id: "quick_material", label: "חומר גלם", icon: "🔩",
    apiEndpoint: "/raw-materials",
    fields: [
      { key: "name", label: "שם", type: "text", required: true },
      { key: "sku", label: "מק\"ט", type: "text", required: true },
      { key: "category", label: "קטגוריה", type: "select", options: ["metal", "aluminum", "glass", "stainless_steel", "profiles", "other"] },
      { key: "unit", label: "יחידה", type: "select", options: ["kg", "meter", "unit", "sqm", "sheet"] },
    ],
    aiFlowTargets: ["inventory", "purchase_orders"],
  },
];

function getEntitiesForRoute(path: string): QuickAddEntity[] {
  const exactMatch = ROUTE_ENTITIES[path];
  if (exactMatch) return exactMatch;

  for (const [routePrefix, entities] of Object.entries(ROUTE_ENTITIES)) {
    if (path.startsWith(routePrefix + "/") || path === routePrefix) {
      return entities;
    }
  }

  return GLOBAL_QUICK_ADD;
}

export default function QuickAddFAB() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<QuickAddEntity | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [aiFlowing, setAiFlowing] = useState(false);
  const [aiFlowResults, setAiFlowResults] = useState<string[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const queryClient = useQueryClient();

  const entities = getEntitiesForRoute(location);

  useEffect(() => {
    setIsOpen(false);
    setSelectedEntity(null);
  }, [location]);

  const handleSelectEntity = (entity: QuickAddEntity) => {
    setSelectedEntity(entity);
    setForm({});
    setAiFlowResults([]);
    setShowSuccess(false);
  };

  const handleSave = async () => {
    if (!selectedEntity) return;
    setSaving(true);
    try {
      const res = await authFetch(`${API}${selectedEntity.apiEndpoint}`, {
        method: "POST",
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "שגיאה בשמירה");
      }

      const savedData = await res.json().catch(() => ({}));

      queryClient.invalidateQueries();

      if (selectedEntity.aiFlowTargets && selectedEntity.aiFlowTargets.length > 0) {
        setAiFlowing(true);
        try {
          const flowRes = await authFetch(`${API}/ai/data-flow`, {
            method: "POST",
            body: JSON.stringify({
              sourceEntity: selectedEntity.id,
              sourceData: form,
              savedRecord: savedData,
              targets: selectedEntity.aiFlowTargets,
            }),
          });
          if (flowRes.ok) {
            const flowData = await flowRes.json();
            setAiFlowResults(flowData.propagatedTo || []);
          }
        } catch {
          console.log("AI flow completed with partial results");
        }
        setAiFlowing(false);
      }

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setSelectedEntity(null);
        setIsOpen(false);
        setForm({});
      }, 3000);
    } catch (err: any) {
      alert(err.message || "שגיאה בשמירת הנתונים");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setSelectedEntity(null);
    setForm({});
    setAiFlowResults([]);
    setShowSuccess(false);
  };

  if (location === "/login" || location === "/portal/login") return null;

  return (
    <>
      <button
        data-quick-add-fab
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-8 right-6 z-50 w-14 h-14 rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-500 transition-all flex items-center justify-center hover:scale-105"
        title="הוסף נתונים"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
      </button>

      {isOpen && !selectedEntity && (
        <div className="fixed bottom-28 right-6 z-50 bg-card border border-border rounded-2xl shadow-2xl w-80 max-h-[70vh] overflow-y-auto">
          <div className="p-4 border-b border-border">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-500" />
              הוסף נתונים ידנית
            </h3>
            <p className="text-xs text-muted-foreground mt-1">בחר סוג נתון להוספה</p>
          </div>
          <div className="p-2">
            {entities.map((entity) => (
              <button
                key={entity.id}
                onClick={() => handleSelectEntity(entity)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-right"
              >
                <span className="text-2xl">{entity.icon}</span>
                <div className="flex-1">
                  <div className="font-medium text-foreground text-sm">{entity.label}</div>
                  {entity.aiFlowTargets && (
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      זרימה אוטומטית ל-{entity.aiFlowTargets.length} מודולים
                    </div>
                  )}
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground -rotate-90" />
              </button>
            ))}
          </div>
          <div className="p-3 border-t border-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>AI מפיץ נתונים אוטומטית לכל המערכת</span>
            </div>
          </div>
        </div>
      )}

      {selectedEntity && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleClose}>
          <div
            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
           
          >
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{selectedEntity.icon}</span>
                <div>
                  <h3 className="text-lg font-bold text-foreground">{selectedEntity.label}</h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    AI יפיץ אוטומטית לכל המודולים הרלוונטיים
                  </p>
                </div>
              </div>
              <button onClick={handleClose} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {showSuccess ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
                  <Save className="w-8 h-8 text-emerald-400" />
                </div>
                <h4 className="text-lg font-bold text-foreground mb-2">נשמר בהצלחה!</h4>
                {aiFlowResults.length > 0 && (
                  <div className="mt-3 p-3 bg-amber-500/10 rounded-xl border border-amber-500/20">
                    <div className="flex items-center gap-2 justify-center mb-2">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span className="text-sm font-medium text-amber-300">AI הפיץ את הנתונים:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      {aiFlowResults.map((target, i) => (
                        <span key={i} className="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-xs rounded-full">{target}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-5 space-y-4">
                {selectedEntity.fields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      {field.label}
                      {field.required && <span className="text-red-400 mr-1">*</span>}
                    </label>
                    {field.type === "select" ? (
                      <select
                        value={form[field.key] || ""}
                        onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                        className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none"
                      >
                        <option value="">בחר...</option>
                        {field.options?.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : field.type === "textarea" ? (
                      <textarea
                        value={form[field.key] || ""}
                        onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                        placeholder={field.placeholder}
                        rows={3}
                        className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none resize-none"
                      />
                    ) : (
                      <input
                        type={field.type}
                        value={form[field.key] || ""}
                        onChange={(e) => setForm({ ...form, [field.key]: field.type === "number" ? Number(e.target.value) : e.target.value })}
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-foreground text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none"
                      />
                    )}
                  </div>
                ))}

                {selectedEntity.aiFlowTargets && selectedEntity.aiFlowTargets.length > 0 && (
                  <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-blue-400" />
                      <span className="text-xs font-medium text-blue-300">זרימת AI אוטומטית:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedEntity.aiFlowTargets.map((target, i) => (
                        <span key={i} className="px-2 py-0.5 bg-blue-500/15 text-blue-300 text-[10px] rounded-full border border-blue-500/20">{target.replace(/_/g, " ")}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSave}
                    disabled={saving || aiFlowing}
                    className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-medium transition-colors disabled:opacity-50"
                  >
                    {saving ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> שומר...</>
                    ) : aiFlowing ? (
                      <><Sparkles className="w-4 h-4 animate-pulse" /> AI מפיץ נתונים...</>
                    ) : (
                      <><Save className="w-4 h-4" /> שמור והפץ</>
                    )}
                  </button>
                  <button
                    onClick={handleClose}
                    className="px-6 py-3 bg-muted/50 hover:bg-muted text-foreground rounded-xl font-medium transition-colors border border-border"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
