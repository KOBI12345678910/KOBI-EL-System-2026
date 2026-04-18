import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, TrendingDown, Search, Plus, Edit2, Trash2, X, Save,
  Hash, Calendar, CheckCircle2, Clock, DollarSign,
  ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, Repeat,
  BarChart3, PieChart, Target, Layers,
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
import { authFetch } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ComposedChart, Line
} from "recharts";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const categoryOptions = [
  "מכירות", "גביית חובות", "הלוואות", "השקעות", "אחר-הכנסות",
  "משכורות", "ספקים", "שכירות", "ביטוח", "מיסים", "הלוואות-תשלום", "ציוד", "אחר-הוצאות"
];
const statusMap: Record<string, { label: string; color: string }> = {
  actual: { label: "בפועל", color: "bg-green-500/20 text-green-400" },
  forecast: { label: "תחזית", color: "bg-blue-500/20 text-blue-400" },
  confirmed: { label: "מאושר", color: "bg-emerald-500/20 text-emerald-400" },
  cancelled: { label: "בוטל", color: "bg-muted/50 text-muted-foreground" },
};
const monthNames: Record<string, string> = { "01": "ינואר", "02": "פברואר", "03": "מרץ", "04": "אפריל", "05": "מאי", "06": "יוני", "07": "יולי", "08": "אוגוסט", "09": "ספטמבר", "10": "אוקטובר", "11": "נובמבר", "12": "דצמבר" };

type TabType = "records" | "monthly" | "categories" | "forecast";

const tooltipStyle = { backgroundColor: "#1a1a2e", border: "1px solid #2a2a3e", borderRadius: "8px", color: "#fff" };

