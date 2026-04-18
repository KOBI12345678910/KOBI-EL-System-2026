import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, Search, Plus, Edit2, Trash2, X, Save, Eye, ArrowUpDown,
  AlertTriangle, DollarSign, Clock, CreditCard, Target, CheckCircle2,
  Phone, FileText, Users
} from "lucide-react";
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
import StatusTransition from "@/components/status-transition";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

const statusMap: Record<string, { label: string; color: string }> = {
  open: { label: "פתוח", color: "bg-red-500/20 text-red-400" },
  partial: { label: "חלקי", color: "bg-yellow-500/20 text-yellow-400" },
  collected: { label: "נגבה", color: "bg-green-500/20 text-green-400" },
  overdue: { label: "באיחור", color: "bg-orange-500/20 text-orange-400" },
  disputed: { label: "במחלוקת", color: "bg-purple-500/20 text-purple-400" },
  written_off: { label: "נמחק", color: "bg-muted/20 text-muted-foreground" },
};

const priorityMap: Record<string, { label: string; color: string }> = {
  low: { label: "נמוכה", color: "bg-muted/20 text-muted-foreground" },
  medium: { label: "בינונית", color: "bg-blue-500/20 text-blue-400" },
  high: { label: "גבוהה", color: "bg-orange-500/20 text-orange-400" },
  critical: { label: "קריטית", color: "bg-red-500/20 text-red-400" },
};

