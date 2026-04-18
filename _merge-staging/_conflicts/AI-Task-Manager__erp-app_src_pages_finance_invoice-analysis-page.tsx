import { useState, useEffect, useMemo } from "react";
import {
  FileText, Search, ArrowUpDown, AlertTriangle, TrendingUp,
  DollarSign, Clock, CheckCircle2, Eye, X, Hash, BarChart3
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCurrency = (v: any) => Number(v || 0).toLocaleString("he-IL", { style: "currency", currency: "ILS" });

interface InvoiceRecord {
  id: number;
  month: string;
  invoice_count: number;
  total_amount: number;
  avg_amount: number;
  paid_count: number;
  pending_count: number;
  overdue_count: number;
  collection_rate: number;
  status: string;
  entity_name: string;
  avg_days: number;
  late_count: number;
}

const statusMap: Record<string, { label: string; color: string }> = {
  paid: { label: "שולם", color: "bg-green-500/20 text-green-400" },
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
  overdue: { label: "באיחור", color: "bg-red-500/20 text-red-400" },
  partial: { label: "חלקי", color: "bg-orange-500/20 text-orange-400" },
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

export default function InvoiceAnalysisPage() {
  const [items, setItems] = useState<InvoiceRecord[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("month");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<InvoiceRecord | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/invoice-analysis`);
      if (res.ok) {
        const d = await res.json();
        const trends = safeArray(d?.trends || d);
        const mapped = trends.map((t: any, i: number) => ({
          id: i + 1, month: t.month || "", invoice_count: Number(t.invoice_count || 0),
          total_amount: Number(t.total_amount || 0), avg_amount: Number(t.avg_amount || 0),
          paid_count: Number(t.paid_count || 0), pending_count: Number(t.pending_count || 0),
          overdue_count: Number(t.overdue_count || 0),
          collection_rate: Number(t.invoice_count) > 0 ? (Number(t.paid_count) / Number(t.invoice_count) * 100) : 0,
          status: Number(t.paid_count) >= Number(t.invoice_count) ? "paid" : "pending",
          entity_name: t.entity_name || "", avg_days: Number(t.avg_days || 0), late_count: Number(t.late_count || 0),
        }));
        setItems(mapped);
        setSummary(d?.summary || {});
      } else {
        setError("שגיאה בטעינת ניתוח חשבוניות");
      }
    } catch (e: any) {
      setError(e.message || "שגיאה בטעינת נתונים");
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
      (!search || [i.month, i.entity_name].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [items, search, filterStatus, sortField, sortDir]);

  const totalInvoices = Number(summary.total_invoices || items.reduce((s, i) => s + i.invoice_count, 0));
  const totalAmount = items.reduce((s, i) => s + i.total_amount, 0);
  const paidCount = Number(summary.paid_invoices || items.reduce((s, i) => s + i.paid_count, 0));
  const avgPayDays = Number(summary.avg_payment_days || 0);

  const kpis = [
    { label: "סה\"כ חשבוניות", value: fmt(totalInvoices), icon: Hash, color: "text-blue-400" },
    { label: "סכום כולל", value: fmtCurrency(totalAmount), icon: DollarSign, color: "text-green-400" },
    { label: "שולמו", value: fmt(paidCount), icon: CheckCircle2, color: "text-emerald-400" },
    { label: "ממתינות", value: fmt(Number(summary.pending_invoices || 0)), icon: Clock, color: "text-yellow-400" },
    { label: "זמן תשלום ממוצע", value: `${fmt(avgPayDays)} ימים`, icon: BarChart3, color: "text-purple-400" },
  ];

  const columns = [
    { key: "month", label: "חודש" },
    { key: "invoice_count", label: "חשבוניות" },
    { key: "total_amount", label: "סכום כולל" },
    { key: "avg_amount", label: "ממוצע" },
    { key: "paid_count", label: "שולמו" },
    { key: "collection_rate", label: "שיעור גבייה" },
    { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="text-indigo-400 w-6 h-6" />
            ניתוח חשבוניות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניתוח מגמות, סטטוסים וזמני תשלום של חשבוניות</p>
        </div>
        <ExportDropdown
          data={filtered}
          headers={{ month: "חודש", invoice_count: "חשבוניות", total_amount: "סכום", avg_amount: "ממוצע", paid_count: "שולמו", collection_rate: "שיעור גבייה" }}
          filename="invoice_analysis"
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי חודש, ישות..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="רשומות" actions={defaultBulkActions(selectedIds, clear, load, `${API}/invoice-analysis`)} />

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
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין נתוני ניתוח חשבוניות</p>
          <p className="text-sm mt-1">{search || filterStatus !== "all" ? "נסה לשנות את הסינון" : "אין נתונים להצגה"}</p>
        </div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="px-4 py-3 w-10"><BulkCheckbox allIds={filtered.map(r => r.id)} selectedIds={selectedIds} onToggleAll={toggleAll} /></th>
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
                    <td className="px-4 py-3"><BulkCheckbox id={r.id} selectedIds={selectedIds} onToggle={toggle} /></td>
                    <td className="px-4 py-3 text-foreground font-medium">{r.month || "—"}</td>
                    <td className="px-4 py-3 text-foreground text-center">{r.invoice_count}</td>
                    <td className="px-4 py-3 text-blue-400 font-bold">{fmtCurrency(r.total_amount)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtCurrency(r.avg_amount)}</td>
                    <td className="px-4 py-3 text-green-400">{r.paid_count}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-muted rounded-full h-2">
                          <div className={`h-2 rounded-full ${r.collection_rate >= 80 ? 'bg-green-500' : r.collection_rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(r.collection_rate, 100)}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{r.collection_rate.toFixed(0)}%</span>
                      </div>
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
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-400" /> ניתוח חודש {viewDetail.month}
                </h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border">
                {[
                  { key: "details", label: "פרטים" },
                  { key: "related", label: "רשומות קשורות" },
                  { key: "attachments", label: "מסמכים" },
                  { key: "history", label: "היסטוריה" },
                ].map(tab => (
                  <button key={tab.key} onClick={() => setDetailTab(tab.key)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${detailTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <div className="p-5 grid grid-cols-2 gap-4">
                  <DetailField label="חודש" value={viewDetail.month} />
                  <DetailField label="מספר חשבוניות" value={fmt(viewDetail.invoice_count)} />
                  <DetailField label="סכום כולל" value={fmtCurrency(viewDetail.total_amount)} />
                  <DetailField label="סכום ממוצע" value={fmtCurrency(viewDetail.avg_amount)} />
                  <DetailField label="שולמו" value={fmt(viewDetail.paid_count)} />
                  <DetailField label="שיעור גבייה" value={`${viewDetail.collection_rate.toFixed(1)}%`} />
                  <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge></DetailField>
                </div>
              )}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="invoice-analysis" entityId={String(viewDetail.id)} /></div>}
              {detailTab === "attachments" && <div className="p-5"><AttachmentsSection entityType="invoice-analysis" entityId={String(viewDetail.id)} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="invoice-analysis" entityId={String(viewDetail.id)} /></div>}
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
