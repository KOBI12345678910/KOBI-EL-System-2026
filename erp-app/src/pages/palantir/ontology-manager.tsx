import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Database, Users, Truck, Package, ShoppingCart, Briefcase, FileText,
  UserCircle, Warehouse, Layers, Wrench, Search, Plus, Download,
  Link2, Zap, Settings, CheckCircle2, XCircle, Key, Eye, Edit3,
  AlertTriangle, Shield, ChevronRight, Hash, Type, Calendar,
  ToggleLeft, Box, Tag, Globe, Lock, Play,
} from "lucide-react";

type ObjectType = {
  id: string;
  apiName: string;
  displayName: string;
  hebrew: string;
  icon: any;
  color: string;
  count: number;
  description: string;
  primaryKey: string;
  version: string;
  status: "production" | "draft" | "deprecated";
};

type Property = {
  apiName: string;
  displayName: string;
  dataType: "string" | "number" | "date" | "boolean" | "reference" | "enum" | "money";
  required: boolean;
  searchable: boolean;
  indexed: boolean;
  unique: boolean;
  description: string;
};

type LinkType = {
  id: string;
  source: string;
  target: string;
  relationship: string;
  cardinality: "one-to-one" | "one-to-many" | "many-to-many";
  bidirectional: boolean;
  description: string;
};

type ActionType = {
  id: string;
  apiName: string;
  displayName: string;
  objectType: string;
  kind: "create" | "update" | "delete" | "function";
  parameters: number;
  requiresApproval: boolean;
  rules: string[];
  description: string;
};

const OBJECT_TYPES: ObjectType[] = [
  { id: "customer", apiName: "Customer", displayName: "Customer", hebrew: "לקוח", icon: Users, color: "text-blue-400", count: 1247, description: "לקוחות קצה של הארגון", primaryKey: "customerId", version: "v3.2.1", status: "production" },
  { id: "supplier", apiName: "Supplier", displayName: "Supplier", hebrew: "ספק", icon: Truck, color: "text-emerald-400", count: 342, description: "ספקי חומרי גלם ושירותים", primaryKey: "supplierId", version: "v2.8.0", status: "production" },
  { id: "item", apiName: "Item", displayName: "Item", hebrew: "פריט מלאי", icon: Package, color: "text-amber-400", count: 8942, description: "פריטי מלאי (חומרי גלם ומוצרים מוגמרים)", primaryKey: "sku", version: "v4.1.0", status: "production" },
  { id: "purchase_order", apiName: "PurchaseOrder", displayName: "Purchase Order", hebrew: "הזמנת רכש", icon: ShoppingCart, color: "text-violet-400", count: 2134, description: "הזמנות רכש מספקים", primaryKey: "poNumber", version: "v3.0.5", status: "production" },
  { id: "project", apiName: "Project", displayName: "Project", hebrew: "פרויקט", icon: Briefcase, color: "text-cyan-400", count: 187, description: "פרויקטים פעילים בארגון", primaryKey: "projectCode", version: "v2.5.2", status: "production" },
  { id: "invoice", apiName: "Invoice", displayName: "Invoice", hebrew: "חשבונית", icon: FileText, color: "text-yellow-400", count: 4821, description: "חשבוניות לקוח וספק", primaryKey: "invoiceNumber", version: "v3.3.1", status: "production" },
  { id: "employee", apiName: "Employee", displayName: "Employee", hebrew: "עובד", icon: UserCircle, color: "text-pink-400", count: 268, description: "עובדי הארגון", primaryKey: "employeeId", version: "v2.1.0", status: "production" },
  { id: "warehouse", apiName: "Warehouse", displayName: "Warehouse", hebrew: "מחסן", icon: Warehouse, color: "text-orange-400", count: 12, description: "מחסנים ומיקומי אחסון", primaryKey: "warehouseCode", version: "v1.9.0", status: "production" },
  { id: "bom", apiName: "BillOfMaterials", displayName: "BOM", hebrew: "עץ מוצר", icon: Layers, color: "text-teal-400", count: 523, description: "עצי מוצר ורשימות חומרים", primaryKey: "bomId", version: "v3.0.0", status: "production" },
  { id: "work_order", apiName: "WorkOrder", displayName: "Work Order", hebrew: "הזמנת עבודה", icon: Wrench, color: "text-rose-400", count: 892, description: "הזמנות עבודת ייצור", primaryKey: "workOrderId", version: "v2.7.4", status: "production" },
];