export default function CollectionManagementPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [sortField, setSortField] = useState("due_date");
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
    customer_name: { required: true, minLength: 2, message: "שם לקוח חובה" },
  });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/pricing/collections`);
      if (res.ok) setItems(safeArray(await res.json()));
      else throw new Error("שגיאה בטעינת נתונים");
    } catch (e: any) { setError(e.message); }
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
      (filterPriority === "all" || i.priority === filterPriority) &&
      (!search || [i.customer_name, i.invoice_number, i.collection_number, i.contact_person]
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
  }, [items, search, filterStatus, filterPriority, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ status: "open", priority: "medium", due_date: new Date().toISOString().slice(0, 10) });
    setShowForm(true);
  };
  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ ...r, due_date: r.due_date?.slice(0, 10) });
    setShowForm(true);
  };
  const save = async () => {
    if (!validate(form)) return;
    setSaving(true);
    try {
      const url = editing ? `${API}/pricing/collections/${editing.id}` : `${API}/pricing/collections`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };
  const remove = async (id: number) => {
    if (await globalConfirm("למחוק רשומת גבייה זו? פעולה זו אינה ניתנת לביטול.")) {
      await authFetch(`${API}/pricing/collections/${id}`, { method: "DELETE" });
      load();
    }
  };

  const totalDebt = items.reduce((s, i) => s + (i.amount || 0), 0);
  const totalCollected = items.filter(i => i.status === "collected").reduce((s, i) => s + (i.amount || 0), 0);
  const totalPaid = items.reduce((s, i) => s + (i.paid_amount || 0), 0);
  const collectionRate = totalDebt > 0 ? ((totalPaid / totalDebt) * 100).toFixed(1) : "0";

  const kpis = [
    { label: 'סה"כ חובות', value: `₪${fmt(totalDebt)}`, icon: DollarSign, color: "text-red-400" },
    { label: "נגבו", value: `₪${fmt(totalPaid)}`, icon: CheckCircle2, color: "text-green-400" },
    { label: "פתוחים", value: fmt(items.filter(i => i.status === "open").length), icon: Clock, color: "text-blue-400" },
    { label: "שיעור גבייה", value: `${collectionRate}%`, icon: Target, color: "text-purple-400" },
  ];

  const columns = [
    { key: "collection_number", label: "מספר" },
    { key: "customer_name", label: "לקוח" },
    { key: "invoice_number", label: "חשבונית" },
    { key: "amount", label: "סכום" },
    { key: "paid_amount", label: "שולם" },
    { key: "due_date", label: "תאריך" },
    { key: "days_overdue", label: "ימי איחור" },
    { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="text-red-400 w-6 h-6" />
            ניהול גבייה
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב חובות, גבייה ואיחורי תשלום</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown
            data={filtered}
            headers={{ collection_number: "מספר", customer_name: "לקוח", invoice_number: "חשבונית", amount: "סכום", paid_amount: "שולם", due_date: "תאריך", days_overdue: "ימי איחור", status: "סטטוס" }}
            filename="collections"
          />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> רשומה חדשה
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי לקוח, חשבונית, מספר..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל העדיפויות</option>
          {Object.entries(priorityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="גביות" actions={defaultBulkActions(selectedIds, clear, load, `${API}/pricing/collections`)} />

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
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין רשומות גבייה</p>
          <p className="text-sm mt-1">{search || filterStatus !== "all" ? "נסה לשנות את הסינון" : "לחץ על 'רשומה חדשה' כדי להתחיל"}</p>
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
                      <div className="flex items-center gap-1">
                        {col.label}
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginate(filtered).map(r => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <td className="px-2 py-3"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-red-400 font-bold">{r.collection_number || "—"}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{r.customer_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.invoice_number || "—"}</td>
                    <td className="px-4 py-3 text-red-400 font-bold">₪{fmt(r.amount)}</td>
                    <td className="px-4 py-3 text-green-400">₪{fmt(r.paid_amount)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.due_date?.slice(0, 10) || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${(r.days_overdue || 0) > 30 ? "bg-red-500/20 text-red-400" : (r.days_overdue || 0) > 0 ? "bg-yellow-500/20 text-yellow-400" : "bg-green-500/20 text-green-400"}`}>
                        {r.days_overdue || 0} ימים
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>
                        {statusMap[r.status]?.label || r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                        {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.id || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Shield className="w-5 h-5 text-red-400" />
                  גבייה {viewDetail.collection_number}
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
                <DetailField label="מספר גבייה" value={viewDetail.collection_number} />
                <DetailField label="לקוח" value={viewDetail.customer_name} />
                <DetailField label="חשבונית" value={viewDetail.invoice_number} />
                <DetailField label="סכום" value={`₪${fmt(viewDetail.amount)}`} />
                <DetailField label="שולם" value={`₪${fmt(viewDetail.paid_amount)}`} />
                <DetailField label="יתרה" value={`₪${fmt((viewDetail.amount || 0) - (viewDetail.paid_amount || 0))}`} />
                <DetailField label="תאריך פירעון" value={viewDetail.due_date?.slice(0, 10)} />
                <DetailField label="ימי איחור" value={String(viewDetail.days_overdue || 0)} />
                <DetailField label="סטטוס">
                  <Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge>
                </DetailField>
                <DetailField label="עדיפות">
                  <Badge className={priorityMap[viewDetail.priority]?.color}>{priorityMap[viewDetail.priority]?.label || viewDetail.priority || "—"}</Badge>
                </DetailField>
                <DetailField label="איש קשר" value={viewDetail.contact_person} />
                <DetailField label="טלפון" value={viewDetail.phone} />
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
                <div className="col-span-2"><DetailField label="פעולות שבוצעו" value={viewDetail.actions_taken} /></div>
              </div>
              )}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="collection" entityId={viewDetail.id} /></div>}
              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="collection" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="collection" entityId={viewDetail.id} /></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30">
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת רשומת גבייה" : "רשומת גבייה חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">לקוח *</label>
                    <input value={form.customer_name || ""} onChange={e => setForm({ ...form, customer_name: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="שם הלקוח" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">חשבונית</label>
                    <input value={form.invoice_number || ""} onChange={e => setForm({ ...form, invoice_number: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="מספר חשבונית" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סכום (₪) *</label>
                    <input type="number" value={form.amount || ""} onChange={e => setForm({ ...form, amount: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">שולם (₪)</label>
                    <input type="number" value={form.paid_amount || ""} onChange={e => setForm({ ...form, paid_amount: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך פירעון</label>
                    <input type="date" value={form.due_date || ""} onChange={e => setForm({ ...form, due_date: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                    <select value={form.status || "open"} onChange={e => setForm({ ...form, status: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">עדיפות</label>
                    <select value={form.priority || "medium"} onChange={e => setForm({ ...form, priority: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(priorityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">איש קשר</label>
                    <input value={form.contact_person || ""} onChange={e => setForm({ ...form, contact_person: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="שם איש קשר" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">טלפון</label>
                    <input value={form.phone || ""} onChange={e => setForm({ ...form, phone: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="מספר טלפון" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label>
                    <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="הערות נוספות" />
                  </div>
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">
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
