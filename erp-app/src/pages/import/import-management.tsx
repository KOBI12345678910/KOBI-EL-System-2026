import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import {
  Ship, Search, Plus, Edit2, Trash2, X, Save, Eye, ArrowUpDown, AlertTriangle,
  Package, Truck, FileText, DollarSign, TrendingUp, Globe, Anchor, Plane,
  RefreshCw, Clock, CheckCircle2, MapPin, Container, Calculator, BarChart3,
  ChevronDown, ChevronRight, Calendar
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (n: any) => Number(n || 0).toLocaleString("he-IL");
const fmtC = (n: any, currency = "ILS") => new Intl.NumberFormat("he-IL", { style: "currency", currency, minimumFractionDigits: 0 }).format(Number(n || 0));

const ORDER_STATUSES = [
  { key: "ordered", label: "הוזמן", color: "text-blue-400", bg: "bg-blue-500/10", icon: Package },
  { key: "shipped", label: "נשלח", color: "text-cyan-400", bg: "bg-cyan-500/10", icon: Ship },
  { key: "in_customs", label: "במכס", color: "text-amber-400", bg: "bg-amber-500/10", icon: FileText },
  { key: "cleared", label: "שוחרר", color: "text-green-400", bg: "bg-green-500/10", icon: CheckCircle2 },
  { key: "received", label: "התקבל", color: "text-emerald-400", bg: "bg-emerald-500/10", icon: Container },
];
const STATUS_MAP = Object.fromEntries(ORDER_STATUSES.map(s => [s.key, s]));

const SHIP_TYPES = [
  { key: "sea", label: "ים", icon: Ship },
  { key: "air", label: "אוויר", icon: Plane },
  { key: "land", label: "יבשה", icon: Truck },
];
const INCOTERMS = ["FOB", "CIF", "EXW", "DDP", "FCA", "CFR", "CPT", "DAP"];
const CURRENCIES = ["USD", "EUR", "GBP", "CNY", "TRY", "JPY", "ILS"];
const COST_TYPES = [
  { key: "freight", label: "הובלה" },
  { key: "customs_duty", label: "מכס" },
  { key: "vat", label: "מע\"מ" },
  { key: "insurance", label: "ביטוח" },
  { key: "handling", label: "טיפול" },
  { key: "storage", label: "אחסון" },
  { key: "broker_fee", label: "עמלת סוכן" },
  { key: "transport_local", label: "הובלה מקומית" },
  { key: "other", label: "אחר" },
];

type Tab = "pipeline" | "orders" | "shipments" | "customs" | "rates";

export default function ImportManagement() {
  const [tab, setTab] = useState<Tab>("pipeline");
  const [pipeline, setPipeline] = useState<any>({});
  const [orders, setOrders] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [customs, setCustoms] = useState<any[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"order" | "shipment" | "customs" | "cost" | "rate">("order");
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [costs, setCosts] = useState<any[]>([]);
  const [landedCost, setLandedCost] = useState<any>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [pRes, oRes, sRes, cRes, rRes, dRes] = await Promise.all([
        authFetch(`${API}/import/pipeline`).catch(() => null),
        authFetch(`${API}/import/orders`),
        authFetch(`${API}/import/shipments`),
        authFetch(`${API}/import/customs`),
        authFetch(`${API}/import/exchange-rates`),
        authFetch(`${API}/import/dashboard`).catch(() => null),
      ]);
      if (pRes?.ok) setPipeline(await pRes.json());
      if (oRes.ok) setOrders(safeArray(await oRes.json()));
      if (sRes.ok) setShipments(safeArray(await sRes.json()));
      if (cRes.ok) setCustoms(safeArray(await cRes.json()));
      if (rRes.ok) setRates(safeArray(await rRes.json()));
      if (dRes?.ok) setDashboard(await dRes.json());
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const loadCosts = async (orderId: number) => {
    const res = await authFetch(`${API}/import/costs/${orderId}`);
    if (res.ok) setCosts(safeArray(await res.json()));
  };
  const calcLandedCost = async (orderId: number) => {
    const res = await authFetch(`${API}/import/orders/${orderId}/calculate-landed-cost`, { method: "POST" });
    if (res.ok) setLandedCost(await res.json());
  };

  const openCreate = (type: typeof formType) => {
    setFormType(type); setEditing(null);
    if (type === "order") setForm({ currency: "USD", incoterm: "FOB", status: "ordered" });
    else if (type === "shipment") setForm({ shipType: "sea", status: "booked" });
    else if (type === "customs") setForm({ status: "pending" });
    else if (type === "cost") setForm({ costType: "freight", currency: "ILS" });
    else setForm({ currency: "USD" });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const endpoints: Record<string, string> = { order: "import/orders", shipment: "import/shipments", customs: "import/customs", cost: "import/costs", rate: "import/exchange-rate" };
      const url = editing ? `${API}/${endpoints[formType]}/${editing.id}` : `${API}/${endpoints[formType]}`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
      if (viewDetail) { loadCosts(viewDetail.id); calcLandedCost(viewDetail.id); }
    } catch {} setSaving(false);
  };

  const remove = async (type: string, id: number) => {
    const endpoints: Record<string, string> = { order: "import/orders", shipment: "import/shipments", cost: "import/costs" };
    await authFetch(`${API}/${endpoints[type]}/${id}`, { method: "DELETE" }); load();
  };

  const kpis = [
    { label: "הזמנות פעילות", value: fmt(Number(dashboard.orders?.total || 0) - Number(dashboard.orders?.received || 0)), icon: Package, color: "text-blue-400" },
    { label: "ערך כולל (ILS)", value: fmtC(dashboard.orders?.total_value_ils || 0), icon: DollarSign, color: "text-green-400" },
    { label: "משלוחים במעבר", value: fmt(dashboard.shipments?.in_transit || 0), icon: Ship, color: "text-cyan-400" },
    { label: "מגיעים בקרוב", value: fmt((dashboard.upcoming || []).length), icon: Clock, color: "text-amber-400" },
  ];

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "pipeline", label: "צנרת יבוא", icon: TrendingUp },
    { key: "orders", label: "הזמנות", icon: Package },
    { key: "shipments", label: "משלוחים", icon: Ship },
    { key: "customs", label: "מכס", icon: FileText },
    { key: "rates", label: "שע\"ח", icon: Globe },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-white flex items-center gap-2"><Ship className="text-cyan-400 w-6 h-6" /> ניהול יבוא</h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב הזמנות יבוא, משלוחים, מכס ועלויות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={load} className="flex items-center gap-1.5 bg-card border border-border text-muted-foreground px-3 py-2 rounded-xl text-sm hover:bg-muted"><RefreshCw className="w-4 h-4" /></button>
          {tab === "orders" && <button onClick={() => openCreate("order")} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> הזמנת יבוא</button>}
          {tab === "shipments" && <button onClick={() => openCreate("shipment")} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> משלוח חדש</button>}
          {tab === "customs" && <button onClick={() => openCreate("customs")} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> הצהרת מכס</button>}
          {tab === "rates" && <button onClick={() => openCreate("rate")} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> עדכון שער</button>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-white">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-1 bg-card border border-border/50 rounded-xl p-1 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${tab === t.key ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-card border border-border/50 rounded-xl animate-pulse" />)}</div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : (
        <>
          {/* PIPELINE */}
          {tab === "pipeline" && (
            <div className="flex gap-3 overflow-x-auto pb-4">
              {ORDER_STATUSES.map(stage => {
                const items = safeArray(pipeline[stage.key] || []);
                const Icon = stage.icon;
                return (
                  <div key={stage.key} className={`flex-shrink-0 w-64 border rounded-2xl ${stage.bg} border-border/30`}>
                    <div className="p-3 border-b border-border/20">
                      <div className="flex justify-between items-center"><span className={`font-bold text-sm ${stage.color} flex items-center gap-1.5`}><Icon className="w-4 h-4" />{stage.label}</span><Badge className={`text-[10px] ${stage.bg} ${stage.color}`}>{items.length}</Badge></div>
                    </div>
                    <div className="p-2 space-y-2 min-h-[100px] max-h-[60vh] overflow-y-auto">
                      {items.map((o: any) => (
                        <div key={o.id} className="bg-card border border-border/50 rounded-xl p-3 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setViewDetail(o); loadCosts(o.id); calcLandedCost(o.id); }}>
                          <div className="font-medium text-sm text-white">{o.order_number || `#${o.id}`}</div>
                          <div className="text-xs text-muted-foreground">{o.supplier_name}</div>
                          <div className="flex justify-between items-center mt-2">
                            <span className="text-xs font-bold text-white">{fmtC(o.total_value_ils)}</span>
                            <Badge className="text-[10px] bg-muted/50 text-muted-foreground">{o.currency}</Badge>
                          </div>
                          {o.expected_arrival && <div className="text-[10px] text-muted-foreground mt-1">הגעה: {o.expected_arrival?.slice(0, 10)}</div>}
                        </div>
                      ))}
                      {items.length === 0 && <div className="text-center py-6 text-xs text-muted-foreground">אין הזמנות</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ORDERS */}
          {tab === "orders" && (
            <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border/50">
                    <tr>{["מספר הזמנה", "ספק", "מדינה", "מטבע", "ערך מט\"ח", "ערך ILS", "אינקוטרם", "סטטוס", "הגעה צפויה", "פעולות"].map(h => <th key={h} className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {orders.length === 0 ? <tr><td colSpan={99} className="text-center py-12 text-muted-foreground">אין הזמנות</td></tr> :
                      orders.map(o => {
                        const st = STATUS_MAP[o.status];
                        return (
                          <tr key={o.id} className="border-b border-border/20 hover:bg-muted/10 cursor-pointer" onClick={() => { setViewDetail(o); loadCosts(o.id); calcLandedCost(o.id); }}>
                            <td className="px-3 py-2 text-white font-medium">{o.order_number || `#${o.id}`}</td>
                            <td className="px-3 py-2">{o.supplier_name || "---"}</td>
                            <td className="px-3 py-2 text-xs">{o.supplier_country || "---"}</td>
                            <td className="px-3 py-2 text-xs">{o.currency}</td>
                            <td className="px-3 py-2 text-xs">{fmt(o.total_value_foreign)}</td>
                            <td className="px-3 py-2 text-xs font-bold">{fmtC(o.total_value_ils)}</td>
                            <td className="px-3 py-2"><Badge className="text-[10px] bg-muted/30">{o.incoterm}</Badge></td>
                            <td className="px-3 py-2"><Badge className={`text-[10px] ${st?.bg || ""} ${st?.color || ""}`}>{st?.label || o.status}</Badge></td>
                            <td className="px-3 py-2 text-xs">{o.expected_arrival?.slice(0, 10) || "---"}</td>
                            <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                              <div className="flex gap-1">
                                <button onClick={() => { setFormType("order"); setEditing(o); setForm({ orderNumber: o.order_number, supplierName: o.supplier_name, supplierCountry: o.supplier_country, currency: o.currency, totalValueForeign: o.total_value_foreign, exchangeRate: o.exchange_rate, totalValueIls: o.total_value_ils, incoterm: o.incoterm, status: o.status, expectedArrival: o.expected_arrival?.slice(0, 10), notes: o.notes }); setShowForm(true); }} className="p-1 hover:bg-muted rounded"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                                <button onClick={() => remove("order", o.id)} className="p-1 hover:bg-red-500/10 rounded"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SHIPMENTS */}
          {tab === "shipments" && (
            <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border/50">
                    <tr>{["מעקב", "הזמנה", "ספק", "מוביל", "סוג", "מוצא", "יעד", "מכולה", "סטטוס", "הגעה", "פעולות"].map(h => <th key={h} className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {shipments.length === 0 ? <tr><td colSpan={99} className="text-center py-12 text-muted-foreground">אין משלוחים</td></tr> :
                      shipments.map(sh => (
                        <tr key={sh.id} className="border-b border-border/20 hover:bg-muted/10">
                          <td className="px-3 py-2 text-white font-medium text-xs">{sh.tracking_number || "---"}</td>
                          <td className="px-3 py-2 text-xs">{sh.order_number || "---"}</td>
                          <td className="px-3 py-2 text-xs">{sh.supplier_name || "---"}</td>
                          <td className="px-3 py-2 text-xs">{sh.carrier || "---"}</td>
                          <td className="px-3 py-2"><Badge className="text-[10px] bg-muted/30">{SHIP_TYPES.find(t => t.key === sh.ship_type)?.label || sh.ship_type}</Badge></td>
                          <td className="px-3 py-2 text-xs">{sh.port_of_origin || "---"}</td>
                          <td className="px-3 py-2 text-xs">{sh.port_of_destination || "---"}</td>
                          <td className="px-3 py-2 text-xs">{sh.container_number || "---"}</td>
                          <td className="px-3 py-2"><Badge className={`text-[10px] ${sh.status === 'delivered' ? 'bg-green-500/10 text-green-400' : sh.status === 'in_transit' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-muted/30 text-muted-foreground'}`}>{sh.status}</Badge></td>
                          <td className="px-3 py-2 text-xs">{sh.arrival_date?.slice(0, 10) || "---"}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              <button onClick={() => { setFormType("shipment"); setEditing(sh); setForm({ importOrderId: sh.import_order_id, trackingNumber: sh.tracking_number, carrier: sh.carrier, shipType: sh.ship_type, portOfOrigin: sh.port_of_origin, portOfDestination: sh.port_of_destination, containerNumber: sh.container_number, departureDate: sh.departure_date?.slice(0, 10), arrivalDate: sh.arrival_date?.slice(0, 10), status: sh.status }); setShowForm(true); }} className="p-1 hover:bg-muted rounded"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                              <button onClick={() => remove("shipment", sh.id)} className="p-1 hover:bg-red-500/10 rounded"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CUSTOMS */}
          {tab === "customs" && (
            <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border/50">
                    <tr>{["הצהרה", "הזמנה", "מכולה", "סוכן מכס", "מכס", "מע\"מ", "עמלה", "סטטוס", "פעולות"].map(h => <th key={h} className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {customs.length === 0 ? <tr><td colSpan={99} className="text-center py-12 text-muted-foreground">אין רשומות מכס</td></tr> :
                      customs.map(c => (
                        <tr key={c.id} className="border-b border-border/20 hover:bg-muted/10">
                          <td className="px-3 py-2 text-white font-medium text-xs">{c.declaration_number || "---"}</td>
                          <td className="px-3 py-2 text-xs">{c.order_number || "---"}</td>
                          <td className="px-3 py-2 text-xs">{c.container_number || "---"}</td>
                          <td className="px-3 py-2 text-xs">{c.customs_broker || "---"}</td>
                          <td className="px-3 py-2 text-xs">{fmtC(c.duties_amount)}</td>
                          <td className="px-3 py-2 text-xs">{fmtC(c.vat_amount)}</td>
                          <td className="px-3 py-2 text-xs">{fmtC(c.processing_fee)}</td>
                          <td className="px-3 py-2"><Badge className={`text-[10px] ${c.status === 'cleared' ? 'bg-green-500/10 text-green-400' : c.status === 'held' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>{c.status === 'cleared' ? 'שוחרר' : c.status === 'held' ? 'מעוכב' : 'ממתין'}</Badge></td>
                          <td className="px-3 py-2">
                            <button onClick={() => { setFormType("customs"); setEditing(c); setForm({ shipmentId: c.shipment_id, customsBroker: c.customs_broker, declarationNumber: c.declaration_number, dutiesAmount: c.duties_amount, vatAmount: c.vat_amount, processingFee: c.processing_fee, status: c.status }); setShowForm(true); }} className="p-1 hover:bg-muted rounded"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* EXCHANGE RATES */}
          {tab === "rates" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {rates.map((r: any, i: number) => (
                <div key={i} className="bg-card border border-border/50 rounded-2xl p-4 text-center">
                  <div className="text-lg font-bold text-white">{r.currency}</div>
                  <div className="text-2xl font-bold text-cyan-400 mt-1">{Number(r.rate).toFixed(4)}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">{r.date?.slice(0, 10)}</div>
                </div>
              ))}
              {rates.length === 0 && <div className="col-span-full text-center py-12 text-muted-foreground">אין שערי חליפין</div>}
            </div>
          )}
        </>
      )}

      {/* ORDER DETAIL MODAL */}
      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => { setViewDetail(null); setLandedCost(null); }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center p-4 border-b border-border/50">
                <h2 className="font-bold text-white">הזמנה {viewDetail.order_number || `#${viewDetail.id}`}</h2>
                <button onClick={() => { setViewDetail(null); setLandedCost(null); }} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-muted/10 rounded-lg p-3"><div className="text-xs text-muted-foreground">ספק</div><div className="text-sm font-bold text-white">{viewDetail.supplier_name}</div></div>
                  <div className="bg-muted/10 rounded-lg p-3"><div className="text-xs text-muted-foreground">מדינה</div><div className="text-sm font-bold text-white">{viewDetail.supplier_country || "---"}</div></div>
                  <div className="bg-muted/10 rounded-lg p-3"><div className="text-xs text-muted-foreground">סטטוס</div><Badge className={`text-[10px] ${STATUS_MAP[viewDetail.status]?.bg || ""} ${STATUS_MAP[viewDetail.status]?.color || ""}`}>{STATUS_MAP[viewDetail.status]?.label || viewDetail.status}</Badge></div>
                  <div className="bg-muted/10 rounded-lg p-3"><div className="text-xs text-muted-foreground">ערך ({viewDetail.currency})</div><div className="text-sm font-bold text-white">{fmt(viewDetail.total_value_foreign)}</div></div>
                  <div className="bg-muted/10 rounded-lg p-3"><div className="text-xs text-muted-foreground">שער חליפין</div><div className="text-sm font-bold text-white">{viewDetail.exchange_rate}</div></div>
                  <div className="bg-muted/10 rounded-lg p-3"><div className="text-xs text-muted-foreground">ערך ILS</div><div className="text-sm font-bold text-cyan-400">{fmtC(viewDetail.total_value_ils)}</div></div>
                </div>

                {/* Costs */}
                <div className="border border-border/30 rounded-xl p-3">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-1"><DollarSign className="w-4 h-4 text-green-400" /> עלויות</h3>
                    <button onClick={() => { setFormType("cost"); setEditing(null); setForm({ importOrderId: viewDetail.id, costType: "freight", currency: "ILS" }); setShowForm(true); }} className="text-xs text-primary hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> הוסף עלות</button>
                  </div>
                  {costs.length === 0 ? <p className="text-xs text-muted-foreground">אין עלויות</p> :
                    <div className="space-y-1">{costs.map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between p-2 bg-muted/10 rounded-lg">
                        <div><span className="text-xs font-medium text-white">{COST_TYPES.find(t => t.key === c.cost_type)?.label || c.cost_type}</span>{c.description && <span className="text-[10px] text-muted-foreground mr-2">{c.description}</span>}</div>
                        <div className="flex items-center gap-2"><span className="text-xs font-bold text-white">{fmtC(c.amount_ils)}</span><button onClick={() => remove("cost", c.id)} className="p-0.5 hover:bg-red-500/10 rounded"><Trash2 className="w-3 h-3 text-red-400" /></button></div>
                      </div>
                    ))}</div>}
                </div>

                {/* Landed Cost */}
                {landedCost && (
                  <div className="border border-cyan-500/30 bg-cyan-500/5 rounded-xl p-3">
                    <h3 className="text-sm font-bold text-cyan-400 flex items-center gap-1 mb-2"><Calculator className="w-4 h-4" /> עלות נחיתה</h3>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><div className="text-xs text-muted-foreground">ערך מוצר</div><div className="text-sm font-bold text-white">{fmtC(landedCost.productValue)}</div></div>
                      <div><div className="text-xs text-muted-foreground">עלויות נלוות</div><div className="text-sm font-bold text-amber-400">{fmtC(landedCost.totalCosts)}</div></div>
                      <div><div className="text-xs text-muted-foreground">עלות נחיתה</div><div className="text-sm font-bold text-cyan-400">{fmtC(landedCost.landedCost)}</div></div>
                    </div>
                    <div className="text-center mt-2 text-xs text-muted-foreground">תוספת עלות: {landedCost.costPercentage}%</div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FORM MODAL */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center p-4 border-b border-border/50">
                <h2 className="font-bold text-white">{editing ? "עריכה" : "יצירה"} - {formType === "order" ? "הזמנת יבוא" : formType === "shipment" ? "משלוח" : formType === "customs" ? "מכס" : formType === "cost" ? "עלות" : "שער חליפין"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-4 space-y-3">
                {formType === "order" && (<>
                  <div><label className="text-xs text-muted-foreground">מספר הזמנה</label><input value={form.orderNumber || ""} onChange={e => setForm({ ...form, orderNumber: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">שם ספק</label><input value={form.supplierName || ""} onChange={e => setForm({ ...form, supplierName: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-muted-foreground">מדינה</label><input value={form.supplierCountry || ""} onChange={e => setForm({ ...form, supplierCountry: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground">מטבע</label><select value={form.currency || "USD"} onChange={e => setForm({ ...form, currency: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1">{CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                    <div><label className="text-xs text-muted-foreground">ערך מט"ח</label><input type="number" value={form.totalValueForeign || ""} onChange={e => setForm({ ...form, totalValueForeign: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-muted-foreground">שער חליפין</label><input type="number" step="0.0001" value={form.exchangeRate || ""} onChange={e => setForm({ ...form, exchangeRate: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">אינקוטרם</label><select value={form.incoterm || "FOB"} onChange={e => setForm({ ...form, incoterm: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1">{INCOTERMS.map(i => <option key={i} value={i}>{i}</option>)}</select></div>
                    <div><label className="text-xs text-muted-foreground">סטטוס</label><select value={form.status || "ordered"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1">{ORDER_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
                  </div>
                  <div><label className="text-xs text-muted-foreground">הגעה צפויה</label><input type="date" value={form.expectedArrival || ""} onChange={e => setForm({ ...form, expectedArrival: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  <div><label className="text-xs text-muted-foreground">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                </>)}
                {formType === "shipment" && (<>
                  <div><label className="text-xs text-muted-foreground">הזמנת יבוא</label><select value={form.importOrderId || ""} onChange={e => setForm({ ...form, importOrderId: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1"><option value="">בחר הזמנה</option>{orders.map(o => <option key={o.id} value={o.id}>{o.order_number || `#${o.id}`} - {o.supplier_name}</option>)}</select></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">מספר מעקב</label><input value={form.trackingNumber || ""} onChange={e => setForm({ ...form, trackingNumber: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-muted-foreground">מוביל</label><input value={form.carrier || ""} onChange={e => setForm({ ...form, carrier: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">סוג שילוח</label><select value={form.shipType || "sea"} onChange={e => setForm({ ...form, shipType: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1">{SHIP_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
                    <div><label className="text-xs text-muted-foreground">מכולה</label><input value={form.containerNumber || ""} onChange={e => setForm({ ...form, containerNumber: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">נמל מוצא</label><input value={form.portOfOrigin || ""} onChange={e => setForm({ ...form, portOfOrigin: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-muted-foreground">נמל יעד</label><input value={form.portOfDestination || ""} onChange={e => setForm({ ...form, portOfDestination: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">תאריך יציאה</label><input type="date" value={form.departureDate || ""} onChange={e => setForm({ ...form, departureDate: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-muted-foreground">תאריך הגעה</label><input type="date" value={form.arrivalDate || ""} onChange={e => setForm({ ...form, arrivalDate: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  </div>
                </>)}
                {formType === "customs" && (<>
                  <div><label className="text-xs text-muted-foreground">משלוח</label><select value={form.shipmentId || ""} onChange={e => setForm({ ...form, shipmentId: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1"><option value="">בחר משלוח</option>{shipments.map(sh => <option key={sh.id} value={sh.id}>{sh.tracking_number || `#${sh.id}`}</option>)}</select></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">סוכן מכס</label><input value={form.customsBroker || ""} onChange={e => setForm({ ...form, customsBroker: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-muted-foreground">מספר הצהרה</label><input value={form.declarationNumber || ""} onChange={e => setForm({ ...form, declarationNumber: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground">מכס</label><input type="number" value={form.dutiesAmount || ""} onChange={e => setForm({ ...form, dutiesAmount: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-muted-foreground">מע"מ</label><input type="number" value={form.vatAmount || ""} onChange={e => setForm({ ...form, vatAmount: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-muted-foreground">עמלה</label><input type="number" value={form.processingFee || ""} onChange={e => setForm({ ...form, processingFee: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  </div>
                  <div><label className="text-xs text-muted-foreground">סטטוס</label><select value={form.status || "pending"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1"><option value="pending">ממתין</option><option value="processing">בעיבוד</option><option value="cleared">שוחרר</option><option value="held">מעוכב</option></select></div>
                </>)}
                {formType === "cost" && (<>
                  <div><label className="text-xs text-muted-foreground">סוג עלות</label><select value={form.costType || "freight"} onChange={e => setForm({ ...form, costType: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1">{COST_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">תיאור</label><input value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">סכום</label><input type="number" value={form.amount || ""} onChange={e => setForm({ ...form, amount: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-muted-foreground">סכום ILS</label><input type="number" value={form.amountIls || ""} onChange={e => setForm({ ...form, amountIls: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  </div>
                </>)}
                {formType === "rate" && (<>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">מטבע</label><select value={form.currency || "USD"} onChange={e => setForm({ ...form, currency: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1">{CURRENCIES.filter(c => c !== 'ILS').map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                    <div><label className="text-xs text-muted-foreground">שער</label><input type="number" step="0.0001" value={form.rate || ""} onChange={e => setForm({ ...form, rate: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  </div>
                  <div><label className="text-xs text-muted-foreground">תאריך</label><input type="date" value={form.date || ""} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                </>)}
              </div>
              <div className="flex justify-end gap-2 p-4 border-t border-border/50">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg">ביטול</button>
                <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"><Save className="w-4 h-4" />{saving ? "שומר..." : "שמור"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
