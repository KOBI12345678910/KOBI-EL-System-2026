import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Shield, Edit, Copy, Trash2, Users, Lock, ChevronDown, ChevronLeft,
  Plus, Check, X, Eye, Settings, ShoppingCart, Package, Warehouse,
  DollarSign, FolderKanban, UserCog, ToggleRight, ToggleLeft,
  Building2, GitBranch, Database, AlertTriangle, Crown, Search
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Permission {
  code: string;
  label: string;
  allowed: boolean;
}

interface PermissionModule {
  name: string;
  nameHe: string;
  icon: any;
  color: string;
  permissions: Permission[];
}

interface RoleUser {
  id: string;
  name: string;
  employeeCode: string;
  department: string;
  assignedDate: string;
  active: boolean;
}

interface DataScope {
  id: string;
  scopeType: string;
  scopeTypeHe: string;
  value: string;
  accessMode: string;
  accessModeHe: string;
}

interface RoleData {
  id: string;
  name: string;
  nameHe: string;
  code: string;
  description: string;
  level: number;
  levelLabel: string;
  isSystemRole: boolean;
  status: "active" | "inactive" | "draft";
  parentRole: string | null;
  color: string;
  usersCount: number;
  permissionsCount: number;
  createdAt: string;
  updatedAt: string;
  modules: PermissionModule[];
  users: RoleUser[];
  dataScopes: DataScope[];
}

// ─── Level labels ─────────────────────────────────────────────────────────────

const LEVEL_MAP: Record<number, { label: string; labelHe: string; color: string }> = {
  1: { label: "Viewer", labelHe: "צופה", color: "bg-gray-500/20 text-gray-300" },
  2: { label: "Operator", labelHe: "מפעיל", color: "bg-blue-500/20 text-blue-300" },
  3: { label: "Supervisor", labelHe: "מפקח", color: "bg-yellow-500/20 text-yellow-300" },
  4: { label: "Manager", labelHe: "מנהל", color: "bg-orange-500/20 text-orange-300" },
  5: { label: "Admin", labelHe: "מנהל מערכת", color: "bg-red-500/20 text-red-300" },
};

// ─── Mock Data ────────────────────────────────────────────────────────────────

