import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users, Search, Shield, ShieldCheck, ShieldX, Plus, Trash2,
  UserCheck, UserX, Clock, AlertTriangle, CheckCircle, ChevronDown,
  ToggleLeft, ToggleRight, Calendar, Building2, Filter, UserPlus
} from "lucide-react";

// ─── Mock Data ─────────────────────────────────────────────────────────────────

interface Role {
  id: string;
  name: string;
  nameHe: string;
  color: string;
}

interface UserRoleAssignment {
  roleId: string;
  validFrom: string;
  validTo: string;
  isActive: boolean;
  assignedBy: string;
  assignedAt: string;
}

interface UserRecord {
  id: string;
  name: string;
  email: string;
  department: string;
  position: string;
  roles: UserRoleAssignment[];
  avatar: string;
}

const FALLBACK_AVAILABLE_ROLES: Role[] = [
  { id: "ADMIN", name: "System Admin", nameHe: "מנהל מערכת", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  { id: "FINANCE_MANAGER", name: "Finance Manager", nameHe: "מנהל כספים", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  { id: "FINANCE_CLERK", name: "Finance Clerk", nameHe: "פקיד כספים", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  { id: "PROCUREMENT_MANAGER", name: "Procurement Manager", nameHe: "מנהל רכש", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { id: "PROCUREMENT_CLERK", name: "Procurement Clerk", nameHe: "פקיד רכש", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  { id: "HR_MANAGER", name: "HR Manager", nameHe: "מנהל משאבי אנוש", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  { id: "HR_CLERK", name: "HR Clerk", nameHe: "פקיד משאבי אנוש", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  { id: "SALES_MANAGER", name: "Sales Manager", nameHe: "מנהל מכירות", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { id: "SALES_REP", name: "Sales Rep", nameHe: "נציג מכירות", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  { id: "PROJECT_MANAGER", name: "Project Manager", nameHe: "מנהל פרויקטים", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  { id: "WAREHOUSE_MANAGER", name: "Warehouse Manager", nameHe: "מנהל מחסן", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  { id: "PRODUCTION_MANAGER", name: "Production Manager", nameHe: "מנהל ייצור", color: "bg-pink-500/20 text-pink-400 border-pink-500/30" },
  { id: "CEO", name: "CEO", nameHe: "מנכ\"ל", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  { id: "CFO", name: "CFO", nameHe: "סמנכ\"ל כספים", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  { id: "VIEWER", name: "Viewer", nameHe: "צפייה בלבד", color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  { id: "AUDITOR", name: "Auditor", nameHe: "מבקר", color: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" },
];

const FALLBACK_MOCK_USERS: UserRecord[] = [
  {
    id: "U001", name: "אבי כהן", email: "avi.cohen@company.co.il", department: "כספים", position: "מנהל כספים",
    avatar: "AC",
    roles: [
      { roleId: "FINANCE_MANAGER", validFrom: "2024-01-01", validTo: "2026-12-31", isActive: true, assignedBy: "מנהל מערכת", assignedAt: "2024-01-01" },
      { roleId: "AUDITOR", validFrom: "2025-06-01", validTo: "2026-06-01", isActive: true, assignedBy: "מנהל מערכת", assignedAt: "2025-06-01" },
    ],
  },
  {
    id: "U002", name: "שרה לוי", email: "sara.levy@company.co.il", department: "רכש", position: "מנהלת רכש",
    avatar: "SL",
    roles: [
      { roleId: "PROCUREMENT_MANAGER", validFrom: "2024-03-15", validTo: "2027-03-15", isActive: true, assignedBy: "אבי כהן", assignedAt: "2024-03-15" },
    ],
  },
  {
    id: "U003", name: "דוד מזרחי", email: "david.m@company.co.il", department: "מכירות", position: "מנהל מכירות",
    avatar: "DM",
    roles: [
      { roleId: "SALES_MANAGER", validFrom: "2023-07-01", validTo: "2026-07-01", isActive: true, assignedBy: "מנהל מערכת", assignedAt: "2023-07-01" },
      { roleId: "PROJECT_MANAGER", validFrom: "2025-01-01", validTo: "2025-12-31", isActive: true, assignedBy: "אבי כהן", assignedAt: "2025-01-01" },
      { roleId: "VIEWER", validFrom: "2025-09-01", validTo: "2025-12-01", isActive: false, assignedBy: "מנהל מערכת", assignedAt: "2025-09-01" },
    ],
  },
  {
    id: "U004", name: "רחל אברהם", email: "rachel.a@company.co.il", department: "משאבי אנוש", position: "מנהלת HR",
    avatar: "RA",
    roles: [
      { roleId: "HR_MANAGER", validFrom: "2024-02-01", validTo: "2027-02-01", isActive: true, assignedBy: "מנהל מערכת", assignedAt: "2024-02-01" },
    ],
  },
  {
    id: "U005", name: "משה ברק", email: "moshe.b@company.co.il", department: "ייצור", position: "מנהל ייצור",
    avatar: "MB",
    roles: [
      { roleId: "PRODUCTION_MANAGER", validFrom: "2024-06-01", validTo: "2027-06-01", isActive: true, assignedBy: "מנהל מערכת", assignedAt: "2024-06-01" },
      { roleId: "WAREHOUSE_MANAGER", validFrom: "2025-03-01", validTo: "2026-03-01", isActive: true, assignedBy: "שרה לוי", assignedAt: "2025-03-01" },
    ],
  },
  {
    id: "U006", name: "נועה פרידמן", email: "noa.f@company.co.il", department: "מכירות", position: "נציגת מכירות",
    avatar: "NF",
    roles: [
      { roleId: "SALES_REP", validFrom: "2025-01-15", validTo: "2026-01-15", isActive: true, assignedBy: "דוד מזרחי", assignedAt: "2025-01-15" },
    ],
  },
  {
    id: "U007", name: "יוסי גולד", email: "yosi.g@company.co.il", department: "כספים", position: "פקיד כספים",
    avatar: "YG",
    roles: [
      { roleId: "FINANCE_CLERK", validFrom: "2024-08-01", validTo: "2026-08-01", isActive: true, assignedBy: "אבי כהן", assignedAt: "2024-08-01" },
    ],
  },
  {
    id: "U008", name: "ליאור שמש", email: "lior.s@company.co.il", department: "IT", position: "מנהל מערכות",
    avatar: "LS",
    roles: [
      { roleId: "ADMIN", validFrom: "2023-01-01", validTo: "2028-01-01", isActive: true, assignedBy: "מנהל מערכת", assignedAt: "2023-01-01" },
    ],
  },
  {
    id: "U009", name: "תמר רוזן", email: "tamar.r@company.co.il", department: "פרויקטים", position: "מנהלת פרויקט",
    avatar: "TR",
    roles: [
      { roleId: "PROJECT_MANAGER", validFrom: "2025-02-01", validTo: "2026-12-31", isActive: true, assignedBy: "מנהל מערכת", assignedAt: "2025-02-01" },
    ],
  },
  {
    id: "U010", name: "עומר חדד", email: "omer.h@company.co.il", department: "מחסן", position: "מנהל מחסן",
    avatar: "OH",
    roles: [],
  },
  {
    id: "U011", name: "מיכל דנון", email: "michal.d@company.co.il", department: "רכש", position: "פקידת רכש",
    avatar: "MD",
    roles: [
      { roleId: "PROCUREMENT_CLERK", validFrom: "2025-04-01", validTo: "2025-10-01", isActive: false, assignedBy: "שרה לוי", assignedAt: "2025-04-01" },
    ],
  },
  {
    id: "U012", name: "אלון ביטון", email: "alon.b@company.co.il", department: "הנהלה", position: "מנכ\"ל",
    avatar: "AB",
    roles: [
      { roleId: "CEO", validFrom: "2022-01-01", validTo: "2030-12-31", isActive: true, assignedBy: "מנהל מערכת", assignedAt: "2022-01-01" },
      { roleId: "ADMIN", validFrom: "2022-01-01", validTo: "2030-12-31", isActive: true, assignedBy: "מנהל מערכת", assignedAt: "2022-01-01" },
    ],
  },
  {
    id: "U013", name: "הילה נחמני", email: "hila.n@company.co.il", department: "משאבי אנוש", position: "פקידת HR",
    avatar: "HN",
    roles: [
      { roleId: "HR_CLERK", validFrom: "2025-05-01", validTo: "2026-05-01", isActive: true, assignedBy: "רחל אברהם", assignedAt: "2025-05-01" },
    ],
  },
  {
    id: "U014", name: "רון אשכנזי", email: "ron.a@company.co.il", department: "כספים", position: "סמנכ\"ל כספים",
    avatar: "RE",
    roles: [
      { roleId: "CFO", validFrom: "2023-06-01", validTo: "2027-06-01", isActive: true, assignedBy: "מנהל מערכת", assignedAt: "2023-06-01" },
      { roleId: "FINANCE_MANAGER", validFrom: "2023-06-01", validTo: "2027-06-01", isActive: true, assignedBy: "מנהל מערכת", assignedAt: "2023-06-01" },
      { roleId: "AUDITOR", validFrom: "2024-01-01", validTo: "2025-06-30", isActive: false, assignedBy: "אבי כהן", assignedAt: "2024-01-01" },
    ],
  },
  {
    id: "U015", name: "דנה קפלן", email: "dana.k@company.co.il", department: "שיווק", position: "מנהלת שיווק",
    avatar: "DK",
    roles: [],
  },
];

const getRoleDef = (roleId: string): Role =>
  AVAILABLE_ROLES.find((r) => r.id === roleId) || { id: roleId, name: roleId, nameHe: roleId, color: "bg-gray-500/20 text-gray-400 border-gray-500/30" };

const fmt = Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });

// ─── Component ─────────────────────────────────────────────────────────────────

export default function UserRoleAssignment() {
  const { data: userroleassignmentData } = useQuery({
    queryKey: ["user-role-assignment"],
    queryFn: () => authFetch("/api/system/user_role_assignment"),
    staleTime: 5 * 60 * 1000,
  });

  const AVAILABLE_ROLES = userroleassignmentData ?? FALLBACK_AVAILABLE_ROLES;

  const [users, setUsers] = useState<UserRecord[]>(MOCK_USERS);
  const [selectedUserId, setSelectedUserId] = useState<string | null>("U001");
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [addRoleDropdown, setAddRoleDropdown] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkRoleId, setBulkRoleId] = useState("");

  const departments = useMemo(() => [...new Set(users.map((u) => u.department))], [users]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch = !searchQuery || u.name.includes(searchQuery) || u.email.includes(searchQuery) || u.department.includes(searchQuery);
      const matchDept = !deptFilter || u.department === deptFilter;
      return matchSearch && matchDept;
    });
  }, [users, searchQuery, deptFilter]);

  const selectedUser = users.find((u) => u.id === selectedUserId) || null;

  // Stats
  const usersWithoutRoles = users.filter((u) => u.roles.length === 0).length;
  const usersMultipleRoles = users.filter((u) => u.roles.filter((r) => r.isActive).length > 1).length;
  const expiredAssignments = users.reduce(
    (acc, u) => acc + u.roles.filter((r) => new Date(r.validTo) < new Date() || !r.isActive).length,
    0,
  );
  const totalActiveAssignments = users.reduce((acc, u) => acc + u.roles.filter((r) => r.isActive).length, 0);

  const handleToggleActive = (userId: string, roleId: string) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, roles: u.roles.map((r) => (r.roleId === roleId ? { ...r, isActive: !r.isActive } : r)) }
          : u,
      ),
    );
  };

  const handleRemoveRole = (userId: string, roleId: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, roles: u.roles.filter((r) => r.roleId !== roleId) } : u)),
    );
  };

  const handleAddRole = (roleId: string) => {
    if (!selectedUserId) return;
    const today = new Date().toISOString().slice(0, 10);
    const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    setUsers((prev) =>
      prev.map((u) =>
        u.id === selectedUserId
          ? {
              ...u,
              roles: [
                ...u.roles,
                { roleId, validFrom: today, validTo: nextYear, isActive: true, assignedBy: "מנהל מערכת", assignedAt: today },
              ],
            }
          : u,
      ),
    );
    setAddRoleDropdown(false);
  };

  const handleBulkAssign = () => {
    if (!bulkRoleId || bulkSelected.size === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    setUsers((prev) =>
      prev.map((u) =>
        bulkSelected.has(u.id)
          ? {
              ...u,
              roles: [
                ...u.roles.filter((r) => r.roleId !== bulkRoleId),
                { roleId: bulkRoleId, validFrom: today, validTo: nextYear, isActive: true, assignedBy: "מנהל מערכת", assignedAt: today },
              ],
            }
          : u,
      ),
    );
    setBulkSelected(new Set());
    setBulkRoleId("");
    setBulkMode(false);
  };

  const toggleBulkUser = (userId: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const assignableRoles = selectedUser
    ? AVAILABLE_ROLES.filter((r) => !selectedUser.roles.some((ur) => ur.roleId === r.id))
    : [];

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-7 w-7 text-blue-400" />
            הקצאת תפקידים למשתמשים
          </h1>
          <p className="text-sm text-gray-400 mt-1">ניהול שיוך תפקידים, הפעלה/ביטול, הקצאה המונית</p>
        </div>
        <button
          onClick={() => setBulkMode(!bulkMode)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            bulkMode ? "bg-blue-600 text-white" : "bg-[#1a2035] border border-gray-700 text-gray-300 hover:bg-[#1e2540]"
          }`}
        >
          <UserPlus className="w-4 h-4" />
          הקצאה המונית
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "סה\"כ הקצאות פעילות", value: totalActiveAssignments, icon: ShieldCheck, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "משתמשים ללא תפקיד", value: usersWithoutRoles, icon: UserX, color: "text-red-400", bg: "bg-red-500/10" },
          { label: "משתמשים עם ריבוי תפקידים", value: usersMultipleRoles, icon: Users, color: "text-amber-400", bg: "bg-amber-500/10" },
          { label: "הקצאות שפגו / מושבתות", value: expiredAssignments, icon: Clock, color: "text-gray-400", bg: "bg-gray-500/10" },
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

      {/* Main Layout: Users List + Role Details */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left Panel: User List */}
        <div className="col-span-5">
          <Card className="bg-[#111827] border-gray-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                רשימת משתמשים ({filteredUsers.length})
              </CardTitle>
              <div className="flex gap-2 mt-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute right-3 top-2.5 text-gray-500" />
                  <input
                    className="w-full bg-[#0d1321] border border-gray-700 rounded-lg pr-9 pl-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    placeholder="חיפוש שם, מייל, מחלקה..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <select
                  className="bg-[#0d1321] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                >
                  <option value="">כל המחלקות</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent className="p-0 max-h-[600px] overflow-y-auto">
              {filteredUsers.map((u) => {
                const isSelected = u.id === selectedUserId;
                const activeRoles = u.roles.filter((r) => r.isActive);
                return (
                  <div
                    key={u.id}
                    onClick={() => { if (!bulkMode) setSelectedUserId(u.id); }}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-800 transition ${
                      isSelected && !bulkMode ? "bg-blue-900/20 border-r-2 border-r-blue-500" : "hover:bg-[#1a2035]"
                    }`}
                  >
                    {bulkMode && (
                      <input
                        type="checkbox"
                        checked={bulkSelected.has(u.id)}
                        onChange={() => toggleBulkUser(u.id)}
                        className="w-4 h-4 rounded bg-[#0d1321] border-gray-600"
                      />
                    )}
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-xs font-bold">
                      {u.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">{u.name}</span>
                        {u.roles.length === 0 && (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">{u.department}</span>
                        <span className="text-xs text-gray-600">|</span>
                        <span className="text-xs text-gray-500">{u.position}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {activeRoles.map((r) => {
                          const def = getRoleDef(r.roleId);
                          return (
                            <Badge key={r.roleId} className={`text-[10px] px-1.5 py-0 border ${def.color}`}>
                              {def.nameHe}
                            </Badge>
                          );
                        })}
                        {u.roles.length === 0 && (
                          <span className="text-[10px] text-red-400">ללא תפקיד</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Right Panel: Role Assignments for Selected User */}
        <div className="col-span-7 space-y-4">
          {/* Bulk Assignment Panel */}
          {bulkMode && (
            <Card className="bg-[#111827] border-blue-800/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-blue-400">
                  <UserPlus className="w-4 h-4" />
                  הקצאה המונית — {bulkSelected.size} משתמשים נבחרו
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-3">
                  <select
                    className="flex-1 bg-[#0d1321] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                    value={bulkRoleId}
                    onChange={(e) => setBulkRoleId(e.target.value)}
                  >
                    <option value="">בחר תפקיד להקצאה...</option>
                    {AVAILABLE_ROLES.map((r) => (
                      <option key={r.id} value={r.id}>{r.nameHe} ({r.name})</option>
                    ))}
                  </select>
                  <button
                    onClick={handleBulkAssign}
                    disabled={!bulkRoleId || bulkSelected.size === 0}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-medium transition"
                  >
                    הקצה לכולם
                  </button>
                </div>
                {bulkSelected.size > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {[...bulkSelected].map((uid) => {
                      const u = users.find((x) => x.id === uid);
                      return u ? (
                        <Badge key={uid} className="bg-blue-500/15 text-blue-300 border-blue-500/30 border text-xs">
                          {u.name}
                        </Badge>
                      ) : null;
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {selectedUser && !bulkMode ? (
            <>
              {/* User Header */}
              <Card className="bg-[#111827] border-gray-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-lg font-bold">
                      {selectedUser.avatar}
                    </div>
                    <div className="flex-1">
                      <h2 className="text-lg font-bold text-white">{selectedUser.name}</h2>
                      <p className="text-sm text-gray-400">{selectedUser.email}</p>
                      <div className="flex gap-3 mt-1">
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Building2 className="w-3 h-3" /> {selectedUser.department}
                        </span>
                        <span className="text-xs text-gray-500">{selectedUser.position}</span>
                      </div>
                    </div>
                    <div className="text-left">
                      <span className="text-xs text-gray-500">תפקידים פעילים</span>
                      <p className="text-2xl font-bold text-blue-400">{selectedUser.roles.filter((r) => r.isActive).length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Role Assignments Table */}
              <Card className="bg-[#111827] border-gray-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    תפקידים מוקצים
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {selectedUser.roles.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <ShieldX className="w-10 h-10 mx-auto mb-2 text-gray-600" />
                      <p className="text-sm">למשתמש זה אין תפקידים מוקצים</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-500 text-xs border-b border-gray-800">
                            <th className="text-right py-2 pr-2">תפקיד</th>
                            <th className="text-right py-2">תוקף מ-</th>
                            <th className="text-right py-2">תוקף עד</th>
                            <th className="text-right py-2">הוקצה ע\"י</th>
                            <th className="text-center py-2">סטטוס</th>
                            <th className="text-center py-2">פעולות</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedUser.roles.map((r, idx) => {
                            const def = getRoleDef(r.roleId);
                            const isExpired = new Date(r.validTo) < new Date();
                            const isExpiringSoon =
                              !isExpired &&
                              new Date(r.validTo).getTime() - Date.now() < 30 * 86400000;
                            return (
                              <tr key={idx} className="border-b border-gray-800/50 hover:bg-[#1a2035]">
                                <td className="py-3 pr-2">
                                  <Badge className={`border text-xs ${def.color}`}>
                                    {def.nameHe}
                                  </Badge>
                                  <span className="text-[10px] text-gray-600 mr-2">{def.name}</span>
                                </td>
                                <td className="py-3 text-gray-400 text-xs">
                                  <Calendar className="w-3 h-3 inline ml-1 text-gray-600" />
                                  {fmt.format(new Date(r.validFrom))}
                                </td>
                                <td className="py-3 text-xs">
                                  <span className={isExpired ? "text-red-400" : isExpiringSoon ? "text-amber-400" : "text-gray-400"}>
                                    {fmt.format(new Date(r.validTo))}
                                  </span>
                                  {isExpired && <Badge className="bg-red-500/15 text-red-400 border-red-500/30 border mr-2 text-[10px]">פג תוקף</Badge>}
                                  {isExpiringSoon && <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 border mr-2 text-[10px]">בקרוב</Badge>}
                                </td>
                                <td className="py-3 text-gray-400 text-xs">{r.assignedBy}</td>
                                <td className="py-3 text-center">
                                  <button onClick={() => handleToggleActive(selectedUser.id, r.roleId)} title={r.isActive ? "כבה" : "הפעל"}>
                                    {r.isActive ? (
                                      <ToggleRight className="w-6 h-6 text-emerald-400 hover:text-emerald-300 transition" />
                                    ) : (
                                      <ToggleLeft className="w-6 h-6 text-gray-600 hover:text-gray-400 transition" />
                                    )}
                                  </button>
                                </td>
                                <td className="py-3 text-center">
                                  <button
                                    onClick={() => handleRemoveRole(selectedUser.id, r.roleId)}
                                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition"
                                    title="הסר תפקיד"
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

                  {/* Add Role */}
                  <div className="mt-4 relative">
                    <button
                      onClick={() => setAddRoleDropdown(!addRoleDropdown)}
                      className="flex items-center gap-2 px-4 py-2 bg-[#0d1321] border border-gray-700 rounded-lg text-sm text-gray-300 hover:bg-[#1a2035] hover:border-blue-600 transition"
                    >
                      <Plus className="w-4 h-4 text-blue-400" />
                      הוסף תפקיד
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    {addRoleDropdown && (
                      <div className="absolute top-full mt-1 right-0 w-80 bg-[#1a2035] border border-gray-700 rounded-lg shadow-xl z-20 max-h-64 overflow-y-auto">
                        {assignableRoles.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-gray-500">כל התפקידים כבר מוקצים</div>
                        ) : (
                          assignableRoles.map((r) => (
                            <button
                              key={r.id}
                              onClick={() => handleAddRole(r.id)}
                              className="w-full text-right px-4 py-2.5 hover:bg-[#0d1321] transition flex items-center gap-2"
                            >
                              <Badge className={`text-[10px] border ${r.color}`}>{r.nameHe}</Badge>
                              <span className="text-xs text-gray-500">{r.name}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : !bulkMode ? (
            <Card className="bg-[#111827] border-gray-800">
              <CardContent className="p-12 text-center text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-3 text-gray-700" />
                <p>בחר משתמש מהרשימה כדי לנהל את התפקידים שלו</p>
              </CardContent>
            </Card>
          ) : null}

          {/* Summary: users without roles warning */}
          {usersWithoutRoles > 0 && (
            <Card className="bg-[#111827] border-red-900/40">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-400">
                      {usersWithoutRoles} משתמשים ללא תפקיד מוגדר
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {users
                        .filter((u) => u.roles.length === 0)
                        .map((u) => (
                          <button
                            key={u.id}
                            onClick={() => { setSelectedUserId(u.id); setBulkMode(false); }}
                            className="text-xs bg-red-500/10 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-md hover:bg-red-500/20 transition"
                          >
                            {u.name}
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
