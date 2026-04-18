import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import {
  Plus, Trash2, Edit2, ShieldCheck, ChevronLeft, X,
  Users, Shield, Check, Minus, Settings, Eye, FilePlus, Pencil,
  Copy, GitBranch, ChevronRight, ChevronDown
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

interface Role {
  id: number;
  name: string;
  nameHe: string | null;
  slug: string;
  description: string | null;
  color: string;
  isSystem: boolean;
  isActive: boolean;
  parentRoleId: number | null;
  priority: number;
  settings: RoleSettings | null;
}

interface RoleSettings {
  isSuperAdmin?: boolean;
  builderAccess?: boolean;
  department?: string;
  modules: Record<string, ModulePermSetting>;
  entities: Record<string, EntityPermSetting>;
  fields: Record<string, Record<string, string>>;
  actions: Record<string, { execute: boolean }>;
}

interface ModulePermSetting {
  view: boolean;
  manage: boolean;
  create?: boolean;
  edit?: boolean;
  delete?: boolean;
}

interface EntityPermSetting {
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
}

const CRUD_ACTIONS = [
  { key: "view", label: "צפייה", icon: Eye },
  { key: "create", label: "יצירה", icon: FilePlus },
  { key: "edit", label: "עריכה", icon: Pencil },
  { key: "delete", label: "מחיקה", icon: Trash2 },
];

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

export default function PermissionsBuilderPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"roles" | "matrix" | "hierarchy">("roles");
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["platform-roles"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/roles`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { modules } = usePlatformModules();
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;

  const { data: users = [] } = useQuery({
    queryKey: ["platform-users-for-roles"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/users`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: roleAssignments = [] } = useQuery<{ id: number; roleId: number; userId: string }[]>({
    queryKey: ["role-assignments-all"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/role-assignments`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const createRoleMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/roles`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create role");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["platform-roles"] }); setShowCreateRole(false); },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await authFetch(`${API}/platform/roles/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update role");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["platform-roles"] }); setEditingRole(null); },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/platform/roles/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-roles"] }),
  });

  const cloneRoleMutation = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/platform/roles/${id}/clone`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-roles"] }),
  });

  const setParentRoleMutation = useMutation({
    mutationFn: ({ id, parentRoleId }: { id: number; parentRoleId: number | null }) => authFetch(`${API}/platform/roles/${id}/parent`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentRoleId }),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-roles"] }),
  });

  const getUserCountForRole = (roleId: number) => {
    return roleAssignments.filter(a => a.roleId === roleId).length;
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/builder" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />בונה הפלטפורמה
        </Link>
        <span>/</span><span className="text-foreground">ניהול הרשאות</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-red-400" />ניהול הרשאות
          </h1>
          <p className="text-muted-foreground mt-1">RBAC — ניהול תפקידים, הרשאות CRUD לכל מודול, שיוך משתמשים</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => setActiveTab("roles")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === "roles" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
          <Users className="w-4 h-4 inline mr-1" />תפקידים ({roles.length})
        </button>
        <button onClick={() => setActiveTab("matrix")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === "matrix" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
          <Shield className="w-4 h-4 inline mr-1" />מטריצת הרשאות
        </button>
        <button onClick={() => setActiveTab("hierarchy")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === "hierarchy" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
          <GitBranch className="w-4 h-4 inline mr-1" />היררכיית תפקידים
        </button>
      </div>

      {activeTab === "roles" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowCreateRole(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-5 h-5" />תפקיד חדש
            </button>
          </div>
          {roles.length === 0 ? (
            <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
              <Users className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">אין תפקידים</h3>
              <p className="text-muted-foreground mb-4">הגדר תפקידים ובנה מטריצת הרשאות</p>
              <button onClick={() => setShowCreateRole(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
                <Plus className="w-4 h-4" />תפקיד חדש
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {roles.map((role, i) => {
                const userCount = getUserCountForRole(role.id);
                const settings = role.settings;
                const moduleCount = Object.keys(settings?.modules || {}).filter(k => settings?.modules[k]?.view).length;
                return (
                  <motion.div key={role.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                    className={`bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all ${!role.isActive ? "opacity-60" : ""}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${role.color || "#6b7280"}20`, color: role.color || "#6b7280" }}>
                          <Shield className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{role.nameHe || role.name}</h3>
                          <p className="text-xs text-muted-foreground">{role.slug}</p>
                        </div>
                      </div>
                      {role.isSystem && <span className="text-xs px-1.5 py-0.5 bg-orange-500/10 text-orange-400 rounded-md">מערכת</span>}
                    </div>
                    {role.description && <p className="text-sm text-muted-foreground mb-3">{role.description}</p>}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{userCount} משתמשים</span>
                      <span className="flex items-center gap-1"><Settings className="w-3.5 h-3.5" />{moduleCount} מודולים</span>
                    </div>
                    {role.parentRoleId && (
                      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                        <GitBranch className="w-3 h-3" />
                        יורש מ: {roles.find(r => r.id === role.parentRoleId)?.nameHe || roles.find(r => r.id === role.parentRoleId)?.name}
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-3 border-t border-border/50">
                      <button onClick={() => setEditingRole(role)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium hover:bg-primary/20 transition-colors">
                        <Edit2 className="w-4 h-4" />עריכה
                      </button>
                      <button onClick={() => cloneRoleMutation.mutate(role.id)} title="שכפל תפקיד" className="p-2 hover:bg-blue-500/10 rounded-lg transition-colors" disabled={cloneRoleMutation.isPending}>
                        <Copy className="w-4 h-4 text-blue-400" />
                      </button>
                      {!role.isSystem && isSuperAdmin && (
                        <button onClick={async () => { const ok = await globalConfirm("למחוק תפקיד זה?"); if (ok) deleteRoleMutation.mutate(role.id); }} className="p-2 hover:bg-destructive/10 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "matrix" && (
        <PermissionMatrix roles={roles} modules={modules} onUpdateRole={(id, settings) => {
          updateRoleMutation.mutate({ id, settings });
        }} />
      )}

      {activeTab === "hierarchy" && (
        <RoleHierarchyView roles={roles} onSetParent={(childId, parentId) => setParentRoleMutation.mutate({ id: childId, parentRoleId: parentId })} />
      )}

      <AnimatePresence>
        {(showCreateRole || editingRole) && (
          <RoleFormModal
            role={editingRole}
            modules={modules}
            onClose={() => { setShowCreateRole(false); setEditingRole(null); }}
            onSubmit={(data) => {
              if (editingRole) updateRoleMutation.mutate({ id: editingRole.id, ...data });
              else createRoleMutation.mutate(data);
            }}
            isLoading={createRoleMutation.isPending || updateRoleMutation.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function RoleHierarchyView({ roles, onSetParent }: {
  roles: Role[];
  onSetParent: (childId: number, parentId: number | null) => void;
}) {
  const [expandedRoles, setExpandedRoles] = useState<Set<number>>(new Set());
  const [editingParent, setEditingParent] = useState<number | null>(null);

  const rootRoles = roles.filter(r => !r.parentRoleId);
  const getChildren = (parentId: number) => roles.filter(r => r.parentRoleId === parentId);

  const toggleExpand = (id: number) => {
    setExpandedRoles(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderRoleNode = (role: Role, depth: number = 0): React.ReactNode => {
    const children = getChildren(role.id);
    const isExpanded = expandedRoles.has(role.id);
    const hasChildren = children.length > 0;

    return (
      <div key={role.id} className="select-none">
        <div
          className={`flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-muted/40 transition-colors group`}
          style={{ paddingRight: `${depth * 24 + 12}px` }}
        >
          {hasChildren ? (
            <button onClick={() => toggleExpand(role.id)} className="w-4 h-4 flex items-center justify-center">
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
          ) : <span className="w-4" />}

          <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${role.color || "#6b7280"}20`, color: role.color || "#6b7280" }}>
            <Shield className="w-3.5 h-3.5" />
          </div>
          <span className="font-medium text-sm flex-1">{role.nameHe || role.name}</span>
          {role.isSystem && <span className="text-xs px-1.5 py-0.5 bg-orange-500/10 text-orange-400 rounded-md">מערכת</span>}
          {!role.isActive && <span className="text-xs px-1.5 py-0.5 bg-slate-500/10 text-slate-400 rounded-md">לא פעיל</span>}
          {hasChildren && <span className="text-xs text-muted-foreground">{children.length} תפקידי-בן</span>}

          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
            {editingParent === role.id ? (
              <select
                className="text-xs border border-border rounded px-1 py-0.5 bg-background"
                defaultValue={role.parentRoleId || ""}
                onChange={(e) => {
                  onSetParent(role.id, e.target.value ? Number(e.target.value) : null);
                  setEditingParent(null);
                }}
                onBlur={() => setEditingParent(null)}
                autoFocus
              >
                <option value="">— ללא הורה —</option>
                {roles.filter(r => r.id !== role.id).map(r => (
                  <option key={r.id} value={r.id}>{r.nameHe || r.name}</option>
                ))}
              </select>
            ) : (
              <button
                onClick={() => setEditingParent(role.id)}
                className="text-xs px-2 py-0.5 border border-border rounded hover:bg-muted transition-colors"
              >
                שנה הורה
              </button>
            )}
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div className="border-r border-border/50 mr-5">
            {children.map(child => renderRoleNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-border/50 flex items-center gap-2">
        <GitBranch className="w-5 h-5 text-primary" />
        <div>
          <h3 className="font-semibold">היררכיית תפקידים</h3>
          <p className="text-sm text-muted-foreground">תפקידי-בן יורשים הרשאות מתפקיד ההורה. לחץ על שורה כדי לשנות הורה.</p>
        </div>
      </div>
      <div className="p-4 space-y-1">
        {rootRoles.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">אין תפקידים מוגדרים</div>
        ) : (
          rootRoles.map(role => renderRoleNode(role, 0))
        )}
        {roles.filter(r => r.parentRoleId && !roles.find(p => p.id === r.parentRoleId)).map(role => (
          <div key={role.id} className="flex items-center gap-2 py-2 px-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
            <Shield className="w-4 h-4 text-yellow-400" />
            <span className="text-sm">{role.nameHe || role.name}</span>
            <span className="text-xs text-yellow-400">הורה חסר</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PermissionMatrix({ roles, modules, onUpdateRole }: {
  roles: Role[];
  modules: any[];
  onUpdateRole: (roleId: number, settings: RoleSettings) => void;
}) {
  const activeRoles = roles.filter(r => r.isActive);

  const getModulePerm = (role: Role, moduleSlug: string, action: string): boolean => {
    const settings = role.settings;
    if (!settings?.modules) return false;
    const mp = settings.modules[moduleSlug];
    if (!mp) return false;
    if (action === "view") return mp.view || mp.manage;
    if (mp.manage) return true;
    if (action === "create") return mp.create ?? false;
    if (action === "edit") return mp.edit ?? false;
    if (action === "delete") return mp.delete ?? false;
    return false;
  };

  const toggleModulePerm = (role: Role, moduleSlug: string, action: string) => {
    const settings: RoleSettings = {
      isSuperAdmin: role.settings?.isSuperAdmin ?? false,
      builderAccess: role.settings?.builderAccess ?? false,
      department: role.settings?.department,
      modules: { ...(role.settings?.modules || {}) },
      entities: { ...(role.settings?.entities || {}) },
      fields: { ...(role.settings?.fields || {}) },
      actions: { ...(role.settings?.actions || {}) },
    };

    const current = settings.modules[moduleSlug] || { view: false, manage: false, create: false, edit: false, delete: false };
    const newPerm = { ...current };

    if (action === "view") {
      newPerm.view = !current.view;
      if (!newPerm.view) {
        newPerm.manage = false;
        newPerm.create = false;
        newPerm.edit = false;
        newPerm.delete = false;
      }
    } else if (action === "create") {
      newPerm.create = !(current.create ?? false);
      if (newPerm.create && !newPerm.view) newPerm.view = true;
    } else if (action === "edit") {
      newPerm.edit = !(current.edit ?? false);
      if (newPerm.edit && !newPerm.view) newPerm.view = true;
    } else if (action === "delete") {
      newPerm.delete = !(current.delete ?? false);
      if (newPerm.delete && !newPerm.view) newPerm.view = true;
    }

    settings.modules[moduleSlug] = newPerm;
    onUpdateRole(role.id, settings);
  };

  if (activeRoles.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-12 text-center">
        <Shield className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
        <p className="text-muted-foreground">צור תפקידים כדי לבנות מטריצת הרשאות</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-right px-4 py-3 font-semibold sticky right-0 bg-muted/30 z-10 min-w-[180px]">
              מודול
            </th>
            {activeRoles.map(role => (
              <th key={role.id} colSpan={4} className="text-center px-2 py-3 font-semibold border-r border-border">
                <span style={{ color: role.color || "#6b7280" }}>{role.nameHe || role.name}</span>
              </th>
            ))}
          </tr>
          <tr className="border-b border-border bg-muted/20">
            <th className="sticky right-0 bg-muted/20 z-10"></th>
            {activeRoles.map(role => (
              CRUD_ACTIONS.map(action => (
                <th key={`${role.id}-${action.key}`} className="text-center px-1 py-2 text-xs text-muted-foreground font-normal whitespace-nowrap">
                  {action.label}
                </th>
              ))
            ))}
          </tr>
        </thead>
        <tbody>
          {modules.map((mod: any) => (
            <tr key={mod.id} className="border-b border-border/50 hover:bg-muted/10">
              <td className="px-4 py-2.5 font-medium sticky right-0 bg-card z-10">
                <div className="flex items-center gap-2">
                  <span>{mod.nameHe || mod.name}</span>
                </div>
              </td>
              {activeRoles.map(role => (
                CRUD_ACTIONS.map(action => {
                  const allowed = getModulePerm(role, mod.slug, action.key);
                  const isSuperAdminRole = role.settings?.isSuperAdmin;
                  return (
                    <td key={`${role.id}-${mod.id}-${action.key}`} className="text-center px-1 py-2">
                      {isSuperAdminRole ? (
                        <div className="w-6 h-6 rounded-md flex items-center justify-center bg-green-500/20 text-green-400 mx-auto">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      ) : (
                        <button
                          onClick={() => toggleModulePerm(role, mod.slug, action.key)}
                          disabled={role.isSystem}
                          className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors mx-auto ${
                            allowed
                              ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                              : "bg-muted/50 text-muted-foreground hover:bg-muted"
                          } ${role.isSystem ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          {allowed ? <Check className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </td>
                  );
                })
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoleFormModal({ role, modules, onClose, onSubmit, isLoading }: {
  role: Role | null;
  modules: any[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const existingSettings = role?.settings || { modules: {}, entities: {}, fields: {}, actions: {} };

  const [form, setForm] = useState({
    name: role?.name || "",
    nameHe: role?.nameHe || "",
    slug: role?.slug || "",
    description: role?.description || "",
    color: role?.color || "#3b82f6",
    department: role?.settings?.department || "",
    isActive: role?.isActive ?? true,
  });

  const [modulePerms, setModulePerms] = useState<Record<string, ModulePermSetting>>(() => {
    if (role && existingSettings.modules && Object.keys(existingSettings.modules).length > 0) {
      return existingSettings.modules;
    }
    const defaults: Record<string, ModulePermSetting> = {};
    for (const mod of modules) {
      defaults[mod.slug] = { view: true, manage: false, create: false, edit: false, delete: false };
    }
    return { ...defaults, ...(existingSettings.modules || {}) };
  });

  const [activeSection, setActiveSection] = useState<"general" | "permissions">("general");

  const autoSlug = (n: string) => n.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#6b7280"];

  const toggleModulePerm = (moduleSlug: string, action: string) => {
    setModulePerms(prev => {
      const current = prev[moduleSlug] || { view: false, manage: false, create: false, edit: false, delete: false };
      const newPerm = { ...current };

      if (action === "view") {
        newPerm.view = !current.view;
        if (!newPerm.view) {
          newPerm.manage = false;
          newPerm.create = false;
          newPerm.edit = false;
          newPerm.delete = false;
        }
      } else if (action === "create") {
        newPerm.create = !(current.create ?? false);
        if (newPerm.create && !newPerm.view) newPerm.view = true;
      } else if (action === "edit") {
        newPerm.edit = !(current.edit ?? false);
        if (newPerm.edit && !newPerm.view) newPerm.view = true;
      } else if (action === "delete") {
        newPerm.delete = !(current.delete ?? false);
        if (newPerm.delete && !newPerm.view) newPerm.view = true;
      }

      return { ...prev, [moduleSlug]: newPerm };
    });
  };

  const setAllPermsForModule = (moduleSlug: string, enable: boolean) => {
    setModulePerms(prev => ({
      ...prev,
      [moduleSlug]: {
        view: enable,
        manage: false,
        create: enable,
        edit: enable,
        delete: enable,
      },
    }));
  };

  const handleSubmit = () => {
    const settings: RoleSettings = {
      isSuperAdmin: existingSettings.isSuperAdmin ?? false,
      builderAccess: existingSettings.builderAccess ?? false,
      department: form.department || undefined,
      modules: modulePerms,
      entities: existingSettings.entities || {},
      fields: existingSettings.fields || {},
      actions: existingSettings.actions || {},
    };

    const { department, ...formData } = form;
    onSubmit({
      ...formData,
      settings,
    });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-border flex items-center justify-between">
          <h2 className="text-xl font-bold">{role ? "עריכת תפקיד" : "תפקיד חדש"}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex border-b border-border">
          <button onClick={() => setActiveSection("general")}
            className={`flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeSection === "general" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            פרטים כלליים
          </button>
          <button onClick={() => setActiveSection("permissions")}
            className={`flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeSection === "permissions" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            הרשאות מודולים
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeSection === "general" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">שם (עברית) *</label>
                  <input value={form.nameHe || form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, nameHe: e.target.value, ...(!role ? { slug: autoSlug(e.target.value) } : {}) }))}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Slug *</label>
                  <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} dir="ltr"
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">תיאור</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">מחלקה</label>
                <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  {DEPARTMENTS.map(d => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">צבע</label>
                <div className="flex gap-2">
                  {COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={`w-8 h-8 rounded-lg border-2 transition-all ${form.color === c ? "border-white scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                <span className="text-sm">פעיל</span>
              </label>
            </div>
          )}

          {activeSection === "permissions" && (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground mb-4">סמן אילו הרשאות יהיו לתפקיד זה בכל מודול: צפייה, יצירה, עריכה ומחיקה</p>
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="text-right px-4 py-2.5 font-semibold">מודול</th>
                      {CRUD_ACTIONS.map(a => (
                        <th key={a.key} className="text-center px-2 py-2.5 font-medium text-xs">{a.label}</th>
                      ))}
                      <th className="text-center px-2 py-2.5 font-medium text-xs">הכל</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((mod: any) => {
                      const mp = modulePerms[mod.slug] || { view: false, manage: false, create: false, edit: false, delete: false };
                      const allEnabled = mp.view && (mp.create ?? false) && (mp.edit ?? false) && (mp.delete ?? false);
                      return (
                        <tr key={mod.id} className="border-b border-border/50 hover:bg-muted/10">
                          <td className="px-4 py-2 font-medium">{mod.nameHe || mod.name}</td>
                          {CRUD_ACTIONS.map(action => {
                            let isOn = false;
                            if (action.key === "view") isOn = mp.view;
                            else if (action.key === "create") isOn = mp.create ?? false;
                            else if (action.key === "edit") isOn = mp.edit ?? false;
                            else if (action.key === "delete") isOn = mp.delete ?? false;
                            return (
                              <td key={action.key} className="text-center px-2 py-2">
                                <button onClick={() => toggleModulePerm(mod.slug, action.key)}
                                  className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors mx-auto ${
                                    isOn ? "bg-green-500/20 text-green-400" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                                  }`}>
                                  {isOn ? <Check className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                                </button>
                              </td>
                            );
                          })}
                          <td className="text-center px-2 py-2">
                            <button onClick={() => setAllPermsForModule(mod.slug, !allEnabled)}
                              className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                                allEnabled ? "bg-green-500/20 text-green-400" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                              }`}>
                              {allEnabled ? "הכל" : "—"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border flex items-center gap-3">
          <button onClick={handleSubmit} disabled={!form.name || !form.slug || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : role ? "עדכן" : "צור תפקיד"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="permissions" />
        <RelatedRecords entityType="permissions" />
      </div>
      </motion.div>
    </motion.div>
  );
}
