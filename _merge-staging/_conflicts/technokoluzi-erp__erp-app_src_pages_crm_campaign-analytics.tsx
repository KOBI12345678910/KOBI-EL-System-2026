import { useState, useMemo, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import {
  BarChart3, TrendingUp, DollarSign, Target, Search, ArrowUpDown, Loader2, X,
  Eye, Megaphone, Users, Zap, Globe, Mail, Phone, Share2, MonitorPlay,
  Percent, Award, Activity, Filter, Download, ChevronDown
} from "lucide-react";

const API = "/api";
const getHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}` });
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${n.toFixed(1)}%`;

type Campaign = {
  id: number;
  name: string;
  type: string;
  channel: string;
  budget: number;
  spent: number;
  leads: number;
  dealsClosed: number;
  revenue: number;
  roi: number;
  status: "active" | "completed" | "paused" | "draft" | "cancelled";
  startDate: string;
  endDate: string;
  manager: string;
  conversionRate: number;
  costPerLead: number;
};

const TYPE_OPTIONS = ["דיגיטלי", "אירועים", "תוכן", "הפניות", "שותפויות", "דיוור", "טלמרקטינג", "ריטרגטינג"];
const CHANNEL_OPTIONS = ["גוגל", "פייסבוק", "לינקדאין", "אינסטגרם", "אימייל", "SMS", "WhatsApp", "אתר", "תערוכה", "טלפון", "שותפים"];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: "פעילה", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  completed: { label: "הושלמה", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  paused: { label: "מושהית", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  draft: { label: "טיוטה", color: "bg-muted/20 text-muted-foreground border-gray-500/30" },
  cancelled: { label: "בוטלה", color: "bg-red-500/20 text-red-400 border-red-500/30" },
};

const CHANNEL_ICONS: Record<string, any> = {
  "גוגל": Globe, "פייסבוק": Share2, "לינקדאין": Share2, "אינסטגרם": MonitorPlay,
  "אימייל": Mail, "SMS": Phone, "WhatsApp": Phone, "אתר": Globe,
  "תערוכה": Megaphone, "טלפון": Phone, "שותפים": Users,
};

const INITIAL_DATA: Campaign[] = [
  { id: 1, name: "קמפיין גוגל Q1 2026", type: "דיגיטלי", channel: "גוגל", budget: 50000, spent: 42000, leads: 340, dealsClosed: 28, revenue: 280000, roi: 566.7, status: "active", startDate: "2026-01-01", endDate: "2026-03-31", manager: "מיכל דהן", conversionRate: 8.2, costPerLead: 123.5 },
  { id: 2, name: "קמפיין פייסבוק - מוצר חדש", type: "דיגיטלי", channel: "פייסבוק", budget: 30000, spent: 28500, leads: 520, dealsClosed: 18, revenue: 126000, roi: 342.1, status: "active", startDate: "2026-02-01", endDate: "2026-04-30", manager: "שרה לוי", conversionRate: 3.5, costPerLead: 54.8 },
  { id: 3, name: "תערוכת טכנולוגיה 2026", type: "אירועים", channel: "תערוכה", budget: 120000, spent: 115000, leads: 180, dealsClosed: 12, revenue: 450000, roi: 291.3, status: "completed", startDate: "2026-02-15", endDate: "2026-02-17", manager: "יוסי כהן", conversionRate: 6.7, costPerLead: 638.9 },
  { id: 4, name: "דיוור ללקוחות קיימים", type: "דיוור", channel: "אימייל", budget: 5000, spent: 4200, leads: 85, dealsClosed: 22, revenue: 88000, roi: 1995.2, status: "completed", startDate: "2026-01-15", endDate: "2026-02-28", manager: "רחל אברהם", conversionRate: 25.9, costPerLead: 49.4 },
  { id: 5, name: "קמפיין לינקדאין B2B", type: "דיגיטלי", channel: "לינקדאין", budget: 25000, spent: 18000, leads: 95, dealsClosed: 8, revenue: 160000, roi: 788.9, status: "active", startDate: "2026-03-01", endDate: "2026-05-31", manager: "אלון גולדשטיין", conversionRate: 8.4, costPerLead: 189.5 },
  { id: 6, name: "SMS שבוע המכירות", type: "דיוור", channel: "SMS", budget: 3000, spent: 2800, leads: 120, dealsClosed: 15, revenue: 45000, roi: 1507.1, status: "completed", startDate: "2026-03-10", endDate: "2026-03-17", manager: "מיכל דהן", conversionRate: 12.5, costPerLead: 23.3 },
  { id: 7, name: "שותפויות ערוציות Q2", type: "שותפויות", channel: "שותפים", budget: 40000, spent: 12000, leads: 45, dealsClosed: 5, revenue: 75000, roi: 525.0, status: "active", startDate: "2026-03-15", endDate: "2026-06-30", manager: "דוד מזרחי", conversionRate: 11.1, costPerLead: 266.7 },
  { id: 8, name: "ריטרגטינג אתר", type: "ריטרגטינג", channel: "גוגל", budget: 15000, spent: 13500, leads: 210, dealsClosed: 25, revenue: 125000, roi: 825.9, status: "active", startDate: "2026-02-01", endDate: "2026-04-30", manager: "שרה לוי", conversionRate: 11.9, costPerLead: 64.3 },
  { id: 9, name: "WhatsApp - אוטומציה", type: "דיוור", channel: "WhatsApp", budget: 8000, spent: 6000, leads: 280, dealsClosed: 20, revenue: 60000, roi: 900.0, status: "active", startDate: "2026-03-01", endDate: "2026-04-30", manager: "רחל אברהם", conversionRate: 7.1, costPerLead: 21.4 },
  { id: 10, name: "קמפיין תוכן - בלוג", type: "תוכן", channel: "אתר", budget: 10000, spent: 8500, leads: 150, dealsClosed: 10, revenue: 70000, roi: 723.5, status: "active", startDate: "2026-01-01", endDate: "2026-06-30", manager: "אלון גולדשטיין", conversionRate: 6.7, costPerLead: 56.7 },
  { id: 11, name: "טלמרקטינג - לידים קרים", type: "טלמרקטינג", channel: "טלפון", budget: 20000, spent: 18000, leads: 60, dealsClosed: 6, revenue: 48000, roi: 166.7, status: "paused", startDate: "2026-02-01", endDate: "2026-04-30", manager: "עומר ביטון", conversionRate: 10.0, costPerLead: 300.0 },
  { id: 12, name: "אינסטגרם - מודעות", type: "דיגיטלי", channel: "אינסטגרם", budget: 12000, spent: 0, leads: 0, dealsClosed: 0, revenue: 0, roi: 0, status: "draft", startDate: "2026-04-01", endDate: "2026-06-30", manager: "מיכל דהן", conversionRate: 0, costPerLead: 0 },
];

export default function CampaignAnalytics() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterChannel, setFilterChannel] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [sortField, setSortField] = useState<string>("roi");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [tableLoading, setTableLoading] = useState(true);
  const [viewDetail, setViewDetail] = useState<Campaign | null>(null);

  const load = useCallback(() => {
    setTableLoading(true);
    authFetch(`${API}/crm-sap/campaigns`, { headers: getHeaders() })
      .then(r => r.json())
      .then(d => setItems(Array.isArray(d) ? d : INITIAL_DATA))
      .catch(() => setItems(INITIAL_DATA))
      .finally(() => setTableLoading(false));
  }, []);
  useEffect(load, [load]);

  const stats = useMemo(() => {
    const active = items.filter(i => i.status !== "draft" && i.status !== "cancelled");
    return {
      totalCampaigns: items.length,
      activeCampaigns: items.filter(i => i.status === "active").length,
      totalBudget: active.reduce((s, i) => s + i.budget, 0),
      totalSpent: active.reduce((s, i) => s + i.spent, 0),
      totalLeads: active.reduce((s, i) => s + i.leads, 0),
      totalDeals: active.reduce((s, i) => s + i.dealsClosed, 0),
      totalRevenue: active.reduce((s, i) => s + i.revenue, 0),
      avgRoi: active.filter(i => i.spent > 0).length ? active.filter(i => i.spent > 0).reduce((s, i) => s + i.roi, 0) / active.filter(i => i.spent > 0).length : 0,
      avgConversion: active.filter(i => i.leads > 0).length ? active.filter(i => i.leads > 0).reduce((s, i) => s + i.conversionRate, 0) / active.filter(i => i.leads > 0).length : 0,
    };
  }, [items]);

  const filtered = useMemo(() => {
    let f = items.filter(r => {
      const s = `${r.name} ${r.manager} ${r.type} ${r.channel}`.toLowerCase();
      if (search && !s.includes(search.toLowerCase())) return false;
      if (filterType && r.type !== filterType) return false;
      if (filterChannel && r.channel !== filterChannel) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      return true;
    });
    f.sort((a: any, b: any) => {
      const va = a[sortField], vb = b[sortField];
      const cmp = typeof va === "number" ? va - vb : String(va || "").localeCompare(String(vb || ""), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return f;
  }, [items, search, filterType, filterChannel, filterStatus, sortField, sortDir]);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };
  const SortIcon = ({ field }: { field: string }) => (
    <ArrowUpDown className={`inline w-3 h-3 mr-1 cursor-pointer ${sortField === field ? "text-primary" : "text-muted-foreground"}`} onClick={() => toggleSort(field)} />
  );

  const roiColor = (v: number) => v >= 500 ? "text-green-400" : v >= 200 ? "text-blue-400" : v >= 100 ? "text-amber-400" : v > 0 ? "text-orange-400" : "text-muted-foreground";
  const roiBg = (v: number) => v >= 500 ? "bg-green-500" : v >= 200 ? "bg-blue-500" : v >= 100 ? "bg-amber-500" : "bg-red-500";

  const usedTypes = useMemo(() => [...new Set(items.map(i => i.type))].sort(), [items]);
  const usedChannels = useMemo(() => [...new Set(items.map(i => i.channel))].sort(), [items]);

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="w-7 h-7 text-primary" /> אנליטיקת קמפיינים ו-ROI</h1>
          <p className="text-muted-foreground mt-1">מעקב ביצועים, תקציב והחזר השקעה של קמפיינים שיווקיים</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {[
          { label: "סה\"כ קמפיינים", value: `${stats.activeCampaigns} פעילים / ${stats.totalCampaigns}`, icon: Megaphone, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "סה\"כ הוצאה", value: fmtC(stats.totalSpent), sub: `תקציב: ${fmtC(stats.totalBudget)}`, icon: DollarSign, color: "text-amber-400", bg: "bg-amber-500/10" },
          { label: "סה\"כ הכנסה", value: fmtC(stats.totalRevenue), sub: `${fmt(stats.totalDeals)} עסקאות`, icon: TrendingUp, color: "text-green-400", bg: "bg-green-500/10" },
          { label: "ROI ממוצע", value: pct(stats.avgRoi), icon: Percent, color: stats.avgRoi >= 300 ? "text-green-400" : "text-amber-400", bg: stats.avgRoi >= 300 ? "bg-green-500/10" : "bg-amber-500/10" },
          { label: "לידים / המרה", value: `${fmt(stats.totalLeads)} / ${pct(stats.avgConversion)}`, icon: Target, color: "text-purple-400", bg: "bg-purple-500/10" },
        ].map((c, i) => (
          <div key={i} className={`rounded-xl border border-border/50 p-4 ${c.bg}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{c.label}</span>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </div>
            <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
            {"sub" in c && c.sub && <div className="text-xs text-muted-foreground mt-1">{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* Top Performers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: "ROI הגבוה ביותר", items: [...items].filter(i => i.spent > 0).sort((a, b) => b.roi - a.roi).slice(0, 3), metric: (i: Campaign) => pct(i.roi), color: "text-green-400" },
          { title: "הכי הרבה לידים", items: [...items].sort((a, b) => b.leads - a.leads).slice(0, 3), metric: (i: Campaign) => fmt(i.leads), color: "text-blue-400" },
          { title: "הכנסה גבוהה ביותר", items: [...items].sort((a, b) => b.revenue - a.revenue).slice(0, 3), metric: (i: Campaign) => fmtC(i.revenue), color: "text-purple-400" },
        ].map((section, si) => (
          <div key={si} className="rounded-xl border border-border p-4 space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-2"><Award className={`w-4 h-4 ${section.color}`} />{section.title}</h3>
            {section.items.map((item, idx) => (
              <div key={item.id} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? "bg-amber-500/20 text-amber-400" : "bg-muted/30 text-muted-foreground"}`}>{idx + 1}</span>
                  <span className="text-sm truncate max-w-[160px]">{item.name}</span>
                </div>
                <span className={`text-sm font-bold ${section.color}`}>{section.metric(item)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש קמפיין, מנהל..." className="w-full pr-10 pl-4 py-2 rounded-lg border border-border bg-card text-sm" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-sm">
          <option value="">כל הסוגים</option>
          {usedTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterChannel} onChange={e => setFilterChannel(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-sm">
          <option value="">כל הערוצים</option>
          {usedChannels.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-sm">
          <option value="">כל הסטטוסים</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {(search || filterType || filterChannel || filterStatus) && (
          <button onClick={() => { setSearch(""); setFilterType(""); setFilterChannel(""); setFilterStatus(""); }} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
            <X className="w-3 h-3" /> נקה
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="p-3 text-right font-medium cursor-pointer" onClick={() => toggleSort("name")}>שם קמפיין <SortIcon field="name" /></th>
                <th className="p-3 text-center font-medium">סוג</th>
                <th className="p-3 text-center font-medium">ערוץ</th>
                <th className="p-3 text-right font-medium cursor-pointer" onClick={() => toggleSort("budget")}>תקציב <SortIcon field="budget" /></th>
                <th className="p-3 text-right font-medium cursor-pointer" onClick={() => toggleSort("spent")}>הוצאה <SortIcon field="spent" /></th>
                <th className="p-3 text-center font-medium cursor-pointer" onClick={() => toggleSort("leads")}>לידים <SortIcon field="leads" /></th>
                <th className="p-3 text-center font-medium cursor-pointer" onClick={() => toggleSort("dealsClosed")}>עסקאות <SortIcon field="dealsClosed" /></th>
                <th className="p-3 text-right font-medium cursor-pointer" onClick={() => toggleSort("revenue")}>הכנסה <SortIcon field="revenue" /></th>
                <th className="p-3 text-center font-medium cursor-pointer" onClick={() => toggleSort("roi")}>ROI % <SortIcon field="roi" /></th>
                <th className="p-3 text-center font-medium">סטטוס</th>
                <th className="p-3 text-center font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <tr><td colSpan={11} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">לא נמצאו קמפיינים</td></tr>
              ) : filtered.map(r => {
                const ChIcon = CHANNEL_ICONS[r.channel] || Globe;
                const budgetPct = r.budget > 0 ? (r.spent / r.budget) * 100 : 0;
                return (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20 transition">
                    <td className="p-3">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.manager}</div>
                    </td>
                    <td className="p-3 text-center text-xs">{r.type}</td>
                    <td className="p-3 text-center">
                      <span className="inline-flex items-center gap-1 text-xs"><ChIcon className="w-3 h-3" />{r.channel}</span>
                    </td>
                    <td className="p-3 font-mono text-xs">{fmtC(r.budget)}</td>
                    <td className="p-3">
                      <div className="font-mono text-xs">{fmtC(r.spent)}</div>
                      <div className="w-full bg-muted/30 rounded-full h-1 mt-1">
                        <div className={`h-1 rounded-full ${budgetPct > 90 ? "bg-red-500" : budgetPct > 70 ? "bg-amber-500" : "bg-blue-500"}`} style={{ width: `${Math.min(budgetPct, 100)}%` }} />
                      </div>
                    </td>
                    <td className="p-3 text-center">{fmt(r.leads)}</td>
                    <td className="p-3 text-center font-bold">{fmt(r.dealsClosed)}</td>
                    <td className="p-3 font-mono text-xs font-bold text-green-400">{fmtC(r.revenue)}</td>
                    <td className="p-3 text-center">
                      <div className={`font-bold ${roiColor(r.roi)}`}>{r.roi > 0 ? pct(r.roi) : "—"}</div>
                      {r.roi > 0 && (
                        <div className="w-full bg-muted/30 rounded-full h-1.5 mt-1">
                          <div className={`h-1.5 rounded-full ${roiBg(r.roi)}`} style={{ width: `${Math.min(r.roi / 10, 100)}%` }} />
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_MAP[r.status]?.color}`}>{STATUS_MAP[r.status]?.label}</span>
                    </td>
                    <td className="p-3 text-center">
                      <button onClick={() => setViewDetail(r)} className="p-1.5 rounded-lg hover:bg-muted/30" title="פרטים"><Eye className="w-4 h-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
          <span>מציג {filtered.length} מתוך {items.length} קמפיינים</span>
          <div className="flex items-center gap-4">
            <span>הוצאה: <span className="text-amber-400 font-bold">{fmtC(filtered.reduce((s, r) => s + r.spent, 0))}</span></span>
            <span>הכנסה: <span className="text-green-400 font-bold">{fmtC(filtered.reduce((s, r) => s + r.revenue, 0))}</span></span>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {viewDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setViewDetail(null)}>
          <div className="bg-card rounded-2xl border border-border w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2"><Megaphone className="w-5 h-5 text-primary" />{viewDetail.name}</h2>
              <button onClick={() => setViewDetail(null)} className="p-1 rounded hover:bg-muted/30"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">סוג:</span> {viewDetail.type}</div>
              <div><span className="text-muted-foreground">ערוץ:</span> {viewDetail.channel}</div>
              <div><span className="text-muted-foreground">מנהל:</span> {viewDetail.manager}</div>
              <div><span className="text-muted-foreground">סטטוס:</span> <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_MAP[viewDetail.status]?.color}`}>{STATUS_MAP[viewDetail.status]?.label}</span></div>
              <div><span className="text-muted-foreground">תקציב:</span> {fmtC(viewDetail.budget)}</div>
              <div><span className="text-muted-foreground">הוצאה:</span> {fmtC(viewDetail.spent)}</div>
              <div><span className="text-muted-foreground">לידים:</span> {fmt(viewDetail.leads)}</div>
              <div><span className="text-muted-foreground">עסקאות:</span> {fmt(viewDetail.dealsClosed)}</div>
              <div><span className="text-muted-foreground">הכנסה:</span> <span className="text-green-400 font-bold">{fmtC(viewDetail.revenue)}</span></div>
              <div><span className="text-muted-foreground">ROI:</span> <span className={`font-bold ${roiColor(viewDetail.roi)}`}>{pct(viewDetail.roi)}</span></div>
              <div><span className="text-muted-foreground">שיעור המרה:</span> {pct(viewDetail.conversionRate)}</div>
              <div><span className="text-muted-foreground">עלות ליד:</span> {viewDetail.costPerLead > 0 ? fmtC(viewDetail.costPerLead) : "—"}</div>
              <div><span className="text-muted-foreground">התחלה:</span> {new Date(viewDetail.startDate).toLocaleDateString("he-IL")}</div>
              <div><span className="text-muted-foreground">סיום:</span> {new Date(viewDetail.endDate).toLocaleDateString("he-IL")}</div>
            </div>
            {/* ROI Summary */}
            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">הוצאה</div>
                  <div className="font-bold text-amber-400">{fmtC(viewDetail.spent)}</div>
                </div>
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">הכנסה</div>
                  <div className="font-bold text-green-400">{fmtC(viewDetail.revenue)}</div>
                </div>
                <span className="text-2xl">=</span>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">ROI</div>
                  <div className={`text-xl font-bold ${roiColor(viewDetail.roi)}`}>{pct(viewDetail.roi)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
