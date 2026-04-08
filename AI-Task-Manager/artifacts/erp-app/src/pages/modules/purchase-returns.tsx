import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import {
  RotateCcw, Package, AlertTriangle, TrendingUp, TrendingDown,
  Search, Plus, Edit2, Trash2, X, Save, Eye, Calendar, DollarSign,
  FileText, Truck, CheckCircle2, Clock, XCircle, ChevronDown, ChevronUp,
  CreditCard, ArrowLeftRight, Hash, ClipboardList, ShieldCheck, RefreshCw, Copy
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";

interface PurchaseReturn {
  id: number;
  returnNumber: string;
  purchaseOrderId: number | null;
  goodsReceiptId: number | null;
  supplierId: number;
  returnDate: string;
  reasonCategory: string;
  reasonDetails: string | null;
  returnedBy: string | null;
  approvedBy: string | null;
  creditNoteNumber: string | null;
  creditNoteAmount: string | null;
  creditNoteDate: string | null;
  creditNoteReceived: boolean;
  replacementOrderId: number | null;
  replacementRequested: boolean;
  shippingMethod: string | null;
  trackingNumber: string | null;
  warehouseLocation: string | null;
  totalItems: number;
  totalValue: string;
  currency: string;
  status: string;
  notes: string | null;
  createdAt: string;
}

interface ReturnItem {
  id: number;
  returnId: number;
  materialId: number | null;
  itemCode: string | null;
  itemName: string;
  unit: string;
  orderedQuantity: string;
  receivedQuantity: string;
  returnedQuantity: string;
  unitPrice: string;
  totalPrice: string;
  reason: string | null;
  conditionOnReturn: string;
  lotNumber: string | null;
  serialNumber: string | null;
  inspectionNotes: string | null;
  photoUrls: string | null;
  status: string;
}

interface Supplier {
  id: number;
  supplierName: string;
}

const REASON_CATEGORIES = ["פגם באיכות", "כמות עודפת", "פריט שגוי", "נזק במשלוח", "לא תואם מפרט", "פג תוקף", "אחר"];
const ITEM_CONDITIONS = ["פגום", "תקין-לא נדרש", "נזק חלקי", "פג תוקף", "שגוי"];
const STATUSES = ["טיוטה", "ממתין לאישור", "מאושר", "נשלח", "התקבל אצל ספק", "זוכה", "סגור", "בוטל"];
const SHIPPING_METHODS = ["שליח", "דואר", "איסוף עצמי ע\"י ספק", "משלוח חוזר", "אחר"];

type ViewMode = "dashboard" | "list" | "credit";

function statusColor(status: string): string {
  const colors: Record<string, string> = {
    "טיוטה": "bg-muted/20 text-muted-foreground border-gray-500/30",
    "ממתין לאישור": "bg-amber-500/20 text-amber-400 border-amber-500/30",
    "מאושר": "bg-blue-500/20 text-blue-400 border-blue-500/30",
    "נשלח": "bg-purple-500/20 text-purple-400 border-purple-500/30",
    "התקבל אצל ספק": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    "זוכה": "bg-green-500/20 text-green-400 border-green-500/30",
    "סגור": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    "בוטל": "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return colors[status] || "bg-muted/20 text-muted-foreground border-gray-500/30";
}

function reasonIcon(reason: string) {
  const icons: Record<string, any> = {
    "פגם באיכות": ShieldCheck,
    "כמות עודפת": Package,
    "פריט שגוי": XCircle,
    "נזק במשלוח": Truck,
    "לא תואם מפרט": ClipboardList,
    "פג תוקף": Clock,
    "אחר": AlertTriangle,
  };
  return icons[reason] || AlertTriangle;
}

const emptyItem = (): any => ({
  itemName: "", itemCode: "", unit: "יח", orderedQuantity: "", receivedQuantity: "",
  returnedQuantity: "", unitPrice: "", reason: "", conditionOnReturn: "פגום",
  lotNumber: "", serialNumber: "", inspectionNotes: "",
});

export default function PurchaseReturnsPage() {
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingReturn, setEditingReturn] = useState<PurchaseReturn | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<PurchaseReturn | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({ returnNumber: { required: true, message: "מספר החזרה נדרש" } });

  const { data: returnsRaw, isLoading } = useQuery({
    queryKey: ["purchase-returns"],
    queryFn: async () => { const r = await authFetch(`${API}/purchase-returns`); return r.json(); },
  });
  const returns: PurchaseReturn[] = Array.isArray(returnsRaw) ? returnsRaw : (returnsRaw?.data || returnsRaw?.items || []);

  const { data: suppliersRaw } = useQuery({
    queryKey: ["suppliers-for-returns"],
    queryFn: async () => { const r = await authFetch(`${API}/suppliers`); return r.json(); },
  });
  const suppliers: Supplier[] = Array.isArray(suppliersRaw) ? suppliersRaw : (suppliersRaw?.data || suppliersRaw?.items || []);

  const supplierMap = useMemo(() => {
    const m: Record<number, Supplier> = {};
    suppliers.forEach(s => { m[s.id] = s; });
    return m;
  }, [suppliers]);

  const { data: selectedItemsRaw } = useQuery({
    queryKey: ["return-items", selectedReturn?.id],
    queryFn: async () => {
      if (!selectedReturn) return [];
      const r = await authFetch(`${API}/purchase-returns/${selectedReturn.id}/items`);
      return r.json();
    },
    enabled: !!selectedReturn,
  });
  const selectedItems: ReturnItem[] = Array.isArray(selectedItemsRaw) ? selectedItemsRaw : (selectedItemsRaw?.data || []);

  const filtered = useMemo(() => {
    return returns.filter(r => {
      const sn = supplierMap[r.supplierId]?.supplierName || "";
      const matchSearch = !search || sn.includes(search) || r.returnNumber.includes(search) || (r.reasonCategory || "").includes(search);
      const matchStatus = statusFilter === "all" || r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [returns, search, statusFilter, supplierMap]);

  const kpis = useMemo(() => {
    const total = returns.length;
    const open = returns.filter(r => !["סגור", "בוטל"].includes(r.status)).length;
    const totalValue = returns.reduce((s, r) => s + parseFloat(r.totalValue || "0"), 0);
    const credited = returns.filter(r => r.creditNoteReceived).length;
    const pendingCredit = returns.filter(r => r.status === "זוכה" || (r.creditNoteNumber && !r.creditNoteReceived)).length;
    const creditTotal = returns.reduce((s, r) => s + parseFloat(r.creditNoteAmount || "0"), 0);
    const replacements = returns.filter(r => r.replacementRequested).length;
    const reasonCounts: Record<string, number> = {};
    returns.forEach(r => { reasonCounts[r.reasonCategory] = (reasonCounts[r.reasonCategory] || 0) + 1; });
    const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    return { total, open, totalValue, credited, pendingCredit, creditTotal, replacements, topReason };
  }, [returns]);

  const [form, setForm] = useState<any>({
    supplierId: "", returnDate: new Date().toISOString().split("T")[0],
    reasonCategory: "פגם באיכות", reasonDetails: "", returnedBy: "", approvedBy: "",
    creditNoteNumber: "", creditNoteAmount: "", creditNoteDate: "", creditNoteReceived: false,
    replacementRequested: false, shippingMethod: "", trackingNumber: "",
    warehouseLocation: "", notes: "", status: "טיוטה",
    purchaseOrderId: "", goodsReceiptId: "",
    items: [emptyItem()],
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const url = data.id ? `${API}/purchase-returns/${data.id}` : `${API}/purchase-returns`;
      const method = data.id ? "PUT" : "POST";
      const r = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-returns"] }); setShowForm(false); setEditingReturn(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/purchase-returns/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Delete failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase-returns"] }),
  });

  function openForm(ret?: PurchaseReturn) {
    if (ret) {
      setEditingReturn(ret);
      authFetch(`${API}/purchase-returns/${ret.id}/items`).then(r => r.json()).then(items => {
        const safeItems = Array.isArray(items) ? items : [];
        setForm({
          supplierId: ret.supplierId, returnDate: ret.returnDate || "",
          reasonCategory: ret.reasonCategory, reasonDetails: ret.reasonDetails || "",
          returnedBy: ret.returnedBy || "", approvedBy: ret.approvedBy || "",
          creditNoteNumber: ret.creditNoteNumber || "", creditNoteAmount: ret.creditNoteAmount || "",
          creditNoteDate: ret.creditNoteDate || "", creditNoteReceived: ret.creditNoteReceived,
          replacementRequested: ret.replacementRequested, shippingMethod: ret.shippingMethod || "",
          trackingNumber: ret.trackingNumber || "", warehouseLocation: ret.warehouseLocation || "",
          notes: ret.notes || "", status: ret.status,
          purchaseOrderId: ret.purchaseOrderId || "", goodsReceiptId: ret.goodsReceiptId || "",
          items: safeItems.length > 0 ? safeItems.map((it: any) => ({
            itemName: it.itemName, itemCode: it.itemCode || "", unit: it.unit || "יח",
            orderedQuantity: it.orderedQuantity || "", receivedQuantity: it.receivedQuantity || "",
            returnedQuantity: it.returnedQuantity || "", unitPrice: it.unitPrice || "",
            reason: it.reason || "", conditionOnReturn: it.conditionOnReturn || "פגום",
            lotNumber: it.lotNumber || "", serialNumber: it.serialNumber || "",
            inspectionNotes: it.inspectionNotes || "",
          })) : [emptyItem()],
        });
      });
    } else {
      setEditingReturn(null);
      setForm({
        supplierId: "", returnDate: new Date().toISOString().split("T")[0],
        reasonCategory: "פגם באיכות", reasonDetails: "", returnedBy: "", approvedBy: "",
        creditNoteNumber: "", creditNoteAmount: "", creditNoteDate: "", creditNoteReceived: false,
        replacementRequested: false, shippingMethod: "", trackingNumber: "",
        warehouseLocation: "", notes: "", status: "טיוטה",
        purchaseOrderId: "", goodsReceiptId: "",
        items: [emptyItem()],
      });
    }
    setShowForm(true);
  }

  function handleSubmit() {
    const payload = { ...form };
    if (editingReturn) payload.id = editingReturn.id;
    payload.items = form.items.filter((it: any) => it.itemName.trim());
    saveMutation.mutate(payload);
  }

  function updateItem(index: number, field: string, value: string) {
    const items = [...form.items];
    items[index] = { ...items[index], [field]: value };
    setForm({ ...form, items });
  }

  function addItem() {
    setForm({ ...form, items: [...form.items, emptyItem()] });
  }

  function removeItem(index: number) {
    if (form.items.length <= 1) return;
    setForm({ ...form, items: form.items.filter((_: any, i: number) => i !== index) });
  }

  const formTotal = useMemo(() => {
    return form.items.reduce((s: number, it: any) => s + (parseFloat(it.returnedQuantity || "0") * parseFloat(it.unitPrice || "0")), 0);
  }, [form.items]);

  const tabs: { key: ViewMode; label: string; icon: any }[] = [
    { key: "dashboard", label: "דשבורד", icon: RotateCcw },
    { key: "list", label: "רשימת החזרות", icon: ClipboardList },
    { key: "credit", label: "מעקב זיכויים", icon: CreditCard },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-foreground p-4 md:p-6" dir="rtl">
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-500/20 rounded-xl border border-orange-500/30">
              <RotateCcw className="text-orange-400" size={28} />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold">החזרות רכש</h1>
              <p className="text-muted-foreground text-sm">ניהול החזרות לספקים, מעקב זיכויים והחלפות</p>
            </div>
          </div>
          <button onClick={() => openForm()} className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 rounded-lg font-medium transition-colors">
            <Plus size={18} /> החזרה חדשה
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "סה\"כ החזרות", value: kpis.total, icon: RotateCcw, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
            { label: "פתוחות", value: kpis.open, icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
            { label: "שווי החזרות", value: `₪${kpis.totalValue.toLocaleString()}`, icon: DollarSign, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
            { label: "זוכו", value: kpis.credited, icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
            { label: "ממתין לזיכוי", value: kpis.pendingCredit, icon: CreditCard, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
            { label: "סה\"כ זיכויים", value: `₪${kpis.creditTotal.toLocaleString()}`, icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
            { label: "בקשות החלפה", value: kpis.replacements, icon: RefreshCw, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
            { label: "סיבה מובילה", value: kpis.topReason, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", isText: true },
          ].map((k, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`${k.bg} border rounded-xl p-3 text-center`}>
              <k.icon className={`${k.color} mx-auto mb-1`} size={20} />
              <div className={`${(k as any).isText ? "text-sm" : "text-xl"} font-bold ${k.color}`}>{k.value}</div>
              <div className="text-[10px] text-muted-foreground">{k.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Tabs & Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-1 bg-muted/50 rounded-xl p-1 border border-border/50">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setViewMode(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === t.key ? "bg-orange-600 text-foreground shadow-lg" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
                <t.icon size={16} /> {t.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי ספק, מספר החזרה, סיבה..."
              className="w-full bg-muted/60 border border-border rounded-lg pr-10 pl-4 py-2.5 text-sm text-foreground placeholder-gray-500 focus:border-orange-500/50 focus:outline-none" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-muted/60 border border-border rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:border-orange-500/50 focus:outline-none">
            <option value="all">כל הסטטוסים</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {viewMode === "dashboard" && (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4 sm:space-y-6">
              {/* Status Distribution & Reason Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-muted/40 border border-border/50 rounded-xl p-5">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><RotateCcw className="text-orange-400" size={20} /> התפלגות סטטוסים</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {STATUSES.map(status => {
                      const count = returns.filter(r => r.status === status).length;
                      if (count === 0 && !["טיוטה", "ממתין לאישור", "מאושר", "נשלח", "זוכה", "סגור"].includes(status)) return null;
                      return (
                        <div key={status} className={`${statusColor(status)} border rounded-lg p-3 text-center`}>
                          <div className="text-xl font-bold">{count}</div>
                          <div className="text-xs">{status}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-muted/40 border border-border/50 rounded-xl p-5">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><AlertTriangle className="text-red-400" size={20} /> סיבות החזרה</h3>
                  <div className="space-y-3">
                    {REASON_CATEGORIES.map(reason => {
                      const count = returns.filter(r => r.reasonCategory === reason).length;
                      const pct = returns.length ? (count / returns.length * 100) : 0;
                      const Icon = reasonIcon(reason);
                      return (
                        <div key={reason} className="flex items-center gap-3">
                          <Icon size={16} className="text-muted-foreground flex-shrink-0" />
                          <span className="text-sm w-28 text-gray-300">{reason}</span>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }}
                              className="h-full bg-orange-500 rounded-full" />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-left">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Process Flow */}
              <div className="bg-muted/40 border border-border/50 rounded-xl p-5">
                <h3 className="text-lg font-bold mb-4">תהליך החזרה</h3>
                <div className="flex items-center justify-between overflow-x-auto pb-2">
                  {[
                    { step: "טיוטה", icon: FileText, color: "bg-muted" },
                    { step: "ממתין לאישור", icon: Clock, color: "bg-amber-600" },
                    { step: "מאושר", icon: CheckCircle2, color: "bg-blue-600" },
                    { step: "נשלח", icon: Truck, color: "bg-purple-600" },
                    { step: "התקבל אצל ספק", icon: Package, color: "bg-cyan-600" },
                    { step: "זוכה", icon: CreditCard, color: "bg-green-600" },
                    { step: "סגור", icon: CheckCircle2, color: "bg-emerald-600" },
                  ].map((s, i, arr) => {
                    const count = returns.filter(r => r.status === s.step).length;
                    return (
                      <div key={s.step} className="flex items-center flex-shrink-0">
                        <div className="text-center">
                          <div className={`${s.color} w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-1`}>
                            <s.icon size={20} className="text-foreground" />
                          </div>
                          <div className="text-xs text-gray-300 whitespace-nowrap">{s.step}</div>
                          <div className="text-lg font-bold text-foreground">{count}</div>
                        </div>
                        {i < arr.length - 1 && <div className="w-8 h-0.5 bg-muted mx-2 mt-[-20px]" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Returns Table */}
              <div className="bg-muted/40 border border-border/50 rounded-xl p-5">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Calendar className="text-blue-400" size={20} /> החזרות אחרונות</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">מס' החזרה</th>
                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">ספק</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">תאריך</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">סיבה</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">פריטים</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">שווי</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">זיכוי</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">סטטוס</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">פעולות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, 15).map(ret => (
                        <tr key={ret.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-2 font-mono text-orange-400">{ret.returnNumber}</td>
                          <td className="py-3 px-2 font-medium">{supplierMap[ret.supplierId]?.supplierName || `ספק #${ret.supplierId}`}</td>
                          <td className="py-3 px-2 text-center text-gray-300">{ret.returnDate}</td>
                          <td className="py-3 px-2 text-center text-xs">{ret.reasonCategory}</td>
                          <td className="py-3 px-2 text-center font-bold">{ret.totalItems}</td>
                          <td className="py-3 px-2 text-center text-blue-400">₪{parseFloat(ret.totalValue || "0").toLocaleString()}</td>
                          <td className="py-3 px-2 text-center">
                            {ret.creditNoteReceived ? (
                              <span className="text-green-400 flex items-center justify-center gap-1"><CheckCircle2 size={14} /> ₪{parseFloat(ret.creditNoteAmount || "0").toLocaleString()}</span>
                            ) : ret.creditNoteNumber ? (
                              <span className="text-amber-400">ממתין</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs border ${statusColor(ret.status)}`}>{ret.status}</span>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => setSelectedReturn(ret)} className="p-1.5 hover:bg-muted rounded-lg"><Eye size={14} className="text-muted-foreground" /></button>
                              <button onClick={() => openForm(ret)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 size={14} className="text-blue-400" /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/purchase-returns`, ret.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                              {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק החזרה זו?", { itemName: ret.return_number || ret.reference || String(ret.id), entityType: "החזרת רכש" }); if (ok) deleteMutation.mutate(ret.id); }} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 size={14} className="text-red-400" /></button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length === 0 && <p className="text-muted-foreground text-center py-8">אין החזרות</p>}
                </div>
              </div>
            </motion.div>
          )}

          {viewMode === "list" && (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <BulkActions selectedIds={bulk.selectedIds} onClear={bulk.clear} entityName="החזרות" actions={defaultBulkActions(bulk.selectedIds, bulk.clear, () => qc.invalidateQueries({ queryKey: ["purchase-returns"] }), `${API}/purchase-returns`)} />
              {filtered.map(ret => {
                const Icon = reasonIcon(ret.reasonCategory);
                return (
                  <motion.div key={ret.id} layout className={`bg-muted/40 border border-border/50 rounded-xl p-4 hover:border-orange-500/30 transition-all ${bulk.isSelected(ret.id) ? "ring-1 ring-primary/50 bg-primary/5" : ""}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div onClick={e => e.stopPropagation()}><BulkCheckbox checked={bulk.isSelected(ret.id)} onChange={() => bulk.toggle(ret.id)} /></div>
                        <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20">
                          <Icon className="text-orange-400" size={22} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-orange-400 font-bold">{ret.returnNumber}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs border ${statusColor(ret.status)}`}>{ret.status}</span>
                          </div>
                          <div className="text-sm text-gray-300">{supplierMap[ret.supplierId]?.supplierName || `ספק #${ret.supplierId}`}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                            <span className="flex items-center gap-1"><Calendar size={11} /> {ret.returnDate}</span>
                            <span>{ret.reasonCategory}</span>
                            {ret.returnedBy && <span>ע"י {ret.returnedBy}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">פריטים</div>
                          <div className="font-bold">{ret.totalItems}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">שווי</div>
                          <div className="font-bold text-blue-400">₪{parseFloat(ret.totalValue || "0").toLocaleString()}</div>
                        </div>
                        {ret.creditNoteReceived && (
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground">זיכוי</div>
                            <div className="font-bold text-green-400">₪{parseFloat(ret.creditNoteAmount || "0").toLocaleString()}</div>
                          </div>
                        )}
                        {ret.replacementRequested && <RefreshCw size={16} className="text-cyan-400" title="בקשת החלפה" />}
                        <div className="flex gap-1">
                          <button onClick={() => setSelectedReturn(ret)} className="p-1.5 hover:bg-muted rounded-lg"><Eye size={15} className="text-muted-foreground" /></button>
                          <button onClick={() => openForm(ret)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 size={15} className="text-blue-400" /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/purchase-returns`, ret.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                          {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק החזרה זו?", { itemName: ret.return_number || ret.reference || String(ret.id), entityType: "החזרת רכש" }); if (ok) deleteMutation.mutate(ret.id); }} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 size={15} className="text-red-400" /></button>}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              {filtered.length === 0 && <p className="text-muted-foreground text-center py-12">אין החזרות</p>}
            </motion.div>
          )}

          {viewMode === "credit" && (
            <motion.div key="credit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <p className="text-muted-foreground text-sm">מעקב שטרי זיכוי והחלפות מספקים</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
                  <CheckCircle2 className="text-green-400 mx-auto mb-1" size={24} />
                  <div className="text-lg sm:text-2xl font-bold text-green-400">₪{returns.filter(r => r.creditNoteReceived).reduce((s, r) => s + parseFloat(r.creditNoteAmount || "0"), 0).toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">זיכויים שהתקבלו</div>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
                  <Clock className="text-amber-400 mx-auto mb-1" size={24} />
                  <div className="text-lg sm:text-2xl font-bold text-amber-400">{returns.filter(r => r.creditNoteNumber && !r.creditNoteReceived).length}</div>
                  <div className="text-sm text-muted-foreground">ממתינים לקבלה</div>
                </div>
                <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4 text-center">
                  <RefreshCw className="text-cyan-400 mx-auto mb-1" size={24} />
                  <div className="text-lg sm:text-2xl font-bold text-cyan-400">{returns.filter(r => r.replacementRequested).length}</div>
                  <div className="text-sm text-muted-foreground">בקשות החלפה</div>
                </div>
              </div>
              <div className="bg-muted/40 border border-border/50 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/60">
                      <th className="text-right py-3 px-3 text-muted-foreground font-medium">מס' החזרה</th>
                      <th className="text-right py-3 px-3 text-muted-foreground font-medium">ספק</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">שווי החזרה</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">מס' זיכוי</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">סכום זיכוי</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">תאריך זיכוי</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">התקבל</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">החלפה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.filter(r => r.creditNoteNumber || r.replacementRequested || r.status === "זוכה").map(ret => (
                      <tr key={ret.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-3 px-3 font-mono text-orange-400">{ret.returnNumber}</td>
                        <td className="py-3 px-3">{supplierMap[ret.supplierId]?.supplierName || `ספק #${ret.supplierId}`}</td>
                        <td className="py-3 px-3 text-center text-blue-400">₪{parseFloat(ret.totalValue || "0").toLocaleString()}</td>
                        <td className="py-3 px-3 text-center font-mono">{ret.creditNoteNumber || "—"}</td>
                        <td className="py-3 px-3 text-center font-bold text-green-400">{ret.creditNoteAmount ? `₪${parseFloat(ret.creditNoteAmount).toLocaleString()}` : "—"}</td>
                        <td className="py-3 px-3 text-center text-gray-300">{ret.creditNoteDate || "—"}</td>
                        <td className="py-3 px-3 text-center">
                          {ret.creditNoteReceived ? <CheckCircle2 size={18} className="text-green-400 mx-auto" /> : ret.creditNoteNumber ? <Clock size={18} className="text-amber-400 mx-auto" /> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {ret.replacementRequested ? <RefreshCw size={16} className="text-cyan-400 mx-auto" /> : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {returns.filter(r => r.creditNoteNumber || r.replacementRequested).length === 0 && (
                  <p className="text-muted-foreground text-center py-8">אין זיכויים או החלפות</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Detail Modal */}
        <AnimatePresence>
          {selectedReturn && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setSelectedReturn(null)}>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-background border border-border rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <RotateCcw className="text-orange-400" size={22} />
                    החזרה {selectedReturn.returnNumber}
                  </h3>
                  <button onClick={() => setSelectedReturn(null)} className="p-2 hover:bg-muted rounded-lg"><X size={20} /></button>
                </div>

                <div className="flex border-b border-border mb-6">
                  {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                    <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-orange-500 text-orange-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                  ))}
                </div>

                {detailTab === "details" && (<>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6 text-sm">
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">ספק:</span> <span className="font-medium mr-2">{supplierMap[selectedReturn.supplierId]?.supplierName || `#${selectedReturn.supplierId}`}</span></div>
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">תאריך:</span> <span className="font-medium mr-2">{selectedReturn.returnDate}</span></div>
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">סטטוס:</span> <span className={`mr-2 px-2 py-0.5 rounded-full text-xs border ${statusColor(selectedReturn.status)}`}>{selectedReturn.status}</span></div>
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">סיבה:</span> <span className="font-medium mr-2">{selectedReturn.reasonCategory}</span></div>
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">החזיר:</span> <span className="font-medium mr-2">{selectedReturn.returnedBy || "—"}</span></div>
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">אישר:</span> <span className="font-medium mr-2">{selectedReturn.approvedBy || "—"}</span></div>
                </div>

                {selectedReturn.reasonDetails && (
                  <div className="bg-muted/40 rounded-lg p-3 mb-4">
                    <div className="text-xs text-muted-foreground mb-1">פרטי הסיבה</div>
                    <p className="text-sm">{selectedReturn.reasonDetails}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-blue-400">{selectedReturn.totalItems}</div>
                    <div className="text-xs text-muted-foreground">פריטים</div>
                  </div>
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-orange-400">₪{parseFloat(selectedReturn.totalValue || "0").toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">שווי החזרה</div>
                  </div>
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-green-400">{selectedReturn.creditNoteReceived ? `₪${parseFloat(selectedReturn.creditNoteAmount || "0").toLocaleString()}` : "—"}</div>
                    <div className="text-xs text-muted-foreground">זיכוי</div>
                  </div>
                </div>

                {selectedReturn.creditNoteNumber && (
                  <div className="bg-muted/40 rounded-lg p-3 mb-4">
                    <h4 className="font-bold text-sm mb-2 flex items-center gap-2"><CreditCard className="text-green-400" size={16} /> פרטי זיכוי</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted-foreground">מס' זיכוי:</span> <span className="mr-1">{selectedReturn.creditNoteNumber}</span></div>
                      <div><span className="text-muted-foreground">תאריך:</span> <span className="mr-1">{selectedReturn.creditNoteDate || "—"}</span></div>
                      <div><span className="text-muted-foreground">סכום:</span> <span className="mr-1 text-green-400">₪{parseFloat(selectedReturn.creditNoteAmount || "0").toLocaleString()}</span></div>
                      <div><span className="text-muted-foreground">התקבל:</span> <span className="mr-1">{selectedReturn.creditNoteReceived ? "כן ✓" : "לא"}</span></div>
                    </div>
                  </div>
                )}

                {selectedReturn.shippingMethod && (
                  <div className="bg-muted/40 rounded-lg p-3 mb-4">
                    <h4 className="font-bold text-sm mb-2 flex items-center gap-2"><Truck className="text-purple-400" size={16} /> פרטי משלוח</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted-foreground">אופן:</span> <span className="mr-1">{selectedReturn.shippingMethod}</span></div>
                      <div><span className="text-muted-foreground">מעקב:</span> <span className="mr-1 font-mono">{selectedReturn.trackingNumber || "—"}</span></div>
                    </div>
                  </div>
                )}

                {/* Items Table */}
                {selectedItems.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-bold text-sm mb-2 flex items-center gap-2"><Package className="text-blue-400" size={16} /> פריטים ({selectedItems.length})</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border/50">
                            <th className="text-right py-2 px-2 text-muted-foreground">פריט</th>
                            <th className="text-center py-2 px-2 text-muted-foreground">קוד</th>
                            <th className="text-center py-2 px-2 text-muted-foreground">כמות</th>
                            <th className="text-center py-2 px-2 text-muted-foreground">מחיר</th>
                            <th className="text-center py-2 px-2 text-muted-foreground">סה"כ</th>
                            <th className="text-center py-2 px-2 text-muted-foreground">מצב</th>
                            <th className="text-center py-2 px-2 text-muted-foreground">סיבה</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedItems.map(item => (
                            <tr key={item.id} className="border-b border-border/50">
                              <td className="py-2 px-2 font-medium">{item.itemName}</td>
                              <td className="py-2 px-2 text-center font-mono text-muted-foreground">{item.itemCode || "—"}</td>
                              <td className="py-2 px-2 text-center">{item.returnedQuantity} {item.unit}</td>
                              <td className="py-2 px-2 text-center">₪{parseFloat(item.unitPrice || "0").toLocaleString()}</td>
                              <td className="py-2 px-2 text-center text-blue-400">₪{parseFloat(item.totalPrice || "0").toLocaleString()}</td>
                              <td className="py-2 px-2 text-center text-xs">{item.conditionOnReturn}</td>
                              <td className="py-2 px-2 text-center text-xs text-muted-foreground">{item.reason || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {selectedReturn.notes && (
                  <div className="bg-muted/40 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground mb-1">הערות</div>
                    <p className="text-sm">{selectedReturn.notes}</p>
                  </div>
                )}
                </>)}

                {detailTab === "related" && (
                  <RelatedRecords entityType="purchase-returns" entityId={selectedReturn.id} relations={[
                    { key: "purchase-orders", label: "הזמנות רכש", endpoint: "/api/purchase-orders" },
                    { key: "suppliers", label: "ספקים", endpoint: "/api/suppliers" },
                    { key: "goods-receipts", label: "קבלות סחורה", endpoint: "/api/goods-receipts" },
                  ]} />
                )}
                {detailTab === "docs" && (
                  <AttachmentsSection entityType="purchase-returns" entityId={selectedReturn.id} />
                )}
                {detailTab === "history" && (
                  <ActivityLog entityType="purchase-returns" entityId={selectedReturn.id} />
                )}
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
                  <h3 className="text-xl font-bold">{editingReturn ? `עריכת החזרה ${editingReturn.returnNumber}` : "החזרה חדשה"}</h3>
                  <button onClick={() => setShowForm(false)} className="p-2 hover:bg-muted rounded-lg"><X size={20} /></button>
                </div>

                <div className="space-y-5">
                  {/* Basic Info */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">ספק *</label>
                      <select value={form.supplierId} onChange={e => setForm({ ...form, supplierId: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-orange-500/50 focus:outline-none">
                        <option value="">בחר ספק...</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplierName}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">תאריך החזרה</label>
                      <input type="date" value={form.returnDate} onChange={e => setForm({ ...form, returnDate: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-orange-500/50 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">סיבת החזרה *</label>
                      <select value={form.reasonCategory} onChange={e => setForm({ ...form, reasonCategory: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-orange-500/50 focus:outline-none">
                        {REASON_CATEGORIES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">הזמנת רכש מקורית (מס')</label>
                      <input type="number" value={form.purchaseOrderId} onChange={e => setForm({ ...form, purchaseOrderId: e.target.value })} placeholder="מס' הזמנה"
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-orange-500/50 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">מוחזר ע"י</label>
                      <input value={form.returnedBy} onChange={e => setForm({ ...form, returnedBy: e.target.value })} placeholder="שם"
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-orange-500/50 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">מאשר</label>
                      <input value={form.approvedBy} onChange={e => setForm({ ...form, approvedBy: e.target.value })} placeholder="שם המאשר"
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-orange-500/50 focus:outline-none" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">פירוט הסיבה</label>
                    <textarea rows={2} value={form.reasonDetails} onChange={e => setForm({ ...form, reasonDetails: e.target.value })}
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-orange-500/50 focus:outline-none resize-none" />
                  </div>

                  {/* Items */}
                  <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-bold flex items-center gap-2"><Package className="text-blue-400" size={18} /> פריטים להחזרה</h4>
                      <button onClick={addItem} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-medium">
                        <Plus size={14} /> הוסף פריט
                      </button>
                    </div>
                    <div className="space-y-3">
                      {form.items.map((item: any, i: number) => (
                        <div key={i} className="bg-background/60 rounded-lg p-3 border border-border/30">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-muted-foreground">פריט {i + 1}</span>
                            {form.items.length > 1 && (
                              <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-300 p-1"><X size={14} /></button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <input value={item.itemName} onChange={e => updateItem(i, "itemName", e.target.value)} placeholder="שם פריט *"
                              className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs focus:border-orange-500/50 focus:outline-none" />
                            <input value={item.itemCode} onChange={e => updateItem(i, "itemCode", e.target.value)} placeholder="קוד פריט"
                              className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs focus:border-orange-500/50 focus:outline-none" />
                            <input type="number" value={item.returnedQuantity} onChange={e => updateItem(i, "returnedQuantity", e.target.value)} placeholder="כמות להחזרה *"
                              className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs focus:border-orange-500/50 focus:outline-none" />
                            <input type="number" value={item.unitPrice} onChange={e => updateItem(i, "unitPrice", e.target.value)} placeholder="מחיר ליח'"
                              className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs focus:border-orange-500/50 focus:outline-none" />
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                            <select value={item.conditionOnReturn} onChange={e => updateItem(i, "conditionOnReturn", e.target.value)}
                              className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs focus:border-orange-500/50 focus:outline-none">
                              {ITEM_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <input value={item.reason} onChange={e => updateItem(i, "reason", e.target.value)} placeholder="סיבה ספציפית"
                              className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs focus:border-orange-500/50 focus:outline-none" />
                            <input value={item.lotNumber} onChange={e => updateItem(i, "lotNumber", e.target.value)} placeholder="מס' אצווה"
                              className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs focus:border-orange-500/50 focus:outline-none" />
                            <input value={item.serialNumber} onChange={e => updateItem(i, "serialNumber", e.target.value)} placeholder="מס' סידורי"
                              className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs focus:border-orange-500/50 focus:outline-none" />
                          </div>
                          {(parseFloat(item.returnedQuantity || "0") > 0 && parseFloat(item.unitPrice || "0") > 0) && (
                            <div className="text-xs text-blue-400 mt-1 text-left">סה"כ: ₪{(parseFloat(item.returnedQuantity) * parseFloat(item.unitPrice)).toLocaleString()}</div>
                          )}
                        </div>
                      ))}
                    </div>
                    {formTotal > 0 && (
                      <div className="mt-3 text-left text-sm font-bold text-orange-400">סה"כ שווי החזרה: ₪{formTotal.toLocaleString()}</div>
                    )}
                  </div>

                  {/* Credit Note & Shipping */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                      <h4 className="font-bold text-sm mb-3 flex items-center gap-2"><CreditCard className="text-green-400" size={16} /> שטר זיכוי</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <input value={form.creditNoteNumber} onChange={e => setForm({ ...form, creditNoteNumber: e.target.value })} placeholder="מס' זיכוי"
                          className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs focus:border-orange-500/50 focus:outline-none" />
                        <input type="number" value={form.creditNoteAmount} onChange={e => setForm({ ...form, creditNoteAmount: e.target.value })} placeholder="סכום"
                          className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs focus:border-orange-500/50 focus:outline-none" />
                        <input type="date" value={form.creditNoteDate} onChange={e => setForm({ ...form, creditNoteDate: e.target.value })}
                          className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs focus:border-orange-500/50 focus:outline-none" />
                        <label className="flex items-center gap-2 text-xs text-gray-300">
                          <input type="checkbox" checked={form.creditNoteReceived} onChange={e => setForm({ ...form, creditNoteReceived: e.target.checked })}
                            className="rounded border-border" /> זיכוי התקבל
                        </label>
                      </div>
                    </div>
                    <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                      <h4 className="font-bold text-sm mb-3 flex items-center gap-2"><Truck className="text-purple-400" size={16} /> משלוח ומעקב</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <select value={form.shippingMethod} onChange={e => setForm({ ...form, shippingMethod: e.target.value })}
                          className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs focus:border-orange-500/50 focus:outline-none">
                          <option value="">אופן משלוח</option>
                          {SHIPPING_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <input value={form.trackingNumber} onChange={e => setForm({ ...form, trackingNumber: e.target.value })} placeholder="מס' מעקב"
                          className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs focus:border-orange-500/50 focus:outline-none" />
                        <input value={form.warehouseLocation} onChange={e => setForm({ ...form, warehouseLocation: e.target.value })} placeholder="מיקום מחסן"
                          className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs focus:border-orange-500/50 focus:outline-none" />
                        <label className="flex items-center gap-2 text-xs text-gray-300">
                          <input type="checkbox" checked={form.replacementRequested} onChange={e => setForm({ ...form, replacementRequested: e.target.checked })}
                            className="rounded border-border" /> בקשת החלפה
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Status & Notes */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">סטטוס</label>
                      <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-orange-500/50 focus:outline-none">
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">הערות</label>
                      <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-orange-500/50 focus:outline-none resize-none" />
                    </div>
                  </div>

                  {/* Submit */}
                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-border rounded-lg text-gray-300 hover:bg-muted transition-colors">ביטול</button>
                    <button onClick={handleSubmit} disabled={saveMutation.isPending || !form.supplierId}
                      className="flex items-center gap-2 px-6 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:bg-muted disabled:text-muted-foreground rounded-lg font-medium transition-colors">
                      <Save size={16} /> {saveMutation.isPending ? "שומר..." : editingReturn ? "עדכון" : "שמירה"}
                    </button>
                  </div>
                  {saveMutation.isError && <p className="text-red-400 text-sm text-center">{(saveMutation.error as Error).message}</p>}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
