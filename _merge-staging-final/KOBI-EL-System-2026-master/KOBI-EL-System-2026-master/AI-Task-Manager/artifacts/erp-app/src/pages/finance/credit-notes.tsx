import { useState, useEffect, useMemo } from "react";
import { RotateCcw, Search, Plus, Edit2, Trash2, X, Save, Hash, CheckCircle2, Clock, AlertTriangle, ArrowUpDown, DollarSign, FileText, Loader2, TrendingDown, BarChart3 , Copy } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Printer, Send } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import ExportDropdown from "@/components/export-dropdown";
import { globalConfirm } from "@/components/confirm-dialog";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { useApiAction } from "@/hooks/use-api-action";
import { authFetch } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
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

interface CreditNote { id: number; credit_number: string; credit_type: string; credit_date: string; original_invoice_number: string; customer_name: string; customer_tax_id: string; reason: string; reason_description: string; status: string; currency: string; subtotal: number; vat_rate: number; vat_amount: number; total_amount: number; refund_method: string; refund_date: string; refund_reference: string; approved_by: string; notes: string; }

const typeMap: Record<string, string> = { credit: "הודעת זיכוי", debit: "הודעת חיוב", return: "החזרה", adjustment: "התאמה", write_off: "מחיקה", discount: "הנחה" };
const reasonMap: Record<string, string> = { return: "החזרת סחורה", defect: "פגם/ליקוי", overcharge: "חיוב יתר", discount: "הנחה", cancellation: "ביטול", price_adjustment: "עדכון מחיר", duplicate: "כפילות", other: "אחר" };
const statusMap: Record<string, { label: string; color: string }> = { draft: { label: "טיוטה", color: "bg-muted/50 text-foreground" }, pending: { label: "ממתין", color: "bg-yellow-100 text-yellow-700" }, approved: { label: "מאושר", color: "bg-blue-100 text-blue-700" }, issued: { label: "הונפק", color: "bg-green-100 text-green-700" }, refunded: { label: "הוחזר", color: "bg-emerald-100 text-emerald-700" }, cancelled: { label: "בוטל", color: "bg-muted/50 text-muted-foreground" } };

