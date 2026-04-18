import { usePermissions } from "@/hooks/use-permissions";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { generatePDF } from "@/lib/pdf-utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import {
  Search, Plus, Edit2, Trash2, X, Save, FileText, ChevronDown, ChevronUp,
  Eye, CheckCircle2, Clock, AlertTriangle, Star, DollarSign, BarChart3,
  Package, Shield, XCircle, ArrowLeft, Calendar, Truck, Award,
  Scale, TrendingUp, Percent, Hash, Users, ThumbsUp, Copy, Download
} from "lucide-react";

const API = "/api";

interface PriceQuoteItem {
  id: number; quoteId: number; materialId: number | null; itemCode: string | null;
  itemDescription: string; quantity: string; unit: string; unitPrice: string;
  discountPercent: string | null; taxPercent: string | null; totalPrice: string; notes: string | null;
}

interface PriceQuote {
  id: number; quoteNumber: string; supplierId: number; requestId: number | null;
  status: string; quoteDate: string | null; validityDate: string | null;
  totalAmount: string | null; totalBeforeTax: string | null; taxAmount: string | null;
  currency: string | null; paymentTerms: string | null; deliveryDays: number | null;
  isRecommended: boolean; comparisonGroup: string | null;
  notes: string | null; createdBy: string | null; createdAt: string;
  items?: PriceQuoteItem[];
}

interface Supplier { id: number; supplierName: string; supplierNumber: string; rating: number | null; }
interface Material { id: number; materialNumber: string; materialName: string; unit: string; standardPrice: string | null; }

const STATUSES = ["טיוטה", "התקבלה", "בבדיקה", "אושרה", "נדחתה", "פג תוקף"];
const STATUS_COLORS: Record<string, string> = {
  "טיוטה": "bg-muted/20 text-muted-foreground", "התקבלה": "bg-blue-500/20 text-blue-400",
  "בבדיקה": "bg-amber-500/20 text-amber-400", "אושרה": "bg-emerald-500/20 text-emerald-400",
  "נדחתה": "bg-red-500/20 text-red-400", "פג תוקף": "bg-muted/20 text-muted-foreground",
};
const STATUS_ICONS: Record<string, any> = {
  "טיוטה": FileText, "התקבלה": Package, "בבדיקה": Clock,
  "אושרה": CheckCircle2, "נדחתה": XCircle, "פג תוקף": AlertTriangle,
};
const UNITS = ["יחידה", 'מ"ר', 'מ"א', "ק״ג", "טון", "ליטר", "קרטון", "חבילה", "פלטה", "צינור", "קורה"];

interface QuoteItemForm {
  materialId: string; itemCode: string; itemDescription: string; quantity: string;
  unit: string; unitPrice: string; discountPercent: string; taxPercent: string;
}
const emptyItem: QuoteItemForm = {
  materialId: "", itemCode: "", itemDescription: "", quantity: "1", unit: "יחידה",
  unitPrice: "0", discountPercent: "0", taxPercent: "18",
};

const emptyForm = {
  quoteNumber: "", supplierId: "", requestId: "", status: "התקבלה",
  quoteDate: new Date().toISOString().split("T")[0], validityDate: "",
  currency: "ILS", paymentTerms: "", deliveryDays: "",
  comparisonGroup: "", notes: "", createdBy: "",
};

function calcLine(qty: string, price: string, disc: string, tax: string) {
  const q = parseFloat(qty || "0"), p = parseFloat(price || "0");
  const d = parseFloat(disc || "0"), t = parseFloat(tax || "0");
  const sub = q * p * (1 - d / 100);
  return { subtotal: sub, tax: sub * t / 100, total: sub * (1 + t / 100) };
}

function cs(currency: string | null) {
  switch (currency) { case "USD": return "$"; case "EUR": return "€"; case "GBP": return "£"; default: return "₪"; }
}


