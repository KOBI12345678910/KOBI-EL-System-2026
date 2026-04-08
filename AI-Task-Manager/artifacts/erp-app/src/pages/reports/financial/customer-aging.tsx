import { useState, useEffect, useMemo } from "react";
import {
  Users, Search, ArrowUpDown, AlertTriangle, DollarSign,
  Hash, Clock, Eye, X, Shield
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

interface AgingRecord {
  id: number;
  entity_name: string;
  total_outstanding: number;
  current_amount: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_91_120: number;
  days_over_120: number;
  risk_level: string;
  snapshot_type: string;
}

const riskMap: Record<string, { label: string; color: string }> = {
  low: { label: "נמוך", color: "bg-green-500/20 text-green-400" },
  medium: { label: "בינוני", color: "bg-yellow-500/20 text-yellow-400" },
  high: { label: "גבוה", color: "bg-orange-500/20 text-orange-400" },
  critical: { label: "קריטי", color: "bg-red-500/20 text-red-400" },
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

export default function CustomerAgingPage() {
  const [items, setItems] = useState<AgingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterRisk, setFilterRisk] = useState("all");
  const [sortField, setSortField] = useState("total_outstanding");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<AgingRecord | null>(null);
  const pagination = useSmartPagination(25);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/aging-snapshots?type=receivable`);
      if (res.ok) {
        const raw = safeArray(await res.json());
        const receivables = raw.filter((i: any) => i.snapshot_type === "receivable" || !i.snapshot_type);
        setItems(receivables.map((r: any, i: number) => ({
          ...r, id: r.id || i + 1,
          days_1_30: Number(r.days_1_30 || r.days_30 || 0),
          days_31_60: Number(r.days_31_60 || r.days_60 || 0),
          days_61_90: Number(r.days_61_90 || r.days_90 || 0),
          days_91_120: Number(r.days_91_120 || 0),
          days_over_120: Number(r.days_over_120 || 0),
        })));
      } else {
        setError("שגיאה בטעינת גיול לקוחות");
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
      (filterRisk === "all" || i.risk_level === filterRisk) &&
      (!search || i.entity_name?.toLowerCase().includes(search.toLowerCase()))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [items, search, filterRisk, sortField, sortDir]);

  const totalOutstanding = items.reduce((s, r) => s + Number(r.total_outstanding || 0), 0);
  const totalCurrent = items.reduce((s, r) => s + Number(r.current_amount || 0), 0);
  const total30 = items.reduce((s, r) => s + Number(r.days_1_30 || 0), 0);
  const total60 = items.reduce((s, r) => s + Number(r.days_31_60 || 0), 0);
  const total90 = items.reduce((s, r) => s + Number(r.days_61_90 || 0), 0);
  const totalOver90 = items.reduce((s, r) => s + Number(r.days_91_120 || 0) + Number(r.days_over_120 || 0), 0);

  const kpis = [
    { label: "סה\"כ יתרות", value: fmtCurrency(totalOutstanding), icon: DollarSign, color: "text-blue-400" },
    { label: "שוטף", value: fmtCurrency(totalCurrent), icon: Shield, color: "text-green-400" },
    { label: "1-30 ימים", value: fmtCurrency(total30), icon: Clock, color: "text-yellow-400" },
    { label: "31-60 ימים", value: fmtCurrency(total60), icon: Clock, color: "text-orange-400" },
    { label: "61-90 ימים", value: fmtCurrency(total90), icon: AlertTriangle, color: "text-red-400" },
    { label: "90+ ימים", value: fmtCurrency(totalOver90), icon: AlertTriangle, color: "text-red-500" },
  ];

  const columns = [
    { key: "entity_name", label: "לקוח" },
    { key: "total_outstanding", label: "סה\"כ יתרה" },
    { key: "current_amount", label: "שוטף" },
    { key: "days_1_30", label: "1-30" },
    { key: "days_31_60", label: "31-60" },
    { key: "days_61_90", label: "61-90" },
    { key: "risk_level", label: "סיכון" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="text-green-400 w-6 h-6" /> גיול לקוחות (AR Aging)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">חובות לקוחות לפי טווחי ימים — ניתוח גבייה וסיכון אשראי</p>
        </div>
        <ExportDropdown
          data={filtered}
          headers={{ entity_name: "לקוח", total_outstanding: "יתרה", current_amount: "שוטף", days_1_30: "1-30", days_31_60: "31-60", days_61_90: "61-90", risk_level: "סיכון" }}
          filename="customer_aging"
        />
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי שם לקוח..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל רמות הסיכון</option>
          {Object.entries(riskMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
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
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין נתוני גיול לקוחות</p>
          <p className="text-sm mt-1">{search || filterRisk !== "all" ? "נסה לשנות את הסינון" : "אין נתונים להצגה"}</p>
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
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">90+</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginate(filtered).map(r => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-foreground font-medium">{r.entity_name}</td>
                    <td className="px-4 py-3 text-foreground font-bold">{fmtCurrency(r.total_outstanding)}</td>
                    <td className="px-4 py-3 text-green-400">{fmtCurrency(r.current_amount)}</td>
                    <td className="px-4 py-3 text-yellow-400">{Number(r.days_1_30) > 0 ? fmtCurrency(r.days_1_30) : "—"}</td>
                    <td className="px-4 py-3 text-orange-400">{Number(r.days_31_60) > 0 ? fmtCurrency(r.days_31_60) : "—"}</td>
                    <td className="px-4 py-3 text-red-400">{Number(r.days_61_90) > 0 ? fmtCurrency(r.days_61_90) : "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${riskMap[r.risk_level]?.color || "bg-muted/20 text-muted-foreground"}`}>
                        {riskMap[r.risk_level]?.label || r.risk_level || "—"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-red-500 font-bold">
                      {(Number(r.days_91_120) + Number(r.days_over_120)) > 0 ? fmtCurrency(Number(r.days_91_120) + Number(r.days_over_120)) : "—"}
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
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Users className="w-5 h-5 text-green-400" /> {viewDetail.entity_name}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="לקוח" value={viewDetail.entity_name} />
                <DetailField label={'סה"כ יתרה'} value={fmtCurrency(viewDetail.total_outstanding)} />
                <DetailField label="שוטף" value={fmtCurrency(viewDetail.current_amount)} />
                <DetailField label="1-30 ימים" value={fmtCurrency(viewDetail.days_1_30)} />
                <DetailField label="31-60 ימים" value={fmtCurrency(viewDetail.days_31_60)} />
                <DetailField label="61-90 ימים" value={fmtCurrency(viewDetail.days_61_90)} />
                <DetailField label="91-120 ימים" value={fmtCurrency(viewDetail.days_91_120)} />
                <DetailField label="120+ ימים" value={fmtCurrency(viewDetail.days_over_120)} />
                <DetailField label="רמת סיכון"><Badge className={riskMap[viewDetail.risk_level]?.color}>{riskMap[viewDetail.risk_level]?.label || viewDetail.risk_level}</Badge></DetailField>
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
