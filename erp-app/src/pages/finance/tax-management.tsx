import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import {
  Receipt, Search, Plus, Edit2, Trash2, X, Save, Eye, ArrowUpDown, FileText,
  Percent, DollarSign, Shield, Calendar, Clock, AlertTriangle, ChevronLeft,
  BarChart3, Calculator, CheckCircle2, Send, Loader2
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtCur = (v: any) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(Number(v || 0));

const PERIOD_STATUSES: Record<string, { label: string; color: string }> = {
  open: { label: "פתוח", color: "bg-blue-500/20 text-blue-400" },
  calculated: { label: "חושב", color: "bg-amber-500/20 text-amber-400" },
  filed: { label: "דווח", color: "bg-indigo-500/20 text-indigo-400" },
  paid: { label: "שולם", color: "bg-green-500/20 text-green-400" },
};
const TXN_TYPES: Record<string, string> = { sale: "מכירה", purchase: "רכישה", expense: "הוצאה", import: "יבוא" };
const DOC_TYPES: Record<string, string> = { invoice: "חשבונית", receipt: "קבלה", credit_note: "זיכוי" };
const REPORT_TYPES: Record<string, string> = { vat_856: "דו\"ח מע\"מ (856)", income_tax_advance: "מקדמת מס הכנסה", social_security: "ביטוח לאומי", annual: "שנתי" };
const REPORT_STATUSES: Record<string, string> = { draft: "טיוטה", final: "סופי", submitted: "הוגש" };
const WH_STATUSES: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  expired: { label: "פג תוקף", color: "bg-red-500/20 text-red-400" },
};

type Tab = "periods" | "transactions" | "reports" | "withholding" | "obligations";

