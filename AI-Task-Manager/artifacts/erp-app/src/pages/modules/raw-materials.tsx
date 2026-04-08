import { usePermissions } from "@/hooks/use-permissions";
import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import {
  Search, Plus, Edit2, Trash2, X, Save, Boxes, Filter,
  ChevronDown, ChevronUp, AlertTriangle, Upload,
  Package, Users, Tag, Layers, Calculator, Zap, Shield, ShoppingCart,
  ArrowUpDown, ArrowUp, ArrowDown, Eye, DollarSign,
  Scale, Ruler, BarChart3, FileText, TrendingUp, TrendingDown,
  CheckCircle2, Clock, AlertCircle, Copy
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

interface Material {
  id: number;
  materialNumber: string;
  materialName: string;
  category: string;
  subCategory: string | null;
  unit: string;
  description: string | null;
  minimumStock: string | null;
  currentStock: string | null;
  maximumStock: string | null;
  reorderPoint: string | null;
  standardPrice: string | null;
  currency: string | null;
  weightPerUnit: string | null;
  weightPerMeter: string | null;
  dimensions: string | null;
  materialGrade: string | null;
  materialType: string | null;
  finish: string | null;
  thickness: string | null;
  width: string | null;
  height: string | null;
  warehouseLocation: string | null;
  status: string;
  notes: string | null;
  rodLength: string | null;
  pricingMethod: string | null;
  pricePerMeter: string | null;
  pricePerKg: string | null;
  packageQuantity: string | null;
  totalPriceBeforeVat: string | null;
  totalPriceAfterVat: string | null;
  diameter: string | null;
  innerDiameter: string | null;
  innerType: string | null;
  standard: string | null;
  countryOfOrigin: string | null;
  color: string | null;
  minimumOrder: string | null;
  deliveryDays: number | null;
  warrantyMonths: number | null;
  supplierId: number | null;
  leadTimeDays: number | null;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES = ["מתכת", "ברזל", "אלומיניום", "נירוסטה", "זכוכית", "פלסטיק", "גומי", "עץ", "צבע", "אטמים", "ברגים", "חשמל", "אינסטלציה", "חומרי עזר", "כללי"];
const UNITS = ["יחידה", "מטר", "מטר רבוע", "ק\"ג", "טון", "ליטר", "אריזה", "גליל", "קרטון", "פלטה", "לוח", "מוט"];
const PRICING_METHODS = ["יחידה", "מטר", "ק\"ג", "מטר רבוע", "אריזה"];
const STATUSES = ["פעיל", "לא פעיל", "הוזמן", "אזל"];
const STATUS_COLORS: Record<string, string> = {
  "פעיל": "bg-emerald-500/20 text-emerald-400",
  "לא פעיל": "bg-muted/20 text-muted-foreground",
  "הוזמן": "bg-blue-500/20 text-blue-400",
  "אזל": "bg-red-500/20 text-red-400",
};
const MATERIAL_TYPES = ["פרופיל", "צינור", "פלטה", "לוח", "מוט", "חוט", "רשת", "גליל", "אביזר", "חומר צריכה", "אחר"];
const FINISHES = ["גולמי", "מצופה", "אנודייז", "צבוע", "מלוטש", "מוברש", "מגולוון", "אחר"];
const GRADES = ["A", "B", "C", "פרימיום", "סטנדרט", "אקונומי"];
const CURRENCIES = ["ILS", "USD", "EUR"];

const emptyForm: Record<string, string> = {
  materialNumber: "", materialName: "", category: "כללי", subCategory: "",
  unit: "יחידה", description: "", minimumStock: "", currentStock: "",
  maximumStock: "", reorderPoint: "", standardPrice: "", currency: "ILS",
  weightPerUnit: "", weightPerMeter: "", dimensions: "",
  materialGrade: "", materialType: "", finish: "",
  thickness: "", width: "", height: "",
  warehouseLocation: "", status: "פעיל", notes: "",
  rodLength: "", pricingMethod: "יחידה", pricePerMeter: "", pricePerKg: "",
  packageQuantity: "", totalPriceBeforeVat: "", totalPriceAfterVat: "",
  diameter: "", innerDiameter: "", innerType: "", standard: "",
  countryOfOrigin: "ישראל", color: "", minimumOrder: "",
  deliveryDays: "", warrantyMonths: "", supplierId: "", leadTimeDays: "",
};

function calcMaterialPrices(form: Record<string, string>) {
  const method = form.pricingMethod || "יחידה";
  const stdPrice = parseFloat(form.standardPrice || "0");
  const weightPerMeter = parseFloat(form.weightPerMeter || "0");
  const weightPerUnit = parseFloat(form.weightPerUnit || "0");
  const rodLength = parseFloat(form.rodLength || "0");
  const pkgQty = parseFloat(form.packageQuantity || "1") || 1;

  let unitPrice = stdPrice;
  let pricePerMeter = parseFloat(form.pricePerMeter || "0");
  let pricePerKg = parseFloat(form.pricePerKg || "0");

  if (method === "מטר") {
    pricePerMeter = stdPrice;
    if (weightPerMeter > 0) pricePerKg = stdPrice / weightPerMeter;
    if (rodLength > 0) unitPrice = stdPrice * rodLength;
  } else if (method === "ק\"ג") {
    pricePerKg = stdPrice;
    if (weightPerMeter > 0) pricePerMeter = stdPrice * weightPerMeter;
    if (weightPerUnit > 0) unitPrice = stdPrice * weightPerUnit;
  } else if (method === "מטר רבוע") {
    unitPrice = stdPrice;
    const w = parseFloat(form.width || "0") / 1000;
    const h = parseFloat(form.height || "0") / 1000;
    if (w > 0 && h > 0) unitPrice = stdPrice * w * h;
  } else if (method === "אריזה") {
    unitPrice = stdPrice / pkgQty;
  } else {
    if (weightPerUnit > 0 && pricePerKg === 0) pricePerKg = stdPrice / weightPerUnit;
    if (weightPerMeter > 0 && weightPerUnit > 0 && pricePerMeter === 0) {
      const ratio = weightPerUnit / weightPerMeter;
      if (ratio > 0 && isFinite(ratio)) pricePerMeter = stdPrice / ratio;
    }
  }

  const totalBeforeVat = unitPrice * pkgQty;
  const totalAfterVat = totalBeforeVat * (1 + VAT_RATE);

  return {
    unitPrice: unitPrice.toFixed(2),
    pricePerMeter: pricePerMeter.toFixed(2),
    pricePerKg: pricePerKg.toFixed(2),
    totalPriceBeforeVat: totalBeforeVat.toFixed(2),
    totalPriceAfterVat: totalAfterVat.toFixed(2),
    vatAmount: (totalBeforeVat * VAT_RATE).toFixed(2),
  };
}

function generateMaterialNumber(materials: Material[]) {
  const nums = materials.map(m => parseInt(m.materialNumber?.replace(/\D/g, '') || '0')).filter(n => !isNaN(n));
  const next = (Math.max(0, ...nums) + 1).toString().padStart(4, '0');
  return `MAT-${next}`;
}

function getStockStatus(m: Material) {
  const current = parseFloat(m.currentStock || "0");
  const min = parseFloat(m.minimumStock || "0");
  const reorder = parseFloat(m.reorderPoint || "0");
  if (current <= 0) return { text: "אזל מהמלאי", color: "text-red-400", bg: "bg-red-500/20", icon: AlertCircle };
  if (reorder > 0 && current <= reorder) return { text: "נדרשת הזמנה", color: "text-orange-400", bg: "bg-orange-500/20", icon: AlertTriangle };
  if (min > 0 && current <= min) return { text: "מלאי נמוך", color: "text-yellow-400", bg: "bg-yellow-500/20", icon: AlertTriangle };
  return { text: "תקין", color: "text-emerald-400", bg: "bg-emerald-500/20", icon: CheckCircle2 };
}

export default function RawMaterialsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [detailTab, setDetailTab] = useState("info");
  const [formSection, setFormSection] = useState("basic");
  const [sortField, setSortField] = useState("materialName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const bulk = useBulkSelection();
  const formValidation = useFormValidation<Record<string, string>>({
    materialNumber: { required: true, message: "מק\"ט נדרש" },
    materialName: { required: true, message: "שם חומר נדרש" },
  });

  const { data: materialsRaw, isLoading } = useQuery({
    queryKey: ["raw-materials", search],
    queryFn: async () => {
      const r = await authFetch(`${API}/raw-materials${search ? `?search=${encodeURIComponent(search)}` : ""}`, { headers: authHeaders() });
      return r.json();
    },
  });
  const materials: Material[] = useMemo(() => {
    if (!materialsRaw) return [];
    const arr = Array.isArray(materialsRaw) ? materialsRaw : (materialsRaw?.data || materialsRaw?.items || []);
    return arr.map((m: any) => ({
      ...m,
      materialNumber: m.materialNumber || m.material_number || "",
      materialName: m.materialName || m.material_name || "",
      subCategory: m.subCategory || m.sub_category || null,
      minimumStock: m.minimumStock || m.minimum_stock || null,
      currentStock: m.currentStock || m.current_stock || null,
      maximumStock: m.maximumStock || m.maximum_stock || null,
      reorderPoint: m.reorderPoint || m.reorder_point || null,
      standardPrice: m.standardPrice || m.standard_price || null,
      weightPerUnit: m.weightPerUnit || m.weight_per_unit || null,
      weightPerMeter: m.weightPerMeter || m.weight_per_meter || null,
      materialGrade: m.materialGrade || m.material_grade || null,
      materialType: m.materialType || m.material_type || null,
      warehouseLocation: m.warehouseLocation || m.warehouse_location || null,
      rodLength: m.rodLength || m.rod_length || null,
      pricingMethod: m.pricingMethod || m.pricing_method || null,
      pricePerMeter: m.pricePerMeter || m.price_per_meter || null,
      pricePerKg: m.pricePerKg || m.price_per_kg || null,
      packageQuantity: m.packageQuantity || m.package_quantity || null,
      totalPriceBeforeVat: m.totalPriceBeforeVat || m.total_price_before_vat || null,
      totalPriceAfterVat: m.totalPriceAfterVat || m.total_price_after_vat || null,
      innerDiameter: m.innerDiameter || m.inner_diameter || null,
      innerType: m.innerType || m.inner_type || null,
      countryOfOrigin: m.countryOfOrigin || m.country_of_origin || null,
      minimumOrder: m.minimumOrder || m.minimum_order || null,
      deliveryDays: m.deliveryDays || m.delivery_days || null,
      warrantyMonths: m.warrantyMonths || m.warranty_months || null,
      supplierId: m.supplierId || m.supplier_id || null,
      leadTimeDays: m.leadTimeDays || m.lead_time_days || null,
      createdAt: m.createdAt || m.created_at || "",
      updatedAt: m.updatedAt || m.updated_at || "",
    }));
  }, [materialsRaw]);

  const filtered = useMemo(() => {
    let list = materials.filter(m => {
      const matchCat = categoryFilter === "all" || m.category === categoryFilter;
      const matchStatus = statusFilter === "all" || m.status === statusFilter;
      return matchCat && matchStatus;
    });
    list.sort((a: any, b: any) => {
      const va = a[sortField] || "";
      const vb = b[sortField] || "";
      const numA = parseFloat(va);
      const numB = parseFloat(vb);
      if (!isNaN(numA) && !isNaN(numB)) return sortDir === "asc" ? numA - numB : numB - numA;
      const cmp = String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [materials, categoryFilter, statusFilter, sortField, sortDir]);

  const stats = useMemo(() => {
    const total = materials.length;
    const active = materials.filter(m => m.status === "פעיל").length;
    const lowStock = materials.filter(m => {
      const cur = parseFloat(m.currentStock || "0");
      const min = parseFloat(m.minimumStock || "0");
      return min > 0 && cur <= min;
    }).length;
    const outOfStock = materials.filter(m => parseFloat(m.currentStock || "0") <= 0).length;
    const categories = [...new Set(materials.map(m => m.category))].filter(Boolean).length;
    const totalValue = materials.reduce((sum, m) => {
      const price = parseFloat(m.standardPrice || "0");
      const stock = parseFloat(m.currentStock || "0");
      return sum + (price * stock);
    }, 0);
    const priceAlerts = materials.filter(m => {
      const before = parseFloat(m.totalPriceBeforeVat || "0");
      const after = parseFloat(m.totalPriceAfterVat || "0");
      return before > 0 && after > 0 && (after - before) / before > 0.2;
    }).length;
    return { total, active, lowStock, outOfStock, categories, totalValue, priceAlerts };
  }, [materials]);

  const { data: suppliersRaw } = useQuery({
    queryKey: ["suppliers-list"],
    queryFn: async () => {
      const r = await authFetch(`${API}/suppliers`, { headers: authHeaders() });
      return r.json();
    },
  });
  const suppliers = useMemo(() => {
    if (!suppliersRaw) return [];
    const arr = Array.isArray(suppliersRaw) ? suppliersRaw : (suppliersRaw?.data || []);
    return arr.map((s: any) => ({ id: s.id, name: s.supplier_name || s.supplierName || "" }));
  }, [suppliersRaw]);

  const createMut = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const payload: any = { ...data };
      if (data.deliveryDays) payload.deliveryDays = parseInt(data.deliveryDays);
      if (data.warrantyMonths) payload.warrantyMonths = parseInt(data.warrantyMonths);
      if (data.leadTimeDays) payload.leadTimeDays = parseInt(data.leadTimeDays);
      if (data.supplierId) payload.supplierId = parseInt(data.supplierId);
      else delete payload.supplierId;
      const calcs = calcMaterialPrices(data);
      payload.pricePerMeter = calcs.pricePerMeter;
      payload.pricePerKg = calcs.pricePerKg;
      payload.totalPriceBeforeVat = calcs.totalPriceBeforeVat;
      payload.totalPriceAfterVat = calcs.totalPriceAfterVat;
      const r = await authFetch(`${API}/raw-materials`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["raw-materials"] }); closeForm(); },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, string> }) => {
      const payload: any = { ...data };
      if (data.deliveryDays) payload.deliveryDays = parseInt(data.deliveryDays);
      else payload.deliveryDays = undefined;
      if (data.warrantyMonths) payload.warrantyMonths = parseInt(data.warrantyMonths);
      else payload.warrantyMonths = undefined;
      if (data.leadTimeDays) payload.leadTimeDays = parseInt(data.leadTimeDays);
      else payload.leadTimeDays = undefined;
      if (data.supplierId) payload.supplierId = parseInt(data.supplierId);
      else payload.supplierId = undefined;
      const calcs = calcMaterialPrices(data);
      payload.pricePerMeter = calcs.pricePerMeter;
      payload.pricePerKg = calcs.pricePerKg;
      payload.totalPriceBeforeVat = calcs.totalPriceBeforeVat;
      payload.totalPriceAfterVat = calcs.totalPriceAfterVat;
      const r = await authFetch(`${API}/raw-materials/${id}`, { method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["raw-materials"] }); closeForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/raw-materials/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!r.ok) throw new Error("שגיאה במחיקה");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["raw-materials"] }); setDeleteConfirm(null); setSelectedMaterial(null); },
  });

  function closeForm() {
    setShowForm(false); setEditingId(null); setForm(emptyForm); setFormSection("basic");
    formValidation.clearErrors();
  }

  function openCreate() {
    setForm({ ...emptyForm, materialNumber: generateMaterialNumber(materials) });
    setEditingId(null); setShowForm(true); setFormSection("basic");
  }

  function openEdit(m: Material) {
    const f: Record<string, string> = {};
    Object.keys(emptyForm).forEach(k => {
      const val = (m as any)[k];
      f[k] = val !== null && val !== undefined ? String(val) : "";
    });
    setForm(f); setEditingId(m.id); setShowForm(true); setFormSection("basic");
  }

  function handleSave() {
    if (!formValidation.validate(form)) return;
    if (editingId) updateMut.mutate({ id: editingId, data: form });
    else createMut.mutate(form);
  }

  function setField(key: string, val: string) {
    setForm(prev => {
      const next = { ...prev, [key]: val };
      if (["standardPrice", "pricingMethod", "weightPerMeter", "weightPerUnit", "rodLength", "packageQuantity", "width", "height"].includes(key)) {
        const calcs = calcMaterialPrices(next);
        next.pricePerMeter = calcs.pricePerMeter;
        next.pricePerKg = calcs.pricePerKg;
        next.totalPriceBeforeVat = calcs.totalPriceBeforeVat;
        next.totalPriceAfterVat = calcs.totalPriceAfterVat;
      }
      return next;
    });
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

  const formSections = [
    { key: "basic", label: "פרטים בסיסיים", icon: Package },
    { key: "dimensions", label: "מידות ומשקל", icon: Ruler },
    { key: "pricing", label: "תמחור וחישובים", icon: Calculator },
    { key: "stock", label: "מלאי ומחסן", icon: Boxes },
    { key: "supply", label: "ספק ואספקה", icon: ShoppingCart },
    { key: "notes", label: "הערות", icon: FileText },
  ];

  const renderInput = (label: string, key: string, type = "text", opts?: { required?: boolean; placeholder?: string; disabled?: boolean }) => (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">
        {label} {opts?.required && <RequiredMark />}
      </label>
      <input
        type={type} value={form[key] || ""} onChange={e => setField(key, e.target.value)}
        placeholder={opts?.placeholder || label} disabled={opts?.disabled}
        className={`w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-blue-500 ${opts?.disabled ? "opacity-60" : ""} ${formValidation.errors[key] ? "border-red-500" : "border-border"}`}
      />
      <FormFieldError error={formValidation.errors[key]} />
    </div>
  );

  const renderSelect = (label: string, key: string, options: string[], opts?: { required?: boolean }) => (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label} {opts?.required && <RequiredMark />}</label>
      <select value={form[key] || ""} onChange={e => setField(key, e.target.value)}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-blue-500">
        <option value="">בחר...</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  const calcs = useMemo(() => calcMaterialPrices(form), [form]);

  const renderFormSection = () => {
    switch (formSection) {
      case "basic":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {renderInput("מק\"ט", "materialNumber", "text", { required: true, placeholder: "MAT-0001" })}
            {renderInput("שם חומר", "materialName", "text", { required: true })}
            {renderSelect("קטגוריה", "category", CATEGORIES)}
            {renderInput("תת-קטגוריה", "subCategory")}
            {renderSelect("סוג חומר", "materialType", MATERIAL_TYPES)}
            {renderSelect("גימור", "finish", FINISHES)}
            {renderSelect("דרגת איכות", "materialGrade", GRADES)}
            {renderSelect("יחידת מידה", "unit", UNITS)}
            {renderSelect("סטטוס", "status", STATUSES)}
            {renderInput("תקן", "standard")}
            {renderInput("צבע", "color")}
            {renderInput("ארץ מקור", "countryOfOrigin")}
          </div>
        );
      case "dimensions":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {renderInput("עובי (מ\"מ)", "thickness", "number")}
            {renderInput("רוחב (מ\"מ)", "width", "number")}
            {renderInput("גובה (מ\"מ)", "height", "number")}
            {renderInput("קוטר (מ\"מ)", "diameter", "number")}
            {renderInput("קוטר פנימי (מ\"מ)", "innerDiameter", "number")}
            {renderInput("סוג פנימי", "innerType")}
            {renderInput("אורך מוט (מ')", "rodLength", "number")}
            {renderInput("מידות כלליות", "dimensions")}
            {renderInput("משקל ליחידה (ק\"ג)", "weightPerUnit", "number")}
            {renderInput("משקל למטר (ק\"ג/מ')", "weightPerMeter", "number")}
          </div>
        );
      case "pricing":
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {renderSelect("שיטת תמחור", "pricingMethod", PRICING_METHODS)}
              {renderInput("מחיר בסיס", "standardPrice", "number")}
              {renderSelect("מטבע", "currency", CURRENCIES)}
              {renderInput("כמות באריזה", "packageQuantity", "number")}
            </div>
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-5">
              <h4 className="text-sm font-semibold text-blue-400 flex items-center gap-2 mb-4">
                <Calculator className="w-4 h-4" /> חישובי מחיר אוטומטיים
              </h4>
              <p className="text-xs text-muted-foreground mb-3">
                שיטת תמחור: <span className="text-foreground font-medium">{form.pricingMethod || "יחידה"}</span>
                {" | "}מחיר בסיס: <span className="text-foreground font-medium">{form.standardPrice || "0"} {form.currency || "ILS"}</span>
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <CalcBox label="מחיר ליחידה" value={`₪${calcs.unitPrice}`} icon={Package} />
                <CalcBox label="מחיר למטר" value={`₪${calcs.pricePerMeter}`} icon={Ruler} />
                <CalcBox label={'מחיר לק"ג'} value={`₪${calcs.pricePerKg}`} icon={Scale} />
                <CalcBox label={'לפני מע"מ'} value={`₪${calcs.totalPriceBeforeVat}`} icon={DollarSign} />
                <CalcBox label={`מע"מ (${(VAT_RATE * 100).toFixed(0)}%)`} value={`₪${calcs.vatAmount}`} icon={TrendingUp} />
                <CalcBox label={'אחרי מע"מ'} value={`₪${calcs.totalPriceAfterVat}`} icon={DollarSign} highlight />
              </div>
            </div>
          </div>
        );
      case "stock":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {renderInput("מלאי נוכחי", "currentStock", "number")}
            {renderInput("מלאי מינימום", "minimumStock", "number")}
            {renderInput("מלאי מקסימום", "maximumStock", "number")}
            {renderInput("נקודת הזמנה", "reorderPoint", "number")}
            {renderInput("מיקום מחסן", "warehouseLocation")}
            {renderInput("הזמנה מינימלית", "minimumOrder")}
          </div>
        );
      case "supply":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">ספק ראשי</label>
              <select value={form.supplierId || ""} onChange={e => setField("supplierId", e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-blue-500">
                <option value="">בחר ספק...</option>
                {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {renderInput("זמן אספקה (ימים)", "leadTimeDays", "number")}
            {renderInput("ימי אספקה", "deliveryDays", "number")}
            {renderInput("אחריות (חודשים)", "warrantyMonths", "number")}
          </div>
        );
      case "notes":
        return (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">הערות</label>
            <textarea value={form.notes || ""} onChange={e => setField("notes", e.target.value)} rows={4}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-blue-500" />
            <label className="block text-xs text-muted-foreground mb-1 mt-4">תיאור</label>
            <textarea value={form.description || ""} onChange={e => setField("description", e.target.value)} rows={3}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-blue-500" />
          </div>
        );
      default: return null;
    }
  };

  if (selectedMaterial) {
    const m = selectedMaterial;
    const stockStatus = getStockStatus(m);
    const StockIcon = stockStatus.icon;
    const mCalcs = calcMaterialPrices({
      standardPrice: m.standardPrice || "0",
      pricingMethod: m.pricingMethod || "יחידה",
      weightPerMeter: m.weightPerMeter || "0",
      weightPerUnit: m.weightPerUnit || "0",
      rodLength: m.rodLength || "0",
      packageQuantity: m.packageQuantity || "1",
      pricePerMeter: m.pricePerMeter || "0",
      pricePerKg: m.pricePerKg || "0",
      width: m.width || "0",
      height: m.height || "0",
    });

    return (
      <div className="p-6 space-y-6" dir="rtl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedMaterial(null)} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground"><X className="w-5 h-5" /></button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{m.materialName}</h1>
              <p className="text-sm text-muted-foreground">#{m.materialNumber} | {m.category} {m.materialType ? `| ${m.materialType}` : ""}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[m.status] || ""}`}>
              {m.status}
            </span>
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${stockStatus.bg} ${stockStatus.color}`}>
              <StockIcon className="w-3 h-3" /> {stockStatus.text}
            </span>
            <button onClick={() => { openEdit(m); setSelectedMaterial(null); }} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm flex items-center gap-1">
              <Edit2 className="w-3.5 h-3.5" /> עריכה
            </button>
          </div>
        </div>

        <div className="flex gap-2 border-b border-border overflow-x-auto">
          {[
            { key: "info", label: "פרטים", icon: Package },
            { key: "pricing", label: "תמחור", icon: Calculator },
            { key: "stock", label: "מלאי", icon: Boxes },
            { key: "attachments", label: "קבצים", icon: FileText },
            { key: "log", label: "לוג", icon: BarChart3 },
            { key: "related", label: "רשומות קשורות", icon: Users },
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
              <h3 className="font-medium text-foreground flex items-center gap-2"><Package className="w-4 h-4 text-blue-400" /> פרטים בסיסיים</h3>
              <InfoRow label={'מק"ט'} value={m.materialNumber} />
              <InfoRow label="שם" value={m.materialName} />
              <InfoRow label="קטגוריה" value={m.category} />
              <InfoRow label="תת-קטגוריה" value={m.subCategory} />
              <InfoRow label="סוג" value={m.materialType} />
              <InfoRow label="גימור" value={m.finish} />
              <InfoRow label="דרגה" value={m.materialGrade} />
              <InfoRow label="יחידה" value={m.unit} />
              <InfoRow label="תקן" value={m.standard} />
              <InfoRow label="צבע" value={m.color} />
              <InfoRow label="ארץ מקור" value={m.countryOfOrigin} />
            </div>
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h3 className="font-medium text-foreground flex items-center gap-2"><Ruler className="w-4 h-4 text-green-400" /> מידות ומשקל</h3>
              <InfoRow label="עובי" value={m.thickness ? `${m.thickness} מ"מ` : null} />
              <InfoRow label="רוחב" value={m.width ? `${m.width} מ"מ` : null} />
              <InfoRow label="גובה" value={m.height ? `${m.height} מ"מ` : null} />
              <InfoRow label="קוטר" value={m.diameter ? `${m.diameter} מ"מ` : null} />
              <InfoRow label="קוטר פנימי" value={m.innerDiameter ? `${m.innerDiameter} מ"מ` : null} />
              <InfoRow label="אורך מוט" value={m.rodLength ? `${m.rodLength} מ'` : null} />
              <InfoRow label="משקל ליחידה" value={m.weightPerUnit ? `${m.weightPerUnit} ק"ג` : null} />
              <InfoRow label="משקל למטר" value={m.weightPerMeter ? `${m.weightPerMeter} ק"ג/מ'` : null} />
              <InfoRow label="מידות" value={m.dimensions} />
            </div>
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h3 className="font-medium text-foreground flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-purple-400" /> אספקה</h3>
              <InfoRow label="זמן אספקה" value={m.leadTimeDays ? `${m.leadTimeDays} ימים` : null} />
              <InfoRow label="ימי אספקה" value={m.deliveryDays ? `${m.deliveryDays} ימים` : null} />
              <InfoRow label="הזמנה מינימלית" value={m.minimumOrder} />
              <InfoRow label="אחריות" value={m.warrantyMonths ? `${m.warrantyMonths} חודשים` : null} />
              <InfoRow label="מיקום מחסן" value={m.warehouseLocation} />
            </div>
          </div>
        )}

        {detailTab === "pricing" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-6">
              <h3 className="text-lg font-semibold text-blue-400 flex items-center gap-2 mb-4">
                <Calculator className="w-5 h-5" /> חישובי מחיר
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                שיטת תמחור: <span className="font-medium text-foreground">{m.pricingMethod || "יחידה"}</span>
                {" | "}מחיר בסיס: <span className="font-medium text-foreground">₪{parseFloat(m.standardPrice || "0").toFixed(2)}</span>
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <CalcBox label="מחיר ליחידה" value={`₪${mCalcs.unitPrice}`} icon={Package} />
                <CalcBox label="מחיר למטר" value={`₪${mCalcs.pricePerMeter}`} icon={Ruler} />
                <CalcBox label={'מחיר לק"ג'} value={`₪${mCalcs.pricePerKg}`} icon={Scale} />
                <CalcBox label={'לפני מע"מ'} value={`₪${mCalcs.totalPriceBeforeVat}`} icon={DollarSign} />
                <CalcBox label={`מע"מ (${(VAT_RATE * 100).toFixed(0)}%)`} value={`₪${mCalcs.vatAmount}`} icon={TrendingUp} />
                <CalcBox label={'אחרי מע"מ'} value={`₪${mCalcs.totalPriceAfterVat}`} icon={DollarSign} highlight />
              </div>
            </div>
          </div>
        )}

        {detailTab === "stock" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h3 className="font-medium text-foreground flex items-center gap-2"><Boxes className="w-4 h-4 text-orange-400" /> מצב מלאי</h3>
              <InfoRow label="מלאי נוכחי" value={m.currentStock ? `${m.currentStock} ${m.unit}` : "0"} />
              <InfoRow label="מלאי מינימום" value={m.minimumStock ? `${m.minimumStock} ${m.unit}` : null} />
              <InfoRow label="מלאי מקסימום" value={m.maximumStock ? `${m.maximumStock} ${m.unit}` : null} />
              <InfoRow label="נקודת הזמנה" value={m.reorderPoint ? `${m.reorderPoint} ${m.unit}` : null} />
              <InfoRow label="כמות באריזה" value={m.packageQuantity} />
              <div className="pt-2 border-t border-border mt-2">
                <div className={`flex items-center gap-2 text-sm ${stockStatus.color}`}>
                  <StockIcon className="w-4 h-4" /> {stockStatus.text}
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h3 className="font-medium text-foreground flex items-center gap-2"><DollarSign className="w-4 h-4 text-green-400" /> שווי מלאי</h3>
              <InfoRow label="מחיר ליחידה" value={`₪${parseFloat(m.standardPrice || "0").toFixed(2)}`} />
              <InfoRow label="מלאי נוכחי" value={`${parseFloat(m.currentStock || "0")} ${m.unit}`} />
              <InfoRow label="שווי מלאי" value={`₪${(parseFloat(m.standardPrice || "0") * parseFloat(m.currentStock || "0")).toLocaleString("he-IL", { minimumFractionDigits: 2 })}`} />
            </div>
          </div>
        )}

        {detailTab === "attachments" && <AttachmentsSection entityType="raw-materials" entityId={m.id} />}
        {detailTab === "log" && <ActivityLog entityType="raw-materials" entityId={m.id} />}
        {detailTab === "related" && (
          <RelatedRecords entityType="raw-materials" entityId={m.id} relatedTypes={[
            { key: "suppliers", label: "ספקים", endpoint: "/api/suppliers" },
            { key: "products", label: "מוצרים", endpoint: "/api/products" },
          ]} />
        )}

        {m.notes && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-medium text-foreground mb-2">הערות</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{m.notes}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Boxes className="w-7 h-7 text-orange-500" /> קטלוג חומרי גלם
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול חומרי גלם, מחירים, מלאי וחישובים</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openCreate} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm flex items-center gap-2 font-medium">
            <Plus className="w-4 h-4" /> הוסף חומר
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard label="סה״כ חומרים" value={stats.total} icon={Package} color="blue" />
        <StatCard label="פעילים" value={stats.active} icon={CheckCircle2} color="green" />
        <StatCard label="קטגוריות" value={stats.categories} icon={Tag} color="purple" />
        <StatCard label="מלאי נמוך" value={stats.lowStock} icon={AlertTriangle} color="yellow" />
        <StatCard label="אזל" value={stats.outOfStock} icon={AlertCircle} color="red" />
        <StatCard label="התראות מחיר" value={stats.priceAlerts} icon={TrendingUp} color="orange" />
        <StatCard label="שווי מלאי" value={`₪${stats.totalValue.toLocaleString("he-IL", { maximumFractionDigits: 0 })}`} icon={DollarSign} color="green" />
      </div>

      <BulkActions bulk={bulk} entityType="raw-materials" actions={defaultBulkActions("raw-materials", bulk, qc)} />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder='חיפוש לפי שם, מק"ט...'
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pr-10 pl-4 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
          <option value="all">כל הקטגוריות</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
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
              <h2 className="text-lg font-semibold text-foreground">{editingId ? "עריכת חומר גלם" : "הוספת חומר גלם חדש"}</h2>
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
          <Boxes className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground">אין חומרי גלם</h3>
          <p className="text-sm text-muted-foreground mt-1">לחץ על "הוסף חומר" כדי להתחיל</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-3 text-right w-8"><BulkCheckbox bulk={bulk} items={filtered} /></th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium cursor-pointer" onClick={() => toggleSort("materialNumber")}>
                    <SortIcon field="materialNumber" /> מק"ט
                  </th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium cursor-pointer" onClick={() => toggleSort("materialName")}>
                    <SortIcon field="materialName" /> שם חומר
                  </th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium">קטגוריה</th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium">סוג</th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium cursor-pointer" onClick={() => toggleSort("standardPrice")}>
                    <SortIcon field="standardPrice" /> מחיר
                  </th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium">שיטת תמחור</th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium cursor-pointer" onClick={() => toggleSort("currentStock")}>
                    <SortIcon field="currentStock" /> מלאי
                  </th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium">סטטוס</th>
                  <th className="px-3 py-3 text-center text-muted-foreground font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => {
                  const ss = getStockStatus(m);
                  const SSIcon = ss.icon;
                  return (
                    <tr key={m.id} className="border-b border-border/50 hover:bg-muted/20 transition cursor-pointer" onClick={() => setSelectedMaterial(m)}>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}><BulkCheckbox bulk={bulk} items={filtered} itemId={m.id} /></td>
                      <td className="px-3 py-3 text-muted-foreground font-mono text-xs">{m.materialNumber}</td>
                      <td className="px-3 py-3 font-medium text-foreground">{m.materialName}</td>
                      <td className="px-3 py-3 text-muted-foreground">{m.category}</td>
                      <td className="px-3 py-3 text-muted-foreground text-xs">{m.materialType || "—"}</td>
                      <td className="px-3 py-3 text-foreground font-mono">₪{parseFloat(m.standardPrice || "0").toFixed(2)}</td>
                      <td className="px-3 py-3 text-muted-foreground text-xs">{m.pricingMethod || "יחידה"}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-foreground">{parseFloat(m.currentStock || "0")}</span>
                          <span className="text-xs text-muted-foreground">{m.unit}</span>
                          <SSIcon className={`w-3 h-3 ${ss.color}`} />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[m.status] || ""}`}>{m.status}</span>
                      </td>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setSelectedMaterial(m)} className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground" title="צפה"><Eye className="w-3.5 h-3.5" /></button>
                          <button onClick={() => openEdit(m)} className="p-1.5 rounded hover:bg-blue-500/20 text-blue-400" title="עריכה"><Edit2 className="w-3.5 h-3.5" /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/raw-materials`, m.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                          {isSuperAdmin && <button onClick={() => setDeleteConfirm(m.id)} className="p-1.5 rounded hover:bg-red-500/20 text-red-400" title="מחיקה"><Trash2 className="w-3.5 h-3.5" /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border bg-muted/10 text-sm text-muted-foreground">
            מציג {filtered.length} מתוך {materials.length} חומרים
          </div>
        </div>
      )}

      <AnimatePresence>
        {deleteConfirm !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setDeleteConfirm(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-xl p-6 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-foreground mb-2">מחיקת חומר גלם</h3>
              <p className="text-sm text-muted-foreground mb-4">האם למחוק את חומר הגלם? פעולה זו לא ניתנת לביטול.</p>
              <div className="flex items-center gap-2 justify-end">
                <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm border border-border rounded-lg text-muted-foreground">ביטול</button>
                <button onClick={() => deleteConfirm && deleteMut.mutate(deleteConfirm)}
                  className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-foreground rounded-lg">מחיקה</button>
              </div>
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

function CalcBox({ label, value, icon: Icon, highlight }: { label: string; value: string; icon: any; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 text-center ${highlight ? "bg-blue-500/20 border border-blue-500/30" : "bg-muted/30 border border-border"}`}>
      <Icon className={`w-4 h-4 mx-auto mb-1 ${highlight ? "text-blue-400" : "text-muted-foreground"}`} />
      <p className={`text-xs mb-0.5 ${highlight ? "text-blue-300" : "text-muted-foreground"}`}>{label}</p>
      <p className={`text-sm font-bold ${highlight ? "text-blue-300" : "text-foreground"}`}>{value}</p>
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
