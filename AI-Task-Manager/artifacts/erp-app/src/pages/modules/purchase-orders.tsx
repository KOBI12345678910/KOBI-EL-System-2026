import { usePermissions } from "@/hooks/use-permissions";
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { NullSafe } from "@/lib/null-safety";
import { useToast } from "@/hooks/use-toast";
import { duplicateRecord } from "@/lib/duplicate-record";
import {
  Search, Plus, Edit2, Trash2, X, Save, ShoppingCart, ChevronDown, ChevronUp,
  Filter, Download, Eye, CheckCircle2, Clock, AlertTriangle, TrendingUp,
  FileText, DollarSign, Truck, Calendar, ArrowUpRight, BarChart3,
  Package, Shield, XCircle, ArrowLeft, Percent, Hash, MapPin, CreditCard, User,
  MessageCircle, Mail, Printer, Copy
} from "lucide-react";
import ExportDropdown from "@/components/export-dropdown";
import { sendByEmail, generateEmailBody, printPage, exportToWord, shareViaWhatsApp } from "@/lib/print-utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
// J-03: Null Safety - all display values use fallbacks
const fmt = (v: any) => NullSafe.number(v, 0).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface PurchaseOrderItem {
  id: number; orderId: number; materialId: number | null; itemCode: string | null;
  itemDescription: string; quantity: string; unit: string; unitPrice: string;
  discountPercent: string | null; taxPercent: string | null;
  totalPrice: string; receivedQuantity: string | null; deliveryDate: string | null; notes: string | null;
}

interface PurchaseOrder {
  id: number; orderNumber: string; supplierId: number; requestId: number | null;
  status: string; orderDate: string | null; expectedDelivery: string | null; totalAmount: string | null;
  currency: string | null; paymentTerms: string | null; shippingAddress: string | null;
  shippingMethod: string | null; totalBeforeTax: string | null; taxAmount: string | null;
  createdBy: string | null; notes: string | null; approvedBy: string | null; approvedAt: string | null;
  createdAt: string;
  items?: PurchaseOrderItem[];
}
interface Supplier { id: number; supplierName: string; supplierNumber: string; }
interface Material { id: number; materialNumber: string; materialName: string; unit: string; standardPrice: string | null; }
interface PurchaseRequest { id: number; requestNumber: string; title: string; status: string; }

const STATUSES = ["טיוטה", "ממתין לאישור", "מאושר", "נשלח לספק", "בהזמנה", "התקבל חלקית", "התקבל במלואו", "בוטל"];
const STATUS_COLORS: Record<string, string> = {
  "טיוטה": "bg-muted/20 text-muted-foreground", "ממתין לאישור": "bg-amber-500/20 text-amber-400",
  "מאושר": "bg-emerald-500/20 text-emerald-400", "נשלח לספק": "bg-blue-500/20 text-blue-400",
  "בהזמנה": "bg-indigo-500/20 text-indigo-400", "התקבל חלקית": "bg-purple-500/20 text-purple-400",
  "התקבל במלואו": "bg-teal-500/20 text-teal-400", "בוטל": "bg-red-500/20 text-red-400",
};
const STATUS_ICONS: Record<string, any> = {
  "טיוטה": FileText, "ממתין לאישור": Clock, "מאושר": CheckCircle2,
  "נשלח לספק": Truck, "בהזמנה": Package, "התקבל חלקית": ArrowUpRight,
  "התקבל במלואו": Shield, "בוטל": XCircle,
};
const UNITS = ["יחידה", 'מ"ר', 'מ"א', "ק״ג", "טון", "ליטר", "קרטון", "חבילה", "פלטה", "צינור", "קורה"];
const CURRENCIES = ["ILS", "USD", "EUR", "GBP"];
const PAYMENT_TERMS_OPTIONS = [
  { value: "מיידי", label: "מיידי" },
  { value: "שוטף+30", label: "שוטף + 30" },
  { value: "שוטף+60", label: "שוטף + 60" },
  { value: "שוטף+90", label: "שוטף + 90" },
  { value: "שוטף+120", label: "שוטף + 120" },
];
const SHIPPING_METHODS = ["איסוף עצמי", "משלוח רגיל", "משלוח מהיר", "שילוח ימי", "שילוח אווירי", "שליח"];

interface OrderItemForm {
  materialId: string; itemCode: string; itemDescription: string; quantity: string; unit: string;
  unitPrice: string; discountPercent: string; taxPercent: string; deliveryDate: string; notes: string;
}
const emptyItem: OrderItemForm = {
  materialId: "", itemCode: "", itemDescription: "", quantity: "1", unit: "יחידה",
  unitPrice: "0", discountPercent: "0", taxPercent: "17", deliveryDate: "", notes: ""
};

const emptyForm = {
  orderNumber: "", supplierId: "", requestId: "", status: "טיוטה",
  expectedDelivery: "", currency: "ILS", paymentTerms: "",
  shippingAddress: "", shippingMethod: "", createdBy: "", notes: ""
};

function calcLineTotal(qty: string, price: string, disc: string, tax: string) {
  const q = parseFloat(qty || "0");
  const p = parseFloat(price || "0");
  const d = parseFloat(disc || "0");
  const t = parseFloat(tax || "0");
  const subtotal = q * p * (1 - d / 100);
  const total = subtotal * (1 + t / 100);
  return { subtotal, tax: subtotal * t / 100, total };
}

function getCurrencySymbol(currency: string | null) {
  switch (currency) {
    case "USD": return "$";
    case "EUR": return "€";
    case "GBP": return "£";
    default: return "₪";
  }
}