const mockRole: RoleData = {
  id: "role_procurement_mgr_001",
  name: "Procurement Manager",
  nameHe: "מנהל רכש",
  code: "PROCUREMENT_MANAGER",
  description: "תפקיד מנהל רכש עם הרשאות מלאות למודול הרכש כולל אישור הזמנות רכש, ניהול ספקים, קליטת סחורה וחשבוניות ספקים. כולל גישת צפייה למלאי ולכספים.",
  level: 4,
  levelLabel: "מנהל",
  isSystemRole: false,
  status: "active",
  parentRole: "DEPARTMENT_MANAGER",
  color: "#f97316",
  usersCount: 7,
  permissionsCount: 68,
  createdAt: "2025-06-15",
  updatedAt: "2026-03-28",
  modules: [
    {
      name: "System",
      nameHe: "מערכת",
      icon: Settings,
      color: "text-gray-400",
      permissions: [
        { code: "system.view_settings", label: "צפייה בהגדרות מערכת", allowed: false },
        { code: "system.edit_settings", label: "עריכת הגדרות מערכת", allowed: false },
        { code: "system.view_audit_log", label: "צפייה ביומן ביקורת", allowed: true },
        { code: "system.manage_users", label: "ניהול משתמשים", allowed: false },
        { code: "system.manage_roles", label: "ניהול תפקידים", allowed: false },
        { code: "system.view_reports", label: "צפייה בדוחות מערכת", allowed: true },
        { code: "system.backup", label: "גיבוי מערכת", allowed: false },
      ],
    },
    {
      name: "Customers",
      nameHe: "לקוחות",
      icon: Users,
      color: "text-blue-400",
      permissions: [
        { code: "customer.view", label: "צפייה בלקוחות", allowed: true },
        { code: "customer.create", label: "יצירת לקוח", allowed: false },
        { code: "customer.edit", label: "עריכת לקוח", allowed: false },
        { code: "customer.delete", label: "מחיקת לקוח", allowed: false },
        { code: "customer.view_credit", label: "צפייה באשראי לקוח", allowed: true },
        { code: "customer.export", label: "ייצוא נתוני לקוחות", allowed: false },
      ],
    },
    {
      name: "Suppliers",
      nameHe: "ספקים",
      icon: Building2,
      color: "text-purple-400",
      permissions: [
        { code: "supplier.view", label: "צפייה בספקים", allowed: true },
        { code: "supplier.create", label: "יצירת ספק", allowed: true },
        { code: "supplier.edit", label: "עריכת ספק", allowed: true },
        { code: "supplier.delete", label: "מחיקת ספק", allowed: false },
        { code: "supplier.approve", label: "אישור ספק חדש", allowed: true },
        { code: "supplier.view_contracts", label: "צפייה בחוזי ספקים", allowed: true },
        { code: "supplier.manage_contracts", label: "ניהול חוזי ספקים", allowed: true },
        { code: "supplier.rate", label: "דירוג ספקים", allowed: true },
        { code: "supplier.export", label: "ייצוא נתוני ספקים", allowed: true },
      ],
    },
    {
      name: "Items",
      nameHe: "פריטים",
      icon: Package,
      color: "text-cyan-400",
      permissions: [
        { code: "item.view", label: "צפייה בפריטים", allowed: true },
        { code: "item.create", label: "יצירת פריט", allowed: true },
        { code: "item.edit", label: "עריכת פריט", allowed: true },
        { code: "item.delete", label: "מחיקת פריט", allowed: false },
        { code: "item.manage_pricing", label: "ניהול מחירון", allowed: true },
        { code: "item.view_bom", label: "צפייה בעץ מוצר", allowed: true },
        { code: "item.manage_categories", label: "ניהול קטגוריות", allowed: false },
      ],
    },
    {
      name: "Inventory",
      nameHe: "מלאי",
      icon: Warehouse,
      color: "text-emerald-400",
      permissions: [
        { code: "inventory.view", label: "צפייה במלאי", allowed: true },
        { code: "inventory.adjust", label: "התאמת מלאי", allowed: false },
        { code: "inventory.transfer", label: "העברת מלאי", allowed: true },
        { code: "inventory.count", label: "ספירת מלאי", allowed: false },
        { code: "inventory.view_reports", label: "דוחות מלאי", allowed: true },
        { code: "inventory.manage_warehouses", label: "ניהול מחסנים", allowed: false },
      ],
    },
    {
      name: "Procurement",
      nameHe: "רכש",
      icon: ShoppingCart,
      color: "text-orange-400",
      permissions: [
        { code: "pr.view", label: "צפייה בדרישות רכש", allowed: true },
        { code: "pr.create", label: "יצירת דרישת רכש", allowed: true },
        { code: "pr.edit", label: "עריכת דרישת רכש", allowed: true },
        { code: "pr.submit", label: "שליחת דרישת רכש לאישור", allowed: true },
        { code: "pr.approve", label: "אישור דרישת רכש", allowed: true },
        { code: "pr.reject", label: "דחיית דרישת רכש", allowed: true },
        { code: "po.view", label: "צפייה בהזמנות רכש", allowed: true },
        { code: "po.create", label: "יצירת הזמנת רכש", allowed: true },
        { code: "po.edit", label: "עריכת הזמנת רכש", allowed: true },
        { code: "po.submit", label: "שליחת הזמנת רכש", allowed: true },
        { code: "po.approve", label: "אישור הזמנת רכש", allowed: true },
        { code: "po.cancel", label: "ביטול הזמנת רכש", allowed: true },
        { code: "po.close", label: "סגירת הזמנת רכש", allowed: true },
        { code: "goods_receipt.view", label: "צפייה בקבלות סחורה", allowed: true },
        { code: "goods_receipt.create", label: "יצירת קבלת סחורה", allowed: true },
        { code: "goods_receipt.edit", label: "עריכת קבלת סחורה", allowed: true },
        { code: "goods_receipt.approve", label: "אישור קבלת סחורה", allowed: true },
        { code: "ap_invoice.view", label: "צפייה בחשבוניות ספקים", allowed: true },
        { code: "ap_invoice.create", label: "יצירת חשבונית ספק", allowed: true },
        { code: "ap_invoice.post", label: "רישום חשבונית ספק", allowed: true },
        { code: "ap_invoice.approve", label: "אישור חשבונית ספק", allowed: true },
        { code: "rfq.view", label: "צפייה בבקשות הצעת מחיר", allowed: true },
        { code: "rfq.create", label: "יצירת בקשת הצעת מחיר", allowed: true },
        { code: "rfq.evaluate", label: "הערכת הצעות מחיר", allowed: true },
        { code: "rfq.award", label: "בחירת ספק זוכה", allowed: true },
        { code: "procurement.reports", label: "דוחות רכש", allowed: true },
        { code: "procurement.dashboard", label: "לוח בקרה רכש", allowed: true },
        { code: "procurement.budget_check", label: "בדיקת תקציב", allowed: true },
      ],
    },
    {
      name: "Sales",
      nameHe: "מכירות",
      icon: DollarSign,
      color: "text-green-400",
      permissions: [
        { code: "sales.view_orders", label: "צפייה בהזמנות מכירה", allowed: true },
        { code: "sales.create_order", label: "יצירת הזמנת מכירה", allowed: false },
        { code: "sales.edit_order", label: "עריכת הזמנת מכירה", allowed: false },
        { code: "sales.view_quotes", label: "צפייה בהצעות מחיר", allowed: true },
        { code: "sales.create_quote", label: "יצירת הצעת מחיר", allowed: false },
        { code: "sales.view_invoices", label: "צפייה בחשבוניות לקוח", allowed: true },
        { code: "sales.reports", label: "דוחות מכירות", allowed: true },
      ],
    },
    {
      name: "Projects",
      nameHe: "פרויקטים",
      icon: FolderKanban,
      color: "text-indigo-400",
      permissions: [
        { code: "project.view", label: "צפייה בפרויקטים", allowed: true },
        { code: "project.create", label: "יצירת פרויקט", allowed: false },
        { code: "project.edit", label: "עריכת פרויקט", allowed: false },
        { code: "project.view_budget", label: "צפייה בתקציב פרויקט", allowed: true },
        { code: "project.manage_tasks", label: "ניהול משימות פרויקט", allowed: false },
        { code: "project.reports", label: "דוחות פרויקטים", allowed: true },
      ],
    },
    {
      name: "Finance",
      nameHe: "כספים",
      icon: DollarSign,
      color: "text-yellow-400",
      permissions: [
        { code: "finance.view_gl", label: "צפייה בספר ראשי", allowed: true },
        { code: "finance.post_journal", label: "רישום פקודת יומן", allowed: false },
        { code: "finance.view_budget", label: "צפייה בתקציב", allowed: true },
        { code: "finance.manage_budget", label: "ניהול תקציב", allowed: false },
        { code: "finance.view_bank", label: "צפייה בחשבונות בנק", allowed: true },
        { code: "finance.reconciliation", label: "התאמת בנק", allowed: false },
        { code: "finance.reports", label: "דוחות כספיים", allowed: true },
        { code: "finance.view_ar", label: "צפייה בחייבים", allowed: true },
        { code: "finance.view_ap", label: "צפייה בזכאים", allowed: true },
      ],
    },
  ],
  users: [
    { id: "u1", name: "דוד כהן", employeeCode: "EMP-1042", department: "רכש", assignedDate: "2025-08-12", active: true },
    { id: "u2", name: "רחל לוי", employeeCode: "EMP-1087", department: "רכש", assignedDate: "2025-09-03", active: true },
    { id: "u3", name: "משה אברהם", employeeCode: "EMP-1123", department: "רכש", assignedDate: "2025-11-20", active: true },
    { id: "u4", name: "שרה ישראלי", employeeCode: "EMP-1156", department: "רכש", assignedDate: "2026-01-05", active: true },
    { id: "u5", name: "יוסף ברק", employeeCode: "EMP-1201", department: "לוגיסטיקה", assignedDate: "2026-01-18", active: true },
    { id: "u6", name: "נועה פרידמן", employeeCode: "EMP-0988", department: "רכש", assignedDate: "2025-07-01", active: false },
    { id: "u7", name: "אמיר חסון", employeeCode: "EMP-1245", department: "רכש", assignedDate: "2026-03-10", active: true },
  ],
  dataScopes: [
    { id: "ds1", scopeType: "branch", scopeTypeHe: "סניף", value: "סניף מרכז - תל אביב", accessMode: "full", accessModeHe: "גישה מלאה" },
    { id: "ds2", scopeType: "branch", scopeTypeHe: "סניף", value: "סניף צפון - חיפה", accessMode: "full", accessModeHe: "גישה מלאה" },
    { id: "ds3", scopeType: "warehouse", scopeTypeHe: "מחסן", value: "מחסן ראשי - WH01", accessMode: "full", accessModeHe: "גישה מלאה" },
    { id: "ds4", scopeType: "warehouse", scopeTypeHe: "מחסן", value: "מחסן חומרי גלם - WH02", accessMode: "full", accessModeHe: "גישה מלאה" },
    { id: "ds5", scopeType: "warehouse", scopeTypeHe: "מחסן", value: "מחסן מוצרים מוגמרים - WH03", accessMode: "read", accessModeHe: "צפייה בלבד" },
    { id: "ds6", scopeType: "project", scopeTypeHe: "פרויקט", value: "פרויקט שדרוג קו ייצור B", accessMode: "read", accessModeHe: "צפייה בלבד" },
    { id: "ds7", scopeType: "department", scopeTypeHe: "מחלקה", value: "מחלקת רכש", accessMode: "full", accessModeHe: "גישה מלאה" },
    { id: "ds8", scopeType: "department", scopeTypeHe: "מחלקה", value: "מחלקת לוגיסטיקה", accessMode: "read", accessModeHe: "צפייה בלבד" },
  ],
};

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-300 border-green-500/30" },
  inactive: { label: "לא פעיל", color: "bg-red-500/20 text-red-300 border-red-500/30" },
  draft: { label: "טיוטה", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
};

