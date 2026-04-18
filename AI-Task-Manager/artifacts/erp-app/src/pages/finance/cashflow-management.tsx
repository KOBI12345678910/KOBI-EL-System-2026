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
  Wallet, Search, Plus, Edit2, Trash2, X, Save, Eye, ArrowUpDown, TrendingUp, TrendingDown,
  Calendar, Clock, DollarSign, AlertTriangle, BarChart3, PieChart, ChevronLeft,
  ArrowRightLeft, CreditCard, Building2, Banknote, Play, Loader2
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtCur = (v: any) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(Number(v || 0));

const DIRECTIONS: Record<string, { label: string; color: string; icon: any }> = {
  inbound: { label: "הכנסה", color: "text-emerald-400", icon: TrendingUp },
  outbound: { label: "הוצאה", color: "text-red-400", icon: TrendingDown },
};
const ENTITY_TYPES = ["customer", "supplier", "employee", "tax", "bank", "other"];
const ENTITY_LABELS: Record<string, string> = { customer: "לקוח", supplier: "ספק", employee: "עובד", tax: "מס", bank: "בנק", other: "אחר" };
const PAYMENT_METHODS = ["cash", "check", "transfer", "credit_card"];
const PM_LABELS: Record<string, string> = { cash: "מזומן", check: "צ'ק", transfer: "העברה", credit_card: "כרטיס אשראי" };
const STATUSES = ["planned", "confirmed", "completed"];
const STATUS_LABELS: Record<string, string> = { planned: "מתוכנן", confirmed: "מאושר", completed: "בוצע" };
const RISK_COLORS: Record<string, string> = { safe: "bg-green-500/20 text-green-400", tight: "bg-amber-500/20 text-amber-400", critical: "bg-red-500/20 text-red-400" };
const RISK_LABELS: Record<string, string> = { safe: "בטוח", tight: "צפוף", critical: "קריטי" };

type Tab = "entries" | "weekly" | "monthly" | "schedules" | "whatif";

