import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  Users, Search, UserPlus, Pencil, Lock, Unlock, Eye, XCircle,
  ChevronLeft, ChevronRight, Shield, ShieldCheck, ShieldAlert, ShieldOff,
  Filter, MoreHorizontal, Mail, Phone, Building2, Clock, Activity,
  ChevronsLeft, ChevronsRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ─── Types ──────────────────────────────────────────────────────
type UserStatus = "ACTIVE" | "INACTIVE" | "LOCKED" | "SUSPENDED";

interface SystemUser {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  jobTitle: string;
  status: UserStatus;
  roles: string[];
  lastLoginAt: string;
  loginCount: number;
}

// ─── Status Config ──────────────────────────────────────────────
const STATUS_CONFIG: Record<UserStatus, { label: string; bg: string; text: string; icon: any }> = {
  ACTIVE:    { label: "פעיל",    bg: "bg-green-500/20",  text: "text-green-400",  icon: ShieldCheck },
  INACTIVE:  { label: "לא פעיל", bg: "bg-gray-500/20",   text: "text-gray-400",   icon: ShieldOff },
  LOCKED:    { label: "נעול",    bg: "bg-red-500/20",    text: "text-red-400",    icon: ShieldAlert },
  SUSPENDED: { label: "מושעה",   bg: "bg-amber-500/20",  text: "text-amber-400",  icon: Shield },
};

// ─── Constants ──────────────────────────────────────────────────
const FALLBACK_DEPARTMENTS = [
  "הנהלה", "כספים", "רכש", "מחסן", "ייצור", "מכירות", "הנדסה", "IT", "משאבי אנוש"
];

const FALLBACK_ALL_ROLES = [
  'מנכ"ל', "מנהל מערכת", "מנהל כספים", "מנהל רכש", "מנהל מחסן",
  "מנהל פרויקט", "מנהל מכירות", "חשב/ת", "רכש", "מחסנאי", "צפייה בלבד"
];

const ROLE_COLORS: Record<string, string> = {
  'מנכ"ל':       "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "מנהל מערכת":  "bg-red-500/20 text-red-300 border-red-500/30",
  "מנהל כספים":  "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "מנהל רכש":    "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "מנהל מחסן":   "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "מנהל פרויקט": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "מנהל מכירות": "bg-pink-500/20 text-pink-300 border-pink-500/30",
  "חשב/ת":       "bg-teal-500/20 text-teal-300 border-teal-500/30",
  "רכש":         "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  "מחסנאי":      "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "צפייה בלבד":  "bg-gray-500/20 text-gray-300 border-gray-500/30",
};

