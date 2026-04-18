import { useState, useEffect, useMemo } from "react";
import {
  Package, Search, AlertTriangle, ArrowUpDown, DollarSign,
  Hash, Eye, X, TrendingUp, Boxes
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

interface InvItem {
  id: number;
  item_name: string;
  item_code: string;
  category: string;
  quantity: number;
  unit_cost: number;
  total_value: number;
  warehouse: string;
  account_number: string;
  valuation_method: string;
  last_count_date: string;
  min_quantity: number;
  max_quantity: number;
  reorder_point: number;
  unit: string;
  location: string;
  status: string;
  notes: string;
}

const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  inactive: { label: "לא פעיל", color: "bg-muted/20 text-muted-foreground" },
  low_stock: { label: "מלאי נמוך", color: "bg-red-500/20 text-red-400" },
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}
    </div>
  );
}

export default function AccountingInventoryPage() {
  const [items, setItems] = useState<InvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("total_value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterCategory, setFilterCategory] = useState("all");
  const [viewDetail, setViewDetail] = useState<InvItem | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/accounting-inventory`);
      if (res.ok) setItems(safeArray(await res.json()));
      else setError("שגיאה בטעינת מלאי חשבונאי");
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
      (filterCategory === "all" || i.category === filterCategory) &&
      (!search || [i.item_name, i.item_code, i.category, i.warehouse]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [items, search, filterStatus, filterCategory, sortField, sortDir]);

  const categories = useMemo(() => {
    const cats = new Set(items.map(i => i.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [items]);

  const totalValue = items.reduce((s, i) => s + Number(i.total_value || 0), 0);
  const totalQty = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
  const kpis = [
    { label: "פריטים", value: fmt(items.length), icon: Hash, color: "text-blue-400" },
    { label: "שווי כולל", value: fmtCurrency(totalValue), icon: DollarSign, color: "text-green-400" },
    { label: "כמות כוללת", value: fmt(totalQty), icon: Boxes, color: "text-amber-400" },
    { label: "פעילים", value: fmt(items.filter(i => i.status === "active").length), icon: TrendingUp, color: "text-emerald-400" },
    { label: "מלאי נמוך", value: fmt(items.filter(i => i.status === "low_stock").length), icon: AlertTriangle, color: "text-red-400" },
  ];

  const columns = [
    { key: "item_code", label: "קוד" },
    { key: "item_name", label: "שם פריט" },
    { key: "category", label: "קטגוריה" },
    { key: "quantity", label: "כמות" },
    { key: "unit_cost", label: "עלות ליח'" },
    { key: "total_value", label: "שווי" },
    { key: "warehouse", label: "מחסן" },
    { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Package className="text-amber-400 w-6 h-6" />
            מלאי חשבונאי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">דוח מלאי חשבונאי והערכת שווי — קריאה בלבד</p>
        </div>
        <ExportDropdown
          data={filtered}
          headers={{ item_code: "קוד", item_name: "שם", category: "קטגוריה", quantity: "כמות", unit_cost: "עלות", total_value: "שווי", status: "סטטוס" }}
          filename="accounting_inventory"
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי שם, קוד, קטגוריה..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"
        >
          <option value="all">כל הקטגוריות</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="פריטי מלאי" actions={defaultBulkActions(selectedIds, clear, load, `${API}/accounting-inventory`)} />

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
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין פריטי מלאי</p>
          <p className="text-sm mt-1">{search || filterStatus !== "all" ? "נסה לשנות את הסינון" : "אין נתוני מלאי חשבונאי במערכת"}</p>
        </div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="px-4 py-3 w-10"><BulkCheckbox allIds={filtered.map(r => r.id)} selectedIds={selectedIds} onToggleAll={toggleAll} /></th>
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
                    <td className="px-4 py-3"><BulkCheckbox id={r.id} selectedIds={selectedIds} onToggle={toggle} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-amber-400 font-bold">{r.item_code}</td>
                    <td className="px-4 py-3 text-foreground">{r.item_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.category || "—"}</td>
                    <td className="px-4 py-3 text-foreground">{fmt(r.quantity)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtCurrency(r.unit_cost)}</td>
                    <td className="px-4 py-3 text-green-400 font-bold">{fmtCurrency(r.total_value)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.warehouse || "—"}</td>
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
                  <Package className="w-5 h-5 text-amber-400" />
                  {viewDetail.item_name}
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
                  <DetailField label="קוד" value={viewDetail.item_code} />
                  <DetailField label="שם" value={viewDetail.item_name} />
                  <DetailField label="קטגוריה" value={viewDetail.category} />
                  <DetailField label="כמות" value={fmt(viewDetail.quantity)} />
                  <DetailField label="עלות ליחידה" value={fmtCurrency(viewDetail.unit_cost)} />
                  <DetailField label="שווי כולל" value={fmtCurrency(viewDetail.total_value)} />
                  <DetailField label="מחסן" value={viewDetail.warehouse} />
                  <DetailField label="חשבון" value={viewDetail.account_number} />
                  <DetailField label="שיטת הערכה" value={viewDetail.valuation_method} />
                  <DetailField label="ספירה אחרונה" value={viewDetail.last_count_date?.slice(0, 10)} />
                  <DetailField label="יחידת מידה" value={viewDetail.unit} />
                  <DetailField label="מיקום" value={viewDetail.location} />
                  <DetailField label="כמות מינימום" value={fmt(viewDetail.min_quantity)} />
                  <DetailField label="כמות מקסימום" value={fmt(viewDetail.max_quantity)} />
                  <DetailField label="נקודת הזמנה מחדש" value={fmt(viewDetail.reorder_point)} />
                  <DetailField label="סטטוס">
                    <Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge>
                  </DetailField>
                  <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
                </div>
              )}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="accounting-inventory" entityId={String(viewDetail.id)} /></div>}
              {detailTab === "attachments" && <div className="p-5"><AttachmentsSection entityType="accounting-inventory" entityId={String(viewDetail.id)} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="accounting-inventory" entityId={String(viewDetail.id)} /></div>}
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
