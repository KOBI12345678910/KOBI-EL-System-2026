import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  User,
  Mail,
  Phone,
  Building2,
  Shield,
  Lock,
  KeyRound,
  UserX,
  Edit,
  Plus,
  Trash2,
  Clock,
  Monitor,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
  Eye,
  Wifi,
  Briefcase,
  Calendar,
  Users,
  ArrowUpDown,
  ChevronLeft,
} from "lucide-react";

// ─── Mock Data ───────────────────────────────────────────────────────────────

const mockUser = {
  id: "USR-00142",
  firstName: "יוסף",
  lastName: "כהן",
  initials: "יכ",
  email: "yosef.cohen@erp-corp.co.il",
  phone: "050-7234891",
  employeeCode: "EMP-1042",
  status: "active" as const,
  defaultRole: "מנהל מכירות",
  department: "מכירות",
  jobTitle: "מנהל מכירות בכיר",
  branch: "סניף תל אביב - מרכז",
  hireDate: "2019-03-15",
  manager: "דני לוי",
  employmentType: "משרה מלאה",
  workSchedule: "א׳-ה׳ 08:00-17:00",
};

const FALLBACK_MOCK_ROLES = [
  { id: 1, role: "מנהל מכירות", level: "מחלקתי", startDate: "2022-01-15", endDate: null, active: true },
  { id: 2, role: "מאשר הזמנות", level: "ארגוני", startDate: "2021-06-01", endDate: null, active: true },
  { id: 3, role: "צופה דוחות כספיים", level: "קריאה בלבד", startDate: "2020-09-10", endDate: null, active: true },
  { id: 4, role: "מנהל פרויקטים", level: "פרויקט", startDate: "2019-03-15", endDate: "2022-01-14", active: false },
  { id: 5, role: "נציג שירות", level: "בסיסי", startDate: "2019-03-15", endDate: "2020-08-31", active: false },
];

const FALLBACK_MOCK_PERMISSIONS = [
  { id: 1, code: "SALES_DISCOUNT_OVERRIDE", name: "אישור הנחות מעל 20%", module: "מכירות", type: "allow", override: "כן", expiry: "2026-12-31" },
  { id: 2, code: "REPORT_EXPORT_ALL", name: "ייצוא כל הדוחות", module: "דוחות", type: "allow", override: "לא", expiry: null },
  { id: 3, code: "CUSTOMER_DELETE", name: "מחיקת לקוחות", module: "CRM", type: "deny", override: "כן", expiry: null },
  { id: 4, code: "INVENTORY_ADJUST", name: "התאמת מלאי ידנית", module: "מלאי", type: "allow", override: "כן", expiry: "2026-06-30" },
  { id: 5, code: "PAYROLL_VIEW", name: "צפייה בנתוני שכר", module: "שכר", type: "deny", override: "כן", expiry: null },
  { id: 6, code: "PO_APPROVE_HIGH", name: "אישור הזמנות מעל 50K", module: "רכש", type: "allow", override: "לא", expiry: "2027-03-31" },
];

const FALLBACK_MOCK_DATA_SCOPES = [
  { id: 1, type: "branch", typeLabel: "סניף", value: "סניף תל אביב - מרכז", access: "ALLOW" },
  { id: 2, type: "branch", typeLabel: "סניף", value: "סניף חיפה", access: "ALLOW" },
  { id: 3, type: "warehouse", typeLabel: "מחסן", value: "מחסן ראשי TLV", access: "ALLOW" },
  { id: 4, type: "warehouse", typeLabel: "מחסן", value: "מחסן חיפה צפון", access: "ALLOW" },
  { id: 5, type: "department", typeLabel: "מחלקה", value: "מכירות", access: "ALLOW" },
  { id: 6, type: "department", typeLabel: "מחלקה", value: "שיווק", access: "ALLOW" },
  { id: 7, type: "customer_group", typeLabel: "קבוצת לקוחות", value: "לקוחות VIP", access: "ALLOW" },
  { id: 8, type: "customer_group", typeLabel: "קבוצת לקוחות", value: "לקוחות מוסדיים", access: "ALLOW" },
  { id: 9, type: "project", typeLabel: "פרויקט", value: "פרויקט אלפא 2026", access: "ALLOW" },
  { id: 10, type: "branch", typeLabel: "סניף", value: "סניף באר שבע", access: "DENY" },
];

