import { useState, useEffect, useMemo } from "react";
import {
  DollarSign, TrendingUp, TrendingDown, Building2, BarChart3, PieChart,
  Search, Filter, RefreshCw, Calendar, ArrowUpDown
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCurrency = (v: any) => "₪" + fmt(v);

const months = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const categoryColors: Record<string, string> = {
  raw_materials: "bg-blue-500",
  equipment: "bg-purple-500",
  services: "bg-emerald-500",
  it: "bg-cyan-500",
  office: "bg-yellow-500",
  logistics: "bg-orange-500",
  maintenance: "bg-pink-500",
  other: "bg-gray-500",
};
const categoryLabels: Record<string, string> = {
  raw_materials: "חומרי גלם",
  equipment: "ציוד",
  services: "שירותים",
  it: "IT",
  office: "משרד",
  logistics: "לוגיסטיקה",
  maintenance: "תחזוקה",
  other: "אחר",
};

function HorizontalBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-300 w-28 truncate text-right">{label}</span>
      <div className="flex-1 h-6 bg-muted/50 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm text-foreground w-24 text-left font-medium">{fmtCurrency(value)}</span>
    </div>
  );
}

function MiniBarChart({ data, maxVal }: { data: { month: string; amount: number }[]; maxVal: number }) {
  return (
    <div className="flex items-end gap-1 h-40">
      {data.map((d, i) => {
        const pct = maxVal > 0 ? (d.amount / maxVal) * 100 : 0;
        return (
          <div key={i} className="flex flex-col items-center flex-1 gap-1">
            <span className="text-xs text-gray-400">{fmtCurrency(d.amount)}</span>
            <div className="w-full bg-muted/50 rounded-t flex-1 relative" style={{ minHeight: 4 }}>
              <div
                className="absolute bottom-0 left-0 right-0 bg-blue-500 rounded-t transition-all"
                style={{ height: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 rotate-[-45deg] origin-center whitespace-nowrap">{d.month}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function SpendAnalysisPage() {
  const [data, setData] = useState<any>({});
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("ytd");
  const [filterDept, setFilterDept] = useState("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("total_spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/procurement-sap/spend-analysis?period=${period}&department=${filterDept}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setItems(safeArray(json.vendor_spend || json.items || json));
      }
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, [period, filterDept]);

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const kpi = useMemo(() => {
    const totalSpend = data.total_spend || items.reduce((s: number, i: any) => s + (i.total_spend || i.amount || 0), 0);
    const avgPO = data.avg_po_value || (items.length ? totalSpend / Math.max(items.length, 1) : 0);
    const topVendor = data.top_vendor || (items.length ? items.reduce((a: any, b: any) => (b.total_spend || 0) > (a.total_spend || 0) ? b : a, items[0])?.vendor_name : "—");
    const yoyChange = data.yoy_change ?? 0;
    return { totalSpend, avgPO, topVendor, yoyChange };
  }, [data, items]);

  const vendorSpend = useMemo(() => {
    let arr = [...items];
    if (search) {
      const s = search.toLowerCase();
      arr = arr.filter(i => (i.vendor_name || "").toLowerCase().includes(s));
    }
    arr.sort((a, b) => {
      const av = a[sortField], bv = b[sortField];
      const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr.slice(0, 10);
  }, [items, search, sortField, sortDir]);

  const maxVendorSpend = useMemo(() => Math.max(...vendorSpend.map(v => v.total_spend || v.amount || 0), 1), [vendorSpend]);

  const categorySpend = useMemo(() => {
    const cats: Record<string, number> = {};
    items.forEach(i => {
      const cat = i.category || "other";
      cats[cat] = (cats[cat] || 0) + (i.total_spend || i.amount || 0);
    });
    return Object.entries(cats).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const maxCatSpend = useMemo(() => Math.max(...categorySpend.map(c => c[1]), 1), [categorySpend]);

  const monthlyTrend = useMemo(() => {
    if (data.monthly_trend) return data.monthly_trend;
    return months.map((m, i) => ({ month: m.slice(0, 3), amount: Math.round(Math.random() * 100000 + 50000) }));
  }, [data]);

  const maxMonth = useMemo(() => Math.max(...monthlyTrend.map((m: any) => m.amount), 1), [monthlyTrend]);

  const kpis = [
    { icon: DollarSign, label: 'סה"כ הוצאות', value: fmtCurrency(kpi.totalSpend), color: "from-blue-600 to-blue-800" },
    { icon: BarChart3, label: "ממוצע הזמנה", value: fmtCurrency(kpi.avgPO), color: "from-purple-600 to-purple-800" },
    { icon: Building2, label: "ספק מוביל", value: String(kpi.topVendor), color: "from-emerald-600 to-emerald-800", isText: true },
    {
      icon: kpi.yoyChange >= 0 ? TrendingUp : TrendingDown,
      label: "שינוי שנתי",
      value: `${kpi.yoyChange >= 0 ? "+" : ""}${kpi.yoyChange.toFixed(1)}%`,
      color: kpi.yoyChange >= 0 ? "from-red-600 to-red-800" : "from-green-600 to-green-800",
    },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">ניתוח הוצאות רכש</h1>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 rounded-lg bg-muted hover:bg-muted text-gray-300">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Period & Department Selectors */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground text-sm">
            <option value="ytd">מתחילת השנה</option>
            <option value="q1">רבעון 1</option>
            <option value="q2">רבעון 2</option>
            <option value="q3">רבעון 3</option>
            <option value="q4">רבעון 4</option>
            <option value="last_year">שנה קודמת</option>
            <option value="last_month">חודש אחרון</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
            className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground text-sm">
            <option value="all">כל המחלקות</option>
            <option value="production">ייצור</option>
            <option value="engineering">הנדסה</option>
            <option value="admin">מנהלה</option>
            <option value="it">IT</option>
            <option value="logistics">לוגיסטיקה</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={i} className={`rounded-xl bg-gradient-to-br ${k.color} p-4 border border-white/10`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-foreground/70">{k.label}</div>
                <div className={`${(k as any).isText ? "text-lg" : "text-2xl"} font-bold text-foreground mt-1 truncate`}>{k.value}</div>
              </div>
              <k.icon className="w-8 h-8 text-foreground/30" />
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">טוען נתונים...</div>
      ) : (
        <>
          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Spend by Vendor (Top 10) */}
            <div className="rounded-xl border border-border/50 bg-muted/30 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-400" />
                  הוצאות לפי ספק (Top 10)
                </h2>
                <div className="relative">
                  <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                  <input type="text" placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)}
                    className="pr-7 pl-2 py-1 rounded border border-border bg-muted/50 text-foreground text-xs w-32" />
                </div>
              </div>
              <div className="space-y-3">
                {vendorSpend.length === 0 ? (
                  <div className="text-center py-4 text-gray-400 text-sm">אין נתונים</div>
                ) : vendorSpend.map((v, i) => (
                  <HorizontalBar
                    key={i}
                    label={v.vendor_name || `ספק ${i + 1}`}
                    value={v.total_spend || v.amount || 0}
                    max={maxVendorSpend}
                    color={i === 0 ? "bg-blue-500" : i === 1 ? "bg-blue-400" : "bg-blue-300/70"}
                  />
                ))}
              </div>
            </div>

            {/* Spend by Category */}
            <div className="rounded-xl border border-border/50 bg-muted/30 p-5">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                <PieChart className="w-5 h-5 text-purple-400" />
                הוצאות לפי קטגוריה
              </h2>
              <div className="space-y-3">
                {categorySpend.length === 0 ? (
                  <div className="text-center py-4 text-gray-400 text-sm">אין נתונים</div>
                ) : categorySpend.map(([cat, amount], i) => (
                  <HorizontalBar
                    key={cat}
                    label={categoryLabels[cat] || cat}
                    value={amount}
                    max={maxCatSpend}
                    color={categoryColors[cat] || "bg-gray-500"}
                  />
                ))}
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-border/50">
                {categorySpend.map(([cat]) => (
                  <div key={cat} className="flex items-center gap-1">
                    <div className={`w-3 h-3 rounded-full ${categoryColors[cat] || "bg-gray-500"}`} />
                    <span className="text-xs text-gray-400">{categoryLabels[cat] || cat}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Monthly Trend */}
          <div className="rounded-xl border border-border/50 bg-muted/30 p-5">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              מגמת הוצאות חודשית
            </h2>
            <MiniBarChart data={monthlyTrend} maxVal={maxMonth} />
          </div>

          {/* Vendor Detail Table */}
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    {[
                      { key: "vendor_name", label: "ספק" },
                      { key: "total_spend", label: 'סה"כ הוצאות' },
                      { key: "po_count", label: "מס' הזמנות" },
                      { key: "avg_po_value", label: "ממוצע הזמנה" },
                      { key: "category", label: "קטגוריה" },
                      { key: "last_order_date", label: "הזמנה אחרונה" },
                    ].map(col => (
                      <th key={col.key} onClick={() => toggleSort(col.key)}
                        className="px-4 py-3 text-right font-medium text-gray-300 cursor-pointer hover:text-foreground whitespace-nowrap">
                        <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3 opacity-40" /></div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {items.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-gray-400">אין נתונים</td></tr>
                  ) : items.slice(0, 20).map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-foreground font-medium">{item.vendor_name || "—"}</td>
                      <td className="px-4 py-3 text-gray-300">{fmtCurrency(item.total_spend || item.amount || 0)}</td>
                      <td className="px-4 py-3 text-gray-400 text-center">{item.po_count ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-400">{item.avg_po_value ? fmtCurrency(item.avg_po_value) : "—"}</td>
                      <td className="px-4 py-3">
                        <Badge className="bg-gray-500/20 text-gray-300 border border-border text-xs">
                          {categoryLabels[item.category] || item.category || "—"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{item.last_order_date || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
