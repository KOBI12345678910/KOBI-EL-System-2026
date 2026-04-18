import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import {
  Package, Plus, Edit2, Trash2, X, Save, Search, ChevronDown, ChevronRight,
  Image, Upload, Download, DollarSign, Boxes, Tag, Calculator, Percent,
  TrendingUp, AlertCircle, CheckCircle2, Eye
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const VAT = 0.18;

function authHeaders() {
  const token = localStorage.getItem("erp_token") || localStorage.getItem("token") || "";
  return { Authorization: `Bearer ${token}` };
}

interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
  description: string | null;
}

interface Product {
  id: number;
  productNumber: string;
  productName: string;
  categoryId: number;
  description: string | null;
  imagePath: string | null;
  pricePerSqmBeforeVat: string | null;
  materialsCostPerSqm: string | null;
  pricePerSqmAfterVat: string | null;
  grossProfit: string | null;
  status: string;
  notes: string | null;
  materialType: string | null;
  finishType: string | null;
  installationType: string | null;
  standardWidth: string | null;
  standardHeight: string | null;
  standardThickness: string | null;
  weightPerSqm: string | null;
  minOrderQty: string | null;
  leadTimeDays: string | null;
}

interface Material {
  id: number;
  materialNumber: string;
  materialName: string;
  unit: string;
  standardPrice: string | null;
  category: string;
}

interface ProductMaterial {
  id: number;
  productId: number;
  materialId: number;
  quantityPerSqm: string;
  unitCost: string | null;
  totalCost: string | null;
  notes: string | null;
}

const DEFAULT_CATEGORIES = [
  "שערים חשמליים", "שערים ידניים", "שערי כניסה", "סורגים", "סורגי בטחון",
  "גדרות", "גדרות פאנל", "מעקות בטיחות", "מעקות מרפסת", "מעקות מדרגות",
  "דלתות כניסה", "דלתות פנים", "פרגולות", "פרגולות אלומיניום",
  "ויטרינות", "מחיצות זכוכית", "חלונות", "קונסטרוקציות",
  "ריהוט גן", "תוספות בנייה", "מוצרים מיוחדים", "אחר"
];

const MATERIAL_TYPES = [
  { value: "iron", label: "ברזל" },
  { value: "aluminum", label: "אלומיניום" },
  { value: "stainless_steel", label: "נירוסטה" },
  { value: "glass", label: "זכוכית" },
  { value: "combined", label: "משולב" },
];

const FINISH_OPTIONS = [
  "גלם", "צבע אבקתי", "צבע רגיל", "גלווניזציה", "אנודייז",
  "נירוסטה מוברשת", "נירוסטה מראה", "לכה", "אחר"
];

const INSTALL_TYPES = [
  { value: "supply_only", label: "אספקה בלבד" },
  { value: "supply_install", label: "אספקה + התקנה" },
  { value: "install_only", label: "התקנה בלבד" },
];

interface ProductForm {
  productNumber: string;
  productName: string;
  categoryId: number;
  description: string;
  pricePerSqmBeforeVat: string;
  status: string;
  notes: string;
  materialType: string;
  finishType: string;
  installationType: string;
  standardWidth: string;
  standardHeight: string;
  standardThickness: string;
  weightPerSqm: string;
  minOrderQty: string;
  leadTimeDays: string;
}

const emptyForm: ProductForm = {
  productNumber: "", productName: "", categoryId: 0, description: "", 
  pricePerSqmBeforeVat: "", status: "פעיל", notes: "",
  materialType: "", finishType: "", installationType: "supply_install",
  standardWidth: "", standardHeight: "", standardThickness: "",
  weightPerSqm: "", minOrderQty: "", leadTimeDays: "",
};

const emptyCatForm = { name: "", icon: "Package", color: "#3b82f6", description: "" };

