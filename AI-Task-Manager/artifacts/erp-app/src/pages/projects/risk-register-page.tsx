import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldAlert, Search, Plus, Edit2, Trash2, X, Save, Eye,
  ArrowUpDown, AlertTriangle, CheckCircle2, Shield, BarChart3, Copy
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
import StatusTransition from "@/components/status-transition";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const statusMap: Record<string, { label: string; color: string }> = {
  open: { label: "פתוח", color: "bg-red-500/20 text-red-400" },
  mitigated: { label: "מופחת", color: "bg-yellow-500/20 text-yellow-400" },
  closed: { label: "סגור", color: "bg-green-500/20 text-green-400" },
  monitoring: { label: "במעקב", color: "bg-blue-500/20 text-blue-400" },
};

const levelMap: Record<string, { label: string; color: string }> = {
  low: { label: "נמוך", color: "bg-green-500/20 text-green-400" },
  medium: { label: "בינוני", color: "bg-yellow-500/20 text-yellow-400" },
  high: { label: "גבוה", color: "bg-red-500/20 text-red-400" },
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}
    </div>
  );
}

export default function RiskRegisterPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterProbability, setFilterProbability] = useState("all");
  const [sortField, setSortField] = useState("riskScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);
  const [detailTab, setDetailTab] = useState("details");
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const { errors, validate, clearErrors } = useFormValidation<any>({
    title: { required: true, minLength: 2, message: "כותרת חובה" },
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/projects/risks`);
      if (res.ok) setItems(safeArray(await res.json()));
      else throw new Error("שגיאה בטעינת נתונים");
    } catch (e: any) {
      setError(e.message || "שגיאה בטעינת נתונים");
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterProbability === "all" || i.probability === filterProbability) &&
      (!search || [i.title, i.category, i.owner, i.description, i.mitigationPlan]
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
  }, [items, search, filterStatus, filterProbability, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      status: "open",
      probability: "medium",
      impact: "medium",
      identifiedDate: new Date().toISOString().slice(0, 10),
    });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ ...r, identifiedDate: r.identifiedDate?.slice(0, 10) });
    setShowForm(true);
  };

  const save = async () => {
    if (!validate(form)) return;
    setSaving(true);
    try {
      const url = editing ? `${API}/projects/risks/${editing.id}` : `${API}/projects/risks`;
      await authFetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק סיכון זה? פעולה זו אינה ניתנת לביטול.")) {
      await authFetch(`${API}/projects/risks/${id}`, { method: "DELETE" });
      load();
    }
  };

  const openCount = items.filter(i => i.status === "open").length;
  const highRisks = items.filter(i => i.probability === "high" || i.impact === "high").length;

  const kpis = [
    { label: "סה\"כ סיכונים", value: fmt(items.length), icon: ShieldAlert, color: "text-blue-400" },
    { label: "סיכונים פתוחים", value: fmt(openCount), icon: AlertTriangle, color: "text-red-400" },
    { label: "סיכונים גבוהים", value: fmt(highRisks), icon: Shield, color: "text-orange-400" },
    { label: "טופלו/נסגרו", value: fmt(items.filter(i => i.status === "closed" || i.status === "mitigated").length), icon: CheckCircle2, color: "text-green-400" },
    { label: "במעקב", value: fmt(items.filter(i => i.status === "monitoring").length), icon: BarChart3, color: "text-purple-400" },
  ];

  const columns = [
    { key: "title", label: "כותרת" },
    { key: "category", label: "קטגוריה" },
    { key: "probability", label: "הסתברות" },
    { key: "impact", label: "השפעה" },
    { key: "riskScore", label: "ציון" },
    { key: "owner", label: "אחראי" },
    { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldAlert className="text-red-400 w-6 h-6" />
            רשם סיכונים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">זיהוי, ניתוח וניהול סיכוני פרויקט</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown
            data={filtered}
            headers={{ title: "כותרת", category: "קטגוריה", probability: "הסתברות", impact: "השפעה", riskScore: "ציון", owner: "אחראי", status: "סטטוס" }}
            filename="risk_register"
          />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> סיכון חדש
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

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש סיכון, קטגוריה..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterProbability} onChange={e => setFilterProbability(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל ההסתברויות</option>
          {Object.entries(levelMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="סיכונים" actions={defaultBulkActions(selectedIds, clear, load, `${API}/projects/risks`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">שגיאה בטעינה</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין סיכונים</p>
          <p className="text-sm mt-1">{search || filterStatus !== "all" ? "נסה לשנות את הסינון" : "לחץ על 'סיכון חדש' כדי להתחיל"}</p>
        </div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
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
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <td className="px-2 py-3"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                    <td className="px-4 py-3 text-foreground font-medium">{r.title || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.category || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${levelMap[r.probability]?.color || "bg-muted/20 text-muted-foreground"}`}>
                        {levelMap[r.probability]?.label || r.probability}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${levelMap[r.impact]?.color || "bg-muted/20 text-muted-foreground"}`}>
                        {levelMap[r.impact]?.label || r.impact}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-foreground font-mono">{r.riskScore || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.owner || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>
                        {statusMap[r.status]?.label || r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button><button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/projects/risks`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                        {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.id || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setViewDetail(null); setDetailTab("details"); }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{viewDetail.title}</h2>
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="כותרת" value={viewDetail.title} />
                <DetailField label="קטגוריה" value={viewDetail.category} />
                <DetailField label="הסתברות">
                  <Badge className={levelMap[viewDetail.probability]?.color}>{levelMap[viewDetail.probability]?.label}</Badge>
                </DetailField>
                <DetailField label="השפעה">
                  <Badge className={levelMap[viewDetail.impact]?.color}>{levelMap[viewDetail.impact]?.label}</Badge>
                </DetailField>
                <DetailField label="ציון סיכון" value={String(viewDetail.riskScore || "—")} />
                <DetailField label="סטטוס">
                  <Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label}</Badge>
                </DetailField>
                <DetailField label="אחראי" value={viewDetail.owner} />
                <DetailField label="תאריך זיהוי" value={viewDetail.identifiedDate?.slice(0, 10)} />
                <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
                <div className="col-span-2"><DetailField label="תוכנית הפחתה" value={viewDetail.mitigationPlan} /></div>
              </div>
              )}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="risk" entityId={viewDetail.id} /></div>}
              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="risk" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="risk" entityId={viewDetail.id} /></div>}
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת סיכון" : "סיכון חדש"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">כותרת *</label>
                  <input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">קטגוריה</label>
                  <input value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">אחראי</label>
                  <input value={form.owner || ""} onChange={e => setForm({ ...form, owner: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">הסתברות</label>
                  <select value={form.probability || "medium"} onChange={e => setForm({ ...form, probability: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(levelMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">השפעה</label>
                  <select value={form.impact || "medium"} onChange={e => setForm({ ...form, impact: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(levelMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                  <select value={form.status || "open"} onChange={e => setForm({ ...form, status: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך זיהוי</label>
                  <input type="date" value={form.identifiedDate || ""} onChange={e => setForm({ ...form, identifiedDate: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור</label>
                  <textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })}
                    rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תוכנית הפחתה</label>
                  <textarea value={form.mitigationPlan || ""} onChange={e => setForm({ ...form, mitigationPlan: e.target.value })}
                    rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">אסטרטגיית תגובה</label>
                  <select value={form.responseStrategy || form.response_strategy || "mitigate"} onChange={e => setForm({ ...form, responseStrategy: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    <option value="avoid">הימנעות</option>
                    <option value="mitigate">הפחתה</option>
                    <option value="transfer">העברה</option>
                    <option value="accept">קבלה</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תדירות מעקב</label>
                  <select value={form.monitoringFrequency || form.monitoring_frequency || "weekly"} onChange={e => setForm({ ...form, monitoringFrequency: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    <option value="daily">יומי</option>
                    <option value="weekly">שבועי</option>
                    <option value="biweekly">דו-שבועי</option>
                    <option value="monthly">חודשי</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תנאי טריגר</label>
                  <input value={form.triggerConditions || form.trigger_conditions || ""} onChange={e => setForm({ ...form, triggerConditions: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="מתי מופעל הסיכון..." />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תוכנית מגירה</label>
                  <textarea value={form.contingencyPlan || form.contingency_plan || ""} onChange={e => setForm({ ...form, contingencyPlan: e.target.value })}
                    rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="מה לעשות אם הסיכון מתממש..." />
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
