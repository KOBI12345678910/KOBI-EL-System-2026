import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button, Input, Modal, Label, Card } from "@/components/ui-components";
import { Users, Plus, Edit2, Trash2, Shield, Search, UserPlus, Clock, Key, ChevronDown, Eye, Settings, Lock, Unlock, Check, X, UserCheck, Layers, FileText, Palette, MapPin } from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";

const API_BASE = "/api";

interface UserRecord {
  id: number;
  username: string;
  fullName: string;
  email: string;
  phone: string | null;
  department: string | null;
  jobTitle: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
  lastLoginAt: string | null;
  loginCount: number;
  createdAt: string;
  gpsEnabled?: boolean;
  gpsDeviceId?: string | null;
  gpsLastPingAt?: string | null;
  gpsIsMoving?: boolean | null;
  gpsStatus?: string | null;
  gpsTotalPings?: number | null;
}

export default function UserManagementSection() {
  const { token, user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [activeTab, setActiveTab] = useState("users");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [newUser, setNewUser] = useState({ username: "", password: "", fullName: "", email: "", department: "", jobTitle: "", isSuperAdmin: false, roleIds: [] as number[], modulePerms: {} as Record<string, { view: boolean; manage: boolean; create: boolean; edit: boolean; delete: boolean }> });
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [editForm, setEditForm] = useState({ fullName: "", email: "", phone: "", department: "", jobTitle: "", isSuperAdmin: false, newPassword: "", roleIds: [] as number[], modulePerms: {} as Record<string, { view: boolean; manage: boolean; create: boolean; edit: boolean; delete: boolean }> });

  const { data: users = [], isLoading } = useQuery<UserRecord[]>({
    queryKey: ["all-users"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/auth/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.users || []);
    },
    enabled: !!token,
  });

  const { data: roles = [] } = useQuery<{ id: number; name: string; nameHe: string | null; slug: string; color: string }[]>({
    queryKey: ["platform-roles"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/platform/roles`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: roleAssignments = [] } = useQuery<{ id: number; roleId: number; userId: string }[]>({
    queryKey: ["role-assignments"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/platform/role-assignments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token,
  });

  const { modules } = usePlatformModules();

  const { data: companyRoles = [], isLoading: companyRolesLoading } = useQuery<{ jobTitle: string; isAdmin: boolean; userCount: number }[]>({
    queryKey: ["company-roles"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/auth/company-roles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token,
  });

  const toggleCompanyRoleAdminMutation = useMutation({
    mutationFn: async ({ jobTitle, isAdmin }: { jobTitle: string; isAdmin: boolean }) => {
      const res = await fetch(`${API_BASE}/auth/company-roles/${encodeURIComponent(jobTitle)}/admin`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isAdmin }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "שגיאה");
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["company-roles"] });
      queryClient.invalidateQueries({ queryKey: ["all-users"] });
      toast({ title: "תפקיד עודכן", description: data.message });
    },
    onError: (err: Error) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [roleForm, setRoleForm] = useState({ name: "", nameHe: "", slug: "", description: "", color: "#3b82f6", isSuperAdmin: false, builderAccess: false, modulePerms: {} as Record<string, { view: boolean; manage: boolean; create: boolean; edit: boolean; delete: boolean }> });

  const createRoleMutation = useMutation({
    mutationFn: async (data: typeof roleForm) => {
      const settings = { isSuperAdmin: data.isSuperAdmin, builderAccess: data.builderAccess, modules: data.modulePerms, entities: {}, fields: {}, actions: {} };
      const body = { name: data.name, nameHe: data.nameHe, slug: data.slug, description: data.description, color: data.color, settings };
      const url = editingRole ? `${API_BASE}/platform/roles/${editingRole.id}` : `${API_BASE}/platform/roles`;
      const method = editingRole ? "PUT" : "POST";
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "שגיאה");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-roles"] });
      toast({ title: editingRole ? "תפקיד עודכן" : "תפקיד נוצר", description: "בהצלחה" });
      setShowRoleModal(false);
      setEditingRole(null);
    },
    onError: (err: Error) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: number) => {
      const res = await fetch(`${API_BASE}/platform/roles/${roleId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || "שגיאה"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-roles"] });
      toast({ title: "תפקיד נמחק" });
    },
    onError: (err: Error) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

  function openRoleForm(role?: any) {
    if (role) {
      const s = role.settings || {};
      setEditingRole(role);
      setRoleForm({
        name: role.name || "", nameHe: role.nameHe || "", slug: role.slug || "", description: role.description || "", color: role.color || "#3b82f6",
        isSuperAdmin: s.isSuperAdmin || false, builderAccess: s.builderAccess || false,
        modulePerms: s.modules || {},
      });
    } else {
      setEditingRole(null);
      setRoleForm({ name: "", nameHe: "", slug: "", description: "", color: "#3b82f6", isSuperAdmin: false, builderAccess: false, modulePerms: {} });
    }
    setShowRoleModal(true);
  }

  function toggleModulePerm(moduleSlug: string, perm: "view" | "manage" | "create" | "edit" | "delete") {
    setRoleForm(prev => {
      const cur = prev.modulePerms[moduleSlug] || { view: false, manage: false, create: false, edit: false, delete: false };
      const updated = { ...cur, [perm]: !cur[perm] };
      if (perm === "manage" && updated.manage) { updated.view = true; updated.create = true; updated.edit = true; updated.delete = true; }
      if (perm === "view" && !updated.view) { updated.manage = false; updated.create = false; updated.edit = false; updated.delete = false; }
      return { ...prev, modulePerms: { ...prev.modulePerms, [moduleSlug]: updated } };
    });
  }

  const createUserMutation = useMutation({
    mutationFn: async (data: typeof newUser) => {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          username: data.username,
          password: data.password,
          fullName: data.fullName,
          fullNameHe: data.fullName,
          email: data.email,
          department: data.department,
          jobTitle: data.jobTitle,
          isSuperAdmin: data.isSuperAdmin,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "שגיאה ביצירת משתמש");
      
      // Assign roles if provided
      if (data.roleIds && data.roleIds.length > 0 && result.user?.id) {
        for (const roleId of data.roleIds) {
          const roleRes = await fetch(`${API_BASE}/platform/role-assignments`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ roleId, userId: String(result.user.id), assignedBy: currentUser?.username }),
          });
          if (!roleRes.ok) {
            const err = await roleRes.json().catch(() => ({}));
            throw new Error(err.error || "שגיאה בשיוך תפקיד");
          }
        }
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-users"] });
      queryClient.invalidateQueries({ queryKey: ["role-assignments"] });
      toast({ title: "משתמש נוצר", description: "המשתמש החדש נוסף למערכת בהצלחה" });
      setShowAddModal(false);
      setNewUser({ username: "", password: "", fullName: "", email: "", department: "", jobTitle: "", isSuperAdmin: false, roleIds: [], modulePerms: {} });
    },
    onError: (err: Error) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await fetch(`${API_BASE}/auth/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "שגיאה במחיקת משתמש");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-users"] });
      toast({ title: "משתמש נמחק", description: "המשתמש הוסר מהמערכת" });
    },
    onError: (err: Error) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: number; data: Record<string, unknown> }) => {
      const res = await fetch(`${API_BASE}/auth/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "שגיאה בעדכון משתמש");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-users"] });
    },
    onError: (err: Error) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

  const DEPARTMENTS = [
    { value: "", label: "— ללא —" },
    { value: "sales", label: "מכירות" },
    { value: "finance", label: "כספים" },
    { value: "hr", label: "משאבי אנוש" },
    { value: "procurement", label: "רכש" },
    { value: "production", label: "ייצור" },
    { value: "management", label: "הנהלה" },
    { value: "it", label: "IT" },
    { value: "logistics", label: "לוגיסטיקה" },
    { value: "quality", label: "בקרת איכות" },
  ];

  const openEditModal = (user: UserRecord) => {
    setEditingUser(user);
    const userAssignments = roleAssignments.filter(a => a.userId === String(user.id));
    setEditForm({
      fullName: user.fullName || "",
      email: user.email || "",
      phone: user.phone || "",
      department: user.department || "",
      jobTitle: user.jobTitle || "",
      isSuperAdmin: user.isSuperAdmin,
      newPassword: "",
      roleIds: userAssignments.map(a => a.roleId),
      modulePerms: {},
    });
  };

  const assignRolesMutation = useMutation({
    mutationFn: async ({ userId, roleIds }: { userId: number; roleIds: number[] }) => {
      const existingAssignments = roleAssignments.filter(a => a.userId === String(userId));
      for (const existing of existingAssignments) {
        if (!roleIds.includes(existing.roleId)) {
          const res = await fetch(`${API_BASE}/platform/role-assignments/${existing.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error("שגיאה בהסרת תפקיד");
        }
      }
      const existingRoleIds = existingAssignments.map(a => a.roleId);
      for (const roleId of roleIds) {
        if (!existingRoleIds.includes(roleId)) {
          const res = await fetch(`${API_BASE}/platform/role-assignments`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ roleId, userId: String(userId), assignedBy: currentUser?.username as string }),
          });
          if (!res.ok) throw new Error("שגיאה בשיוך תפקיד");
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["my-permissions"] });
    },
    onError: (err: Error) => {
      alert(err.message || "שגיאה בעדכון תפקידים");
      queryClient.invalidateQueries({ queryKey: ["role-assignments"] });
    },
  });

  const toggleUserMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: number; isActive: boolean }) => {
      const res = await fetch(`${API_BASE}/auth/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "שגיאה בעדכון משתמש");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-users"] });
      toast({ title: "משתמש עודכן" });
    },
    onError: (err: Error) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

  const filteredUsers = users.filter((u) => {
    if (showActiveOnly && !u.isActive) return false;
    if (!showActiveOnly && u.isActive) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return u.username.toLowerCase().includes(q) || u.fullName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    }
    return true;
  });

  const tabs = [
    { id: "users", label: "משתמשים" },
    { id: "roles", label: "תפקידים" },
    { id: "company-roles", label: "תפקידי חברה" },
    { id: "profiles", label: "פרופילים" },
    { id: "groups", label: "קבוצות" },
    { id: "service", label: "כללי שירות" },
    { id: "history", label: "היסטוריית התחברות" },
    { id: "pricing", label: "הרשאות מחירון" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-lg sm:text-2xl font-bold">משתמשים</h1>
        <Button onClick={() => setShowAddModal(true)} className="gap-2">
          <UserPlus className="w-4 h-4" />
          הוסף משתמש +
        </Button>
      </div>

      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "users" && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex gap-2">
              <Button
                variant={showActiveOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowActiveOnly(true)}
              >
                משתמשים פעילים
              </Button>
              <Button
                variant={!showActiveOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowActiveOnly(false)}
              >
                משתמשים לא פעילים
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground">1 - {filteredUsers.length} מתוך {users.length}</span>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              <Search className="w-3 h-3" />
              לסנן
            </Button>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">פעולות</th>
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">שם ודואר אלקטרוני</th>
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">מחלקה</th>
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">תפקיד הרשאות</th>
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">שם משתמש</th>
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">סטטוס GPS</th>
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">מנהל מערכת</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                      <td className="p-3">
                        {(() => {
                          const isSelf = currentUser && Number(currentUser.id) === user.id;
                          return (
                            <div className="flex items-center gap-1">
                              <button className="p-1 hover:bg-muted rounded" title="ערוך" onClick={() => openEditModal(user)}>
                                <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                              </button>
                              {!isSelf && (
                                <button
                                  className={`p-1 rounded text-xs px-2 ${user.isActive ? 'hover:bg-orange-500/10 text-orange-400' : 'hover:bg-green-500/10 text-green-400'}`}
                                  title={user.isActive ? "השבת" : "הפעל"}
                                  onClick={() => toggleUserMutation.mutate({ userId: user.id, isActive: !user.isActive })}
                                >
                                  {user.isActive ? "השבת" : "הפעל"}
                                </button>
                              )}
                              {!isSelf && isSuperAdmin && (
                                <button
                                  className="p-1 hover:bg-red-500/10 rounded"
                                  title="מחק"
                                  onClick={async () => {
                                    const ok = await globalConfirm(`למחוק את ${user.fullName || user.username}? פעולה זו לא ניתנת לביטול!`);
                                    if (ok) { deleteUserMutation.mutate(user.id); }
                                  }}
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                </button>
                              )}
                              {isSelf && (
                                <span className="text-[10px] text-muted-foreground px-2">(אתה)</span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                            {user.fullName?.charAt(0) || user.username.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{user.fullName || user.username}</p>
                            <p className="text-xs text-muted-foreground">{user.email || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-sm">
                        {(() => {
                          const dept = DEPARTMENTS.find(d => d.value === user.department);
                          return dept?.label || user.department || "—";
                        })()}
                      </td>
                      <td className="p-3 text-sm">
                        {(() => {
                          const userAssignments = roleAssignments.filter(a => a.userId === String(user.id));
                          if (userAssignments.length === 0) return <span className="text-muted-foreground">—</span>;
                          return (
                            <div className="flex flex-wrap gap-1">
                              {userAssignments.map(assignment => {
                                const role = roles.find(r => r.id === assignment.roleId);
                                if (!role) return null;
                                return (
                                  <span key={assignment.id} className="text-xs px-2 py-0.5 rounded-full border" style={{ backgroundColor: `${role.color}15`, color: role.color, borderColor: `${role.color}30` }}>
                                    {role.nameHe || role.name}
                                  </span>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="p-3 text-sm">{user.username}</td>
                      <td className="p-3 text-sm">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${user.gpsEnabled !== false ? 'bg-emerald-500' : 'bg-gray-500'}`} />
                          <span className="text-xs">{user.gpsEnabled !== false ? 'פעיל' : 'כבוי'}</span>
                          {user.gpsLastPingAt && (
                            <span className="text-[10px] text-muted-foreground mr-1" title={new Date(user.gpsLastPingAt).toLocaleString('he-IL')}>
                              <MapPin className="w-3 h-3 inline-block ml-0.5" />
                              {(() => {
                                const d = new Date(user.gpsLastPingAt);
                                const now = new Date();
                                const diff = now.getTime() - d.getTime();
                                const mins = Math.floor(diff / 60000);
                                if (mins < 1) return 'כרגע';
                                if (mins < 60) return `לפני ${mins} דק׳`;
                                const hrs = Math.floor(mins / 60);
                                if (hrs < 24) return `לפני ${hrs} שע׳`;
                                return d.toLocaleDateString('he-IL');
                              })()}
                            </span>
                          )}
                          {user.gpsEnabled !== false && !user.gpsLastPingAt && (
                            <span className="text-[10px] text-muted-foreground">ללא מיקום</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-sm">
                        {(() => {
                          const isSelf = currentUser && Number(currentUser.id) === user.id;
                          return (
                            <button
                              disabled={isSelf}
                              onClick={() => {
                                if (!isSelf) {
                                  updateUserMutation.mutate({
                                    userId: user.id,
                                    data: { isSuperAdmin: !user.isSuperAdmin },
                                  }, {
                                    onSuccess: () => {
                                      toast({ title: user.isSuperAdmin ? "הרשאות מנהל הוסרו" : "הוגדר כמנהל", description: `${user.fullName || user.username}` });
                                    },
                                  });
                                }
                              }}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                user.isSuperAdmin
                                  ? "bg-blue-600 border-blue-600 text-foreground"
                                  : "border-gray-400 hover:border-blue-400"
                              } ${isSelf ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                              title={user.isSuperAdmin ? "הסר הרשאת מנהל" : "הפוך למנהל"}
                            >
                              {user.isSuperAdmin && <Check className="w-3 h-3" />}
                            </button>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeTab === "roles" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2"><Shield className="w-5 h-5" /> תפקידים והרשאות</h3>
            <Button onClick={() => openRoleForm()} className="gap-1" size="sm">
              <Plus className="w-3 h-3" />
              תפקיד חדש
            </Button>
          </div>
          <div className="grid gap-3">
            {roles.map(role => {
              const s = (role as any).settings || {};
              const assignedCount = roleAssignments.filter(a => a.roleId === role.id).length;
              const moduleCount = Object.keys(s.modules || {}).length;
              return (
                <Card key={role.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-foreground font-bold" style={{ backgroundColor: role.color || "#3b82f6" }}>
                        {(role.nameHe || role.name).charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold">{role.nameHe || role.name}</p>
                        <p className="text-xs text-muted-foreground">{role.slug} {(role as any).description ? `— ${(role as any).description}` : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <p className="text-lg font-bold">{assignedCount}</p>
                        <p className="text-[10px] text-muted-foreground">משתמשים</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold">{moduleCount}</p>
                        <p className="text-[10px] text-muted-foreground">מודולים</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {s.isSuperAdmin && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">מנהל על</span>}
                        {s.builderAccess && <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">בנאי</span>}
                      </div>
                      <button className="p-1.5 hover:bg-muted rounded" onClick={() => openRoleForm(role)}><Edit2 className="w-4 h-4" /></button>
                      {!(role as any).isSystem && (
                        <button className="p-1.5 hover:bg-red-500/10 rounded" onClick={async () => { const ok = await globalConfirm(`למחוק את "${role.nameHe || role.name}"?`); if (ok) deleteRoleMutation.mutate(role.id); }}>
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      )}
                    </div>
                  </div>
                  {moduleCount > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {Object.entries(s.modules || {}).map(([mod, perms]: [string, any]) => (
                        <span key={mod} className="text-[10px] px-2 py-0.5 rounded-full bg-muted border border-border">
                          {modules.find(m => m.slug === mod)?.nameHe || mod}
                          {perms.manage ? " (ניהול)" : " (צפייה)"}
                        </span>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
            {roles.length === 0 && (
              <Card className="p-8 text-center">
                <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">אין תפקידים מוגדרים</p>
                <Button onClick={() => openRoleForm()} className="mt-3" size="sm">צור תפקיד ראשון</Button>
              </Card>
            )}
          </div>
        </div>
      )}

      {activeTab === "company-roles" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold flex items-center gap-2"><Shield className="w-5 h-5" /> תפקידי חברה וסמכויות מנהל</h3>
              <p className="text-xs text-muted-foreground mt-0.5">סמן V ליד תפקיד כדי שכל המשתמשים עם תפקיד זה יקבלו הרשאות מנהל מערכת</p>
            </div>
          </div>
          {companyRolesLoading ? (
            <div className="text-center text-muted-foreground py-8">טוען...</div>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">תפקיד בחברה</th>
                    <th className="text-center p-3 font-medium text-xs text-muted-foreground">מספר משתמשים</th>
                    <th className="text-center p-3 font-medium text-xs text-muted-foreground">הרשאת מנהל</th>
                  </tr>
                </thead>
                <tbody>
                  {companyRoles.map((cr) => (
                    <tr key={cr.jobTitle} className="border-b border-border hover:bg-muted/20 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${cr.isAdmin ? "bg-red-400" : "bg-slate-400"}`} />
                          <span className="font-medium">{cr.jobTitle}</span>
                          {cr.isAdmin && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">מנהל</span>}
                        </div>
                      </td>
                      <td className="p-3 text-center text-muted-foreground">{cr.userCount}</td>
                      <td className="p-3 text-center">
                        <label className="flex items-center justify-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={cr.isAdmin}
                            onChange={(e) => {
                              toggleCompanyRoleAdminMutation.mutate({ jobTitle: cr.jobTitle, isAdmin: e.target.checked });
                            }}
                            disabled={toggleCompanyRoleAdminMutation.isPending}
                            className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                          />
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
            שינוי הגדרת "מנהל" לתפקיד יסנכרן מיד את כל המשתמשים עם אותו תפקיד. מנהלים מקבלים גישה מלאה לכל המערכת.
          </div>
        </div>
      )}

      {activeTab === "profiles" && (
        <div className="space-y-4">
          <h3 className="font-semibold flex items-center gap-2"><UserCheck className="w-5 h-5" /> פרופילי הרשאות משתמשים</h3>
          <div className="grid gap-3">
            {users.filter(u => u.isActive).map(user => {
              const userAssignments = roleAssignments.filter(a => a.userId === String(user.id));
              const userRoles = userAssignments.map(a => roles.find(r => r.id === a.roleId)).filter(Boolean);
              const allModules = new Set<string>();
              userRoles.forEach((r: any) => { Object.keys(r?.settings?.modules || {}).forEach(m => allModules.add(m)); });
              return (
                <Card key={user.id} className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary">
                      {user.fullName?.charAt(0) || user.username.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{user.fullName || user.username}</p>
                      <p className="text-xs text-muted-foreground">{user.department ? DEPARTMENTS.find(d => d.value === user.department)?.label : "—"} | {user.jobTitle || "—"}</p>
                    </div>
                    {user.isSuperAdmin && <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">מנהל על</span>}
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {userRoles.map((r: any) => (
                      <span key={r.id} className="text-xs px-2 py-0.5 rounded-full border" style={{ backgroundColor: `${r.color}15`, color: r.color, borderColor: `${r.color}30` }}>
                        {r.nameHe || r.name}
                      </span>
                    ))}
                    {userRoles.length === 0 && !user.isSuperAdmin && <span className="text-xs text-muted-foreground">ללא תפקידים</span>}
                  </div>
                  {allModules.size > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {Array.from(allModules).map(mod => (
                        <span key={mod} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
                          {modules.find(m => m.slug === mod)?.nameHe || mod}
                        </span>
                      ))}
                    </div>
                  )}
                  {user.isSuperAdmin && <p className="text-xs text-amber-400 mt-1">גישה מלאה לכל המערכת</p>}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "groups" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2"><Layers className="w-5 h-5" /> קבוצות עובדים</h3>
          </div>
          <div className="grid gap-3">
            {DEPARTMENTS.filter(d => d.value).map(dept => {
              const deptUsers = users.filter(u => u.department === dept.value && u.isActive);
              return (
                <Card key={dept.value} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold">{dept.label}</h4>
                    <span className="text-sm text-muted-foreground">{deptUsers.length} עובדים</span>
                  </div>
                  {deptUsers.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {deptUsers.map(u => (
                        <div key={u.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/30 text-sm">
                          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                            {u.fullName?.charAt(0) || "?"}
                          </div>
                          {u.fullName || u.username}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">אין עובדים במחלקה</p>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "service" && (
        <div className="space-y-4">
          <h3 className="font-semibold flex items-center gap-2"><Settings className="w-5 h-5" /> כללי שירות והרשאות</h3>
          <div className="grid gap-3">
            <Card className="p-4">
              <h4 className="font-semibold mb-3">מדיניות סיסמאות</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                  <span>אורך סיסמה מינימלי</span>
                  <span className="font-mono font-semibold">6 תווים</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                  <span>הצפנת סיסמאות</span>
                  <span className="font-mono font-semibold text-green-400">PBKDF2-SHA512</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                  <span>הרשמה ציבורית</span>
                  <span className="font-semibold text-red-400">מנוטרלת</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                  <span>כניסה עם Google</span>
                  <span className="font-semibold text-muted-foreground">לפי הגדרת Client ID</span>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <h4 className="font-semibold mb-3">הגבלות גישה</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                  <span>Rate Limiting - כניסה</span>
                  <span className="font-mono font-semibold">10 נסיונות / 15 דקות</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                  <span>Rate Limiting - API</span>
                  <span className="font-mono font-semibold">500 בקשות / 15 דקות</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                  <span>Session Token</span>
                  <span className="font-mono font-semibold">Secure Random 48-byte</span>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <h4 className="font-semibold mb-3">סטטיסטיקות מערכת</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="p-3 rounded-lg bg-muted/20">
                  <p className="text-lg sm:text-2xl font-bold">{users.length}</p>
                  <p className="text-xs text-muted-foreground">סה"כ משתמשים</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/20">
                  <p className="text-lg sm:text-2xl font-bold">{users.filter(u => u.isActive).length}</p>
                  <p className="text-xs text-muted-foreground">פעילים</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/20">
                  <p className="text-lg sm:text-2xl font-bold">{roles.length}</p>
                  <p className="text-xs text-muted-foreground">תפקידים</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/20">
                  <p className="text-lg sm:text-2xl font-bold">{users.filter(u => u.isSuperAdmin).length}</p>
                  <p className="text-xs text-muted-foreground">מנהלי על</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <Card className="p-3 sm:p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            היסטוריית התחברות
          </h3>
          <div className="space-y-2">
            {users.filter(u => u.lastLoginAt).sort((a, b) => new Date(b.lastLoginAt!).getTime() - new Date(a.lastLoginAt!).getTime()).map((u) => (
              <div key={u.id} className="flex items-center gap-3 p-2 bg-muted/20 rounded-lg text-sm">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                  {u.fullName?.charAt(0) || "?"}
                </div>
                <span className="font-medium">{u.fullName}</span>
                <span className="text-muted-foreground">—</span>
                <span className="text-muted-foreground">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("he-IL") : "—"}</span>
                <span className="text-xs text-muted-foreground mr-auto">{u.loginCount} התחברויות</span>
              </div>
            ))}
            {users.filter(u => u.lastLoginAt).length === 0 && (
              <p className="text-center text-muted-foreground py-8">אין היסטוריית התחברות</p>
            )}
          </div>
        </Card>
      )}

      {activeTab === "pricing" && (
        <div className="space-y-4">
          <h3 className="font-semibold flex items-center gap-2"><Lock className="w-5 h-5" /> מטריצת הרשאות מודולים</h3>
          <p className="text-sm text-muted-foreground">הצגת הרשאות כל תפקיד לפי מודולי המערכת</p>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-right p-2 font-medium min-w-[140px] sticky right-0 bg-muted/30">מודול</th>
                    {roles.map(r => (
                      <th key={r.id} className="p-2 font-medium text-center min-w-[100px]">
                        <span className="inline-block px-2 py-0.5 rounded-full text-foreground" style={{ backgroundColor: r.color || "#3b82f6" }}>
                          {r.nameHe || r.name}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modules.filter(m => m.isActive).map(mod => (
                    <tr key={mod.id} className="border-b border-border/50 hover:bg-muted/10">
                      <td className="p-2 font-medium sticky right-0 bg-background">{mod.nameHe || mod.name || mod.slug}</td>
                      {roles.map(r => {
                        const s = (r as any).settings || {};
                        const mp = s.modules?.[mod.slug];
                        if (s.isSuperAdmin) return <td key={r.id} className="p-2 text-center"><span className="text-green-400 font-bold">Full</span></td>;
                        if (!mp) return <td key={r.id} className="p-2 text-center"><X className="w-3.5 h-3.5 text-red-400/50 mx-auto" /></td>;
                        return (
                          <td key={r.id} className="p-2 text-center">
                            <div className="flex items-center justify-center gap-0.5 flex-wrap">
                              {mp.view && <span className="px-1 py-0.5 rounded bg-blue-500/10 text-blue-400" title="צפייה">V</span>}
                              {mp.manage && <span className="px-1 py-0.5 rounded bg-green-500/10 text-green-400" title="ניהול">M</span>}
                              {mp.create && <span className="px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400" title="יצירה">C</span>}
                              {mp.edit && <span className="px-1 py-0.5 rounded bg-amber-500/10 text-amber-400" title="עריכה">E</span>}
                              {mp.delete && <span className="px-1 py-0.5 rounded bg-red-500/10 text-red-400" title="מחיקה">D</span>}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">V</span> צפייה (View)</span>
            <span className="flex items-center gap-1"><span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">M</span> ניהול (Manage)</span>
            <span className="flex items-center gap-1"><span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">C</span> יצירה (Create)</span>
            <span className="flex items-center gap-1"><span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">E</span> עריכה (Edit)</span>
            <span className="flex items-center gap-1"><span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">D</span> מחיקה (Delete)</span>
          </div>
        </div>
      )}

      {editingUser && (
        <Modal isOpen={!!editingUser} onClose={() => setEditingUser(null)} title={`עריכת משתמש — ${editingUser.fullName || editingUser.username}`}>
          <div className="space-y-4 p-4">
            <div>
              <Label>שם מלא</Label>
              <Input value={editForm.fullName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm(p => ({...p, fullName: e.target.value}))} className="mt-1" />
            </div>
            <div>
              <Label>דואר אלקטרוני</Label>
              <Input type="email" value={editForm.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm(p => ({...p, email: e.target.value}))} className="mt-1" />
            </div>
            <div>
              <Label>טלפון</Label>
              <Input value={editForm.phone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm(p => ({...p, phone: e.target.value}))} className="mt-1" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>תפקיד</Label>
                <Input value={editForm.jobTitle} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm(p => ({...p, jobTitle: e.target.value}))} className="mt-1" />
              </div>
              <div>
                <Label>מחלקה</Label>
                <select
                  value={editForm.department}
                  onChange={(e) => setEditForm(p => ({...p, department: e.target.value}))}
                  className="mt-1 flex h-12 w-full rounded-xl border border-border bg-background px-4 py-2 text-sm"
                >
                  {DEPARTMENTS.map(d => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label>תפקידי הרשאות</Label>
              <div className="mt-1 space-y-1.5 max-h-40 overflow-y-auto border border-border rounded-xl p-2">
                {roles.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">אין תפקידים מוגדרים</p>
                ) : roles.map(r => (
                  <label key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.roleIds.includes(r.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setEditForm(p => ({ ...p, roleIds: [...p.roleIds, r.id] }));
                        } else {
                          setEditForm(p => ({ ...p, roleIds: p.roleIds.filter(id => id !== r.id) }));
                        }
                      }}
                      className="rounded border-border"
                    />
                    <span className="text-sm">{r.nameHe || r.name}</span>
                    <span className="text-xs text-muted-foreground mr-auto" dir="ltr">{r.slug}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-superadmin"
                checked={editForm.isSuperAdmin}
                onChange={(e) => setEditForm(p => ({...p, isSuperAdmin: e.target.checked}))}
                className="rounded"
              />
              <Label htmlFor="edit-superadmin">מנהל מערכת (Super Admin)</Label>
            </div>
            <div className="border-t border-border/50 pt-4">
              <Label className="flex items-center gap-2">
                <Key className="w-4 h-4" />
                איפוס סיסמה
              </Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={editForm.newPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm(p => ({...p, newPassword: e.target.value}))}
                className="mt-1"
                placeholder="השאר ריק אם לא רוצה לשנות"
              />
              {editForm.newPassword && editForm.newPassword.length < 6 && (
                <p className="text-xs text-red-400 mt-1">סיסמה חייבת להכיל לפחות 6 תווים</p>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                onClick={async () => {
                  try {
                    const data: Record<string, unknown> = {
                      fullName: editForm.fullName,
                      email: editForm.email,
                      phone: editForm.phone,
                      department: editForm.department,
                      jobTitle: editForm.jobTitle,
                      isSuperAdmin: editForm.isSuperAdmin,
                    };
                    if (editForm.newPassword && editForm.newPassword.length >= 6) {
                      data.password = editForm.newPassword;
                    }
                    const userRes = await fetch(`${API_BASE}/auth/users/${editingUser.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify(data),
                    });
                    if (!userRes.ok) {
                      const e = await userRes.json().catch(() => ({}));
                      toast({ title: "שגיאה", description: e.error || "שגיאה בעדכון משתמש", variant: "destructive" });
                      return;
                    }
                    const currentRoleIds = roleAssignments.filter(a => a.userId === String(editingUser.id)).map(a => a.roleId);
                    const rolesChanged = editForm.roleIds.length !== currentRoleIds.length ||
                      editForm.roleIds.some(id => !currentRoleIds.includes(id));
                    if (rolesChanged) {
                      const existingAssignments = roleAssignments.filter(a => a.userId === String(editingUser.id));
                      for (const existing of existingAssignments) {
                        if (!editForm.roleIds.includes(existing.roleId)) {
                          const res = await fetch(`${API_BASE}/platform/role-assignments/${existing.id}`, {
                            method: "DELETE",
                            headers: { Authorization: `Bearer ${token}` },
                          });
                          if (!res.ok) throw new Error("שגיאה בהסרת תפקיד");
                        }
                      }
                      const existingRoleIds = existingAssignments.map(a => a.roleId);
                      for (const roleId of editForm.roleIds) {
                        if (!existingRoleIds.includes(roleId)) {
                          const res = await fetch(`${API_BASE}/platform/role-assignments`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ roleId, userId: String(editingUser.id), assignedBy: currentUser?.username }),
                          });
                          if (!res.ok) throw new Error("שגיאה בשיוך תפקיד");
                        }
                      }
                    }
                    queryClient.invalidateQueries({ queryKey: ["all-users"] });
                    queryClient.invalidateQueries({ queryKey: ["role-assignments"] });
                    queryClient.invalidateQueries({ queryKey: ["my-permissions"] });
                    toast({ title: "משתמש עודכן בהצלחה" });
                    setEditingUser(null);
                  } catch (err: any) {
                    toast({ title: "שגיאה", description: err.message || "שגיאה בעדכון", variant: "destructive" });
                  }
                }}
                disabled={updateUserMutation.isPending || assignRolesMutation.isPending || (editForm.newPassword.length > 0 && editForm.newPassword.length < 6)}
              >
                {(updateUserMutation.isPending || assignRolesMutation.isPending) ? "שומר..." : "שמור שינויים"}
              </Button>
              <Button variant="outline" onClick={() => setEditingUser(null)}>ביטול</Button>
            </div>
          </div>
        </Modal>
      )}

      {showRoleModal && (
        <Modal isOpen={showRoleModal} onClose={() => { setShowRoleModal(false); setEditingRole(null); }} title={editingRole ? `עריכת תפקיד — ${editingRole.nameHe || editingRole.name}` : "תפקיד חדש"} size="lg">
          <div className="space-y-4 p-4 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>שם תפקיד (עברית) *</Label>
                <Input value={roleForm.nameHe} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRoleForm(p => ({...p, nameHe: e.target.value}))} className="mt-1" placeholder="מנהל מכירות" />
              </div>
              <div>
                <Label>שם תפקיד (אנגלית) *</Label>
                <Input value={roleForm.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRoleForm(p => ({...p, name: e.target.value}))} className="mt-1" placeholder="Sales Manager" dir="ltr" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Slug *</Label>
                <Input value={roleForm.slug} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRoleForm(p => ({...p, slug: e.target.value}))} className="mt-1" placeholder="sales-manager" dir="ltr" />
              </div>
              <div>
                <Label>צבע</Label>
                <div className="flex items-center gap-2 mt-1">
                  <input type="color" value={roleForm.color} onChange={(e) => setRoleForm(p => ({...p, color: e.target.value}))} className="w-10 h-10 rounded cursor-pointer border-0" />
                  <Input value={roleForm.color} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRoleForm(p => ({...p, color: e.target.value}))} className="flex-1" dir="ltr" />
                </div>
              </div>
            </div>
            <div>
              <Label>תיאור</Label>
              <Input value={roleForm.description} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRoleForm(p => ({...p, description: e.target.value}))} className="mt-1" placeholder="תיאור התפקיד" />
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={roleForm.isSuperAdmin} onChange={(e) => setRoleForm(p => ({...p, isSuperAdmin: e.target.checked}))} className="rounded" />
                <span className="text-sm">מנהל על (Super Admin)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={roleForm.builderAccess} onChange={(e) => setRoleForm(p => ({...p, builderAccess: e.target.checked}))} className="rounded" />
                <span className="text-sm">גישה לבנאי (Builder)</span>
              </label>
            </div>
            {!roleForm.isSuperAdmin && (
              <div>
                <Label className="flex items-center gap-2 mb-2"><Shield className="w-4 h-4" /> הרשאות מודולים מסודרות לפי נושאים</Label>
                <div className="border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border">
                        <th className="text-right p-2 font-medium">מודול</th>
                        <th className="p-2 text-center font-medium">צפייה</th>
                        <th className="p-2 text-center font-medium">ניהול</th>
                        <th className="p-2 text-center font-medium">יצירה</th>
                        <th className="p-2 text-center font-medium">עריכה</th>
                        <th className="p-2 text-center font-medium">מחיקה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modules.filter(m => m.isActive).map(mod => {
                        const mp = roleForm.modulePerms[mod.slug] || { view: false, manage: false, create: false, edit: false, delete: false };
                        return (
                          <tr key={mod.id} className="border-b border-border/30 hover:bg-muted/10">
                            <td className="p-2 font-medium">{mod.nameHe || mod.name || mod.slug}</td>
                            {(["view", "manage", "create", "edit", "delete"] as const).map(perm => (
                              <td key={perm} className="p-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => toggleModulePerm(mod.slug, perm)}
                                  className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${mp[perm] ? "bg-green-500/20 text-green-400" : "bg-muted/30 text-muted-foreground/30 hover:bg-muted/50"}`}
                                >
                                  {mp[perm] ? <Check className="w-3.5 h-3.5" /> : <X className="w-3 h-3" />}
                                </button>
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {roleForm.isSuperAdmin && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
                מנהל על מקבל גישה מלאה לכל המודולים אוטומטית
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => createRoleMutation.mutate(roleForm)}
                disabled={!roleForm.name || !roleForm.slug || createRoleMutation.isPending}
              >
                {createRoleMutation.isPending ? "שומר..." : (editingRole ? "עדכן תפקיד" : "צור תפקיד")}
              </Button>
              <Button variant="outline" onClick={() => { setShowRoleModal(false); setEditingRole(null); }}>ביטול</Button>
            </div>
          </div>
        </Modal>
      )}

      {showAddModal && (
        <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="הוסף משתמש חדש" size="lg">
          <div className="space-y-4 p-4 max-h-[70vh] overflow-y-auto">
            <div>
              <Label>שם משתמש *</Label>
              <Input value={newUser.username} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewUser(p => ({...p, username: e.target.value}))} className="mt-1" />
            </div>
            <div>
              <Label>סיסמה *</Label>
              <Input type="password" autoComplete="new-password" value={newUser.password} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewUser(p => ({...p, password: e.target.value}))} className="mt-1" placeholder="לפחות 6 תווים" />
              {newUser.password && newUser.password.length < 6 && (
                <p className="text-xs text-red-400 mt-1">סיסמה חייבת להכיל לפחות 6 תווים</p>
              )}
            </div>
            <div>
              <Label>שם מלא *</Label>
              <Input value={newUser.fullName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewUser(p => ({...p, fullName: e.target.value}))} className="mt-1" required />
            </div>
            <div>
              <Label>דואר אלקטרוני *</Label>
              <Input type="email" value={newUser.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewUser(p => ({...p, email: e.target.value}))} className="mt-1" required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>תפקיד</Label>
                <Input value={newUser.jobTitle} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewUser(p => ({...p, jobTitle: e.target.value}))} className="mt-1" />
              </div>
              <div>
                <Label>מחלקה</Label>
                <select
                  value={newUser.department}
                  onChange={(e) => setNewUser(p => ({...p, department: e.target.value}))}
                  className="mt-1 flex h-12 w-full rounded-xl border border-border bg-background px-4 py-2 text-sm"
                >
                  {DEPARTMENTS.map(d => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label>תפקידי הרשאות</Label>
              <div className="mt-1 space-y-1.5 max-h-40 overflow-y-auto border border-border rounded-xl p-2">
                {roles.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">אין תפקידים מוגדרים</p>
                ) : roles.map(r => (
                  <label key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(newUser.roleIds || []).includes(r.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewUser(p => ({ ...p, roleIds: [...(p.roleIds || []), r.id] }));
                        } else {
                          setNewUser(p => ({ ...p, roleIds: (p.roleIds || []).filter(id => id !== r.id) }));
                        }
                      }}
                      className="rounded border-border"
                    />
                    <span className="text-sm">{r.nameHe || r.name}</span>
                    <span className="text-xs text-muted-foreground mr-auto" dir="ltr">{r.slug}</span>
                  </label>
                ))}
              </div>
            </div>
            {(currentUser as any)?.isSuperAdmin && (
              <div>
                <Label>האם המשתמש הוא מנהל מערכת?</Label>
                <div className="flex gap-2 mt-1">
                  <Button
                    type="button"
                    variant={newUser.isSuperAdmin ? "default" : "outline"}
                    size="sm"
                    onClick={() => setNewUser(p => ({...p, isSuperAdmin: true}))}
                  >
                    כן
                  </Button>
                  <Button
                    type="button"
                    variant={!newUser.isSuperAdmin ? "default" : "outline"}
                    size="sm"
                    onClick={() => setNewUser(p => ({...p, isSuperAdmin: false}))}
                  >
                    לא
                  </Button>
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button onClick={() => createUserMutation.mutate(newUser)} disabled={!newUser.username || !newUser.password || newUser.password.length < 6 || !newUser.fullName || !newUser.email || createUserMutation.isPending}>
                {createUserMutation.isPending ? "יוצר..." : "צור משתמש"}
              </Button>
              <Button variant="outline" onClick={() => setShowAddModal(false)}>ביטול</Button>
            </div>
          </div>
        </Modal>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="user-management" />
        <RelatedRecords entityType="user-management" />
      </div>
    </div>
  );
}
