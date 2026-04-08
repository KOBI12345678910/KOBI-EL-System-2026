import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Download,
  Search,
  Users,
  Lock,
  CheckCircle2,
  XCircle,
  Minus,
  Filter,
  Grid3X3,
  ShieldCheck,
  ShieldAlert,
  Eye,
  RotateCcw,
  ChevronDown,
  Info,
  Copy,
  Layers,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CellValue = "granted" | "denied" | "unset";

interface PermissionDef {
  code: string;
  label: string;
  module: ModuleKey;
  description: string;
}

interface RoleDef {
  id: string;
  label: string;
  level: number;
  color: string;
}

type ModuleKey =
  | "all"
  | "system"
  | "customers"
  | "vendors"
  | "items"
  | "inventory"
  | "procurement"
  | "sales"
  | "projects"
  | "finance";

interface ModuleDef {
  key: ModuleKey;
  label: string;
  color: string;
  bgColor: string;
}

// ---------------------------------------------------------------------------
// Data: Modules
// ---------------------------------------------------------------------------

const MODULES: ModuleDef[] = [
  { key: "all",         label: "הכל",        color: "text-white",       bgColor: "bg-white/10" },
  { key: "system",      label: "מערכת",      color: "text-purple-400",  bgColor: "bg-purple-500/15" },
  { key: "customers",   label: "לקוחות",     color: "text-blue-400",    bgColor: "bg-blue-500/15" },
  { key: "vendors",     label: "ספקים",       color: "text-orange-400",  bgColor: "bg-orange-500/15" },
  { key: "items",       label: "פריטים",      color: "text-cyan-400",    bgColor: "bg-cyan-500/15" },
  { key: "inventory",   label: "מלאי",        color: "text-teal-400",    bgColor: "bg-teal-500/15" },
  { key: "procurement", label: "רכש",         color: "text-amber-400",   bgColor: "bg-amber-500/15" },
  { key: "sales",       label: "מכירות",     color: "text-green-400",   bgColor: "bg-green-500/15" },
  { key: "projects",    label: "פרויקטים",   color: "text-indigo-400",  bgColor: "bg-indigo-500/15" },
  { key: "finance",     label: "כספים",       color: "text-yellow-400",  bgColor: "bg-yellow-500/15" },
];

// ---------------------------------------------------------------------------
// Data: Roles (columns)
// ---------------------------------------------------------------------------

const ROLES: RoleDef[] = [
  { id: "CEO",                   label: 'מנכ"ל',            level: 5, color: "text-yellow-300" },
  { id: "SYSTEM_ADMIN",          label: "מנהל מערכת",       level: 5, color: "text-purple-300" },
  { id: "FINANCE_MANAGER",       label: "מנהל כספים",       level: 4, color: "text-blue-300" },
  { id: "PROCUREMENT_MANAGER",   label: "מנהל רכש",         level: 4, color: "text-orange-300" },
  { id: "WAREHOUSE_MANAGER",     label: "מנהל מחסן",        level: 4, color: "text-teal-300" },
  { id: "PROJECT_MANAGER",       label: "מנהל פרויקטים",   level: 3, color: "text-indigo-300" },
  { id: "SALES_MANAGER",         label: "מנהל מכירות",     level: 3, color: "text-green-300" },
  { id: "ACCOUNTANT",            label: "חשב/רואה חשבון",  level: 2, color: "text-sky-300" },
  { id: "PURCHASER",             label: "רוכש",              level: 2, color: "text-amber-300" },
  { id: "WAREHOUSE_OPERATOR",    label: "מחסנאי",            level: 2, color: "text-emerald-300" },
  { id: "VIEW_ONLY_AUDITOR",     label: "מבקר (צפייה)",    level: 1, color: "text-gray-400" },
];

// ---------------------------------------------------------------------------
// Data: Permissions (rows)
// ---------------------------------------------------------------------------