export default function CreditNotesPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<CreditNote[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState(""); const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("credit_date"); const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [showForm, setShowForm] = useState(false); const [editing, setEditing] = useState<CreditNote | null>(null); const [form, setForm] = useState<any>({});
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const [tableLoading, setTableLoading] = useState(true);
  const [detailTab, setDetailTab] = useState("details");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const pagination = useSmartPagination(25);
  const { executeSave, executeDelete, execute, loading: actionLoading } = useApiAction();
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const cnValidation = useFormValidation({ customerName: { required: true } });

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/credit-notes`, { headers }).then(r => r.json()).then(d => setItems(safeArray(d))),
      authFetch(`${API}/credit-notes/stats`, { headers }).then(r => r.json()).then(d => setStats(d || {}))
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    let f = items.filter(i => (filterStatus === "all" || i.status === filterStatus) && (!search || i.credit_number?.toLowerCase().includes(search.toLowerCase()) || i.customer_name?.toLowerCase().includes(search.toLowerCase()) || i.original_invoice_number?.toLowerCase().includes(search.toLowerCase())));
    f.sort((a: any, b: any) => { const av = a[sortField], bv = b[sortField]; const cmp = typeof av === "number" ? av - bv : String(av||"").localeCompare(String(bv||"")); return sortDir === "asc" ? cmp : -cmp; });
    return f;
  }, [items, search, filterStatus, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ creditType: "credit", creditDate: new Date().toISOString().slice(0,10), reason: "return", status: "draft", currency: "ILS", vatRate: 17 }); setShowForm(true); };
  const openEdit = (r: CreditNote) => { setEditing(r); setForm({ creditType: r.credit_type, creditDate: r.credit_date?.slice(0,10), originalInvoiceNumber: r.original_invoice_number, customerName: r.customer_name, customerTaxId: r.customer_tax_id, reason: r.reason, reasonDescription: r.reason_description, status: r.status, subtotal: r.subtotal, vatRate: r.vat_rate, vatAmount: r.vat_amount, totalAmount: r.total_amount, refundMethod: r.refund_method, notes: r.notes }); setShowForm(true); };
  const save = async () => { const url = editing ? `${API}/credit-notes/${editing.id}` : `${API}/credit-notes`; await executeSave(url, editing ? "PUT" : "POST", form, editing ? "עודכן בהצלחה" : "נוצר בהצלחה", () => { setShowForm(false); load(); }); };
  const remove = async (id: number) => { await executeDelete(`${API}/credit-notes/${id}`, "למחוק רשומה?", () => { load(); }); };
  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const recalc = (f: any) => {
    const sub = Number(f.subtotal) || 0;
    const vr = Number(f.vatRate) || 17;
    const va = sub * (vr / 100);
    return { ...f, vatAmount: Math.round(va * 100) / 100, totalAmount: Math.round((sub + va) * 100) / 100 };
  };

  const kpis = [
    { label: "סה\"כ זיכויים", value: fmt(stats.total || 0), icon: RotateCcw, color: "text-blue-600" },
    { label: "טיוטות", value: fmt(stats.drafts || 0), icon: Clock, color: "text-muted-foreground" },
    { label: "ממתינות", value: fmt(stats.pending || 0), icon: Clock, color: "text-yellow-600" },
    { label: "מאושרות", value: fmt(stats.approved || 0), icon: CheckCircle2, color: "text-blue-600" },
    { label: "הונפקו", value: fmt(stats.issued || 0), icon: FileText, color: "text-green-600" },
    { label: "הוחזרו", value: fmt(stats.refunded || 0), icon: CheckCircle2, color: "text-emerald-600" },
    { label: "ערך כולל", value: `₪${fmt(stats.total_credit_value || 0)}`, icon: DollarSign, color: "text-red-600" },
    { label: "סה\"כ הוחזר", value: `₪${fmt(stats.total_refunded || 0)}`, icon: DollarSign, color: "text-purple-600" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><RotateCcw className="text-rose-600" /> זיכויים</h1>
          <p className="text-muted-foreground mt-1">הודעות זיכוי, חיוב, החזרות, התאמות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={items} headers={{ credit_number: "מספר", credit_type: "סוג", credit_date: "תאריך", original_invoice_number: "חשבונית מקור", customer_name: "לקוח", reason: "סיבה", total_amount: "סכום", status: "סטטוס" }} filename={"credit_notes"} />
          <button onClick={() => printPage("זיכויים")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Printer size={16} /> הדפסה</button>
          <button onClick={() => sendByEmail("זיכויים - טכנו-כל עוזי", generateEmailBody("זיכויים", items, { credit_number: "מספר", customer_name: "לקוח", total_amount: "סכום", status: "סטטוס" }))} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Send size={16} /> שליחה</button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-rose-600 text-foreground px-3 py-2 rounded-lg hover:bg-rose-700 shadow-lg text-sm"><Plus size={16} /> זיכוי חדש</button>
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
        const sumPeriod = (months: string[]) => items.filter(i => months.some(m => i.credit_date?.startsWith(m))).reduce((a, i) => ({ total: a.total + Number(i.total_amount||0), vat: a.vat + Number(i.vat_amount||0), count: a.count + 1 }), { total: 0, vat: 0, count: 0 });
        const curM = sumPeriod([cm]), prevM = sumPeriod([pm]);
        const curQ = sumPeriod(cqMonths), prevQ = sumPeriod(pqMonths);
        const pctChange = (c: number, p: number) => p === 0 ? (c > 0 ? 100 : 0) : Math.round(((c - p) / p) * 100);
        const Arrow = ({ val }: { val: number }) => val > 0 ? <span className="text-red-600 text-xs font-bold">▲ +{val}%</span> : val < 0 ? <span className="text-green-600 text-xs font-bold">▼ {val}%</span> : <span className="text-muted-foreground text-xs">—</span>;
        return (
          <div className="bg-card rounded-xl shadow-sm border p-4">
            <div className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">📊 השוואת תקופות</div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-rose-50 rounded-lg p-3 border border-rose-200">
                <div className="text-[10px] text-muted-foreground mb-1">זיכויים: חודש נוכחי מול קודם</div>
                <div className="text-lg font-bold text-rose-700">₪{fmt(curM.total)}</div>
                <div className="text-xs text-muted-foreground">מול ₪{fmt(prevM.total)}</div>
                <Arrow val={pctChange(curM.total, prevM.total)} />
              </div>
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                <div className="text-[10px] text-muted-foreground mb-1">מע"מ: חודש נוכחי מול קודם</div>
                <div className="text-lg font-bold text-amber-600">₪{fmt(curM.vat)}</div>
                <div className="text-xs text-muted-foreground">מול ₪{fmt(prevM.vat)}</div>
                <Arrow val={pctChange(curM.vat, prevM.vat)} />
              </div>
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                <div className="text-[10px] text-muted-foreground mb-1">רבעון נוכחי מול קודם</div>
                <div className="text-lg font-bold text-rose-700">₪{fmt(curQ.total)}</div>
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

      {items.length > 0 && (() => {
        const months: Record<string, { month: string; total: number; vat: number; count: number }> = {};
        items.forEach(cn => {
          const d = cn.credit_date?.slice(0, 7);
          if (!d) return;
          if (!months[d]) months[d] = { month: d, total: 0, vat: 0, count: 0 };
          months[d].total += Number(cn.total_amount || 0);
          months[d].vat += Number(cn.vat_amount || 0);
          months[d].count += 1;
        });
        const trendData = Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
        const heMonth = (m: string) => { const [y, mo] = m.split("-"); return `${mo}/${y.slice(2)}`; };
        return trendData.length > 1 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card rounded-xl shadow-sm border p-4">
              <div className="flex items-center gap-2 mb-3 text-sm font-bold text-foreground"><TrendingDown size={16} className="text-rose-600" /> מגמת זיכויים חודשית</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="cnGradTotal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#e11d48" stopOpacity={0.3}/><stop offset="95%" stopColor="#e11d48" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tickFormatter={heMonth} tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v: number) => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `₪${fmt(v)}`} labelFormatter={heMonth} />
                  <Legend formatter={() => "סכום זיכויים"} />
                  <Area type="monotone" dataKey="total" stroke="#e11d48" fill="url(#cnGradTotal)" strokeWidth={2} name="total" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-card rounded-xl shadow-sm border p-4">
              <div className="flex items-center gap-2 mb-3 text-sm font-bold text-foreground"><BarChart3 size={16} className="text-amber-600" /> מע"מ זיכויים חודשי</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tickFormatter={heMonth} tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v: number) => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `₪${fmt(v)}`} labelFormatter={heMonth} />
                  <Bar dataKey="vat" fill="#f59e0b" radius={[4, 4, 0, 0]} name="מע״מ" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null;
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
            {[{ key: "credit_number", label: "מספר" }, { key: "credit_type", label: "סוג" }, { key: "credit_date", label: "תאריך" }, { key: "original_invoice_number", label: "חשבונית מקור" }, { key: "customer_name", label: "לקוח" }, { key: "reason", label: "סיבה" }, { key: "subtotal", label: "סכום" }, { key: "total_amount", label: "סה\"כ כולל מע\"מ" }, { key: "status", label: "סטטוס" }].map(col => (
              <th key={col.key} className="px-3 py-3 text-right cursor-pointer hover:bg-muted/50" onClick={() => toggleSort(col.key)}><div className="flex items-center gap-1">{col.label} <ArrowUpDown size={12} /></div></th>
            ))}
            <th className="px-3 py-3 text-right">פעולות</th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">אין הודעות זיכוי</td></tr> :
            pagination.paginate(filtered).map(r => (
              <tr key={r.id} className="border-b hover:bg-rose-50/30">
                <td className="px-3 py-2 font-mono text-rose-600 font-bold">{r.credit_number}</td>
                <td className="px-3 py-2">{typeMap[r.credit_type] || r.credit_type}</td>
                <td className="px-3 py-2">{r.credit_date?.slice(0, 10)}</td>
                <td className="px-3 py-2 font-mono text-blue-600">{r.original_invoice_number || "-"}</td>
                <td className="px-3 py-2 font-medium">{r.customer_name}</td>
                <td className="px-3 py-2">{reasonMap[r.reason] || r.reason}</td>
                <td className="px-3 py-2">₪{fmt(r.subtotal)}</td>
                <td className="px-3 py-2 font-bold text-red-600">₪{fmt(r.total_amount)}</td>
                <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${statusMap[r.status]?.color || "bg-muted/50"}`}>{statusMap[r.status]?.label || r.status}</span></td>
                <td className="px-3 py-2"><div className="flex gap-1"><button onClick={() => openEdit(r)} className="p-1 hover:bg-blue-500/10 rounded"><Edit2 size={14} /></button><button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/credit-notes`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>{isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.customer_name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1 hover:bg-red-500/10 rounded text-red-500"><Trash2 size={14} /></button>}</div></td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="bg-muted/50 border-t-2 border-border font-bold text-sm">
              <tr>
                <td className="px-3 py-3" colSpan={6}>סה"כ ({filtered.length} שורות)</td>
                <td className="px-3 py-3">₪{fmt(filtered.reduce((s, r) => s + Number(r.subtotal || 0), 0))}</td>
                <td className="px-3 py-3 text-red-600">₪{fmt(filtered.reduce((s, r) => s + Number(r.total_amount || 0), 0))}</td>
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
              <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{editing ? "עריכת זיכוי" : "זיכוי חדש"}</h2><button onClick={() => setShowForm(false)}><X size={20} /></button></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">סוג</label><select value={form.creditType || "credit"} onChange={e => setForm({ ...form, creditType: e.target.value })} className="w-full border rounded-lg px-3 py-2">{Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">סטטוס</label><select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full border rounded-lg px-3 py-2">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">לקוח *</label><input value={form.customerName || ""} onChange={e => setForm({ ...form, customerName: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">ח.פ/ע.מ</label><input value={form.customerTaxId || ""} onChange={e => setForm({ ...form, customerTaxId: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תאריך</label><input type="date" value={form.creditDate || ""} onChange={e => setForm({ ...form, creditDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">חשבונית מקור</label><input value={form.originalInvoiceNumber || ""} onChange={e => setForm({ ...form, originalInvoiceNumber: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סיבה</label><select value={form.reason || "return"} onChange={e => setForm({ ...form, reason: e.target.value })} className="w-full border rounded-lg px-3 py-2">{Object.entries(reasonMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">שיטת החזר</label><input value={form.refundMethod || ""} onChange={e => setForm({ ...form, refundMethod: e.target.value })} placeholder="העברה / אשראי / צ'ק" className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סכום (₪)</label><input type="number" step="0.01" value={form.subtotal || ""} onChange={e => setForm(recalc({ ...form, subtotal: e.target.value }))} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מע"מ %</label><input type="number" step="0.01" value={form.vatRate ?? 17} onChange={e => setForm(recalc({ ...form, vatRate: e.target.value }))} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-2 bg-gradient-to-l from-rose-50 to-blue-50 rounded-xl border border-rose-200 p-4 mt-1">
                  <div className="text-sm font-bold text-foreground mb-3">פירוט חישוב מע"מ ({form.vatRate ?? 17}%)</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="bg-card rounded-lg p-2 border">
                      <div className="text-[10px] text-muted-foreground mb-1">לפני מע"מ</div>
                      <div className="font-bold text-blue-700">₪{fmt(form.subtotal || 0)}</div>
                    </div>
                    <div className="bg-card rounded-lg p-2 border">
                      <div className="text-[10px] text-muted-foreground mb-1">אחוז מע"מ</div>
                      <div className="font-bold text-amber-600">{form.vatRate ?? 17}%</div>
                    </div>
                    <div className="bg-card rounded-lg p-2 border">
                      <div className="text-[10px] text-muted-foreground mb-1">סכום מע"מ</div>
                      <div className="font-bold text-orange-600">₪{fmt(form.vatAmount || 0)}</div>
                    </div>
                    <div className="bg-rose-100 rounded-lg p-2 border border-rose-300">
                      <div className="text-[10px] text-rose-700 mb-1">סה"כ כולל מע"מ</div>
                      <div className="font-bold text-rose-800 text-lg">₪{fmt(form.totalAmount || 0)}</div>
                    </div>
                  </div>
                </div>
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">תיאור סיבה</label><textarea value={form.reasonDescription || ""} onChange={e => setForm({ ...form, reasonDescription: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2" /></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={save} className="flex items-center gap-2 bg-rose-600 text-foreground px-6 py-2 rounded-lg hover:bg-rose-700"><Save size={16} /> {editing ? "עדכון" : "שמירה"}</button>
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
              <h2 className="text-xl font-bold text-foreground">זיכוי #{selectedItem.credit_number || selectedItem.id}</h2>
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
                  <StatusTransition currentStatus={selectedItem.status} statuses={[{key:"draft",label:"טיוטה",color:"bg-muted"},{key:"pending",label:"ממתין",color:"bg-yellow-500"},{key:"approved",label:"מאושר",color:"bg-blue-500"},{key:"issued",label:"הונפק",color:"bg-green-500"},{key:"refunded",label:"הוחזר",color:"bg-emerald-500"},{key:"cancelled",label:"בוטל",color:"bg-red-500"}]} onTransition={async (s) => { await authFetch(`${API}/credit-notes/${selectedItem.id}`, { method: "PUT", headers, body: JSON.stringify({ status: s }) }); load(); setSelectedItem({ ...selectedItem, status: s }); }} />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div><div className="text-xs text-muted-foreground mb-1">לקוח</div><div className="text-sm text-foreground">{selectedItem.customer_name || "-"}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">סכום</div><div className="text-sm text-rose-400 font-bold">₪{Number(selectedItem.amount || 0).toLocaleString()}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">סיבה</div><div className="text-sm text-foreground">{reasonMap[selectedItem.reason] || selectedItem.reason || "-"}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">חשבונית מקורית</div><div className="text-sm text-foreground">{selectedItem.original_invoice_number || "-"}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">תאריך</div><div className="text-sm text-foreground">{selectedItem.credit_date}</div></div>
                  </div>
                </div>
              )}
              {detailTab === "related" && <RelatedRecords entityType="credit-notes" entityId={selectedItem.id} tabs={[{ key: "invoices", label: "חשבוניות", endpoint: `${API}/invoices?credit_note_id=${selectedItem.id}` }, { key: "customers", label: "לקוחות", endpoint: `${API}/customers?credit_note_id=${selectedItem.id}` }]} />}
              {detailTab === "docs" && <AttachmentsSection entityType="credit-notes" entityId={selectedItem.id} />}
              {detailTab === "history" && <ActivityLog entityType="credit-notes" entityId={selectedItem.id} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
