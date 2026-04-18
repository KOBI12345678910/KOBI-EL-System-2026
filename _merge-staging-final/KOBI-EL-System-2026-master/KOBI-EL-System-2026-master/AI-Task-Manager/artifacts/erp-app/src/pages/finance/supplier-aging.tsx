import { useState, useEffect, useMemo } from "react";
import { Clock, Search, AlertTriangle, ArrowUpDown, Eye, X, Users, DollarSign, Hash, TrendingDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCurrency = (v: any) => Number(v || 0).toLocaleString("he-IL", { style: "currency", currency: "ILS" });

interface AgingEntry {
  id?: number;
  supplier_name: string;
  supplier_number?: string;
  current: number;
  days_30: number;
  days_60: number;
  days_90: number;
  days_120_plus: number;
  total: number;
  last_payment_date?: string;
  status?: string;
}

const statusMap: Record<string, { label: string; color: string }> = {
  current: { label: "שוטף", color: "bg-green-500/20 text-green-400" },
  overdue: { label: "באיחור", color: "bg-red-500/20 text-red-400" },
  partial: { label: "חלקי", color: "bg-amber-500/20 text-amber-400" },
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

export default function SupplierAgingPage() {
  const [items, setItems] = useState<AgingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<AgingEntry | null>(null);
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected, isAllSelected } = useBulkSelection();
  const [detailTab, setDetailTab] = useState("details");

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/supplier-aging`);
      if (res.ok) setItems(safeArray(await res.json()));
      else setError("שגיאה בטעינת נתונים");
    } catch (e: any) { setError(e.message || "שגיאה"); }
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
      (!search || i.supplier_name?.toLowerCase().includes(search.toLowerCase()))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [items, search, filterStatus, sortField, sortDir]);

  const totalAll = items.reduce((s, i) => s + Number(i.total || 0), 0);
  const totalOverdue = items.reduce((s, i) => s + Number(i.days_90 || 0) + Number(i.days_120_plus || 0), 0);

  const kpis = [
    { label: "ספקים", value: fmt(items.length), icon: Users, color: "text-blue-400" },
    { label: "סה\"כ חוב", value: fmtCurrency(totalAll), icon: DollarSign, color: "text-red-400" },
    { label: "שוטף", value: fmtCurrency(items.reduce((s, i) => s + Number(i.current || 0), 0)), icon: Clock, color: "text-green-400" },
    { label: "30 יום", value: fmtCurrency(items.reduce((s, i) => s + Number(i.days_30 || 0), 0)), icon: Hash, color: "text-amber-400" },
    { label: "90+ יום", value: fmtCurrency(totalOverdue), icon: AlertTriangle, color: "text-red-400" },
    { label: "ממוצע לספק", value: fmtCurrency(items.length > 0 ? totalAll / items.length : 0), icon: TrendingDown, color: "text-purple-400" },
  ];

  const columns = [
    { key: "supplier_name", label: "ספק" },
    { key: "current", label: "שוטף" },
    { key: "days_30", label: "30 יום" },
    { key: "days_60", label: "60 יום" },
    { key: "days_90", label: "90 יום" },
    { key: "days_120_plus", label: "120+ יום" },
    { key: "total", label: "סה\"כ" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Clock className="text-orange-400 w-6 h-6" /> גיול ספקים</h1>
          <p className="text-sm text-muted-foreground mt-1">ניתוח גיול חובות ספקים לפי תקופות</p>
        </div>
        <ExportDropdown data={filtered} headers={{ supplier_name: "ספק", current: "שוטף", days_30: "30 יום", days_60: "60 יום", days_90: "90 יום", days_120_plus: "120+", total: "סה\"כ" }} filename="supplier_aging" />
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש ספק..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="רשומות גיול" actions={defaultBulkActions(selectedIds, clear, load, `${API}/supplier-aging`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Clock className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין נתונים</p></div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="px-4 py-3 w-10"><BulkCheckbox checked={isAllSelected(filtered.map((r, i) => r.id || i))} onChange={() => toggleAll(filtered.map((r, i) => r.id || i))} /></th>
                  {columns.map(col => (
                    <th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                      <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginate(filtered).map((r, idx) => (
                  <tr key={idx} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3"><BulkCheckbox checked={isSelected(r.id || idx)} onChange={() => toggle(r.id || idx)} /></td>
                    <td className="px-4 py-3 text-foreground font-medium">{r.supplier_name}</td>
                    <td className="px-4 py-3 text-green-400">{fmtCurrency(r.current)}</td>
                    <td className="px-4 py-3 text-amber-400">{fmtCurrency(r.days_30)}</td>
                    <td className="px-4 py-3 text-orange-400">{fmtCurrency(r.days_60)}</td>
                    <td className="px-4 py-3 text-red-400">{fmtCurrency(r.days_90)}</td>
                    <td className="px-4 py-3 text-red-500 font-bold">{fmtCurrency(r.days_120_plus)}</td>
                    <td className="px-4 py-3 text-foreground font-bold">{fmtCurrency(r.total)}</td>
                    <td className="px-4 py-3"><button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button></td>
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
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Clock className="w-5 h-5 text-orange-400" /> {viewDetail.supplier_name}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border">
                {[{k:"details",l:"פרטים"},{k:"related",l:"רשומות קשורות"},{k:"attachments",l:"מסמכים"},{k:"history",l:"היסטוריה"}].map(t=>(
                  <button key={t.k} onClick={()=>setDetailTab(t.k)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${detailTab===t.k?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"}`}>{t.l}</button>
                ))}
              </div>
              {detailTab === "details" && (
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="ספק" value={viewDetail.supplier_name} />
                <DetailField label="שוטף" value={fmtCurrency(viewDetail.current)} />
                <DetailField label="30 יום" value={fmtCurrency(viewDetail.days_30)} />
                <DetailField label="60 יום" value={fmtCurrency(viewDetail.days_60)} />
                <DetailField label="90 יום" value={fmtCurrency(viewDetail.days_90)} />
                <DetailField label="120+ יום" value={fmtCurrency(viewDetail.days_120_plus)} />
                <DetailField label={'סה"כ'} value={fmtCurrency(viewDetail.total)} />
                <DetailField label="תשלום אחרון" value={viewDetail.last_payment_date?.slice(0, 10)} />
              </div>
              )}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="supplier-aging" entityId={viewDetail.id} /></div>}
              {detailTab === "attachments" && <div className="p-5"><AttachmentsSection entityType="supplier-aging" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="supplier-aging" entityId={viewDetail.id} /></div>}
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
