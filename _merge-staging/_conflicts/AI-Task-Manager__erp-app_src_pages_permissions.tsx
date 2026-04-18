import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Modal, Label, Card } from "@/components/ui-components";
import { Plus, Edit2, Trash2, ShieldCheck, Shield, Users, Check, X, ChevronDown, ChevronUp, UserPlus, Crown, Eye, Pencil, Ban, Building2, Download, Layers } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API_BASE = "/api";

interface Role {
  id: number;
  name: string;
  nameHe: string | null;
  nameEn: string | null;
  slug: string;
  description: string | null;
  color: string;
  isSystem: boolean;
  isActive: boolean;
  settings: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface RoleAssignment {
  id: number;
  roleId: number;
  userId: string;
  assignedBy: string | null;
  createdAt: string;
}

interface PlatformModule {
  id: number;
  name: string;
  nameHe: string | null;
  slug: string;
  entities?: ModuleEntity[];
}

interface ModuleEntity {
  id: number;
  name: string;
  nameHe: string | null;
  slug: string;
  moduleId: number;
}

interface EntityField {
  id: number;
  name: string;
  nameHe: string | null;
  slug: string;
  fieldType: string;
}

interface ActionDef {
  id: number;
  name: string;
  slug: string;
  actionType: string;
  entityId: number;
}

const MODULE_ACTIONS = [
  { key: "view", label: "צפייה", icon: Eye },
  { key: "manage", label: "ניהול", icon: Pencil },
];

const ENTITY_ACTIONS = [
  { key: "create", label: "יצירה" },
  { key: "read", label: "קריאה" },
  { key: "update", label: "עדכון" },
  { key: "delete", label: "מחיקה" },
];

const FIELD_VISIBILITY_OPTIONS = [
  { value: "write", label: "כתיבה", color: "text-green-400" },
  { value: "read", label: "קריאה בלבד", color: "text-yellow-400" },
  { value: "hidden", label: "מוסתר", color: "text-red-400" },
];

export default function PermissionsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { permissions: currentUserPermissions } = usePermissions();
  const isSuperAdmin = currentUserPermissions?.isSuperAdmin === true;
  const [activeTab, setActiveTab] = useState<"roles" | "permissions" | "assignments">("roles");
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());
  const [expandedEntities, setExpandedEntities] = useState<Set<number>>(new Set());
  const [permView, setPermView] = useState<"modules" | "entities" | "fields" | "actions">("modules");
  const [assignUserId, setAssignUserId] = useState("");
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  const [roleForm, setRoleForm] = useState({
    name: "", nameHe: "", nameEn: "", slug: "", description: "", color: "blue",
    isSuperAdmin: false, builderAccess: false,
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["platform-roles"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/roles`);
      if (!r.ok) throw new Error("Failed to fetch roles");
      return r.json();
    },
  });

  const { modules: allModules } = usePlatformModules();

  const { data: assignments = [] } = useQuery<RoleAssignment[]>({
    queryKey: ["role-assignments"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/role-assignments`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: activeTab === "assignments",
  });

  const { data: allUsers = [] } = useQuery<{ id: number; username: string; fullName: string; email: string; department: string | null }[]>({
    queryKey: ["all-users-for-assignment"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/auth/users`);
      if (!r.ok) return [];
      const data = await r.json();
      return data.users || data || [];
    },
    enabled: activeTab === "assignments",
  });

  const { data: roleTemplates = [] } = useQuery<{ name: string; nameHe: string; slug: string; description: string; color: string; department: string }[]>({
    queryKey: ["role-templates"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/role-templates`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: departments = [] } = useQuery<{ value: string; labelHe: string; labelEn: string; color: string }[]>({
    queryKey: ["departments"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/departments`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const seedTemplatesMutation = useMutation({
    mutationFn: async (slugs: string[] | undefined) => {
      const r = await authFetch(`${API_BASE}/platform/role-templates/seed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slugs ? { slugs } : {}),
      });
      if (!r.ok) throw new Error("Failed to seed templates");
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["platform-roles"] });
      toast({ title: "תבניות נוצרו", description: data.message });
    },
    onError: (err: any) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const selectedRole = roles.find(r => r.id === selectedRoleId) || null;
  const roleSettings = (selectedRole?.settings || {}) as Record<string, any>;

  const [localSettings, setLocalSettings] = useState<Record<string, any>>({});

  useEffect(() => {
    if (selectedRole) {
      setLocalSettings({
        isSuperAdmin: roleSettings.isSuperAdmin || false,
        builderAccess: roleSettings.builderAccess || false,
        modules: roleSettings.modules || {},
        entities: roleSettings.entities || {},
        fields: roleSettings.fields || {},
        actions: roleSettings.actions || {},
      });
    }
  }, [selectedRoleId, selectedRole?.updatedAt]);

  const createRoleMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API_BASE}/platform/roles`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          settings: {
            isSuperAdmin: data.isSuperAdmin || false,
            builderAccess: data.builderAccess || false,
            modules: {}, entities: {}, fields: {}, actions: {},
          },
        }),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-roles"] });
      setIsRoleModalOpen(false);
      toast({ title: "נוצר", description: "תפקיד חדש נוסף בהצלחה." });
    },
    onError: (err: any) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await authFetch(`${API_BASE}/platform/roles/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-roles"] });
      setIsRoleModalOpen(false);
      toast({ title: "עודכן", description: "תפקיד עודכן בהצלחה." });
    },
    onError: (err: any) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API_BASE}/platform/roles/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete role");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-roles"] });
      toast({ title: "נמחק", description: "תפקיד נמחק בהצלחה." });
    },
  });

  const savePermissionsMutation = useMutation({
    mutationFn: async ({ roleId, settings }: { roleId: number; settings: any }) => {
      const r = await authFetch(`${API_BASE}/platform/roles/${roleId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!r.ok) throw new Error("Failed to save permissions");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-roles"] });
      queryClient.invalidateQueries({ queryKey: ["my-permissions"] });
      toast({ title: "נשמר", description: "הרשאות עודכנו בהצלחה." });
    },
  });

  const assignRoleMutation = useMutation({
    mutationFn: async (data: { roleId: number; userId: string }) => {
      const r = await authFetch(`${API_BASE}/platform/role-assignments`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-assignments"] });
      setIsAssignModalOpen(false);
      setAssignUserId("");
      toast({ title: "שויך", description: "משתמש שויך לתפקיד." });
    },
    onError: (err: any) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const removeAssignmentMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API_BASE}/platform/role-assignments/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-assignments"] });
      toast({ title: "הוסר", description: "שיוך הוסר." });
    },
  });

  const toggleModulePerm = (moduleId: number, action: "view" | "manage") => {
    setLocalSettings(prev => {
      const modules = { ...prev.modules };
      const key = String(moduleId);
      if (!modules[key]) modules[key] = { view: false, manage: false };
      modules[key] = { ...modules[key], [action]: !modules[key][action] };
      return { ...prev, modules };
    });
  };

  const toggleEntityPerm = (entityId: number, action: string) => {
    setLocalSettings(prev => {
      const entities = { ...prev.entities };
      const key = String(entityId);
      if (!entities[key]) entities[key] = { create: false, read: false, update: false, delete: false };
      entities[key] = { ...entities[key], [action]: !entities[key][action] };
      return { ...prev, entities };
    });
  };

  const setFieldPerm = (entityId: number, fieldSlug: string, visibility: string) => {
    setLocalSettings(prev => {
      const fields = { ...prev.fields };
      const key = String(entityId);
      if (!fields[key]) fields[key] = {};
      fields[key] = { ...fields[key], [fieldSlug]: visibility };
      return { ...prev, fields };
    });
  };

  const toggleActionPerm = (actionId: number) => {
    setLocalSettings(prev => {
      const actions = { ...prev.actions };
      const key = String(actionId);
      if (!actions[key]) actions[key] = { execute: false };
      actions[key] = { ...actions[key], execute: !actions[key].execute };
      return { ...prev, actions };
    });
  };

  const saveCurrentPermissions = () => {
    if (!selectedRoleId) return;
    savePermissionsMutation.mutate({ roleId: selectedRoleId, settings: localSettings });
  };

  const openCreateRole = () => {
    setEditingRole(null);
    setRoleForm({ name: "", nameHe: "", nameEn: "", slug: "", description: "", color: "blue", isSuperAdmin: false, builderAccess: false });
    setIsRoleModalOpen(true);
  };

  const openEditRole = (role: Role) => {
    setEditingRole(role);
    const s = (role.settings || {}) as any;
    setRoleForm({
      name: role.name, nameHe: role.nameHe || "", nameEn: role.nameEn || "",
      slug: role.slug, description: role.description || "", color: role.color,
      isSuperAdmin: s.isSuperAdmin || false, builderAccess: s.builderAccess || false,
    });
    setIsRoleModalOpen(true);
  };

  const handleRoleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: any = {
      name: roleForm.name, nameHe: roleForm.nameHe || undefined, nameEn: roleForm.nameEn || undefined,
      slug: roleForm.slug || roleForm.name.toLowerCase().replace(/\s+/g, "-"),
      description: roleForm.description || undefined, color: roleForm.color,
    };
    if (editingRole) {
      const existingSettings = (editingRole.settings || {}) as any;
      data.settings = {
        ...existingSettings,
        isSuperAdmin: roleForm.isSuperAdmin,
        builderAccess: roleForm.builderAccess,
      };
      updateRoleMutation.mutate({ id: editingRole.id, data });
    } else {
      data.isSuperAdmin = roleForm.isSuperAdmin;
      data.builderAccess = roleForm.builderAccess;
      createRoleMutation.mutate(data);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-foreground">הרשאות ותפקידים</h1>
          <p className="text-muted-foreground mt-1">ניהול תפקידים, הרשאות גישה ושיוך משתמשים</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-border/50 pb-0">
        {[
          { key: "roles" as const, label: "תפקידים", icon: Users },
          { key: "permissions" as const, label: "מטריצת הרשאות", icon: Shield },
          { key: "assignments" as const, label: "שיוך משתמשים", icon: UserPlus },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <div className="flex items-center gap-2"><tab.icon className="w-4 h-4" />{tab.label}</div>
          </button>
        ))}
      </div>

      {activeTab === "roles" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div className="flex gap-2">
              <Button onClick={() => seedTemplatesMutation.mutate(undefined)} variant="outline" className="gap-2" disabled={seedTemplatesMutation.isPending}>
                <Download className="w-4 h-4" />
                {seedTemplatesMutation.isPending ? "יוצר..." : "צור תבניות מחלקות"}
              </Button>
            </div>
            <Button onClick={openCreateRole} className="gap-2">
              <Plus className="w-5 h-5" /> תפקיד חדש
            </Button>
          </div>

          {roles.length === 0 && roleTemplates.length > 0 && (
            <Card className="p-6 bg-blue-500/5 border-blue-500/20">
              <div className="flex items-start gap-4">
                <Layers className="w-8 h-8 text-blue-400 mt-1" />
                <div>
                  <h3 className="font-bold text-lg mb-1">תבניות תפקידים לפי מחלקות</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    ניתן ליצור תפקידים מוכנים מראש לכל מחלקה בארגון. כל תפקיד כולל הרשאות ברירת מחדל שניתן להתאים.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                    {departments.map(dept => {
                      const deptTemplates = roleTemplates.filter(t => t.department === dept.value);
                      return (
                        <div key={dept.value} className="flex items-center gap-2 text-sm">
                          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{dept.labelHe}</span>
                          <span className="text-xs text-muted-foreground">({deptTemplates.length} תפקידים)</span>
                        </div>
                      );
                    })}
                  </div>
                  <Button onClick={() => seedTemplatesMutation.mutate(undefined)} disabled={seedTemplatesMutation.isPending} className="gap-2">
                    <Download className="w-4 h-4" />
                    {seedTemplatesMutation.isPending ? "יוצר תפקידים..." : "צור את כל התבניות"}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {(() => {
            const groupedByDept: Record<string, Role[]> = {};
            const ungrouped: Role[] = [];
            for (const role of roles) {
              const template = roleTemplates.find(t => t.slug === role.slug);
              const dept = template?.department;
              if (dept) {
                if (!groupedByDept[dept]) groupedByDept[dept] = [];
                groupedByDept[dept].push(role);
              } else {
                ungrouped.push(role);
              }
            }
            const allGroups = [
              ...departments.filter(d => groupedByDept[d.value]).map(d => ({ key: d.value, label: d.labelHe, roles: groupedByDept[d.value] })),
              ...(ungrouped.length > 0 ? [{ key: "other", label: "כללי", roles: ungrouped }] : []),
            ];
            return allGroups.map(group => (
              <div key={group.key}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  {group.label}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
                  {group.roles.map((role) => {
                    const s = (role.settings || {}) as any;
                    return (
                      <Card key={role.id} className="flex flex-col overflow-hidden">
                        <div className="p-5 border-b border-border/50 bg-muted/10 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full bg-${role.color}-500`} />
                            <h3 className="font-bold text-lg">{role.nameHe || role.name}</h3>
                            {s.isSuperAdmin && (
                              <Crown className="w-4 h-4 text-yellow-400" title="Super Admin" />
                            )}
                            {role.isSystem && (
                              <span className="text-[10px] bg-muted/30 text-muted-foreground px-1.5 py-0.5 rounded">מערכת</span>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => openEditRole(role)} className="p-1.5 text-muted-foreground hover:text-blue-400 transition-colors">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {!role.isSystem && isSuperAdmin && (
                              <button onClick={async () => { const ok = await globalConfirm("האם למחוק תפקיד זה?"); if (ok) deleteRoleMutation.mutate(role.id); }} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="p-5 flex-1">
                          <p className="text-sm text-muted-foreground">{role.description || "ללא תיאור"}</p>
                          <div className="mt-3 flex items-center gap-2 flex-wrap">
                            <code className="text-xs bg-muted/20 px-1.5 py-0.5 rounded font-mono">{role.slug}</code>
                            {s.builderAccess && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">Builder</span>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${role.isActive ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                              {role.isActive ? "פעיל" : "לא פעיל"}
                            </span>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ));
          })()}

          {roles.length === 0 && roleTemplates.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>לא הוגדרו תפקידים עדיין</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "permissions" && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="whitespace-nowrap">בחר תפקיד:</Label>
              <select
                value={selectedRoleId ?? ""}
                onChange={(e) => setSelectedRoleId(e.target.value ? Number(e.target.value) : null)}
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm min-w-0 sm:min-w-[200px]"
              >
                <option value="">בחר תפקיד...</option>
                {roles.map(r => (
                  <option key={r.id} value={r.id}>{r.nameHe || r.name}</option>
                ))}
              </select>
            </div>

            {selectedRoleId && (
              <>
                <div className="flex gap-1 bg-muted/20 rounded-lg p-1">
                  {(["modules", "entities"] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setPermView(v)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        permView === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {v === "modules" ? "מודולים" : "ישויות"}
                    </button>
                  ))}
                </div>

                <Button onClick={saveCurrentPermissions} disabled={savePermissionsMutation.isPending} className="gap-2 mr-auto">
                  <Check className="w-4 h-4" />
                  {savePermissionsMutation.isPending ? "שומר..." : "שמור הרשאות"}
                </Button>
              </>
            )}
          </div>

          {selectedRoleId && localSettings.isSuperAdmin && (
            <Card className="p-4 bg-yellow-500/5 border-yellow-500/20">
              <div className="flex items-center gap-2 text-yellow-400">
                <Crown className="w-5 h-5" />
                <span className="font-medium">תפקיד זה הוא Super Admin - גישה מלאה לכל המערכת</span>
              </div>
            </Card>
          )}

          {selectedRoleId && !localSettings.isSuperAdmin && (
            <>
              <div className="flex items-center gap-4 mb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.builderAccess || false}
                    onChange={() => setLocalSettings(prev => ({ ...prev, builderAccess: !prev.builderAccess }))}
                    className="w-4 h-4 rounded border-border text-primary"
                  />
                  <span className="text-sm">גישה לבונה הפלטפורמה (Builder)</span>
                </label>
              </div>

              {permView === "modules" && (
                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border/50 bg-muted/10">
                          <th className="text-right px-4 py-3 text-sm font-semibold text-muted-foreground w-64">מודול</th>
                          {MODULE_ACTIONS.map(a => (
                            <th key={a.key} className="px-4 py-3 text-sm font-semibold text-muted-foreground text-center w-24">{a.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allModules.map((mod) => (
                          <tr key={mod.id} className="border-b border-border/30 hover:bg-card/[0.02] transition-colors">
                            <td className="px-4 py-3">
                              <span className="text-sm font-medium">{(mod as any).nameHe || mod.name}</span>
                            </td>
                            {MODULE_ACTIONS.map(action => {
                              const isOn = localSettings.modules?.[String(mod.id)]?.[action.key] || false;
                              return (
                                <td key={action.key} className="px-4 py-3 text-center">
                                  <button
                                    onClick={() => toggleModulePerm(mod.id, action.key as "view" | "manage")}
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                      isOn ? "bg-primary/20 text-primary" : "bg-muted/10 text-muted-foreground hover:bg-muted/20"
                                    }`}
                                  >
                                    {isOn ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {permView === "entities" && (
                <EntityPermissionsView
                  allModules={allModules}
                  localSettings={localSettings}
                  expandedModules={expandedModules}
                  expandedEntities={expandedEntities}
                  onToggleModule={(id) => {
                    setExpandedModules(prev => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id); else next.add(id);
                      return next;
                    });
                  }}
                  onToggleEntity={(id) => {
                    setExpandedEntities(prev => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id); else next.add(id);
                      return next;
                    });
                  }}
                  onToggleEntityPerm={toggleEntityPerm}
                  onSetFieldPerm={setFieldPerm}
                  onToggleActionPerm={toggleActionPerm}
                />
              )}
            </>
          )}

          {!selectedRoleId && (
            <Card className="p-8 text-center text-muted-foreground">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>בחר תפקיד כדי לנהל הרשאות</p>
            </Card>
          )}
        </div>
      )}

      {activeTab === "assignments" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setIsAssignModalOpen(true)} className="gap-2">
              <UserPlus className="w-5 h-5" /> שיוך משתמש
            </Button>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/10">
                    <th className="text-right px-4 py-3 text-sm font-semibold text-muted-foreground">מזהה משתמש</th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-muted-foreground">תפקיד</th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-muted-foreground">שויך ע"י</th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-muted-foreground">תאריך</th>
                    <th className="px-4 py-3 text-sm font-semibold text-muted-foreground w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p>אין שיוכי משתמשים עדיין</p>
                      </td>
                    </tr>
                  ) : (
                    assignments.map((a) => {
                      const role = roles.find(r => r.id === a.roleId);
                      const assignedUser = allUsers.find(u => String(u.id) === a.userId);
                      return (
                        <tr key={a.id} className="border-b border-border/30 hover:bg-card/[0.02] transition-colors">
                          <td className="px-4 py-3 text-sm">
                            {assignedUser ? (
                              <div>
                                <span className="font-medium">{assignedUser.fullName}</span>
                                <span className="text-xs text-muted-foreground mr-2">({assignedUser.username})</span>
                              </div>
                            ) : (
                              <span className="font-mono">{a.userId}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-1 rounded-full bg-${role?.color || "blue"}-500/10 text-${role?.color || "blue"}-400`}>
                              {role?.nameHe || role?.name || `Role #${a.roleId}`}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{a.assignedBy || "—"}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("he-IL")}</td>
                          <td className="px-4 py-3">
                            {isSuperAdmin && (
                              <button
                                onClick={async () => { const ok = await globalConfirm("הסר שיוך זה?"); if (ok) removeAssignmentMutation.mutate(a.id); }}
                                className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      <Modal isOpen={isRoleModalOpen} onClose={() => setIsRoleModalOpen(false)} title={editingRole ? "עריכת תפקיד" : "תפקיד חדש"}>
        <form onSubmit={handleRoleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>שם התפקיד</Label>
              <Input value={roleForm.name} onChange={e => setRoleForm(f => ({ ...f, name: e.target.value }))} placeholder="Admin" />
            </div>
            <div className="space-y-2">
              <Label>שם בעברית</Label>
              <Input value={roleForm.nameHe} onChange={e => setRoleForm(f => ({ ...f, nameHe: e.target.value }))} placeholder="מנהל" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>שם באנגלית</Label>
              <Input value={roleForm.nameEn} onChange={e => setRoleForm(f => ({ ...f, nameEn: e.target.value }))} placeholder="Admin" dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>מזהה (Slug)</Label>
              <Input value={roleForm.slug} onChange={e => setRoleForm(f => ({ ...f, slug: e.target.value }))} placeholder="admin" dir="ltr" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>תיאור</Label>
            <Input value={roleForm.description} onChange={e => setRoleForm(f => ({ ...f, description: e.target.value }))} placeholder="תיאור התפקיד..." />
          </div>
          <div className="space-y-2">
            <Label>צבע</Label>
            <div className="flex gap-2 flex-wrap">
              {["blue", "red", "green", "purple", "orange", "yellow"].map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setRoleForm(f => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full bg-${c}-500 border-2 transition-all ${
                    roleForm.color === c ? "border-white scale-110" : "border-transparent opacity-60 hover:opacity-100"
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="space-y-3 pt-2 border-t border-border/50">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={roleForm.isSuperAdmin} onChange={e => setRoleForm(f => ({ ...f, isSuperAdmin: e.target.checked }))}
                className="w-4 h-4 rounded border-border text-primary" />
              <div>
                <span className="text-sm font-medium flex items-center gap-1"><Crown className="w-3.5 h-3.5 text-yellow-400" /> Super Admin</span>
                <p className="text-xs text-muted-foreground">גישה מלאה לכל המערכת ללא הגבלות</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={roleForm.builderAccess} onChange={e => setRoleForm(f => ({ ...f, builderAccess: e.target.checked }))}
                className="w-4 h-4 rounded border-border text-primary" />
              <div>
                <span className="text-sm font-medium">גישה לבונה הפלטפורמה</span>
                <p className="text-xs text-muted-foreground">יכולת לשנות מבנה הפלטפורמה — מודולים, ישויות, שדות</p>
              </div>
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
            <Button type="button" variant="ghost" onClick={() => setIsRoleModalOpen(false)}>ביטול</Button>
            <Button type="submit" disabled={createRoleMutation.isPending || updateRoleMutation.isPending}>
              {createRoleMutation.isPending || updateRoleMutation.isPending ? "שומר..." : "שמור"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} title="שיוך משתמש לתפקיד">
        <form onSubmit={(e) => {
          e.preventDefault();
          if (!selectedRoleId || !assignUserId) return;
          assignRoleMutation.mutate({ roleId: selectedRoleId, userId: assignUserId });
        }} className="space-y-4">
          <div className="space-y-2">
            <Label>בחר תפקיד</Label>
            <select
              value={selectedRoleId ?? ""}
              onChange={(e) => setSelectedRoleId(e.target.value ? Number(e.target.value) : null)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">בחר תפקיד...</option>
              {roles.map(r => (
                <option key={r.id} value={r.id}>{r.nameHe || r.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>בחר משתמש</Label>
            <select
              value={assignUserId}
              onChange={(e) => setAssignUserId(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">בחר משתמש...</option>
              {allUsers.map(u => (
                <option key={u.id} value={String(u.id)}>{u.fullName} ({u.username})</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
            <Button type="button" variant="ghost" onClick={() => setIsAssignModalOpen(false)}>ביטול</Button>
            <Button type="submit" disabled={!selectedRoleId || !assignUserId || assignRoleMutation.isPending}>
              {assignRoleMutation.isPending ? "משייך..." : "שייך"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function EntityPermissionsView({
  allModules,
  localSettings,
  expandedModules,
  expandedEntities,
  onToggleModule,
  onToggleEntity,
  onToggleEntityPerm,
  onSetFieldPerm,
  onToggleActionPerm,
}: {
  allModules: PlatformModule[];
  localSettings: Record<string, any>;
  expandedModules: Set<number>;
  expandedEntities: Set<number>;
  onToggleModule: (id: number) => void;
  onToggleEntity: (id: number) => void;
  onToggleEntityPerm: (entityId: number, action: string) => void;
  onSetFieldPerm: (entityId: number, fieldSlug: string, visibility: string) => void;
  onToggleActionPerm: (actionId: number) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50 bg-muted/10">
              <th className="text-right px-4 py-3 text-sm font-semibold text-muted-foreground w-72">מודול / ישות</th>
              {ENTITY_ACTIONS.map(a => (
                <th key={a.key} className="px-4 py-3 text-sm font-semibold text-muted-foreground text-center w-20">{a.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allModules.map((mod) => (
              <ModuleEntityRows
                key={mod.id}
                module={mod}
                localSettings={localSettings}
                isExpanded={expandedModules.has(mod.id)}
                expandedEntities={expandedEntities}
                onToggleModule={() => onToggleModule(mod.id)}
                onToggleEntity={onToggleEntity}
                onToggleEntityPerm={onToggleEntityPerm}
                onSetFieldPerm={onSetFieldPerm}
                onToggleActionPerm={onToggleActionPerm}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ModuleEntityRows({
  module: mod,
  localSettings,
  isExpanded,
  expandedEntities,
  onToggleModule,
  onToggleEntity,
  onToggleEntityPerm,
  onSetFieldPerm,
  onToggleActionPerm,
}: {
  module: PlatformModule;
  localSettings: Record<string, any>;
  isExpanded: boolean;
  expandedEntities: Set<number>;
  onToggleModule: () => void;
  onToggleEntity: (id: number) => void;
  onToggleEntityPerm: (entityId: number, action: string) => void;
  onSetFieldPerm: (entityId: number, fieldSlug: string, visibility: string) => void;
  onToggleActionPerm: (actionId: number) => void;
}) {
  const { data: entities = [] } = useQuery<ModuleEntity[]>({
    queryKey: ["module-entities", mod.id],
    queryFn: async () => {
      const r = await authFetch(`/api/platform/modules/${mod.id}`);
      if (!r.ok) return [];
      const data = await r.json();
      return data.entities || [];
    },
    enabled: isExpanded,
  });

  return (
    <>
      <tr className="border-b border-border/30 bg-muted/5 hover:bg-card/[0.02] transition-colors cursor-pointer" onClick={onToggleModule}>
        <td className="px-4 py-3" colSpan={5}>
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            <span className="text-sm font-semibold">{(mod as any).nameHe || mod.name}</span>
            <span className="text-xs text-muted-foreground">({entities.length} ישויות)</span>
          </div>
        </td>
      </tr>
      {isExpanded && entities.map((entity) => (
        <EntityPermRow
          key={entity.id}
          entity={entity}
          localSettings={localSettings}
          isExpanded={expandedEntities.has(entity.id)}
          onToggle={() => onToggleEntity(entity.id)}
          onTogglePerm={onToggleEntityPerm}
          onSetFieldPerm={onSetFieldPerm}
          onToggleActionPerm={onToggleActionPerm}
        />
      ))}
    </>
  );
}

function EntityPermRow({
  entity,
  localSettings,
  isExpanded,
  onToggle,
  onTogglePerm,
  onSetFieldPerm,
  onToggleActionPerm,
}: {
  entity: ModuleEntity;
  localSettings: Record<string, any>;
  isExpanded: boolean;
  onToggle: () => void;
  onTogglePerm: (entityId: number, action: string) => void;
  onSetFieldPerm: (entityId: number, fieldSlug: string, visibility: string) => void;
  onToggleActionPerm: (actionId: number) => void;
}) {
  const entityPerms = localSettings.entities?.[String(entity.id)] || { create: false, read: false, update: false, delete: false };

  const { data: fields = [] } = useQuery<EntityField[]>({
    queryKey: ["entity-fields", entity.id],
    queryFn: async () => {
      const r = await authFetch(`/api/platform/entities/${entity.id}`);
      if (!r.ok) return [];
      const data = await r.json();
      return data.fields || [];
    },
    enabled: isExpanded,
  });

  const { data: actions = [] } = useQuery<ActionDef[]>({
    queryKey: ["entity-actions-perm", entity.id],
    queryFn: async () => {
      const r = await authFetch(`/api/platform/entities/${entity.id}/actions`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: isExpanded,
  });

  return (
    <>
      <tr className="border-b border-border/30 hover:bg-card/[0.02] transition-colors">
        <td className="px-4 py-3 pr-10">
          <div className="flex items-center gap-2 cursor-pointer" onClick={onToggle}>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
            <span className="text-sm">{(entity as any).nameHe || entity.name}</span>
          </div>
        </td>
        {ENTITY_ACTIONS.map(action => {
          const isOn = entityPerms[action.key] || false;
          return (
            <td key={action.key} className="px-4 py-3 text-center">
              <button
                onClick={() => onTogglePerm(entity.id, action.key)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  isOn ? "bg-primary/20 text-primary" : "bg-muted/10 text-muted-foreground hover:bg-muted/20"
                }`}
              >
                {isOn ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
              </button>
            </td>
          );
        })}
      </tr>
      {isExpanded && fields.length > 0 && (
        <tr className="border-b border-border/20">
          <td colSpan={5} className="px-4 py-3 pr-16 bg-muted/5">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground">הרשאות שדות:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {fields.map(field => {
                  const currentVisibility = localSettings.fields?.[String(entity.id)]?.[field.slug] || "write";
                  return (
                    <div key={field.id} className="flex items-center justify-between gap-2 bg-background/50 rounded-lg px-3 py-2">
                      <span className="text-xs truncate">{(field as any).nameHe || field.name}</span>
                      <select
                        value={currentVisibility}
                        onChange={(e) => onSetFieldPerm(entity.id, field.slug, e.target.value)}
                        className="text-xs bg-muted/20 border border-border/50 rounded px-2 py-1 min-w-[90px]"
                      >
                        {FIELD_VISIBILITY_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              {actions.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-muted-foreground mt-3">הרשאות פעולות:</p>
                  <div className="flex flex-wrap gap-2">
                    {actions.map(action => {
                      const isOn = localSettings.actions?.[String(action.id)]?.execute || false;
                      return (
                        <button
                          key={action.id}
                          onClick={() => onToggleActionPerm(action.id)}
                          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                            isOn ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/10 border-border/50 text-muted-foreground"
                          }`}
                        >
                          {isOn ? <Check className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                          {action.name}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
