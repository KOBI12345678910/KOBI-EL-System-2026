import { useState, useEffect, useMemo } from "react";
import {
  Receipt, Search, ArrowUpDown, AlertTriangle, TrendingUp,
  TrendingDown, DollarSign, Eye, X, Hash, Clock
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

interface VatRecord {
  id: number;
  period: string;
  output_vat: number;
  input_vat: number;
  net_vat: number;
  status: string;
  tax_period: string;
  month: string;
}

const statusMap: Record<string, { label: string; color: string }> = {
  paid: { label: "שולם", color: "bg-green-500/20 text-green-400" },
  filed: { label: "דווח", color: "bg-blue-500/20 text-blue-400" },
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
  overdue: { label: "באיחור", color: "bg-red-500/20 text-red-400" },
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

export default function VatReportPage() {
  const [items, setItems] = useState<VatRecord[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("period");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<VatRecord | null>(null);
  const pagination = useSmartPagination(25);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [vatRes, statsRes] = await Promise.all([
        authFetch(`${API}/tax-records/vat-report`),
        authFetch(`${API}/tax-records/stats`),
      ]);
      if (vatRes.ok) {
        const raw = safeArray(await vatRes.json());
        setItems(raw.map((r: any, i: number) => ({
          id: r.id || i + 1,
          period: r.period || r.tax_period || r.month || "",
          output_vat: Number(r.output_vat || 0),
          input_vat: Number(r.input_vat || 0),
          net_vat: Number(r.net_vat || 0) || (Number(r.output_vat || 0) - Number(r.input_vat || 0)),
          status: r.status || "pending",
          tax_period: r.tax_period || "",
          month: r.month || "",
        })));
      } else {
        setError("שגיאה בטעינת דוח מע\"מ");
      }
      if (statsRes.ok) setStats(await statsRes.json());
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
      (filterStatus === "all" || i.status === filterStatus) &&
      (!search || [i.period, i.tax_period].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [items, search, filterStatus, sortField, sortDir]);

  const totalOutput = items.reduce((s, r) => s + r.output_vat, 0);
  const totalInput = items.reduce((s, r) => s + r.input_vat, 0);
  const netVat = totalOutput - totalInput;

  const kpis = [
    { label: "מע\"מ עסקאות", value: fmtCurrency(totalOutput), icon: TrendingUp, color: "text-red-400" },
    { label: "מע\"מ תשומות", value: fmtCurrency(totalInput), icon: TrendingDown, color: "text-green-400" },
    { label: netVat >= 0 ? "מע\"מ לתשלום" : "מע\"מ להחזר", value: fmtCurrency(Math.abs(netVat)), icon: DollarSign, color: "text-orange-400" },
    { label: "תקופות", value: fmt(items.length), icon: Hash, color: "text-blue-400" },
    { label: "דיווחים באיחור", value: fmt(stats.overdue_filings || 0), icon: Clock, color: "text-yellow-400" },
  ];

  const columns = [
    { key: "period", label: "תקופה" },
    { key: "output_vat", label: "מע\"מ עסקאות" },
    { key: "input_vat", label: "מע\"מ תשומות" },
    { key: "net_vat", label: "מע\"מ נטו" },
    { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Receipt className="text-orange-400 w-6 h-6" /> דוח מע"מ
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מע"מ עסקאות (Output), מע"מ תשומות (Input), ומע"מ נטו לתשלום</p>
        </div>
        <ExportDropdown
          data={filtered}
          headers={{ period: "תקופה", output_vat: "עסקאות", input_vat: "תשומות", net_vat: "נטו", status: "סטטוס" }}
          filename="vat_report"
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי תקופה..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
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
          <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין נתוני מע"מ</p>
          <p className="text-sm mt-1">{search || filterStatus !== "all" ? "נסה לשנות את הסינון" : "אין נתונים להצגה"}</p>
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
                    <td className="px-4 py-3 text-foreground font-medium">{r.period || "—"}</td>
                    <td className="px-4 py-3 text-red-400 font-bold">{fmtCurrency(r.output_vat)}</td>
                    <td className="px-4 py-3 text-green-400 font-bold">{fmtCurrency(r.input_vat)}</td>
                    <td className={`px-4 py-3 font-bold ${r.net_vat >= 0 ? "text-orange-400" : "text-green-400"}`}>
                      {fmtCurrency(Math.abs(r.net_vat))} {r.net_vat < 0 ? "(החזר)" : ""}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>
                        {statusMap[r.status]?.label || r.status}
                      </Badge>
                    </td>
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
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Receipt className="w-5 h-5 text-orange-400" /> תקופה {viewDetail.period}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="תקופה" value={viewDetail.period} />
                <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge></DetailField>
                <DetailField label={'מע"מ עסקאות'} value={fmtCurrency(viewDetail.output_vat)} />
                <DetailField label={'מע"מ תשומות'} value={fmtCurrency(viewDetail.input_vat)} />
                <DetailField label={'מע"מ נטו'} value={`${fmtCurrency(Math.abs(viewDetail.net_vat))} ${viewDetail.net_vat < 0 ? "(החזר)" : ""}`} />
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
