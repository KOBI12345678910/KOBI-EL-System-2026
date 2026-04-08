import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import {
  Bot, Search, Plus, Edit2, Trash2, X, Save, Eye, ArrowUpDown, AlertTriangle,
  CheckCircle2, Clock, Zap, GitBranch, Activity, Power, PlayCircle, PauseCircle
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  inactive: { label: "כבוי", color: "bg-muted/20 text-muted-foreground" },
  error: { label: "שגיאה", color: "bg-red-500/20 text-red-400" },
  draft: { label: "טיוטה", color: "bg-yellow-500/20 text-yellow-400" },
};

const triggerMap: Record<string, string> = {
  on_create: "ביצירת רשומה",
  on_update: "בעדכון רשומה",
  on_delete: "במחיקת רשומה",
  on_status_change: "בשינוי סטטוס",
  scheduled: "מתוזמן",
  webhook: "Webhook",
  manual: "ידני",
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>;
}

export default function AutomationSection() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const [detailTab, setDetailTab] = useState("details");

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/settings/automation`);
      if (res.ok) setItems(safeArray(await res.json()));
      else throw new Error("שגיאה בטעינת אוטומציות");
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (!search || [i.name, i.description, i.trigger_type, i.module_name].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ status: "draft", trigger_type: "on_create" }); setShowForm(true); };
  const openEdit = (r: any) => { setEditing(r); setForm({ ...r }); setShowForm(true); };
  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/settings/automation/${editing.id}` : `${API}/settings/automation`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {} setSaving(false);
  };
  const remove = async (id: number) => {
    if (await globalConfirm("למחוק אוטומציה זו?")) {
      await authFetch(`${API}/settings/automation/${id}`, { method: "DELETE" }); load();
    }
  };
  const toggleStatus = async (r: any) => {
    const newStatus = r.status === "active" ? "inactive" : "active";
    await authFetch(`${API}/settings/automation/${r.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...r, status: newStatus }) });
    load();
  };

  const kpis = [
    { label: "סה\"כ אוטומציות", value: fmt(items.length), icon: Bot, color: "text-blue-400" },
    { label: "פעילות", value: fmt(items.filter(i => i.status === "active").length), icon: CheckCircle2, color: "text-green-400" },
    { label: "כבויות", value: fmt(items.filter(i => i.status === "inactive").length), icon: PauseCircle, color: "text-muted-foreground" },
    { label: "שגיאות", value: fmt(items.filter(i => i.status === "error").length), icon: AlertTriangle, color: "text-red-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Bot className="text-blue-400 w-6 h-6" /> זרימות עבודה ואוטומציה</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול כללי אוטומציה, טריגרים ופעולות אוטומטיות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ name: "שם", trigger_type: "טריגר", module_name: "מודול", status: "סטטוס", executions: "הפעלות" }} filename="automations" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> אוטומציה חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש אוטומציה..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Bot className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין אוטומציות</p><p className="text-sm mt-1">{search ? "נסה לשנות את הסינון" : "לחץ על 'אוטומציה חדשה' להתחלה"}</p>{!(search || filterStatus !== "all") && <button onClick={() => openCreate()} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 text-sm font-medium flex items-center gap-2 mx-auto"><Plus className="w-4 h-4" />אוטומציה חדשה</button>}</div>
      ) : (<>
        <BulkActions selectedIds={selectedIds} onClear={clear} entityName="אוטומציות" actions={defaultBulkActions(selectedIds, clear, load, `${API}/settings/automation`)} />
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50"><tr>
              <th className="px-2 py-3 w-10"><BulkCheckbox allIds={filtered.map((r: any) => r.id)} selectedIds={selectedIds} toggleAll={toggleAll} /></th>
              {[{ key: "name", label: "שם" }, { key: "trigger_type", label: "טריגר" }, { key: "module_name", label: "מודול" }, { key: "executions", label: "הפעלות" }, { key: "last_run", label: "הפעלה אחרונה" }, { key: "status", label: "סטטוס" }].map(col => (
                <th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div></th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
            </tr></thead>
            <tbody>{pagination.paginate(filtered).map(r => (
              <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="px-2 py-3 w-10"><BulkCheckbox id={r.id} selectedIds={selectedIds} toggle={toggle} /></td>
                <td className="px-4 py-3"><div className="flex items-center gap-2"><Zap className={`w-4 h-4 ${r.status === "active" ? "text-green-400" : "text-muted-foreground"}`} /><div><div className="text-foreground font-medium">{r.name || "—"}</div><div className="text-xs text-muted-foreground truncate max-w-[200px]">{r.description || ""}</div></div></div></td>
                <td className="px-4 py-3"><Badge className="text-[10px] bg-blue-500/20 text-blue-400">{triggerMap[r.trigger_type] || r.trigger_type || "—"}</Badge></td>
                <td className="px-4 py-3 text-muted-foreground">{r.module_name || "—"}</td>
                <td className="px-4 py-3 text-foreground font-bold">{fmt(r.executions || r.run_count || 0)}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{r.last_run?.slice(0, 10) || r.last_execution?.slice(0, 10) || "—"}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={() => toggleStatus(r)} className="p-1.5 hover:bg-muted rounded-lg" title={r.status === "active" ? "כבה" : "הפעל"}><Power className={`w-3.5 h-3.5 ${r.status === "active" ? "text-green-400" : "text-muted-foreground"}`} /></button>
                  <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.id || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div></div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>{viewDetail && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Bot className="w-5 h-5 text-blue-400" />{viewDetail.name}</h2><button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <DetailField label="שם" value={viewDetail.name} />
              <DetailField label="טריגר" value={triggerMap[viewDetail.trigger_type] || viewDetail.trigger_type} />
              <DetailField label="מודול" value={viewDetail.module_name} />
              <DetailField label="הפעלות" value={fmt(viewDetail.executions || viewDetail.run_count || 0)} />
              <DetailField label="הפעלה אחרונה" value={viewDetail.last_run?.slice(0, 16) || viewDetail.last_execution?.slice(0, 16)} />
              <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label}</Badge></DetailField>
              <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
            </div>
            <div className="border-t border-border">
              <div className="flex gap-2 px-5 pt-3">
                {[{ id: "details", label: "פרטים" }, { id: "related", label: "רשומות קשורות" }, { id: "attachments", label: "קבצים" }, { id: "log", label: "לוג פעילות" }].map(tab => (
                  <button key={tab.id} onClick={() => setDetailTab(tab.id)} className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${detailTab === tab.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/30"}`}>{tab.label}</button>
                ))}
              </div>
              <div className="p-5">
                {detailTab === "details" && (
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm"><Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה</button>
                    <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
                  </div>
                )}
                {detailTab === "related" && <RelatedRecords entityType="automation" entityId={viewDetail.id} />}
                {detailTab === "attachments" && <AttachmentsSection entityType="automation" entityId={viewDetail.id} />}
                {detailTab === "log" && <ActivityLog entityType="automation" entityId={viewDetail.id} />}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}</AnimatePresence>

      <AnimatePresence>{showForm && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת אוטומציה" : "אוטומציה חדשה"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">שם *</label><input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">טריגר</label><select value={form.trigger_type || "on_create"} onChange={e => setForm({ ...form, trigger_type: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(triggerMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
              <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">מודול</label><input value={form.module_name || ""} onChange={e => setForm({ ...form, module_name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור</label><textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
              <button onClick={save} disabled={saving} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50"><Save className="w-3.5 h-3.5 inline ml-1" /> {editing ? "עדכון" : "שמירה"}</button>
            </div>
          </motion.div>
        </motion.div>
      )}</AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="automation" />
        <RelatedRecords entityType="automation" />
      </div>
    </div>
  );
}
