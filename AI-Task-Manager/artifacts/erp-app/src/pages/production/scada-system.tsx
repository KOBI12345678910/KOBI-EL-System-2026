import { useState, useEffect, useMemo } from "react";
import {
  Zap, Thermometer, Settings, AlertTriangle, Activity, RefreshCw, Search,
  Eye, X, Plus, Edit2, Trash2, ArrowUpDown, Save, Gauge, Cpu, MapPin
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { WritePermissionGate } from "@/components/permission-gate";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

const statusMap: Record<string, { border: string; badge: string; label: string }> = {
  active: { border: "border-green-500/30 bg-green-500/5", badge: "bg-green-500/20 text-green-400", label: "פעיל" },
  maintenance: { border: "border-amber-500/30 bg-amber-500/5", badge: "bg-amber-500/20 text-amber-400", label: "תחזוקה" },
  retired: { border: "border-red-500/30 bg-red-500/5", badge: "bg-red-500/20 text-red-400", label: "יצא משירות" },
  idle: { border: "border-border/50 bg-card/30", badge: "bg-muted/20 text-muted-foreground", label: "לא פעיל" },
};

export default function SCADASystemPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [machinesData, setMachinesData] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();

  const validation = useFormValidation({
    name: { required: true, minLength: 2, message: "שם מכונה חובה" },
  });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [mRes, wRes] = await Promise.all([authFetch(`${API}/machines`), authFetch(`${API}/work-orders`)]);
      if (mRes.ok) setMachinesData(safeArray(await mRes.json()));
      if (wRes.ok) setWorkOrders(safeArray(await wRes.json()));
    } catch (e: any) { setError(e.message || "שגיאה בטעינת נתונים"); }
    setLoading(false);
  };

  const refetch = async () => { setFetching(true); await load(); setFetching(false); };
  useEffect(() => {
    load();
    let running = false;
    const interval = setInterval(async () => {
      if (running || document.hidden) return;
      running = true;
      try { await load(); } finally { running = false; }
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } };

  const machines = machinesData.map((m: any) => {
    const machineName = m.name || m.machine_name || "";
    const relatedOrders = workOrders.filter((wo: any) => (wo.machine_name || wo.machineName || wo.work_center || wo.workCenter || "") === machineName);
    const activeOrders = relatedOrders.filter((wo: any) => ["in_progress", "in-progress"].includes(wo.status));
    const hasWarning = m.status === "maintenance" || relatedOrders.some((wo: any) => wo.status === "overdue");
    const utilization = activeOrders.length > 0 ? Math.min(100, (activeOrders.length / Math.max(relatedOrders.length, 1)) * 100 + 40) : 0;
    return { id: m.id, name: machineName, status: hasWarning && m.status === "active" ? "maintenance" : (m.status || "idle"), location: m.location || "—", machineType: m.machine_type || m.machineType || "—", manufacturer: m.manufacturer || "—", orderCount: relatedOrders.length, activeCount: activeOrders.length, utilization: Math.round(utilization), maintenanceCount: Number(m.maintenance_count) || 0, model: m.model || "—", serial_number: m.serial_number || "—", installation_date: m.installation_date || m.created_at || "" };
  });

  const activeMachines = machines.filter(m => m.status === "active").length;
  const maintenanceMachines = machines.filter(m => m.status === "maintenance").length;
  const totalMachines = machines.length;
  const activeWorkOrders = workOrders.filter((o: any) => ["in_progress", "in-progress"].includes(o.status)).length;
  const avgUtilization = totalMachines > 0 ? Math.round(machines.reduce((s, m) => s + m.utilization, 0) / totalMachines) : 0;

  const filtered = useMemo(() => {
    let data = filter === "all" ? machines : machines.filter(m => m.status === filter);
    if (searchTerm) data = data.filter(m => [m.name, m.machineType, m.location, m.manufacturer].some(f => f?.toLowerCase().includes(searchTerm.toLowerCase())));
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [machines, filter, searchTerm, sortField, sortDir]);

  const paged = pagination.paginate(filtered);

  const openCreate = () => { setEditing(null); setForm({ name: "", machine_type: "", location: "", manufacturer: "", model: "", status: "idle" }); validation.clearErrors(); setShowForm(true); };
  const openEdit = (m: any) => { setEditing(m); setForm({ name: m.name, machine_type: m.machineType, location: m.location, manufacturer: m.manufacturer, model: m.model, status: m.status }); validation.clearErrors(); setShowForm(true); };

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true);
    try {
      const url = editing ? `${API}/machines/${editing.id}` : `${API}/machines`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק מכונה זו?")) {
      await authFetch(`${API}/machines/${id}`, { method: "DELETE" }); load();
    }
  };

  const kpis = [
    { label: "הזמנות בביצוע", value: fmt(activeWorkOrders), icon: Zap, color: "text-yellow-400" },
    { label: "מכונות רשומות", value: fmt(totalMachines), icon: Cpu, color: "text-blue-400" },
    { label: "מכונות פעילות", value: fmt(activeMachines), icon: Activity, color: "text-green-400" },
    { label: "בתחזוקה", value: `${maintenanceMachines}/${totalMachines}`, icon: AlertTriangle, color: "text-amber-400" },
    { label: "עומס ממוצע", value: `${avgUtilization}%`, icon: Gauge, color: "text-cyan-400" },
  ];

  const columns = [
    { key: "name", label: "שם מכונה" }, { key: "machineType", label: "סוג" },
    { key: "location", label: "מיקום" }, { key: "status", label: "סטטוס" },
    { key: "orderCount", label: "הזמנות" }, { key: "activeCount", label: "בביצוע" },
    { key: "utilization", label: "עומס %" },
  ];

  const relatedTabs = viewDetail ? [
    { key: "sensors", label: "חיישנים", icon: Thermometer, endpoint: `${API}/machines/${viewDetail.id}/sensors`, columns: [{ key: "name", label: "חיישן" }, { key: "value", label: "ערך" }, { key: "unit", label: "יחידה" }], emptyMessage: "אין חיישנים" },
    { key: "alerts", label: "התראות", icon: AlertTriangle, endpoint: `${API}/machine-maintenance?machineCode=${viewDetail.name}`, columns: [{ key: "maintenance_number", label: "מספר" }, { key: "title", label: "כותרת" }, { key: "status", label: "סטטוס" }], emptyMessage: "אין התראות" },
    { key: "orders", label: "הזמנות", icon: Cpu, endpoint: `${API}/work-orders?machine=${viewDetail.name}`, columns: [{ key: "order_number", label: "מספר" }, { key: "product_name", label: "מוצר" }, { key: "status", label: "סטטוס" }], emptyMessage: "אין הזמנות" },
  ] : [];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Settings className="text-blue-400 w-6 h-6" /> מערכת בקרה ופיקוח SCADA</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול ופיקוח בזמן אמת על מכונות והליכים</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {maintenanceMachines > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-400">
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              <span>{maintenanceMachines} מכונות בתחזוקה</span>
            </div>
          )}
          <ExportDropdown data={filtered} headers={{ name: "שם", machineType: "סוג", location: "מיקום", status: "סטטוס", orderCount: "הזמנות", utilization: "עומס%" }} filename="scada_machines" />
          <button onClick={refetch} disabled={fetching} className="flex items-center gap-1.5 bg-card border border-border text-muted-foreground px-3 py-2 rounded-xl text-sm hover:bg-muted disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${fetching ? "animate-spin" : ""}`} /> רענן
          </button>
          <WritePermissionGate module="production">
            <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> מכונה חדשה</button>
          </WritePermissionGate>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="חיפוש מכונה..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div className="flex gap-1">
          <button onClick={() => setViewMode("grid")} className={`px-3 py-1.5 text-xs rounded-lg ${viewMode === "grid" ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:bg-muted/30"}`}>כרטיסים</button>
          <button onClick={() => setViewMode("table")} className={`px-3 py-1.5 text-xs rounded-lg ${viewMode === "table" ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:bg-muted/30"}`}>טבלה</button>
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} מכונות</span>
      </div>

      <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
        defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/machines/${id}`, { method: "DELETE" }))); load(); }),
        defaultBulkActions.export(async () => {}),
      ]} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-border/50 rounded-2xl bg-card/50">
          <Settings className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{machines.length === 0 ? "אין מכונות רשומות במערכת" : "אין מכונות תואמות לסינון"}</p>
        </div>
      ) : viewMode === "table" ? (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50"><tr>
              <th className="px-2 py-3 w-8"><BulkCheckbox checked={selectedIds.length === paged.length && paged.length > 0} partial={selectedIds.length > 0 && selectedIds.length < paged.length} onChange={() => toggleAll(paged)} /></th>
              {columns.map(col => (
                <th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div></th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
            </tr></thead>
            <tbody>{paged.map(m => {
              const s = statusMap[m.status] || statusMap.idle;
              return (
                <tr key={m.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <td className="px-2 py-3"><BulkCheckbox checked={isSelected(m.id)} onChange={() => toggle(m.id)} /></td>
                  <td className="px-4 py-3 text-foreground font-medium">{m.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{m.machineType}</td>
                  <td className="px-4 py-3 text-muted-foreground">{m.location}</td>
                  <td className="px-4 py-3"><Badge className={`text-[10px] ${s.badge}`}>{s.label}</Badge></td>
                  <td className="px-4 py-3 text-foreground font-bold">{m.orderCount}</td>
                  <td className="px-4 py-3 text-blue-400 font-bold">{m.activeCount}</td>
                  <td className="px-4 py-3"><span className={`font-bold ${m.utilization >= 80 ? "text-green-400" : m.utilization >= 40 ? "text-amber-400" : "text-muted-foreground"}`}>{m.utilization}%</span></td>
                  <td className="px-4 py-3"><div className="flex gap-1">
                    <button onClick={() => { setDetailTab("details"); setViewDetail(m); }} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    <WritePermissionGate module="production">
                      <button onClick={() => openEdit(m)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                      <button onClick={() => remove(m.id)} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                    </WritePermissionGate>
                  </div></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div></div>
        <SmartPagination pagination={pagination} />
      </>) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m, i) => {
            const colors = statusMap[m.status] || statusMap.idle;
            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className={`border rounded-2xl p-4 ${colors.border} cursor-pointer hover:shadow-lg transition-shadow ${isSelected(m.id) ? "ring-2 ring-primary/50" : ""}`} onClick={() => { setDetailTab("details"); setViewDetail(m); }}>
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <BulkCheckbox checked={isSelected(m.id)} onChange={() => toggle(m.id)} />
                    <div>
                      <div className="font-semibold text-foreground">{m.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{m.machineType} · {m.location}</div>
                    </div>
                  </div>
                  <Badge className={`text-[10px] ${colors.badge}`}>{colors.label}</Badge>
                </div>
                {m.status === "maintenance" && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-2 mb-3 text-xs text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> מכונה בתחזוקה
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-card border border-border/30 rounded-xl p-2 text-center"><div className="text-xs text-muted-foreground">הזמנות</div><div className="text-lg font-bold text-foreground">{m.orderCount}</div></div>
                  <div className="bg-card border border-border/30 rounded-xl p-2 text-center"><div className="text-xs text-muted-foreground">בביצוע</div><div className="text-lg font-bold text-blue-400">{m.activeCount}</div></div>
                  <div className="bg-card border border-border/30 rounded-xl p-2 text-center"><div className="text-xs text-muted-foreground">תחזוקות</div><div className="text-lg font-bold text-muted-foreground">{m.maintenanceCount}</div></div>
                </div>
                <div className="mt-3">
                  <div className="text-xs text-muted-foreground mb-1">עומס ({m.utilization}%)</div>
                  <div className="bg-muted rounded-full h-2"><div className={`h-2 rounded-full ${m.utilization >= 80 ? "bg-green-500" : m.utilization >= 40 ? "bg-amber-500" : "bg-muted"}`} style={{ width: `${m.utilization}%` }} /></div>
                </div>
                <div className="mt-3 flex gap-1 justify-end">
                  <WritePermissionGate module="production">
                    <button onClick={e => { e.stopPropagation(); openEdit(m); }} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                    <button onClick={e => { e.stopPropagation(); remove(m.id); }} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                  </WritePermissionGate>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Cpu className="w-5 h-5 text-blue-400" />{viewDetail.name}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <div className="p-5 grid grid-cols-2 gap-4">
                  <DetailField label="שם מכונה" value={viewDetail.name} />
                  <DetailField label="סוג" value={viewDetail.machineType} />
                  <DetailField label="מיקום" value={viewDetail.location} />
                  <DetailField label="יצרן" value={viewDetail.manufacturer} />
                  <DetailField label="דגם" value={viewDetail.model} />
                  <DetailField label="סטטוס"><Badge className={(statusMap[viewDetail.status] || statusMap.idle).badge}>{(statusMap[viewDetail.status] || statusMap.idle).label}</Badge></DetailField>
                  <DetailField label="הזמנות עבודה" value={String(viewDetail.orderCount)} />
                  <DetailField label="בביצוע כעת" value={String(viewDetail.activeCount)} />
                  <DetailField label="עומס" value={`${viewDetail.utilization}%`} />
                  <DetailField label="תחזוקות" value={String(viewDetail.maintenanceCount)} />
                </div>
              )}
              {detailTab === "related" && <div className="p-4"><RelatedRecords tabs={relatedTabs} /></div>}
              {detailTab === "docs" && <div className="p-4"><AttachmentsSection entityType="machine" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-4"><ActivityLog entityType="machine" entityId={viewDetail.id} /></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה</button>
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת מכונה" : "מכונה חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5"><RequiredMark />שם מכונה</label><input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /><FormFieldError error={validation.errors.name} /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג מכונה</label><input value={form.machine_type || ""} onChange={e => setForm({ ...form, machine_type: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מיקום</label><input value={form.location || ""} onChange={e => setForm({ ...form, location: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">יצרן</label><input value={form.manufacturer || ""} onChange={e => setForm({ ...form, manufacturer: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">דגם</label><input value={form.model || ""} onChange={e => setForm({ ...form, model: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                    <select value={form.status || "idle"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"><Save className="w-4 h-4" />{saving ? "שומר..." : editing ? "עדכון" : "יצירה"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