const PROPERTIES_BY_TYPE: Record<string, Property[]> = {
  customer: [
    { apiName: "customerId", displayName: "מזהה לקוח", dataType: "string", required: true, searchable: true, indexed: true, unique: true, description: "מזהה ייחודי של הלקוח" },
    { apiName: "companyName", displayName: "שם חברה", dataType: "string", required: true, searchable: true, indexed: true, unique: false, description: "שם החברה הרשמי" },
    { apiName: "taxId", displayName: "מספר עוסק", dataType: "string", required: true, searchable: true, indexed: true, unique: true, description: "מספר רישום העוסק" },
    { apiName: "contactEmail", displayName: "אימייל ראשי", dataType: "string", required: false, searchable: true, indexed: true, unique: false, description: "כתובת אימייל לקשר" },
    { apiName: "contactPhone", displayName: "טלפון", dataType: "string", required: false, searchable: true, indexed: false, unique: false, description: "מספר טלפון" },
    { apiName: "creditLimit", displayName: "מסגרת אשראי", dataType: "money", required: false, searchable: false, indexed: false, unique: false, description: "מסגרת אשראי שאושרה" },
    { apiName: "tier", displayName: "דירוג לקוח", dataType: "enum", required: true, searchable: true, indexed: true, unique: false, description: "Gold / Silver / Bronze" },
    { apiName: "createdAt", displayName: "תאריך הצטרפות", dataType: "date", required: true, searchable: false, indexed: true, unique: false, description: "תאריך יצירת הלקוח" },
    { apiName: "isActive", displayName: "פעיל", dataType: "boolean", required: true, searchable: true, indexed: true, unique: false, description: "האם הלקוח פעיל" },
    { apiName: "accountManager", displayName: "מנהל תיק", dataType: "reference", required: false, searchable: true, indexed: true, unique: false, description: "הפניה לעובד מנהל תיק" },
  ],
  supplier: [
    { apiName: "supplierId", displayName: "מזהה ספק", dataType: "string", required: true, searchable: true, indexed: true, unique: true, description: "מזהה ייחודי של הספק" },
    { apiName: "supplierName", displayName: "שם ספק", dataType: "string", required: true, searchable: true, indexed: true, unique: false, description: "שם הספק" },
    { apiName: "category", displayName: "קטגוריה", dataType: "enum", required: true, searchable: true, indexed: true, unique: false, description: "קטגוריית הספק" },
    { apiName: "rating", displayName: "דירוג", dataType: "number", required: false, searchable: true, indexed: true, unique: false, description: "דירוג 1-5" },
    { apiName: "paymentTerms", displayName: "תנאי תשלום", dataType: "string", required: true, searchable: false, indexed: false, unique: false, description: "שוטף 30 / 60 / 90" },
    { apiName: "onTimeDelivery", displayName: "עמידה בלו״ז", dataType: "number", required: false, searchable: true, indexed: false, unique: false, description: "אחוז אספקה בזמן" },
  ],
  item: [
    { apiName: "sku", displayName: "מק״ט", dataType: "string", required: true, searchable: true, indexed: true, unique: true, description: "מספר קטלוגי" },
    { apiName: "name", displayName: "שם פריט", dataType: "string", required: true, searchable: true, indexed: true, unique: false, description: "שם הפריט" },
    { apiName: "category", displayName: "קטגוריה", dataType: "enum", required: true, searchable: true, indexed: true, unique: false, description: "קטגוריית הפריט" },
    { apiName: "unitCost", displayName: "עלות יחידה", dataType: "money", required: true, searchable: false, indexed: false, unique: false, description: "מחיר עלות ליחידה" },
    { apiName: "stockLevel", displayName: "רמת מלאי", dataType: "number", required: true, searchable: true, indexed: true, unique: false, description: "כמות זמינה" },
    { apiName: "minStock", displayName: "מלאי מינימום", dataType: "number", required: true, searchable: false, indexed: false, unique: false, description: "סף התראת חוסר" },
    { apiName: "barcode", displayName: "ברקוד", dataType: "string", required: false, searchable: true, indexed: true, unique: true, description: "ברקוד הפריט" },
  ],
  purchase_order: [
    { apiName: "poNumber", displayName: "מספר הזמנה", dataType: "string", required: true, searchable: true, indexed: true, unique: true, description: "מספר הזמנת רכש" },
    { apiName: "supplierId", displayName: "ספק", dataType: "reference", required: true, searchable: true, indexed: true, unique: false, description: "הפניה לספק" },
    { apiName: "totalAmount", displayName: "סכום כולל", dataType: "money", required: true, searchable: false, indexed: true, unique: false, description: "סכום ההזמנה" },
    { apiName: "status", displayName: "סטטוס", dataType: "enum", required: true, searchable: true, indexed: true, unique: false, description: "פתוחה/סגורה/מאושרת" },
    { apiName: "orderDate", displayName: "תאריך הזמנה", dataType: "date", required: true, searchable: true, indexed: true, unique: false, description: "תאריך יצירת ההזמנה" },
    { apiName: "expectedDelivery", displayName: "תאריך אספקה", dataType: "date", required: false, searchable: true, indexed: true, unique: false, description: "תאריך אספקה צפוי" },
    { apiName: "approvedBy", displayName: "אושר על ידי", dataType: "reference", required: false, searchable: true, indexed: true, unique: false, description: "עובד המאשר" },
  ],
  project: [
    { apiName: "projectCode", displayName: "קוד פרויקט", dataType: "string", required: true, searchable: true, indexed: true, unique: true, description: "קוד ייחודי לפרויקט" },
    { apiName: "projectName", displayName: "שם פרויקט", dataType: "string", required: true, searchable: true, indexed: true, unique: false, description: "שם תיאורי" },
    { apiName: "customerId", displayName: "לקוח", dataType: "reference", required: true, searchable: true, indexed: true, unique: false, description: "הלקוח המזמין" },
    { apiName: "budget", displayName: "תקציב", dataType: "money", required: true, searchable: false, indexed: false, unique: false, description: "תקציב פרויקט" },
    { apiName: "startDate", displayName: "תאריך התחלה", dataType: "date", required: true, searchable: true, indexed: true, unique: false, description: "תאריך תחילה" },
    { apiName: "endDate", displayName: "תאריך סיום", dataType: "date", required: false, searchable: true, indexed: true, unique: false, description: "תאריך סיום צפוי" },
    { apiName: "projectManager", displayName: "מנהל פרויקט", dataType: "reference", required: true, searchable: true, indexed: true, unique: false, description: "עובד מנהל" },
    { apiName: "status", displayName: "סטטוס", dataType: "enum", required: true, searchable: true, indexed: true, unique: false, description: "תכנון/ביצוע/הושלם" },
  ],
  invoice: [
    { apiName: "invoiceNumber", displayName: "מספר חשבונית", dataType: "string", required: true, searchable: true, indexed: true, unique: true, description: "מספר ייחודי" },
    { apiName: "customerId", displayName: "לקוח", dataType: "reference", required: true, searchable: true, indexed: true, unique: false, description: "הפניה ללקוח" },
    { apiName: "amount", displayName: "סכום", dataType: "money", required: true, searchable: false, indexed: true, unique: false, description: "סכום החשבונית" },
    { apiName: "issueDate", displayName: "תאריך הנפקה", dataType: "date", required: true, searchable: true, indexed: true, unique: false, description: "תאריך הנפקה" },
    { apiName: "dueDate", displayName: "תאריך פרעון", dataType: "date", required: true, searchable: true, indexed: true, unique: false, description: "תאריך לתשלום" },
    { apiName: "status", displayName: "סטטוס תשלום", dataType: "enum", required: true, searchable: true, indexed: true, unique: false, description: "שולמה/פתוחה/באיחור" },
  ],
  employee: [
    { apiName: "employeeId", displayName: "מספר עובד", dataType: "string", required: true, searchable: true, indexed: true, unique: true, description: "מזהה עובד" },
    { apiName: "fullName", displayName: "שם מלא", dataType: "string", required: true, searchable: true, indexed: true, unique: false, description: "שם מלא" },
    { apiName: "email", displayName: "אימייל", dataType: "string", required: true, searchable: true, indexed: true, unique: true, description: "אימייל ארגוני" },
    { apiName: "department", displayName: "מחלקה", dataType: "enum", required: true, searchable: true, indexed: true, unique: false, description: "מחלקה" },
    { apiName: "role", displayName: "תפקיד", dataType: "string", required: true, searchable: true, indexed: true, unique: false, description: "תפקיד" },
    { apiName: "hireDate", displayName: "תאריך קליטה", dataType: "date", required: true, searchable: false, indexed: true, unique: false, description: "תאריך קליטה" },
  ],
  warehouse: [
    { apiName: "warehouseCode", displayName: "קוד מחסן", dataType: "string", required: true, searchable: true, indexed: true, unique: true, description: "מזהה המחסן" },
    { apiName: "name", displayName: "שם", dataType: "string", required: true, searchable: true, indexed: true, unique: false, description: "שם המחסן" },
    { apiName: "address", displayName: "כתובת", dataType: "string", required: true, searchable: true, indexed: false, unique: false, description: "כתובת פיזית" },
    { apiName: "capacity", displayName: "קיבולת", dataType: "number", required: false, searchable: false, indexed: false, unique: false, description: "קיבולת במ״ק" },
  ],
  bom: [
    { apiName: "bomId", displayName: "מזהה BOM", dataType: "string", required: true, searchable: true, indexed: true, unique: true, description: "מזהה ייחודי" },
    { apiName: "productSku", displayName: "מוצר", dataType: "reference", required: true, searchable: true, indexed: true, unique: false, description: "הפריט המיוצר" },
    { apiName: "version", displayName: "גרסה", dataType: "string", required: true, searchable: true, indexed: true, unique: false, description: "גרסת BOM" },
    { apiName: "isActive", displayName: "פעיל", dataType: "boolean", required: true, searchable: true, indexed: true, unique: false, description: "BOM פעיל" },
  ],
  work_order: [
    { apiName: "workOrderId", displayName: "מספר הזמנת עבודה", dataType: "string", required: true, searchable: true, indexed: true, unique: true, description: "מזהה" },
    { apiName: "bomId", displayName: "BOM", dataType: "reference", required: true, searchable: true, indexed: true, unique: false, description: "עץ מוצר" },
    { apiName: "quantity", displayName: "כמות", dataType: "number", required: true, searchable: true, indexed: false, unique: false, description: "כמות ליצור" },
    { apiName: "startDate", displayName: "תאריך התחלה", dataType: "date", required: true, searchable: true, indexed: true, unique: false, description: "תאריך תחילה" },
    { apiName: "status", displayName: "סטטוס", dataType: "enum", required: true, searchable: true, indexed: true, unique: false, description: "סטטוס הייצור" },
  ],
};

