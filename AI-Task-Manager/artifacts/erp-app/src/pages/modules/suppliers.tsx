import { usePermissions } from "@/hooks/use-permissions";
import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import {
  Search, Plus, Edit2, Trash2, X, Save, Truck, ChevronDown, ChevronUp,
  Eye, CheckCircle2, Clock, AlertTriangle, Star, Phone, Mail, Globe,
  MapPin, Building2, CreditCard, FileText, Users, BarChart3, Shield,
  Ban, Filter, Hash, Landmark, Calendar, Award, User, Briefcase,
  TrendingUp, ExternalLink, Download, Printer, Send, MessageCircle,
  ShoppingBag, Package, ArrowUpDown, Copy
} from "lucide-react";
import ExportDropdown from "@/components/export-dropdown";
import { sendByEmail, generateEmailBody, printPage, exportToWord } from "@/lib/print-utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";

interface Supplier {
  id: number; supplierNumber: string; supplierName: string;
  contactPerson: string | null; phone: string | null; mobile: string | null;
  fax: string | null; email: string | null; website: string | null;
  address: string | null; city: string | null; country: string | null;
  category: string; supplyType: string | null; paymentTerms: string | null;
  leadTimeDays: number | null; vatNumber: string | null; taxId: string | null;
  bankName: string | null; bankBranch: string | null; bankAccountNumber: string | null;
  creditLimit: string | null; rating: number | null;
  qualityRating: string | null; deliveryRating: string | null; priceRating: string | null;
  certifications: string | null; contractStartDate: string | null; contractEndDate: string | null;
  status: string; notes: string | null; activityField: string | null;
  materialTypes: string | null; geographicArea: string | null;
  currency: string | null; creditDays: number | null; minimumOrder: string | null;
  urgentLeadTimeDays: number | null; createdAt: string; updatedAt: string;
}

const STATUSES = ["פעיל", "לא פעיל", "רשימה שחורה"];
const STATUS_COLORS: Record<string, string> = {
  "פעיל": "bg-emerald-500/20 text-emerald-400",
  "לא פעיל": "bg-muted/20 text-muted-foreground",
  "רשימה שחורה": "bg-red-500/20 text-red-400",
};
const STATUS_ICONS: Record<string, any> = {
  "פעיל": CheckCircle2, "לא פעיל": Clock, "רשימה שחורה": Ban,
};

const CATEGORIES = ["כללי", "מתכת", "ברזל", "אלומיניום", "זכוכית", "חשמל", "אינסטלציה", "צבע", "אטמים", "חומרי גלם", "כלי עבודה", "שירותים", "הובלה", "אחר"];
const PAYMENT_TERMS = ["מיידי", "שוטף+30", "שוטף+60", "שוטף+90", "שוטף+120"];
const CURRENCIES = ["ILS", "USD", "EUR", "GBP"];
const SUPPLY_TYPES = ["חומרי גלם", "מוצרים מוגמרים", "שירותים", "חלפים", "אריזה", "הובלה", "קבלן משנה", "ציוד", "אחר"];
const GEO_AREAS = ["צפון", "מרכז", "דרום", "ירושלים", "שפלה", "שרון", "נגב", "ארצי", "חו\"ל"];

const emptyForm = {
  supplierNumber: "", supplierName: "", contactPerson: "", phone: "", mobile: "",
  fax: "", email: "", website: "", address: "", city: "", country: "ישראל",
  category: "כללי", supplyType: "", paymentTerms: "", leadTimeDays: "",
  vatNumber: "", taxId: "", bankName: "", bankBranch: "", bankAccountNumber: "",
  creditLimit: "", rating: "0", certifications: "", contractStartDate: "",
  contractEndDate: "", status: "פעיל", notes: "", activityField: "",
  materialTypes: "", geographicArea: "", currency: "ILS", creditDays: "",
  minimumOrder: "", urgentLeadTimeDays: "",
};

