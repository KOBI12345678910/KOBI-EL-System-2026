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
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import {
  FileText, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, Clock,
  AlertTriangle, ArrowUpDown, Eye, Lock, FileCheck, RefreshCw, Copy
} from "lucide-react";
import { duplicateRecord } from "@/lib/duplicate-record";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

interface ControlledDocument {
  id: number; document_number: string; document_type: string; title: string;
  description: string; category: string; department: string; status: string;
  version: string; classification: string; author_name: string; owner_name: string;
  reviewer_name: string; approver_name: string; effective_date: string;
  review_date: string; review_frequency_months: number; related_standard: string;
  is_controlled: boolean; is_confidential: boolean; notes: string;
}

const typeMap: Record<string, string> = { procedure: "נוהל", work_instruction: "הוראת עבודה", policy: "מדיניות", form: "טופס", specification: "מפרט", drawing: "שרטוט", manual: "מדריך", certificate: "תעודה", other: "אחר" };
const statusMap: Record<string, { label: string; color: string }> = { draft: { label: "טיוטה", color: "bg-muted/20 text-muted-foreground" }, in_review: { label: "בסקירה", color: "bg-blue-500/20 text-blue-400" }, approved: { label: "מאושר", color: "bg-green-500/20 text-green-400" }, active: { label: "פעיל", color: "bg-emerald-500/20 text-emerald-400" }, obsolete: { label: "מיושן", color: "bg-orange-500/20 text-orange-400" }, archived: { label: "בארכיון", color: "bg-muted/20 text-muted-foreground" } };
const classificationMap: Record<string, { label: string; color: string }> = { public: { label: "ציבורי", color: "bg-green-500/20 text-green-400" }, internal: { label: "פנימי", color: "bg-blue-500/20 text-blue-400" }, confidential: { label: "חסוי", color: "bg-orange-500/20 text-orange-400" }, restricted: { label: "מוגבל", color: "bg-red-500/20 text-red-400" } };

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

