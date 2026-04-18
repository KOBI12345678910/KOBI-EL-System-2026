import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import {
  TrendingUp, TrendingDown, BarChart2, ArrowUpRight, ArrowDownRight,
  Target, Star, Search, ArrowUpDown, Eye, X, AlertTriangle, Zap, Users
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

const MONTH_NAMES: Record<string, string> = {
  "01": "ינו", "02": "פבר", "03": "מרצ", "04": "אפר", "05": "מאי", "06": "יונ",
  "07": "יול", "08": "אוג", "09": "ספט", "10": "אוק", "11": "נוב", "12": "דצמ",
};

function getMonthLabel(ym: string): string {
  const parts = ym.split("-");
  if (parts.length < 2) return ym;
  return `${MONTH_NAMES[parts[1]] || parts[1]} ${parts[0].slice(2)}`;
}

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}
    </div>
  );
}

export default function TrendsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [revenueStats, setRevenueStats] = useState<any>({});
  const [leadStats, setLeadStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("period");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const pagination = useSmartPagination(25);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      authFetch(`${API}/crm/analytics/monthly`).then(r => r.json()).catch(() => ({})),
      authFetch(`${API}/crm/leads/scored`).then(r => r.json()).catch(() => ({})),
    ]).then(([monthly, leads]) => {
      const leadsMap: Record<string, number> = {};
      (monthly.monthlyLeads || []).forEach((m: any) => { leadsMap[m.month] = Number(m.leads || 0); });
      const revenueMap: Record<string, number> = {};
      (monthly.monthlyRevenue || []).forEach((m: any) => { revenueMap[m.month] = Math.round(Number(m.revenue || 0)); });
      const dealsMap: Record<string, number> = {};
      (monthly.monthlyDeals || []).forEach((m: any) => { dealsMap[m.month] = Number(m.deals || 0); });
      const allMonths = [...new Set([...Object.keys(leadsMap), ...Object.keys(revenueMap), ...Object.keys(dealsMap)])].sort().slice(-12);
      const data = allMonths.map((m, i) => ({
        id: i + 1,
        month: m,
        period: getMonthLabel(m),
        leads: leadsMap[m] || 0,
        deals: dealsMap[m] || 0,
        revenue: revenueMap[m] || 0,
      }));
      setMonthlyData(data);
      setRevenueStats(monthly.revenueStats || {});
      setLeadStats({ hotCount: leads.hotCount || 0, warmCount: leads.warmCount || 0, coldCount: leads.coldCount || 0, avgScore: leads.avgScore || 0, totalLeads: (leads.leads || []).length });
    }).catch((e: any) => setError(e.message || "שגיאה")).finally(() => setLoading(false));
  }, []);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = monthlyData.filter(d => !search || d.period?.includes(search));
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [monthlyData, search, sortField, sortDir]);

  const thisMonth = Number(revenueStats.this_month_revenue || 0);
  const lastMonth = Number(revenueStats.last_month_revenue || 0);
  const revenueChange = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : 0;
  const latestData = monthlyData[monthlyData.length - 1] || {};
  const prevData = monthlyData[monthlyData.length - 2] || {};
  const leadsChange = prevData.leads > 0 ? Math.round(((latestData.leads - prevData.leads) / prevData.leads) * 100) : 0;

  const kpis = [
    { label: "הכנסות החודש", value: fmtC(thisMonth), icon: TrendingUp, color: "text-green-400" },
    { label: "שינוי הכנסות", value: `${revenueChange > 0 ? "+" : ""}${revenueChange}%`, icon: revenueChange >= 0 ? ArrowUpRight : ArrowDownRight, color: revenueChange >= 0 ? "text-green-400" : "text-red-400" },
    { label: "לידים חמים", value: fmt(leadStats.hotCount || 0), icon: Zap, color: "text-red-400" },
    { label: "ציון ממוצע", value: fmt(leadStats.avgScore || 0), icon: Star, color: "text-amber-400" },
    { label: "שינוי לידים", value: `${leadsChange > 0 ? "+" : ""}${leadsChange}%`, icon: leadsChange >= 0 ? ArrowUpRight : ArrowDownRight, color: leadsChange >= 0 ? "text-cyan-400" : "text-red-400" },
    { label: "סה\"כ לידים", value: fmt(leadStats.totalLeads || 0), icon: Users, color: "text-blue-400" },
  ];

  const columns = [
    { key: "period", label: "תקופה" },
    { key: "leads", label: "לידים" },
    { key: "deals", label: "עסקאות" },
    { key: "revenue", label: "הכנסות" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="text-cyan-400 w-6 h-6" />
            Trend Analysis
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניתוח מגמות עמוק על ציר הזמן — גלה מה מניע את הצמיחה</p>
        </div>
        <ExportDropdown data={filtered} headers={{ period: "תקופה", leads: "לידים", deals: "עסקאות", revenue: "הכנסות" }} filename="trend_analysis" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} />
            <div className="text-xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש תקופה..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} חודשים</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">שגיאה בטעינה</p><p className="text-sm mt-1">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין נתוני מגמה</p>
          <p className="text-sm mt-1">הנתונים יופיעו לאחר הוספת לידים, עסקאות והכנסות</p>
        </div>
      ) : (<>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { title: "לידים לפי חודש", data: monthlyData, key: "leads", color: "text-blue-400" },
            { title: "עסקאות לפי חודש", data: monthlyData, key: "deals", color: "text-green-400" },
            { title: "הכנסות לפי חודש", data: monthlyData, key: "revenue", color: "text-amber-400" },
          ].map((chart, i) => {
            const max = Math.max(...chart.data.map((d: any) => d[chart.key] || 0), 1);
            return (
              <div key={i} className="bg-card border border-border/50 rounded-2xl p-5">
                <h3 className={`font-bold text-sm mb-4 flex items-center gap-2 ${chart.color}`}>
                  <BarChart2 className="w-4 h-4" />{chart.title}
                </h3>
                <div className="flex items-end gap-1 h-16">
                  {chart.data.map((d: any, di: number) => (
                    <div key={di} className="flex-1 bg-gradient-to-t from-primary to-primary/60 rounded-sm opacity-80" style={{ height: `${((d[chart.key] || 0) / max) * 100}%` }} />
                  ))}
                </div>
                <div className="flex justify-between mt-2">
                  {chart.data.map((d: any, di: number) => <span key={di} className="text-[9px] text-muted-foreground">{d.period}</span>)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  {columns.map(col => (
                    <th key={col.key} onClick={() => toggleSort(col.key)}
                      className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                      <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginate(filtered).map(r => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{r.period}</td>
                    <td className="px-4 py-3 text-blue-400">{fmt(r.leads)}</td>
                    <td className="px-4 py-3 text-green-400">{fmt(r.deals)}</td>
                    <td className="px-4 py-3 text-amber-400 font-medium">{fmtC(r.revenue)}</td>
                    <td className="px-4 py-3"><button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <SmartPagination pagination={pagination} />

        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="font-bold mb-4 text-foreground">מצב לידים לפי קטגוריה</h3>
          <div className="space-y-3">
            {[
              { channel: "Hot Leads", count: leadStats.hotCount || 0, color: "bg-red-500" },
              { channel: "Warm Leads", count: leadStats.warmCount || 0, color: "bg-amber-500" },
              { channel: "Cold Leads", count: leadStats.coldCount || 0, color: "bg-blue-500" },
            ].map((row, i) => (
              <div key={i} className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground w-28 flex-shrink-0">{row.channel}</span>
                <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${row.color}`} style={{ width: `${(leadStats.totalLeads || 0) > 0 ? (row.count / leadStats.totalLeads) * 100 : 0}%` }} />
                </div>
                <span className="text-sm text-foreground w-8 text-right font-bold">{row.count}</span>
              </div>
            ))}
          </div>
        </div>
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{viewDetail.period} — פירוט</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="תקופה" value={viewDetail.period} />
                <DetailField label="לידים" value={fmt(viewDetail.leads)} />
                <DetailField label="עסקאות" value={fmt(viewDetail.deals)} />
                <DetailField label="הכנסות" value={fmtC(viewDetail.revenue)} />
              </div>
              <div className="p-5 border-t border-border flex justify-end">
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="trends" entityId="all" />
        <RelatedRecords entityType="trends" entityId="all" />
      </div>
    </div>
  );
}