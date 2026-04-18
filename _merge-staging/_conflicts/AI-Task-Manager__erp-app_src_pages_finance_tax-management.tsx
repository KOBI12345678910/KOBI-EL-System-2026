import { useState, useEffect, useMemo } from "react";
import { authFetch } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import {
  Receipt, Search, Plus, Edit2, Trash2, X, Save,
  Hash, Calendar, CheckCircle2, Clock, AlertTriangle,
  ArrowUpDown, FileText, Percent, DollarSign, Shield,
  ChevronDown, ChevronLeft, BarChart3, PieChart, CalendarClock, Eye,
  Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Printer, Send } from "lucide-react";
import ExportDropdown from "@/components/export-dropdown";
import { globalConfirm } from "@/components/confirm-dialog";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { useApiAction } from "@/hooks/use-api-action";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

interface TaxRecord {
  id: number; record_number: string; tax_type: string; tax_period: string;
  period_start: string; period_end: string; filing_deadline: string; filing_date: string;
  tax_base: number; tax_rate: number; tax_amount: number; input_vat: number;
  output_vat: number; net_vat: number; withholding_tax: number; advance_payments: number;
  amount_due: number; amount_paid: number; balance_due: number; payment_date: string;
  payment_reference: string; status: string; filing_status: string;
  confirmation_number: string; tax_authority: string; currency: string; notes: string;
  created_by_name: string; created_at: string;
}

const taxTypeMap: Record<string, string> = {
  vat: "מע\"מ", income_tax: "מס הכנסה", withholding: "ניכוי במקור",
  corporate_tax: "מס חברות", property_tax: "ארנונה", payroll_tax: "מס שכר",
  customs_duty: "מכס", other: "אחר"
};
const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-yellow-100 text-yellow-700" },
  calculated: { label: "חושב", color: "bg-blue-100 text-blue-700" },
  filed: { label: "דווח", color: "bg-indigo-100 text-indigo-700" },
  paid: { label: "שולם", color: "bg-green-100 text-green-700" },
  overdue: { label: "באיחור", color: "bg-red-100 text-red-700" },
  refund: { label: "החזר", color: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "בוטל", color: "bg-muted/50 text-muted-foreground" },
};
const filingMap: Record<string, string> = {
  not_filed: "לא דווח", draft: "טיוטה", submitted: "הוגש", accepted: "אושר", rejected: "נדחה", amended: "תוקן"
};

const tabs = [
  { id: "records", label: "רשומות", icon: Receipt },
  { id: "by-type", label: "לפי סוג מס", icon: PieChart },
  { id: "vat", label: "דוח מע\"מ", icon: BarChart3 },
  { id: "deadlines", label: "מועדי דיווח", icon: CalendarClock },
];

