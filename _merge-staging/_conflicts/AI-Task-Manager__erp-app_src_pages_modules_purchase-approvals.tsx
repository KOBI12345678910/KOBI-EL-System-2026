import { useState, useEffect, useMemo } from "react";
import { usePermissions } from "@/hooks/use-permissions";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import {
  CheckSquare, Search, ArrowUpDown, Eye, X, AlertTriangle, Plus,
  Check, XCircle, Clock, DollarSign, Users, Edit2, Trash2, Save, Copy
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

interface Approval {
  id: number;
  request_number: string;
  title: string;
  requester_name: string;
  department: string;
  priority: string;
  status: string;
  total_estimated: number;
  needed_by: string;
  approved_by: string;
  approval_date: string;
  notes: string;
  created_at: string;
}

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין לאישור", color: "bg-amber-500/20 text-amber-400" },
  approved: { label: "מאושר", color: "bg-green-500/20 text-green-400" },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-400" },
  draft: { label: "טיוטה", color: "bg-muted/20 text-muted-foreground" },
};

const priorityMap: Record<string, { label: string; color: string }> = {
  low: { label: "נמוך", color: "bg-muted/20 text-muted-foreground" },
  normal: { label: "רגיל", color: "bg-blue-500/20 text-blue-400" },
  high: { label: "גבוה", color: "bg-orange-500/20 text-orange-400" },
  urgent: { label: "דחוף", color: "bg-red-500/20 text-red-400" },
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

export default function PurchaseApprovalsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<Approval | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Approval | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({
    title: { required: true, message: "כותרת נדרשת" },
    requesterName: { required: true, message: "שם מבקש נדרש" },
  });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/purchase-requests`);
      if (res.ok) {
        const raw = await res.json();
        setItems(safeArray(raw).map((r: any) => ({
          id: r.id, request_number: r.requestNumber || r.request_number, title: r.title,
          requester_name: r.requesterName || r.requester_name, department: r.department,
          priority: r.priority, status: r.status, total_estimated: Number(r.totalEstimated || r.total_estimated || 0),
          needed_by: r.neededBy || r.needed_by, approved_by: r.approvedBy || r.approved_by,
          approval_date: r.approvalDate || r.approval_date, notes: r.notes, created_at: r.createdAt || r.created_at,
        })));
      }
    } catch (e: any) { setError(e.message || "שגיאה בטעינת נתונים"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(r =>
      (filterStatus === "all" || r.status === filterStatus || (filterStatus === "pending" && (r.status === "ממתין לאישור" || r.status === "pending" || r.status === "טיוטה"))) &&
      (filterPriority === "all" || r.priority === filterPriority) &&
      (!search || [r.request_number, r.title, r.requester_name, r.department].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he"); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterPriority, sortField, sortDir]);

  const isPending = (s: string) => s === "ממתין לאישור" || s === "pending" || s === "טיוטה" || s === "draft";
  const isApproved = (s: string) => s === "מאושר" || s === "approved";
  const isRejected = (s: string) => s === "נדחה" || s === "rejected";

  const openCreate = () => { setEditing(null); setForm({ title: "", requesterName: "", department: "", priority: "normal", totalEstimated: "", neededBy: "", notes: "" }); setShowForm(true); };
  const openEdit = (r: Approval) => { setEditing(r); setForm({ title: r.title, requesterName: r.requester_name, department: r.department, priority: r.priority, totalEstimated: r.total_estimated, neededBy: r.needed_by?.slice(0, 10), notes: r.notes }); setShowForm(true); };

  const save = async () => {
    if (!form.title) { alert("שדה חובה: כותרת הבקשה"); return; }
    if (!form.requesterName) { alert("שדה חובה: שם המבקש"); return; }
    setSaving(true);
    try {
      const url = editing ? `${API}/purchase-requests/${editing.id}` : `${API}/purchase-requests`;
      const res = await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; }
      setShowForm(false); load();
    } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };

  const updateStatus = async (id: number, status: string) => {
    await authFetch(`${API}/purchase-requests/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, approvedBy: "מנהל רכש" }) });
    load();
  };

  const remove = async (id: number) => {
    const item = items.find((x: any) => x.id === id);
    if (await globalConfirm("למחוק דרישת רכש זו?", { itemName: item?.title || String(id), entityType: "דרישת רכש" })) {
      await authFetch(`${API}/purchase-requests/${id}`, { method: "DELETE" }); load();
    }
  };

  const pendingCount = items.filter(r => isPending(r.status)).length;
  const approvedCount = items.filter(r => isApproved(r.status)).length;
  const rejectedCount = items.filter(r => isRejected(r.status)).length;
  const totalAmount = items.reduce((s, r) => s + (r.total_estimated || 0), 0);
  const urgentPending = items.filter(r => (r.priority === "urgent" || r.priority === "דחוף") && isPending(r.status)).length;

  const kpis = [
    { label: "סה\"כ דרישות", value: fmt(items.length), icon: CheckSquare, color: "text-blue-400" },
    { label: "ממתינות לאישור", value: fmt(pendingCount), icon: Clock, color: "text-amber-400" },
    { label: "מאושרות", value: fmt(approvedCount), icon: Check, color: "text-green-400" },
    { label: "נדחו", value: fmt(rejectedCount), icon: XCircle, color: "text-red-400" },
    { label: "סכום כולל", value: fmtC(totalAmount), icon: DollarSign, color: "text-cyan-400" },
    { label: "דחופות ממתינות", value: fmt(urgentPending), icon: AlertTriangle, color: "text-orange-400" },
  ];

  const getStatusLabel = (s: string) => {
    if (isPending(s)) return statusMap.pending;
    if (isApproved(s)) return statusMap.approved;
    if (isRejected(s)) return statusMap.rejected;
    return statusMap.draft;
  };

  const columns = [
    { key: "request_number", label: "מספר" },
    { key: "title", label: "כותרת" },
    { key: "requester_name", label: "מבקש" },
    { key: "department", label: "מחלקה" },
    { key: "priority", label: "עדיפות" },
    { key: "total_estimated", label: "סכום" },
    { key: "needed_by", label: "נדרש עד" },
    { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><CheckSquare className="text-green-400 w-6 h-6" />אישורי רכש</h1>
          <p className="text-sm text-muted-foreground mt-1">אישור ודחיית דרישות רכש, מעקב סטטוס ועדיפויות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ request_number: "מספר", title: "כותרת", requester_name: "מבקש", department: "מחלקה", priority: "עדיפות", total_estimated: "סכום", status: "סטטוס" }} filename="purchase_approvals" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> דרישה חדשה</button>
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
        <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי מספר, כותרת, מבקש..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          <option value="pending">ממתין לאישור</option>
          <option value="approved">מאושר</option>
          <option value="rejected">נדחה</option>
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל העדיפויות</option>
          {Object.entries(priorityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה בטעינה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><CheckSquare className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין דרישות רכש</p><p className="text-sm mt-1">{search || filterStatus !== "all" ? "נסה לשנות את הסינון" : "לחץ על 'דרישה חדשה' כדי להתחיל"}</p>{!(search || filterStatus !== "all") && <button onClick={() => openCreate()} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 text-sm font-medium flex items-center gap-2 mx-auto"><Plus className="w-4 h-4" />דרישה חדשה</button>}</div>
      ) : (<>
        <BulkActions items={filtered} selectedIds={bulk.selectedIds} onSelectionChange={bulk.setSelectedIds} actions={[
          defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/purchase-requests/${id}`, { method: "DELETE" }))); load(); }),
          defaultBulkActions.statusChange("אישור מרובה", async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/purchase-requests/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "מאושר", approvedBy: "מנהל רכש" }) }))); load(); }),
          defaultBulkActions.export(async (ids) => { const d = filtered.filter(r => ids.includes(r.id)); const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "purchase_approvals.json"; a.click(); }),
        ]} />
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            <th className="px-2 py-3 w-10"><BulkCheckbox checked={bulk.selectedIds.length === filtered.length && filtered.length > 0} partial={bulk.selectedIds.length > 0 && bulk.selectedIds.length < filtered.length} onChange={() => bulk.toggleAll(filtered)} /></th>
            {columns.map(col => (
              <th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r => (
              <tr key={r.id} className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${bulk.isSelected(r.id) ? "bg-primary/5" : ""}`}>
                <td className="px-2 py-3"><BulkCheckbox checked={bulk.isSelected(r.id)} onChange={() => bulk.toggle(r.id)} /></td>
                <td className="px-4 py-3 font-mono text-xs text-green-400 font-bold">{r.request_number || `#${r.id}`}</td>
                <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">{r.title || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.requester_name || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.department || "—"}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${priorityMap[r.priority]?.color || "bg-muted/20 text-muted-foreground"}`}>{priorityMap[r.priority]?.label || r.priority}</Badge></td>
                <td className="px-4 py-3 text-cyan-400 font-medium">{r.total_estimated ? fmtC(r.total_estimated) : "—"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.needed_by ? new Date(r.needed_by).toLocaleDateString("he-IL") : "—"}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${getStatusLabel(r.status).color}`}>{getStatusLabel(r.status).label}</Badge></td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  {isPending(r.status) && <>
                    <button onClick={() => updateStatus(r.id, "מאושר")} className="p-1.5 hover:bg-green-500/20 rounded-lg" title="אשר"><Check className="w-3.5 h-3.5 text-green-400" /></button>
                    <button onClick={() => updateStatus(r.id, "נדחה")} className="p-1.5 hover:bg-red-500/20 rounded-lg" title="דחה"><XCircle className="w-3.5 h-3.5 text-red-400" /></button>
                  </>}
                  <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                  <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/purchase-requests`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.id || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><CheckSquare className="w-5 h-5 text-green-400" />דרישה {viewDetail.request_number || `#${viewDetail.id}`}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מספר דרישה" value={viewDetail.request_number || `#${viewDetail.id}`} />
                <DetailField label="כותרת" value={viewDetail.title} />
                <DetailField label="מבקש" value={viewDetail.requester_name} />
                <DetailField label="מחלקה" value={viewDetail.department} />
                <DetailField label="עדיפות"><Badge className={priorityMap[viewDetail.priority]?.color}>{priorityMap[viewDetail.priority]?.label || viewDetail.priority}</Badge></DetailField>
                <DetailField label="סטטוס"><Badge className={getStatusLabel(viewDetail.status).color}>{getStatusLabel(viewDetail.status).label}</Badge></DetailField>
                <DetailField label="סכום משוער" value={viewDetail.total_estimated ? fmtC(viewDetail.total_estimated) : "—"} />
                <DetailField label="נדרש עד" value={viewDetail.needed_by ? new Date(viewDetail.needed_by).toLocaleDateString("he-IL") : "—"} />
                <DetailField label={'אושר ע"י'} value={viewDetail.approved_by} />
                <DetailField label="תאריך אישור" value={viewDetail.approval_date?.slice(0, 10)} />
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>}
              {detailTab === "related" && <div className="p-5"><RelatedRecords tabs={[
                { key: "orders", label: "הזמנות רכש", endpoint: `/api/purchase-orders?requestId=${viewDetail.id}`, columns: [{ key: "orderNumber", label: "מספר הזמנה" }, { key: "status", label: "סטטוס" }, { key: "totalAmount", label: "סכום" }], emptyMessage: "אין הזמנות קשורות" },
              ]} /></div>}
              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="purchase_approval" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="purchase_approval" entityId={viewDetail.id} /></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                {isPending(viewDetail.status) && <>
                  <button onClick={() => { updateStatus(viewDetail.id, "מאושר"); setViewDetail(null); }} className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm hover:bg-green-500/30"><Check className="w-3.5 h-3.5 inline ml-1" />אישור</button>
                  <button onClick={() => { updateStatus(viewDetail.id, "נדחה"); setViewDetail(null); }} className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30"><XCircle className="w-3.5 h-3.5 inline ml-1" />דחייה</button>
                </>}
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
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת דרישה" : "דרישת רכש חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">כותרת *</label><input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="תיאור הדרישה" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שם מבקש *</label><input value={form.requesterName || ""} onChange={e => setForm({ ...form, requesterName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מחלקה</label><input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עדיפות</label><select value={form.priority || "normal"} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(priorityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סכום משוער</label><input type="number" value={form.totalEstimated || ""} onChange={e => setForm({ ...form, totalEstimated: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">נדרש עד</label><input type="date" value={form.neededBy || ""} onChange={e => setForm({ ...form, neededBy: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                </div>
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