// ─── Mock Data ──────────────────────────────────────────────────
const FALLBACK_MOCK_USERS: SystemUser[] = [
  {
    id: 1, employeeCode: "EMP-001", fullName: "דוד כהן", email: "david.cohen@company.co.il",
    phone: "050-1234567", department: "הנהלה", jobTitle: 'מנכ"ל',
    status: "ACTIVE", roles: ['מנכ"ל', "מנהל מערכת"], lastLoginAt: "2026-04-08T08:15:00", loginCount: 1247
  },
  {
    id: 2, employeeCode: "EMP-002", fullName: "שרה לוי", email: "sara.levi@company.co.il",
    phone: "052-9876543", department: "כספים", jobTitle: "מנהלת כספים",
    status: "ACTIVE", roles: ["מנהל כספים", "חשב/ת"], lastLoginAt: "2026-04-08T07:30:00", loginCount: 982
  },
  {
    id: 3, employeeCode: "EMP-003", fullName: "יוסי אברהם", email: "yossi.a@company.co.il",
    phone: "054-5551234", department: "רכש", jobTitle: "מנהל רכש",
    status: "ACTIVE", roles: ["מנהל רכש", "רכש"], lastLoginAt: "2026-04-07T16:45:00", loginCount: 856
  },
  {
    id: 4, employeeCode: "EMP-004", fullName: "מיכל ברק", email: "michal.b@company.co.il",
    phone: "053-7778899", department: "מחסן", jobTitle: "מנהלת מחסן",
    status: "ACTIVE", roles: ["מנהל מחסן", "מחסנאי"], lastLoginAt: "2026-04-08T06:00:00", loginCount: 1105
  },
  {
    id: 5, employeeCode: "EMP-005", fullName: "אלון פרץ", email: "alon.p@company.co.il",
    phone: "050-3334455", department: "ייצור", jobTitle: "מנהל ייצור",
    status: "LOCKED", roles: ["מנהל פרויקט"], lastLoginAt: "2026-04-01T14:20:00", loginCount: 643
  },
  {
    id: 6, employeeCode: "EMP-006", fullName: "רונית שמש", email: "ronit.s@company.co.il",
    phone: "052-1112233", department: "מכירות", jobTitle: "מנהלת מכירות",
    status: "ACTIVE", roles: ["מנהל מכירות"], lastLoginAt: "2026-04-08T09:10:00", loginCount: 1340
  },
  {
    id: 7, employeeCode: "EMP-007", fullName: "עמית גולן", email: "amit.g@company.co.il",
    phone: "054-6667788", department: "הנדסה", jobTitle: "מהנדס ראשי",
    status: "ACTIVE", roles: ["מנהל פרויקט", "צפייה בלבד"], lastLoginAt: "2026-04-07T18:30:00", loginCount: 721
  },
  {
    id: 8, employeeCode: "EMP-008", fullName: "נועה רז", email: "noa.r@company.co.il",
    phone: "050-9990011", department: "IT", jobTitle: "מנהלת IT",
    status: "ACTIVE", roles: ["מנהל מערכת"], lastLoginAt: "2026-04-08T07:00:00", loginCount: 2156
  },
  {
    id: 9, employeeCode: "EMP-009", fullName: "אורי דגן", email: "ori.d@company.co.il",
    phone: "053-4445566", department: "משאבי אנוש", jobTitle: "מנהל משאבי אנוש",
    status: "ACTIVE", roles: ["מנהל פרויקט", "צפייה בלבד"], lastLoginAt: "2026-04-07T15:00:00", loginCount: 534
  },
  {
    id: 10, employeeCode: "EMP-010", fullName: "תמר אלון", email: "tamar.a@company.co.il",
    phone: "052-8889900", department: "כספים", jobTitle: "חשבת",
    status: "SUSPENDED", roles: ["חשב/ת"], lastLoginAt: "2026-03-15T10:00:00", loginCount: 289
  },
  {
    id: 11, employeeCode: "EMP-011", fullName: "איתן מור", email: "eitan.m@company.co.il",
    phone: "054-2223344", department: "רכש", jobTitle: "רכש בכיר",
    status: "ACTIVE", roles: ["רכש"], lastLoginAt: "2026-04-08T08:45:00", loginCount: 678
  },
  {
    id: 12, employeeCode: "EMP-012", fullName: "הילה ישראלי", email: "hila.i@company.co.il",
    phone: "050-7778800", department: "מחסן", jobTitle: "מחסנאית",
    status: "INACTIVE", roles: ["מחסנאי", "צפייה בלבד"], lastLoginAt: "2026-01-20T12:00:00", loginCount: 156
  },
  {
    id: 13, employeeCode: "EMP-013", fullName: "גיל סופר", email: "gil.s@company.co.il",
    phone: "053-1119988", department: "ייצור", jobTitle: "מנהל משמרת",
    status: "ACTIVE", roles: ["מנהל פרויקט", "מחסנאי"], lastLoginAt: "2026-04-07T22:00:00", loginCount: 912
  },
  {
    id: 14, employeeCode: "EMP-014", fullName: "ליאור עוז", email: "lior.oz@company.co.il",
    phone: "052-5556677", department: "מכירות", jobTitle: "נציג מכירות",
    status: "LOCKED", roles: ["צפייה בלבד"], lastLoginAt: "2026-03-28T09:30:00", loginCount: 421
  },
  {
    id: 15, employeeCode: "EMP-015", fullName: "מאיה חן", email: "maya.chen@company.co.il",
    phone: "054-3332211", department: "הנדסה", jobTitle: "מהנדסת תוכנה",
    status: "ACTIVE", roles: ["מנהל פרויקט"], lastLoginAt: "2026-04-08T10:00:00", loginCount: 567
  },
  {
    id: 16, employeeCode: "EMP-016", fullName: "רן ביטון", email: "ran.b@company.co.il",
    phone: "050-4448877", department: "IT", jobTitle: "מנהל תשתיות",
    status: "ACTIVE", roles: ["מנהל מערכת", "צפייה בלבד"], lastLoginAt: "2026-04-08T06:30:00", loginCount: 1893
  },
  {
    id: 17, employeeCode: "EMP-017", fullName: "קרן דניאל", email: "keren.d@company.co.il",
    phone: "053-6665544", department: "משאבי אנוש", jobTitle: "מגייסת",
    status: "INACTIVE", roles: ["צפייה בלבד"], lastLoginAt: "2025-12-10T11:00:00", loginCount: 87
  },
  {
    id: 18, employeeCode: "EMP-018", fullName: "יונתן הלוי", email: "yonatan.h@company.co.il",
    phone: "052-2221100", department: "הנהלה", jobTitle: "סמנכ\"ל תפעול",
    status: "ACTIVE", roles: ['מנכ"ל', "מנהל פרויקט"], lastLoginAt: "2026-04-08T07:45:00", loginCount: 1056
  },
];

