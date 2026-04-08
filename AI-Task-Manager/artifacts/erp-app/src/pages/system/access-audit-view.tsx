import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity, Search, Filter, Download, Clock, Shield, ShieldAlert,
  ShieldX, ShieldCheck, AlertTriangle, CheckCircle, XCircle, Info,
  User, Eye, LogIn, LogOut, Key, Lock, Unlock, UserPlus, UserX,
  RefreshCw, FileText, Database, Settings, BarChart3, Calendar,
  ChevronDown, List, GitBranch, AlertOctagon, Zap
} from "lucide-react";

// ─── Types & Data ──────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  actionHe: string;
  entityType: string;
  entityId: string;
  permissionCode: string;
  result: "SUCCESS" | "DENIED" | "ERROR" | "INFO";
  ipAddress: string;
  details: string;
  severity: "low" | "medium" | "high" | "critical";
}

const fmt = Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

const FALLBACK_MOCK_AUDIT_DATA: AuditEntry[] = [
  { id: "AE001", timestamp: "2026-04-08T08:02:14", userId: "U008", userName: "ליאור שמש", action: "login", actionHe: "כניסה למערכת", entityType: "session", entityId: "SES-44801", permissionCode: "SYS.AUTH.LOGIN", result: "SUCCESS", ipAddress: "10.0.1.55", details: "התחברות מוצלחת — Chrome / Windows", severity: "low" },
  { id: "AE002", timestamp: "2026-04-08T08:05:22", userId: "U001", userName: "אבי כהן", action: "login", actionHe: "כניסה למערכת", entityType: "session", entityId: "SES-44802", permissionCode: "SYS.AUTH.LOGIN", result: "SUCCESS", ipAddress: "10.0.1.12", details: "התחברות מוצלחת — Firefox / macOS", severity: "low" },
  { id: "AE003", timestamp: "2026-04-08T08:12:45", userId: "U003", userName: "דוד מזרחי", action: "data_access", actionHe: "גישה לנתונים", entityType: "sales_orders", entityId: "SO-10234", permissionCode: "SALES.ORDER.VIEW", result: "SUCCESS", ipAddress: "10.0.2.30", details: "צפייה בהזמנת מכירה SO-10234", severity: "low" },
  { id: "AE004", timestamp: "2026-04-08T08:15:33", userId: "U006", userName: "נועה פרידמן", action: "data_access", actionHe: "גישה לנתונים", entityType: "customers", entityId: "CUST-VIP-007", permissionCode: "CRM.CUSTOMER.VIEW", result: "DENIED", ipAddress: "10.0.2.45", details: "ניסיון גישה ללקוח VIP — אין scope מתאים", severity: "high" },
  { id: "AE005", timestamp: "2026-04-08T08:18:09", userId: "U001", userName: "אבי כהן", action: "posting", actionHe: "רישום חשבונאי", entityType: "journal_entries", entityId: "JE-2026-1842", permissionCode: "FIN.GL.POST", result: "SUCCESS", ipAddress: "10.0.1.12", details: "פקודת יומן ₪45,200 — הוצאות הנהלה", severity: "low" },
  { id: "AE006", timestamp: "2026-04-08T08:22:17", userId: "U007", userName: "יוסי גולד", action: "posting", actionHe: "רישום חשבונאי", entityType: "journal_entries", entityId: "JE-2026-1843", permissionCode: "FIN.GL.POST", result: "SUCCESS", ipAddress: "10.0.1.18", details: "פקודת יומן ₪12,800 — רכישת ציוד", severity: "low" },
  { id: "AE007", timestamp: "2026-04-08T08:25:41", userId: "U002", userName: "שרה לוי", action: "approval", actionHe: "אישור", entityType: "purchase_orders", entityId: "PO-7821", permissionCode: "PO.APPROVE", result: "SUCCESS", ipAddress: "10.0.1.22", details: "אישור הזמנת רכש PO-7821 — ₪28,500", severity: "low" },
  { id: "AE008", timestamp: "2026-04-08T08:30:55", userId: "U011", userName: "מיכל דנון", action: "data_access", actionHe: "גישה לנתונים", entityType: "purchase_orders", entityId: "PO-7822", permissionCode: "PO.APPROVE", result: "DENIED", ipAddress: "10.0.1.23", details: "ניסיון אישור הזמנה — אין הרשאה לתפקיד זה", severity: "high" },
  { id: "AE009", timestamp: "2026-04-08T08:35:12", userId: "U008", userName: "ליאור שמש", action: "role_change", actionHe: "שינוי תפקיד", entityType: "user_roles", entityId: "U013", permissionCode: "SYS.ROLE.MANAGE", result: "SUCCESS", ipAddress: "10.0.1.55", details: "הוספת תפקיד HR_CLERK להילה נחמני", severity: "medium" },
  { id: "AE010", timestamp: "2026-04-08T08:40:28", userId: "U008", userName: "ליאור שמש", action: "permission_grant", actionHe: "הענקת הרשאה", entityType: "permission_overrides", entityId: "OV-NEW-001", permissionCode: "SYS.PERM.OVERRIDE", result: "SUCCESS", ipAddress: "10.0.1.55", details: "דריסת הרשאה FIN.GL.POST ליוסי גולד — ALLOW", severity: "medium" },
  { id: "AE011", timestamp: "2026-04-08T08:45:03", userId: "U003", userName: "דוד מזרחי", action: "data_access", actionHe: "גישה לנתונים", entityType: "hr_payroll", entityId: "PAY-2026-03", permissionCode: "HR.PAYROLL.VIEW", result: "DENIED", ipAddress: "10.0.2.30", details: "ניסיון צפייה בנתוני שכר — אין הרשאה", severity: "critical" },
  { id: "AE012", timestamp: "2026-04-08T08:48:19", userId: "U012", userName: "אלון ביטון", action: "login", actionHe: "כניסה למערכת", entityType: "session", entityId: "SES-44805", permissionCode: "SYS.AUTH.LOGIN", result: "SUCCESS", ipAddress: "10.0.1.1", details: "התחברות מוצלחת — Safari / macOS", severity: "low" },
  { id: "AE013", timestamp: "2026-04-08T09:02:44", userId: "U012", userName: "אלון ביטון", action: "approval", actionHe: "אישור", entityType: "purchase_orders", entityId: "PO-7819", permissionCode: "PO.APPROVE", result: "SUCCESS", ipAddress: "10.0.1.1", details: "אישור CEO להזמנת רכש PO-7819 — ₪125,000", severity: "low" },
  { id: "AE014", timestamp: "2026-04-08T09:10:55", userId: "U004", userName: "רחל אברהם", action: "data_access", actionHe: "גישה לנתונים", entityType: "employees", entityId: "EMP-045", permissionCode: "HR.EMPLOYEE.VIEW", result: "SUCCESS", ipAddress: "10.0.3.10", details: "צפייה בכרטיס עובד — משה ברק", severity: "low" },
  { id: "AE015", timestamp: "2026-04-08T09:15:33", userId: "U008", userName: "ליאור שמש", action: "permission_deny", actionHe: "חסימת הרשאה", entityType: "permission_overrides", entityId: "OV-NEW-002", permissionCode: "SYS.PERM.OVERRIDE", result: "SUCCESS", ipAddress: "10.0.1.55", details: "דריסת הרשאה SALES.DISCOUNT.HIGH לנועה פרידמן — DENY", severity: "medium" },
  { id: "AE016", timestamp: "2026-04-08T09:20:18", userId: "U005", userName: "משה ברק", action: "data_access", actionHe: "גישה לנתונים", entityType: "inventory", entityId: "INV-ADJ-1122", permissionCode: "INV.ADJUST", result: "SUCCESS", ipAddress: "10.0.4.15", details: "התאמת מלאי — פרופיל אלומיניום 100mm — +25 יח'", severity: "low" },
  { id: "AE017", timestamp: "2026-04-08T09:25:47", userId: "U009", userName: "תמר רוזן", action: "data_access", actionHe: "גישה לנתונים", entityType: "project_budget", entityId: "PRJ-001-BDG", permissionCode: "PRJ.BUDGET.VIEW", result: "SUCCESS", ipAddress: "10.0.3.22", details: "צפייה בתקציב פרויקט PRJ-001 — בניין משרדים הרצליה", severity: "low" },
  { id: "AE018", timestamp: "2026-04-08T09:30:02", userId: "U015", userName: "דנה קפלן", action: "login", actionHe: "כניסה למערכת", entityType: "session", entityId: "SES-44810", permissionCode: "SYS.AUTH.LOGIN", result: "ERROR", ipAddress: "192.168.5.99", details: "כניסה נכשלה — סיסמה שגויה (ניסיון 3/5)", severity: "high" },
  { id: "AE019", timestamp: "2026-04-08T09:35:19", userId: "U015", userName: "דנה קפלן", action: "login", actionHe: "כניסה למערכת", entityType: "session", entityId: "SES-44811", permissionCode: "SYS.AUTH.LOGIN", result: "ERROR", ipAddress: "192.168.5.99", details: "כניסה נכשלה — סיסמה שגויה (ניסיון 4/5)", severity: "high" },
  { id: "AE020", timestamp: "2026-04-08T09:38:44", userId: "U008", userName: "ליאור שמש", action: "user_lock", actionHe: "נעילת משתמש", entityType: "users", entityId: "U015", permissionCode: "SYS.USER.MANAGE", result: "SUCCESS", ipAddress: "10.0.1.55", details: "נעילת חשבון דנה קפלן — עקב ניסיונות כושלים", severity: "critical" },
  { id: "AE021", timestamp: "2026-04-08T09:42:08", userId: "U008", userName: "ליאור שמש", action: "password_reset", actionHe: "איפוס סיסמה", entityType: "users", entityId: "U015", permissionCode: "SYS.USER.MANAGE", result: "SUCCESS", ipAddress: "10.0.1.55", details: "איפוס סיסמה לדנה קפלן — נשלח מייל חדש", severity: "medium" },
  { id: "AE022", timestamp: "2026-04-08T09:48:33", userId: "U001", userName: "אבי כהן", action: "approval", actionHe: "אישור", entityType: "payments", entityId: "PMT-6655", permissionCode: "FIN.AP.APPROVE", result: "SUCCESS", ipAddress: "10.0.1.12", details: "אישור תשלום לספק חומרי גלם — ₪67,800", severity: "low" },
  { id: "AE023", timestamp: "2026-04-08T09:55:11", userId: "U014", userName: "רון אשכנזי", action: "data_access", actionHe: "גישה לנתונים", entityType: "financial_reports", entityId: "RPT-PL-2026Q1", permissionCode: "REPORT.FINANCIAL", result: "SUCCESS", ipAddress: "10.0.1.8", details: "צפייה בדוח רווח והפסד Q1 2026", severity: "low" },
  { id: "AE024", timestamp: "2026-04-08T10:02:29", userId: "U007", userName: "יוסי גולד", action: "posting", actionHe: "רישום חשבונאי", entityType: "journal_entries", entityId: "JE-2026-1845", permissionCode: "FIN.GL.CLOSE", result: "DENIED", ipAddress: "10.0.1.18", details: "ניסיון סגירת תקופה מרץ 2026 — אין הרשאת סגירה", severity: "high" },
  { id: "AE025", timestamp: "2026-04-08T10:08:55", userId: "U010", userName: "עומר חדד", action: "data_access", actionHe: "גישה לנתונים", entityType: "inventory", entityId: "WH-MAIN", permissionCode: "INV.VIEW", result: "DENIED", ipAddress: "10.0.4.20", details: "ניסיון צפייה במחסן ראשי — אין scope מתאים (יש scope רק למחסן שפלה)", severity: "high" },
  { id: "AE026", timestamp: "2026-04-08T10:15:03", userId: "U008", userName: "ליאור שמש", action: "role_change", actionHe: "שינוי תפקיד", entityType: "user_roles", entityId: "U010", permissionCode: "SYS.ROLE.MANAGE", result: "SUCCESS", ipAddress: "10.0.1.55", details: "הקצאת תפקיד WAREHOUSE_MANAGER לעומר חדד", severity: "medium" },
  { id: "AE027", timestamp: "2026-04-08T10:22:41", userId: "U002", userName: "שרה לוי", action: "data_access", actionHe: "גישה לנתונים", entityType: "inventory", entityId: "INV-ADJ-1123", permissionCode: "INV.ADJUST", result: "DENIED", ipAddress: "10.0.1.22", details: "ניסיון התאמת מלאי — הרשאה חסומה (RESTRICT override)", severity: "high" },
  { id: "AE028", timestamp: "2026-04-08T10:30:17", userId: "U012", userName: "אלון ביטון", action: "data_access", actionHe: "גישה לנתונים", entityType: "financial_reports", entityId: "RPT-CF-2026Q1", permissionCode: "REPORT.FINANCIAL", result: "SUCCESS", ipAddress: "10.0.1.1", details: "ייצוא דוח תזרים מזומנים Q1 2026 ל-Excel", severity: "low" },
  { id: "AE029", timestamp: "2026-04-08T10:35:08", userId: "U013", userName: "הילה נחמני", action: "data_access", actionHe: "גישה לנתונים", entityType: "employees", entityId: "EMP-ALL", permissionCode: "HR.EMPLOYEE.VIEW", result: "DENIED", ipAddress: "10.0.3.11", details: "ניסיון צפייה בכל העובדים — scope מוגבל למחלקת HR", severity: "medium" },
  { id: "AE030", timestamp: "2026-04-08T10:42:55", userId: "U003", userName: "דוד מזרחי", action: "data_access", actionHe: "גישה לנתונים", entityType: "sales_orders", entityId: "SO-10240", permissionCode: "SALES.DISCOUNT.HIGH", result: "SUCCESS", ipAddress: "10.0.2.30", details: "יצירת הזמנה עם הנחה 25% — ללקוח VIP (הוענקה גישה זמנית)", severity: "medium" },
];

