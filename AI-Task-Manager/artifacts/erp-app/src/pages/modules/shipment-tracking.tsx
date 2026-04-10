import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ship, Globe, DollarSign, Calendar, AlertTriangle, CheckCircle2,
  Search, Plus, Edit2, Trash2, X, Save, Eye, Anchor,
  Package, Clock, Hash, Phone, Mail, Plane, Truck,
  MapPin, Navigation, Container, FileText, Bell, ArrowRight, Copy
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Printer, Send } from "lucide-react";
import ExportDropdown from "@/components/export-dropdown";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";

interface Shipment {
  id: number;
  shipmentNumber: string;
  importOrderId: number | null;
  carrierName: string | null;
  carrierType: string;
  trackingNumber: string | null;
  bookingNumber: string | null;
  vesselName: string | null;
  voyageNumber: string | null;
  originPort: string | null;
  destinationPort: string;
  originCountry: string | null;
  etd: string | null;
  eta: string | null;
  actualDeparture: string | null;
  actualArrival: string | null;
  containerNumber: string | null;
  containerType: string | null;
  containerCount: number;
  sealNumber: string | null;
  billOfLading: string | null;
  goodsDescription: string | null;
  weightKg: string | null;
  volumeCbm: string | null;
  packagesCount: number | null;
  freightCost: string;
  freightCurrency: string;
  insuranceValue: string;
  goodsValue: string;
  supplierName: string | null;
  consignee: string | null;
  notifyParty: string | null;
  forwardingAgent: string | null;
  agentPhone: string | null;
  agentEmail: string | null;
  customsBroker: string | null;
  currentLocation: string | null;
  lastUpdateDate: string | null;
  delayDays: number;
  delayReason: string | null;
  notes: string | null;
  status: string;
  priority: string;
  createdAt: string;
}

interface StatusUpdate {
  id: number;
  shipmentId: number;
  status: string;
  location: string | null;
  description: string | null;
  updateDate: string;
  updatedBy: string | null;
}

const STATUSES = ["הוזמן", "ממתין לאיסוף", "נאסף", "בנמל מוצא", "על הספינה", "במעבר", "בנמל יעד", "בשחרור מכס", "שוחרר", "נמסר"];
const CARRIER_TYPES = [
  { value: "sea", label: "ים", icon: Ship },
  { value: "air", label: "אוויר", icon: Plane },
  { value: "land", label: "יבשה", icon: Truck },
];
const PRIORITIES = ["רגילה", "גבוהה", "דחופה"];
const CONTAINER_TYPES = ["20' Dry", "40' Dry", "40' HC", "20' Reefer", "40' Reefer", "Open Top", "Flat Rack"];
const PORTS = ["חיפה", "אשדוד", "נתב\"ג - מטען", "אילת"];

const STATUS_COLORS: Record<string, string> = {
  "הוזמן": "bg-muted/50 text-foreground",
  "ממתין לאיסוף": "bg-blue-100 text-blue-800",
  "נאסף": "bg-indigo-100 text-indigo-800",
  "בנמל מוצא": "bg-cyan-100 text-cyan-800",
  "על הספינה": "bg-teal-100 text-teal-800",
  "במעבר": "bg-yellow-100 text-yellow-800",
  "בנמל יעד": "bg-orange-100 text-orange-800",
  "בשחרור מכס": "bg-purple-100 text-purple-800",
  "שוחרר": "bg-green-100 text-green-800",
  "נמסר": "bg-emerald-100 text-emerald-800",
};

const STATUS_STEP: Record<string, number> = {
  "הוזמן": 0, "ממתין לאיסוף": 1, "נאסף": 2, "בנמל מוצא": 3,
  "על הספינה": 4, "במעבר": 5, "בנמל יעד": 6, "בשחרור מכס": 7, "שוחרר": 8, "נמסר": 9,
};

const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtCur = (v: any, c = "$") => `${c}${fmt(v)}`;
const daysDiff = (d: string | null) => {
  if (!d) return null;
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diff;
};

const emptyForm: Partial<Shipment> = {
  shipmentNumber: "", importOrderId: null, carrierName: "", carrierType: "sea",
  trackingNumber: "", bookingNumber: "", vesselName: "", voyageNumber: "",
  originPort: "", destinationPort: "חיפה", originCountry: "",
  etd: "", eta: "", actualDeparture: "", actualArrival: "",
  containerNumber: "", containerType: "40' Dry", containerCount: 1, sealNumber: "",
  billOfLading: "", goodsDescription: "", weightKg: "", volumeCbm: "", packagesCount: null,
  freightCost: "0", freightCurrency: "USD", insuranceValue: "0", goodsValue: "0",
  supplierName: "", consignee: "", notifyParty: "", forwardingAgent: "",
  agentPhone: "", agentEmail: "", customsBroker: "", currentLocation: "",
  delayDays: 0, delayReason: "", notes: "", status: "הוזמן", priority: "רגילה",
};