const PERMISSIONS: PermissionDef[] = [
  // System
  { code: "USERS_VIEW",           label: "צפייה במשתמשים",              module: "system",      description: "צפייה ברשימת משתמשי המערכת" },
  { code: "USERS_CREATE",         label: "יצירת משתמשים",              module: "system",      description: "הוספת משתמשים חדשים למערכת" },
  { code: "USERS_EDIT",           label: "עריכת משתמשים",              module: "system",      description: "עדכון פרטי משתמשים קיימים" },
  { code: "USERS_DISABLE",        label: "השבתת משתמשים",              module: "system",      description: "השבתה/חסימה של משתמשים" },
  { code: "ROLES_VIEW",           label: "צפייה בתפקידים",            module: "system",      description: "צפייה ברשימת התפקידים" },
  { code: "ROLES_CREATE",         label: "יצירת תפקידים",             module: "system",      description: "הוספת תפקידים חדשים" },
  { code: "ROLES_EDIT",           label: "עריכת תפקידים",             module: "system",      description: "עדכון הגדרות תפקידים" },
  { code: "PERMISSIONS_VIEW",     label: "צפייה בהרשאות",             module: "system",      description: "צפייה במטריצת ההרשאות" },
  { code: "PERMISSIONS_EDIT",     label: "עריכת הרשאות",              module: "system",      description: "שינוי הרשאות של תפקידים" },
  { code: "AUDIT_VIEW",           label: "צפייה ביומן פעילות",       module: "system",      description: "צפייה ב-Audit Log" },

  // Customers
  { code: "CUSTOMERS_VIEW",       label: "צפייה בלקוחות",             module: "customers",   description: "צפייה ברשימת לקוחות" },
  { code: "CUSTOMERS_CREATE",     label: "יצירת לקוחות",              module: "customers",   description: "הוספת לקוחות חדשים" },
  { code: "CUSTOMERS_EDIT",       label: "עריכת לקוחות",              module: "customers",   description: "עדכון פרטי לקוחות" },

  // Vendors
  { code: "VENDORS_VIEW",         label: "צפייה בספקים",              module: "vendors",     description: "צפייה ברשימת ספקים" },
  { code: "VENDORS_CREATE",       label: "יצירת ספקים",               module: "vendors",     description: "הוספת ספקים חדשים" },
  { code: "VENDORS_EDIT",         label: "עריכת ספקים",               module: "vendors",     description: "עדכון פרטי ספקים" },

  // Items
  { code: "ITEMS_VIEW",           label: "צפייה בפריטים",             module: "items",       description: "צפייה ברשימת פריטים" },
  { code: "ITEMS_CREATE",         label: "יצירת פריטים",              module: "items",       description: "הוספת פריטים חדשים" },
  { code: "ITEMS_EDIT",           label: "עריכת פריטים",              module: "items",       description: "עדכון פרטי פריטים" },
  { code: "ITEMS_COST_VIEW",      label: "צפייה בעלויות פריטים",    module: "items",       description: "צפייה בנתוני עלויות" },
  { code: "ITEMS_COST_EDIT",      label: "עריכת עלויות פריטים",     module: "items",       description: "עדכון עלויות פריטים" },

  // Inventory
  { code: "STOCK_VIEW",           label: "צפייה במלאי",               module: "inventory",   description: "צפייה ביתרות מלאי" },
  { code: "STOCK_ADJUST",         label: "התאמת מלאי",                module: "inventory",   description: "ביצוע התאמות מלאי" },
  { code: "STOCK_TRANSFER",       label: "העברת מלאי",                module: "inventory",   description: "העברת מלאי בין מחסנים" },

  // Procurement
  { code: "PR_CREATE",            label: "יצירת דרישת רכש",          module: "procurement",  description: "פתיחת דרישת רכש חדשה" },
  { code: "PR_APPROVE",           label: "אישור דרישת רכש",          module: "procurement",  description: "אישור/דחיית דרישות רכש" },
  { code: "PO_CREATE",            label: "יצירת הזמנת רכש",          module: "procurement",  description: "יצירת הזמנת רכש חדשה" },
  { code: "PO_APPROVE",           label: "אישור הזמנת רכש",          module: "procurement",  description: "אישור/דחיית הזמנות רכש" },
  { code: "GOODS_RECEIPT_CREATE",  label: "קבלת סחורה",               module: "procurement",  description: "רישום קבלת סחורה מספקים" },
  { code: "AP_INVOICE_POST",      label: "רישום חשבונית ספק",        module: "procurement",  description: "רישום חשבוניות ספקים" },

  // Sales
  { code: "SALES_ORDER_CREATE",   label: "יצירת הזמנת מכירה",       module: "sales",       description: "פתיחת הזמנת מכירה חדשה" },
  { code: "SALES_ORDER_EDIT",     label: "עריכת הזמנת מכירה",       module: "sales",       description: "עדכון הזמנות מכירה" },
  { code: "AR_INVOICE_POST",      label: "רישום חשבונית לקוח",      module: "sales",       description: "רישום חשבוניות ללקוחות" },

  // Projects
  { code: "PROJECT_VIEW",         label: "צפייה בפרויקטים",          module: "projects",    description: "צפייה ברשימת פרויקטים" },
  { code: "PROJECT_EDIT",         label: "עריכת פרויקטים",           module: "projects",    description: "עדכון פרטי פרויקטים" },
  { code: "PROJECT_MARGIN_VIEW",  label: "צפייה ברווחיות פרויקט",  module: "projects",    description: "צפייה בנתוני רווחיות" },
  { code: "BOQ_EDIT",             label: "עריכת כתב כמויות",        module: "projects",    description: "עריכת BOQ של פרויקטים" },

  // Finance
  { code: "JOURNAL_CREATE",       label: "יצירת פקודת יומן",        module: "finance",     description: "יצירת פקודות יומן חדשות" },
  { code: "JOURNAL_POST",         label: "רישום פקודת יומן",        module: "finance",     description: "אישור ורישום סופי של פקודות" },
  { code: "GL_VIEW",              label: 'צפייה בספר חשבונות (GL)',  module: "finance",     description: "צפייה ב-General Ledger" },
  { code: "PNL_VIEW",             label: 'צפייה בדוח רו"ח',         module: "finance",     description: "צפייה בדוח רווח והפסד" },
  { code: "BALANCE_SHEET_VIEW",   label: "צפייה במאזן",              module: "finance",     description: "צפייה בדוח מאזן" },
];

