import { useState, useEffect, useMemo } from "react";
import { Receipt, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, Clock, AlertTriangle, ArrowUpDown, DollarSign, Hash, Users, MapPin, Ban , Loader2 , Copy } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Printer, Send } from "lucide-react";
import ExportDropdown from "@/components/export-dropdown";
import { globalConfirm } from "@/components/confirm-dialog";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { useApiAction } from "@/hooks/use-api-action";
import { authFetch } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { VAT_RATE } from "@/utils/money";
import { duplicateRecord } from "@/lib/duplicate-record";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import StatusTransition from "@/components/status-transition";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

interface ExpenseClaim { id: number; claim_number: string; claim_date: string; employee_name: string; department: string; claim_type: string; period_from: string; period_to: string; status: string; currency: string; total_claimed: number; total_approved: number; total_rejected: number; total_paid: number; balance_due: number; items_count: number; travel_km: number; travel_amount: number; meals_amount: number; accommodation_amount: number; transport_amount: number; other_amount: number; cost_center: string; approver_name: string; notes: string; }

const typeMap: Record<string, string> = { business: "עסקית", travel: "נסיעות", conference: "כנס", training: "הדרכה", client_entertainment: "אירוח לקוחות", relocation: "העברה", medical: "רפואי", equipment: "ציוד", other: "אחר" };
const statusMap: Record<string, { label: string; color: string }> = { draft: { label: "טיוטה", color: "bg-muted/50 text-foreground" }, submitted: { label: "הוגש", color: "bg-blue-100 text-blue-700" }, under_review: { label: "בבדיקה", color: "bg-indigo-100 text-indigo-700" }, approved: { label: "מאושר", color: "bg-green-100 text-green-700" }, partially_approved: { label: "אושר חלקית", color: "bg-yellow-100 text-yellow-700" }, rejected: { label: "נדחה", color: "bg-red-100 text-red-700" }, paid: { label: "שולם", color: "bg-emerald-100 text-emerald-700" }, cancelled: { label: "בוטל", color: "bg-muted/50 text-muted-foreground" } };