const load: any[] = [];
export default function ShipmentTrackingPage() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "list" | "timeline" | "delays">("dashboard");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Shipment | null>(null);
  const [detailItem, setDetailItem] = useState<Shipment | null>(null);
  const [formData, setFormData] = useState<any>({ ...emptyForm });
  const [searchTerm, setSearchTerm] = useState("");
  const [timelineShipment, setTimelineShipment] = useState<Shipment | null>(null);
  const [newUpdate, setNewUpdate] = useState({ status: "", location: "", description: "", updatedBy: "" });
  const [detailTab, setDetailTab] = useState("details");
  const qc = useQueryClient();
  const { selectedIds, toggle, toggleAll, clear, isSelected, isAllSelected } = useBulkSelection();

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["shipment-tracking"],
    queryFn: () => authFetch(`${API}/shipment-tracking`).then(r => r.json()),
  });
  const shipments: Shipment[] = useMemo(() => safeArray(rawData), [rawData]);

  const { data: rawUpdates } = useQuery({
    queryKey: ["shipment-updates", timelineShipment?.id],
    queryFn: () => timelineShipment ? authFetch(`${API}/shipment-tracking/${timelineShipment.id}/updates`).then(r => r.json()) : Promise.resolve([]),
    enabled: !!timelineShipment,
  });
  const updates: StatusUpdate[] = useMemo(() => safeArray(rawUpdates), [rawUpdates]);

  const createMut = useMutation({
    mutationFn: (d: any) => authFetch(`${API}/shipment-tracking`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shipment-tracking"] }); setShowForm(false); },
  });
  const updateMut = useMutation({
    mutationFn: (d: any) => authFetch(`${API}/shipment-tracking/${d.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shipment-tracking"] }); setShowForm(false); setEditItem(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/shipment-tracking/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shipment-tracking"] }); },
  });
  const addUpdateMut = useMutation({
    mutationFn: (d: any) => authFetch(`${API}/shipment-tracking/${d.shipmentId}/updates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shipment-updates"] }); setNewUpdate({ status: "", location: "", description: "", updatedBy: "" }); },
  });

  const openCreate = () => { setFormData({ ...emptyForm }); setEditItem(null); setShowForm(true); };
  const openEdit = (s: Shipment) => { setFormData({ ...s }); setEditItem(s); setShowForm(true); };
  const handleSave = () => {
    const d = { ...formData };
    if (editItem) { d.id = editItem.id; updateMut.mutate(d); }
    else createMut.mutate(d);
  };

  const filtered = useMemo(() => {
    if (!searchTerm) return shipments;
    const s = searchTerm.toLowerCase();
    return shipments.filter(sh =>
      sh.shipmentNumber?.toLowerCase().includes(s) ||
      sh.trackingNumber?.toLowerCase().includes(s) ||
      sh.carrierName?.toLowerCase().includes(s) ||
      sh.supplierName?.toLowerCase().includes(s) ||
      sh.containerNumber?.toLowerCase().includes(s) ||
      sh.vesselName?.toLowerCase().includes(s)
    );
  }, [shipments, searchTerm]);

  const total = shipments.length;
  const active = shipments.filter(s => !["נמסר", "שוחרר"].includes(s.status)).length;
  const inTransit = shipments.filter(s => ["על הספינה", "במעבר"].includes(s.status)).length;
  const atPort = shipments.filter(s => ["בנמל יעד", "בשחרור מכס"].includes(s.status)).length;
  const delivered = shipments.filter(s => s.status === "נמסר").length;
  const delayed = shipments.filter(s => {
    const d = daysDiff(s.eta);
    return d !== null && d < 0 && !["נמסר", "שוחרר"].includes(s.status);
  }).length;
  const totalFreight = shipments.reduce((sum, s) => sum + Number(s.freightCost || 0), 0);
  const totalGoods = shipments.reduce((sum, s) => sum + Number(s.goodsValue || 0), 0);

  const carrierDist = CARRIER_TYPES.map(ct => ({
    ...ct, count: shipments.filter(s => s.carrierType === ct.value).length,
  }));

  const statusPipeline = STATUSES.map(st => ({
    status: st, count: shipments.filter(s => s.status === st).length,
  }));

  const delayedShipments = shipments.filter(s => {
    const d = daysDiff(s.eta);
    return (d !== null && d < 0 && !["נמסר", "שוחרר"].includes(s.status)) || (s.delayDays && s.delayDays > 0);
  }).sort((a, b) => {
    const da = daysDiff(a.eta) || 0;
    const db = daysDiff(b.eta) || 0;
    return da - db;
  });

  const kpis = [
    { label: "סה\"כ משלוחים", value: total, icon: Package, color: "blue" },
    { label: "פעילים", value: active, icon: Clock, color: "orange" },
    { label: "בדרך", value: inTransit, icon: Ship, color: "teal" },
    { label: "בנמל/מכס", value: atPort, icon: Anchor, color: "purple" },
    { label: "נמסרו", value: delivered, icon: CheckCircle2, color: "green" },
    { label: "באיחור", value: delayed, icon: AlertTriangle, color: "red" },
    { label: "הובלה", value: fmtCur(totalFreight), icon: DollarSign, color: "indigo" },
    { label: "ערך סחורה", value: fmtCur(totalGoods), icon: Globe, color: "cyan" },
  ];

  const TABS = [
    { key: "dashboard" as const, label: "לוח בקרה", icon: Navigation },
    { key: "list" as const, label: "רשימת משלוחים", icon: Package },
    { key: "timeline" as const, label: "ציר זמן", icon: Clock },
    { key: "delays" as const, label: "התראות עיכוב", icon: AlertTriangle },
  ];

  const CarrierIcon = ({ type }: { type: string }) => {
    const ct = CARRIER_TYPES.find(c => c.value === type);
    if (!ct) return <Package size={16} />;
    return <ct.icon size={16} />;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-cyan-50" dir="rtl">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <Ship className="text-cyan-600" /> מעקב משלוחים
            </h1>
            <p className="text-muted-foreground mt-1">מעקב משלוחי יבוא, מובילים וציר זמן סטטוס</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <ExportDropdown data={shipments} headers={{ shipmentNumber: "מספר משלוח", status: "סטטוס", carrierName: "מוביל", trackingNumber: "מספר מעקב", originPort: "נמל מוצא", destinationPort: "נמל יעד", etd: "ETD", eta: "ETA", actualArrival: "הגעה בפועל", containerNumber: "מכולה", shippingMethod: "שיטת הובלה", vesselName: "שם כלי שיט", goodsDescription: "תיאור סחורה", totalWeight: "משקל", totalVolume: "נפח" }} filename={"shipments"} />
            <button onClick={() => printPage("מעקב משלוחים")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm">
              <Printer size={16} /> הדפסה
            </button>
            <button onClick={() => sendByEmail("מעקב משלוחים - טכנו-כל עוזי", generateEmailBody("מעקב משלוחים", shipments, { shipmentNumber: "מספר משלוח", status: "סטטוס", carrierName: "מוביל", originPort: "נמל מוצא", destinationPort: "נמל יעד", eta: "ETA" }))} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm">
              <Send size={16} /> שליחה
            </button>
            <button onClick={openCreate} className="flex items-center gap-2 bg-cyan-600 text-foreground px-3 py-2 rounded-lg hover:bg-cyan-700 shadow-lg text-sm">
              <Plus size={16} /> משלוח חדש
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {kpis.map((kpi, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-card rounded-xl p-3 shadow-sm border border-slate-100 text-center">
              <kpi.icon size={20} className={`mx-auto mb-1 text-${kpi.color}-500`} />
              <div className="text-lg font-bold text-foreground">{kpi.value}</div>
              <div className="text-xs text-muted-foreground">{kpi.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-card rounded-xl p-1 shadow-sm border border-slate-100">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.key ? "bg-cyan-600 text-foreground shadow-md" : "text-muted-foreground hover:bg-muted/30"}`}>
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600 mx-auto mb-3"></div>
            <p className="text-muted-foreground">טוען נתונים...</p>
          </div>
        ) : (
          <>
            {/* Dashboard */}
            {activeTab === "dashboard" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Status Pipeline */}
                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100 md:col-span-2">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Navigation size={18} /> צינור משלוחים — 10 שלבים</h3>
                  <div className="flex gap-1 overflow-x-auto pb-2">
                    {statusPipeline.map((step, i) => (
                      <div key={i} className="flex items-center min-w-0">
                        <div className={`text-center px-3 py-3 rounded-xl border ${step.count > 0 ? "border-cyan-300 bg-cyan-50" : "border-border bg-muted/30"} min-w-[85px]`}>
                          <div className={`text-xl font-bold ${step.count > 0 ? "text-cyan-700" : "text-muted-foreground"}`}>{step.count}</div>
                          <div className="text-[10px] text-muted-foreground whitespace-nowrap">{step.status}</div>
                        </div>
                        {i < statusPipeline.length - 1 && <ArrowRight size={14} className="text-slate-300 mx-0.5 flex-shrink-0" />}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Carrier Distribution */}
                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Truck size={18} /> שיטת הובלה</h3>
                  <div className="space-y-3">
                    {carrierDist.map(ct => (
                      <div key={ct.value} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                        <ct.icon size={24} className="text-cyan-600" />
                        <div className="flex-1">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-medium text-foreground">{ct.label}</span>
                            <span className="font-bold text-foreground">{ct.count}</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div className="bg-cyan-500 h-2 rounded-full transition-all" style={{ width: `${total > 0 ? (ct.count / total) * 100 : 0}%` }}></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Active Shipments Map-like view */}
                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><MapPin size={18} /> משלוחים פעילים</h3>
                  {shipments.filter(s => !["נמסר", "שוחרר"].includes(s.status)).length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">אין משלוחים פעילים</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {shipments.filter(s => !["נמסר", "שוחרר"].includes(s.status)).slice(0, 10).map(s => {
                        const d = daysDiff(s.eta);
                        return (
                          <div key={s.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg text-sm">
                            <CarrierIcon type={s.carrierType} />
                            <span className="font-bold text-cyan-700">{s.shipmentNumber}</span>
                            <span className="text-muted-foreground">|</span>
                            <span className="text-muted-foreground truncate flex-1">{s.originPort || "?"} → {s.destinationPort}</span>
                            {d !== null && (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d < 0 ? "bg-red-100 text-red-700" : d <= 3 ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
                                {d < 0 ? `איחור ${Math.abs(d)} ימים` : d === 0 ? "היום" : `${d} ימים`}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Recent arrivals */}
                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100 md:col-span-2">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Calendar size={18} /> ETA קרוב</h3>
                  {(() => {
                    const upcoming = shipments
                      .filter(s => s.eta && !["נמסר", "שוחרר"].includes(s.status))
                      .sort((a, b) => new Date(a.eta!).getTime() - new Date(b.eta!).getTime())
                      .slice(0, 8);
                    return upcoming.length === 0 ? (
                      <p className="text-muted-foreground text-center py-6">אין משלוחים עם ETA</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {upcoming.map(s => {
                          const d = daysDiff(s.eta);
                          return (
                            <div key={s.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                              <div className="flex items-center gap-2">
                                <CarrierIcon type={s.carrierType} />
                                <div>
                                  <div className="font-bold text-sm text-cyan-700">{s.shipmentNumber}</div>
                                  <div className="text-xs text-muted-foreground">{s.carrierName || s.vesselName || "-"}</div>
                                </div>
                              </div>
                              <div className="text-left">
                                <div className="text-sm font-medium">{s.eta}</div>
                                <div className={`text-xs font-bold ${d !== null && d < 0 ? "text-red-600" : "text-green-600"}`}>
                                  {d !== null ? (d < 0 ? `באיחור ${Math.abs(d)}d` : d === 0 ? "היום!" : `עוד ${d}d`) : ""}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* List View */}
            {activeTab === "list" && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                  <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    placeholder="חיפוש לפי מספר משלוח, מעקב, מוביל, ספק, מכולה, ספינה..."
                    className="w-full pr-10 pl-4 py-2.5 border border-border rounded-xl bg-card focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                </div>
                <BulkActions selectedIds={selectedIds} onClear={clear} entityName="משלוחים" actions={defaultBulkActions(selectedIds, clear, () => qc.invalidateQueries({ queryKey: ["shipment-tracking"] }), `${API}/shipment-tracking`)} />
                {filtered.length === 0 ? (
                  <div className="text-center py-16 bg-card rounded-xl border border-slate-100">
                    <Ship size={48} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-muted-foreground">אין משלוחים</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filtered.map(s => {
                      const d = daysDiff(s.eta);
                      const step = STATUS_STEP[s.status] ?? 0;
                      const pct = Math.round((step / 9) * 100);
                      return (
                        <motion.div key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          className={`bg-card rounded-xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-all ${isSelected(s.id) ? "ring-2 ring-cyan-400" : ""}`}>
                          <div className="mb-1"><BulkCheckbox checked={isSelected(s.id)} onChange={() => toggle(s.id)} /></div>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <CarrierIcon type={s.carrierType} />
                              <div>
                                <div className="font-bold text-cyan-700 text-lg">{s.shipmentNumber}</div>
                                {s.trackingNumber && <div className="text-xs text-muted-foreground">מעקב: {s.trackingNumber}</div>}
                              </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s.status] || "bg-muted/50"}`}>{s.status}</span>
                          </div>

                          {/* Progress bar */}
                          <div className="mb-3">
                            <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                              <span>הוזמן</span>
                              <span>נמסר</span>
                            </div>
                            <div className="w-full bg-muted/50 rounded-full h-2">
                              <div className="bg-cyan-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }}></div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-1 text-sm mb-2">
                            {s.carrierName && <div><span className="text-muted-foreground">מוביל:</span> <span className="font-medium">{s.carrierName}</span></div>}
                            {s.vesselName && <div><span className="text-muted-foreground">ספינה:</span> <span className="font-medium">{s.vesselName}</span></div>}
                            <div className="col-span-2 flex items-center gap-1 text-muted-foreground">
                              <MapPin size={12} /> {s.originPort || "?"} <ArrowRight size={12} /> {s.destinationPort}
                            </div>
                            {s.containerNumber && <div><span className="text-muted-foreground">מכולה:</span> <span className="font-medium">{s.containerNumber}</span></div>}
                            {s.eta && (
                              <div className="flex items-center gap-1">
                                <span className="text-muted-foreground">ETA:</span>
                                <span className="font-medium">{s.eta}</span>
                                {d !== null && (
                                  <span className={`text-xs font-bold ${d < 0 ? "text-red-600" : d <= 3 ? "text-yellow-600" : "text-green-600"}`}>
                                    ({d < 0 ? `${Math.abs(d)}-` : `${d}+`})
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {d !== null && d < 0 && !["נמסר", "שוחרר"].includes(s.status) && (
                            <div className="flex items-center gap-1 text-xs text-red-600 bg-red-50 rounded-lg p-1.5 mb-2">
                              <AlertTriangle size={12} /> איחור של {Math.abs(d)} ימים!
                              {s.delayReason && <span className="text-red-500">— {s.delayReason}</span>}
                            </div>
                          )}

                          <div className="flex gap-1 pt-2 border-t border-slate-100">
                            <button onClick={() => setDetailItem(s)} className="flex-1 flex items-center justify-center gap-1 text-cyan-600 hover:bg-cyan-50 rounded-lg py-1.5 text-sm"><Eye size={14} /> צפייה</button>
                            <button onClick={() => { setTimelineShipment(s); setActiveTab("timeline"); }} className="flex-1 flex items-center justify-center gap-1 text-indigo-600 hover:bg-indigo-50 rounded-lg py-1.5 text-sm"><Clock size={14} /> ציר זמן</button>
                            <button onClick={() => openEdit(s)} className="flex-1 flex items-center justify-center gap-1 text-amber-600 hover:bg-amber-50 rounded-lg py-1.5 text-sm"><Edit2 size={14} /> עריכה</button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/shipment-tracking`, s.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                            {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק משלוח זה?", { itemName: s.tracking_number || s.shipment_number || String(s.id), entityType: "משלוח" }); if (ok) deleteMut.mutate(s.id); }} className="flex items-center justify-center gap-1 text-red-600 hover:bg-red-50 rounded-lg py-1.5 text-sm px-2"><Trash2 size={14} /></button>}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Timeline View */}
            {activeTab === "timeline" && (
              <div className="space-y-4">
                {!timelineShipment ? (
                  <div className="bg-card rounded-xl p-6 shadow-sm border border-slate-100">
                    <h3 className="font-bold text-foreground mb-4">בחר משלוח לצפייה בציר זמן</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {shipments.map(s => (
                        <button key={s.id} onClick={() => setTimelineShipment(s)}
                          className="flex items-center gap-3 p-3 bg-muted/30 hover:bg-cyan-50 rounded-lg text-right transition-all border border-border hover:border-cyan-300">
                          <CarrierIcon type={s.carrierType} />
                          <div>
                            <div className="font-bold text-cyan-700">{s.shipmentNumber}</div>
                            <div className="text-xs text-muted-foreground">{s.carrierName || s.vesselName || "-"} | {s.status}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between bg-card rounded-xl p-4 shadow-sm border border-slate-100">
                      <div className="flex items-center gap-3">
                        <CarrierIcon type={timelineShipment.carrierType} />
                        <div>
                          <h3 className="font-bold text-cyan-700 text-lg">{timelineShipment.shipmentNumber}</h3>
                          <p className="text-sm text-muted-foreground">{timelineShipment.originPort} → {timelineShipment.destinationPort} | {timelineShipment.status}</p>
                        </div>
                      </div>
                      <button onClick={() => setTimelineShipment(null)} className="text-muted-foreground hover:text-muted-foreground"><X size={20} /></button>
                    </div>

                    {/* Status progress */}
                    <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                      <h4 className="font-bold text-sm text-foreground mb-3">מצב נוכחי</h4>
                      <div className="flex gap-0.5 overflow-x-auto pb-2">
                        {STATUSES.map((st, i) => {
                          const currentStep = STATUS_STEP[timelineShipment.status] ?? 0;
                          const done = i <= currentStep;
                          const isCurrent = i === currentStep;
                          return (
                            <div key={i} className="flex items-center">
                              <div className={`text-center px-2 py-2 rounded-lg min-w-[70px] border-2 ${isCurrent ? "border-cyan-500 bg-cyan-100" : done ? "border-green-300 bg-green-50" : "border-border bg-muted/30"}`}>
                                <div className={`text-[10px] font-medium ${isCurrent ? "text-cyan-700" : done ? "text-green-700" : "text-muted-foreground"}`}>{st}</div>
                                {done && <CheckCircle2 size={12} className={`mx-auto mt-0.5 ${isCurrent ? "text-cyan-600" : "text-green-500"}`} />}
                              </div>
                              {i < STATUSES.length - 1 && <ArrowRight size={12} className={`mx-0.5 ${done ? "text-green-400" : "text-slate-300"}`} />}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Add update */}
                    <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                      <h4 className="font-bold text-sm text-foreground mb-3">הוסף עדכון סטטוס</h4>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <select value={newUpdate.status} onChange={e => setNewUpdate({ ...newUpdate, status: e.target.value })}
                          className="border border-border rounded-lg p-2 text-sm">
                          <option value="">בחר סטטוס...</option>
                          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <input value={newUpdate.location} onChange={e => setNewUpdate({ ...newUpdate, location: e.target.value })}
                          placeholder="מיקום" className="border border-border rounded-lg p-2 text-sm" />
                        <input value={newUpdate.description} onChange={e => setNewUpdate({ ...newUpdate, description: e.target.value })}
                          placeholder="תיאור" className="border border-border rounded-lg p-2 text-sm" />
                        <button onClick={() => {
                          if (!newUpdate.status) return;
                          addUpdateMut.mutate({ shipmentId: timelineShipment.id, ...newUpdate });
                        }} disabled={!newUpdate.status || addUpdateMut.isPending}
                          className="flex items-center justify-center gap-1 bg-cyan-600 text-foreground rounded-lg py-2 text-sm hover:bg-cyan-700 disabled:opacity-50">
                          <Plus size={14} /> הוסף
                        </button>
                      </div>
                    </div>

                    {/* Timeline */}
                    <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                      <h4 className="font-bold text-sm text-foreground mb-4">ציר זמן עדכונים</h4>
                      {updates.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">אין עדכונים עדיין — הוסף עדכון ראשון למעלה</p>
                      ) : (
                        <div className="relative pr-6">
                          <div className="absolute right-2 top-0 bottom-0 w-0.5 bg-muted"></div>
                          {updates.map((u, i) => (
                            <div key={u.id} className="relative mb-4 last:mb-0">
                              <div className="absolute right-[-4px] w-3 h-3 rounded-full bg-cyan-500 border-2 border-white shadow-sm" style={{ top: "8px" }}></div>
                              <div className="mr-4 bg-muted/30 rounded-lg p-3 border border-border">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[u.status] || "bg-muted/50"}`}>{u.status}</span>
                                    {u.location && <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin size={10} />{u.location}</span>}
                                  </div>
                                  <span className="text-xs text-muted-foreground">{new Date(u.updateDate).toLocaleString("he-IL")}</span>
                                </div>
                                {u.description && <p className="text-sm text-foreground">{u.description}</p>}
                                {u.updatedBy && <p className="text-xs text-muted-foreground mt-1">עודכן ע״י: {u.updatedBy}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Delays View */}
            {activeTab === "delays" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-red-50 rounded-xl p-4 border border-red-200 text-center">
                    <AlertTriangle size={24} className="mx-auto text-red-500 mb-2" />
                    <div className="text-lg sm:text-2xl font-bold text-red-700">{delayed}</div>
                    <div className="text-sm text-red-600">משלוחים באיחור</div>
                  </div>
                  <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200 text-center">
                    <Clock size={24} className="mx-auto text-yellow-500 mb-2" />
                    <div className="text-lg sm:text-2xl font-bold text-yellow-700">
                      {shipments.filter(s => { const d = daysDiff(s.eta); return d !== null && d >= 0 && d <= 3 && !["נמסר", "שוחרר"].includes(s.status); }).length}
                    </div>
                    <div className="text-sm text-yellow-600">מגיעים ב-3 ימים</div>
                  </div>
                  <div className="bg-green-50 rounded-xl p-4 border border-green-200 text-center">
                    <CheckCircle2 size={24} className="mx-auto text-green-500 mb-2" />
                    <div className="text-lg sm:text-2xl font-bold text-green-700">
                      {shipments.filter(s => s.actualArrival).length}
                    </div>
                    <div className="text-sm text-green-600">הגיעו</div>
                  </div>
                </div>

                {delayedShipments.length === 0 ? (
                  <div className="bg-card rounded-xl p-8 text-center border border-slate-100">
                    <CheckCircle2 size={48} className="mx-auto text-green-400 mb-3" />
                    <p className="text-muted-foreground text-lg">אין עיכובים! כל המשלוחים בזמן.</p>
                  </div>
                ) : (
                  <div className="bg-card rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30">
                        <tr>
                          <th className="text-right p-3 font-medium text-muted-foreground">משלוח</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">מוביל</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">נתיב</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">ETA</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">ימי איחור</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">סיבה</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">סטטוס</th>
                        </tr>
                      </thead>
                      <tbody>
                        {delayedShipments.map(s => {
                          const d = daysDiff(s.eta);
                          const delayAmount = d !== null && d < 0 ? Math.abs(d) : (s.delayDays || 0);
                          return (
                            <tr key={s.id} className="border-t border-slate-100 hover:bg-red-50 transition-colors">
                              <td className="p-3">
                                <div className="font-bold text-cyan-700">{s.shipmentNumber}</div>
                                {s.trackingNumber && <div className="text-xs text-muted-foreground">{s.trackingNumber}</div>}
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-1">
                                  <CarrierIcon type={s.carrierType} />
                                  <span>{s.carrierName || "-"}</span>
                                </div>
                              </td>
                              <td className="p-3 text-muted-foreground">{s.originPort || "?"} → {s.destinationPort}</td>
                              <td className="p-3 font-medium">{s.eta || "-"}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${delayAmount > 7 ? "bg-red-200 text-red-800" : delayAmount > 3 ? "bg-orange-200 text-orange-800" : "bg-yellow-200 text-yellow-800"}`}>
                                  {delayAmount} ימים
                                </span>
                              </td>
                              <td className="p-3 text-muted-foreground max-w-[200px] truncate">{s.delayReason || "-"}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s.status]}`}>{s.status}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 overflow-y-auto p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto my-8">
              <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-card rounded-t-2xl z-10">
                <h2 className="text-lg font-bold text-foreground">{editItem ? "עריכת משלוח" : "משלוח חדש"}</h2>
                <button onClick={() => { setShowForm(false); setEditItem(null); }} className="p-1 hover:bg-muted/50 rounded-lg"><X size={20} /></button>
              </div>
              <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
                {/* Basic */}
                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-cyan-700 px-2">פרטי משלוח</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">מספר משלוח (אוטומטי)</label>
                      <input value={formData.shipmentNumber || ""} onChange={e => setFormData({ ...formData, shipmentNumber: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" placeholder="SHP-YYYY-NNNN" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">סטטוס</label>
                      <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm">
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">עדיפות</label>
                      <select value={formData.priority} onChange={e => setFormData({ ...formData, priority: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm">
                        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">הזמנת יבוא (ID)</label>
                      <input type="number" value={formData.importOrderId || ""} onChange={e => setFormData({ ...formData, importOrderId: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">ספק</label>
                      <input value={formData.supplierName || ""} onChange={e => setFormData({ ...formData, supplierName: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">תיאור סחורה</label>
                      <input value={formData.goodsDescription || ""} onChange={e => setFormData({ ...formData, goodsDescription: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                  </div>
                </fieldset>

                {/* Carrier */}
                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-cyan-700 px-2">מוביל</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">שם מוביל</label>
                      <input value={formData.carrierName || ""} onChange={e => setFormData({ ...formData, carrierName: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">סוג הובלה</label>
                      <select value={formData.carrierType} onChange={e => setFormData({ ...formData, carrierType: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm">
                        {CARRIER_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">מספר מעקב</label>
                      <input value={formData.trackingNumber || ""} onChange={e => setFormData({ ...formData, trackingNumber: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">מספר הזמנה (Booking)</label>
                      <input value={formData.bookingNumber || ""} onChange={e => setFormData({ ...formData, bookingNumber: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">שם ספינה/כלי</label>
                      <input value={formData.vesselName || ""} onChange={e => setFormData({ ...formData, vesselName: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">מספר מסע</label>
                      <input value={formData.voyageNumber || ""} onChange={e => setFormData({ ...formData, voyageNumber: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                  </div>
                </fieldset>

                {/* Route */}
                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-cyan-700 px-2">מסלול ונמלים</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">נמל מוצא</label>
                      <input value={formData.originPort || ""} onChange={e => setFormData({ ...formData, originPort: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">נמל יעד</label>
                      <select value={formData.destinationPort} onChange={e => setFormData({ ...formData, destinationPort: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm">
                        {PORTS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">ארץ מוצא</label>
                      <input value={formData.originCountry || ""} onChange={e => setFormData({ ...formData, originCountry: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">מיקום נוכחי</label>
                      <input value={formData.currentLocation || ""} onChange={e => setFormData({ ...formData, currentLocation: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                  </div>
                </fieldset>

                {/* Dates */}
                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-cyan-700 px-2">תאריכים</legend>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {[
                      { key: "etd", label: "ETD (יציאה משוערת)" },
                      { key: "eta", label: "ETA (הגעה משוערת)" },
                      { key: "actualDeparture", label: "יציאה בפועל" },
                      { key: "actualArrival", label: "הגעה בפועל" },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="text-xs text-muted-foreground">{f.label}</label>
                        <input type="date" value={formData[f.key] || ""} onChange={e => setFormData({ ...formData, [f.key]: e.target.value })}
                          className="w-full border border-border rounded-lg p-2 text-sm" />
                      </div>
                    ))}
                  </div>
                </fieldset>

                {/* Container */}
                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-cyan-700 px-2">מכולה ומטען</legend>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">מספר מכולה</label>
                      <input value={formData.containerNumber || ""} onChange={e => setFormData({ ...formData, containerNumber: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" placeholder="MSCU1234567" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">סוג מכולה</label>
                      <select value={formData.containerType || ""} onChange={e => setFormData({ ...formData, containerType: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm">
                        <option value="">בחר...</option>
                        {CONTAINER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">כמות מכולות</label>
                      <input type="number" value={formData.containerCount || ""} onChange={e => setFormData({ ...formData, containerCount: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">מספר חותם</label>
                      <input value={formData.sealNumber || ""} onChange={e => setFormData({ ...formData, sealNumber: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">שטר מטען</label>
                      <input value={formData.billOfLading || ""} onChange={e => setFormData({ ...formData, billOfLading: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">משקל (ק"ג)</label>
                      <input type="number" step="0.01" value={formData.weightKg || ""} onChange={e => setFormData({ ...formData, weightKg: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">נפח (CBM)</label>
                      <input type="number" step="0.01" value={formData.volumeCbm || ""} onChange={e => setFormData({ ...formData, volumeCbm: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">כמות חבילות</label>
                      <input type="number" value={formData.packagesCount || ""} onChange={e => setFormData({ ...formData, packagesCount: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                  </div>
                </fieldset>

                {/* Financial */}
                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-cyan-700 px-2">עלויות</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">עלות הובלה</label>
                      <input type="number" step="0.01" value={formData.freightCost || ""} onChange={e => setFormData({ ...formData, freightCost: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">מטבע הובלה</label>
                      <select value={formData.freightCurrency} onChange={e => setFormData({ ...formData, freightCurrency: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm">
                        {["USD", "EUR", "ILS"].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">ערך ביטוח</label>
                      <input type="number" step="0.01" value={formData.insuranceValue || ""} onChange={e => setFormData({ ...formData, insuranceValue: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">ערך סחורה</label>
                      <input type="number" step="0.01" value={formData.goodsValue || ""} onChange={e => setFormData({ ...formData, goodsValue: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                  </div>
                </fieldset>

                {/* Agents */}
                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-cyan-700 px-2">סוכנים ואנשי קשר</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">נמען</label>
                      <input value={formData.consignee || ""} onChange={e => setFormData({ ...formData, consignee: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">צד להודעה</label>
                      <input value={formData.notifyParty || ""} onChange={e => setFormData({ ...formData, notifyParty: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">סוכן שילוח</label>
                      <input value={formData.forwardingAgent || ""} onChange={e => setFormData({ ...formData, forwardingAgent: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">טלפון סוכן</label>
                      <input value={formData.agentPhone || ""} onChange={e => setFormData({ ...formData, agentPhone: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">אימייל סוכן</label>
                      <input value={formData.agentEmail || ""} onChange={e => setFormData({ ...formData, agentEmail: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">עמיל מכס</label>
                      <input value={formData.customsBroker || ""} onChange={e => setFormData({ ...formData, customsBroker: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                  </div>
                </fieldset>

                {/* Delay */}
                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-cyan-700 px-2">עיכוב</legend>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">ימי עיכוב</label>
                      <input type="number" value={formData.delayDays || ""} onChange={e => setFormData({ ...formData, delayDays: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">סיבת עיכוב</label>
                      <input value={formData.delayReason || ""} onChange={e => setFormData({ ...formData, delayReason: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                  </div>
                </fieldset>

                {/* Notes */}
                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-cyan-700 px-2">הערות</legend>
                  <textarea value={formData.notes || ""} onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    rows={3} className="w-full border border-border rounded-lg p-2 text-sm" />
                </fieldset>
              </div>
              <div className="flex gap-3 p-4 border-t border-slate-100 sticky bottom-0 bg-card rounded-b-2xl">
                <button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}
                  className="flex-1 flex items-center justify-center gap-2 bg-cyan-600 text-foreground py-2.5 rounded-lg hover:bg-cyan-700 disabled:opacity-50">
                  <Save size={16} /> {editItem ? "עדכון" : "שמירה"}
                </button>
                <button onClick={() => { setShowForm(false); setEditItem(null); }}
                  className="px-6 py-2.5 border border-border rounded-lg hover:bg-muted/30">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail Modal */}
      <AnimatePresence>
        {detailItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 overflow-y-auto p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto my-8">
              <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-card rounded-t-2xl z-10">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <CarrierIcon type={detailItem.carrierType} /> משלוח {detailItem.shipmentNumber}
                  </h2>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[detailItem.status]}`}>{detailItem.status}</span>
                </div>
                <button onClick={() => setDetailItem(null)} className="p-1 hover:bg-muted/50 rounded-lg"><X size={20} /></button>
              </div>
              <div className="flex gap-1 px-4 pt-3 border-b border-slate-100 overflow-x-auto">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"attachments",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(tab => (
                  <button key={tab.key} onClick={() => setDetailTab(tab.key)} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${detailTab === tab.key ? "bg-cyan-50 text-cyan-700 border-b-2 border-cyan-500" : "text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>
                ))}
              </div>
              <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
                {detailTab === "details" && (<>
                <div className="bg-muted/30 rounded-xl p-4">
                  <div className="flex gap-0.5 overflow-x-auto">
                    {STATUSES.map((st, i) => {
                      const cur = STATUS_STEP[detailItem.status] ?? 0;
                      const done = i <= cur;
                      const isCur = i === cur;
                      return (
                        <div key={i} className="flex items-center">
                          <div className={`px-1.5 py-1 rounded text-[9px] font-medium min-w-[55px] text-center ${isCur ? "bg-cyan-200 text-cyan-800" : done ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                            {st}
                          </div>
                          {i < STATUSES.length - 1 && <ArrowRight size={10} className="text-slate-300 mx-0.5" />}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { label: "מוביל", value: detailItem.carrierName },
                    { label: "מספר מעקב", value: detailItem.trackingNumber },
                    { label: "ספינה", value: detailItem.vesselName },
                    { label: "מסע", value: detailItem.voyageNumber },
                    { label: "Booking", value: detailItem.bookingNumber },
                    { label: "ספק", value: detailItem.supplierName },
                    { label: "ארץ", value: detailItem.originCountry },
                    { label: "מכולה", value: detailItem.containerNumber },
                    { label: "סוג מכולה", value: detailItem.containerType },
                    { label: "חותם", value: detailItem.sealNumber },
                    { label: "שטר מטען", value: detailItem.billOfLading },
                    { label: "מיקום נוכחי", value: detailItem.currentLocation },
                    { label: "סוכן שילוח", value: detailItem.forwardingAgent },
                    { label: "עמיל מכס", value: detailItem.customsBroker },
                    { label: "נמען", value: detailItem.consignee },
                  ].filter(f => f.value).map((f, i) => (
                    <div key={i} className="bg-muted/30 rounded-lg p-2">
                      <div className="text-xs text-muted-foreground">{f.label}</div>
                      <div className="font-medium text-sm text-foreground">{f.value}</div>
                    </div>
                  ))}
                </div>

                {/* Route */}
                <div className="bg-cyan-50 rounded-xl p-4 border border-cyan-200 flex items-center justify-center gap-4 text-center">
                  <div>
                    <div className="text-xs text-cyan-600">נמל מוצא</div>
                    <div className="font-bold text-foreground">{detailItem.originPort || "—"}</div>
                    {detailItem.etd && <div className="text-xs text-muted-foreground">ETD: {detailItem.etd}</div>}
                    {detailItem.actualDeparture && <div className="text-xs text-green-600">יצא: {detailItem.actualDeparture}</div>}
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-16 h-0.5 bg-cyan-300"></div>
                    <CarrierIcon type={detailItem.carrierType} />
                    <div className="w-16 h-0.5 bg-cyan-300"></div>
                  </div>
                  <div>
                    <div className="text-xs text-cyan-600">נמל יעד</div>
                    <div className="font-bold text-foreground">{detailItem.destinationPort}</div>
                    {detailItem.eta && <div className="text-xs text-muted-foreground">ETA: {detailItem.eta}</div>}
                    {detailItem.actualArrival && <div className="text-xs text-green-600">הגיע: {detailItem.actualArrival}</div>}
                  </div>
                </div>

                {/* Cargo */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "משקל", value: detailItem.weightKg ? `${fmt(detailItem.weightKg)} ק"ג` : null },
                    { label: "נפח", value: detailItem.volumeCbm ? `${fmt(detailItem.volumeCbm)} CBM` : null },
                    { label: "חבילות", value: detailItem.packagesCount?.toString() },
                    { label: "ערך סחורה", value: fmtCur(detailItem.goodsValue) },
                    { label: "הובלה", value: `${fmtCur(detailItem.freightCost)} ${detailItem.freightCurrency}` },
                    { label: "ביטוח", value: fmtCur(detailItem.insuranceValue) },
                  ].filter(f => f.value && f.value !== "$0").map((f, i) => (
                    <div key={i} className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                      <div className="text-xs text-green-700">{f.label}</div>
                      <div className="font-bold text-foreground">{f.value}</div>
                    </div>
                  ))}
                </div>

                {/* Delay */}
                {(detailItem.delayDays > 0 || (daysDiff(detailItem.eta) !== null && daysDiff(detailItem.eta)! < 0)) && (
                  <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                    <h4 className="font-bold text-sm text-red-700 mb-1 flex items-center gap-1"><AlertTriangle size={14} /> עיכוב</h4>
                    <p className="text-sm text-foreground">
                      {detailItem.delayDays > 0 ? `${detailItem.delayDays} ימי עיכוב מדווחים` : `${Math.abs(daysDiff(detailItem.eta)!)} ימי איחור מעבר ל-ETA`}
                      {detailItem.delayReason && ` — ${detailItem.delayReason}`}
                    </p>
                  </div>
                )}

                {detailItem.notes && (
                  <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                    <h4 className="font-bold text-sm text-yellow-700 mb-1">הערות</h4>
                    <p className="text-sm text-foreground">{detailItem.notes}</p>
                  </div>
                )}
                </>)}
                {detailTab === "related" && <RelatedRecords entityType="shipment-tracking" entityId={detailItem.id} />}
                {detailTab === "attachments" && <AttachmentsSection entityType="shipment-tracking" entityId={detailItem.id} />}
                {detailTab === "history" && <ActivityLog entityType="shipment-tracking" entityId={detailItem.id} />}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
