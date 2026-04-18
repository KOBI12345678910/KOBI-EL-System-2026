import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Search, Plus, Edit2, Trash2, X, Save, Eye,
  ArrowUpDown, AlertTriangle, CheckCircle2, UserCheck, Briefcase, BarChart3,
  Calendar, TrendingUp, Activity, Copy
} from "lucide-react";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const statusMap: Record<string, { label: string; color: string }> = {
  available: { label: "זמין", color: "bg-green-500/20 text-green-400" },
  assigned: { label: "משובץ", color: "bg-blue-500/20 text-blue-400" },
  overloaded: { label: "עמוס", color: "bg-red-500/20 text-red-400" },
  on_leave: { label: "בחופשה", color: "bg-yellow-500/20 text-yellow-400" },
  unavailable: { label: "לא זמין", color: "bg-muted/20 text-muted-foreground" },
};

const resourceTypeMap: Record<string, string> = {
  person: "אדם",
  machine: "מכונה",
  material: "חומר",
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}
    </div>
  );
}

type Tab = "list" | "calendar" | "utilization";

export default function ResourcesPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [utilization, setUtilization] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [saveConflict, setSaveConflict] = useState<any>(null);
  const pagination = useSmartPagination(25);
  const [detailTab, setDetailTab] = useState("details");
  const [activeTab, setActiveTab] = useState<Tab>("list");
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const { errors, validate, clearErrors } = useFormValidation<any>({
    name: { required: true, minLength: 2, message: "שם משאב חובה" },
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [resItems, resUtil, resConflicts] = await Promise.all([
        authFetch(`${API}/project-resources`),
        authFetch(`${API}/project-resources/utilization`),
        authFetch(`${API}/project-resources/conflicts`),
      ]);
      if (resItems.ok) setItems(safeArray(await resItems.json()));
      else throw new Error("שגיאה בטעינת נתונים");
      if (resUtil.ok) setUtilization(safeArray(await resUtil.json()));
      if (resConflicts.ok) setConflicts(safeArray(await resConflicts.json()));
    } catch (e: any) {
      setError(e.message || "שגיאה בטעינת נתונים");
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterType === "all" || i.resourceType === i.resource_type || i.resourceType === filterType || i.resource_type === filterType) &&
      (!search || [i.name, i.role, i.department, i.project_name, i.email]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterType, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setSaveConflict(null);
    setForm({ status: "assigned", resourceType: "person", allocationPct: "100" });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setSaveConflict(null);
    setForm({ ...r });
    setShowForm(true);
  };

  const save = async () => {
    if (!validate(form)) return;
    setSaving(true);
    setSaveConflict(null);
    try {
      const url = editing ? `${API}/project-resources/${editing.id}` : `${API}/project-resources`;
      const res = await authFetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await res.json();
      if (result.conflicts?.hasConflict) {
        setSaveConflict(result.conflicts);
      }
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק משאב זה? פעולה זו אינה ניתנת לביטול.")) {
      await authFetch(`${API}/project-resources/${id}`, { method: "DELETE" });
      load();
    }
  };

  const conflictCount = items.filter(i => i.hasConflict || i.has_conflict).length;
  const avgAllocation = utilization.length > 0
    ? (utilization.reduce((s, i) => s + parseFloat(i.total_allocation_pct || "0"), 0) / utilization.length).toFixed(0)
    : "0";

  const kpis = [
    { label: "סה\"כ משאבים", value: fmt(items.length), icon: Users, color: "text-blue-400" },
    { label: "זמינים", value: fmt(items.filter(i => i.status === "available").length), icon: UserCheck, color: "text-green-400" },
    { label: "משובצים", value: fmt(items.filter(i => i.status === "assigned").length), icon: Briefcase, color: "text-blue-400" },
    { label: "קונפליקטים", value: fmt(conflictCount), icon: AlertTriangle, color: conflictCount > 0 ? "text-red-400" : "text-muted-foreground" },
    { label: "הקצאה ממוצעת", value: `${avgAllocation}%`, icon: BarChart3, color: "text-purple-400" },
  ];

  const columns = [
    { key: "name", label: "שם" },
    { key: "role", label: "תפקיד" },
    { key: "resourceType", label: "סוג" },
    { key: "allocationPct", label: "הקצאה%" },
    { key: "startDate", label: "התחלה" },
    { key: "endDate", label: "סיום" },
    { key: "status", label: "סטטוס" },
    { key: "conflict", label: "קונפליקט" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="text-blue-400 w-6 h-6" />
            ניהול משאבים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">שיבוץ משאבים, ניצולת, עומס עבודה וזיהוי קונפליקטים</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown
            data={filtered}
            headers={{ name: "שם", role: "תפקיד", allocationPct: "הקצאה%", status: "סטטוס" }}
            filename="resources"
          />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> משאב חדש
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} />
            <div className="text-xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      {conflictCount > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-400 font-medium text-sm mb-2">
            <AlertTriangle className="w-4 h-4" />
            {conflictCount} קונפליקטי הקצאה זוהו
          </div>
          <div className="space-y-1">
            {conflicts.slice(0, 3).map((c: any) => (
              <div key={c.id} className="text-xs text-red-300">
                {c.name}: {c.conflict_details}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 border-b border-border/50">
        {([["list", "רשימה", Users], ["calendar", "לוח הקצאות", Calendar], ["utilization", "ניצולת", Activity]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setActiveTab(key as Tab)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 ${activeTab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {activeTab === "utilization" && (
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-purple-400" /> מפת ניצולת משאבים
          </h2>
          {utilization.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">אין נתוני ניצולת</p>
          ) : (
            <div className="space-y-3">
              {utilization.map((u: any, i: number) => {
                const pct = Math.min(parseFloat(u.total_allocation_pct || "0"), 200);
                const color = pct > 100 ? "bg-red-500" : pct > 80 ? "bg-yellow-500" : "bg-green-500";
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-medium">{u.name}</span>
                        {u.has_conflict && <AlertTriangle className="w-3 h-3 text-red-400" />}
                        <span className="text-muted-foreground">({u.project_count} פרויקטים)</span>
                      </div>
                      <span className={pct > 100 ? "text-red-400 font-bold" : "text-muted-foreground"}>{pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.min(pct / 2, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "calendar" && (
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-400" /> לוח הקצאות משאבים
          </h2>
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">אין הקצאות להצגה</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-right py-2 pr-3 text-muted-foreground font-medium w-40">משאב</th>
                    <th className="text-right py-2 pr-3 text-muted-foreground font-medium">פרויקט</th>
                    <th className="text-right py-2 pr-3 text-muted-foreground font-medium">התחלה</th>
                    <th className="text-right py-2 pr-3 text-muted-foreground font-medium">סיום</th>
                    <th className="text-right py-2 pr-3 text-muted-foreground font-medium">הקצאה</th>
                    <th className="text-right py-2 pr-3 text-muted-foreground font-medium">קונפליקט</th>
                  </tr>
                </thead>
                <tbody>
                  {items.filter(i => i.startDate || i.start_date).map(r => (
                    <tr key={r.id} className="border-b border-border/20 hover:bg-muted/10">
                      <td className="py-2 pr-3 text-foreground font-medium">{r.name}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{r.project_name || `פרויקט ${r.projectId || r.project_id}`}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{(r.startDate || r.start_date)?.slice(0, 10) || "—"}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{(r.endDate || r.end_date)?.slice(0, 10) || "—"}</td>
                      <td className="py-2 pr-3">
                        <Badge className={`text-[10px] ${parseFloat(r.allocationPct || r.allocation_pct || "0") > 100 ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"}`}>
                          {r.allocationPct || r.allocation_pct || 0}%
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">
                        {(r.hasConflict || r.has_conflict) ? (
                          <div className="flex items-center gap-1 text-red-400">
                            <AlertTriangle className="w-3 h-3" />
                            <span className="text-[10px]">קונפליקט</span>
                          </div>
                        ) : (
                          <CheckCircle2 className="w-3 h-3 text-green-400" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "list" && (
        <>
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש שם, תפקיד..."
                className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
              <option value="all">כל הסטטוסים</option>
              {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
              <option value="all">כל הסוגים</option>
              {Object.entries(resourceTypeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
          </div>

          <BulkActions selectedIds={selectedIds} onClear={clear} entityName="משאבים" actions={defaultBulkActions(selectedIds, clear, load, `${API}/project-resources`)} />

          {loading ? (
            <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden animate-pulse h-48" />
          ) : error ? (
            <div className="text-center py-16 text-red-400">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">שגיאה בטעינה</p>
              <p className="text-sm mt-1">{error}</p>
              <button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">אין משאבים</p>
              <p className="text-sm mt-1">{search || filterStatus !== "all" ? "נסה לשנות את הסינון" : "לחץ על 'משאב חדש' כדי להתחיל"}</p>
            </div>
          ) : (
            <>
              <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 border-b border-border/50">
                      <tr>
                        <th className="px-2 py-3 w-8" />
                        {columns.map(col => (
                          <th key={col.key} onClick={() => toggleSort(col.key)}
                            className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                            <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div>
                          </th>
                        ))}
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagination.paginate(filtered).map(r => (
                        <tr key={r.id} className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${(r.hasConflict || r.has_conflict) ? "bg-red-500/5" : ""}`}>
                          <td className="px-2 py-3"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                          <td className="px-4 py-3 text-foreground font-medium">
                            <div className="flex items-center gap-2">
                              {r.name}
                              {(r.hasConflict || r.has_conflict) && <AlertTriangle className="w-3.5 h-3.5 text-red-400" title={r.conflictDetails || r.conflict_details} />}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{r.role || "—"}</td>
                          <td className="px-4 py-3">
                            <Badge className="text-[10px] bg-muted/20 text-muted-foreground">
                              {resourceTypeMap[r.resourceType || r.resource_type] || r.resourceType || r.resource_type || "—"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={`text-[10px] ${parseFloat(r.allocationPct || r.allocation_pct || "0") > 100 ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"}`}>
                              {r.allocationPct || r.allocation_pct || 0}%
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{(r.startDate || r.start_date)?.slice(0, 10) || "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{(r.endDate || r.end_date)?.slice(0, 10) || "—"}</td>
                          <td className="px-4 py-3">
                            <Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>
                              {statusMap[r.status]?.label || r.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            {(r.hasConflict || r.has_conflict) ? (
                              <Badge className="text-[10px] bg-red-500/20 text-red-400">קונפליקט</Badge>
                            ) : (
                              <CheckCircle2 className="w-4 h-4 text-green-400" />
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                              <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button><button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/project-resources`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                              {isSuperAdmin && <button onClick={async () => { if (await globalConfirm(`למחוק את '${r.name}'?`)) remove(r.id); }} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <SmartPagination pagination={pagination} />
            </>
          )}
        </>
      )}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setViewDetail(null); setDetailTab("details"); }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  {viewDetail.name}
                  {(viewDetail.hasConflict || viewDetail.has_conflict) && <Badge className="bg-red-500/20 text-red-400 text-xs">קונפליקט</Badge>}
                </h2>
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <div className="p-5 grid grid-cols-2 gap-4">
                  <DetailField label="שם" value={viewDetail.name} />
                  <DetailField label="תפקיד" value={viewDetail.role} />
                  <DetailField label="סוג משאב" value={resourceTypeMap[viewDetail.resourceType || viewDetail.resource_type] || viewDetail.resourceType} />
                  <DetailField label="הקצאה" value={`${viewDetail.allocationPct || viewDetail.allocation_pct || 0}%`} />
                  <DetailField label="תאריך התחלה" value={(viewDetail.startDate || viewDetail.start_date)?.slice(0, 10)} />
                  <DetailField label="תאריך סיום" value={(viewDetail.endDate || viewDetail.end_date)?.slice(0, 10)} />
                  <DetailField label="תעריף שעתי" value={viewDetail.hourlyRate || viewDetail.hourly_rate ? `₪${fmt(viewDetail.hourlyRate || viewDetail.hourly_rate)}` : undefined} />
                  <DetailField label="סטטוס">
                    <Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label}</Badge>
                  </DetailField>
                  {(viewDetail.hasConflict || viewDetail.has_conflict) && (
                    <div className="col-span-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                      <div className="text-red-400 text-xs font-medium mb-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> קונפליקט הקצאה
                      </div>
                      <div className="text-red-300 text-xs">{viewDetail.conflictDetails || viewDetail.conflict_details}</div>
                    </div>
                  )}
                  <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
                </div>
              )}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="resource" entityId={viewDetail.id} /></div>}
              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="resource" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="resource" entityId={viewDetail.id} /></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }}
                  className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30">
                  <Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה
                </button>
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת משאב" : "משאב חדש"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              {saveConflict && (
                <div className="mx-5 mt-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <div className="text-red-400 text-xs font-medium flex items-center gap-1 mb-1">
                    <AlertTriangle className="w-3 h-3" /> אזהרת הקצאת יתר
                  </div>
                  <div className="text-red-300 text-xs">{saveConflict.conflictDetails}</div>
                </div>
              )}
              <div className="p-5 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם *</label>
                  <input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  <FormFieldError error={errors.name} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג משאב</label>
                  <select value={form.resourceType || form.resource_type || "person"} onChange={e => setForm({ ...form, resourceType: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(resourceTypeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תפקיד</label>
                  <input value={form.role || ""} onChange={e => setForm({ ...form, role: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">מזהה פרויקט</label>
                  <input type="number" value={form.projectId || form.project_id || ""} onChange={e => setForm({ ...form, projectId: Number(e.target.value) })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">הקצאה (%)</label>
                  <input type="number" min="0" max="200" value={form.allocationPct ?? form.allocation_pct ?? ""} onChange={e => setForm({ ...form, allocationPct: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">קיבולת שעות</label>
                  <input type="number" value={form.capacityHours || form.capacity_hours || ""} onChange={e => setForm({ ...form, capacityHours: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך התחלה</label>
                  <input type="date" value={(form.startDate || form.start_date || "").slice(0, 10)} onChange={e => setForm({ ...form, startDate: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך סיום</label>
                  <input type="date" value={(form.endDate || form.end_date || "").slice(0, 10)} onChange={e => setForm({ ...form, endDate: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תעריף שעתי (₪)</label>
                  <input type="number" value={form.hourlyRate || form.hourly_rate || ""} onChange={e => setForm({ ...form, hourlyRate: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                  <select value={form.status || "assigned"} onChange={e => setForm({ ...form, status: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label>
                  <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })}
                    rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving}
                  className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">
                  <Save className="w-3.5 h-3.5 inline ml-1" /> {editing ? "עדכון" : "שמירה"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