// ---------------------------------------------------------------------------
// Helper: determine default cell value based on role level + permission code
// ---------------------------------------------------------------------------

function getDefaultValue(role: RoleDef, perm: PermissionDef): CellValue {
  const { level } = role;
  const { code, module } = perm;
  const isView = code.endsWith("_VIEW");

  // Level 5: CEO + SYSTEM_ADMIN get everything
  if (level === 5) return "granted";

  // Level 1: VIEW_ONLY_AUDITOR gets only *_VIEW permissions
  if (level === 1) return isView ? "granted" : "denied";

  // Level 4: Managers get full access to their own domain + VIEW everywhere
  if (level === 4) {
    if (isView) return "granted";
    if (role.id === "FINANCE_MANAGER") {
      if (module === "finance") return "granted";
      if (["CUSTOMERS_EDIT", "VENDORS_EDIT", "AP_INVOICE_POST", "AR_INVOICE_POST"].includes(code)) return "granted";
      if (["ITEMS_COST_VIEW", "ITEMS_COST_EDIT"].includes(code)) return "granted";
      return "denied";
    }
    if (role.id === "PROCUREMENT_MANAGER") {
      if (module === "procurement") return "granted";
      if (module === "vendors") return "granted";
      if (module === "inventory") return "granted";
      if (["ITEMS_CREATE", "ITEMS_EDIT", "ITEMS_COST_VIEW"].includes(code)) return "granted";
      return "denied";
    }
    if (role.id === "WAREHOUSE_MANAGER") {
      if (module === "inventory") return "granted";
      if (["GOODS_RECEIPT_CREATE"].includes(code)) return "granted";
      if (["ITEMS_CREATE", "ITEMS_EDIT"].includes(code)) return "granted";
      return "denied";
    }
    return "denied";
  }

  // Level 3: Mid-managers get their domain + limited cross-access
  if (level === 3) {
    if (isView) return "granted";
    if (role.id === "PROJECT_MANAGER") {
      if (module === "projects") return "granted";
      if (["CUSTOMERS_EDIT"].includes(code)) return "granted";
      return "denied";
    }
    if (role.id === "SALES_MANAGER") {
      if (module === "sales") return "granted";
      if (module === "customers") return "granted";
      if (["ITEMS_COST_VIEW", "PROJECT_MARGIN_VIEW"].includes(code)) return "granted";
      return "denied";
    }
    return "denied";
  }

  // Level 2: Operators get limited create/edit in their domain
  if (level === 2) {
    if (role.id === "ACCOUNTANT") {
      if (isView) return "granted";
      if (module === "finance") return "granted";
      if (["AP_INVOICE_POST", "AR_INVOICE_POST"].includes(code)) return "granted";
      if (["ITEMS_COST_VIEW"].includes(code)) return "granted";
      return "denied";
    }
    if (role.id === "PURCHASER") {
      if (["VENDORS_VIEW", "ITEMS_VIEW", "STOCK_VIEW", "ITEMS_COST_VIEW", "PROJECT_VIEW", "CUSTOMERS_VIEW"].includes(code)) return "granted";
      if (["PR_CREATE", "PO_CREATE", "GOODS_RECEIPT_CREATE"].includes(code)) return "granted";
      if (["VENDORS_CREATE", "VENDORS_EDIT"].includes(code)) return "granted";
      return "denied";
    }
    if (role.id === "WAREHOUSE_OPERATOR") {
      if (["STOCK_VIEW", "ITEMS_VIEW", "VENDORS_VIEW", "CUSTOMERS_VIEW"].includes(code)) return "granted";
      if (["STOCK_ADJUST", "STOCK_TRANSFER", "GOODS_RECEIPT_CREATE"].includes(code)) return "granted";
      return "denied";
    }
    return "denied";
  }

  return "unset";
}

// ---------------------------------------------------------------------------
// Build initial matrix
// ---------------------------------------------------------------------------

function buildInitialMatrix(): Record<string, Record<string, CellValue>> {
  const matrix: Record<string, Record<string, CellValue>> = {};
  for (const perm of PERMISSIONS) {
    matrix[perm.code] = {};
    for (const role of ROLES) {
      matrix[perm.code][role.id] = getDefaultValue(role, perm);
    }
  }
  return matrix;
}

// ---------------------------------------------------------------------------
// Component: Cell Renderer
// ---------------------------------------------------------------------------