const LINK_TYPES: LinkType[] = [
  { id: "l1", source: "Customer", target: "Invoice", relationship: "issued-to", cardinality: "one-to-many", bidirectional: true, description: "לקוח מקבל חשבוניות" },
  { id: "l2", source: "Customer", target: "Project", relationship: "owns", cardinality: "one-to-many", bidirectional: true, description: "לקוח בעלים של פרויקטים" },
  { id: "l3", source: "Supplier", target: "PurchaseOrder", relationship: "fulfills", cardinality: "one-to-many", bidirectional: true, description: "ספק מספק להזמנות" },
  { id: "l4", source: "Supplier", target: "Item", relationship: "supplies", cardinality: "many-to-many", bidirectional: true, description: "ספק מספק פריטים" },
  { id: "l5", source: "PurchaseOrder", target: "Item", relationship: "contains", cardinality: "one-to-many", bidirectional: false, description: "הזמנה מכילה פריטים" },
  { id: "l6", source: "Project", target: "Employee", relationship: "staffed-by", cardinality: "many-to-many", bidirectional: true, description: "פרויקט מאויש ע״י עובדים" },
  { id: "l7", source: "Project", target: "WorkOrder", relationship: "has", cardinality: "one-to-many", bidirectional: true, description: "פרויקט מכיל הזמנות עבודה" },
  { id: "l8", source: "BOM", target: "Item", relationship: "composed-of", cardinality: "many-to-many", bidirectional: false, description: "עץ מוצר בנוי מפריטים" },
  { id: "l9", source: "WorkOrder", target: "BOM", relationship: "executes", cardinality: "many-to-many", bidirectional: true, description: "הזמנת עבודה מבצעת BOM" },
  { id: "l10", source: "Item", target: "Warehouse", relationship: "stored-at", cardinality: "many-to-many", bidirectional: true, description: "פריט מאוחסן במחסן" },
  { id: "l11", source: "Employee", target: "Customer", relationship: "manages", cardinality: "one-to-many", bidirectional: true, description: "עובד מנהל לקוחות" },
  { id: "l12", source: "Customer", target: "PurchaseOrder", relationship: "requested", cardinality: "one-to-many", bidirectional: true, description: "לקוח ביקש רכש" },
  { id: "l13", source: "Invoice", target: "Project", relationship: "billed-for", cardinality: "many-to-one", bidirectional: true, description: "חשבונית בגין פרויקט" },
  { id: "l14", source: "WorkOrder", target: "Employee", relationship: "assigned-to", cardinality: "many-to-many", bidirectional: true, description: "הזמנת עבודה משויכת" },
  { id: "l15", source: "PurchaseOrder", target: "Invoice", relationship: "matched-to", cardinality: "one-to-one", bidirectional: true, description: "התאמת PO-חשבונית" },
  { id: "l16", source: "Supplier", target: "Employee", relationship: "managed-by", cardinality: "many-to-one", bidirectional: true, description: "ספק מנוהל ע״י רוכש" },
  { id: "l17", source: "Project", target: "Invoice", relationship: "generates", cardinality: "one-to-many", bidirectional: true, description: "פרויקט מייצר חשבוניות" },
  { id: "l18", source: "Item", target: "BOM", relationship: "referenced-by", cardinality: "many-to-many", bidirectional: false, description: "פריט מופיע בעצי מוצר" },
  { id: "l19", source: "Warehouse", target: "WorkOrder", relationship: "produces-for", cardinality: "one-to-many", bidirectional: false, description: "מחסן מייעד" },
  { id: "l20", source: "Employee", target: "Employee", relationship: "reports-to", cardinality: "many-to-one", bidirectional: true, description: "עובד מדווח למנהל" },
];

