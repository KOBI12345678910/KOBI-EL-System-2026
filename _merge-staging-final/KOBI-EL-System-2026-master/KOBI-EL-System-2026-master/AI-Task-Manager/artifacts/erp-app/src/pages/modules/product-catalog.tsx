import { usePermissions } from "@/hooks/use-permissions";
import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import {
  Search, Plus, Edit2, Trash2, X, Save, Package, Filter,
  ChevronDown, ChevronUp, Eye, Tag, Layers, DollarSign,
  Calculator, BarChart3, FileText, Users, CheckCircle2,
  ArrowUpDown, AlertTriangle, Boxes, ShoppingBag, Settings2,
  Lock, Unlock, Link2, PlusCircle, Minus, Copy
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";
import { VAT_RATE } from "@/utils/money";

const API = "/api";

function authHeaders() {
  const token = localStorage.getItem("erp_token") || localStorage.getItem("token") || "";
  return { Authorization: `Bearer ${token}` };
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
  productType: string | null;
  createdAt: string;
  updatedAt: string;
  materials?: ProductMaterial[];
}

interface ProductMaterial {
  id: number;
  productId: number;
  materialId: number;
  quantityPerSqm: string;
  unitCost: string;
  totalCost: string;
  notes: string | null;
  materialName?: string;
  materialNumber?: string;
}

interface Category {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
  description: string | null;
}

interface RawMaterial {
  id: number;
  materialNumber: string;
  materialName: string;
  category: string;
  unit: string;
  standardPrice: string | null;
}

const PRODUCT_TYPES = [
  { value: "fixed", label: "מוצר קבוע", icon: Lock, desc: "מוצר עם מפרט ומחיר קבועים" },
  { value: "variable", label: "מוצר משתנה", icon: Unlock, desc: "מוצר שמשתנה לפי הזמנה" },
];

const STATUSES = ["פעיל", "לא פעיל", "בפיתוח", "הופסק"];
const STATUS_COLORS: Record<string, string> = {
  "פעיל": "bg-emerald-500/20 text-emerald-400",
  "לא פעיל": "bg-muted/20 text-muted-foreground",
  "בפיתוח": "bg-blue-500/20 text-blue-400",
  "הופסק": "bg-red-500/20 text-red-400",
};

const emptyForm: Record<string, string> = {
  productNumber: "", productName: "", categoryId: "", description: "",
  pricePerSqmBeforeVat: "", status: "פעיל", notes: "", productType: "fixed",
};

interface MaterialLine {
  materialId: string;
  quantityPerSqm: string;
  notes: string;
}

function generateProductNumber(products: Product[]) {
  const nums = products.map(p => parseInt(p.productNumber?.replace(/\D/g, '') || '0')).filter(n => !isNaN(n));
  const next = (Math.max(0, ...nums) + 1).toString().padStart(4, '0');
  return `PRD-${next}`;
}


const load: any[] = [];
export default function ProductCatalogPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [materialLines, setMaterialLines] = useState<MaterialLine[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailTab, setDetailTab] = useState("info");
  const [formSection, setFormSection] = useState("basic");
  const [sortField, setSortField] = useState("productName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({
    productNumber: { required: true, message: "מספר מוצר נדרש" },
    productName: { required: true, message: "שם מוצר נדרש" },
    categoryId: { required: true, message: "קטגוריה נדרשת" },
  });

  const { data: productsRaw, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const r = await authFetch(`${API}/products`, { headers: authHeaders() });
      return r.json();
    },
  });
  const products: Product[] = useMemo(() => {
    if (!productsRaw) return [];
    const arr = Array.isArray(productsRaw) ? productsRaw : (productsRaw?.data || []);
    return arr.map((p: any) => ({
      ...p,
      productNumber: p.productNumber || p.product_number || "",
      productName: p.productName || p.product_name || "",
      categoryId: p.categoryId || p.category_id || 0,
      imagePath: p.imagePath || p.image_path || null,
      pricePerSqmBeforeVat: p.pricePerSqmBeforeVat || p.price_per_sqm_before_vat || null,
      materialsCostPerSqm: p.materialsCostPerSqm || p.materials_cost_per_sqm || null,
      pricePerSqmAfterVat: p.pricePerSqmAfterVat || p.price_per_sqm_after_vat || null,
      grossProfit: p.grossProfit || p.gross_profit || null,
      productType: p.productType || p.product_type || "fixed",
      createdAt: p.createdAt || p.created_at || "",
      updatedAt: p.updatedAt || p.updated_at || "",
    }));
  }, [productsRaw]);

  const { data: categoriesRaw } = useQuery({
    queryKey: ["product-categories"],
    queryFn: async () => {
      const r = await authFetch(`${API}/product-categories`, { headers: authHeaders() });
      return r.json();
    },
  });
  const categories: Category[] = useMemo(() => {
    if (!categoriesRaw) return [];
    return Array.isArray(categoriesRaw) ? categoriesRaw : (categoriesRaw?.data || []);
  }, [categoriesRaw]);

  const { data: materialsRaw } = useQuery({
    queryKey: ["raw-materials-list"],
    queryFn: async () => {
      const r = await authFetch(`${API}/raw-materials`, { headers: authHeaders() });
      return r.json();
    },
  });
  const rawMaterials: RawMaterial[] = useMemo(() => {
    if (!materialsRaw) return [];
    const arr = Array.isArray(materialsRaw) ? materialsRaw : (materialsRaw?.data || []);
    return arr.map((m: any) => ({
      id: m.id,
      materialNumber: m.materialNumber || m.material_number || "",
      materialName: m.materialName || m.material_name || "",
      category: m.category || "",
      unit: m.unit || "יחידה",
      standardPrice: m.standardPrice || m.standard_price || "0",
    }));
  }, [materialsRaw]);

  const filtered = useMemo(() => {
    let list = products.filter(p => {
      const matchCat = categoryFilter === "all" || String(p.categoryId) === categoryFilter;
      const matchType = typeFilter === "all" || (p.productType || "fixed") === typeFilter;
      const matchStatus = statusFilter === "all" || p.status === statusFilter;
      const matchSearch = !search || p.productName.includes(search) || p.productNumber.includes(search);
      return matchCat && matchType && matchStatus && matchSearch;
    });
    list.sort((a: any, b: any) => {
      const va = a[sortField] || "";
      const vb = b[sortField] || "";
      const numA = parseFloat(va);
      const numB = parseFloat(vb);
      if (!isNaN(numA) && !isNaN(numB)) return sortDir === "asc" ? numA - numB : numB - numA;
      return sortDir === "asc" ? String(va).localeCompare(String(vb), "he") : String(vb).localeCompare(String(va), "he");
    });
    return list;
  }, [products, categoryFilter, typeFilter, statusFilter, search, sortField, sortDir]);

  const stats = useMemo(() => {
    const total = products.length;
    const active = products.filter(p => p.status === "פעיל").length;
    const fixed = products.filter(p => (p.productType || "fixed") === "fixed").length;
    const variable = products.filter(p => p.productType === "variable").length;
    const cats = [...new Set(products.map(p => p.categoryId))].length;
    const avgPrice = products.length > 0
      ? products.reduce((sum, p) => sum + parseFloat(p.pricePerSqmBeforeVat || "0"), 0) / products.length
      : 0;
    const totalRevenue = products.reduce((sum, p) => sum + parseFloat(p.pricePerSqmAfterVat || "0"), 0);
    return { total, active, fixed, variable, cats, avgPrice, totalRevenue };
  }, [products]);

  const createCategoryMut = useMutation({
    mutationFn: async (name: string) => {
      const r = await authFetch(`${API}/product-categories`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ name }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["product-categories"] }); setShowCategoryForm(false); setNewCategoryName(""); },
  });

  const createMut = useMutation({
    mutationFn: async (data: { form: Record<string, string>; materials: MaterialLine[] }) => {
      const payload: any = {
        productNumber: data.form.productNumber,
        productName: data.form.productName,
        categoryId: parseInt(data.form.categoryId),
        description: data.form.description || undefined,
        pricePerSqmBeforeVat: data.form.pricePerSqmBeforeVat || "0",
        productType: data.form.productType || "fixed",
        status: data.form.status || "פעיל",
        notes: data.form.notes || undefined,
      };
      const r = await authFetch(`${API}/products`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      const product = await r.json();

      for (const ml of data.materials) {
        if (!ml.materialId) continue;
        await authFetch(`${API}/products/${product.id}/materials`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ materialId: parseInt(ml.materialId), quantityPerSqm: ml.quantityPerSqm || "1", notes: ml.notes || undefined }),
        });
      }
      return product;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); closeForm(); },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { form: Record<string, string>; materials: MaterialLine[] } }) => {
      const payload: any = {
        productNumber: data.form.productNumber,
        productName: data.form.productName,
        categoryId: parseInt(data.form.categoryId),
        description: data.form.description || undefined,
        pricePerSqmBeforeVat: data.form.pricePerSqmBeforeVat || "0",
        productType: data.form.productType || "fixed",
        status: data.form.status || "פעיל",
        notes: data.form.notes || undefined,
      };
      const r = await authFetch(`${API}/products/${id}`, { method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      const updatedProduct = await r.json();

      const existingMatsR = await authFetch(`${API}/products/${id}/materials`, { headers: authHeaders() });
      const existingMats = existingMatsR.ok ? await existingMatsR.json() : [];
      const existingArr = Array.isArray(existingMats) ? existingMats : (existingMats?.data || []);
      for (const em of existingArr) {
        await authFetch(`${API}/products/${id}/materials/${em.id}`, { method: "DELETE", headers: authHeaders() }).catch(() => {});
      }
      for (const ml of data.materials) {
        if (!ml.materialId) continue;
        await authFetch(`${API}/products/${id}/materials`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ materialId: parseInt(ml.materialId), quantityPerSqm: ml.quantityPerSqm || "1", notes: ml.notes || undefined }),
        });
      }

      return updatedProduct;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); closeForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/products/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!r.ok) throw new Error("שגיאה במחיקה");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); setDeleteConfirm(null); setSelectedProduct(null); },
  });

  function closeForm() {
    setShowForm(false); setEditingId(null); setForm(emptyForm); setMaterialLines([]); setFormSection("basic");
    formValidation.clearErrors();
  }

  function openCreate() {
    setForm({ ...emptyForm, productNumber: generateProductNumber(products) });
    setMaterialLines([{ materialId: "", quantityPerSqm: "1", notes: "" }]);
    setEditingId(null); setShowForm(true); setFormSection("basic");
  }

  function openEdit(p: Product) {
    const f: Record<string, string> = {};
    Object.keys(emptyForm).forEach(k => {
      const val = (p as any)[k];
      f[k] = val !== null && val !== undefined ? String(val) : "";
    });
    if (!f.productType) f.productType = "fixed";
    setForm(f);
    setMaterialLines(
      p.materials && p.materials.length > 0
        ? p.materials.map(m => ({ materialId: String(m.materialId), quantityPerSqm: m.quantityPerSqm || "1", notes: m.notes || "" }))
        : [{ materialId: "", quantityPerSqm: "1", notes: "" }]
    );
    setEditingId(p.id); setShowForm(true); setFormSection("basic");
  }

  function handleSave() {
    if (!formValidation.validate(form)) return;
    if (editingId) updateMut.mutate({ id: editingId, data: { form, materials: materialLines } });
    else createMut.mutate({ form, materials: materialLines });
  }

  function setField(key: string, val: string) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function setMaterialLine(idx: number, key: keyof MaterialLine, val: string) {
    setMaterialLines(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: val };
      return next;
    });
  }

  function addMaterialLine() {
    setMaterialLines(prev => [...prev, { materialId: "", quantityPerSqm: "1", notes: "" }]);
  }

  function removeMaterialLine(idx: number) {
    setMaterialLines(prev => prev.filter((_, i) => i !== idx));
  }

  function toggleSort(field: string) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  const SortIcon = ({ field }: { field: string }) => (
    <span className="inline-flex mr-1 cursor-pointer" onClick={() => toggleSort(field)}>
      {sortField === field ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
    </span>
  );

  const materialsCalc = useMemo(() => {
    let totalCost = 0;
    const lines = materialLines.map(ml => {
      const mat = rawMaterials.find(m => m.id === parseInt(ml.materialId));
      const unitCost = parseFloat(mat?.standardPrice || "0");
      const qty = parseFloat(ml.quantityPerSqm || "1");
      const lineCost = unitCost * qty;
      totalCost += lineCost;
      return { ...ml, mat, unitCost, lineCost };
    });
    const sellPrice = parseFloat(form.pricePerSqmBeforeVat || "0");
    const afterVat = sellPrice * (1 + VAT_RATE);
    const grossProfit = sellPrice - totalCost;
    const margin = sellPrice > 0 ? (grossProfit / sellPrice * 100) : 0;
    return { lines, totalCost, sellPrice, afterVat, grossProfit, margin };
  }, [materialLines, rawMaterials, form.pricePerSqmBeforeVat]);

  const getCategoryName = (catId: number) => categories.find(c => c.id === catId)?.name || "—";

  const formSections = [
    { key: "basic", label: "פרטים בסיסיים", icon: Package },
    { key: "type", label: "סוג מוצר", icon: Settings2 },
    { key: "materials", label: "חומרי גלם (BOM)", icon: Boxes },
    { key: "pricing", label: "תמחור", icon: Calculator },
    { key: "notes", label: "הערות", icon: FileText },
  ];

  const renderFormSection = () => {
    switch (formSection) {
      case "basic":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">מספר מוצר <RequiredMark /></label>
              <input type="text" value={form.productNumber || ""} onChange={e => setField("productNumber", e.target.value)}
                placeholder="PRD-0001"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-blue-500" />
              <FormFieldError errors={formValidation.errors} field="productNumber" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">שם מוצר <RequiredMark /></label>
              <input type="text" value={form.productName || ""} onChange={e => setField("productName", e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-blue-500" />
              <FormFieldError errors={formValidation.errors} field="productName" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">קטגוריה <RequiredMark /></label>
              <div className="flex gap-2">
                <select value={form.categoryId || ""} onChange={e => setField("categoryId", e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-blue-500">
                  <option value="">בחר קטגוריה...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="button" onClick={() => setShowCategoryForm(true)}
                  className="px-3 py-2 bg-muted/50 hover:bg-muted border border-border rounded-lg text-sm text-muted-foreground" title="קטגוריה חדשה">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <FormFieldError errors={formValidation.errors} field="categoryId" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">סטטוס</label>
              <select value={form.status || "פעיל"} onChange={e => setField("status", e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-blue-500">
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="col-span-full">
              <label className="block text-xs text-muted-foreground mb-1">תיאור</label>
              <textarea value={form.description || ""} onChange={e => setField("description", e.target.value)} rows={2}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        );

      case "type":
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">בחר את סוג המוצר:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PRODUCT_TYPES.map(pt => {
                const isSelected = (form.productType || "fixed") === pt.value;
                return (
                  <button key={pt.value} type="button" onClick={() => setField("productType", pt.value)}
                    className={`p-6 rounded-xl border-2 text-right transition ${isSelected ? "border-blue-500 bg-blue-500/10" : "border-border bg-card hover:border-blue-500/50"}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-lg ${isSelected ? "bg-blue-500/20 text-blue-400" : "bg-muted/50 text-muted-foreground"}`}>
                        <pt.icon className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className={`text-lg font-semibold ${isSelected ? "text-blue-400" : "text-foreground"}`}>{pt.label}</h3>
                        <p className="text-sm text-muted-foreground">{pt.desc}</p>
                      </div>
                    </div>
                    {pt.value === "fixed" && (
                      <ul className="text-xs text-muted-foreground space-y-1 mt-3 mr-12">
                        <li>• מפרט קבוע ומוגדר מראש</li>
                        <li>• מחיר אחיד לכל ההזמנות</li>
                        <li>• רשימת חומרי גלם (BOM) קבועה</li>
                      </ul>
                    )}
                    {pt.value === "variable" && (
                      <ul className="text-xs text-muted-foreground space-y-1 mt-3 mr-12">
                        <li>• מידות ומפרט משתנים לפי הזמנה</li>
                        <li>• מחיר מחושב לפי מ״ר / מטר</li>
                        <li>• חומרי גלם נבחרים בזמן ההזמנה</li>
                      </ul>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );

      case "materials":
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <Link2 className="w-4 h-4 text-blue-400" /> רשימת חומרי גלם (BOM)
              </h3>
              <button type="button" onClick={addMaterialLine}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-xs flex items-center gap-1">
                <PlusCircle className="w-3.5 h-3.5" /> הוסף חומר
              </button>
            </div>

            {materialLines.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Boxes className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">אין חומרי גלם מקושרים</p>
                <button type="button" onClick={addMaterialLine} className="text-blue-400 text-sm mt-1 hover:underline">+ הוסף חומר גלם</button>
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="px-4 py-2 text-right text-muted-foreground font-medium">חומר גלם</th>
                      <th className="px-4 py-2 text-right text-muted-foreground font-medium">כמות למ"ר</th>
                      <th className="px-4 py-2 text-right text-muted-foreground font-medium">מחיר יחידה</th>
                      <th className="px-4 py-2 text-right text-muted-foreground font-medium">עלות שורה</th>
                      <th className="px-4 py-2 text-right text-muted-foreground font-medium">הערות</th>
                      <th className="px-4 py-2 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {materialsCalc.lines.map((ml, idx) => (
                      <tr key={idx} className="border-b border-border/50">
                        <td className="px-4 py-2">
                          <select value={ml.materialId || ""} onChange={e => setMaterialLine(idx, "materialId", e.target.value)}
                            className="w-full rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground">
                            <option value="">בחר חומר גלם...</option>
                            {rawMaterials.map(m => (
                              <option key={m.id} value={m.id}>{m.materialName} ({m.materialNumber})</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input type="number" step="0.01" value={ml.quantityPerSqm || ""} onChange={e => setMaterialLine(idx, "quantityPerSqm", e.target.value)}
                            className="w-20 rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground text-center" />
                        </td>
                        <td className="px-4 py-2 text-muted-foreground font-mono">₪{ml.unitCost.toFixed(2)}</td>
                        <td className="px-4 py-2 text-foreground font-mono font-medium">₪{ml.lineCost.toFixed(2)}</td>
                        <td className="px-4 py-2">
                          <input type="text" value={ml.notes || ""} onChange={e => setMaterialLine(idx, "notes", e.target.value)}
                            placeholder="הערה..." className="w-full rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground" />
                        </td>
                        <td className="px-4 py-2">
                          <button type="button" onClick={() => removeMaterialLine(idx)} className="p-1 rounded hover:bg-red-500/20 text-red-400">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/20 font-medium">
                      <td className="px-4 py-2 text-foreground" colSpan={3}>סה"כ עלות חומרים</td>
                      <td className="px-4 py-2 text-blue-400 font-mono">₪{materialsCalc.totalCost.toFixed(2)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        );

      case "pricing":
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  {(form.productType || "fixed") === "fixed" ? "מחיר מכירה ליחידה (לפני מע\"מ)" : "מחיר מכירה למ\"ר (לפני מע\"מ)"}
                </label>
                <div className="relative">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₪</span>
                  <input type="number" step="0.01" value={form.pricePerSqmBeforeVat || ""} onChange={e => setField("pricePerSqmBeforeVat", e.target.value)}
                    className="w-full pr-8 pl-4 rounded-lg border border-border bg-card py-2 text-sm text-foreground focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-5">
              <h4 className="text-sm font-semibold text-blue-400 flex items-center gap-2 mb-4">
                <Calculator className="w-4 h-4" /> חישוב רווחיות
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <CalcBox label="עלות חומרים" value={`₪${materialsCalc.totalCost.toFixed(2)}`} icon={Boxes} />
                <CalcBox label="מחיר מכירה" value={`₪${materialsCalc.sellPrice.toFixed(2)}`} icon={DollarSign} />
                <CalcBox label={`מע"מ (${(VAT_RATE * 100).toFixed(0)}%)`} value={`₪${(materialsCalc.sellPrice * VAT_RATE).toFixed(2)}`} icon={Tag} />
                <CalcBox label={'מחיר + מע"מ'} value={`₪${materialsCalc.afterVat.toFixed(2)}`} icon={DollarSign} highlight />
                <CalcBox label="רווח גולמי" value={`₪${materialsCalc.grossProfit.toFixed(2)}`} icon={BarChart3}
                  highlight={materialsCalc.grossProfit > 0} warn={materialsCalc.grossProfit < 0} />
                <CalcBox label="מרג'ין" value={`${materialsCalc.margin.toFixed(1)}%`} icon={BarChart3}
                  highlight={materialsCalc.margin > 20} warn={materialsCalc.margin < 0} />
              </div>
            </div>
          </div>
        );

      case "notes":
        return (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">הערות</label>
            <textarea value={form.notes || ""} onChange={e => setField("notes", e.target.value)} rows={4}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-blue-500" />
          </div>
        );

      default: return null;
    }
  };

  const fetchProductWithMaterials = async (productId: number) => {
    const r = await authFetch(`${API}/products/${productId}`, { headers: authHeaders() });
    if (r.ok) {
      const data = await r.json();
      setSelectedProduct(data);
    }
  };

  if (selectedProduct) {
    const p = selectedProduct;
    const pType = PRODUCT_TYPES.find(t => t.value === (p.productType || "fixed"));
    const TypeIcon = pType?.icon || Lock;
    const sellPrice = parseFloat(p.pricePerSqmBeforeVat || "0");
    const matCost = parseFloat(p.materialsCostPerSqm || "0");
    const afterVat = parseFloat(p.pricePerSqmAfterVat || "0");
    const profit = parseFloat(p.grossProfit || "0");
    const margin = sellPrice > 0 ? (profit / sellPrice * 100) : 0;

    return (
      <div className="p-6 space-y-6" dir="rtl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedProduct(null)} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground"><X className="w-5 h-5" /></button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{p.productName}</h1>
              <p className="text-sm text-muted-foreground">
                #{p.productNumber} | {getCategoryName(p.categoryId)} |
                <span className="inline-flex items-center gap-1 mr-1"><TypeIcon className="w-3 h-3" /> {pType?.label || "מוצר קבוע"}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[p.status] || ""}`}>{p.status}</span>
            <button onClick={() => { openEdit(p); setSelectedProduct(null); }} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm flex items-center gap-1">
              <Edit2 className="w-3.5 h-3.5" /> עריכה
            </button>
          </div>
        </div>

        <div className="flex gap-2 border-b border-border overflow-x-auto">
          {[
            { key: "info", label: "פרטים", icon: Package },
            { key: "materials", label: "חומרי גלם", icon: Boxes },
            { key: "pricing", label: "תמחור", icon: Calculator },
            { key: "attachments", label: "קבצים", icon: FileText },
            { key: "log", label: "לוג", icon: BarChart3 },
            { key: "related", label: "רשומות", icon: Users },
          ].map(tab => (
            <button key={tab.key} onClick={() => setDetailTab(tab.key)}
              className={`flex items-center gap-1 px-4 py-2 text-sm border-b-2 transition ${detailTab === tab.key ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <tab.icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          ))}
        </div>

        {detailTab === "info" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h3 className="font-medium text-foreground flex items-center gap-2"><Package className="w-4 h-4 text-blue-400" /> פרטי מוצר</h3>
              <InfoRow label="מספר מוצר" value={p.productNumber} />
              <InfoRow label="שם" value={p.productName} />
              <InfoRow label="קטגוריה" value={getCategoryName(p.categoryId)} />
              <InfoRow label="סוג" value={pType?.label || "מוצר קבוע"} />
              <InfoRow label="סטטוס" value={p.status} />
              <InfoRow label="תיאור" value={p.description} />
            </div>
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h3 className="font-medium text-foreground flex items-center gap-2"><DollarSign className="w-4 h-4 text-green-400" /> מחירים</h3>
              <InfoRow label={'מחיר לפני מע"מ'} value={`₪${sellPrice.toFixed(2)}`} />
              <InfoRow label={'מחיר + מע"מ'} value={`₪${afterVat.toFixed(2)}`} />
              <InfoRow label="עלות חומרים" value={`₪${matCost.toFixed(2)}`} />
              <InfoRow label="רווח גולמי" value={`₪${profit.toFixed(2)}`} />
              <InfoRow label="מרג'ין" value={`${margin.toFixed(1)}%`} />
            </div>
          </div>
        )}

        {detailTab === "materials" && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Link2 className="w-5 h-5 text-blue-400" /> חומרי גלם מקושרים (BOM)
            </h3>
            {p.materials && p.materials.length > 0 ? (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="px-4 py-2 text-right text-muted-foreground font-medium">מק"ט</th>
                      <th className="px-4 py-2 text-right text-muted-foreground font-medium">שם חומר</th>
                      <th className="px-4 py-2 text-right text-muted-foreground font-medium">כמות למ"ר</th>
                      <th className="px-4 py-2 text-right text-muted-foreground font-medium">מחיר יחידה</th>
                      <th className="px-4 py-2 text-right text-muted-foreground font-medium">עלות שורה</th>
                      <th className="px-4 py-2 text-right text-muted-foreground font-medium">הערות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.materials.map(pm => {
                      const mat = rawMaterials.find(m => m.id === pm.materialId);
                      return (
                        <tr key={pm.id} className="border-b border-border/50">
                          <td className="px-4 py-2 text-muted-foreground font-mono text-xs">{mat?.materialNumber || pm.materialId}</td>
                          <td className="px-4 py-2 text-foreground">{mat?.materialName || "—"}</td>
                          <td className="px-4 py-2 text-foreground">{pm.quantityPerSqm}</td>
                          <td className="px-4 py-2 text-muted-foreground font-mono">₪{parseFloat(pm.unitCost || "0").toFixed(2)}</td>
                          <td className="px-4 py-2 text-foreground font-mono font-medium">₪{parseFloat(pm.totalCost || "0").toFixed(2)}</td>
                          <td className="px-4 py-2 text-muted-foreground text-xs">{pm.notes || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/20 font-medium">
                      <td className="px-4 py-2 text-foreground" colSpan={4}>סה"כ עלות חומרים</td>
                      <td className="px-4 py-2 text-blue-400 font-mono">₪{matCost.toFixed(2)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Boxes className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>אין חומרי גלם מקושרים למוצר</p>
              </div>
            )}
          </div>
        )}

        {detailTab === "pricing" && (
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-6">
            <h3 className="text-lg font-semibold text-blue-400 flex items-center gap-2 mb-4">
              <Calculator className="w-5 h-5" /> ניתוח רווחיות
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <CalcBox label="עלות חומרים" value={`₪${matCost.toFixed(2)}`} icon={Boxes} />
              <CalcBox label="מחיר מכירה" value={`₪${sellPrice.toFixed(2)}`} icon={DollarSign} />
              <CalcBox label={`מע"מ (${(VAT_RATE * 100).toFixed(0)}%)`} value={`₪${(sellPrice * VAT_RATE).toFixed(2)}`} icon={Tag} />
              <CalcBox label={'מחיר + מע"מ'} value={`₪${afterVat.toFixed(2)}`} icon={DollarSign} highlight />
              <CalcBox label="רווח גולמי" value={`₪${profit.toFixed(2)}`} icon={BarChart3} highlight={profit > 0} warn={profit < 0} />
              <CalcBox label="מרג'ין" value={`${margin.toFixed(1)}%`} icon={BarChart3} highlight={margin > 20} warn={margin < 0} />
            </div>
          </div>
        )}

        {detailTab === "attachments" && <AttachmentsSection entityType="products" entityId={p.id} />}
        {detailTab === "log" && <ActivityLog entityType="products" entityId={p.id} />}
        {detailTab === "related" && (
          <RelatedRecords entityType="products" entityId={p.id} relatedTypes={[
            { key: "raw-materials", label: "חומרי גלם", endpoint: "/api/raw-materials" },
            { key: "suppliers", label: "ספקים", endpoint: "/api/suppliers" },
          ]} />
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShoppingBag className="w-7 h-7 text-purple-500" /> קטלוג מוצרים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול מוצרים, קטגוריות, תמחור וחומרי גלם</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCategoryForm(true)} className="px-4 py-2 border border-border text-foreground hover:bg-muted/50 rounded-lg text-sm flex items-center gap-2">
            <Tag className="w-4 h-4" /> קטגוריה חדשה
          </button>
          <button onClick={openCreate} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm flex items-center gap-2 font-medium">
            <Plus className="w-4 h-4" /> מוצר חדש
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard label="סה״כ מוצרים" value={stats.total} icon={Package} color="blue" />
        <StatCard label="פעילים" value={stats.active} icon={CheckCircle2} color="green" />
        <StatCard label="מוצרים קבועים" value={stats.fixed} icon={Lock} color="purple" />
        <StatCard label="מוצרים משתנים" value={stats.variable} icon={Unlock} color="orange" />
        <StatCard label="קטגוריות" value={stats.cats} icon={Tag} color="yellow" />
        <StatCard label="מחיר ממוצע" value={`₪${stats.avgPrice.toFixed(0)}`} icon={DollarSign} color="green" />
        <StatCard label={'סה"כ הכנסות'} value={`₪${stats.totalRevenue.toLocaleString("he-IL", { maximumFractionDigits: 0 })}`} icon={BarChart3} color="blue" />
      </div>

      <BulkActions bulk={bulk} entityType="products" actions={defaultBulkActions("products", bulk, qc)} />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="חיפוש לפי שם, מספר מוצר..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pr-10 pl-4 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
          <option value="all">כל הקטגוריות</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
          <option value="all">כל הסוגים</option>
          <option value="fixed">מוצר קבוע</option>
          <option value="variable">מוצר משתנה</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
          <option value="all">כל הסטטוסים</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">{editingId ? "עריכת מוצר" : "הוספת מוצר חדש"}</h2>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex border-b border-border overflow-x-auto">
              {formSections.map(sec => (
                <button key={sec.key} onClick={() => setFormSection(sec.key)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition ${formSection === sec.key ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  <sec.icon className="w-3.5 h-3.5" /> {sec.label}
                </button>
              ))}
            </div>

            <div className="p-6">{renderFormSection()}</div>

            <div className="border-t border-border px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50">
                  <Save className="w-4 h-4" /> {editingId ? "עדכון" : "שמירה"}
                </button>
                <button onClick={closeForm} className="px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted/50">ביטול</button>
              </div>
              {(createMut.error || updateMut.error) && (
                <p className="text-sm text-red-400">{(createMut.error || updateMut.error)?.message}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <ShoppingBag className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground">אין מוצרים</h3>
          <p className="text-sm text-muted-foreground mt-1">לחץ על "מוצר חדש" כדי להתחיל</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-3 text-right w-8"><BulkCheckbox bulk={bulk} items={filtered} /></th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium cursor-pointer" onClick={() => toggleSort("productNumber")}>
                    <SortIcon field="productNumber" /> מספר
                  </th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium cursor-pointer" onClick={() => toggleSort("productName")}>
                    <SortIcon field="productName" /> שם מוצר
                  </th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium">קטגוריה</th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium">סוג</th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium cursor-pointer" onClick={() => toggleSort("pricePerSqmBeforeVat")}>
                    <SortIcon field="pricePerSqmBeforeVat" /> מחיר
                  </th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium">עלות חומרים</th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium">רווח</th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium">סטטוס</th>
                  <th className="px-3 py-3 text-center text-muted-foreground font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const pType = (p.productType || "fixed") === "variable" ? PRODUCT_TYPES[1] : PRODUCT_TYPES[0];
                  const TypeIcon = pType.icon;
                  const profit = parseFloat(p.grossProfit || "0");
                  return (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20 transition cursor-pointer"
                      onClick={() => fetchProductWithMaterials(p.id)}>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}><BulkCheckbox bulk={bulk} items={filtered} itemId={p.id} /></td>
                      <td className="px-3 py-3 text-muted-foreground font-mono text-xs">{p.productNumber}</td>
                      <td className="px-3 py-3 font-medium text-foreground">{p.productName}</td>
                      <td className="px-3 py-3 text-muted-foreground">{getCategoryName(p.categoryId)}</td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <TypeIcon className="w-3 h-3" /> {pType.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-foreground font-mono">₪{parseFloat(p.pricePerSqmBeforeVat || "0").toFixed(2)}</td>
                      <td className="px-3 py-3 text-muted-foreground font-mono">₪{parseFloat(p.materialsCostPerSqm || "0").toFixed(2)}</td>
                      <td className="px-3 py-3">
                        <span className={`font-mono ${profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          ₪{profit.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[p.status] || ""}`}>{p.status}</span>
                      </td>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => fetchProductWithMaterials(p.id)} className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground" title="צפה"><Eye className="w-3.5 h-3.5" /></button>
                          <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-blue-500/20 text-blue-400" title="עריכה"><Edit2 className="w-3.5 h-3.5" /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/products`, p.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                          {isSuperAdmin && <button onClick={() => setDeleteConfirm(p.id)} className="p-1.5 rounded hover:bg-red-500/20 text-red-400" title="מחיקה"><Trash2 className="w-3.5 h-3.5" /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border bg-muted/10 text-sm text-muted-foreground">
            מציג {filtered.length} מתוך {products.length} מוצרים
          </div>
        </div>
      )}

      <AnimatePresence>
        {deleteConfirm !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setDeleteConfirm(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-xl p-6 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-foreground mb-2">מחיקת מוצר</h3>
              <p className="text-sm text-muted-foreground mb-4">האם למחוק את המוצר? פעולה זו לא ניתנת לביטול.</p>
              <div className="flex items-center gap-2 justify-end">
                <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm border border-border rounded-lg text-muted-foreground">ביטול</button>
                <button onClick={() => deleteConfirm && deleteMut.mutate(deleteConfirm)}
                  className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-foreground rounded-lg">מחיקה</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCategoryForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowCategoryForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-xl p-6 max-w-md mx-4 w-full" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Tag className="w-5 h-5 text-purple-400" /> קטגוריה חדשה
              </h3>
              <input type="text" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)}
                placeholder="שם הקטגוריה..."
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-blue-500 mb-4" />
              <div className="flex items-center gap-2 justify-end">
                <button onClick={() => { setShowCategoryForm(false); setNewCategoryName(""); }}
                  className="px-4 py-2 text-sm border border-border rounded-lg text-muted-foreground">ביטול</button>
                <button onClick={() => newCategoryName && createCategoryMut.mutate(newCategoryName)}
                  disabled={!newCategoryName || createCategoryMut.isPending}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg disabled:opacity-50">
                  צור קטגוריה
                </button>
              </div>
              {createCategoryMut.error && (
                <p className="text-sm text-red-400 mt-2">{createCategoryMut.error.message}</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  const colors: Record<string, string> = {
    blue: "text-blue-400 bg-blue-500/10", green: "text-emerald-400 bg-emerald-500/10",
    red: "text-red-400 bg-red-500/10", yellow: "text-yellow-400 bg-yellow-500/10",
    purple: "text-purple-400 bg-purple-500/10", orange: "text-orange-400 bg-orange-500/10",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-2">
      <div className={`p-1.5 rounded-lg ${colors[color] || colors.blue}`}><Icon className="w-4 h-4" /></div>
      <div>
        <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
        <p className="text-sm font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}

function CalcBox({ label, value, icon: Icon, highlight, warn }: { label: string; value: string; icon: any; highlight?: boolean; warn?: boolean }) {
  const bg = warn ? "bg-red-500/20 border border-red-500/30" : highlight ? "bg-blue-500/20 border border-blue-500/30" : "bg-muted/30 border border-border";
  const textColor = warn ? "text-red-400" : highlight ? "text-blue-400" : "text-muted-foreground";
  const valColor = warn ? "text-red-300" : highlight ? "text-blue-300" : "text-foreground";
  return (
    <div className={`rounded-lg p-3 text-center ${bg}`}>
      <Icon className={`w-4 h-4 mx-auto mb-1 ${textColor}`} />
      <p className={`text-xs mb-0.5 ${textColor}`}>{label}</p>
      <p className={`text-sm font-bold ${valColor}`}>{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
