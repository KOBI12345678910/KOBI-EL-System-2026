import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldAlert, ShieldCheck, ShieldX, Search, Plus, Trash2,
  AlertTriangle, Clock, User, Filter, Calendar, Lock, Unlock,
  Ban, CheckCircle, ChevronDown, Eye, FileWarning, Info
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface PermissionCatalogItem {
  code: string;
  name: string;
  module: string;
}

interface PermissionOverride {
  id: string;
  permissionCode: string;
  permissionName: string;
  module: string;
  allow: boolean;
  overrideMode: "OVERRIDE" | "EXTEND" | "RESTRICT";
  validFrom: string;
  validTo: string;
  reason: string;
  grantedBy: string;
  grantedAt: string;
  isActive: boolean;
}

interface UserRecord {
  id: string;
  name: string;
  email: string;
  department: string;
  overrides: PermissionOverride[];
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const FALLBACK_PERMISSION_CATALOG: PermissionCatalogItem[] = [
  { code: "FIN.GL.POST", name: "רישום פקודות יומן", module: "כספים" },
  { code: "FIN.GL.VIEW", name: "צפייה בספר חשבונות", module: "כספים" },
  { code: "FIN.GL.CLOSE", name: "סגירת תקופה", module: "כספים" },
  { code: "FIN.AP.CREATE", name: "יצירת חשבונית ספק", module: "כספים" },
  { code: "FIN.AP.APPROVE", name: "אישור תשלום ספק", module: "כספים" },
  { code: "FIN.AR.CREATE", name: "יצירת חשבונית לקוח", module: "כספים" },
  { code: "FIN.BUDGET.EDIT", name: "עריכת תקציב", module: "כספים" },
  { code: "PO.CREATE", name: "יצירת הזמנת רכש", module: "רכש" },
  { code: "PO.APPROVE", name: "אישור הזמנת רכש", module: "רכש" },
  { code: "PO.DELETE", name: "מחיקת הזמנת רכש", module: "רכש" },
  { code: "INV.ADJUST", name: "התאמת מלאי", module: "מלאי" },
  { code: "INV.TRANSFER", name: "העברת מלאי בין מחסנים", module: "מלאי" },
  { code: "INV.COUNT", name: "ספירת מלאי", module: "מלאי" },
  { code: "HR.PAYROLL.VIEW", name: "צפייה בשכר", module: "משאבי אנוש" },
  { code: "HR.PAYROLL.EDIT", name: "עריכת שכר", module: "משאבי אנוש" },
  { code: "HR.EMPLOYEE.CREATE", name: "הוספת עובד", module: "משאבי אנוש" },
  { code: "HR.LEAVE.APPROVE", name: "אישור חופשות", module: "משאבי אנוש" },
  { code: "SALES.ORDER.CREATE", name: "יצירת הזמנת מכירה", module: "מכירות" },
  { code: "SALES.QUOTE.CREATE", name: "יצירת הצעת מחיר", module: "מכירות" },
  { code: "SALES.DISCOUNT.HIGH", name: "הנחה מעל 20%", module: "מכירות" },
  { code: "PRJ.CREATE", name: "יצירת פרויקט", module: "פרויקטים" },
  { code: "PRJ.BUDGET.EDIT", name: "עריכת תקציב פרויקט", module: "פרויקטים" },
  { code: "SYS.USER.MANAGE", name: "ניהול משתמשים", module: "מערכת" },
  { code: "SYS.ROLE.MANAGE", name: "ניהול תפקידים", module: "מערכת" },
  { code: "SYS.AUDIT.VIEW", name: "צפייה ביומן ביקורת", module: "מערכת" },
  { code: "REPORT.EXPORT", name: "ייצוא דוחות", module: "דוחות" },
  { code: "REPORT.FINANCIAL", name: "דוחות כספיים", module: "דוחות" },
];

const FALLBACK_MOCK_USERS: UserRecord[] = [
  {
    id: "U001", name: "אבי כהן", email: "avi.cohen@company.co.il", department: "כספים",
    overrides: [
      { id: "OV001", permissionCode: "FIN.GL.CLOSE", permissionName: "סגירת תקופה", module: "כספים", allow: true, overrideMode: "EXTEND", validFrom: "2025-01-01", validTo: "2026-12-31", reason: "מנהל הכספים זקוק לגישה לסגירה חודשית", grantedBy: "ליאור שמש", grantedAt: "2025-01-01", isActive: true },
      { id: "OV002", permissionCode: "HR.PAYROLL.VIEW", permissionName: "צפייה בשכר", module: "משאבי אנוש", allow: true, overrideMode: "EXTEND", validFrom: "2025-06-01", validTo: "2025-12-31", reason: "נדרש לצורך הכנת תקציב שנתי", grantedBy: "רחל אברהם", grantedAt: "2025-06-01", isActive: true },
      { id: "OV003", permissionCode: "SALES.DISCOUNT.HIGH", permissionName: "הנחה מעל 20%", module: "מכירות", allow: false, overrideMode: "RESTRICT", validFrom: "2025-03-01", validTo: "2026-03-01", reason: "הגבלת מנהל כספים מהנחות מכירה", grantedBy: "ליאור שמש", grantedAt: "2025-03-01", isActive: true },
    ],
  },
  {
    id: "U002", name: "שרה לוי", email: "sara.levy@company.co.il", department: "רכש",
    overrides: [
      { id: "OV004", permissionCode: "PO.APPROVE", permissionName: "אישור הזמנת רכש", module: "רכש", allow: true, overrideMode: "OVERRIDE", validFrom: "2025-04-01", validTo: "2026-04-01", reason: "מנהלת רכש — הרשאת אישור עד ₪100,000", grantedBy: "ליאור שמש", grantedAt: "2025-04-01", isActive: true },
      { id: "OV005", permissionCode: "INV.ADJUST", permissionName: "התאמת מלאי", module: "מלאי", allow: false, overrideMode: "RESTRICT", validFrom: "2025-01-01", validTo: "2026-01-01", reason: "הפרדת תפקידים: רכש לא מבצע התאמות מלאי", grantedBy: "ליאור שמש", grantedAt: "2025-01-01", isActive: true },
    ],
  },
  {
    id: "U003", name: "דוד מזרחי", email: "david.m@company.co.il", department: "מכירות",
    overrides: [
      { id: "OV006", permissionCode: "SALES.DISCOUNT.HIGH", permissionName: "הנחה מעל 20%", module: "מכירות", allow: true, overrideMode: "OVERRIDE", validFrom: "2025-01-01", validTo: "2025-06-30", reason: "אישור זמני להנחות קמפיין Q1-Q2", grantedBy: "אלון ביטון", grantedAt: "2025-01-01", isActive: false },
      { id: "OV007", permissionCode: "FIN.AR.CREATE", permissionName: "יצירת חשבונית לקוח", module: "כספים", allow: true, overrideMode: "EXTEND", validFrom: "2025-09-01", validTo: "2026-09-01", reason: "גישה ישירה ליצירת חשבוניות ללקוחות VIP", grantedBy: "אבי כהן", grantedAt: "2025-09-01", isActive: true },
      { id: "OV008", permissionCode: "PO.CREATE", permissionName: "יצירת הזמנת רכש", module: "רכש", allow: false, overrideMode: "RESTRICT", validFrom: "2024-06-01", validTo: "2027-06-01", reason: "הפרדת תפקידים: מכירות לא יוצרות הזמנות רכש", grantedBy: "ליאור שמש", grantedAt: "2024-06-01", isActive: true },
    ],
  },
  {
    id: "U004", name: "רחל אברהם", email: "rachel.a@company.co.il", department: "משאבי אנוש",
    overrides: [
      { id: "OV009", permissionCode: "HR.PAYROLL.EDIT", permissionName: "עריכת שכר", module: "משאבי אנוש", allow: true, overrideMode: "OVERRIDE", validFrom: "2025-01-01", validTo: "2027-01-01", reason: "מנהלת HR אחראית על עדכוני שכר", grantedBy: "ליאור שמש", grantedAt: "2025-01-01", isActive: true },
      { id: "OV010", permissionCode: "FIN.BUDGET.EDIT", permissionName: "עריכת תקציב", module: "כספים", allow: false, overrideMode: "RESTRICT", validFrom: "2025-03-01", validTo: "2026-03-01", reason: "HR לא עורכת תקציב ישירות — דרך בקשה בלבד", grantedBy: "אבי כהן", grantedAt: "2025-03-01", isActive: true },
    ],
  },
  {
    id: "U005", name: "משה ברק", email: "moshe.b@company.co.il", department: "ייצור",
    overrides: [
      { id: "OV011", permissionCode: "INV.ADJUST", permissionName: "התאמת מלאי", module: "מלאי", allow: true, overrideMode: "EXTEND", validFrom: "2025-06-01", validTo: "2026-06-01", reason: "מנהל ייצור מבצע התאמות מלאי לאחר ספירה", grantedBy: "ליאור שמש", grantedAt: "2025-06-01", isActive: true },
      { id: "OV012", permissionCode: "INV.TRANSFER", permissionName: "העברת מלאי בין מחסנים", module: "מלאי", allow: true, overrideMode: "EXTEND", validFrom: "2025-06-01", validTo: "2026-06-01", reason: "צורך בהעברת חומרי גלם בין קווי ייצור", grantedBy: "ליאור שמש", grantedAt: "2025-06-01", isActive: true },
    ],
  },
  {
    id: "U007", name: "יוסי גולד", email: "yosi.g@company.co.il", department: "כספים",
    overrides: [
      { id: "OV013", permissionCode: "FIN.GL.POST", permissionName: "רישום פקודות יומן", module: "כספים", allow: true, overrideMode: "OVERRIDE", validFrom: "2025-04-01", validTo: "2025-04-30", reason: "גישה זמנית לרישום ידני — סגירת רבעון", grantedBy: "אבי כהן", grantedAt: "2025-04-01", isActive: true },
      { id: "OV014", permissionCode: "FIN.AP.APPROVE", permissionName: "אישור תשלום ספק", module: "כספים", allow: false, overrideMode: "RESTRICT", validFrom: "2024-01-01", validTo: "2027-01-01", reason: "פקיד — אינו מורשה לאשר תשלומים", grantedBy: "ליאור שמש", grantedAt: "2024-01-01", isActive: true },
    ],
  },
  {
    id: "U009", name: "תמר רוזן", email: "tamar.r@company.co.il", department: "פרויקטים",
    overrides: [
      { id: "OV015", permissionCode: "PRJ.BUDGET.EDIT", permissionName: "עריכת תקציב פרויקט", module: "פרויקטים", allow: true, overrideMode: "EXTEND", validFrom: "2025-02-01", validTo: "2026-12-31", reason: "מנהלת פרויקט — עריכת תקציב לפרויקטים בניהולה", grantedBy: "אבי כהן", grantedAt: "2025-02-01", isActive: true },
      { id: "OV016", permissionCode: "REPORT.FINANCIAL", permissionName: "דוחות כספיים", module: "דוחות", allow: true, overrideMode: "EXTEND", validFrom: "2025-02-01", validTo: "2026-12-31", reason: "צורך בדוחות כספיים לפרויקט", grantedBy: "אבי כהן", grantedAt: "2025-02-01", isActive: true },
    ],
  },
];

const MODULES = [...new Set(PERMISSION_CATALOG.map((p) => p.module))];

const fmt = Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });

