import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import {
  Search, Plus, Edit2, Trash2, X, Save, Truck, ChevronDown, ChevronUp,
  Eye, CheckCircle2, Clock, AlertTriangle, Star, Phone, Mail, Globe,
  MapPin, Building2, CreditCard, FileText, Users, BarChart3, Shield,
  Ban, Filter, Hash, Landmark, Calendar, Award, User, Briefcase,
  TrendingUp, ExternalLink, Download, Printer, Send, MessageCircle,
  ShoppingBag, Package
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
  onTimeDeliveryPct: string | null;
  certifications: string | null; contractStartDate: string | null; contractEndDate: string | null;
  status: string; notes: string | null; activityField: string | null;
  materialTypes: string | null; geographicArea: string | null;
  currency: string | null; creditDays: number | null; minimumOrder: string | null;
  urgentLeadTimeDays: number | null; createdAt: string; updatedAt: string;
}

interface SupplierContact {
  id: number; supplierId: number; contactName: string; role: string | null;
  phone: string | null; mobile: string | null; email: string | null; notes: string | null;
}

interface SupplierDocument {
  id: number; supplierId: number; documentName: string; documentType: string;
  fileUrl: string | null; notes: string | null; expiryDate: string | null;
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

export default function SuppliersPage() {
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
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({ supplierNumber: { required: true, message: "מספר ספק נדרש" }, supplierName: { required: true, message: "שם ספק נדרש" } });

  const { data: suppliersRaw, isLoading } = useQuery({
    queryKey: ["suppliers", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const r = await authFetch(`${API}/suppliers?${params}`);
      return r.json();
    },
  });
  const suppliers: Supplier[] = Array.isArray(suppliersRaw) ? suppliersRaw : (suppliersRaw?.data || suppliersRaw?.items || []);

  const filtered = suppliers.filter(s => {
    const matchStatus = statusFilter === "all" || s.status === statusFilter;
    const matchCategory = categoryFilter === "all" || s.category === categoryFilter;
    return matchStatus && matchCategory;
  });

  const activeSuppliers = suppliers.filter(s => s.status === "פעיל");
  const inactiveSuppliers = suppliers.filter(s => s.status === "לא פעיל");
  const blacklisted = suppliers.filter(s => s.status === "רשימה שחורה");
  const withContract = suppliers.filter(s => s.contractEndDate);
  const expiringContracts = withContract.filter(s => {
    if (!s.contractEndDate) return false;
    const days = Math.ceil((new Date(s.contractEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days >= 0 && days <= 30;
  });
  const avgRating = suppliers.length > 0
    ? (suppliers.reduce((sum, s) => sum + (s.rating || 0), 0) / suppliers.filter(s => (s.rating || 0) > 0).length || 0)
    : 0;
  const totalCreditLimit = suppliers.reduce((sum, s) => sum + parseFloat(s.creditLimit || "0"), 0);
  const categories = [...new Set(suppliers.map(s => s.category))].filter(Boolean);

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
    mutationFn: async (id: number) => { await authFetch(`${API}/suppliers/${id}`, { method: "DELETE" }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); setDeleteConfirm(null); },
  });

  function closeForm() { setShowForm(false); setEditingId(null); setForm(emptyForm); }
  function openEdit(s: Supplier) {
    setForm({
      supplierNumber: s.supplierNumber, supplierName: s.supplierName,
      contactPerson: s.contactPerson || "", phone: s.phone || "", mobile: s.mobile || "",
      fax: s.fax || "", email: s.email || "", website: s.website || "",
      address: s.address || "", city: s.city || "", country: s.country || "ישראל",
      category: s.category, supplyType: s.supplyType || "", paymentTerms: s.paymentTerms || "",
      leadTimeDays: s.leadTimeDays ? String(s.leadTimeDays) : "",
      vatNumber: s.vatNumber || "", taxId: s.taxId || "",
      bankName: s.bankName || "", bankBranch: s.bankBranch || "",
      bankAccountNumber: s.bankAccountNumber || "", creditLimit: s.creditLimit || "",
      rating: String(s.rating || 0), certifications: s.certifications || "",
      contractStartDate: s.contractStartDate || "", contractEndDate: s.contractEndDate || "",
      status: s.status, notes: s.notes || "", activityField: s.activityField || "",
      materialTypes: s.materialTypes || "", geographicArea: s.geographicArea || "",
      currency: s.currency || "ILS", creditDays: s.creditDays ? String(s.creditDays) : "",
      minimumOrder: s.minimumOrder || "", urgentLeadTimeDays: s.urgentLeadTimeDays ? String(s.urgentLeadTimeDays) : "",
    });
    setEditingId(s.id); setShowForm(true);
  }
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.supplierNumber || !form.supplierName) return;
    editingId ? updateMut.mutate({ id: editingId, data: form }) : createMut.mutate(form);
  }

