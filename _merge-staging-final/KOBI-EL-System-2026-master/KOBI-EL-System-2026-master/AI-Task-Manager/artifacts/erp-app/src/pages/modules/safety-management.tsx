import { usePermissions } from "@/hooks/use-permissions";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import ImportButton from "@/components/import-button";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import {
  ShieldAlert, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, Clock,
  AlertTriangle, ArrowUpDown, XCircle, Eye, Users, DollarSign, Activity, Copy
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

interface SafetyIncident {
  id: number; incident_number: string; incident_type: string; incident_date: string;
  title: string; description: string; severity: string; status: string;
  location: string; department: string; reported_by: string; lost_work_days: number;
  root_cause: string; corrective_action: string; estimated_cost: number; notes: string;
}

const typeMap: Record<string, string> = { near_miss: "כמעט תאונה", first_aid: "עזרה ראשונה", medical: "טיפול רפואי", lost_time: "ימי היעדרות", property_damage: "נזק לרכוש", fire: "שריפה", fall: "נפילה", other: "אחר" };
const severityMap: Record<string, { label: string; color: string }> = { negligible: { label: "זניח", color: "bg-muted/20 text-muted-foreground" }, minor: { label: "קל", color: "bg-yellow-500/20 text-yellow-400" }, moderate: { label: "בינוני", color: "bg-orange-500/20 text-orange-400" }, major: { label: "משמעותי", color: "bg-red-500/20 text-red-400" }, critical: { label: "קריטי", color: "bg-red-600/30 text-red-300" } };
const statusMap: Record<string, { label: string; color: string }> = { reported: { label: "דווח", color: "bg-yellow-500/20 text-yellow-400" }, under_investigation: { label: "בחקירה", color: "bg-blue-500/20 text-blue-400" }, corrective_action: { label: "פעולה מתקנת", color: "bg-indigo-500/20 text-indigo-400" }, monitoring: { label: "ניטור", color: "bg-purple-500/20 text-purple-400" }, closed: { label: "סגור", color: "bg-green-500/20 text-green-400" } };

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

export default function SafetyManagementPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<SafetyIncident[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("incident_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SafetyIncident | null>(null);
  const [viewDetail, setViewDetail] = useState<SafetyIncident | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({
    title: { required: true, message: "כותרת נדרשת" },
    incidentDate: { required: true, message: "תאריך נדרש" },
    reportedBy: { required: true, message: "שם מדווח נדרש" },
  });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [r1, r2] = await Promise.all([authFetch(`${API}/safety-incidents`), authFetch(`${API}/safety-incidents/stats`)]);
      if (r1.ok) setItems(safeArray(await r1.json()));
      if (r2.ok) setStats((await r2.json()) || {});
    } catch (e: any) { setError(e.message || "שגיאה בטעינת נתונים"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterType === "all" || i.incident_type === filterType) &&
      (!search || [i.incident_number, i.title, i.reported_by, i.location].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he"); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterType, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ incidentType: "near_miss", severity: "minor", status: "reported", incidentDate: new Date().toISOString().slice(0, 10) }); setShowForm(true); };
  const openEdit = (r: SafetyIncident) => { setEditing(r); setForm({ incidentType: r.incident_type, incidentDate: r.incident_date?.slice(0, 10), title: r.title, description: r.description, severity: r.severity, status: r.status, location: r.location, department: r.department, reportedBy: r.reported_by, lostWorkDays: r.lost_work_days, rootCause: r.root_cause, correctiveAction: r.corrective_action, estimatedCost: r.estimated_cost, notes: r.notes }); setShowForm(true); };

  const save = async () => {
    if (!form.title) { alert("שדה חובה: כותרת האירוע"); return; }
    if (!form.incidentDate) { alert("שדה חובה: תאריך האירוע"); return; }
    setSaving(true);
    try {
      const url = editing ? `${API}/safety-incidents/${editing.id}` : `${API}/safety-incidents`;
      const res = await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; }
      setShowForm(false); load();
    } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };

  const remove = async (id: number) => {
    const item = items.find((x: any) => x.id === id);
    if (await globalConfirm("למחוק אירוע בטיחות?", { itemName: item?.title || String(id), entityType: "אירוע בטיחות" })) { await authFetch(`${API}/safety-incidents/${id}`, { method: "DELETE" }); load(); }
  };

  const kpis = [
    { label: "סה\"כ אירועים", value: fmt(stats.total || items.length), icon: ShieldAlert, color: "text-blue-400" },
    { label: "דווחו", value: fmt(stats.reported || 0), icon: Clock, color: "text-yellow-400" },
    { label: "בחקירה", value: fmt(stats.investigating || 0), icon: Activity, color: "text-blue-400" },
    { label: "נסגרו", value: fmt(stats.closed || 0), icon: CheckCircle2, color: "text-green-400" },
    { label: "ימי היעדרות", value: fmt(stats.total_lost_days || 0), icon: Users, color: "text-purple-400" },
    { label: "עלות מוערכת", value: `₪${fmt(stats.total_cost || 0)}`, icon: DollarSign, color: "text-orange-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><ShieldAlert className="text-red-400 w-6 h-6" />בטיחות תעשייתית</h1>
          <p className="text-sm text-muted-foreground mt-1">דיווח אירועים, חקירות, פעולות מתקנות ומונעות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ImportButton apiRoute="/api/safety-incidents" onSuccess={load} />
          <ExportDropdown data={filtered} headers={{ incident_number: "מספר", incident_type: "סוג", incident_date: "תאריך", title: "כותרת", severity: "חומרה", location: "מיקום", reported_by: "מדווח", lost_work_days: "ימי היעדרות", status: "סטטוס" }} filename="safety_incidents" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-red-600 text-foreground px-4 py-2.5 rounded-xl hover:bg-red-700 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> דיווח אירוע</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסוגים</option>{Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין אירועי בטיחות</p></div>
      ) : (<>
        <BulkActions items={filtered} selectedIds={bulk.selectedIds} onSelectionChange={bulk.setSelectedIds} actions={[
          defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/safety-incidents/${id}`, { method: "DELETE" }))); load(); }),
          defaultBulkActions.export(async (ids) => { const d = filtered.filter(r => ids.includes(r.id)); const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "safety_incidents.json"; a.click(); }),
        ]} />
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            <th className="px-2 py-3 w-10"><BulkCheckbox checked={bulk.selectedIds.length === filtered.length && filtered.length > 0} partial={bulk.selectedIds.length > 0 && bulk.selectedIds.length < filtered.length} onChange={() => bulk.toggleAll(filtered)} /></th>
            {[["incident_number","מספר"],["incident_type","סוג"],["incident_date","תאריך"],["title","כותרת"],["severity","חומרה"],["location","מיקום"],["reported_by","מדווח"],["lost_work_days","ימי היעדרות"],["status","סטטוס"]].map(([f,l]) => (
              <th key={f} onClick={() => toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r => (
              <tr key={r.id} className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${bulk.isSelected(r.id) ? "bg-primary/5" : ""}`}>
                <td className="px-2 py-3"><BulkCheckbox checked={bulk.isSelected(r.id)} onChange={() => bulk.toggle(r.id)} /></td>
                <td className="px-4 py-3 font-mono text-xs text-red-400 font-bold">{r.incident_number}</td>
                <td className="px-4 py-3 text-muted-foreground">{typeMap[r.incident_type] || r.incident_type}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.incident_date?.slice(0, 10)}</td>
                <td className="px-4 py-3 font-medium text-foreground max-w-[180px] truncate">{r.title}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${severityMap[r.severity]?.color || ""}`}>{severityMap[r.severity]?.label || r.severity}</Badge></td>
                <td className="px-4 py-3 text-muted-foreground">{r.location || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.reported_by}</td>
                <td className="px-4 py-3"><span className={`font-bold ${r.lost_work_days > 0 ? "text-red-400" : "text-green-400"}`}>{r.lost_work_days || 0}</span></td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || ""}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                  <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/safety-incidents`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.title || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                </div></td>
              </tr>
            ))}
          </tbody></table>
        </div></div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-red-400" />{viewDetail.incident_number}</h2><button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מספר" value={viewDetail.incident_number} />
                <DetailField label="כותרת" value={viewDetail.title} />
                <DetailField label="סוג" value={typeMap[viewDetail.incident_type] || viewDetail.incident_type} />
                <DetailField label="תאריך" value={viewDetail.incident_date?.slice(0, 10)} />
                <DetailField label="חומרה"><Badge className={severityMap[viewDetail.severity]?.color}>{severityMap[viewDetail.severity]?.label}</Badge></DetailField>
                <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label}</Badge></DetailField>
                <DetailField label="מיקום" value={viewDetail.location} />
                <DetailField label="מחלקה" value={viewDetail.department} />
                <DetailField label="מדווח" value={viewDetail.reported_by} />
                <DetailField label="ימי היעדרות" value={String(viewDetail.lost_work_days || 0)} />
                <DetailField label="עלות מוערכת" value={viewDetail.estimated_cost ? `₪${fmt(viewDetail.estimated_cost)}` : "—"} />
                <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
                <div className="col-span-2"><DetailField label="גורם שורש" value={viewDetail.root_cause} /></div>
                <div className="col-span-2"><DetailField label="פעולה מתקנת" value={viewDetail.corrective_action} /></div>
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>}
              {detailTab === "related" && <div className="p-5"><RelatedRecords tabs={[
                { key: "inspections", label: "בדיקות קשורות", endpoint: `/api/safety-incidents?location=${encodeURIComponent(viewDetail.location || "")}`, columns: [{ key: "incident_number", label: "מספר" }, { key: "title", label: "כותרת" }, { key: "incident_date", label: "תאריך" }], emptyMessage: "אין בדיקות קשורות" },
              ]} /></div>}
              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="safety_incident" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="safety_incident" entityId={viewDetail.id} /></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" />עריכה</button>
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת אירוע" : "דיווח אירוע בטיחות"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">כותרת *</label><input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג אירוע</label><select value={form.incidentType || "near_miss"} onChange={e => setForm({ ...form, incidentType: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">חומרה</label><select value={form.severity || "minor"} onChange={e => setForm({ ...form, severity: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(severityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך *</label><input type="date" value={form.incidentDate || ""} onChange={e => setForm({ ...form, incidentDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "reported"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מיקום</label><input value={form.location || ""} onChange={e => setForm({ ...form, location: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מחלקה</label><input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מדווח *</label><input value={form.reportedBy || ""} onChange={e => setForm({ ...form, reportedBy: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">ימי היעדרות</label><input type="number" value={form.lostWorkDays || ""} onChange={e => setForm({ ...form, lostWorkDays: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עלות מוערכת</label><input type="number" step="0.01" value={form.estimatedCost || ""} onChange={e => setForm({ ...form, estimatedCost: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור</label><textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">גורם שורש</label><textarea value={form.rootCause || ""} onChange={e => setForm({ ...form, rootCause: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">פעולה מתקנת</label><textarea value={form.correctiveAction || ""} onChange={e => setForm({ ...form, correctiveAction: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div>
              <div className="p-5 border-t border-border flex gap-3">
                <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-red-600 text-foreground px-6 py-2.5 rounded-xl hover:bg-red-700 text-sm font-medium disabled:opacity-50"><Save className="w-4 h-4" />{saving ? "שומר..." : editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2.5 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