const ACTION_TYPES: ActionType[] = [
  { id: "a1", apiName: "createCustomer", displayName: "יצירת לקוח חדש", objectType: "Customer", kind: "create", parameters: 8, requiresApproval: false, rules: ["שם חברה חובה", "מספר עוסק ייחודי"], description: "יצירת רשומת לקוח חדשה" },
  { id: "a2", apiName: "updateCustomerTier", displayName: "עדכון דירוג לקוח", objectType: "Customer", kind: "update", parameters: 2, requiresApproval: true, rules: ["דורש אישור מנהל מכירות"], description: "שדרוג/שנמוך דירוג לקוח" },
  { id: "a3", apiName: "deactivateCustomer", displayName: "השבתת לקוח", objectType: "Customer", kind: "update", parameters: 2, requiresApproval: true, rules: ["לא יכול להיות יתרה פתוחה"], description: "השבתת לקוח" },
  { id: "a4", apiName: "createPurchaseOrder", displayName: "יצירת הזמנת רכש", objectType: "PurchaseOrder", kind: "create", parameters: 6, requiresApproval: false, rules: ["ספק מאושר", "כמות > 0"], description: "יצירת הזמנת רכש חדשה" },
  { id: "a5", apiName: "approvePurchaseOrder", displayName: "אישור הזמנת רכש", objectType: "PurchaseOrder", kind: "update", parameters: 2, requiresApproval: true, rules: ["סכום > 10K דורש מנהל", "סכום > 100K דורש CEO"], description: "אישור הזמנת רכש לבצוע" },
  { id: "a6", apiName: "cancelPurchaseOrder", displayName: "ביטול הזמנה", objectType: "PurchaseOrder", kind: "update", parameters: 2, requiresApproval: true, rules: ["לפני אספקה", "סיבה חובה"], description: "ביטול הזמנת רכש" },
  { id: "a7", apiName: "receivePurchaseOrder", displayName: "קבלת סחורה", objectType: "PurchaseOrder", kind: "update", parameters: 3, requiresApproval: false, rules: ["סטטוס = אושרה"], description: "תיעוד קבלת סחורה" },
  { id: "a8", apiName: "createInvoice", displayName: "יצירת חשבונית", objectType: "Invoice", kind: "create", parameters: 5, requiresApproval: false, rules: ["לקוח פעיל", "תאריך פרעון חובה"], description: "הנפקת חשבונית ללקוח" },
  { id: "a9", apiName: "approvePayment", displayName: "אישור תשלום", objectType: "Invoice", kind: "update", parameters: 2, requiresApproval: true, rules: ["סכום > 50K דורש CFO"], description: "אישור ביצוע תשלום" },
  { id: "a10", apiName: "markInvoicePaid", displayName: "סימון כשולמה", objectType: "Invoice", kind: "update", parameters: 3, requiresApproval: false, rules: ["מספר אסמכתא חובה"], description: "סימון חשבונית כשולמה" },
  { id: "a11", apiName: "createProject", displayName: "יצירת פרויקט", objectType: "Project", kind: "create", parameters: 7, requiresApproval: true, rules: ["דורש אישור מנהל"], description: "יצירת פרויקט חדש" },
  { id: "a12", apiName: "closeProject", displayName: "סגירת פרויקט", objectType: "Project", kind: "update", parameters: 2, requiresApproval: true, rules: ["כל הליקויים סגורים"], description: "סגירה סופית של פרויקט" },
  { id: "a13", apiName: "createItem", displayName: "הוספת פריט מלאי", objectType: "Item", kind: "create", parameters: 9, requiresApproval: false, rules: ["מק״ט ייחודי"], description: "הוספת פריט חדש לקטלוג" },
  { id: "a14", apiName: "adjustStock", displayName: "התאמת מלאי", objectType: "Item", kind: "update", parameters: 3, requiresApproval: true, rules: ["סיבה חובה"], description: "התאמה ידנית של מלאי" },
  { id: "a15", apiName: "transferStock", displayName: "העברת מלאי", objectType: "Item", kind: "function", parameters: 4, requiresApproval: false, rules: ["מחסן יעד קיים"], description: "העברת מלאי בין מחסנים" },
  { id: "a16", apiName: "createSupplier", displayName: "הוספת ספק", objectType: "Supplier", kind: "create", parameters: 6, requiresApproval: true, rules: ["דורש אישור רכש"], description: "הוספת ספק חדש" },
  { id: "a17", apiName: "rateSupplier", displayName: "דירוג ספק", objectType: "Supplier", kind: "update", parameters: 3, requiresApproval: false, rules: [], description: "דירוג ביצועי ספק" },
  { id: "a18", apiName: "createWorkOrder", displayName: "יצירת הזמנת עבודה", objectType: "WorkOrder", kind: "create", parameters: 5, requiresApproval: false, rules: ["BOM פעיל"], description: "הפקת הזמנת עבודה לייצור" },
  { id: "a19", apiName: "startWorkOrder", displayName: "התחלת ייצור", objectType: "WorkOrder", kind: "update", parameters: 1, requiresApproval: false, rules: ["חומרי גלם זמינים"], description: "תחילת ייצור" },
  { id: "a20", apiName: "completeWorkOrder", displayName: "סיום עבודה", objectType: "WorkOrder", kind: "update", parameters: 2, requiresApproval: false, rules: ["QC עבר"], description: "סיום הזמנת עבודה" },
  { id: "a21", apiName: "createBOM", displayName: "יצירת BOM", objectType: "BOM", kind: "create", parameters: 4, requiresApproval: true, rules: ["דורש הנדסה"], description: "יצירת עץ מוצר חדש" },
  { id: "a22", apiName: "activateBOM", displayName: "הפעלת BOM", objectType: "BOM", kind: "update", parameters: 1, requiresApproval: true, rules: ["דורש מהנדס ראשי"], description: "הפעלת גרסת BOM" },
  { id: "a23", apiName: "onboardEmployee", displayName: "קליטת עובד", objectType: "Employee", kind: "create", parameters: 10, requiresApproval: true, rules: ["אישור HR"], description: "קליטת עובד חדש" },
  { id: "a24", apiName: "updateEmployeeRole", displayName: "שינוי תפקיד", objectType: "Employee", kind: "update", parameters: 2, requiresApproval: true, rules: ["אישור מנהל"], description: "שינוי תפקיד עובד" },
  { id: "a25", apiName: "terminateEmployee", displayName: "סיום העסקה", objectType: "Employee", kind: "update", parameters: 3, requiresApproval: true, rules: ["אישור HR + מנהל"], description: "סיום יחסי העבודה" },
  { id: "a26", apiName: "createWarehouse", displayName: "פתיחת מחסן", objectType: "Warehouse", kind: "create", parameters: 5, requiresApproval: true, rules: ["אישור תפעול"], description: "הגדרת מחסן חדש" },
  { id: "a27", apiName: "linkCustomerToProject", displayName: "שיוך לקוח לפרויקט", objectType: "Project", kind: "function", parameters: 2, requiresApproval: false, rules: [], description: "יצירת קשר לקוח-פרויקט" },
  { id: "a28", apiName: "generateInvoiceFromPO", displayName: "הפקת חשבונית מ-PO", objectType: "Invoice", kind: "function", parameters: 2, requiresApproval: false, rules: ["PO הושלם"], description: "יצירת חשבונית אוטומטית" },
  { id: "a29", apiName: "calculateBOMCost", displayName: "חישוב עלות BOM", objectType: "BOM", kind: "function", parameters: 1, requiresApproval: false, rules: [], description: "חישוב עלות כוללת של עץ מוצר" },
  { id: "a30", apiName: "reorderItem", displayName: "הזמנה חוזרת", objectType: "Item", kind: "function", parameters: 2, requiresApproval: false, rules: ["מתחת למינימום"], description: "יצירת PO אוטומטי" },
];

