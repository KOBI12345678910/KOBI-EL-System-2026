import { useState, useEffect, useMemo } from "react";
import { Scale, Search, AlertTriangle, ArrowUpDown, Eye, X, TrendingUp, TrendingDown, BarChart3, Hash } from "lucide-react";
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
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || d?.accounts || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCurrency = (v: any) => Number(v || 0).toLocaleString("he-IL", { style: "currency", currency: "ILS" });

interface Account {
  id?: number;
  account_number: string;
  account_name: string;
  account_name_he?: string;
  account_type: string;
  opening_balance: number;
  period_debit: number;
  period_credit: number;
  debit_total?: number;
  credit_total?: number;
  current_balance: number;
}

const typeMap: Record<string, { label: string; color: string }> = {
  asset: { label: "נכס", color: "bg-blue-500/20 text-blue-400" },
  liability: { label: "התחייבות", color: "bg-red-500/20 text-red-400" },
  equity: { label: "הון עצמי", color: "bg-purple-500/20 text-purple-400" },
  revenue: { label: "הכנסה", color: "bg-green-500/20 text-green-400" },
  expense: { label: "הוצאה", color: "bg-orange-500/20 text-orange-400" },
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}
    </div>
  );
}

export default function TrialBalancePage() {
  const [items, setItems] = useState<Account[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [sortField, setSortField] = useState("account_number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [viewDetail, setViewDetail] = useState<Account | null>(null);
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected, isAllSelected } = useBulkSelection();
  const [detailTab, setDetailTab] = useState("details");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/financial-reports/trial-balance?fiscal_year=${fiscalYear}`);
      if (res.ok) {
        const d = await res.json();
        setItems(safeArray(d));
        setSummary(d?.summary || {});
      } else {
        setError("שגיאה בטעינת מאזן בוחן");
      }
    } catch (e: any) {
      setError(e.message || "שגיאה בטעינת נתונים");
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [fiscalYear]);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterType === "all" || i.account_type === filterType) &&
      (!search || [i.account_number, i.account_name, i.account_name_he]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
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
    { label: "סה\"כ חשבונות", value: fmt(items.length), icon: Hash, color: "text-blue-400" },
    { label: "סה\"כ חובה", value: fmtCurrency(summary.totalDebit), icon: TrendingUp, color: "text-green-400" },
    { label: "סה\"כ זכות", value: fmtCurrency(summary.totalCredit), icon: TrendingDown, color: "text-red-400" },
    { label: "הפרש", value: fmtCurrency(summary.difference), icon: BarChart3, color: summary.isBalanced ? "text-green-400" : "text-red-400" },
    { label: "סטטוס", value: summary.isBalanced ? "מאוזן ✓" : "לא מאוזן ✗", icon: Scale, color: summary.isBalanced ? "text-green-400" : "text-red-400" },
  ];

  const columns = [
    { key: "account_number", label: "מספר חשבון" },
    { key: "account_name", label: "שם חשבון" },
    { key: "account_type", label: "סוג" },
    { key: "opening_balance", label: "יתרת פתיחה" },
    { key: "period_debit", label: "חובה" },
    { key: "period_credit", label: "זכות" },
    { key: "current_balance", label: "יתרה" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Scale className="text-indigo-400 w-6 h-6" />
            מאזן בוחן
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מאזן בוחן — כל החשבונות עם יתרות חובה וזכות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown
            data={filtered}
            headers={{ account_number: "מספר חשבון", account_name: "שם חשבון", account_type: "סוג", opening_balance: "יתרת פתיחה", period_debit: "חובה", period_credit: "זכות", current_balance: "יתרה" }}
            filename="trial_balance"
          />
        </div>
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי מספר או שם חשבון..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסוגים</option>
          {Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="חשבונות" actions={defaultBulkActions(selectedIds, clear, load, `${API}/financial-reports/trial-balance`)} />

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
          <Scale className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין חשבונות</p>
          <p className="text-sm mt-1">{search || filterType !== "all" ? "נסה לשנות את הסינון" : "אין נתוני מאזן בוחן"}</p>
        </div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="px-4 py-3 w-10"><BulkCheckbox checked={isAllSelected(filtered.map((r, i) => r.id || i))} onChange={() => toggleAll(filtered.map((r, i) => r.id || i))} /></th>
                  {columns.map(col => (
                    <th key={col.key} onClick={() => toggleSort(col.key)}
                      className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                      <div className="flex items-center gap-1">
                        {col.label}
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginate(filtered).map((r, idx) => (
                  <tr key={r.account_number || idx} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3"><BulkCheckbox checked={isSelected(r.id || idx)} onChange={() => toggle(r.id || idx)} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-indigo-400 font-bold">{r.account_number}</td>
                    <td className="px-4 py-3 text-foreground">{r.account_name_he || r.account_name}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${typeMap[r.account_type]?.color || "bg-muted/20 text-muted-foreground"}`}>
                        {typeMap[r.account_type]?.label || r.account_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtCurrency(r.opening_balance)}</td>
                    <td className="px-4 py-3 text-blue-400 font-bold">{Number(r.period_debit || r.debit_total) > 0 ? fmtCurrency(r.period_debit || r.debit_total) : ""}</td>
                    <td className="px-4 py-3 text-red-400 font-bold">{Number(r.period_credit || r.credit_total) > 0 ? fmtCurrency(r.period_credit || r.credit_total) : ""}</td>
                    <td className={`px-4 py-3 font-bold ${Number(r.current_balance) >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtCurrency(r.current_balance)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
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
                  <Scale className="w-5 h-5 text-indigo-400" />
                  חשבון {viewDetail.account_number}
                </h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border">
                {[{k:"details",l:"פרטים"},{k:"related",l:"רשומות קשורות"},{k:"attachments",l:"מסמכים"},{k:"history",l:"היסטוריה"}].map(t=>(
                  <button key={t.k} onClick={()=>setDetailTab(t.k)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${detailTab===t.k?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"}`}>{t.l}</button>
                ))}
              </div>
              {detailTab === "details" && (
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מספר חשבון" value={viewDetail.account_number} />
                <DetailField label="שם חשבון" value={viewDetail.account_name_he || viewDetail.account_name} />
                <DetailField label="סוג חשבון">
                  <Badge className={typeMap[viewDetail.account_type]?.color}>{typeMap[viewDetail.account_type]?.label || viewDetail.account_type}</Badge>
                </DetailField>
                <DetailField label="יתרת פתיחה" value={fmtCurrency(viewDetail.opening_balance)} />
                <DetailField label={'סה"כ חובה'} value={fmtCurrency(viewDetail.period_debit || viewDetail.debit_total)} />
                <DetailField label={'סה"כ זכות'} value={fmtCurrency(viewDetail.period_credit || viewDetail.credit_total)} />
                <DetailField label="יתרה נוכחית" value={fmtCurrency(viewDetail.current_balance)} />
              </div>
              )}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="trial-balance" entityId={viewDetail.id} /></div>}
              {detailTab === "attachments" && <div className="p-5"><AttachmentsSection entityType="trial-balance" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="trial-balance" entityId={viewDetail.id} /></div>}
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