export default function TaxManagement() {
  const [activeTab, setActiveTab] = useState<Tab>("periods");
  const [dashboard, setDashboard] = useState<any>({});
  const [periods, setPeriods] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [withholding, setWithholding] = useState<any[]>([]);
  const [obligations, setObligations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState<number | null>(null);

  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true);
    try {
      const [dRes, pRes, tRes, rRes, wRes, oRes] = await Promise.all([
        authFetch(`${API}/tax/dashboard`).catch(() => null),
        authFetch(`${API}/tax/periods`),
        authFetch(`${API}/tax/transactions`),
        authFetch(`${API}/tax/reports`),
        authFetch(`${API}/tax/withholding-certificates`),
        authFetch(`${API}/tax/obligations`),
      ]);
      if (dRes?.ok) setDashboard(await dRes.json());
      if (pRes.ok) setPeriods(safeArray(await pRes.json()));
      if (tRes.ok) setTransactions(safeArray(await tRes.json()));
      if (rRes.ok) setReports(safeArray(await rRes.json()));
      if (wRes.ok) setWithholding(safeArray(await wRes.json()));
      if (oRes.ok) setObligations(safeArray(await oRes.json()));
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const entityPath = (tab: Tab): string => {
    const map: Record<Tab, string> = {
      periods: "tax/periods", transactions: "tax/transactions",
      reports: "tax/reports", withholding: "tax/withholding-certificates",
      obligations: "tax/obligations"
    };
    return map[tab];
  };

  const openNew = () => { setEditing(null); setForm({}); setShowForm(true); };
  const openEdit = (item: any) => { setEditing(item); setForm({ ...item }); setShowForm(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      const path = entityPath(activeTab);
      const method = editing ? "PUT" : "POST";
      const url = editing ? `${API}/${path}/${editing.id}` : `${API}/${path}`;
      const r = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!r.ok) throw new Error("Save failed");
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    const ok = await globalConfirm({ title: "מחיקה", message: "למחוק?" });
    if (!ok) return;
    await authFetch(`${API}/${entityPath(activeTab)}/${id}`, { method: "DELETE" });
    load();
  };

  const calculatePeriod = async (periodId: number) => {
    setCalculating(periodId);
    try {
      await authFetch(`${API}/tax/calculate-period/${periodId}`, { method: "POST" });
      load();
    } catch {}
    setCalculating(null);
  };

  const fileReport = async (periodId: number, reportType: string) => {
    try {
      await authFetch(`${API}/tax/file-report/${periodId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_type: reportType })
      });
      load();
    } catch {}
  };

  const filtered = useMemo(() => {
    const dataMap: Record<Tab, any[]> = { periods, transactions, reports, withholding, obligations };
    let data = dataMap[activeTab];
    if (search) { const s = search.toLowerCase(); data = data.filter(i => JSON.stringify(i).toLowerCase().includes(s)); }
    if (filterStatus !== "all") data = data.filter(i => i.status === filterStatus);
    return data;
  }, [activeTab, periods, transactions, reports, withholding, obligations, search, filterStatus]);

  const paged = filtered.slice(pagination.startIndex, pagination.endIndex + 1);

  const statsCards = [
    { label: "מע\"מ לתשלום", value: fmtCur(dashboard.upcoming_obligations?.vat_due), icon: Receipt, color: "text-blue-400" },
    { label: "מקדמת מס הכנסה", value: fmtCur(dashboard.upcoming_obligations?.income_tax_due), icon: DollarSign, color: "text-purple-400" },
    { label: "ביטוח לאומי", value: fmtCur(dashboard.upcoming_obligations?.social_security_due), icon: Shield, color: "text-amber-400" },
    { label: "סה\"כ חובות", value: fmtCur(dashboard.upcoming_obligations?.total), icon: AlertTriangle, color: "text-red-400" },
    { label: "תעודות ניכוי", value: `${dashboard.withholding_certificates?.total || 0} (${dashboard.withholding_certificates?.expired || 0} פגו)`, icon: FileText, color: "text-cyan-400" },
  ];

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "periods", label: "תקופות מס", icon: Calendar },
    { key: "transactions", label: "תנועות", icon: Receipt },
    { key: "obligations", label: "חובות", icon: AlertTriangle },
    { key: "withholding", label: "ניכוי במקור", icon: Shield },
    { key: "reports", label: "דו\"חות", icon: FileText },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Receipt className="text-blue-400" /> ניהול מס ומע"מ</h1>
          <p className="text-sm text-muted-foreground mt-1">מע"מ {dashboard.vat_rate || 18}% | מקדמות | ביטוח לאומי | ניכוי במקור</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportDropdown data={filtered} filename={`tax-${activeTab}`} />
          {["periods", "transactions", "withholding"].includes(activeTab) && (
            <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition">
              <Plus size={16} /> הוסף
            </button>
          )}
        </div>
      </div>

      {/* Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statsCards.map(c => (
          <div key={c.label} className="bg-[#1a1a2e] border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2"><c.icon size={18} className={c.color} /><span className="text-xs text-muted-foreground">{c.label}</span></div>
            <div className="text-lg font-bold text-white">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Annual summary */}
      {dashboard.annual_summary && (
        <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-4">
          <h3 className="text-sm font-medium text-white mb-3">סיכום שנתי {new Date().getFullYear()}</h3>
          <div className="grid grid-cols-3 gap-4">
            <div><span className="text-xs text-muted-foreground">מע"מ ששולם</span><div className="text-white font-medium mt-1">{fmtCur(dashboard.annual_summary.vat_paid)}</div></div>
            <div><span className="text-xs text-muted-foreground">מס הכנסה</span><div className="text-white font-medium mt-1">{fmtCur(dashboard.annual_summary.income_tax)}</div></div>
            <div><span className="text-xs text-muted-foreground">ביטוח לאומי</span><div className="text-white font-medium mt-1">{fmtCur(dashboard.annual_summary.social_security)}</div></div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/10 pb-0">
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setActiveTab(t.key); setFilterStatus("all"); clear(); }}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === t.key ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-white"}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-9 pl-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" />
        </div>
        {activeTab === "periods" && (
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
            <option value="all">כל הסטטוסים</option>
            {Object.entries(PERIOD_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400" /></div>
      ) : (
        <>
          {/* ═══ PERIODS TAB ═══ */}
          {activeTab === "periods" && (
            <div className="bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/10 text-muted-foreground text-xs">
                  <th className="p-3 text-right">תקופה</th><th className="p-3 text-right">מע"מ עסקאות</th>
                  <th className="p-3 text-right">מע"מ תשומות</th><th className="p-3 text-right">מע"מ נטו</th>
                  <th className="p-3 text-right">מקדמת מס</th><th className="p-3 text-right">בט"ל</th>
                  <th className="p-3 text-right">תאריך יעד</th><th className="p-3 text-right">סטטוס</th>
                  <th className="p-3 text-center">פעולות</th>
                </tr></thead>
                <tbody>
                  {paged.map((p: any) => {
                    const st = PERIOD_STATUSES[p.status] || { label: p.status, color: "" };
                    return (
                      <tr key={p.id} className="border-b border-white/5 hover:bg-white/5 transition cursor-pointer" onClick={() => setViewDetail(p)}>
                        <td className="p-3 text-white font-medium">{p.period}</td>
                        <td className="p-3 text-red-400">{fmtCur(p.total_vat_output)}</td>
                        <td className="p-3 text-emerald-400">{fmtCur(p.total_vat_input)}</td>
                        <td className={`p-3 font-medium ${parseFloat(p.net_vat) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                          {fmtCur(p.net_vat)} {parseFloat(p.net_vat) > 0 ? "(לתשלום)" : "(להחזר)"}
                        </td>
                        <td className="p-3 text-muted-foreground">{fmtCur(p.income_tax_advance)}</td>
                        <td className="p-3 text-muted-foreground">{fmtCur(p.social_security)}</td>
                        <td className="p-3 text-muted-foreground text-xs">{p.due_date ? new Date(p.due_date).toLocaleDateString("he-IL") : "---"}</td>
                        <td className="p-3"><Badge className={st.color}>{st.label}</Badge></td>
                        <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            {p.status === 'open' && (
                              <button onClick={() => calculatePeriod(p.id)} disabled={calculating === p.id}
                                className="p-1.5 rounded hover:bg-amber-500/20 text-muted-foreground hover:text-amber-400 transition" title="חשב">
                                {calculating === p.id ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />}
                              </button>
                            )}
                            {(p.status === 'calculated' || p.status === 'open') && (
                              <button onClick={() => fileReport(p.id, 'vat_856')}
                                className="p-1.5 rounded hover:bg-indigo-500/20 text-muted-foreground hover:text-indigo-400 transition" title="הפק דו&quot;ח">
                                <Send size={14} />
                              </button>
                            )}
                            <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-white/10 text-muted-foreground hover:text-white"><Edit2 size={14} /></button>
                            <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {paged.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">אין תקופות מס</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* ═══ TRANSACTIONS TAB ═══ */}
          {activeTab === "transactions" && (
            <div className="bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/10 text-muted-foreground text-xs">
                  <th className="p-3 text-right">תאריך</th><th className="p-3 text-right">תקופה</th>
                  <th className="p-3 text-right">סוג</th><th className="p-3 text-right">מסמך</th>
                  <th className="p-3 text-right">ישות</th><th className="p-3 text-right">לפני מע"מ</th>
                  <th className="p-3 text-right">מע"מ</th><th className="p-3 text-right">סה"כ</th>
                  <th className="p-3 text-right">ניכוי</th><th className="p-3 text-center">פעולות</th>
                </tr></thead>
                <tbody>
                  {paged.map((t: any) => (
                    <tr key={t.id} className="border-b border-white/5 hover:bg-white/5 transition cursor-pointer" onClick={() => setViewDetail(t)}>
                      <td className="p-3 text-muted-foreground text-xs">{t.date ? new Date(t.date).toLocaleDateString("he-IL") : ""}</td>
                      <td className="p-3 text-muted-foreground">{t.period}</td>
                      <td className="p-3"><Badge variant="outline">{TXN_TYPES[t.transaction_type] || t.transaction_type}</Badge></td>
                      <td className="p-3 text-muted-foreground">{DOC_TYPES[t.document_type] || t.document_type} {t.document_number}</td>
                      <td className="p-3 text-white">{t.entity_name}</td>
                      <td className="p-3 text-muted-foreground">{fmtCur(t.amount_before_vat)}</td>
                      <td className="p-3 text-blue-400">{fmtCur(t.vat_amount)}</td>
                      <td className="p-3 text-white font-medium">{fmtCur(t.total_amount)}</td>
                      <td className="p-3 text-amber-400">{parseFloat(t.withholding_tax) > 0 ? fmtCur(t.withholding_tax) : "---"}</td>
                      <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-white/10 text-muted-foreground hover:text-white"><Edit2 size={14} /></button>
                          <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paged.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">אין תנועות</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* ═══ OBLIGATIONS TAB ═══ */}
          {activeTab === "obligations" && (
            <div className="bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/10 text-muted-foreground text-xs">
                  <th className="p-3 text-right">תקופה</th><th className="p-3 text-right">מע"מ נטו</th>
                  <th className="p-3 text-right">מקדמת מס</th><th className="p-3 text-right">בט"ל</th>
                  <th className="p-3 text-right">סה"כ חוב</th><th className="p-3 text-right">תאריך יעד</th>
                  <th className="p-3 text-right">סטטוס</th>
                </tr></thead>
                <tbody>
                  {paged.map((o: any) => {
                    const isOverdue = o.due_date && new Date(o.due_date) < new Date();
                    return (
                      <tr key={o.id} className={`border-b border-white/5 hover:bg-white/5 ${isOverdue ? 'bg-red-500/5' : ''}`}>
                        <td className="p-3 text-white font-medium">{o.period}</td>
                        <td className={`p-3 ${parseFloat(o.net_vat) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{fmtCur(o.net_vat)}</td>
                        <td className="p-3 text-muted-foreground">{fmtCur(o.income_tax_advance)}</td>
                        <td className="p-3 text-muted-foreground">{fmtCur(o.social_security)}</td>
                        <td className="p-3 text-white font-bold">{fmtCur(o.total_obligation)}</td>
                        <td className={`p-3 text-xs ${isOverdue ? 'text-red-400 font-medium' : 'text-muted-foreground'}`}>
                          {o.due_date ? new Date(o.due_date).toLocaleDateString("he-IL") : "---"}
                          {isOverdue && <span className="mr-1">(באיחור!)</span>}
                        </td>
                        <td className="p-3"><Badge className={PERIOD_STATUSES[o.status]?.color || ""}>{PERIOD_STATUSES[o.status]?.label || o.status}</Badge></td>
                      </tr>
                    );
                  })}
                  {paged.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">אין חובות פתוחים</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* ═══ WITHHOLDING TAB ═══ */}
          {activeTab === "withholding" && (
            <div className="bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/10 text-muted-foreground text-xs">
                  <th className="p-3 text-right">ספק</th><th className="p-3 text-right">מס' תעודה</th>
                  <th className="p-3 text-right">שיעור</th><th className="p-3 text-right">מ-</th>
                  <th className="p-3 text-right">עד</th><th className="p-3 text-right">סטטוס</th>
                  <th className="p-3 text-center">פעולות</th>
                </tr></thead>
                <tbody>
                  {paged.map((w: any) => {
                    const st = WH_STATUSES[w.status] || { label: w.status, color: "" };
                    return (
                      <tr key={w.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="p-3 text-white font-medium">{w.supplier_name}</td>
                        <td className="p-3 text-muted-foreground">{w.certificate_number}</td>
                        <td className="p-3 text-amber-400">{w.rate}%</td>
                        <td className="p-3 text-muted-foreground text-xs">{w.valid_from ? new Date(w.valid_from).toLocaleDateString("he-IL") : ""}</td>
                        <td className="p-3 text-muted-foreground text-xs">{w.valid_to ? new Date(w.valid_to).toLocaleDateString("he-IL") : ""}</td>
                        <td className="p-3"><Badge className={st.color}>{st.label}</Badge></td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => openEdit(w)} className="p-1.5 rounded hover:bg-white/10 text-muted-foreground hover:text-white"><Edit2 size={14} /></button>
                            <button onClick={() => handleDelete(w.id)} className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {paged.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">אין תעודות ניכוי</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* ═══ REPORTS TAB ═══ */}
          {activeTab === "reports" && (
            <div className="bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/10 text-muted-foreground text-xs">
                  <th className="p-3 text-right">תקופה</th><th className="p-3 text-right">סוג דו"ח</th>
                  <th className="p-3 text-right">סטטוס</th><th className="p-3 text-right">הופק ב-</th>
                  <th className="p-3 text-center">פעולות</th>
                </tr></thead>
                <tbody>
                  {paged.map((r: any) => (
                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/5 cursor-pointer" onClick={() => setViewDetail(r)}>
                      <td className="p-3 text-white font-medium">{r.period}</td>
                      <td className="p-3"><Badge variant="outline">{REPORT_TYPES[r.report_type] || r.report_type}</Badge></td>
                      <td className="p-3"><Badge className={r.status === 'submitted' ? 'bg-green-500/20 text-green-400' : 'bg-muted/20'}>{REPORT_STATUSES[r.status] || r.status}</Badge></td>
                      <td className="p-3 text-muted-foreground text-xs">{r.generated_at ? new Date(r.generated_at).toLocaleString("he-IL") : ""}</td>
                      <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setViewDetail(r)} className="p-1.5 rounded hover:bg-white/10 text-muted-foreground hover:text-white"><Eye size={14} /></button>
                      </td>
                    </tr>
                  ))}
                  {paged.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">אין דו"חות</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          <SmartPagination totalItems={filtered.length} {...pagination} />
        </>
      )}

      {/* ─── Detail Panel ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ x: 400 }} animate={{ x: 0 }} exit={{ x: 400 }} onClick={e => e.stopPropagation()}
              className="w-full max-w-lg bg-[#12122a] h-full overflow-y-auto border-r border-white/10 p-6">
              <div className="flex items-center justify-between mb-6">
                <button onClick={() => setViewDetail(null)} className="text-muted-foreground hover:text-white"><ChevronLeft size={20} /></button>
                <h3 className="text-lg font-bold text-white">{viewDetail.period || viewDetail.entity_name || viewDetail.supplier_name || "פרטים"}</h3>
                <button onClick={() => { openEdit(viewDetail); setViewDetail(null); }} className="p-1.5 rounded hover:bg-white/10"><Edit2 size={14} /></button>
              </div>
              <div className="space-y-4">
                {Object.entries(viewDetail).filter(([k]) => !["id","created_at","generated_at"].includes(k)).map(([k, v]) => (
                  <div key={k}>
                    <div className="text-xs text-muted-foreground mb-0.5">{k}</div>
                    <div className="text-sm text-white">{typeof v === 'object' ? JSON.stringify(v, null, 2) : (v != null ? String(v) : "---")}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Form Modal ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()}
              className="w-full max-w-2xl bg-[#12122a] rounded-2xl border border-white/10 p-6 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-white">{editing ? "עריכה" : "הוספה"}</h3>
                <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-white"><X size={18} /></button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {activeTab === "periods" && <>
                  <div><label className="text-xs text-muted-foreground">תקופה (YYYY-MM) *</label><input value={form.period || ""} onChange={e => setForm({ ...form, period: e.target.value })} placeholder="2026-03" className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">שיעור מע"מ</label><input type="number" step="0.1" value={form.vat_rate ?? 18} onChange={e => setForm({ ...form, vat_rate: parseFloat(e.target.value) })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">מקדמת מס הכנסה</label><input type="number" value={form.income_tax_advance || ""} onChange={e => setForm({ ...form, income_tax_advance: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">ביטוח לאומי</label><input type="number" value={form.social_security || ""} onChange={e => setForm({ ...form, social_security: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">תאריך יעד</label><input type="date" value={form.due_date || ""} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">סטטוס</label><select value={form.status || "open"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white">{Object.entries(PERIOD_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                </>}

                {activeTab === "transactions" && <>
                  <div><label className="text-xs text-muted-foreground">תקופה</label><select value={form.period_id || ""} onChange={e => setForm({ ...form, period_id: parseInt(e.target.value) })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white"><option value="">בחר...</option>{periods.map(p => <option key={p.id} value={p.id}>{p.period}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">סוג תנועה</label><select value={form.transaction_type || "sale"} onChange={e => setForm({ ...form, transaction_type: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white">{Object.entries(TXN_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">סוג מסמך</label><select value={form.document_type || "invoice"} onChange={e => setForm({ ...form, document_type: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white">{Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">מס' מסמך</label><input value={form.document_number || ""} onChange={e => setForm({ ...form, document_number: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">שם ישות</label><input value={form.entity_name || ""} onChange={e => setForm({ ...form, entity_name: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">תאריך</label><input type="date" value={form.date || ""} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">סכום לפני מע"מ *</label><input type="number" value={form.amount_before_vat || ""} onChange={e => setForm({ ...form, amount_before_vat: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">מע"מ (אוטומטי אם ריק)</label><input type="number" value={form.vat_amount || ""} onChange={e => setForm({ ...form, vat_amount: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">ניכוי במקור</label><input type="number" value={form.withholding_tax || ""} onChange={e => setForm({ ...form, withholding_tax: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                </>}

                {activeTab === "withholding" && <>
                  <div className="col-span-2"><label className="text-xs text-muted-foreground">שם ספק *</label><input value={form.supplier_name || ""} onChange={e => setForm({ ...form, supplier_name: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">מספר תעודה</label><input value={form.certificate_number || ""} onChange={e => setForm({ ...form, certificate_number: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">שיעור (%)</label><input type="number" step="0.1" value={form.rate || ""} onChange={e => setForm({ ...form, rate: parseFloat(e.target.value) })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">תקף מ-</label><input type="date" value={form.valid_from || ""} onChange={e => setForm({ ...form, valid_from: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">תקף עד</label><input type="date" value={form.valid_to || ""} onChange={e => setForm({ ...form, valid_to: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">סטטוס</label><select value={form.status || "active"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white"><option value="active">פעיל</option><option value="expired">פג תוקף</option></select></div>
                </>}
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-white transition">ביטול</button>
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50">
                  <Save size={15} /> {saving ? "שומר..." : "שמור"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