function generateSupplierNumber(suppliers: Supplier[]) {
  const nums = suppliers.map(s => parseInt(s.supplierNumber?.replace(/\D/g, '') || '0')).filter(n => !isNaN(n));
  const next = (Math.max(0, ...nums) + 1).toString().padStart(4, '0');
  return `SUP-${next}`;
}


const load: any[] = [];
export default function SuppliersPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [detailTab, setDetailTab] = useState<string>("info");
  const [formSection, setFormSection] = useState<string>("basic");
  const [sortField, setSortField] = useState<string>("supplierName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({
    supplierNumber: { required: true, message: "מספר ספק נדרש" },
    supplierName: { required: true, message: "שם ספק נדרש" },
  });

  const { data: suppliersRaw, isLoading } = useQuery({
    queryKey: ["suppliers", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const r = await authFetch(`${API}/suppliers?${params}`);
      return r.json();
    },
  });
  const suppliers: Supplier[] = useMemo(() => {
    if (!suppliersRaw) return [];
    const arr = Array.isArray(suppliersRaw) ? suppliersRaw : (suppliersRaw?.data || suppliersRaw?.items || []);
    return arr.map((s: any) => ({
      ...s,
      supplierNumber: s.supplierNumber || s.supplier_number || "",
      supplierName: s.supplierName || s.supplier_name || "",
      contactPerson: s.contactPerson || s.contact_person || null,
      supplyType: s.supplyType || s.supply_type || null,
      paymentTerms: s.paymentTerms || s.payment_terms || null,
      leadTimeDays: s.leadTimeDays || s.lead_time_days || null,
      vatNumber: s.vatNumber || s.vat_number || null,
      taxId: s.taxId || s.tax_id || null,
      bankName: s.bankName || s.bank_name || null,
      bankBranch: s.bankBranch || s.bank_branch || null,
      bankAccountNumber: s.bankAccountNumber || s.bank_account_number || null,
      creditLimit: s.creditLimit || s.credit_limit || null,
      qualityRating: s.qualityRating || s.quality_rating || null,
      deliveryRating: s.deliveryRating || s.delivery_rating || null,
      priceRating: s.priceRating || s.price_rating || null,
      contractStartDate: s.contractStartDate || s.contract_start_date || null,
      contractEndDate: s.contractEndDate || s.contract_end_date || null,
      activityField: s.activityField || s.activity_field || null,
      materialTypes: s.materialTypes || s.material_types || null,
      geographicArea: s.geographicArea || s.geographic_area || null,
      creditDays: s.creditDays || s.credit_days || null,
      minimumOrder: s.minimumOrder || s.minimum_order || null,
      urgentLeadTimeDays: s.urgentLeadTimeDays || s.urgent_lead_time_days || null,
      warehouseLocation: s.warehouseLocation || s.warehouse_location || null,
      createdAt: s.createdAt || s.created_at || "",
      updatedAt: s.updatedAt || s.updated_at || "",
    }));
  }, [suppliersRaw]);

  const filtered = useMemo(() => {
    let list = suppliers.filter(s => {
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      const matchCategory = categoryFilter === "all" || s.category === categoryFilter;
      return matchStatus && matchCategory;
    });
    list.sort((a: any, b: any) => {
      const va = a[sortField] || "";
      const vb = b[sortField] || "";
      const cmp = String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [suppliers, statusFilter, categoryFilter, sortField, sortDir]);

  const stats = useMemo(() => {
    const active = suppliers.filter(s => s.status === "פעיל").length;
    const inactive = suppliers.filter(s => s.status === "לא פעיל").length;
    const blacklisted = suppliers.filter(s => s.status === "רשימה שחורה").length;
    const totalCredit = suppliers.reduce((sum, s) => sum + parseFloat(s.creditLimit || "0"), 0);
    const withContract = suppliers.filter(s => s.contractEndDate);
    const expiringContracts = withContract.filter(s => {
      if (!s.contractEndDate) return false;
      const days = Math.ceil((new Date(s.contractEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 30;
    }).length;
    const categories = [...new Set(suppliers.map(s => s.category))].filter(Boolean).length;
    const avgRating = suppliers.length > 0
      ? (suppliers.reduce((sum, s) => sum + (s.rating || 0), 0) / (suppliers.filter(s => (s.rating || 0) > 0).length || 1))
      : 0;
    return { active, inactive, blacklisted, totalCredit, expiringContracts, categories, avgRating, total: suppliers.length };
  }, [suppliers]);

  const createMut = useMutation({
    mutationFn: async (data: typeof emptyForm) => {
      const payload: any = { ...data };
      if (data.leadTimeDays) payload.leadTimeDays = parseInt(data.leadTimeDays);
      if (data.creditDays) payload.creditDays = parseInt(data.creditDays);
      if (data.urgentLeadTimeDays) payload.urgentLeadTimeDays = parseInt(data.urgentLeadTimeDays);
      if (data.rating) payload.rating = parseInt(data.rating);
      const r = await authFetch(`${API}/suppliers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); closeForm(); },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof emptyForm }) => {
      const payload: any = { ...data };
      if (data.leadTimeDays) payload.leadTimeDays = parseInt(data.leadTimeDays);
      else payload.leadTimeDays = undefined;
      if (data.creditDays) payload.creditDays = parseInt(data.creditDays);
      else payload.creditDays = undefined;
      if (data.urgentLeadTimeDays) payload.urgentLeadTimeDays = parseInt(data.urgentLeadTimeDays);
      else payload.urgentLeadTimeDays = undefined;
      if (data.rating) payload.rating = parseInt(data.rating);
      const r = await authFetch(`${API}/suppliers/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); closeForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/suppliers/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("שגיאה במחיקה");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); setDeleteConfirm(null); setSelectedSupplier(null); },
  });

  function closeForm() {
    setShowForm(false); setEditingId(null); setForm(emptyForm); setFormSection("basic");
    formValidation.clearErrors();
  }

  function openCreate() {
    setForm({ ...emptyForm, supplierNumber: generateSupplierNumber(suppliers) });
    setEditingId(null); setShowForm(true); setFormSection("basic");
  }

  function openEdit(s: Supplier) {
    setForm({
      supplierNumber: s.supplierNumber || "", supplierName: s.supplierName || "",
      contactPerson: s.contactPerson || "", phone: s.phone || "", mobile: s.mobile || "",
      fax: s.fax || "", email: s.email || "", website: s.website || "",
      address: s.address || "", city: s.city || "", country: s.country || "ישראל",
      category: s.category || "כללי", supplyType: s.supplyType || "", paymentTerms: s.paymentTerms || "",
      leadTimeDays: s.leadTimeDays?.toString() || "", vatNumber: s.vatNumber || "",
      taxId: s.taxId || "", bankName: s.bankName || "", bankBranch: s.bankBranch || "",
      bankAccountNumber: s.bankAccountNumber || "", creditLimit: s.creditLimit || "",
      rating: s.rating?.toString() || "0", certifications: s.certifications || "",
      contractStartDate: s.contractStartDate || "", contractEndDate: s.contractEndDate || "",
      status: s.status || "פעיל", notes: s.notes || "", activityField: s.activityField || "",
      materialTypes: s.materialTypes || "", geographicArea: s.geographicArea || "",
      currency: s.currency || "ILS", creditDays: s.creditDays?.toString() || "",
      minimumOrder: s.minimumOrder || "", urgentLeadTimeDays: s.urgentLeadTimeDays?.toString() || "",
    });
    setEditingId(s.id); setShowForm(true); setFormSection("basic");
  }

  function handleSave() {
    if (!formValidation.validate(form)) return;
    if (editingId) updateMut.mutate({ id: editingId, data: form });
    else createMut.mutate(form);
  }

  function setField(key: string, val: string) {
    setForm(prev => ({ ...prev, [key]: val }));
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
    { key: "basic", label: "פרטים בסיסיים", icon: Building2 },
    { key: "contact", label: "איש קשר ותקשורת", icon: Phone },
    { key: "address", label: "כתובת ואזור", icon: MapPin },
    { key: "supply", label: "פרטי אספקה", icon: Truck },
    { key: "finance", label: "פרטים פיננסיים", icon: CreditCard },
    { key: "bank", label: "פרטי בנק", icon: Landmark },
    { key: "contract", label: "חוזה ודירוג", icon: Award },
    { key: "notes", label: "הערות", icon: FileText },
  ];

  const renderInput = (label: string, key: string, type = "text", opts?: { required?: boolean; placeholder?: string }) => (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">
        {label} {opts?.required && <RequiredMark />}
      </label>
      <input
        type={type}
        value={(form as any)[key] || ""}
        onChange={e => setField(key, e.target.value)}
        placeholder={opts?.placeholder || label}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
      <FormFieldError errors={formValidation.errors} field={key} />
    </div>
  );

  const renderSelect = (label: string, key: string, options: string[], opts?: { required?: boolean }) => (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">
        {label} {opts?.required && <RequiredMark />}
      </label>
      <select
        value={(form as any)[key] || ""}
        onChange={e => setField(key, e.target.value)}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-blue-500"
      >
        <option value="">בחר...</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  const renderTextarea = (label: string, key: string) => (
    <div className="col-span-full">
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <textarea
        value={(form as any)[key] || ""}
        onChange={e => setField(key, e.target.value)}
        rows={3}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );

  const renderFormSection = () => {
    switch (formSection) {
      case "basic":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {renderInput("מספר ספק", "supplierNumber", "text", { required: true, placeholder: "SUP-0001" })}
            {renderInput("שם ספק", "supplierName", "text", { required: true })}
            {renderSelect("קטגוריה", "category", CATEGORIES)}
            {renderSelect("סוג אספקה", "supplyType", SUPPLY_TYPES)}
            {renderSelect("סטטוס", "status", STATUSES)}
            {renderInput("תחום פעילות", "activityField")}
            {renderInput("סוגי חומרים", "materialTypes")}
          </div>
        );
      case "contact":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {renderInput("איש קשר", "contactPerson")}
            {renderInput("טלפון", "phone", "tel")}
            {renderInput("נייד", "mobile", "tel")}
            {renderInput("פקס", "fax", "tel")}
            {renderInput("אימייל", "email", "email")}
            {renderInput("אתר אינטרנט", "website", "url")}
          </div>
        );
      case "address":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {renderInput("כתובת", "address")}
            {renderInput("עיר", "city")}
            {renderInput("מדינה", "country")}
            {renderSelect("אזור גיאוגרפי", "geographicArea", GEO_AREAS)}
          </div>
        );
      case "supply":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {renderInput("זמן אספקה (ימים)", "leadTimeDays", "number")}
            {renderInput("אספקה דחופה (ימים)", "urgentLeadTimeDays", "number")}
            {renderInput("הזמנה מינימלית", "minimumOrder")}
            {renderSelect("תנאי תשלום", "paymentTerms", PAYMENT_TERMS)}
            {renderInput("ימי אשראי", "creditDays", "number")}
            {renderSelect("מטבע", "currency", CURRENCIES)}
          </div>
        );
      case "finance":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {renderInput("מספר עוסק / ח.פ", "vatNumber")}
            {renderInput("ת.ז / מספר מזהה", "taxId")}
            {renderInput("מסגרת אשראי (₪)", "creditLimit", "number")}
          </div>
        );
      case "bank":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {renderInput("שם בנק", "bankName")}
            {renderInput("סניף", "bankBranch")}
            {renderInput("מספר חשבון", "bankAccountNumber")}
          </div>
        );
      case "contract":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {renderInput("תחילת חוזה", "contractStartDate", "date")}
            {renderInput("סיום חוזה", "contractEndDate", "date")}
            {renderInput("הסמכות / תקנים", "certifications")}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">דירוג כללי</label>
              <div className="flex items-center gap-1 mt-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" onClick={() => setField("rating", String(n))}
                    className={`p-1 ${parseInt(form.rating || "0") >= n ? "text-yellow-400" : "text-muted-foreground/30"}`}>
                    <Star className="w-5 h-5 fill-current" />
                  </button>
                ))}
                <span className="text-xs text-muted-foreground mr-2">{form.rating || 0}/5</span>
              </div>
            </div>
          </div>
        );
      case "notes":
        return (
          <div className="grid grid-cols-1 gap-4">
            {renderTextarea("הערות כלליות", "notes")}
          </div>
        );
      default:
        return null;
    }
  };

  if (selectedSupplier) {
    const s = selectedSupplier;
    const StatusIcon = STATUS_ICONS[s.status] || CheckCircle2;
    return (
      <div className="p-6 space-y-6" dir="rtl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedSupplier(null)} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground">
              <X className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{s.supplierName}</h1>
              <p className="text-sm text-muted-foreground">#{s.supplierNumber} | {s.category}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[s.status] || "bg-muted/20 text-muted-foreground"}`}>
              <StatusIcon className="w-3 h-3" /> {s.status}
            </span>
            <button onClick={() => { openEdit(s); setSelectedSupplier(null); }} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm flex items-center gap-1">
              <Edit2 className="w-3.5 h-3.5" /> עריכה
            </button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/suppliers`, s.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
          </div>
        </div>

        <div className="flex gap-2 border-b border-border">
          {[
            { key: "info", label: "פרטים", icon: Building2 },
            { key: "contact", label: "איש קשר", icon: Phone },
            { key: "finance", label: "פיננסי", icon: CreditCard },
            { key: "supply", label: "אספקה", icon: Truck },
            { key: "attachments", label: "קבצים", icon: FileText },
            { key: "log", label: "לוג פעילות", icon: BarChart3 },
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
              <h3 className="font-medium text-foreground flex items-center gap-2"><Building2 className="w-4 h-4 text-blue-400" /> פרטים בסיסיים</h3>
              <InfoRow label="מספר ספק" value={s.supplierNumber} />
              <InfoRow label="שם ספק" value={s.supplierName} />
              <InfoRow label="קטגוריה" value={s.category} />
              <InfoRow label="סוג אספקה" value={s.supplyType} />
              <InfoRow label="תחום פעילות" value={s.activityField} />
              <InfoRow label="סוגי חומרים" value={s.materialTypes} />
              <InfoRow label="אזור" value={s.geographicArea} />
            </div>
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h3 className="font-medium text-foreground flex items-center gap-2"><MapPin className="w-4 h-4 text-green-400" /> כתובת</h3>
              <InfoRow label="כתובת" value={s.address} />
              <InfoRow label="עיר" value={s.city} />
              <InfoRow label="מדינה" value={s.country} />
            </div>
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h3 className="font-medium text-foreground flex items-center gap-2"><Star className="w-4 h-4 text-yellow-400" /> דירוג</h3>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <Star key={n} className={`w-5 h-5 ${(s.rating || 0) >= n ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/20"}`} />
                ))}
                <span className="text-sm text-muted-foreground mr-2">{s.rating || 0}/5</span>
              </div>
              <InfoRow label="הסמכות" value={s.certifications} />
              <InfoRow label="חוזה מ-" value={s.contractStartDate ? new Date(s.contractStartDate).toLocaleDateString("he-IL") : null} />
              <InfoRow label="חוזה עד" value={s.contractEndDate ? new Date(s.contractEndDate).toLocaleDateString("he-IL") : null} />
            </div>
          </div>
        )}

        {detailTab === "contact" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h3 className="font-medium text-foreground flex items-center gap-2"><User className="w-4 h-4 text-blue-400" /> איש קשר ראשי</h3>
              <InfoRow label="שם" value={s.contactPerson} />
              <InfoRow label="טלפון" value={s.phone} icon={<Phone className="w-3.5 h-3.5" />} />
              <InfoRow label="נייד" value={s.mobile} icon={<Phone className="w-3.5 h-3.5" />} />
              <InfoRow label="פקס" value={s.fax} />
              <InfoRow label="אימייל" value={s.email} icon={<Mail className="w-3.5 h-3.5" />} />
              <InfoRow label="אתר" value={s.website} icon={<Globe className="w-3.5 h-3.5" />} />
            </div>
          </div>
        )}

        {detailTab === "finance" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h3 className="font-medium text-foreground flex items-center gap-2"><CreditCard className="w-4 h-4 text-purple-400" /> פרטים פיננסיים</h3>
              <InfoRow label="ח.פ / עוסק מורשה" value={s.vatNumber} />
              <InfoRow label="ת.ז" value={s.taxId} />
              <InfoRow label="מסגרת אשראי" value={s.creditLimit ? `₪${parseFloat(s.creditLimit).toLocaleString()}` : null} />
              <InfoRow label="ימי אשראי" value={s.creditDays?.toString()} />
              <InfoRow label="מטבע" value={s.currency} />
            </div>
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h3 className="font-medium text-foreground flex items-center gap-2"><Landmark className="w-4 h-4 text-orange-400" /> פרטי בנק</h3>
              <InfoRow label="בנק" value={s.bankName} />
              <InfoRow label="סניף" value={s.bankBranch} />
              <InfoRow label="חשבון" value={s.bankAccountNumber} />
            </div>
          </div>
        )}

        {detailTab === "supply" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h3 className="font-medium text-foreground flex items-center gap-2"><Truck className="w-4 h-4 text-blue-400" /> תנאי אספקה</h3>
              <InfoRow label="תנאי תשלום" value={s.paymentTerms} />
              <InfoRow label="זמן אספקה" value={s.leadTimeDays ? `${s.leadTimeDays} ימים` : null} />
              <InfoRow label="אספקה דחופה" value={s.urgentLeadTimeDays ? `${s.urgentLeadTimeDays} ימים` : null} />
              <InfoRow label="הזמנה מינימלית" value={s.minimumOrder} />
            </div>
          </div>
        )}

        {detailTab === "attachments" && (
          <AttachmentsSection entityType="suppliers" entityId={s.id} />
        )}

        {detailTab === "log" && (
          <ActivityLog entityType="suppliers" entityId={s.id} />
        )}

        {detailTab === "related" && (
          <RelatedRecords entityType="suppliers" entityId={s.id} relatedTypes={[
            { key: "raw-materials", label: "חומרי גלם", endpoint: "/api/raw-materials" },
            { key: "products", label: "מוצרים", endpoint: "/api/products" },
          ]} />
        )}

        {s.notes && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-medium text-foreground mb-2">הערות</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{s.notes}</p>
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
            <Truck className="w-7 h-7 text-blue-500" /> ניהול ספקים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול מאגר ספקים, חוזים ודירוגים</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportDropdown
            data={filtered}
            filename="suppliers"
            columns={["supplierNumber", "supplierName", "category", "phone", "email", "city", "status", "rating"]}
            columnHeaders={["מספר", "שם ספק", "קטגוריה", "טלפון", "אימייל", "עיר", "סטטוס", "דירוג"]}
          />
          <button onClick={openCreate} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm flex items-center gap-2 font-medium">
            <Plus className="w-4 h-4" /> ספק חדש
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard label="סה״כ ספקים" value={stats.total} icon={Users} color="blue" />
        <StatCard label="פעילים" value={stats.active} icon={CheckCircle2} color="green" />
        <StatCard label="לא פעילים" value={stats.inactive} icon={Clock} color="gray" />
        <StatCard label="רשימה שחורה" value={stats.blacklisted} icon={Ban} color="red" />
        <StatCard label="חוזים מתפוגגים" value={stats.expiringContracts} icon={AlertTriangle} color="yellow" />
        <StatCard label="דירוג ממוצע" value={stats.avgRating.toFixed(1)} icon={Star} color="purple" />
      </div>

      <BulkActions
        bulk={bulk}
        entityType="suppliers"
        actions={defaultBulkActions("suppliers", bulk, qc)}
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text" placeholder="חיפוש לפי שם, מספר, עיר..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pr-10 pl-4 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
          <option value="all">כל הסטטוסים</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
          <option value="all">כל הקטגוריות</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {editingId ? "עריכת ספק" : "הוספת ספק חדש"}
              </h2>
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

            <div className="p-6">
              {renderFormSection()}
            </div>

            <div className="border-t border-border px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50">
                  <Save className="w-4 h-4" /> {editingId ? "עדכון" : "שמירה"}
                </button>
                <button onClick={closeForm} className="px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted/50">
                  ביטול
                </button>
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
          <Truck className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground">אין ספקים</h3>
          <p className="text-sm text-muted-foreground mt-1">לחץ על "ספק חדש" כדי להתחיל</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-3 text-right w-8">
                    <BulkCheckbox bulk={bulk} items={filtered} />
                  </th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium cursor-pointer" onClick={() => toggleSort("supplierNumber")}>
                    <SortIcon field="supplierNumber" /> מספר
                  </th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium cursor-pointer" onClick={() => toggleSort("supplierName")}>
                    <SortIcon field="supplierName" /> שם ספק
                  </th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium">קטגוריה</th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium">טלפון</th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium">עיר</th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium">דירוג</th>
                  <th className="px-3 py-3 text-right text-muted-foreground font-medium">סטטוס</th>
                  <th className="px-3 py-3 text-center text-muted-foreground font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const StatusIcon = STATUS_ICONS[s.status] || CheckCircle2;
                  return (
                    <tr key={s.id} className="border-b border-border/50 hover:bg-muted/20 transition cursor-pointer" onClick={() => setSelectedSupplier(s)}>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <BulkCheckbox bulk={bulk} items={filtered} itemId={s.id} />
                      </td>
                      <td className="px-3 py-3 text-muted-foreground font-mono text-xs">{s.supplierNumber}</td>
                      <td className="px-3 py-3 font-medium text-foreground">{s.supplierName}</td>
                      <td className="px-3 py-3 text-muted-foreground">{s.category}</td>
                      <td className="px-3 py-3 text-muted-foreground" dir="ltr">{s.phone || s.mobile || "—"}</td>
                      <td className="px-3 py-3 text-muted-foreground">{s.city || "—"}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map(n => (
                            <Star key={n} className={`w-3 h-3 ${(s.rating || 0) >= n ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/20"}`} />
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[s.status] || ""}`}>
                          <StatusIcon className="w-3 h-3" /> {s.status}
                        </span>
                      </td>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setSelectedSupplier(s)} className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground" title="צפה">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => openEdit(s)} className="p-1.5 rounded hover:bg-blue-500/20 text-blue-400" title="עריכה">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {isSuperAdmin && <button onClick={() => setDeleteConfirm(s.id)} className="p-1.5 rounded hover:bg-red-500/20 text-red-400" title="מחיקה">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border bg-muted/10 text-sm text-muted-foreground">
            מציג {filtered.length} מתוך {suppliers.length} ספקים
          </div>
        </div>
      )}

      <AnimatePresence>
        {deleteConfirm !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setDeleteConfirm(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-xl p-6 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-foreground mb-2">מחיקת ספק</h3>
              <p className="text-sm text-muted-foreground mb-4">האם למחוק את הספק? פעולה זו לא ניתנת לביטול.</p>
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
    purple: "text-purple-400 bg-purple-500/10", gray: "text-gray-400 bg-gray-500/10",
    orange: "text-orange-400 bg-orange-500/10",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
      <div className={`p-2 rounded-lg ${colors[color] || colors.blue}`}><Icon className="w-5 h-5" /></div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}

function InfoRow({ label, value, icon }: { label: string; value: string | null | undefined; icon?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground flex items-center gap-1">{icon} {value}</span>
    </div>
  );
}
