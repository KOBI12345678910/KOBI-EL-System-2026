import { useState, useEffect, useMemo } from "react";
import {
  Calculator, Search, AlertTriangle, ArrowUpDown, DollarSign,
  Hash, Eye, X, TrendingDown, Calendar
} from "lucide-react";
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

interface DepItem {
  id: number;
  asset_name: string;
  asset_number: string;
  original_cost: number;
  accumulated_depreciation: number;
  net_book_value: number;
  depreciation_rate: number;
  monthly_depreciation: number;
  method: string;
  start_date: string;
  useful_life_years: number;
  status: string;
  category: string;
  notes: string;
}

const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  fully_depreciated: { label: "הופחת במלואו", color: "bg-blue-500/20 text-blue-400" },
  disposed: { label: "נמכר/הושמד", color: "bg-red-500/20 text-red-400" },
};

const methodMap: Record<string, string> = {
  straight_line: "קו ישר",
  declining_balance: "יתרה פוחתת",
  units_of_production: "יחידות ייצור",
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}
    </div>
  );
}

export default function DepreciationSchedulePage() {
  const [items, setItems] = useState<DepItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("net_book_value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterMethod, setFilterMethod] = useState("all");
  const [viewDetail, setViewDetail] = useState<DepItem | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/depreciation-schedule`);
      if (res.ok) setItems(safeArray(await res.json()));
      else setError("שגיאה בטעינת לוח פחת");
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
      (filterMethod === "all" || i.method === filterMethod) &&
      (!search || [i.asset_name, i.asset_number, i.category]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [items, search, filterStatus, filterMethod, sortField, sortDir]);

  const totalCost = items.reduce((s, i) => s + Number(i.original_cost || 0), 0);
  const totalNBV = items.reduce((s, i) => s + Number(i.net_book_value || 0), 0);
  const kpis = [
    { label: "נכסים", value: fmt(items.length), icon: Hash, color: "text-blue-400" },
    { label: "עלות מקורית", value: fmtCurrency(totalCost), icon: DollarSign, color: "text-amber-400" },
    { label: "ערך בספרים", value: fmtCurrency(totalNBV), icon: TrendingDown, color: "text-green-400" },
    { label: "פחת שנצבר", value: fmtCurrency(totalCost - totalNBV), icon: Calculator, color: "text-red-400" },
    { label: "פעילים", value: fmt(items.filter(i => i.status === "active").length), icon: Calendar, color: "text-emerald-400" },
  ];

  const columns = [
    { key: "asset_name", label: "נכס" },
    { key: "original_cost", label: "עלות" },
    { key: "accumulated_depreciation", label: "פחת נצבר" },
    { key: "net_book_value", label: "ערך בספרים" },
    { key: "depreciation_rate", label: "שיעור %" },
    { key: "method", label: "שיטה" },
    { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Calculator className="text-teal-400 w-6 h-6" />
            לוח פחת
          </h1>
          <p className="text-sm text-muted-foreground mt-1">לוח פחת לנכסים קבועים — קריאה בלבד</p>
        </div>
        <ExportDropdown
          data={filtered}
          headers={{ asset_name: "נכס", original_cost: "עלות", accumulated_depreciation: "פחת", net_book_value: "ערך", depreciation_rate: "שיעור", status: "סטטוס" }}
          filename="depreciation"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} />
            <div className="text-xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי שם נכס, מספר, קטגוריה..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select
          value={filterMethod}
          onChange={e => setFilterMethod(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"
        >
          <option value="all">כל השיטות</option>
          {Object.entries(methodMap).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
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
          <Calculator className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין נתוני פחת</p>
          <p className="text-sm mt-1">{search || filterStatus !== "all" ? "נסה לשנות את הסינון" : "אין נכסים בלוח הפחת"}</p>
        </div>
      ) : (<>
        <BulkActions selectedIds={selectedIds} onClear={clear} entityName="נכסים" actions={defaultBulkActions(selectedIds, clear, load, `${API}/depreciation-schedule`)} />
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="px-2 py-3 w-10"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered)} partial={selectedIds.length > 0 && selectedIds.length < filtered.length} /></th>
                  {columns.map(col => (
                    <th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                      <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginate(filtered).map(r => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="px-2 py-3"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                    <td className="px-4 py-3 text-foreground font-medium">{r.asset_name}</td>
                    <td className="px-4 py-3 text-amber-400">{fmtCurrency(r.original_cost)}</td>
                    <td className="px-4 py-3 text-red-400">{fmtCurrency(r.accumulated_depreciation)}</td>
                    <td className="px-4 py-3 text-green-400 font-bold">{fmtCurrency(r.net_book_value)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmt(r.depreciation_rate)}%</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{methodMap[r.method] || r.method}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>{statusMap[r.status]?.label || r.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה">
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-teal-400" />
                  {viewDetail.asset_name}
                </h2>
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">{[{id:"details",label:"פרטים"},{id:"related",label:"רשומות קשורות"},{id:"attachments",label:"מסמכים"},{id:"history",label:"היסטוריה"}].map(t => (<button key={t.id} onClick={() => setDetailTab(t.id)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${detailTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>))}</div>
              {detailTab === "details" && <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="נכס" value={viewDetail.asset_name} />
                <DetailField label="מספר נכס" value={viewDetail.asset_number} />
                <DetailField label="קטגוריה" value={viewDetail.category} />
                <DetailField label="עלות מקורית" value={fmtCurrency(viewDetail.original_cost)} />
                <DetailField label="פחת נצבר" value={fmtCurrency(viewDetail.accumulated_depreciation)} />
                <DetailField label="ערך בספרים" value={fmtCurrency(viewDetail.net_book_value)} />
                <DetailField label="פחת חודשי" value={fmtCurrency(viewDetail.monthly_depreciation)} />
                <DetailField label="שיעור" value={`${fmt(viewDetail.depreciation_rate)}%`} />
                <DetailField label="שיטה" value={methodMap[viewDetail.method] || viewDetail.method} />
                <DetailField label="תחילת פחת" value={viewDetail.start_date?.slice(0, 10)} />
                <DetailField label="אורך חיים" value={viewDetail.useful_life_years ? `${viewDetail.useful_life_years} שנים` : "—"} />
                <DetailField label="סטטוס">
                  <Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge>
                </DetailField>
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>}
              {detailTab === "related" && <div className="p-5"><RelatedRecords tabs={[{key:"transactions",label:"תנועות נכס",icon:"documents",endpoint:`${API}/journal-entries?asset=${viewDetail.asset_number}&limit=5`,columns:[{key:"entry_number",label:"מספר"},{key:"date",label:"תאריך"},{key:"description",label:"תיאור"},{key:"amount",label:"סכום"}]}]} /></div>}
              {detailTab === "attachments" && <div className="p-5"><AttachmentsSection entityType="depreciation-schedule" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="depreciation-schedule" entityId={viewDetail.id} /></div>}
              <div className="p-5 border-t border-border flex justify-end">
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