const FALLBACK_MOCK_APPROVAL_LIMITS = [
  { id: 1, docType: "הזמנת רכש", action: "אישור", min: 0, max: 50000, requiredRole: "מנהל מכירות", escalation: "מנהל כספים" },
  { id: 2, docType: "הזמנת רכש", action: "אישור", min: 50001, max: 200000, requiredRole: "סמנכ״ל", escalation: "מנכ״ל" },
  { id: 3, docType: "הצעת מחיר", action: "אישור הנחה", min: 0, max: 15, requiredRole: "מנהל מכירות", escalation: "סמנכ״ל מכירות" },
  { id: 4, docType: "חשבונית זיכוי", action: "הנפקה", min: 0, max: 10000, requiredRole: "מנהל מכירות", escalation: "מנהל כספים" },
  { id: 5, docType: "תשלום לספק", action: "אישור", min: 0, max: 75000, requiredRole: "מנהל מכירות", escalation: "סמנכ״ל כספים" },
  { id: 6, docType: "בקשת חופשה", action: "אישור", min: 1, max: 5, requiredRole: "מנהל ישיר", escalation: "מנהל משאבי אנוש" },
];

const FALLBACK_MOCK_AUDIT_HISTORY = [
  { id: 1, date: "2026-04-08 09:12:33", action: "התחברות", entity: "מערכת", details: "התחברות מוצלחת דרך SSO", result: "success", ip: "10.0.1.45" },
  { id: 2, date: "2026-04-08 09:15:20", action: "צפייה", entity: "דוח מכירות חודשי", details: "ייצוא דוח מכירות מרץ 2026", result: "success", ip: "10.0.1.45" },
  { id: 3, date: "2026-04-07 16:45:10", action: "עדכון", entity: "לקוח #4521", details: "שינוי תנאי תשלום מ-שוטף+30 ל-שוטף+60", result: "success", ip: "10.0.1.45" },
  { id: 4, date: "2026-04-07 14:30:00", action: "אישור", entity: "הזמנת רכש #PO-8834", details: "אישור הזמנה בסך 42,500 ש״ח", result: "success", ip: "10.0.1.45" },
  { id: 5, date: "2026-04-07 11:20:15", action: "ניסיון מחיקה", entity: "לקוח #3200", details: "ניסיון מחיקת לקוח - נדחה עקב הרשאה חסרה", result: "denied", ip: "10.0.1.45" },
  { id: 6, date: "2026-04-06 17:55:44", action: "שינוי סיסמה", entity: "חשבון משתמש", details: "שינוי סיסמה בהצלחה", result: "success", ip: "192.168.1.12" },
  { id: 7, date: "2026-04-06 10:08:22", action: "יצירה", entity: "הצעת מחיר #Q-2267", details: "הצעת מחיר חדשה ללקוח מגדלי השמש בע״מ", result: "success", ip: "10.0.1.45" },
  { id: 8, date: "2026-04-05 15:30:00", action: "התחברות נכשלה", entity: "מערכת", details: "ניסיון התחברות עם סיסמה שגויה (ניסיון 1/5)", result: "warning", ip: "85.130.42.7" },
  { id: 9, date: "2026-04-05 13:22:10", action: "עדכון תפקיד", entity: "משתמש USR-00142", details: "הוספת תפקיד ׳מאשר הזמנות׳ ע״י מנהל מערכת", result: "success", ip: "10.0.1.2" },
  { id: 10, date: "2026-04-04 09:00:05", action: "התחברות", entity: "מערכת", details: "התחברות מוצלחת", result: "success", ip: "10.0.1.45" },
];

