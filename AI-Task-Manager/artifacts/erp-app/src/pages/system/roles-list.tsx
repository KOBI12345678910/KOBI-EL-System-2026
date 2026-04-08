import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldPlus, ShieldCheck, Shield, Search, Filter, Users, Lock,
  LayoutGrid, Table as TableIcon, Edit, Copy, Eye, Trash2, Crown,
  Settings, ChevronDown, X, CheckCircle, AlertTriangle, KeyRound,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
interface Role {
  id: string;
  code: string;
  name: string;
  description: string;
  roleLevel: number;
  isSystemRole: boolean;
  status: "active" | "inactive";
  usersCount: number;
  permissionsCount: number;
}

// ── Mock Data ──────────────────────────────────────────────────────────────
const ROLES: Role[] = [
  {
    id: "role-001",
    code: "CEO",
    name: "מנכ\"ל",
    description: "גישה מלאה לכל המערכת כולל דוחות הנהלה, אישורים ותצוגות מנהלים. רמת הרשאה עליונה.",
    roleLevel: 5,
    isSystemRole: true,
    status: "active",
    usersCount: 1,
    permissionsCount: 148,
  },
  {
    id: "role-002",
    code: "SYSTEM_ADMIN",
    name: "מנהל מערכת",
    description: "ניהול מלא של המערכת: הגדרות, משתמשים, תפקידים, לוגים, גיבויים ואינטגרציות חיצוניות.",
    roleLevel: 5,
    isSystemRole: true,
    status: "active",
    usersCount: 2,
    permissionsCount: 152,
  },
  {
    id: "role-003",
    code: "FINANCE_MANAGER",
    name: "מנהל כספים",
    description: "ניהול מלא של מודול הכספים: חשבוניות, תשלומים, תקציבים, דוחות כספיים ואישורי תשלום.",
    roleLevel: 4,
    isSystemRole: true,
    status: "active",
    usersCount: 3,
    permissionsCount: 87,
  },
  {
    id: "role-004",
    code: "PROCUREMENT_MANAGER",
    name: "מנהל רכש",
    description: "ניהול תהליכי רכש: הזמנות, ספקים, השוואת מחירים, חוזים ואישור הזמנות רכש.",
    roleLevel: 4,
    isSystemRole: true,
    status: "active",
    usersCount: 2,
    permissionsCount: 73,
  },
  {
    id: "role-005",
    code: "WAREHOUSE_MANAGER",
    name: "מנהל מחסן",
    description: "ניהול מחסנים: מלאי, קבלות, שיגורים, ספירות מלאי, מיקומי אחסון ודוחות מלאי.",
    roleLevel: 3,
    isSystemRole: true,
    status: "active",
    usersCount: 2,
    permissionsCount: 64,
  },
  {
    id: "role-006",
    code: "PROJECT_MANAGER",
    name: "מנהל פרויקט",
    description: "ניהול פרויקטים: משימות, לוחות זמנים, תקציבי פרויקט, צוותים ודוחות התקדמות.",
    roleLevel: 3,
    isSystemRole: false,
    status: "active",
    usersCount: 4,
    permissionsCount: 56,
  },
  {
    id: "role-007",
    code: "SALES_MANAGER",
    name: "מנהל מכירות",
    description: "ניהול מכירות: לקוחות, הזמנות, הצעות מחיר, עמלות, דוחות מכירות וניתוח ביצועים.",
    roleLevel: 4,
    isSystemRole: true,
    status: "active",
    usersCount: 3,
    permissionsCount: 79,
  },
  {
    id: "role-008",
    code: "ACCOUNTANT",
    name: "חשב/ת",
    description: "עבודה שוטפת בהנהלת חשבונות: רישום פקודות יומן, התאמות בנק, חשבוניות ודוחות חודשיים.",
    roleLevel: 3,
    isSystemRole: false,
    status: "active",
    usersCount: 5,
    permissionsCount: 52,
  },
  {
    id: "role-009",
    code: "PURCHASER",
    name: "רכש",
    description: "ביצוע רכש שוטף: יצירת הזמנות רכש, קבלת סחורה, מעקב אחר הזמנות וטיפול בספקים.",
    roleLevel: 2,
    isSystemRole: false,
    status: "active",
    usersCount: 6,
    permissionsCount: 38,
  },
  {
    id: "role-010",
    code: "WAREHOUSE_OPERATOR",
    name: "מחסנאי",
    description: "עבודה שוטפת במחסן: קבלת סחורה, ליקוט, שיגור, ספירת מלאי ודיווח על חריגות.",
    roleLevel: 2,
    isSystemRole: false,
    status: "active",
    usersCount: 8,
    permissionsCount: 31,
  },
  {
    id: "role-011",
    code: "VIEW_ONLY_AUDITOR",
    name: "צפייה בלבד",
    description: "גישת צפייה בלבד לכל מודולי המערכת לצרכי ביקורת, רגולציה ובקרה פנימית.",
    roleLevel: 1,
    isSystemRole: true,
    status: "active",
    usersCount: 3,
    permissionsCount: 95,
  },
];

