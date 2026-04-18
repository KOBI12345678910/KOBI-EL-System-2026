import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { useSearch } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Building2, User, Search, Plus, Edit, Trash2, Download, TrendingUp, DollarSign, Users, Star, Loader2, Eye, CreditCard, MapPin, Phone, Mail, Globe, FileText, UserCheck, Shield, Banknote, ChevronDown, ChevronUp, X, Clock, Award, BarChart3, Activity, AlertTriangle, CheckCircle, RefreshCw, MessageSquare, Copy, BellPlus } from "lucide-react";
import { EmptyState } from "@/components/ui/unified-states";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { useApiAction, ActionButton } from "@/hooks/use-api-action";
import ExportDropdown from "@/components/export-dropdown";
import ImportButton from "@/components/import-button";
import { exportToCSV, exportToExcel, exportToPDF } from "@/lib/export-utils";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import ActivityLog from "@/components/activity-log";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import RelatedRecords from "@/components/related-records";
import CommunicationTimeline from "@/components/communication-timeline";
import WhatsAppConversation from "@/components/whatsapp-conversation";

const API = "/api";
const getHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}` });
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

const TYPE_MAP: Record<string, { label: string; color: string }> = {
  company: { label: "חברה", color: "bg-blue-500/20 text-blue-400" },
  individual: { label: "פרטי", color: "bg-green-500/20 text-green-400" },
};
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  inactive: { label: "לא פעיל", color: "bg-muted/20 text-muted-foreground" },
  blocked: { label: "חסום", color: "bg-red-500/20 text-red-400" },
};
const TIER_MAP: Record<string, { label: string; color: string; icon: any }> = {
  VIP: { label: "VIP", color: "bg-purple-500/20 text-purple-300 border border-purple-500/30", icon: Award },
  Gold: { label: "זהב", color: "bg-amber-500/20 text-amber-300 border border-amber-500/30", icon: Star },
  Silver: { label: "כסף", color: "bg-slate-400/20 text-slate-300 border border-slate-400/30", icon: Star },
  Bronze: { label: "ברונזה", color: "bg-amber-900/20 text-amber-700 border border-amber-800/30", icon: Star },
};
const CATEGORY_MAP: Record<string, string> = { "רגיל": "רגיל", "VIP": "VIP", "קבלן": "קבלן", "סיטונאי": "סיטונאי", "ממשלתי": "ממשלתי", "קמעונאי": "קמעונאי" };
const INDUSTRY_LIST = ["בנייה", "תעשייה", "נדל\"ן", "היי-טק", "מסחר", "ממשלה", "חינוך", "בריאות", "חקלאות", "תחבורה", "אחר"];
const EVENT_TYPE_MAP: Record<string, { label: string; color: string; icon: any }> = {
  order: { label: "הזמנה", color: "bg-blue-500/20 text-blue-400", icon: FileText },
  invoice: { label: "חשבונית", color: "bg-green-500/20 text-green-400", icon: Banknote },
  payment: { label: "תשלום", color: "bg-emerald-500/20 text-emerald-400", icon: CreditCard },
  complaint: { label: "תלונה", color: "bg-red-500/20 text-red-400", icon: AlertTriangle },
  note: { label: "הערה", color: "bg-muted/30 text-muted-foreground", icon: MessageSquare },
  call: { label: "שיחה", color: "bg-purple-500/20 text-purple-400", icon: Phone },
};

function FormField({ label, children, span2 }: { label: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <div className={span2 ? "col-span-1 sm:col-span-2" : ""}>
      <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
      {children}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg whitespace-nowrap transition-colors ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
    >
      <Icon className="w-4 h-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function TierBadge({ tier }: { tier?: string }) {
  if (!tier) return null;
  const t = TIER_MAP[tier];
  if (!t) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${t.color}`}>
      <t.icon className="w-3 h-3" />
      {t.label}
    </span>
  );
}