const load: any[] = [];
export default function PriceQuotesPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [quoteItems, setQuoteItems] = useState<QuoteItemForm[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<PriceQuote | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<number, PriceQuoteItem[]>>({});
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonGroup, setComparisonGroup] = useState("");
  const [detailTab, setDetailTab] = useState("details");
  const { selectedIds, toggle, toggleAll, clear, isSelected, isAllSelected } = useBulkSelection();

  const { data: quotesRaw, isLoading } = useQuery({
    queryKey: ["price-quotes"],
    queryFn: async () => { const r = await authFetch(`${API}/price-quotes`); return r.json(); },
  });
  const quotes: PriceQuote[] = Array.isArray(quotesRaw) ? quotesRaw : (quotesRaw?.data || quotesRaw?.items || []);

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

  const filtered = quotes.filter(q => {
    const matchSearch = !search || q.quoteNumber.toLowerCase().includes(search.toLowerCase()) ||
      getSupplierName(q.supplierId).toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || q.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalValue = quotes.reduce((s, q) => s + parseFloat(q.totalAmount || "0"), 0);
  const activeQuotes = quotes.filter(q => !["נדחתה", "פג תוקף"].includes(q.status));
  const approved = quotes.filter(q => q.status === "אושרה");
  const pendingReview = quotes.filter(q => q.status === "בבדיקה");
  const recommended = quotes.filter(q => q.isRecommended);
  const expiringSoon = quotes.filter(q => {
    if (!q.validityDate || ["אושרה", "נדחתה", "פג תוקף"].includes(q.status)) return false;
    const days = Math.ceil((new Date(q.validityDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days >= 0 && days <= 7;
  });
  const comparisonGroups = [...new Set(quotes.map(q => q.comparisonGroup).filter(Boolean))] as string[];

  const statusDistribution = STATUSES.map(s => ({
    status: s, count: quotes.filter(q => q.status === s).length, color: STATUS_COLORS[s],
  })).filter(s => s.count > 0);

  const getSupplierName = (id: number) => suppliers.find(s => s.id === id)?.supplierName || `ספק ${id}`;
  const getSupplierRating = (id: number) => suppliers.find(s => s.id === id)?.rating || 0;

  const createMut = useMutation({
    mutationFn: async (data: { form: typeof emptyForm; items: QuoteItemForm[] }) => {
      let totalBeforeTax = 0, taxTotal = 0;
      for (const item of data.items) {
        const lc = calcLine(item.quantity, item.unitPrice, item.discountPercent, item.taxPercent);
        totalBeforeTax += lc.subtotal; taxTotal += lc.tax;
      }
      const payload: any = {
        ...data.form,
        supplierId: parseInt(data.form.supplierId),
        requestId: data.form.requestId ? parseInt(data.form.requestId) : null,
        deliveryDays: data.form.deliveryDays ? parseInt(data.form.deliveryDays) : null,
        totalAmount: String(totalBeforeTax + taxTotal),
        totalBeforeTax: String(totalBeforeTax),
        taxAmount: String(taxTotal),
      };
      const r = await authFetch(`${API}/price-quotes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      const created = await r.json();
      for (const item of data.items) {
        if (!item.itemDescription) continue;
        const lc = calcLine(item.quantity, item.unitPrice, item.discountPercent, item.taxPercent);
        await authFetch(`${API}/price-quotes/${created.id}/items`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...item, materialId: item.materialId ? parseInt(item.materialId) : null,
            totalPrice: String(lc.total),
          }),
        });
      }
      return created;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["price-quotes"] }); closeForm(); },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof emptyForm }) => {
      const payload: any = {
        ...data, supplierId: parseInt(data.supplierId),
        requestId: data.requestId ? parseInt(data.requestId) : null,
        deliveryDays: data.deliveryDays ? parseInt(data.deliveryDays) : null,
      };
      const r = await authFetch(`${API}/price-quotes/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); } return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["price-quotes"] }); closeForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => { await authFetch(`${API}/price-quotes/${id}`, { method: "DELETE" }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["price-quotes"] }); setDeleteConfirm(null); },
  });

  const recommendMut = useMutation({
    mutationFn: async ({ id, recommend }: { id: number; recommend: boolean }) => {
      const r = await authFetch(`${API}/price-quotes/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRecommended: recommend }),
      });
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["price-quotes"] }); },
  });

  function closeForm() { setShowForm(false); setEditingId(null); setForm(emptyForm); setQuoteItems([]); }
  function openEdit(q: PriceQuote) {
    setForm({
      quoteNumber: q.quoteNumber, supplierId: String(q.supplierId),
      requestId: q.requestId ? String(q.requestId) : "", status: q.status,
      quoteDate: q.quoteDate || "", validityDate: q.validityDate || "",
      currency: q.currency || "ILS", paymentTerms: q.paymentTerms || "",
      deliveryDays: q.deliveryDays ? String(q.deliveryDays) : "",
      comparisonGroup: q.comparisonGroup || "", notes: q.notes || "",
      createdBy: q.createdBy || "",
    });
    setEditingId(q.id); setShowForm(true); setQuoteItems([]);
  }
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.quoteNumber || !form.supplierId) return;
    editingId ? updateMut.mutate({ id: editingId, data: form }) : createMut.mutate({ form, items: quoteItems });
  }

  function addItem() { setQuoteItems([...quoteItems, { ...emptyItem }]); }
  function removeItem(idx: number) { setQuoteItems(quoteItems.filter((_, i) => i !== idx)); }
  function updateItem(idx: number, field: keyof QuoteItemForm, value: string) {
    const updated = [...quoteItems];
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
    setQuoteItems(updated);
  }

  async function loadQuoteItems(quoteId: number) {
    if (expandedRow === quoteId) { setExpandedRow(null); return; }
    if (!expandedItems[quoteId]) {
      const r = await authFetch(`${API}/price-quotes/${quoteId}`);
      const data = await r.json();
      if (data.items) setExpandedItems(prev => ({ ...prev, [quoteId]: data.items }));
    }
    setExpandedRow(quoteId);
  }

  async function openQuoteDetail(q: PriceQuote) {
    const r = await authFetch(`${API}/price-quotes/${q.id}`);
    const data = await r.json();
    setSelectedQuote({ ...data, items: data.items || [] });
  }

  function getValidityDays(date: string | null) {
    if (!date) return null;
    return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  function openComparison(group: string) {
    setComparisonGroup(group);
    setShowComparison(true);
  }

  const itemsTotals = quoteItems.reduce((acc, i) => {
    const lc = calcLine(i.quantity, i.unitPrice, i.discountPercent, i.taxPercent);
    return { beforeTax: acc.beforeTax + lc.subtotal, tax: acc.tax + lc.tax, total: acc.total + lc.total };
  }, { beforeTax: 0, tax: 0, total: 0 });

  return (
    <div className="min-h-screen" dir="rtl">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Scale className="w-6 h-6 text-foreground" />
              </div>
              הצעות מחיר
            </h1>
            <p className="text-muted-foreground mt-1">ניהול הצעות מחיר מספקים, השוואת מחירים והמלצות</p>
          </div>
          <div className="flex items-center gap-2">
            {comparisonGroups.length > 0 && (
              <select onChange={e => { if (e.target.value) openComparison(e.target.value); e.target.value = ""; }}
                className="px-3 py-2.5 bg-card border border-border rounded-xl text-foreground focus:border-amber-500 focus:outline-none text-sm">
                <option value="">השוואת ספקים...</option>
                {comparisonGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
            <button onClick={() => { setForm({...emptyForm, quoteDate: new Date().toISOString().split("T")[0]}); setEditingId(null); setQuoteItems([]); setShowForm(true); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-foreground rounded-xl font-medium transition-colors">
              <Plus className="w-5 h-5" />הצעה חדשה
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "סה״כ הצעות", value: quotes.length, icon: FileText, color: "text-amber-400", bg: "bg-amber-500/10" },
            { label: "פעילות", value: activeQuotes.length, icon: Clock, color: "text-blue-400", bg: "bg-blue-500/10" },
            { label: "בבדיקה", value: pendingReview.length, icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10" },
            { label: "אושרו", value: approved.length, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
            { label: "מומלצות", value: recommended.length, icon: ThumbsUp, color: "text-violet-400", bg: "bg-violet-500/10" },
            { label: "פגות בקרוב", value: expiringSoon.length, icon: AlertTriangle, color: expiringSoon.length > 0 ? "text-red-400" : "text-muted-foreground", bg: expiringSoon.length > 0 ? "bg-red-500/10" : "bg-muted/10" },
            { label: "קבוצות השוואה", value: comparisonGroups.length, icon: Scale, color: "text-cyan-400", bg: "bg-cyan-500/10" },
            { label: "שווי כולל", value: `₪${Math.round(totalValue).toLocaleString()}`, icon: DollarSign, color: "text-purple-400", bg: "bg-purple-500/10" },
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
              <BarChart3 className="w-4 h-4 text-amber-400" />התפלגות סטטוסים
            </h3>
            <div className="flex items-center gap-1 h-6 rounded-full overflow-hidden bg-input">
              {statusDistribution.map((sd, i) => {
                const pct = (sd.count / quotes.length) * 100;
                return pct > 0 ? (
                  <div key={i} className={`h-full ${sd.color.split(" ")[0]} flex items-center justify-center cursor-pointer`}
                    style={{ width: `${pct}%`, minWidth: pct > 3 ? "auto" : "4px" }}
                    onClick={() => setStatusFilter(statusFilter === sd.status ? "all" : sd.status)}>
                    {pct > 8 && <span className="text-[10px] font-bold px-1">{sd.count}</span>}
                  </div>
                ) : null;
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {statusDistribution.map((sd, i) => (
                <button key={i} onClick={() => setStatusFilter(statusFilter === sd.status ? "all" : sd.status)}
                  className={`flex items-center gap-1 text-xs ${statusFilter === sd.status ? "opacity-100 ring-1 ring-gray-600 rounded-md px-1.5 py-0.5" : "opacity-60"} hover:opacity-100`}>
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
            <input type="text" placeholder="חיפוש לפי מספר הצעה או ספק..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-foreground placeholder-gray-500 focus:border-amber-500 focus:outline-none" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 bg-card border border-border rounded-xl text-foreground focus:border-amber-500 focus:outline-none">
            <option value="all">כל הסטטוסים</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Scale className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl text-muted-foreground">אין הצעות מחיר</h3>
            <p className="text-muted-foreground text-sm mt-2">{search || statusFilter !== "all" ? "נסה לשנות את מסנני החיפוש" : 'לחץ "הצעה חדשה" כדי להתחיל'}</p>
          </div>
        ) : (
          <>
          <BulkActions selectedIds={selectedIds} onClear={clear} entityName="הצעות מחיר" actions={defaultBulkActions(selectedIds, clear, () => qc.invalidateQueries({ queryKey: ["price-quotes"] }), `${API}/price-quotes`)} />
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-input">
              <span className="text-sm text-muted-foreground">{filtered.length} הצעות</span>
            </div>
            <table className="w-full text-right">
              <thead><tr className="border-b border-border bg-input">
                <th className="px-4 py-3 w-8"><BulkCheckbox checked={isAllSelected(filtered.map(q => q.id))} onChange={() => toggleAll(filtered.map(q => q.id))} /></th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm w-8"></th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">מספר</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">ספק</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">תאריך</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">תוקף</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">סכום</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">אספקה</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">סטטוס</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">קבוצה</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">פעולות</th>
              </tr></thead>
              <tbody>
                {filtered.map(q => {
                  const vDays = getValidityDays(q.validityDate);
                  const expired = vDays !== null && vDays < 0 && !["אושרה", "נדחתה", "פג תוקף"].includes(q.status);
                  return (
                    <>
                      <tr key={q.id} className={`border-b border-border/50 hover:bg-muted cursor-pointer transition-colors ${isSelected(q.id) ? "bg-amber-500/10" : expired ? "bg-red-500/5" : q.isRecommended ? "bg-emerald-500/5" : ""}`}
                        onClick={() => loadQuoteItems(q.id)}>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}><BulkCheckbox checked={isSelected(q.id)} onChange={() => toggle(q.id)} /></td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {expandedRow === q.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-amber-400 font-mono text-sm">{q.quoteNumber}</span>
                            {q.isRecommended && <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" title="מומלצת" />}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground text-sm">{getSupplierName(q.supplierId)}</td>
                        <td className="px-4 py-3 text-gray-300 text-sm">{q.quoteDate ? new Date(q.quoteDate).toLocaleDateString("he-IL") : "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-sm ${expired ? "text-red-400 font-bold" : vDays !== null && vDays <= 7 ? "text-amber-400" : "text-gray-300"}`}>
                            {q.validityDate ? new Date(q.validityDate).toLocaleDateString("he-IL") : "—"}
                          </span>
                          {vDays !== null && !["אושרה", "נדחתה", "פג תוקף"].includes(q.status) && (
                            <span className={`block text-xs ${expired ? "text-red-400" : vDays <= 7 ? "text-amber-400" : "text-muted-foreground"}`}>
                              {expired ? `פג לפני ${Math.abs(vDays)} ימים` : vDays === 0 ? "אחרון" : `עוד ${vDays} ימים`}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-foreground font-mono text-sm font-medium" dir="ltr">
                          {q.totalAmount ? `${cs(q.currency)}${parseFloat(q.totalAmount).toLocaleString()}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-sm">{q.deliveryDays ? `${q.deliveryDays} ימים` : "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[q.status] || ""}`}>
                            {STATUS_ICONS[q.status] && (() => { const Icon = STATUS_ICONS[q.status]; return <Icon className="w-3 h-3" />; })()}
                            {q.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {q.comparisonGroup ? (
                            <button onClick={e => { e.stopPropagation(); openComparison(q.comparisonGroup!); }}
                              className="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-md text-xs hover:bg-cyan-500/20">
                              {q.comparisonGroup}
                            </button>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button onClick={() => openQuoteDetail(q)} className="p-1.5 text-muted-foreground hover:text-amber-400 rounded-md"><Eye className="w-4 h-4" /></button>
                            <button onClick={() => openEdit(q)} className="p-1.5 text-muted-foreground hover:text-blue-400 rounded-md"><Edit2 className="w-4 h-4" /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/price-quotes`, q.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                            <button onClick={() => recommendMut.mutate({ id: q.id, recommend: !q.isRecommended })}
                              className={`p-1.5 rounded-md ${q.isRecommended ? "text-emerald-400 hover:text-emerald-300" : "text-muted-foreground hover:text-emerald-400"}`}>
                              <ThumbsUp className="w-4 h-4" />
                            </button>
                            {isSuperAdmin && <button onClick={() => setDeleteConfirm(q.id)} className="p-1.5 text-muted-foreground hover:text-red-400 rounded-md"><Trash2 className="w-4 h-4" /></button>}
                          </div>
                        </td>
                      </tr>
                      {expandedRow === q.id && (
                        <tr key={`exp-${q.id}`}>
                          <td colSpan={10} className="px-4 py-4 bg-input">
                            {expandedItems[q.id] && expandedItems[q.id].length > 0 ? (
                              <table className="w-full text-right text-sm">
                                <thead><tr className="text-muted-foreground border-b border-border">
                                  <th className="pb-2 pr-2">קוד</th><th className="pb-2 pr-2">פריט</th>
                                  <th className="pb-2 pr-2">כמות</th><th className="pb-2 pr-2">יחידה</th>
                                  <th className="pb-2 pr-2">מחיר</th><th className="pb-2 pr-2">הנחה%</th>
                                  <th className="pb-2 pr-2">מע״מ%</th><th className="pb-2 pr-2">סה״כ</th>
                                </tr></thead>
                                <tbody>{expandedItems[q.id].map(item => (
                                  <tr key={item.id} className="border-t border-border/30">
                                    <td className="py-2 pr-2 text-muted-foreground font-mono text-xs">{item.itemCode || "—"}</td>
                                    <td className="py-2 pr-2 text-gray-300">{item.itemDescription}</td>
                                    <td className="py-2 pr-2 text-gray-300">{item.quantity}</td>
                                    <td className="py-2 pr-2 text-muted-foreground">{item.unit}</td>
                                    <td className="py-2 pr-2 text-gray-300" dir="ltr">{cs(q.currency)}{parseFloat(item.unitPrice).toLocaleString()}</td>
                                    <td className="py-2 pr-2 text-muted-foreground">{item.discountPercent || "0"}%</td>
                                    <td className="py-2 pr-2 text-muted-foreground">{item.taxPercent || "18"}%</td>
                                    <td className="py-2 pr-2 text-foreground font-medium" dir="ltr">{cs(q.currency)}{parseFloat(item.totalPrice).toLocaleString()}</td>
                                  </tr>
                                ))}</tbody>
                              </table>
                            ) : <p className="text-muted-foreground text-sm text-center py-2">אין פריטים</p>}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {showComparison && (
          <ComparisonModal
            group={comparisonGroup}
            quotes={quotes.filter(q => q.comparisonGroup === comparisonGroup)}
            getSupplierName={getSupplierName}
            getSupplierRating={getSupplierRating}
            onClose={() => setShowComparison(false)}
            onRecommend={(id, rec) => recommendMut.mutate({ id, recommend: rec })}
            loadItems={async (id: number) => {
              if (expandedItems[id]) return expandedItems[id];
              const r = await authFetch(`${API}/price-quotes/${id}`);
              const data = await r.json();
              if (data.items) setExpandedItems(prev => ({ ...prev, [id]: data.items }));
              return data.items || [];
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedQuote && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-6 overflow-y-auto" onClick={() => setSelectedQuote(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl w-full max-w-4xl mx-4 mb-10" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div>
                  <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                    הצעה {selectedQuote.quoteNumber}
                    {selectedQuote.isRecommended && <ThumbsUp className="w-5 h-5 text-emerald-400" />}
                  </h2>
                  <p className="text-sm text-muted-foreground">{getSupplierName(selectedQuote.supplierId)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-lg text-sm font-medium ${STATUS_COLORS[selectedQuote.status] || ""}`}>{selectedQuote.status}</span>
                  <button onClick={() => setSelectedQuote(null)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="flex gap-1 px-6 pt-3 border-b border-border overflow-x-auto">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"attachments",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(tab => (
                  <button key={tab.key} onClick={() => setDetailTab(tab.key)} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${detailTab === tab.key ? "bg-amber-500/20 text-amber-400 border-b-2 border-amber-500" : "text-muted-foreground hover:text-gray-300"}`}>{tab.label}</button>
                ))}
              </div>
              <div className="p-6 space-y-5">
                {detailTab === "details" && (<>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">תאריך הצעה</p><p className="text-foreground font-medium mt-1">{selectedQuote.quoteDate ? new Date(selectedQuote.quoteDate).toLocaleDateString("he-IL") : "—"}</p></div>
                  <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">תוקף</p><p className="text-foreground font-medium mt-1">{selectedQuote.validityDate ? new Date(selectedQuote.validityDate).toLocaleDateString("he-IL") : "—"}</p></div>
                  <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">תנאי תשלום</p><p className="text-foreground font-medium mt-1">{selectedQuote.paymentTerms || "—"}</p></div>
                  <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">ימי אספקה</p><p className="text-foreground font-medium mt-1">{selectedQuote.deliveryDays ? `${selectedQuote.deliveryDays} ימים` : "—"}</p></div>
                </div>
                <div className="bg-gradient-to-br from-[#12141a] to-[#1a1d23] rounded-xl p-5 border border-border">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
                    <div><p className="text-muted-foreground text-xs mb-1">לפני מע״מ</p><p className="text-foreground text-xl font-bold font-mono" dir="ltr">{cs(selectedQuote.currency)}{parseFloat(selectedQuote.totalBeforeTax || "0").toLocaleString()}</p></div>
                    <div><p className="text-muted-foreground text-xs mb-1">מע״מ</p><p className="text-amber-400 text-xl font-bold font-mono" dir="ltr">{cs(selectedQuote.currency)}{parseFloat(selectedQuote.taxAmount || "0").toLocaleString()}</p></div>
                    <div><p className="text-muted-foreground text-xs mb-1">סה״כ</p><p className="text-emerald-400 text-lg sm:text-2xl font-bold font-mono" dir="ltr">{cs(selectedQuote.currency)}{parseFloat(selectedQuote.totalAmount || "0").toLocaleString()}</p></div>
                  </div>
                </div>
                {selectedQuote.items && selectedQuote.items.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-3">פריטים ({selectedQuote.items.length})</h3>
                    <table className="w-full text-right text-sm">
                      <thead><tr className="text-muted-foreground border-b border-border">
                        <th className="pb-2 pr-2">קוד</th><th className="pb-2 pr-2">פריט</th><th className="pb-2 pr-2">כמות</th>
                        <th className="pb-2 pr-2">יחידה</th><th className="pb-2 pr-2">מחיר</th><th className="pb-2 pr-2">הנחה%</th>
                        <th className="pb-2 pr-2">מע״מ%</th><th className="pb-2 pr-2">סה״כ</th>
                      </tr></thead>
                      <tbody>{selectedQuote.items.map(item => (
                        <tr key={item.id} className="border-t border-border/30">
                          <td className="py-2 pr-2 text-muted-foreground font-mono text-xs">{item.itemCode || "—"}</td>
                          <td className="py-2 pr-2 text-gray-300">{item.itemDescription}</td>
                          <td className="py-2 pr-2 text-gray-300">{item.quantity}</td>
                          <td className="py-2 pr-2 text-muted-foreground">{item.unit}</td>
                          <td className="py-2 pr-2 text-gray-300" dir="ltr">{cs(selectedQuote.currency)}{parseFloat(item.unitPrice).toLocaleString()}</td>
                          <td className="py-2 pr-2 text-muted-foreground">{item.discountPercent || "0"}%</td>
                          <td className="py-2 pr-2 text-muted-foreground">{item.taxPercent || "18"}%</td>
                          <td className="py-2 pr-2 text-foreground font-medium" dir="ltr">{cs(selectedQuote.currency)}{parseFloat(item.totalPrice).toLocaleString()}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
                {selectedQuote.notes && (
                  <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs mb-1">הערות</p><p className="text-gray-300 text-sm">{selectedQuote.notes}</p></div>
                )}
                </>)}
                {detailTab === "related" && <RelatedRecords entityType="price-quotes" entityId={selectedQuote.id} />}
                {detailTab === "attachments" && <AttachmentsSection entityType="price-quotes" entityId={selectedQuote.id} />}
                {detailTab === "history" && <ActivityLog entityType="price-quotes" entityId={selectedQuote.id} />}
              </div>
              <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
                <button onClick={() => generatePDF({
                  type: "quote",
                  number: selectedQuote.quoteNumber,
                  date: selectedQuote.quoteDate ? new Date(selectedQuote.quoteDate).toLocaleDateString("he-IL") : new Date().toISOString().slice(0, 10),
                  customer: {
                    name: getSupplierName(selectedQuote.supplierId),
                    phone: "",
                    email: "",
                    address: ""
                  },
                  items: (selectedQuote.items || []).map((li: any) => ({
                    description: li.itemDescription,
                    quantity: parseFloat(li.quantity) || 1,
                    unit_price: Math.round((parseFloat(li.unitPrice) || 0) * 100),
                    total: Math.round((parseFloat(li.totalPrice) || 0) * 100)
                  })),
                  subtotal: Math.round((parseFloat(selectedQuote.totalBeforeTax) || 0) * 100),
                  vat_amount: Math.round((parseFloat(selectedQuote.taxAmount) || 0) * 100),
                  total: Math.round((parseFloat(selectedQuote.totalAmount) || 0) * 100)
                })} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-foreground rounded-lg text-sm font-medium">
                  <Download className="w-4 h-4" />PDF
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-4 overflow-y-auto" onClick={closeForm}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-4xl mx-4 mb-10" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-xl font-bold text-foreground">{editingId ? "עריכת הצעה" : "הצעת מחיר חדשה"}</h2>
                <button onClick={closeForm} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div><label className="block text-xs text-muted-foreground mb-1">מספר הצעה *</label><input value={form.quoteNumber} onChange={e => setForm({...form, quoteNumber: e.target.value})} placeholder="QT-001" className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-gray-500 focus:border-amber-500 focus:outline-none text-sm" /></div>
                  <div><label className="block text-xs text-muted-foreground mb-1">ספק *</label><select value={form.supplierId} onChange={e => setForm({...form, supplierId: e.target.value})} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:border-amber-500 focus:outline-none text-sm"><option value="">בחר ספק</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.supplierName} ({s.supplierNumber})</option>)}</select></div>
                  <div><label className="block text-xs text-muted-foreground mb-1">סטטוס</label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:border-amber-500 focus:outline-none text-sm">{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div><label className="block text-xs text-muted-foreground mb-1">תאריך הצעה</label><input type="date" value={form.quoteDate} onChange={e => setForm({...form, quoteDate: e.target.value})} dir="ltr" className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:border-amber-500 focus:outline-none text-sm" /></div>
                  <div><label className="block text-xs text-muted-foreground mb-1">תוקף הצעה</label><input type="date" value={form.validityDate} onChange={e => setForm({...form, validityDate: e.target.value})} dir="ltr" className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:border-amber-500 focus:outline-none text-sm" /></div>
                  <div><label className="block text-xs text-muted-foreground mb-1">תנאי תשלום</label><select value={form.paymentTerms} onChange={e => setForm({...form, paymentTerms: e.target.value})} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:border-amber-500 focus:outline-none text-sm"><option value="">בחר</option><option value="מיידי">מיידי</option><option value="שוטף+30">שוטף+30</option><option value="שוטף+60">שוטף+60</option><option value="שוטף+90">שוטף+90</option></select></div>
                  <div><label className="block text-xs text-muted-foreground mb-1">ימי אספקה</label><input type="number" value={form.deliveryDays} onChange={e => setForm({...form, deliveryDays: e.target.value})} placeholder="0" dir="ltr" className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-gray-500 focus:border-amber-500 focus:outline-none text-sm" /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs text-muted-foreground mb-1">קבוצת השוואה</label><input value={form.comparisonGroup} onChange={e => setForm({...form, comparisonGroup: e.target.value})} placeholder="לדוג׳: רכש ברזל Q1-2026" className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-gray-500 focus:border-amber-500 focus:outline-none text-sm" /></div>
                  <div><label className="block text-xs text-muted-foreground mb-1">נוצר ע״י</label><input value={form.createdBy} onChange={e => setForm({...form, createdBy: e.target.value})} placeholder="שם" className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-gray-500 focus:border-amber-500 focus:outline-none text-sm" /></div>
                </div>

                {!editingId && (
                  <div className="border border-border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2"><Package className="w-5 h-5 text-amber-400" />פריטים</h3>
                      <button type="button" onClick={addItem} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded-lg text-sm font-medium"><Plus className="w-4 h-4" />הוסף פריט</button>
                    </div>
                    {quoteItems.length === 0 && <p className="text-muted-foreground text-sm text-center py-4">לחץ "הוסף פריט" כדי להוסיף פריטים</p>}
                    {quoteItems.map((item, idx) => {
                      const lc = calcLine(item.quantity, item.unitPrice, item.discountPercent, item.taxPercent);
                      return (
                        <div key={idx} className="bg-input border border-border rounded-lg p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">פריט {idx + 1}</span>
                            <button type="button" onClick={() => removeItem(idx)} className="p-1 text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div><label className="block text-xs text-muted-foreground mb-1">חומר</label><select value={item.materialId} onChange={e => updateItem(idx, "materialId", e.target.value)} className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-amber-500 focus:outline-none"><option value="">בחר</option>{materials.map(m => <option key={m.id} value={m.id}>{m.materialName}</option>)}</select></div>
                            <div><label className="block text-xs text-muted-foreground mb-1">קוד</label><input value={item.itemCode} onChange={e => updateItem(idx, "itemCode", e.target.value)} className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm font-mono focus:border-amber-500 focus:outline-none" /></div>
                            <div className="sm:col-span-2"><label className="block text-xs text-muted-foreground mb-1">תיאור *</label><input value={item.itemDescription} onChange={e => updateItem(idx, "itemDescription", e.target.value)} className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-amber-500 focus:outline-none" /></div>
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                            <div><label className="block text-xs text-muted-foreground mb-1">כמות</label><input type="number" value={item.quantity} onChange={e => updateItem(idx, "quantity", e.target.value)} className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-amber-500 focus:outline-none" dir="ltr" /></div>
                            <div><label className="block text-xs text-muted-foreground mb-1">יחידה</label><select value={item.unit} onChange={e => updateItem(idx, "unit", e.target.value)} className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-amber-500 focus:outline-none">{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
                            <div><label className="block text-xs text-muted-foreground mb-1">מחיר</label><input type="number" step="0.01" value={item.unitPrice} onChange={e => updateItem(idx, "unitPrice", e.target.value)} className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-amber-500 focus:outline-none" dir="ltr" /></div>
                            <div><label className="block text-xs text-muted-foreground mb-1">הנחה%</label><input type="number" step="0.1" value={item.discountPercent} onChange={e => updateItem(idx, "discountPercent", e.target.value)} className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-amber-500 focus:outline-none" dir="ltr" /></div>
                            <div><label className="block text-xs text-muted-foreground mb-1">מע״מ%</label><input type="number" step="0.1" value={item.taxPercent} onChange={e => updateItem(idx, "taxPercent", e.target.value)} className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-amber-500 focus:outline-none" dir="ltr" /></div>
                            <div className="flex items-end"><p className="text-foreground font-mono text-sm font-bold pb-1.5" dir="ltr">₪{lc.total.toLocaleString()}</p></div>
                          </div>
                        </div>
                      );
                    })}
                    {quoteItems.length > 0 && (
                      <div className="bg-gradient-to-br from-[#12141a] to-[#1a1d23] rounded-lg p-4 border border-border">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                          <div><p className="text-muted-foreground text-xs mb-1">לפני מע״מ</p><p className="text-foreground font-bold font-mono" dir="ltr">₪{itemsTotals.beforeTax.toLocaleString()}</p></div>
                          <div><p className="text-muted-foreground text-xs mb-1">מע״מ</p><p className="text-amber-400 font-bold font-mono" dir="ltr">₪{itemsTotals.tax.toLocaleString()}</p></div>
                          <div><p className="text-muted-foreground text-xs mb-1">סה״כ</p><p className="text-emerald-400 font-bold font-mono text-lg" dir="ltr">₪{itemsTotals.total.toLocaleString()}</p></div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div><label className="block text-xs text-muted-foreground mb-1">הערות</label><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:border-amber-500 focus:outline-none resize-none text-sm" rows={2} /></div>
                {(createMut.error || updateMut.error) && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{(createMut.error as Error)?.message || (updateMut.error as Error)?.message}</div>}
                <div className="flex items-center gap-3 pt-2">
                  <button type="submit" disabled={createMut.isPending || updateMut.isPending} className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 text-foreground rounded-lg font-medium"><Save className="w-4 h-4" />{editingId ? "עדכן" : "שמור"}</button>
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
              <h3 className="text-lg font-bold text-foreground mb-2">מחיקת הצעה</h3>
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

function ComparisonModal({ group, quotes, getSupplierName, getSupplierRating, onClose, onRecommend, loadItems }: {
  group: string; quotes: PriceQuote[];
  getSupplierName: (id: number) => string; getSupplierRating: (id: number) => number;
  onClose: () => void; onRecommend: (id: number, rec: boolean) => void;
  loadItems: (id: number) => Promise<PriceQuoteItem[]>;
}) {
  const [itemsMap, setItemsMap] = useState<Record<number, PriceQuoteItem[]>>({});
  const [loaded, setLoaded] = useState(false);

  useState(() => {
    (async () => {
      const map: Record<number, PriceQuoteItem[]> = {};
      for (const q of quotes) {
        map[q.id] = await loadItems(q.id);
      }
      setItemsMap(map);
      setLoaded(true);
    })();
  });

  const sorted = [...quotes].sort((a, b) => parseFloat(a.totalAmount || "0") - parseFloat(b.totalAmount || "0"));
  const cheapest = sorted[0];
  const allDescriptions = [...new Set(
    Object.values(itemsMap).flat().map(i => i.itemDescription)
  )];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-6 overflow-y-auto" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl w-full max-w-6xl mx-4 mb-10" onClick={e => e.stopPropagation()} dir="rtl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Scale className="w-5 h-5 text-cyan-400" />
              השוואת ספקים — {group}
            </h2>
            <p className="text-muted-foreground text-sm mt-0.5">{quotes.length} הצעות בקבוצה</p>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-6">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead><tr className="border-b border-border">
                <th className="pb-3 pr-3 text-muted-foreground font-medium">קריטריון</th>
                {sorted.map(q => (
                  <th key={q.id} className="pb-3 px-3 text-center">
                    <div className={`rounded-xl p-3 ${q.isRecommended ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-input"}`}>
                      <p className="text-foreground font-bold">{getSupplierName(q.supplierId)}</p>
                      <p className="text-muted-foreground text-xs font-mono">{q.quoteNumber}</p>
                      {q.isRecommended && <span className="text-emerald-400 text-xs flex items-center justify-center gap-1 mt-1"><ThumbsUp className="w-3 h-3" />מומלץ</span>}
                    </div>
                  </th>
                ))}
              </tr></thead>
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="py-3 pr-3 text-muted-foreground font-medium">סה״כ כולל מע״מ</td>
                  {sorted.map(q => {
                    const isCheapest = q.id === cheapest?.id;
                    return (
                      <td key={q.id} className="py-3 px-3 text-center">
                        <span className={`font-mono font-bold text-lg ${isCheapest ? "text-emerald-400" : "text-foreground"}`} dir="ltr">
                          {cs(q.currency)}{parseFloat(q.totalAmount || "0").toLocaleString()}
                        </span>
                        {isCheapest && <span className="block text-emerald-400 text-xs mt-0.5">הזול ביותר</span>}
                      </td>
                    );
                  })}
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-3 pr-3 text-muted-foreground font-medium">לפני מע״מ</td>
                  {sorted.map(q => (
                    <td key={q.id} className="py-3 px-3 text-center text-gray-300 font-mono" dir="ltr">
                      {cs(q.currency)}{parseFloat(q.totalBeforeTax || "0").toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-3 pr-3 text-muted-foreground font-medium">ימי אספקה</td>
                  {sorted.map(q => {
                    const fastest = Math.min(...quotes.filter(x => x.deliveryDays).map(x => x.deliveryDays!));
                    const isFastest = q.deliveryDays === fastest && q.deliveryDays != null;
                    return (
                      <td key={q.id} className="py-3 px-3 text-center">
                        <span className={isFastest ? "text-emerald-400 font-bold" : "text-gray-300"}>
                          {q.deliveryDays ? `${q.deliveryDays} ימים` : "—"}
                        </span>
                        {isFastest && <span className="block text-emerald-400 text-xs">המהיר ביותר</span>}
                      </td>
                    );
                  })}
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-3 pr-3 text-muted-foreground font-medium">תנאי תשלום</td>
                  {sorted.map(q => <td key={q.id} className="py-3 px-3 text-center text-gray-300">{q.paymentTerms || "—"}</td>)}
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-3 pr-3 text-muted-foreground font-medium">דירוג ספק</td>
                  {sorted.map(q => {
                    const r = getSupplierRating(q.supplierId);
                    return (
                      <td key={q.id} className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          {[1, 2, 3, 4, 5].map(i => <Star key={i} className={`w-3.5 h-3.5 ${i <= r ? "text-amber-400 fill-amber-400" : "text-muted-foreground"}`} />)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-3 pr-3 text-muted-foreground font-medium">תוקף הצעה</td>
                  {sorted.map(q => <td key={q.id} className="py-3 px-3 text-center text-gray-300">{q.validityDate ? new Date(q.validityDate).toLocaleDateString("he-IL") : "—"}</td>)}
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-3 pr-3 text-muted-foreground font-medium">סטטוס</td>
                  {sorted.map(q => (
                    <td key={q.id} className="py-3 px-3 text-center">
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[q.status] || ""}`}>{q.status}</span>
                    </td>
                  ))}
                </tr>

                {loaded && allDescriptions.length > 0 && (
                  <>
                    <tr><td colSpan={sorted.length + 1} className="pt-4 pb-2"><h4 className="text-sm font-semibold text-amber-400">השוואת פריטים</h4></td></tr>
                    {allDescriptions.map(desc => (
                      <tr key={desc} className="border-b border-border/30">
                        <td className="py-2 pr-3 text-muted-foreground text-xs">{desc}</td>
                        {sorted.map(q => {
                          const item = (itemsMap[q.id] || []).find(i => i.itemDescription === desc);
                          if (!item) return <td key={q.id} className="py-2 px-3 text-center text-muted-foreground text-xs">—</td>;
                          const lowestPrice = Math.min(
                            ...sorted.map(sq => {
                              const si = (itemsMap[sq.id] || []).find(i => i.itemDescription === desc);
                              return si ? parseFloat(si.unitPrice || "999999") : 999999;
                            })
                          );
                          const isCheapest = parseFloat(item.unitPrice) === lowestPrice;
                          return (
                            <td key={q.id} className="py-2 px-3 text-center">
                              <span className={`font-mono text-sm ${isCheapest ? "text-emerald-400 font-bold" : "text-gray-300"}`} dir="ltr">
                                {cs(q.currency)}{parseFloat(item.unitPrice).toLocaleString()}
                              </span>
                              <span className="text-muted-foreground text-xs block">x{item.quantity} {item.unit}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                )}

                <tr>
                  <td className="py-4 pr-3 text-muted-foreground font-medium">המלצה</td>
                  {sorted.map(q => (
                    <td key={q.id} className="py-4 px-3 text-center">
                      <button onClick={() => onRecommend(q.id, !q.isRecommended)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${q.isRecommended ? "bg-emerald-600 text-foreground" : "bg-muted text-muted-foreground hover:bg-muted"}`}>
                        <ThumbsUp className="w-4 h-4 inline mr-1" />
                        {q.isRecommended ? "מומלץ" : "המלץ"}
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