export default function DocumentControlPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<ControlledDocument[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("document_number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ControlledDocument | null>(null);
  const [viewDetail, setViewDetail] = useState<ControlledDocument | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [r1, r2] = await Promise.all([authFetch(`${API}/controlled-documents`), authFetch(`${API}/controlled-documents/stats`)]);
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
      (filterType === "all" || i.document_type === filterType) &&
      (!search || [i.document_number, i.title, i.author_name].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he"); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterType, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ documentType: "procedure", status: "draft", classification: "internal", version: "1.0", isControlled: true }); setShowForm(true); };
  const openEdit = (r: ControlledDocument) => { setEditing(r); setForm({ documentType: r.document_type, title: r.title, description: r.description, category: r.category, department: r.department, status: r.status, version: r.version, classification: r.classification, authorName: r.author_name, ownerName: r.owner_name, reviewerName: r.reviewer_name, approverName: r.approver_name, effectiveDate: r.effective_date?.slice(0, 10), reviewDate: r.review_date?.slice(0, 10), relatedStandard: r.related_standard, isControlled: r.is_controlled, isConfidential: r.is_confidential, notes: r.notes }); setShowForm(true); };

  const save = async () => {
    if (!form.title) { alert("שדה חובה: כותרת המסמך"); return; }
    setSaving(true);
    try {
      const url = editing ? `${API}/controlled-documents/${editing.id}` : `${API}/controlled-documents`;
      const res = await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; }
      setShowForm(false); load();
    } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };

  const remove = async (id: number) => {
    const item = items.find((x: any) => x.id === id);
    if (await globalConfirm("למחוק מסמך?", { itemName: item?.title || String(id), entityType: "מסמך" })) { await authFetch(`${API}/controlled-documents/${id}`, { method: "DELETE" }); load(); }
  };

  const kpis = [
    { label: "סה\"כ מסמכים", value: fmt(stats.total || items.length), icon: FileText, color: "text-blue-400" },
    { label: "פעילים", value: fmt(stats.active || 0), icon: CheckCircle2, color: "text-green-400" },
    { label: "טיוטות", value: fmt(stats.drafts || 0), icon: Clock, color: "text-muted-foreground" },
    { label: "בסקירה", value: fmt(stats.in_review || 0), icon: Eye, color: "text-blue-400" },
    { label: "מבוקרים", value: fmt(stats.controlled || 0), icon: FileCheck, color: "text-emerald-400" },
    { label: "לסקירה", value: fmt(stats.review_due || 0), icon: RefreshCw, color: "text-purple-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><FileText className="text-cyan-400 w-6 h-6" />ניהול מסמכים מבוקר</h1>
          <p className="text-sm text-muted-foreground mt-1">בקרת מסמכים, גרסאות, סקירות, סיווג וחתימות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ImportButton apiRoute="/api/controlled-documents" onSuccess={load} />
          <ExportDropdown data={filtered} headers={{ document_number: "מספר", document_type: "סוג", title: "כותרת", version: "גרסה", classification: "סיווג", department: "מחלקה", status: "סטטוס" }} filename="controlled_documents" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> מסמך חדש</button>
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

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="מסמכים" actions={defaultBulkActions(selectedIds, clear, load, `${API}/controlled-documents`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><FileText className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין מסמכים</p></div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            <th className="px-2 py-3 text-center w-10"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered)} partial={selectedIds.length > 0 && selectedIds.length < filtered.length} /></th>
            {[["document_number","מספר"],["document_type","סוג"],["title","כותרת"],["version","גרסה"],["classification","סיווג"],["department","מחלקה"],["owner_name","בעלים"],["review_date","סקירה"],["status","סטטוס"]].map(([f,l]) => (
              <th key={f} onClick={() => toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r => (
              <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="px-2 py-3 text-center"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="px-4 py-3 font-mono text-xs text-cyan-400 font-bold">{r.document_number}</td>
                <td className="px-4 py-3 text-muted-foreground">{typeMap[r.document_type] || r.document_type}</td>
                <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">{r.title}{r.is_confidential && <Lock className="w-3 h-3 inline mr-1 text-red-400" />}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">v{r.version}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${classificationMap[r.classification]?.color || ""}`}>{classificationMap[r.classification]?.label || r.classification}</Badge></td>
                <td className="px-4 py-3 text-muted-foreground">{r.department || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.owner_name || "—"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.review_date?.slice(0, 10) || "—"}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || ""}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                  <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/controlled-documents`, r.id, { defaultStatus: "draft" }); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
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
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><FileText className="w-5 h-5 text-cyan-400" />{viewDetail.document_number}</h2><button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"attachments",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t=>(
                  <button key={t.key} onClick={()=>setDetailTab(t.key)} className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${detailTab===t.key?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מספר" value={viewDetail.document_number} />
                <DetailField label="כותרת" value={viewDetail.title} />
                <DetailField label="סוג" value={typeMap[viewDetail.document_type] || viewDetail.document_type} />
                <DetailField label="גרסה" value={`v${viewDetail.version}`} />
                <DetailField label="סיווג"><Badge className={classificationMap[viewDetail.classification]?.color}>{classificationMap[viewDetail.classification]?.label}</Badge></DetailField>
                <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label}</Badge></DetailField>
                <DetailField label="מחלקה" value={viewDetail.department} />
                <DetailField label="קטגוריה" value={viewDetail.category} />
                <DetailField label="מחבר" value={viewDetail.author_name} />
                <DetailField label="בעלים" value={viewDetail.owner_name} />
                <DetailField label="סוקר" value={viewDetail.reviewer_name} />
                <DetailField label="מאשר" value={viewDetail.approver_name} />
                <DetailField label="תאריך תוקף" value={viewDetail.effective_date?.slice(0, 10)} />
                <DetailField label="סקירה הבאה" value={viewDetail.review_date?.slice(0, 10)} />
                <DetailField label="תקן קשור" value={viewDetail.related_standard} />
                <DetailField label="מבוקר" value={viewDetail.is_controlled ? "כן" : "לא"} />
                <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>
              )}
              {detailTab === "related" && (
                <div className="p-5"><RelatedRecords tabs={[
                  { key: "assets", label: "נכסים קשורים", endpoint: `${API}/fixed-assets?documentId=${viewDetail.id}`, columns: [{ key: "asset_number", label: "מספר" }, { key: "asset_name", label: "שם" }] },
                ]} /></div>
              )}
              {detailTab === "attachments" && (
                <div className="p-5"><AttachmentsSection entityType="controlled-document" entityId={viewDetail.id} /></div>
              )}
              {detailTab === "history" && (
                <div className="p-5"><ActivityLog entityType="controlled-document" entityId={viewDetail.id} /></div>
              )}
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
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת מסמך" : "מסמך חדש"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">כותרת *</label><input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג</label><select value={form.documentType || "procedure"} onChange={e => setForm({ ...form, documentType: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">גרסה</label><input value={form.version || "1.0"} onChange={e => setForm({ ...form, version: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סיווג</label><select value={form.classification || "internal"} onChange={e => setForm({ ...form, classification: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(classificationMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מחלקה</label><input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מחבר</label><input value={form.authorName || ""} onChange={e => setForm({ ...form, authorName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">בעלים</label><input value={form.ownerName || ""} onChange={e => setForm({ ...form, ownerName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך תוקף</label><input type="date" value={form.effectiveDate || ""} onChange={e => setForm({ ...form, effectiveDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סקירה הבאה</label><input type="date" value={form.reviewDate || ""} onChange={e => setForm({ ...form, reviewDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תקן קשור</label><input value={form.relatedStandard || ""} onChange={e => setForm({ ...form, relatedStandard: e.target.value })} placeholder="ISO 9001" className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="flex items-center gap-4 pt-6">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={form.isControlled !== false} onChange={e => setForm({ ...form, isControlled: e.target.checked })} className="rounded" /> מבוקר</label>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={form.isConfidential || false} onChange={e => setForm({ ...form, isConfidential: e.target.checked })} className="rounded" /> חסוי</label>
                </div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור</label><textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div>
              <div className="p-5 border-t border-border flex gap-3">
                <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl hover:bg-primary/90 text-sm font-medium disabled:opacity-50"><Save className="w-4 h-4" />{saving ? "שומר..." : editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2.5 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
