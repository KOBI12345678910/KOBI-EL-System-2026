import { useState, useEffect, useMemo } from "react";
import { useBreadcrumbLabel } from "@/components/layout";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import { useParams } from "wouter";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";
import {
  Truck, Search, ArrowUpDown, Eye, X, AlertTriangle,
  Phone, Mail, MapPin, Star, Package, DollarSign, Clock, FileText,
  CheckCircle, Globe, Building2, User, ArrowRight
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

export default function SupplierCardPage() {
  const params = useParams<{ id: string }>();
  const { setLabel } = useBreadcrumbLabel();
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [supplier, setSupplier] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "orders" | "prices" | "related" | "attachments" | "history">("details");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const pagination = useSmartPagination(25);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [r1, r2, r3] = await Promise.all([
        authFetch(`${API}/suppliers/${params.id}`),
        authFetch(`${API}/purchase-orders?supplierId=${params.id}`),
        authFetch(`${API}/price-history?supplierId=${params.id}`),
      ]);
      if (r1.ok) setSupplier(await r1.json());
      else setError("ספק לא נמצא");
      if (r2.ok) setOrders(safeArray(await r2.json()));
      if (r3.ok) setPrices(safeArray(await r3.json()));
    } catch (e: any) { setError(e.message || "שגיאה בטעינת נתונים"); }
    setLoading(false);
  };
  useEffect(() => { if (params.id) load(); }, [params.id]);
  useEffect(() => { if (supplier?.name) setLabel(supplier.name); }, [supplier, setLabel]);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filteredOrders = useMemo(() => {
    let data = orders.filter(r => !search || [r.orderNumber, r.title].some((f: string) => f?.toLowerCase().includes(search.toLowerCase())));
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = String(va).localeCompare(String(vb)); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [orders, search, sortField, sortDir]);

  const totalOrderValue = orders.reduce((s, r) => s + Number(r.totalAmount || r.total_amount || 0), 0);
  const statusMap: Record<string, { label: string; color: string }> = {
    active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
    inactive: { label: "לא פעיל", color: "bg-muted/20 text-muted-foreground" },
    blocked: { label: "חסום", color: "bg-red-500/20 text-red-400" },
    pending: { label: "ממתין", color: "bg-amber-500/20 text-amber-400" },
  };

  const s = supplier || {};
  const supplierStatus = statusMap[s.status] || statusMap[s.supplierStatus] || statusMap.active;

  const kpis = [
    { label: "הזמנות רכש", value: fmt(orders.length), icon: Package, color: "text-blue-400" },
    { label: "סה\"כ ערך", value: fmtC(totalOrderValue), icon: DollarSign, color: "text-green-400" },
    { label: "מחירונים", value: fmt(prices.length), icon: FileText, color: "text-purple-400" },
    { label: "דירוג", value: s.rating ? `${s.rating}/5` : "—", icon: Star, color: "text-amber-400" },
    { label: "ימי אשראי", value: s.paymentTerms || s.payment_terms || "—", icon: Clock, color: "text-cyan-400" },
    { label: "סטטוס", value: supplierStatus.label, icon: CheckCircle, color: "text-emerald-400" },
  ];

  const tabs = [
    { key: "details" as const, label: "פרטי ספק" },
    { key: "orders" as const, label: `הזמנות (${orders.length})` },
    { key: "prices" as const, label: `מחירים (${prices.length})` },
    { key: "related" as const, label: "רשומות קשורות" },
    { key: "attachments" as const, label: "מסמכים" },
    { key: "history" as const, label: "היסטוריה" },
  ];

  if (loading) return (
    <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
  );

  if (error) return (
    <div className="text-center py-16 text-red-400" dir="rtl"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה בטעינה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
  );

  if (!supplier) return (
    <div className="text-center py-16 text-muted-foreground" dir="rtl"><Truck className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">ספק לא נמצא</p></div>
  );

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Truck className="text-blue-400 w-6 h-6" />{s.supplierName || s.supplier_name || "ספק"}</h1>
          <p className="text-sm text-muted-foreground mt-1">כרטיס ספק — {s.supplierNumber || s.supplier_number || `#${s.id}`}</p>
        </div>
        <ExportDropdown data={[s]} headers={{ supplierNumber: "מספר", supplierName: "שם", contactPerson: "איש קשר", phone: "טלפון", email: "דוא\"ל", city: "עיר", status: "סטטוס" }} filename={`supplier_${s.id}`} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={kpi.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-2 border-b border-border/50 pb-1">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`px-4 py-2 text-sm font-medium rounded-t-xl transition-colors ${activeTab === tab.key ? "bg-card border border-border/50 border-b-0 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>
        ))}
      </div>

      {activeTab === "details" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card border border-border/50 rounded-2xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <DetailField label="מספר ספק" value={s.supplierNumber || s.supplier_number} />
            <DetailField label="שם ספק" value={s.supplierName || s.supplier_name} />
            <DetailField label="סטטוס"><Badge className={supplierStatus.color}>{supplierStatus.label}</Badge></DetailField>
            <DetailField label="איש קשר" value={s.contactPerson || s.contact_person} />
            <DetailField label="טלפון" value={s.phone} />
            <DetailField label={'דוא"ל'} value={s.email} />
            <DetailField label="כתובת" value={s.address} />
            <DetailField label="עיר" value={s.city} />
            <DetailField label="מדינה" value={s.country || "ישראל"} />
            <DetailField label="ח.פ. / ע.מ." value={s.taxId || s.tax_id} />
            <DetailField label="תנאי תשלום" value={s.paymentTerms || s.payment_terms} />
            <DetailField label="מטבע" value={s.currency || "ILS"} />
            <DetailField label="קטגוריה" value={s.category} />
            <DetailField label="דירוג" value={s.rating ? `${s.rating}/5` : "—"} />
            <DetailField label="אתר" value={s.website} />
            <div className="col-span-full"><DetailField label="הערות" value={s.notes} /></div>
          </div>
        </motion.div>
      )}

      {activeTab === "orders" && (<>
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש הזמנות..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
          <span className="text-sm text-muted-foreground">{filteredOrders.length} הזמנות</span>
        </div>
        {filteredOrders.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground"><Package className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין הזמנות רכש</p></div>
        ) : (
          <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
              {[["orderNumber","מספר"],["title","כותרת"],["totalAmount","סכום"],["status","סטטוס"],["createdAt","תאריך"]].map(([f,l]) => (
                <th key={f} onClick={() => toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div></th>
              ))}
            </tr></thead><tbody>
              {pagination.paginate(filteredOrders).map((r: any) => (
                <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-blue-400 font-bold">{r.orderNumber || r.order_number}</td>
                  <td className="px-4 py-3 text-foreground">{r.title || "—"}</td>
                  <td className="px-4 py-3 text-emerald-400 font-medium">{fmtC(Number(r.totalAmount || r.total_amount || 0))}</td>
                  <td className="px-4 py-3"><Badge className="text-[10px] bg-blue-500/20 text-blue-400">{r.status}</Badge></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{(r.createdAt || r.created_at)?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody></table>
          </div></div>
        )}
        <SmartPagination pagination={pagination} />
      </>)}

      {activeTab === "prices" && (
        prices.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground"><DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין מחירונים</p></div>
        ) : (
          <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">חומר</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">מחיר</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">מטבע</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">תוקף מ-</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">תוקף עד</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">הנחה</th>
            </tr></thead><tbody>
              {prices.map((r: any) => (
                <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-foreground">{r.materialName || r.material_name || `חומר ${r.materialId || r.material_id}`}</td>
                  <td className="px-4 py-3 text-emerald-400 font-mono font-bold">{fmtC(Number(r.price || 0))}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.currency || "ILS"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{(r.validFrom || r.valid_from) ? new Date(r.validFrom || r.valid_from).toLocaleDateString("he-IL") : "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{(r.validUntil || r.valid_until) ? new Date(r.validUntil || r.valid_until).toLocaleDateString("he-IL") : "—"}</td>
                  <td className="px-4 py-3">{(r.discountPercentage || r.discount_percentage) ? <Badge className="text-[10px] bg-green-500/20 text-green-400">{r.discountPercentage || r.discount_percentage}%</Badge> : "—"}</td>
                </tr>
              ))}
            </tbody></table>
          </div></div>
        )
      )}

      {activeTab === "related" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card border border-border/50 rounded-2xl p-6">
          <RelatedRecords entityType="suppliers" entityId={supplier.id} />
        </motion.div>
      )}

      {activeTab === "attachments" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card border border-border/50 rounded-2xl p-6">
          <AttachmentsSection entityType="suppliers" entityId={supplier.id} />
        </motion.div>
      )}

      {activeTab === "history" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card border border-border/50 rounded-2xl p-6">
          <ActivityLog entityType="suppliers" entityId={supplier.id} />
        </motion.div>
      )}
    </div>
  );
}