export default function PurchaseOrdersPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [orderItems, setOrderItems] = useState<OrderItemForm[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<number, PurchaseOrderItem[]>>({});
  const [detailTab, setDetailTab] = useState("details");
  const [showReceiveGoodsModal, setShowReceiveGoodsModal] = useState(false);
  const [receiveGoodsForm, setReceiveGoodsForm] = useState<Record<number, string>>({});
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({ orderNumber: { required: true, message: "מספר הזמנה נדרש" }, supplierId: { required: true, message: "ספק נדרש" } });

  const { data: ordersRaw, isLoading } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async () => { const r = await authFetch(`${API}/purchase-orders`); return r.json(); },
  });
  const orders: PurchaseOrder[] = Array.isArray(ordersRaw) ? ordersRaw : (ordersRaw?.data || ordersRaw?.items || []);

  const { data: suppliersRaw } = useQuery({
    queryKey: ["suppliers-list"],
    queryFn: async () => { const r = await authFetch(`${API}/suppliers`); return r.json(); },
  });
  const suppliers: Supplier[] = Array.isArray(suppliersRaw) ? suppliersRaw : (suppliersRaw?.data || suppliersRaw?.items || []);

  const { data: materialsRaw } = useQuery({
    queryKey: ["materials-list"],
    queryFn: async () => { const r = await authFetch(`${API}/raw-materials`); return r.json(); },
  });
  const materials: Material[] = Array.isArray(materialsRaw) ? materialsRaw : (materialsRaw?.data || materialsRaw?.items || []);

  const { data: prRaw } = useQuery({
    queryKey: ["purchase-requests-ref"],
    queryFn: async () => { const r = await authFetch(`${API}/purchase-requests`); return r.json(); },
  });
  const purchaseRequests: PurchaseRequest[] = Array.isArray(prRaw) ? prRaw : (prRaw?.data || prRaw?.items || []);

  const { data: receiptsRaw } = useQuery({
    queryKey: ["goods-receipts-ref"],
    queryFn: async () => { const r = await authFetch(`${API}/goods-receipts`); return r.json(); },
  });
  const receipts: any[] = Array.isArray(receiptsRaw) ? receiptsRaw : (receiptsRaw?.data || receiptsRaw?.items || []);

  const filtered = orders.filter(o => {
    const matchSearch = !search || o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      getSupplierName(o.supplierId).toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalValue = orders.reduce((s, o) => s + parseFloat(o.totalAmount || "0"), 0);
  const openOrders = orders.filter(o => !["התקבל במלואו", "בוטל"].includes(o.status));
  const openValue = openOrders.reduce((s, o) => s + parseFloat(o.totalAmount || "0"), 0);
  const completedOrders = orders.filter(o => o.status === "התקבל במלואו");
  const pendingApproval = orders.filter(o => o.status === "ממתין לאישור");
  const sentToSupplier = orders.filter(o => ["נשלח לספק", "בהזמנה"].includes(o.status));
  const overdueOrders = orders.filter(o => {
    if (!o.expectedDelivery || ["התקבל במלואו", "בוטל"].includes(o.status)) return false;
    return new Date(o.expectedDelivery) < new Date();
  });
  const avgOrderValue = orders.length > 0 ? totalValue / orders.length : 0;

  const statusDistribution = STATUSES.map(s => ({
    status: s,
    count: orders.filter(o => o.status === s).length,
    color: STATUS_COLORS[s],
  })).filter(s => s.count > 0);

  const getMatchingReceipts = (orderId: number) => receipts.filter((r: any) => r.orderId === orderId);

  const createMut = useMutation({
    mutationFn: async (data: { form: typeof emptyForm; items: OrderItemForm[] }) => {
      let totalBeforeTax = 0;
      let taxTotal = 0;
      for (const item of data.items) {
        const lc = calcLineTotal(item.quantity, item.unitPrice, item.discountPercent, item.taxPercent);
        totalBeforeTax += lc.subtotal;
        taxTotal += lc.tax;
      }
      const grandTotal = totalBeforeTax + taxTotal;
      const payload = {
        ...data.form,
        supplierId: parseInt(data.form.supplierId),
        requestId: data.form.requestId ? parseInt(data.form.requestId) : null,
        totalAmount: String(grandTotal),
        totalBeforeTax: String(totalBeforeTax),
        taxAmount: String(taxTotal),
      };
      const r = await authFetch(`${API}/purchase-orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      const created = await r.json();
      const failedItems: string[] = [];
      for (const item of data.items) {
        if (!item.itemDescription) continue;
        const lc = calcLineTotal(item.quantity, item.unitPrice, item.discountPercent, item.taxPercent);
        const ir = await authFetch(`${API}/purchase-orders/${created.id}/items`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...item,
            materialId: item.materialId ? parseInt(item.materialId) : null,
            totalPrice: String(lc.total),
            deliveryDate: item.deliveryDate || null,
          }),
        });
        if (!ir.ok) failedItems.push(item.itemDescription);
      }
      if (failedItems.length > 0) throw new Error(`ההזמנה נוצרה אבל ${failedItems.length} פריטים נכשלו`);
      return created;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-orders"] }); closeForm(); },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof emptyForm }) => {
      const r = await authFetch(`${API}/purchase-orders/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        ...data, supplierId: parseInt(data.supplierId),
        requestId: data.requestId ? parseInt(data.requestId) : null,
      })});
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); } return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-orders"] }); closeForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => { await authFetch(`${API}/purchase-orders/${id}`, { method: "DELETE" }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-orders"] }); setDeleteConfirm(null); },
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, status, approvedBy }: { id: number; status: string; approvedBy?: string }) => {
      const body: any = { status };
      if (approvedBy) body.approvedBy = approvedBy;
      const r = await authFetch(`${API}/purchase-orders/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error("Failed to update status");
      return r.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["raw-materials"] });
      qc.invalidateQueries({ queryKey: ["inventory-transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts-payable"] });
      qc.invalidateQueries({ queryKey: ["budgets"] });
      qc.invalidateQueries({ queryKey: ["executive-dashboard"] });
      qc.invalidateQueries({ queryKey: ["cross-module-summary"] });
      if (selectedOrder) setSelectedOrder({ ...selectedOrder, status: data.status, approvedBy: data.approvedBy, approvedAt: data.approvedAt });
    },
  });

  const receiveGoodsMut = useMutation({
    mutationFn: async (data: { orderId: number; items: Array<{ itemId: number; quantity: number }> }) => {
      const r = await authFetch(`${API}/goods-receipts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: data.orderId, items: data.items })
      });
      if (!r.ok) throw new Error("Failed to receive goods");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["goods-receipts-ref"] });
      qc.invalidateQueries({ queryKey: ["raw-materials"] });
      qc.invalidateQueries({ queryKey: ["inventory-transactions"] });
      toast({ title: "הודעה", description: "סחורה התקבלה בהצלחה", variant: "default" });
      setShowReceiveGoodsModal(false);
      if (selectedOrder) {
        const totalQuantity = selectedOrder.items?.reduce((sum, item) => sum + parseFloat(item.quantity || "0"), 0) || 0;
        const receivedQuantity = selectedOrder.items?.reduce((sum, item) => sum + parseFloat(receiveGoodsForm[item.id] || "0"), 0) || 0;
        const newStatus = receivedQuantity >= totalQuantity ? "התקבל במלואו" : "התקבל חלקית";
        setSelectedOrder({ ...selectedOrder, status: newStatus, items: selectedOrder.items?.map(item => ({ ...item, receivedQuantity: receiveGoodsForm[item.id] || item.receivedQuantity })) });
      }
    },
  });

  function closeForm() { setShowForm(false); setEditingId(null); setForm(emptyForm); setOrderItems([]); }
  async function createFromPR(pr: PurchaseRequest) {
    const r = await authFetch(`${API}/purchase-requests/${pr.id}`);
    const prFull = await r.json();
    const newOrderNum = `PO-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    setForm({ ...emptyForm, orderNumber: newOrderNum, requestId: String(pr.id), notes: `נוצר מדרישת רכש ${pr.requestNumber}` });
    const prItems: OrderItemForm[] = (prFull.items || []).map((item: any) => ({
      materialId: item.materialId ? String(item.materialId) : "",
      itemCode: "", itemDescription: item.itemDescription,
      quantity: item.quantity, unit: item.unit,
      unitPrice: item.estimatedPrice || "0",
      discountPercent: "0", taxPercent: "17",
      deliveryDate: "", notes: item.notes || "",
    }));
    setOrderItems(prItems.length > 0 ? prItems : [{ ...emptyItem }]);
    setEditingId(null);
    setShowForm(true);
  }
  function openEdit(o: PurchaseOrder) {
    setForm({
      orderNumber: o.orderNumber, supplierId: String(o.supplierId),
      requestId: o.requestId ? String(o.requestId) : "", status: o.status,
      expectedDelivery: o.expectedDelivery || "", currency: o.currency || "ILS",
      paymentTerms: o.paymentTerms || "", shippingAddress: o.shippingAddress || "",
      shippingMethod: o.shippingMethod || "", createdBy: o.createdBy || "", notes: o.notes || ""
    });
    setEditingId(o.id); setShowForm(true); setOrderItems([]);
  }
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.orderNumber || !form.supplierId) return;
    editingId ? updateMut.mutate({ id: editingId, data: form }) : createMut.mutate({ form, items: orderItems });
  }

  function addItem() { setOrderItems([...orderItems, { ...emptyItem }]); }
  function removeItem(idx: number) { setOrderItems(orderItems.filter((_, i) => i !== idx)); }
  function updateItem(idx: number, field: keyof OrderItemForm, value: string) {
    const updated = [...orderItems];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === "materialId" && value) {
      const mat = materials.find(m => m.id === parseInt(value));
      if (mat) {
        updated[idx].itemDescription = mat.materialName;
        updated[idx].unit = mat.unit;
        updated[idx].itemCode = mat.materialNumber;
        if (mat.standardPrice) updated[idx].unitPrice = mat.standardPrice;
      }
    }
    setOrderItems(updated);
  }

  async function loadOrderItems(orderId: number) {
    if (expandedRow === orderId) { setExpandedRow(null); return; }
    if (!expandedItems[orderId]) {
      const r = await authFetch(`${API}/purchase-orders/${orderId}`);
      const data = await r.json();
      if (data.items) setExpandedItems(prev => ({ ...prev, [orderId]: data.items }));
    }
    setExpandedRow(orderId);
  }

  async function openOrderDetail(o: PurchaseOrder) {
    const r = await authFetch(`${API}/purchase-orders/${o.id}`);
    const data = await r.json();
    setSelectedOrder({ ...data, items: data.items || [] });
  }

  const getSupplierName = (id: number) => suppliers.find(s => s.id === id)?.supplierName || `ספק ${id}`;

  const itemsTotalBeforeTax = orderItems.reduce((s, i) => {
    const lc = calcLineTotal(i.quantity, i.unitPrice, i.discountPercent, i.taxPercent);
    return s + lc.subtotal;
  }, 0);
  const itemsTaxTotal = orderItems.reduce((s, i) => {
    const lc = calcLineTotal(i.quantity, i.unitPrice, i.discountPercent, i.taxPercent);
    return s + lc.tax;
  }, 0);
  const itemsGrandTotal = itemsTotalBeforeTax + itemsTaxTotal;

  function getDaysUntilDelivery(date: string | null) {
    if (!date) return null;
    return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  const processSteps = [
    { status: "טיוטה", label: "טיוטה" },
    { status: "ממתין לאישור", label: "אישור" },
    { status: "מאושר", label: "מאושר" },
    { status: "נשלח לספק", label: "נשלח" },
    { status: "בהזמנה", label: "בהזמנה" },
    { status: "התקבל חלקית", label: "חלקי" },
    { status: "התקבל במלואו", label: "הושלם" },
  ];

  function getStepIndex(status: string) {
    if (status === "בוטל") return -1;
    return processSteps.findIndex(s => s.status === status);
  }

  return (
    <div className="min-h-screen" dir="rtl">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-foreground" />
              </div>
              הזמנות רכש
            </h1>
            <p className="text-muted-foreground mt-1">ניהול מקיף של הזמנות רכש, מעקב אספקה ותהליכי אישור</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => shareViaWhatsApp(
                "רשימת הזמנות רכש - טכנו-כל עוזי",
                orders,
                (o) => { const po = o as PurchaseOrder; return `• ${po.orderNumber} | ${po.status} | ₪${parseFloat(po.totalAmount || "0").toLocaleString()}`; }
              )} className="flex items-center gap-2 px-3 py-2 bg-green-700 hover:bg-green-600 rounded-xl text-sm text-foreground transition-colors">
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </button>
            <ExportDropdown data={orders} headers={{ orderNumber: "מס׳ הזמנה", status: "סטטוס", orderDate: "תאריך", expectedDelivery: "אספקה משוערת", totalAmount: "סכום ₪", currency: "מטבע", paymentTerms: "תנאי תשלום" }} filename={"purchase_orders"} />
            <button onClick={() => {
                if (orders.length === 0) { alert("אין הזמנות לשליחה. אנא ודא שקיימות רשומות ברשימה."); return; }
                sendByEmail("הזמנות רכש - טכנו-כל עוזי", generateEmailBody("הזמנות רכש", orders, { orderNumber: "מס׳ הזמנה", status: "סטטוס", totalAmount: "סכום ₪" }));
              }}
              className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted rounded-xl text-sm text-gray-300 transition-colors">
              <Mail className="w-4 h-4" /> אימייל
            </button>
            <button onClick={() => exportToWord("הזמנות רכש", orders, { orderNumber: "מס׳ הזמנה", status: "סטטוס", orderDate: "תאריך", expectedDelivery: "אספקה משוערת", totalAmount: "סכום ₪", currency: "מטבע" }, "purchase_orders")}
              className="flex items-center gap-2 px-3 py-2 bg-indigo-700 hover:bg-indigo-600 rounded-xl text-sm text-foreground transition-colors">
              <FileText className="w-4 h-4" /> Word
            </button>
            <button onClick={() => printPage("הזמנות רכש")}
              className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted rounded-xl text-sm text-gray-300 transition-colors">
              <Printer className="w-4 h-4" /> הדפסה
            </button>
            {purchaseRequests.filter(pr => pr.status === "מאושר").length > 0 && (
              <div className="relative group">
                <button className="flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-foreground rounded-xl font-medium transition-colors text-sm">
                  <FileText className="w-4 h-4" />צור מ-PR מאושר
                  <ChevronDown className="w-4 h-4" />
                </button>
                <div className="absolute left-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl z-20 min-w-[260px] hidden group-hover:block">
                  {purchaseRequests.filter(pr => pr.status === "מאושר").slice(0, 8).map(pr => (
                    <button key={pr.id} onClick={() => createFromPR(pr)}
                      className="w-full px-4 py-2.5 text-right text-sm text-foreground hover:bg-muted border-b border-border/50 last:border-0 first:rounded-t-xl last:rounded-b-xl">
                      <span className="text-emerald-400 font-mono text-xs block">{pr.requestNumber}</span>
                      <span className="block truncate">{pr.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => { setForm(emptyForm); setEditingId(null); setOrderItems([]); setShowForm(true); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-foreground rounded-xl font-medium transition-colors">
              <Plus className="w-5 h-5" />הזמנה חדשה
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "סה״כ הזמנות", value: orders.length, icon: ShoppingCart, color: "text-blue-400", bg: "bg-blue-500/10" },
            { label: "פתוחות", value: openOrders.length, icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
            { label: "ממתינות לאישור", value: pendingApproval.length, icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10" },
            { label: "נשלחו לספק", value: sentToSupplier.length, icon: Truck, color: "text-indigo-400", bg: "bg-indigo-500/10" },
            { label: "הושלמו", value: completedOrders.length, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
            { label: "באיחור", value: overdueOrders.length, icon: XCircle, color: overdueOrders.length > 0 ? "text-red-400" : "text-muted-foreground", bg: overdueOrders.length > 0 ? "bg-red-500/10" : "bg-muted/10" },
            { label: "שווי פתוח", value: `₪${Math.round(openValue).toLocaleString()}`, icon: DollarSign, color: "text-purple-400", bg: "bg-purple-500/10" },
            { label: "ממוצע להזמנה", value: `₪${Math.round(avgOrderValue).toLocaleString()}`, icon: TrendingUp, color: "text-cyan-400", bg: "bg-cyan-500/10" },
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

        {statusDistribution.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-violet-400" />
              התפלגות סטטוסים
            </h3>
            <div className="flex items-center gap-1 h-6 rounded-full overflow-hidden bg-input">
              {statusDistribution.map((sd, i) => {
                const pct = (sd.count / orders.length) * 100;
                return pct > 0 ? (
                  <div key={i} className={`h-full ${sd.color.split(" ")[0]} flex items-center justify-center transition-all cursor-pointer`}
                    style={{ width: `${pct}%`, minWidth: pct > 3 ? "auto" : "4px" }}
                    title={`${sd.status}: ${sd.count}`}
                    onClick={() => setStatusFilter(statusFilter === sd.status ? "all" : sd.status)}>
                    {pct > 8 && <span className="text-[10px] font-bold px-1">{sd.count}</span>}
                  </div>
                ) : null;
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {statusDistribution.map((sd, i) => (
                <button key={i} onClick={() => setStatusFilter(statusFilter === sd.status ? "all" : sd.status)}
                  className={`flex items-center gap-1 text-xs ${statusFilter === sd.status ? "opacity-100 ring-1 ring-gray-600 rounded-md px-1.5 py-0.5" : "opacity-60"} hover:opacity-100 transition-opacity`}>
                  <span className={`w-2 h-2 rounded-full ${sd.color.split(" ")[0]}`} />
                  <span className="text-muted-foreground">{sd.status}: {sd.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input type="text" placeholder="חיפוש לפי מספר הזמנה, ספק..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-foreground placeholder-gray-500 focus:border-blue-500 focus:outline-none" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 bg-card border border-border rounded-xl text-foreground focus:border-blue-500 focus:outline-none">
            <option value="all">כל הסטטוסים</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <ShoppingCart className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl text-muted-foreground">אין הזמנות רכש</h3>
            <p className="text-muted-foreground text-sm mt-2">{search || statusFilter !== "all" ? "נסה לשנות את מסנני החיפוש" : 'לחץ "הזמנה חדשה" כדי להתחיל'}</p>
          </div>
        ) : (
          <>
          <BulkActions selectedIds={bulk.selectedIds} onClear={bulk.clear} entityName="הזמנות רכש" actions={defaultBulkActions(bulk.selectedIds, bulk.clear, () => qc.invalidateQueries({ queryKey: ["purchase-orders"] }), `${API}/purchase-orders`)} />
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-input flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{filtered.length} הזמנות {statusFilter !== "all" ? `(מסונן: ${statusFilter})` : ""}</span>
              <span className="text-sm text-muted-foreground">שווי כולל: ₪{Math.round(totalValue).toLocaleString()}</span>
            </div>
            <table className="w-full text-right">
              <thead><tr className="border-b border-border bg-input">
                <th className="px-4 py-3 w-10"><BulkCheckbox checked={bulk.isAllSelected(filtered)} onChange={() => bulk.toggleAll(filtered)} /></th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm w-8"></th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">מספר</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">ספק</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">תנאי תשלום</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">תאריך</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">אספקה צפויה</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">לפני מע״מ</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">סה״כ</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">סטטוס</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">התאמה</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">פעולות</th>
              </tr></thead>
              <tbody>
                {filtered.map(o => {
                  const days = getDaysUntilDelivery(o.expectedDelivery);
                  const isOverdue = days !== null && days < 0 && !["התקבל במלואו", "בוטל"].includes(o.status);
                  const matchingReceipts = getMatchingReceipts(o.id);
                  const hasReceipt = matchingReceipts.length > 0;
                  const stepIdx = getStepIndex(o.status);
                  const cs = getCurrencySymbol(o.currency);
                  return (
                    <React.Fragment key={o.id}>
                      <tr className={`border-b border-border/50 hover:bg-muted cursor-pointer transition-colors ${isOverdue ? "bg-red-500/5" : ""} ${bulk.isSelected(o.id) ? "bg-primary/5" : ""}`}
                        onClick={() => loadOrderItems(o.id)}>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}><BulkCheckbox checked={bulk.isSelected(o.id)} onChange={() => bulk.toggle(o.id)} /></td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {expandedRow === o.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-blue-400 font-mono text-sm">{o.orderNumber}</span>
                          {o.requestId && <span className="text-muted-foreground text-xs block">דרישה מקושרת</span>}
                        </td>
                        <td className="px-4 py-3 text-foreground text-sm">{getSupplierName(o.supplierId)}</td>
                        <td className="px-4 py-3 text-muted-foreground text-sm">{o.paymentTerms || "—"}</td>
                        <td className="px-4 py-3 text-gray-300 text-sm">{o.orderDate ? new Date(o.orderDate).toLocaleDateString("he-IL") : "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-sm ${isOverdue ? "text-red-400 font-bold" : "text-gray-300"}`}>
                            {o.expectedDelivery ? new Date(o.expectedDelivery).toLocaleDateString("he-IL") : "—"}
                          </span>
                          {days !== null && !["התקבל במלואו", "בוטל"].includes(o.status) && (
                            <span className={`block text-xs ${isOverdue ? "text-red-400" : days <= 3 ? "text-amber-400" : "text-muted-foreground"}`}>
                              {isOverdue ? `באיחור ${Math.abs(days)} ימים` : days === 0 ? "היום" : `עוד ${days} ימים`}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-sm" dir="ltr">
                          {o.totalBeforeTax ? `${cs}${parseFloat(o.totalBeforeTax).toLocaleString()}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-foreground font-mono text-sm font-medium" dir="ltr">
                          {o.totalAmount ? `${cs}${parseFloat(o.totalAmount).toLocaleString()}` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[o.status] || ""}`}>
                            {STATUS_ICONS[o.status] && (() => { const Icon = STATUS_ICONS[o.status]; return <Icon className="w-3 h-3" />; })()}
                            {o.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${o.requestId ? "bg-emerald-400" : "bg-muted"}`} title={o.requestId ? "דרישה מקושרת" : "ללא דרישה"} />
                            <div className={`w-2 h-2 rounded-full ${hasReceipt ? "bg-emerald-400" : "bg-muted"}`} title={hasReceipt ? "יש קבלת סחורה" : "ללא קבלה"} />
                            <div className={`w-2 h-2 rounded-full ${o.totalAmount && parseFloat(o.totalAmount) > 0 ? "bg-emerald-400" : "bg-muted"}`} title="חשבונית" />
                          </div>
                          <span className="text-[10px] text-muted-foreground block mt-0.5">
                            {[o.requestId ? "PReq" : null, hasReceipt ? "GR" : null, o.totalAmount ? "INV" : null].filter(Boolean).join(" · ") || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button onClick={() => openOrderDetail(o)} className="p-1.5 text-muted-foreground hover:text-blue-400 rounded-md" title="צפה בפרטים"><Eye className="w-4 h-4" /></button>
                            <button onClick={() => openEdit(o)} className="p-1.5 text-muted-foreground hover:text-amber-400 rounded-md" title="ערוך"><Edit2 className="w-4 h-4" /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/purchase-orders`, o.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                            {isSuperAdmin && <button onClick={() => setDeleteConfirm(o.id)} className="p-1.5 text-muted-foreground hover:text-red-400 rounded-md" title="מחק"><Trash2 className="w-4 h-4" /></button>}
                          </div>
                        </td>
                      </tr>
                      {expandedRow === o.id && (
                        <tr key={`expanded-${o.id}`}>
                          <td colSpan={11} className="px-4 py-4 bg-input">
                            <div className="space-y-4">
                              <div className="flex items-center gap-1 overflow-x-auto pb-2">
                                {processSteps.map((step, si) => {
                                  const active = si <= stepIdx;
                                  const current = si === stepIdx;
                                  return (
                                    <div key={si} className="flex items-center gap-1">
                                      <div className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${current ? "bg-blue-600 text-foreground ring-2 ring-blue-400/30" : active ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                                        {step.label}
                                      </div>
                                      {si < processSteps.length - 1 && <ArrowLeft className={`w-3 h-3 flex-shrink-0 ${active ? "text-emerald-500" : "text-foreground"}`} />}
                                    </div>
                                  );
                                })}
                                {o.status === "בוטל" && <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400">בוטל</span>}
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                <div className="bg-card rounded-lg p-3">
                                  <p className="text-muted-foreground text-xs mb-1">תנאי תשלום</p>
                                  <p className="text-foreground text-sm font-medium">{o.paymentTerms || "—"}</p>
                                </div>
                                <div className="bg-card rounded-lg p-3">
                                  <p className="text-muted-foreground text-xs mb-1">שיטת משלוח</p>
                                  <p className="text-foreground text-sm font-medium">{o.shippingMethod || "—"}</p>
                                </div>
                                <div className="bg-card rounded-lg p-3">
                                  <p className="text-muted-foreground text-xs mb-1">מטבע</p>
                                  <p className="text-foreground text-sm font-medium">{o.currency || "ILS"}</p>
                                </div>
                                <div className="bg-card rounded-lg p-3">
                                  <p className="text-muted-foreground text-xs mb-1">אישר</p>
                                  <p className="text-foreground text-sm font-medium">{o.approvedBy || "—"}</p>
                                </div>
                                <div className="bg-card rounded-lg p-3">
                                  <p className="text-muted-foreground text-xs mb-1">קבלות סחורה</p>
                                  <p className={`text-sm font-medium ${hasReceipt ? "text-emerald-400" : "text-muted-foreground"}`}>{matchingReceipts.length || "אין"}</p>
                                </div>
                              </div>

                              {expandedItems[o.id] && expandedItems[o.id].length > 0 && (
                                <table className="w-full text-right text-sm">
                                  <thead><tr className="text-muted-foreground border-b border-border">
                                    <th className="pb-2 pr-2">קוד</th>
                                    <th className="pb-2 pr-2">פריט</th>
                                    <th className="pb-2 pr-2">כמות</th>
                                    <th className="pb-2 pr-2">יחידה</th>
                                    <th className="pb-2 pr-2">מחיר</th>
                                    <th className="pb-2 pr-2">הנחה%</th>
                                    <th className="pb-2 pr-2">מע״מ%</th>
                                    <th className="pb-2 pr-2">סה״כ</th>
                                    <th className="pb-2 pr-2">התקבל</th>
                                    <th className="pb-2 pr-2">מילוי</th>
                                    <th className="pb-2 pr-2">אספקה</th>
                                  </tr></thead>
                                  <tbody>
                                    {expandedItems[o.id].map((item: PurchaseOrderItem) => {
                                      const ordered = parseFloat(item.quantity || "0");
                                      const received = parseFloat(item.receivedQuantity || "0");
                                      const pct = ordered > 0 ? Math.round((received / ordered) * 100) : 0;
                                      return (
                                        <tr key={item.id} className="border-t border-border/30">
                                          <td className="py-2 pr-2 text-muted-foreground font-mono text-xs">{item.itemCode || "—"}</td>
                                          <td className="py-2 pr-2 text-gray-300">{item.itemDescription}</td>
                                          <td className="py-2 pr-2 text-gray-300">{item.quantity}</td>
                                          <td className="py-2 pr-2 text-muted-foreground">{item.unit}</td>
                                          <td className="py-2 pr-2 text-gray-300" dir="ltr">{cs}{parseFloat(item.unitPrice).toLocaleString()}</td>
                                          <td className="py-2 pr-2 text-muted-foreground">{item.discountPercent || "0"}%</td>
                                          <td className="py-2 pr-2 text-muted-foreground">{item.taxPercent || "17"}%</td>
                                          <td className="py-2 pr-2 text-foreground font-medium" dir="ltr">{cs}{parseFloat(item.totalPrice).toLocaleString()}</td>
                                          <td className="py-2 pr-2 text-muted-foreground">{item.receivedQuantity || "0"}</td>
                                          <td className="py-2 pr-2">
                                            <div className="flex items-center gap-2">
                                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-500" : "bg-muted"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                              </div>
                                              <span className={`text-xs ${pct >= 100 ? "text-emerald-400" : pct > 0 ? "text-amber-400" : "text-muted-foreground"}`}>{pct}%</span>
                                            </div>
                                          </td>
                                          <td className="py-2 pr-2 text-muted-foreground text-xs">{item.deliveryDate ? new Date(item.deliveryDate).toLocaleDateString("he-IL") : "—"}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                              {(!expandedItems[o.id] || expandedItems[o.id].length === 0) && (
                                <p className="text-muted-foreground text-sm text-center py-2">אין פריטים בהזמנה זו</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {selectedOrder && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-6 overflow-y-auto" onClick={() => setSelectedOrder(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl w-full max-w-5xl mx-4 mb-10" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div>
                  <h2 className="text-xl font-bold text-foreground">הזמנה {selectedOrder.orderNumber}</h2>
                  <p className="text-sm text-muted-foreground">{getSupplierName(selectedOrder.supplierId)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-lg text-sm font-medium ${STATUS_COLORS[selectedOrder.status] || ""}`}>{selectedOrder.status}</span>
                  <button onClick={() => setSelectedOrder(null)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="flex border-b border-border px-6">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              <div className="p-6 space-y-5">
              {detailTab === "details" && (<>
                <div className="flex items-center gap-1 overflow-x-auto pb-2">
                  {processSteps.map((step, si) => {
                    const idx = getStepIndex(selectedOrder.status);
                    const active = si <= idx;
                    const current = si === idx;
                    return (
                      <div key={si} className="flex items-center gap-1">
                        <div className={`px-3 py-2 rounded-lg text-xs font-medium ${current ? "bg-blue-600 text-foreground ring-2 ring-blue-400/30" : active ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                          {step.label}
                        </div>
                        {si < processSteps.length - 1 && <ArrowLeft className={`w-3 h-3 flex-shrink-0 ${active ? "text-emerald-500" : "text-foreground"}`} />}
                      </div>
                    );
                  })}
                  {selectedOrder.status === "בוטל" && <span className="px-3 py-2 rounded-lg text-xs font-medium bg-red-500/20 text-red-400">בוטל</span>}
                </div>

                {selectedOrder.status === "טיוטה" && (
                  <button onClick={() => statusMut.mutate({ id: selectedOrder.id, status: "ממתין לאישור" })}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-foreground rounded-lg text-sm font-medium">
                    <Clock className="w-4 h-4" />שלח לאישור
                  </button>
                )}
                {selectedOrder.status === "ממתין לאישור" && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => statusMut.mutate({ id: selectedOrder.id, status: "מאושר", approvedBy: "מנהל" })}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-foreground rounded-lg text-sm font-medium">
                      <CheckCircle2 className="w-4 h-4" />אשר הזמנה
                    </button>
                    <button onClick={() => statusMut.mutate({ id: selectedOrder.id, status: "בוטל" })}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm font-medium">
                      <XCircle className="w-4 h-4" />דחה
                    </button>
                  </div>
                )}
                {selectedOrder.status === "מאושר" && (
                  <button onClick={() => statusMut.mutate({ id: selectedOrder.id, status: "נשלח לספק" })}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-foreground rounded-lg text-sm font-medium">
                    <Truck className="w-4 h-4" />שלח לספק
                  </button>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-input rounded-xl p-4">
                    <p className="text-muted-foreground text-xs flex items-center gap-1"><Calendar className="w-3 h-3" />תאריך הזמנה</p>
                    <p className="text-foreground font-medium mt-1">{selectedOrder.orderDate ? new Date(selectedOrder.orderDate).toLocaleDateString("he-IL") : "—"}</p>
                  </div>
                  <div className="bg-input rounded-xl p-4">
                    <p className="text-muted-foreground text-xs flex items-center gap-1"><Truck className="w-3 h-3" />אספקה צפויה</p>
                    <p className="text-foreground font-medium mt-1">{selectedOrder.expectedDelivery ? new Date(selectedOrder.expectedDelivery).toLocaleDateString("he-IL") : "—"}</p>
                  </div>
                  <div className="bg-input rounded-xl p-4">
                    <p className="text-muted-foreground text-xs flex items-center gap-1"><CreditCard className="w-3 h-3" />תנאי תשלום</p>
                    <p className="text-foreground font-medium mt-1">{selectedOrder.paymentTerms || "—"}</p>
                  </div>
                  <div className="bg-input rounded-xl p-4">
                    <p className="text-muted-foreground text-xs flex items-center gap-1"><Truck className="w-3 h-3" />שיטת משלוח</p>
                    <p className="text-foreground font-medium mt-1">{selectedOrder.shippingMethod || "—"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-input rounded-xl p-4">
                    <p className="text-muted-foreground text-xs flex items-center gap-1"><MapPin className="w-3 h-3" />כתובת אספקה</p>
                    <p className="text-foreground font-medium mt-1 text-sm">{selectedOrder.shippingAddress || "—"}</p>
                  </div>
                  <div className="bg-input rounded-xl p-4">
                    <p className="text-muted-foreground text-xs flex items-center gap-1"><User className="w-3 h-3" />נוצר ע״י</p>
                    <p className="text-foreground font-medium mt-1">{selectedOrder.createdBy || "—"}</p>
                  </div>
                  <div className="bg-input rounded-xl p-4">
                    <p className="text-muted-foreground text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />אישר</p>
                    <p className="text-foreground font-medium mt-1">{selectedOrder.approvedBy || "—"}</p>
                    {selectedOrder.approvedAt && <p className="text-muted-foreground text-xs mt-0.5">{new Date(selectedOrder.approvedAt).toLocaleDateString("he-IL")}</p>}
                  </div>
                  <div className="bg-input rounded-xl p-4">
                    <p className="text-muted-foreground text-xs">מטבע</p>
                    <p className="text-foreground font-medium mt-1">{selectedOrder.currency || "ILS"}</p>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-[#12141a] to-[#1a1d23] rounded-xl p-5 border border-border">
                  <h3 className="text-sm font-medium text-muted-foreground mb-4">סיכום כספי</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="text-center">
                      <p className="text-muted-foreground text-xs mb-1">לפני מע״מ</p>
                      <p className="text-foreground text-xl font-bold font-mono" dir="ltr">
                        {getCurrencySymbol(selectedOrder.currency)}{parseFloat(selectedOrder.totalBeforeTax || "0").toLocaleString()}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground text-xs mb-1">מע״מ (17%)</p>
                      <p className="text-amber-400 text-xl font-bold font-mono" dir="ltr">
                        {getCurrencySymbol(selectedOrder.currency)}{parseFloat(selectedOrder.taxAmount || "0").toLocaleString()}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground text-xs mb-1">סה״כ כולל מע״מ</p>
                      <p className="text-emerald-400 text-lg sm:text-2xl font-bold font-mono" dir="ltr">
                        {getCurrencySymbol(selectedOrder.currency)}{parseFloat(selectedOrder.totalAmount || "0").toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Package className="w-5 h-5 text-cyan-400" />
                    התאמה תלת-כיוונית (3-Way Matching)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className={`rounded-xl p-4 border-2 text-center ${selectedOrder.requestId ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-input"}`}>
                      <FileText className={`w-8 h-8 mx-auto mb-2 ${selectedOrder.requestId ? "text-emerald-400" : "text-muted-foreground"}`} />
                      <p className="text-sm font-medium text-foreground">דרישת רכש</p>
                      <p className={`text-xs mt-1 ${selectedOrder.requestId ? "text-emerald-400" : "text-muted-foreground"}`}>
                        {selectedOrder.requestId ? "מקושר" : "לא מקושר"}
                      </p>
                    </div>
                    <div className="rounded-xl p-4 border-2 border-blue-500/30 bg-blue-500/5 text-center">
                      <ShoppingCart className="w-8 h-8 mx-auto mb-2 text-blue-400" />
                      <p className="text-sm font-medium text-foreground">הזמנת רכש</p>
                      <p className="text-xs mt-1 text-blue-400">{selectedOrder.orderNumber}</p>
                    </div>
                    <div className={`rounded-xl p-4 border-2 text-center ${getMatchingReceipts(selectedOrder.id).length > 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-input"}`}>
                      <Package className={`w-8 h-8 mx-auto mb-2 ${getMatchingReceipts(selectedOrder.id).length > 0 ? "text-emerald-400" : "text-muted-foreground"}`} />
                      <p className="text-sm font-medium text-foreground">קבלת סחורה</p>
                      <p className={`text-xs mt-1 ${getMatchingReceipts(selectedOrder.id).length > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                        {getMatchingReceipts(selectedOrder.id).length > 0 ? `${getMatchingReceipts(selectedOrder.id).length} קבלות` : "ממתין"}
                      </p>
                    </div>
                  </div>
                </div>

                {selectedOrder.items && selectedOrder.items.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-3">פריטים ({selectedOrder.items.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-sm">
                        <thead><tr className="text-muted-foreground border-b border-border">
                          <th className="pb-2 pr-2">קוד</th>
                          <th className="pb-2 pr-2">פריט</th>
                          <th className="pb-2 pr-2">כמות</th>
                          <th className="pb-2 pr-2">יחידה</th>
                          <th className="pb-2 pr-2">מחיר</th>
                          <th className="pb-2 pr-2">הנחה%</th>
                          <th className="pb-2 pr-2">מע״מ%</th>
                          <th className="pb-2 pr-2">סה״כ</th>
                          <th className="pb-2 pr-2">התקבל</th>
                          <th className="pb-2 pr-2">מילוי</th>
                          <th className="pb-2 pr-2">אספקה</th>
                        </tr></thead>
                        <tbody>{selectedOrder.items.map((item: PurchaseOrderItem) => {
                          const pct = parseFloat(item.quantity || "0") > 0 ? Math.round((parseFloat(item.receivedQuantity || "0") / parseFloat(item.quantity || "0")) * 100) : 0;
                          const cs = getCurrencySymbol(selectedOrder.currency);
                          return (
                            <tr key={item.id} className="border-t border-border/30">
                              <td className="py-2 pr-2 text-muted-foreground font-mono text-xs">{item.itemCode || "—"}</td>
                              <td className="py-2 pr-2 text-gray-300">{item.itemDescription}</td>
                              <td className="py-2 pr-2 text-gray-300">{item.quantity}</td>
                              <td className="py-2 pr-2 text-muted-foreground">{item.unit}</td>
                              <td className="py-2 pr-2 text-gray-300" dir="ltr">{cs}{parseFloat(item.unitPrice).toLocaleString()}</td>
                              <td className="py-2 pr-2 text-muted-foreground">{item.discountPercent || "0"}%</td>
                              <td className="py-2 pr-2 text-muted-foreground">{item.taxPercent || "17"}%</td>
                              <td className="py-2 pr-2 text-foreground font-medium" dir="ltr">{cs}{parseFloat(item.totalPrice).toLocaleString()}</td>
                              <td className="py-2 pr-2 text-muted-foreground">{item.receivedQuantity || "0"}</td>
                              <td className="py-2 pr-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-500" : "bg-muted"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                  </div>
                                  <span className={`text-xs ${pct >= 100 ? "text-emerald-400" : pct > 0 ? "text-amber-400" : "text-muted-foreground"}`}>{pct}%</span>
                                </div>
                              </td>
                              <td className="py-2 pr-2 text-muted-foreground text-xs">{item.deliveryDate ? new Date(item.deliveryDate).toLocaleDateString("he-IL") : "—"}</td>
                            </tr>
                          );
                        })}</tbody>
                      </table>
                    </div>
                  </div>
                )}
                {selectedOrder.notes && (
                  <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs mb-1">הערות</p><p className="text-gray-300 text-sm">{selectedOrder.notes}</p></div>
                )}
              </>)}
              {detailTab === "related" && (
                <RelatedRecords entityType="purchase-orders" entityId={selectedOrder.id} relations={[
                  { key: "goods-receipts", label: "קבלות סחורה", endpoint: "/api/goods-receipts" },
                  { key: "suppliers", label: "ספקים", endpoint: "/api/suppliers" },
                  { key: "purchase-returns", label: "החזרות", endpoint: "/api/purchase-returns" },
                ]} />
              )}
              {detailTab === "docs" && (
                <AttachmentsSection entityType="purchase-orders" entityId={selectedOrder.id} />
              )}
              {detailTab === "history" && (
                <ActivityLog entityType="purchase-orders" entityId={selectedOrder.id} />
              )}
              </div>
              <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
                <button onClick={() => {
                  setReceiveGoodsForm({});
                  if (selectedOrder.items) {
                    const initialForm: Record<number, string> = {};
                    selectedOrder.items.forEach((item) => {
                      initialForm[item.id] = item.receivedQuantity || "";
                    });
                    setReceiveGoodsForm(initialForm);
                  }
                  setShowReceiveGoodsModal(true);
                }} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-foreground rounded-lg text-sm font-medium">
                  <Package className="w-4 h-4" />
                  קבלת סחורה
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-6 overflow-y-auto" onClick={closeForm}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-4xl mx-4 mb-10" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-xl font-bold text-foreground">{editingId ? "עריכת הזמנה" : "הזמנת רכש חדשה"}</h2>
                <button onClick={closeForm} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">מספר הזמנה *</label>
                    <input value={form.orderNumber} onChange={e => setForm({...form, orderNumber: e.target.value})} placeholder="PO-001"
                      className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-gray-500 focus:border-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">ספק *</label>
                    <select value={form.supplierId} onChange={e => setForm({...form, supplierId: e.target.value})}
                      className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:border-blue-500 focus:outline-none">
                      <option value="">בחר ספק</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplierName} ({s.supplierNumber})</option>)}
                    </select>
                    <FormFieldError error={formValidation.errors.supplierId} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">דרישת רכש מקושרת</label>
                    <select value={form.requestId} onChange={e => setForm({...form, requestId: e.target.value})}
                      className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:border-blue-500 focus:outline-none">
                      <option value="">ללא קישור</option>
                      {purchaseRequests.filter(pr => pr.status === "מאושר").map(pr => <option key={pr.id} value={pr.id}>{pr.requestNumber} - {pr.title}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">סטטוס</label>
                    <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}
                      className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:border-blue-500 focus:outline-none">
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">אספקה צפויה</label>
                    <input type="date" value={form.expectedDelivery} onChange={e => setForm({...form, expectedDelivery: e.target.value})} dir="ltr"
                      className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:border-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">מטבע</label>
                    <select value={form.currency} onChange={e => setForm({...form, currency: e.target.value})}
                      className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:border-blue-500 focus:outline-none">
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">תנאי תשלום</label>
                    <select value={form.paymentTerms} onChange={e => setForm({...form, paymentTerms: e.target.value})}
                      className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:border-blue-500 focus:outline-none">
                      <option value="">בחר תנאים</option>
                      {PAYMENT_TERMS_OPTIONS.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">שיטת משלוח</label>
                    <select value={form.shippingMethod} onChange={e => setForm({...form, shippingMethod: e.target.value})}
                      className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:border-blue-500 focus:outline-none">
                      <option value="">בחר שיטה</option>
                      {SHIPPING_METHODS.map(sm => <option key={sm} value={sm}>{sm}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">נוצר ע״י</label>
                    <input value={form.createdBy} onChange={e => setForm({...form, createdBy: e.target.value})} placeholder="שם המזמין"
                      className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-gray-500 focus:border-blue-500 focus:outline-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">כתובת אספקה</label>
                  <input value={form.shippingAddress} onChange={e => setForm({...form, shippingAddress: e.target.value})} placeholder="כתובת למשלוח"
                    className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-gray-500 focus:border-blue-500 focus:outline-none" />
                </div>

                {!editingId && (
                  <div className="border border-border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <Package className="w-5 h-5 text-cyan-400" />
                        פריטי הזמנה
                      </h3>
                      <button type="button" onClick={addItem} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded-lg text-sm font-medium">
                        <Plus className="w-4 h-4" />הוסף פריט
                      </button>
                    </div>
                    {orderItems.length === 0 && (
                      <p className="text-muted-foreground text-sm text-center py-4">לחץ "הוסף פריט" כדי להוסיף פריטים להזמנה</p>
                    )}
                    {orderItems.map((item, idx) => {
                      const lc = calcLineTotal(item.quantity, item.unitPrice, item.discountPercent, item.taxPercent);
                      return (
                        <div key={idx} className="bg-input border border-border rounded-lg p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">פריט {idx + 1}</span>
                            <button type="button" onClick={() => removeItem(idx)} className="p-1 text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">חומר מקטלוג</label>
                              <select value={item.materialId} onChange={e => updateItem(idx, "materialId", e.target.value)}
                                className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-blue-500 focus:outline-none">
                                <option value="">בחר חומר</option>
                                {materials.map(m => <option key={m.id} value={m.id}>{m.materialName} ({m.materialNumber})</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">קוד פריט</label>
                              <input value={item.itemCode} onChange={e => updateItem(idx, "itemCode", e.target.value)} placeholder="MAT-001"
                                className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm font-mono placeholder-gray-600 focus:border-blue-500 focus:outline-none" />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs text-muted-foreground mb-1">תיאור פריט *</label>
                              <input value={item.itemDescription} onChange={e => updateItem(idx, "itemDescription", e.target.value)} placeholder="תיאור הפריט"
                                className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm placeholder-gray-600 focus:border-blue-500 focus:outline-none" />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">כמות</label>
                              <input type="number" value={item.quantity} onChange={e => updateItem(idx, "quantity", e.target.value)}
                                className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-blue-500 focus:outline-none" dir="ltr" />
                            </div>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">יחידה</label>
                              <select value={item.unit} onChange={e => updateItem(idx, "unit", e.target.value)}
                                className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-blue-500 focus:outline-none">
                                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">מחיר ליחידה</label>
                              <input type="number" step="0.01" value={item.unitPrice} onChange={e => updateItem(idx, "unitPrice", e.target.value)}
                                className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-blue-500 focus:outline-none" dir="ltr" />
                            </div>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">הנחה %</label>
                              <input type="number" step="0.1" min="0" max="100" value={item.discountPercent} onChange={e => updateItem(idx, "discountPercent", e.target.value)}
                                className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-blue-500 focus:outline-none" dir="ltr" />
                            </div>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">מע״מ %</label>
                              <input type="number" step="0.1" value={item.taxPercent} onChange={e => updateItem(idx, "taxPercent", e.target.value)}
                                className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-blue-500 focus:outline-none" dir="ltr" />
                            </div>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">אספקת פריט</label>
                              <input type="date" value={item.deliveryDate} onChange={e => updateItem(idx, "deliveryDate", e.target.value)} dir="ltr"
                                className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-blue-500 focus:outline-none" />
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-sm pt-1 border-t border-border/30">
                            <span className="text-muted-foreground text-xs">לפני מע״מ: <span className="text-gray-300 font-mono">₪{lc.subtotal.toLocaleString()}</span> | מע״מ: <span className="text-amber-400 font-mono">₪{lc.tax.toLocaleString()}</span></span>
                            <span className="text-muted-foreground">סה״כ שורה: <span className="text-foreground font-bold font-mono">₪{lc.total.toLocaleString()}</span></span>
                          </div>
                        </div>
                      );
                    })}
                    {orderItems.length > 0 && (
                      <div className="bg-gradient-to-br from-[#12141a] to-[#1a1d23] rounded-lg p-4 border border-border mt-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                          <div>
                            <p className="text-muted-foreground text-xs mb-1">לפני מע״מ</p>
                            <p className="text-foreground font-bold font-mono text-lg" dir="ltr">₪{itemsTotalBeforeTax.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs mb-1">מע״מ</p>
                            <p className="text-amber-400 font-bold font-mono text-lg" dir="ltr">₪{itemsTaxTotal.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs mb-1">סה״כ כולל מע״מ</p>
                            <p className="text-emerald-400 font-bold font-mono text-xl" dir="ltr">₪{itemsGrandTotal.toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">הערות</label>
                  <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
                    className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:border-blue-500 focus:outline-none resize-none" rows={2} />
                </div>
                {(createMut.error || updateMut.error) && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                    {(createMut.error as Error)?.message || (updateMut.error as Error)?.message}
                  </div>
                )}
                <div className="flex items-center gap-3 pt-2">
                  <button type="submit" disabled={createMut.isPending || updateMut.isPending}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-foreground rounded-lg font-medium">
                    <Save className="w-4 h-4" />{editingId ? "עדכן" : "שמור"}
                  </button>
                  <button type="button" onClick={closeForm} className="px-4 py-2.5 text-muted-foreground hover:text-foreground">ביטול</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showReceiveGoodsModal && selectedOrder && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-6 overflow-y-auto" onClick={() => setShowReceiveGoodsModal(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-2xl mx-4 mb-10" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-xl font-bold text-foreground">קבלת סחורה</h2>
                <button onClick={() => setShowReceiveGoodsModal(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {selectedOrder.items && selectedOrder.items.length > 0 ? (
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground mb-4">הזן את הכמויות שהתקבלו לכל פריט</div>
                    {selectedOrder.items.map((item) => {
                      const received = parseFloat(receiveGoodsForm[item.id] || "0");
                      const ordered = parseFloat(item.quantity || "0");
                      const remaining = Math.max(0, ordered - received);
                      return (
                        <div key={item.id} className="bg-input rounded-lg p-4 border border-border">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="text-foreground font-medium">{item.itemDescription}</p>
                              <p className="text-xs text-muted-foreground">{item.itemCode}</p>
                            </div>
                            <span className="text-xs px-2 py-1 bg-muted/50 text-gray-400 rounded">סה"כ הזמנה: {ordered} {item.unit}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">הזמנה</label>
                              <input type="number" disabled value={ordered} className="w-full px-2 py-2 bg-muted/50 border border-border rounded text-foreground text-sm" />
                            </div>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">התקבל *</label>
                              <input type="number" min="0" max={ordered} value={receiveGoodsForm[item.id] || ""} onChange={(e) => setReceiveGoodsForm({...receiveGoodsForm, [item.id]: e.target.value})}
                                className="w-full px-2 py-2 bg-card border border-border rounded text-foreground text-sm focus:border-blue-500 focus:outline-none" dir="ltr" />
                            </div>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">ממתין</label>
                              <input type="number" disabled value={remaining} className="w-full px-2 py-2 bg-muted/50 border border-border rounded text-foreground text-sm" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">אין פריטים בהזמנה זו</p>
                )}
              </div>
              <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
                <button onClick={() => setShowReceiveGoodsModal(false)} className="px-4 py-2 text-muted-foreground hover:bg-muted/50 rounded-lg text-sm">ביטול</button>
                <button onClick={() => {
                  const items = selectedOrder.items?.filter(item => receiveGoodsForm[item.id]) .map(item => ({ itemId: item.id, quantity: parseFloat(receiveGoodsForm[item.id] || "0") })) || [];
                  if (items.length === 0) {
                    toast({ title: "שגיאה", description: "בחר לפחות פריט אחד", variant: "destructive" });
                    return;
                  }
                  receiveGoodsMut.mutate({ orderId: selectedOrder.id, items });
                }} disabled={receiveGoodsMut.isPending} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-muted text-foreground rounded-lg text-sm font-medium">
                  <Package className="w-4 h-4" />
                  {receiveGoodsMut.isPending ? "שומר..." : "שלח קבלה"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirm !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
            <div className="bg-card border border-border rounded-xl p-6 max-w-sm mx-4" dir="rtl">
              <h3 className="text-lg font-bold text-foreground mb-2">מחיקת הזמנה</h3>
              <p className="text-muted-foreground mb-4">האם למחוק? כל הפריטים ימחקו גם כן.</p>
              <div className="flex gap-3">
                <button onClick={() => deleteMut.mutate(deleteConfirm)} className="px-4 py-2 bg-red-600 text-foreground rounded-lg">מחק</button>
                <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-muted-foreground">ביטול</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