const FALLBACK_MOCK_SESSIONS = [
  { id: "SES-A1B2C3", ip: "10.0.1.45", device: "Chrome 124 / Windows 11", location: "תל אביב, ישראל", startTime: "2026-04-08 08:55:00", lastActivity: "2026-04-08 09:22:14", active: true },
  { id: "SES-D4E5F6", ip: "10.0.2.112", device: "Edge 124 / Windows 11", location: "תל אביב, ישראל", startTime: "2026-04-08 07:30:00", lastActivity: "2026-04-08 08:50:00", active: false },
  { id: "SES-G7H8I9", ip: "192.168.1.12", device: "Safari 17 / macOS Sonoma", location: "הרצליה, ישראל", startTime: "2026-04-06 20:15:00", lastActivity: "2026-04-06 21:10:33", active: false },
  { id: "SES-J1K2L3", ip: "85.130.42.7", device: "Chrome 124 / Android 15", location: "חיפה, ישראל", startTime: "2026-04-05 15:28:00", lastActivity: "2026-04-05 15:30:05", active: false },
];

// ─── Status & type maps ──────────────────────────────────────────────────────

const statusMap: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: "פעיל", color: "text-emerald-400", bg: "bg-emerald-500/20" },
  inactive: { label: "לא פעיל", color: "text-gray-400", bg: "bg-gray-500/20" },
  locked: { label: "נעול", color: "text-red-400", bg: "bg-red-500/20" },
  suspended: { label: "מושעה", color: "text-amber-400", bg: "bg-amber-500/20" },
};

const resultMap: Record<string, { label: string; color: string; bg: string }> = {
  success: { label: "הצלחה", color: "text-emerald-400", bg: "bg-emerald-500/20" },
  denied: { label: "נדחה", color: "text-red-400", bg: "bg-red-500/20" },
  warning: { label: "אזהרה", color: "text-amber-400", bg: "bg-amber-500/20" },
};

const scopeTypeIcons: Record<string, typeof Building2> = {
  branch: Building2,
  warehouse: Building2,
  department: Users,
  customer_group: Users,
  project: Briefcase,
};

// ─── Helper ──────────────────────────────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return "-";
  const date = new Date(d);
  return date.toLocaleDateString("he-IL");
}

