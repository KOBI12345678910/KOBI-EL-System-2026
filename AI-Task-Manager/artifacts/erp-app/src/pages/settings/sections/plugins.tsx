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
  Puzzle, Search, Plus, Edit2, Trash2, X, Save, Eye, ArrowUpDown, AlertTriangle,
  CheckCircle2, XCircle, Power, Package, Zap, Settings, RefreshCw
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
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
  updating: { label: "מתעדכן", color: "bg-blue-500/20 text-blue-400" },
};

const categoryMap: Record<string, string> = {
  integration: "אינטגרציה",
  ai: "בינה מלאכותית",
  export: "ייצוא",
  communication: "תקשורת",
  analytics: "ניתוח נתונים",
  security: "אבטחה",
  system: "מערכת",
  other: "אחר",
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>;
}

export default function PluginsSection() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
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
      const res = await authFetch(`${API}/settings/plugins`);
      if (res.ok) setItems(safeArray(await res.json()));
      else throw new Error("שגיאה בטעינת תוספים");
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterCategory === "all" || i.category === filterCategory) &&
      (!search || [i.name, i.description, i.author, i.version].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterCategory, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ status: "inactive", category: "other", version: "1.0.0" }); setShowForm(true); };
  const openEdit = (r: any) => { setEditing(r); setForm({ ...r }); setShowForm(true); };
  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/settings/plugins/${editing.id}` : `${API}/settings/plugins`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {} setSaving(false);
  };
  const remove = async (id: number) => {
    if (await globalConfirm("למחוק תוסף זה? פעולה זו אינה ניתנת לביטול.")) {
      await authFetch(`${API}/settings/plugins/${id}`, { method: "DELETE" }); load();
    }
  };
  const togglePlugin = async (r: any) => {
    const newStatus = r.status === "active" ? "inactive" : "active";
    await authFetch(`${API}/settings/plugins/${r.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...r, status: newStatus }) });
    load();
  };

  const kpis = [
    { label: "סה\"כ תוספים", value: fmt(items.length), icon: Puzzle, color: "text-blue-400" },
    { label: "פעילים", value: fmt(items.filter(i => i.status === "active").length), icon: CheckCircle2, color: "text-green-400" },
    { label: "כבויים", value: fmt(items.filter(i => i.status === "inactive").length), icon: XCircle, color: "text-muted-foreground" },
    { label: "שגיאות", value: fmt(items.filter(i => i.status === "error").length), icon: AlertTriangle, color: "text-red-400" },
  ];

  const columns = [
    { key: "name", label: "שם תוסף" },
    { key: "category", label: "קטגוריה" },
    { key: "version", label: "גרסה" },
    { key: "author", label: "מפתח" },
    { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Puzzle className="text-violet-400 w-6 h-6" /> ניהול תוספים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">התקנה, הפעלה וניהול תוספים ואינטגרציות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ name: "שם", category: "קטגוריה", version: "גרסה", author: "מפתח", status: "סטטוס" }} filename="plugins" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> תוסף חדש
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} />
            <div className="text-xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש תוסף..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הקטגוריות</option>
          {Object.entries(categoryMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה בטעינה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Puzzle className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין תוספים</p><p className="text-sm mt-1">{search || filterStatus !== "all" ? "נסה לשנות את הסינון" : "לחץ על 'תוסף חדש' להתחלה"}</p>{!(search || filterStatus !== "all" || filterCategory !== "all") && <button onClick={() => openCreate()} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 text-sm font-medium flex items-center gap-2 mx-auto"><Plus className="w-4 h-4" />תוסף חדש</button>}</div>
      ) : (<>
        <BulkActions selectedIds={selectedIds} onClear={clear} entityName="תוספים" actions={defaultBulkActions(selectedIds, clear, load, `${API}/settings/plugins`)} />
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50"><tr>
              <th className="px-2 py-3 w-10"><BulkCheckbox allIds={filtered.map((r: any) => r.id)} selectedIds={selectedIds} toggleAll={toggleAll} /></th>
              {columns.map(col => (
                <th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                  <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div>
                </th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
            </tr></thead>
            <tbody>{pagination.paginate(filtered).map(r => (
              <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="px-2 py-3 w-10"><BulkCheckbox id={r.id} selectedIds={selectedIds} toggle={toggle} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center"><Puzzle className="w-4 h-4 text-violet-400" /></div>
                    <div><div className="text-foreground font-medium">{r.name || "—"}</div><div className="text-xs text-muted-foreground truncate max-w-[200px]">{r.description || ""}</div></div>
                  </div>
                </td>
                <td className="px-4 py-3"><Badge className="text-[10px] bg-muted/50 text-muted-foreground">{categoryMap[r.category] || r.category || "—"}</Badge></td>
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.version || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.author || "—"}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={() => togglePlugin(r)} className="p-1.5 hover:bg-muted rounded-lg" title={r.status === "active" ? "כבה" : "הפעל"}><Power className={`w-3.5 h-3.5 ${r.status === "active" ? "text-green-400" : "text-muted-foreground"}`} /></button>
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
            <div className="p-5 border-b border-border flex justify-between items-center">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Puzzle className="w-5 h-5 text-violet-400" />{viewDetail.name}</h2>
              <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <DetailField label="שם" value={viewDetail.name} />
              <DetailField label="קטגוריה" value={categoryMap[viewDetail.category] || viewDetail.category} />
              <DetailField label="גרסה" value={viewDetail.version} />
              <DetailField label="מפתח" value={viewDetail.author} />
              <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label}</Badge></DetailField>
              <DetailField label="תאריך התקנה" value={viewDetail.installed_at?.slice(0, 10) || viewDetail.created_at?.slice(0, 10)} />
              <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
              <div className="col-span-2"><DetailField label="הגדרות" value={viewDetail.config ? JSON.stringify(viewDetail.config) : undefined} /></div>
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
                    <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה</button>
                    <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
                  </div>
                )}
                {detailTab === "related" && <RelatedRecords entityType="plugins" entityId={viewDetail.id} />}
                {detailTab === "attachments" && <AttachmentsSection entityType="plugins" entityId={viewDetail.id} />}
                {detailTab === "log" && <ActivityLog entityType="plugins" entityId={viewDetail.id} />}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}</AnimatePresence>

      <AnimatePresence>{showForm && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center">
              <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת תוסף" : "תוסף חדש"}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">שם תוסף *</label><input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">קטגוריה</label><select value={form.category || "other"} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(categoryMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">גרסה</label><input value={form.version || ""} onChange={e => setForm({ ...form, version: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מפתח</label><input value={form.author || ""} onChange={e => setForm({ ...form, author: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "inactive"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
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
        <ActivityLog entityType="plugins" />
        <RelatedRecords entityType="plugins" />
      </div>
    </div>
  );
}
