import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  List, Search, Plus, Edit2, Trash2, X, Save, Eye, ArrowUpDown,
  AlertTriangle, DollarSign, Package, CheckCircle2, Tag, Clock,
  Percent, Users, TrendingDown, Calendar, Zap
} from "lucide-react";
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
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-muted/20 text-muted-foreground" },
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  expired: { label: "פג תוקף", color: "bg-red-500/20 text-red-400" },
  scheduled: { label: "מתוכנן", color: "bg-blue-500/20 text-blue-400" },
  archived: { label: "בארכיון", color: "bg-yellow-500/20 text-yellow-400" },
};

const currencyMap: Record<string, string> = {
  ILS: "₪ שקל", USD: "$ דולר", EUR: "€ אירו", GBP: "£ ליש\"ט",
};

type Tab = "price-lists" | "customer-prices" | "volume-tiers" | "promotions";

export default function PriceListsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [activeTab, setActiveTab] = useState<Tab>("price-lists");

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCurrency, setFilterCurrency] = useState("all");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);
  const [detailTab, setDetailTab] = useState("details");
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const { errors, validate, clearErrors } = useFormValidation<any>({
    name: { required: true, minLength: 2, message: "שם מחירון חובה" },
  });

  // Customer-specific prices
  const [custPrices, setCustPrices] = useState<any[]>([]);
  const [custPriceForm, setCustPriceForm] = useState<any>({});
  const [showCustPriceForm, setShowCustPriceForm] = useState(false);
  const [editingCustPrice, setEditingCustPrice] = useState<any>(null);

  // Volume tiers
  const [volTiers, setVolTiers] = useState<any[]>([]);
  const [volTierForm, setVolTierForm] = useState<any>({});
  const [showVolTierForm, setShowVolTierForm] = useState(false);
  const [editingVolTier, setEditingVolTier] = useState<any>(null);

  // Promotions
  const [promos, setPromos] = useState<any[]>([]);
  const [promoForm, setPromoForm] = useState<any>({});
  const [showPromoForm, setShowPromoForm] = useState(false);
  const [editingPromo, setEditingPromo] = useState<any>(null);

  const today = new Date().toISOString().slice(0, 10);

  const loadAll = async () => {
    setLoading(true); setError(null);
    try {
      const [pl, cp, vt, pr] = await Promise.all([
        authFetch(`${API}/pricing/price-lists`).then(r => r.json()).catch(() => []),
        authFetch(`${API}/quote-builder/customer-prices`).then(r => r.json()).catch(() => []),
        authFetch(`${API}/quote-builder/volume-tiers`).then(r => r.json()).catch(() => []),
        authFetch(`${API}/quote-builder/promotions`).then(r => r.json()).catch(() => []),
      ]);
      setItems(safeArray(pl));
      setCustPrices(Array.isArray(cp) ? cp : []);
      setVolTiers(Array.isArray(vt) ? vt : []);
      setPromos(Array.isArray(pr) ? pr : []);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { loadAll(); }, []);

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterCurrency === "all" || i.currency === filterCurrency) &&
      (!search || [i.name, i.list_number, i.description, i.currency]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterCurrency, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ status: "draft", currency: "ILS", effective_date: today });
    setShowForm(true);
  };
  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ ...r, effective_date: r.effective_date?.slice(0, 10), expiry_date: r.expiry_date?.slice(0, 10) });
    setShowForm(true);
  };
  const save = async () => {
    if (!validate(form)) return;
    setSaving(true);
    try {
      const url = editing ? `${API}/pricing/price-lists/${editing.id}` : `${API}/pricing/price-lists`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false);
      loadAll();
    } catch {}
    setSaving(false);
  };
  const remove = async (id: number) => {
    if (await globalConfirm("למחוק מחירון זה?")) {
      await authFetch(`${API}/pricing/price-lists/${id}`, { method: "DELETE" });
      loadAll();
    }
  };

  // Customer price CRUD
  const saveCustPrice = async () => {
    setSaving(true);
    try {
      const url = editingCustPrice ? `${API}/quote-builder/customer-prices/${editingCustPrice.id}` : `${API}/quote-builder/customer-prices`;
      await authFetch(url, { method: editingCustPrice ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(custPriceForm) });
      setShowCustPriceForm(false);
      loadAll();
    } catch {}
    setSaving(false);
  };

  // Volume tier CRUD
  const saveVolTier = async () => {
    setSaving(true);
    try {
      const url = editingVolTier ? `${API}/quote-builder/volume-tiers/${editingVolTier.id}` : `${API}/quote-builder/volume-tiers`;
      await authFetch(url, { method: editingVolTier ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(volTierForm) });
      setShowVolTierForm(false);
      loadAll();
    } catch {}
    setSaving(false);
  };

  // Promo CRUD
  const savePromo = async () => {
    setSaving(true);
    try {
      const url = editingPromo ? `${API}/quote-builder/promotions/${editingPromo.id}` : `${API}/quote-builder/promotions`;
      await authFetch(url, { method: editingPromo ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(promoForm) });
      setShowPromoForm(false);
      loadAll();
    } catch {}
    setSaving(false);
  };

  const kpis = [
    { label: 'מחירונים', value: fmt(items.length), icon: List, color: "text-blue-400" },
    { label: "מחירי לקוח", value: fmt(custPrices.length), icon: Users, color: "text-purple-400" },
    { label: "רמות נפח", value: fmt(volTiers.length), icon: TrendingDown, color: "text-cyan-400" },
    { label: "מבצעים פעילים", value: fmt(promos.filter(p => p.is_active && p.valid_from <= today && p.valid_until >= today).length), icon: Zap, color: "text-amber-400" },
  ];

  const tabs = [
    { id: "price-lists" as Tab, label: "מחירונים", icon: List, count: items.length },
    { id: "customer-prices" as Tab, label: "מחירי לקוח", icon: Users, count: custPrices.length },
    { id: "volume-tiers" as Tab, label: "הנחות נפח", icon: TrendingDown, count: volTiers.length },
    { id: "promotions" as Tab, label: "מבצעים", icon: Zap, count: promos.length },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <List className="text-indigo-400 w-6 h-6" />
            ניהול מחירים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מחירונים, מחירי לקוח, הנחות נפח ומבצעים</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} />
            <div className="text-xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/50">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="w-4 h-4" />
            {t.label}
            <span className="text-xs bg-muted/40 px-1.5 py-0.5 rounded-full">{t.count}</span>
          </button>
        ))}
      </div>

      {/* PRICE LISTS TAB */}
      {activeTab === "price-lists" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex gap-3 flex-wrap items-center">
              <div className="relative min-w-[200px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..."
                  className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
                <option value="all">כל הסטטוסים</option>
                {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <ExportDropdown data={filtered} headers={{ name: "שם", list_number: "מספר", items_count: "פריטים", currency: "מטבע", effective_date: "תחילה", expiry_date: "תפוגה", status: "סטטוס" }} filename="price_lists" />
              <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 text-sm font-medium">
                <Plus className="w-4 h-4" /> מחירון חדש
              </button>
            </div>
          </div>

          {loading ? (
            <div className="h-32 bg-muted/20 rounded-xl animate-pulse" />
          ) : (
            <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border/50">
                    <tr>
                      {[["list_number", "מספר"], ["name", "שם"], ["items_count", "פריטים"], ["currency", "מטבע"], ["effective_date", "תחילה"], ["expiry_date", "תפוגה"], ["discount", "הנחה%"], ["status", "סטטוס"]].map(([key, label]) => (
                        <th key={key} onClick={() => toggleSort(key)}
                          className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                          <div className="flex items-center gap-1">{label}<ArrowUpDown className="w-3 h-3" /></div>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagination.paginate(filtered).map(r => (
                      <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-indigo-400 font-bold">{r.list_number || "—"}</td>
                        <td className="px-4 py-3 text-foreground font-medium">{r.name || "—"}</td>
                        <td className="px-4 py-3 text-foreground">{r.items_count || 0}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.currency || "ILS"}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{r.effective_date?.slice(0, 10) || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{r.expiry_date?.slice(0, 10) || "—"}</td>
                        <td className="px-4 py-3 text-purple-400">{r.discount ? `${r.discount}%` : "—"}</td>
                        <td className="px-4 py-3">
                          <Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>
                            {statusMap[r.status]?.label || r.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                            <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                            {isSuperAdmin && <button onClick={async () => { if (await globalConfirm("למחוק?")) remove(r.id); }} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">אין מחירונים</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <SmartPagination pagination={pagination} />
        </div>
      )}

      {/* CUSTOMER PRICES TAB */}
      {activeTab === "customer-prices" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">מחירים ספציפיים לפי לקוח — עדיפות גבוהה ביותר במנגנון פתרון המחיר</p>
            <button onClick={() => { setEditingCustPrice(null); setCustPriceForm({ currency: "ILS" }); setShowCustPriceForm(true); }}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 text-sm font-medium">
              <Plus className="w-4 h-4" /> מחיר לקוח חדש
            </button>
          </div>

          <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  {["לקוח", "מוצר", "מחיר", "מטבע", "תחילה", "תפוגה", "הערות", "פעולות"].map(h => (
                    <th key={h} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {custPrices.map(r => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20">
                    <td className="px-4 py-3 text-foreground font-medium">{r.customer_name || `#${r.customer_id}`}</td>
                    <td className="px-4 py-3 text-foreground">{r.product_name}</td>
                    <td className="px-4 py-3 text-purple-400 font-mono">{fmtC(Number(r.price))}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.currency}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.valid_from?.slice(0, 10) || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.valid_until?.slice(0, 10) || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.notes || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => { setEditingCustPrice(r); setCustPriceForm({ ...r, validFrom: r.valid_from?.slice(0, 10), validUntil: r.valid_until?.slice(0, 10) }); setShowCustPriceForm(true); }} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                        {isSuperAdmin && <button onClick={async () => { if (await globalConfirm("למחוק?")) { await authFetch(`${API}/quote-builder/customer-prices/${r.id}`, { method: "DELETE" }); loadAll(); } }} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {custPrices.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">אין מחירי לקוח — <span className="text-blue-400 cursor-pointer" onClick={() => { setEditingCustPrice(null); setCustPriceForm({ currency: "ILS" }); setShowCustPriceForm(true); }}>הוסף ראשון</span></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VOLUME TIERS TAB */}
      {activeTab === "volume-tiers" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">הנחות לפי כמות — לדוגמה: 100+ יח' = 10% הנחה</p>
            <button onClick={() => { setEditingVolTier(null); setVolTierForm({ discountPercent: 0, currency: "ILS" }); setShowVolTierForm(true); }}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 text-sm font-medium">
              <Plus className="w-4 h-4" /> רמת נפח חדשה
            </button>
          </div>

          <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  {["מוצר", "כמות מינימלית", "כמות מקסימלית", "הנחה %", "מחיר קבוע", "פעולות"].map(h => (
                    <th key={h} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {volTiers.map(r => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20">
                    <td className="px-4 py-3 text-foreground">{r.product_name || "כל המוצרים"}</td>
                    <td className="px-4 py-3 text-cyan-400 font-mono">{r.min_quantity}+</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.max_quantity || "ללא גבול"}</td>
                    <td className="px-4 py-3 text-green-400 font-bold">{r.discount_percent}%</td>
                    <td className="px-4 py-3 text-purple-400">{r.fixed_price ? fmtC(Number(r.fixed_price)) : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => { setEditingVolTier(r); setVolTierForm({ ...r }); setShowVolTierForm(true); }} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                        {isSuperAdmin && <button onClick={async () => { if (await globalConfirm("למחוק?")) { await authFetch(`${API}/quote-builder/volume-tiers/${r.id}`, { method: "DELETE" }); loadAll(); } }} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {volTiers.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">אין רמות נפח</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PROMOTIONS TAB */}
      {activeTab === "promotions" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">מחירי מבצע מוגבלים בזמן עם תאריכי תחילה וסיום</p>
            <button onClick={() => { setEditingPromo(null); setPromoForm({ discountPercent: 0, currency: "ILS", isActive: true, priority: 0, validFrom: today, validUntil: today }); setShowPromoForm(true); }}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 text-sm font-medium">
              <Plus className="w-4 h-4" /> מבצע חדש
            </button>
          </div>

          <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  {["שם המבצע", "מוצר", "הנחה %", "מחיר קבוע", "תחילה", "סיום", "עדיפות", "סטטוס", "פעולות"].map(h => (
                    <th key={h} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {promos.map(r => {
                  const isActive = r.is_active && r.valid_from <= today && r.valid_until >= today;
                  return (
                    <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20">
                      <td className="px-4 py-3 text-foreground font-medium">{r.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.product_name || "כל המוצרים"}</td>
                      <td className="px-4 py-3 text-amber-400 font-bold">{r.discount_percent}%</td>
                      <td className="px-4 py-3 text-purple-400">{r.fixed_price ? fmtC(Number(r.fixed_price)) : "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{r.valid_from?.slice(0, 10)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{r.valid_until?.slice(0, 10)}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{r.priority}</td>
                      <td className="px-4 py-3">
                        <Badge className={isActive ? "bg-green-500/20 text-green-400" : "bg-muted/20 text-muted-foreground"}>
                          {isActive ? "פעיל" : "לא פעיל"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => { setEditingPromo(r); setPromoForm({ ...r, validFrom: r.valid_from?.slice(0, 10), validUntil: r.valid_until?.slice(0, 10) }); setShowPromoForm(true); }} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                          {isSuperAdmin && <button onClick={async () => { if (await globalConfirm("למחוק?")) { await authFetch(`${API}/quote-builder/promotions/${r.id}`, { method: "DELETE" }); loadAll(); } }} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {promos.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">אין מבצעים</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PRICE LIST FORM MODAL */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת מחירון" : "מחירון חדש"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם מחירון *</label>
                    <input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="שם המחירון" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">מטבע</label>
                    <select value={form.currency || "ILS"} onChange={e => setForm({ ...form, currency: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(currencyMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">הנחה כללית (%)</label>
                    <input type="number" value={form.discount || ""} onChange={e => setForm({ ...form, discount: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך תחילה</label>
                    <input type="date" value={form.effective_date || ""} onChange={e => setForm({ ...form, effective_date: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך תפוגה</label>
                    <input type="date" value={form.expiry_date || ""} onChange={e => setForm({ ...form, expiry_date: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                    <select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">לקוח/קבוצה</label>
                    <input value={form.customer_group || ""} onChange={e => setForm({ ...form, customer_group: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="קבוצת לקוחות" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור</label>
                    <textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={2}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">
                  <Save className="w-3.5 h-3.5 inline ml-1" /> {editing ? "עדכון" : "שמירה"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CUSTOMER PRICE FORM */}
      <AnimatePresence>
        {showCustPriceForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCustPriceForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editingCustPrice ? "עריכת מחיר לקוח" : "מחיר לקוח חדש"}</h2>
                <button onClick={() => setShowCustPriceForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1">שם לקוח</label>
                  <input value={custPriceForm.customerName || ""} onChange={e => setCustPriceForm({ ...custPriceForm, customerName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1">שם מוצר *</label>
                  <input value={custPriceForm.productName || ""} onChange={e => setCustPriceForm({ ...custPriceForm, productName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1">מחיר *</label>
                  <input type="number" value={custPriceForm.price || ""} onChange={e => setCustPriceForm({ ...custPriceForm, price: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1">מטבע</label>
                  <select value={custPriceForm.currency || "ILS"} onChange={e => setCustPriceForm({ ...custPriceForm, currency: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(currencyMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1">תחילת תוקף</label>
                  <input type="date" value={custPriceForm.validFrom || ""} onChange={e => setCustPriceForm({ ...custPriceForm, validFrom: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1">תפוגה</label>
                  <input type="date" value={custPriceForm.validUntil || ""} onChange={e => setCustPriceForm({ ...custPriceForm, validUntil: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1">הערות</label>
                  <input value={custPriceForm.notes || ""} onChange={e => setCustPriceForm({ ...custPriceForm, notes: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowCustPriceForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={saveCustPrice} disabled={saving} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm">{editingCustPrice ? "עדכון" : "שמירה"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* VOLUME TIER FORM */}
      <AnimatePresence>
        {showVolTierForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowVolTierForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editingVolTier ? "עריכת רמת נפח" : "רמת נפח חדשה"}</h2>
                <button onClick={() => setShowVolTierForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1">שם מוצר (ריק = כל המוצרים)</label>
                  <input value={volTierForm.productName || ""} onChange={e => setVolTierForm({ ...volTierForm, productName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="השאר ריק לכל המוצרים" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1">כמות מינימלית *</label>
                  <input type="number" value={volTierForm.minQuantity || ""} onChange={e => setVolTierForm({ ...volTierForm, minQuantity: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1">כמות מקסימלית</label>
                  <input type="number" value={volTierForm.maxQuantity || ""} onChange={e => setVolTierForm({ ...volTierForm, maxQuantity: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="ללא גבול" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1">הנחה %</label>
                  <input type="number" value={volTierForm.discountPercent || ""} onChange={e => setVolTierForm({ ...volTierForm, discountPercent: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1">מחיר קבוע (חלופה להנחה)</label>
                  <input type="number" value={volTierForm.fixedPrice || ""} onChange={e => setVolTierForm({ ...volTierForm, fixedPrice: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1">הערות</label>
                  <input value={volTierForm.notes || ""} onChange={e => setVolTierForm({ ...volTierForm, notes: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowVolTierForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={saveVolTier} disabled={saving} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm">{editingVolTier ? "עדכון" : "שמירה"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PROMO FORM */}
      <AnimatePresence>
        {showPromoForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowPromoForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editingPromo ? "עריכת מבצע" : "מבצע חדש"}</h2>
                <button onClick={() => setShowPromoForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1">שם המבצע *</label>
                  <input value={promoForm.name || ""} onChange={e => setPromoForm({ ...promoForm, name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1">מוצר (ריק = כל המוצרים)</label>
                  <input value={promoForm.productName || ""} onChange={e => setPromoForm({ ...promoForm, productName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="השאר ריק לכל המוצרים" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1">הנחה %</label>
                  <input type="number" value={promoForm.discountPercent || ""} onChange={e => setPromoForm({ ...promoForm, discountPercent: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1">מחיר קבוע</label>
                  <input type="number" value={promoForm.fixedPrice || ""} onChange={e => setPromoForm({ ...promoForm, fixedPrice: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1">תחילה *</label>
                  <input type="date" value={promoForm.validFrom || ""} onChange={e => setPromoForm({ ...promoForm, validFrom: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1">סיום *</label>
                  <input type="date" value={promoForm.validUntil || ""} onChange={e => setPromoForm({ ...promoForm, validUntil: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1">עדיפות (גבוה = עדיף)</label>
                  <input type="number" value={promoForm.priority || 0} onChange={e => setPromoForm({ ...promoForm, priority: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="flex items-center gap-2 mt-4">
                  <input type="checkbox" checked={promoForm.isActive !== false} onChange={e => setPromoForm({ ...promoForm, isActive: e.target.checked })} className="w-4 h-4" />
                  <label className="text-sm text-muted-foreground">מבצע פעיל</label>
                </div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1">הערות</label>
                  <input value={promoForm.notes || ""} onChange={e => setPromoForm({ ...promoForm, notes: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowPromoForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={savePromo} disabled={saving} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm">{editingPromo ? "עדכון" : "שמירה"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PRICE LIST DETAIL VIEW */}
      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setViewDetail(null); setDetailTab("details"); }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <List className="w-5 h-5 text-indigo-400" />{viewDetail.name}
                </h2>
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{ key: "details", label: "פרטים" }, { key: "history", label: "היסטוריה" }].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <div className="p-5 grid grid-cols-2 gap-4">
                  <DetailField label="שם מחירון" value={viewDetail.name} />
                  <DetailField label="מספר" value={viewDetail.list_number} />
                  <DetailField label="מספר פריטים" value={String(viewDetail.items_count || 0)} />
                  <DetailField label="מטבע" value={viewDetail.currency} />
                  <DetailField label="תאריך תחילה" value={viewDetail.effective_date?.slice(0, 10)} />
                  <DetailField label="תאריך תפוגה" value={viewDetail.expiry_date?.slice(0, 10)} />
                  <DetailField label="הנחה כללית" value={viewDetail.discount ? `${viewDetail.discount}%` : undefined} />
                  <DetailField label="סטטוס">
                    <Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge>
                  </DetailField>
                  <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
                </div>
              )}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="price-list" entityId={viewDetail.id} /></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30">
                  <Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה
                </button>
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
