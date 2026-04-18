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
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import {
  TrendingUp, Search, ArrowUpDown, Eye, X, AlertTriangle,
  DollarSign, Package, Truck, Calendar, BarChart3, Clock
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

interface PriceEntry {
  id: number;
  supplier_id: number;
  supplier_name: string;
  material_id: number;
  material_name: string;
  price: number;
  currency: string;
  valid_from: string;
  valid_until: string;
  price_list_name: string;
  discount_percentage: number;
  notes: string;
  created_at: string;
}

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

export default function PriceHistoryPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<PriceEntry[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<PriceEntry | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [r1, r2, r3] = await Promise.all([
        authFetch(`${API}/price-history`),
        authFetch(`${API}/suppliers`),
        authFetch(`${API}/raw-materials`),
      ]);
      if (r1.ok) {
        const raw = await r1.json();
        setItems(safeArray(raw).map((r: any) => ({
          id: r.id, supplier_id: r.supplierId || r.supplier_id, supplier_name: r.supplierName || r.supplier_name || "",
          material_id: r.materialId || r.material_id, material_name: r.materialName || r.material_name || "",
          price: Number(r.price || 0), currency: r.currency || "ILS",
          valid_from: r.validFrom || r.valid_from, valid_until: r.validUntil || r.valid_until,
          price_list_name: r.priceListName || r.price_list_name,
          discount_percentage: Number(r.discountPercentage || r.discount_percentage || 0),
          notes: r.notes, created_at: r.createdAt || r.created_at,
        })));
      }
      if (r2.ok) setSuppliers(safeArray(await r2.json()));
      if (r3.ok) setMaterials(safeArray(await r3.json()));
    } catch (e: any) { setError(e.message || "שגיאה בטעינת נתונים"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const getSupplierName = (id: number) => suppliers.find((s: any) => s.id === id)?.supplierName || "";
  const getMaterialName = (id: number) => materials.find((m: any) => m.id === id)?.materialName || "";

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.map(r => ({
      ...r,
      supplier_name: r.supplier_name || getSupplierName(r.supplier_id),
      material_name: r.material_name || getMaterialName(r.material_id),
    })).filter(r =>
      (filterSupplier === "all" || String(r.supplier_id) === filterSupplier) &&
      (!search || [r.supplier_name, r.material_name, r.price_list_name].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he"); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, suppliers, materials, search, filterSupplier, sortField, sortDir]);

  const uniqueSuppliers = new Set(items.map(h => h.supplier_id)).size;
  const uniqueMaterials = new Set(items.map(h => h.material_id)).size;
  const avgPrice = items.length > 0 ? items.reduce((s, r) => s + r.price, 0) / items.length : 0;
  const activeEntries = items.filter(r => { const now = new Date().toISOString().slice(0, 10); return (!r.valid_from || r.valid_from <= now) && (!r.valid_until || r.valid_until >= now); }).length;

  const kpis = [
    { label: "רשומות מחירים", value: fmt(items.length), icon: TrendingUp, color: "text-blue-400" },
    { label: "ספקים", value: fmt(uniqueSuppliers), icon: Truck, color: "text-green-400" },
    { label: "חומרים", value: fmt(uniqueMaterials), icon: Package, color: "text-purple-400" },
    { label: "מחיר ממוצע", value: fmtC(avgPrice), icon: DollarSign, color: "text-cyan-400" },
    { label: "בתוקף", value: fmt(activeEntries), icon: Calendar, color: "text-amber-400" },
    { label: "עדכון אחרון", value: items[0]?.created_at?.slice(0, 10) || "—", icon: Clock, color: "text-orange-400" },
  ];

  const columns = [
    { key: "supplier_name", label: "ספק" },
    { key: "material_name", label: "חומר" },
    { key: "price", label: "מחיר" },
    { key: "currency", label: "מטבע" },
    { key: "valid_from", label: "תוקף מ-" },
    { key: "valid_until", label: "תוקף עד" },
    { key: "discount_percentage", label: "הנחה %" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><TrendingUp className="text-emerald-400 w-6 h-6" />היסטוריית מחירים</h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב אחר מחירי ספקים, השוואות מחירים ומגמות</p>
        </div>
        <ExportDropdown data={filtered} headers={{ supplier_name: "ספק", material_name: "חומר", price: "מחיר", currency: "מטבע", valid_from: "מ-", valid_until: "עד", discount_percentage: "הנחה%" }} filename="price_history" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי ספק, חומר..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הספקים</option>
          {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.supplierName || s.supplier_name}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} רשומות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="מחירים" actions={defaultBulkActions(selectedIds, clear, load, `${API}/price-history`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה בטעינה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין נתוני מחירים</p><p className="text-sm mt-1">הנתונים יופיעו כאשר יהיו מחירונים מספקים</p></div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            <th className="px-2 py-3 text-center w-10"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered)} partial={selectedIds.length > 0 && selectedIds.length < filtered.length} /></th>
            {columns.map(col => (
              <th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r => (
              <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="px-2 py-3 text-center"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="px-4 py-3 font-medium text-foreground">{r.supplier_name || `ספק ${r.supplier_id}`}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.material_name || `חומר ${r.material_id}`}</td>
                <td className="px-4 py-3 text-emerald-400 font-mono font-bold">{fmtC(r.price)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.currency}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.valid_from ? new Date(r.valid_from).toLocaleDateString("he-IL") : "—"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.valid_until ? new Date(r.valid_until).toLocaleDateString("he-IL") : "—"}</td>
                <td className="px-4 py-3">{r.discount_percentage ? <Badge className="text-[10px] bg-green-500/20 text-green-400">{r.discount_percentage}%</Badge> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-3"><button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button></td>
              </tr>
            ))}
          </tbody></table>
        </div></div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-400" />פירוט מחיר</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"attachments",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t=>(
                  <button key={t.key} onClick={()=>setDetailTab(t.key)} className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${detailTab===t.key?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="ספק" value={viewDetail.supplier_name || `ספק ${viewDetail.supplier_id}`} />
                <DetailField label="חומר" value={viewDetail.material_name || `חומר ${viewDetail.material_id}`} />
                <DetailField label="מחיר" value={fmtC(viewDetail.price)} />
                <DetailField label="מטבע" value={viewDetail.currency} />
                <DetailField label="תוקף מ-" value={viewDetail.valid_from ? new Date(viewDetail.valid_from).toLocaleDateString("he-IL") : "—"} />
                <DetailField label="תוקף עד" value={viewDetail.valid_until ? new Date(viewDetail.valid_until).toLocaleDateString("he-IL") : "—"} />
                <DetailField label="הנחה" value={viewDetail.discount_percentage ? `${viewDetail.discount_percentage}%` : "—"} />
                <DetailField label="מחירון" value={viewDetail.price_list_name} />
                <DetailField label="תאריך יצירה" value={viewDetail.created_at?.slice(0, 10)} />
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>
              )}
              {detailTab === "related" && (
                <div className="p-5"><RelatedRecords tabs={[
                  { key: "orders", label: "הזמנות", endpoint: `${API}/purchase-orders?supplierId=${viewDetail.supplier_id}`, columns: [{ key: "orderNumber", label: "מספר" }, { key: "totalAmount", label: "סכום" }] },
                ]} /></div>
              )}
              {detailTab === "attachments" && (
                <div className="p-5"><AttachmentsSection entityType="price-history" entityId={viewDetail.id} /></div>
              )}
              {detailTab === "history" && (
                <div className="p-5"><ActivityLog entityType="price-history" entityId={viewDetail.id} /></div>
              )}
              <div className="p-5 border-t border-border flex justify-end"><button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