// ── Level Styling ──────────────────────────────────────────────────────────
const LEVEL_CONFIG: Record<number, { label: string; color: string; bg: string; border: string; ring: string }> = {
  1: { label: "בסיסי", color: "text-slate-300", bg: "bg-slate-500/15", border: "border-slate-500/30", ring: "ring-slate-500/20" },
  2: { label: "מבצע", color: "text-blue-300", bg: "bg-blue-500/15", border: "border-blue-500/30", ring: "ring-blue-500/20" },
  3: { label: "מנהל ביניים", color: "text-amber-300", bg: "bg-amber-500/15", border: "border-amber-500/30", ring: "ring-amber-500/20" },
  4: { label: "מנהל בכיר", color: "text-purple-300", bg: "bg-purple-500/15", border: "border-purple-500/30", ring: "ring-purple-500/20" },
  5: { label: "הנהלה עליונה", color: "text-red-300", bg: "bg-red-500/15", border: "border-red-500/30", ring: "ring-red-500/20" },
};

const LEVEL_DOT_COLORS: Record<number, string> = {
  1: "bg-slate-400",
  2: "bg-blue-400",
  3: "bg-amber-400",
  4: "bg-purple-400",
  5: "bg-red-400",
};

// ── Component ──────────────────────────────────────────────────────────────
export default function RolesListPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [levelFilter, setLevelFilter] = useState<number | null>(null);
  const [systemRoleFilter, setSystemRoleFilter] = useState<boolean | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [showLevelDropdown, setShowLevelDropdown] = useState(false);

  // ── Filtered data ──────────────────────────────────────────────────────
  const filteredRoles = useMemo(() => {
    return ROLES.filter((role) => {
      const matchesSearch =
        !searchTerm ||
        role.name.includes(searchTerm) ||
        role.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        role.description.includes(searchTerm);
      const matchesLevel = levelFilter === null || role.roleLevel === levelFilter;
      const matchesSystem = systemRoleFilter === null || role.isSystemRole === systemRoleFilter;
      return matchesSearch && matchesLevel && matchesSystem;
    });
  }, [searchTerm, levelFilter, systemRoleFilter]);

  // ── Stats ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = ROLES.length;
    const systemCount = ROLES.filter((r) => r.isSystemRole).length;
    const activeCount = ROLES.filter((r) => r.status === "active").length;
    const avgLevel = (ROLES.reduce((sum, r) => sum + r.roleLevel, 0) / total).toFixed(1);
    return { total, systemCount, activeCount, avgLevel };
  }, []);

  const clearFilters = () => {
    setSearchTerm("");
    setLevelFilter(null);
    setSystemRoleFilter(null);
  };

  const hasActiveFilters = searchTerm || levelFilter !== null || systemRoleFilter !== null;

  // ── Render helpers ──────────────────────────────────────────────────────
  const renderLevelBadge = (level: number, size: "sm" | "md" = "md") => {
    const config = LEVEL_CONFIG[level];
    if (!config) return null;
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ${config.bg} ${config.color} ${config.border} border`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${LEVEL_DOT_COLORS[level]}`} />
        {size === "md" && `רמה ${level}`}
        {size === "sm" && level}
      </span>
    );
  };

  const renderRoleIcon = (role: Role) => {
    if (role.code === "CEO") return <Crown className="w-5 h-5 text-amber-400" />;
    if (role.code === "SYSTEM_ADMIN") return <Settings className="w-5 h-5 text-blue-400" />;
    if (role.isSystemRole) return <ShieldCheck className="w-5 h-5 text-purple-400" />;
    return <Shield className="w-5 h-5 text-slate-400" />;
  };

  // ── Stats Cards Row ────────────────────────────────────────────────────
  const statsData = [
    { label: 'סה"כ תפקידים', value: stats.total, icon: Shield, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "תפקידי מערכת", value: stats.systemCount, icon: Lock, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "תפקידים פעילים", value: stats.activeCount, icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "רמת גישה ממוצעת", value: stats.avgLevel, icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10" },
  ];

  // ────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white p-6 space-y-6" dir="rtl">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">ניהול תפקידים</h1>
            <p className="text-sm text-gray-400">הגדרת תפקידים, הרשאות ורמות גישה למערכת</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 transition-all text-white text-sm font-medium shadow-lg shadow-blue-500/20">
          <ShieldPlus className="w-4 h-4" />
          תפקיד חדש
        </button>
      </div>

      {/* ── Stats Row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsData.map((stat) => (
          <Card key={stat.label} className="bg-[#0d1326]/80 border-[#1e2a4a] hover:border-[#2e3a5a] transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400 mb-1">{stat.label}</p>
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────────────── */}
      <Card className="bg-[#0d1326]/80 border-[#1e2a4a]">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="חיפוש תפקיד לפי שם, קוד או תיאור..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#0a0e1a] border border-[#1e2a4a] rounded-lg pr-10 pl-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
              />
            </div>

            {/* Level filter dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowLevelDropdown(!showLevelDropdown)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-all ${
                  levelFilter !== null
                    ? "bg-blue-500/10 border-blue-500/30 text-blue-300"
                    : "bg-[#0a0e1a] border-[#1e2a4a] text-gray-400 hover:border-[#2e3a5a]"
                }`}
              >
                <Filter className="w-4 h-4" />
                {levelFilter !== null ? `רמה ${levelFilter}` : "רמת גישה"}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {showLevelDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowLevelDropdown(false)} />
                  <div className="absolute top-full mt-1 right-0 z-20 bg-[#131a2e] border border-[#1e2a4a] rounded-xl shadow-2xl shadow-black/40 py-1 min-w-[180px]">
                    <button
                      onClick={() => { setLevelFilter(null); setShowLevelDropdown(false); }}
                      className={`w-full text-right px-3 py-2 text-sm hover:bg-[#1e2a4a]/60 transition-colors ${
                        levelFilter === null ? "text-blue-400" : "text-gray-300"
                      }`}
                    >
                      הכל
                    </button>
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        onClick={() => { setLevelFilter(level); setShowLevelDropdown(false); }}
                        className={`w-full text-right px-3 py-2 text-sm hover:bg-[#1e2a4a]/60 transition-colors flex items-center gap-2 ${
                          levelFilter === level ? "text-blue-400" : "text-gray-300"
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${LEVEL_DOT_COLORS[level]}`} />
                        רמה {level} - {LEVEL_CONFIG[level].label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* System role toggle */}
            <div className="flex items-center gap-1 bg-[#0a0e1a] border border-[#1e2a4a] rounded-lg p-0.5">
              <button
                onClick={() => setSystemRoleFilter(null)}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  systemRoleFilter === null
                    ? "bg-[#1e2a4a] text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                הכל
              </button>
              <button
                onClick={() => setSystemRoleFilter(true)}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
                  systemRoleFilter === true
                    ? "bg-purple-500/20 text-purple-300"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <Lock className="w-3 h-3" />
                מערכת
              </button>
              <button
                onClick={() => setSystemRoleFilter(false)}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
                  systemRoleFilter === false
                    ? "bg-blue-500/20 text-blue-300"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <Shield className="w-3 h-3" />
                מותאם
              </button>
            </div>

            {/* View toggle */}
            <div className="flex items-center gap-1 bg-[#0a0e1a] border border-[#1e2a4a] rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded-md transition-all ${
                  viewMode === "grid" ? "bg-[#1e2a4a] text-white" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`p-2 rounded-md transition-all ${
                  viewMode === "table" ? "bg-[#1e2a4a] text-white" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <TableIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Clear filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-2.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-all"
              >
                <X className="w-3.5 h-3.5" />
                נקה סינון
              </button>
            )}
          </div>

          {/* Active filters summary */}
          {hasActiveFilters && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#1e2a4a]">
              <span className="text-xs text-gray-500">מציג {filteredRoles.length} מתוך {ROLES.length} תפקידים</span>
              {levelFilter !== null && (
                <Badge className={`${LEVEL_CONFIG[levelFilter].bg} ${LEVEL_CONFIG[levelFilter].color} border-0 text-xs`}>
                  רמה {levelFilter}
                </Badge>
              )}
              {systemRoleFilter !== null && (
                <Badge className={`${systemRoleFilter ? "bg-purple-500/15 text-purple-300" : "bg-blue-500/15 text-blue-300"} border-0 text-xs`}>
                  {systemRoleFilter ? "תפקידי מערכת" : "תפקידים מותאמים"}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Grid View ──────────────────────────────────────────────────── */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredRoles.map((role) => {
            const lvlConfig = LEVEL_CONFIG[role.roleLevel];
            return (
              <Card
                key={role.id}
                className={`bg-[#0d1326]/80 border-[#1e2a4a] hover:border-[#2e3a5a] transition-all group relative overflow-hidden`}
              >
                {/* Level accent stripe */}
                <div className={`absolute top-0 right-0 w-1 h-full ${LEVEL_DOT_COLORS[role.roleLevel]} opacity-60`} />

                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl ${lvlConfig.bg} ${lvlConfig.border} border flex items-center justify-center`}>
                        {renderRoleIcon(role)}
                      </div>
                      <div>
                        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                          {role.name}
                          {role.isSystemRole && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded px-1.5 py-0.5">
                              <Lock className="w-2.5 h-2.5" />
                              מערכת
                            </span>
                          )}
                        </CardTitle>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">{role.code}</p>
                      </div>
                    </div>
                    {renderLevelBadge(role.roleLevel)}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Description */}
                  <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">
                    {role.description}
                  </p>

                  {/* Metrics row */}
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center">
                        <Users className="w-3.5 h-3.5 text-blue-400" />
                      </div>
                      <span className="text-gray-300 font-medium">{role.usersCount}</span>
                      <span className="text-gray-500">משתמשים</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="w-6 h-6 rounded-md bg-amber-500/10 flex items-center justify-center">
                        <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                      </div>
                      <span className="text-gray-300 font-medium">{role.permissionsCount}</span>
                      <span className="text-gray-500">הרשאות</span>
                    </div>
                  </div>

                  {/* Level progress bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-gray-500">רמת גישה</span>
                      <span className={`${lvlConfig.color} font-medium`}>{lvlConfig.label}</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#1e2a4a] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${LEVEL_DOT_COLORS[role.roleLevel]}`}
                        style={{ width: `${(role.roleLevel / 5) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 pt-2 border-t border-[#1e2a4a]/60">
                    <button
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                      title="עריכה"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      עריכה
                    </button>
                    <button
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-gray-400 hover:text-purple-400 hover:bg-purple-500/10 transition-all"
                      title="שכפול"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      שכפול
                    </button>
                    <button
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
                      title="צפייה בהרשאות"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      הרשאות
                    </button>
                    {!role.isSystemRole && (
                      <button
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all mr-auto"
                        title="מחיקה"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        מחיקה
                      </button>
                    )}
                    {role.isSystemRole && (
                      <span className="mr-auto text-[10px] text-gray-600 flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        מוגן מפני מחיקה
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Empty state */}
          {filteredRoles.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-[#1e2a4a]/50 flex items-center justify-center">
                <Search className="w-8 h-8 text-gray-600" />
              </div>
              <div className="text-center">
                <p className="text-gray-400 font-medium">לא נמצאו תפקידים</p>
                <p className="text-sm text-gray-600 mt-1">נסה לשנות את מסנני החיפוש</p>
              </div>
              <button
                onClick={clearFilters}
                className="px-4 py-2 rounded-lg bg-[#1e2a4a] text-sm text-gray-300 hover:bg-[#2e3a5a] transition-colors"
              >
                נקה סינון
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Table View ─────────────────────────────────────────────────── */}
      {viewMode === "table" && (
        <Card className="bg-[#0d1326]/80 border-[#1e2a4a] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e2a4a] bg-[#0a0e1a]/50">
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">תפקיד</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">קוד</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">רמה</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">סוג</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">משתמשים</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">הרשאות</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">סטטוס</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filteredRoles.map((role, idx) => {
                  const lvlConfig = LEVEL_CONFIG[role.roleLevel];
                  return (
                    <tr
                      key={role.id}
                      className={`border-b border-[#1e2a4a]/50 hover:bg-[#1e2a4a]/20 transition-colors ${
                        idx % 2 === 0 ? "bg-transparent" : "bg-[#0a0e1a]/30"
                      }`}
                    >
                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg ${lvlConfig.bg} flex items-center justify-center flex-shrink-0`}>
                            {renderRoleIcon(role)}
                          </div>
                          <div>
                            <span className="text-white font-medium text-sm">{role.name}</span>
                            <p className="text-[11px] text-gray-500 line-clamp-1 max-w-[200px]">{role.description}</p>
                          </div>
                        </div>
                      </td>

                      {/* Code */}
                      <td className="px-4 py-3">
                        <code className="text-xs text-gray-400 bg-[#0a0e1a] px-2 py-1 rounded font-mono">{role.code}</code>
                      </td>

                      {/* Level */}
                      <td className="px-4 py-3 text-center">
                        {renderLevelBadge(role.roleLevel, "sm")}
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3 text-center">
                        {role.isSystemRole ? (
                          <span className="inline-flex items-center gap-1 text-xs text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded px-2 py-0.5">
                            <Lock className="w-3 h-3" />
                            מערכת
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded px-2 py-0.5">
                            <Shield className="w-3 h-3" />
                            מותאם
                          </span>
                        )}
                      </td>

                      {/* Users count */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1 text-xs">
                          <Users className="w-3.5 h-3.5 text-gray-500" />
                          <span className="text-gray-300 font-medium">{role.usersCount}</span>
                        </div>
                      </td>

                      {/* Permissions count */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1 text-xs">
                          <KeyRound className="w-3.5 h-3.5 text-gray-500" />
                          <span className="text-gray-300 font-medium">{role.permissionsCount}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          פעיל
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            className="p-1.5 rounded-md text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                            title="עריכה"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="p-1.5 rounded-md text-gray-500 hover:text-purple-400 hover:bg-purple-500/10 transition-all"
                            title="שכפול"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="p-1.5 rounded-md text-gray-500 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
                            title="צפייה בהרשאות"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {!role.isSystemRole && (
                            <button
                              className="p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                              title="מחיקה"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Empty table state */}
            {filteredRoles.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Search className="w-8 h-8 text-gray-600" />
                <p className="text-gray-400 text-sm">לא נמצאו תפקידים</p>
                <button onClick={clearFilters} className="text-xs text-blue-400 hover:underline">
                  נקה סינון
                </button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Level Legend ────────────────────────────────────────────────── */}
      <Card className="bg-[#0d1326]/80 border-[#1e2a4a]">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Shield className="w-4 h-4 text-gray-500" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">מפתח רמות גישה</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {[1, 2, 3, 4, 5].map((level) => {
              const config = LEVEL_CONFIG[level];
              const rolesAtLevel = ROLES.filter((r) => r.roleLevel === level);
              return (
                <div
                  key={level}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${config.border} ${config.bg} transition-all`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${LEVEL_DOT_COLORS[level]}`} />
                  <span className={`text-xs font-medium ${config.color}`}>
                    רמה {level} - {config.label}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    ({rolesAtLevel.length} תפקידים)
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Footer Info ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-xs text-gray-600 px-1">
        <span>
          סה"כ {ROLES.length} תפקידים מוגדרים | {ROLES.reduce((sum, r) => sum + r.usersCount, 0)} משתמשים משויכים
        </span>
        <span>
          עדכון אחרון: {new Date().toLocaleDateString("he-IL")}
        </span>
      </div>
    </div>
  );
}