export default function ExpenseClaimsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<ExpenseClaim[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState(""); const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("claim_date"); const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [showForm, setShowForm] = useState(false); const [editing, setEditing] = useState<ExpenseClaim | null>(null); const [form, setForm] = useState<any>({});
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const [tableLoading, setTableLoading] = useState(true);
  const [detailTab, setDetailTab] = useState("details");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const pagination = useSmartPagination(25);
  const { executeSave, executeDelete, execute, loading: actionLoading } = useApiAction();
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const claimValidation = useFormValidation({ employeeName: { required: true } });

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/expense-claims`, { headers }).then(r => r.json()).then(d => setItems(safeArray(d))),
      authFetch(`${API}/expense-claims/stats`, { headers }).then(r => r.json()).then(d => setStats(d || {}))
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    let f = items.filter(i => (filterStatus === "all" || i.status === filterStatus) && (!search || i.claim_number?.toLowerCase().includes(search.toLowerCase()) || i.employee_name?.toLowerCase().includes(search.toLowerCase()) || i.department?.toLowerCase().includes(search.toLowerCase())));
    f.sort((a: any, b: any) => { const av = a[sortField], bv = b[sortField]; const cmp = typeof av === "number" ? av - bv : String(av||"").localeCompare(String(bv||"")); return sortDir === "asc" ? cmp : -cmp; });
    return f;
  }, [items, search, filterStatus, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ claimDate: new Date().toISOString().slice(0,10), claimType: "business", status: "draft", currency: "ILS" }); setShowForm(true); };
  const openEdit = (r: ExpenseClaim) => { setEditing(r); setForm({ claimDate: r.claim_date?.slice(0,10), employeeName: r.employee_name, department: r.department, claimType: r.claim_type, periodFrom: r.period_from?.slice(0,10), periodTo: r.period_to?.slice(0,10), status: r.status, totalClaimed: r.total_claimed, totalApproved: r.total_approved, totalPaid: r.total_paid, travelKm: r.travel_km, travelAmount: r.travel_amount, mealsAmount: r.meals_amount, accommodationAmount: r.accommodation_amount, transportAmount: r.transport_amount, otherAmount: r.other_amount, costCenter: r.cost_center, notes: r.notes }); setShowForm(true); };
  const save = async () => { const url = editing ? `${API}/expense-claims/${editing.id}` : `${API}/expense-claims`; await executeSave(url, editing ? "PUT" : "POST", form, editing ? "עודכן בהצלחה" : "נוצר בהצלחה", () => { setShowForm(false); load(); }); };
  const remove = async (id: number) => { await executeDelete(`${API}/expense-claims/${id}`, "למחוק רשומה?", () => { load(); }); };
  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const recalcTotal = (f: any) => {
    const total = (Number(f.travelAmount)||0) + (Number(f.mealsAmount)||0) + (Number(f.accommodationAmount)||0) + (Number(f.transportAmount)||0) + (Number(f.otherAmount)||0);
    return { ...f, totalClaimed: total };
  };

  const kpis = [
    { label: "סה\"כ תביעות", value: fmt(stats.total || 0), icon: Hash, color: "text-blue-600" },
    { label: "טיוטות", value: fmt(stats.drafts || 0), icon: Clock, color: "text-muted-foreground" },
    { label: "הוגשו", value: fmt(stats.submitted || 0), icon: Receipt, color: "text-blue-600" },
    { label: "מאושרות", value: fmt(stats.approved || 0), icon: CheckCircle2, color: "text-green-600" },
    { label: "שולמו", value: fmt(stats.paid || 0), icon: CheckCircle2, color: "text-emerald-600" },
    { label: "סה\"כ נתבע", value: `₪${fmt(stats.total_claimed_sum || 0)}`, icon: DollarSign, color: "text-indigo-600" },
    { label: "סה\"כ אושר", value: `₪${fmt(stats.total_approved_sum || 0)}`, icon: DollarSign, color: "text-green-600" },
    { label: "ממתין לתשלום", value: `₪${fmt(stats.pending_payment || 0)}`, icon: AlertTriangle, color: "text-orange-600" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><Receipt className="text-teal-600" /> תביעות הוצאות</h1>
          <p className="text-muted-foreground mt-1">תביעות הוצאות עובדים, נסיעות, אירוח, הדרכות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={items} headers={{ claim_number: "מספר", claim_date: "תאריך", employee_name: "עובד", department: "מחלקה", claim_type: "סוג", total_claimed: "נתבע", total_approved: "אושר", total_paid: "שולם", balance_due: "יתרה", status: "סטטוס" }} filename={"expense_claims"} />
          <button onClick={() => printPage("תביעות הוצאות")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Printer size={16} /> הדפסה</button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-teal-600 text-foreground px-3 py-2 rounded-lg hover:bg-teal-700 shadow-lg text-sm"><Plus size={16} /> תביעה חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((kpi, i) => (<motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card rounded-xl shadow-sm border p-3"><kpi.icon className={`${kpi.color} mb-1`} size={20} /><div className="text-lg font-bold">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div></motion.div>))}
      </div>

      {items.length > 1 && (() => {
        const now = new Date();
        const cm = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
        const pm = (() => { const d = new Date(now.getFullYear(), now.getMonth()-1, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; })();
        const cq = Math.floor(now.getMonth()/3);
        const qMonths = (q: number, y: number) => [0,1,2].map(i => `${y}-${String(q*3+i+1).padStart(2,"0")}`);
        const cqMonths = qMonths(cq, now.getFullYear());
        const pqMonths = cq > 0 ? qMonths(cq-1, now.getFullYear()) : qMonths(3, now.getFullYear()-1);
        const sumPeriod = (months: string[]) => items.filter(i => months.some(m => i.claim_date?.startsWith(m))).reduce((a, i) => ({ total: a.total + Number(i.total_claimed||0), approved: a.approved + Number(i.total_approved||0), count: a.count + 1 }), { total: 0, approved: 0, count: 0 });
        const curM = sumPeriod([cm]), prevM = sumPeriod([pm]);
        const curQ = sumPeriod(cqMonths), prevQ = sumPeriod(pqMonths);
        const pctChange = (c: number, p: number) => p === 0 ? (c > 0 ? 100 : 0) : Math.round(((c - p) / p) * 100);
        const Arrow = ({ val }: { val: number }) => val > 0 ? <span className="text-red-600 text-xs font-bold">▲ +{val}%</span> : val < 0 ? <span className="text-green-600 text-xs font-bold">▼ {val}%</span> : <span className="text-muted-foreground text-xs">—</span>;
        return (
          <div className="bg-card rounded-xl shadow-sm border p-4">
            <div className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">📊 השוואת תקופות</div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-teal-50 rounded-lg p-3 border border-teal-200">
                <div className="text-[10px] text-muted-foreground mb-1">נתבע: חודש נוכחי מול קודם</div>
                <div className="text-lg font-bold text-teal-700">₪{fmt(curM.total)}</div>
                <div className="text-xs text-muted-foreground">מול ₪{fmt(prevM.total)}</div>
                <Arrow val={pctChange(curM.total, prevM.total)} />
              </div>
              <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                <div className="text-[10px] text-muted-foreground mb-1">אושר: חודש נוכחי מול קודם</div>
                <div className="text-lg font-bold text-green-700">₪{fmt(curM.approved)}</div>
                <div className="text-xs text-muted-foreground">מול ₪{fmt(prevM.approved)}</div>
                <Arrow val={pctChange(curM.approved, prevM.approved)} />
              </div>
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                <div className="text-[10px] text-muted-foreground mb-1">רבעון נוכחי מול קודם</div>
                <div className="text-lg font-bold text-teal-700">₪{fmt(curQ.total)}</div>
                <div className="text-xs text-muted-foreground">מול ₪{fmt(prevQ.total)}</div>
                <Arrow val={pctChange(curQ.total, prevQ.total)} />
              </div>
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <div className="text-[10px] text-muted-foreground mb-1">כמות: חודש נוכחי מול קודם</div>
                <div className="text-lg font-bold">{curM.count}</div>
                <div className="text-xs text-muted-foreground">מול {prevM.count}</div>
                <Arrow val={pctChange(curM.count, prevM.count)} />
              </div>
            </div>
          </div>
        );
      })()}

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]"><Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2 border rounded-lg" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2"><option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      </div>

      <div className="bg-card rounded-xl shadow-sm border overflow-x-auto relative">
        {tableLoading && (
          <div className="absolute inset-0 bg-card/60 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="flex items-center gap-2 bg-card border rounded-lg px-4 py-2 shadow-lg"><Loader2 className="w-4 h-4 animate-spin text-amber-600" /><span className="text-sm">טוען נתונים...</span></div>
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b"><tr>
            {[{ key: "claim_number", label: "מספר" }, { key: "claim_date", label: "תאריך" }, { key: "employee_name", label: "עובד" }, { key: "department", label: "מחלקה" }, { key: "claim_type", label: "סוג" }, { key: "total_claimed", label: "נתבע" }, { key: "total_approved", label: "אושר" }, { key: "balance_due", label: "יתרה" }, { key: "status", label: "סטטוס" }].map(col => (
              <th key={col.key} className="px-3 py-3 text-right cursor-pointer hover:bg-muted/50" onClick={() => toggleSort(col.key)}><div className="flex items-center gap-1">{col.label} <ArrowUpDown size={12} /></div></th>
            ))}
            <th className="px-3 py-3 text-right">פעולות</th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">אין תביעות הוצאות</td></tr> :
            pagination.paginate(filtered).map(r => (
              <tr key={r.id} className="border-b hover:bg-teal-50/30">
                <td className="px-3 py-2 font-mono text-teal-600 font-bold">{r.claim_number}</td>
                <td className="px-3 py-2">{r.claim_date?.slice(0, 10)}</td>
                <td className="px-3 py-2 font-medium">{r.employee_name}</td>
                <td className="px-3 py-2">{r.department || "-"}</td>
                <td className="px-3 py-2">{typeMap[r.claim_type] || r.claim_type}</td>
                <td className="px-3 py-2 font-bold">₪{fmt(r.total_claimed)}</td>
                <td className="px-3 py-2 text-green-600">₪{fmt(r.total_approved)}</td>
                <td className="px-3 py-2"><span className={Number(r.balance_due) > 0 ? "text-orange-600 font-bold" : "text-green-600"}>₪{fmt(r.balance_due)}</span></td>
                <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${statusMap[r.status]?.color || "bg-muted/50"}`}>{statusMap[r.status]?.label || r.status}</span></td>
                <td className="px-3 py-2"><div className="flex gap-1"><button onClick={() => openEdit(r)} className="p-1 hover:bg-blue-500/10 rounded"><Edit2 size={14} /></button><button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/expense-claims`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>{isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.employee_name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1 hover:bg-red-500/10 rounded text-red-500"><Trash2 size={14} /></button>}</div></td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="bg-muted/50 border-t-2 border-border font-bold text-sm">
              <tr>
                <td className="px-3 py-3" colSpan={5}>סה"כ ({filtered.length} שורות)</td>
                <td className="px-3 py-3">₪{fmt(filtered.reduce((s, r) => s + Number(r.total_claimed || 0), 0))}</td>
                <td className="px-3 py-3 text-green-600">₪{fmt(filtered.reduce((s, r) => s + Number(r.total_approved || 0), 0))}</td>
                <td className="px-3 py-3"><span className="text-orange-600">₪{fmt(filtered.reduce((s, r) => s + Number(r.balance_due || 0), 0))}</span></td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <SmartPagination pagination={pagination} />

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{editing ? "עריכת תביעה" : "תביעה חדשה"}</h2><button onClick={() => setShowForm(false)}><X size={20} /></button></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">עובד *</label><input value={form.employeeName || ""} onChange={e => setForm({ ...form, employeeName: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מחלקה</label><input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סוג תביעה</label><select value={form.claimType || "business"} onChange={e => setForm({ ...form, claimType: e.target.value })} className="w-full border rounded-lg px-3 py-2">{Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">סטטוס</label><select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full border rounded-lg px-3 py-2">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">תאריך</label><input type="date" value={form.claimDate || ""} onChange={e => setForm({ ...form, claimDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מרכז עלות</label><input value={form.costCenter || ""} onChange={e => setForm({ ...form, costCenter: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תקופה מ</label><input type="date" value={form.periodFrom || ""} onChange={e => setForm({ ...form, periodFrom: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תקופה עד</label><input type="date" value={form.periodTo || ""} onChange={e => setForm({ ...form, periodTo: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-2 border-t pt-3 mt-2"><h3 className="font-bold text-sm mb-3">פירוט הוצאות</h3></div>
                <div><label className="block text-sm font-medium mb-1">ק"מ נסיעות</label><input type="number" step="0.1" value={form.travelKm || ""} onChange={e => setForm({ ...form, travelKm: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">נסיעות (₪)</label><input type="number" step="0.01" value={form.travelAmount || ""} onChange={e => setForm(recalcTotal({ ...form, travelAmount: e.target.value }))} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">ארוחות (₪)</label><input type="number" step="0.01" value={form.mealsAmount || ""} onChange={e => setForm(recalcTotal({ ...form, mealsAmount: e.target.value }))} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">לינה (₪)</label><input type="number" step="0.01" value={form.accommodationAmount || ""} onChange={e => setForm(recalcTotal({ ...form, accommodationAmount: e.target.value }))} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תחבורה (₪)</label><input type="number" step="0.01" value={form.transportAmount || ""} onChange={e => setForm(recalcTotal({ ...form, transportAmount: e.target.value }))} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">אחר (₪)</label><input type="number" step="0.01" value={form.otherAmount || ""} onChange={e => setForm(recalcTotal({ ...form, otherAmount: e.target.value }))} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-2 bg-gradient-to-l from-teal-50 to-blue-50 rounded-xl border border-teal-200 p-4">
                  <div className="text-sm font-bold text-foreground mb-3">סיכום + מע"מ (17%)</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="bg-card rounded-lg p-2 border">
                      <div className="text-[10px] text-muted-foreground mb-1">סה"כ נתבע</div>
                      <div className="font-bold text-blue-700">₪{fmt(form.totalClaimed || 0)}</div>
                    </div>
                    <div className="bg-card rounded-lg p-2 border">
                      <div className="text-[10px] text-muted-foreground mb-1">אחוז מע"מ</div>
                      <div className="font-bold text-amber-600">17%</div>
                    </div>
                    <div className="bg-card rounded-lg p-2 border">
                      <div className="text-[10px] text-muted-foreground mb-1">סכום מע"מ</div>
                      <div className="font-bold text-orange-600">₪{fmt(Math.round((Number(form.totalClaimed) || 0) * VAT_RATE * 100) / 100)}</div>
                    </div>
                    <div className="bg-teal-100 rounded-lg p-2 border border-teal-300">
                      <div className="text-[10px] text-teal-700 mb-1">סה"כ כולל מע"מ</div>
                      <div className="font-bold text-teal-800 text-lg">₪{fmt(Math.round((Number(form.totalClaimed) || 0) * (1 + VAT_RATE) * 100) / 100)}</div>
                    </div>
                  </div>
                </div>
                {editing && <><div><label className="block text-sm font-medium mb-1">סה"כ אושר (₪)</label><input type="number" step="0.01" value={form.totalApproved || ""} onChange={e => setForm({ ...form, totalApproved: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סה"כ שולם (₪)</label><input type="number" step="0.01" value={form.totalPaid || ""} onChange={e => setForm({ ...form, totalPaid: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div></>}
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2" /></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={save} className="flex items-center gap-2 bg-teal-600 text-foreground px-6 py-2 rounded-lg hover:bg-teal-700"><Save size={16} /> {editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedItem(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-slate-700">
              <h2 className="text-xl font-bold text-foreground">תביעת הוצאות #{selectedItem.claim_number || selectedItem.id}</h2>
              <button onClick={() => setSelectedItem(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="flex border-b border-border/50">
              {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
              ))}
            </div>
            <div className="p-6">
              {detailTab === "details" && (
                <div className="space-y-4">
                  <StatusTransition currentStatus={selectedItem.status} statuses={[{key:"draft",label:"טיוטה",color:"bg-muted"},{key:"submitted",label:"הוגש",color:"bg-blue-500"},{key:"approved",label:"מאושר",color:"bg-green-500"},{key:"rejected",label:"נדחה",color:"bg-red-500"},{key:"paid",label:"שולם",color:"bg-emerald-500"}]} onTransition={async (s) => { await authFetch(`${API}/expense-claims/${selectedItem.id}`, { method: "PUT", headers, body: JSON.stringify({ status: s }) }); load(); setSelectedItem({ ...selectedItem, status: s }); }} />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div><div className="text-xs text-muted-foreground mb-1">עובד</div><div className="text-sm text-foreground">{selectedItem.employee_name || "-"}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">סכום</div><div className="text-sm text-foreground font-bold">₪{Number(selectedItem.total_amount || 0).toLocaleString()}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">תאריך</div><div className="text-sm text-foreground">{selectedItem.claim_date}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">מחלקה</div><div className="text-sm text-foreground">{selectedItem.department || "-"}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">תיאור</div><div className="text-sm text-foreground">{selectedItem.description || "-"}</div></div>
                  </div>
                </div>
              )}
              {detailTab === "related" && <RelatedRecords entityType="expense-claims" entityId={selectedItem.id} tabs={[{ key: "receipts", label: "קבלות", endpoint: `${API}/expense-claims/${selectedItem.id}/receipts` }, { key: "approvals", label: "אישורים", endpoint: `${API}/approvals?claim_id=${selectedItem.id}` }]} />}
              {detailTab === "docs" && <AttachmentsSection entityType="expense-claims" entityId={selectedItem.id} />}
              {detailTab === "history" && <ActivityLog entityType="expense-claims" entityId={selectedItem.id} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
