import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";
import { SkeletonPage } from "@/components/ui/skeleton-card";
import {
  Package, BarChart3, AlertTriangle, TrendingUp, TrendingDown, MapPin,
  Search, Filter, Layers, ArrowUp, ArrowDown, Boxes, ShieldAlert,
  Activity, DollarSign, Calendar, Hash, Eye, X, Warehouse, Clock,
  CheckCircle2, XCircle, RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const API = "/api";

interface Material {
  id: number; materialNumber: string; materialName: string; category: string;
  subCategory: string | null; unit: string; description: string | null;
  minimumStock: string | null; currentStock: string | null; maximumStock: string | null;
  reorderPoint: string | null; standardPrice: string | null; currency: string | null;
  weightPerUnit: string | null; dimensions: string | null; materialGrade: string | null;
  warehouseLocation: string | null; lastCountDate: string | null; lastCountQuantity: string | null;
  abcClassification: string | null; annualUsageValue: string | null;
  leadTimeDays: number | null; lastReceiptDate: string | null; lastIssueDate: string | null;
  supplierId: number | null; status: string; notes: string | null;
}

interface InvTransaction {
  id: number; materialId: number; transactionType: string; quantity: string;
  referenceType: string | null; referenceId: number | null;
  warehouseLocation: string | null; notes: string | null; performedBy: string | null;
  createdAt: string;
}

const ABC_COLORS: Record<string, string> = {
  A: "bg-red-500/20 text-red-400 border-red-500/30",
  B: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  C: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};
const CATEGORIES = ["כללי", "ברזל ופלדה", "אלומיניום", "זכוכית", "חומרי גלם", "חומרי עזר", "ברגים ומחברים", "צבעים וציפויים", "גומי ואטמים", "כלי עבודה", "חשמל", "אריזה"];
const WAREHOUSES = ["מחסן ראשי", "מחסן A", "מחסן B", "מחסן חיצוני", "אזור קבלה", "אזור בידוד"];

type ViewMode = "dashboard" | "stock" | "movements" | "abc" | "counts";

export default function InventoryManagementPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [abcFilter, setAbcFilter] = useState("all");
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [detailTab, setDetailTab] = useState("details");

  const { data: materialsRaw, isLoading } = useQuery({
    queryKey: ["raw-materials-inv"],
    queryFn: async () => { const r = await authFetch(`${API}/raw-materials`); return r.json(); },
  });
  const materials: Material[] = Array.isArray(materialsRaw) ? materialsRaw : (materialsRaw?.data || materialsRaw?.items || []);

  const { data: txRaw } = useQuery({
    queryKey: ["inv-transactions"],
    queryFn: async () => { const r = await authFetch(`${API}/inventory-transactions`); return r.json(); },
  });
  const transactions: InvTransaction[] = Array.isArray(txRaw) ? txRaw : (txRaw?.data || txRaw?.items || []);

  const filtered = useMemo(() => materials.filter(m => {
    const matchSearch = !search || m.materialName.toLowerCase().includes(search.toLowerCase()) ||
      m.materialNumber.toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === "all" || m.category === categoryFilter;
    const matchWH = warehouseFilter === "all" || m.warehouseLocation === warehouseFilter;
    const matchABC = abcFilter === "all" || m.abcClassification === abcFilter;
    return matchSearch && matchCat && matchWH && matchABC;
  }), [materials, search, categoryFilter, warehouseFilter, abcFilter]);

  const n = (v: string | null) => parseFloat(v || "0");
  const activeItems = materials.filter(m => m.status === "פעיל");
  const totalStockValue = materials.reduce((s, m) => s + n(m.currentStock) * n(m.standardPrice), 0);
  const belowMin = materials.filter(m => m.minimumStock && n(m.currentStock) < n(m.minimumStock));
  const belowReorder = materials.filter(m => m.reorderPoint && n(m.currentStock) <= n(m.reorderPoint) && (m.minimumStock ? n(m.currentStock) >= n(m.minimumStock) : true));
  const overMax = materials.filter(m => m.maximumStock && n(m.currentStock) > n(m.maximumStock));
  const zeroStock = materials.filter(m => n(m.currentStock) === 0 && m.status === "פעיל");
  const needCount = materials.filter(m => {
    if (!m.lastCountDate) return true;
    const daysSince = Math.ceil((Date.now() - new Date(m.lastCountDate).getTime()) / 86400000);
    return daysSince > 90;
  });

  const abcA = materials.filter(m => m.abcClassification === "A");
  const abcB = materials.filter(m => m.abcClassification === "B");
  const abcC = materials.filter(m => m.abcClassification === "C" || !m.abcClassification);

  const categoryCounts = useMemo(() => {
    const map: Record<string, { count: number; value: number }> = {};
    materials.forEach(m => {
      if (!map[m.category]) map[m.category] = { count: 0, value: 0 };
      map[m.category].count++;
      map[m.category].value += n(m.currentStock) * n(m.standardPrice);
    });
    return Object.entries(map).sort((a, b) => b[1].value - a[1].value);
  }, [materials]);

  const warehouseCounts = useMemo(() => {
    const map: Record<string, { count: number; value: number }> = {};
    materials.forEach(m => {
      const wh = m.warehouseLocation || "לא מוגדר";
      if (!map[wh]) map[wh] = { count: 0, value: 0 };
      map[wh].count++;
      map[wh].value += n(m.currentStock) * n(m.standardPrice);
    });
    return Object.entries(map).sort((a, b) => b[1].value - a[1].value);
  }, [materials]);

  const recentTx = useMemo(() =>
    [...transactions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 50),
    [transactions]
  );

  const getMaterialName = (id: number) => materials.find(m => m.id === id)?.materialName || `חומר ${id}`;
  const getMaterialNumber = (id: number) => materials.find(m => m.id === id)?.materialNumber || "";

  function getStockStatus(m: Material) {
    const stock = n(m.currentStock);
    if (stock === 0) return { label: "אזל", color: "text-red-500", bg: "bg-red-500/10" };
    if (m.minimumStock && stock < n(m.minimumStock)) return { label: "מתחת למינימום", color: "text-red-400", bg: "bg-red-500/10" };
    if (m.reorderPoint && stock <= n(m.reorderPoint)) return { label: "נקודת הזמנה", color: "text-amber-400", bg: "bg-amber-500/10" };
    if (m.maximumStock && stock > n(m.maximumStock)) return { label: "מעל מקסימום", color: "text-purple-400", bg: "bg-purple-500/10" };
    return { label: "תקין", color: "text-emerald-400", bg: "bg-emerald-500/10" };
  }

  function getStockBar(m: Material) {
    const stock = n(m.currentStock);
    const max = n(m.maximumStock) || n(m.minimumStock) * 5 || 100;
    const pct = Math.min((stock / max) * 100, 100);
    const minPct = m.minimumStock ? (n(m.minimumStock) / max) * 100 : 0;
    const reorderPct = m.reorderPoint ? (n(m.reorderPoint) / max) * 100 : 0;
    const status = getStockStatus(m);
    const barColor = status.label === "אזל" || status.label === "מתחת למינימום" ? "bg-red-500" :
      status.label === "נקודת הזמנה" ? "bg-amber-500" : status.label === "מעל מקסימום" ? "bg-purple-500" : "bg-emerald-500";
    return { pct, minPct, reorderPct, barColor };
  }

  const tabs: { key: ViewMode; label: string; icon: any }[] = [
    { key: "dashboard", label: "דשבורד", icon: BarChart3 },
    { key: "stock", label: "מלאי נוכחי", icon: Boxes },
    { key: "movements", label: "תנועות מלאי", icon: Activity },
    { key: "abc", label: "ניתוח ABC", icon: Layers },
    { key: "counts", label: "ספירות מלאי", icon: RefreshCw },
  ];

  if (isLoading) return <SkeletonPage />;

  return (
    <div className="min-h-screen" dir="rtl">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Warehouse className="w-6 h-6 text-foreground" />
              </div>
              ניהול מלאי
            </h1>
            <p className="text-muted-foreground mt-1">מלאי נוכחי, התראות, תנועות, ניתוח ABC וספירות</p>
          </div>
          <div className="flex gap-1 bg-input border border-border rounded-xl p-1">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setViewMode(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${viewMode === t.key ? "bg-indigo-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <t.icon className="w-4 h-4" />{t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "סה״כ פריטים", value: materials.length, icon: Package, color: "text-indigo-400", bg: "bg-indigo-500/10" },
            { label: "פעילים", value: activeItems.length, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
            { label: "שווי מלאי", value: `₪${Math.round(totalStockValue).toLocaleString()}`, icon: DollarSign, color: "text-purple-400", bg: "bg-purple-500/10" },
            { label: "מתחת למינימום", value: belowMin.length, icon: ShieldAlert, color: belowMin.length > 0 ? "text-red-400" : "text-muted-foreground", bg: belowMin.length > 0 ? "bg-red-500/10" : "bg-muted/10" },
            { label: "נקודת הזמנה", value: belowReorder.length, icon: AlertTriangle, color: belowReorder.length > 0 ? "text-amber-400" : "text-muted-foreground", bg: belowReorder.length > 0 ? "bg-amber-500/10" : "bg-muted/10" },
            { label: "אזל מהמלאי", value: zeroStock.length, icon: XCircle, color: zeroStock.length > 0 ? "text-red-500" : "text-muted-foreground", bg: zeroStock.length > 0 ? "bg-red-500/10" : "bg-muted/10" },
            { label: "מעל מקסימום", value: overMax.length, icon: ArrowUp, color: overMax.length > 0 ? "text-purple-400" : "text-muted-foreground", bg: overMax.length > 0 ? "bg-purple-500/10" : "bg-muted/10" },
            { label: "דורשים ספירה", value: needCount.length, icon: RefreshCw, color: needCount.length > 0 ? "text-orange-400" : "text-muted-foreground", bg: needCount.length > 0 ? "bg-orange-500/10" : "bg-muted/10" },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center`}>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <p className="text-muted-foreground text-[11px]">{s.label}</p>
              </div>
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {viewMode === "dashboard" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {belowMin.length > 0 && (
              <div className="bg-card border border-red-500/30 rounded-xl p-5">
                <h3 className="text-lg font-semibold text-red-400 flex items-center gap-2 mb-4"><ShieldAlert className="w-5 h-5" />התראות מלאי ({belowMin.length})</h3>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {belowMin.map(m => {
                    const bar = getStockBar(m);
                    return (
                      <div key={m.id} className="bg-input rounded-lg p-3 flex items-center gap-4 cursor-pointer hover:bg-muted" onClick={() => setSelectedMaterial(m)}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2"><p className="text-foreground text-sm font-medium truncate">{m.materialName}</p><span className="text-muted-foreground text-xs font-mono">{m.materialNumber}</span></div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-red-400 text-xs">מלאי: {n(m.currentStock)} {m.unit}</span>
                            <span className="text-muted-foreground text-xs">מינ׳: {n(m.minimumStock)} {m.unit}</span>
                            <span className="text-amber-400 text-xs font-medium">חסר: {(n(m.minimumStock) - n(m.currentStock)).toFixed(0)}</span>
                          </div>
                        </div>
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full ${bar.barColor} rounded-full`} style={{ width: `${bar.pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4"><MapPin className="w-5 h-5 text-indigo-400" />מלאי לפי מחסן</h3>
              <div className="space-y-3">
                {warehouseCounts.map(([wh, data]) => {
                  const pct = totalStockValue > 0 ? (data.value / totalStockValue) * 100 : 0;
                  return (
                    <div key={wh} className="flex items-center gap-3">
                      <div className="w-24 text-sm text-gray-300 truncate">{wh}</div>
                      <div className="flex-1 h-6 bg-input rounded-full overflow-hidden relative">
                        <div className="h-full bg-indigo-500/40 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        <span className="absolute inset-0 flex items-center justify-center text-xs text-gray-300">{data.count} פריטים</span>
                      </div>
                      <div className="w-28 text-left text-sm font-mono text-muted-foreground" dir="ltr">₪{Math.round(data.value).toLocaleString()}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4"><Layers className="w-5 h-5 text-amber-400" />ניתוח ABC — סיכום</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { cls: "A", items: abcA, desc: "ערך גבוה — פיקוח צמוד", color: "border-red-500/30 bg-red-500/5" },
                  { cls: "B", items: abcB, desc: "ערך בינוני — פיקוח רגיל", color: "border-amber-500/30 bg-amber-500/5" },
                  { cls: "C", items: abcC, desc: "ערך נמוך — ביקורת מזערית", color: "border-blue-500/30 bg-blue-500/5" },
                ].map(a => {
                  const val = a.items.reduce((s, m) => s + n(m.currentStock) * n(m.standardPrice), 0);
                  const pct = totalStockValue > 0 ? Math.round((val / totalStockValue) * 100) : 0;
                  return (
                    <div key={a.cls} className={`border rounded-xl p-4 ${a.color}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-lg sm:text-2xl font-bold ${ABC_COLORS[a.cls]?.split(" ")[1]}`}>{a.cls}</span>
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-medium border ${ABC_COLORS[a.cls]}`}>{a.items.length} פריטים</span>
                      </div>
                      <p className="text-foreground font-mono text-lg font-bold" dir="ltr">₪{Math.round(val).toLocaleString()}</p>
                      <p className="text-muted-foreground text-xs mt-1">{pct}% משווי המלאי</p>
                      <p className="text-muted-foreground text-[10px] mt-2">{a.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4"><BarChart3 className="w-5 h-5 text-cyan-400" />מלאי לפי קטגוריה</h3>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {categoryCounts.map(([cat, data]) => {
                  const pct = totalStockValue > 0 ? (data.value / totalStockValue) * 100 : 0;
                  return (
                    <div key={cat} className="flex items-center gap-3">
                      <div className="w-28 text-sm text-gray-300 truncate">{cat}</div>
                      <div className="flex-1 h-5 bg-input rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500/40 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-8">{data.count}</span>
                      <span className="text-xs font-mono text-muted-foreground w-24" dir="ltr">₪{Math.round(data.value).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {recentTx.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5 lg:col-span-2">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4"><Activity className="w-5 h-5 text-emerald-400" />תנועות אחרונות</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead><tr className="text-muted-foreground border-b border-border">
                      <th className="pb-2 pr-2">תאריך</th><th className="pb-2 pr-2">חומר</th>
                      <th className="pb-2 pr-2">סוג</th><th className="pb-2 pr-2">כמות</th>
                      <th className="pb-2 pr-2">מחסן</th><th className="pb-2 pr-2">הפניה</th>
                      <th className="pb-2 pr-2">מבצע</th>
                    </tr></thead>
                    <tbody>{recentTx.slice(0, 15).map(tx => (
                      <tr key={tx.id} className="border-t border-border/30">
                        <td className="py-2 pr-2 text-muted-foreground text-xs">{new Date(tx.createdAt).toLocaleDateString("he-IL")}</td>
                        <td className="py-2 pr-2"><span className="text-foreground text-sm">{getMaterialName(tx.materialId)}</span><span className="text-muted-foreground text-xs block font-mono">{getMaterialNumber(tx.materialId)}</span></td>
                        <td className="py-2 pr-2"><span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${tx.transactionType.includes("כניסה") || tx.transactionType.includes("קבלה") ? "bg-emerald-500/20 text-emerald-400" : tx.transactionType.includes("יציאה") || tx.transactionType.includes("ניפוק") ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"}`}>{tx.transactionType}</span></td>
                        <td className="py-2 pr-2 text-foreground font-mono">{tx.quantity}</td>
                        <td className="py-2 pr-2 text-muted-foreground text-xs">{tx.warehouseLocation || "—"}</td>
                        <td className="py-2 pr-2 text-muted-foreground text-xs">{tx.referenceType ? `${tx.referenceType} #${tx.referenceId}` : "—"}</td>
                        <td className="py-2 pr-2 text-muted-foreground text-xs">{tx.performedBy || "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {(viewMode === "stock" || viewMode === "abc" || viewMode === "counts") && (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input type="text" placeholder="חיפוש חומר..." value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-foreground placeholder-gray-500 focus:border-indigo-500 focus:outline-none" />
              </div>
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="px-3 py-2.5 bg-card border border-border rounded-xl text-foreground focus:border-indigo-500 focus:outline-none text-sm">
                <option value="all">כל הקטגוריות</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={warehouseFilter} onChange={e => setWarehouseFilter(e.target.value)} className="px-3 py-2.5 bg-card border border-border rounded-xl text-foreground focus:border-indigo-500 focus:outline-none text-sm">
                <option value="all">כל המחסנים</option>
                {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              {viewMode === "abc" && (
                <select value={abcFilter} onChange={e => setAbcFilter(e.target.value)} className="px-3 py-2.5 bg-card border border-border rounded-xl text-foreground focus:border-indigo-500 focus:outline-none text-sm">
                  <option value="all">כל הסיווגים</option>
                  <option value="A">A — ערך גבוה</option>
                  <option value="B">B — ערך בינוני</option>
                  <option value="C">C — ערך נמוך</option>
                </select>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-border bg-input">
                <span className="text-sm text-muted-foreground">{filtered.length} פריטים</span>
              </div>
              <table className="w-full text-right">
                <thead><tr className="border-b border-border bg-input">
                  <th className="px-4 py-3 text-muted-foreground font-medium text-sm">מספר</th>
                  <th className="px-4 py-3 text-muted-foreground font-medium text-sm">שם חומר</th>
                  <th className="px-4 py-3 text-muted-foreground font-medium text-sm">קטגוריה</th>
                  <th className="px-4 py-3 text-muted-foreground font-medium text-sm">מלאי</th>
                  <th className="px-4 py-3 text-muted-foreground font-medium text-sm">רמת מלאי</th>
                  <th className="px-4 py-3 text-muted-foreground font-medium text-sm">מינ׳ / הזמנה / מקס׳</th>
                  <th className="px-4 py-3 text-muted-foreground font-medium text-sm">מחיר</th>
                  <th className="px-4 py-3 text-muted-foreground font-medium text-sm">שווי</th>
                  {viewMode === "abc" && <th className="px-4 py-3 text-muted-foreground font-medium text-sm">ABC</th>}
                  {viewMode === "counts" && <th className="px-4 py-3 text-muted-foreground font-medium text-sm">ספירה אחרונה</th>}
                  <th className="px-4 py-3 text-muted-foreground font-medium text-sm">מחסן</th>
                  <th className="px-4 py-3 text-muted-foreground font-medium text-sm">סטטוס</th>
                </tr></thead>
                <tbody>
                  {filtered.map(m => {
                    const bar = getStockBar(m);
                    const status = getStockStatus(m);
                    const value = n(m.currentStock) * n(m.standardPrice);
                    const daysSinceCount = m.lastCountDate ? Math.ceil((Date.now() - new Date(m.lastCountDate).getTime()) / 86400000) : null;
                    return (
                      <tr key={m.id} className={`border-b border-border/50 hover:bg-muted cursor-pointer transition-colors ${status.label === "אזל" || status.label === "מתחת למינימום" ? "bg-red-500/5" : ""}`}
                        onClick={() => setSelectedMaterial(m)}>
                        <td className="px-4 py-3 text-indigo-400 font-mono text-sm">{m.materialNumber}</td>
                        <td className="px-4 py-3 text-foreground text-sm">{m.materialName}</td>
                        <td className="px-4 py-3 text-muted-foreground text-sm">{m.category}</td>
                        <td className="px-4 py-3 text-foreground font-mono text-sm font-medium">{n(m.currentStock).toLocaleString()} <span className="text-muted-foreground text-xs">{m.unit}</span></td>
                        <td className="px-4 py-3 w-32">
                          <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full ${bar.barColor} rounded-full transition-all`} style={{ width: `${bar.pct}%` }} />
                            {bar.minPct > 0 && <div className="absolute top-0 h-full w-0.5 bg-red-400" style={{ left: `${bar.minPct}%` }} />}
                            {bar.reorderPct > 0 && <div className="absolute top-0 h-full w-0.5 bg-amber-400" style={{ left: `${bar.reorderPct}%` }} />}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs font-mono">
                          {n(m.minimumStock) || "—"} / {n(m.reorderPoint) || "—"} / {n(m.maximumStock) || "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-300 text-sm font-mono" dir="ltr">₪{n(m.standardPrice).toLocaleString()}</td>
                        <td className="px-4 py-3 text-foreground text-sm font-mono font-medium" dir="ltr">₪{Math.round(value).toLocaleString()}</td>
                        {viewMode === "abc" && (
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${ABC_COLORS[m.abcClassification || "C"]}`}>{m.abcClassification || "C"}</span>
                          </td>
                        )}
                        {viewMode === "counts" && (
                          <td className="px-4 py-3">
                            {m.lastCountDate ? (
                              <div>
                                <span className="text-gray-300 text-xs">{new Date(m.lastCountDate).toLocaleDateString("he-IL")}</span>
                                <span className={`block text-xs ${daysSinceCount && daysSinceCount > 90 ? "text-red-400" : daysSinceCount && daysSinceCount > 60 ? "text-amber-400" : "text-muted-foreground"}`}>
                                  לפני {daysSinceCount} ימים
                                </span>
                              </div>
                            ) : <span className="text-red-400 text-xs">לא נספר</span>}
                          </td>
                        )}
                        <td className="px-4 py-3 text-muted-foreground text-xs">{m.warehouseLocation || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${status.bg} ${status.color}`}>{status.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {viewMode === "movements" && (
          <>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input type="text" placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-foreground placeholder-gray-500 focus:border-indigo-500 focus:outline-none" />
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-border bg-input">
                <span className="text-sm text-muted-foreground">{transactions.length} תנועות</span>
              </div>
              <table className="w-full text-right text-sm">
                <thead><tr className="border-b border-border bg-input">
                  <th className="px-4 py-3 text-muted-foreground font-medium">תאריך</th>
                  <th className="px-4 py-3 text-muted-foreground font-medium">חומר</th>
                  <th className="px-4 py-3 text-muted-foreground font-medium">סוג תנועה</th>
                  <th className="px-4 py-3 text-muted-foreground font-medium">כמות</th>
                  <th className="px-4 py-3 text-muted-foreground font-medium">מחסן</th>
                  <th className="px-4 py-3 text-muted-foreground font-medium">הפניה</th>
                  <th className="px-4 py-3 text-muted-foreground font-medium">מבצע</th>
                  <th className="px-4 py-3 text-muted-foreground font-medium">הערות</th>
                </tr></thead>
                <tbody>
                  {recentTx.filter(tx => {
                    if (!search) return true;
                    return getMaterialName(tx.materialId).includes(search) || getMaterialNumber(tx.materialId).includes(search);
                  }).map(tx => (
                    <tr key={tx.id} className="border-t border-border/30 hover:bg-muted">
                      <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(tx.createdAt).toLocaleString("he-IL")}</td>
                      <td className="px-4 py-3"><span className="text-foreground">{getMaterialName(tx.materialId)}</span><span className="text-muted-foreground text-xs block font-mono">{getMaterialNumber(tx.materialId)}</span></td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${tx.transactionType.includes("כניסה") || tx.transactionType.includes("קבלה") ? "bg-emerald-500/20 text-emerald-400" : tx.transactionType.includes("יציאה") || tx.transactionType.includes("ניפוק") ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"}`}>{tx.transactionType}</span></td>
                      <td className="px-4 py-3 text-foreground font-mono font-medium">{tx.quantity}</td>
                      <td className="px-4 py-3 text-muted-foreground">{tx.warehouseLocation || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{tx.referenceType ? `${tx.referenceType} #${tx.referenceId}` : "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{tx.performedBy || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs max-w-[120px] truncate">{tx.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {transactions.length === 0 && <p className="text-muted-foreground text-sm text-center py-10">אין תנועות מלאי</p>}
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {selectedMaterial && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-6 overflow-y-auto" onClick={() => setSelectedMaterial(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl w-full max-w-3xl mx-4 mb-10" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div>
                  <h2 className="text-xl font-bold text-foreground">{selectedMaterial.materialName}</h2>
                  <p className="text-sm text-muted-foreground font-mono">{selectedMaterial.materialNumber} — {selectedMaterial.category}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${ABC_COLORS[selectedMaterial.abcClassification || "C"]}`}>{selectedMaterial.abcClassification || "C"}</span>
                  <button onClick={() => setSelectedMaterial(null)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="flex gap-1 px-6 pt-3 border-b border-border overflow-x-auto">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"attachments",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(tab => (
                  <button key={tab.key} onClick={() => setDetailTab(tab.key)} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${detailTab === tab.key ? "bg-emerald-500/20 text-emerald-400 border-b-2 border-emerald-500" : "text-muted-foreground hover:text-gray-300"}`}>{tab.label}</button>
                ))}
              </div>
              <div className="p-6 space-y-5">
                {detailTab === "details" && (<>
                {(() => {
                  const bar = getStockBar(selectedMaterial);
                  const status = getStockStatus(selectedMaterial);
                  return (
                    <div className="bg-input rounded-xl p-5 border border-border">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-muted-foreground text-sm">רמת מלאי</span>
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${status.bg} ${status.color}`}>{status.label}</span>
                      </div>
                      <p className="text-4xl font-bold text-foreground font-mono mb-3">{n(selectedMaterial.currentStock).toLocaleString()} <span className="text-lg text-muted-foreground">{selectedMaterial.unit}</span></p>
                      <div className="relative h-4 bg-muted rounded-full overflow-hidden mb-2">
                        <div className={`h-full ${bar.barColor} rounded-full`} style={{ width: `${bar.pct}%` }} />
                        {bar.minPct > 0 && <div className="absolute top-0 h-full w-1 bg-red-400" style={{ left: `${bar.minPct}%` }} title="מינימום" />}
                        {bar.reorderPct > 0 && <div className="absolute top-0 h-full w-1 bg-amber-400" style={{ left: `${bar.reorderPct}%` }} title="נק׳ הזמנה" />}
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0</span>
                        {selectedMaterial.minimumStock && <span className="text-red-400">מינ׳: {n(selectedMaterial.minimumStock)}</span>}
                        {selectedMaterial.reorderPoint && <span className="text-amber-400">הזמנה: {n(selectedMaterial.reorderPoint)}</span>}
                        {selectedMaterial.maximumStock && <span className="text-purple-400">מקס׳: {n(selectedMaterial.maximumStock)}</span>}
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">מחיר תקן</p><p className="text-foreground font-medium mt-1 font-mono" dir="ltr">₪{n(selectedMaterial.standardPrice).toLocaleString()}</p></div>
                  <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">שווי מלאי</p><p className="text-foreground font-medium mt-1 font-mono" dir="ltr">₪{Math.round(n(selectedMaterial.currentStock) * n(selectedMaterial.standardPrice)).toLocaleString()}</p></div>
                  <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">מחסן</p><p className="text-foreground font-medium mt-1">{selectedMaterial.warehouseLocation || "—"}</p></div>
                  <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">ימי אספקה</p><p className="text-foreground font-medium mt-1">{selectedMaterial.leadTimeDays ? `${selectedMaterial.leadTimeDays} ימים` : "—"}</p></div>
                  <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">ספירה אחרונה</p><p className="text-foreground font-medium mt-1">{selectedMaterial.lastCountDate ? new Date(selectedMaterial.lastCountDate).toLocaleDateString("he-IL") : "לא נספר"}</p></div>
                  <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">כמות בספירה</p><p className="text-foreground font-medium mt-1">{selectedMaterial.lastCountQuantity || "—"}</p></div>
                  <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">קבלה אחרונה</p><p className="text-foreground font-medium mt-1">{selectedMaterial.lastReceiptDate ? new Date(selectedMaterial.lastReceiptDate).toLocaleDateString("he-IL") : "—"}</p></div>
                  <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">ניפוק אחרון</p><p className="text-foreground font-medium mt-1">{selectedMaterial.lastIssueDate ? new Date(selectedMaterial.lastIssueDate).toLocaleDateString("he-IL") : "—"}</p></div>
                  <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">שימוש שנתי</p><p className="text-foreground font-medium mt-1 font-mono" dir="ltr">₪{Math.round(n(selectedMaterial.annualUsageValue)).toLocaleString()}</p></div>
                </div>

                {selectedMaterial.description && (
                  <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs mb-1">תיאור</p><p className="text-gray-300 text-sm">{selectedMaterial.description}</p></div>
                )}

                {(() => {
                  const matTx = transactions.filter(tx => tx.materialId === selectedMaterial.id)
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);
                  if (matTx.length === 0) return null;
                  return (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-2">תנועות אחרונות</h3>
                      <table className="w-full text-right text-sm">
                        <thead><tr className="text-muted-foreground border-b border-border">
                          <th className="pb-2 pr-2">תאריך</th><th className="pb-2 pr-2">סוג</th>
                          <th className="pb-2 pr-2">כמות</th><th className="pb-2 pr-2">מבצע</th>
                        </tr></thead>
                        <tbody>{matTx.map(tx => (
                          <tr key={tx.id} className="border-t border-border/30">
                            <td className="py-1.5 pr-2 text-muted-foreground text-xs">{new Date(tx.createdAt).toLocaleDateString("he-IL")}</td>
                            <td className="py-1.5 pr-2 text-gray-300 text-xs">{tx.transactionType}</td>
                            <td className="py-1.5 pr-2 text-foreground font-mono text-xs">{tx.quantity}</td>
                            <td className="py-1.5 pr-2 text-muted-foreground text-xs">{tx.performedBy || "—"}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  );
                })()}
                </>)}
                {detailTab === "related" && <RelatedRecords entityType="raw-materials" entityId={selectedMaterial.id} />}
                {detailTab === "attachments" && <AttachmentsSection entityType="raw-materials" entityId={selectedMaterial.id} />}
                {detailTab === "history" && <ActivityLog entityType="raw-materials" entityId={selectedMaterial.id} />}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