  const ratingMut = useMutation({
    mutationFn: async ({ id, rating }: { id: number; rating: number }) => {
      const r = await authFetch(`${API}/suppliers/${id}/rating`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating }) });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });

  function renderStars(rating: number, supplierId?: number) {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <button key={i} type="button"
            onClick={supplierId ? e => { e.stopPropagation(); ratingMut.mutate({ id: supplierId, rating: i }); } : undefined}
            className={supplierId ? "cursor-pointer" : "cursor-default"}
          >
            <Star className={`w-3.5 h-3.5 ${i <= rating ? "text-amber-400 fill-amber-400" : "text-muted-foreground"} ${supplierId ? "hover:text-amber-300 hover:fill-amber-300 transition-colors" : ""}`} />
          </button>
        ))}
      </div>
    );
  }

  function getContractDays(endDate: string | null) {
    if (!endDate) return null;
    return Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="min-h-screen" dir="rtl">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Truck className="w-6 h-6 text-white" />
              </div>
              ניהול ספקים
            </h1>
            <p className="text-muted-foreground mt-1">ניהול מקיף של ספקים, חוזים, דירוגים ומסמכים</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => {
              const msg = `רשימת ספקים - טכנו-כל עוזי\n${suppliers.filter((s: Supplier) => s.status === "פעיל").slice(0, 10).map((s: Supplier) => `• ${s.supplierName} | ${s.category} | ${s.phone || s.mobile || ""}`).join("\n")}`;
              window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
            }} className="flex items-center gap-1.5 px-3 py-2 bg-green-700 hover:bg-green-600 text-white rounded-xl text-sm transition-colors">
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </button>
            <ExportDropdown data={suppliers} headers={{ supplierNumber: "מספר", supplierName: "שם ספק", contactPerson: "איש קשר", phone: "טלפון", mobile: "נייד", email: "אימייל", city: "עיר", country: "ארץ", category: "קטגוריה", paymentTerms: "תנאי תשלום", status: "סטטוס" }} filename={"suppliers"} />
            <button onClick={() => sendByEmail("ספקים - טכנו-כל עוזי", generateEmailBody("ספקים", suppliers, { supplierNumber: "מספר", supplierName: "שם ספק", phone: "טלפון", email: "אימייל", status: "סטטוס" }))}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm transition-colors">
              <Mail className="w-4 h-4" /> אימייל
            </button>
            <button onClick={() => exportToWord("ניהול ספקים", suppliers, { supplierNumber: "מספר", supplierName: "שם ספק", phone: "טלפון", email: "אימייל", city: "עיר", category: "קטגוריה", status: "סטטוס" }, "suppliers")}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-700 hover:bg-indigo-600 text-white rounded-xl text-sm transition-colors">
              <FileText className="w-4 h-4" /> Word
            </button>
            <button onClick={() => printPage("ניהול ספקים")}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm transition-colors">
              <Printer className="w-4 h-4" /> הדפסה
            </button>
            <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-medium transition-colors">
              <Plus className="w-5 h-5" />ספק חדש
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "סה״כ ספקים", value: suppliers.length, icon: Truck, color: "text-violet-400", bg: "bg-violet-500/10" },
            { label: "פעילים", value: activeSuppliers.length, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
            { label: "לא פעילים", value: inactiveSuppliers.length, icon: Clock, color: "text-muted-foreground", bg: "bg-muted/10" },
            { label: "רשימה שחורה", value: blacklisted.length, icon: Ban, color: blacklisted.length > 0 ? "text-red-400" : "text-muted-foreground", bg: blacklisted.length > 0 ? "bg-red-500/10" : "bg-muted/10" },
            { label: "קטגוריות", value: categories.length, icon: Briefcase, color: "text-blue-400", bg: "bg-blue-500/10" },
            { label: "חוזים שפגים", value: expiringContracts.length, icon: AlertTriangle, color: expiringContracts.length > 0 ? "text-amber-400" : "text-muted-foreground", bg: expiringContracts.length > 0 ? "bg-amber-500/10" : "bg-muted/10" },
            { label: "דירוג ממוצע", value: avgRating > 0 ? avgRating.toFixed(1) : "—", icon: Star, color: "text-amber-400", bg: "bg-amber-500/10" },
            { label: "מסגרת אשראי", value: `₪${Math.round(totalCreditLimit).toLocaleString()}`, icon: CreditCard, color: "text-cyan-400", bg: "bg-cyan-500/10" },
          ].map(s => (
            <div key={s.label} className="bg-[#1a1d23] border border-gray-800 rounded-xl p-3">
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

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input type="text" placeholder="חיפוש לפי שם, מספר, עיר, איש קשר..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2.5 bg-[#1a1d23] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 bg-[#1a1d23] border border-gray-700 rounded-xl text-white focus:border-violet-500 focus:outline-none">
            <option value="all">כל הסטטוסים</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="px-3 py-2.5 bg-[#1a1d23] border border-gray-700 rounded-xl text-white focus:border-violet-500 focus:outline-none">
            <option value="all">כל הקטגוריות</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Truck className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl text-muted-foreground">אין ספקים</h3>
            <p className="text-muted-foreground text-sm mt-2">{search || statusFilter !== "all" || categoryFilter !== "all" ? "נסה לשנות את מסנני החיפוש" : 'לחץ "ספק חדש" כדי להתחיל'}</p>
          </div>
        ) : (
          <>
          <BulkActions bulk={bulk} actions={defaultBulkActions} entityName="ספקים" />
          <div className="bg-[#1a1d23] border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-800 bg-[#12141a]">
              <span className="text-sm text-muted-foreground">{filtered.length} ספקים</span>
            </div>
            <table className="w-full text-right">
              <thead><tr className="border-b border-gray-800 bg-[#12141a]">
                <th className="px-4 py-3 w-10"><BulkCheckbox bulk={bulk} items={filtered} /></th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">מספר</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">שם ספק</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">איש קשר</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">טלפון</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">עיר</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">קטגוריה</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">תנאי תשלום</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">דירוג</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">סטטוס</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">פעולות</th>
              </tr></thead>
              <tbody>
                {filtered.map(s => {
                  const contractDays = getContractDays(s.contractEndDate);
                  const contractExpiring = contractDays !== null && contractDays >= 0 && contractDays <= 30;
                  return (
                    <tr key={s.id} className={`border-b border-gray-800/50 hover:bg-[#1e2128] transition-colors ${contractExpiring ? "bg-amber-500/5" : ""} ${bulk.isSelected(s.id) ? "bg-primary/5" : ""}`}>
                      <td className="px-4 py-3"><BulkCheckbox bulk={bulk} id={s.id} /></td>
                      <td className="px-4 py-3">
                        <span className="text-violet-400 font-mono text-sm">{s.supplierNumber}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-white font-medium">{s.supplierName}</span>
                        {s.country && s.country !== "ישראל" && (
                          <span className="text-muted-foreground text-xs block">{s.country}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-sm">{s.contactPerson || "—"}</td>
                      <td className="px-4 py-3 text-gray-300 text-sm font-mono" dir="ltr">{s.phone || s.mobile || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-sm">{s.city || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-violet-500/10 text-violet-400 rounded-md text-xs">{s.category}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-sm">{s.paymentTerms || "—"}</td>
                      <td className="px-4 py-3">{renderStars(s.rating || 0, s.id)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[s.status] || ""}`}>
                          {STATUS_ICONS[s.status] && (() => { const Icon = STATUS_ICONS[s.status]; return <Icon className="w-3 h-3" />; })()}
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setSelectedSupplier(s); setDetailTab("info"); }} className="p-1.5 text-muted-foreground hover:text-violet-400 rounded-md" title="צפה בפרטים"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => openEdit(s)} className="p-1.5 text-muted-foreground hover:text-amber-400 rounded-md" title="ערוך"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => setDeleteConfirm(s.id)} className="p-1.5 text-muted-foreground hover:text-red-400 rounded-md" title="מחק"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {selectedSupplier && (
          <SupplierDetailModal
            supplier={selectedSupplier}
            tab={detailTab}
            setTab={setDetailTab}
            onClose={() => setSelectedSupplier(null)}
            renderStars={renderStars}
            getContractDays={getContractDays}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-4 overflow-y-auto" onClick={closeForm}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-[#1a1d23] border border-gray-700 rounded-2xl w-full max-w-5xl mx-4 mb-10" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white">{editingId ? "עריכת ספק" : "ספק חדש"}</h2>
                <button onClick={closeForm} className="p-1 text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-violet-400 flex items-center gap-2"><Building2 className="w-4 h-4" />פרטי חברה</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div><label className="block text-xs text-muted-foreground mb-1">מספר ספק *</label><input value={form.supplierNumber} onChange={e => setForm({...form, supplierNumber: e.target.value})} placeholder="SUP-001" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">שם חברה *</label><input value={form.supplierName} onChange={e => setForm({...form, supplierName: e.target.value})} placeholder="שם הספק" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">קטגוריה</label><select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white focus:border-violet-500 focus:outline-none text-sm">{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-violet-400 flex items-center gap-2"><User className="w-4 h-4" />איש קשר ותקשורת</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div><label className="block text-xs text-muted-foreground mb-1">איש קשר</label><input value={form.contactPerson} onChange={e => setForm({...form, contactPerson: e.target.value})} placeholder="שם מלא" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">טלפון</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="03-1234567" dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">נייד</label><input value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} placeholder="050-1234567" dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">פקס</label><input value={form.fax} onChange={e => setForm({...form, fax: e.target.value})} placeholder="03-1234568" dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">אימייל</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="info@supplier.com" dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">אתר אינטרנט</label><input value={form.website} onChange={e => setForm({...form, website: e.target.value})} placeholder="https://www.supplier.com" dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-violet-400 flex items-center gap-2"><MapPin className="w-4 h-4" />כתובת</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div><label className="block text-xs text-muted-foreground mb-1">כתובת</label><input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="רחוב ומספר" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">עיר</label><input value={form.city} onChange={e => setForm({...form, city: e.target.value})} placeholder="עיר" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">מדינה</label><input value={form.country} onChange={e => setForm({...form, country: e.target.value})} placeholder="ישראל" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-violet-400 flex items-center gap-2"><Landmark className="w-4 h-4" />פרטי מיסוי ובנק</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div><label className="block text-xs text-muted-foreground mb-1">ח.פ / ת.ז</label><input value={form.taxId} onChange={e => setForm({...form, taxId: e.target.value})} placeholder="מספר ח.פ" dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">מספר עוסק מורשה</label><input value={form.vatNumber} onChange={e => setForm({...form, vatNumber: e.target.value})} placeholder="מספר עוסק" dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">שם בנק</label><input value={form.bankName} onChange={e => setForm({...form, bankName: e.target.value})} placeholder="שם הבנק" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">סניף</label><input value={form.bankBranch} onChange={e => setForm({...form, bankBranch: e.target.value})} placeholder="מספר סניף" dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">מספר חשבון</label><input value={form.bankAccountNumber} onChange={e => setForm({...form, bankAccountNumber: e.target.value})} placeholder="מספר חשבון" dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-violet-400 flex items-center gap-2"><CreditCard className="w-4 h-4" />תנאים מסחריים</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div><label className="block text-xs text-muted-foreground mb-1">תנאי תשלום</label><select value={form.paymentTerms} onChange={e => setForm({...form, paymentTerms: e.target.value})} className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white focus:border-violet-500 focus:outline-none text-sm"><option value="">בחר</option>{PAYMENT_TERMS.map(pt => <option key={pt} value={pt}>{pt}</option>)}</select></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">מסגרת אשראי ₪</label><input type="number" value={form.creditLimit} onChange={e => setForm({...form, creditLimit: e.target.value})} placeholder="0" dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">מטבע</label><select value={form.currency} onChange={e => setForm({...form, currency: e.target.value})} className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white focus:border-violet-500 focus:outline-none text-sm">{CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">הזמנה מינימלית</label><input value={form.minimumOrder} onChange={e => setForm({...form, minimumOrder: e.target.value})} placeholder="סכום/כמות" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">זמן אספקה (ימים)</label><input type="number" value={form.leadTimeDays} onChange={e => setForm({...form, leadTimeDays: e.target.value})} placeholder="0" dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">אספקה דחופה (ימים)</label><input type="number" value={form.urgentLeadTimeDays} onChange={e => setForm({...form, urgentLeadTimeDays: e.target.value})} placeholder="0" dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">ימי אשראי</label><input type="number" value={form.creditDays} onChange={e => setForm({...form, creditDays: e.target.value})} placeholder="30" dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-violet-400 flex items-center gap-2"><Award className="w-4 h-4" />דירוג, הסמכות וחוזה</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">דירוג (1-5)</label>
                      <div className="flex items-center gap-1 mt-1">
                        {[1, 2, 3, 4, 5].map(i => (
                          <button key={i} type="button" onClick={() => setForm({...form, rating: String(i)})}
                            className="p-0.5">
                            <Star className={`w-6 h-6 transition-colors ${i <= parseInt(form.rating || "0") ? "text-amber-400 fill-amber-400" : "text-muted-foreground hover:text-muted-foreground"}`} />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div><label className="block text-xs text-muted-foreground mb-1">הסמכות / תקנים</label><input value={form.certifications} onChange={e => setForm({...form, certifications: e.target.value})} placeholder="ISO 9001, ISO 14001..." className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">סטטוס</label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white focus:border-violet-500 focus:outline-none text-sm">{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">תחילת חוזה</label><input type="date" value={form.contractStartDate} onChange={e => setForm({...form, contractStartDate: e.target.value})} dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">סיום חוזה</label><input type="date" value={form.contractEndDate} onChange={e => setForm({...form, contractEndDate: e.target.value})} dir="ltr" className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white focus:border-violet-500 focus:outline-none text-sm" /></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-violet-400 flex items-center gap-2"><Briefcase className="w-4 h-4" />פרטים נוספים</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div><label className="block text-xs text-muted-foreground mb-1">תחום פעילות</label><input value={form.activityField} onChange={e => setForm({...form, activityField: e.target.value})} placeholder="מתכת, ברזל..." className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">סוגי חומרים</label><input value={form.materialTypes} onChange={e => setForm({...form, materialTypes: e.target.value})} placeholder="פלדה, אלומיניום..." className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">אזור גיאוגרפי</label><input value={form.geographicArea} onChange={e => setForm({...form, geographicArea: e.target.value})} placeholder="מרכז, צפון..." className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">סוג אספקה</label><input value={form.supplyType} onChange={e => setForm({...form, supplyType: e.target.value})} placeholder="חומרי גלם, שירותים..." className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm" /></div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-muted-foreground mb-1">הערות</label>
                  <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="w-full px-3 py-2 bg-[#12141a] border border-gray-700 rounded-lg text-white focus:border-violet-500 focus:outline-none resize-none text-sm" rows={2} />
                </div>

                {(createMut.error || updateMut.error) && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                    {(createMut.error as Error)?.message || (updateMut.error as Error)?.message}
                  </div>
                )}
                <div className="flex items-center gap-3 pt-2">
                  <button type="submit" disabled={createMut.isPending || updateMut.isPending}
                    className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 text-white rounded-lg font-medium">
                    <Save className="w-4 h-4" />{editingId ? "עדכן" : "שמור"}
                  </button>
                  <button type="button" onClick={closeForm} className="px-4 py-2.5 text-muted-foreground hover:text-white">ביטול</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirm !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
            <div className="bg-[#1a1d23] border border-gray-700 rounded-xl p-6 max-w-sm mx-4" dir="rtl">
              <h3 className="text-lg font-bold text-white mb-2">מחיקת ספק</h3>
              <p className="text-muted-foreground mb-4">האם למחוק את הספק? פעולה זו אינה ניתנת לביטול.</p>
              <div className="flex gap-3">
                <button onClick={() => deleteMut.mutate(deleteConfirm)} className="px-4 py-2 bg-red-600 text-white rounded-lg">מחק</button>
                <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-muted-foreground">ביטול</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SupplierDetailModal({ supplier, tab, setTab, onClose, renderStars, getContractDays }: {
  supplier: Supplier; tab: string; setTab: (t: any) => void; onClose: () => void;
  renderStars: (r: number) => JSX.Element; getContractDays: (d: string | null) => number | null;
}) {
  const qc = useQueryClient();
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContactId, setEditingContactId] = useState<number | null>(null);
  const [contactForm, setContactForm] = useState({ contactName: "", role: "", phone: "", mobile: "", email: "", notes: "" });

  const { data: contactsRaw, refetch: refetchContacts } = useQuery({
    queryKey: ["supplier-contacts", supplier.id],
    queryFn: async () => { const r = await authFetch(`${API}/suppliers/${supplier.id}/contacts`); return r.json(); },
  });
  const contacts: SupplierContact[] = Array.isArray(contactsRaw) ? contactsRaw : (contactsRaw?.data || []);

  const { data: documentsRaw } = useQuery({
    queryKey: ["supplier-documents", supplier.id],
    queryFn: async () => { const r = await authFetch(`${API}/suppliers/${supplier.id}/documents`); return r.json(); },
  });
  const documents: SupplierDocument[] = Array.isArray(documentsRaw) ? documentsRaw : (documentsRaw?.data || []);

  const { data: purchaseHistory = [] } = useQuery({
    queryKey: ["supplier-purchase-history", supplier.id],
    queryFn: async () => {
      const r = await authFetch(`${API}/suppliers/${supplier.id}/purchase-history`);
      return r.json();
    },
    enabled: tab === "history-orders",
  });

  const { data: performanceData } = useQuery({
    queryKey: ["supplier-performance", supplier.id],
    queryFn: async () => {
      const r = await authFetch(`${API}/suppliers/${supplier.id}/performance`);
      return r.json();
    },
    enabled: tab === "performance",
  });

  const addContactMut = useMutation({
    mutationFn: async (data: typeof contactForm) => {
      const r = await authFetch(`${API}/suppliers/${supplier.id}/contacts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["supplier-contacts", supplier.id] }); resetContactForm(); },
  });

  const updateContactMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof contactForm }) => {
      const r = await authFetch(`${API}/supplier-contacts/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["supplier-contacts", supplier.id] }); resetContactForm(); },
  });

  const deleteContactMut = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/supplier-contacts/${id}`, { method: "DELETE" });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["supplier-contacts", supplier.id] }); },
  });

  function resetContactForm() { setShowContactForm(false); setEditingContactId(null); setContactForm({ contactName: "", role: "", phone: "", mobile: "", email: "", notes: "" }); }
  function openEditContact(c: SupplierContact) {
    setContactForm({ contactName: c.contactName, role: c.role || "", phone: c.phone || "", mobile: c.mobile || "", email: c.email || "", notes: c.notes || "" });
    setEditingContactId(c.id); setShowContactForm(true);
  }
  function submitContact(e: React.FormEvent) {
    e.preventDefault();
    if (!contactForm.contactName) return;
    editingContactId ? updateContactMut.mutate({ id: editingContactId, data: contactForm }) : addContactMut.mutate(contactForm);
  }

  const contractDays = getContractDays(supplier.contractEndDate);
  const histPOs: any[] = Array.isArray(purchaseHistory) ? purchaseHistory : [];
  const totalSpend = histPOs.reduce((s, o) => s + parseFloat(o.total_amount || o.totalAmount || "0"), 0);
  const completedPOs = histPOs.filter((o: any) => (o.status || "").includes("התקבל"));
  const openPOs = histPOs.filter((o: any) => !["התקבל במלואו", "בוטל"].includes(o.status || ""));

  const PO_STATUS_COLORS: Record<string, string> = {
    "טיוטה": "bg-muted/20 text-muted-foreground",
    "ממתין לאישור": "bg-amber-500/20 text-amber-400",
    "מאושר": "bg-emerald-500/20 text-emerald-400",
    "נשלח לספק": "bg-blue-500/20 text-blue-400",
    "בהזמנה": "bg-indigo-500/20 text-indigo-400",
    "התקבל חלקית": "bg-purple-500/20 text-purple-400",
    "התקבל במלואו": "bg-teal-500/20 text-teal-400",
    "בוטל": "bg-red-500/20 text-red-400",
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-6 overflow-y-auto" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-[#1a1d23] border border-gray-700 rounded-2xl w-full max-w-5xl mx-4 mb-10" onClick={e => e.stopPropagation()} dir="rtl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              {supplier.supplierName}
              <span className="text-sm font-mono text-violet-400">({supplier.supplierNumber})</span>
            </h2>
            <div className="flex items-center gap-3 mt-1">
              <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${STATUS_COLORS[supplier.status] || ""}`}>{supplier.status}</span>
              <span className="text-muted-foreground text-xs">{supplier.category}</span>
              {renderStars(supplier.rating || 0)}
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex border-b border-gray-700 overflow-x-auto">
          {[
            { key: "info", label: "פרטים", icon: Building2 },
            { key: "contacts", label: `אנשי קשר (${contacts.length})`, icon: Users },
            { key: "performance", label: "ביצועים", icon: TrendingUp },
            { key: "history-orders", label: "היסטוריית הזמנות", icon: ShoppingBag },
            { key: "documents", label: `מסמכים (${documents.length})`, icon: FileText },
            { key: "history", label: "פעילות", icon: Clock },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.key ? "border-violet-500 text-violet-400" : "border-transparent text-muted-foreground hover:text-gray-300"}`}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </div>

        <div className="p-3 sm:p-6">
          {tab === "info" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoCard icon={User} label="איש קשר" value={supplier.contactPerson} />
                <InfoCard icon={Phone} label="טלפון" value={supplier.phone} dir="ltr" />
                <InfoCard icon={Phone} label="נייד" value={supplier.mobile} dir="ltr" />
                <InfoCard icon={Phone} label="פקס" value={supplier.fax} dir="ltr" />
                <InfoCard icon={Mail} label="אימייל" value={supplier.email} dir="ltr" />
                <InfoCard icon={Globe} label="אתר" value={supplier.website} dir="ltr" link />
                <InfoCard icon={MapPin} label="כתובת" value={[supplier.address, supplier.city, supplier.country].filter(Boolean).join(", ")} />
                <InfoCard icon={Briefcase} label="תחום פעילות" value={supplier.activityField} />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoCard icon={Hash} label="ח.פ / ת.ז" value={supplier.taxId} dir="ltr" />
                <InfoCard icon={Hash} label="עוסק מורשה" value={supplier.vatNumber} dir="ltr" />
                <InfoCard icon={Landmark} label="בנק" value={supplier.bankName ? `${supplier.bankName} סניף ${supplier.bankBranch || "—"}` : null} />
                <InfoCard icon={CreditCard} label="חשבון בנק" value={supplier.bankAccountNumber} dir="ltr" />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoCard icon={CreditCard} label="תנאי תשלום" value={supplier.paymentTerms} />
                <InfoCard icon={CreditCard} label="מסגרת אשראי" value={supplier.creditLimit ? `₪${parseFloat(supplier.creditLimit).toLocaleString()}` : null} />
                <InfoCard icon={Clock} label="זמן אספקה" value={supplier.leadTimeDays ? `${supplier.leadTimeDays} ימים` : null} />
                <InfoCard icon={AlertTriangle} label="אספקה דחופה" value={supplier.urgentLeadTimeDays ? `${supplier.urgentLeadTimeDays} ימים` : null} />
              </div>

              {(supplier.contractStartDate || supplier.contractEndDate || supplier.certifications) && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <InfoCard icon={Calendar} label="תחילת חוזה" value={supplier.contractStartDate ? new Date(supplier.contractStartDate).toLocaleDateString("he-IL") : null} />
                  <div className="bg-[#12141a] rounded-xl p-4">
                    <p className="text-muted-foreground text-xs flex items-center gap-1 mb-1"><Calendar className="w-3 h-3" />סיום חוזה</p>
                    <p className={`text-sm font-medium mt-1 ${contractDays !== null && contractDays <= 30 ? (contractDays < 0 ? "text-red-400" : "text-amber-400") : "text-white"}`}>
                      {supplier.contractEndDate ? new Date(supplier.contractEndDate).toLocaleDateString("he-IL") : "—"}
                    </p>
                    {contractDays !== null && (
                      <p className={`text-xs mt-0.5 ${contractDays < 0 ? "text-red-400" : contractDays <= 30 ? "text-amber-400" : "text-muted-foreground"}`}>
                        {contractDays < 0 ? `פג תוקף לפני ${Math.abs(contractDays)} ימים` : contractDays === 0 ? "פג היום" : `עוד ${contractDays} ימים`}
                      </p>
                    )}
                  </div>
                  <InfoCard icon={Award} label="הסמכות" value={supplier.certifications} />
                </div>
              )}

              {supplier.notes && (
                <div className="bg-[#12141a] rounded-xl p-4">
                  <p className="text-muted-foreground text-xs mb-1">הערות</p>
                  <p className="text-gray-300 text-sm whitespace-pre-line">{supplier.notes}</p>
                </div>
              )}
            </div>
          )}

          {tab === "contacts" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-violet-400">אנשי קשר</h4>
                {!showContactForm && (
                  <button onClick={() => { resetContactForm(); setShowContactForm(true); }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-medium transition-colors">
                    <Plus className="w-3.5 h-3.5" />הוסף איש קשר
                  </button>
                )}
              </div>
              {contacts.length === 0 && !showContactForm ? (
                <p className="text-muted-foreground text-center py-8">אין אנשי קשר נוספים</p>
              ) : (
                contacts.map(c => (
                  <div key={c.id} className="bg-[#12141a] rounded-xl p-4 flex items-start justify-between">
                    <div>
                      <p className="text-white font-medium">{c.contactName}</p>
                      <p className="text-muted-foreground text-xs mt-0.5">{c.role || "—"}</p>
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        {c.phone && <span className="text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                        {c.mobile && <span className="text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{c.mobile}</span>}
                        {c.email && <span className="text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditContact(c)} className="p-1.5 text-muted-foreground hover:text-amber-400 rounded-md"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteContactMut.mutate(c.id)} className="p-1.5 text-muted-foreground hover:text-red-400 rounded-md"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))
              )}

              {showContactForm && (
                <div className="bg-[#12141a] rounded-xl p-4 border border-violet-500/30">
                  <h4 className="text-sm font-semibold text-violet-400 mb-3">{editingContactId ? "עריכת איש קשר" : "הוספת איש קשר"}</h4>
                  <form onSubmit={submitContact} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-xs text-muted-foreground mb-1">שם מלא *</label>
                      <input value={contactForm.contactName} onChange={e => setContactForm({...contactForm, contactName: e.target.value})} placeholder="שם איש קשר" className="w-full px-3 py-2 bg-[#1a1d23] border border-gray-700 rounded-lg text-white text-sm focus:border-violet-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">תפקיד</label>
                      <input value={contactForm.role} onChange={e => setContactForm({...contactForm, role: e.target.value})} placeholder="מנהל רכש" className="w-full px-3 py-2 bg-[#1a1d23] border border-gray-700 rounded-lg text-white text-sm focus:border-violet-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">טלפון</label>
                      <input value={contactForm.phone} onChange={e => setContactForm({...contactForm, phone: e.target.value})} placeholder="03-1234567" dir="ltr" className="w-full px-3 py-2 bg-[#1a1d23] border border-gray-700 rounded-lg text-white text-sm focus:border-violet-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">נייד</label>
                      <input value={contactForm.mobile} onChange={e => setContactForm({...contactForm, mobile: e.target.value})} placeholder="050-1234567" dir="ltr" className="w-full px-3 py-2 bg-[#1a1d23] border border-gray-700 rounded-lg text-white text-sm focus:border-violet-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">אימייל</label>
                      <input type="email" value={contactForm.email} onChange={e => setContactForm({...contactForm, email: e.target.value})} placeholder="name@co.il" dir="ltr" className="w-full px-3 py-2 bg-[#1a1d23] border border-gray-700 rounded-lg text-white text-sm focus:border-violet-500 focus:outline-none" />
                    </div>
                    <div className="col-span-2 sm:col-span-3 flex items-center gap-3 mt-1">
                      <button type="submit" disabled={addContactMut.isPending || updateContactMut.isPending}
                        className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium">
                        <Save className="w-4 h-4" />{editingContactId ? "עדכן" : "הוסף"}
                      </button>
                      <button type="button" onClick={resetContactForm} className="px-3 py-2 text-muted-foreground hover:text-white text-sm">ביטול</button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

          {tab === "performance" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "דירוג כולל", value: supplier.rating ? `${supplier.rating}/5` : "—", icon: Star, color: "text-amber-400", bg: "bg-amber-500/10" },
                  { label: "דירוג איכות", value: supplier.qualityRating ? `${parseFloat(supplier.qualityRating).toFixed(1)}/5` : "—", icon: Award, color: "text-emerald-400", bg: "bg-emerald-500/10" },
                  { label: "דירוג אספקה", value: supplier.deliveryRating ? `${parseFloat(supplier.deliveryRating).toFixed(1)}/5` : "—", icon: Truck, color: "text-blue-400", bg: "bg-blue-500/10" },
                  { label: "אספקה בזמן", value: supplier.onTimeDeliveryPct ? `${parseFloat(supplier.onTimeDeliveryPct).toFixed(0)}%` : "—", icon: CheckCircle2, color: "text-teal-400", bg: "bg-teal-500/10" },
                ].map(s => (
                  <div key={s.label} className={`${s.bg} border border-gray-700 rounded-xl p-4`}>
                    <div className="flex items-center gap-2 mb-2">
                      <s.icon className={`w-4 h-4 ${s.color}`} />
                      <p className="text-muted-foreground text-xs">{s.label}</p>
                    </div>
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {performanceData?.orderStats && (
                <div className="bg-[#12141a] rounded-xl p-5">
                  <h4 className="text-sm font-semibold text-violet-400 mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />סטטיסטיקת הזמנות
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: "סה״כ הזמנות", value: performanceData.orderStats.total_orders || "0" },
                      { label: "סה״כ רכישות", value: `₪${Math.round(parseFloat(performanceData.orderStats.total_spend || "0")).toLocaleString()}` },
                      { label: "ממוצע הזמנה", value: `₪${Math.round(parseFloat(performanceData.orderStats.avg_order_value || "0")).toLocaleString()}` },
                      { label: "הזמנות בוצעו", value: performanceData.orderStats.delivered_orders || "0" },
                    ].map(s => (
                      <div key={s.label}>
                        <p className="text-muted-foreground text-xs">{s.label}</p>
                        <p className="text-white font-bold text-lg mt-1">{s.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {supplier.rating && (
                <div className="bg-[#12141a] rounded-xl p-5">
                  <h4 className="text-sm font-semibold text-violet-400 mb-4 flex items-center gap-2">
                    <Star className="w-4 h-4" />פרופיל ביצועים
                  </h4>
                  <div className="space-y-3">
                    {[
                      { label: "דירוג כולל", value: supplier.rating || 0, max: 5, color: "bg-amber-500" },
                      { label: "איכות", value: parseFloat(supplier.qualityRating || "0"), max: 5, color: "bg-emerald-500" },
                      { label: "אספקה", value: parseFloat(supplier.deliveryRating || "0"), max: 5, color: "bg-blue-500" },
                      { label: "מחיר", value: parseFloat(supplier.priceRating || "0"), max: 5, color: "bg-purple-500" },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-4">
                        <p className="text-muted-foreground text-xs w-20">{item.label}</p>
                        <div className="flex-1 bg-[#1a1d23] rounded-full h-2">
                          <div className={`${item.color} h-2 rounded-full`} style={{ width: `${(item.value / item.max) * 100}%` }} />
                        </div>
                        <p className="text-white text-xs w-8 text-left">{item.value > 0 ? item.value.toFixed(1) : "—"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!performanceData && (
                <div className="text-center py-8">
                  <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
                  <p className="text-muted-foreground">טוען נתוני ביצועים...</p>
                </div>
              )}
            </div>
          )}

          {tab === "history-orders" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
                  <p className="text-blue-400 text-xl font-bold">{histPOs.length}</p>
                  <p className="text-muted-foreground text-xs">סה״כ הזמנות</p>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                  <p className="text-emerald-400 text-xl font-bold">{completedPOs.length}</p>
                  <p className="text-muted-foreground text-xs">הושלמו</p>
                </div>
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 text-center">
                  <p className="text-purple-400 text-xl font-bold">₪{Math.round(totalSpend).toLocaleString()}</p>
                  <p className="text-muted-foreground text-xs">סה״כ רכישות</p>
                </div>
              </div>

              {histPOs.length === 0 ? (
                <div className="text-center py-10">
                  <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
                  <p className="text-muted-foreground">אין היסטוריית הזמנות לספק זה</p>
                </div>
              ) : (
                <div className="bg-[#12141a] rounded-xl overflow-hidden">
                  <table className="w-full text-right text-sm">
                    <thead><tr className="border-b border-gray-700 bg-[#0f1115]">
                      <th className="px-4 py-2.5 text-muted-foreground font-medium text-xs">מספר הזמנה</th>
                      <th className="px-4 py-2.5 text-muted-foreground font-medium text-xs">תאריך</th>
                      <th className="px-4 py-2.5 text-muted-foreground font-medium text-xs">סכום</th>
                      <th className="px-4 py-2.5 text-muted-foreground font-medium text-xs">אספקה משוערת</th>
                      <th className="px-4 py-2.5 text-muted-foreground font-medium text-xs">סטטוס</th>
                    </tr></thead>
                    <tbody>
                      {histPOs.map((o: any) => (
                        <tr key={o.id} className="border-b border-gray-800/50 hover:bg-[#1a1d23] transition-colors">
                          <td className="px-4 py-2.5 text-violet-400 font-mono text-xs">{o.order_number || o.orderNumber}</td>
                          <td className="px-4 py-2.5 text-muted-foreground text-xs">
                            {(o.created_at || o.createdAt) ? new Date(o.created_at || o.createdAt).toLocaleDateString("he-IL") : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-emerald-400 font-medium">₪{Math.round(parseFloat(o.total_amount || o.totalAmount || "0")).toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-muted-foreground text-xs">
                            {(o.expected_delivery || o.expectedDelivery) ? new Date(o.expected_delivery || o.expectedDelivery).toLocaleDateString("he-IL") : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${PO_STATUS_COLORS[o.status] || "bg-muted/20 text-muted-foreground"}`}>
                              {o.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === "documents" && (
            <div className="space-y-3">
              {documents.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">אין מסמכים</p>
              ) : (
                documents.map(d => (
                  <div key={d.id} className="bg-[#12141a] rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium flex items-center gap-2">
                        <FileText className="w-4 h-4 text-violet-400" />
                        {d.documentName}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{d.documentType}</span>
                        {d.expiryDate && (
                          <span className={new Date(d.expiryDate) < new Date() ? "text-red-400" : ""}>
                            תוקף: {new Date(d.expiryDate).toLocaleDateString("he-IL")}
                          </span>
                        )}
                      </div>
                    </div>
                    {d.fileUrl && (
                      <a href={d.fileUrl} target="_blank" rel="noopener noreferrer"
                        className="text-violet-400 hover:text-violet-300 text-sm flex items-center gap-1">
                        <ExternalLink className="w-4 h-4" />פתח
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "history" && (
            <ActivityLog entityType="suppliers" entityId={supplier.id} />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function InfoCard({ icon: Icon, label, value, dir, link }: { icon: any; label: string; value: string | null | undefined; dir?: string; link?: boolean }) {
  return (
    <div className="bg-[#12141a] rounded-xl p-4">
      <p className="text-muted-foreground text-xs flex items-center gap-1 mb-1"><Icon className="w-3 h-3" />{label}</p>
      {link && value ? (
        <a href={value.startsWith("http") ? value : `https://${value}`} target="_blank" rel="noopener noreferrer"
          className="text-violet-400 hover:text-violet-300 text-sm font-medium mt-1 flex items-center gap-1">
          {value} <ExternalLink className="w-3 h-3" />
        </a>
      ) : (
        <p className={`text-sm font-medium mt-1 text-white ${dir === "ltr" ? "" : ""}`} dir={dir}>{value || "—"}</p>
      )}
    </div>
  );
}