const SCOPE_ICONS: Record<string, any> = {
  branch: Building2,
  warehouse: Warehouse,
  project: FolderKanban,
  department: Users,
};

const ACCESS_COLORS: Record<string, string> = {
  full: "bg-green-500/20 text-green-300 border-green-500/30",
  read: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  write: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  none: "bg-red-500/20 text-red-300 border-red-500/30",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function RoleCardPage() {
  const [activeTab, setActiveTab] = useState("general");
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({ Procurement: true });
  const [searchPerm, setSearchPerm] = useState("");
  const [searchUser, setSearchUser] = useState("");
  const role = mockRole;

  const toggleModule = (name: string) => {
    setExpandedModules(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const totalPermissions = role.modules.reduce((sum, m) => sum + m.permissions.length, 0);
  const allowedPermissions = role.modules.reduce(
    (sum, m) => sum + m.permissions.filter(p => p.allowed).length, 0
  );

  const filteredUsers = role.users.filter(u =>
    !searchUser || u.name.includes(searchUser) || u.employeeCode.includes(searchUser) || u.department.includes(searchUser)
  );

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-6 space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Card className="bg-[#0d1325] border-[#1e293b]">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            {/* Right: Role info */}
            <div className="flex items-start gap-4">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: role.color + "22", border: `1px solid ${role.color}44` }}
              >
                <Shield className="w-7 h-7" style={{ color: role.color }} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold text-white">{role.nameHe}</h1>
                  <span className="text-sm text-gray-500 font-mono">({role.code})</span>
                  <Badge className={LEVEL_MAP[role.level]?.color + " border-0 text-xs"}>
                    <Crown className="w-3 h-3 ml-1" />
                    רמה {role.level} - {LEVEL_MAP[role.level]?.labelHe}
                  </Badge>
                  {role.isSystemRole && (
                    <Badge className="bg-purple-500/20 text-purple-300 border-0 text-xs">
                      <Lock className="w-3 h-3 ml-1" />
                      תפקיד מערכת
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-gray-400 leading-relaxed max-w-2xl">{role.description}</p>
                <div className="flex items-center gap-4 text-xs text-gray-500 pt-1">
                  <Badge className={STATUS_MAP[role.status]?.color + " text-xs"}>
                    {STATUS_MAP[role.status]?.label}
                  </Badge>
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {role.usersCount} משתמשים
                  </span>
                  <span className="flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5" />
                    {allowedPermissions}/{totalPermissions} הרשאות
                  </span>
                  <span>נוצר: {role.createdAt}</span>
                  <span>עדכון: {role.updatedAt}</span>
                </div>
              </div>
            </div>
            {/* Left: Action buttons */}
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors">
                <Edit className="w-4 h-4" />
                עריכה
              </button>
              <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1a2236] hover:bg-[#232d45] text-gray-300 text-sm border border-[#2a3654] transition-colors">
                <Copy className="w-4 h-4" />
                שכפול
              </button>
              <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1a2236] hover:bg-red-900/40 text-red-400 text-sm border border-[#2a3654] transition-colors">
                <Trash2 className="w-4 h-4" />
                מחיקה
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="bg-[#0d1325] border border-[#1e293b] h-11 p-1 gap-1">
          <TabsTrigger value="general" className="data-[state=active]:bg-[#1a2236] data-[state=active]:text-white text-gray-400 px-5">
            <Settings className="w-4 h-4 ml-1.5" />
            כללי
          </TabsTrigger>
          <TabsTrigger value="permissions" className="data-[state=active]:bg-[#1a2236] data-[state=active]:text-white text-gray-400 px-5">
            <Lock className="w-4 h-4 ml-1.5" />
            הרשאות
          </TabsTrigger>
          <TabsTrigger value="users" className="data-[state=active]:bg-[#1a2236] data-[state=active]:text-white text-gray-400 px-5">
            <Users className="w-4 h-4 ml-1.5" />
            משתמשים
          </TabsTrigger>
          <TabsTrigger value="datascopes" className="data-[state=active]:bg-[#1a2236] data-[state=active]:text-white text-gray-400 px-5">
            <Database className="w-4 h-4 ml-1.5" />
            טווחי נתונים
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════ Tab 1: General ═══════════════════════════ */}
        <TabsContent value="general" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left column: Basic details */}
            <Card className="bg-[#0d1325] border-[#1e293b]">
              <CardHeader>
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-orange-400" />
                  פרטי תפקיד
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">שם תפקיד (אנגלית)</label>
                    <div className="bg-[#1a2236] border border-[#2a3654] rounded-lg px-3 py-2.5 text-sm text-gray-200 font-mono">
                      {role.name}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">שם תפקיד (עברית)</label>
                    <div className="bg-[#1a2236] border border-[#2a3654] rounded-lg px-3 py-2.5 text-sm text-gray-200">
                      {role.nameHe}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">קוד תפקיד</label>
                  <div className="bg-[#1a2236] border border-[#2a3654] rounded-lg px-3 py-2.5 text-sm text-gray-200 font-mono">
                    {role.code}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">תיאור</label>
                  <div className="bg-[#1a2236] border border-[#2a3654] rounded-lg px-3 py-2.5 text-sm text-gray-300 leading-relaxed min-h-[60px]">
                    {role.description}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">סטטוס</label>
                    <div className="bg-[#1a2236] border border-[#2a3654] rounded-lg px-3 py-2.5">
                      <Badge className={STATUS_MAP[role.status]?.color + " text-xs"}>
                        {STATUS_MAP[role.status]?.label}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">תפקיד מערכת</label>
                    <div className="bg-[#1a2236] border border-[#2a3654] rounded-lg px-3 py-2.5 text-sm">
                      {role.isSystemRole ? (
                        <span className="text-purple-400 flex items-center gap-1"><Check className="w-4 h-4" /> כן</span>
                      ) : (
                        <span className="text-gray-400 flex items-center gap-1"><X className="w-4 h-4" /> לא</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Right column: Level, parent, color */}
            <div className="space-y-6">
              <Card className="bg-[#0d1325] border-[#1e293b]">
                <CardHeader>
                  <CardTitle className="text-lg text-white flex items-center gap-2">
                    <Crown className="w-5 h-5 text-yellow-400" />
                    רמה והיררכיה
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-2">רמת תפקיד</label>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map(lvl => (
                        <div
                          key={lvl}
                          className={`flex-1 rounded-lg py-3 text-center text-xs font-medium transition-all border ${
                            lvl === role.level
                              ? "bg-orange-500/20 border-orange-500/50 text-orange-300 ring-1 ring-orange-500/30"
                              : lvl < role.level
                              ? "bg-[#1a2236] border-[#2a3654] text-gray-500"
                              : "bg-[#111827] border-[#1e293b] text-gray-600"
                          }`}
                        >
                          <div className="text-lg font-bold mb-0.5">{lvl}</div>
                          <div>{LEVEL_MAP[lvl]?.labelHe}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">תפקיד אב</label>
                    <div className="bg-[#1a2236] border border-[#2a3654] rounded-lg px-3 py-2.5 text-sm flex items-center gap-2">
                      <GitBranch className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-200 font-mono">{role.parentRole || "—"}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">צבע תפקיד</label>
                    <div className="bg-[#1a2236] border border-[#2a3654] rounded-lg px-3 py-2.5 text-sm flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg border border-white/10"
                        style={{ backgroundColor: role.color }}
                      />
                      <span className="text-gray-300 font-mono">{role.color}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Stats summary */}
              <Card className="bg-[#0d1325] border-[#1e293b]">
                <CardContent className="p-5">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-[#1a2236] rounded-xl p-4 border border-[#2a3654]">
                      <Users className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-white">{role.usersCount}</div>
                      <div className="text-xs text-gray-500 mt-1">משתמשים</div>
                    </div>
                    <div className="bg-[#1a2236] rounded-xl p-4 border border-[#2a3654]">
                      <Lock className="w-6 h-6 text-green-400 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-white">{allowedPermissions}</div>
                      <div className="text-xs text-gray-500 mt-1">הרשאות פעילות</div>
                    </div>
                    <div className="bg-[#1a2236] rounded-xl p-4 border border-[#2a3654]">
                      <Database className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-white">{role.dataScopes.length}</div>
                      <div className="text-xs text-gray-500 mt-1">טווחי נתונים</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ═══════════════════ Tab 2: Permissions ══════════════════════ */}
        <TabsContent value="permissions" className="mt-4 space-y-4">
          {/* Permissions summary bar */}
          <Card className="bg-[#0d1325] border-[#1e293b]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-gray-400">מותר: <span className="text-green-300 font-bold">{allowedPermissions}</span></span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-gray-400">חסום: <span className="text-red-300 font-bold">{totalPermissions - allowedPermissions}</span></span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400">סה&quot;כ: <span className="text-white font-bold">{totalPermissions}</span></span>
                  </div>
                  <div className="h-2 w-48 bg-[#1a2236] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-l from-green-500 to-green-600 rounded-full transition-all"
                      style={{ width: `${(allowedPermissions / totalPermissions) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={searchPerm}
                    onChange={e => setSearchPerm(e.target.value)}
                    placeholder="חיפוש הרשאה..."
                    className="bg-[#1a2236] border border-[#2a3654] rounded-lg pr-9 pl-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 w-64 focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Modules accordion */}
          <div className="space-y-3">
            {role.modules.map(mod => {
              const modAllowed = mod.permissions.filter(p => p.allowed).length;
              const modTotal = mod.permissions.length;
              const isExpanded = expandedModules[mod.name] ?? false;

              const filteredPerms = searchPerm
                ? mod.permissions.filter(
                    p => p.code.includes(searchPerm) || p.label.includes(searchPerm)
                  )
                : mod.permissions;

              if (searchPerm && filteredPerms.length === 0) return null;

              const Icon = mod.icon;

              return (
                <Card key={mod.name} className="bg-[#0d1325] border-[#1e293b] overflow-hidden">
                  <button
                    onClick={() => toggleModule(mod.name)}
                    className="w-full flex items-center justify-between p-4 hover:bg-[#111827] transition-colors text-right"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg bg-[#1a2236] border border-[#2a3654] flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 ${mod.color}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{mod.nameHe}</span>
                          <span className="text-xs text-gray-600 font-mono">{mod.name}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="h-1.5 w-24 bg-[#1a2236] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full transition-all"
                              style={{ width: `${modTotal > 0 ? (modAllowed / modTotal) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">{modAllowed}/{modTotal}</span>
                        </div>
                      </div>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[#1e293b]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0">
                        {filteredPerms.map(perm => (
                          <div
                            key={perm.code}
                            className={`flex items-center justify-between px-5 py-3 border-b border-l border-[#1e293b] last:border-b-0 transition-colors ${
                              perm.allowed ? "hover:bg-green-500/5" : "hover:bg-red-500/5"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {perm.allowed ? (
                                <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                                  <Check className="w-3 h-3 text-green-400" />
                                </div>
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                                  <X className="w-3 h-3 text-red-400" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="text-sm text-gray-200 truncate">{perm.label}</div>
                                <div className="text-[10px] text-gray-600 font-mono truncate">{perm.code}</div>
                              </div>
                            </div>
                            <button
                              className={`w-10 h-5 rounded-full relative transition-colors shrink-0 mr-2 ${
                                perm.allowed ? "bg-green-600" : "bg-gray-700"
                              }`}
                            >
                              <div
                                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                                  perm.allowed ? "right-0.5" : "left-0.5"
                                }`}
                              />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ═══════════════════ Tab 3: Users ═════════════════════════════ */}
        <TabsContent value="users" className="mt-4 space-y-4">
          <Card className="bg-[#0d1325] border-[#1e293b]">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400" />
                משתמשים בתפקיד ({role.users.length})
              </CardTitle>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={searchUser}
                    onChange={e => setSearchUser(e.target.value)}
                    placeholder="חיפוש משתמש..."
                    className="bg-[#1a2236] border border-[#2a3654] rounded-lg pr-9 pl-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 w-56 focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors">
                  <Plus className="w-4 h-4" />
                  הוסף משתמש
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#1e293b] bg-[#111827]">
                      <th className="text-right text-xs text-gray-500 font-medium px-5 py-3">שם</th>
                      <th className="text-right text-xs text-gray-500 font-medium px-5 py-3">קוד עובד</th>
                      <th className="text-right text-xs text-gray-500 font-medium px-5 py-3">מחלקה</th>
                      <th className="text-right text-xs text-gray-500 font-medium px-5 py-3">תאריך הקצאה</th>
                      <th className="text-right text-xs text-gray-500 font-medium px-5 py-3">פעיל</th>
                      <th className="text-right text-xs text-gray-500 font-medium px-5 py-3">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(user => (
                      <tr key={user.id} className="border-b border-[#1e293b] hover:bg-[#111827] transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center text-xs font-bold text-blue-300 border border-blue-500/20">
                              {user.name.charAt(0)}
                            </div>
                            <span className="text-sm text-gray-200 font-medium">{user.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-400 font-mono">{user.employeeCode}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-300">{user.department}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-400">{user.assignedDate}</td>
                        <td className="px-5 py-3.5">
                          {user.active ? (
                            <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-xs">פעיל</Badge>
                          ) : (
                            <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-xs">לא פעיל</Badge>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1">
                            <button className="p-1.5 rounded-md hover:bg-[#1a2236] text-gray-500 hover:text-blue-400 transition-colors">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button className="p-1.5 rounded-md hover:bg-[#1a2236] text-gray-500 hover:text-red-400 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredUsers.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">לא נמצאו משתמשים</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════ Tab 4: Data Scopes ══════════════════════ */}
        <TabsContent value="datascopes" className="mt-4 space-y-4">
          <Card className="bg-[#0d1325] border-[#1e293b]">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-purple-400" />
                טווחי נתונים ({role.dataScopes.length})
              </CardTitle>
              <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors">
                <Plus className="w-4 h-4" />
                הוסף טווח
              </button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#1e293b] bg-[#111827]">
                      <th className="text-right text-xs text-gray-500 font-medium px-5 py-3">סוג טווח</th>
                      <th className="text-right text-xs text-gray-500 font-medium px-5 py-3">ערך</th>
                      <th className="text-right text-xs text-gray-500 font-medium px-5 py-3">מצב גישה</th>
                      <th className="text-right text-xs text-gray-500 font-medium px-5 py-3">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {role.dataScopes.map(scope => {
                      const ScopeIcon = SCOPE_ICONS[scope.scopeType] || Database;
                      return (
                        <tr key={scope.id} className="border-b border-[#1e293b] hover:bg-[#111827] transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-[#1a2236] border border-[#2a3654] flex items-center justify-center">
                                <ScopeIcon className="w-4 h-4 text-purple-400" />
                              </div>
                              <span className="text-sm text-gray-200">{scope.scopeTypeHe}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-gray-300">{scope.value}</td>
                          <td className="px-5 py-3.5">
                            <Badge className={`${ACCESS_COLORS[scope.accessMode] || ACCESS_COLORS.none} text-xs`}>
                              {scope.accessModeHe}
                            </Badge>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1">
                              <button className="p-1.5 rounded-md hover:bg-[#1a2236] text-gray-500 hover:text-blue-400 transition-colors">
                                <Edit className="w-4 h-4" />
                              </button>
                              <button className="p-1.5 rounded-md hover:bg-[#1a2236] text-gray-500 hover:text-red-400 transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Scopes visual summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {(["branch", "warehouse", "project", "department"] as const).map(type => {
              const scopes = role.dataScopes.filter(s => s.scopeType === type);
              const ScopeIcon = SCOPE_ICONS[type] || Database;
              const typeNames: Record<string, string> = {
                branch: "סניפים",
                warehouse: "מחסנים",
                project: "פרויקטים",
                department: "מחלקות",
              };
              return (
                <Card key={type} className="bg-[#0d1325] border-[#1e293b]">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <ScopeIcon className="w-5 h-5 text-purple-400" />
                      <span className="text-sm text-white font-medium">{typeNames[type]}</span>
                      <Badge className="bg-[#1a2236] text-gray-400 border-[#2a3654] text-xs mr-auto">
                        {scopes.length}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {scopes.map(s => (
                        <div key={s.id} className="flex items-center justify-between bg-[#1a2236] rounded-lg px-3 py-2 border border-[#2a3654]">
                          <span className="text-xs text-gray-300 truncate">{s.value}</span>
                          <div className={`w-2 h-2 rounded-full shrink-0 mr-2 ${
                            s.accessMode === "full" ? "bg-green-400" : s.accessMode === "read" ? "bg-blue-400" : "bg-orange-400"
                          }`} />
                        </div>
                      ))}
                      {scopes.length === 0 && (
                        <div className="text-center py-3 text-gray-600 text-xs">
                          <AlertTriangle className="w-4 h-4 mx-auto mb-1 opacity-40" />
                          אין טווחים
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