// ─── Component ─────────────────────────────────────────────────────────────────

export default function UserPermissionOverride() {
  const { data: userpermissionoverrideData } = useQuery({
    queryKey: ["user-permission-override"],
    queryFn: () => authFetch("/api/system/user_permission_override"),
    staleTime: 5 * 60 * 1000,
  });

  const PERMISSION_CATALOG = userpermissionoverrideData ?? FALLBACK_PERMISSION_CATALOG;

  const [users, setUsers] = useState<UserRecord[]>(MOCK_USERS);
  const [selectedUserId, setSelectedUserId] = useState<string>("U001");
  const [moduleFilter, setModuleFilter] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  // Add form state
  const [newPermCode, setNewPermCode] = useState("");
  const [newAllow, setNewAllow] = useState(true);
  const [newMode, setNewMode] = useState<"OVERRIDE" | "EXTEND" | "RESTRICT">("EXTEND");
  const [newValidFrom, setNewValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [newValidTo, setNewValidTo] = useState(new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10));
  const [newReason, setNewReason] = useState("");

  const selectedUser = users.find((u) => u.id === selectedUserId) || null;

  const filteredOverrides = useMemo(() => {
    if (!selectedUser) return [];
    return selectedUser.overrides.filter((o) => !moduleFilter || o.module === moduleFilter);
  }, [selectedUser, moduleFilter]);

  // Stats
  const totalOverrides = selectedUser?.overrides.length || 0;
  const activeDenies = selectedUser?.overrides.filter((o) => !o.allow && o.isActive).length || 0;
  const expiringSoon = selectedUser?.overrides.filter((o) => {
    const daysLeft = (new Date(o.validTo).getTime() - Date.now()) / 86400000;
    return daysLeft > 0 && daysLeft < 30 && o.isActive;
  }).length || 0;
  const activeAllows = selectedUser?.overrides.filter((o) => o.allow && o.isActive).length || 0;

  const handleToggleAllow = (overrideId: string) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === selectedUserId
          ? { ...u, overrides: u.overrides.map((o) => (o.id === overrideId ? { ...o, allow: !o.allow } : o)) }
          : u,
      ),
    );
  };

  const handleRemoveOverride = (overrideId: string) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === selectedUserId
          ? { ...u, overrides: u.overrides.filter((o) => o.id !== overrideId) }
          : u,
      ),
    );
  };

  const handleAddOverride = () => {
    if (!newPermCode || !newReason || !selectedUserId) return;
    const perm = PERMISSION_CATALOG.find((p) => p.code === newPermCode);
    if (!perm) return;
    const newOv: PermissionOverride = {
      id: `OV${Date.now()}`,
      permissionCode: perm.code,
      permissionName: perm.name,
      module: perm.module,
      allow: newAllow,
      overrideMode: newMode,
      validFrom: newValidFrom,
      validTo: newValidTo,
      reason: newReason,
      grantedBy: "מנהל מערכת",
      grantedAt: new Date().toISOString().slice(0, 10),
      isActive: true,
    };
    setUsers((prev) =>
      prev.map((u) =>
        u.id === selectedUserId ? { ...u, overrides: [...u.overrides, newOv] } : u,
      ),
    );
    setShowAddForm(false);
    setNewPermCode("");
    setNewReason("");
    setNewAllow(true);
    setNewMode("EXTEND");
  };

  const modeLabels: Record<string, { label: string; color: string }> = {
    OVERRIDE: { label: "דריסה", color: "bg-red-500/15 text-red-400 border-red-500/30" },
    EXTEND: { label: "הרחבה", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    RESTRICT: { label: "הגבלה", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  };

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldAlert className="h-7 w-7 text-amber-400" />
          דריסת הרשאות למשתמש
        </h1>
        <p className="text-sm text-gray-400 mt-1">ניהול דריסות ישירות מעבר להרשאות תפקיד</p>
      </div>

      {/* Warning Banner */}
      <Card className="bg-amber-900/15 border-amber-700/40">
        <CardContent className="p-4 flex items-center gap-3">
          <FileWarning className="w-6 h-6 text-amber-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-400">
              דריסות ישירות עוקפות הרשאות תפקיד - השתמש בזהירות
            </p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              כל דריסה מתועדת ביומן ביקורת. יש לציין סיבה מפורטת לכל שינוי.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* User Selector */}
      <Card className="bg-[#111827] border-gray-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 flex-shrink-0">
              <User className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-400">משתמש:</span>
            </div>
            <select
              className="flex-1 bg-[#0d1321] border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              {MOCK_USERS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.department} ({u.overrides.length} דריסות)
                </option>
              ))}
            </select>
            <select
              className="bg-[#0d1321] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
            >
              <option value="">כל המודולים</option>
              {MODULES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "סה\"כ דריסות", value: totalOverrides, icon: ShieldAlert, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "הרשאות פעילות (ALLOW)", value: activeAllows, icon: ShieldCheck, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "חסימות פעילות (DENY)", value: activeDenies, icon: ShieldX, color: "text-red-400", bg: "bg-red-500/10" },
          { label: "פג תוקף בקרוב", value: expiringSoon, icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
        ].map((s, i) => (
          <Card key={i} className="bg-[#111827] border-gray-800">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-xs text-gray-400">{s.label}</p>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Overrides Table */}
      <Card className="bg-[#111827] border-gray-800">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              דריסות הרשאות — {selectedUser?.name || ""}
            </CardTitle>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition"
            >
              <Plus className="w-4 h-4" />
              הוסף דריסה
            </button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {filteredOverrides.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <ShieldCheck className="w-10 h-10 mx-auto mb-2 text-gray-700" />
              <p className="text-sm">אין דריסות הרשאות למשתמש זה</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs border-b border-gray-800">
                    <th className="text-right py-2.5 pr-2">קוד</th>
                    <th className="text-right py-2.5">הרשאה</th>
                    <th className="text-right py-2.5">מודול</th>
                    <th className="text-center py-2.5">הרשה/חסם</th>
                    <th className="text-center py-2.5">מצב דריסה</th>
                    <th className="text-right py-2.5">מ-</th>
                    <th className="text-right py-2.5">עד</th>
                    <th className="text-right py-2.5">סיבה</th>
                    <th className="text-right py-2.5">ע\"י</th>
                    <th className="text-center py-2.5">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOverrides.map((o) => {
                    const isExpired = new Date(o.validTo) < new Date();
                    const isExpiringSoon = !isExpired && (new Date(o.validTo).getTime() - Date.now()) / 86400000 < 30;
                    const mode = modeLabels[o.overrideMode];
                    return (
                      <tr key={o.id} className={`border-b border-gray-800/50 hover:bg-[#1a2035] ${isExpired ? "opacity-50" : ""}`}>
                        <td className="py-3 pr-2">
                          <code className="text-[11px] bg-[#0d1321] px-1.5 py-0.5 rounded text-gray-300 font-mono">{o.permissionCode}</code>
                        </td>
                        <td className="py-3 text-gray-300 text-xs">{o.permissionName}</td>
                        <td className="py-3">
                          <Badge className="bg-indigo-500/15 text-indigo-300 border-indigo-500/30 border text-[10px]">{o.module}</Badge>
                        </td>
                        <td className="py-3 text-center">
                          <button onClick={() => handleToggleAllow(o.id)} title={o.allow ? "הרשאה → חסימה" : "חסימה → הרשאה"}>
                            {o.allow ? (
                              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 border text-xs cursor-pointer hover:bg-emerald-500/25">
                                <Unlock className="w-3 h-3 ml-1" /> ALLOW
                              </Badge>
                            ) : (
                              <Badge className="bg-red-500/15 text-red-400 border-red-500/30 border text-xs cursor-pointer hover:bg-red-500/25">
                                <Ban className="w-3 h-3 ml-1" /> DENY
                              </Badge>
                            )}
                          </button>
                        </td>
                        <td className="py-3 text-center">
                          <Badge className={`border text-[10px] ${mode.color}`}>{mode.label}</Badge>
                        </td>
                        <td className="py-3 text-gray-400 text-xs">{fmt.format(new Date(o.validFrom))}</td>
                        <td className="py-3 text-xs">
                          <span className={isExpired ? "text-red-400" : isExpiringSoon ? "text-amber-400" : "text-gray-400"}>
                            {fmt.format(new Date(o.validTo))}
                          </span>
                          {isExpired && <span className="text-[10px] text-red-400 mr-1">(פג)</span>}
                          {isExpiringSoon && <span className="text-[10px] text-amber-400 mr-1">(בקרוב)</span>}
                        </td>
                        <td className="py-3 text-gray-400 text-xs max-w-[180px] truncate" title={o.reason}>
                          {o.reason}
                        </td>
                        <td className="py-3 text-gray-500 text-xs">{o.grantedBy}</td>
                        <td className="py-3 text-center">
                          <button
                            onClick={() => handleRemoveOverride(o.id)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition"
                            title="הסר דריסה"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Override Form */}
      {showAddForm && (
        <Card className="bg-[#111827] border-blue-800/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-blue-400">
              <Plus className="w-4 h-4" />
              הוספת דריסת הרשאה חדשה
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">הרשאה</label>
                <select
                  className="w-full bg-[#0d1321] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                  value={newPermCode}
                  onChange={(e) => setNewPermCode(e.target.value)}
                >
                  <option value="">בחר הרשאה...</option>
                  {PERMISSION_CATALOG.map((p) => (
                    <option key={p.code} value={p.code}>
                      [{p.module}] {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">הרשה / חסם</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setNewAllow(true)}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition ${
                      newAllow
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                        : "bg-[#0d1321] border-gray-700 text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    ALLOW
                  </button>
                  <button
                    onClick={() => setNewAllow(false)}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition ${
                      !newAllow
                        ? "bg-red-500/15 border-red-500/40 text-red-400"
                        : "bg-[#0d1321] border-gray-700 text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    DENY
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">מצב דריסה</label>
                <select
                  className="w-full bg-[#0d1321] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                  value={newMode}
                  onChange={(e) => setNewMode(e.target.value as any)}
                >
                  <option value="OVERRIDE">OVERRIDE — דריסה מלאה</option>
                  <option value="EXTEND">EXTEND — הרחבה</option>
                  <option value="RESTRICT">RESTRICT — הגבלה</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">תוקף מ-</label>
                <input
                  type="date"
                  className="w-full bg-[#0d1321] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                  value={newValidFrom}
                  onChange={(e) => setNewValidFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">תוקף עד</label>
                <input
                  type="date"
                  className="w-full bg-[#0d1321] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                  value={newValidTo}
                  onChange={(e) => setNewValidTo(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">סיבה (חובה)</label>
                <input
                  className="w-full bg-[#0d1321] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  placeholder="נא לציין סיבה מפורטת..."
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleAddOverride}
                disabled={!newPermCode || !newReason}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-medium transition"
              >
                שמור דריסה
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-6 py-2.5 bg-[#0d1321] border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white transition"
              >
                ביטול
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
