import { useState, useEffect, useMemo } from "react";
import {
  Landmark, Search, AlertTriangle, ArrowUpDown, Eye, X,
  DollarSign, Hash, Clock, TrendingUp, Percent, Plus, Edit2, Trash2, Save
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

interface Loan {
  id: number; loan_number: string; loan_name: string; lender: string;
  borrower: string; principal_amount: number; interest_rate: number;
  loan_date: string; maturity_date: string; monthly_payment: number;
  outstanding_balance: number; loan_type: string; status: string;
  payment_frequency: string; notes: string; created_at?: string;
}

const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  paid_off: { label: "נפרע", color: "bg-blue-500/20 text-blue-400" },
  defaulted: { label: "בפיגור", color: "bg-red-500/20 text-red-400" },
  restructured: { label: "מחודש", color: "bg-yellow-500/20 text-yellow-400" },
};
const typeMap: Record<string, string> = {
  bank_loan: "הלוואת בנק", mortgage: "משכנתא", credit_line: "קו אשראי",
  bond: 'אג"ח', private_loan: "הלוואה פרטית",
};

export default function LoanAnalysisPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("loan_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<Loan | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Loan | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const [detailTab, setDetailTab] = useState("details");

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/loan-analysis`);
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
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterType === "all" || i.loan_type === filterType) &&
      (!search || [i.loan_number, i.loan_name, i.lender, i.borrower]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "", vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterType, sortField, sortDir]);

  const totalPrincipal = items.reduce((s, i) => s + Number(i.principal_amount || 0), 0);
  const totalOutstanding = items.reduce((s, i) => s + Number(i.outstanding_balance || 0), 0);
  const totalMonthly = items.filter(i => i.status === "active").reduce((s, i) => s + Number(i.monthly_payment || 0), 0);
  const avgRate = items.length > 0 ? (items.reduce((s, i) => s + Number(i.interest_rate || 0), 0) / items.length).toFixed(2) : "0";

  const kpis = [
    { label: 'סה"כ הלוואות', value: fmt(items.length), icon: Hash, color: "text-emerald-400" },
    { label: "פעילות", value: fmt(items.filter(i => i.status === "active").length), icon: Landmark, color: "text-green-400" },
    { label: 'סה"כ קרן', value: fmtCurrency(totalPrincipal), icon: DollarSign, color: "text-blue-400" },
    { label: "יתרה פתוחה", value: fmtCurrency(totalOutstanding), icon: TrendingUp, color: "text-red-400" },
    { label: "תשלום חודשי", value: fmtCurrency(totalMonthly), icon: Clock, color: "text-yellow-400" },
    { label: "ריבית ממוצעת", value: `${avgRate}%`, icon: Percent, color: "text-purple-400" },
  ];

  const openCreate = () => {
    setEditing(null);
    setForm({ loan_name: "", lender: "", borrower: "", principal_amount: 0, interest_rate: 0, loan_date: new Date().toISOString().slice(0, 10), maturity_date: "", monthly_payment: 0, outstanding_balance: 0, loan_type: "bank_loan", status: "active", payment_frequency: "monthly", notes: "" });
    setShowForm(true);
  };

  const openEdit = (r: Loan) => {
    setEditing(r);
    setForm({ loan_name: r.loan_name, lender: r.lender, borrower: r.borrower, principal_amount: r.principal_amount, interest_rate: r.interest_rate, loan_date: r.loan_date?.slice(0, 10), maturity_date: r.maturity_date?.slice(0, 10), monthly_payment: r.monthly_payment, outstanding_balance: r.outstanding_balance, loan_type: r.loan_type, status: r.status, payment_frequency: r.payment_frequency, notes: r.notes });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/loan-analysis/${editing.id}` : `${API}/loan-analysis`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק הלוואה זו? פעולה זו אינה ניתנת לביטול.")) {
      await authFetch(`${API}/loan-analysis/${id}`, { method: "DELETE" });
      load();
    }
  };

  const columns = [
    { key: "loan_number", label: "מספר" }, { key: "loan_name", label: "שם" },
    { key: "lender", label: "מלווה" }, { key: "loan_type", label: "סוג" },
    { key: "principal_amount", label: "קרן" }, { key: "interest_rate", label: "ריבית" },
    { key: "monthly_payment", label: "תשלום חודשי" }, { key: "outstanding_balance", label: "יתרה" },
    { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Landmark className="text-emerald-400 w-6 h-6" /> ניתוח הלוואות</h1>
          <p className="text-sm text-muted-foreground mt-1">לוחות סילוקין וניתוח הלוואות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ loan_number: "מספר", loan_name: "שם", lender: "מלווה", loan_type: "סוג", principal_amount: "קרן", interest_rate: "ריבית", monthly_payment: "חודשי", outstanding_balance: "יתרה", status: "סטטוס" }} filename="loan_analysis" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> הלוואה חדשה
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
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי שם, מלווה..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסוגים</option>{Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה בטעינה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Landmark className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין הלוואות</p><p className="text-sm mt-1">{search || filterStatus !== "all" ? "נסה לשנות את הסינון" : "לחץ על 'הלוואה חדשה' כדי להתחיל"}</p>{!(search || filterType !== "all" || filterStatus !== "all") && <button onClick={() => openCreate()} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 text-sm font-medium flex items-center gap-2 mx-auto"><Plus className="w-4 h-4" />הלוואה חדשה</button>}</div>
      ) : (<>
        <BulkActions selectedIds={selectedIds} onClear={clear} entityName="items" actions={defaultBulkActions(selectedIds, clear, load, `${API}/loan-analysis`)} />
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border/50"><tr><th className="px-4 py-3 w-10"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered.map(r => r.id))} /></th>
                  {columns.map(col => (<th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div></th>))}<th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th></tr></thead>
          <tbody>{pagination.paginate(filtered).map(r => (
            <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3 w-10"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
              <td className="px-4 py-3 font-mono text-xs text-emerald-400">{r.loan_number}</td>
              <td className="px-4 py-3 text-foreground font-medium">{r.loan_name || "—"}</td>
              <td className="px-4 py-3 text-muted-foreground">{r.lender || "—"}</td>
              <td className="px-4 py-3 text-muted-foreground">{typeMap[r.loan_type] || r.loan_type}</td>
              <td className="px-4 py-3 font-mono text-foreground">{fmtCurrency(r.principal_amount)}</td>
              <td className="px-4 py-3 text-muted-foreground">{r.interest_rate}%</td>
              <td className="px-4 py-3 font-mono text-yellow-400">{fmtCurrency(r.monthly_payment)}</td>
              <td className="px-4 py-3 font-mono text-red-400">{fmtCurrency(r.outstanding_balance)}</td>
              <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <button onClick={() => { setDetailTab("details"); setViewDetail(r); }} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.interest_rate || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                </div>
              </td>
            </tr>
          ))}</tbody></table></div></div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Landmark className="w-5 h-5 text-emerald-400" /> {viewDetail.loan_name || viewDetail.loan_number}</h2><button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>

                <div className="flex gap-1 p-3 border-b border-border bg-muted/20">
                  {[
                    { id: "details", label: "פרטים" },
                    { id: "related", label: "רשומות קשורות" },
                    { id: "attachments", label: "מסמכים" },
                    { id: "activity", label: "היסטוריה" },
                  ].map(tab => (
                    <button key={tab.id} onClick={() => setDetailTab(tab.id)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${detailTab === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>
                  ))}
                </div>
              {detailTab === "details" ? (
                            <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מספר" value={viewDetail.loan_number} /><DetailField label="שם" value={viewDetail.loan_name} />
                <DetailField label="מלווה" value={viewDetail.lender} /><DetailField label="לווה" value={viewDetail.borrower} />
                <DetailField label="סוג" value={typeMap[viewDetail.loan_type] || viewDetail.loan_type} /><DetailField label="קרן" value={fmtCurrency(viewDetail.principal_amount)} />
                <DetailField label="ריבית שנתית" value={`${viewDetail.interest_rate}%`} /><DetailField label="תשלום חודשי" value={fmtCurrency(viewDetail.monthly_payment)} />
                <DetailField label="יתרה" value={fmtCurrency(viewDetail.outstanding_balance)} /><DetailField label="תאריך הלוואה" value={viewDetail.loan_date?.slice(0, 10)} />
                <DetailField label="תאריך פירעון" value={viewDetail.maturity_date?.slice(0, 10)} /><DetailField label="תדירות תשלום" value={viewDetail.payment_frequency} />
                <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge></DetailField>
                <DetailField label="תאריך יצירה" value={viewDetail.created_at?.slice(0, 10)} />
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>
                            ) : detailTab === "related" ? (
                <div className="p-5"><RelatedRecords entityType="loans" entityId={viewDetail?.id} /></div>
                ) : detailTab === "attachments" ? (
                <div className="p-5"><AttachmentsSection entityType="loans" entityId={viewDetail?.id} /></div>
                ) : (
                <div className="p-5"><ActivityLog entityType="loans" entityId={viewDetail?.id} /></div>
                )}
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת הלוואה" : "הלוואה חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שם הלוואה *</label><input value={form.loan_name || ""} onChange={e => setForm({ ...form, loan_name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג</label><select value={form.loan_type || "bank_loan"} onChange={e => setForm({ ...form, loan_type: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מלווה</label><input value={form.lender || ""} onChange={e => setForm({ ...form, lender: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">לווה</label><input value={form.borrower || ""} onChange={e => setForm({ ...form, borrower: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סכום קרן</label><input type="number" min={0} value={form.principal_amount ?? ""} onChange={e => setForm({ ...form, principal_amount: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">ריבית %</label><input type="number" step="0.01" value={form.interest_rate ?? ""} onChange={e => setForm({ ...form, interest_rate: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך הלוואה</label><input type="date" value={form.loan_date || ""} onChange={e => setForm({ ...form, loan_date: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך פירעון</label><input type="date" value={form.maturity_date || ""} onChange={e => setForm({ ...form, maturity_date: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תשלום חודשי</label><input type="number" min={0} value={form.monthly_payment ?? ""} onChange={e => setForm({ ...form, monthly_payment: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "active"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                </div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
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