const ACTION_ICONS: Record<string, { icon: any; color: string }> = {
  login: { icon: LogIn, color: "text-blue-400" },
  logout: { icon: LogOut, color: "text-gray-400" },
  data_access: { icon: Eye, color: "text-cyan-400" },
  posting: { icon: FileText, color: "text-emerald-400" },
  approval: { icon: CheckCircle, color: "text-green-400" },
  role_change: { icon: Shield, color: "text-purple-400" },
  permission_grant: { icon: Unlock, color: "text-emerald-400" },
  permission_deny: { icon: Lock, color: "text-red-400" },
  user_lock: { icon: UserX, color: "text-red-400" },
  password_reset: { icon: Key, color: "text-amber-400" },
};

const RESULT_STYLES: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  SUCCESS: { label: "הצלחה", color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/30", icon: CheckCircle },
  DENIED: { label: "נחסם", color: "text-red-400", bg: "bg-red-500/15 border-red-500/30", icon: XCircle },
  ERROR: { label: "שגיאה", color: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/30", icon: AlertTriangle },
  INFO: { label: "מידע", color: "text-blue-400", bg: "bg-blue-500/15 border-blue-500/30", icon: Info },
};

const SEVERITY_DOT: Record<string, string> = {
  low: "bg-gray-500",
  medium: "bg-amber-500",
  high: "bg-orange-500",
  critical: "bg-red-500",
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function AccessAuditView() {
  const { data: accessauditviewData } = useQuery({
    queryKey: ["access-audit-view"],
    queryFn: () => authFetch("/api/system/access_audit_view"),
    staleTime: 5 * 60 * 1000,
  });

  const MOCK_AUDIT_DATA = accessauditviewData ?? FALLBACK_MOCK_AUDIT_DATA;

  const [entries] = useState<AuditEntry[]>(MOCK_AUDIT_DATA);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterResult, setFilterResult] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterEntity, setFilterEntity] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "timeline">("table");
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const uniqueUsers = useMemo(() => [...new Set(entries.map((e) => e.userName))], [entries]);
  const uniqueActions = useMemo(() => [...new Set(entries.map((e) => e.action))], [entries]);
  const uniqueEntities = useMemo(() => [...new Set(entries.map((e) => e.entityType))], [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const matchSearch = !searchQuery ||
        e.userName.includes(searchQuery) ||
        e.details.includes(searchQuery) ||
        e.entityId.includes(searchQuery) ||
        e.permissionCode.includes(searchQuery);
      const matchResult = !filterResult || e.result === filterResult;
      const matchAction = !filterAction || e.action === filterAction;
      const matchUser = !filterUser || e.userName === filterUser;
      const matchEntity = !filterEntity || e.entityType === filterEntity;
      return matchSearch && matchResult && matchAction && matchUser && matchEntity;
    });
  }, [entries, searchQuery, filterResult, filterAction, filterUser, filterEntity]);

  // Stats
  const totalToday = entries.length;
  const deniedAttempts = entries.filter((e) => e.result === "DENIED").length;
  const roleChanges = entries.filter((e) => e.action === "role_change").length;
  const permOverrides = entries.filter((e) => e.action === "permission_grant" || e.action === "permission_deny").length;
  const criticalEvents = entries.filter((e) => e.severity === "critical" || e.severity === "high").length;
  const errorEvents = entries.filter((e) => e.result === "ERROR").length;

  const actionLabels: Record<string, string> = {
    login: "כניסה", logout: "יציאה", data_access: "גישה לנתונים", posting: "רישום",
    approval: "אישור", role_change: "שינוי תפקיד", permission_grant: "הענקת הרשאה",
    permission_deny: "חסימת הרשאה", user_lock: "נעילה", password_reset: "איפוס סיסמה",
  };

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-7 w-7 text-cyan-400" />
            לוג ביקורת גישה
          </h1>
          <p className="text-sm text-gray-400 mt-1">מעקב בזמן אמת אחר פעולות גישה, שינויי הרשאות וחסימות</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode(viewMode === "table" ? "timeline" : "table")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition ${
              viewMode === "timeline"
                ? "bg-cyan-600/15 border-cyan-500/40 text-cyan-400"
                : "bg-[#111827] border-gray-700 text-gray-400 hover:text-white"
            }`}
          >
            {viewMode === "table" ? <GitBranch className="w-4 h-4" /> : <List className="w-4 h-4" />}
            {viewMode === "table" ? "ציר זמן" : "טבלה"}
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-[#111827] border border-gray-700 rounded-lg text-sm text-gray-300 hover:text-white transition">
            <Download className="w-4 h-4" />
            ייצוא
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: "אירועים היום", value: totalToday, icon: Activity, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "גישה נחסמה", value: deniedAttempts, icon: ShieldX, color: "text-red-400", bg: "bg-red-500/10" },
          { label: "שגיאות", value: errorEvents, icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10" },
          { label: "שינויי תפקיד", value: roleChanges, icon: Shield, color: "text-purple-400", bg: "bg-purple-500/10" },
          { label: "דריסות הרשאות", value: permOverrides, icon: Key, color: "text-cyan-400", bg: "bg-cyan-500/10" },
          { label: "אירועים קריטיים", value: criticalEvents, icon: AlertOctagon, color: "text-orange-400", bg: "bg-orange-500/10" },
        ].map((s, i) => (
          <Card key={i} className="bg-[#111827] border-gray-800">
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <div>
                <p className="text-[11px] text-gray-500">{s.label}</p>
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter Bar */}
      <Card className="bg-[#111827] border-gray-800">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute right-3 top-2.5 text-gray-500" />
              <input
                className="w-full bg-[#0d1321] border border-gray-700 rounded-lg pr-9 pl-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                placeholder="חיפוש לפי משתמש, פרטים, מזהה, קוד הרשאה..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              className="bg-[#0d1321] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
            >
              <option value="">כל המשתמשים</option>
              {uniqueUsers.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <select
              className="bg-[#0d1321] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
            >
              <option value="">כל הפעולות</option>
              {uniqueActions.map((a) => (
                <option key={a} value={a}>{actionLabels[a] || a}</option>
              ))}
            </select>
            <select
              className="bg-[#0d1321] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
              value={filterResult}
              onChange={(e) => setFilterResult(e.target.value)}
            >
              <option value="">כל התוצאות</option>
              <option value="SUCCESS">הצלחה</option>
              <option value="DENIED">נחסם</option>
              <option value="ERROR">שגיאה</option>
            </select>
            <select
              className="bg-[#0d1321] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
              value={filterEntity}
              onChange={(e) => setFilterEntity(e.target.value)}
            >
              <option value="">כל הישויות</option>
              {uniqueEntities.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Table View */}
      {viewMode === "table" && (
        <Card className="bg-[#111827] border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <List className="w-4 h-4 text-cyan-400" />
              לוג אירועים ({filteredEntries.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs border-b border-gray-800">
                    <th className="text-right py-2.5 pr-2 w-5"></th>
                    <th className="text-right py-2.5">תאריך/שעה</th>
                    <th className="text-right py-2.5">משתמש</th>
                    <th className="text-right py-2.5">פעולה</th>
                    <th className="text-right py-2.5">ישות</th>
                    <th className="text-right py-2.5">מזהה</th>
                    <th className="text-right py-2.5">קוד הרשאה</th>
                    <th className="text-center py-2.5">תוצאה</th>
                    <th className="text-right py-2.5">IP</th>
                    <th className="text-right py-2.5">פרטים</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((e) => {
                    const actionDef = ACTION_ICONS[e.action] || { icon: Zap, color: "text-gray-400" };
                    const resultDef = RESULT_STYLES[e.result];
                    const ResultIcon = resultDef.icon;
                    return (
                      <tr
                        key={e.id}
                        onClick={() => setExpandedEntry(expandedEntry === e.id ? null : e.id)}
                        className="border-b border-gray-800/50 hover:bg-[#1a2035] cursor-pointer"
                      >
                        <td className="py-2.5 pr-2">
                          <div className={`w-2 h-2 rounded-full ${SEVERITY_DOT[e.severity]}`} title={e.severity} />
                        </td>
                        <td className="py-2.5 text-gray-400 text-xs whitespace-nowrap">
                          <Clock className="w-3 h-3 inline ml-1 text-gray-600" />
                          {fmt.format(new Date(e.timestamp))}
                        </td>
                        <td className="py-2.5">
                          <span className="text-xs font-medium text-white flex items-center gap-1.5">
                            <User className="w-3 h-3 text-gray-600" />
                            {e.userName}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <span className={`text-xs flex items-center gap-1 ${actionDef.color}`}>
                            <actionDef.icon className="w-3.5 h-3.5" />
                            {e.actionHe}
                          </span>
                        </td>
                        <td className="py-2.5 text-gray-400 text-xs">{e.entityType}</td>
                        <td className="py-2.5">
                          <code className="text-[10px] bg-[#0d1321] px-1.5 py-0.5 rounded text-gray-300 font-mono">{e.entityId}</code>
                        </td>
                        <td className="py-2.5">
                          <code className="text-[10px] bg-[#0d1321] px-1.5 py-0.5 rounded text-gray-400 font-mono">{e.permissionCode}</code>
                        </td>
                        <td className="py-2.5 text-center">
                          <Badge className={`border text-[10px] ${resultDef.bg}`}>
                            <ResultIcon className={`w-3 h-3 ml-1 ${resultDef.color}`} />
                            {resultDef.label}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-gray-500 text-[11px] font-mono">{e.ipAddress}</td>
                        <td className="py-2.5 text-gray-400 text-xs max-w-[200px] truncate" title={e.details}>
                          {e.details}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline View */}
      {viewMode === "timeline" && (
        <Card className="bg-[#111827] border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-cyan-400" />
              ציר זמן ({filteredEntries.length} אירועים)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 max-h-[700px] overflow-y-auto">
            <div className="relative pr-8">
              {/* Timeline line */}
              <div className="absolute right-3 top-0 bottom-0 w-0.5 bg-gray-800" />

              {filteredEntries.map((e, idx) => {
                const actionDef = ACTION_ICONS[e.action] || { icon: Zap, color: "text-gray-400" };
                const resultDef = RESULT_STYLES[e.result];
                const ActionIcon = actionDef.icon;
                const isExpanded = expandedEntry === e.id;
                return (
                  <div key={e.id} className="relative mb-3 mr-2">
                    {/* Timeline dot */}
                    <div className={`absolute -right-[22px] top-3 w-3 h-3 rounded-full border-2 border-[#111827] ${SEVERITY_DOT[e.severity]}`} />

                    <div
                      onClick={() => setExpandedEntry(isExpanded ? null : e.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition ${
                        e.result === "DENIED"
                          ? "bg-red-900/10 border-red-900/30 hover:border-red-700/40"
                          : e.result === "ERROR"
                            ? "bg-amber-900/10 border-amber-900/30 hover:border-amber-700/40"
                            : "bg-[#0d1321] border-gray-800 hover:border-gray-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <ActionIcon className={`w-4 h-4 ${actionDef.color}`} />
                          <span className="text-sm font-medium text-white">{e.userName}</span>
                          <span className="text-xs text-gray-400">{e.actionHe}</span>
                          <Badge className={`border text-[10px] ${resultDef.bg}`}>
                            {resultDef.label}
                          </Badge>
                        </div>
                        <span className="text-xs text-gray-500">
                          {fmt.format(new Date(e.timestamp))}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5">{e.details}</p>
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-gray-800 grid grid-cols-4 gap-3 text-xs">
                          <div>
                            <span className="text-gray-600">ישות:</span>
                            <span className="text-gray-300 mr-1">{e.entityType}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">מזהה:</span>
                            <code className="text-gray-300 mr-1 font-mono">{e.entityId}</code>
                          </div>
                          <div>
                            <span className="text-gray-600">הרשאה:</span>
                            <code className="text-gray-300 mr-1 font-mono">{e.permissionCode}</code>
                          </div>
                          <div>
                            <span className="text-gray-600">IP:</span>
                            <span className="text-gray-300 mr-1 font-mono">{e.ipAddress}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