export default function TaxManagementPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [records, setRecords] = useState<TaxRecord[]>([]);
  const [stats, setStats] = useState<any>({});
  const [byType, setByType] = useState<any[]>([]);
  const [vatReport, setVatReport] = useState<any[]>([]);
  const [deadlines, setDeadlines] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("records");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("period_end");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TaxRecord | null>(null);
  const [form, setForm] = useState<any>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showFilingModal, setShowFilingModal] = useState(false);
  const [filingRecord, setFilingRecord] = useState<TaxRecord | null>(null);
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const [tableLoading, setTableLoading] = useState(true);
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const [detailTab, setDetailTab] = useState("details");
  const { executeSave, executeDelete, execute, loading: actionLoading } = useApiAction();

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/tax-records`, { headers }).then(r => r.json()).then(d => setRecords(safeArray(d))),
      authFetch(`${API}/tax-records/stats`, { headers }).then(r => r.json()).then(d => setStats(d || {})),
      authFetch(`${API}/tax-records/by-type`, { headers }).then(r => r.json()).then(d => setByType(safeArray(d))),
      authFetch(`${API}/tax-records/vat-report`, { headers }).then(r => r.json()).then(d => setVatReport(safeArray(d))),
      authFetch(`${API}/tax-records/deadlines`, { headers }).then(r => r.json()).then(d => setDeadlines(safeArray(d)))
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    let f = records.filter(r =>
      (filterType === "all" || r.tax_type === filterType) &&
      (filterStatus === "all" || r.status === filterStatus) &&
      (!search || r.record_number?.toLowerCase().includes(search.toLowerCase()) || r.tax_period?.toLowerCase().includes(search.toLowerCase()) || r.tax_authority?.toLowerCase().includes(search.toLowerCase()))
    );
    f.sort((a: any, b: any) => { const av = a[sortField], bv = b[sortField]; const cmp = typeof av === "number" ? av - bv : String(av||"").localeCompare(String(bv||"")); return sortDir === "asc" ? cmp : -cmp; });
    return f;
  }, [records, search, filterType, filterStatus, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ taxType: "vat", periodStart: new Date().toISOString().slice(0,10), periodEnd: new Date().toISOString().slice(0,10), taxRate: 17, status: "pending", filingStatus: "not_filed", currency: "ILS", taxAuthority: "רשות המסים" }); setShowForm(true); };
  const openEdit = (r: TaxRecord) => { setEditing(r); setForm({ taxType: r.tax_type, taxPeriod: r.tax_period, periodStart: r.period_start?.slice(0,10), periodEnd: r.period_end?.slice(0,10), filingDeadline: r.filing_deadline?.slice(0,10), filingDate: r.filing_date?.slice(0,10), taxBase: r.tax_base, taxRate: r.tax_rate, taxAmount: r.tax_amount, inputVat: r.input_vat, outputVat: r.output_vat, withholdingTax: r.withholding_tax, advancePayments: r.advance_payments, amountDue: r.amount_due, amountPaid: r.amount_paid, paymentDate: r.payment_date?.slice(0,10), paymentReference: r.payment_reference, status: r.status, filingStatus: r.filing_status, confirmationNumber: r.confirmation_number, taxAuthority: r.tax_authority, notes: r.notes }); setShowForm(true); };
  const save = async () => { const url = editing ? `${API}/tax-records/${editing.id}` : `${API}/tax-records`; await executeSave(url, editing ? "PUT" : "POST", form, editing ? "עודכן בהצלחה" : "נוצר בהצלחה", () => { setShowForm(false); load(); }); };
  const remove = async (id: number) => { await executeDelete(`${API}/tax-records/${id}`, "למחוק רשומת מס?", () => load()); };
  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const openFiling = (r: TaxRecord) => { setFilingRecord(r); setShowFilingModal(true); };
  const submitFiling = async () => {
    if (!filingRecord) return;
    await authFetch(`${API}/tax-records/${filingRecord.id}`, { method: "PUT", headers, body: JSON.stringify({ filingStatus: "submitted", filingDate: new Date().toISOString().slice(0,10), status: "filed" }) });
    setShowFilingModal(false); setFilingRecord(null); load();
  };

  const totalBalance = Number(stats.total_due || 0) - Number(stats.total_paid || 0);

  const kpis = [
    { label: "סה\"כ רשומות", value: fmt(stats.total || 0), icon: Receipt, color: "text-blue-600" },
    { label: "ממתינות", value: fmt(stats.pending || 0), icon: Clock, color: "text-yellow-600" },
    { label: "דווחו", value: fmt(stats.filed || 0), icon: FileText, color: "text-indigo-600" },
    { label: "שולמו", value: fmt(stats.paid || 0), icon: CheckCircle2, color: "text-green-600" },
    { label: "באיחור", value: fmt(stats.overdue || 0), icon: AlertTriangle, color: "text-red-600" },
    { label: "סה\"כ לתשלום", value: `₪${fmt(stats.total_due || 0)}`, icon: DollarSign, color: "text-orange-600" },
    { label: "סה\"כ שולם", value: `₪${fmt(stats.total_paid || 0)}`, icon: CheckCircle2, color: "text-emerald-600" },
    { label: "דיווחים באיחור", value: fmt(stats.overdue_filings || 0), icon: AlertTriangle, color: "text-red-600" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><Receipt className="text-orange-600" /> ניהול מיסים</h1>
          <p className="text-muted-foreground mt-1">מע"מ, מס הכנסה, ניכוי במקור, דיווחים, תשלומים ומועדים</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={records} headers={{ record_number: "מספר", tax_type: "סוג מס", tax_period: "תקופה", period_start: "התחלה", period_end: "סיום", filing_deadline: "מועד דיווח", tax_amount: "סכום מס", amount_due: "לתשלום", amount_paid: "שולם", status: "סטטוס", filing_status: "דיווח" }} filename={"tax_records"} />
          <button onClick={() => printPage("ניהול מיסים")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm">
            <Printer size={16} /> הדפסה
          </button>
          <button onClick={() => sendByEmail("ניהול מיסים - טכנו-כל עוזי", generateEmailBody("ניהול מיסים", records, { record_number: "מספר", tax_type: "סוג", tax_period: "תקופה", amount_due: "לתשלום", status: "סטטוס" }))} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm">
            <Send size={16} /> שליחה
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-orange-600 text-foreground px-3 py-2 rounded-lg hover:bg-orange-700 shadow-lg text-sm">
            <Plus size={16} /> רשומת מס חדשה
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card rounded-xl shadow-sm border p-3">
            <kpi.icon className={`${kpi.color} mb-1`} size={20} />
            <div className="text-lg font-bold">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      {totalBalance > 0 && (
        <div className="bg-gradient-to-l from-red-50 to-orange-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="text-red-500" size={24} />
              <div>
                <div className="font-bold text-red-700">יתרת חוב מיסים פתוחה</div>
                <div className="text-sm text-red-600">סה"כ יתרה לתשלום לרשויות המס</div>
              </div>
            </div>
            <div className="text-lg sm:text-2xl font-bold text-red-700">₪{fmt(totalBalance)}</div>
          </div>
          <div className="mt-2 bg-red-200 rounded-full h-2">
            <div className="bg-green-500 h-2 rounded-full" style={{ width: `${Math.min(100, (Number(stats.total_paid||0) / Math.max(1, Number(stats.total_due||1))) * 100)}%` }} />
          </div>
          <div className="flex justify-between text-xs mt-1 text-muted-foreground">
            <span>שולם: ₪{fmt(stats.total_paid || 0)}</span>
            <span>סה"כ חיוב: ₪{fmt(stats.total_due || 0)}</span>
          </div>
        </div>
      )}

      <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? "bg-card shadow-sm text-orange-700" : "text-muted-foreground hover:text-foreground"}`}>
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "records" && (
        <>
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
              <Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2 border rounded-lg" />
            </div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border rounded-lg px-3 py-2">
              <option value="all">כל הסוגים</option>
              {Object.entries(taxTypeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2">
              <option value="all">כל הסטטוסים</option>
              {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          <BulkActions selectedIds={selectedIds} onClear={clear} entityName="items" actions={defaultBulkActions(selectedIds, clear, load, `${API}/tax-records`)} />
          <div className="bg-card rounded-xl shadow-sm border overflow-x-auto relative">
        {tableLoading && (
          <div className="absolute inset-0 bg-card/60 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="flex items-center gap-2 bg-card border rounded-lg px-4 py-2 shadow-lg"><Loader2 className="w-4 h-4 animate-spin text-amber-600" /><span className="text-sm">טוען נתונים...</span></div>
          </div>
        )}
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr>
                  <th className="px-2 py-3 w-8"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered.map(r => r.id))} /></th>
                  <th className="px-2 py-3 w-8"></th>
                  {[
                    { key: "record_number", label: "מספר" }, { key: "tax_type", label: "סוג מס" },
                    { key: "tax_period", label: "תקופה" }, { key: "period_end", label: "סיום תקופה" },
                    { key: "filing_deadline", label: "מועד דיווח" }, { key: "tax_amount", label: "סכום מס" },
                    { key: "amount_due", label: "לתשלום" }, { key: "balance_due", label: "יתרה" },
                    { key: "status", label: "סטטוס" }, { key: "filing_status", label: "דיווח" },
                  ].map(col => (
                    <th key={col.key} className="px-3 py-3 text-right cursor-pointer hover:bg-muted/50" onClick={() => toggleSort(col.key)}>
                      <div className="flex items-center gap-1">{col.label} <ArrowUpDown size={12} /></div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={13} className="text-center py-8 text-muted-foreground">אין רשומות מס</td></tr>
                ) : pagination.paginate(filtered).map(r => {
                  const isExpanded = expandedId === r.id;
                  const deadlineSoon = r.filing_deadline && !['paid','cancelled'].includes(r.status) && new Date(r.filing_deadline) <= new Date(Date.now() + 7*86400000);
                  return (
                    <motion.tr key={r.id} className="contents" layout>
                      <tr className={`border-b hover:bg-orange-50/30 ${deadlineSoon ? 'bg-red-50/40' : ''}`}>
                        <td className="px-2 py-2"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                        <td className="px-2 py-2">
                          <button onClick={() => setExpandedId(isExpanded ? null : r.id)} className="p-0.5 hover:bg-muted rounded">
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronLeft size={14} />}
                          </button>
                        </td>
                        <td className="px-3 py-2 font-mono text-orange-600 font-bold">{r.record_number}</td>
                        <td className="px-3 py-2">{taxTypeMap[r.tax_type] || r.tax_type}</td>
                        <td className="px-3 py-2">{r.tax_period}</td>
                        <td className="px-3 py-2">{r.period_end?.slice(0, 10)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            {r.filing_deadline?.slice(0, 10) || "-"}
                            {deadlineSoon && <AlertTriangle size={12} className="text-red-500" />}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-bold">₪{fmt(r.tax_amount)}</td>
                        <td className="px-3 py-2 font-bold text-red-600">₪{fmt(r.amount_due)}</td>
                        <td className="px-3 py-2 font-bold text-orange-700">₪{fmt(r.balance_due)}</td>
                        <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${statusMap[r.status]?.color || "bg-muted/50"}`}>{statusMap[r.status]?.label || r.status}</span></td>
                        <td className="px-3 py-2"><span className="text-xs">{filingMap[r.filing_status] || r.filing_status}</span></td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button onClick={() => openEdit(r)} className="p-1 hover:bg-blue-500/10 rounded" title="עריכה"><Edit2 size={14} /></button>
                            {r.filing_status === 'not_filed' && <button onClick={() => openFiling(r)} className="p-1 hover:bg-indigo-100 rounded text-indigo-600" title="הגש דיווח"><FileText size={14} /></button>}
                            {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.tax_period || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1 hover:bg-red-500/10 rounded text-red-500" title="מחיקה"><Trash2 size={14} /></button>}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-orange-50/20">
                          <td colSpan={13} className="px-6 py-4">
                            <div className="flex gap-1 mb-4 bg-muted/50 rounded-lg p-1">
                              {[
                                { id: "details", label: "פרטים" },
                                { id: "related", label: "רשומות קשורות" },
                                { id: "attachments", label: "מסמכים" },
                                { id: "activity", label: "היסטוריה" },
                              ].map(tab => (
                                <button key={tab.id} onClick={() => setDetailTab(tab.id)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${detailTab === tab.id ? "bg-card shadow-sm text-orange-700" : "text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>
                              ))}
                            </div>
                            {detailTab === "related" ? (
                              <RelatedRecords entityType="tax-records" entityId={r.id} />
                            ) : detailTab === "attachments" ? (
                              <AttachmentsSection entityType="tax-records" entityId={r.id} />
                            ) : detailTab === "activity" ? (
                              <ActivityLog entityType="tax-records" entityId={r.id} />
                            ) : (
                            <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <div className="text-muted-foreground text-xs mb-1">בסיס מס</div>
                                <div className="font-bold">₪{fmt(r.tax_base)}</div>
                              </div>
                              <div>
                                <div className="text-muted-foreground text-xs mb-1">שיעור מס</div>
                                <div className="font-bold">{r.tax_rate}%</div>
                              </div>
                              {r.tax_type === 'vat' && (
                                <>
                                  <div>
                                    <div className="text-muted-foreground text-xs mb-1">מע"מ עסקאות (Output)</div>
                                    <div className="font-bold text-red-600">₪{fmt(r.output_vat)}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground text-xs mb-1">מע"מ תשומות (Input)</div>
                                    <div className="font-bold text-green-600">₪{fmt(r.input_vat)}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground text-xs mb-1">מע"מ נטו</div>
                                    <div className={`font-bold ${Number(r.net_vat) >= 0 ? 'text-red-600' : 'text-green-600'}`}>₪{fmt(r.net_vat)}</div>
                                  </div>
                                </>
                              )}
                              <div>
                                <div className="text-muted-foreground text-xs mb-1">ניכוי במקור</div>
                                <div className="font-bold">₪{fmt(r.withholding_tax)}</div>
                              </div>
                              <div>
                                <div className="text-muted-foreground text-xs mb-1">מקדמות</div>
                                <div className="font-bold">₪{fmt(r.advance_payments)}</div>
                              </div>
                              <div>
                                <div className="text-muted-foreground text-xs mb-1">סכום ששולם</div>
                                <div className="font-bold text-green-600">₪{fmt(r.amount_paid)}</div>
                              </div>
                              {r.payment_date && (
                                <div>
                                  <div className="text-muted-foreground text-xs mb-1">תאריך תשלום</div>
                                  <div className="font-bold">{r.payment_date?.slice(0,10)}</div>
                                </div>
                              )}
                              {r.payment_reference && (
                                <div>
                                  <div className="text-muted-foreground text-xs mb-1">אסמכתא תשלום</div>
                                  <div className="font-bold font-mono">{r.payment_reference}</div>
                                </div>
                              )}
                              {r.confirmation_number && (
                                <div>
                                  <div className="text-muted-foreground text-xs mb-1">מספר אישור</div>
                                  <div className="font-bold font-mono text-indigo-600">{r.confirmation_number}</div>
                                </div>
                              )}
                              <div>
                                <div className="text-muted-foreground text-xs mb-1">רשות מס</div>
                                <div className="font-bold">{r.tax_authority}</div>
                              </div>
                              <div>
                                <div className="text-muted-foreground text-xs mb-1">נוצר ע"י</div>
                                <div className="font-bold">{r.created_by_name || "-"}</div>
                              </div>
                            </div>
                            {r.notes && (
                              <div className="mt-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                                <div className="text-xs text-yellow-700 font-medium mb-1">הערות</div>
                                <div className="text-sm">{r.notes}</div>
                              </div>
                            )}
                            {Number(r.balance_due) > 0 && (
                              <div className="mt-3">
                                <div className="text-xs text-muted-foreground mb-1">התקדמות תשלום</div>
                                <div className="bg-muted rounded-full h-3">
                                  <div className="bg-green-500 h-3 rounded-full transition-all" style={{ width: `${Math.min(100, (Number(r.amount_paid) / Math.max(1, Number(r.amount_due))) * 100)}%` }} />
                                </div>
                                <div className="flex justify-between text-xs mt-1 text-muted-foreground">
                                  <span>שולם: ₪{fmt(r.amount_paid)}</span>
                                  <span>נותר: ₪{fmt(r.balance_due)}</span>
                                </div>
                              </div>
                            )}
                            </>
                            )}
                          </td>
                        </tr>
                      )}
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
      <SmartPagination pagination={pagination} />
          <div className="text-sm text-muted-foreground">סה"כ: {filtered.length} רשומות מס</div>
        </>
      )}

      {activeTab === "by-type" && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2"><PieChart size={20} className="text-orange-600" /> פילוח לפי סוג מס</h2>
          {byType.length === 0 ? (
            <div className="bg-card rounded-xl border p-8 text-center text-muted-foreground">אין נתונים</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {byType.map((t, i) => {
                const total = byType.reduce((s, x) => s + Number(x.total_tax || 0), 0);
                const pct = total > 0 ? (Number(t.total_tax) / total * 100) : 0;
                const paidPct = Number(t.total_due) > 0 ? (Number(t.total_paid) / Number(t.total_due) * 100) : 100;
                const colors = ['bg-blue-500', 'bg-green-500', 'bg-orange-500', 'bg-purple-500', 'bg-red-500', 'bg-indigo-500', 'bg-teal-500', 'bg-pink-500'];
                return (
                  <motion.div key={t.tax_type} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                    className="bg-card rounded-xl shadow-sm border p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-bold text-lg">{taxTypeMap[t.tax_type] || t.tax_type}</div>
                        <div className="text-sm text-muted-foreground">{t.count} רשומות</div>
                      </div>
                      <div className="text-left">
                        <div className="text-xl font-bold">₪{fmt(t.total_tax)}</div>
                        <div className="text-xs text-muted-foreground">{pct.toFixed(1)}% מסה"כ</div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>חלק מסה"כ</span>
                          <span>{pct.toFixed(1)}%</span>
                        </div>
                        <div className="bg-muted/50 rounded-full h-2.5">
                          <div className={`${colors[i % colors.length]} h-2.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>התקדמות תשלום</span>
                          <span>{paidPct.toFixed(0)}%</span>
                        </div>
                        <div className="bg-muted/50 rounded-full h-2.5">
                          <div className={`${paidPct >= 80 ? 'bg-green-500' : paidPct >= 50 ? 'bg-yellow-500' : 'bg-red-500'} h-2.5 rounded-full transition-all`} style={{ width: `${Math.min(100, paidPct)}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-3 border-t text-xs">
                      <div>
                        <div className="text-muted-foreground">לתשלום</div>
                        <div className="font-bold text-red-600">₪{fmt(t.total_due)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">שולם</div>
                        <div className="font-bold text-green-600">₪{fmt(t.total_paid)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">יתרה</div>
                        <div className="font-bold text-orange-600">₪{fmt(t.total_balance)}</div>
                      </div>
                    </div>
                    {(Number(t.overdue_count) > 0 || Number(t.overdue_filings) > 0) && (
                      <div className="mt-3 flex gap-3 text-xs">
                        {Number(t.overdue_count) > 0 && <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full">{t.overdue_count} באיחור תשלום</span>}
                        {Number(t.overdue_filings) > 0 && <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full">{t.overdue_filings} באיחור דיווח</span>}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
          <div className="bg-card rounded-xl border p-4">
            <h3 className="font-bold mb-3">סיכום כולל</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><div className="text-muted-foreground">סה"כ מיסים</div><div className="text-xl font-bold">₪{fmt(byType.reduce((s, t) => s + Number(t.total_tax), 0))}</div></div>
              <div><div className="text-muted-foreground">סה"כ לתשלום</div><div className="text-xl font-bold text-red-600">₪{fmt(byType.reduce((s, t) => s + Number(t.total_due), 0))}</div></div>
              <div><div className="text-muted-foreground">סה"כ שולם</div><div className="text-xl font-bold text-green-600">₪{fmt(byType.reduce((s, t) => s + Number(t.total_paid), 0))}</div></div>
              <div><div className="text-muted-foreground">סה"כ יתרה</div><div className="text-xl font-bold text-orange-600">₪{fmt(byType.reduce((s, t) => s + Number(t.total_balance), 0))}</div></div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "vat" && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2"><BarChart3 size={20} className="text-orange-600" /> דוח מע"מ תקופתי</h2>
          {vatReport.length === 0 ? (
            <div className="bg-card rounded-xl border p-8 text-center text-muted-foreground">אין נתוני מע"מ</div>
          ) : (
            <>
              <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b">
                    <tr>
                      <th className="px-4 py-3 text-right">תקופה</th>
                      <th className="px-4 py-3 text-right">תאריכים</th>
                      <th className="px-4 py-3 text-right">מע"מ עסקאות</th>
                      <th className="px-4 py-3 text-right">מע"מ תשומות</th>
                      <th className="px-4 py-3 text-right">מע"מ נטו</th>
                      <th className="px-4 py-3 text-right">שולם</th>
                      <th className="px-4 py-3 text-right">יתרה</th>
                      <th className="px-4 py-3 text-right">מועד אחרון</th>
                      <th className="px-4 py-3 text-right">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vatReport.map((v, i) => {
                      const netVal = Number(v.total_net_vat);
                      return (
                        <tr key={i} className="border-b hover:bg-orange-50/30">
                          <td className="px-4 py-3 font-bold">{v.tax_period}</td>
                          <td className="px-4 py-3 text-xs">{v.period_start?.slice(0,10)} — {v.period_end?.slice(0,10)}</td>
                          <td className="px-4 py-3 text-red-600 font-bold">₪{fmt(v.total_output_vat)}</td>
                          <td className="px-4 py-3 text-green-600 font-bold">₪{fmt(v.total_input_vat)}</td>
                          <td className={`px-4 py-3 font-bold ${netVal >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                            ₪{fmt(v.total_net_vat)}
                            {netVal < 0 && <span className="text-xs mr-1">(החזר)</span>}
                          </td>
                          <td className="px-4 py-3 text-green-600">₪{fmt(v.total_paid)}</td>
                          <td className="px-4 py-3 font-bold text-orange-600">₪{fmt(v.total_balance)}</td>
                          <td className="px-4 py-3">{v.deadline?.slice(0,10) || "-"}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${statusMap[v.status]?.color || 'bg-muted/50'}`}>
                              {statusMap[v.status]?.label || v.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/50 font-bold">
                    <tr>
                      <td className="px-4 py-3">סה"כ</td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-red-600">₪{fmt(vatReport.reduce((s, v) => s + Number(v.total_output_vat), 0))}</td>
                      <td className="px-4 py-3 text-green-600">₪{fmt(vatReport.reduce((s, v) => s + Number(v.total_input_vat), 0))}</td>
                      <td className="px-4 py-3">₪{fmt(vatReport.reduce((s, v) => s + Number(v.total_net_vat), 0))}</td>
                      <td className="px-4 py-3 text-green-600">₪{fmt(vatReport.reduce((s, v) => s + Number(v.total_paid), 0))}</td>
                      <td className="px-4 py-3 text-orange-600">₪{fmt(vatReport.reduce((s, v) => s + Number(v.total_balance), 0))}</td>
                      <td className="px-4 py-3" colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="bg-card rounded-xl border p-4">
                <h3 className="font-bold mb-3">תרשים מע"מ נטו לפי תקופה</h3>
                <div className="flex items-end gap-2 h-40 overflow-x-auto pb-2">
                  {[...vatReport].reverse().map((v, i) => {
                    const netVal = Number(v.total_net_vat);
                    const maxVal = Math.max(...vatReport.map(x => Math.abs(Number(x.total_net_vat))), 1);
                    const h = Math.max(8, (Math.abs(netVal) / maxVal) * 120);
                    return (
                      <div key={i} className="flex flex-col items-center min-w-[50px]">
                        <div className="text-xs font-bold mb-1">{netVal >= 0 ? '' : '-'}₪{fmt(Math.abs(netVal))}</div>
                        <div className={`w-10 rounded-t-md ${netVal >= 0 ? 'bg-red-400' : 'bg-green-400'}`} style={{ height: `${h}px` }} />
                        <div className="text-[10px] text-muted-foreground mt-1 truncate max-w-[60px]">{v.tax_period}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-400" /> לתשלום לרשויות</span>
                  <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-400" /> החזר מרשויות</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === "deadlines" && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2"><CalendarClock size={20} className="text-orange-600" /> לוח מועדי דיווח ותשלום</h2>
          {deadlines.length === 0 ? (
            <div className="bg-card rounded-xl border p-8 text-center text-muted-foreground">אין מועדים פתוחים</div>
          ) : (
            <div className="space-y-3">
              {deadlines.map((d, i) => {
                const deadline = new Date(d.filing_deadline);
                const today = new Date();
                const daysLeft = Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
                const isOverdue = daysLeft < 0;
                const isUrgent = daysLeft >= 0 && daysLeft <= 7;
                const isSoon = daysLeft > 7 && daysLeft <= 14;
                const urgencyColor = isOverdue ? 'border-red-500 bg-red-50' : isUrgent ? 'border-orange-400 bg-orange-50' : isSoon ? 'border-yellow-400 bg-yellow-50' : 'border-border bg-card';
                const urgencyBadge = isOverdue ? 'bg-red-600 text-foreground' : isUrgent ? 'bg-orange-500 text-foreground' : isSoon ? 'bg-yellow-500 text-foreground' : 'bg-muted text-foreground';
                return (
                  <motion.div key={d.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    className={`rounded-xl border-2 p-4 ${urgencyColor}`}>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-4">
                        <div className="text-center min-w-[60px]">
                          <div className="text-lg sm:text-2xl font-bold">{deadline.getDate()}</div>
                          <div className="text-xs text-muted-foreground">{deadline.toLocaleDateString('he-IL', { month: 'short', year: 'numeric' })}</div>
                        </div>
                        <div>
                          <div className="font-bold">{d.record_number} — {taxTypeMap[d.tax_type] || d.tax_type}</div>
                          <div className="text-sm text-muted-foreground">{d.tax_period}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-left">
                          <div className="text-sm text-muted-foreground">לתשלום</div>
                          <div className="font-bold text-red-600">₪{fmt(d.amount_due)}</div>
                        </div>
                        {Number(d.balance_due) > 0 && (
                          <div className="text-left">
                            <div className="text-sm text-muted-foreground">יתרה</div>
                            <div className="font-bold text-orange-600">₪{fmt(d.balance_due)}</div>
                          </div>
                        )}
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${urgencyBadge}`}>
                          {isOverdue ? `באיחור ${Math.abs(daysLeft)} ימים` : daysLeft === 0 ? 'היום!' : `עוד ${daysLeft} ימים`}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${statusMap[d.status]?.color || 'bg-muted/50'}`}>
                          {statusMap[d.status]?.label || d.status}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{editing ? "עריכת רשומת מס" : "רשומת מס חדשה"}</h2>
                <button onClick={() => setShowForm(false)}><X size={20} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium mb-1">סוג מס *</label><select value={form.taxType || "vat"} onChange={e => setForm({ ...form, taxType: e.target.value })} className="w-full border rounded-lg px-3 py-2">{Object.entries(taxTypeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">תקופה *</label><input value={form.taxPeriod || ""} onChange={e => setForm({ ...form, taxPeriod: e.target.value })} placeholder="לדוגמה: ינואר 2026" className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מטבע</label><select value={form.currency || "ILS"} onChange={e => setForm({ ...form, currency: e.target.value })} className="w-full border rounded-lg px-3 py-2"><option value="ILS">₪ ILS</option><option value="USD">$ USD</option><option value="EUR">€ EUR</option></select></div>
                <div><label className="block text-sm font-medium mb-1">תחילת תקופה *</label><input type="date" value={form.periodStart || ""} onChange={e => setForm({ ...form, periodStart: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סוף תקופה *</label><input type="date" value={form.periodEnd || ""} onChange={e => setForm({ ...form, periodEnd: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מועד אחרון לדיווח</label><input type="date" value={form.filingDeadline || ""} onChange={e => setForm({ ...form, filingDeadline: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תאריך דיווח</label><input type="date" value={form.filingDate || ""} onChange={e => setForm({ ...form, filingDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">רשות מס</label><input value={form.taxAuthority || "רשות המסים"} onChange={e => setForm({ ...form, taxAuthority: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מספר אישור</label><input value={form.confirmationNumber || ""} onChange={e => setForm({ ...form, confirmationNumber: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
              </div>
              <div className="border-t my-4 pt-4">
                <h3 className="font-bold text-sm mb-3">סכומים</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div><label className="block text-sm font-medium mb-1">בסיס מס</label><input type="number" step="0.01" value={form.taxBase || ""} onChange={e => setForm({ ...form, taxBase: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                  <div><label className="block text-sm font-medium mb-1">שיעור מס (%)</label><input type="number" step="0.01" value={form.taxRate || ""} onChange={e => setForm({ ...form, taxRate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                  <div><label className="block text-sm font-medium mb-1">סכום מס</label><input type="number" step="0.01" value={form.taxAmount || ""} onChange={e => setForm({ ...form, taxAmount: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                  {(form.taxType === "vat") && <>
                    <div><label className="block text-sm font-medium mb-1">מע"מ עסקאות</label><input type="number" step="0.01" value={form.outputVat || ""} onChange={e => setForm({ ...form, outputVat: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                    <div><label className="block text-sm font-medium mb-1">מע"מ תשומות</label><input type="number" step="0.01" value={form.inputVat || ""} onChange={e => setForm({ ...form, inputVat: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                  </>}
                  <div><label className="block text-sm font-medium mb-1">ניכוי במקור</label><input type="number" step="0.01" value={form.withholdingTax || ""} onChange={e => setForm({ ...form, withholdingTax: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                  <div><label className="block text-sm font-medium mb-1">מקדמות</label><input type="number" step="0.01" value={form.advancePayments || ""} onChange={e => setForm({ ...form, advancePayments: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                  <div><label className="block text-sm font-medium mb-1">סכום לתשלום</label><input type="number" step="0.01" value={form.amountDue || ""} onChange={e => setForm({ ...form, amountDue: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                  <div><label className="block text-sm font-medium mb-1">סכום ששולם</label><input type="number" step="0.01" value={form.amountPaid || ""} onChange={e => setForm({ ...form, amountPaid: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                </div>
              </div>
              <div className="border-t my-4 pt-4">
                <h3 className="font-bold text-sm mb-3">תשלום וסטטוס</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div><label className="block text-sm font-medium mb-1">תאריך תשלום</label><input type="date" value={form.paymentDate || ""} onChange={e => setForm({ ...form, paymentDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                  <div><label className="block text-sm font-medium mb-1">אסמכתא תשלום</label><input value={form.paymentReference || ""} onChange={e => setForm({ ...form, paymentReference: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                  <div><label className="block text-sm font-medium mb-1">סטטוס</label><select value={form.status || "pending"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full border rounded-lg px-3 py-2">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                  <div><label className="block text-sm font-medium mb-1">סטטוס דיווח</label><select value={form.filingStatus || "not_filed"} onChange={e => setForm({ ...form, filingStatus: e.target.value })} className="w-full border rounded-lg px-3 py-2">{Object.entries(filingMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                  <div className="col-span-2"><label className="block text-sm font-medium mb-1">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2" /></div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={save} className="flex items-center gap-2 bg-orange-600 text-foreground px-6 py-2 rounded-lg hover:bg-orange-700"><Save size={16} /> {editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFilingModal && filingRecord && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowFilingModal(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2"><FileText className="text-indigo-600" /> הגשת דיווח</h2>
                <button onClick={() => setShowFilingModal(false)}><X size={20} /></button>
              </div>
              <div className="space-y-3 text-sm">
                <div className="bg-muted/30 rounded-lg p-3">
                  <div className="flex justify-between"><span className="text-muted-foreground">מספר רשומה:</span><span className="font-bold">{filingRecord.record_number}</span></div>
                  <div className="flex justify-between mt-1"><span className="text-muted-foreground">סוג מס:</span><span>{taxTypeMap[filingRecord.tax_type]}</span></div>
                  <div className="flex justify-between mt-1"><span className="text-muted-foreground">תקופה:</span><span>{filingRecord.tax_period}</span></div>
                  <div className="flex justify-between mt-1"><span className="text-muted-foreground">סכום:</span><span className="font-bold">₪{fmt(filingRecord.amount_due)}</span></div>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                  <div className="font-bold text-indigo-700 mb-1">אישור הגשה</div>
                  <p className="text-indigo-600 text-xs">לחיצה על "הגש דיווח" תעדכן את הסטטוס ל"דווח" ותרשום את תאריך ההגשה</p>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={submitFiling} className="flex items-center gap-2 bg-indigo-600 text-foreground px-6 py-2 rounded-lg hover:bg-indigo-700"><FileText size={16} /> הגש דיווח</button>
                <button onClick={() => setShowFilingModal(false)} className="px-6 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
