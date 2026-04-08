import { useState, useEffect, useMemo } from "react";
import {
  BarChart3, Search, ArrowUpDown, AlertTriangle, TrendingUp,
  TrendingDown, Activity, Eye, X, Hash, DollarSign
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCurrency = (v: any) => Number(v || 0).toLocaleString("he-IL", { style: "currency", currency: "ILS" });

interface AnalyticsRecord {
  id: number;
  month: string;
  income: number;
  expenses: number;
  profit: number;
  margin: number;
  name: string;
  value: number;
  type: string;
  category: string;
}

const typeMap: Record<string, { label: string; color: string }> = {
  monthly: { label: "חודשי", color: "bg-cyan-500/20 text-cyan-400" },
  customer: { label: "לקוח", color: "bg-green-500/20 text-green-400" },
  expense: { label: "הוצאה", color: "bg-red-500/20 text-red-400" },
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

export default function AnalyticsPage() {
  const [items, setItems] = useState<AnalyticsRecord[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("income");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<AnalyticsRecord | null>(null);
  const pagination = useSmartPagination(25);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/reports-center/financial`);
      if (res.ok) {
        const d = await res.json();
        const MONTHS_HE = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יוני", "יולי", "אוג", "ספט", "אוק", "נוב", "דצמ"];
        const monthly = (d?.monthly || []).map((m: any, idx: number) => ({
          id: idx + 1, month: MONTHS_HE[idx] || `${idx + 1}`,
          income: Number(m.income || 0), expenses: Number(m.expenses || 0),
          profit: Number(m.profit || 0),
          margin: Number(m.income || 0) > 0 ? Math.round((Number(m.profit || 0) / Number(m.income || 0)) * 100) : 0,
          name: MONTHS_HE[idx] || "", value: Number(m.income || 0), type: "monthly", category: "",
        }));
        const customers = (d?.topCustomers || []).map((c: any, idx: number) => ({
          id: 100 + idx, month: "", income: Number(c.value || 0), expenses: 0, profit: 0, margin: 0,
          name: c.name || "", value: Number(c.value || 0), type: "customer", category: "",
        }));
        const expCats = (d?.expensesByCategory || []).map((e: any, idx: number) => ({
          id: 200 + idx, month: "", income: 0, expenses: Number(e.amount || 0), profit: 0, margin: 0,
          name: e.category || "כללי", value: Number(e.amount || 0), type: "expense", category: e.category || "",
        }));
        setSummary({
          totalIncome: d?.totalIncome || 0, totalExpenses: d?.totalExpenses || 0,
          grossProfit: d?.grossProfit || 0, profitMargin: d?.profitMargin || 0,
        });
        setItems([...monthly, ...customers, ...expCats]);
      } else {
        setError("שגיאה בטעינת נתונים אנליטיים");
      }
    } catch (e: any) {
      setError(e.message || "שגיאה");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterType === "all" || i.type === filterType) &&
      (!search || [i.name, i.month, i.category].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [items, search, filterType, sortField, sortDir]);

  const kpis = [
    { label: "סה\"כ הכנסות", value: fmtCurrency(Number(summary.totalIncome || 0)), icon: Activity, color: "text-cyan-400" },
    { label: "סה\"כ הוצאות", value: fmtCurrency(Number(summary.totalExpenses || 0)), icon: TrendingDown, color: "text-red-400" },
    { label: "רווח גולמי", value: fmtCurrency(Number(summary.grossProfit || 0)), icon: TrendingUp, color: Number(summary.grossProfit || 0) >= 0 ? "text-green-400" : "text-red-400" },
    { label: "שולי רווח", value: `${summary.profitMargin || 0}%`, icon: BarChart3, color: "text-violet-400" },
    { label: "רשומות", value: fmt(items.length), icon: Hash, color: "text-blue-400" },
  ];

  const columns = [
    { key: "name", label: "שם" },
    { key: "type", label: "סוג" },
    { key: "income", label: "הכנסות" },
    { key: "expenses", label: "הוצאות" },
    { key: "profit", label: "רווח" },
    { key: "margin", label: "מרווח %" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="text-cyan-400 w-6 h-6" /> דוחות אנליטיים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">גרפים ומדדים כספיים מתקדמים — מגמות, ניתוח ביצועים</p>
        </div>
        <ExportDropdown
          data={filtered}
          headers={{ name: "שם", type: "סוג", income: "הכנסות", expenses: "הוצאות", profit: "רווח", margin: "מרווח" }}
          filename="financial_analytics"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסוגים</option>
          {Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">שגיאה בטעינה</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין נתונים אנליטיים</p>
          <p className="text-sm mt-1">{search || filterType !== "all" ? "נסה לשנות את הסינון" : "אין נתונים להצגה"}</p>
        </div>
      ) : (<>
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
                    <td className="px-4 py-3 text-foreground font-medium">{r.name || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${typeMap[r.type]?.color || "bg-muted/20 text-muted-foreground"}`}>
                        {typeMap[r.type]?.label || r.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-green-400 font-bold">{Number(r.income) > 0 ? fmtCurrency(r.income) : "—"}</td>
                    <td className="px-4 py-3 text-red-400 font-bold">{Number(r.expenses) > 0 ? fmtCurrency(r.expenses) : "—"}</td>
                    <td className={`px-4 py-3 font-bold ${Number(r.profit) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {Number(r.profit) !== 0 ? fmtCurrency(r.profit) : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.margin > 0 ? `${r.margin}%` : "—"}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><BarChart3 className="w-5 h-5 text-cyan-400" /> {viewDetail.name}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="שם" value={viewDetail.name} />
                <DetailField label="סוג"><Badge className={typeMap[viewDetail.type]?.color}>{typeMap[viewDetail.type]?.label || viewDetail.type}</Badge></DetailField>
                <DetailField label="הכנסות" value={fmtCurrency(viewDetail.income)} />
                <DetailField label="הוצאות" value={fmtCurrency(viewDetail.expenses)} />
                <DetailField label="רווח" value={fmtCurrency(viewDetail.profit)} />
                <DetailField label="מרווח" value={`${viewDetail.margin}%`} />
                <DetailField label="קטגוריה" value={viewDetail.category} />
              </div>
              <div className="p-5 border-t border-border flex justify-end">
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
