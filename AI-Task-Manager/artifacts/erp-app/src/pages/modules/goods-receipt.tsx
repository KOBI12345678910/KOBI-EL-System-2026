import { usePermissions } from "@/hooks/use-permissions";
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import {
  Plus, Edit2, Trash2, X, Save, PackageCheck, ChevronDown, ChevronUp,
  Search, Eye, CheckCircle2, Clock, AlertTriangle, Shield, XCircle,
  BarChart3, FileText, Truck, ArrowLeft, Package, Camera,
  ClipboardCheck, AlertCircle, Hash, MapPin, Calendar, User, Copy
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";

interface GoodsReceiptItem {
  id: number; receiptId: number; orderItemId: number | null; materialId: number | null;
  itemCode: string | null; itemDescription: string; expectedQuantity: string; receivedQuantity: string;
  unit: string; qualityStatus: string; lotNumber: string | null; serialNumber: string | null;
  conditionNotes: string | null; photoUrls: string | null; storageLocation: string | null;
  expiryDate: string | null; notes: string | null;
}

interface GoodsReceipt {
  id: number; receiptNumber: string; orderId: number | null; supplierId: number;
  receiptDate: string | null; status: string; receivedBy: string | null;
  warehouseLocation: string | null; deliveryNoteNumber: string | null;
  vehicleNumber: string | null; inspector: string | null; overallQuality: string | null;
  notes: string | null; createdAt: string;
  items?: GoodsReceiptItem[];
}
interface Supplier { id: number; supplierName: string; supplierNumber: string; }
interface PurchaseOrder { id: number; orderNumber: string; supplierId: number; status: string; totalAmount: string | null; items?: PurchaseOrderItem[]; }
interface PurchaseOrderItem { id: number; itemDescription: string; quantity: string; unit: string; materialId: number | null; itemCode?: string | null; }
interface Material { id: number; materialName: string; materialNumber: string; unit: string; }

const STATUSES = ["חדש", "בבדיקה", "מאושר", "התקבל", "נדחה חלקית"];
const STATUS_COLORS: Record<string, string> = {
  "חדש": "bg-blue-500/20 text-blue-400", "בבדיקה": "bg-amber-500/20 text-amber-400",
  "מאושר": "bg-emerald-500/20 text-emerald-400", "התקבל": "bg-teal-500/20 text-teal-400",
  "נדחה חלקית": "bg-red-500/20 text-red-400",
};
const STATUS_ICONS: Record<string, any> = {
  "חדש": Package, "בבדיקה": Clock, "מאושר": CheckCircle2, "התקבל": Shield, "נדחה חלקית": XCircle,
};
const QUALITY_STATUSES = ["תקין", "פגום חלקית", "פגום", "דרוש בדיקה"];
const QUALITY_COLORS: Record<string, string> = {
  "תקין": "bg-emerald-500/20 text-emerald-400",
  "פגום חלקית": "bg-amber-500/20 text-amber-400",
  "פגום": "bg-red-500/20 text-red-400",
  "דרוש בדיקה": "bg-purple-500/20 text-purple-400",
};
const OVERALL_QUALITY = ["תקין", "תקין חלקית", "נדרשת בדיקה נוספת", "פגום"];
const WAREHOUSES = ["מחסן ראשי", "מחסן A", "מחסן B", "מחסן חיצוני", "אזור קבלה", "אזור בידוד"];
const UNITS = ["יחידה", 'מ"ר', 'מ"א', "ק״ג", "טון", "ליטר", "קרטון", "חבילה", "פלטה", "צינור", "קורה"];

interface ReceiptItemForm {
  orderItemId: string; materialId: string; itemCode: string; itemDescription: string;
  expectedQuantity: string; receivedQuantity: string; unit: string;
  qualityStatus: string; lotNumber: string; serialNumber: string;
  conditionNotes: string; storageLocation: string; expiryDate: string; notes: string;
}
const emptyReceiptItem: ReceiptItemForm = {
  orderItemId: "", materialId: "", itemCode: "", itemDescription: "",
  expectedQuantity: "0", receivedQuantity: "0", unit: "יחידה",
  qualityStatus: "תקין", lotNumber: "", serialNumber: "",
  conditionNotes: "", storageLocation: "", expiryDate: "", notes: "",
};

const emptyForm = {
  receiptNumber: "", orderId: "", supplierId: "", receiptDate: "",
  status: "חדש", receivedBy: "", warehouseLocation: "",
  deliveryNoteNumber: "", vehicleNumber: "", inspector: "",
  overallQuality: "תקין", notes: "",
};

function getVarianceInfo(expected: string, received: string) {
  const exp = parseFloat(expected || "0");
  const rec = parseFloat(received || "0");
  if (exp === 0) return { pct: 0, diff: 0, status: "neutral" };
  const diff = rec - exp;
  const pct = Math.round((rec / exp) * 100);
  return {
    pct, diff,
    status: pct === 100 ? "exact" : pct > 100 ? "over" : pct >= 90 ? "slight" : "under",
  };
}

export default function GoodsReceiptPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [receiptItems, setReceiptItems] = useState<ReceiptItemForm[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedReceipt, setSelectedReceipt] = useState<GoodsReceipt | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<number, GoodsReceiptItem[]>>({});
  const [detailTab, setDetailTab] = useState<string>("items");
  const bulk = useBulkSelection();
  const formValidation = useFormValidation<typeof emptyForm>({ receiptNumber: { required: true, message: "מספר קבלה נדרש" }, supplierId: { required: true, message: "ספק נדרש" } });

  const { data: receiptsRaw, isLoading } = useQuery({
    queryKey: ["goods-receipts"],
    queryFn: async () => { const r = await authFetch(`${API}/goods-receipts`); return r.json(); },
  });
  const receipts: GoodsReceipt[] = Array.isArray(receiptsRaw) ? receiptsRaw : (receiptsRaw?.data || receiptsRaw?.items || []);

  const { data: suppliersRaw } = useQuery({
    queryKey: ["suppliers-list"],
    queryFn: async () => { const r = await authFetch(`${API}/suppliers`); return r.json(); },
  });
  const suppliers: Supplier[] = Array.isArray(suppliersRaw) ? suppliersRaw : (suppliersRaw?.data || suppliersRaw?.items || []);

  const { data: purchaseOrdersRaw } = useQuery({
    queryKey: ["purchase-orders-ref"],
    queryFn: async () => { const r = await authFetch(`${API}/purchase-orders`); return r.json(); },
  });
  const purchaseOrders: PurchaseOrder[] = Array.isArray(purchaseOrdersRaw) ? purchaseOrdersRaw : (purchaseOrdersRaw?.data || purchaseOrdersRaw?.items || []);

  const { data: materialsRaw } = useQuery({
    queryKey: ["materials-list"],
    queryFn: async () => { const r = await authFetch(`${API}/raw-materials`); return r.json(); },
  });
  const materials: Material[] = Array.isArray(materialsRaw) ? materialsRaw : (materialsRaw?.data || materialsRaw?.items || []);

  const filtered = receipts.filter(r => {
    const matchSearch = !search || r.receiptNumber.toLowerCase().includes(search.toLowerCase()) ||
      getSupplierName(r.supplierId).toLowerCase().includes(search.toLowerCase()) ||
      (r.deliveryNoteNumber || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const newReceipts = receipts.filter(r => r.status === "חדש");
  const inspecting = receipts.filter(r => r.status === "בבדיקה");
  const approved = receipts.filter(r => r.status === "מאושר" || r.status === "התקבל");
  const rejected = receipts.filter(r => r.status === "נדחה חלקית");
  const withPO = receipts.filter(r => r.orderId);
  const qualityIssues = receipts.filter(r => r.overallQuality && r.overallQuality !== "תקין");

  const createMut = useMutation({
    mutationFn: async (data: { form: typeof emptyForm; items: ReceiptItemForm[] }) => {
      const payload = {
        ...data.form,
        supplierId: parseInt(data.form.supplierId),
        orderId: data.form.orderId ? parseInt(data.form.orderId) : null,
      };
      const r = await authFetch(`${API}/goods-receipts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      const created = await r.json();
      const failedItems: string[] = [];
      for (const item of data.items) {
        if (!item.itemDescription) continue;
        const ir = await authFetch(`${API}/goods-receipts/${created.id}/items`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...item,
            orderItemId: item.orderItemId ? parseInt(item.orderItemId) : null,
            materialId: item.materialId ? parseInt(item.materialId) : null,
          }),
        });
        if (!ir.ok) failedItems.push(item.itemDescription);
      }
      if (failedItems.length > 0) throw new Error(`הקבלה נוצרה אבל ${failedItems.length} פריטים נכשלו`);
      return created;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["goods-receipts"] }); closeForm(); },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof emptyForm }) => {
      const r = await authFetch(`${API}/goods-receipts/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        ...data, supplierId: parseInt(data.supplierId),
        orderId: data.orderId ? parseInt(data.orderId) : null,
      })});
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); } return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goods-receipts"] });
      qc.invalidateQueries({ queryKey: ["raw-materials"] });
      qc.invalidateQueries({ queryKey: ["inventory-transactions"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["price-history"] });
      qc.invalidateQueries({ queryKey: ["executive-dashboard"] });
      qc.invalidateQueries({ queryKey: ["cross-module-summary"] });
      closeForm();
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => { await authFetch(`${API}/goods-receipts/${id}`, { method: "DELETE" }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["goods-receipts"] }); setDeleteConfirm(null); },
  });

  function closeForm() { setShowForm(false); setEditingId(null); setForm(emptyForm); setReceiptItems([]); formValidation.clearErrors(); }
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formValidation.validate(form)) return;
    editingId ? updateMut.mutate({ id: editingId, data: form }) : createMut.mutate({ form, items: receiptItems });
  }

  const getSupplierName = (id: number) => suppliers.find(s => s.id === id)?.supplierName || `ספק ${id}`;
  const getOrderNumber = (id: number | null) => id ? purchaseOrders.find(o => o.id === id)?.orderNumber || "" : "";

  async function selectPurchaseOrder(orderId: string) {
    setForm(prev => ({ ...prev, orderId }));
    if (!orderId) { setReceiptItems([]); return; }
    const po = purchaseOrders.find(o => o.id === parseInt(orderId));
    if (po) {
      setForm(prev => ({ ...prev, supplierId: String(po.supplierId) }));
      const r = await authFetch(`${API}/purchase-orders/${orderId}`);
      const data = await r.json();
      if (data.items && data.items.length > 0) {
        setReceiptItems(data.items.map((item: PurchaseOrderItem) => ({
          orderItemId: String(item.id),
          materialId: item.materialId ? String(item.materialId) : "",
          itemCode: item.itemCode || "",
          itemDescription: item.itemDescription,
          expectedQuantity: item.quantity,
          receivedQuantity: item.quantity,
          unit: item.unit,
          qualityStatus: "תקין",
          lotNumber: "", serialNumber: "", conditionNotes: "",
          storageLocation: "", expiryDate: "", notes: "",
        })));
      }
    }
  }

  function addReceiptItem() { setReceiptItems([...receiptItems, { ...emptyReceiptItem }]); }
  function removeReceiptItem(idx: number) { setReceiptItems(receiptItems.filter((_, i) => i !== idx)); }
  function updateReceiptItem(idx: number, field: keyof ReceiptItemForm, value: string) {
    const updated = [...receiptItems];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === "materialId" && value) {
      const mat = materials.find(m => m.id === parseInt(value));
      if (mat) {
        updated[idx].itemDescription = mat.materialName;
        updated[idx].unit = mat.unit;
        updated[idx].itemCode = mat.materialNumber;
      }
    }
    setReceiptItems(updated);
  }

  async function loadReceiptItems(receiptId: number) {
    if (expandedRow === receiptId) { setExpandedRow(null); return; }
    if (!expandedItems[receiptId]) {
      const r = await authFetch(`${API}/goods-receipts/${receiptId}`);
      const data = await r.json();
      if (data.items) setExpandedItems(prev => ({ ...prev, [receiptId]: data.items }));
    }
    setExpandedRow(receiptId);
  }

  async function openReceiptDetail(rec: GoodsReceipt) {
    const r = await authFetch(`${API}/goods-receipts/${rec.id}`);
    const data = await r.json();
    setSelectedReceipt({ ...data, items: data.items || [] });
    setDetailTab("items");
  }

  function openEdit(r: GoodsReceipt) {
    setForm({
      receiptNumber: r.receiptNumber, orderId: r.orderId ? String(r.orderId) : "",
      supplierId: String(r.supplierId), receiptDate: r.receiptDate || "",
      status: r.status, receivedBy: r.receivedBy || "",
      warehouseLocation: r.warehouseLocation || "",
      deliveryNoteNumber: r.deliveryNoteNumber || "",
      vehicleNumber: r.vehicleNumber || "",
      inspector: r.inspector || "",
      overallQuality: r.overallQuality || "תקין",
      notes: r.notes || "",
    });
    setEditingId(r.id); setReceiptItems([]); formValidation.clearErrors(); setShowForm(true);
  }

  const openPOs = purchaseOrders.filter(o => !["התקבל במלואו", "בוטל"].includes(o.status));

  return (
    <div className="min-h-screen" dir="rtl">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                <PackageCheck className="w-6 h-6 text-foreground" />
              </div>
              קבלת סחורה
            </h1>
            <p className="text-muted-foreground mt-1">ניהול קבלות סחורה, בדיקת איכות, מספרי אצווה וסריאליים</p>
          </div>
          <button onClick={() => { setForm({...emptyForm, receiptDate: new Date().toISOString().split("T")[0]}); setEditingId(null); setReceiptItems([]); formValidation.clearErrors(); setShowForm(true); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-foreground rounded-xl font-medium transition-colors">
            <Plus className="w-5 h-5" />קבלה חדשה
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "סה״כ קבלות", value: receipts.length, icon: PackageCheck, color: "text-teal-400", bg: "bg-teal-500/10" },
            { label: "חדשות", value: newReceipts.length, icon: Package, color: "text-blue-400", bg: "bg-blue-500/10" },
            { label: "בבדיקת QC", value: inspecting.length, icon: ClipboardCheck, color: "text-amber-400", bg: "bg-amber-500/10" },
            { label: "מאושרות", value: approved.length, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
            { label: "נדחו חלקית", value: rejected.length, icon: AlertCircle, color: rejected.length > 0 ? "text-red-400" : "text-muted-foreground", bg: rejected.length > 0 ? "bg-red-500/10" : "bg-muted/10" },
            { label: "מקושרות ל-PO", value: withPO.length, icon: FileText, color: "text-cyan-400", bg: "bg-cyan-500/10" },
            { label: "ללא PO", value: receipts.length - withPO.length, icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10" },
            { label: "בעיות איכות", value: qualityIssues.length, icon: Shield, color: qualityIssues.length > 0 ? "text-red-400" : "text-muted-foreground", bg: qualityIssues.length > 0 ? "bg-red-500/10" : "bg-muted/10" },
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

        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-teal-400" />תהליך קבלת סחורה
          </h3>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {[
              { label: "קבלה חדשה", count: newReceipts.length, color: "border-blue-500", bg: "bg-blue-500/10", icon: Package },
              { label: "בדיקת איכות (QC)", count: inspecting.length, color: "border-amber-500", bg: "bg-amber-500/10", icon: ClipboardCheck },
              { label: "אישור וקליטה", count: approved.length, color: "border-emerald-500", bg: "bg-emerald-500/10", icon: CheckCircle2 },
              { label: "עדכון מלאי", count: receipts.filter(r => r.status === "התקבל").length, color: "border-teal-500", bg: "bg-teal-500/10", icon: Shield },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-2 flex-1 min-w-[130px]">
                <div className={`flex-1 ${step.bg} border-2 ${step.color} rounded-xl p-3 text-center`}>
                  <step.icon className="w-5 h-5 mx-auto mb-1 text-gray-300" />
                  <p className="text-xs font-semibold text-foreground">{step.label}</p>
                  <p className="text-lg font-bold text-gray-300 mt-1">{step.count}</p>
                </div>
                {i < 3 && <ArrowLeft className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input type="text" placeholder="חיפוש לפי מספר קבלה, ספק או תעודת משלוח..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-foreground placeholder-gray-500 focus:border-teal-500 focus:outline-none" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 bg-card border border-border rounded-xl text-foreground focus:border-teal-500 focus:outline-none">
            <option value="all">כל הסטטוסים</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <PackageCheck className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl text-muted-foreground">אין קבלות סחורה</h3>
            <p className="text-muted-foreground text-sm mt-2">{search || statusFilter !== "all" ? "נסה לשנות את מסנני החיפוש" : 'לחץ "קבלה חדשה" כדי להתחיל'}</p>
          </div>
        ) : (
          <>
          <BulkActions selectedIds={bulk.selectedIds} onClear={bulk.clear} entityName="קבלות סחורה" actions={defaultBulkActions(bulk.selectedIds, bulk.clear, () => qc.invalidateQueries({ queryKey: ["goods-receipts"] }), `${API}/goods-receipts`)} />
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-input">
              <span className="text-sm text-muted-foreground">{filtered.length} קבלות</span>
            </div>
            <table className="w-full text-right">
              <thead><tr className="border-b border-border bg-input">
                <th className="px-4 py-3 w-10"><BulkCheckbox checked={bulk.isAllSelected(filtered)} onChange={() => bulk.toggleAll(filtered)} /></th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm w-8"></th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">מס׳ קבלה</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">הזמנה</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">ספק</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">תאריך</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">ת. משלוח</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">מקבל</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">מחסן</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">איכות</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">סטטוס</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">פעולות</th>
              </tr></thead>
              <tbody>
                {filtered.map(r => (
                  <React.Fragment key={r.id}>
                    <tr className={`border-b border-border/50 hover:bg-muted cursor-pointer transition-colors ${r.overallQuality && r.overallQuality !== "תקין" ? "bg-red-500/5" : ""} ${bulk.isSelected(r.id) ? "bg-primary/5" : ""}`}
                      onClick={() => loadReceiptItems(r.id)}>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}><BulkCheckbox checked={bulk.isSelected(r.id)} onChange={() => bulk.toggle(r.id)} /></td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {expandedRow === r.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </td>
                      <td className="px-4 py-3 text-teal-400 font-mono text-sm">{r.receiptNumber}</td>
                      <td className="px-4 py-3">
                        {r.orderId ? <span className="text-cyan-400 font-mono text-sm">{getOrderNumber(r.orderId)}</span> : <span className="text-muted-foreground text-xs">ללא</span>}
                      </td>
                      <td className="px-4 py-3 text-foreground text-sm">{getSupplierName(r.supplierId)}</td>
                      <td className="px-4 py-3 text-gray-300 text-sm">{r.receiptDate ? new Date(r.receiptDate).toLocaleDateString("he-IL") : "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-sm font-mono">{r.deliveryNoteNumber || "—"}</td>
                      <td className="px-4 py-3 text-gray-300 text-sm">{r.receivedBy || "—"}</td>
                      <td className="px-4 py-3 text-gray-300 text-sm">{r.warehouseLocation || "—"}</td>
                      <td className="px-4 py-3">
                        {r.overallQuality && (
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${QUALITY_COLORS[r.overallQuality] || "bg-muted/20 text-muted-foreground"}`}>
                            {r.overallQuality}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[r.status] || ""}`}>
                          {STATUS_ICONS[r.status] && (() => { const Icon = STATUS_ICONS[r.status]; return <Icon className="w-3 h-3" />; })()}
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button onClick={() => openReceiptDetail(r)} className="p-1.5 text-muted-foreground hover:text-teal-400 rounded-md"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => openEdit(r)} className="p-1.5 text-muted-foreground hover:text-amber-400 rounded-md"><Edit2 className="w-4 h-4" /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/goods-receipts`, r.id); if (res.ok) { qc.invalidateQueries({ queryKey: ["goods-receipts"] }); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                          {isSuperAdmin && <button onClick={() => setDeleteConfirm(r.id)} className="p-1.5 text-muted-foreground hover:text-red-400 rounded-md"><Trash2 className="w-4 h-4" /></button>}
                        </div>
                      </td>
                    </tr>
                    {expandedRow === r.id && (
                      <tr key={`exp-${r.id}`}>
                        <td colSpan={11} className="px-4 py-4 bg-input">
                          {expandedItems[r.id] && expandedItems[r.id].length > 0 ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 mb-2">
                                <ClipboardCheck className="w-4 h-4 text-teal-400" />
                                <span className="text-sm font-medium text-foreground">פריטים ({expandedItems[r.id].length})</span>
                              </div>
                              <table className="w-full text-right text-sm">
                                <thead><tr className="text-muted-foreground border-b border-border">
                                  <th className="pb-2 pr-2">קוד</th>
                                  <th className="pb-2 pr-2">פריט</th>
                                  <th className="pb-2 pr-2">צפוי</th>
                                  <th className="pb-2 pr-2">התקבל</th>
                                  <th className="pb-2 pr-2">סטייה</th>
                                  <th className="pb-2 pr-2">איכות</th>
                                  <th className="pb-2 pr-2">אצווה</th>
                                  <th className="pb-2 pr-2">סריאלי</th>
                                  <th className="pb-2 pr-2">מיקום</th>
                                </tr></thead>
                                <tbody>
                                  {expandedItems[r.id].map((item: GoodsReceiptItem) => {
                                    const v = getVarianceInfo(item.expectedQuantity, item.receivedQuantity);
                                    return (
                                      <tr key={item.id} className="border-t border-border/30">
                                        <td className="py-2 pr-2 text-muted-foreground font-mono text-xs">{item.itemCode || "—"}</td>
                                        <td className="py-2 pr-2 text-gray-300">{item.itemDescription}</td>
                                        <td className="py-2 pr-2 text-muted-foreground">{item.expectedQuantity}</td>
                                        <td className="py-2 pr-2 text-foreground font-medium">{item.receivedQuantity}</td>
                                        <td className="py-2 pr-2">
                                          <div className="flex items-center gap-2">
                                            <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
                                              <div className={`h-full rounded-full ${v.status === "exact" ? "bg-emerald-500" : v.status === "over" ? "bg-blue-500" : v.status === "slight" ? "bg-amber-500" : "bg-red-500"}`}
                                                style={{ width: `${Math.min(v.pct, 100)}%` }} />
                                            </div>
                                            <span className={`text-xs font-medium ${v.status === "exact" ? "text-emerald-400" : v.status === "over" ? "text-blue-400" : v.status === "slight" ? "text-amber-400" : "text-red-400"}`}>{v.pct}%</span>
                                          </div>
                                        </td>
                                        <td className="py-2 pr-2">
                                          <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${QUALITY_COLORS[item.qualityStatus] || "bg-muted/20 text-muted-foreground"}`}>{item.qualityStatus}</span>
                                        </td>
                                        <td className="py-2 pr-2 text-muted-foreground text-xs font-mono">{item.lotNumber || "—"}</td>
                                        <td className="py-2 pr-2 text-muted-foreground text-xs font-mono">{item.serialNumber || "—"}</td>
                                        <td className="py-2 pr-2 text-muted-foreground text-xs">{item.storageLocation || "—"}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          ) : <p className="text-muted-foreground text-sm text-center py-2">אין פריטים</p>}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {selectedReceipt && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-6 overflow-y-auto" onClick={() => setSelectedReceipt(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl w-full max-w-5xl mx-4 mb-10" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div>
                  <h2 className="text-xl font-bold text-foreground flex items-center gap-2">קבלה {selectedReceipt.receiptNumber}</h2>
                  <p className="text-sm text-muted-foreground">{getSupplierName(selectedReceipt.supplierId)}{selectedReceipt.orderId ? ` — הזמנה ${getOrderNumber(selectedReceipt.orderId)}` : ""}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-lg text-sm font-medium ${STATUS_COLORS[selectedReceipt.status] || ""}`}>{selectedReceipt.status}</span>
                  {selectedReceipt.overallQuality && selectedReceipt.overallQuality !== "תקין" && (
                    <span className={`px-3 py-1 rounded-lg text-sm font-medium ${QUALITY_COLORS[selectedReceipt.overallQuality] || ""}`}>{selectedReceipt.overallQuality}</span>
                  )}
                  <button onClick={() => setSelectedReceipt(null)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                </div>
              </div>

              <div className="border-b border-border">
                <div className="flex gap-1 px-6 pt-2">
                  {[
                    { key: "items", label: `פריטים (${selectedReceipt.items?.length || 0})` },
                    { key: "info", label: "פרטי קבלה" },
                    { key: "related", label: "רשומות קשורות" },
                    { key: "docs", label: "מסמכים" },
                    { key: "history", label: "היסטוריה" },
                  ].map(tab => (
                    <button key={tab.key} onClick={() => setDetailTab(tab.key)}
                      className={`px-4 py-2 text-sm font-medium rounded-t-lg ${detailTab === tab.key ? "bg-input text-foreground border-t border-x border-border" : "text-muted-foreground hover:text-foreground"}`}>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-6 max-h-[65vh] overflow-y-auto">
                {detailTab === "info" && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">תאריך קבלה</p><p className="text-foreground font-medium mt-1">{selectedReceipt.receiptDate ? new Date(selectedReceipt.receiptDate).toLocaleDateString("he-IL") : "—"}</p></div>
                    <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">מקבל</p><p className="text-foreground font-medium mt-1">{selectedReceipt.receivedBy || "—"}</p></div>
                    <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">בודק</p><p className="text-foreground font-medium mt-1">{selectedReceipt.inspector || "—"}</p></div>
                    <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">מחסן</p><p className="text-foreground font-medium mt-1">{selectedReceipt.warehouseLocation || "—"}</p></div>
                    <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">תעודת משלוח</p><p className="text-foreground font-medium mt-1 font-mono">{selectedReceipt.deliveryNoteNumber || "—"}</p></div>
                    <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">מספר רכב</p><p className="text-foreground font-medium mt-1 font-mono">{selectedReceipt.vehicleNumber || "—"}</p></div>
                    <div className="bg-input rounded-xl p-4 md:col-span-3"><p className="text-muted-foreground text-xs">איכות כללית</p>
                      <span className={`inline-flex px-3 py-1 mt-1 rounded-lg text-sm font-medium ${QUALITY_COLORS[selectedReceipt.overallQuality || "תקין"] || ""}`}>{selectedReceipt.overallQuality || "תקין"}</span>
                    </div>
                    {selectedReceipt.notes && (
                      <div className="bg-input rounded-xl p-4 md:col-span-3"><p className="text-muted-foreground text-xs mb-1">הערות</p><p className="text-gray-300 text-sm">{selectedReceipt.notes}</p></div>
                    )}
                  </div>
                )}

                {detailTab === "items" && selectedReceipt.items && selectedReceipt.items.length > 0 && (
                  <div className="space-y-3">
                    {selectedReceipt.items.map(item => {
                      const v = getVarianceInfo(item.expectedQuantity, item.receivedQuantity);
                      return (
                        <div key={item.id} className={`bg-input rounded-xl p-4 border ${item.qualityStatus === "פגום" ? "border-red-500/30" : item.qualityStatus === "פגום חלקית" ? "border-amber-500/30" : "border-border"}`}>
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="text-foreground font-medium">{item.itemDescription}</p>
                              {item.itemCode && <p className="text-muted-foreground text-xs font-mono mt-0.5">{item.itemCode}</p>}
                            </div>
                            <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${QUALITY_COLORS[item.qualityStatus] || ""}`}>{item.qualityStatus}</span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div><p className="text-muted-foreground text-xs">צפוי</p><p className="text-gray-300">{item.expectedQuantity} {item.unit}</p></div>
                            <div><p className="text-muted-foreground text-xs">התקבל</p><p className="text-foreground font-medium">{item.receivedQuantity} {item.unit}</p></div>
                            <div><p className="text-muted-foreground text-xs">סטייה</p>
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${v.status === "exact" ? "bg-emerald-500" : v.status === "over" ? "bg-blue-500" : v.status === "slight" ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(v.pct, 100)}%` }} />
                                </div>
                                <span className={`text-xs font-medium ${v.status === "exact" ? "text-emerald-400" : v.status === "over" ? "text-blue-400" : v.status === "slight" ? "text-amber-400" : "text-red-400"}`}>{v.pct}% {v.diff !== 0 ? `(${v.diff > 0 ? "+" : ""}${v.diff})` : ""}</span>
                              </div>
                            </div>
                            <div><p className="text-muted-foreground text-xs">מיקום אחסון</p><p className="text-gray-300">{item.storageLocation || "—"}</p></div>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-2">
                            <div><p className="text-muted-foreground text-xs">אצווה (Lot)</p><p className="text-gray-300 font-mono text-xs">{item.lotNumber || "—"}</p></div>
                            <div><p className="text-muted-foreground text-xs">סריאלי (S/N)</p><p className="text-gray-300 font-mono text-xs">{item.serialNumber || "—"}</p></div>
                            <div><p className="text-muted-foreground text-xs">תוקף</p><p className="text-gray-300 text-xs">{item.expiryDate ? new Date(item.expiryDate).toLocaleDateString("he-IL") : "—"}</p></div>
                            {item.conditionNotes && <div><p className="text-muted-foreground text-xs">הערות מצב</p><p className="text-gray-300 text-xs">{item.conditionNotes}</p></div>}
                          </div>
                          {item.photoUrls && (
                            <div className="mt-2 flex items-center gap-2">
                              <Camera className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground text-xs">תמונות מצורפות: {item.photoUrls.split(",").length}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {detailTab === "related" && (
                  <RelatedRecords entityType="goods-receipts" entityId={selectedReceipt.id} relations={[
                    { key: "purchase-orders", label: "הזמנות רכש", endpoint: "/api/purchase-orders" },
                    { key: "suppliers", label: "ספקים", endpoint: "/api/suppliers" },
                    { key: "quality-control", label: "בקרת איכות", endpoint: "/api/quality-inspections" },
                  ]} />
                )}

                {detailTab === "docs" && (
                  <AttachmentsSection entityType="goods-receipts" entityId={selectedReceipt.id} />
                )}

                {detailTab === "history" && (
                  <ActivityLog entityType="goods-receipts" entityId={selectedReceipt.id} />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-4 overflow-y-auto" onClick={closeForm}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl w-full max-w-5xl mx-4 mb-10" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-xl font-bold text-foreground">{editingId ? "עריכת קבלה" : "קבלת סחורה חדשה"}</h2>
                <button onClick={closeForm} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
                <div className="bg-input border border-border rounded-xl p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-teal-400 flex items-center gap-2"><PackageCheck className="w-4 h-4" />פרטי קבלה</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">מספר קבלה <RequiredMark /></label>
                      <input value={form.receiptNumber} onChange={e => setForm({...form, receiptNumber: e.target.value})} placeholder="GR-001" className={`w-full px-3 py-2 bg-card border rounded-lg text-foreground placeholder-gray-500 focus:border-teal-500 focus:outline-none text-sm ${formValidation.errors.receiptNumber ? "border-red-500" : "border-border"}`} />
                      <FormFieldError error={formValidation.errors.receiptNumber} />
                    </div>
                    <div><label className="block text-xs text-muted-foreground mb-1">הזמנת רכש (PO)</label>
                      <select value={form.orderId} onChange={e => selectPurchaseOrder(e.target.value)}
                        className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground focus:border-teal-500 focus:outline-none text-sm">
                        <option value="">ללא הזמנה</option>
                        {openPOs.map(o => <option key={o.id} value={o.id}>{o.orderNumber} — {getSupplierName(o.supplierId)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">ספק <RequiredMark /></label>
                      <select value={form.supplierId} onChange={e => setForm({...form, supplierId: e.target.value})}
                        className={`w-full px-3 py-2 bg-card border rounded-lg text-foreground focus:border-teal-500 focus:outline-none text-sm ${formValidation.errors.supplierId ? "border-red-500" : "border-border"}`}>
                        <option value="">בחר ספק</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplierName}</option>)}
                      </select>
                      <FormFieldError error={formValidation.errors.supplierId} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div><label className="block text-xs text-muted-foreground mb-1">תאריך קבלה</label><input type="date" value={form.receiptDate} onChange={e => setForm({...form, receiptDate: e.target.value})} dir="ltr" className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground focus:border-teal-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">סטטוס</label>
                      <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground focus:border-teal-500 focus:outline-none text-sm">
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div><label className="block text-xs text-muted-foreground mb-1">מקבל</label><input value={form.receivedBy} onChange={e => setForm({...form, receivedBy: e.target.value})} placeholder="שם מקבל" className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder-gray-500 focus:border-teal-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">בודק (Inspector)</label><input value={form.inspector} onChange={e => setForm({...form, inspector: e.target.value})} placeholder="שם בודק" className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder-gray-500 focus:border-teal-500 focus:outline-none text-sm" /></div>
                  </div>
                </div>

                <div className="bg-input border border-border rounded-xl p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-cyan-400 flex items-center gap-2"><Truck className="w-4 h-4" />פרטי משלוח ומחסן</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div><label className="block text-xs text-muted-foreground mb-1">תעודת משלוח</label><input value={form.deliveryNoteNumber} onChange={e => setForm({...form, deliveryNoteNumber: e.target.value})} placeholder="מספר ת. משלוח" className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder-gray-500 focus:border-teal-500 focus:outline-none text-sm font-mono" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">מספר רכב</label><input value={form.vehicleNumber} onChange={e => setForm({...form, vehicleNumber: e.target.value})} placeholder="לוחית רישוי" className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder-gray-500 focus:border-teal-500 focus:outline-none text-sm font-mono" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">מחסן / מיקום קבלה</label>
                      <select value={form.warehouseLocation} onChange={e => setForm({...form, warehouseLocation: e.target.value})}
                        className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground focus:border-teal-500 focus:outline-none text-sm">
                        <option value="">בחר מחסן</option>
                        {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
                      </select>
                    </div>
                    <div><label className="block text-xs text-muted-foreground mb-1">איכות כללית</label>
                      <select value={form.overallQuality} onChange={e => setForm({...form, overallQuality: e.target.value})}
                        className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground focus:border-teal-500 focus:outline-none text-sm">
                        {OVERALL_QUALITY.map(q => <option key={q} value={q}>{q}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {!editingId && (
                  <div className="border border-border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2"><Package className="w-5 h-5 text-teal-400" />פריטים שנתקבלו</h3>
                      <button type="button" onClick={addReceiptItem} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded-lg text-sm font-medium"><Plus className="w-4 h-4" />הוסף פריט</button>
                    </div>
                    {form.orderId && receiptItems.length > 0 && (
                      <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-2 text-cyan-400 text-xs flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />פריטים נטענו אוטומטית מהזמנת רכש {getOrderNumber(parseInt(form.orderId))}
                      </div>
                    )}
                    {receiptItems.length === 0 && <p className="text-muted-foreground text-sm text-center py-4">בחר הזמנת רכש לטעינה אוטומטית, או הוסף פריטים ידנית</p>}
                    {receiptItems.map((item, idx) => {
                      const v = getVarianceInfo(item.expectedQuantity, item.receivedQuantity);
                      return (
                        <div key={idx} className="bg-input border border-border rounded-lg p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground flex items-center gap-2">
                              פריט {idx + 1}
                              {v.status !== "neutral" && (
                                <span className={`px-1.5 py-0.5 rounded text-xs ${v.status === "exact" ? "bg-emerald-500/20 text-emerald-400" : v.status === "over" ? "bg-blue-500/20 text-blue-400" : v.status === "slight" ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"}`}>
                                  {v.pct}%
                                </span>
                              )}
                            </span>
                            <button type="button" onClick={() => removeReceiptItem(idx)} className="p-1 text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div><label className="block text-xs text-muted-foreground mb-1">חומר</label><select value={item.materialId} onChange={e => updateReceiptItem(idx, "materialId", e.target.value)} className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-teal-500 focus:outline-none"><option value="">בחר</option>{materials.map(m => <option key={m.id} value={m.id}>{m.materialName}</option>)}</select></div>
                            <div><label className="block text-xs text-muted-foreground mb-1">קוד</label><input value={item.itemCode} onChange={e => updateReceiptItem(idx, "itemCode", e.target.value)} className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm font-mono focus:border-teal-500 focus:outline-none" /></div>
                            <div className="sm:col-span-2"><label className="block text-xs text-muted-foreground mb-1">תיאור</label><input value={item.itemDescription} onChange={e => updateReceiptItem(idx, "itemDescription", e.target.value)} className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-teal-500 focus:outline-none" /></div>
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                            <div><label className="block text-xs text-muted-foreground mb-1">כמות צפויה</label><input type="number" value={item.expectedQuantity} onChange={e => updateReceiptItem(idx, "expectedQuantity", e.target.value)} className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-teal-500 focus:outline-none" dir="ltr" /></div>
                            <div><label className="block text-xs text-muted-foreground mb-1">כמות שנתקבלה</label><input type="number" value={item.receivedQuantity} onChange={e => updateReceiptItem(idx, "receivedQuantity", e.target.value)} className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-teal-500 focus:outline-none" dir="ltr" /></div>
                            <div><label className="block text-xs text-muted-foreground mb-1">יחידה</label><select value={item.unit} onChange={e => updateReceiptItem(idx, "unit", e.target.value)} className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-teal-500 focus:outline-none">{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
                            <div><label className="block text-xs text-muted-foreground mb-1">בדיקת איכות</label><select value={item.qualityStatus} onChange={e => updateReceiptItem(idx, "qualityStatus", e.target.value)} className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-teal-500 focus:outline-none">{QUALITY_STATUSES.map(q => <option key={q} value={q}>{q}</option>)}</select></div>
                            <div><label className="block text-xs text-muted-foreground mb-1">אצווה (Lot)</label><input value={item.lotNumber} onChange={e => updateReceiptItem(idx, "lotNumber", e.target.value)} placeholder="LOT-XXX" className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm font-mono placeholder-gray-600 focus:border-teal-500 focus:outline-none" /></div>
                            <div><label className="block text-xs text-muted-foreground mb-1">סריאלי (S/N)</label><input value={item.serialNumber} onChange={e => updateReceiptItem(idx, "serialNumber", e.target.value)} placeholder="SN-XXX" className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm font-mono placeholder-gray-600 focus:border-teal-500 focus:outline-none" /></div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div><label className="block text-xs text-muted-foreground mb-1">מיקום אחסון</label><select value={item.storageLocation} onChange={e => updateReceiptItem(idx, "storageLocation", e.target.value)} className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-teal-500 focus:outline-none"><option value="">בחר</option>{WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}</select></div>
                            <div><label className="block text-xs text-muted-foreground mb-1">תוקף</label><input type="date" value={item.expiryDate} onChange={e => updateReceiptItem(idx, "expiryDate", e.target.value)} dir="ltr" className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-teal-500 focus:outline-none" /></div>
                            <div className="sm:col-span-2"><label className="block text-xs text-muted-foreground mb-1">הערות מצב</label><input value={item.conditionNotes} onChange={e => updateReceiptItem(idx, "conditionNotes", e.target.value)} placeholder="תיאור מצב פיזי" className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm placeholder-gray-600 focus:border-teal-500 focus:outline-none" /></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div><label className="block text-xs text-muted-foreground mb-1">הערות כלליות</label><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:border-teal-500 focus:outline-none resize-none text-sm" rows={2} /></div>

                {(createMut.error || updateMut.error) && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{(createMut.error as Error)?.message || (updateMut.error as Error)?.message}</div>}
                <div className="flex items-center gap-3 pt-2">
                  <button type="submit" disabled={createMut.isPending || updateMut.isPending} className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:bg-teal-800 text-foreground rounded-lg font-medium"><Save className="w-4 h-4" />{editingId ? "עדכן" : "שמור"}</button>
                  <button type="button" onClick={closeForm} className="px-4 py-2.5 text-muted-foreground hover:text-foreground">ביטול</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirm !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
            <div className="bg-card border border-border rounded-xl p-6 max-w-sm mx-4" dir="rtl">
              <h3 className="text-lg font-bold text-foreground mb-2">מחיקת קבלה</h3>
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