const INSTANCES_SAMPLE: Record<string, any[]> = {
  customer: [
    { customerId: "C-10021", companyName: "אלקטרה בנייה בע״מ", taxId: "514872341", tier: "Gold", isActive: true, creditLimit: "₪2,500,000" },
    { customerId: "C-10045", companyName: "שיכון ובינוי נדל״ן", taxId: "512483912", tier: "Gold", isActive: true, creditLimit: "₪5,000,000" },
    { customerId: "C-10089", companyName: "אפריקה ישראל", taxId: "514239812", tier: "Silver", isActive: true, creditLimit: "₪1,200,000" },
    { customerId: "C-10156", companyName: "ישראמקו נגב", taxId: "513847291", tier: "Silver", isActive: true, creditLimit: "₪800,000" },
    { customerId: "C-10234", companyName: "טבע תעשיות בע״מ", taxId: "520012341", tier: "Gold", isActive: true, creditLimit: "₪3,500,000" },
  ],
  supplier: [
    { supplierId: "S-2011", supplierName: "אל-יוניון פלדות", category: "חומרי גלם", rating: 4.8, onTimeDelivery: 96 },
    { supplierId: "S-2034", supplierName: "קלאפ עבודות ברזל", category: "חומרי גלם", rating: 4.5, onTimeDelivery: 92 },
    { supplierId: "S-2067", supplierName: "ט.מ.ל טכנולוגיות", category: "רכיבים", rating: 4.9, onTimeDelivery: 98 },
  ],
  item: [
    { sku: "ITM-4521", name: "פרופיל אלומיניום 6063-T5", category: "חומרי גלם", unitCost: "₪48", stockLevel: 2340 },
    { sku: "ITM-8812", name: "בורג פילוט 8mm נירוסטה", category: "חומרי גלם", unitCost: "₪1.8", stockLevel: 45000 },
    { sku: "ITM-1023", name: "זכוכית בידודית 24mm", category: "חומרי גלם", unitCost: "₪320", stockLevel: 180 },
  ],
};

