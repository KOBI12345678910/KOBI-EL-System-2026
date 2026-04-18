import { useState, useEffect, useMemo } from "react";
import { FileText, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, Clock, AlertTriangle, ArrowUpDown, DollarSign, Hash, Send as SendIcon, ThumbsUp, ThumbsDown, ChevronDown, ChevronUp, Layers, Users, Wallet , Loader2 , Copy } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Printer, Send } from "lucide-react";
import ExportDropdown from "@/components/export-dropdown";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { useApiAction } from "@/hooks/use-api-action";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-muted/50 text-foreground" },
  submitted: { label: "הוגש", color: "bg-blue-100 text-blue-700" },
  approved: { label: "מאושר", color: "bg-green-100 text-green-700" },
  rejected: { label: "נדחה", color: "bg-red-100 text-red-700" },
  reimbursed: { label: "הוחזר", color: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "בוטל", color: "bg-muted/50 text-muted-foreground" },
};
const categoryOptions = ["נסיעות", "אירוח", "ציוד משרדי", "תקשורת", "כנסים", "הדרכה", "חניה", "דלק", "ארוחות", "מלון", "טיסות", "משרדי", "אחר"];

export default function ExpenseReportsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("submit_date");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [showLineForm, setShowLineForm] = useState(false);
  const [lineForm, setLineForm] = useState<any>({});
  const [lineReportId, setLineReportId] = useState<number | null>(null);
  const [expDetailView, setExpDetailView] = useState<any>(null);
  const [detailTab, setDetailTab] = useState("details");
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const [tableLoading, setTableLoading] = useState(true);
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const { executeSave, executeDelete, execute, loading: actionLoading } = useApiAction();

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/expense-reports`, { headers }).then(r => r.json()).then(d => setItems(safeArray(d))),
      authFetch(`${API}/expense-reports/stats`, { headers }).then(r => r.json()).then(d => setStats(d || {}))
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  const loadLines = async (reportId: number) => {
    if (expandedId === reportId) { setExpandedId(null); setLines([]); return; }
    const r = await authFetch(`${API}/expense-reports/${reportId}/lines`, { headers });
    setLines(safeArray(await r.json()));
    setExpandedId(reportId);
  };

  const filtered = useMemo(() => {
    let f = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (!search || i.report_number?.toLowerCase().includes(search.toLowerCase()) ||
        i.employee_name?.toLowerCase().includes(search.toLowerCase()) ||
        i.purpose?.toLowerCase().includes(search.toLowerCase()) ||
        i.department?.toLowerCase().includes(search.toLowerCase()))
    );
    f.sort((a: any, b: any) => { const av = a[sortField], bv = b[sortField]; const cmp = typeof av === "number" ? av - bv : String(av||"").localeCompare(String(bv||"")); return sortDir === "asc" ? cmp : -cmp; });
    return f;
  }, [items, search, filterStatus, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ submitDate: new Date().toISOString().slice(0,10), currency: "ILS", status: "draft" });
    setShowForm(true);
  };
  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ employeeName: r.employee_name, department: r.department, submitDate: r.submit_date?.slice(0,10), periodStart: r.period_start?.slice(0,10), periodEnd: r.period_end?.slice(0,10), totalAmount: r.total_amount, currency: r.currency, status: r.status, purpose: r.purpose, projectName: r.project_name, costCenter: r.cost_center, notes: r.notes });
    setShowForm(true);
  };
  const save = async () => { const url = editing ? `${API}/expense-reports/${editing.id}` : `${API}/expense-reports`; await executeSave(url, editing ? "PUT" : "POST", form, editing ? "עודכן בהצלחה" : "נוצר בהצלחה", () => { setShowForm(false); load(); }); };
  const remove = async (id: number) => { await executeDelete(`${API}/expense-reports/${id}`, "למחוק רשומה?", () => { load(); }); };
  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const submitReport = async (id: number) => { await authFetch(`${API}/expense-reports/${id}/submit`, { method: "POST", headers }); load(); };
  const approveReport = async (id: number) => { await authFetch(`${API}/expense-reports/${id}/approve`, { method: "POST", headers }); load(); };
  const rejectReport = async (id: number) => {
    const reason = prompt("סיבת דחייה:");
    if (reason !== null) { await authFetch(`${API}/expense-reports/${id}/reject`, { method: "POST", headers, body: JSON.stringify({ reason }) }); load(); }
  };

  const openAddLine = (reportId: number) => {
    setLineReportId(reportId);
    setLineForm({ expenseDate: new Date().toISOString().slice(0,10), category: "משרדי", currency: "ILS", exchangeRate: 1, taxDeductible: true });
    setShowLineForm(true);
  };
  const saveLine = async () => {
    if (!lineReportId) return;
    await authFetch(`${API}/expense-reports/${lineReportId}/lines`, { method: "POST", headers, body: JSON.stringify(lineForm) });
    setShowLineForm(false);
    if (expandedId === lineReportId) { setExpandedId(null); setTimeout(() => loadLines(lineReportId), 100); }
    load();
  };
  const deleteLine = async (lineId: number) => { await executeDelete(`${API}/expense-report-lines/${lineId}`, "למחוק שורה?", () => { if (expandedId) { setExpandedId(null); setTimeout(() => loadLines(expandedId!), 100); } load(); }); };

  const kpis = [
    { label: "סה\"כ דוחות", value: fmt(stats.total || 0), icon: Hash, color: "text-blue-600" },
    { label: "טיוטות", value: fmt(stats.drafts || 0), icon: Clock, color: "text-muted-foreground" },
    { label: "ממתינים", value: fmt(stats.submitted || 0), icon: Clock, color: "text-blue-600" },
    { label: "מאושרים", value: fmt(stats.approved || 0), icon: CheckCircle2, color: "text-green-600" },
    { label: "סה\"כ סכום", value: `₪${fmt(stats.total_amount || 0)}`, icon: DollarSign, color: "text-purple-600" },
    { label: "אושר", value: `₪${fmt(stats.total_approved || 0)}`, icon: ThumbsUp, color: "text-green-600" },
    { label: "הוחזר", value: `₪${fmt(stats.total_reimbursed || 0)}`, icon: Wallet, color: "text-emerald-600" },
    { label: "עובדים", value: fmt(stats.employees || 0), icon: Users, color: "text-indigo-600" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><FileText className="text-amber-600" /> דוחות הוצאות (Expense Reports)</h1>
          <p className="text-muted-foreground mt-1">הגשת דוחות הוצאות, אישור, החזרים, שורות הוצאה מפורטות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={items} headers={{ report_number: "מספר", employee_name: "עובד", department: "מחלקה", submit_date: "תאריך", total_amount: "סכום", approved_amount: "אושר", status: "סטטוס", purpose: "מטרה" }} filename={"expense_reports"} />
          <button onClick={() => printPage("דוחות הוצאות")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Printer size={16} /> הדפסה</button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-amber-600 text-foreground px-3 py-2 rounded-lg hover:bg-amber-700 shadow-lg text-sm"><Plus size={16} /> דוח חדש</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((kpi, i) => (<motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card rounded-xl shadow-sm border p-3"><kpi.icon className={`${kpi.color} mb-1`} size={20} /><div className="text-lg font-bold">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div></motion.div>))}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]"><Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש מספר/עובד/מטרה..." className="w-full pr-10 pl-4 py-2 border rounded-lg" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2"><option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="דוחות הוצאות" actions={defaultBulkActions(selectedIds, clear, load, `${API}/expense-reports`)} />
      <div className="bg-card rounded-xl shadow-sm border overflow-x-auto relative">
        {tableLoading && (
          <div className="absolute inset-0 bg-card/60 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="flex items-center gap-2 bg-card border rounded-lg px-4 py-2 shadow-lg"><Loader2 className="w-4 h-4 animate-spin text-amber-600" /><span className="text-sm">טוען נתונים...</span></div>
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b"><tr>
            <th className="px-2 py-3 w-8"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered)} partial={selectedIds.length > 0 && selectedIds.length < filtered.length} /></th>
            <th className="px-2 py-3 w-8"></th>
            {[{ key: "report_number", label: "מספר" }, { key: "employee_name", label: "עובד" }, { key: "department", label: "מחלקה" }, { key: "submit_date", label: "תאריך" }, { key: "total_amount", label: "סכום" }, { key: "approved_amount", label: "אושר" }, { key: "lines_count", label: "שורות" }, { key: "purpose", label: "מטרה" }, { key: "status", label: "סטטוס" }].map(col => (
              <th key={col.key} className="px-2 py-3 text-right cursor-pointer hover:bg-muted/50 text-xs" onClick={() => toggleSort(col.key)}><div className="flex items-center gap-1">{col.label} <ArrowUpDown size={10} /></div></th>
            ))}
            <th className="px-2 py-3 text-right text-xs">פעולות</th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">אין דוחות הוצאות</td></tr> :
            filtered.flatMap(r => {
              const rows = [
                <tr key={r.id} className={`border-b hover:bg-amber-50/30 ${expandedId === r.id ? 'bg-amber-50/50' : ''}`}>
                  <td className="px-2 py-2"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td className="px-2 py-2"><button onClick={() => loadLines(r.id)} className="p-1 hover:bg-blue-500/10 rounded">{expandedId === r.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button></td>
                  <td className="px-2 py-2 font-mono text-amber-600 font-bold text-xs cursor-pointer hover:underline" onClick={() => { setExpDetailView(r); setDetailTab("details"); }}>{r.report_number}</td>
                  <td className="px-2 py-2 font-medium">{r.employee_name}</td>
                  <td className="px-2 py-2 text-xs">{r.department || "-"}</td>
                  <td className="px-2 py-2 text-xs">{r.submit_date?.slice(0,10)}</td>
                  <td className="px-2 py-2 font-bold">₪{fmt(r.total_amount)}</td>
                  <td className="px-2 py-2 text-green-600">{Number(r.approved_amount) > 0 ? `₪${fmt(r.approved_amount)}` : "-"}</td>
                  <td className="px-2 py-2 text-center"><span className="bg-muted/50 px-2 py-0.5 rounded-full text-xs">{r.lines_count || 0}</span></td>
                  <td className="px-2 py-2 text-xs max-w-[100px] truncate">{r.purpose || "-"}</td>
                  <td className="px-2 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${statusMap[r.status]?.color || 'bg-muted/50'}`}>{statusMap[r.status]?.label || r.status}</span></td>
                  <td className="px-2 py-2">
                    <div className="flex gap-1">
                      {r.status === 'draft' && <button onClick={() => submitReport(r.id)} className="p-1 hover:bg-blue-500/10 rounded text-blue-600" title="הגש"><SendIcon size={13} /></button>}
                      {r.status === 'submitted' && (<>
                        <button onClick={() => approveReport(r.id)} className="p-1 hover:bg-green-100 rounded text-green-600" title="אשר"><ThumbsUp size={13} /></button>
                        <button onClick={() => rejectReport(r.id)} className="p-1 hover:bg-red-500/10 rounded text-red-600" title="דחה"><ThumbsDown size={13} /></button>
                      </>)}
                      <button onClick={() => openAddLine(r.id)} className="p-1 hover:bg-emerald-100 rounded text-emerald-600" title="הוסף שורה"><Plus size={13} /></button>
                      <button onClick={() => openEdit(r)} className="p-1 hover:bg-blue-500/10 rounded"><Edit2 size={13} /></button><button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/expense-reports`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                      {(r.status === 'draft' || r.status === 'rejected') && <button onClick={() => remove(r.id)} className="p-1 hover:bg-red-500/10 rounded text-red-500"><Trash2 size={13} /></button>}
                    </div>
                  </td>
                </tr>
              ];
              if (expandedId === r.id) {
                rows.push(
                  <tr key={`${r.id}-detail`}><td colSpan={11} className="p-0">
                    <div className="bg-amber-50/30 border-t border-amber-100 px-6 py-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                        {r.period_start && <div><span className="text-muted-foreground">מתאריך:</span> {r.period_start?.slice(0,10)}</div>}
                        {r.period_end && <div><span className="text-muted-foreground">עד תאריך:</span> {r.period_end?.slice(0,10)}</div>}
                        {r.project_name && <div><span className="text-muted-foreground">פרויקט:</span> {r.project_name}</div>}
                        {r.cost_center && <div><span className="text-muted-foreground">מ.עלות:</span> {r.cost_center}</div>}
                        {r.approver_name && <div><span className="text-muted-foreground">מאשר:</span> {r.approver_name}</div>}
                        {r.approved_at && <div><span className="text-muted-foreground">אושר:</span> {new Date(r.approved_at).toLocaleDateString("he-IL")}</div>}
                        {r.rejected_reason && <div className="col-span-2 text-red-600"><span className="text-muted-foreground">סיבת דחייה:</span> {r.rejected_reason}</div>}
                      </div>
                      <div className="flex justify-between items-center mb-2">
                        <div className="text-xs font-bold text-amber-600 flex items-center gap-1"><Layers size={14} /> שורות הוצאה</div>
                        <button onClick={() => openAddLine(r.id)} className="flex items-center gap-1 text-xs bg-amber-600 text-foreground px-2 py-1 rounded hover:bg-amber-700"><Plus size={12} /> הוסף שורה</button>
                      </div>
                      {lines.length === 0 ? <div className="text-xs text-muted-foreground py-2">אין שורות הוצאה</div> :
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-amber-200">
                          <th className="text-right py-1 px-2">#</th><th className="text-right py-1 px-2">תאריך</th>
                          <th className="text-right py-1 px-2">קטגוריה</th><th className="text-right py-1 px-2">תיאור</th>
                          <th className="text-right py-1 px-2">סכום</th><th className="text-right py-1 px-2">ספק</th>
                          <th className="text-right py-1 px-2">קבלה</th><th className="text-right py-1 px-2 w-8"></th>
                        </tr></thead>
                        <tbody>{lines.map(l => (
                          <tr key={l.id} className="border-b border-amber-100/50">
                            <td className="py-1 px-2 text-muted-foreground">{l.line_number}</td>
                            <td className="py-1 px-2">{l.expense_date?.slice(0,10)}</td>
                            <td className="py-1 px-2">{l.category}</td>
                            <td className="py-1 px-2">{l.description || "-"}</td>
                            <td className="py-1 px-2 font-bold text-amber-600">₪{fmt(l.amount)}</td>
                            <td className="py-1 px-2">{l.vendor_name || "-"}</td>
                            <td className="py-1 px-2">{l.receipt_number || "-"}</td>
                            <td className="py-1 px-2"><button onClick={() => deleteLine(l.id)} className="p-0.5 hover:bg-red-500/10 rounded text-red-400"><Trash2 size={11} /></button></td>
                          </tr>
                        ))}</tbody>
                        <tfoot><tr className="font-bold bg-amber-100/30">
                          <td colSpan={4} className="py-1 px-2">סה"כ</td>
                          <td className="py-1 px-2 text-amber-700">₪{fmt(lines.reduce((s: number, l: any) => s + Number(l.amount || 0), 0))}</td>
                          <td colSpan={3}></td>
                        </tr></tfoot>
                      </table>}
                    </div>
                  </td></tr>
                );
              }
              return rows;
            })}
          </tbody>
        </table>
      </div>
      <SmartPagination pagination={pagination} />
      <div className="text-sm text-muted-foreground">סה"כ: {filtered.length} דוחות</div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{editing ? "עריכת דוח הוצאות" : "דוח הוצאות חדש"}</h2>
                <button onClick={() => setShowForm(false)}><X size={20} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium mb-1">שם העובד *</label><input value={form.employeeName || ""} onChange={e => setForm({ ...form, employeeName: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מחלקה</label><input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תאריך הגשה</label><input type="date" value={form.submitDate || ""} onChange={e => setForm({ ...form, submitDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מתאריך</label><input type="date" value={form.periodStart || ""} onChange={e => setForm({ ...form, periodStart: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">עד תאריך</label><input type="date" value={form.periodEnd || ""} onChange={e => setForm({ ...form, periodEnd: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סה"כ (₪)</label><input type="number" step="0.01" value={form.totalAmount || ""} onChange={e => setForm({ ...form, totalAmount: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">מטרה</label><input value={form.purpose || ""} onChange={e => setForm({ ...form, purpose: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">פרויקט</label><input value={form.projectName || ""} onChange={e => setForm({ ...form, projectName: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מרכז עלות</label><input value={form.costCenter || ""} onChange={e => setForm({ ...form, costCenter: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={2} /></div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
                <button onClick={save} className="px-6 py-2 bg-amber-600 text-foreground rounded-lg hover:bg-amber-700 flex items-center gap-2"><Save size={16} /> {editing ? "עדכן" : "צור"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {showLineForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowLineForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">הוספת שורת הוצאה</h2>
                <button onClick={() => setShowLineForm(false)}><X size={20} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium mb-1">תאריך *</label><input type="date" value={lineForm.expenseDate || ""} onChange={e => setLineForm({ ...lineForm, expenseDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">קטגוריה *</label>
                  <select value={lineForm.category || ""} onChange={e => setLineForm({ ...lineForm, category: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                    <option value="">בחר</option>
                    {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-medium mb-1">סכום (₪) *</label><input type="number" step="0.01" value={lineForm.amount || ""} onChange={e => setLineForm({ ...lineForm, amount: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">תיאור</label><input value={lineForm.description || ""} onChange={e => setLineForm({ ...lineForm, description: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">ספק</label><input value={lineForm.vendorName || ""} onChange={e => setLineForm({ ...lineForm, vendorName: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מס' קבלה</label><input value={lineForm.receiptNumber || ""} onChange={e => setLineForm({ ...lineForm, receiptNumber: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">אמצעי תשלום</label>
                  <select value={lineForm.paymentMethod || ""} onChange={e => setLineForm({ ...lineForm, paymentMethod: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                    <option value="">ללא</option><option value="cash">מזומן</option><option value="credit_card">כרטיס אשראי</option><option value="bank_transfer">העברה</option>
                  </select>
                </div>
                <div><label className="block text-sm font-medium mb-1">מע"מ</label><input type="number" step="0.01" value={lineForm.vatAmount || ""} onChange={e => setLineForm({ ...lineForm, vatAmount: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowLineForm(false)} className="px-4 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
                <button onClick={saveLine} className="px-6 py-2 bg-amber-600 text-foreground rounded-lg hover:bg-amber-700 flex items-center gap-2"><Save size={16} /> הוסף</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {expDetailView && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setExpDetailView(null); setDetailTab("details"); }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b flex justify-between items-center">
                <h2 className="text-lg font-bold">דוח הוצאות {expDetailView.report_number}</h2>
                <button onClick={() => { setExpDetailView(null); setDetailTab("details"); }} className="p-1 hover:bg-muted/50 rounded-lg"><X size={20} /></button>
              </div>
              <div className="flex border-b">{[{id:"details",label:"פרטים"},{id:"related",label:"רשומות קשורות"},{id:"attachments",label:"מסמכים"},{id:"history",label:"היסטוריה"}].map(t => (<button key={t.id} onClick={() => setDetailTab(t.id)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${detailTab === t.id ? "border-amber-500 text-amber-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>))}</div>
              {detailTab === "details" && <div className="p-5 grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground block">מספר דוח</span><span className="font-bold text-amber-600">{expDetailView.report_number}</span></div>
                <div><span className="text-muted-foreground block">עובד</span><span className="font-medium">{expDetailView.employee_name}</span></div>
                <div><span className="text-muted-foreground block">מחלקה</span><span>{expDetailView.department || "-"}</span></div>
                <div><span className="text-muted-foreground block">תאריך הגשה</span><span>{expDetailView.submit_date?.slice(0, 10)}</span></div>
                <div><span className="text-muted-foreground block">סכום</span><span className="font-bold">₪{fmt(expDetailView.total_amount)}</span></div>
                <div><span className="text-muted-foreground block">סכום מאושר</span><span className="text-green-600">{Number(expDetailView.approved_amount) > 0 ? `₪${fmt(expDetailView.approved_amount)}` : "-"}</span></div>
                <div><span className="text-muted-foreground block">שורות</span><span>{expDetailView.lines_count || 0}</span></div>
                <div><span className="text-muted-foreground block">מטרה</span><span>{expDetailView.purpose || "-"}</span></div>
                <div><span className="text-muted-foreground block">סטטוס</span><span className={`px-2 py-0.5 rounded-full text-xs ${statusMap[expDetailView.status]?.color || "bg-muted/50"}`}>{statusMap[expDetailView.status]?.label || expDetailView.status}</span></div>
                <div><span className="text-muted-foreground block">הערות</span><span>{expDetailView.notes || "-"}</span></div>
              </div>}
              {detailTab === "related" && <div className="p-5"><RelatedRecords tabs={[{key:"lines",label:"שורות הדוח",icon:"documents",endpoint:`${API}/expense-reports/${expDetailView.id}/lines?limit=10`,columns:[{key:"expense_date",label:"תאריך"},{key:"category",label:"קטגוריה"},{key:"description",label:"תיאור"},{key:"amount",label:"סכום"}]}]} /></div>}
              {detailTab === "attachments" && <div className="p-5"><AttachmentsSection entityType="expense-reports" entityId={expDetailView.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="expense-reports" entityId={expDetailView.id} /></div>}
              <div className="p-5 border-t flex justify-end">
                <button onClick={() => { setExpDetailView(null); setDetailTab("details"); }} className="px-4 py-2 border rounded-lg hover:bg-muted/30 text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
