import { useState, useEffect, useMemo } from "react";
import {
  FileText, Search, AlertTriangle, ArrowUpDown, Eye, X,
  DollarSign, Hash, Clock, Calendar, TrendingUp, Plus, Edit2, Trash2, Save
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

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

interface JournalEntry {
  id: number; entry_number: string; entry_date: string; description: string;
  account_number: string; account_name: string; debit: number; credit: number;
  reference: string; source: string; status: string; created_by: string;
  notes?: string;
}

const statusMap: Record<string, { label: string; color: string }> = {
  posted: { label: "רשום", color: "bg-green-500/20 text-green-400" },
  draft: { label: "טיוטה", color: "bg-yellow-500/20 text-yellow-400" },
  reversed: { label: "סטורנו", color: "bg-red-500/20 text-red-400" },
};

const sourceMap: Record<string, string> = {
  manual: "ידני", auto: "אוטומטי", import: "ייבוא", system: "מערכת",
};

export default function JournalReportPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortField, setSortField] = useState("entry_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<JournalEntry | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected, isAllSelected } = useBulkSelection();
  const [detailTab, setDetailTab] = useState("details");

  const load = async () => {
    setLoading(true); setError(null);
    try {
      let url = `${API}/journal-report`;
      const params = new URLSearchParams();
      if (dateFrom) params.append("from", dateFrom);
      if (dateTo) params.append("to", dateTo);
      if (params.toString()) url += `?${params}`;
      const res = await authFetch(url);
      if (res.ok) setItems(safeArray(await res.json()));
      else setError("שגיאה בטעינת נתונים");
    } catch (e: any) { setError(e.message || "שגיאה"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [dateFrom, dateTo]);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (!search || [i.entry_number, i.description, i.account_name, i.reference, i.created_by]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "", vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, sortField, sortDir]);

  const totalDebit = items.reduce((s, i) => s + Number(i.debit || 0), 0);
  const totalCredit = items.reduce((s, i) => s + Number(i.credit || 0), 0);
  const balance = totalDebit - totalCredit;

  const kpis = [
    { label: 'סה"כ פקודות', value: fmt(items.length), icon: Hash, color: "text-blue-400" },
    { label: 'סה"כ חובה', value: fmtCurrency(totalDebit), icon: TrendingUp, color: "text-green-400" },
    { label: 'סה"כ זכות', value: fmtCurrency(totalCredit), icon: DollarSign, color: "text-red-400" },
    { label: "הפרש", value: fmtCurrency(Math.abs(balance)), icon: Calendar, color: balance === 0 ? "text-emerald-400" : "text-orange-400" },
    { label: "טיוטות", value: fmt(items.filter(i => i.status === "draft").length), icon: Clock, color: "text-yellow-400" },
    { label: "רשומות", value: fmt(items.filter(i => i.status === "posted").length), icon: FileText, color: "text-emerald-400" },
  ];

  const openCreate = () => {
    setEditing(null);
    setForm({ entry_date: new Date().toISOString().slice(0, 10), description: "", account_number: "", account_name: "", debit: 0, credit: 0, reference: "", source: "manual", status: "draft", notes: "" });
    setShowForm(true);
  };

  const openEdit = (r: JournalEntry) => {
    setEditing(r);
    setForm({ entry_date: r.entry_date?.slice(0, 10), description: r.description, account_number: r.account_number, account_name: r.account_name, debit: r.debit, credit: r.credit, reference: r.reference, source: r.source, status: r.status, notes: r.notes || "" });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/journal-report/${editing.id}` : `${API}/journal-report`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק פקודת יומן זו? פעולה זו אינה ניתנת לביטול.")) {
      await authFetch(`${API}/journal-report/${id}`, { method: "DELETE" });
      load();
    }
  };

  const columns = [
    { key: "entry_number", label: "מספר" }, { key: "entry_date", label: "תאריך" },
    { key: "description", label: "תיאור" }, { key: "account_name", label: "חשבון" },
    { key: "debit", label: "חובה" }, { key: "credit", label: "זכות" },
    { key: "source", label: "מקור" }, { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="text-blue-400 w-6 h-6" /> דוח יומן
          </h1>
          <p className="text-sm text-muted-foreground mt-1">דוח פקודות יומן חשבונאיות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ entry_number: "מספר", entry_date: "תאריך", description: "תיאור", account_name: "חשבון", debit: "חובה", credit: "זכות", source: "מקור", status: "סטטוס" }} filename="journal_report" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> פקודה חדשה
          </button>
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
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי מספר, תיאור, חשבון..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm" title="מתאריך" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm" title="עד תאריך" />
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="פקודות יומן" actions={defaultBulkActions(selectedIds, clear, load, `${API}/journal-report`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה בטעינה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><FileText className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין פקודות יומן</p><p className="text-sm mt-1">{search || filterStatus !== "all" ? "נסה לשנות את הסינון" : "לחץ על 'פקודה חדשה' כדי להתחיל"}</p>{!(search || filterStatus !== "all") && <button onClick={() => openCreate()} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 text-sm font-medium flex items-center gap-2 mx-auto"><Plus className="w-4 h-4" />פקודה חדשה</button>}</div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border/50"><tr>
            <th className="px-4 py-3 w-10"><BulkCheckbox checked={isAllSelected(filtered.map(r => r.id))} onChange={() => toggleAll(filtered.map(r => r.id))} /></th>
            {columns.map(col => (<th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div></th>))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead>
          <tbody>{pagination.paginate(filtered).map(r => (
            <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
              <td className="px-4 py-3 font-mono text-xs text-blue-400 font-bold">{r.entry_number}</td>
              <td className="px-4 py-3 text-muted-foreground text-xs">{r.entry_date?.slice(0, 10)}</td>
              <td className="px-4 py-3 text-foreground">{r.description || "—"}</td>
              <td className="px-4 py-3 text-muted-foreground">{r.account_name || "—"}</td>
              <td className="px-4 py-3 text-green-400 font-bold">{Number(r.debit) > 0 ? fmtCurrency(r.debit) : ""}</td>
              <td className="px-4 py-3 text-red-400 font-bold">{Number(r.credit) > 0 ? fmtCurrency(r.credit) : ""}</td>
              <td className="px-4 py-3 text-muted-foreground text-xs">{sourceMap[r.source] || r.source || "—"}</td>
              <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.entry_number || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                </div>
              </td>
            </tr>
          ))}</tbody>
          <tfoot><tr className="bg-muted/20 font-bold">
            <td colSpan={4} className="px-4 py-3 text-foreground">{'סה"כ'}</td>
            <td className="px-4 py-3 text-green-400">{fmtCurrency(totalDebit)}</td>
            <td className="px-4 py-3 text-red-400">{fmtCurrency(totalCredit)}</td>
            <td colSpan={3}></td>
          </tr></tfoot>
        </table></div></div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><FileText className="w-5 h-5 text-blue-400" /> פקודה {viewDetail.entry_number}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border">
                {[{k:"details",l:"פרטים"},{k:"related",l:"רשומות קשורות"},{k:"attachments",l:"מסמכים"},{k:"history",l:"היסטוריה"}].map(t=>(
                  <button key={t.k} onClick={()=>setDetailTab(t.k)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${detailTab===t.k?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"}`}>{t.l}</button>
                ))}
              </div>
              {detailTab === "details" && (
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מספר" value={viewDetail.entry_number} />
                <DetailField label="תאריך" value={viewDetail.entry_date?.slice(0, 10)} />
                <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
                <DetailField label="חשבון" value={viewDetail.account_name} />
                <DetailField label="מספר חשבון" value={viewDetail.account_number} />
                <DetailField label="חובה" value={fmtCurrency(viewDetail.debit)} />
                <DetailField label="זכות" value={fmtCurrency(viewDetail.credit)} />
                <DetailField label="אסמכתא" value={viewDetail.reference} />
                <DetailField label="מקור" value={sourceMap[viewDetail.source] || viewDetail.source} />
                <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge></DetailField>
                <DetailField label={'נוצר ע"י'} value={viewDetail.created_by} />
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>
              )}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="journal-entry" entityId={viewDetail.id} /></div>}
              {detailTab === "attachments" && <div className="p-5"><AttachmentsSection entityType="journal-entry" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="journal-entry" entityId={viewDetail.id} /></div>}
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת פקודה" : "פקודת יומן חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך *</label><input type="date" value={form.entry_date || ""} onChange={e => setForm({ ...form, entry_date: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מספר חשבון</label><input value={form.account_number || ""} onChange={e => setForm({ ...form, account_number: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שם חשבון</label><input value={form.account_name || ""} onChange={e => setForm({ ...form, account_name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">חובה</label><input type="number" min={0} value={form.debit ?? ""} onChange={e => setForm({ ...form, debit: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">זכות</label><input type="number" min={0} value={form.credit ?? ""} onChange={e => setForm({ ...form, credit: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">אסמכתא</label><input value={form.reference || ""} onChange={e => setForm({ ...form, reference: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מקור</label><select value={form.source || "manual"} onChange={e => setForm({ ...form, source: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(sourceMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                </div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור *</label><textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="תיאור הפקודה" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" /> {saving ? "שומר..." : "שמור"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