export default function ProductCatalogPage() {
  const qc = useQueryClient();
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({ productNumber: { required: true, message: "מספר מוצר נדרש" }, productName: { required: true, message: "שם מוצר נדרש" } });
  const [showCatForm, setShowCatForm] = useState(false);
  const [catForm, setCatForm] = useState(emptyCatForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["product-categories"],
    queryFn: async () => {
      const r = await authFetch(`${API}/product-categories`, { headers: authHeaders() });
      return r.json();
    },
  });

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["products", selectedCategoryId],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (selectedCategoryId !== "all") p.set("categoryId", String(selectedCategoryId));
      const r = await authFetch(`${API}/products?${p}`, { headers: authHeaders() });
      return r.json();
    },
  });

  const { data: allMaterials = [] } = useQuery<Material[]>({
    queryKey: ["raw-materials"],
    queryFn: async () => {
      const r = await authFetch(`${API}/raw-materials`, { headers: authHeaders() });
      return r.json();
    },
  });

  const createCatMut = useMutation({
    mutationFn: async (data: typeof emptyCatForm) => {
      const r = await authFetch(`${API}/product-categories`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(data) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["product-categories"] }); setShowCatForm(false); setCatForm(emptyCatForm); },
  });

  const createMut = useMutation({
    mutationFn: async (data: typeof emptyForm) => {
      const r = await authFetch(`${API}/products`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(data) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: async (product) => {
      if (imageFile) {
        setUploadingImage(true);
        const fd = new FormData();
        fd.append("image", imageFile);
        await authFetch(`${API}/products/${product.id}/image`, { method: "POST", headers: authHeaders(), body: fd });
        setUploadingImage(false);
      }
      qc.invalidateQueries({ queryKey: ["products"] });
      closeForm();
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof emptyForm }) => {
      const r = await authFetch(`${API}/products/${id}`, { method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(data) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: async (_, vars) => {
      if (imageFile) {
        setUploadingImage(true);
        const fd = new FormData();
        fd.append("image", imageFile);
        await authFetch(`${API}/products/${vars.id}/image`, { method: "POST", headers: authHeaders(), body: fd });
        setUploadingImage(false);
      }
      qc.invalidateQueries({ queryKey: ["products"] });
      closeForm();
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => { await authFetch(`${API}/products/${id}`, { method: "DELETE", headers: authHeaders() }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); setDeleteConfirm(null); },
  });

  function closeForm() {
    setShowForm(false); setEditingId(null); setForm(emptyForm);
    setImageFile(null); setImagePreview(null);
  }

  function openEdit(p: Product) {
    setForm({
      productNumber: p.productNumber, productName: p.productName,
      categoryId: p.categoryId, description: p.description || "",
      pricePerSqmBeforeVat: p.pricePerSqmBeforeVat || "",
      status: p.status, notes: p.notes || "",
      materialType: p.materialType || "",
      finishType: p.finishType || "",
      installationType: p.installationType || "supply_install",
      standardWidth: p.standardWidth || "",
      standardHeight: p.standardHeight || "",
      standardThickness: p.standardThickness || "",
      weightPerSqm: p.weightPerSqm || "",
      minOrderQty: p.minOrderQty || "",
      leadTimeDays: p.leadTimeDays || "",
    });
    setEditingId(p.id);
    setImagePreview(p.imagePath || null);
    setShowForm(true);
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.productNumber || !form.productName || !form.categoryId) return;
    editingId ? updateMut.mutate({ id: editingId, data: form }) : createMut.mutate(form);
  }

  const getCategoryName = (id: number) => categories.find(c => c.id === id)?.name || "—";

  const displayedProducts = selectedCategoryId === "all"
    ? products
    : products.filter(p => p.categoryId === selectedCategoryId);

  const totalProducts = products.length;
  const activeProducts = products.filter(p => p.status === "פעיל").length;
  const avgPrice = products.length > 0
    ? (products.reduce((s, p) => s + parseFloat(p.pricePerSqmBeforeVat || "0"), 0) / products.length).toFixed(0)
    : "0";

  return (
    <div className="min-h-screen" dir="rtl">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <Package className="w-6 h-6 text-white" />
              </div>
              קטלוג מוצרים
            </h1>
            <p className="text-muted-foreground mt-1">ניהול מוצרים, קטגוריות, תמחור וחומרי גלם</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowCatForm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium">
              <Tag className="w-4 h-4" />קטגוריה חדשה
            </button>
            <button onClick={() => { setForm(emptyForm); setEditingId(null); setImageFile(null); setImagePreview(null); setShowForm(true); }} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium">
              <Plus className="w-5 h-5" />מוצר חדש
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "סה״כ מוצרים", value: totalProducts, color: "text-blue-400", icon: Package },
            { label: "פעילים", value: activeProducts, color: "text-emerald-400", icon: CheckCircle2 },
            { label: "קטגוריות", value: categories.length, color: "text-purple-400", icon: Tag },
            { label: "מחיר ממוצע למ״ר", value: `₪${Number(avgPrice).toLocaleString()}`, color: "text-amber-400", icon: DollarSign },
          ].map(s => (
            <div key={s.label} className="bg-[#1a1d23] border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <p className="text-muted-foreground text-sm">{s.label}</p>
              </div>
              <p className={`text-lg sm:text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setSelectedCategoryId("all")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedCategoryId === "all" ? "bg-blue-600 text-white" : "bg-[#1a1d23] text-muted-foreground hover:text-white border border-gray-700"}`}>
            כל הקטגוריות
          </button>
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setSelectedCategoryId(cat.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedCategoryId === cat.id ? "text-white" : "bg-[#1a1d23] text-muted-foreground hover:text-white border border-gray-700"}`}
              style={selectedCategoryId === cat.id ? { backgroundColor: cat.color || "#3b82f6" } : {}}>
              {cat.name}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : displayedProducts.length === 0 ? (
          <div className="text-center py-20">
            <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl text-muted-foreground mb-2">אין מוצרים</h3>
            <p className="text-muted-foreground mb-4">לחץ על "מוצר חדש" כדי להתחיל</p>
          </div>
        ) : (
          <>
          <BulkActions bulk={bulk} actions={defaultBulkActions} entityName="מוצרים" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayedProducts.map(product => (
              <div key={product.id} className={`relative ${bulk.isSelected(product.id) ? "ring-1 ring-blue-500/50 rounded-xl" : ""}`}>
                <div className="absolute top-3 left-3 z-10" onClick={e => e.stopPropagation()}><BulkCheckbox bulk={bulk} id={product.id} /></div>
                <ProductCard
                  product={product}
                  categoryName={getCategoryName(product.categoryId)}
                  onView={() => setViewProduct(product)}
                  onEdit={() => openEdit(product)}
                  onDelete={() => setDeleteConfirm(product.id)}
                />
              </div>
            ))}
          </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {showCatForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowCatForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-[#1a1d23] border border-gray-700 rounded-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white">קטגוריה חדשה</h2>
                <button onClick={() => setShowCatForm(false)} className="p-1 text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={e => { e.preventDefault(); createCatMut.mutate(catForm); }} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">שם קטגוריה *</label>
                  <input value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value })} placeholder="למשל: שערים" required className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">צבע</label>
                  <input type="color" value={catForm.color} onChange={e => setCatForm({ ...catForm, color: e.target.value })} className="h-10 w-full rounded-lg border border-gray-700 bg-[#12141a] cursor-pointer" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">תיאור</label>
                  <input value={catForm.description} onChange={e => setCatForm({ ...catForm, description: e.target.value })} className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="submit" disabled={createCatMut.isPending} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg font-medium">
                    <Save className="w-4 h-4" />{createCatMut.isPending ? "שומר..." : "שמור"}
                  </button>
                  <button type="button" onClick={() => setShowCatForm(false)} className="px-4 py-2.5 text-muted-foreground hover:text-white">ביטול</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-6 overflow-y-auto" onClick={closeForm}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-[#1a1d23] border border-gray-700 rounded-2xl w-full max-w-2xl mx-4 mb-10" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white">{editingId ? "עריכת מוצר" : "מוצר חדש"}</h2>
                <button onClick={closeForm} className="p-1 text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">מספר מוצר *</label>
                    <input value={form.productNumber} onChange={e => setForm({ ...form, productNumber: e.target.value })} placeholder="TK-001" required className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">שם מוצר / דגם *</label>
                    <input value={form.productName} onChange={e => setForm({ ...form, productName: e.target.value })} placeholder="שער כניסה דגם פרימיום" required className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">קטגוריה *</label>
                    <select value={form.categoryId} onChange={e => setForm({ ...form, categoryId: parseInt(e.target.value) })} required className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none">
                      <option value={0}>בחר קטגוריה...</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">סוג חומר</label>
                    <select value={form.materialType || ""} onChange={e => setForm({ ...form, materialType: e.target.value })} className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none">
                      <option value="">בחר חומר...</option>
                      {MATERIAL_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">גימור</label>
                    <select value={form.finishType || ""} onChange={e => setForm({ ...form, finishType: e.target.value })} className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none">
                      <option value="">בחר גימור...</option>
                      {FINISH_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">סוג אספקה</label>
                    <select value={form.installationType || "supply_install"} onChange={e => setForm({ ...form, installationType: e.target.value })} className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none">
                      {INSTALL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">רוחב סטנדרטי (ס״מ)</label>
                    <input type="number" min="0" step="0.1" value={form.standardWidth || ""} onChange={e => setForm({ ...form, standardWidth: e.target.value })} dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" placeholder="100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">גובה סטנדרטי (ס״מ)</label>
                    <input type="number" min="0" step="0.1" value={form.standardHeight || ""} onChange={e => setForm({ ...form, standardHeight: e.target.value })} dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" placeholder="200" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">עובי (מ״מ)</label>
                    <input type="number" min="0" step="0.1" value={form.standardThickness || ""} onChange={e => setForm({ ...form, standardThickness: e.target.value })} dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" placeholder="2" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">מחיר מכירה למ״ר (לפני מע״מ) ₪</label>
                    <input type="number" min="0" step="0.01" value={form.pricePerSqmBeforeVat} onChange={e => setForm({ ...form, pricePerSqmBeforeVat: e.target.value })} dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">כמות מינימלית להזמנה</label>
                    <input type="number" min="0" step="1" value={form.minOrderQty || ""} onChange={e => setForm({ ...form, minOrderQty: e.target.value })} dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" placeholder="1" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">משקל למ״ר (ק״ג)</label>
                    <input type="number" min="0" step="0.01" value={form.weightPerSqm || ""} onChange={e => setForm({ ...form, weightPerSqm: e.target.value })} dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">זמן אספקה (ימים)</label>
                    <input type="number" min="0" step="1" value={form.leadTimeDays || ""} onChange={e => setForm({ ...form, leadTimeDays: e.target.value })} dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" placeholder="14" />
                  </div>
                </div>

                {form.pricePerSqmBeforeVat && (
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-blue-300">
                      <Calculator className="w-4 h-4" />
                      <span>מחיר אחרי מע״מ (18%): <strong dir="ltr">₪{(parseFloat(form.pricePerSqmBeforeVat) * 1.18).toFixed(2)}</strong></span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">תיאור</label>
                  <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-none" rows={2} placeholder="תיאור המוצר, מידות מיוחדות, אפשרויות גימור..." />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">תמונת מוצר</label>
                  <div className="flex items-start gap-4">
                    {imagePreview && (
                      <img src={imagePreview} alt="preview" className="w-24 h-24 object-cover rounded-lg border border-gray-700" />
                    )}
                    <div>
                      <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageChange} className="hidden" />
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
                        <Upload className="w-4 h-4" />העלה תמונה
                      </button>
                      <p className="text-muted-foreground text-xs mt-1">JPG, PNG, GIF עד 10MB</p>
                    </div>
                  </div>
                </div>

                {(createMut.error || updateMut.error) && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                    {(createMut.error as Error)?.message || (updateMut.error as Error)?.message}
                  </div>
                )}
                <div className="flex items-center gap-3 pt-2">
                  <button type="submit" disabled={createMut.isPending || updateMut.isPending || uploadingImage} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg font-medium">
                    <Save className="w-4 h-4" />{createMut.isPending || updateMut.isPending || uploadingImage ? "שומר..." : editingId ? "עדכן" : "שמור"}
                  </button>
                  <button type="button" onClick={closeForm} className="px-4 py-2.5 text-muted-foreground hover:text-white">ביטול</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewProduct && (
          <ProductDetailModal
            product={viewProduct}
            categoryName={getCategoryName(viewProduct.categoryId)}
            allMaterials={allMaterials}
            onClose={() => setViewProduct(null)}
            onRefresh={() => qc.invalidateQueries({ queryKey: ["products"] })}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirm !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
            <div className="bg-[#1a1d23] border border-gray-700 rounded-xl p-6 max-w-sm mx-4" dir="rtl">
              <h3 className="text-lg font-bold text-white mb-2">מחיקת מוצר</h3>
              <p className="text-muted-foreground mb-4">האם למחוק את המוצר? פעולה זו לא ניתנת לביטול.</p>
              <div className="flex gap-3">
                <button onClick={() => deleteMut.mutate(deleteConfirm)} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg">מחק</button>
                <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-muted-foreground hover:text-white">ביטול</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProductCard({ product, categoryName, onView, onEdit, onDelete }: {
  product: Product; categoryName: string;
  onView: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const sellPrice = parseFloat(product.pricePerSqmBeforeVat || "0");
  const matCost = parseFloat(product.materialsCostPerSqm || "0");
  const afterVat = parseFloat(product.pricePerSqmAfterVat || "0");
  const grossProfit = parseFloat(product.grossProfit || "0");
  const marginPct = sellPrice > 0 ? ((grossProfit / sellPrice) * 100).toFixed(0) : "0";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-[#1a1d23] border border-gray-800 rounded-xl overflow-hidden hover:border-gray-600 transition-colors">
      <div className="relative aspect-video bg-[#12141a] flex items-center justify-center overflow-hidden">
        {product.imagePath ? (
          <img src={product.imagePath} alt={product.productName} className="w-full h-full object-cover" />
        ) : (
          <Package className="w-12 h-12 text-foreground" />
        )}
        <div className="absolute top-2 right-2 flex gap-1">
          <span className={`px-2 py-0.5 text-xs rounded-md font-medium ${product.status === "פעיל" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
            {product.status}
          </span>
        </div>
        {product.imagePath && (
          <a href={product.imagePath} download target="_blank" rel="noreferrer" className="absolute top-2 left-2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-md" onClick={e => e.stopPropagation()}>
            <Download className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div>
          <p className="text-xs text-muted-foreground font-mono">{product.productNumber}</p>
          <h3 className="text-white font-semibold text-sm leading-tight">{product.productName}</h3>
          <span className="inline-block mt-1 px-2 py-0.5 bg-blue-500/10 text-blue-400 text-xs rounded">{categoryName}</span>
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">מחיר מכירה (לפני מע״מ)</span>
            <span className="text-white font-mono" dir="ltr">₪{sellPrice.toLocaleString("he-IL", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">עלות חומרים</span>
            <span className="text-amber-400 font-mono" dir="ltr">₪{matCost.toLocaleString("he-IL", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">מחיר אחרי מע״מ</span>
            <span className="text-gray-300 font-mono" dir="ltr">₪{afterVat.toLocaleString("he-IL", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-gray-800">
            <span className="text-muted-foreground">רווח גולמי</span>
            <span className={`font-mono font-semibold ${grossProfit >= 0 ? "text-emerald-400" : "text-red-400"}`} dir="ltr">
              ₪{grossProfit.toLocaleString("he-IL", { minimumFractionDigits: 2 })} ({marginPct}%)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 pt-1">
          <button onClick={onView} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-xs">
            <Eye className="w-3.5 h-3.5" />פרטים
          </button>
          <button onClick={onEdit} className="p-1.5 text-muted-foreground hover:text-amber-400 rounded-md"><Edit2 className="w-4 h-4" /></button>
          <button onClick={onDelete} className="p-1.5 text-muted-foreground hover:text-red-400 rounded-md"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
    </motion.div>
  );
}

function ProductDetailModal({ product, categoryName, allMaterials, onClose, onRefresh }: {
  product: Product; categoryName: string; allMaterials: Material[];
  onClose: () => void; onRefresh: () => void;
}) {
  const qc = useQueryClient();
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [qty, setQty] = useState("1");
  const [detailTab, setDetailTab] = useState("details");

  const { data: productMaterials = [], refetch } = useQuery<ProductMaterial[]>({
    queryKey: ["product-materials", product.id],
    queryFn: async () => {
      const r = await authFetch(`${API}/products/${product.id}/materials`, { headers: authHeaders() });
      return r.json();
    },
  });

  const addMaterialMut = useMutation({
    mutationFn: async ({ materialId, quantityPerSqm }: { materialId: number; quantityPerSqm: string }) => {
      const r = await authFetch(`${API}/products/${product.id}/materials`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ materialId, quantityPerSqm }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      refetch(); onRefresh(); setSelectedMaterialId(""); setQty("1");
    },
  });

  const updateMaterialMut = useMutation({
    mutationFn: async ({ id, quantityPerSqm }: { id: number; quantityPerSqm: string }) => {
      const r = await authFetch(`${API}/product-materials/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ quantityPerSqm }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => { refetch(); onRefresh(); },
  });

  const removeMaterialMut = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/product-materials/${id}`, { method: "DELETE", headers: authHeaders() });
    },
    onSuccess: () => { refetch(); onRefresh(); },
  });

  const getMaterialName = (id: number) => {
    const mat = allMaterials.find(m => m.id === id);
    return mat ? `${mat.materialName} (${mat.unit})` : `חומר #${id}`;
  };

  const getMaterialUnit = (id: number) => allMaterials.find(m => m.id === id)?.unit || "";

  const usedMaterialIds = new Set(productMaterials.map(pm => pm.materialId));
  const availableMaterials = allMaterials.filter(m => !usedMaterialIds.has(m.id));

  const sellPrice = parseFloat(product.pricePerSqmBeforeVat || "0");
  const matCost = parseFloat(product.materialsCostPerSqm || "0");
  const afterVat = parseFloat(product.pricePerSqmAfterVat || "0");
  const grossProfit = parseFloat(product.grossProfit || "0");
  const marginPct = sellPrice > 0 ? ((grossProfit / sellPrice) * 100).toFixed(1) : "0";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-6 overflow-y-auto" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-[#1a1d23] border border-gray-700 rounded-2xl w-full max-w-3xl mx-4 mb-10" onClick={e => e.stopPropagation()} dir="rtl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-white">{product.productName}</h2>
            <p className="text-muted-foreground text-sm">{product.productNumber} • {categoryName}</p>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex border-b border-gray-700 px-6">
          {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
            <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-white"}`}>{t.label}</button>
          ))}
        </div>

        {detailTab === "details" && (
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "מחיר לפני מע״מ", value: `₪${sellPrice.toLocaleString("he-IL", { minimumFractionDigits: 2 })}`, color: "text-white" },
              { label: "עלות חומרים", value: `₪${matCost.toLocaleString("he-IL", { minimumFractionDigits: 2 })}`, color: "text-amber-400" },
              { label: "מחיר אחרי מע״מ", value: `₪${afterVat.toLocaleString("he-IL", { minimumFractionDigits: 2 })}`, color: "text-blue-400" },
              { label: "רווח גולמי", value: `₪${grossProfit.toLocaleString("he-IL", { minimumFractionDigits: 2 })} (${marginPct}%)`, color: grossProfit >= 0 ? "text-emerald-400" : "text-red-400" },
            ].map(s => (
              <div key={s.label} className="bg-[#12141a] border border-gray-800 rounded-lg p-3">
                <p className="text-muted-foreground text-xs mb-1">{s.label}</p>
                <p className={`font-bold ${s.color} text-sm`} dir="ltr">{s.value}</p>
              </div>
            ))}
          </div>

          {product.imagePath && (
            <div>
              <img src={product.imagePath} alt={product.productName} className="max-h-48 rounded-lg object-cover" />
              <a href={product.imagePath} download target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-2 text-blue-400 hover:text-blue-300 text-sm">
                <Download className="w-3.5 h-3.5" />הורד תמונה
              </a>
            </div>
          )}

          {product.description && (
            <div>
              <p className="text-sm text-muted-foreground font-medium mb-1">תיאור</p>
              <p className="text-gray-300 text-sm">{product.description}</p>
            </div>
          )}

          <div>
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <Boxes className="w-4 h-4 text-orange-400" />חומרי גלם לייצור (למ״ר)
            </h3>

            <div className="flex items-end gap-2 mb-3 flex-wrap">
              <div className="flex-1 min-w-0 sm:min-w-[200px]">
                <label className="block text-xs text-muted-foreground mb-1">חומר גלם</label>
                <select value={selectedMaterialId} onChange={e => setSelectedMaterialId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none text-sm">
                  <option value="">בחר חומר גלם...</option>
                  {availableMaterials.map(m => (
                    <option key={m.id} value={m.id}>{m.materialName} — {m.standardPrice ? `₪${m.standardPrice}` : "ללא מחיר"} / {m.unit}</option>
                  ))}
                </select>
              </div>
              <div className="w-28">
                <label className="block text-xs text-muted-foreground mb-1">כמות למ״ר</label>
                <input type="number" min="0" step="0.001" value={qty} onChange={e => setQty(e.target.value)} dir="ltr"
                  className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none text-sm" />
              </div>
              <button onClick={() => { if (selectedMaterialId) addMaterialMut.mutate({ materialId: parseInt(selectedMaterialId), quantityPerSqm: qty }); }}
                disabled={!selectedMaterialId || addMaterialMut.isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg text-sm">
                <Plus className="w-4 h-4" />הוסף
              </button>
            </div>

            {productMaterials.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <Boxes className="w-8 h-8 mx-auto mb-2 text-foreground" />אין חומרי גלם משויכים
              </div>
            ) : (
              <div className="bg-[#12141a] border border-gray-800 rounded-lg overflow-hidden">
                <table className="w-full text-sm text-right">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="px-4 py-2 text-muted-foreground font-medium">חומר גלם</th>
                      <th className="px-4 py-2 text-muted-foreground font-medium">כמות למ״ר</th>
                      <th className="px-4 py-2 text-muted-foreground font-medium">מחיר ליח׳</th>
                      <th className="px-4 py-2 text-muted-foreground font-medium">עלות כוללת</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {productMaterials.map(pm => (
                      <MaterialRow key={pm.id} pm={pm}
                        name={getMaterialName(pm.materialId)}
                        unit={getMaterialUnit(pm.materialId)}
                        onUpdate={(q) => updateMaterialMut.mutate({ id: pm.id, quantityPerSqm: q })}
                        onRemove={() => removeMaterialMut.mutate(pm.id)}
                      />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-700">
                      <td colSpan={3} className="px-4 py-2 text-muted-foreground font-medium text-left">סה״כ עלות חומרים</td>
                      <td className="px-4 py-2 text-amber-400 font-bold" dir="ltr">
                        ₪{productMaterials.reduce((s, pm) => s + parseFloat(pm.totalCost || "0"), 0).toLocaleString("he-IL", { minimumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
        )}

        {detailTab === "related" && (
          <div className="p-6">
            <RelatedRecords entityType="products" entityId={product.id} relations={[
              { key: "raw-materials", label: "חומרי גלם", endpoint: "/api/raw-materials" },
              { key: "purchase-orders", label: "הזמנות רכש", endpoint: "/api/purchase-orders" },
            ]} />
          </div>
        )}
        {detailTab === "docs" && (
          <div className="p-6">
            <AttachmentsSection entityType="products" entityId={product.id} />
          </div>
        )}
        {detailTab === "history" && (
          <div className="p-6">
            <ActivityLog entityType="products" entityId={product.id} />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function MaterialRow({ pm, name, unit, onUpdate, onRemove }: {
  pm: ProductMaterial; name: string; unit: string;
  onUpdate: (qty: string) => void; onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(pm.quantityPerSqm);

  function save() {
    onUpdate(qty);
    setEditing(false);
  }

  return (
    <tr className="border-b border-gray-800/50 hover:bg-[#1a1d23]">
      <td className="px-4 py-2 text-white">{name}</td>
      <td className="px-4 py-2">
        {editing ? (
          <div className="flex items-center gap-1">
            <input type="number" min="0" step="0.001" value={qty} onChange={e => setQty(e.target.value)} dir="ltr" className="w-20 px-2 py-1 bg-[#12141a] border border-blue-500 rounded text-white text-xs" autoFocus />
            <button onClick={save} className="p-1 text-emerald-400 hover:text-emerald-300"><CheckCircle2 className="w-3.5 h-3.5" /></button>
            <button onClick={() => { setQty(pm.quantityPerSqm); setEditing(false); }} className="p-1 text-muted-foreground hover:text-white"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="text-gray-300 hover:text-blue-400 font-mono">
            {parseFloat(pm.quantityPerSqm).toLocaleString("he-IL", { minimumFractionDigits: 3 })} {unit}
          </button>
        )}
      </td>
      <td className="px-4 py-2 text-gray-300 font-mono" dir="ltr">₪{parseFloat(pm.unitCost || "0").toLocaleString("he-IL", { minimumFractionDigits: 2 })}</td>
      <td className="px-4 py-2 text-amber-400 font-mono font-medium" dir="ltr">₪{parseFloat(pm.totalCost || "0").toLocaleString("he-IL", { minimumFractionDigits: 2 })}</td>
      <td className="px-4 py-2">
        <button onClick={onRemove} className="p-1 text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
      </td>
    </tr>
  );
}