function MatrixCell({
  value,
  onClick,
}: {
  value: CellValue;
  onClick: () => void;
}) {
  const config = {
    granted: {
      icon: <CheckCircle2 className="w-4 h-4" />,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10 hover:bg-emerald-500/20",
      ring: "ring-emerald-500/30",
    },
    denied: {
      icon: <XCircle className="w-4 h-4" />,
      color: "text-red-400",
      bg: "bg-red-500/10 hover:bg-red-500/20",
      ring: "ring-red-500/30",
    },
    unset: {
      icon: <Minus className="w-4 h-4" />,
      color: "text-gray-500",
      bg: "bg-white/[0.02] hover:bg-white/[0.06]",
      ring: "ring-white/10",
    },
  }[value];

  return (
    <button
      onClick={onClick}
      className={`w-full h-full flex items-center justify-center p-1.5 rounded transition-all duration-150 cursor-pointer ring-1 ${config.color} ${config.bg} ${config.ring}`}
      title={value === "granted" ? "מאושר" : value === "denied" ? "נדחה" : "לא מוגדר"}
    >
      {config.icon}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PermissionsMatrixPage() {
  const [matrix, setMatrix] = useState<Record<string, Record<string, CellValue>>>(buildInitialMatrix);
  const [activeModule, setActiveModule] = useState<ModuleKey>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showLegend, setShowLegend] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [hoveredCol, setHoveredCol] = useState<string | null>(null);
  const [changeLog, setChangeLog] = useState<Array<{ perm: string; role: string; from: CellValue; to: CellValue; time: Date }>>([]);

  // Toggle cell: granted -> denied -> unset -> granted
  const toggleCell = useCallback(
    (permCode: string, roleId: string) => {
      setMatrix((prev) => {
        const current = prev[permCode]?.[roleId] ?? "unset";
        const next: CellValue =
          current === "granted" ? "denied" : current === "denied" ? "unset" : "granted";
        setChangeLog((cl) => [
          { perm: permCode, role: roleId, from: current, to: next, time: new Date() },
          ...cl.slice(0, 99),
        ]);
        return {
          ...prev,
          [permCode]: { ...prev[permCode], [roleId]: next },
        };
      });
    },
    []
  );

  // Reset to defaults
  const resetMatrix = useCallback(() => {
    setMatrix(buildInitialMatrix());
    setChangeLog([]);
  }, []);

  // Filter permissions by module + search
  const filteredPermissions = useMemo(() => {
    let perms = PERMISSIONS;
    if (activeModule !== "all") {
      perms = perms.filter((p) => p.module === activeModule);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      perms = perms.filter(
        (p) =>
          p.code.toLowerCase().includes(q) ||
          p.label.includes(q) ||
          p.description.includes(q)
      );
    }
    return perms;
  }, [activeModule, searchQuery]);

  // Group permissions by module for display
  const groupedPermissions = useMemo(() => {
    const groups: { module: ModuleDef; perms: PermissionDef[] }[] = [];
    const moduleOrder = MODULES.filter((m) => m.key !== "all");
    for (const mod of moduleOrder) {
      const perms = filteredPermissions.filter((p) => p.module === mod.key);
      if (perms.length > 0) {
        groups.push({ module: mod, perms });
      }
    }
    return groups;
  }, [filteredPermissions]);

  // Stats
  const stats = useMemo(() => {
    let totalGrants = 0;
    let totalDenied = 0;
    let totalUnset = 0;
    for (const perm of PERMISSIONS) {
      for (const role of ROLES) {
        const v = matrix[perm.code]?.[role.id];
        if (v === "granted") totalGrants++;
        else if (v === "denied") totalDenied++;
        else totalUnset++;
      }
    }
    return {
      totalPermissions: PERMISSIONS.length,
      totalRoles: ROLES.length,
      totalCells: PERMISSIONS.length * ROLES.length,
      totalGrants,
      totalDenied,
      totalUnset,
      grantPercent: Math.round((totalGrants / (PERMISSIONS.length * ROLES.length)) * 100),
      changes: changeLog.length,
    };
  }, [matrix, changeLog.length]);

  // Export to CSV
  const exportCSV = useCallback(() => {
    const header = ["Permission Code", "Permission Label", "Module", ...ROLES.map((r) => r.id)];
    const rows = PERMISSIONS.map((p) => [
      p.code,
      p.label,
      p.module,
      ...ROLES.map((r) => matrix[p.code]?.[r.id] ?? "unset"),
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `permissions-matrix-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [matrix]);

  // Copy matrix summary to clipboard
  const copyToClipboard = useCallback(() => {
    const lines: string[] = [];
    lines.push("PERMISSIONS MATRIX SUMMARY");
    lines.push(`Date: ${new Date().toLocaleDateString("he-IL")}`);
    lines.push(`Total Permissions: ${stats.totalPermissions}`);
    lines.push(`Total Roles: ${stats.totalRoles}`);
    lines.push(`Grants: ${stats.totalGrants} (${stats.grantPercent}%)`);
    lines.push("");
    for (const group of groupedPermissions) {
      lines.push(`--- ${group.module.label} ---`);
      for (const p of group.perms) {
        const vals = ROLES.map((r) => {
          const v = matrix[p.code]?.[r.id];
          return v === "granted" ? "V" : v === "denied" ? "X" : "-";
        }).join(" ");
        lines.push(`${p.code}: ${vals}`);
      }
      lines.push("");
    }
    navigator.clipboard.writeText(lines.join("\n"));
  }, [matrix, stats, groupedPermissions]);

  // Grant/deny all for a role column
  const setColumnAll = useCallback((roleId: string, value: CellValue) => {
    setMatrix((prev) => {
      const next = { ...prev };
      for (const perm of PERMISSIONS) {
        next[perm.code] = { ...next[perm.code], [roleId]: value };
      }
      return next;
    });
  }, []);

  // Grant/deny all for a permission row
  const setRowAll = useCallback((permCode: string, value: CellValue) => {
    setMatrix((prev) => {
      const row = { ...prev[permCode] };
      for (const role of ROLES) {
        row[role.id] = value;
      }
      return { ...prev, [permCode]: row };
    });
  }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white">
      {/* ---------------------------------------------------------------- */}
      {/* HEADER */}
      {/* ---------------------------------------------------------------- */}
      <div className="sticky top-0 z-40 bg-[#0a0e1a]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Title */}
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 ring-1 ring-purple-500/30">
                <Shield className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-l from-purple-300 to-blue-300 bg-clip-text text-transparent">
                  מטריצת הרשאות ראשית
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Master Permissions Matrix &middot; {stats.totalPermissions} permissions &times; {stats.totalRoles} roles
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowLegend(!showLegend)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
              >
                <Info className="w-3.5 h-3.5" />
                מקרא
              </button>
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                העתק
              </button>
              <button
                onClick={resetMatrix}
                className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-orange-300"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                איפוס
              </button>
              <button
                onClick={exportCSV}
                className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-gradient-to-l from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                ייצוא CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* ---------------------------------------------------------------- */}
        {/* STATS CARDS */}
        {/* ---------------------------------------------------------------- */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "סה\"כ הרשאות",   value: stats.totalPermissions, icon: Lock,          color: "text-purple-400", bg: "from-purple-500/10 to-purple-500/5" },
            { label: "תפקידים",          value: stats.totalRoles,       icon: Users,         color: "text-blue-400",   bg: "from-blue-500/10 to-blue-500/5" },
            { label: "סה\"כ תאים",     value: stats.totalCells,       icon: Grid3X3,       color: "text-gray-400",   bg: "from-gray-500/10 to-gray-500/5" },
            { label: "מאושרים",          value: stats.totalGrants,      icon: ShieldCheck,   color: "text-emerald-400",bg: "from-emerald-500/10 to-emerald-500/5" },
            { label: "נדחים",            value: stats.totalDenied,      icon: ShieldAlert,   color: "text-red-400",    bg: "from-red-500/10 to-red-500/5" },
            { label: "לא מוגדרים",      value: stats.totalUnset,       icon: Minus,         color: "text-gray-500",   bg: "from-gray-500/10 to-gray-500/5" },
            { label: "אחוז גישה",       value: `${stats.grantPercent}%`, icon: Eye,         color: "text-amber-400",  bg: "from-amber-500/10 to-amber-500/5" },
            { label: "שינויים",          value: stats.changes,          icon: Layers,        color: "text-cyan-400",   bg: "from-cyan-500/10 to-cyan-500/5" },
          ].map((s, i) => (
            <Card key={i} className="bg-gradient-to-br border-white/5 overflow-hidden" style={{ backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.03), transparent)` }}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-gradient-to-br ${s.bg}`}>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <div>
                  <div className="text-lg font-bold text-white">{s.value}</div>
                  <div className="text-[10px] text-gray-500 leading-tight">{s.label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* LEGEND (collapsible) */}
        {/* ---------------------------------------------------------------- */}
        {showLegend && (
          <Card className="bg-white/[0.03] border-white/10">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-6 text-sm">
                <span className="text-gray-400 font-medium">מקרא:</span>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-emerald-500/10 ring-1 ring-emerald-500/30">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </span>
                  <span className="text-gray-300">מאושר (Granted)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-red-500/10 ring-1 ring-red-500/30">
                    <XCircle className="w-4 h-4 text-red-400" />
                  </span>
                  <span className="text-gray-300">נדחה (Denied)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-white/[0.02] ring-1 ring-white/10">
                    <Minus className="w-4 h-4 text-gray-500" />
                  </span>
                  <span className="text-gray-300">לא מוגדר (Unset)</span>
                </div>
                <span className="text-gray-600 text-xs mr-4">לחץ על תא כדי לעבור: מאושר &rarr; נדחה &rarr; לא מוגדר &rarr; מאושר</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500">
                <span className="font-medium text-gray-400">רמות תפקידים:</span>
                <span>Level 5 = גישה מלאה</span>
                <span>Level 4 = מנהל מחלקה</span>
                <span>Level 3 = מנהל ביניים</span>
                <span>Level 2 = מפעיל</span>
                <span>Level 1 = צפייה בלבד</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* FILTERS: Module Tabs + Search */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Module filter tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/10 overflow-x-auto">
            {MODULES.map((mod) => {
              const isActive = activeModule === mod.key;
              return (
                <button
                  key={mod.key}
                  onClick={() => setActiveModule(mod.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                    isActive
                      ? `${mod.bgColor} ${mod.color} ring-1 ring-current/30`
                      : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                  }`}
                >
                  {mod.label}
                  {mod.key !== "all" && (
                    <span className={`text-[10px] ${isActive ? "opacity-80" : "opacity-50"}`}>
                      ({PERMISSIONS.filter((p) => p.module === mod.key).length})
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="חיפוש הרשאה לפי קוד, שם או תיאור..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-9 pl-3 py-2 text-sm bg-white/[0.03] border border-white/10 rounded-lg text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/30"
            />
          </div>

          {/* Filtered count */}
          <Badge variant="outline" className="text-gray-400 border-white/10 text-xs">
            {filteredPermissions.length} / {PERMISSIONS.length} הרשאות
          </Badge>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* MATRIX TABLE */}
        {/* ---------------------------------------------------------------- */}
        <Card className="bg-white/[0.02] border-white/10 overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-340px)]">
              <table className="w-full border-collapse min-w-[1100px]">
                {/* ---- STICKY HEADER ---- */}
                <thead className="sticky top-0 z-30">
                  {/* Role names row */}
                  <tr className="bg-[#0d1225]">
                    {/* Corner cell */}
                    <th
                      className="sticky right-0 z-40 bg-[#0d1225] text-right p-3 border-b border-l border-white/10 min-w-[280px] w-[280px]"
                    >
                      <div className="flex items-center gap-2 text-sm font-bold text-gray-300">
                        <Filter className="w-4 h-4" />
                        הרשאה / תפקיד
                      </div>
                    </th>
                    {ROLES.map((role) => (
                      <th
                        key={role.id}
                        className={`p-2 border-b border-l border-white/10 text-center min-w-[88px] w-[88px] transition-colors ${
                          hoveredCol === role.id ? "bg-white/[0.06]" : ""
                        }`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-[10px] font-bold ${role.color}`}>
                            {role.label}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1.5 py-0 border-white/10 text-gray-500"
                          >
                            L{role.level}
                          </Badge>
                        </div>
                      </th>
                    ))}
                  </tr>
                  {/* Quick actions row */}
                  <tr className="bg-[#0b0f1f]">
                    <th className="sticky right-0 z-40 bg-[#0b0f1f] text-right p-1.5 border-b border-l border-white/10">
                      <span className="text-[10px] text-gray-600 pr-2">פעולה מהירה על עמודה</span>
                    </th>
                    {ROLES.map((role) => (
                      <th
                        key={`action-${role.id}`}
                        className="p-1 border-b border-l border-white/10 text-center"
                      >
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            onClick={() => setColumnAll(role.id, "granted")}
                            title="אשר הכל"
                            className="p-0.5 rounded hover:bg-emerald-500/20 transition-colors"
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-500/60 hover:text-emerald-400" />
                          </button>
                          <button
                            onClick={() => setColumnAll(role.id, "denied")}
                            title="דחה הכל"
                            className="p-0.5 rounded hover:bg-red-500/20 transition-colors"
                          >
                            <XCircle className="w-3 h-3 text-red-500/60 hover:text-red-400" />
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* ---- BODY: Grouped by Module ---- */}
                <tbody>
                  {groupedPermissions.map((group) => (
                    <>
                      {/* Module group header */}
                      <tr key={`header-${group.module.key}`} className="bg-white/[0.02]">
                        <td
                          colSpan={ROLES.length + 1}
                          className="sticky right-0 z-20 p-2 border-b border-white/10"
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-6 rounded-full ${group.module.bgColor.replace("/15", "/60")}`} />
                            <span className={`text-sm font-bold ${group.module.color}`}>
                              {group.module.label}
                            </span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-white/10 text-gray-500">
                              {group.perms.length} הרשאות
                            </Badge>
                          </div>
                        </td>
                      </tr>
                      {/* Permission rows */}
                      {group.perms.map((perm, idx) => {
                        const isHovered = hoveredRow === perm.code;
                        return (
                          <tr
                            key={perm.code}
                            className={`transition-colors ${
                              isHovered ? "bg-white/[0.04]" : idx % 2 === 0 ? "bg-transparent" : "bg-white/[0.015]"
                            }`}
                            onMouseEnter={() => setHoveredRow(perm.code)}
                            onMouseLeave={() => setHoveredRow(null)}
                          >
                            {/* Permission label (sticky first column) */}
                            <td
                              className={`sticky right-0 z-20 p-2 pr-3 border-b border-l border-white/[0.06] min-w-[280px] w-[280px] ${
                                isHovered ? "bg-[#0e1428]" : idx % 2 === 0 ? "bg-[#0a0e1a]" : "bg-[#0b1020]"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <code className="text-[10px] text-gray-500 font-mono bg-white/5 px-1.5 py-0.5 rounded">
                                      {perm.code}
                                    </code>
                                    {/* Row quick actions */}
                                    {isHovered && (
                                      <div className="flex items-center gap-0.5 mr-1">
                                        <button
                                          onClick={() => setRowAll(perm.code, "granted")}
                                          title="אשר הכל בשורה"
                                          className="p-0.5 rounded hover:bg-emerald-500/20 transition-colors"
                                        >
                                          <CheckCircle2 className="w-3 h-3 text-emerald-500/60" />
                                        </button>
                                        <button
                                          onClick={() => setRowAll(perm.code, "denied")}
                                          title="דחה הכל בשורה"
                                          className="p-0.5 rounded hover:bg-red-500/20 transition-colors"
                                        >
                                          <XCircle className="w-3 h-3 text-red-500/60" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-300 mt-0.5 truncate">{perm.label}</div>
                                  {isHovered && (
                                    <div className="text-[10px] text-gray-600 mt-0.5">{perm.description}</div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Matrix cells */}
                            {ROLES.map((role) => (
                              <td
                                key={`${perm.code}-${role.id}`}
                                className={`p-1 border-b border-l border-white/[0.06] text-center transition-colors ${
                                  hoveredCol === role.id ? "bg-white/[0.03]" : ""
                                }`}
                                onMouseEnter={() => setHoveredCol(role.id)}
                                onMouseLeave={() => setHoveredCol(null)}
                              >
                                <MatrixCell
                                  value={matrix[perm.code]?.[role.id] ?? "unset"}
                                  onClick={() => toggleCell(perm.code, role.id)}
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </>
                  ))}
                </tbody>

                {/* ---- FOOTER: Summary row ---- */}
                <tfoot className="sticky bottom-0 z-30">
                  <tr className="bg-[#0d1225] border-t border-white/10">
                    <td className="sticky right-0 z-40 bg-[#0d1225] p-2 pr-3 border-l border-white/10">
                      <span className="text-xs font-bold text-gray-400">סיכום לפי תפקיד</span>
                    </td>
                    {ROLES.map((role) => {
                      const granted = PERMISSIONS.filter(
                        (p) => matrix[p.code]?.[role.id] === "granted"
                      ).length;
                      const pct = Math.round((granted / PERMISSIONS.length) * 100);
                      return (
                        <td key={`summary-${role.id}`} className="p-2 border-l border-white/10 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-xs font-bold text-white">{granted}</span>
                            <div className="w-full bg-white/10 rounded-full h-1.5">
                              <div
                                className="bg-gradient-to-l from-emerald-400 to-emerald-600 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[9px] text-gray-500">{pct}%</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* ROLE SUMMARY CARDS */}
        {/* ---------------------------------------------------------------- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {ROLES.map((role) => {
            const granted = PERMISSIONS.filter((p) => matrix[p.code]?.[role.id] === "granted").length;
            const denied = PERMISSIONS.filter((p) => matrix[p.code]?.[role.id] === "denied").length;
            const unset = PERMISSIONS.length - granted - denied;
            const pct = Math.round((granted / PERMISSIONS.length) * 100);

            // Module breakdown
            const moduleBreakdown = MODULES.filter((m) => m.key !== "all").map((mod) => {
              const modPerms = PERMISSIONS.filter((p) => p.module === mod.key);
              const modGranted = modPerms.filter((p) => matrix[p.code]?.[role.id] === "granted").length;
              return { module: mod, total: modPerms.length, granted: modGranted };
            });

            return (
              <Card key={role.id} className="bg-white/[0.03] border-white/[0.06] hover:border-white/10 transition-colors">
                <CardHeader className="pb-2 p-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      <span className={`font-bold ${role.color}`}>{role.label}</span>
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px] border-white/10 text-gray-500">
                      Level {role.level}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                  {/* Progress bar */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                      <span>אחוז הרשאות מאושרות</span>
                      <span className="font-bold text-white">{pct}%</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-2">
                      <div
                        className="bg-gradient-to-l from-emerald-400 to-emerald-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Grant/Deny/Unset counters */}
                  <div className="flex items-center gap-3 text-[10px]">
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span className="text-gray-400">{granted}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <XCircle className="w-3 h-3 text-red-400" />
                      <span className="text-gray-400">{denied}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Minus className="w-3 h-3 text-gray-500" />
                      <span className="text-gray-400">{unset}</span>
                    </div>
                  </div>

                  {/* Module mini-breakdown */}
                  <div className="space-y-1">
                    {moduleBreakdown.map(({ module: mod, total, granted: g }) => (
                      <div key={mod.key} className="flex items-center gap-2 text-[10px]">
                        <div className={`w-1.5 h-1.5 rounded-full ${mod.bgColor.replace("/15", "/60")}`} />
                        <span className="text-gray-500 w-16 truncate">{mod.label}</span>
                        <div className="flex-1 bg-white/5 rounded-full h-1">
                          <div
                            className={`h-1 rounded-full transition-all duration-300 ${
                              g === total ? "bg-emerald-500" : g > 0 ? "bg-amber-500" : "bg-white/10"
                            }`}
                            style={{ width: total > 0 ? `${(g / total) * 100}%` : "0%" }}
                          />
                        </div>
                        <span className="text-gray-600 w-8 text-left">{g}/{total}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* CHANGE LOG */}
        {/* ---------------------------------------------------------------- */}
        {changeLog.length > 0 && (
          <Card className="bg-white/[0.02] border-white/10">
            <CardHeader className="pb-2 p-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  יומן שינויים ({changeLog.length})
                </CardTitle>
                <button
                  onClick={() => setChangeLog([])}
                  className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                >
                  נקה יומן
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="max-h-40 overflow-y-auto space-y-1">
                {changeLog.slice(0, 20).map((entry, i) => {
                  const permDef = PERMISSIONS.find((p) => p.code === entry.perm);
                  const roleDef = ROLES.find((r) => r.id === entry.role);
                  const valueLabel = (v: CellValue) =>
                    v === "granted" ? "מאושר" : v === "denied" ? "נדחה" : "לא מוגדר";
                  const valueColor = (v: CellValue) =>
                    v === "granted" ? "text-emerald-400" : v === "denied" ? "text-red-400" : "text-gray-500";
                  return (
                    <div key={i} className="flex items-center gap-2 text-[11px] text-gray-400">
                      <span className="text-gray-600 w-12 text-left font-mono">
                        {entry.time.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                      <code className="text-gray-500 bg-white/5 px-1 rounded text-[10px]">{entry.perm}</code>
                      <span className="text-gray-600">&larr;</span>
                      <span className={`font-medium ${roleDef?.color ?? "text-gray-400"}`}>{roleDef?.label}</span>
                      <span className="text-gray-600">:</span>
                      <span className={valueColor(entry.from)}>{valueLabel(entry.from)}</span>
                      <span className="text-gray-600">&rarr;</span>
                      <span className={valueColor(entry.to)}>{valueLabel(entry.to)}</span>
                    </div>
                  );
                })}
                {changeLog.length > 20 && (
                  <div className="text-[10px] text-gray-600 text-center pt-1">
                    ... ועוד {changeLog.length - 20} שינויים
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* MODULE ACCESS HEATMAP */}
        {/* ---------------------------------------------------------------- */}
        <Card className="bg-white/[0.02] border-white/10">
          <CardHeader className="pb-2 p-4">
            <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
              <Grid3X3 className="w-4 h-4 text-purple-400" />
              מפת חום: גישה לפי מודול
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[800px]">
                <thead>
                  <tr>
                    <th className="text-right p-2 text-xs text-gray-500 border-b border-white/10 w-28">מודול</th>
                    {ROLES.map((role) => (
                      <th key={role.id} className="p-2 text-center text-[10px] text-gray-500 border-b border-white/10">
                        {role.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODULES.filter((m) => m.key !== "all").map((mod) => {
                    const modPerms = PERMISSIONS.filter((p) => p.module === mod.key);
                    return (
                      <tr key={mod.key}>
                        <td className="p-2 border-b border-white/[0.06]">
                          <span className={`text-xs font-medium ${mod.color}`}>{mod.label}</span>
                        </td>
                        {ROLES.map((role) => {
                          const granted = modPerms.filter((p) => matrix[p.code]?.[role.id] === "granted").length;
                          const pct = modPerms.length > 0 ? Math.round((granted / modPerms.length) * 100) : 0;
                          const intensity =
                            pct === 100 ? "bg-emerald-500/30 text-emerald-300" :
                            pct >= 75  ? "bg-emerald-500/20 text-emerald-400" :
                            pct >= 50  ? "bg-amber-500/20 text-amber-400" :
                            pct >= 25  ? "bg-orange-500/15 text-orange-400" :
                            pct > 0    ? "bg-red-500/10 text-red-400" :
                                         "bg-white/[0.02] text-gray-600";
                          return (
                            <td key={role.id} className="p-1.5 border-b border-white/[0.06] text-center">
                              <div className={`rounded px-1.5 py-1 text-[10px] font-bold ${intensity}`}>
                                {pct}%
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* SECURITY NOTES */}
        {/* ---------------------------------------------------------------- */}
        <Card className="bg-gradient-to-l from-yellow-500/5 to-transparent border-yellow-500/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-yellow-300">הערות אבטחה</h3>
                <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
                  <li>שינויים במטריצה זו משפיעים על גישת המשתמשים בזמן אמת.</li>
                  <li>המערכת פועלת ב-Fail Closed: אם טעינת ההרשאות נכשלת, הגישה נחסמת אוטומטית.</li>
                  <li>כל שינוי נרשם ביומן הביקורת (Audit Log) של המערכת.</li>
                  <li>מומלץ לבצע סקירת הרשאות (Access Review) לפחות אחת לרבעון.</li>
                  <li>הרשאת PERMISSIONS_EDIT צריכה להיות מוגבלת למנהל מערכת בלבד.</li>
                  <li>עקרון ההרשאה המינימלית (Least Privilege): יש להעניק רק את ההרשאות הנדרשות לביצוע התפקיד.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bottom spacer */}
        <div className="h-8" />
      </div>
    </div>
  );
}
