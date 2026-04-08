import { useState, useEffect, useMemo } from "react";
import {
  FileText, Search, Plus, Edit2, Trash2, X, Save, AlertTriangle,
  ArrowUpDown, Upload, Eye, Hash, CheckCircle2, Clock, File
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { globalConfirm } from "@/components/confirm-dialog";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
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

interface ExpenseFile {
  id: number;
  file_name: string;
  file_url: string;
  vendor_name: string;
  description: string;
  amount: number;
  expense_date: string;
  status: string;
  upload_method: string;
  receipt_number: string;
  category: string;
  notes: string;
  approved_by: string;
  created_at: string;
}

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: "טיוטה", color: "bg-yellow-500/20 text-yellow-400" },
  approved: { label: "אושר", color: "bg-green-500/20 text-green-400" },
  paid: { label: "שולם", color: "bg-blue-500/20 text-blue-400" },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-400" },
};

const methodMap: Record<string, string> = {
  upload: "העלאה מהמחשב", email: "העלאה במייל", whatsapp: "WhatsApp", mobile: "העלאה מהנייד",
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

export default function ExpenseFilesPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<ExpenseFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ExpenseFile | null>(null);
  const [viewDetail, setViewDetail] = useState<ExpenseFile | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/expense-files`);
      if (res.ok) {
        setItems(safeArray(await res.json()));
      } else {
        const fallback = await authFetch(`${API}/finance/expenses?limit=100`);
        if (fallback.ok) {
          const d = await fallback.json();
          setItems(safeArray(d?.data || d));
        } else {
          setError("שגיאה בטעינת קבצי הוצאות");
        }
      }
    } catch (e: any) {
      setError(e.message || "שגיאה");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (!search || [i.file_name, i.vendor_name, i.description, i.receipt_number]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [items, search, filterStatus, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ status: "pending", uploadMethod: "upload", expenseDate: new Date().toISOString().slice(0, 10) });
    setShowForm(true);
  };

  const openEdit = (r: ExpenseFile) => {
    setEditing(r);
    setForm({
      fileName: r.file_name, vendorName: r.vendor_name, description: r.description,
      amount: r.amount, expenseDate: r.expense_date?.slice(0, 10), status: r.status,
      uploadMethod: r.upload_method, receiptNumber: r.receipt_number, category: r.category, notes: r.notes,
    });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/expense-files/${editing.id}` : `${API}/expense-files`;
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
    if (confirm("למחוק קובץ הוצאה זה?")) {
      await authFetch(`${API}/expense-files/${id}`, { method: "DELETE" });
      load();
    }
  };

  const totalAmount = items.reduce((s, i) => s + Number(i.amount || 0), 0);
  const kpis = [
    { label: "סה\"כ קבצים", value: fmt(items.length), icon: Hash, color: "text-blue-400" },
    { label: "סכום כולל", value: fmtCurrency(totalAmount), icon: FileText, color: "text-green-400" },
    { label: "אושרו", value: fmt(items.filter(i => i.status === "approved" || i.status === "paid").length), icon: CheckCircle2, color: "text-emerald-400" },
    { label: "ממתינים", value: fmt(items.filter(i => i.status === "pending").length), icon: Clock, color: "text-yellow-400" },
  ];

  const columns = [
    { key: "created_at", label: "תאריך" },
    { key: "file_name", label: "קובץ" },
    { key: "vendor_name", label: "ספק/עובד" },
    { key: "amount", label: "סכום" },
    { key: "status", label: "סטטוס" },
    { key: "upload_method", label: "שיטה" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="text-purple-400 w-6 h-6" /> קבצי הוצאות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול קבצי הוצאות שהועלו למערכת</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown
            data={filtered}
            headers={{ file_name: "קובץ", vendor_name: "ספק", amount: "סכום", status: "סטטוס", created_at: "תאריך" }}
            filename="expense_files"
          />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> העלאת הוצאה
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי שם קובץ, ספק..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

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
          <File className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין קבצי הוצאות</p>
          <p className="text-sm mt-1">{search || filterStatus !== "all" ? "נסה לשנות את הסינון" : "לחץ על 'העלאת הוצאה' להתחיל"}</p>
        </div>
      ) : (<>
        <BulkActions selectedIds={selectedIds} onClear={clear} entityName="קבצי הוצאות" actions={defaultBulkActions(selectedIds, clear, load, `${API}/expense-files`)} />
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="px-2 py-3 w-10"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered)} partial={selectedIds.length > 0 && selectedIds.length < filtered.length} /></th>
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
                    <td className="px-4 py-3 text-muted-foreground text-xs">{(r.created_at || r.expense_date)?.slice(0, 10) || "—"}</td>
                    <td className="px-4 py-3 text-foreground text-xs truncate max-w-[200px]">{r.file_name || `מסמך #${r.id}`}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.vendor_name || r.approved_by || "—"}</td>
                    <td className="px-4 py-3 text-foreground font-bold">{fmtCurrency(r.amount)}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>
                        {statusMap[r.status]?.label || r.status || "טיוטה"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{methodMap[r.upload_method] || r.upload_method || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{viewDetail.file_name || `מסמך #${viewDetail.id}`}</h2>
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">{[{id:"details",label:"פרטים"},{id:"related",label:"רשומות קשורות"},{id:"attachments",label:"מסמכים"},{id:"history",label:"היסטוריה"}].map(t => (<button key={t.id} onClick={() => setDetailTab(t.id)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${detailTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>))}</div>
              {detailTab === "details" && <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="שם קובץ" value={viewDetail.file_name} />
                <DetailField label="ספק/עובד" value={viewDetail.vendor_name} />
                <DetailField label="סכום" value={fmtCurrency(viewDetail.amount)} />
                <DetailField label="תאריך" value={(viewDetail.created_at || viewDetail.expense_date)?.slice(0, 10)} />
                <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge></DetailField>
                <DetailField label="שיטת העלאה" value={methodMap[viewDetail.upload_method] || viewDetail.upload_method} />
                <DetailField label="מספר קבלה" value={viewDetail.receipt_number} />
                <DetailField label="קטגוריה" value={viewDetail.category} />
                <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>}
              {detailTab === "related" && <div className="p-5"><RelatedRecords tabs={[{key:"expense_reports",label:"דוחות הוצאות",icon:"documents",endpoint:`${API}/expense-reports?limit=5`,columns:[{key:"report_number",label:"מספר"},{key:"employee_name",label:"עובד"},{key:"total_amount",label:"סכום"},{key:"status",label:"סטטוס"}]}]} /></div>}
              {detailTab === "attachments" && <div className="p-5"><AttachmentsSection entityType="expense-files" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="expense-files" entityId={viewDetail.id} /></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm">עריכה</button>
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת הוצאה" : "הוצאה חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">שם קובץ</label><input value={form.fileName || ""} onChange={e => setForm({ ...form, fileName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">ספק</label><input value={form.vendorName || ""} onChange={e => setForm({ ...form, vendorName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סכום</label><input type="number" value={form.amount || ""} onChange={e => setForm({ ...form, amount: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך</label><input type="date" value={form.expenseDate || ""} onChange={e => setForm({ ...form, expenseDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "pending"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מספר קבלה</label><input value={form.receiptNumber || ""} onChange={e => setForm({ ...form, receiptNumber: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">קטגוריה</label><input value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור</label><textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div>
              <div className="p-5 border-t border-border flex gap-3">
                <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl hover:bg-primary/90 text-sm disabled:opacity-50"><Save className="w-4 h-4" /> {saving ? "שומר..." : editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2.5 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
