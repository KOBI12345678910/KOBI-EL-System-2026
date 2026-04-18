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
  AlertTriangle, Shield, TrendingDown, Clock, DollarSign, Search, Plus, Pencil,
  Trash2, ArrowUpDown, CreditCard, FileText, Scale, Eye, X, Users
} from "lucide-react";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";
import ActivityLog from "@/components/activity-log";
import StatusTransition from "@/components/status-transition";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  open: { label: "פתוח", color: "bg-blue-500/20 text-blue-400" },
  in_progress: { label: "בטיפול", color: "bg-cyan-500/20 text-cyan-400" },
  partial: { label: "תשלום חלקי", color: "bg-amber-500/20 text-amber-400" },
  paid: { label: "שולם", color: "bg-green-500/20 text-green-400" },
  disputed: { label: "במחלוקת", color: "bg-purple-500/20 text-purple-400" },
  written_off: { label: "נמחק", color: "bg-muted/20 text-muted-foreground" },
  legal: { label: "הליך משפטי", color: "bg-red-500/20 text-red-400" },
};
const RISK_MAP: Record<string, { label: string; color: string }> = {
  low: { label: "נמוך", color: "bg-green-500/20 text-green-400" },
  medium: { label: "בינוני", color: "bg-yellow-500/20 text-yellow-400" },
  high: { label: "גבוה", color: "bg-orange-500/20 text-orange-400" },
  critical: { label: "קריטי", color: "bg-red-500/20 text-red-400" },
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

const emptyForm: any = { status: "open", riskLevel: "low", originalAmount: 0, paidAmount: 0, daysOverdue: 0, escalationLevel: 0, dunningLettersSent: 0 };

export default function CollectionsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRisk, setFilterRisk] = useState("all");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const validation = useFormValidation({ customerName: { required: true }, originalAmount: { min: 0 } });
  const [detailTab, setDetailTab] = useState("details");

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [r1, r2] = await Promise.all([authFetch(`${API}/crm-collections`), authFetch(`${API}/crm-collections/stats`)]);
      if (r1.ok) setItems(safeArray(await r1.json()));
      if (r2.ok) setStats((await r2.json()) || {});
    } catch (e: any) { setError(e.message || "שגיאה"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    const url = editItem ? `${API}/crm-collections/${editItem.id}` : `${API}/crm-collections`;
    try {
      await authFetch(url, { method: editItem ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); setEditItem(null); setForm(emptyForm); load();
    } catch {}
  };

  const handleDelete = async (id: number) => {
    const ok = await globalConfirm({ title: "מחיקת תיק גבייה", message: "האם למחוק?", confirmText: "מחק", variant: "destructive" });
    if (!ok) return;
    try { await authFetch(`${API}/crm-collections/${id}`, { method: "DELETE" }); load(); } catch {}
  };

  const openEdit = (r: any) => {
    setEditItem(r);
    setForm({ customerName: r.customer_name, invoiceNumber: r.invoice_number, originalAmount: r.original_amount, paidAmount: r.paid_amount, dueDate: r.due_date?.slice(0,10), daysOverdue: r.days_overdue, riskLevel: r.risk_level, status: r.status, escalationLevel: r.escalation_level, collector: r.collector, phone: r.phone, email: r.email, notes: r.notes, dunningLettersSent: r.dunning_letters_sent });
    setShowForm(true);
  };

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(r => {
      const s = `${r.customer_name} ${r.collection_number} ${r.invoice_number}`.toLowerCase();
      return (!search || s.includes(search.toLowerCase())) && (filterStatus === "all" || r.status === filterStatus) && (filterRisk === "all" || r.risk_level === filterRisk);
    });
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb)); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterRisk, sortField, sortDir]);

  const kpis = [
    { label: "סה\"כ תיקים", value: fmt(stats.total || items.length), icon: FileText, color: "text-blue-400" },
    { label: "חוב כולל", value: fmtC(stats.total_outstanding || 0), icon: DollarSign, color: "text-red-400" },
    { label: "נגבה", value: fmtC(stats.total_paid || 0), icon: CreditCard, color: "text-green-400" },
    { label: "סיכון קריטי", value: fmt(stats.critical_count || 0), icon: AlertTriangle, color: "text-orange-400" },
    { label: "מעל 90 יום", value: fmt(stats.over_90_days || 0), icon: TrendingDown, color: "text-purple-400" },
    { label: "ממוצע ימי איחור", value: fmt(Math.round(stats.avg_overdue_days || 0)), icon: Clock, color: "text-amber-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Scale className="text-blue-400 w-6 h-6" />גבייה וסיכוני אשראי</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול גבייה, מעקב חובות ודירוג סיכונים</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setEditItem(null); setForm(emptyForm); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm"><Plus className="w-4 h-4" /> תיק חדש</button>
          <ExportDropdown data={filtered} headers={{ collection_number: "מספר", customer_name: "לקוח", original_amount: "סכום", balance_due: "יתרה", risk_level: "סיכון", status: "סטטוס" }} filename="collections" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי לקוח, חשבונית..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסטטוסים</option>{Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל רמות הסיכון</option>{Object.entries(RISK_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
        defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/crm-collections/${id}`, { method: "DELETE" }))); load(); }),
        defaultBulkActions.export(async (ids) => { const rows = filtered.filter(r => ids.has(r.id)); const csv = ["לקוח,סכום,יתרה,סטטוס", ...rows.map(r => `${r.customer_name},${r.original_amount},${r.balance_due},${r.status}`)].join("\n"); const b = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "collections_export.csv"; a.click(); }),
      ]} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><FileText className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין תיקי גבייה</p></div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            <th className="px-2 py-3 w-10"><BulkCheckbox items={filtered} selectedIds={selectedIds} onToggleAll={toggleAll} mode="all" /></th>
            {[["collection_number","מספר"],["customer_name","לקוח"],["original_amount","סכום"],["paid_amount","שולם"],["balance_due","יתרה"],["days_overdue","ימי איחור"],["risk_level","סיכון"],["status","סטטוס"]].map(([f,l]) => (
              <th key={f} onClick={() => toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r => (
              <tr key={r.id} className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${isSelected(r.id) ? "bg-primary/5" : ""}`}>
                <td className="px-2 py-3"><BulkCheckbox id={r.id} selectedIds={selectedIds} onToggle={toggle} mode="single" /></td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.collection_number}</td>
                <td className="px-4 py-3 font-medium text-foreground">{r.customer_name}</td>
                <td className="px-4 py-3">{fmtC(r.original_amount || 0)}</td>
                <td className="px-4 py-3 text-green-400">{fmtC(r.paid_amount || 0)}</td>
                <td className="px-4 py-3 text-red-400 font-medium">{fmtC(r.balance_due || 0)}</td>
                <td className="px-4 py-3"><span className={r.days_overdue > 60 ? "text-red-400 font-bold" : r.days_overdue > 30 ? "text-orange-400" : "text-muted-foreground"}>{r.days_overdue || 0}</span></td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${RISK_MAP[r.risk_level]?.color || ""}`}>{RISK_MAP[r.risk_level]?.label || r.risk_level}</Badge></td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${STATUS_MAP[r.status]?.color || ""}`}>{STATUS_MAP[r.status]?.label || r.status}</Badge></td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Pencil className="w-3.5 h-3.5 text-blue-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.customer_name || r.id}'? פעולה זו אינה ניתנת לביטול.`))handleDelete(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{viewDetail.customer_name} — {viewDetail.collection_number}</h2><button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <>
                  <div className="p-5">
                    <StatusTransition currentStatus={viewDetail.status} statuses={[{key:"pending",label:"ממתין",color:"bg-yellow-500/20 text-yellow-400"},{key:"in_progress",label:"בתהליך",color:"bg-blue-500/20 text-blue-400"},{key:"collected",label:"נגבה",color:"bg-green-500/20 text-green-400"},{key:"written_off",label:"נמחק",color:"bg-red-500/20 text-red-400"}]} transitions={{pending:["in_progress"],in_progress:["collected","written_off"],collected:[],written_off:[]}} onTransition={async (newStatus) => { await authFetch(`${API}/crm-collections/${viewDetail.id}`, { method: "PUT", body: JSON.stringify({ ...viewDetail, status: newStatus }) }); setViewDetail({ ...viewDetail, status: newStatus }); load(); }} entityId={viewDetail.id} />
                  </div>
                  <div className="p-5 grid grid-cols-2 gap-4">
                    <DetailField label="לקוח" value={viewDetail.customer_name} />
                    <DetailField label="חשבונית" value={viewDetail.invoice_number} />
                    <DetailField label="סכום מקורי" value={fmtC(viewDetail.original_amount || 0)} />
                    <DetailField label="שולם" value={fmtC(viewDetail.paid_amount || 0)} />
                    <DetailField label="יתרה" value={fmtC(viewDetail.balance_due || 0)} />
                    <DetailField label="ימי איחור" value={String(viewDetail.days_overdue || 0)} />
                    <DetailField label="סיכון"><Badge className={RISK_MAP[viewDetail.risk_level]?.color}>{RISK_MAP[viewDetail.risk_level]?.label}</Badge></DetailField>
                    <DetailField label="סטטוס"><Badge className={STATUS_MAP[viewDetail.status]?.color}>{STATUS_MAP[viewDetail.status]?.label}</Badge></DetailField>
                    <DetailField label="גובה" value={viewDetail.collector} />
                    <DetailField label="פעולה הבאה" value={viewDetail.next_action} />
                    <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
                  </div>
                </>
              )}
              {detailTab === "related" && (
                <div className="p-5"><RelatedRecords tabs={[{key:"invoices",label:"חשבוניות",endpoint:`${API}/crm-collections/${viewDetail.id}/invoices`,columns:[{key:"invoice_number",label:"מספר"},{key:"amount",label:"סכום"},{key:"status",label:"סטטוס"}]},{key:"contacts",label:"אנשי קשר",endpoint:`${API}/crm-collections/${viewDetail.id}/contacts`,columns:[{key:"name",label:"שם"},{key:"phone",label:"טלפון"},{key:"role",label:"תפקיד"}]}]} /></div>
              )}
              {detailTab === "docs" && (
                <div className="p-5"><AttachmentsSection entityType="collection" entityId={viewDetail.id} /></div>
              )}
              {detailTab === "history" && (
                <div className="p-5"><ActivityLog entityType="collection" entityId={viewDetail.id} /></div>
              )}
              <div className="p-5 border-t border-border flex justify-end"><button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setShowForm(false); setEditItem(null); }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border"><h2 className="text-lg font-bold text-foreground">{editItem ? "עריכת תיק גבייה" : "תיק גבייה חדש"}</h2></div>
              <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><label className="text-xs text-muted-foreground">שם לקוח <RequiredMark /></label><input className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.customerName||""} onChange={e => setForm({...form, customerName: e.target.value})} /><FormFieldError error={validation.errors.customerName} /></div>
                <div><label className="text-xs text-muted-foreground">חשבונית</label><input className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.invoiceNumber||""} onChange={e => setForm({...form, invoiceNumber: e.target.value})} /></div>
                <div><label className="text-xs text-muted-foreground">סכום (₪)</label><input type="number" className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.originalAmount||0} onChange={e => setForm({...form, originalAmount: Number(e.target.value)})} /></div>
                <div><label className="text-xs text-muted-foreground">שולם (₪)</label><input type="number" className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.paidAmount||0} onChange={e => setForm({...form, paidAmount: Number(e.target.value)})} /></div>
                <div><label className="text-xs text-muted-foreground">סיכון</label><select className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.riskLevel} onChange={e => setForm({...form, riskLevel: e.target.value})}>{Object.entries(RISK_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="text-xs text-muted-foreground">סטטוס</label><select className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>{Object.entries(STATUS_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setShowForm(false); setEditItem(null); }} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={handleSave} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">שמירה</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
