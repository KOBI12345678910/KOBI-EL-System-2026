import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui-components";
import {
  Shield, ShieldAlert, Users, Database, AlertTriangle,
  Eye, Lock, Plus, Trash2, Check, X, UserMinus,
  BarChart3, Activity,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";

const API_BASE = "/api";

interface AuditLogEntry {
  id: number;
  entityId: number | null;
  recordId: number | null;
  action: string;
  performedBy: string | null;
  changes: Record<string, unknown> | null;
  createdAt: string;
}

interface PlatformRole {
  id: number;
  name: string;
  nameHe: string | null;
  description: string | null;
  isActive: boolean;
  settings: Record<string, unknown> | null;
}

interface GovernanceDashboard {
  summary: {
    totalRoles: number;
    activeRoles: number;
    totalAssignments: number;
    uniqueUsersWithRoles: number;
    totalEntities: number;
    governedEntities: number;
    ungovernedEntities: number;
    totalScopeRules: number;
    entitiesWithScopeRules: number;
    entitiesWithoutScopeRules: number;
    totalRecords: number;
    recordsWithOwner: number;
    usersWithoutRoles: number;
    recentDenialCount: number;
  };
  allEntities: { id: number; name: string; nameHe: string | null; slug: string }[];
  ungovernedEntities: { id: number; name: string; nameHe: string | null; slug: string }[];
  entitiesWithoutScopeRules: { id: number; name: string; nameHe: string | null; slug: string }[];
  usersWithoutRoles: { id: number; username: string; fullName: string }[];
  recentDenials: AuditLogEntry[];
  roles: PlatformRole[];
  scopeRules: ScopeRule[];
}

interface ScopeRule {
  id: number;
  roleId: number;
  entityId: number;
  scopeType: string;
  field: string | null;
  operator: string | null;
  value: string | null;
  description: string | null;
  isActive: boolean;
}

const SCOPE_TYPES = [
  { value: "all", label: "כל הרשומות", description: "גישה לכל הרשומות ללא הגבלה" },
  { value: "own", label: "רשומות שלי", description: "רק רשומות שנוצרו על ידי או מוקצות אליי" },
  { value: "assigned_to_me", label: "מוקצה אליי", description: "רק רשומות שמוקצות אליי" },
  { value: "created_by_me", label: "נוצר על ידי", description: "רק רשומות שאני יצרתי" },
  { value: "field_equals", label: "שדה שווה", description: "רשומות שבהן שדה מסוים שווה לערך" },
  { value: "field_contains", label: "שדה מכיל", description: "רשומות שבהן שדה מסוים מכיל ערך" },
  { value: "field_in", label: "שדה ברשימה", description: "רשומות שבהן שדה מסוים ברשימת ערכים" },
  { value: "team", label: "צוות", description: "רשומות שמשויכות לצוות מסוים" },
];

export default function GovernancePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"overview" | "scope-rules" | "bulk-assign" | "denials">("overview");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [showScopeForm, setShowScopeForm] = useState(false);
  const [scopeForm, setScopeForm] = useState({
    roleId: 0, entityId: 0, scopeType: "all" as string,
    field: "", value: "", description: "",
  });
  const [bulkRoleId, setBulkRoleId] = useState<number>(0);
  const [bulkUserIds, setBulkUserIds] = useState("");

  const { data: dashboard, isLoading } = useQuery<GovernanceDashboard>({
    queryKey: ["governance-dashboard"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/governance/dashboard`);
      if (!r.ok) throw new Error("Failed to fetch governance dashboard");
      return r.json();
    },
  });

  const { data: scopeRules = [] } = useQuery<ScopeRule[]>({
    queryKey: ["scope-rules"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/governance/scope-rules`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: activeTab === "scope-rules",
  });

  const { data: denials } = useQuery<{ denials: AuditLogEntry[]; total: number }>({
    queryKey: ["access-denials"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/governance/access-denials?limit=50`);
      if (!r.ok) return { denials: [], total: 0 };
      return r.json();
    },
    enabled: activeTab === "denials",
  });

  const createScopeRuleMutation = useMutation({
    mutationFn: async (data: Omit<ScopeRule, "id" | "isActive">) => {
      const r = await authFetch(`${API_BASE}/platform/governance/scope-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scope-rules"] });
      queryClient.invalidateQueries({ queryKey: ["governance-dashboard"] });
      setShowScopeForm(false);
      setScopeForm({ roleId: 0, entityId: 0, scopeType: "all", field: "", value: "", description: "" });
      toast({ title: "נוצר", description: "כלל סינון נתונים חדש נוסף." });
    },
    onError: (err: Error) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const deleteScopeRuleMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API_BASE}/platform/governance/scope-rules/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scope-rules"] });
      queryClient.invalidateQueries({ queryKey: ["governance-dashboard"] });
      toast({ title: "נמחק", description: "כלל סינון הוסר." });
    },
  });

  const bulkAssignMutation = useMutation({
    mutationFn: async (data: { roleId: number; userIds: string[] }) => {
      const r = await authFetch(`${API_BASE}/platform/governance/bulk-assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: (data: { assigned: number; skipped: number; total: number }) => {
      queryClient.invalidateQueries({ queryKey: ["governance-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["role-assignments"] });
      setBulkUserIds("");
      toast({ title: "שויכו", description: `${data.assigned} משתמשים שויכו, ${data.skipped} כבר קיימים.` });
    },
    onError: (err: Error) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const bulkRevokeMutation = useMutation({
    mutationFn: async (data: { roleId: number; userIds: string[] }) => {
      const r = await authFetch(`${API_BASE}/platform/governance/bulk-revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["governance-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["role-assignments"] });
      setBulkUserIds("");
      toast({ title: "בוטלו", description: "שיוכי תפקידים בוטלו." });
    },
    onError: (err: Error) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const summary = dashboard?.summary;

  const coveragePercent = summary ? Math.round((summary.governedEntities / Math.max(summary.totalEntities, 1)) * 100) : 0;
  const ownershipPercent = summary ? Math.round((summary.recordsWithOwner / Math.max(summary.totalRecords, 1)) * 100) : 0;

  const handleScopeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scopeForm.roleId || !scopeForm.entityId) {
      toast({ title: "שגיאה", description: "יש לבחור תפקיד וישות.", variant: "destructive" });
      return;
    }
    createScopeRuleMutation.mutate({
      roleId: scopeForm.roleId,
      entityId: scopeForm.entityId,
      scopeType: scopeForm.scopeType,
      field: scopeForm.field || undefined,
      value: scopeForm.value || undefined,
      description: scopeForm.description || undefined,
    });
  };

  const handleBulkAssign = () => {
    if (!bulkRoleId || !bulkUserIds.trim()) return;
    const userIds = bulkUserIds.split(",").map(id => id.trim()).filter(Boolean);
    bulkAssignMutation.mutate({ roleId: bulkRoleId, userIds });
  };

  const handleBulkRevoke = async () => {
    if (!bulkRoleId || !bulkUserIds.trim()) return;
    const userIds = bulkUserIds.split(",").map(id => id.trim()).filter(Boolean);
    if (await globalConfirm(`האם לבטל שיוך ל-${userIds.length} משתמשים?`)) {
      bulkRevokeMutation.mutate({ roleId: bulkRoleId, userIds });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 rounded bg-muted/20" />
          <div className="h-9 w-32 rounded bg-muted/15" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-border/50 rounded-xl p-5 space-y-2">
              <div className="h-4 w-1/2 rounded bg-muted/20" />
              <div className="h-8 w-16 rounded bg-muted/15" />
            </div>
          ))}
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-5 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 w-full rounded bg-muted/10" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-foreground">ממשל נתונים</h1>
          <p className="text-muted-foreground mt-1">ניטור הרשאות, כללי סינון נתונים, ואירועי גישה</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-border/50 pb-0">
        {([
          { key: "overview" as const, label: "סקירה כללית", icon: BarChart3 },
          { key: "scope-rules" as const, label: "כללי סינון נתונים", icon: Lock },
          { key: "bulk-assign" as const, label: "שיוך המוני", icon: Users },
          { key: "denials" as const, label: "דחיות גישה", icon: ShieldAlert },
        ]).map(tab => (
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

      {activeTab === "overview" && summary && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              icon={Shield}
              label="תפקידים פעילים"
              value={summary.activeRoles}
              subtext={`מתוך ${summary.totalRoles} תפקידים`}
              color="text-blue-400"
            />
            <MetricCard
              icon={Users}
              label="משתמשים משויכים"
              value={summary.uniqueUsersWithRoles}
              subtext={`${summary.totalAssignments} שיוכים`}
              color="text-green-400"
            />
            <MetricCard
              icon={Database}
              label="כיסוי הרשאות"
              value={`${coveragePercent}%`}
              subtext={`${summary.governedEntities}/${summary.totalEntities} ישויות`}
              color={coveragePercent >= 80 ? "text-green-400" : coveragePercent >= 50 ? "text-yellow-400" : "text-red-400"}
            />
            <MetricCard
              icon={Eye}
              label="כיסוי בעלות"
              value={`${ownershipPercent}%`}
              subtext={`${summary.recordsWithOwner}/${summary.totalRecords} רשומות`}
              color={ownershipPercent >= 80 ? "text-green-400" : "text-yellow-400"}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              icon={Lock}
              label="כללי סינון נתונים"
              value={summary.totalScopeRules}
              subtext={`${summary.entitiesWithScopeRules} ישויות מכוסות`}
              color="text-purple-400"
            />
            <MetricCard
              icon={AlertTriangle}
              label="משתמשים ללא תפקיד"
              value={summary.usersWithoutRoles}
              subtext="דורשים שיוך"
              color={summary.usersWithoutRoles > 0 ? "text-yellow-400" : "text-green-400"}
            />
            <MetricCard
              icon={ShieldAlert}
              label="דחיות גישה אחרונות"
              value={summary.recentDenialCount}
              subtext="50 אחרונות"
              color={summary.recentDenialCount > 10 ? "text-red-400" : "text-muted-foreground"}
            />
          </div>

          {dashboard?.ungovernedEntities && dashboard.ungovernedEntities.length > 0 && (
            <Card className="p-5">
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                ישויות ללא הרשאות מוגדרות ({dashboard.ungovernedEntities.length})
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {dashboard.ungovernedEntities.map(e => (
                  <div key={e.id} className="text-sm bg-muted/10 p-2 rounded border border-yellow-500/20">
                    {e.nameHe || e.name}
                    <span className="text-xs text-muted-foreground block">{e.slug}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {dashboard?.usersWithoutRoles && dashboard.usersWithoutRoles.length > 0 && (
            <Card className="p-5">
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                <UserMinus className="w-5 h-5 text-yellow-400" />
                משתמשים ללא תפקיד ({dashboard.usersWithoutRoles.length})
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {dashboard.usersWithoutRoles.map(u => (
                  <div key={u.id} className="text-sm bg-muted/10 p-2 rounded border border-yellow-500/20">
                    {u.fullName}
                    <span className="text-xs text-muted-foreground block">{u.username}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {dashboard?.recentDenials && dashboard.recentDenials.length > 0 && (
            <Card className="p-5">
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-400" />
                דחיות גישה אחרונות
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right px-3 py-2 text-muted-foreground">זמן</th>
                      <th className="text-right px-3 py-2 text-muted-foreground">משתמש</th>
                      <th className="text-right px-3 py-2 text-muted-foreground">פעולה</th>
                      <th className="text-right px-3 py-2 text-muted-foreground">ישות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.recentDenials.slice(0, 10).map((d) => (
                      <tr key={d.id} className="border-b border-border/20 hover:bg-muted/5">
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {new Date(d.createdAt).toLocaleString("he-IL")}
                        </td>
                        <td className="px-3 py-2">{d.performedBy || "-"}</td>
                        <td className="px-3 py-2">
                          <span className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full">
                            {(d.changes as Record<string, unknown> | null)?.deniedAction as string || "unknown"}
                          </span>
                        </td>
                        <td className="px-3 py-2">{String((d.changes as Record<string, unknown> | null)?.entityId || d.entityId || "-")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {activeTab === "scope-rules" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">כללי סינון נתונים מגדירים אילו רשומות כל תפקיד רואה</p>
            <button
              onClick={() => setShowScopeForm(!showScopeForm)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" /> כלל חדש
            </button>
          </div>

          {showScopeForm && (
            <Card className="p-5">
              <h3 className="font-bold mb-4">כלל סינון חדש</h3>
              <form onSubmit={handleScopeSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground block mb-1">תפקיד</label>
                  <select
                    value={scopeForm.roleId}
                    onChange={(e) => setScopeForm(f => ({ ...f, roleId: Number(e.target.value) }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value={0}>בחר תפקיד...</option>
                    {dashboard?.roles?.map((r) => (
                      <option key={r.id} value={r.id}>{r.nameHe || r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground block mb-1">ישות</label>
                  <select
                    value={scopeForm.entityId}
                    onChange={(e) => setScopeForm(f => ({ ...f, entityId: Number(e.target.value) }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value={0}>בחר ישות...</option>
                    {(dashboard?.allEntities || []).map((e) => (
                      <option key={e.id} value={e.id}>{e.nameHe || e.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground block mb-1">סוג סינון</label>
                  <select
                    value={scopeForm.scopeType}
                    onChange={(e) => setScopeForm(f => ({ ...f, scopeType: e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  >
                    {SCOPE_TYPES.map(s => (
                      <option key={s.value} value={s.value}>{s.label} — {s.description}</option>
                    ))}
                  </select>
                </div>
                {["field_equals", "field_contains", "field_in"].includes(scopeForm.scopeType) && (
                  <>
                    <div>
                      <label className="text-sm text-muted-foreground block mb-1">שם שדה (slug)</label>
                      <input
                        value={scopeForm.field}
                        onChange={(e) => setScopeForm(f => ({ ...f, field: e.target.value }))}
                        placeholder="לדוגמה: region, department"
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground block mb-1">ערך</label>
                      <input
                        value={scopeForm.value}
                        onChange={(e) => setScopeForm(f => ({ ...f, value: e.target.value }))}
                        placeholder="{{current_user}} או ערך קבוע"
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </>
                )}
                <div className="md:col-span-2">
                  <label className="text-sm text-muted-foreground block mb-1">תיאור</label>
                  <input
                    value={scopeForm.description}
                    onChange={(e) => setScopeForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="תיאור הכלל..."
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="md:col-span-2 flex gap-2">
                  <button
                    type="submit"
                    disabled={createScopeRuleMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" /> {createScopeRuleMutation.isPending ? "שומר..." : "שמור"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowScopeForm(false)}
                    className="flex items-center gap-2 px-4 py-2 bg-muted/20 text-foreground rounded-lg text-sm hover:bg-muted/30"
                  >
                    <X className="w-4 h-4" /> ביטול
                  </button>
                </div>
              </form>
            </Card>
          )}

          {scopeRules.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <Lock className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>לא הוגדרו כללי סינון נתונים עדיין</p>
              <p className="text-xs mt-1">כללי סינון מגבילים אילו רשומות כל תפקיד יכול לראות</p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/10">
                    <th className="text-right px-4 py-3 text-muted-foreground">תפקיד</th>
                    <th className="text-right px-4 py-3 text-muted-foreground">ישות</th>
                    <th className="text-right px-4 py-3 text-muted-foreground">סוג סינון</th>
                    <th className="text-right px-4 py-3 text-muted-foreground">שדה/ערך</th>
                    <th className="text-right px-4 py-3 text-muted-foreground">תיאור</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {scopeRules.map(rule => {
                    const role = dashboard?.roles?.find((r) => r.id === rule.roleId);
                    const scopeLabel = SCOPE_TYPES.find(s => s.value === rule.scopeType)?.label || rule.scopeType;
                    return (
                      <tr key={rule.id} className="border-b border-border/20 hover:bg-muted/5">
                        <td className="px-4 py-3">{role?.nameHe || role?.name || `Role #${rule.roleId}`}</td>
                        <td className="px-4 py-3">Entity #{rule.entityId}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full">{scopeLabel}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {rule.field ? `${rule.field} = ${rule.value}` : "-"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{rule.description || "-"}</td>
                        <td className="px-4 py-3">
                          {isSuperAdmin && (<button
                            onClick={async () => { const ok = await globalConfirm("למחוק כלל זה?"); if (ok) deleteScopeRuleMutation.mutate(rule.id); }}
                            className="p-1 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {activeTab === "bulk-assign" && (
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" /> שיוך/ביטול תפקידים המוני
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">תפקיד</label>
                <select
                  value={bulkRoleId}
                  onChange={(e) => setBulkRoleId(Number(e.target.value))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value={0}>בחר תפקיד...</option>
                  {dashboard?.roles?.map((r) => (
                    <option key={r.id} value={r.id}>{r.nameHe || r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">מזהי משתמשים (מופרדים בפסיק)</label>
                <input
                  value={bulkUserIds}
                  onChange={(e) => setBulkUserIds(e.target.value)}
                  placeholder="1, 2, 3, ..."
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleBulkAssign}
                disabled={!bulkRoleId || !bulkUserIds.trim() || bulkAssignMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {bulkAssignMutation.isPending ? "משייך..." : "שייך משתמשים"}
              </button>
              <button
                onClick={handleBulkRevoke}
                disabled={!bulkRoleId || !bulkUserIds.trim() || bulkRevokeMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-sm font-medium hover:bg-red-500/20 disabled:opacity-50"
              >
                <UserMinus className="w-4 h-4" />
                {bulkRevokeMutation.isPending ? "מבטל..." : "בטל שיוך"}
              </button>
            </div>
          </Card>

          {dashboard?.usersWithoutRoles && dashboard.usersWithoutRoles.length > 0 && (
            <Card className="p-5">
              <h3 className="font-bold mb-3 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                משתמשים ללא תפקיד ({dashboard.usersWithoutRoles.length})
              </h3>
              <p className="text-xs text-muted-foreground mb-3">לחץ על משתמש כדי להוסיף את המזהה שלו לשדה</p>
              <div className="flex flex-wrap gap-2">
                {dashboard.usersWithoutRoles.map(u => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setBulkUserIds(prev => {
                        const ids = prev ? prev.split(",").map(s => s.trim()).filter(Boolean) : [];
                        if (!ids.includes(String(u.id))) ids.push(String(u.id));
                        return ids.join(", ");
                      });
                    }}
                    className="text-sm bg-muted/10 hover:bg-muted/20 px-3 py-1.5 rounded border border-border/50 transition-colors"
                  >
                    {u.fullName} <span className="text-xs text-muted-foreground">({u.username})</span>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {activeTab === "denials" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">אירועי דחיית גישה שנרשמו במערכת</p>

          {(!denials || denials.denials.length === 0) ? (
            <Card className="p-8 text-center text-muted-foreground">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>לא נרשמו דחיות גישה</p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/10">
                    <th className="text-right px-4 py-3 text-muted-foreground">זמן</th>
                    <th className="text-right px-4 py-3 text-muted-foreground">משתמש</th>
                    <th className="text-right px-4 py-3 text-muted-foreground">פעולה נדחתה</th>
                    <th className="text-right px-4 py-3 text-muted-foreground">ישות</th>
                    <th className="text-right px-4 py-3 text-muted-foreground">רשומה</th>
                  </tr>
                </thead>
                <tbody>
                  {denials.denials.map((d) => {
                    const changes = d.changes as Record<string, unknown> | null;
                    return (
                    <tr key={d.id} className="border-b border-border/20 hover:bg-muted/5">
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(d.createdAt).toLocaleString("he-IL")}
                      </td>
                      <td className="px-4 py-3">{d.performedBy || "-"}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full">
                          {String(changes?.deniedAction || "unknown")}
                        </span>
                      </td>
                      <td className="px-4 py-3">{String(changes?.entityId || d.entityId || "-")}</td>
                      <td className="px-4 py-3">{String(changes?.recordId || d.recordId || "-")}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              {denials.total > denials.denials.length && (
                <div className="p-3 text-center text-xs text-muted-foreground border-t border-border/30">
                  מציג {denials.denials.length} מתוך {denials.total} אירועים
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon, label, value, subtext, color,
}: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; subtext: string; color: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-muted/10 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="text-lg sm:text-2xl font-bold">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-xs text-muted-foreground/60">{subtext}</div>
        </div>
      </div>
    </Card>
  );
}
