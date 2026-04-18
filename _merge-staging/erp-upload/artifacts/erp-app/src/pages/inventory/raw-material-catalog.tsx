import { useState, useEffect, useMemo } from "react";
import {
  Package, Search, Plus, Edit2, Trash2, X, TrendingUp, TrendingDown, Minus,
  AlertTriangle, DollarSign, BarChart3, Eye, ChevronRight, Star, RefreshCw,
  Layers, Filter, ArrowUpDown
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

const API = "/api/raw-material-catalog";
const safeArr = (d: any) => Array.isArray(d) ? d : [];
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtC = (v: any) => Number(v || 0).toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });

const trendIcon: Record<string, any> = {
  up: <TrendingUp className="w-4 h-4 text-red-400" />,
  down: <TrendingDown className="w-4 h-4 text-green-400" />,
  stable: <Minus className="w-4 h-4 text-gray-400" />,
};

const statusColors: Record<string, string> = {
  active: "bg-green-500/20 text-green-400",
  inactive: "bg-red-500/20 text-red-400",
  discontinued: "bg-gray-500/20 text-gray-400",
};

export default function RawMaterialCatalogPage() {
  const [dashboard, setDashboard] = useState<any>({});
  const [categories, setCategories] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [priceAlerts, setPriceAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"items" | "alerts" | "dashboard">("dashboard");
  const [showForm, setShowForm] = useState(false);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [form, setForm] = useState<any>({});
  const [supplierForm, setSupplierForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [dRes, cRes, iRes, aRes] = await Promise.all([
        authFetch(`${API}/dashboard`),
        authFetch(`${API}/categories`),
        authFetch(`${API}/items${selectedCat ? `?category_id=${selectedCat}` : ""}`),
        authFetch(`${API}/price-alerts`),
      ]);
      if (dRes.ok) setDashboard(await dRes.json());
      if (cRes.ok) setCategories(safeArr(await cRes.json()));
      if (iRes.ok) setItems(safeArr(await iRes.json()));
      if (aRes.ok) setPriceAlerts(safeArr(await aRes.json()));
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [selectedCat]);

  const loadSuppliers = async (itemId: number) => {
    try {
      const r = await authFetch(`${API}/items/${itemId}/suppliers`);
      if (r.ok) setSuppliers(safeArr(await r.json()));
    } catch {}
  };

  const loadPriceHistory = async (itemId: number) => {
    try {
      const r = await authFetch(`${API}/items/${itemId}/price-history`);
      if (r.ok) setPriceHistory(safeArr(await r.json()));
    } catch {}
  };

  const selectItem = (item: any) => {
    setSelectedItem(item);
    loadSuppliers(item.id);
    loadPriceHistory(item.id);
  };

  const saveItem = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/items/${editing.id}` : `${API}/items`;
      const method = editing ? "PUT" : "POST";
      await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, category_id: form.category_id || selectedCat }) });
      setShowForm(false); setEditing(null); setForm({});
      load();
    } catch {}
    setSaving(false);
  };

  const deleteItem = async (id: number) => {
    await authFetch(`${API}/items/${id}`, { method: "DELETE" });
    setSelectedItem(null);
    load();
  };

  const saveSupplier = async () => {
    setSaving(true);
    try {
      const url = supplierForm.id ? `${API}/suppliers/${supplierForm.id}` : `${API}/suppliers`;
      const method = supplierForm.id ? "PUT" : "POST";
      await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...supplierForm, item_id: selectedItem?.id }) });
      setShowSupplierForm(false); setSupplierForm({});
      if (selectedItem) loadSuppliers(selectedItem.id);
    } catch {}
    setSaving(false);
  };

  const filtered = useMemo(() => {
    if (!search) return items;
    const s = search.toLowerCase();
    return items.filter(i => i.name?.toLowerCase().includes(s) || i.item_code?.toLowerCase().includes(s));
  }, [items, search]);

  const d = dashboard.summary || {};

  const F = ({ label, val, ch }: { label: string; val?: any; ch?: React.ReactNode }) => (
    <div><div className="text-xs text-muted-foreground mb-1">{label}</div><div className="text-sm text-white">{ch || val || "—"}</div></div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="w-6 h-6 text-indigo-400" /> קטלוג חומרי גלם</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול חומרים, מחירים וספקים למפעל מתכת</p>
        </div>
        <div className="flex gap-2">
          {(["dashboard", "items", "alerts"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? "bg-indigo-600 text-white" : "bg-white/5 hover:bg-white/10 text-gray-400"}`}>
              {t === "dashboard" ? "דשבורד" : t === "items" ? "פריטים" : "התראות מחיר"}
            </button>
          ))}
        </div>
      </div>

      {/* Dashboard Tab */}
      {tab === "dashboard" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: "סה\"כ פריטים", val: d.total_items, icon: Package, color: "text-blue-400" },
              { label: "פעילים", val: d.active_items, icon: Layers, color: "text-green-400" },
              { label: "לא פעילים", val: d.inactive_items, icon: AlertTriangle, color: "text-red-400" },
              { label: "שווי מלאי משוער", val: fmtC(d.estimated_inventory_value), icon: DollarSign, color: "text-yellow-400" },
              { label: "דורשים הזמנה", val: d.reorder_needed, icon: RefreshCw, color: "text-orange-400" },
            ].map((c, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="bg-[#111118] border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2"><c.icon className={`w-4 h-4 ${c.color}`} /><span className="text-xs text-muted-foreground">{c.label}</span></div>
                <div className="text-xl font-bold">{c.val ?? "—"}</div>
              </motion.div>
            ))}
          </div>

          {/* Category breakdown */}
          <div className="bg-[#111118] border border-white/10 rounded-xl p-5">
            <h3 className="text-lg font-bold mb-4">התפלגות לפי קטגוריה</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {safeArr(dashboard.categoryBreakdown).map((c: any, i: number) => (
                <div key={i} className="bg-white/5 rounded-lg p-3 cursor-pointer hover:bg-white/10 transition-colors"
                  onClick={() => { const cat = categories.find(cc => cc.name === c.category); if (cat) { setSelectedCat(cat.id); setTab("items"); } }}>
                  <div className="text-sm font-medium truncate">{c.category}</div>
                  <div className="text-xs text-muted-foreground mt-1">{c.item_count} פריטים</div>
                  <div className="text-xs text-indigo-400">{fmtC(c.total_value)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Price alerts preview */}
          {safeArr(dashboard.priceAlerts).length > 0 && (
            <div className="bg-[#111118] border border-orange-500/30 rounded-xl p-5">
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-orange-400" /> התראות מחיר</h3>
              <div className="space-y-2">
                {safeArr(dashboard.priceAlerts).slice(0, 5).map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between bg-white/5 rounded-lg p-3">
                    <div>
                      <span className="font-medium">{a.name}</span>
                      <span className="text-xs text-muted-foreground mr-2">{a.item_code}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{fmtC(a.current_price)}</span>
                      {trendIcon[a.price_trend] || trendIcon.stable}
                      <Badge className={Number(a.price_change_pct) > 0 ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}>
                        {a.price_change_pct}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Items Tab */}
      {tab === "items" && (
        <div className="flex gap-4">
          {/* Category sidebar */}
          <div className="w-56 shrink-0 bg-[#111118] border border-white/10 rounded-xl p-4">
            <h3 className="font-bold text-sm mb-3">קטגוריות</h3>
            <button onClick={() => setSelectedCat(null)}
              className={`w-full text-right px-3 py-2 rounded-lg text-sm mb-1 transition-colors ${!selectedCat ? "bg-indigo-600/30 text-indigo-300" : "hover:bg-white/5 text-gray-400"}`}>
              הכל ({items.length})
            </button>
            {categories.map(c => (
              <button key={c.id} onClick={() => setSelectedCat(c.id)}
                className={`w-full text-right px-3 py-2 rounded-lg text-sm mb-1 transition-colors ${selectedCat === c.id ? "bg-indigo-600/30 text-indigo-300" : "hover:bg-white/5 text-gray-400"}`}>
                {c.name}
              </button>
            ))}
          </div>

          {/* Main content */}
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input className="w-full bg-[#111118] border border-white/10 rounded-lg pl-3 pr-10 py-2 text-sm"
                  placeholder="חיפוש לפי שם או קוד..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <button onClick={() => { setForm({}); setEditing(null); setShowForm(true); }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                <Plus className="w-4 h-4" /> הוסף פריט
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {loading ? <div className="text-center py-12 text-muted-foreground">טוען...</div> :
                filtered.length === 0 ? <div className="text-center py-12 text-muted-foreground">לא נמצאו פריטים</div> :
                filtered.map(item => (
                  <motion.div key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className={`bg-[#111118] border rounded-xl p-4 cursor-pointer transition-all hover:border-indigo-500/50 ${selectedItem?.id === item.id ? "border-indigo-500" : "border-white/10"}`}
                    onClick={() => selectItem(item)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-indigo-600/20 flex items-center justify-center">
                          <Package className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-muted-foreground">{item.item_code} | {item.category_name || "ללא קטגוריה"}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-left">
                          <div className="font-bold text-lg">{fmtC(item.current_price)}</div>
                          <div className="flex items-center gap-1 text-xs">{trendIcon[item.price_trend] || trendIcon.stable}<span className="text-muted-foreground">ממוצע 30: {fmtC(item.avg_price_30d)}</span></div>
                        </div>
                        <Badge className={statusColors[item.status] || statusColors.active}>{item.status === "active" ? "פעיל" : item.status === "inactive" ? "לא פעיל" : item.status}</Badge>
                        <div className="flex gap-1">
                          <button onClick={e => { e.stopPropagation(); setEditing(item); setForm(item); setShowForm(true); }} className="p-1.5 hover:bg-white/10 rounded"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={e => { e.stopPropagation(); deleteItem(item.id); }} className="p-1.5 hover:bg-red-500/20 rounded text-red-400"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>
                    {item.material_type && (
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        {item.material_type && <span>סוג: {item.material_type}</span>}
                        {item.profile_type && <span>פרופיל: {item.profile_type}</span>}
                        {item.thickness_mm && <span>עובי: {item.thickness_mm}mm</span>}
                        {item.width_mm && <span>רוחב: {item.width_mm}mm</span>}
                        {item.weight_per_meter && <span>משקל/מ': {fmt(item.weight_per_meter)} ק"ג</span>}
                      </div>
                    )}
                  </motion.div>
                ))
              }
            </div>
          </div>

          {/* Detail panel */}
          <AnimatePresence>
            {selectedItem && (
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="w-80 shrink-0 bg-[#111118] border border-white/10 rounded-xl p-5 space-y-5 max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold">{selectedItem.name}</h3>
                  <button onClick={() => setSelectedItem(null)} className="p-1 hover:bg-white/10 rounded"><X className="w-4 h-4" /></button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <F label="קוד פריט" val={selectedItem.item_code} />
                  <F label="סוג חומר" val={selectedItem.material_type || "—"} />
                  <F label="מחיר נוכחי" val={fmtC(selectedItem.current_price)} />
                  <F label="ממוצע 30 יום" val={fmtC(selectedItem.avg_price_30d)} />
                  <F label="מלאי בטחון" val={fmt(selectedItem.safety_stock)} />
                  <F label="נקודת הזמנה" val={fmt(selectedItem.reorder_point)} />
                  <F label="ליד טיים (ימים)" val={selectedItem.lead_time_days} />
                  <F label="יחידה" val={selectedItem.unit} />
                </div>

                {/* Suppliers */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-bold text-sm">ספקים</h4>
                    <button onClick={() => { setSupplierForm({}); setShowSupplierForm(true); }}
                      className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Plus className="w-3 h-3" /> הוסף</button>
                  </div>
                  {suppliers.length === 0 ? <div className="text-xs text-muted-foreground">אין ספקים</div> :
                    suppliers.map(s => (
                      <div key={s.id} className="bg-white/5 rounded-lg p-3 mb-2">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            {s.is_preferred && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />}
                            <span className="text-sm font-medium">{s.supplier_name}</span>
                          </div>
                          <span className="font-bold text-indigo-300">{fmtC(s.unit_price)}</span>
                        </div>
                        <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                          <span>מינימום: {fmt(s.min_order_qty)}</span>
                          <span>ליד: {s.lead_time_days}d</span>
                          <span>דירוג: {s.quality_rating}/5</span>
                        </div>
                      </div>
                    ))
                  }
                </div>

                {/* Price history mini-chart */}
                <div>
                  <h4 className="font-bold text-sm mb-2">היסטוריית מחירים</h4>
                  {priceHistory.length === 0 ? <div className="text-xs text-muted-foreground">אין נתונים</div> : (
                    <div className="space-y-1">
                      {priceHistory.slice(0, 10).map((p, i) => (
                        <div key={i} className="flex justify-between text-xs bg-white/5 rounded p-2">
                          <span>{new Date(p.date).toLocaleDateString("he-IL")}</span>
                          <span className="font-mono">{fmtC(p.price)}</span>
                          <span className="text-muted-foreground">{p.source}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {priceHistory.length > 0 && (
                    <div className="mt-3 h-24 flex items-end gap-1">
                      {priceHistory.slice(0, 20).reverse().map((p, i) => {
                        const max = Math.max(...priceHistory.map((x: any) => Number(x.price)));
                        const pct = max > 0 ? (Number(p.price) / max) * 100 : 50;
                        return <div key={i} className="flex-1 bg-indigo-500/40 rounded-t hover:bg-indigo-500/60 transition-colors" style={{ height: `${pct}%` }} title={`${fmtC(p.price)} - ${p.date}`} />;
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Alerts Tab */}
      {tab === "alerts" && (
        <div className="space-y-4">
          <div className="bg-[#111118] border border-orange-500/30 rounded-xl p-5">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-orange-400" /> התראות מחיר - סטיות מעל 5%</h3>
            {priceAlerts.length === 0 ? <div className="text-center py-8 text-muted-foreground">אין התראות מחיר פעילות</div> : (
              <div className="space-y-2">
                {priceAlerts.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-colors">
                    <div>
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs text-muted-foreground">{a.item_code} | {a.category_name}</div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-left"><div className="text-xs text-muted-foreground">מחיר נוכחי</div><div className="font-bold">{fmtC(a.current_price)}</div></div>
                      <div className="text-left"><div className="text-xs text-muted-foreground">ממוצע 30</div><div>{fmtC(a.avg_price_30d)}</div></div>
                      <Badge className={Number(a.change_pct) > 0 ? "bg-red-500/20 text-red-400 text-base px-3" : "bg-green-500/20 text-green-400 text-base px-3"}>
                        {Number(a.change_pct) > 0 ? "+" : ""}{a.change_pct}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Item Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#181820] border border-white/10 rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-lg font-bold">{editing ? "עריכת פריט" : "פריט חדש"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-white/10 rounded"><X className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: "item_code", label: "קוד פריט", type: "text" },
                  { key: "name", label: "שם", type: "text" },
                  { key: "material_type", label: "סוג חומר", type: "text" },
                  { key: "profile_type", label: "סוג פרופיל", type: "text" },
                  { key: "thickness_mm", label: "עובי (מ\"מ)", type: "number" },
                  { key: "width_mm", label: "רוחב (מ\"מ)", type: "number" },
                  { key: "length_mm", label: "אורך (מ\"מ)", type: "number" },
                  { key: "weight_per_meter", label: "משקל למטר (ק\"ג)", type: "number" },
                  { key: "current_price", label: "מחיר נוכחי", type: "number" },
                  { key: "safety_stock", label: "מלאי בטחון", type: "number" },
                  { key: "reorder_point", label: "נקודת הזמנה", type: "number" },
                  { key: "lead_time_days", label: "ליד טיים (ימים)", type: "number" },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs text-muted-foreground mb-1 block">{f.label}</label>
                    <input type={f.type} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                      value={form[f.key] ?? ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
                  </div>
                ))}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">קטגוריה</label>
                  <select className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={form.category_id ?? ""} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                    <option value="">בחר קטגוריה</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">יחידה</label>
                  <select className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={form.unit ?? "kg"} onChange={e => setForm({ ...form, unit: e.target.value })}>
                    {["kg", "meter", "unit", "liter", "ton", "m2", "m3"].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">סטטוס</label>
                  <select className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={form.status ?? "active"} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="active">פעיל</option>
                    <option value="inactive">לא פעיל</option>
                    <option value="discontinued">הופסק</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">ביטול</button>
                <button onClick={saveItem} disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-sm disabled:opacity-50">
                  {saving ? "שומר..." : editing ? "עדכן" : "צור"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Supplier Form Modal */}
      <AnimatePresence>
        {showSupplierForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowSupplierForm(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#181820] border border-white/10 rounded-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-4">{supplierForm.id ? "עריכת ספק" : "ספק חדש"}</h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: "supplier_name", label: "שם ספק", type: "text" },
                  { key: "unit_price", label: "מחיר ליחידה", type: "number" },
                  { key: "min_order_qty", label: "כמות מינימום", type: "number" },
                  { key: "lead_time_days", label: "ליד טיים (ימים)", type: "number" },
                  { key: "quality_rating", label: "דירוג (1-5)", type: "number" },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs text-muted-foreground mb-1 block">{f.label}</label>
                    <input type={f.type} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                      value={supplierForm[f.key] ?? ""} onChange={e => setSupplierForm({ ...supplierForm, [f.key]: e.target.value })} />
                  </div>
                ))}
                <div className="flex items-center gap-2 mt-6">
                  <input type="checkbox" checked={supplierForm.is_preferred || false}
                    onChange={e => setSupplierForm({ ...supplierForm, is_preferred: e.target.checked })} />
                  <label className="text-sm">ספק מועדף</label>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowSupplierForm(false)} className="px-4 py-2 text-sm text-gray-400">ביטול</button>
                <button onClick={saveSupplier} disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-sm disabled:opacity-50">
                  {saving ? "שומר..." : "שמור"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
