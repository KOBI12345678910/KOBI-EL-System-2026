import { useState, useEffect, useMemo } from "react";
import {
  FileEdit, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2,
  Clock, AlertTriangle, ArrowUpDown, DollarSign, Eye, Hash
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCurrency = (v: any) => Number(v || 0).toLocaleString("he-IL", { style: "currency", currency: "ILS" });

interface AdjustingEntry {
  id: number; entry_number: string; entry_date: string; entry_type: string;
  account_number: string; account_name: string; debit_amount: number;
  credit_amount: number; description: string; period_start: string;
  period_end: string; status: string; notes: string; created_at?: string;
}

const typeMap: Record<string, { label: string; color: string }> = {
  accrual: { label: "צבירה", color: "bg-blue-500/20 text-blue-400" },
  prepaid: { label: "הקדמה", color: "bg-amber-500/20 text-amber-400" },
  depreciation: { label: "פחת", color: "bg-purple-500/20 text-purple-400" },
  provision: { label: "הפרשה", color: "bg-cyan-500/20 text-cyan-400" },
  correction: { label: "תיקון", color: "bg-red-500/20 text-red-400" },
};
const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-yellow-500/20 text-yellow-400" },
  approved: { label: "מאושר", color: "bg-blue-500/20 text-blue-400" },
  posted: { label: "רשום", color: "bg-green-500/20 text-green-400" },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-400" },
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

export default function AdjustingEntriesPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<AdjustingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("entry_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AdjustingEntry | null>(null);
  const [viewDetail, setViewDetail] = useState<AdjustingEntry | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/adjusting-entries`);
      if (res.ok) setItems(safeArray(await res.json()));
      else setError("שגיאה בטעינת נתונים");
    } catch (e: any) { setError(e.message || "שגיאה"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterType === "all" || i.entry_type === filterType) &&
      (filterStatus === "all" || i.status === filterStatus) &&
      (!search || [i.entry_number, i.description, i.account_name]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "", vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [items, search, filterType, filterStatus, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ entryDate: new Date().toISOString().slice(0, 10), entryType: "accrual", status: "draft" }); setShowForm(true); };
  const openEdit = (r: AdjustingEntry) => { setEditing(r); setForm({ entryDate: r.entry_date?.slice(0, 10), entryType: r.entry_type, accountNumber: r.account_number, accountName: r.account_name, debitAmount: r.debit_amount, creditAmount: r.credit_amount, description: r.description, periodStart: r.period_start?.slice(0, 10), periodEnd: r.period_end?.slice(0, 10), status: r.status, notes: r.notes }); setShowForm(true); };
  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/adjusting-entries/${editing.id}` : `${API}/adjusting-entries`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };
  const remove = async (id: number) => {
    if (await globalConfirm("למחוק פקודת התאמה?")) {
      await authFetch(`${API}/adjusting-entries/${id}`, { method: "DELETE" }); load();
    }
  };

  const totalDebit = items.reduce((s, i) => s + Number(i.debit_amount || 0), 0);
  const totalCredit = items.reduce((s, i) => s + Number(i.credit_amount || 0), 0);

  const kpis = [
    { label: "סה\"כ פקודות", value: fmt(items.length), icon: Hash, color: "text-rose-400" },
    { label: "סה\"כ חיוב", value: fmtCurrency(totalDebit), icon: DollarSign, color: "text-green-400" },
    { label: "סה\"כ זיכוי", value: fmtCurrency(totalCredit), icon: DollarSign, color: "text-red-400" },
    { label: "טיוטות", value: fmt(items.filter(i => i.status === "draft").length), icon: Clock, color: "text-yellow-400" },
    { label: "מאושרות", value: fmt(items.filter(i => i.status === "approved").length), icon: CheckCircle2, color: "text-blue-400" },
    { label: "רשומות", value: fmt(items.filter(i => i.status === "posted").length), icon: FileEdit, color: "text-emerald-400" },
  ];

  const columns = [
    { key: "entry_number", label: "מספר" }, { key: "entry_date", label: "תאריך" },
    { key: "entry_type", label: "סוג" }, { key: "account_name", label: "חשבון" },
    { key: "debit_amount", label: "חיוב" }, { key: "credit_amount", label: "זיכוי" },
    { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><FileEdit className="text-rose-400 w-6 h-6" /> פקודות התאמה</h1>
          <p className="text-sm text-muted-foreground mt-1">פקודות התאמה בסוף תקופה</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ entry_number: "מספר", entry_date: "תאריך", entry_type: "סוג", account_name: "חשבון", debit_amount: "חיוב", credit_amount: "זיכוי", status: "סטטוס" }} filename="adjusting_entries" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> פקודה חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => (<motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4"><kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div></motion.div>))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסוגים</option>{Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (<div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (<div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (<div className="text-center py-16 text-muted-foreground"><FileEdit className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>אין פקודות התאמה</p></div>
      ) : (<>
        <BulkActions selectedIds={selectedIds} onClear={clear} entityName="פקודות התאמה" actions={defaultBulkActions(selectedIds, clear, load, `${API}/adjusting-entries`)} />
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border/50"><tr><th className="px-2 py-3 w-10"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered)} partial={selectedIds.length > 0 && selectedIds.length < filtered.length} /></th>{columns.map(col => (<th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div></th>))}<th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th></tr></thead>
          <tbody>{pagination.paginate(filtered).map(r => (
            <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
              <td className="px-2 py-3"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
              <td className="px-4 py-3 font-mono text-xs text-rose-400 font-bold">{r.entry_number}</td>
              <td className="px-4 py-3 text-muted-foreground text-xs">{r.entry_date?.slice(0, 10)}</td>
              <td className="px-4 py-3"><Badge className={`text-[10px] ${typeMap[r.entry_type]?.color || "bg-muted/20 text-muted-foreground"}`}>{typeMap[r.entry_type]?.label || r.entry_type}</Badge></td>
              <td className="px-4 py-3 text-muted-foreground">{r.account_number} {r.account_name && `— ${r.account_name}`}</td>
              <td className="px-4 py-3 font-mono text-green-400">{r.debit_amount > 0 ? fmtCurrency(r.debit_amount) : "—"}</td>
              <td className="px-4 py-3 font-mono text-red-400">{r.credit_amount > 0 ? fmtCurrency(r.credit_amount) : "—"}</td>
              <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
              <td className="px-4 py-3"><div className="flex gap-1">
                <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.account_number || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
              </div></td>
            </tr>
          ))}</tbody></table></div></div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">פקודה {viewDetail.entry_number}</h2><button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="flex border-b border-border/50">{[{id:"details",label:"פרטים"},{id:"related",label:"רשומות קשורות"},{id:"attachments",label:"מסמכים"},{id:"history",label:"היסטוריה"}].map(t => (<button key={t.id} onClick={() => setDetailTab(t.id)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${detailTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>))}</div>
              {detailTab === "details" && <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מספר" value={viewDetail.entry_number} /><DetailField label="תאריך" value={viewDetail.entry_date?.slice(0, 10)} />
                <DetailField label="סוג"><Badge className={typeMap[viewDetail.entry_type]?.color}>{typeMap[viewDetail.entry_type]?.label || viewDetail.entry_type}</Badge></DetailField>
                <DetailField label="חשבון" value={`${viewDetail.account_number} — ${viewDetail.account_name}`} />
                <DetailField label="חיוב" value={fmtCurrency(viewDetail.debit_amount)} /><DetailField label="זיכוי" value={fmtCurrency(viewDetail.credit_amount)} />
                <DetailField label="תקופה מ-" value={viewDetail.period_start?.slice(0, 10)} /><DetailField label="תקופה עד" value={viewDetail.period_end?.slice(0, 10)} />
                <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge></DetailField>
                <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>}
              {detailTab === "related" && <div className="p-5"><RelatedRecords tabs={[{key:"journal_entries",label:"פקודות יומן קשורות",icon:"documents",endpoint:`${API}/journal-entries?account=${viewDetail.account_number}&limit=5`,columns:[{key:"entry_number",label:"מספר"},{key:"date",label:"תאריך"},{key:"description",label:"תיאור"},{key:"amount",label:"סכום"}]}]} /></div>}
              {detailTab === "attachments" && <div className="p-5"><AttachmentsSection entityType="adjusting-entries" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="adjusting-entries" entityId={viewDetail.id} /></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה</button>
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת פקודה" : "פקודת התאמה חדשה"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 space-y-4"><div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך</label><input type="date" value={form.entryDate || ""} onChange={e => setForm({ ...form, entryDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג</label><select value={form.entryType || "accrual"} onChange={e => setForm({ ...form, entryType: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מספר חשבון</label><input value={form.accountNumber || ""} onChange={e => setForm({ ...form, accountNumber: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שם חשבון</label><input value={form.accountName || ""} onChange={e => setForm({ ...form, accountName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">חיוב</label><input type="number" step="0.01" value={form.debitAmount || ""} onChange={e => setForm({ ...form, debitAmount: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">זיכוי</label><input type="number" step="0.01" value={form.creditAmount || ""} onChange={e => setForm({ ...form, creditAmount: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תקופה מ-</label><input type="date" value={form.periodStart || ""} onChange={e => setForm({ ...form, periodStart: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תקופה עד</label><input type="date" value={form.periodEnd || ""} onChange={e => setForm({ ...form, periodEnd: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
              </div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור</label><input value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div>
              <div className="p-5 border-t border-border flex gap-3">
                <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl hover:bg-primary/90 text-sm font-medium disabled:opacity-50"><Save className="w-4 h-4" /> {saving ? "שומר..." : editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2.5 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