function Timeline({ customerId }: { customerId: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    authFetch(`${API}/crm/customer360/timeline/${customerId}`, { headers: getHeaders() })
      .then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [customerId]);

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (!data) return <div className="text-center text-muted-foreground p-4">שגיאה בטעינה</div>;

  const events = data.timeline || [];
  if (!events.length) return <div className="text-center text-muted-foreground p-8">אין אירועים להצגה</div>;

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
      {events.map((ev: any, i: number) => {
        const et = EVENT_TYPE_MAP[ev.event_type] || { label: ev.event_type, color: "bg-muted/20 text-muted-foreground", icon: Activity };
        const evDate = ev.event_date ? new Date(ev.event_date).toLocaleDateString("he-IL") : "";
        return (
          <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/20 transition-colors">
            <div className={`mt-0.5 p-1.5 rounded-lg ${et.color}`}><et.icon className="w-3.5 h-3.5" /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{ev.title}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{evDate}</span>
              </div>
              {ev.description && <div className="text-xs text-muted-foreground">{ev.description}</div>}
              {ev.amount && <div className="text-xs text-green-400">{fmtC(Number(ev.amount))}</div>}
            </div>
            <span className={`text-xs px-1.5 py-0.5 rounded ${et.color}`}>{et.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Profitability({ customerId }: { customerId: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    authFetch(`${API}/crm/customer360/profitability/${customerId}`, { headers: getHeaders() })
      .then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [customerId]);

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (!data?.profitability) return <div className="text-center text-muted-foreground p-4">אין נתוני רווחיות</div>;

  const p = data.profitability;
  const kpis = [
    { label: "הכנסה כוללת", value: fmtC(p.revenue), color: "text-green-400" },
    { label: "עלות סחורה (הערכה)", value: fmtC(p.cogs), color: "text-red-400" },
    { label: "רווח גולמי", value: fmtC(p.gross_margin), color: "text-emerald-400" },
    { label: "מרווח גולמי", value: `${p.gross_margin_pct?.toFixed(1)}%`, color: "text-cyan-400" },
    { label: "שווי חיים (LTV)", value: fmtC(p.lifetime_value), color: "text-purple-400" },
    { label: "מספר הזמנות", value: fmt(p.order_count), color: "text-blue-400" },
    { label: "ממוצע להזמנה", value: fmtC(p.avg_order_value), color: "text-amber-400" },
    { label: "יתרה פתוחה", value: fmtC(p.outstanding), color: "text-orange-400" },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {kpis.map((k, i) => (
          <div key={i} className="bg-muted/20 rounded-lg p-3 text-center">
            <div className={`text-base font-bold ${k.color}`}>{k.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground">
        <span>לקוח מאז: {p.first_order ? new Date(p.first_order).toLocaleDateString("he-IL") : "לא ידוע"}</span>
        {p.last_order && <span className="mr-3">הזמנה אחרונה: {new Date(p.last_order).toLocaleDateString("he-IL")}</span>}
        {p.customer_since_days > 0 && <span className="mr-3">סה"כ {p.customer_since_days} ימים</span>}
      </div>
    </div>
  );
}

export default function CustomerManagement() {
  const { toast } = useToast();
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterTier, setFilterTier] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formTab, setFormTab] = useState("basic");
  const [tableLoading, setTableLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const [rfmCalculating, setRfmCalculating] = useState(false);
  const [followUpCustomer, setFollowUpCustomer] = useState<any>(null);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpSuccess, setFollowUpSuccess] = useState(false);
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const { executeSave, executeDelete, loading } = useApiAction();
  const searchStr = useSearch();
  const deepLinkHandledId = useRef<string | null>(null);

  const load = () => {
    setTableLoading(true);
    setLoadError(false);
    const LOAD_TIMEOUT_MS = 15_000;
    let settled = false;
    const timeoutHandle = setTimeout(() => {
      if (!settled) {
        settled = true;
        setTableLoading(false);
        setLoadError(true);
        console.error("[CustomerManagement] load() timed out after", LOAD_TIMEOUT_MS, "ms");
      }
    }, LOAD_TIMEOUT_MS);
    Promise.all([
      authFetch(`${API}/sales/customers`, { headers: getHeaders() })
        .then(r => r.json())
        .then(d => setItems(Array.isArray(d) ? d : []))
        .catch(err => { console.error("[CustomerManagement] customers fetch failed:", err); setItems([]); throw err; }),
      authFetch(`${API}/sales/customers/stats`, { headers: getHeaders() })
        .then(r => r.json())
        .then(d => setStats(d || {}))
        .catch(err => { console.error("[CustomerManagement] stats fetch failed:", err); }),
    ]).then(() => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutHandle);
        setTableLoading(false);
      }
    }).catch(() => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutHandle);
        setTableLoading(false);
        setLoadError(true);
      }
    });
  };
  useEffect(load, []);

  useEffect(() => {
    if (!searchStr || items.length === 0) return;
    const params = new URLSearchParams(searchStr);
    const idParam = params.get("id");
    if (!idParam || deepLinkHandledId.current === idParam) return;
    const target = items.find(r => String(r.id) === idParam);
    if (target) {
      deepLinkHandledId.current = idParam;
      setShowDetail(target);
      setDetailTab("details");
    }
  }, [items, searchStr]);

  const filtered = useMemo(() => {
    return items.filter(r => {
      const s = `${r.name} ${r.email} ${r.phone} ${r.customer_number} ${r.city || ""} ${r.contact_person || ""} ${r.tax_id || ""}`.toLowerCase();
      if (search && !s.includes(search.toLowerCase())) return false;
      if (filterType && r.customer_type !== filterType) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterTier && r.rfm_tier !== filterTier) return false;
      return true;
    });
  }, [items, search, filterType, filterStatus, filterTier]);

  const paginatedRows = pagination.paginate(filtered);

  const openCreate = () => {
    setEditing(null);
    setForm({ customerType: "company", status: "active", paymentTerms: "שוטף 30", creditLimit: 0, creditTermsDays: 30, currency: "ILS", country: "ישראל", category: "רגיל", languagePref: "he", communicationPref: "phone" });
    setFormErrors({});
    setFormTab("basic");
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      name: r.name, customerType: r.customer_type, email: r.email, phone: r.phone,
      mobile: r.mobile, fax: r.fax, website: r.website,
      address: r.address, city: r.city, country: r.country || "ישראל", postalCode: r.postal_code,
      billingAddress: r.billing_address, shippingAddress: r.shipping_address,
      creditLimit: r.credit_limit, paymentTerms: r.payment_terms, creditTermsDays: r.credit_terms_days || 30,
      currency: r.currency || "ILS", discountPercent: r.discount_percent,
      assignedRep: r.assigned_rep, salespersonId: r.salesperson_id,
      status: r.status, tags: r.tags, contactPerson: r.contact_person, taxId: r.tax_id, notes: r.notes,
      industry: r.industry, category: r.category || "רגיל", source: r.source, region: r.region,
      vatExempt: r.vat_exempt, withholdingTaxRate: r.withholding_tax_rate,
      bankName: r.bank_name, bankBranch: r.bank_branch, bankAccount: r.bank_account,
      secondaryContact: r.secondary_contact, secondaryPhone: r.secondary_phone, secondaryEmail: r.secondary_email,
      paymentMethod: r.payment_method, priceListId: r.price_list_id,
      languagePref: r.language_pref || "he", communicationPref: r.communication_pref || "phone",
      internalNotes: r.internal_notes, preferredDelivery: r.preferred_delivery,
      companySize: r.company_size, acquisitionSource: r.acquisition_source,
      customerSince: r.customer_since,
    });
    setFormErrors({});
    setFormTab("basic");
    setShowForm(true);
  };

  const buildCustomerPayload = (f: any) => ({
    name: f.name,
    customer_type: f.customerType,
    email: f.email,
    phone: f.phone,
    mobile: f.mobile,
    fax: f.fax,
    website: f.website,
    address: f.address,
    city: f.city,
    country: f.country,
    postal_code: f.postalCode,
    billing_address: f.billingAddress,
    shipping_address: f.shippingAddress,
    credit_limit: f.creditLimit,
    payment_terms: f.paymentTerms,
    credit_terms_days: f.creditTermsDays,
    currency: f.currency,
    discount_percent: f.discountPercent,
    assigned_rep: f.assignedRep,
    salesperson_id: f.salespersonId,
    status: f.status,
    tags: f.tags,
    contact_person: f.contactPerson,
    tax_id: f.taxId,
    notes: f.notes,
    industry: f.industry,
    category: f.category,
    source: f.source,
    region: f.region,
    vat_exempt: f.vatExempt,
    withholding_tax_rate: f.withholdingTaxRate,
    bank_name: f.bankName,
    bank_branch: f.bankBranch,
    bank_account: f.bankAccount,
    secondary_contact: f.secondaryContact,
    secondary_phone: f.secondaryPhone,
    secondary_email: f.secondaryEmail,
    payment_method: f.paymentMethod,
    price_list_id: f.priceListId,
    language_pref: f.languagePref,
    communication_pref: f.communicationPref,
    internal_notes: f.internalNotes,
    preferred_delivery: f.preferredDelivery,
    company_size: f.companySize,
    acquisition_source: f.acquisitionSource,
    customer_since: f.customerSince,
  });

  const save = async () => {
    const errors: Record<string, string> = {};
    if (!form.name || !form.name.trim()) {
      errors.name = "שדה חובה — יש להזין שם לקוח";
    }
    if (!form.phone?.trim() && !form.email?.trim()) {
      errors.phone = "יש להזין טלפון או אימייל";
      errors.email = "יש להזין טלפון או אימייל";
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      if (errors.phone || errors.email) {
        setFormTab("contact");
      } else if (errors.name) {
        setFormTab("basic");
      }
      return;
    }
    setFormErrors({});

    const url = editing ? `${API}/sales/customers/${editing.id}` : `${API}/sales/customers`;
    const method = editing ? "PUT" : "POST";
    const payload = buildCustomerPayload(form);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    await executeSave(
      () => authFetch(url, { method, headers: getHeaders(), body: JSON.stringify(payload), signal: controller.signal }).finally(() => clearTimeout(timeoutId)),
      !!editing,
      { successMessage: editing ? "לקוח עודכן בהצלחה" : "לקוח נוצר בהצלחה", onSuccess: () => { setShowForm(false); load(); } }
    );
  };

  const remove = async (id: number) => {
    await executeDelete(
      () => authFetch(`${API}/sales/customers/${id}`, { method: "DELETE", headers: getHeaders() }),
      { confirm: "למחוק לקוח?", successMessage: "לקוח נמחק בהצלחה", onSuccess: load }
    );
  };

  const openFollowUp = (customer: any) => {
    setFollowUpCustomer(customer);
    setFollowUpDate(new Date(Date.now() + 86400000).toISOString().split("T")[0]);
    setFollowUpNote("");
    setFollowUpSuccess(false);
  };

  const saveFollowUp = async () => {
    if (!followUpCustomer) return;
    setFollowUpLoading(true);
    try {
      const res = await authFetch(`${API}/sales/customers/${followUpCustomer.id}/follow-up`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ followUpDate, note: followUpNote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "שגיאה");
      setFollowUpSuccess(true);
      toast({ title: "מעקב נשמר בהצלחה", description: `נוצר מעקב ללקוח ${followUpCustomer.name}` });
      setTimeout(() => { setFollowUpCustomer(null); setFollowUpSuccess(false); }, 1500);
    } catch (e: any) {
      toast({ title: "שגיאה בשמירת מעקב", description: e.message, variant: "destructive" });
    } finally {
      setFollowUpLoading(false);
    }
  };

  const calculateRFM = async () => {
    setRfmCalculating(true);
    try {
      const r = await authFetch(`${API}/crm/rfm/calculate`, { method: "POST", headers: getHeaders() });
      const d = await r.json();
      if (d.success) { load(); }
    } catch (e) {}
    setRfmCalculating(false);
  };

  const handleExport = (type: string) => {
    const exportHeaders: Record<string, string> = {
      customer_number: "מספר לקוח",
      name: "שם",
      customer_type: "סוג",
      phone: "טלפון",
      mobile: "נייד",
      email: "אימייל",
      contact_person: "איש קשר",
      tax_id: "ח.פ / ת.ז",
      city: "עיר",
      address: "כתובת",
      industry: "ענף",
      category: "קטגוריה",
      rfm_tier: "רמת RFM",
      credit_limit: "מסגרת אשראי",
      payment_terms: "תנאי תשלום",
      discount_percent: "הנחה %",
      status: "סטטוס",
      total_revenue: "הכנסה כוללת",
      outstanding_balance: "יתרה פתוחה",
    };
    const exportData = filtered.map(r => ({
      customer_number: r.customer_number,
      name: r.name,
      customer_type: TYPE_MAP[r.customer_type]?.label || r.customer_type,
      phone: r.phone || "",
      mobile: r.mobile || "",
      email: r.email || "",
      contact_person: r.contact_person || "",
      tax_id: r.tax_id || "",
      city: r.city || "",
      address: r.address || "",
      industry: r.industry || "",
      category: r.category || "",
      rfm_tier: r.rfm_tier || "Bronze",
      credit_limit: r.credit_limit || 0,
      payment_terms: r.payment_terms || "",
      discount_percent: r.discount_percent || 0,
      status: STATUS_MAP[r.status]?.label || r.status,
      total_revenue: r.total_revenue || 0,
      outstanding_balance: r.outstanding_balance || 0,
    }));
    if (type === "csv") exportToCSV(exportData, exportHeaders, "customers");
    else if (type === "excel") exportToExcel(exportData, exportHeaders, "לקוחות");
    else if (type === "pdf") exportToPDF(exportData, exportHeaders, "customers");
  };

  const kpis = [
    { label: "סה\"כ לקוחות", value: fmt(stats.total || 0), icon: Users, color: "text-blue-400" },
    { label: "לקוחות פעילים", value: fmt(stats.active_count || 0), icon: User, color: "text-green-400" },
    { label: "חברות", value: fmt(stats.companies || 0), icon: Building2, color: "text-purple-400" },
    { label: "חדשים החודש", value: fmt(stats.new_this_month || 0), icon: Star, color: "text-amber-400" },
    { label: "הכנסה כוללת", value: fmtC(stats.total_revenue || 0), icon: DollarSign, color: "text-emerald-400" },
    { label: "ממוצע מסגרת", value: fmtC(stats.avg_credit_limit || 0), icon: TrendingUp, color: "text-cyan-400" },
  ];

  const inp = "input input-bordered w-full input-sm text-sm";
  const inpErr = "input input-bordered w-full input-sm text-sm border-red-500 focus:border-red-500";
  const sel = "select select-bordered w-full select-sm text-sm";
  const F = (field: string, val?: any) => (e: any) => {
    const value = val !== undefined ? val : e.target.value;
    setForm({ ...form, [field]: value });
    setFormErrors(prev => {
      if (!prev[field] && !(field === "phone" && prev.email) && !(field === "email" && prev.phone)) return prev;
      const n = { ...prev };
      delete n[field];
      if ((field === "phone" || field === "email") && value && value.trim()) {
        delete n.phone;
        delete n.email;
      }
      return n;
    });
  };

  const renderFormTab = () => {
    switch (formTab) {
      case "basic":
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="שם לקוח *">
              <input className={formErrors.name ? inpErr : inp} value={form.name || ""} onChange={F("name")} />
              {formErrors.name && <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>}
            </FormField>
            <FormField label="סוג">
              <select className={sel} value={form.customerType || "company"} onChange={F("customerType")}>
                <option value="company">חברה</option><option value="individual">פרטי</option>
              </select>
            </FormField>
            <FormField label="ח.פ / ת.ז"><input className={inp} value={form.taxId || ""} onChange={F("taxId")} /></FormField>
            <FormField label="טלפון">
              <input className={formErrors.phone ? inpErr : inp} value={form.phone || ""} onChange={F("phone")} dir="ltr" />
              {formErrors.phone && <p className="text-xs text-red-500 mt-1">{formErrors.phone}</p>}
            </FormField>
            <FormField label="אימייל">
              <input type="email" className={formErrors.email ? inpErr : inp} value={form.email || ""} onChange={F("email")} dir="ltr" />
              {formErrors.email && <p className="text-xs text-red-500 mt-1">{formErrors.email}</p>}
            </FormField>
            <FormField label="כתובת" span2><input className={inp} value={form.address || ""} onChange={F("address")} /></FormField>
            <FormField label="עיר"><input className={inp} value={form.city || ""} onChange={F("city")} /></FormField>
            <FormField label="ענף">
              <select className={sel} value={form.industry || ""} onChange={F("industry")}>
                <option value="">בחר ענף</option>
                {INDUSTRY_LIST.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </FormField>
            <FormField label="קטגוריה">
              <select className={sel} value={form.category || "רגיל"} onChange={F("category")}>
                {Object.entries(CATEGORY_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </FormField>
            <FormField label="סטטוס">
              <select className={sel} value={form.status || "active"} onChange={F("status")}>
                <option value="active">פעיל</option><option value="inactive">לא פעיל</option><option value="blocked">חסום</option>
              </select>
            </FormField>
            <FormField label="מקור"><input className={inp} value={form.source || ""} onChange={F("source")} placeholder="המלצה, אתר, פרסום..." /></FormField>
            <FormField label="גודל חברה">
              <select className={sel} value={form.companySize || ""} onChange={F("companySize")}>
                <option value="">בחר גודל</option><option value="1-10">1-10 עובדים</option><option value="11-50">11-50 עובדים</option><option value="51-200">51-200 עובדים</option><option value="200+">200+ עובדים</option>
              </select>
            </FormField>
            <FormField label="לקוח מתאריך"><input type="date" className={inp} value={form.customerSince || ""} onChange={F("customerSince")} /></FormField>
            <FormField label="תגיות"><input className={inp} value={form.tags || ""} onChange={F("tags")} placeholder="VIP, עדיפות גבוהה..." /></FormField>
            <FormField label="הערות" span2><textarea className="textarea textarea-bordered w-full text-sm" rows={2} value={form.notes || ""} onChange={F("notes")} /></FormField>
          </div>
        );
      case "contact":
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="איש קשר ראשי"><input className={inp} value={form.contactPerson || ""} onChange={F("contactPerson")} /></FormField>
            <FormField label="טלפון">
              <input className={formErrors.phone ? inpErr : inp} value={form.phone || ""} onChange={F("phone")} dir="ltr" />
              {formErrors.phone && <p className="text-xs text-red-500 mt-1">{formErrors.phone}</p>}
            </FormField>
            <FormField label="נייד"><input className={inp} value={form.mobile || ""} onChange={F("mobile")} dir="ltr" /></FormField>
            <FormField label="פקס"><input className={inp} value={form.fax || ""} onChange={F("fax")} dir="ltr" /></FormField>
            <FormField label="אימייל">
              <input type="email" className={formErrors.email ? inpErr : inp} value={form.email || ""} onChange={F("email")} dir="ltr" />
              {formErrors.email && <p className="text-xs text-red-500 mt-1">{formErrors.email}</p>}
            </FormField>
            <FormField label="אתר"><input className={inp} value={form.website || ""} onChange={F("website")} dir="ltr" placeholder="www.example.com" /></FormField>
            <div className="col-span-1 sm:col-span-2 border-t pt-3 mt-1"><p className="text-xs font-semibold text-muted-foreground mb-2">איש קשר משני</p></div>
            <FormField label="שם"><input className={inp} value={form.secondaryContact || ""} onChange={F("secondaryContact")} /></FormField>
            <FormField label="טלפון"><input className={inp} value={form.secondaryPhone || ""} onChange={F("secondaryPhone")} dir="ltr" /></FormField>
            <FormField label="אימייל"><input type="email" className={inp} value={form.secondaryEmail || ""} onChange={F("secondaryEmail")} dir="ltr" /></FormField>
            <FormField label="שפה מועדפת">
              <select className={sel} value={form.languagePref || "he"} onChange={F("languagePref")}>
                <option value="he">עברית</option><option value="en">אנגלית</option><option value="ar">ערבית</option><option value="ru">רוסית</option>
              </select>
            </FormField>
            <FormField label="ערוץ תקשורת מועדף">
              <select className={sel} value={form.communicationPref || "phone"} onChange={F("communicationPref")}>
                <option value="phone">טלפון</option><option value="email">אימייל</option><option value="whatsapp">ווטסאפ</option><option value="sms">SMS</option>
              </select>
            </FormField>
          </div>
        );
      case "address":
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-1 sm:col-span-2"><p className="text-xs font-semibold text-muted-foreground">כתובת ראשית</p></div>
            <FormField label="כתובת" span2><input className={inp} value={form.address || ""} onChange={F("address")} /></FormField>
            <FormField label="עיר"><input className={inp} value={form.city || ""} onChange={F("city")} /></FormField>
            <FormField label="אזור"><input className={inp} value={form.region || ""} onChange={F("region")} /></FormField>
            <FormField label="מיקוד"><input className={inp} value={form.postalCode || ""} onChange={F("postalCode")} /></FormField>
            <FormField label="מדינה"><input className={inp} value={form.country || "ישראל"} onChange={F("country")} /></FormField>
            <div className="col-span-1 sm:col-span-2 border-t pt-3 mt-1"><p className="text-xs font-semibold text-muted-foreground">כתובת חיוב</p></div>
            <FormField label="כתובת חיוב" span2><input className={inp} value={form.billingAddress || ""} onChange={F("billingAddress")} /></FormField>
            <div className="col-span-1 sm:col-span-2 border-t pt-3 mt-1"><p className="text-xs font-semibold text-muted-foreground">כתובת משלוח</p></div>
            <FormField label="כתובת משלוח" span2><input className={inp} value={form.shippingAddress || ""} onChange={F("shippingAddress")} /></FormField>
            <FormField label="אופן משלוח מועדף"><input className={inp} value={form.preferredDelivery || ""} onChange={F("preferredDelivery")} placeholder="שליח, איסוף עצמי..." /></FormField>
          </div>
        );
      case "finance":
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="מסגרת אשראי (₪)"><input type="number" className={inp} value={form.creditLimit || 0} onChange={e => setForm({ ...form, creditLimit: Number(e.target.value) })} /></FormField>
            <FormField label="ימי אשראי"><input type="number" className={inp} value={form.creditTermsDays || 30} onChange={e => setForm({ ...form, creditTermsDays: Number(e.target.value) })} /></FormField>
            <FormField label="תנאי תשלום">
              <select className={sel} value={form.paymentTerms || "שוטף 30"} onChange={F("paymentTerms")}>
                <option>מזומן</option><option>שוטף 30</option><option>שוטף 60</option><option>שוטף 90</option><option>שוטף 120</option><option>שוטף + 15</option><option>שוטף + 45</option>
              </select>
            </FormField>
            <FormField label="אמצעי תשלום">
              <select className={sel} value={form.paymentMethod || ""} onChange={F("paymentMethod")}>
                <option value="">בחר</option><option value="bank_transfer">העברה בנקאית</option><option value="check">צ'ק</option><option value="credit_card">כרטיס אשראי</option><option value="cash">מזומן</option><option value="bit">ביט</option>
              </select>
            </FormField>
            <FormField label="מטבע">
              <select className={sel} value={form.currency || "ILS"} onChange={F("currency")}>
                <option value="ILS">₪ שקל</option><option value="USD">$ דולר</option><option value="EUR">€ יורו</option>
              </select>
            </FormField>
            <FormField label="הנחה קבועה (%)"><input type="number" step="0.5" className={inp} value={form.discountPercent || 0} onChange={e => setForm({ ...form, discountPercent: Number(e.target.value) })} /></FormField>
            <FormField label={'פטור ממע"מ'}>
              <select className={sel} value={form.vatExempt ? "true" : "false"} onChange={e => setForm({ ...form, vatExempt: e.target.value === "true" })}>
                <option value="false">לא</option><option value="true">כן</option>
              </select>
            </FormField>
            <FormField label="ניכוי מס במקור (%)"><input type="number" step="0.5" className={inp} value={form.withholdingTaxRate || 0} onChange={e => setForm({ ...form, withholdingTaxRate: Number(e.target.value) })} /></FormField>
            <div className="col-span-1 sm:col-span-2 border-t pt-3 mt-1"><p className="text-xs font-semibold text-muted-foreground">פרטי בנק</p></div>
            <FormField label="שם בנק"><input className={inp} value={form.bankName || ""} onChange={F("bankName")} /></FormField>
            <FormField label="סניף"><input className={inp} value={form.bankBranch || ""} onChange={F("bankBranch")} /></FormField>
            <FormField label="מספר חשבון"><input className={inp} value={form.bankAccount || ""} onChange={F("bankAccount")} /></FormField>
          </div>
        );
      case "sales":
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="נציג מכירות"><input className={inp} value={form.assignedRep || ""} onChange={F("assignedRep")} /></FormField>
            <FormField label="מחירון"><input type="number" className={inp} value={form.priceListId || ""} onChange={e => setForm({ ...form, priceListId: e.target.value ? Number(e.target.value) : null })} placeholder="מזהה מחירון" /></FormField>
            <FormField label="מקור הגעה"><input className={inp} value={form.acquisitionSource || ""} onChange={F("acquisitionSource")} placeholder="Google, המלצה, פייסבוק..." /></FormField>
            <FormField label="הערות פנימיות" span2><textarea className="textarea textarea-bordered w-full text-sm" rows={3} value={form.internalNotes || ""} onChange={F("internalNotes")} placeholder="הערות לשימוש פנימי בלבד" /></FormField>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div><h1 className="text-lg sm:text-2xl font-bold">ניהול לקוחות — Customer 360</h1><p className="text-sm text-muted-foreground">ניהול לקוחות, ניתוח רווחיות, RFM ומסגרות אשראי</p></div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={calculateRFM}
            disabled={rfmCalculating}
            className="btn btn-outline btn-sm flex items-center gap-1"
            title="חישוב ציוני RFM לכל הלקוחות"
          >
            {rfmCalculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            RFM
          </button>
          <ImportButton apiRoute="/api/sales/customers" onSuccess={load} />
          <ExportDropdown onExport={handleExport} />
          <button onClick={openCreate} className="btn btn-primary btn-sm flex items-center gap-1"><Plus className="w-4 h-4" />לקוח חדש</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (<div key={i} className="bg-card border rounded-lg p-3 text-center"><k.icon className={`w-5 h-5 mx-auto mb-1 ${k.color}`} /><div className="text-lg font-bold">{k.value}</div><div className="text-xs text-muted-foreground">{k.label}</div></div>))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]"><Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" /><input className="input input-bordered w-full pr-9 h-9 text-sm" placeholder="חיפוש לפי שם, טלפון, אימייל, עיר..." value={search} onChange={e => { setSearch(e.target.value); pagination.setPage(1); }} /></div>
        <select className="select select-bordered select-sm" value={filterType} onChange={e => { setFilterType(e.target.value); pagination.setPage(1); }}><option value="">כל הסוגים</option>{Object.entries(TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select className="select select-bordered select-sm" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); pagination.setPage(1); }}><option value="">כל הסטטוסים</option>{Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select className="select select-bordered select-sm" value={filterTier} onChange={e => { setFilterTier(e.target.value); pagination.setPage(1); }}><option value="">כל הרמות</option>{Object.keys(TIER_MAP).map(k => <option key={k} value={k}>{TIER_MAP[k].label}</option>)}</select>
      </div>

      {loadError && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="text-destructive text-base font-medium">שגיאה בטעינת נתוני הלקוחות</div>
          <div className="text-muted-foreground text-sm">לא ניתן היה לטעון את הנתונים. בדוק את החיבור לשרת ונסה שנית.</div>
          <button className="btn btn-sm btn-primary mt-2" onClick={load}>נסה שנית</button>
        </div>
      )}
      <div className="border rounded-lg overflow-auto relative" style={loadError ? { display: "none" } : {}}>
        {tableLoading && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="flex items-center gap-2 bg-background border rounded-lg px-4 py-2 shadow-lg"><Loader2 className="w-4 h-4 animate-spin text-primary" /><span className="text-sm">טוען נתונים...</span></div>
          </div>
        )}
        <table className="table table-sm w-full"><thead><tr className="bg-muted/50">
          <th className="text-right w-8"></th>
          <th className="text-right">מספר</th><th className="text-right">שם</th><th className="text-right">סוג</th>
          <th className="text-right hidden md:table-cell">טלפון</th><th className="text-right hidden md:table-cell">אימייל</th>
          <th className="text-right hidden lg:table-cell">עיר</th>
          <th className="text-right">רמה</th>
          <th className="text-right">סטטוס</th><th className="text-right hidden sm:table-cell">מסגרת אשראי</th>
          <th className="text-right hidden xl:table-cell">הכנסה כוללת</th>
          <th className="text-right">פעולות</th>
        </tr></thead><tbody>
          {paginatedRows.map(r => (
            <Fragment key={r.id}>
              <tr className="hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedRow(expandedRow === r.id ? null : r.id)}>
                <td>{expandedRow === r.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</td>
                <td className="font-mono text-xs">{r.customer_number}</td>
                <td className="font-medium">{r.name}</td>
                <td><span className={`px-2 py-0.5 rounded text-xs ${TYPE_MAP[r.customer_type]?.color || ""}`}>{TYPE_MAP[r.customer_type]?.label || r.customer_type}</span></td>
                <td className="hidden md:table-cell">{r.phone}</td>
                <td className="hidden md:table-cell text-xs">{r.email}</td>
                <td className="hidden lg:table-cell">{r.city}</td>
                <td><TierBadge tier={r.rfm_tier || "Bronze"} /></td>
                <td><span className={`px-2 py-0.5 rounded text-xs ${STATUS_MAP[r.status]?.color || ""}`}>{STATUS_MAP[r.status]?.label || r.status}</span></td>
                <td className="hidden sm:table-cell">{fmtC(r.credit_limit || 0)}</td>
                <td className="hidden xl:table-cell">{fmtC(r.total_revenue || 0)}</td>
                <td>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setShowDetail(r); setDetailTab("details"); }} className="btn btn-ghost btn-xs" title="פרטים"><Eye className="w-3.5 h-3.5" /></button>
                    <button onClick={() => openEdit(r)} className="btn btn-ghost btn-xs" title="עריכה"><Edit className="w-3.5 h-3.5" /></button>
                    <button onClick={async () => { const _dup = await duplicateRecord(`/api/sales/customers`, r.id); if (_dup.ok) { load(); } else { alert("שגיאה בשכפול: " + _dup.error); } }} className="btn btn-ghost btn-xs" title="שכפול"><Copy className="w-3.5 h-3.5" /></button>
                    <button onClick={() => openFollowUp(r)} className="btn btn-ghost btn-xs text-blue-400" title="מעקב"><BellPlus className="w-3.5 h-3.5" /></button>
                    {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="btn btn-ghost btn-xs text-red-400" title="מחיקה"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </td>
              </tr>
              {expandedRow === r.id && (
                <tr key={`detail-${r.id}`} className="bg-muted/20">
                  <td colSpan={12} className="p-3">
                    <div className="flex gap-1 mb-3 border-b pb-2 overflow-x-auto">
                      {[
                        { key: "details", label: "פרטים", icon: FileText },
                        { key: "timeline", label: "ציר זמן 360", icon: Activity },
                        { key: "profitability", label: "רווחיות", icon: BarChart3 },
                        { key: "rfm", label: "RFM", icon: Award },
                      ].map(t => (
                        <button key={t.key} onClick={() => setDetailTab(t.key)} className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded transition-colors ${detailTab === t.key ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}>
                          <t.icon className="w-3 h-3" />{t.label}
                        </button>
                      ))}
                    </div>
                    {detailTab === "details" && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
                        <div><span className="text-muted-foreground text-xs">איש קשר:</span><br />{r.contact_person || "-"}</div>
                        <div><span className="text-muted-foreground text-xs">נייד:</span><br />{r.mobile || "-"}</div>
                        <div><span className="text-muted-foreground text-xs">כתובת:</span><br />{r.address || "-"}</div>
                        <div><span className="text-muted-foreground text-xs">ח.פ / ת.ז:</span><br />{r.tax_id || "-"}</div>
                        <div><span className="text-muted-foreground text-xs">תנאי תשלום:</span><br />{r.payment_terms || "-"}</div>
                        <div><span className="text-muted-foreground text-xs">מטבע:</span><br />{r.currency || "ILS"}</div>
                        <div><span className="text-muted-foreground text-xs">הנחה:</span><br />{r.discount_percent || 0}%</div>
                        <div><span className="text-muted-foreground text-xs">יתרה פתוחה:</span><br />{fmtC(r.outstanding_balance || 0)}</div>
                        <div><span className="text-muted-foreground text-xs">סה"כ הזמנות:</span><br />{fmt(r.total_orders || 0)}</div>
                        <div><span className="text-muted-foreground text-xs">הזמנה אחרונה:</span><br />{r.last_order_date || "-"}</div>
                        {r.vat_exempt && <div><span className="text-xs text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded">פטור ממע"מ</span></div>}
                        {r.notes && <div className="col-span-2 sm:col-span-3"><span className="text-muted-foreground text-xs">הערות:</span><br />{r.notes}</div>}
                      </div>
                    )}
                    {detailTab === "timeline" && <Timeline customerId={r.id} />}
                    {detailTab === "profitability" && <Profitability customerId={r.id} />}
                    {detailTab === "rfm" && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-muted/20 rounded-lg p-3 text-center">
                          <div className="text-xl font-bold text-blue-400">{r.rfm_r_score || 1}</div>
                          <div className="text-xs text-muted-foreground">R — עדכניות</div>
                          <div className="text-xs">(ימים מהזמנה אחרונה)</div>
                        </div>
                        <div className="bg-muted/20 rounded-lg p-3 text-center">
                          <div className="text-xl font-bold text-green-400">{r.rfm_f_score || 1}</div>
                          <div className="text-xs text-muted-foreground">F — תדירות</div>
                          <div className="text-xs">(מספר הזמנות)</div>
                        </div>
                        <div className="bg-muted/20 rounded-lg p-3 text-center">
                          <div className="text-xl font-bold text-amber-400">{r.rfm_m_score || 1}</div>
                          <div className="text-xs text-muted-foreground">M — כספי</div>
                          <div className="text-xs">(סה"כ ערך)</div>
                        </div>
                        <div className="bg-muted/20 rounded-lg p-3 text-center">
                          <TierBadge tier={r.rfm_tier || "Bronze"} />
                          <div className="text-xl font-bold text-purple-400 mt-1">{r.rfm_total || 3}</div>
                          <div className="text-xs text-muted-foreground">ציון כולל</div>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {!tableLoading && paginatedRows.length === 0 && (
            <tr><td colSpan={12}>
              <EmptyState
                icon={Users}
                title="עדיין אין לקוחות במערכת"
                subtitle="הוסף את הלקוח הראשון שלך וצור בסיס לקוחות מנוהל ומסודר"
                ctaLabel="➕ צור לקוח ראשון"
                onCtaClick={openCreate}
              />
            </td></tr>
          )}
        </tbody></table>
      </div>

      <SmartPagination pagination={pagination} />

      {showDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setShowDetail(null); setDetailTab("details"); }}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b flex justify-between items-center">
              <h2 className="text-lg font-bold text-foreground">{showDetail.name} — {showDetail.customer_number}</h2>
              <button onClick={() => { setShowDetail(null); setDetailTab("details"); }} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex border-b border-border/50 overflow-x-auto">
              {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"timeline",label:"📨 ציר תקשורת"},{key:"whatsapp",label:"💬 WhatsApp"},{key:"history",label:"היסטוריה"}].map(t => (
                <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
              ))}
            </div>
            {detailTab === "details" && (
              <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div><span className="text-xs text-muted-foreground block">שם</span><span className="font-medium">{showDetail.name}</span></div>
                <div><span className="text-xs text-muted-foreground block">סוג</span><span>{showDetail.customer_type || "—"}</span></div>
                <div><span className="text-xs text-muted-foreground block">טלפון</span><span dir="ltr">{showDetail.phone || "—"}</span></div>
                <div><span className="text-xs text-muted-foreground block">נייד</span><span dir="ltr">{showDetail.mobile || "—"}</span></div>
                <div><span className="text-xs text-muted-foreground block">דוא״ל</span><span dir="ltr">{showDetail.email || "—"}</span></div>
                <div><span className="text-xs text-muted-foreground block">עיר</span><span>{showDetail.city || "—"}</span></div>
                <div><span className="text-xs text-muted-foreground block">ענף</span><span>{showDetail.industry || "—"}</span></div>
                <div><span className="text-xs text-muted-foreground block">קטגוריה</span><span>{showDetail.category || "—"}</span></div>
                <div><span className="text-xs text-muted-foreground block">סטטוס</span><span className={`px-2 py-0.5 rounded text-xs ${STATUS_MAP[showDetail.status]?.color || ""}`}>{STATUS_MAP[showDetail.status]?.label || showDetail.status}</span></div>
                <div><span className="text-xs text-muted-foreground block">מסגרת אשראי</span><span>{fmtC(showDetail.credit_limit || 0)}</span></div>
                <div><span className="text-xs text-muted-foreground block">יתרה פתוחה</span><span className="text-amber-400">{fmtC(showDetail.outstanding_balance || 0)}</span></div>
                <div><span className="text-xs text-muted-foreground block">סה"כ הכנסות</span><span className="text-green-400">{fmtC(showDetail.total_revenue || 0)}</span></div>
              </div>
            )}
            {detailTab === "related" && (
              <div className="p-5">
                <RelatedRecords tabs={[{key:"orders",label:"הזמנות",endpoint:`${API}/sales/orders?customerId=${showDetail.id}`,columns:[{key:"order_number",label:"מספר"},{key:"total",label:"סכום"},{key:"status",label:"סטטוס"}]},{key:"invoices",label:"חשבוניות",endpoint:`${API}/invoices?customerId=${showDetail.id}`,columns:[{key:"invoice_number",label:"מספר"},{key:"amount",label:"סכום"},{key:"status",label:"סטטוס"}]}]} />
              </div>
            )}
            {detailTab === "timeline" && (
              <div className="p-5">
                <CommunicationTimeline entityType="customer" entityId={showDetail.id} />
              </div>
            )}
            {detailTab === "whatsapp" && (
              <div className="h-[500px]">
                <WhatsAppConversation
                  entityType="customer"
                  entityId={showDetail.id}
                  entityName={showDetail.name}
                  phone={showDetail.phone || showDetail.mobile}
                  className="h-full"
                />
              </div>
            )}
            {detailTab === "history" && (
              <div className="p-5"><ActivityLog entityType="customer" entityId={showDetail.id} /></div>
            )}
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => { setShowDetail(null); setDetailTab("details"); }} className="btn btn-outline btn-sm">סגור</button>
              {(showDetail.phone || showDetail.mobile) && (
                <a href={`https://wa.me/${(showDetail.phone || showDetail.mobile).replace(/\D/g, "")}?text=${encodeURIComponent(`שלום ${showDetail.name},\nאני מקבל קשר מחברת Techno-Kol Uzi בנוגע ל${showDetail.name}. אשמח לדיון נוסף.`)}`} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm gap-2 bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20">
                  <MessageSquare className="w-4 h-4" />
                  שלח ב-WhatsApp
                </a>
              )}
              <button onClick={() => { setEditing(showDetail); setForm(showDetail); setShowForm(true); setShowDetail(null); }} className="btn btn-primary btn-sm">עריכה</button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-card border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold">{editing ? "עריכת לקוח" : "לקוח חדש"}</h2>
              {editing && <span className="text-sm text-muted-foreground font-mono">{editing.customer_number}</span>}
            </div>

            <div className="flex gap-1 p-3 border-b overflow-x-auto">
              <TabButton active={formTab === "basic"} onClick={() => setFormTab("basic")} icon={FileText} label="פרטים כלליים" />
              <TabButton active={formTab === "contact"} onClick={() => setFormTab("contact")} icon={Phone} label="אנשי קשר" />
              <TabButton active={formTab === "address"} onClick={() => setFormTab("address")} icon={MapPin} label="כתובות" />
              <TabButton active={formTab === "finance"} onClick={() => setFormTab("finance")} icon={CreditCard} label="פיננסי" />
              <TabButton active={formTab === "sales"} onClick={() => setFormTab("sales")} icon={UserCheck} label="מכירות" />
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {renderFormTab()}
            </div>

            <div className="p-4 border-t flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="btn btn-ghost btn-sm">ביטול</button>
              <ActionButton onClick={save} loading={loading} variant="primary" size="sm">שמירה</ActionButton>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="customers" entityId="all" />
        <RelatedRecords entityType="customers" entityId="all" />
      </div>

      {followUpCustomer && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" dir="rtl" onClick={e => { if (e.target === e.currentTarget) setFollowUpCustomer(null); }}>
          <div className="bg-base-100 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            {followUpSuccess ? (
              <div className="flex flex-col items-center py-6 gap-3">
                <CheckCircle className="w-12 h-12 text-green-500" />
                <p className="text-lg font-semibold text-green-600">מעקב נשמר בהצלחה!</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <BellPlus className="w-5 h-5 text-blue-400" />
                    הוספת מעקב — {followUpCustomer.name}
                  </h2>
                  <button onClick={() => setFollowUpCustomer(null)} className="btn btn-ghost btn-sm btn-circle"><X className="w-4 h-4" /></button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">תאריך מעקב</label>
                    <input
                      type="date"
                      className="input input-bordered w-full text-sm"
                      value={followUpDate}
                      onChange={e => setFollowUpDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">הערה (אופציונלי)</label>
                    <textarea
                      className="textarea textarea-bordered w-full text-sm"
                      rows={3}
                      placeholder="תיאור המעקב..."
                      value={followUpNote}
                      onChange={e => setFollowUpNote(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button onClick={() => setFollowUpCustomer(null)} className="btn btn-ghost btn-sm">ביטול</button>
                  <button
                    onClick={saveFollowUp}
                    disabled={followUpLoading || !followUpDate}
                    className="btn btn-primary btn-sm flex items-center gap-2"
                  >
                    {followUpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellPlus className="w-4 h-4" />}
                    שמור מעקב
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