function formatDateTime(d: string | null) {
  if (!d) return "-";
  const date = new Date(d);
  return (
    date.toLocaleDateString("he-IL") +
    " " +
    date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function UserCardPage() {
  const { data: usercardData } = useQuery({
    queryKey: ["user-card"],
    queryFn: () => authFetch("/api/system/user_card"),
    staleTime: 5 * 60 * 1000,
  });

  const mockRoles = usercardData ?? FALLBACK_MOCK_ROLES;
  const mockApprovalLimits = FALLBACK_MOCK_APPROVAL_LIMITS;
  const mockAuditHistory = FALLBACK_MOCK_AUDIT_HISTORY;
  const mockDataScopes = FALLBACK_MOCK_DATA_SCOPES;
  const mockPermissions = FALLBACK_MOCK_PERMISSIONS;
  const mockSessions = FALLBACK_MOCK_SESSIONS;

  const [activeTab, setActiveTab] = useState("general");
  const user = mockUser;
  const userStatus = statusMap[user.status];

  // ── Header ──────────────────────────────────────────────────────────

  const renderHeader = () => (
    <Card className="border-border/60 bg-[#0d1228]">
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Avatar + core info */}
          <div className="flex items-start gap-5 flex-1">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-2xl font-bold text-white shrink-0 shadow-lg shadow-blue-500/20">
              {user.initials}
            </div>
            <div className="space-y-2 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-white">
                  {user.firstName} {user.lastName}
                </h1>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${userStatus.bg} ${userStatus.color}`}>
                  <CheckCircle2 size={12} />
                  {userStatus.label}
                </span>
                <Badge variant="secondary" className="text-xs">
                  <Shield size={11} className="ml-1" />
                  {user.defaultRole}
                </Badge>
              </div>
              <div className="text-sm text-gray-400 font-mono">{user.employeeCode}</div>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-gray-300">
                <span className="inline-flex items-center gap-1.5">
                  <Mail size={14} className="text-gray-500" /> {user.email}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Phone size={14} className="text-gray-500" /> {user.phone}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Building2 size={14} className="text-gray-500" /> {user.department}
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 items-start shrink-0">
            <button className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
              <Edit size={14} /> עריכה
            </button>
            <button className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors">
              <Lock size={14} /> נעילה
            </button>
            <button className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-purple-500/40 text-purple-400 hover:bg-purple-500/10 transition-colors">
              <KeyRound size={14} /> איפוס סיסמה
            </button>
            <button className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors">
              <UserX size={14} /> השבתה
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // ── Tab 1: General ──────────────────────────────────────────────────

  const renderGeneral = () => {
    const fields = [
      { label: "שם פרטי", value: user.firstName, icon: User },
      { label: "שם משפחה", value: user.lastName, icon: User },
      { label: "דוא״ל", value: user.email, icon: Mail },
      { label: "טלפון", value: user.phone, icon: Phone },
      { label: "מחלקה", value: user.department, icon: Building2 },
      { label: "תפקיד", value: user.jobTitle, icon: Briefcase },
      { label: "סניף", value: user.branch, icon: MapPin },
      { label: "תאריך גיוס", value: formatDate(user.hireDate), icon: Calendar },
      { label: "מנהל ישיר", value: user.manager, icon: Users },
      { label: "סוג העסקה", value: user.employmentType, icon: Briefcase },
      { label: "לוח זמנים", value: user.workSchedule, icon: Clock },
      { label: "קוד עובד", value: user.employeeCode, icon: Shield },
    ];

    return (
      <Card className="border-border/60 bg-[#0d1228]">
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2 text-white">
            <User size={18} className="text-blue-400" />
            פרטים כלליים
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {fields.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={i} className="bg-[#0a0e1a] border border-border/40 rounded-xl p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Icon size={13} />
                    {f.label}
                  </div>
                  <div className="text-sm font-medium text-gray-200">{f.value}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  // ── Tab 2: Roles ────────────────────────────────────────────────────

  const renderRoles = () => (
    <Card className="border-border/60 bg-[#0d1228]">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-white">
            <Shield size={18} className="text-indigo-400" />
            תפקידים ({mockRoles.length})
          </CardTitle>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
            <Plus size={13} /> הוסף תפקיד
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-gray-500">
                <th className="text-right p-3 font-medium">תפקיד</th>
                <th className="text-right p-3 font-medium">רמה</th>
                <th className="text-right p-3 font-medium">תאריך התחלה</th>
                <th className="text-right p-3 font-medium">תאריך סיום</th>
                <th className="text-right p-3 font-medium">פעיל</th>
                <th className="text-right p-3 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {mockRoles.map((r) => (
                <tr key={r.id} className="border-b border-border/30 hover:bg-white/[0.02] transition-colors">
                  <td className="p-3 text-gray-200 font-medium">{r.role}</td>
                  <td className="p-3">
                    <span className="inline-flex px-2 py-0.5 rounded text-xs bg-blue-500/15 text-blue-400 border border-blue-500/20">
                      {r.level}
                    </span>
                  </td>
                  <td className="p-3 text-gray-400 text-xs font-mono">{formatDate(r.startDate)}</td>
                  <td className="p-3 text-gray-400 text-xs font-mono">{formatDate(r.endDate)}</td>
                  <td className="p-3">
                    {r.active ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle2 size={13} /> פעיל
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                        <XCircle size={13} /> לא פעיל
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <button className="p-1.5 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors" title="עריכה">
                        <Edit size={14} />
                      </button>
                      <button className="p-1.5 hover:bg-red-500/10 rounded text-gray-400 hover:text-red-400 transition-colors" title="מחיקה">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );

  // ── Tab 3: Direct Permissions ───────────────────────────────────────

  const renderPermissions = () => (
    <Card className="border-border/60 bg-[#0d1228]">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-white">
            <KeyRound size={18} className="text-amber-400" />
            הרשאות ישירות ({mockPermissions.length})
          </CardTitle>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors">
            <Plus size={13} /> הוסף דריסה
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-gray-500">
                <th className="text-right p-3 font-medium">קוד הרשאה</th>
                <th className="text-right p-3 font-medium">שם</th>
                <th className="text-right p-3 font-medium">מודול</th>
                <th className="text-right p-3 font-medium">סוג</th>
                <th className="text-right p-3 font-medium">מצב דריסה</th>
                <th className="text-right p-3 font-medium">תוקף</th>
                <th className="text-right p-3 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {mockPermissions.map((p) => (
                <tr key={p.id} className="border-b border-border/30 hover:bg-white/[0.02] transition-colors">
                  <td className="p-3 text-gray-400 text-xs font-mono">{p.code}</td>
                  <td className="p-3 text-gray-200">{p.name}</td>
                  <td className="p-3">
                    <span className="inline-flex px-2 py-0.5 rounded text-xs bg-slate-500/15 text-slate-300 border border-slate-500/20">
                      {p.module}
                    </span>
                  </td>
                  <td className="p-3">
                    {p.type === "allow" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 size={11} /> אישור
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-500/15 text-red-400 border border-red-500/20">
                        <XCircle size={11} /> חסימה
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {p.override === "כן" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                        <ArrowUpDown size={12} /> דורס
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">רגיל</span>
                    )}
                  </td>
                  <td className="p-3 text-gray-400 text-xs font-mono">{formatDate(p.expiry)}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <button className="p-1.5 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors" title="עריכה">
                        <Edit size={14} />
                      </button>
                      <button className="p-1.5 hover:bg-red-500/10 rounded text-gray-400 hover:text-red-400 transition-colors" title="מחיקה">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );

  // ── Tab 4: Data Scopes ──────────────────────────────────────────────

  const renderDataScopes = () => (
    <Card className="border-border/60 bg-[#0d1228]">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-white">
            <Eye size={18} className="text-cyan-400" />
            טווחי נתונים ({mockDataScopes.length})
          </CardTitle>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white transition-colors">
            <Plus size={13} /> הוסף טווח
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-gray-500">
                <th className="text-right p-3 font-medium">סוג</th>
                <th className="text-right p-3 font-medium">ערך</th>
                <th className="text-right p-3 font-medium">מצב גישה</th>
                <th className="text-right p-3 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {mockDataScopes.map((s) => {
                const ScopeIcon = scopeTypeIcons[s.type] || Building2;
                return (
                  <tr key={s.id} className="border-b border-border/30 hover:bg-white/[0.02] transition-colors">
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1.5 text-gray-300 text-sm">
                        <ScopeIcon size={14} className="text-gray-500" />
                        {s.typeLabel}
                      </span>
                    </td>
                    <td className="p-3 text-gray-200">{s.value}</td>
                    <td className="p-3">
                      {s.access === "ALLOW" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-medium">
                          <CheckCircle2 size={11} /> ALLOW
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs bg-red-500/15 text-red-400 border border-red-500/20 font-medium">
                          <XCircle size={11} /> DENY
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <button className="p-1.5 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors" title="עריכה">
                          <Edit size={14} />
                        </button>
                        <button className="p-1.5 hover:bg-red-500/10 rounded text-gray-400 hover:text-red-400 transition-colors" title="מחיקה">
                          <Trash2 size={14} />
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
  );

  // ── Tab 5: Approval Limits ──────────────────────────────────────────

  const renderApprovalLimits = () => (
    <Card className="border-border/60 bg-[#0d1228]">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-white">
            <AlertTriangle size={18} className="text-orange-400" />
            מדיניות אישורים ({mockApprovalLimits.length})
          </CardTitle>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition-colors">
            <Plus size={13} /> הוסף מדיניות
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-gray-500">
                <th className="text-right p-3 font-medium">סוג מסמך</th>
                <th className="text-right p-3 font-medium">פעולה</th>
                <th className="text-right p-3 font-medium">מינימום</th>
                <th className="text-right p-3 font-medium">מקסימום</th>
                <th className="text-right p-3 font-medium">תפקיד נדרש</th>
                <th className="text-right p-3 font-medium">הסלמה</th>
              </tr>
            </thead>
            <tbody>
              {mockApprovalLimits.map((a) => (
                <tr key={a.id} className="border-b border-border/30 hover:bg-white/[0.02] transition-colors">
                  <td className="p-3 text-gray-200 font-medium">{a.docType}</td>
                  <td className="p-3">
                    <span className="inline-flex px-2 py-0.5 rounded text-xs bg-violet-500/15 text-violet-400 border border-violet-500/20">
                      {a.action}
                    </span>
                  </td>
                  <td className="p-3 text-gray-300 text-xs font-mono">{a.min.toLocaleString("he-IL")}</td>
                  <td className="p-3 text-gray-300 text-xs font-mono">{a.max.toLocaleString("he-IL")}</td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1 text-sm text-gray-300">
                      <Shield size={13} className="text-gray-500" />
                      {a.requiredRole}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                      <ArrowUpDown size={12} />
                      {a.escalation}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );

  // ── Tab 6: Audit History ────────────────────────────────────────────

  const renderAuditHistory = () => (
    <Card className="border-border/60 bg-[#0d1228]">
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2 text-white">
          <History size={18} className="text-purple-400" />
          היסטוריית ביקורת ({mockAuditHistory.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-gray-500">
                <th className="text-right p-3 font-medium">תאריך</th>
                <th className="text-right p-3 font-medium">פעולה</th>
                <th className="text-right p-3 font-medium">ישות</th>
                <th className="text-right p-3 font-medium">פרטים</th>
                <th className="text-right p-3 font-medium">תוצאה</th>
                <th className="text-right p-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {mockAuditHistory.map((a) => {
                const res = resultMap[a.result] || resultMap.success;
                return (
                  <tr key={a.id} className="border-b border-border/30 hover:bg-white/[0.02] transition-colors">
                    <td className="p-3 text-gray-400 text-xs font-mono whitespace-nowrap">{formatDateTime(a.date)}</td>
                    <td className="p-3 text-gray-200">{a.action}</td>
                    <td className="p-3 text-gray-300 text-xs">{a.entity}</td>
                    <td className="p-3 text-gray-400 text-xs max-w-[280px] truncate">{a.details}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${res.bg} ${res.color}`}>
                        {a.result === "success" && <CheckCircle2 size={11} />}
                        {a.result === "denied" && <XCircle size={11} />}
                        {a.result === "warning" && <AlertTriangle size={11} />}
                        {res.label}
                      </span>
                    </td>
                    <td className="p-3 text-gray-500 text-xs font-mono">{a.ip}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );

  // ── Tab 7: Sessions ─────────────────────────────────────────────────

  const renderSessions = () => (
    <Card className="border-border/60 bg-[#0d1228]">
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2 text-white">
          <Monitor size={18} className="text-teal-400" />
          סשנים ({mockSessions.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-gray-500">
                <th className="text-right p-3 font-medium">מזהה</th>
                <th className="text-right p-3 font-medium">IP</th>
                <th className="text-right p-3 font-medium">מכשיר</th>
                <th className="text-right p-3 font-medium">מיקום</th>
                <th className="text-right p-3 font-medium">זמן התחלה</th>
                <th className="text-right p-3 font-medium">פעילות אחרונה</th>
                <th className="text-right p-3 font-medium">פעיל</th>
                <th className="text-right p-3 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {mockSessions.map((s) => (
                <tr key={s.id} className="border-b border-border/30 hover:bg-white/[0.02] transition-colors">
                  <td className="p-3 text-gray-400 text-xs font-mono">{s.id}</td>
                  <td className="p-3 text-gray-400 text-xs font-mono">{s.ip}</td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1.5 text-gray-300 text-xs">
                      <Monitor size={13} className="text-gray-500" />
                      {s.device}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1.5 text-gray-300 text-xs">
                      <MapPin size={13} className="text-gray-500" />
                      {s.location}
                    </span>
                  </td>
                  <td className="p-3 text-gray-400 text-xs font-mono whitespace-nowrap">{formatDateTime(s.startTime)}</td>
                  <td className="p-3 text-gray-400 text-xs font-mono whitespace-nowrap">{formatDateTime(s.lastActivity)}</td>
                  <td className="p-3">
                    {s.active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-medium">
                        <Wifi size={11} /> פעיל
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-500/15 text-gray-500 border border-gray-500/20">
                        <XCircle size={11} /> הסתיים
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {s.active && (
                      <button className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20 transition-colors">
                        <XCircle size={12} /> סיום
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );

  // ── Main Layout ─────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0e1a] p-4 md:p-6 space-y-6" dir="rtl">
      {/* Breadcrumb / back */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button className="inline-flex items-center gap-1 hover:text-gray-300 transition-colors">
          <ChevronLeft size={16} />
          חזרה לרשימת משתמשים
        </button>
        <span>/</span>
        <span className="text-gray-300">כרטיס משתמש</span>
      </div>

      {/* Header card */}
      {renderHeader()}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto pb-1">
          <TabsList className="bg-[#111633] border border-border/40 h-auto p-1 gap-0.5 inline-flex w-auto min-w-full sm:min-w-0">
            <TabsTrigger value="general" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-400 text-xs sm:text-sm px-3 py-2 gap-1.5">
              <User size={14} /> כללי
            </TabsTrigger>
            <TabsTrigger value="roles" className="data-[state=active]:bg-indigo-600/20 data-[state=active]:text-indigo-400 text-xs sm:text-sm px-3 py-2 gap-1.5">
              <Shield size={14} /> תפקידים
            </TabsTrigger>
            <TabsTrigger value="permissions" className="data-[state=active]:bg-amber-600/20 data-[state=active]:text-amber-400 text-xs sm:text-sm px-3 py-2 gap-1.5">
              <KeyRound size={14} /> הרשאות ישירות
            </TabsTrigger>
            <TabsTrigger value="scopes" className="data-[state=active]:bg-cyan-600/20 data-[state=active]:text-cyan-400 text-xs sm:text-sm px-3 py-2 gap-1.5">
              <Eye size={14} /> טווחי נתונים
            </TabsTrigger>
            <TabsTrigger value="approvals" className="data-[state=active]:bg-orange-600/20 data-[state=active]:text-orange-400 text-xs sm:text-sm px-3 py-2 gap-1.5">
              <AlertTriangle size={14} /> מדיניות אישורים
            </TabsTrigger>
            <TabsTrigger value="audit" className="data-[state=active]:bg-purple-600/20 data-[state=active]:text-purple-400 text-xs sm:text-sm px-3 py-2 gap-1.5">
              <History size={14} /> היסטוריית ביקורת
            </TabsTrigger>
            <TabsTrigger value="sessions" className="data-[state=active]:bg-teal-600/20 data-[state=active]:text-teal-400 text-xs sm:text-sm px-3 py-2 gap-1.5">
              <Monitor size={14} /> סשנים
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="general">{renderGeneral()}</TabsContent>
        <TabsContent value="roles">{renderRoles()}</TabsContent>
        <TabsContent value="permissions">{renderPermissions()}</TabsContent>
        <TabsContent value="scopes">{renderDataScopes()}</TabsContent>
        <TabsContent value="approvals">{renderApprovalLimits()}</TabsContent>
        <TabsContent value="audit">{renderAuditHistory()}</TabsContent>
        <TabsContent value="sessions">{renderSessions()}</TabsContent>
      </Tabs>
    </div>
  );
}