function ForecastChart({ monthlyData, forecastData }: { monthlyData: any[]; forecastData: any[] }) {
  const now = new Date();
  const curYear = now.getFullYear();

  const months12 = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(curYear, now.getMonth() - 5 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const monthlyMap: Record<string, any> = {};
  for (const m of monthlyData) {
    monthlyMap[m.month] = m;
  }
  const forecastMap: Record<string, any> = {};
  for (const f of forecastData) {
    forecastMap[f.month] = f;
  }

  const chartData = months12.map(month => {
    const [, mo] = month.split("-");
    const mLabel = monthNames[mo] || mo;
    const m = monthlyMap[month] || {};
    const f = forecastMap[month] || {};
    const inflows = Number(m.inflows || 0);
    const outflows = Number(m.outflows || 0);
    const net = inflows - outflows;
    const forecastTotal = Number(f.forecast_total || 0);
    const actualTotal = Number(f.actual_total || 0);
    return {
      month: mLabel,
      monthKey: month,
      הכנסות: inflows || null,
      הוצאות: outflows || null,
      "נטו": net || null,
      "תחזית": forecastTotal || null,
      "בפועל": actualTotal || null,
    };
  });

  return (
    <div className="space-y-4">
      <div className="bg-card/80 border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
          <TrendingUp className="w-4 h-4 text-emerald-400" />תזרים 12 חודשים — הכנסות מול הוצאות
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="cfGradIn" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="cfGradOut" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
            <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} />
            <YAxis tickFormatter={(v: number) => `₪${v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} />
            <Tooltip formatter={(v: any, name: string) => [`₪${fmt(v)}`, name]} contentStyle={tooltipStyle} />
            <Legend />
            <Area type="monotone" dataKey="הכנסות" stroke="#10b981" fill="url(#cfGradIn)" strokeWidth={2} connectNulls />
            <Area type="monotone" dataKey="הוצאות" stroke="#ef4444" fill="url(#cfGradOut)" strokeWidth={2} connectNulls />
            <Bar dataKey="נטו" fill="#3b82f6" radius={[3, 3, 0, 0]} opacity={0.7} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-card/80 border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
          <Target className="w-4 h-4 text-purple-400" />תחזית מול בפועל
        </div>
        {forecastData.length === 0 ? (
          <div className="text-muted-foreground text-sm text-center py-8">אין נתוני תחזית — הוסף רשומות עם סטטוס &quot;תחזית&quot;</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} />
              <YAxis tickFormatter={(v: number) => `₪${v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} />
              <Tooltip formatter={(v: any, name: string) => [`₪${fmt(v)}`, name]} contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="תחזית" fill="#8b5cf6" radius={[4, 4, 0, 0]} opacity={0.8} />
              <Bar dataKey="בפועל" fill="#06b6d4" radius={[4, 4, 0, 0]} opacity={0.8} />
              <Line type="monotone" dataKey="בפועל" stroke="#06b6d4" strokeWidth={2} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-card/80 border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-background/50 border-b border-border"><tr>
            <th className="px-3 py-3 text-right text-muted-foreground text-xs">חודש</th>
            <th className="px-3 py-3 text-right text-emerald-400 text-xs">בפועל</th>
            <th className="px-3 py-3 text-right text-purple-400 text-xs">תחזית</th>
            <th className="px-3 py-3 text-right text-xs">סטייה</th>
            <th className="px-3 py-3 text-right text-xs">% דיוק</th>
            <th className="px-3 py-3 text-right text-xs">פירוט</th>
          </tr></thead>
          <tbody>
            {forecastData.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">אין נתוני תחזית</td></tr>
            ) : forecastData.map((f: any, i: number) => {
              const variance = Number(f.variance || 0);
              const accuracy = Number(f.forecast_total || 0) > 0
                ? Math.min(100, (Number(f.actual_total) / Number(f.forecast_total)) * 100)
                : 0;
              const [year, month] = (f.month || "").split("-");
              return (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium text-foreground">{monthNames[month] || month} {year}</td>
                  <td className="px-3 py-2 text-emerald-400 font-mono font-bold">₪{fmt(f.actual_total)}</td>
                  <td className="px-3 py-2 text-purple-400 font-mono font-bold">₪{fmt(f.forecast_total)}</td>
                  <td className={`px-3 py-2 font-bold font-mono ${variance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {variance >= 0 ? "+" : ""}₪{fmt(variance)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-muted rounded-full h-2">
                        <div className={`h-2 rounded-full ${accuracy >= 90 ? "bg-emerald-500" : accuracy >= 70 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(accuracy, 100)}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{accuracy.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{f.actual_count} בפועל / {f.forecast_count} תחזיות</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CashFlowPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [records, setRecords] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [forecastData, setForecastData] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("record_date");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [tab, setTab] = useState<TabType>("records");
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const [tableLoading, setTableLoading] = useState(true);
  const [detailTab, setDetailTab] = useState("details");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const pagination = useSmartPagination(25);
  const { executeSave, executeDelete, execute, loading: actionLoading } = useApiAction();
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const cashFlowValidation = useFormValidation({ description: { required: true }, amount: { required: true, min: 0 } });

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/cash-flow`, { headers }).then(r => r.json()).then(d => setRecords(safeArray(d))),
      authFetch(`${API}/cash-flow/stats`, { headers }).then(r => r.json()).then(d => setStats(d || {})),
      authFetch(`${API}/cash-flow/monthly`, { headers }).then(r => r.json()).then(d => setMonthlyData(safeArray(d))),
      authFetch(`${API}/cash-flow/by-category`, { headers }).then(r => r.json()).then(d => setCategoryData(safeArray(d))),
      authFetch(`${API}/cash-flow/forecast-vs-actual`, { headers }).then(r => r.json()).then(d => setForecastData(safeArray(d)))
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    let f = records.filter(r =>
      (filterType === "all" || r.flow_type === filterType) &&
      (filterStatus === "all" || r.status === filterStatus) &&
      (!search || r.record_number?.toLowerCase().includes(search.toLowerCase()) || r.category?.toLowerCase().includes(search.toLowerCase()) || r.description?.toLowerCase().includes(search.toLowerCase()) || r.customer_name?.toLowerCase().includes(search.toLowerCase()) || r.supplier_name?.toLowerCase().includes(search.toLowerCase()))
    );
    f.sort((a: any, b: any) => { const av = a[sortField], bv = b[sortField]; const cmp = typeof av === "number" ? av - bv : String(av||"").localeCompare(String(bv||"")); return sortDir === "asc" ? cmp : -cmp; });
    return f;
  }, [records, search, filterType, filterStatus, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ recordDate: new Date().toISOString().slice(0,10), flowType: "inflow", category: "מכירות", currency: "ILS", status: "actual" }); setShowForm(true); };
  const openEdit = (r: any) => { setEditing(r); setForm({ recordDate: r.record_date?.slice(0,10), flowType: r.flow_type, category: r.category, subCategory: r.sub_category, description: r.description, amount: r.amount, currency: r.currency, bankAccountName: r.bank_account_name, isRecurring: r.is_recurring, recurringFrequency: r.recurring_frequency, customerName: r.customer_name, supplierName: r.supplier_name, projectName: r.project_name, isForecast: r.is_forecast, forecastDate: r.forecast_date?.slice(0,10), forecastProbability: r.forecast_probability, actualAmount: r.actual_amount, status: r.status, notes: r.notes }); setShowForm(true); };
  const save = async () => { const url = editing ? `${API}/cash-flow/${editing.id}` : `${API}/cash-flow`; await executeSave(url, editing ? "PUT" : "POST", form, editing ? "עודכן בהצלחה" : "נוצר בהצלחה", () => { setShowForm(false); load(); }); };
  const remove = async (id: number) => { await executeDelete(`${API}/cash-flow/${id}`, "למחוק רשומת תזרים?", () => load()); };
  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const netFlow = Number(stats.total_inflows || 0) - Number(stats.total_outflows || 0);
  const monthNetFlow = Number(stats.month_inflows || 0) - Number(stats.month_outflows || 0);

  const kpis = [
    { label: "סה\"כ רשומות", value: fmt(stats.total || 0), icon: Hash, color: "text-blue-400" },
    { label: "סה\"כ הכנסות", value: `₪${fmt(stats.total_inflows || 0)}`, icon: TrendingUp, color: "text-green-400" },
    { label: "סה\"כ הוצאות", value: `₪${fmt(stats.total_outflows || 0)}`, icon: TrendingDown, color: "text-red-400" },
    { label: "תזרים נטו", value: `₪${fmt(netFlow)}`, icon: DollarSign, color: netFlow >= 0 ? "text-green-400" : "text-red-400" },
    { label: "הכנסות החודש", value: `₪${fmt(stats.month_inflows || 0)}`, icon: ArrowUp, color: "text-emerald-400" },
    { label: "הוצאות החודש", value: `₪${fmt(stats.month_outflows || 0)}`, icon: ArrowDown, color: "text-orange-400" },
    { label: "תחזיות", value: fmt(stats.forecasts || 0), icon: Target, color: "text-purple-400" },
    { label: "חוזרות", value: fmt(stats.recurring || 0), icon: Repeat, color: "text-indigo-400" },
  ];

  const inflowCategories = categoryData.filter(c => c.flow_type === "inflow");
  const outflowCategories = categoryData.filter(c => c.flow_type === "outflow");
  const totalInflowCat = inflowCategories.reduce((s, c) => s + Number(c.total || 0), 0);
  const totalOutflowCat = outflowCategories.reduce((s, c) => s + Number(c.total || 0), 0);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><DollarSign className="text-emerald-400" /> תזרים מזומנים</h1>
          <p className="text-muted-foreground mt-1 text-sm">מעקב הכנסות/הוצאות, תחזיות, ניתוח חודשי, תזרים נטו</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={records} headers={{ record_number: "מספר", record_date: "תאריך", flow_type: "סוג", category: "קטגוריה", description: "תיאור", amount: "סכום", currency: "מטבע", customer_name: "לקוח", supplier_name: "ספק", status: "סטטוס" }} filename={"cash_flow"} />
          <button onClick={() => printPage("תזרים מזומנים")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-muted text-sm border border-border"><Printer size={16} /> הדפסה</button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-emerald-600 text-foreground px-3 py-2 rounded-lg hover:bg-emerald-700 shadow-lg text-sm"><Plus size={16} /> רשומה חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card/80 border border-border rounded-xl p-3">
            <kpi.icon className={`${kpi.color} mb-1`} size={20} />
            <div className="text-lg font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      {records.length > 1 && (() => {
        const now = new Date();
        const cm = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
        const pm = (() => { const d = new Date(now.getFullYear(), now.getMonth()-1, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; })();
        const cq = Math.floor(now.getMonth()/3);
        const qMonths = (q: number, y: number) => [0,1,2].map(i => `${y}-${String(q*3+i+1).padStart(2,"0")}`);
        const cqMonths = qMonths(cq, now.getFullYear());
        const pqMonths = cq > 0 ? qMonths(cq-1, now.getFullYear()) : qMonths(3, now.getFullYear()-1);
        const sumPeriod = (months: string[]) => records.filter(i => months.some(m => i.record_date?.startsWith(m))).reduce((a, i) => {
          const amt = Number(i.amount||0);
          return i.flow_type === "inflow" ? { ...a, inflow: a.inflow + amt, count: a.count + 1 } : { ...a, outflow: a.outflow + amt, count: a.count + 1 };
        }, { inflow: 0, outflow: 0, count: 0 });
        const curM = sumPeriod([cm]), prevM = sumPeriod([pm]);
        const curQ = sumPeriod(cqMonths), prevQ = sumPeriod(pqMonths);
        const curMNet = curM.inflow - curM.outflow, prevMNet = prevM.inflow - prevM.outflow;
        const curQNet = curQ.inflow - curQ.outflow, prevQNet = prevQ.inflow - prevQ.outflow;
        const pctChange = (c: number, p: number) => p === 0 ? (c > 0 ? 100 : 0) : Math.round(((c - p) / Math.abs(p)) * 100);
        const Arrow = ({ val }: { val: number }) => val > 0 ? <span className="text-emerald-400 text-xs font-bold">▲ +{val}%</span> : val < 0 ? <span className="text-red-400 text-xs font-bold">▼ {val}%</span> : <span className="text-muted-foreground text-xs">—</span>;
        return (
          <div className="bg-card/80 border border-border rounded-xl p-4">
            <div className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">📊 השוואת תקופות</div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-emerald-900/30 rounded-lg p-3 border border-emerald-700/50">
                <div className="text-[10px] text-muted-foreground mb-1">הכנסות: חודש נוכחי מול קודם</div>
                <div className="text-lg font-bold text-emerald-400">₪{fmt(curM.inflow)}</div>
                <div className="text-xs text-muted-foreground">מול ₪{fmt(prevM.inflow)}</div>
                <Arrow val={pctChange(curM.inflow, prevM.inflow)} />
              </div>
              <div className="bg-red-900/30 rounded-lg p-3 border border-red-700/50">
                <div className="text-[10px] text-muted-foreground mb-1">הוצאות: חודש נוכחי מול קודם</div>
                <div className="text-lg font-bold text-red-400">₪{fmt(curM.outflow)}</div>
                <div className="text-xs text-muted-foreground">מול ₪{fmt(prevM.outflow)}</div>
                <Arrow val={pctChange(curM.outflow, prevM.outflow)} />
              </div>
              <div className={`${curMNet >= 0 ? "bg-green-900/30 border-green-700/50" : "bg-red-900/30 border-red-700/50"} rounded-lg p-3 border`}>
                <div className="text-[10px] text-muted-foreground mb-1">נטו: חודש נוכחי מול קודם</div>
                <div className={`text-lg font-bold ${curMNet >= 0 ? "text-emerald-400" : "text-red-400"}`}>{curMNet >= 0 ? "+" : ""}₪{fmt(curMNet)}</div>
                <div className="text-xs text-muted-foreground">מול {prevMNet >= 0 ? "+" : ""}₪{fmt(prevMNet)}</div>
                <Arrow val={pctChange(curMNet, prevMNet)} />
              </div>
              <div className="bg-purple-900/30 rounded-lg p-3 border border-purple-700/50">
                <div className="text-[10px] text-muted-foreground mb-1">רבעון נוכחי מול קודם (נטו)</div>
                <div className={`text-lg font-bold ${curQNet >= 0 ? "text-emerald-400" : "text-red-400"}`}>{curQNet >= 0 ? "+" : ""}₪{fmt(curQNet)}</div>
                <div className="text-xs text-muted-foreground">מול {prevQNet >= 0 ? "+" : ""}₪{fmt(prevQNet)}</div>
                <Arrow val={pctChange(curQNet, prevQNet)} />
              </div>
            </div>
          </div>
        );
      })()}

      <div className="bg-card/80 border border-border rounded-xl p-4">
        <div className="text-sm font-bold text-foreground mb-2">תזרים נטו החודש</div>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between text-xs mb-1"><span className="text-emerald-400">הכנסות: ₪{fmt(stats.month_inflows || 0)}</span><span className="text-red-400">הוצאות: ₪{fmt(stats.month_outflows || 0)}</span></div>
            <div className="h-4 bg-muted rounded-full overflow-hidden flex">
              {(Number(stats.month_inflows || 0) + Number(stats.month_outflows || 0)) > 0 && (<>
                <div className="bg-emerald-500 h-full" style={{ width: `${(Number(stats.month_inflows || 0) / (Number(stats.month_inflows || 0) + Number(stats.month_outflows || 0))) * 100}%` }} />
                <div className="bg-red-500 h-full" style={{ width: `${(Number(stats.month_outflows || 0) / (Number(stats.month_inflows || 0) + Number(stats.month_outflows || 0))) * 100}%` }} />
              </>)}
            </div>
          </div>
          <div className={`text-xl font-bold ${monthNetFlow >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {monthNetFlow >= 0 ? "+" : ""}₪{fmt(monthNetFlow)}
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-border">
        {([["records", "רשומות"], ["monthly", "תצוגה חודשית"], ["categories", "לפי קטגוריה"], ["forecast", "תחזית 12 חודשים"]] as [TabType, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === key ? "border-emerald-500 text-emerald-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{label}</button>
        ))}
      </div>

      {tab === "records" && (<>
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
            <Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2 border border-border rounded-lg bg-input text-foreground" />
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border border-border rounded-lg px-3 py-2 bg-input text-foreground">
            <option value="all">הכל</option><option value="inflow">הכנסות</option><option value="outflow">הוצאות</option>
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border border-border rounded-lg px-3 py-2 bg-input text-foreground">
            <option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="bg-card/80 border border-border rounded-xl overflow-x-auto relative">
          {tableLoading && (
            <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center z-10">
              <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-4 py-2 shadow-lg"><Loader2 className="w-4 h-4 animate-spin text-amber-400" /><span className="text-sm text-foreground">טוען נתונים...</span></div>
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-background/50 border-b border-border"><tr>
              {[
                { key: "record_number", label: "מספר" }, { key: "record_date", label: "תאריך" },
                { key: "flow_type", label: "סוג" }, { key: "category", label: "קטגוריה" },
                { key: "description", label: "תיאור" }, { key: "amount", label: "סכום" },
                { key: "customer_name", label: "לקוח/ספק" }, { key: "project_name", label: "פרויקט" },
                { key: "status", label: "סטטוס" },
              ].map(col => (
                <th key={col.key} className="px-2 py-3 text-right cursor-pointer hover:bg-muted/50 text-xs text-muted-foreground" onClick={() => toggleSort(col.key)}>
                  <div className="flex items-center gap-1">{col.label} <ArrowUpDown size={10} /></div>
                </th>
              ))}
              <th className="px-2 py-3 text-right text-xs text-muted-foreground">פעולות</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">אין רשומות תזרים</td></tr> :
              pagination.paginate(filtered).map(r => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-2 py-2 font-mono text-blue-400 font-bold text-xs">{r.record_number}</td>
                  <td className="px-2 py-2 text-xs text-slate-300">{r.record_date?.slice(0, 10)}</td>
                  <td className="px-2 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${r.flow_type === "inflow" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                      {r.flow_type === "inflow" ? "הכנסה" : "הוצאה"}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-300">{r.category}</td>
                  <td className="px-2 py-2 max-w-[120px] truncate text-xs text-slate-300">{r.description || "-"}</td>
                  <td className={`px-2 py-2 font-bold font-mono ${r.flow_type === "inflow" ? "text-emerald-400" : "text-red-400"}`}>
                    {r.flow_type === "inflow" ? "+" : "-"}₪{fmt(r.amount)}
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-300">{r.customer_name || r.supplier_name || "-"}</td>
                  <td className="px-2 py-2 text-xs text-slate-300">{r.project_name || "-"}</td>
                  <td className="px-2 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${statusMap[r.status]?.color || "bg-muted/50 text-muted-foreground"}`}>{statusMap[r.status]?.label || r.status}</span>
                    {r.is_recurring && <Repeat size={10} className="inline ml-1 text-indigo-400" />}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(r)} className="p-1 hover:bg-blue-500/10 rounded text-muted-foreground hover:text-blue-400"><Edit2 size={13} /></button>
                      {isSuperAdmin && <button onClick={async () => { if (await globalConfirm(`למחוק את '${r.category || r.id}'? פעולה זו אינה ניתנת לביטול.`)) remove(r.id); }} className="p-1 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-400"><Trash2 size={13} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-background/50 border-t-2 border-border font-bold text-sm">
                <tr>
                  <td className="px-2 py-3 text-foreground" colSpan={3}>סה"כ ({filtered.length} שורות)</td>
                  <td className="px-2 py-3"></td>
                  <td className="px-2 py-3">
                    <div className="text-emerald-400 font-mono">+₪{fmt(filtered.filter(r => r.flow_type === "inflow").reduce((s, r) => s + Number(r.amount || 0), 0))}</div>
                    <div className="text-red-400 font-mono">-₪{fmt(filtered.filter(r => r.flow_type === "outflow").reduce((s, r) => s + Number(r.amount || 0), 0))}</div>
                  </td>
                  <td className="px-2 py-3 text-blue-400 font-mono">נטו: ₪{fmt(filtered.reduce((s, r) => s + (r.flow_type === "inflow" ? Number(r.amount || 0) : -Number(r.amount || 0)), 0))}</td>
                  <td colSpan={5}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <SmartPagination pagination={pagination} />
      </>)}

      {tab === "monthly" && (
        <div className="space-y-4">
          <div className="bg-card/80 border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-background/50 border-b border-border"><tr>
                <th className="px-3 py-3 text-right text-muted-foreground text-xs">חודש</th>
                <th className="px-3 py-3 text-right text-emerald-400 text-xs">הכנסות</th>
                <th className="px-3 py-3 text-right text-red-400 text-xs">הוצאות</th>
                <th className="px-3 py-3 text-right text-xs text-muted-foreground">נטו</th>
                <th className="px-3 py-3 text-right text-xs text-muted-foreground">תרשים</th>
                <th className="px-3 py-3 text-right text-xs text-muted-foreground">רשומות</th>
              </tr></thead>
              <tbody>
                {monthlyData.length === 0 ? <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">אין נתונים חודשיים</td></tr> :
                monthlyData.map((m, i) => {
                  const net = Number(m.net || 0);
                  const maxVal = Math.max(Number(m.inflows || 0), Number(m.outflows || 0), 1);
                  const [year, month] = (m.month || "").split("-");
                  return (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium text-foreground">{monthNames[month] || month} {year}</td>
                      <td className="px-3 py-2 text-emerald-400 font-bold font-mono">₪{fmt(m.inflows)}</td>
                      <td className="px-3 py-2 text-red-400 font-bold font-mono">₪{fmt(m.outflows)}</td>
                      <td className={`px-3 py-2 font-bold font-mono ${net >= 0 ? "text-emerald-400" : "text-red-400"}`}>{net >= 0 ? "+" : ""}₪{fmt(net)}</td>
                      <td className="px-3 py-3 w-48">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1"><div className="h-2 bg-emerald-500 rounded" style={{ width: `${(Number(m.inflows || 0) / maxVal) * 100}%` }} /></div>
                          <div className="flex items-center gap-1"><div className="h-2 bg-red-500 rounded" style={{ width: `${(Number(m.outflows || 0) / maxVal) * 100}%` }} /></div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center text-xs text-muted-foreground">{Number(m.inflow_count || 0) + Number(m.outflow_count || 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {monthlyData.length > 0 && (
            <div className="bg-card/80 border border-border rounded-xl p-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="text-center p-3 bg-emerald-900/30 border border-emerald-700/50 rounded-lg"><div className="text-xs text-muted-foreground">סה"כ הכנסות</div><div className="text-xl font-bold text-emerald-400 font-mono">₪{fmt(monthlyData.reduce((s, m) => s + Number(m.inflows || 0), 0))}</div></div>
                <div className="text-center p-3 bg-red-900/30 border border-red-700/50 rounded-lg"><div className="text-xs text-muted-foreground">סה"כ הוצאות</div><div className="text-xl font-bold text-red-400 font-mono">₪{fmt(monthlyData.reduce((s, m) => s + Number(m.outflows || 0), 0))}</div></div>
                <div className="text-center p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg"><div className="text-xs text-muted-foreground">סה"כ נטו</div><div className={`text-xl font-bold font-mono ${monthlyData.reduce((s, m) => s + Number(m.net || 0), 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>₪{fmt(monthlyData.reduce((s, m) => s + Number(m.net || 0), 0))}</div></div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "categories" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-card/80 border border-border rounded-xl p-4">
            <h3 className="text-sm font-bold text-emerald-400 mb-3 flex items-center gap-1"><TrendingUp size={16} /> הכנסות לפי קטגוריה</h3>
            {inflowCategories.length === 0 ? <div className="text-muted-foreground text-sm py-4">אין נתונים</div> :
            <div className="space-y-3">
              {inflowCategories.map((c, i) => {
                const pct = totalInflowCat > 0 ? (Number(c.total) / totalInflowCat * 100) : 0;
                return (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1"><span className="font-medium text-foreground">{c.category}</span><span className="text-emerald-400 font-bold font-mono">₪{fmt(c.total)} ({pct.toFixed(1)}%)</span></div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden"><div className="bg-emerald-500 h-full rounded-full" style={{ width: `${pct}%` }} /></div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{c.count} רשומות | ממוצע: ₪{fmt(c.avg_amount)}</div>
                  </div>
                );
              })}
              <div className="border-t border-border pt-2 flex justify-between font-bold text-sm"><span className="text-foreground">סה"כ</span><span className="text-emerald-400 font-mono">₪{fmt(totalInflowCat)}</span></div>
            </div>}
          </div>
          <div className="bg-card/80 border border-border rounded-xl p-4">
            <h3 className="text-sm font-bold text-red-400 mb-3 flex items-center gap-1"><TrendingDown size={16} /> הוצאות לפי קטגוריה</h3>
            {outflowCategories.length === 0 ? <div className="text-muted-foreground text-sm py-4">אין נתונים</div> :
            <div className="space-y-3">
              {outflowCategories.map((c, i) => {
                const pct = totalOutflowCat > 0 ? (Number(c.total) / totalOutflowCat * 100) : 0;
                return (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1"><span className="font-medium text-foreground">{c.category}</span><span className="text-red-400 font-bold font-mono">₪{fmt(c.total)} ({pct.toFixed(1)}%)</span></div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden"><div className="bg-red-500 h-full rounded-full" style={{ width: `${pct}%` }} /></div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{c.count} רשומות | ממוצע: ₪{fmt(c.avg_amount)}</div>
                  </div>
                );
              })}
              <div className="border-t border-border pt-2 flex justify-between font-bold text-sm"><span className="text-foreground">סה"כ</span><span className="text-red-400 font-mono">₪{fmt(totalOutflowCat)}</span></div>
            </div>}
          </div>
        </div>
      )}

      {tab === "forecast" && (
        <ForecastChart monthlyData={monthlyData} forecastData={forecastData} />
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">{editing ? "עריכת רשומה" : "רשומה חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><label className="text-xs text-muted-foreground mb-1 block">תאריך <RequiredMark /></label><input type="date" value={form.recordDate || ""} onChange={e => setForm({ ...form, recordDate: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 bg-input text-foreground" /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">סוג תזרים</label>
                  <select value={form.flowType || "inflow"} onChange={e => setForm({ ...form, flowType: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 bg-input text-foreground">
                    <option value="inflow">הכנסה</option><option value="outflow">הוצאה</option>
                  </select></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">קטגוריה</label>
                  <select value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 bg-input text-foreground">
                    {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select></div>
                <div className="col-span-2 md:col-span-3"><label className="text-xs text-muted-foreground mb-1 block">תיאור <RequiredMark /></label>
                  <input value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 bg-input text-foreground" placeholder="תיאור הרשומה..." />
                  <FormFieldError validation={cashFlowValidation} field="description" /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">סכום (₪) <RequiredMark /></label>
                  <input type="number" min={0} value={form.amount || ""} onChange={e => setForm({ ...form, amount: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 bg-input text-foreground font-mono" placeholder="0.00" />
                  <FormFieldError validation={cashFlowValidation} field="amount" /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">סטטוס</label>
                  <select value={form.status || "actual"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 bg-input text-foreground">
                    {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">לקוח</label><input value={form.customerName || ""} onChange={e => setForm({ ...form, customerName: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 bg-input text-foreground" /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">ספק</label><input value={form.supplierName || ""} onChange={e => setForm({ ...form, supplierName: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 bg-input text-foreground" /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">פרויקט</label><input value={form.projectName || ""} onChange={e => setForm({ ...form, projectName: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 bg-input text-foreground" /></div>
                <div className="col-span-2 md:col-span-3"><label className="text-xs text-muted-foreground mb-1 block">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border border-border rounded-lg px-3 py-2 bg-input text-foreground resize-none" /></div>
              </div>
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-border rounded-lg text-sm text-foreground hover:bg-muted">ביטול</button>
                <button onClick={save} disabled={actionLoading} className="px-4 py-2 bg-emerald-600 text-foreground rounded-lg text-sm hover:bg-emerald-700 flex items-center gap-2"><Save size={16} />{editing ? "עדכן" : "שמור"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