const ITEMS_PER_PAGE = 10;

// ─── Helpers ────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  if (!dateStr) return "---";
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `לפני ${mins} דקות`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `לפני ${days} ימים`;
  const months = Math.floor(days / 30);
  return `לפני ${months} חודשים`;
}

// ─── Component ──────────────────────────────────────────────────
export default function UsersListPage() {
  const { data: userslistData } = useQuery({
    queryKey: ["users-list"],
    queryFn: () => authFetch("/api/system/users_list"),
    staleTime: 5 * 60 * 1000,
  });

  const DEPARTMENTS = userslistData ?? FALLBACK_DEPARTMENTS;

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);

  // ─── Filtered Data ────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    return MOCK_USERS.filter((user) => {
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesSearch =
          user.fullName.toLowerCase().includes(q) ||
          user.email.toLowerCase().includes(q) ||
          user.employeeCode.toLowerCase().includes(q) ||
          user.phone.includes(q) ||
          user.department.includes(q) ||
          user.jobTitle.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      // Status
      if (statusFilter && user.status !== statusFilter) return false;
      // Department
      if (departmentFilter && user.department !== departmentFilter) return false;
      // Role
      if (roleFilter && !user.roles.includes(roleFilter)) return false;
      return true;
    });
  }, [searchQuery, statusFilter, departmentFilter, roleFilter]);

  // ─── Stats ────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:     MOCK_USERS.length,
    active:    MOCK_USERS.filter((u) => u.status === "ACTIVE").length,
    locked:    MOCK_USERS.filter((u) => u.status === "LOCKED").length,
    suspended: MOCK_USERS.filter((u) => u.status === "SUSPENDED").length,
  }), []);

  // ─── Pagination ───────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / ITEMS_PER_PAGE));
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset to page 1 when filters change
  const handleFilterChange = (setter: (v: string) => void, value: string) => {
    setter(value);
    setCurrentPage(1);
  };

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] p-6 space-y-6">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-500/20">
            <Users className="w-7 h-7 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">ניהול משתמשים</h1>
              <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-sm px-3">
                {MOCK_USERS.length} משתמשים
              </Badge>
            </div>
            <p className="text-gray-400 text-sm mt-1">ניהול חשבונות, הרשאות וסטטוס משתמשים במערכת</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium shadow-lg shadow-blue-600/20">
          <UserPlus className="w-5 h-5" />
          הוסף משתמש
        </button>
      </div>

      {/* ── Stats Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total */}
        <Card className="bg-[#0f1629] border-[#1e2a4a] hover:border-blue-500/40 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm mb-1">סה"כ משתמשים</p>
                <p className="text-3xl font-bold text-white">{stats.total}</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/15">
                <Users className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active */}
        <Card className="bg-[#0f1629] border-[#1e2a4a] hover:border-green-500/40 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm mb-1">פעילים</p>
                <p className="text-3xl font-bold text-green-400">{stats.active}</p>
              </div>
              <div className="p-3 rounded-xl bg-green-500/15">
                <ShieldCheck className="w-6 h-6 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Locked */}
        <Card className="bg-[#0f1629] border-[#1e2a4a] hover:border-red-500/40 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm mb-1">נעולים</p>
                <p className="text-3xl font-bold text-red-400">{stats.locked}</p>
              </div>
              <div className="p-3 rounded-xl bg-red-500/15">
                <Lock className="w-6 h-6 text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Suspended */}
        <Card className="bg-[#0f1629] border-[#1e2a4a] hover:border-amber-500/40 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm mb-1">מושעים</p>
                <p className="text-3xl font-bold text-amber-400">{stats.suspended}</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/15">
                <ShieldAlert className="w-6 h-6 text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────── */}
      <Card className="bg-[#0f1629] border-[#1e2a4a]">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[260px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="חיפוש לפי שם, אימייל, קוד עובד, טלפון..."
                value={searchQuery}
                onChange={(e) => handleFilterChange(setSearchQuery, e.target.value)}
                className="w-full pr-10 pl-4 py-2.5 bg-[#0a0e1a] border border-[#1e2a4a] rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all"
              />
            </div>

            {/* Status Filter */}
            <div className="relative min-w-[160px]">
              <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <select
                value={statusFilter}
                onChange={(e) => handleFilterChange(setStatusFilter, e.target.value)}
                className="w-full pr-10 pl-4 py-2.5 bg-[#0a0e1a] border border-[#1e2a4a] rounded-lg text-white text-sm focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
              >
                <option value="">כל הסטטוסים</option>
                <option value="ACTIVE">פעיל</option>
                <option value="INACTIVE">לא פעיל</option>
                <option value="LOCKED">נעול</option>
                <option value="SUSPENDED">מושעה</option>
              </select>
            </div>

            {/* Department Filter */}
            <div className="relative min-w-[160px]">
              <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <select
                value={departmentFilter}
                onChange={(e) => handleFilterChange(setDepartmentFilter, e.target.value)}
                className="w-full pr-10 pl-4 py-2.5 bg-[#0a0e1a] border border-[#1e2a4a] rounded-lg text-white text-sm focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
              >
                <option value="">כל המחלקות</option>
                {DEPARTMENTS.map((dep) => (
                  <option key={dep} value={dep}>{dep}</option>
                ))}
              </select>
            </div>

            {/* Role Filter */}
            <div className="relative min-w-[170px]">
              <Shield className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <select
                value={roleFilter}
                onChange={(e) => handleFilterChange(setRoleFilter, e.target.value)}
                className="w-full pr-10 pl-4 py-2.5 bg-[#0a0e1a] border border-[#1e2a4a] rounded-lg text-white text-sm focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
              >
                <option value="">כל התפקידים</option>
                {ALL_ROLES.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>

            {/* Results count */}
            <div className="text-gray-500 text-sm mr-auto">
              {filteredUsers.length} תוצאות
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Users Table ────────────────────────────────────────── */}
      <Card className="bg-[#0f1629] border-[#1e2a4a] overflow-hidden">
        <CardHeader className="pb-0 px-6 pt-5">
          <CardTitle className="text-white text-lg flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            רשימת משתמשים
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 mt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e2a4a] bg-[#080c16]">
                  <th className="text-right px-4 py-3.5 text-gray-400 font-medium whitespace-nowrap">קוד עובד</th>
                  <th className="text-right px-4 py-3.5 text-gray-400 font-medium whitespace-nowrap">שם מלא</th>
                  <th className="text-right px-4 py-3.5 text-gray-400 font-medium whitespace-nowrap">אימייל</th>
                  <th className="text-right px-4 py-3.5 text-gray-400 font-medium whitespace-nowrap">מחלקה</th>
                  <th className="text-right px-4 py-3.5 text-gray-400 font-medium whitespace-nowrap">תפקיד</th>
                  <th className="text-right px-4 py-3.5 text-gray-400 font-medium whitespace-nowrap">תפקידים</th>
                  <th className="text-right px-4 py-3.5 text-gray-400 font-medium whitespace-nowrap">סטטוס</th>
                  <th className="text-right px-4 py-3.5 text-gray-400 font-medium whitespace-nowrap">כניסה אחרונה</th>
                  <th className="text-center px-4 py-3.5 text-gray-400 font-medium whitespace-nowrap">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {paginatedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-16 text-gray-500">
                      <Users className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                      <p className="text-lg font-medium">לא נמצאו משתמשים</p>
                      <p className="text-sm mt-1">נסה לשנות את הפילטרים או מילות החיפוש</p>
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map((user, idx) => {
                    const statusCfg = STATUS_CONFIG[user.status];
                    const StatusIcon = statusCfg.icon;
                    return (
                      <tr
                        key={user.id}
                        className={`border-b border-[#1e2a4a]/60 hover:bg-[#141c32] transition-colors ${
                          idx % 2 === 0 ? "bg-[#0f1629]" : "bg-[#0c1220]"
                        }`}
                      >
                        {/* Employee Code */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="font-mono text-blue-300 text-xs bg-blue-500/10 px-2 py-1 rounded">
                            {user.employeeCode}
                          </span>
                        </td>

                        {/* Full Name */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {user.fullName.charAt(0)}
                            </div>
                            <span className="text-white font-medium">{user.fullName}</span>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-gray-300">
                            <Mail className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-xs">{user.email}</span>
                          </div>
                        </td>

                        {/* Department */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-gray-300">{user.department}</span>
                          </div>
                        </td>

                        {/* Job Title */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-gray-300">
                          {user.jobTitle}
                        </td>

                        {/* Roles */}
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1.5 max-w-[220px]">
                            {user.roles.map((role) => (
                              <Badge
                                key={role}
                                className={`text-[10px] px-2 py-0.5 border ${
                                  ROLE_COLORS[role] || "bg-gray-500/20 text-gray-300 border-gray-500/30"
                                }`}
                              >
                                {role}
                              </Badge>
                            ))}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
                            <StatusIcon className="w-3.5 h-3.5" />
                            {statusCfg.label}
                          </span>
                        </td>

                        {/* Last Login */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-gray-300 text-xs">{formatDate(user.lastLoginAt)}</span>
                            <span className="text-gray-500 text-[10px] mt-0.5 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {timeAgo(user.lastLoginAt)}
                              <span className="mx-1">|</span>
                              <Activity className="w-3 h-3" />
                              {user.loginCount.toLocaleString()} כניסות
                            </span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              title="עריכה"
                              className="p-2 rounded-lg hover:bg-blue-500/20 text-gray-400 hover:text-blue-400 transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              title={user.status === "LOCKED" ? "שחרור נעילה" : "נעילה"}
                              className={`p-2 rounded-lg transition-colors ${
                                user.status === "LOCKED"
                                  ? "hover:bg-green-500/20 text-gray-400 hover:text-green-400"
                                  : "hover:bg-amber-500/20 text-gray-400 hover:text-amber-400"
                              }`}
                            >
                              {user.status === "LOCKED" ? (
                                <Unlock className="w-4 h-4" />
                              ) : (
                                <Lock className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              title="צפייה בכרטיס"
                              className="p-2 rounded-lg hover:bg-purple-500/20 text-gray-400 hover:text-purple-400 transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              title="השעיה"
                              className="p-2 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ──────────────────────────────────────── */}
          {filteredUsers.length > 0 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#1e2a4a]">
              {/* Info */}
              <div className="text-gray-500 text-sm">
                מציג {(currentPage - 1) * ITEMS_PER_PAGE + 1}
                -{Math.min(currentPage * ITEMS_PER_PAGE, filteredUsers.length)}
                {" "}מתוך {filteredUsers.length} משתמשים
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1">
                {/* First page */}
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#1e2a4a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="עמוד ראשון"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>

                {/* Previous */}
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#1e2a4a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="הקודם"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                {/* Page numbers */}
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === page
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                        : "text-gray-400 hover:text-white hover:bg-[#1e2a4a]"
                    }`}
                  >
                    {page}
                  </button>
                ))}

                {/* Next */}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#1e2a4a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="הבא"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Last page */}
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#1e2a4a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="עמוד אחרון"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
