import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Zap, Plus, Save, Upload, PlayCircle, CheckCircle2, XCircle,
  Clock, User, Settings, Shield, GitBranch, AlertCircle, Lock,
  Edit3, Trash2, Eye, Search, Filter, ChevronDown, ChevronRight,
  FileCode2, Users, ShoppingCart, Receipt, Briefcase, UserCog,
  Package, Building2, FileText, Database, Workflow, ArrowRight,
  CheckCheck, XOctagon, Timer, MessageSquare, Bell, Copy,
  Layers, Hash, Type, Calendar, ToggleLeft, Link2, BarChart3,
} from "lucide-react";

type ActionKind = "create" | "edit" | "delete" | "modify";
type ObjectType = "Customer" | "Order" | "Invoice" | "Project" | "Employee" | "WorkOrder" | "Refund" | "Expense";
type ParamType = "string" | "number" | "boolean" | "date" | "enum" | "reference" | "array";
type TabId = "settings" | "parameters" | "validation" | "sideEffects" | "approval" | "tests";

interface ActionParam {
  name: string;
  displayName: string;
  type: ParamType;
  required: boolean;
  default?: any;
  description?: string;
  validation?: string;
  enumValues?: string[];
  refType?: string;
}

interface ValidationRule {
  id: string;
  name: string;
  expression: string;
  errorMessage: string;
  severity: "error" | "warning" | "info";
  enabled: boolean;
}

interface SideEffect {
  id: string;
  type: "update" | "create" | "notify" | "webhook" | "email";
  target: string;
  description: string;
  async: boolean;
}

interface ApprovalStep {
  order: number;
  role: string;
  count: number;
  timeoutHours: number;
}

interface ExecutionRun {
  id: string;
  actionApiName: string;
  user: string;
  userRole: string;
  timestamp: string;
  status: "success" | "failure" | "pending" | "rejected";
  duration: number;
  parameters: Record<string, any>;
  before?: Record<string, any>;
  after?: Record<string, any>;
}

interface PalantirAction {
  id: string;
  apiName: string;
  displayName: string;
  description: string;
  kind: ActionKind;
  objectType: ObjectType;
  status: "draft" | "deployed" | "deprecated";
  version: string;
  lastModified: string;
  modifiedBy: string;
  totalExecutions: number;
  successRate: number;
  parameters: ActionParam[];
  validationRules: ValidationRule[];
  sideEffects: SideEffect[];
  requiresApproval: boolean;
  approvalChain?: ApprovalStep[];
  escalationEmail?: string;
}