export default function CashflowManagement() {
  const [activeTab, setActiveTab] = useState<Tab>("entries");
  const [dashboard, setDashboard] = useState<any>({});
  const [entries, setEntries] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [weeklyForecast, setWeeklyForecast] = useState<any[]>([]);
  const [monthlyForecast, setMonthlyForecast] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDir, setFilterDir] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  // What-if params
  const [wiDelayDays, setWiDelayDays] = useState(0);
  const [wiReducePct, setWiReducePct] = useState(0);
  const [wiAddOutbound, setWiAddOutbound] = useState(0);
  const [wiResult, setWiResult] = useState<any>(null);
  const [wiLoading, setWiLoading] = useState(false);

  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true);
    try {
      const [dRes, eRes, cRes, wRes, mRes, sRes] = await Promise.all([
        authFetch(`${API}/cashflow/dashboard`).catch(() => null),
        authFetch(`${API}/cashflow/entries`),
        authFetch(`${API}/cashflow/categories`),
        authFetch(`${API}/cashflow/weekly-forecast`).catch(() => null),
        authFetch(`${API}/cashflow/monthly-forecast`).catch(() => null),
        authFetch(`${API}/cashflow/schedules`),
      ]);
      if (dRes?.ok) setDashboard(await dRes.json());
      if (eRes.ok) setEntries(safeArray(await eRes.json()));
      if (cRes.ok) setCategories(safeArray(await cRes.json()));
      if (wRes?.ok) setWeeklyForecast(safeArray(await wRes.json()));
      if (mRes?.ok) setMonthlyForecast(safeArray(await mRes.json()));
      if (sRes.ok) setSchedules(safeArray(await sRes.json()));
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm({}); setShowForm(true); };
  const openEdit = (item: any) => { setEditing(item); setForm({ ...item }); setShowForm(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      const path = activeTab === "schedules" ? "cashflow/schedules" : "cashflow/entries";
      const method = editing ? "PUT" : "POST";
      const url = editing ? `${API}/${path}/${editing.id}` : `${API}/${path}`;
      const r = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!r.ok) throw new Error("Save failed");
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const handleDelete = async (id: number, path = "cashflow/entries") => {
    const ok = await globalConfirm({ title: "מחיקה", message: "למחוק?" });
    if (!ok) return;
    await authFetch(`${API}/${path}/${id}`, { method: "DELETE" });
    load();
  };

  const runWhatIf = async () => {
    setWiLoading(true);
    try {
      const r = await authFetch(`${API}/cashflow/what-if`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delay_days: wiDelayDays, reduce_inbound_pct: wiReducePct, add_outbound: wiAddOutbound })
      });
      if (r.ok) setWiResult(await r.json());
    } catch {}
    setWiLoading(false);
  };

  const filtered = useMemo(() => {
    let data = entries;
    if (search) { const s = search.toLowerCase(); data = data.filter(i => JSON.stringify(i).toLowerCase().includes(s)); }
    if (filterDir !== "all") data = data.filter(i => i.direction === filterDir);
    if (filterStatus !== "all") data = data.filter(i => i.status === filterStatus);
    return data;
  }, [entries, search, filterDir, filterStatus]);

  const paged = filtered.slice(pagination.startIndex, pagination.endIndex + 1);

  const statsCards = [
    { label: "יתרה נוכחית", value: fmtCur(dashboard.current_balance), icon: Wallet, color: (dashboard.current_balance || 0) >= 0 ? "text-emerald-400" : "text-red-400" },
    { label: "הכנסות החודש", value: fmtCur(dashboard.month_inbound), icon: TrendingUp, color: "text-emerald-400" },
    { label: "הוצאות החודש", value: fmtCur(dashboard.month_outbound), icon: TrendingDown, color: "text-red-400" },
    { label: "תשלומים קרובים", value: `${dashboard.upcoming_payments_count || 0} (${fmtCur(dashboard.upcoming_payments_total)})`, icon: Clock, color: "text-amber-400" },
  ];

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "entries", label: "רשומות", icon: ArrowRightLeft },
    { key: "weekly", label: "תחזית שבועית", icon: Calendar },
    { key: "monthly", label: "תחזית חודשית", icon: BarChart3 },
    { key: "schedules", label: "לוח תשלומים", icon: CreditCard },
    { key: "whatif", label: "סימולציה", icon: Play },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Wallet className="text-emerald-400" /> ניהול תזרים מזומנים</h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב, תחזית וסימולציה של תזרים מזומנים</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportDropdown data={filtered} filename="cashflow" />
          {(activeTab === "entries" || activeTab === "schedules") && (
            <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition">
              <Plus size={16} /> הוסף
            </button>
          )}
        </div>
      </div>

      {/* Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statsCards.map(c => (
          <div key={c.label} className="bg-[#1a1a2e] border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2"><c.icon size={18} className={c.color} /><span className="text-xs text-muted-foreground">{c.label}</span></div>
            <div className="text-lg font-bold text-white">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/10 pb-0">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === t.key ? "border-emerald-500 text-emerald-400" : "border-transparent text-muted-foreground hover:text-white"}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-400" /></div>
      ) : (
        <>
          {/* ═══ ENTRIES TAB ═══ */}
          {activeTab === "entries" && (
            <>
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-9 pl-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" />
                </div>
                <select value={filterDir} onChange={e => setFilterDir(e.target.value)} className="bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="all">כל הכיוונים</option>
                  <option value="inbound">הכנסה</option>
                  <option value="outbound">הוצאה</option>
                </select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="all">כל הסטטוסים</option>
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>

              <div className="bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-white/10 text-muted-foreground text-xs">
                    <th className="p-3 text-right">תאריך</th><th className="p-3 text-right">כיוון</th>
                    <th className="p-3 text-right">תיאור</th><th className="p-3 text-right">גורם</th>
                    <th className="p-3 text-right">סכום</th><th className="p-3 text-right">אמצעי</th>
                    <th className="p-3 text-right">סטטוס</th><th className="p-3 text-center">פעולות</th>
                  </tr></thead>
                  <tbody>
                    {paged.map(item => {
                      const dir = DIRECTIONS[item.direction];
                      return (
                        <tr key={item.id} className="border-b border-white/5 hover:bg-white/5 transition cursor-pointer" onClick={() => setViewDetail(item)}>
                          <td className="p-3 text-muted-foreground text-xs">{item.date ? new Date(item.date).toLocaleDateString("he-IL") : ""}</td>
                          <td className="p-3"><Badge className={`${dir?.color}`}>{dir?.label}</Badge></td>
                          <td className="p-3 text-white">{item.description}</td>
                          <td className="p-3 text-muted-foreground">{item.entity_name || ENTITY_LABELS[item.entity_type] || ""}</td>
                          <td className={`p-3 font-medium ${item.direction === 'inbound' ? 'text-emerald-400' : 'text-red-400'}`}>{fmtCur(item.amount)}</td>
                          <td className="p-3"><Badge variant="outline">{PM_LABELS[item.payment_method] || item.payment_method}</Badge></td>
                          <td className="p-3"><Badge className={item.status === 'completed' ? 'bg-green-500/20 text-green-400' : item.status === 'confirmed' ? 'bg-blue-500/20 text-blue-400' : 'bg-muted/20'}>{STATUS_LABELS[item.status]}</Badge></td>
                          <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => openEdit(item)} className="p-1.5 rounded hover:bg-white/10 text-muted-foreground hover:text-white"><Edit2 size={14} /></button>
                              <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400"><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {paged.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">אין רשומות</td></tr>}
                  </tbody>
                </table>
              </div>
              <SmartPagination totalItems={filtered.length} {...pagination} />
            </>
          )}

          {/* ═══ WEEKLY FORECAST ═══ */}
          {activeTab === "weekly" && (
            <div className="bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/10 text-muted-foreground text-xs">
                  <th className="p-3 text-right">שבוע</th><th className="p-3 text-right">תחילת שבוע</th>
                  <th className="p-3 text-right">הכנסות</th><th className="p-3 text-right">הוצאות</th>
                  <th className="p-3 text-right">נטו</th><th className="p-3 text-right">יתרה פתיחה</th>
                  <th className="p-3 text-right">יתרה סגירה</th><th className="p-3 text-right">סיכון</th>
                </tr></thead>
                <tbody>
                  {weeklyForecast.map((w: any, i: number) => (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-3 text-white font-medium">{w.week}</td>
                      <td className="p-3 text-muted-foreground text-xs">{w.start_date}</td>
                      <td className="p-3 text-emerald-400">{fmtCur(w.inbound)}</td>
                      <td className="p-3 text-red-400">{fmtCur(w.outbound)}</td>
                      <td className={`p-3 font-medium ${w.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtCur(w.net)}</td>
                      <td className="p-3 text-muted-foreground">{fmtCur(w.opening_balance)}</td>
                      <td className={`p-3 font-medium ${w.closing_balance >= 0 ? 'text-white' : 'text-red-400'}`}>{fmtCur(w.closing_balance)}</td>
                      <td className="p-3"><Badge className={RISK_COLORS[w.risk] || ""}>{RISK_LABELS[w.risk] || w.risk}</Badge></td>
                    </tr>
                  ))}
                  {weeklyForecast.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">אין נתוני תחזית</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* ═══ MONTHLY FORECAST ═══ */}
          {activeTab === "monthly" && (
            <div className="space-y-4">
              {/* Chart-like bar visualization */}
              <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-4">
                <h3 className="text-sm font-medium text-white mb-4">תחזית 12 חודשים</h3>
                <div className="flex items-end gap-2 h-40">
                  {monthlyForecast.map((m: any, i: number) => {
                    const maxVal = Math.max(...monthlyForecast.map((x: any) => Math.max(Math.abs(x.inbound), Math.abs(x.outbound), 1)));
                    const inH = (m.inbound / maxVal) * 100;
                    const outH = (m.outbound / maxVal) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div className="flex gap-0.5 items-end h-28 w-full">
                          <div className="flex-1 bg-emerald-500/30 rounded-t" style={{ height: `${inH}%` }} title={`הכנסות: ${fmtCur(m.inbound)}`} />
                          <div className="flex-1 bg-red-500/30 rounded-t" style={{ height: `${outH}%` }} title={`הוצאות: ${fmtCur(m.outbound)}`} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{m.period?.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-500/30 rounded" /> הכנסות</span>
                  <span className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500/30 rounded" /> הוצאות</span>
                </div>
              </div>

              <div className="bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-white/10 text-muted-foreground text-xs">
                    <th className="p-3 text-right">תקופה</th><th className="p-3 text-right">הכנסות</th>
                    <th className="p-3 text-right">הוצאות</th><th className="p-3 text-right">נטו</th>
                    <th className="p-3 text-right">יתרה סגירה</th><th className="p-3 text-right">סיכון</th>
                  </tr></thead>
                  <tbody>
                    {monthlyForecast.map((m: any, i: number) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                        <td className="p-3 text-white font-medium">{m.period}</td>
                        <td className="p-3 text-emerald-400">{fmtCur(m.inbound)}</td>
                        <td className="p-3 text-red-400">{fmtCur(m.outbound)}</td>
                        <td className={`p-3 font-medium ${m.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtCur(m.net)}</td>
                        <td className={`p-3 font-medium ${m.closing_balance >= 0 ? 'text-white' : 'text-red-400'}`}>{fmtCur(m.closing_balance)}</td>
                        <td className="p-3"><Badge className={RISK_COLORS[m.risk] || ""}>{RISK_LABELS[m.risk] || m.risk}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══ PAYMENT SCHEDULES ═══ */}
          {activeTab === "schedules" && (
            <div className="bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/10 text-muted-foreground text-xs">
                  <th className="p-3 text-right">גורם</th><th className="p-3 text-right">סוג</th>
                  <th className="p-3 text-right">סה"כ</th><th className="p-3 text-right">שולם</th>
                  <th className="p-3 text-right">יתרה</th><th className="p-3 text-right">תשלום הבא</th>
                  <th className="p-3 text-center">פעולות</th>
                </tr></thead>
                <tbody>
                  {schedules.map((s: any) => (
                    <tr key={s.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-3 text-white font-medium">{s.entity_name}</td>
                      <td className="p-3 text-muted-foreground">{ENTITY_LABELS[s.entity_type] || s.entity_type}</td>
                      <td className="p-3 text-white">{fmtCur(s.total_amount)}</td>
                      <td className="p-3 text-emerald-400">{fmtCur(s.paid_amount)}</td>
                      <td className="p-3 text-amber-400">{fmtCur(s.remaining_amount)}</td>
                      <td className="p-3 text-muted-foreground text-xs">{s.next_payment_date ? new Date(s.next_payment_date).toLocaleDateString("he-IL") : "---"}</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEdit(s)} className="p-1.5 rounded hover:bg-white/10 text-muted-foreground hover:text-white"><Edit2 size={14} /></button>
                          <button onClick={() => handleDelete(s.id, "cashflow/schedules")} className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {schedules.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">אין לוחות תשלומים</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* ═══ WHAT-IF SIMULATOR ═══ */}
          {activeTab === "whatif" && (
            <div className="space-y-4">
              <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-6">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Play className="text-purple-400" /> סימולטור מה-אם</h3>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="text-xs text-muted-foreground">עיכוב בהכנסות (ימים)</label>
                    <input type="number" value={wiDelayDays} onChange={e => setWiDelayDays(parseInt(e.target.value) || 0)}
                      className="w-full mt-1 px-3 py-2 bg-[#0f0f23] border border-white/10 rounded-lg text-sm text-white" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">הפחתת הכנסות (%)</label>
                    <input type="number" value={wiReducePct} onChange={e => setWiReducePct(parseInt(e.target.value) || 0)}
                      className="w-full mt-1 px-3 py-2 bg-[#0f0f23] border border-white/10 rounded-lg text-sm text-white" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">הוצאה נוספת חד-פעמית</label>
                    <input type="number" value={wiAddOutbound} onChange={e => setWiAddOutbound(parseInt(e.target.value) || 0)}
                      className="w-full mt-1 px-3 py-2 bg-[#0f0f23] border border-white/10 rounded-lg text-sm text-white" />
                  </div>
                </div>
                <button onClick={runWhatIf} disabled={wiLoading}
                  className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50">
                  {wiLoading ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} הרץ סימולציה
                </button>
              </div>

              {wiResult && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-4">
                      <div className="text-xs text-muted-foreground mb-1">יתרה מינימלית</div>
                      <div className={`text-xl font-bold ${wiResult.min_balance >= 0 ? 'text-white' : 'text-red-400'}`}>{fmtCur(wiResult.min_balance)}</div>
                    </div>
                    <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-4">
                      <div className="text-xs text-muted-foreground mb-1">ימים עד שלילי</div>
                      <div className="text-xl font-bold text-white">{wiResult.days_until_negative >= 0 ? wiResult.days_until_negative : "לא צפוי"}</div>
                    </div>
                    <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-4">
                      <div className="text-xs text-muted-foreground mb-1">רמת סיכון</div>
                      <Badge className={`text-lg ${RISK_COLORS[wiResult.risk] || ""}`}>{RISK_LABELS[wiResult.risk] || wiResult.risk}</Badge>
                    </div>
                  </div>

                  {wiResult.scenario?.length > 0 && (
                    <div className="bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-[#1a1a2e]"><tr className="border-b border-white/10 text-muted-foreground text-xs">
                          <th className="p-3 text-right">תאריך</th><th className="p-3 text-right">כיוון</th>
                          <th className="p-3 text-right">סכום</th><th className="p-3 text-right">יתרה</th>
                        </tr></thead>
                        <tbody>
                          {wiResult.scenario.slice(0, 50).map((s: any, i: number) => (
                            <tr key={i} className="border-b border-white/5">
                              <td className="p-3 text-muted-foreground text-xs">{s.date}</td>
                              <td className="p-3"><Badge className={s.direction === 'inbound' ? 'text-emerald-400' : 'text-red-400'}>{DIRECTIONS[s.direction]?.label}</Badge></td>
                              <td className="p-3 text-white">{fmtCur(s.amount)}</td>
                              <td className={`p-3 font-medium ${s.balance >= 0 ? 'text-white' : 'text-red-400'}`}>{fmtCur(s.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
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
                <h3 className="text-lg font-bold text-white">{viewDetail.description || "פרטים"}</h3>
                <button onClick={() => { openEdit(viewDetail); setViewDetail(null); }} className="p-1.5 rounded hover:bg-white/10"><Edit2 size={14} /></button>
              </div>
              <div className="space-y-4">
                {Object.entries(viewDetail).filter(([k]) => !["id","created_at"].includes(k)).map(([k, v]) => (
                  <div key={k}><div className="text-xs text-muted-foreground mb-0.5">{k}</div><div className="text-sm text-white">{v != null ? String(v) : "---"}</div></div>
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

              {activeTab === "schedules" ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2"><label className="text-xs text-muted-foreground">שם גורם *</label><input value={form.entity_name || ""} onChange={e => setForm({ ...form, entity_name: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">סוג</label><select value={form.entity_type || "other"} onChange={e => setForm({ ...form, entity_type: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white">{ENTITY_TYPES.map(t => <option key={t} value={t}>{ENTITY_LABELS[t]}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">סכום כולל</label><input type="number" value={form.total_amount || ""} onChange={e => setForm({ ...form, total_amount: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">שולם</label><input type="number" value={form.paid_amount || ""} onChange={e => setForm({ ...form, paid_amount: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">תשלום הבא</label><input type="date" value={form.next_payment_date || ""} onChange={e => setForm({ ...form, next_payment_date: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs text-muted-foreground">תאריך *</label><input type="date" value={form.date || ""} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">כיוון *</label><select value={form.direction || "inbound"} onChange={e => setForm({ ...form, direction: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white"><option value="inbound">הכנסה</option><option value="outbound">הוצאה</option></select></div>
                  <div className="col-span-2"><label className="text-xs text-muted-foreground">תיאור</label><input value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">סכום *</label><input type="number" value={form.amount || ""} onChange={e => setForm({ ...form, amount: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">סוג גורם</label><select value={form.entity_type || "other"} onChange={e => setForm({ ...form, entity_type: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white">{ENTITY_TYPES.map(t => <option key={t} value={t}>{ENTITY_LABELS[t]}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">שם גורם</label><input value={form.entity_name || ""} onChange={e => setForm({ ...form, entity_name: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">אמצעי תשלום</label><select value={form.payment_method || "transfer"} onChange={e => setForm({ ...form, payment_method: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white">{PAYMENT_METHODS.map(p => <option key={p} value={p}>{PM_LABELS[p]}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">אסמכתא</label><input value={form.reference || ""} onChange={e => setForm({ ...form, reference: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white" /></div>
                  <div><label className="text-xs text-muted-foreground">סטטוס</label><select value={form.status || "planned"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white">{STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">קטגוריה</label><select value={form.category_id || ""} onChange={e => setForm({ ...form, category_id: e.target.value || null })} className="w-full mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-sm text-white"><option value="">ללא</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                </div>
              )}

              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-white transition">ביטול</button>
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50">
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
