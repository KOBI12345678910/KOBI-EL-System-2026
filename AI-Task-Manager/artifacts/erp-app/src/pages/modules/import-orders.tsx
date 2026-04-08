import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import { translateStatus } from "@/lib/status-labels";
import {
  Ship, Globe, DollarSign, Calendar, AlertTriangle, CheckCircle2,
  Search, Plus, Edit2, Trash2, X, Save, Eye, Anchor,
  Package, FileText, Clock, Shield, Hash, Phone, Mail,
  ChevronDown, ChevronUp, Plane, Truck, Container,
  MessageCircle, Send, Download, Printer, Users, ExternalLink, Copy
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { sendByEmail, generateEmailBody, printPage, exportToWord } from "@/lib/print-utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";

interface ImportOrder {
  id: number;
  orderNumber: string;
  supplierId: number | null;
  supplierName: string | null;
  countryOfOrigin: string | null;
  incoterms: string;
  currency: string;
  exchangeRate: string;
  totalValue: string;
  totalValueIls: string;
  customsDutyPct: string;
  estimatedCustomsDuty: string;
  customsClassification: string | null;
  shippingMethod: string;
  containerType: string | null;
  containerCount: number | null;
  portOfOrigin: string | null;
  portOfDestination: string;
  estimatedDeparture: string | null;
  estimatedArrival: string | null;
  actualArrival: string | null;
  insuranceCompany: string | null;
  insurancePolicyNumber: string | null;
  insuranceValue: string;
  lcNumber: string | null;
  lcBank: string | null;
  lcAmount: string;
  lcExpiryDate: string | null;
  freightCost: string;
  handlingCost: string;
  otherCosts: string;
  totalLandedCost: string;
  customsBroker: string | null;
  forwardingAgent: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  status: string;
  priority: string | null;
  createdAt: string;
}

interface ImportItem {
  id: number;
  importOrderId: number;
  itemName: string;
  itemCode: string | null;
  hsCode: string | null;
  description: string | null;
  quantity: string;
  unit: string;
  unitPrice: string;
  totalPrice: string;
  customsDutyPct: string;
  customsDutyAmount: string;
  weightKg: string | null;
  volumeCbm: string | null;
  countryOfOrigin: string | null;
  notes: string | null;
}

const INCOTERMS = ["FOB", "CIF", "EXW", "DDP", "DAP", "FCA", "CFR", "CPT", "CIP", "DPU"];
const CURRENCIES = ["USD", "EUR", "GBP", "CNY", "JPY", "ILS"];
const SHIPPING_METHODS = [
  { value: "sea", label: "ים", icon: Ship },
  { value: "air", label: "אוויר", icon: Plane },
  { value: "land", label: "יבשה", icon: Truck },
];
const CONTAINER_TYPES = ["20' Standard", "40' Standard", "40' High Cube", "20' Reefer", "40' Reefer", "Flat Rack", "Open Top", "LCL"];
const STATUSES = ["טיוטה", "בהכנה", "הוזמן", "בייצור", "נשלח", "בנמל", "בשחרור מכס", "התקבל", "בוטל"];
const PRIORITIES = ["נמוכה", "רגילה", "גבוהה", "דחוף"];
const COUNTRIES = ["סין", "טורקיה", "הודו", "גרמניה", "איטליה", "ספרד", "פולין", "רומניה", "תאילנד", "וייטנאם", "ארה\"ב", "אנגליה", "צרפת", "יפן", "דרום קוריאה", "אחר"];

type ViewMode = "dashboard" | "list" | "tracking" | "costs";

interface LocalSupplier {
  id: number; supplierName: string; phone: string | null; mobile: string | null;
  email: string | null; status: string;
}

interface ForeignSupplier {
  id: number; companyName: string; phone: string | null; mobile: string | null;
  email: string | null; status: string; country: string;
}

function statusColor(status: string): string {
  const c: Record<string, string> = {
    "טיוטה": "bg-muted/20 text-muted-foreground border-gray-500/30",
    "בהכנה": "bg-blue-500/20 text-blue-400 border-blue-500/30",
    "הוזמן": "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
    "בייצור": "bg-purple-500/20 text-purple-400 border-purple-500/30",
    "נשלח": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    "בנמל": "bg-amber-500/20 text-amber-400 border-amber-500/30",
    "בשחרור מכס": "bg-orange-500/20 text-orange-400 border-orange-500/30",
    "התקבל": "bg-green-500/20 text-green-400 border-green-500/30",
    "בוטל": "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return c[status] || "bg-muted/20 text-muted-foreground border-gray-500/30";
}

function shippingIcon(method: string) {
  if (method === "air") return <Plane size={14} className="text-blue-400" />;
  if (method === "land") return <Truck size={14} className="text-amber-400" />;
  return <Ship size={14} className="text-cyan-400" />;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export default function ImportOrdersPage() {
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ImportOrder | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<ImportOrder | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({ orderNumber: { required: true, message: "מספר הזמנה נדרש" }, supplierId: { required: true, message: "ספק נדרש" } });
  const [showItemForm, setShowItemForm] = useState(false);
  const [orderItems, setOrderItems] = useState<ImportItem[]>([]);

  const { data: ordersRaw, isLoading } = useQuery({
    queryKey: ["import-orders"],
    queryFn: async () => { const r = await authFetch(`${API}/import-orders`); return r.json(); },
  });
  const orders: ImportOrder[] = Array.isArray(ordersRaw) ? ordersRaw : (ordersRaw?.data || ordersRaw?.items || []);

  const { data: suppliersRaw } = useQuery({
    queryKey: ["suppliers-for-send"],
    queryFn: async () => { const r = await authFetch(`${API}/suppliers`); return r.json(); },
  });
  const suppliersForSend: LocalSupplier[] = Array.isArray(suppliersRaw) ? suppliersRaw : (suppliersRaw?.data || suppliersRaw?.items || []);

  const { data: foreignSuppliersRaw } = useQuery({
    queryKey: ["foreign-suppliers-for-send"],
    queryFn: async () => { const r = await authFetch(`${API}/foreign-suppliers`); return r.json(); },
  });
  const foreignSuppliersForSend: ForeignSupplier[] = Array.isArray(foreignSuppliersRaw) ? foreignSuppliersRaw : (foreignSuppliersRaw?.data || foreignSuppliersRaw?.items || []);

  const filtered = useMemo(() => {
    return orders.filter(o => {
      const matchSearch = !search || (o.orderNumber || "").includes(search) || (o.supplierName || "").includes(search) || (o.countryOfOrigin || "").includes(search);
      const activeStatuses = ["בהכנה", "הוזמן", "בייצור", "נשלח", "בנמל", "בשחרור מכס"];
      const transitStatuses = ["נשלח", "בנמל"];
      const matchStatus = statusFilter === "all"
        || (statusFilter === "active" ? activeStatuses.includes(o.status) : statusFilter === "transit" ? transitStatuses.includes(o.status) : o.status === statusFilter);
      return matchSearch && matchStatus;
    });
  }, [orders, search, statusFilter]);

  const kpis = useMemo(() => {
    const active = orders.filter(o => !["התקבל", "בוטל", "טיוטה"].includes(o.status)).length;
    const totalValue = orders.filter(o => o.status !== "בוטל").reduce((s, o) => s + parseFloat(o.totalValue || "0"), 0);
    const totalValueIls = orders.filter(o => o.status !== "בוטל").reduce((s, o) => s + parseFloat(o.totalValueIls || "0"), 0);
    const totalDuty = orders.filter(o => o.status !== "בוטל").reduce((s, o) => s + parseFloat(o.estimatedCustomsDuty || "0"), 0);
    const inTransit = orders.filter(o => ["נשלח", "בנמל"].includes(o.status)).length;
    const inCustoms = orders.filter(o => o.status === "בשחרור מכס").length;
    const received = orders.filter(o => o.status === "התקבל").length;
    const totalFreight = orders.filter(o => o.status !== "בוטל").reduce((s, o) => s + parseFloat(o.freightCost || "0"), 0);
    return { active, totalValue, totalValueIls, totalDuty, inTransit, inCustoms, received, totalFreight, total: orders.length };
  }, [orders]);

  const [form, setForm] = useState<any>({});
  const [itemForm, setItemForm] = useState<any>({});
  const [formItems, setFormItems] = useState<any[]>([]);
  const [savedOrder, setSavedOrder] = useState<ImportOrder | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedSuppliers, setSelectedSuppliers] = useState<number[]>([]);
  const [costSort, setCostSort] = useState<keyof ImportOrder | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const url = data.id ? `${API}/import-orders/${data.id}` : `${API}/import-orders`;
      const method = data.id ? "PUT" : "POST";
      const r = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: (result, variables) => {
      qc.invalidateQueries({ queryKey: ["import-orders"] });
      qc.invalidateQueries({ queryKey: ["foreign-suppliers"] });
      qc.invalidateQueries({ queryKey: ["raw-materials"] });
      qc.invalidateQueries({ queryKey: ["accounts-payable"] });
      qc.invalidateQueries({ queryKey: ["budgets"] });
      qc.invalidateQueries({ queryKey: ["executive-dashboard"] });
      qc.invalidateQueries({ queryKey: ["cross-module-summary"] });
      setShowForm(false);
      setEditingOrder(null);
      if (!variables.id) {
        setSavedOrder(result);
        setShowSendModal(true);
        setSelectedSuppliers([]);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/import-orders/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Delete failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["import-orders"] }),
  });

  const saveItemMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/import-order-items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => { setShowItemForm(false); if (selectedOrder) loadItems(selectedOrder.id); },
  });

  async function loadItems(orderId: number) {
    const r = await authFetch(`${API}/import-orders/${orderId}/items`);
    const items = await r.json();
    setOrderItems(Array.isArray(items) ? items : []);
  }

  function resetForm() {
    return {
      supplierName: "", countryOfOrigin: "", incoterms: "FOB", currency: "USD", exchangeRate: "3.65",
      totalValue: "", totalValueIls: "", customsDutyPct: "", estimatedCustomsDuty: "",
      customsClassification: "", shippingMethod: "sea", containerType: "", containerCount: "1",
      portOfOrigin: "", portOfDestination: "חיפה", estimatedDeparture: "", estimatedArrival: "", actualArrival: "",
      insuranceCompany: "", insurancePolicyNumber: "", insuranceValue: "",
      lcNumber: "", lcBank: "", lcAmount: "", lcExpiryDate: "",
      freightCost: "", handlingCost: "", otherCosts: "", totalLandedCost: "",
      customsBroker: "", forwardingAgent: "", contactPerson: "", contactPhone: "", contactEmail: "",
      notes: "", status: "טיוטה", priority: "רגילה",
    };
  }

  function openForm(o?: ImportOrder) {
    if (o) {
      setEditingOrder(o);
      setForm({
        supplierName: o.supplierName || "", countryOfOrigin: o.countryOfOrigin || "",
        incoterms: o.incoterms, currency: o.currency, exchangeRate: o.exchangeRate || "3.65",
        totalValue: o.totalValue || "", totalValueIls: o.totalValueIls || "",
        customsDutyPct: o.customsDutyPct || "", estimatedCustomsDuty: o.estimatedCustomsDuty || "",
        customsClassification: o.customsClassification || "", shippingMethod: o.shippingMethod || "sea",
        containerType: o.containerType || "", containerCount: o.containerCount ?? "1",
        portOfOrigin: o.portOfOrigin || "", portOfDestination: o.portOfDestination || "חיפה",
        estimatedDeparture: o.estimatedDeparture || "", estimatedArrival: o.estimatedArrival || "",
        actualArrival: o.actualArrival || "",
        insuranceCompany: o.insuranceCompany || "", insurancePolicyNumber: o.insurancePolicyNumber || "",
        insuranceValue: o.insuranceValue || "",
        lcNumber: o.lcNumber || "", lcBank: o.lcBank || "", lcAmount: o.lcAmount || "", lcExpiryDate: o.lcExpiryDate || "",
        freightCost: o.freightCost || "", handlingCost: o.handlingCost || "", otherCosts: o.otherCosts || "",
        totalLandedCost: o.totalLandedCost || "",
        customsBroker: o.customsBroker || "", forwardingAgent: o.forwardingAgent || "",
        contactPerson: o.contactPerson || "", contactPhone: o.contactPhone || "", contactEmail: o.contactEmail || "",
        notes: o.notes || "", status: o.status, priority: o.priority || "רגילה",
      });
    } else {
      setEditingOrder(null);
      setForm(resetForm());
    }
    setShowForm(true);
  }

  function handleSubmit() {
    const payload = { ...form };
    if (editingOrder) payload.id = editingOrder.id;
    saveMutation.mutate(payload);
  }

  async function openDetail(o: ImportOrder) {
    setSelectedOrder(o);
    await loadItems(o.id);
  }

  const tabs: { key: ViewMode; label: string; icon: any }[] = [
    { key: "dashboard", label: "דשבורד", icon: Ship },
    { key: "list", label: "רשימת הזמנות", icon: Package },
    { key: "tracking", label: "מעקב משלוחים", icon: Globe },
    { key: "costs", label: "עלויות", icon: DollarSign },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-foreground p-4 md:p-6" dir="rtl">
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-cyan-500/20 rounded-xl border border-cyan-500/30">
              <Ship className="text-cyan-400" size={28} />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold">הזמנות יבוא</h1>
              <p className="text-muted-foreground text-sm">ניהול הזמנות יבוא, Incoterms, מכס, ביטוח, L/C ומשלוחים</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => {
              const msg = `רשימת הזמנות יבוא - טכנו-כל עוזי\n${orders.slice(0, 10).map(o => `• ${o.orderNumber} | ${o.supplierName || "—"} | ${o.status}`).join("\n")}`;
              window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
            }} className="flex items-center gap-1.5 px-3 py-2 bg-green-700 hover:bg-green-600 rounded-lg text-sm text-foreground transition-colors">
              <MessageCircle size={16} /> WhatsApp
            </button>
            <ExportDropdown data={orders} headers={{ orderNumber: "מס׳ הזמנה", supplierName: "ספק", countryOfOrigin: "ארץ מקור", incoterms: "Incoterms", shippingMethod: "משלוח", totalValue: "שווי $", totalValueIls: "שווי ₪", estimatedCustomsDuty: "מכס ₪", freightCost: "הובלה $", status: "סטטוס", estimatedArrival: "הגעה משוערת" }} filename={"import_orders"} />
            <button onClick={() => sendByEmail("הזמנות יבוא - טכנו-כל עוזי", generateEmailBody("הזמנות יבוא", orders, { orderNumber: "מס׳ הזמנה", supplierName: "ספק", countryOfOrigin: "ארץ", status: "סטטוס", totalValue: "שווי $" }))}
              className="flex items-center gap-1.5 px-3 py-2 bg-muted hover:bg-muted rounded-lg text-sm text-gray-300 transition-colors">
              <Mail size={16} /> אימייל
            </button>
            <button onClick={() => exportToWord("הזמנות יבוא", orders, { orderNumber: "מס׳ הזמנה", supplierName: "ספק", countryOfOrigin: "ארץ מקור", incoterms: "Incoterms", status: "סטטוס", totalValue: "שווי $", estimatedArrival: "הגעה משוערת" }, "import_orders")}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-700 hover:bg-indigo-600 rounded-lg text-sm text-foreground transition-colors">
              <FileText size={16} /> Word
            </button>
            <button onClick={() => printPage("הזמנות יבוא")}
              className="flex items-center gap-1.5 px-3 py-2 bg-muted hover:bg-muted rounded-lg text-sm text-gray-300 transition-colors">
              <Printer size={16} /> הדפסה
            </button>
            <button onClick={() => openForm()} className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-medium transition-colors">
              <Plus size={18} /> הזמנת יבוא חדשה
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "הזמנות פעילות", value: kpis.active, icon: Ship, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20", action: () => { setSearch(""); setStatusFilter("active"); setViewMode("list"); } },
            { label: "סה\"כ הזמנות", value: kpis.total, icon: Package, color: "text-indigo-400", bg: "bg-indigo-500/10 border-indigo-500/20", action: () => { setStatusFilter("all"); setViewMode("list"); } },
            { label: "שווי ($)", value: `$${(kpis.totalValue / 1000).toFixed(0)}K`, icon: DollarSign, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20", action: () => setViewMode("costs") },
            { label: "שווי (₪)", value: `₪${(kpis.totalValueIls / 1000).toFixed(0)}K`, icon: DollarSign, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", action: () => setViewMode("costs") },
            { label: "בדרך", value: kpis.inTransit, icon: Ship, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", action: () => { setStatusFilter("transit"); setViewMode("list"); } },
            { label: "בשחרור מכס", value: kpis.inCustoms, icon: FileText, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20", action: () => { setStatusFilter("בשחרור מכס"); setViewMode("list"); } },
            { label: "מכס משוער", value: `₪${(kpis.totalDuty / 1000).toFixed(0)}K`, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", action: () => setViewMode("costs") },
            { label: "הובלה", value: `$${(kpis.totalFreight / 1000).toFixed(0)}K`, icon: Truck, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20", action: () => setViewMode("costs") },
          ].map((k, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              onClick={k.action}
              className={`${k.bg} border rounded-xl p-3 text-center cursor-pointer hover:scale-105 hover:shadow-lg transition-all`}>
              <k.icon className={`${k.color} mx-auto mb-1`} size={20} />
              <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
              <div className="text-[10px] text-muted-foreground">{k.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Tabs & Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-1 bg-muted/50 rounded-xl p-1 border border-border/50">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setViewMode(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === t.key ? "bg-cyan-600 text-foreground shadow-lg" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
                <t.icon size={16} /> {t.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש הזמנה, ספק, ארץ..."
              className="w-full bg-muted/60 border border-border rounded-lg pr-10 pl-4 py-2.5 text-sm text-foreground placeholder-gray-500 focus:border-cyan-500/50 focus:outline-none" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-muted/60 border border-border rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:border-cyan-500/50 focus:outline-none">
            <option value="all">כל הסטטוסים</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {viewMode === "dashboard" && (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Status Distribution */}
                <div className="bg-muted/40 border border-border/50 rounded-xl p-5">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Ship className="text-cyan-400" size={20} /> סטטוס הזמנות</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {STATUSES.map(status => {
                      const count = orders.filter(o => o.status === status).length;
                      return (
                        <div key={status} onClick={() => { setStatusFilter(status); setViewMode("list"); }}
                          className={`${statusColor(status)} border rounded-lg p-3 text-center cursor-pointer hover:scale-105 transition-transform`}>
                          <div className="text-xl font-bold">{count}</div>
                          <div className="text-xs">{status}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Shipping Pipeline */}
                <div className="bg-muted/40 border border-border/50 rounded-xl p-5">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Globe className="text-blue-400" size={20} /> צינור משלוחים</h3>
                  <div className="flex items-center justify-between gap-2 mb-4">
                    {["הוזמן", "בייצור", "נשלח", "בנמל", "בשחרור מכס", "התקבל"].map((step, i) => {
                      const count = orders.filter(o => o.status === step).length;
                      return (
                        <div key={step} className="flex-1 text-center cursor-pointer" onClick={() => { setStatusFilter(step); setViewMode("list"); }}>
                          <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center text-sm font-bold mb-1 hover:scale-110 transition-transform ${count > 0 ? "bg-cyan-500/30 text-cyan-400 border border-cyan-500/40" : "bg-muted/50 text-muted-foreground border border-border/30"}`}>
                            {count}
                          </div>
                          <div className="text-[10px] text-muted-foreground">{step}</div>
                          {i < 5 && <div className="text-muted-foreground mt-1">→</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Country & Shipping Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-muted/40 border border-border/50 rounded-xl p-5">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Globe className="text-green-400" size={20} /> לפי ארץ מקור</h3>
                  <div className="space-y-2">
                    {(() => {
                      const countries: Record<string, number> = {};
                      orders.forEach(o => { const c = o.countryOfOrigin || "לא צוין"; countries[c] = (countries[c] || 0) + 1; });
                      return Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([country, count]) => (
                        <div key={country} className="flex items-center justify-between bg-background/40 rounded-lg p-2 px-3">
                          <span className="text-sm">{country}</span>
                          <span className="text-xs text-cyan-400 font-bold">{count}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                <div className="bg-muted/40 border border-border/50 rounded-xl p-5">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Anchor className="text-purple-400" size={20} /> שיטת משלוח</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {SHIPPING_METHODS.map(m => {
                      const count = orders.filter(o => o.shippingMethod === m.value).length;
                      const value = orders.filter(o => o.shippingMethod === m.value).reduce((s, o) => s + parseFloat(o.totalValue || "0"), 0);
                      return (
                        <div key={m.value} className="bg-background/50 border border-border/30 rounded-lg p-4 text-center">
                          <m.icon className="mx-auto mb-2 text-cyan-400" size={24} />
                          <div className="text-xl font-bold">{count}</div>
                          <div className="text-xs text-muted-foreground">{m.label}</div>
                          <div className="text-xs text-green-400 mt-1">${value.toLocaleString()}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Recent Orders */}
              <div className="bg-muted/40 border border-border/50 rounded-xl p-5">
                <h3 className="text-lg font-bold mb-4">הזמנות אחרונות</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">מס' הזמנה</th>
                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">ספק</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">ארץ</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">Incoterms</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">משלוח</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">שווי</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">הגעה משוערת</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">סטטוס</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">פעולות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, 15).map(o => (
                        <tr key={o.id} onClick={() => openDetail(o)} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer">
                          <td className="py-3 px-2 font-mono text-cyan-400">{o.orderNumber}</td>
                          <td className="py-3 px-2">{o.supplierName || "—"}</td>
                          <td className="py-3 px-2 text-center text-xs">{o.countryOfOrigin || "—"}</td>
                          <td className="py-3 px-2 text-center"><span className="px-2 py-0.5 rounded bg-muted text-xs font-mono">{o.incoterms}</span></td>
                          <td className="py-3 px-2 text-center">{shippingIcon(o.shippingMethod)}</td>
                          <td className="py-3 px-2 text-center text-green-400">${parseFloat(o.totalValue || "0").toLocaleString()}</td>
                          <td className="py-3 px-2 text-center text-gray-300">
                            {o.estimatedArrival || "—"}
                            {o.estimatedArrival && (() => { const d = daysUntil(o.estimatedArrival); return d !== null && d >= 0 ? <span className="text-xs text-muted-foreground mr-1">({d}d)</span> : d !== null && d < 0 ? <span className="text-xs text-green-400 mr-1">הגיע</span> : null; })()}
                          </td>
                          <td className="py-3 px-2 text-center"><span className={`px-2 py-1 rounded-full text-xs border ${statusColor(o.status)}`}>{translateStatus(o.status)}</span></td>
                          <td className="py-3 px-2 text-center" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => openForm(o)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 size={14} className="text-blue-400" /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/import-orders`, o.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                              {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק הזמנה זו?", { itemName: o.order_number || o.reference || String(o.id), entityType: "הזמנת יבוא" }); if (ok) deleteMutation.mutate(o.id); }} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 size={14} className="text-red-400" /></button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length === 0 && <p className="text-muted-foreground text-center py-8">אין הזמנות יבוא</p>}
                </div>
              </div>
            </motion.div>
          )}

          {viewMode === "list" && (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <BulkActions bulk={bulk} actions={defaultBulkActions} entityName="הזמנות יבוא" />
              {filtered.map(o => (
                <motion.div key={o.id} layout onClick={() => openDetail(o)} className={`bg-muted/40 border border-border/50 rounded-xl p-4 hover:border-cyan-500/30 hover:bg-muted/60 transition-all cursor-pointer ${bulk.isSelected(o.id) ? "ring-1 ring-primary/50 bg-primary/5" : ""}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div onClick={e => e.stopPropagation()}><BulkCheckbox bulk={bulk} id={o.id} /></div>
                      <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                        {shippingIcon(o.shippingMethod)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-cyan-400 font-bold">{o.orderNumber}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs border ${statusColor(o.status)}`}>{translateStatus(o.status)}</span>
                          <span className="px-2 py-0.5 rounded bg-muted text-xs font-mono">{o.incoterms}</span>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                          <span>{o.supplierName || "ספק לא צוין"}</span>
                          {o.countryOfOrigin && <span className="flex items-center gap-1"><Globe size={11} /> {o.countryOfOrigin}</span>}
                          {o.containerType && <span>{o.containerType} x{o.containerCount}</span>}
                          {o.lcNumber && <span className="text-amber-400">L/C: {o.lcNumber}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">שווי</div>
                        <div className="font-bold text-green-400">${parseFloat(o.totalValue || "0").toLocaleString()}</div>
                      </div>
                      {o.estimatedArrival && (
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">הגעה</div>
                          <div className="text-sm">{o.estimatedArrival}</div>
                        </div>
                      )}
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => openDetail(o)} className="p-1.5 hover:bg-muted rounded-lg"><Eye size={15} className="text-muted-foreground" /></button>
                        <button onClick={() => openForm(o)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 size={15} className="text-blue-400" /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/import-orders`, o.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                        {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק הזמנה זו?", { itemName: o.order_number || o.reference || String(o.id), entityType: "הזמנת יבוא" }); if (ok) deleteMutation.mutate(o.id); }} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 size={15} className="text-red-400" /></button>}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
              {filtered.length === 0 && <p className="text-muted-foreground text-center py-12">אין הזמנות</p>}
            </motion.div>
          )}

          {viewMode === "tracking" && (
            <motion.div key="tracking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <p className="text-muted-foreground text-sm">הזמנות בדרך ובתהליך שחרור</p>
              <div className="space-y-3">
                {orders.filter(o => ["נשלח", "בנמל", "בשחרור מכס", "בייצור", "הוזמן"].includes(o.status)).sort((a, b) => {
                  const da = daysUntil(a.estimatedArrival) ?? 9999;
                  const db2 = daysUntil(b.estimatedArrival) ?? 9999;
                  return da - db2;
                }).map(o => {
                  const days = daysUntil(o.estimatedArrival);
                  return (
                    <div key={o.id} className="bg-muted/40 border border-border/50 rounded-xl p-4 hover:border-cyan-500/30 transition-all cursor-pointer" onClick={() => openDetail(o)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {shippingIcon(o.shippingMethod)}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-cyan-400 font-bold">{o.orderNumber}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs border ${statusColor(o.status)}`}>{translateStatus(o.status)}</span>
                            </div>
                            <div className="text-sm text-gray-300">{o.supplierName || "—"} — {o.countryOfOrigin || "—"}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground">מוצא → יעד</div>
                            <div className="text-sm">{o.portOfOrigin || "—"} → {o.portOfDestination || "חיפה"}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground">הגעה משוערת</div>
                            <div className="text-sm">{o.estimatedArrival || "—"}</div>
                            {days !== null && days >= 0 && <span className="text-xs text-amber-400">{days} ימים</span>}
                            {days !== null && days < 0 && <span className="text-xs text-red-400">באיחור {Math.abs(days)} ימים</span>}
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground">שווי</div>
                            <div className="font-bold text-green-400">${parseFloat(o.totalValue || "0").toLocaleString()}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {orders.filter(o => ["נשלח", "בנמל", "בשחרור מכס"].includes(o.status)).length === 0 && (
                  <p className="text-muted-foreground text-center py-8">אין משלוחים פעילים</p>
                )}
              </div>
            </motion.div>
          )}

          {viewMode === "costs" && (
            <motion.div key="costs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {([
                  { icon: DollarSign, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20", value: `$${orders.reduce((s, o) => s + parseFloat(o.totalValue || "0"), 0).toLocaleString()}`, label: "שווי סחורה", sort: "totalValue" as keyof ImportOrder },
                  { icon: Ship, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20", value: `$${orders.reduce((s, o) => s + parseFloat(o.freightCost || "0"), 0).toLocaleString()}`, label: "הובלה", sort: "freightCost" as keyof ImportOrder },
                  { icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", value: `₪${orders.reduce((s, o) => s + parseFloat(o.estimatedCustomsDuty || "0"), 0).toLocaleString()}`, label: "מכס משוער", sort: "estimatedCustomsDuty" as keyof ImportOrder },
                  { icon: Shield, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", value: `$${orders.reduce((s, o) => s + parseFloat(o.insuranceValue || "0"), 0).toLocaleString()}`, label: "ביטוח", sort: "insuranceValue" as keyof ImportOrder },
                ]).map((card, i) => (
                  <div key={i} onClick={() => setCostSort(costSort === card.sort ? null : card.sort)}
                    className={`${card.bg} border rounded-xl p-4 text-center cursor-pointer hover:scale-105 transition-all ${costSort === card.sort ? "ring-2 ring-white/20" : ""}`}>
                    <card.icon className={`${card.color} mx-auto mb-1`} size={24} />
                    <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
                    <div className="text-sm text-muted-foreground">{card.label}</div>
                    {costSort === card.sort && <div className="text-[10px] text-muted-foreground mt-1">ממוין ↓</div>}
                  </div>
                ))}
              </div>
              <div className="bg-muted/40 border border-border/50 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/60">
                      <th className="text-right py-3 px-3 text-muted-foreground font-medium">הזמנה</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">שווי</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">הובלה</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">מכס</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">ביטוח</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">טיפול</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">עלות נחיתה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.filter(o => o.status !== "בוטל").sort((a, b) => costSort ? parseFloat((b[costSort] as string | null) || "0") - parseFloat((a[costSort] as string | null) || "0") : 0).map(o => (
                      <tr key={o.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(o)}>
                        <td className="py-3 px-3">
                          <span className="font-mono text-cyan-400">{o.orderNumber}</span>
                          <span className="text-xs text-muted-foreground mr-2">{o.supplierName}</span>
                        </td>
                        <td className="py-3 px-3 text-center text-green-400">${parseFloat(o.totalValue || "0").toLocaleString()}</td>
                        <td className="py-3 px-3 text-center">${parseFloat(o.freightCost || "0").toLocaleString()}</td>
                        <td className="py-3 px-3 text-center text-red-400">₪{parseFloat(o.estimatedCustomsDuty || "0").toLocaleString()}</td>
                        <td className="py-3 px-3 text-center">${parseFloat(o.insuranceValue || "0").toLocaleString()}</td>
                        <td className="py-3 px-3 text-center">${parseFloat(o.handlingCost || "0").toLocaleString()}</td>
                        <td className="py-3 px-3 text-center font-bold text-amber-400">${parseFloat(o.totalLandedCost || "0").toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {orders.length === 0 && <p className="text-muted-foreground text-center py-8">אין נתונים</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Detail Modal */}
        <AnimatePresence>
          {selectedOrder && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setSelectedOrder(null)}>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-background border border-border rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Ship className="text-cyan-400" size={22} />
                    {selectedOrder.orderNumber}
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${statusColor(selectedOrder.status)}`}>{selectedOrder.status}</span>
                  </h3>
                  <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-muted rounded-lg"><X size={20} /></button>
                </div>

                <div className="flex border-b border-border mb-6">
                  {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                    <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-cyan-500 text-cyan-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                  ))}
                </div>

                {detailTab === "details" && (<>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6 text-sm">
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">ספק:</span> <span className="font-medium mr-2">{selectedOrder.supplierName || "—"}</span></div>
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">ארץ:</span> <span className="font-medium mr-2">{selectedOrder.countryOfOrigin || "—"}</span></div>
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">Incoterms:</span> <span className="font-mono font-bold mr-2">{selectedOrder.incoterms}</span></div>
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">מטבע:</span> <span className="mr-2">{selectedOrder.currency}</span> <span className="text-xs text-muted-foreground">שער: {selectedOrder.exchangeRate}</span></div>
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">משלוח:</span> <span className="mr-2 flex items-center gap-1 inline-flex">{shippingIcon(selectedOrder.shippingMethod)} {SHIPPING_METHODS.find(m => m.value === selectedOrder.shippingMethod)?.label}</span></div>
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">מכולה:</span> <span className="mr-2">{selectedOrder.containerType || "—"} x{selectedOrder.containerCount || 1}</span></div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
                    <div className="text-xs text-muted-foreground">שווי</div>
                    <div className="font-bold text-green-400">${parseFloat(selectedOrder.totalValue || "0").toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">₪{parseFloat(selectedOrder.totalValueIls || "0").toLocaleString()}</div>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
                    <div className="text-xs text-muted-foreground">מכס</div>
                    <div className="font-bold text-red-400">₪{parseFloat(selectedOrder.estimatedCustomsDuty || "0").toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">{selectedOrder.customsDutyPct || 0}%</div>
                  </div>
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 text-center">
                    <div className="text-xs text-muted-foreground">הובלה</div>
                    <div className="font-bold text-purple-400">${parseFloat(selectedOrder.freightCost || "0").toLocaleString()}</div>
                  </div>
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-center">
                    <div className="text-xs text-muted-foreground">עלות נחיתה</div>
                    <div className="font-bold text-amber-400">${parseFloat(selectedOrder.totalLandedCost || "0").toLocaleString()}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                  <div className="bg-muted/40 rounded-lg p-3">
                    <h4 className="font-bold mb-2 flex items-center gap-2"><Calendar className="text-blue-400" size={16} /> תאריכים</h4>
                    <div className="space-y-1">
                      <div><span className="text-muted-foreground">יציאה:</span> <span className="mr-1">{selectedOrder.estimatedDeparture || "—"}</span></div>
                      <div><span className="text-muted-foreground">הגעה משוערת:</span> <span className="mr-1">{selectedOrder.estimatedArrival || "—"}</span></div>
                      <div><span className="text-muted-foreground">הגעה בפועל:</span> <span className="mr-1">{selectedOrder.actualArrival || "—"}</span></div>
                    </div>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3">
                    <h4 className="font-bold mb-2 flex items-center gap-2"><Anchor className="text-cyan-400" size={16} /> נמלים</h4>
                    <div className="space-y-1">
                      <div><span className="text-muted-foreground">מוצא:</span> <span className="mr-1">{selectedOrder.portOfOrigin || "—"}</span></div>
                      <div><span className="text-muted-foreground">יעד:</span> <span className="mr-1">{selectedOrder.portOfDestination || "חיפה"}</span></div>
                    </div>
                  </div>
                </div>

                {(selectedOrder.lcNumber || selectedOrder.insurancePolicyNumber) && (
                  <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                    {selectedOrder.lcNumber && (
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                        <h4 className="font-bold mb-2 text-amber-400">מכתב אשראי (L/C)</h4>
                        <div className="space-y-1">
                          <div><span className="text-muted-foreground">מספר:</span> <span className="mr-1 font-mono">{selectedOrder.lcNumber}</span></div>
                          <div><span className="text-muted-foreground">בנק:</span> <span className="mr-1">{selectedOrder.lcBank || "—"}</span></div>
                          <div><span className="text-muted-foreground">סכום:</span> <span className="mr-1">${parseFloat(selectedOrder.lcAmount || "0").toLocaleString()}</span></div>
                          <div><span className="text-muted-foreground">תפוגה:</span> <span className="mr-1">{selectedOrder.lcExpiryDate || "—"}</span></div>
                        </div>
                      </div>
                    )}
                    {selectedOrder.insurancePolicyNumber && (
                      <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                        <h4 className="font-bold mb-2 text-blue-400">ביטוח</h4>
                        <div className="space-y-1">
                          <div><span className="text-muted-foreground">חברה:</span> <span className="mr-1">{selectedOrder.insuranceCompany || "—"}</span></div>
                          <div><span className="text-muted-foreground">פוליסה:</span> <span className="mr-1 font-mono">{selectedOrder.insurancePolicyNumber}</span></div>
                          <div><span className="text-muted-foreground">סכום:</span> <span className="mr-1">${parseFloat(selectedOrder.insuranceValue || "0").toLocaleString()}</span></div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Items */}
                <div className="bg-muted/40 border border-border/50 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-bold flex items-center gap-2"><Package size={16} className="text-green-400" /> פריטים ({orderItems.length})</h4>
                    <button onClick={() => { setItemForm({ importOrderId: selectedOrder.id, itemName: "", itemCode: "", hsCode: "", quantity: "1", unit: "יח", unitPrice: "", customsDutyPct: "", weightKg: "", notes: "" }); setShowItemForm(true); }}
                      className="text-xs px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 rounded-lg"><Plus size={12} className="inline mr-1" />הוסף פריט</button>
                  </div>
                  {orderItems.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="text-right py-2 px-2 text-muted-foreground text-xs">שם</th>
                          <th className="text-center py-2 px-2 text-muted-foreground text-xs">קוד HS</th>
                          <th className="text-center py-2 px-2 text-muted-foreground text-xs">כמות</th>
                          <th className="text-center py-2 px-2 text-muted-foreground text-xs">מחיר</th>
                          <th className="text-center py-2 px-2 text-muted-foreground text-xs">סה"כ</th>
                          <th className="text-center py-2 px-2 text-muted-foreground text-xs">מכס %</th>
                          <th className="text-center py-2 px-2 text-muted-foreground text-xs">משקל</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderItems.map(item => (
                          <tr key={item.id} className="border-b border-border/50">
                            <td className="py-2 px-2">{item.itemName} {item.itemCode && <span className="text-xs text-muted-foreground">({item.itemCode})</span>}</td>
                            <td className="py-2 px-2 text-center font-mono text-xs">{item.hsCode || "—"}</td>
                            <td className="py-2 px-2 text-center">{item.quantity} {item.unit}</td>
                            <td className="py-2 px-2 text-center">${parseFloat(item.unitPrice || "0").toLocaleString()}</td>
                            <td className="py-2 px-2 text-center text-green-400">${parseFloat(item.totalPrice || "0").toLocaleString()}</td>
                            <td className="py-2 px-2 text-center">{item.customsDutyPct || "0"}%</td>
                            <td className="py-2 px-2 text-center text-muted-foreground">{item.weightKg ? `${item.weightKg} kg` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="text-muted-foreground text-center text-sm py-3">אין פריטים</p>}
                </div>

                {selectedOrder.notes && (
                  <div className="bg-muted/40 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground mb-1">הערות</div>
                    <p className="text-sm">{selectedOrder.notes}</p>
                  </div>
                )}
                </>)}

                {detailTab === "related" && (
                  <RelatedRecords entityType="import-orders" entityId={selectedOrder.id} relations={[
                    { key: "suppliers", label: "ספקים", endpoint: "/api/suppliers" },
                    { key: "purchase-orders", label: "הזמנות רכש", endpoint: "/api/purchase-orders" },
                  ]} />
                )}
                {detailTab === "docs" && (
                  <AttachmentsSection entityType="import-orders" entityId={selectedOrder.id} />
                )}
                {detailTab === "history" && (
                  <ActivityLog entityType="import-orders" entityId={selectedOrder.id} />
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Item Form Mini Modal */}
        <AnimatePresence>
          {showItemForm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={() => setShowItemForm(false)}>
              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
                className="bg-background border border-border rounded-xl max-w-lg w-full p-5" onClick={e => e.stopPropagation()}>
                <h4 className="font-bold mb-4">הוספת פריט</h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground block mb-1">שם פריט *</label>
                      <input value={itemForm.itemName} onChange={e => setItemForm({ ...itemForm, itemName: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                    <div><label className="text-xs text-muted-foreground block mb-1">קוד HS</label>
                      <input value={itemForm.hsCode} onChange={e => setItemForm({ ...itemForm, hsCode: e.target.value })} placeholder="8501.10" className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono focus:border-cyan-500/50 focus:outline-none" /></div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div><label className="text-xs text-muted-foreground block mb-1">כמות</label>
                      <input type="number" value={itemForm.quantity} onChange={e => setItemForm({ ...itemForm, quantity: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                    <div><label className="text-xs text-muted-foreground block mb-1">מחיר</label>
                      <input type="number" value={itemForm.unitPrice} onChange={e => setItemForm({ ...itemForm, unitPrice: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                    <div><label className="text-xs text-muted-foreground block mb-1">מכס %</label>
                      <input type="number" value={itemForm.customsDutyPct} onChange={e => setItemForm({ ...itemForm, customsDutyPct: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                    <div><label className="text-xs text-muted-foreground block mb-1">משקל (kg)</label>
                      <input type="number" value={itemForm.weightKg} onChange={e => setItemForm({ ...itemForm, weightKg: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setShowItemForm(false)} className="px-4 py-2 border border-border rounded-lg text-sm">ביטול</button>
                    <button onClick={() => {
                      const tp = parseFloat(itemForm.quantity || "0") * parseFloat(itemForm.unitPrice || "0");
                      const da = tp * parseFloat(itemForm.customsDutyPct || "0") / 100;
                      saveItemMutation.mutate({ ...itemForm, totalPrice: String(tp), customsDutyAmount: String(da) });
                    }} disabled={!itemForm.itemName} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm font-medium disabled:bg-muted">שמור</button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form Modal */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-background border border-border rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold">{editingOrder ? `עריכת ${editingOrder.orderNumber}` : "הזמנת יבוא חדשה"}</h3>
                  <button onClick={() => setShowForm(false)} className="p-2 hover:bg-muted rounded-lg"><X size={20} /></button>
                </div>

                <div className="space-y-5">
                  {/* Supplier & Origin */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">שם ספק *</label>
                      <input value={form.supplierName} onChange={e => setForm({ ...form, supplierName: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-cyan-500/50 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">ארץ מקור</label>
                      <select value={form.countryOfOrigin} onChange={e => setForm({ ...form, countryOfOrigin: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-cyan-500/50 focus:outline-none">
                        <option value="">בחר...</option>
                        {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">סטטוס</label>
                      <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-cyan-500/50 focus:outline-none">
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Trade Terms */}
                  <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                    <h4 className="font-bold text-sm mb-3 flex items-center gap-2"><Globe className="text-blue-400" size={16} /> תנאי סחר</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Incoterms</label>
                        <select value={form.incoterms} onChange={e => setForm({ ...form, incoterms: e.target.value })}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono focus:border-cyan-500/50 focus:outline-none">
                          {INCOTERMS.map(i => <option key={i} value={i}>{i}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">מטבע</label>
                        <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 focus:outline-none">
                          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">שער חליפין</label>
                        <input type="number" step="0.01" value={form.exchangeRate} onChange={e => setForm({ ...form, exchangeRate: e.target.value })}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">סיווג מכס</label>
                        <input value={form.customsClassification} onChange={e => setForm({ ...form, customsClassification: e.target.value })}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 focus:outline-none" />
                      </div>
                    </div>
                  </div>

                  {/* Financial */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div><label className="text-xs text-muted-foreground mb-1 block">שווי ($)</label>
                      <input type="number" value={form.totalValue} onChange={e => setForm({ ...form, totalValue: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">שווי (₪)</label>
                      <input type="number" value={form.totalValueIls} onChange={e => setForm({ ...form, totalValueIls: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">מכס %</label>
                      <input type="number" value={form.customsDutyPct} onChange={e => setForm({ ...form, customsDutyPct: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">מכס משוער (₪)</label>
                      <input type="number" value={form.estimatedCustomsDuty} onChange={e => setForm({ ...form, estimatedCustomsDuty: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                  </div>

                  {/* Shipping */}
                  <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                    <h4 className="font-bold text-sm mb-3 flex items-center gap-2"><Ship className="text-cyan-400" size={16} /> משלוח</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">שיטת משלוח</label>
                        <select value={form.shippingMethod} onChange={e => setForm({ ...form, shippingMethod: e.target.value })}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 focus:outline-none">
                          {SHIPPING_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">סוג מכולה</label>
                        <select value={form.containerType} onChange={e => setForm({ ...form, containerType: e.target.value })}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 focus:outline-none">
                          <option value="">בחר...</option>
                          {CONTAINER_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div><label className="text-xs text-muted-foreground mb-1 block">נמל מוצא</label>
                        <input value={form.portOfOrigin} onChange={e => setForm({ ...form, portOfOrigin: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                      <div><label className="text-xs text-muted-foreground mb-1 block">נמל יעד</label>
                        <input value={form.portOfDestination} onChange={e => setForm({ ...form, portOfDestination: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                      <div><label className="text-xs text-muted-foreground mb-1 block">תאריך יציאה</label>
                        <input type="date" value={form.estimatedDeparture} onChange={e => setForm({ ...form, estimatedDeparture: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                      <div><label className="text-xs text-muted-foreground mb-1 block">הגעה משוערת</label>
                        <input type="date" value={form.estimatedArrival} onChange={e => setForm({ ...form, estimatedArrival: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                      <div><label className="text-xs text-muted-foreground mb-1 block">הגעה בפועל</label>
                        <input type="date" value={form.actualArrival} onChange={e => setForm({ ...form, actualArrival: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                    </div>
                  </div>

                  {/* Insurance */}
                  <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                    <h4 className="font-bold text-sm mb-3 flex items-center gap-2"><Shield className="text-blue-400" size={16} /> ביטוח</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div><label className="text-xs text-muted-foreground mb-1 block">חברת ביטוח</label>
                        <input value={form.insuranceCompany} onChange={e => setForm({ ...form, insuranceCompany: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                      <div><label className="text-xs text-muted-foreground mb-1 block">מספר פוליסה</label>
                        <input value={form.insurancePolicyNumber} onChange={e => setForm({ ...form, insurancePolicyNumber: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                      <div><label className="text-xs text-muted-foreground mb-1 block">סכום ביטוח ($)</label>
                        <input type="number" value={form.insuranceValue} onChange={e => setForm({ ...form, insuranceValue: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                    </div>
                  </div>

                  {/* L/C */}
                  <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                    <h4 className="font-bold text-sm mb-3 flex items-center gap-2"><FileText className="text-amber-400" size={16} /> מכתב אשראי (L/C)</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div><label className="text-xs text-muted-foreground mb-1 block">מספר L/C</label>
                        <input value={form.lcNumber} onChange={e => setForm({ ...form, lcNumber: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono focus:border-cyan-500/50 focus:outline-none" /></div>
                      <div><label className="text-xs text-muted-foreground mb-1 block">בנק</label>
                        <input value={form.lcBank} onChange={e => setForm({ ...form, lcBank: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                      <div><label className="text-xs text-muted-foreground mb-1 block">סכום ($)</label>
                        <input type="number" value={form.lcAmount} onChange={e => setForm({ ...form, lcAmount: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                      <div><label className="text-xs text-muted-foreground mb-1 block">תפוגה</label>
                        <input type="date" value={form.lcExpiryDate} onChange={e => setForm({ ...form, lcExpiryDate: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                    </div>
                  </div>

                  {/* Costs */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div><label className="text-xs text-muted-foreground mb-1 block">עלות הובלה ($)</label>
                      <input type="number" value={form.freightCost} onChange={e => setForm({ ...form, freightCost: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">טיפול ($)</label>
                      <input type="number" value={form.handlingCost} onChange={e => setForm({ ...form, handlingCost: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">עלויות אחרות ($)</label>
                      <input type="number" value={form.otherCosts} onChange={e => setForm({ ...form, otherCosts: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">עלות נחיתה ($)</label>
                      <input type="number" value={form.totalLandedCost} onChange={e => setForm({ ...form, totalLandedCost: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                  </div>

                  {/* Agents */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground mb-1 block">עמיל מכס</label>
                      <input value={form.customsBroker} onChange={e => setForm({ ...form, customsBroker: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">חברת שילוח</label>
                      <input value={form.forwardingAgent} onChange={e => setForm({ ...form, forwardingAgent: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">איש קשר</label>
                      <input value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-cyan-500/50 focus:outline-none" /></div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">הערות</label>
                    <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-cyan-500/50 focus:outline-none resize-none" />
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-border rounded-lg text-gray-300 hover:bg-muted">ביטול</button>
                    <button onClick={handleSubmit} disabled={saveMutation.isPending || !form.supplierName}
                      className="flex items-center gap-2 px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-muted disabled:text-muted-foreground rounded-lg font-medium">
                      <Save size={16} /> {saveMutation.isPending ? "שומר..." : editingOrder ? "עדכון" : "שמירה"}
                    </button>
                  </div>
                  {saveMutation.isError && <p className="text-red-400 text-sm text-center">{(saveMutation.error as Error).message}</p>}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Send to Suppliers Modal */}
        <AnimatePresence>
          {showSendModal && savedOrder && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4" onClick={() => setShowSendModal(false)}>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-background border border-border rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()} dir="rtl">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="text-green-400" size={20} />
                      <h3 className="text-lg font-bold text-green-400">הזמנה נשמרה בהצלחה!</h3>
                    </div>
                    <div className="text-gray-300 text-sm">מספר הזמנה: <span className="font-mono font-bold text-cyan-400">{savedOrder.orderNumber}</span></div>
                  </div>
                  <button onClick={() => setShowSendModal(false)} className="p-2 hover:bg-muted rounded-lg"><X size={20} /></button>
                </div>

                <div className="bg-muted/50 rounded-xl p-4 mb-5 text-sm">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div><span className="text-muted-foreground">ספק:</span> <span className="font-medium mr-1">{savedOrder.supplierName || "—"}</span></div>
                    <div><span className="text-muted-foreground">ארץ:</span> <span className="mr-1">{savedOrder.countryOfOrigin || "—"}</span></div>
                    <div><span className="text-muted-foreground">שווי:</span> <span className="text-green-400 font-bold mr-1">${parseFloat(savedOrder.totalValue || "0").toLocaleString()}</span></div>
                    <div><span className="text-muted-foreground">Incoterms:</span> <span className="font-mono mr-1">{savedOrder.incoterms}</span></div>
                  </div>
                </div>

                <h4 className="font-bold mb-3 flex items-center gap-2"><Send size={16} className="text-cyan-400" /> שלח לספקים</h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                  {/* Local suppliers */}
                  <div>
                    <h5 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2"><Users size={14} /> ספקים מקומיים ({suppliersForSend.length})</h5>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {suppliersForSend.filter(s => s.status === "פעיל").slice(0, 20).map((s: LocalSupplier) => (
                        <label key={`local-${s.id}`} className="flex items-center gap-2 p-2 hover:bg-muted/40 rounded-lg cursor-pointer">
                          <input type="checkbox" checked={selectedSuppliers.includes(s.id)}
                            onChange={e => setSelectedSuppliers(e.target.checked ? [...selectedSuppliers, s.id] : selectedSuppliers.filter(id => id !== s.id))}
                            className="accent-cyan-500" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{s.supplierName}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              {s.phone && <span dir="ltr">{s.phone}</span>}
                              {s.email && <span className="truncate">{s.email}</span>}
                            </div>
                          </div>
                        </label>
                      ))}
                      {suppliersForSend.filter(s => s.status === "פעיל").length === 0 && <p className="text-muted-foreground text-xs text-center py-2">אין ספקים פעילים</p>}
                    </div>
                  </div>
                  {/* Foreign suppliers */}
                  <div>
                    <h5 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2"><Globe size={14} /> ספקים בחו"ל ({foreignSuppliersForSend.length})</h5>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {foreignSuppliersForSend.filter(s => s.status === "פעיל" || s.status === "VIP").slice(0, 20).map((s: ForeignSupplier) => (
                        <label key={`foreign-${s.id}`} className="flex items-center gap-2 p-2 hover:bg-muted/40 rounded-lg cursor-pointer">
                          <input type="checkbox" checked={selectedSuppliers.includes(s.id + 10000)}
                            onChange={e => setSelectedSuppliers(e.target.checked ? [...selectedSuppliers, s.id + 10000] : selectedSuppliers.filter(id => id !== s.id + 10000))}
                            className="accent-cyan-500" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{s.companyName}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <span>{s.country}</span>
                              {s.email && <span className="truncate">{s.email}</span>}
                            </div>
                          </div>
                        </label>
                      ))}
                      {foreignSuppliersForSend.filter(s => s.status === "פעיל" || s.status === "VIP").length === 0 && <p className="text-muted-foreground text-xs text-center py-2">אין ספקים חו"ל פעילים</p>}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground mb-4">{selectedSuppliers.length > 0 ? `${selectedSuppliers.length} ספקים נבחרו` : "לא נבחרו ספקים — הפעולות שלהלן יבוצעו ללא סינון ספקים"}</div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <button onClick={() => {
                    const orderMsg = `הזמנת יבוא ${savedOrder.orderNumber}\nספק: ${savedOrder.supplierName || "—"}\nארץ: ${savedOrder.countryOfOrigin || "—"}\nשווי: $${parseFloat(savedOrder.totalValue || "0").toLocaleString()}\nIncoterms: ${savedOrder.incoterms}\nהגעה משוערת: ${savedOrder.estimatedArrival || "לא נקבע"}`;
                    const localSelected = suppliersForSend.filter(s => selectedSuppliers.includes(s.id) && s.phone);
                    const foreignSelected = foreignSuppliersForSend.filter(s => selectedSuppliers.includes(s.id + 10000) && s.phone);
                    const allPhones = [...localSelected.map((s: LocalSupplier) => s.phone), ...foreignSelected.map((s: ForeignSupplier) => s.phone)].filter(Boolean);
                    if (allPhones.length > 0) {
                      allPhones.forEach(phone => {
                        const cleaned = (phone as string).replace(/\D/g, "");
                        window.open(`https://wa.me/${cleaned}?text=${encodeURIComponent(orderMsg)}`, "_blank");
                      });
                    } else {
                      window.open(`https://wa.me/?text=${encodeURIComponent(orderMsg)}`, "_blank");
                    }
                  }} className="flex flex-col items-center gap-2 p-4 bg-green-600 hover:bg-green-500 rounded-xl text-foreground text-sm font-medium transition-colors">
                    <MessageCircle size={22} />
                    <span>WhatsApp</span>
                  </button>
                  <button onClick={() => {
                    const subject = `הזמנת יבוא ${savedOrder.orderNumber} - טכנו-כל עוזי`;
                    const body = `שלום,\n\nמצ"ב פרטי הזמנת יבוא:\n\nמספר הזמנה: ${savedOrder.orderNumber}\nספק: ${savedOrder.supplierName || "—"}\nארץ מקור: ${savedOrder.countryOfOrigin || "—"}\nIncoterms: ${savedOrder.incoterms}\nמטבע: ${savedOrder.currency}\nשווי: $${parseFloat(savedOrder.totalValue || "0").toLocaleString()}\nמכס משוער: ₪${parseFloat(savedOrder.estimatedCustomsDuty || "0").toLocaleString()}\nהגעה משוערת: ${savedOrder.estimatedArrival || "לא נקבע"}\nסטטוס: ${savedOrder.status}\n\nבברכה,\nטכנו-כל עוזי`;
                    const localSelected = suppliersForSend.filter(s => selectedSuppliers.includes(s.id) && s.email);
                    const foreignSelected = foreignSuppliersForSend.filter(s => selectedSuppliers.includes(s.id + 10000) && s.email);
                    const allEmails = [...localSelected.map((s: LocalSupplier) => s.email), ...foreignSelected.map((s: ForeignSupplier) => s.email)].filter(Boolean);
                    if (allEmails.length > 0) {
                      const to = allEmails.join(",");
                      window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                    } else {
                      sendByEmail(subject, body);
                    }
                  }} className="flex flex-col items-center gap-2 p-4 bg-blue-600 hover:bg-blue-500 rounded-xl text-foreground text-sm font-medium transition-colors">
                    <Mail size={22} />
                    <span>אימייל</span>
                  </button>
                  <ExportDropdown data={[savedOrder]} headers={{ orderNumber: "מס׳ הזמנה", supplierName: "ספק", countryOfOrigin: "ארץ מקור", incoterms: "Incoterms", currency: "מטבע", totalValue: "שווי $", totalValueIls: "שווי ₪", estimatedCustomsDuty: "מכס ₪", freightCost: "הובלה $", insuranceValue: "ביטוח $", totalLandedCost: "עלות נחיתה", shippingMethod: "משלוח", portOfOrigin: "נמל מוצא", portOfDestination: "נמל יעד", estimatedDeparture: "יציאה", estimatedArrival: "הגעה משוערת", status: "סטטוס" }} filename={`import_order_${savedOrder.orderNumber}`} />
                  <button onClick={() => exportToWord(`הזמנת יבוא ${savedOrder.orderNumber}`, [savedOrder], { orderNumber: "מס׳ הזמנה", supplierName: "ספק", countryOfOrigin: "ארץ מקור", incoterms: "Incoterms", currency: "מטבע", totalValue: "שווי $", estimatedCustomsDuty: "מכס ₪", freightCost: "הובלה $", status: "סטטוס", estimatedArrival: "הגעה משוערת" }, `import_order_${savedOrder.orderNumber}`)}
                    className="flex flex-col items-center gap-2 p-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-foreground text-sm font-medium transition-colors">
                    <FileText size={22} />
                    <span>Word (.doc)</span>
                  </button>
                </div>

                <div className="flex justify-end mt-5">
                  <button onClick={() => setShowSendModal(false)} className="px-5 py-2 bg-muted hover:bg-muted rounded-lg text-sm">סגור</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Integration Toolbar */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <div className="flex items-center gap-2 bg-muted/95 backdrop-blur border border-border/50 rounded-2xl px-4 py-2.5 shadow-2xl">
            <span className="text-xs text-muted-foreground ml-2">כלים:</span>
            <button onClick={() => {
              exportToExcel(filtered.map(o => ({
                orderNumber: o.orderNumber, supplierName: o.supplierName || "", countryOfOrigin: o.countryOfOrigin || "",
                status: o.status, totalValue: o.totalValue, freightCost: o.freightCost, estimatedCustomsDuty: o.estimatedCustomsDuty,
                shippingMethod: o.shippingMethod === "sea" ? "ים" : o.shippingMethod === "air" ? "אוויר" : "יבשה",
                estimatedArrival: o.estimatedArrival || "",
              })), { orderNumber: "מס' הזמנה", supplierName: "ספק", countryOfOrigin: "ארץ", status: "סטטוס", totalValue: "שווי ($)", freightCost: "הובלה ($)", estimatedCustomsDuty: "מכס (₪)", shippingMethod: "משלוח", estimatedArrival: "הגעה" }, "import_orders");
            }} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 text-green-400 rounded-lg hover:bg-green-600/30 text-xs transition-colors">
              <Download size={14} /> Excel
            </button>
            <button onClick={() => {
              const csv = [
                "מספר הזמנה,ספק,ארץ,סטטוס,שווי ($),הובלה ($),מכס (₪),משלוח,הגעה",
                ...filtered.map(o => `${o.orderNumber},${o.supplierName || ""},${o.countryOfOrigin || ""},${o.status},${o.totalValue},${o.freightCost},${o.estimatedCustomsDuty},${o.shippingMethod},${o.estimatedArrival || ""}`)
              ].join("\n");
              const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = "import_orders.csv"; a.click();
              URL.revokeObjectURL(url);
            }} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 text-xs transition-colors">
              <Download size={14} /> CSV
            </button>
            {selectedOrder && (
              <>
                <div className="w-px h-5 bg-muted" />
                <button onClick={() => {
                  const email = selectedOrder.contactEmail;
                  if (!email) { alert("אין כתובת אימייל להזמנה זו"); return; }
                  const subject = encodeURIComponent(`הזמנת יבוא ${selectedOrder.orderNumber}`);
                  window.open(`mailto:${email}?subject=${subject}`);
                }} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 text-indigo-400 rounded-lg hover:bg-indigo-600/30 text-xs transition-colors">
                  <Mail size={14} /> אימייל
                </button>
                <button onClick={() => {
                  const phone = selectedOrder.contactPhone;
                  if (!phone) { alert("אין טלפון להזמנה זו"); return; }
                  const msg = encodeURIComponent(`שלום, לגבי הזמנת יבוא ${selectedOrder.orderNumber}`);
                  window.open(`https://wa.me/${phone.replace(/[^0-9+]/g, "")}?text=${msg}`, "_blank");
                }} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 text-green-400 rounded-lg hover:bg-green-600/30 text-xs transition-colors">
                  <MessageCircle size={14} /> WhatsApp
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
