import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Database, Building2, Warehouse, FolderKanban, Users, ShoppingCart,
  Plus, Trash2, Shield, Eye, EyeOff, Filter, Search, Info,
  CheckCircle, XCircle, MapPin, GitBranch, ChevronLeft, Lock, Globe
} from "lucide-react";

// ─── Types & Data ──────────────────────────────────────────────────────────────

type ScopeType = "branch" | "warehouse" | "project" | "department" | "customer_group";

interface ScopeAssignment {
  id: string;
  targetType: "user" | "role";
  targetName: string;
  scopeValue: string;
  accessMode: "ALLOW" | "DENY";
  isActive: boolean;
  assignedBy: string;
  assignedAt: string;
}

interface ScopeConfig {
  type: ScopeType;
  label: string;
  icon: any;
  color: string;
  bg: string;
  values: string[];
  assignments: ScopeAssignment[];
  rules: string[];
}

const SCOPE_DATA: ScopeConfig[] = [
  {
    type: "branch",
    label: "סניף",
    icon: Building2,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    values: ["סניף מרכז — תל אביב", "סניף צפון — חיפה", "סניף דרום — באר שבע", "סניף ירושלים", "סניף שפלה — רחובות"],
    assignments: [
      { id: "BS001", targetType: "user", targetName: "אבי כהן", scopeValue: "סניף מרכז — תל אביב", accessMode: "ALLOW", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2025-01-01" },
      { id: "BS002", targetType: "user", targetName: "אבי כהן", scopeValue: "סניף ירושלים", accessMode: "ALLOW", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2025-01-01" },
      { id: "BS003", targetType: "role", targetName: "SALES_REP", scopeValue: "סניף מרכז — תל אביב", accessMode: "ALLOW", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2025-02-15" },
      { id: "BS004", targetType: "role", targetName: "SALES_REP", scopeValue: "סניף צפון — חיפה", accessMode: "DENY", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2025-02-15" },
      { id: "BS005", targetType: "user", targetName: "שרה לוי", scopeValue: "סניף מרכז — תל אביב", accessMode: "ALLOW", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2025-01-01" },
      { id: "BS006", targetType: "user", targetName: "שרה לוי", scopeValue: "סניף דרום — באר שבע", accessMode: "ALLOW", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2025-03-01" },
      { id: "BS007", targetType: "user", targetName: "דוד מזרחי", scopeValue: "סניף מרכז — תל אביב", accessMode: "ALLOW", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2024-09-01" },
      { id: "BS008", targetType: "user", targetName: "דוד מזרחי", scopeValue: "סניף צפון — חיפה", accessMode: "ALLOW", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2024-09-01" },
      { id: "BS009", targetType: "role", targetName: "CEO", scopeValue: "כל הסניפים", accessMode: "ALLOW", isActive: true, assignedBy: "מנהל מערכת", assignedAt: "2022-01-01" },
      { id: "BS010", targetType: "role", targetName: "CFO", scopeValue: "כל הסניפים", accessMode: "ALLOW", isActive: true, assignedBy: "מנהל מערכת", assignedAt: "2023-06-01" },
    ],
    rules: [
      "משתמש רואה רק נתונים של הסניף שלו (הזמנות, לקוחות, הכנסות)",
      "מנכ\"ל וסמנכ\"ל כספים — גישה לכל הסניפים",
      "נציגי מכירות מוגבלים לסניף המשויך בלבד",
      "ניתן להקצות מספר סניפים למשתמש אחד",
    ],
  },
  {
    type: "warehouse",
    label: "מחסן",
    icon: Warehouse,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    values: ["מחסן ראשי — ראשל\"צ", "מחסן חומרי גלם — חולון", "מחסן מוצרים מוגמרים — לוד", "מחסן שפלה", "מחסן צפון — חיפה"],
    assignments: [
      { id: "WS001", targetType: "user", targetName: "משה ברק", scopeValue: "מחסן ראשי — ראשל\"צ", accessMode: "ALLOW", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2025-01-01" },
      { id: "WS002", targetType: "user", targetName: "משה ברק", scopeValue: "מחסן חומרי גלם — חולון", accessMode: "ALLOW", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2025-01-01" },
      { id: "WS003", targetType: "role", targetName: "WAREHOUSE_MANAGER", scopeValue: "מחסן ראשי — ראשל\"צ", accessMode: "ALLOW", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2025-01-15" },
      { id: "WS004", targetType: "user", targetName: "עומר חדד", scopeValue: "מחסן שפלה", accessMode: "ALLOW", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2025-02-01" },
      { id: "WS005", targetType: "user", targetName: "עומר חדד", scopeValue: "מחסן מוצרים מוגמרים — לוד", accessMode: "ALLOW", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2025-02-01" },
      { id: "WS006", targetType: "role", targetName: "PROCUREMENT_MANAGER", scopeValue: "מחסן חומרי גלם — חולון", accessMode: "ALLOW", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2025-03-01" },
      { id: "WS007", targetType: "user", targetName: "שרה לוי", scopeValue: "מחסן ראשי — ראשל\"צ", accessMode: "ALLOW", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2025-01-01" },
      { id: "WS008", targetType: "role", targetName: "PRODUCTION_MANAGER", scopeValue: "כל המחסנים", accessMode: "ALLOW", isActive: true, assignedBy: "מנהל מערכת", assignedAt: "2024-06-01" },
    ],
    rules: [
      "מנהל מחסן רואה רק מלאי, תנועות וספירות של המחסן שלו",
      "מנהל ייצור — גישה לכל המחסנים לצורך הפקת חומרים",
      "מנהלת רכש רואה מחסן ראשי + חומרי גלם",
      "העברה בין מחסנים דורשת הרשאה בשניהם",
    ],
  },
  {
    type: "project",
    label: "פרויקט",
    icon: FolderKanban,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    values: ["PRJ-001 — בניין משרדים הרצליה", "PRJ-002 — מגדל מגורים ת\"א", "PRJ-003 — מרכז מסחרי חיפה", "PRJ-004 — שיפוץ בית ספר ירושלים", "PRJ-005 — תשתיות כביש 6"],
    assignments: [
      { id: "PS001", targetType: "user", targetName: "תמר רוזן", scopeValue: "PRJ-001 — בניין משרדים הרצליה", accessMode: "ALLOW", isActive: true, assignedBy: "אבי כהן", assignedAt: "2025-02-01" },
      { id: "PS002", targetType: "user", targetName: "תמר רוזן", scopeValue: "PRJ-003 — מרכז מסחרי חיפה", accessMode: "ALLOW", isActive: true, assignedBy: "אבי כהן", assignedAt: "2025-04-01" },
      { id: "PS003", targetType: "user", targetName: "דוד מזרחי", scopeValue: "PRJ-002 — מגדל מגורים ת\"א", accessMode: "ALLOW", isActive: true, assignedBy: "אבי כהן", assignedAt: "2025-01-15" },
      { id: "PS004", targetType: "role", targetName: "PROJECT_MANAGER", scopeValue: "רק פרויקטים משויכים", accessMode: "ALLOW", isActive: true, assignedBy: "מנהל מערכת", assignedAt: "2025-01-01" },
      { id: "PS005", targetType: "user", targetName: "אבי כהן", scopeValue: "כל הפרויקטים", accessMode: "ALLOW", isActive: true, assignedBy: "מנהל מערכת", assignedAt: "2024-01-01" },
      { id: "PS006", targetType: "user", targetName: "משה ברק", scopeValue: "PRJ-001 — בניין משרדים הרצליה", accessMode: "ALLOW", isActive: true, assignedBy: "תמר רוזן", assignedAt: "2025-03-01" },
      { id: "PS007", targetType: "user", targetName: "נועה פרידמן", scopeValue: "PRJ-002 — מגדל מגורים ת\"א", accessMode: "DENY", isActive: true, assignedBy: "דוד מזרחי", assignedAt: "2025-05-01" },
    ],
    rules: [
      "מנהל פרויקט רואה רק את הפרויקטים המשויכים אליו",
      "מנהל כספים רואה נתונים כספיים של כל הפרויקטים",
      "ניתן לחסום גישת משתמש לפרויקט ספציפי (DENY)",
      "עלויות, תקציב, קבלני משנה — מוגבלים לפי scope",
    ],
  },
  {
    type: "department",
    label: "מחלקה",
    icon: Users,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    values: ["כספים", "רכש", "מכירות", "משאבי אנוש", "ייצור", "IT", "הנהלה", "פרויקטים", "שיווק", "מחסן"],
    assignments: [
      { id: "DS001", targetType: "user", targetName: "רחל אברהם", scopeValue: "משאבי אנוש", accessMode: "ALLOW", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2024-02-01" },
      { id: "DS002", targetType: "user", targetName: "רחל אברהם", scopeValue: "כל המחלקות", accessMode: "ALLOW", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2024-02-01" },
      { id: "DS003", targetType: "role", targetName: "HR_MANAGER", scopeValue: "כל המחלקות", accessMode: "ALLOW", isActive: true, assignedBy: "מנהל מערכת", assignedAt: "2024-01-01" },
      { id: "DS004", targetType: "role", targetName: "HR_CLERK", scopeValue: "משאבי אנוש", accessMode: "ALLOW", isActive: true, assignedBy: "רחל אברהם", assignedAt: "2025-05-01" },
      { id: "DS005", targetType: "user", targetName: "דוד מזרחי", scopeValue: "מכירות", accessMode: "ALLOW", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2023-07-01" },
      { id: "DS006", targetType: "user", targetName: "אבי כהן", scopeValue: "כספים", accessMode: "ALLOW", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2024-01-01" },
      { id: "DS007", targetType: "user", targetName: "שרה לוי", scopeValue: "רכש", accessMode: "ALLOW", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2024-03-15" },
      { id: "DS008", targetType: "role", targetName: "FINANCE_CLERK", scopeValue: "כספים", accessMode: "ALLOW", isActive: true, assignedBy: "אבי כהן", assignedAt: "2024-08-01" },
    ],
    rules: [
      "מנהל מחלקה רואה נתונים של העובדים במחלקתו בלבד",
      "HR Manager — גישה לנתונים של כל המחלקות",
      "פקיד HR — רק מחלקת משאבי אנוש",
      "חופשות, נוכחות, שכר — מוגבלים לפי scope מחלקה",
    ],
  },
  {
    type: "customer_group",
    label: "קבוצת לקוחות",
    icon: ShoppingCart,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    values: ["לקוחות VIP", "לקוחות ממשלתיים", "לקוחות עסקיים", "לקוחות פרטיים", "לקוחות בינלאומיים", "קבלני משנה"],
    assignments: [
      { id: "CS001", targetType: "user", targetName: "דוד מזרחי", scopeValue: "לקוחות VIP", accessMode: "ALLOW", isActive: true, assignedBy: "אלון ביטון", assignedAt: "2025-01-01" },
      { id: "CS002", targetType: "user", targetName: "דוד מזרחי", scopeValue: "לקוחות עסקיים", accessMode: "ALLOW", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2024-07-01" },
      { id: "CS003", targetType: "user", targetName: "נועה פרידמן", scopeValue: "לקוחות עסקיים", accessMode: "ALLOW", isActive: true, assignedBy: "דוד מזרחי", assignedAt: "2025-01-15" },
      { id: "CS004", targetType: "user", targetName: "נועה פרידמן", scopeValue: "לקוחות פרטיים", accessMode: "ALLOW", isActive: true, assignedBy: "דוד מזרחי", assignedAt: "2025-01-15" },
      { id: "CS005", targetType: "role", targetName: "SALES_MANAGER", scopeValue: "כל הקבוצות", accessMode: "ALLOW", isActive: true, assignedBy: "מנהל מערכת", assignedAt: "2023-07-01" },
      { id: "CS006", targetType: "role", targetName: "SALES_REP", scopeValue: "לקוחות פרטיים", accessMode: "ALLOW", isActive: true, assignedBy: "דוד מזרחי", assignedAt: "2025-02-01" },
      { id: "CS007", targetType: "user", targetName: "נועה פרידמן", scopeValue: "לקוחות VIP", accessMode: "DENY", isActive: true, assignedBy: "דוד מזרחי", assignedAt: "2025-03-01" },
      { id: "CS008", targetType: "user", targetName: "שרה לוי", scopeValue: "קבלני משנה", accessMode: "ALLOW", isActive: true, assignedBy: "ליאור שמש", assignedAt: "2025-01-01" },
    ],
    rules: [
      "נציג מכירות רואה רק את קבוצת הלקוחות שלו",
      "מנהל מכירות — גישה לכל קבוצות הלקוחות",
      "לקוחות VIP — גישה למנהלים בלבד",
      "הצעות מחיר, הזמנות, חשבוניות — מוגבלים לפי קבוצת לקוח",
    ],
  },
];

const fmt = Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });

// ─── Component ─────────────────────────────────────────────────────────────────

export default function DataScopeManagement() {
  const [activeTab, setActiveTab] = useState<ScopeType>("branch");
  const [scopes, setScopes] = useState<ScopeConfig[]>(SCOPE_DATA);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Add form state
  const [newTargetType, setNewTargetType] = useState<"user" | "role">("user");
  const [newTargetName, setNewTargetName] = useState("");
  const [newScopeValue, setNewScopeValue] = useState("");
  const [newAccessMode, setNewAccessMode] = useState<"ALLOW" | "DENY">("ALLOW");

  const currentScope = scopes.find((s) => s.type === activeTab)!;

  const filteredAssignments = useMemo(() => {
    if (!searchQuery) return currentScope.assignments;
    return currentScope.assignments.filter(
      (a) => a.targetName.includes(searchQuery) || a.scopeValue.includes(searchQuery),
    );
  }, [currentScope, searchQuery]);

  // Stats per scope
  const totalAssignments = currentScope.assignments.length;
  const activeAssignments = currentScope.assignments.filter((a) => a.isActive).length;
  const denyRules = currentScope.assignments.filter((a) => a.accessMode === "DENY").length;
  const userAssignments = currentScope.assignments.filter((a) => a.targetType === "user").length;
  const roleAssignments = currentScope.assignments.filter((a) => a.targetType === "role").length;

  // Visual scope map: unique users/roles and their scopes
  const scopeMap = useMemo(() => {
    const map: Record<string, { type: "user" | "role"; scopes: { value: string; mode: "ALLOW" | "DENY" }[] }> = {};
    currentScope.assignments
      .filter((a) => a.isActive)
      .forEach((a) => {
        if (!map[a.targetName]) map[a.targetName] = { type: a.targetType, scopes: [] };
        map[a.targetName].scopes.push({ value: a.scopeValue, mode: a.accessMode });
      });
    return map;
  }, [currentScope]);

  const handleAddAssignment = () => {
    if (!newTargetName || !newScopeValue) return;
    const newAssign: ScopeAssignment = {
      id: `NEW${Date.now()}`,
      targetType: newTargetType,
      targetName: newTargetName,
      scopeValue: newScopeValue,
      accessMode: newAccessMode,
      isActive: true,
      assignedBy: "מנהל מערכת",
      assignedAt: new Date().toISOString().slice(0, 10),
    };
    setScopes((prev) =>
      prev.map((s) =>
        s.type === activeTab ? { ...s, assignments: [...s.assignments, newAssign] } : s,
      ),
    );
    setShowAddForm(false);
    setNewTargetName("");
    setNewScopeValue("");
  };

  const handleRemove = (assignId: string) => {
    setScopes((prev) =>
      prev.map((s) =>
        s.type === activeTab ? { ...s, assignments: s.assignments.filter((a) => a.id !== assignId) } : s,
      ),
    );
  };

  const handleToggleActive = (assignId: string) => {
    setScopes((prev) =>
      prev.map((s) =>
        s.type === activeTab
          ? { ...s, assignments: s.assignments.map((a) => (a.id === assignId ? { ...a, isActive: !a.isActive } : a)) }
          : s,
      ),
    );
  };

  const tabs: { type: ScopeType; label: string; icon: any }[] = [
    { type: "branch", label: "סניף", icon: Building2 },
    { type: "warehouse", label: "מחסן", icon: Warehouse },
    { type: "project", label: "פרויקט", icon: FolderKanban },
    { type: "department", label: "מחלקה", icon: Users },
    { type: "customer_group", label: "קבוצת לקוחות", icon: ShoppingCart },
  ];

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-7 w-7 text-cyan-400" />
          ניהול טווחי נתונים (Data Scopes)
        </h1>
        <p className="text-sm text-gray-400 mt-1">הגדרת טווח נתונים שכל משתמש/תפקיד רואה — לפי סניף, מחסן, פרויקט, מחלקה או קבוצת לקוחות</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map((t) => {
          const isActive = activeTab === t.type;
          const scopeConf = scopes.find((s) => s.type === t.type)!;
          return (
            <button
              key={t.type}
              onClick={() => { setActiveTab(t.type); setSearchQuery(""); setShowAddForm(false); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition border ${
                isActive
                  ? "bg-[#1a2035] border-blue-500/50 text-white"
                  : "bg-[#111827] border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-600"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              <Badge className="bg-gray-500/15 text-gray-400 border-gray-600 border text-[10px] px-1.5">
                {scopeConf.assignments.length}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "סה\"כ הקצאות", value: totalAssignments, icon: Database, color: currentScope.color, bg: currentScope.bg },
          { label: "פעילות", value: activeAssignments, icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "חסימות (DENY)", value: denyRules, icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
          { label: "למשתמשים", value: userAssignments, icon: Users, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "לתפקידים", value: roleAssignments, icon: Shield, color: "text-purple-400", bg: "bg-purple-500/10" },
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

      <div className="grid grid-cols-12 gap-4">
        {/* Main Table */}
        <div className="col-span-8">
          <Card className="bg-[#111827] border-gray-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <currentScope.icon className={`w-4 h-4 ${currentScope.color}`} />
                  הקצאות {currentScope.label}
                </CardTitle>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute right-3 top-2.5 text-gray-500" />
                    <input
                      className="bg-[#0d1321] border border-gray-700 rounded-lg pr-9 pl-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-56"
                      placeholder="חיפוש..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition"
                  >
                    <Plus className="w-4 h-4" /> הוסף
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {/* Add form */}
              {showAddForm && (
                <div className="mb-4 p-4 bg-[#0d1321] rounded-lg border border-gray-700 space-y-3">
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">סוג יעד</label>
                      <select
                        className="w-full bg-[#111827] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300"
                        value={newTargetType}
                        onChange={(e) => setNewTargetType(e.target.value as any)}
                      >
                        <option value="user">משתמש</option>
                        <option value="role">תפקיד</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">שם</label>
                      <input
                        className="w-full bg-[#111827] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
                        placeholder={newTargetType === "user" ? "שם משתמש" : "קוד תפקיד"}
                        value={newTargetName}
                        onChange={(e) => setNewTargetName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">ערך scope</label>
                      <select
                        className="w-full bg-[#111827] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300"
                        value={newScopeValue}
                        onChange={(e) => setNewScopeValue(e.target.value)}
                      >
                        <option value="">בחר...</option>
                        {currentScope.values.map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">מצב גישה</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setNewAccessMode("ALLOW")}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium border transition ${
                            newAccessMode === "ALLOW" ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400" : "bg-[#111827] border-gray-700 text-gray-500"
                          }`}
                        >
                          ALLOW
                        </button>
                        <button
                          onClick={() => setNewAccessMode("DENY")}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium border transition ${
                            newAccessMode === "DENY" ? "bg-red-500/15 border-red-500/40 text-red-400" : "bg-[#111827] border-gray-700 text-gray-500"
                          }`}
                        >
                          DENY
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleAddAssignment} disabled={!newTargetName || !newScopeValue} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-medium transition">
                      שמור
                    </button>
                    <button onClick={() => setShowAddForm(false)} className="px-4 py-2 bg-[#111827] border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white transition">
                      ביטול
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs border-b border-gray-800">
                      <th className="text-right py-2.5 pr-2">סוג</th>
                      <th className="text-right py-2.5">משתמש / תפקיד</th>
                      <th className="text-right py-2.5">ערך scope</th>
                      <th className="text-center py-2.5">גישה</th>
                      <th className="text-center py-2.5">פעיל</th>
                      <th className="text-right py-2.5">הוקצה ע\"י</th>
                      <th className="text-right py-2.5">תאריך</th>
                      <th className="text-center py-2.5">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssignments.map((a) => (
                      <tr key={a.id} className={`border-b border-gray-800/50 hover:bg-[#1a2035] ${!a.isActive ? "opacity-50" : ""}`}>
                        <td className="py-3 pr-2">
                          <Badge className={`text-[10px] border ${a.targetType === "user" ? "bg-blue-500/15 text-blue-300 border-blue-500/30" : "bg-purple-500/15 text-purple-300 border-purple-500/30"}`}>
                            {a.targetType === "user" ? "משתמש" : "תפקיד"}
                          </Badge>
                        </td>
                        <td className="py-3 text-gray-300 text-xs font-medium">{a.targetName}</td>
                        <td className="py-3 text-gray-300 text-xs">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-gray-600" />
                            {a.scopeValue}
                          </span>
                        </td>
                        <td className="py-3 text-center">
                          {a.accessMode === "ALLOW" ? (
                            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 border text-[10px]">
                              <Eye className="w-3 h-3 ml-1" /> ALLOW
                            </Badge>
                          ) : (
                            <Badge className="bg-red-500/15 text-red-400 border-red-500/30 border text-[10px]">
                              <EyeOff className="w-3 h-3 ml-1" /> DENY
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 text-center">
                          <button onClick={() => handleToggleActive(a.id)}>
                            {a.isActive ? (
                              <CheckCircle className="w-4 h-4 text-emerald-400 hover:text-emerald-300" />
                            ) : (
                              <XCircle className="w-4 h-4 text-gray-600 hover:text-gray-400" />
                            )}
                          </button>
                        </td>
                        <td className="py-3 text-gray-500 text-xs">{a.assignedBy}</td>
                        <td className="py-3 text-gray-500 text-xs">{fmt.format(new Date(a.assignedAt))}</td>
                        <td className="py-3 text-center">
                          <button onClick={() => handleRemove(a.id)} className="p-1 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right side panels */}
        <div className="col-span-4 space-y-4">
          {/* Visual Scope Map */}
          <Card className="bg-[#111827] border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="w-4 h-4 text-cyan-400" />
                מפת גישה — {currentScope.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2 max-h-[300px] overflow-y-auto">
              {Object.entries(scopeMap).map(([name, data]) => (
                <div key={name} className="p-2.5 bg-[#0d1321] rounded-lg border border-gray-800">
                  <div className="flex items-center gap-2 mb-1.5">
                    {data.type === "user" ? (
                      <Users className="w-3.5 h-3.5 text-blue-400" />
                    ) : (
                      <Shield className="w-3.5 h-3.5 text-purple-400" />
                    )}
                    <span className="text-xs font-medium text-white">{name}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {data.scopes.map((sc, i) => (
                      <Badge
                        key={i}
                        className={`text-[10px] px-1.5 py-0 border ${
                          sc.mode === "ALLOW"
                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                            : "bg-red-500/10 text-red-300 border-red-500/30"
                        }`}
                      >
                        {sc.mode === "DENY" && <XCircle className="w-2.5 h-2.5 ml-0.5" />}
                        {sc.value}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Rules Panel */}
          <Card className="bg-[#111827] border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-400" />
                כללי scope — {currentScope.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {currentScope.rules.map((rule, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-gray-400">
                  <ChevronLeft className="w-3 h-3 mt-0.5 text-gray-600 flex-shrink-0" />
                  <span>{rule}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