export default function OntologyManager() {
  const [selectedType, setSelectedType] = useState<string>("customer");
  const [activeTab, setActiveTab] = useState("properties");
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["palantir-ontology"],
    queryFn: async () => {
      try {
        const res = await authFetch("/api/palantir/ontology");
        if (!res.ok) throw new Error();
        return await res.json();
      } catch {
        return { objectTypes: OBJECT_TYPES, properties: PROPERTIES_BY_TYPE, links: LINK_TYPES, actions: ACTION_TYPES, instances: INSTANCES_SAMPLE };
      }
    },
  });

  const objectTypes: ObjectType[] = data?.objectTypes || OBJECT_TYPES;
  const propertiesMap: Record<string, Property[]> = data?.properties || PROPERTIES_BY_TYPE;
  const links: LinkType[] = data?.links || LINK_TYPES;
  const actions: ActionType[] = data?.actions || ACTION_TYPES;
  const instances: Record<string, any[]> = data?.instances || INSTANCES_SAMPLE;

  const currentType = objectTypes.find((o) => o.id === selectedType) || objectTypes[0];
  const currentProperties = propertiesMap[selectedType] || [];
  const currentLinks = links.filter((l) => l.source === currentType.apiName || l.target === currentType.apiName);
  const currentActions = actions.filter((a) => a.objectType === currentType.apiName);
  const currentInstances = instances[selectedType] || [];

  const filteredTypes = objectTypes.filter(
    (o) => o.hebrew.includes(search) || o.apiName.toLowerCase().includes(search.toLowerCase())
  );

  const totalProperties = Object.values(propertiesMap).reduce((a, b) => a + b.length, 0);
  const totalInstances = objectTypes.reduce((a, b) => a + b.count, 0);

  const dataTypeIcon = (t: string) => {
    switch (t) {
      case "string": return <Type className="h-3.5 w-3.5 text-blue-400" />;
      case "number": return <Hash className="h-3.5 w-3.5 text-emerald-400" />;
      case "date": return <Calendar className="h-3.5 w-3.5 text-violet-400" />;
      case "boolean": return <ToggleLeft className="h-3.5 w-3.5 text-amber-400" />;
      case "reference": return <Link2 className="h-3.5 w-3.5 text-cyan-400" />;
      case "enum": return <Tag className="h-3.5 w-3.5 text-pink-400" />;
      case "money": return <Hash className="h-3.5 w-3.5 text-yellow-400" />;
      default: return <Box className="h-3.5 w-3.5 text-slate-400" />;
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-slate-200">
      {/* TOP BAR */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20 border border-blue-500/30">
              <Database className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Ontology Manager — ניהול אונטולוגיה</h1>
              <p className="text-xs text-slate-400">מבנה נתונים מרכזי של ה-ERP · Object Types · Properties · Links · Actions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש ישות..."
                className="h-9 w-64 border-slate-700 bg-slate-900/50 pr-9 text-sm placeholder:text-slate-500"
              />
            </div>
            <Button size="sm" variant="outline" className="h-9 border-slate-700 bg-slate-900/50 hover:bg-slate-800">
              <Download className="ml-1.5 h-4 w-4" />
              ייצוא JSON
            </Button>
            <Button size="sm" className="h-9 bg-blue-600 hover:bg-blue-700">
              <Plus className="ml-1.5 h-4 w-4" />
              ישות חדשה
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-6 border-t border-slate-800 px-6 py-2 text-xs text-slate-400">
          <span>Namespace: <span className="font-mono text-blue-400">com.kobi-el.erp</span></span>
          <span>Version: <span className="font-mono text-emerald-400">v4.2.0</span></span>
          <span>{objectTypes.length} ישויות · {totalProperties} מאפיינים · {links.length} קשרים · {actions.length} פעולות</span>
          <span>סה״כ רשומות: <span className="font-mono text-amber-400">{totalInstances.toLocaleString()}</span></span>
          <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> סנכרון פעיל</span>
        </div>
      </div>

      <div className="flex h-[calc(100vh-108px)]">
        {/* LEFT SIDEBAR - Object Types Tree */}
        <aside className="w-72 flex-shrink-0 border-l border-slate-800 bg-slate-900/30 overflow-y-auto">
          <div className="border-b border-slate-800 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Object Types</p>
            <p className="mt-0.5 text-xs text-slate-400">סוגי ישויות במערכת</p>
          </div>
          <div className="p-2">
            {filteredTypes.map((ot) => {
              const Icon = ot.icon;
              const active = ot.id === selectedType;
              return (
                <button
                  key={ot.id}
                  onClick={() => setSelectedType(ot.id)}
                  className={`mb-1 flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-right transition-all ${
                    active
                      ? "bg-blue-500/15 border border-blue-500/30"
                      : "hover:bg-slate-800/60 border border-transparent"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${ot.color}`} />
                  <div className="flex-1">
                    <div className={`text-sm font-medium ${active ? "text-white" : "text-slate-200"}`}>{ot.hebrew}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{ot.apiName}</div>
                  </div>
                  <div className="text-left">
                    <div className={`text-xs font-mono ${active ? "text-blue-400" : "text-slate-500"}`}>
                      {ot.count.toLocaleString()}
                    </div>
                  </div>
                  {active && <ChevronRight className="h-3.5 w-3.5 text-blue-400" />}
                </button>
              );
            })}
          </div>
        </aside>

        {/* MAIN PANEL */}
        <main className="flex-1 overflow-y-auto">
          {/* Object Header */}
          <div className="border-b border-slate-800 bg-slate-900/20 px-6 py-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className={`flex h-14 w-14 items-center justify-center rounded-xl bg-slate-800/50 border border-slate-700`}>
                  <currentType.icon className={`h-7 w-7 ${currentType.color}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold text-white">{currentType.hebrew}</h2>
                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">{currentType.status}</Badge>
                    <Badge className="bg-slate-800 text-slate-400 border-slate-700 font-mono text-[10px]">{currentType.version}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs font-mono text-slate-400">com.kobi-el.erp.{currentType.apiName}</p>
                  <p className="mt-1 text-sm text-slate-400">{currentType.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 border-slate-700 bg-slate-900/50">
                  <Eye className="ml-1.5 h-3.5 w-3.5" />
                  תצוגה מקדימה
                </Button>
                <Button size="sm" variant="outline" className="h-8 border-slate-700 bg-slate-900/50">
                  <Settings className="ml-1.5 h-3.5 w-3.5" />
                  הגדרות
                </Button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-3">
              <Card className="border-slate-800 bg-slate-900/40">
                <CardContent className="p-3">
                  <div className="text-[10px] uppercase text-slate-500">רשומות</div>
                  <div className="mt-0.5 text-xl font-bold text-white">{currentType.count.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card className="border-slate-800 bg-slate-900/40">
                <CardContent className="p-3">
                  <div className="text-[10px] uppercase text-slate-500">מאפיינים</div>
                  <div className="mt-0.5 text-xl font-bold text-blue-400">{currentProperties.length}</div>
                </CardContent>
              </Card>
              <Card className="border-slate-800 bg-slate-900/40">
                <CardContent className="p-3">
                  <div className="text-[10px] uppercase text-slate-500">קשרים</div>
                  <div className="mt-0.5 text-xl font-bold text-violet-400">{currentLinks.length}</div>
                </CardContent>
              </Card>
              <Card className="border-slate-800 bg-slate-900/40">
                <CardContent className="p-3">
                  <div className="text-[10px] uppercase text-slate-500">פעולות</div>
                  <div className="mt-0.5 text-xl font-bold text-amber-400">{currentActions.length}</div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* TABS */}
          <div className="px-6 py-5">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="bg-slate-900/50 border border-slate-800">
                <TabsTrigger value="properties" className="data-[state=active]:bg-blue-500/15 data-[state=active]:text-blue-400">
                  <Box className="ml-1.5 h-3.5 w-3.5" />
                  מאפיינים ({currentProperties.length})
                </TabsTrigger>
                <TabsTrigger value="links" className="data-[state=active]:bg-blue-500/15 data-[state=active]:text-blue-400">
                  <Link2 className="ml-1.5 h-3.5 w-3.5" />
                  קשרים ({currentLinks.length})
                </TabsTrigger>
                <TabsTrigger value="actions" className="data-[state=active]:bg-blue-500/15 data-[state=active]:text-blue-400">
                  <Zap className="ml-1.5 h-3.5 w-3.5" />
                  פעולות ({currentActions.length})
                </TabsTrigger>
                <TabsTrigger value="instances" className="data-[state=active]:bg-blue-500/15 data-[state=active]:text-blue-400">
                  <Database className="ml-1.5 h-3.5 w-3.5" />
                  דוגמאות
                </TabsTrigger>
              </TabsList>

              {/* PROPERTIES */}
              <TabsContent value="properties" className="mt-4">
                <Card className="border-slate-800 bg-slate-900/40">
                  <CardContent className="p-0">
                    <div className="border-b border-slate-800 px-4 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-slate-400">{currentProperties.length} מאפיינים מוגדרים</span>
                      <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-slate-800">
                        <Plus className="ml-1 h-3.5 w-3.5" /> הוסף מאפיין
                      </Button>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                          <th className="py-2 px-3 text-right font-medium">API Name</th>
                          <th className="py-2 px-3 text-right font-medium">שם תצוגה</th>
                          <th className="py-2 px-3 text-right font-medium">סוג</th>
                          <th className="py-2 px-3 text-center font-medium">חובה</th>
                          <th className="py-2 px-3 text-center font-medium">חיפוש</th>
                          <th className="py-2 px-3 text-center font-medium">אינדקס</th>
                          <th className="py-2 px-3 text-center font-medium">ייחודי</th>
                          <th className="py-2 px-3 text-center font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentProperties.map((p, i) => (
                          <tr key={i} className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                {p.apiName.toLowerCase().includes("id") ? <Key className="h-3 w-3 text-amber-400" /> : null}
                                <span className="font-mono text-xs text-blue-400">{p.apiName}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-slate-200">{p.displayName}</td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-1.5">
                                {dataTypeIcon(p.dataType)}
                                <span className="text-xs text-slate-400">{p.dataType}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {p.required ? <CheckCircle2 className="inline h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="inline h-3.5 w-3.5 text-slate-600" />}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {p.searchable ? <CheckCircle2 className="inline h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="inline h-3.5 w-3.5 text-slate-600" />}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {p.indexed ? <CheckCircle2 className="inline h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="inline h-3.5 w-3.5 text-slate-600" />}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {p.unique ? <CheckCircle2 className="inline h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="inline h-3.5 w-3.5 text-slate-600" />}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-slate-700">
                                <Edit3 className="h-3 w-3 text-slate-400" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* LINKS */}
              <TabsContent value="links" className="mt-4">
                <Card className="border-slate-800 bg-slate-900/40">
                  <CardContent className="p-0">
                    <div className="border-b border-slate-800 px-4 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-slate-400">{currentLinks.length} סוגי קשרים</span>
                      <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-slate-800">
                        <Plus className="ml-1 h-3.5 w-3.5" /> הוסף קשר
                      </Button>
                    </div>
                    <div className="divide-y divide-slate-800/60">
                      {currentLinks.map((l) => (
                        <div key={l.id} className="p-4 hover:bg-slate-800/30 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1">
                              <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 font-mono">{l.source}</Badge>
                              <div className="flex items-center gap-2 text-xs text-slate-400">
                                <div className="h-px w-8 bg-slate-700"></div>
                                <span className="italic">{l.relationship}</span>
                                <ChevronRight className="h-3 w-3" />
                                <div className="h-px w-8 bg-slate-700"></div>
                              </div>
                              <Badge className="bg-violet-500/15 text-violet-400 border-violet-500/30 font-mono">{l.target}</Badge>
                              <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[10px]">{l.cardinality}</Badge>
                              {l.bidirectional && (
                                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">דו-כיווני</Badge>
                              )}
                            </div>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-slate-700">
                              <Edit3 className="h-3 w-3 text-slate-400" />
                            </Button>
                          </div>
                          <p className="mt-2 text-xs text-slate-500 pr-1">{l.description}</p>
                        </div>
                      ))}
                      {currentLinks.length === 0 && (
                        <div className="p-8 text-center text-sm text-slate-500">אין קשרים מוגדרים לישות זו</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ACTIONS */}
              <TabsContent value="actions" className="mt-4">
                <div className="grid grid-cols-2 gap-3">
                  {currentActions.map((a) => (
                    <Card key={a.id} className="border-slate-800 bg-slate-900/40 hover:border-slate-700 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-md border ${
                              a.kind === "create" ? "bg-emerald-500/10 border-emerald-500/30" :
                              a.kind === "update" ? "bg-blue-500/10 border-blue-500/30" :
                              a.kind === "delete" ? "bg-red-500/10 border-red-500/30" :
                              "bg-violet-500/10 border-violet-500/30"
                            }`}>
                              {a.kind === "create" ? <Plus className="h-4 w-4 text-emerald-400" /> :
                               a.kind === "update" ? <Edit3 className="h-4 w-4 text-blue-400" /> :
                               a.kind === "delete" ? <XCircle className="h-4 w-4 text-red-400" /> :
                               <Play className="h-4 w-4 text-violet-400" />}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-white">{a.displayName}</div>
                              <div className="font-mono text-[10px] text-blue-400">{a.apiName}()</div>
                            </div>
                          </div>
                          {a.requiresApproval && (
                            <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">
                              <Shield className="ml-0.5 h-2.5 w-2.5" />
                              אישור
                            </Badge>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-slate-400">{a.description}</p>
                        <div className="mt-3 flex items-center gap-3 text-[10px] text-slate-500">
                          <span className="font-mono">{a.parameters} params</span>
                          <span>·</span>
                          <span>{a.rules.length} rules</span>
                        </div>
                        {a.rules.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {a.rules.map((r, i) => (
                              <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                <AlertTriangle className="h-3 w-3 text-amber-400/70" />
                                {r}
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {currentActions.length === 0 && (
                    <div className="col-span-2 p-8 text-center text-sm text-slate-500">אין פעולות מוגדרות לישות זו</div>
                  )}
                </div>
              </TabsContent>

              {/* INSTANCES */}
              <TabsContent value="instances" className="mt-4">
                <Card className="border-slate-800 bg-slate-900/40">
                  <CardContent className="p-0">
                    <div className="border-b border-slate-800 px-4 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-slate-400">דוגמאות מה-Production · {currentType.count.toLocaleString()} סה״כ</span>
                      <div className="flex items-center gap-1 text-[10px] text-slate-500">
                        <Globe className="h-3 w-3" />
                        live sample
                      </div>
                    </div>
                    {currentInstances.length > 0 ? (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                            {Object.keys(currentInstances[0]).map((k) => (
                              <th key={k} className="py-2 px-3 text-right font-medium">{k}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {currentInstances.map((inst: any, i: number) => (
                            <tr key={i} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                              {Object.entries(inst).map(([k, v]) => (
                                <td key={k} className="py-2.5 px-3 text-slate-200">
                                  {typeof v === "boolean" ? (
                                    v ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-slate-500" />
                                  ) : k.toLowerCase().includes("id") || k === "sku" ? (
                                    <span className="font-mono text-xs text-blue-400">{String(v)}</span>
                                  ) : (
                                    <span>{String(v)}</span>
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="p-8 text-center text-sm text-slate-500">
                        <Lock className="mx-auto mb-2 h-6 w-6 text-slate-600" />
                        דוגמאות אינן זמינות עבור ישות זו
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}