const OBJECT_CONFIG: Record<ObjectType, { icon: any; color: string; bg: string }> = {
  Customer: { icon: Users, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
  Order: { icon: ShoppingCart, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  Invoice: { icon: Receipt, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30" },
  Project: { icon: Briefcase, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30" },
  Employee: { icon: UserCog, color: "text-pink-400", bg: "bg-pink-500/10 border-pink-500/30" },
  WorkOrder: { icon: Package, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/30" },
  Refund: { icon: FileText, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30" },
  Expense: { icon: Building2, color: "text-indigo-400", bg: "bg-indigo-500/10 border-indigo-500/30" },
};

const KIND_CONFIG: Record<ActionKind, { label: string; color: string }> = {
  create: { label: "יצירה", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  edit: { label: "עדכון", color: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
  delete: { label: "מחיקה", color: "bg-red-500/10 text-red-400 border-red-500/30" },
  modify: { label: "שינוי", color: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
};

const MOCK_ACTIONS: PalantirAction[] = [
  {
    id: "a1", apiName: "createCustomer", displayName: "יצירת לקוח חדש",
    description: "יצירת רשומת לקוח חדשה באונטולוגיה עם כל שדות החובה.",
    kind: "create", objectType: "Customer", status: "deployed", version: "2.4.1",
    lastModified: "2026-04-09 16:30", modifiedBy: "yossi.cohen", totalExecutions: 1247, successRate: 98.4,
    parameters: [
      { name: "companyName", displayName: "שם החברה", type: "string", required: true, validation: "length(3, 200)" },
      { name: "taxId", displayName: "ח.פ / ע.מ", type: "string", required: true, validation: "regex:^\\d{9}$" },
      { name: "segment", displayName: "סגמנט", type: "enum", required: true, enumValues: ["Enterprise", "Mid-Market", "SMB", "Startup"] },
      { name: "creditLimit", displayName: "מסגרת אשראי", type: "number", required: false, default: 50000 },
      { name: "paymentTerms", displayName: "תנאי תשלום (ימים)", type: "number", required: true, default: 30 },
      { name: "primaryContact", displayName: "איש קשר ראשי", type: "reference", required: true, refType: "Contact" },
    ],
    validationRules: [
      { id: "v1", name: "ח.פ ייחודי", expression: "count(Customer where taxId == params.taxId) == 0", errorMessage: "ח.פ כבר קיים במערכת", severity: "error", enabled: true },
      { id: "v2", name: "מסגרת אשראי חיובית", expression: "params.creditLimit >= 0", errorMessage: "מסגרת אשראי חייבת להיות חיובית", severity: "error", enabled: true },
      { id: "v3", name: "תנאי תשלום סבירים", expression: "params.paymentTerms <= 90", errorMessage: "תנאי תשלום גבוהים מ-90 יום דורשים אישור", severity: "warning", enabled: true },
    ],
    sideEffects: [
      { id: "s1", type: "create", target: "CustomerAccount (Finance)", description: "יצירת חשבון לקוח בהנהלת חשבונות", async: false },
      { id: "s2", type: "notify", target: "SalesTeam", description: "התראת Slack לצוות המכירות", async: true },
      { id: "s3", type: "webhook", target: "CRM Sync", description: "סנכרון אוטומטי עם Salesforce", async: true },
    ],
    requiresApproval: true,
    approvalChain: [
      { order: 1, role: "SalesManager", count: 1, timeoutHours: 24 },
      { order: 2, role: "FinanceDirector", count: 1, timeoutHours: 48 },
    ],
    escalationEmail: "approvals@company.co.il",
  },
  {
    id: "a2", apiName: "updateOrderStatus", displayName: "עדכון סטטוס הזמנה",
    description: "עדכון סטטוס הזמנה קיימת, עם עדכון אוטומטי של שדות תאריך נלווים.",
    kind: "edit", objectType: "Order", status: "deployed", version: "1.8.0",
    lastModified: "2026-04-08 11:20", modifiedBy: "dana.levy", totalExecutions: 8954, successRate: 99.7,
    parameters: [
      { name: "orderId", displayName: "מזהה הזמנה", type: "reference", required: true, refType: "Order" },
      { name: "newStatus", displayName: "סטטוס חדש", type: "enum", required: true, enumValues: ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"] },
      { name: "reason", displayName: "סיבת השינוי", type: "string", required: false },
      { name: "notifyCustomer", displayName: "שלח התראה ללקוח", type: "boolean", required: false, default: true },
    ],
    validationRules: [
      { id: "v1", name: "מעבר סטטוס חוקי", expression: "isValidTransition(order.status, params.newStatus)", errorMessage: "מעבר סטטוס לא חוקי", severity: "error", enabled: true },
      { id: "v2", name: "לא ניתן לבטל הזמנה שנשלחה", expression: "!(params.newStatus == 'cancelled' && order.status == 'shipped')", errorMessage: "לא ניתן לבטל הזמנה שכבר נשלחה", severity: "error", enabled: true },
    ],
    sideEffects: [
      { id: "s1", type: "update", target: "Order.statusHistory", description: "רישום היסטוריית סטטוסים", async: false },
      { id: "s2", type: "email", target: "Customer", description: "שליחת אימייל עם עדכון סטטוס", async: true },
      { id: "s3", type: "update", target: "Inventory", description: "עדכון מלאי זמין בהתאם", async: false },
    ],
    requiresApproval: false,
  },
  {
    id: "a3", apiName: "approveRefund", displayName: "אישור החזר כספי",
    description: "אישור בקשת החזר ללקוח, יצירת רשומת החזר ועדכון חשבונאי.",
    kind: "modify", objectType: "Refund", status: "deployed", version: "3.0.2",
    lastModified: "2026-04-10 09:15", modifiedBy: "moshe.avraham", totalExecutions: 423, successRate: 96.2,
    parameters: [
      { name: "refundId", displayName: "מזהה בקשת החזר", type: "reference", required: true, refType: "Refund" },
      { name: "amount", displayName: "סכום מאושר", type: "number", required: true },
      { name: "reason", displayName: "סיבת האישור", type: "string", required: true },
      { name: "refundMethod", displayName: "אופן החזר", type: "enum", required: true, enumValues: ["credit_card", "bank_transfer", "store_credit", "cash"] },
      { name: "notes", displayName: "הערות פנימיות", type: "string", required: false },
    ],
    validationRules: [
      { id: "v1", name: "סכום לא חורג", expression: "params.amount <= refund.maxAllowed", errorMessage: "הסכום חורג מהמותר", severity: "error", enabled: true },
      { id: "v2", name: "בקשה פתוחה", expression: "refund.status == 'pending'", errorMessage: "הבקשה אינה במצב המתנה", severity: "error", enabled: true },
      { id: "v3", name: "בדיקת כפל החזרים", expression: "count(Refund where orderId == refund.orderId && status == 'approved') == 0", errorMessage: "קיים החזר מאושר אחר להזמנה זו", severity: "warning", enabled: true },
    ],
    sideEffects: [
      { id: "s1", type: "create", target: "JournalEntry", description: "יצירת פקודת יומן בהנהלת חשבונות", async: false },
      { id: "s2", type: "update", target: "Customer.creditBalance", description: "עדכון יתרת אשראי ללקוח", async: false },
      { id: "s3", type: "notify", target: "FinanceTeam", description: "התראה לצוות הכספים", async: true },
      { id: "s4", type: "email", target: "Customer", description: "אימייל אישור ללקוח", async: true },
    ],
    requiresApproval: true,
    approvalChain: [
      { order: 1, role: "CustomerServiceManager", count: 1, timeoutHours: 12 },
      { order: 2, role: "FinanceManager", count: 1, timeoutHours: 24 },
    ],
  },
  {
    id: "a4", apiName: "cancelInvoice", displayName: "ביטול חשבונית",
    description: "ביטול חשבונית וזיכוי מקביל.",
    kind: "modify", objectType: "Invoice", status: "deployed", version: "1.5.3",
    lastModified: "2026-04-07 14:40", modifiedBy: "rachel.david", totalExecutions: 89, successRate: 93.3,
    parameters: [
      { name: "invoiceId", displayName: "מזהה חשבונית", type: "reference", required: true, refType: "Invoice" },
      { name: "reason", displayName: "סיבת ביטול", type: "enum", required: true, enumValues: ["customer_request", "billing_error", "duplicate", "fraud", "other"] },
      { name: "issueCreditNote", displayName: "הנפק חשבונית זיכוי", type: "boolean", required: false, default: true },
      { name: "notes", displayName: "הערות", type: "string", required: true },
    ],
    validationRules: [
      { id: "v1", name: "חשבונית לא שולמה", expression: "invoice.status != 'paid'", errorMessage: "לא ניתן לבטל חשבונית ששולמה", severity: "error", enabled: true },
      { id: "v2", name: "חשבונית בתוקף", expression: "daysSince(invoice.createdAt) <= 180", errorMessage: "חשבונית ישנה מ-180 יום", severity: "warning", enabled: true },
    ],
    sideEffects: [
      { id: "s1", type: "create", target: "CreditNote", description: "יצירת חשבונית זיכוי אוטומטית", async: false },
      { id: "s2", type: "update", target: "Customer.balance", description: "עדכון יתרת לקוח", async: false },
    ],
    requiresApproval: true,
    approvalChain: [
      { order: 1, role: "FinanceManager", count: 1, timeoutHours: 24 },
    ],
  },
  {
    id: "a5", apiName: "promoteEmployee", displayName: "קידום עובד",
    description: "שינוי תפקיד ושכר עובד בעקבות קידום.",
    kind: "edit", objectType: "Employee", status: "deployed", version: "2.1.0",
    lastModified: "2026-04-05 10:00", modifiedBy: "hr.admin", totalExecutions: 34, successRate: 100,
    parameters: [
      { name: "employeeId", displayName: "מזהה עובד", type: "reference", required: true, refType: "Employee" },
      { name: "newRole", displayName: "תפקיד חדש", type: "string", required: true },
      { name: "newSalary", displayName: "שכר חדש", type: "number", required: true },
      { name: "effectiveDate", displayName: "תאריך תחולה", type: "date", required: true },
      { name: "newManager", displayName: "מנהל חדש", type: "reference", required: false, refType: "Employee" },
      { name: "reason", displayName: "סיבת הקידום", type: "string", required: true },
    ],
    validationRules: [
      { id: "v1", name: "עליית שכר סבירה", expression: "params.newSalary <= employee.currentSalary * 1.5", errorMessage: "עליית שכר חורגת מ-50%", severity: "warning", enabled: true },
      { id: "v2", name: "תאריך תחולה עתידי", expression: "params.effectiveDate >= today", errorMessage: "התאריך לא יכול להיות בעבר", severity: "error", enabled: true },
    ],
    sideEffects: [
      { id: "s1", type: "create", target: "EmployeeHistory", description: "רישום היסטוריית תפקידים", async: false },
      { id: "s2", type: "update", target: "Payroll", description: "עדכון במערכת השכר", async: false },
      { id: "s3", type: "notify", target: "Employee + Manager", description: "התראות הודעה", async: true },
    ],
    requiresApproval: true,
    approvalChain: [
      { order: 1, role: "DirectManager", count: 1, timeoutHours: 24 },
      { order: 2, role: "HRDirector", count: 1, timeoutHours: 48 },
      { order: 3, role: "CEO", count: 1, timeoutHours: 72 },
    ],
  },
  {
    id: "a6", apiName: "assignProject", displayName: "שיוך פרויקט לצוות",
    description: "הקצאת עובדים לפרויקט עם הגדרת תפקיד ואחוזי העסקה.",
    kind: "edit", objectType: "Project", status: "deployed", version: "1.2.0",
    lastModified: "2026-04-06 15:30", modifiedBy: "pm.lead", totalExecutions: 312, successRate: 99.0,
    parameters: [
      { name: "projectId", displayName: "פרויקט", type: "reference", required: true, refType: "Project" },
      { name: "employeeIds", displayName: "עובדים", type: "array", required: true },
      { name: "role", displayName: "תפקיד בצוות", type: "enum", required: true, enumValues: ["lead", "senior", "junior", "consultant"] },
      { name: "allocationPct", displayName: "אחוז העסקה", type: "number", required: true, default: 100 },
    ],
    validationRules: [
      { id: "v1", name: "אחוז העסקה חוקי", expression: "params.allocationPct > 0 && params.allocationPct <= 100", errorMessage: "אחוז חייב להיות בין 1-100", severity: "error", enabled: true },
      { id: "v2", name: "זמינות עובדים", expression: "allEmployeesAvailable(params.employeeIds, params.allocationPct)", errorMessage: "לא כל העובדים זמינים", severity: "warning", enabled: true },
    ],
    sideEffects: [
      { id: "s1", type: "update", target: "EmployeeAllocation", description: "עדכון טבלת הקצאות", async: false },
      { id: "s2", type: "notify", target: "Assigned Employees", description: "התראה לעובדים", async: true },
    ],
    requiresApproval: false,
  },
  {
    id: "a7", apiName: "approveExpense", displayName: "אישור הוצאה",
    description: "אישור הוצאה של עובד לקבלת החזר.",
    kind: "modify", objectType: "Expense", status: "deployed", version: "1.9.2",
    lastModified: "2026-04-09 08:45", modifiedBy: "fin.team", totalExecutions: 2134, successRate: 97.8,
    parameters: [
      { name: "expenseId", displayName: "הוצאה", type: "reference", required: true, refType: "Expense" },
      { name: "approvedAmount", displayName: "סכום מאושר", type: "number", required: true },
      { name: "category", displayName: "קטגוריה", type: "enum", required: true, enumValues: ["travel", "meals", "supplies", "software", "training", "other"] },
      { name: "notes", displayName: "הערות", type: "string", required: false },
    ],
    validationRules: [
      { id: "v1", name: "סכום תואם למגבלות", expression: "params.approvedAmount <= expense.category.limit", errorMessage: "חורג ממגבלת הקטגוריה", severity: "error", enabled: true },
      { id: "v2", name: "קבלה קיימת", expression: "expense.hasReceipt == true", errorMessage: "חסרה קבלה", severity: "warning", enabled: true },
    ],
    sideEffects: [
      { id: "s1", type: "create", target: "PayrollDeduction", description: "הוספה לתלוש הבא", async: false },
      { id: "s2", type: "update", target: "Budget", description: "עדכון תקציב המחלקה", async: false },
    ],
    requiresApproval: true,
    approvalChain: [
      { order: 1, role: "DirectManager", count: 1, timeoutHours: 24 },
    ],
  },
  {
    id: "a8", apiName: "closeWorkOrder", displayName: "סגירת פקודת עבודה",
    description: "סגירת פקודת עבודה לאחר השלמה, עדכון מלאי וייצור דוח.",
    kind: "modify", objectType: "WorkOrder", status: "deployed", version: "2.3.1",
    lastModified: "2026-04-10 11:50", modifiedBy: "prod.manager", totalExecutions: 678, successRate: 95.4,
    parameters: [
      { name: "workOrderId", displayName: "פקודת עבודה", type: "reference", required: true, refType: "WorkOrder" },
      { name: "actualQty", displayName: "כמות שהופקה", type: "number", required: true },
      { name: "scrapQty", displayName: "כמות פסולת", type: "number", required: false, default: 0 },
      { name: "actualHours", displayName: "שעות עבודה בפועל", type: "number", required: true },
      { name: "notes", displayName: "הערות סיום", type: "string", required: false },
    ],
    validationRules: [
      { id: "v1", name: "כמות חיובית", expression: "params.actualQty > 0", errorMessage: "כמות חייבת להיות חיובית", severity: "error", enabled: true },
      { id: "v2", name: "הפרש סביר", expression: "abs(params.actualQty - workOrder.plannedQty) / workOrder.plannedQty <= 0.2", errorMessage: "הפרש גדול מ-20% מתכנון", severity: "warning", enabled: true },
    ],
    sideEffects: [
      { id: "s1", type: "update", target: "Inventory", description: "הוספה למלאי מוגמר", async: false },
      { id: "s2", type: "create", target: "ProductionReport", description: "ייצור דוח ייצור", async: true },
      { id: "s3", type: "update", target: "MachineUtilization", description: "עדכון נצילות מכונות", async: true },
    ],
    requiresApproval: false,
  },
  {
    id: "a9", apiName: "mergeCustomers", displayName: "איחוד לקוחות כפולים",
    description: "איחוד שני רשומות לקוח כפולות לרשומה אחת.",
    kind: "modify", objectType: "Customer", status: "deployed", version: "1.1.0",
    lastModified: "2026-04-02 13:15", modifiedBy: "data.admin", totalExecutions: 47, successRate: 89.4,
    parameters: [
      { name: "primaryCustomerId", displayName: "לקוח ראשי (לשמירה)", type: "reference", required: true, refType: "Customer" },
      { name: "duplicateCustomerId", displayName: "לקוח כפול (למחיקה)", type: "reference", required: true, refType: "Customer" },
      { name: "mergeStrategy", displayName: "אסטרטגיית איחוד", type: "enum", required: true, enumValues: ["keep_primary", "prefer_recent", "manual"] },
    ],
    validationRules: [
      { id: "v1", name: "לקוחות שונים", expression: "params.primaryCustomerId != params.duplicateCustomerId", errorMessage: "הלקוחות זהים", severity: "error", enabled: true },
      { id: "v2", name: "אין הזמנות פתוחות בכפול", expression: "countOpenOrders(params.duplicateCustomerId) == 0", errorMessage: "יש הזמנות פתוחות בלקוח הכפול", severity: "error", enabled: true },
    ],
    sideEffects: [
      { id: "s1", type: "update", target: "All Orders", description: "העברת כל ההזמנות ללקוח הראשי", async: false },
      { id: "s2", type: "update", target: "All Invoices", description: "העברת כל החשבוניות", async: false },
      { id: "s3", type: "update", target: "All Contacts", description: "העברת אנשי קשר", async: false },
    ],
    requiresApproval: true,
    approvalChain: [
      { order: 1, role: "DataSteward", count: 1, timeoutHours: 48 },
      { order: 2, role: "SalesDirector", count: 1, timeoutHours: 72 },
    ],
  },
  {
    id: "a10", apiName: "deleteCustomer", displayName: "מחיקת לקוח (GDPR)",
    description: "מחיקת לקוח לצרכי תאימות GDPR.",
    kind: "delete", objectType: "Customer", status: "deployed", version: "1.0.0",
    lastModified: "2026-03-28 09:30", modifiedBy: "compliance.officer", totalExecutions: 12, successRate: 91.7,
    parameters: [
      { name: "customerId", displayName: "לקוח", type: "reference", required: true, refType: "Customer" },
      { name: "reason", displayName: "סיבת מחיקה", type: "enum", required: true, enumValues: ["gdpr_request", "right_to_be_forgotten", "inactive", "fraud"] },
      { name: "anonymizeHistoricalOrders", displayName: "אנונימיזציה של הזמנות היסטוריות", type: "boolean", required: false, default: true },
    ],
    validationRules: [
      { id: "v1", name: "אין חובות פתוחים", expression: "customer.balance == 0", errorMessage: "יש חובות פתוחים", severity: "error", enabled: true },
      { id: "v2", name: "תקופת שמירה", expression: "daysSince(customer.lastActivity) >= 2555", errorMessage: "עדיין בתקופת שמירה חוקית (7 שנים)", severity: "warning", enabled: true },
    ],
    sideEffects: [
      { id: "s1", type: "update", target: "All Related Entities", description: "אנונימיזציה של כל הישויות הקשורות", async: false },
      { id: "s2", type: "create", target: "AuditLog.GDPRDeletion", description: "רישום ב-audit log", async: false },
    ],
    requiresApproval: true,
    approvalChain: [
      { order: 1, role: "DPO", count: 1, timeoutHours: 48 },
      { order: 2, role: "LegalCounsel", count: 1, timeoutHours: 72 },
    ],
  },
  {
    id: "a11", apiName: "createPurchaseOrder", displayName: "יצירת הזמנת רכש",
    description: "יצירת הזמנת רכש חדשה לספק.",
    kind: "create", objectType: "Order", status: "deployed", version: "2.0.5",
    lastModified: "2026-04-08 16:20", modifiedBy: "procurement.mgr", totalExecutions: 1560, successRate: 98.9,
    parameters: [
      { name: "supplierId", displayName: "ספק", type: "reference", required: true, refType: "Supplier" },
      { name: "items", displayName: "פריטים", type: "array", required: true },
      { name: "expectedDelivery", displayName: "תאריך אספקה צפוי", type: "date", required: true },
      { name: "budget", displayName: "תקציב", type: "number", required: true },
    ],
    validationRules: [
      { id: "v1", name: "ספק פעיל", expression: "supplier.status == 'active'", errorMessage: "הספק אינו פעיל", severity: "error", enabled: true },
      { id: "v2", name: "תקציב קיים", expression: "department.availableBudget >= params.budget", errorMessage: "אין תקציב מספיק", severity: "error", enabled: true },
    ],
    sideEffects: [
      { id: "s1", type: "update", target: "Budget", description: "נעילת סכום בתקציב", async: false },
      { id: "s2", type: "email", target: "Supplier", description: "שליחת PO לספק", async: true },
    ],
    requiresApproval: true,
    approvalChain: [
      { order: 1, role: "DepartmentHead", count: 1, timeoutHours: 24 },
    ],
  },
  {
    id: "a12", apiName: "adjustInventory", displayName: "התאמת מלאי",
    description: "עדכון ידני של כמויות מלאי לאחר ספירה.",
    kind: "edit", objectType: "WorkOrder", status: "deployed", version: "1.4.2",
    lastModified: "2026-04-01 12:10", modifiedBy: "warehouse.mgr", totalExecutions: 892, successRate: 96.5,
    parameters: [
      { name: "sku", displayName: "SKU", type: "string", required: true },
      { name: "newQty", displayName: "כמות חדשה", type: "number", required: true },
      { name: "reason", displayName: "סיבה", type: "enum", required: true, enumValues: ["count_discrepancy", "damage", "theft", "expired", "correction"] },
    ],
    validationRules: [
      { id: "v1", name: "הפרש קטן", expression: "abs(params.newQty - current) / current <= 0.1", errorMessage: "הפרש גדול מ-10% — דרוש אישור מנהל", severity: "warning", enabled: true },
    ],
    sideEffects: [
      { id: "s1", type: "create", target: "InventoryAdjustment", description: "רישום ביומן התאמות", async: false },
    ],
    requiresApproval: false,
  },
  {
    id: "a13", apiName: "issueCreditNote", displayName: "הנפקת חשבונית זיכוי",
    description: "יצירת חשבונית זיכוי ידנית.",
    kind: "create", objectType: "Invoice", status: "deployed", version: "1.0.3",
    lastModified: "2026-04-04 09:20", modifiedBy: "finance.clerk", totalExecutions: 234, successRate: 99.1,
    parameters: [
      { name: "originalInvoice", displayName: "חשבונית מקורית", type: "reference", required: true, refType: "Invoice" },
      { name: "amount", displayName: "סכום זיכוי", type: "number", required: true },
      { name: "reason", displayName: "סיבת זיכוי", type: "string", required: true },
    ],
    validationRules: [
      { id: "v1", name: "סכום קטן או שווה", expression: "params.amount <= originalInvoice.total", errorMessage: "הסכום גדול מהחשבונית המקורית", severity: "error", enabled: true },
    ],
    sideEffects: [
      { id: "s1", type: "update", target: "Customer.balance", description: "עדכון יתרת לקוח", async: false },
    ],
    requiresApproval: true,
    approvalChain: [
      { order: 1, role: "FinanceManager", count: 1, timeoutHours: 24 },
    ],
  },
  {
    id: "a14", apiName: "transferEmployee", displayName: "העברת עובד בין מחלקות",
    description: "העברת עובד ממחלקה אחת לאחרת.",
    kind: "edit", objectType: "Employee", status: "deployed", version: "1.2.1",
    lastModified: "2026-03-30 15:00", modifiedBy: "hr.admin", totalExecutions: 87, successRate: 98.8,
    parameters: [
      { name: "employeeId", displayName: "עובד", type: "reference", required: true, refType: "Employee" },
      { name: "newDepartment", displayName: "מחלקה חדשה", type: "reference", required: true, refType: "Department" },
      { name: "effectiveDate", displayName: "תאריך תחולה", type: "date", required: true },
      { name: "newManager", displayName: "מנהל חדש", type: "reference", required: true, refType: "Employee" },
    ],
    validationRules: [
      { id: "v1", name: "המחלקה קיימת", expression: "department.status == 'active'", errorMessage: "המחלקה אינה פעילה", severity: "error", enabled: true },
    ],
    sideEffects: [
      { id: "s1", type: "update", target: "OrgChart", description: "עדכון מבנה ארגוני", async: false },
      { id: "s2", type: "notify", target: "All Stakeholders", description: "התראות לצוותים", async: true },
    ],
    requiresApproval: true,
    approvalChain: [
      { order: 1, role: "OldManager", count: 1, timeoutHours: 24 },
      { order: 2, role: "NewManager", count: 1, timeoutHours: 24 },
      { order: 3, role: "HR", count: 1, timeoutHours: 48 },
    ],
  },
  {
    id: "a15", apiName: "escalateProject", displayName: "Escalation פרויקט",
    description: "הסלמת פרויקט בסיכון להנהלה בכירה.",
    kind: "modify", objectType: "Project", status: "deployed", version: "1.0.1",
    lastModified: "2026-03-25 11:40", modifiedBy: "pmo.lead", totalExecutions: 21, successRate: 95.2,
    parameters: [
      { name: "projectId", displayName: "פרויקט", type: "reference", required: true, refType: "Project" },
      { name: "severity", displayName: "חומרה", type: "enum", required: true, enumValues: ["low", "medium", "high", "critical"] },
      { name: "issues", displayName: "תיאור בעיות", type: "string", required: true },
    ],
    validationRules: [
      { id: "v1", name: "סטטוס פרויקט", expression: "project.status != 'closed'", errorMessage: "לא ניתן להסלים פרויקט סגור", severity: "error", enabled: true },
    ],
    sideEffects: [
      { id: "s1", type: "update", target: "Project.riskLevel", description: "עדכון רמת סיכון", async: false },
      { id: "s2", type: "notify", target: "Executive Team", description: "התראה להנהלה", async: true },
      { id: "s3", type: "create", target: "EscalationTicket", description: "יצירת כרטיס אסקלציה", async: false },
    ],
    requiresApproval: false,
  },
  {
    id: "a16", apiName: "activateCustomer", displayName: "הפעלת לקוח לא פעיל",
    description: "הפעלה מחדש של לקוח שהיה במצב לא פעיל.",
    kind: "edit", objectType: "Customer", status: "deployed", version: "1.0.0",
    lastModified: "2026-03-20 10:15", modifiedBy: "sales.ops", totalExecutions: 156, successRate: 99.4,
    parameters: [
      { name: "customerId", displayName: "לקוח", type: "reference", required: true, refType: "Customer" },
      { name: "newSalesperson", displayName: "סוכן מכירות", type: "reference", required: false, refType: "Employee" },
    ],
    validationRules: [
      { id: "v1", name: "לקוח לא פעיל", expression: "customer.status == 'inactive'", errorMessage: "הלקוח כבר פעיל", severity: "error", enabled: true },
    ],
    sideEffects: [
      { id: "s1", type: "notify", target: "SalesTeam", description: "התראה לצוות מכירות", async: true },
    ],
    requiresApproval: false,
  },
  {
    id: "a17", apiName: "blockCustomer", displayName: "חסימת לקוח",
    description: "חסימת לקוח בגין פיגור בתשלום או הפרת הסכם.",
    kind: "modify", objectType: "Customer", status: "deployed", version: "1.3.0",
    lastModified: "2026-04-03 14:25", modifiedBy: "credit.mgr", totalExecutions: 43, successRate: 97.7,
    parameters: [
      { name: "customerId", displayName: "לקוח", type: "reference", required: true, refType: "Customer" },
      { name: "reason", displayName: "סיבת חסימה", type: "enum", required: true, enumValues: ["non_payment", "contract_breach", "fraud_suspicion", "legal"] },
      { name: "blockType", displayName: "סוג חסימה", type: "enum", required: true, enumValues: ["hard", "soft", "credit_only"] },
    ],
    validationRules: [
      { id: "v1", name: "סיבה תקפה", expression: "length(params.reason) > 0", errorMessage: "חובה לציין סיבה", severity: "error", enabled: true },
    ],
    sideEffects: [
      { id: "s1", type: "update", target: "Customer.creditStatus", description: "שינוי סטטוס אשראי", async: false },
      { id: "s2", type: "update", target: "Open Orders", description: "הקפאת הזמנות פתוחות", async: false },
      { id: "s3", type: "email", target: "Customer", description: "הודעה ללקוח", async: true },
    ],
    requiresApproval: true,
    approvalChain: [
      { order: 1, role: "CreditManager", count: 1, timeoutHours: 24 },
    ],
  },
  {
    id: "a18", apiName: "terminateEmployee", displayName: "סיום העסקת עובד",
    description: "סיום העסקה של עובד עם עדכון כל המערכות הנלוות.",
    kind: "modify", objectType: "Employee", status: "deployed", version: "2.0.0",
    lastModified: "2026-03-15 11:00", modifiedBy: "hr.director", totalExecutions: 19, successRate: 100,
    parameters: [
      { name: "employeeId", displayName: "עובד", type: "reference", required: true, refType: "Employee" },
      { name: "terminationType", displayName: "סוג סיום", type: "enum", required: true, enumValues: ["resignation", "dismissal", "retirement", "contract_end"] },
      { name: "lastWorkingDay", displayName: "יום עבודה אחרון", type: "date", required: true },
      { name: "severance", displayName: "פיצויים", type: "number", required: false },
    ],
    validationRules: [
      { id: "v1", name: "תאריך עתידי", expression: "params.lastWorkingDay >= today", errorMessage: "התאריך בעבר", severity: "error", enabled: true },
      { id: "v2", name: "אין פרויקטים פתוחים", expression: "employee.activeProjects == 0", errorMessage: "יש פרויקטים פעילים — יש לבצע handover", severity: "warning", enabled: true },
    ],
    sideEffects: [
      { id: "s1", type: "update", target: "ActiveDirectory", description: "השבתת חשבון", async: false },
      { id: "s2", type: "update", target: "Payroll", description: "חישוב גמר חשבון", async: false },
      { id: "s3", type: "create", target: "Form 161", description: "יצירת טופס 161", async: true },
      { id: "s4", type: "notify", target: "IT + HR", description: "החזרת ציוד", async: true },
    ],
    requiresApproval: true,
    approvalChain: [
      { order: 1, role: "DirectManager", count: 1, timeoutHours: 24 },
      { order: 2, role: "HRDirector", count: 1, timeoutHours: 48 },
      { order: 3, role: "LegalCounsel", count: 1, timeoutHours: 72 },
    ],
  },
  {
    id: "a19", apiName: "completeProject", displayName: "סגירת פרויקט",
    description: "סגירה פורמלית של פרויקט לאחר השלמה.",
    kind: "modify", objectType: "Project", status: "deployed", version: "1.1.2",
    lastModified: "2026-04-07 17:30", modifiedBy: "pmo.lead", totalExecutions: 128, successRate: 99.2,
    parameters: [
      { name: "projectId", displayName: "פרויקט", type: "reference", required: true, refType: "Project" },
      { name: "finalCost", displayName: "עלות סופית", type: "number", required: true },
      { name: "completionNotes", displayName: "הערות סיום", type: "string", required: true },
      { name: "customerSignoff", displayName: "אישור לקוח", type: "boolean", required: true, default: false },
    ],
    validationRules: [
      { id: "v1", name: "כל המשימות הושלמו", expression: "project.openTasks == 0", errorMessage: "יש משימות פתוחות", severity: "error", enabled: true },
      { id: "v2", name: "אישור לקוח", expression: "params.customerSignoff == true", errorMessage: "חסר אישור לקוח", severity: "error", enabled: true },
    ],
    sideEffects: [
      { id: "s1", type: "update", target: "Project.status", description: "סטטוס ל-completed", async: false },
      { id: "s2", type: "create", target: "ProjectReport", description: "יצירת דוח סיום", async: true },
      { id: "s3", type: "update", target: "EmployeeAllocation", description: "שחרור עובדים", async: false },
    ],
    requiresApproval: true,
    approvalChain: [
      { order: 1, role: "ProjectManager", count: 1, timeoutHours: 24 },
      { order: 2, role: "PMODirector", count: 1, timeoutHours: 48 },
    ],
  },
  {
    id: "a20", apiName: "bulkUpdatePrices", displayName: "עדכון מחירים בכמות",
    description: "עדכון מחירים של מספר מוצרים בפעולה אחת.",
    kind: "edit", objectType: "Order", status: "draft", version: "0.9.0",
    lastModified: "2026-04-10 09:00", modifiedBy: "pricing.mgr", totalExecutions: 0, successRate: 0,
    parameters: [
      { name: "productIds", displayName: "מוצרים", type: "array", required: true },
      { name: "updateType", displayName: "סוג עדכון", type: "enum", required: true, enumValues: ["percentage", "fixed_amount", "new_price"] },
      { name: "value", displayName: "ערך", type: "number", required: true },
      { name: "effectiveDate", displayName: "תאריך תחולה", type: "date", required: true },
    ],
    validationRules: [
      { id: "v1", name: "עליית מחיר מתונה", expression: "params.value <= 20 || params.updateType != 'percentage'", errorMessage: "עליית מחיר גדולה מ-20% — דרוש אישור חריג", severity: "warning", enabled: true },
    ],
    sideEffects: [
      { id: "s1", type: "update", target: "PriceList", description: "עדכון רשימת מחירים", async: false },
      { id: "s2", type: "notify", target: "SalesTeam", description: "התראה לצוות מכירות", async: true },
    ],
    requiresApproval: true,
    approvalChain: [
      { order: 1, role: "SalesDirector", count: 1, timeoutHours: 48 },
      { order: 2, role: "CFO", count: 1, timeoutHours: 72 },
    ],
  },
];

const MOCK_RUNS: ExecutionRun[] = [
  {
    id: "r1", actionApiName: "updateOrderStatus", user: "yossi.cohen", userRole: "SalesRep",
    timestamp: "2026-04-10 14:32:18", status: "success", duration: 234,
    parameters: { orderId: "ORD-8472", newStatus: "shipped", notifyCustomer: true },
    before: { status: "processing", shippedAt: null },
    after: { status: "shipped", shippedAt: "2026-04-10" },
  },
  {
    id: "r2", actionApiName: "approveRefund", user: "dana.levy", userRole: "CSManager",
    timestamp: "2026-04-10 14:15:02", status: "success", duration: 892,
    parameters: { refundId: "REF-234", amount: 1450, reason: "מוצר פגום", refundMethod: "credit_card" },
    before: { status: "pending", approvedAmount: null },
    after: { status: "approved", approvedAmount: 1450 },
  },
  {
    id: "r3", actionApiName: "createCustomer", user: "moshe.avraham", userRole: "SalesRep",
    timestamp: "2026-04-10 13:48:45", status: "pending", duration: 0,
    parameters: { companyName: "חברת בדיקה בע\"מ", taxId: "514789236", segment: "Mid-Market" },
  },
  {
    id: "r4", actionApiName: "promoteEmployee", user: "hr.admin", userRole: "HRManager",
    timestamp: "2026-04-10 12:30:15", status: "success", duration: 1247,
    parameters: { employeeId: "EMP-1234", newRole: "Senior Developer", newSalary: 28000 },
    before: { role: "Developer", salary: 22000 },
    after: { role: "Senior Developer", salary: 28000 },
  },
  {
    id: "r5", actionApiName: "cancelInvoice", user: "rachel.david", userRole: "FinanceMgr",
    timestamp: "2026-04-10 11:45:33", status: "failure", duration: 156,
    parameters: { invoiceId: "INV-5012", reason: "billing_error" },
  },
  {
    id: "r6", actionApiName: "mergeCustomers", user: "data.admin", userRole: "DataSteward",
    timestamp: "2026-04-10 10:20:11", status: "rejected", duration: 45,
    parameters: { primaryCustomerId: "C-2341", duplicateCustomerId: "C-2891" },
  },
  {
    id: "r7", actionApiName: "closeWorkOrder", user: "prod.manager", userRole: "ProductionMgr",
    timestamp: "2026-04-10 09:55:28", status: "success", duration: 567,
    parameters: { workOrderId: "WO-1024", actualQty: 485, actualHours: 47.5 },
    before: { status: "in_progress", actualQty: 0 },
    after: { status: "completed", actualQty: 485 },
  },
  {
    id: "r8", actionApiName: "approveExpense", user: "fin.team", userRole: "FinClerk",
    timestamp: "2026-04-10 09:12:44", status: "success", duration: 189,
    parameters: { expenseId: "EXP-7821", approvedAmount: 450, category: "travel" },
    before: { status: "submitted", approvedAmount: null },
    after: { status: "approved", approvedAmount: 450 },
  },
];

const KIND_ICON: Record<ActionKind, any> = {
  create: Plus,
  edit: Edit3,
  delete: Trash2,
  modify: Settings,
};

export default function ActionsStudio() {
  const [selectedActionId, setSelectedActionId] = useState<string>("a1");
  const [activeTab, setActiveTab] = useState<TabId>("settings");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    Customer: true, Order: true, Invoice: true, Project: true, Employee: false, WorkOrder: false, Refund: false, Expense: false,
  });

  const { data } = useQuery({
    queryKey: ["palantir-actions-studio"],
    queryFn: async () => {
      try {
        const res = await authFetch("/api/palantir/actions-studio");
        if (!res.ok) throw new Error("fallback");
        return await res.json();
      } catch {
        return { actions: MOCK_ACTIONS, runs: MOCK_RUNS };
      }
    },
  });

  const actions: PalantirAction[] = data?.actions || MOCK_ACTIONS;
  const runs: ExecutionRun[] = data?.runs || MOCK_RUNS;

  const selectedAction = actions.find((a) => a.id === selectedActionId) || actions[0];

  // Group by object type
  const grouped = actions.reduce<Record<string, PalantirAction[]>>((acc, action) => {
    if (searchQuery && !action.apiName.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !action.displayName.includes(searchQuery)) {
      return acc;
    }
    if (!acc[action.objectType]) acc[action.objectType] = [];
    acc[action.objectType].push(action);
    return acc;
  }, {});

  const toggleGroup = (key: string) =>
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  const stats = {
    total: actions.length,
    deployed: actions.filter((a) => a.status === "deployed").length,
    drafts: actions.filter((a) => a.status === "draft").length,
    totalRuns: actions.reduce((s, a) => s + a.totalExecutions, 0),
  };

  const selectedActionRuns = runs.filter((r) => r.actionApiName === selectedAction.apiName).slice(0, 8);

  const renderTabSettings = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">API Name</label>
          <input
            dir="ltr"
            value={selectedAction.apiName}
            readOnly
            className="w-full bg-[#0a0e1a] border border-[#1f2937] rounded px-3 py-2 text-sm font-mono text-white"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Display Name</label>
          <input
            value={selectedAction.displayName}
            readOnly
            className="w-full bg-[#0a0e1a] border border-[#1f2937] rounded px-3 py-2 text-sm text-white"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-400 mb-1 block">תיאור</label>
        <textarea
          value={selectedAction.description}
          readOnly
          rows={3}
          className="w-full bg-[#0a0e1a] border border-[#1f2937] rounded px-3 py-2 text-sm text-gray-300"
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Action Kind</label>
          <div className={`px-3 py-2 rounded border text-sm ${KIND_CONFIG[selectedAction.kind].color}`}>
            {KIND_CONFIG[selectedAction.kind].label}
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Target Object Type</label>
          <div className={`px-3 py-2 rounded border text-sm ${OBJECT_CONFIG[selectedAction.objectType].bg}`}>
            {selectedAction.objectType}
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Icon</label>
          <div className="p-2 rounded bg-[#0a0e1a] border border-[#1f2937] flex items-center justify-center">
            {(() => {
              const Icon = KIND_ICON[selectedAction.kind];
              return <Icon className="h-5 w-5 text-blue-400" />;
            })()}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4 pt-2 border-t border-[#1f2937]">
        <div>
          <div className="text-xs text-gray-500">גרסה</div>
          <div className="text-sm font-mono text-white">{selectedAction.version}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">סטטוס</div>
          <Badge className={`text-[10px] ${
            selectedAction.status === "deployed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" :
            selectedAction.status === "draft" ? "bg-amber-500/10 text-amber-400 border-amber-500/30" :
            "bg-gray-500/10 text-gray-400 border-gray-500/30"
          }`}>{selectedAction.status}</Badge>
        </div>
        <div>
          <div className="text-xs text-gray-500">סך הרצות</div>
          <div className="text-sm text-white">{selectedAction.totalExecutions.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">שיעור הצלחה</div>
          <div className="text-sm text-emerald-400">{selectedAction.successRate}%</div>
        </div>
      </div>
    </div>
  );

  const renderTabParameters = () => (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-gray-400">{selectedAction.parameters.length} פרמטרים</div>
        <Button size="sm" className="h-6 text-[10px] bg-blue-600 hover:bg-blue-700">
          <Plus className="h-3 w-3 ml-1" /> הוסף פרמטר
        </Button>
      </div>
      <div className="space-y-2">
        {selectedAction.parameters.map((param, i) => {
          const typeIcons: Record<ParamType, any> = {
            string: Type, number: Hash, boolean: ToggleLeft, date: Calendar,
            enum: Layers, reference: Link2, array: Database,
          };
          const TypeIcon = typeIcons[param.type];
          return (
            <div key={i} className="p-3 bg-[#0a0e1a] border border-[#1f2937] rounded hover:border-blue-500/40">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <TypeIcon className="h-4 w-4 text-blue-400" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-white" dir="ltr">{param.name}</span>
                      {param.required && (
                        <Badge className="text-[9px] bg-red-500/10 text-red-400 border-red-500/30">
                          חובה
                        </Badge>
                      )}
                      <Badge className="text-[9px] bg-blue-500/10 text-blue-400 border-blue-500/30">
                        {param.type}
                      </Badge>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{param.displayName}</div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button className="p-1 text-gray-600 hover:text-white"><Edit3 className="h-3 w-3" /></button>
                  <button className="p-1 text-gray-600 hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-500">
                {param.default !== undefined && (
                  <span>Default: <code className="text-gray-300" dir="ltr">{String(param.default)}</code></span>
                )}
                {param.validation && (
                  <span>Validation: <code className="text-amber-300" dir="ltr">{param.validation}</code></span>
                )}
                {param.refType && (
                  <span>Reference: <code className="text-purple-300" dir="ltr">{param.refType}</code></span>
                )}
                {param.enumValues && (
                  <span>Values: <code className="text-cyan-300" dir="ltr">[{param.enumValues.join(", ")}]</code></span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderTabValidation = () => (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-gray-400">{selectedAction.validationRules.length} חוקי Validation</div>
        <Button size="sm" className="h-6 text-[10px] bg-blue-600 hover:bg-blue-700">
          <Plus className="h-3 w-3 ml-1" /> הוסף חוק
        </Button>
      </div>
      <div className="space-y-2">
        {selectedAction.validationRules.map((rule) => (
          <div key={rule.id} className="p-3 bg-[#0a0e1a] border border-[#1f2937] rounded">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2">
                {rule.severity === "error" ? (
                  <XOctagon className="h-4 w-4 text-red-400 mt-0.5" />
                ) : rule.severity === "warning" ? (
                  <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-blue-400 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white font-medium">{rule.name}</span>
                    <Badge className={`text-[9px] ${
                      rule.severity === "error" ? "bg-red-500/10 text-red-400 border-red-500/30" :
                      rule.severity === "warning" ? "bg-amber-500/10 text-amber-400 border-amber-500/30" :
                      "bg-blue-500/10 text-blue-400 border-blue-500/30"
                    }`}>
                      {rule.severity}
                    </Badge>
                    {rule.enabled ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <XCircle className="h-3 w-3 text-gray-500" />
                    )}
                  </div>
                  <pre className="text-[11px] font-mono text-cyan-300 mt-1 bg-[#111827] px-2 py-1 rounded border border-[#1f2937] overflow-x-auto" dir="ltr">
                    {rule.expression}
                  </pre>
                  <div className="text-[11px] text-gray-500 mt-1">
                    <span className="text-gray-600">הודעת שגיאה:</span> {rule.errorMessage}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderTabSideEffects = () => (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-gray-400">{selectedAction.sideEffects.length} Side Effects</div>
        <Button size="sm" className="h-6 text-[10px] bg-blue-600 hover:bg-blue-700">
          <Plus className="h-3 w-3 ml-1" /> הוסף אפקט
        </Button>
      </div>
      <div className="space-y-2">
        {selectedAction.sideEffects.map((effect) => {
          const typeIcons: Record<string, any> = {
            update: Edit3, create: Plus, notify: Bell, webhook: Workflow, email: MessageSquare,
          };
          const typeColors: Record<string, string> = {
            update: "text-blue-400 bg-blue-500/10 border-blue-500/30",
            create: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
            notify: "text-amber-400 bg-amber-500/10 border-amber-500/30",
            webhook: "text-purple-400 bg-purple-500/10 border-purple-500/30",
            email: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
          };
          const Icon = typeIcons[effect.type];
          return (
            <div key={effect.id} className="p-3 bg-[#0a0e1a] border border-[#1f2937] rounded flex items-center gap-3">
              <div className={`p-2 rounded ${typeColors[effect.type]}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Badge className={`text-[9px] ${typeColors[effect.type]}`}>
                    {effect.type}
                  </Badge>
                  <span className="text-sm text-white">{effect.target}</span>
                  {effect.async && (
                    <Badge className="text-[9px] bg-gray-500/10 text-gray-400 border-gray-500/30">
                      async
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">{effect.description}</div>
              </div>
              <ArrowRight className="h-3 w-3 text-gray-600" />
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderTabApproval = () => (
    <div>
      {selectedAction.requiresApproval ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded">
            <Shield className="h-4 w-4 text-amber-400" />
            <span className="text-sm text-amber-400">פעולה זו דורשת אישור</span>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-2">שרשרת אישורים</div>
            <div className="space-y-2">
              {selectedAction.approvalChain?.map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-[10px] text-blue-400 font-bold">
                    {step.order}
                  </div>
                  <div className="flex-1 p-2 bg-[#0a0e1a] border border-[#1f2937] rounded flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-3 w-3 text-gray-500" />
                      <span className="text-sm text-white">{step.role}</span>
                      <Badge className="text-[9px] bg-blue-500/10 text-blue-400 border-blue-500/30">
                        {step.count} נדרש
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-gray-500">
                      <Timer className="h-3 w-3" /> {step.timeoutHours}h timeout
                    </div>
                  </div>
                  {i < (selectedAction.approvalChain?.length || 0) - 1 && (
                    <ChevronDown className="h-3 w-3 text-gray-600" />
                  )}
                </div>
              ))}
            </div>
          </div>
          {selectedAction.escalationEmail && (
            <div className="p-3 bg-[#0a0e1a] border border-[#1f2937] rounded">
              <div className="text-xs text-gray-400 mb-1">Escalation Email</div>
              <div className="text-sm text-white font-mono" dir="ltr">{selectedAction.escalationEmail}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
          <div className="text-sm text-gray-400">פעולה זו אינה דורשת אישור — מתבצעת מיידית</div>
          <Button size="sm" className="mt-3 bg-blue-600 hover:bg-blue-700 text-xs">
            הוסף Approval Workflow
          </Button>
        </div>
      )}
    </div>
  );

  const renderTabTests = () => (
    <div className="space-y-3">
      <div className="p-3 bg-[#0a0e1a] border border-[#1f2937] rounded">
        <div className="text-xs text-gray-400 mb-2">Sample Input</div>
        <pre className="text-[11px] font-mono text-cyan-300 bg-[#111827] p-2 rounded overflow-x-auto" dir="ltr">
{`{
  ${selectedAction.parameters.slice(0, 3).map((p) =>
    `"${p.name}": ${p.type === "string" ? '"sample"' : p.type === "number" ? "1000" : p.type === "boolean" ? "true" : '"ref_id"'}`
  ).join(",\n  ")}
}`}
        </pre>
        <Button size="sm" className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-xs">
          <PlayCircle className="h-3 w-3 ml-1" /> הרץ סימולציה
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-[#0a0e1a] border border-[#1f2937] rounded">
          <div className="text-xs text-gray-400 mb-2 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-500" /> Before State
          </div>
          <pre className="text-[10px] font-mono text-gray-300 bg-[#111827] p-2 rounded" dir="ltr">
{`{
  "status": "pending",
  "total": 0,
  "updated_by": null
}`}
          </pre>
        </div>
        <div className="p-3 bg-[#0a0e1a] border border-[#1f2937] rounded">
          <div className="text-xs text-gray-400 mb-2 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> After State
          </div>
          <pre className="text-[10px] font-mono text-emerald-300 bg-[#111827] p-2 rounded" dir="ltr">
{`{
  "status": "confirmed",
  "total": 1000,
  "updated_by": "user"
}`}
          </pre>
        </div>
      </div>
      <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        <span className="text-sm text-emerald-400">כל בדיקות ה-validation עברו בהצלחה</span>
      </div>
    </div>
  );

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white flex flex-col">
      {/* TOP BAR */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#111827] border-b border-[#1f2937]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/40">
            <Zap className="h-5 w-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Actions Studio — בניית פעולות Writeback</h1>
            <p className="text-xs text-gray-500">הגדר ופרוס פעולות מוטציה על אובייקטי האונטולוגיה</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-4 mr-4 text-xs">
            <div className="text-gray-400">
              <span className="text-white font-mono">{stats.total}</span> פעולות
            </div>
            <div className="text-gray-400">
              <span className="text-emerald-400 font-mono">{stats.deployed}</span> deployed
            </div>
            <div className="text-gray-400">
              <span className="text-amber-400 font-mono">{stats.drafts}</span> drafts
            </div>
            <div className="text-gray-400">
              <span className="text-blue-400 font-mono">{stats.totalRuns.toLocaleString()}</span> הרצות
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 text-xs text-gray-300 hover:bg-[#1f2937]">
            <PlayCircle className="h-3.5 w-3.5 ml-1" /> Test
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs text-gray-300 hover:bg-[#1f2937]">
            <Save className="h-3.5 w-3.5 ml-1" /> שמור
          </Button>
          <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700">
            <Upload className="h-3.5 w-3.5 ml-1" /> Deploy
          </Button>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="flex-1 grid grid-cols-12 gap-0 overflow-hidden">
        {/* LEFT: Action List */}
        <div className="col-span-3 bg-[#0f172a] border-l border-[#1f2937] flex flex-col">
          <div className="p-3 border-b border-[#1f2937]">
            <div className="relative mb-2">
              <Search className="absolute right-2 top-2 h-3 w-3 text-gray-500" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חפש פעולה..."
                className="w-full bg-[#0a0e1a] border border-[#1f2937] rounded pr-7 pl-2 py-1.5 text-xs text-white placeholder-gray-500"
              />
            </div>
            <Button size="sm" className="w-full h-7 text-[10px] bg-blue-600 hover:bg-blue-700">
              <Plus className="h-3 w-3 ml-1" /> פעולה חדשה
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {Object.entries(grouped).map(([objType, items]) => {
              const config = OBJECT_CONFIG[objType as ObjectType];
              const Icon = config.icon;
              const isExpanded = expandedGroups[objType];
              return (
                <div key={objType}>
                  <div
                    onClick={() => toggleGroup(objType)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#111827] border-y border-[#1f2937] cursor-pointer hover:bg-[#1f2937]"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3 text-gray-500" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-gray-500" />
                    )}
                    <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                    <span className="text-xs font-semibold text-white">{objType}</span>
                    <Badge className="text-[9px] bg-[#0a0e1a] border-[#1f2937] text-gray-400 mr-auto">
                      {items.length}
                    </Badge>
                  </div>
                  {isExpanded && (
                    <div>
                      {items.map((action) => {
                        const KindIcon = KIND_ICON[action.kind];
                        return (
                          <div
                            key={action.id}
                            onClick={() => setSelectedActionId(action.id)}
                            className={`px-3 py-2 border-b border-[#1f2937] cursor-pointer hover:bg-[#1f2937] ${
                              selectedActionId === action.id ? "bg-blue-500/10 border-r-2 border-r-blue-500" : ""
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <KindIcon className="h-3 w-3 text-gray-500 mt-0.5 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-mono text-white truncate" dir="ltr">
                                  {action.apiName}
                                </div>
                                <div className="text-[10px] text-gray-400 truncate">
                                  {action.displayName}
                                </div>
                                <div className="flex items-center gap-1 mt-1">
                                  <Badge className={`text-[8px] px-1 py-0 ${KIND_CONFIG[action.kind].color}`}>
                                    {KIND_CONFIG[action.kind].label}
                                  </Badge>
                                  {action.status === "draft" && (
                                    <Badge className="text-[8px] px-1 py-0 bg-amber-500/10 text-amber-400 border-amber-500/30">
                                      draft
                                    </Badge>
                                  )}
                                  {action.requiresApproval && (
                                    <Lock className="h-2.5 w-2.5 text-amber-400" />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* MAIN: Editor */}
        <div className="col-span-6 bg-[#0a0e1a] flex flex-col overflow-hidden">
          {/* Title */}
          <div className="px-4 py-3 bg-[#0f172a] border-b border-[#1f2937]">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded border ${OBJECT_CONFIG[selectedAction.objectType].bg}`}>
                {(() => {
                  const Icon = OBJECT_CONFIG[selectedAction.objectType].icon;
                  return <Icon className={`h-5 w-5 ${OBJECT_CONFIG[selectedAction.objectType].color}`} />;
                })()}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white">{selectedAction.displayName}</h2>
                  <code className="text-xs text-gray-500" dir="ltr">{selectedAction.apiName}</code>
                </div>
                <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-3">
                  <span>v{selectedAction.version}</span>
                  <span>עודכן: {selectedAction.lastModified}</span>
                  <span>ע"י: {selectedAction.modifiedBy}</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-400 hover:bg-[#1f2937]">
                <Copy className="h-3 w-3 ml-1" /> שכפל
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[#1f2937] bg-[#0f172a]">
            {([
              { id: "settings", label: "הגדרות", icon: Settings },
              { id: "parameters", label: "פרמטרים", icon: Hash },
              { id: "validation", label: "חוקי Validation", icon: Shield },
              { id: "sideEffects", label: "Side Effects", icon: Workflow },
              { id: "approval", label: "Approval Workflow", icon: CheckCheck },
              { id: "tests", label: "Test Runs", icon: PlayCircle },
            ] as const).map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-blue-500 text-white bg-[#111827]"
                      : "border-transparent text-gray-500 hover:text-gray-300"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === "settings" && renderTabSettings()}
            {activeTab === "parameters" && renderTabParameters()}
            {activeTab === "validation" && renderTabValidation()}
            {activeTab === "sideEffects" && renderTabSideEffects()}
            {activeTab === "approval" && renderTabApproval()}
            {activeTab === "tests" && renderTabTests()}
          </div>
        </div>

        {/* RIGHT: Execution History */}
        <div className="col-span-3 bg-[#0f172a] border-r border-[#1f2937] flex flex-col overflow-hidden">
          <div className="p-3 border-b border-[#1f2937]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase">היסטוריית הרצות</span>
              <BarChart3 className="h-3 w-3 text-gray-500" />
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {selectedActionRuns.length} הרצות אחרונות · {selectedAction.apiName}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {selectedActionRuns.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-500">
                אין הרצות לפעולה זו
              </div>
            ) : (
              selectedActionRuns.map((run) => (
                <div key={run.id} className="p-2.5 bg-[#111827] border border-[#1f2937] rounded hover:border-blue-500/40">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      {run.status === "success" && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
                      {run.status === "failure" && <XCircle className="h-3 w-3 text-red-400" />}
                      {run.status === "pending" && <Clock className="h-3 w-3 text-amber-400" />}
                      {run.status === "rejected" && <XOctagon className="h-3 w-3 text-red-400" />}
                      <Badge className={`text-[9px] ${
                        run.status === "success" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" :
                        run.status === "failure" ? "bg-red-500/10 text-red-400 border-red-500/30" :
                        run.status === "pending" ? "bg-amber-500/10 text-amber-400 border-amber-500/30" :
                        "bg-red-500/10 text-red-400 border-red-500/30"
                      }`}>
                        {run.status}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-gray-500">{run.duration}ms</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-gray-400 mb-1">
                    <User className="h-2.5 w-2.5" />
                    <span className="text-white">{run.user}</span>
                    <span className="text-gray-600">·</span>
                    <span>{run.userRole}</span>
                  </div>
                  <div className="text-[10px] text-gray-500 mb-1.5" dir="ltr">
                    {run.timestamp}
                  </div>
                  <pre className="text-[9px] font-mono text-gray-300 bg-[#0a0e1a] p-1.5 rounded border border-[#1f2937] overflow-hidden" dir="ltr">
                    {JSON.stringify(run.parameters, null, 0).slice(0, 120)}
                    {JSON.stringify(run.parameters).length > 120 && "..."}
                  </pre>
                  {run.before && run.after && (
                    <div className="mt-1 grid grid-cols-2 gap-1">
                      <div className="text-[9px] bg-red-500/5 border border-red-500/20 rounded p-1">
                        <div className="text-red-400 mb-0.5">Before</div>
                        <code className="text-gray-400 block truncate" dir="ltr">
                          {JSON.stringify(run.before).slice(0, 40)}
                        </code>
                      </div>
                      <div className="text-[9px] bg-emerald-500/5 border border-emerald-500/20 rounded p-1">
                        <div className="text-emerald-400 mb-0.5">After</div>
                        <code className="text-gray-400 block truncate" dir="ltr">
                          {JSON.stringify(run.after).slice(0, 40)}
                        </code>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="p-2 border-t border-[#1f2937]">
            <Button variant="ghost" size="sm" className="w-full h-7 text-[10px] text-gray-400 hover:bg-[#1f2937]">
              <Eye className="h-3 w-3 ml-1" /> הצג את כל ההרצות
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
