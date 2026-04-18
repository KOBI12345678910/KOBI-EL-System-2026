import { useState, useEffect, useMemo } from "react";
import { Building2, User, Search, Plus, Edit, Trash2, Download, TrendingUp, DollarSign, Users, Star, Loader2, Eye, CreditCard, MapPin, Phone, Mail, Globe, FileText, UserCheck, Shield, Banknote, ChevronDown, ChevronUp } from "lucide-react";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { globalConfirm } from "@/components/confirm-dialog";
import { useApiAction, ActionButton } from "@/hooks/use-api-action";
import ExportDropdown from "@/components/export-dropdown";
import { exportToCSV, exportToExcel, exportToPDF } from "@/lib/export-utils";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import RelatedRecords from "@/components/related-records";

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
const CATEGORY_MAP: Record<string, string> = { "רגיל": "רגיל", "VIP": "VIP", "קבלן": "קבלן", "סיטונאי": "סיטונאי", "ממשלתי": "ממשלתי", "קמעונאי": "קמעונאי" };
const INDUSTRY_LIST = ["בנייה", "תעשייה", "נדל\"ן", "היי-טק", "מסחר", "ממשלה", "חינוך", "בריאות", "חקלאות", "תחבורה", "אחר"];

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

export default function CustomerManagement() {
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [formTab, setFormTab] = useState("basic");
  const [tableLoading, setTableLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const { executeSave, executeDelete, loading } = useApiAction();

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/sales/customers`, { headers: getHeaders() }).then(r => r.json()).then(d => setItems(Array.isArray(d) ? d : [])).catch(() => setItems([])),
      authFetch(`${API}/sales/customers/stats`, { headers: getHeaders() }).then(r => r.json()).then(d => setStats(d || {})).catch(() => {}),
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    return items.filter(r => {
      const s = `${r.name} ${r.email} ${r.phone} ${r.customer_number} ${r.city || ""} ${r.contact_person || ""} ${r.tax_id || ""}`.toLowerCase();
      if (search && !s.includes(search.toLowerCase())) return false;
      if (filterType && r.customer_type !== filterType) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      return true;
    });
  }, [items, search, filterType, filterStatus]);

  const paginatedRows = pagination.paginate(filtered);

  const openCreate = () => {
    setEditing(null);
    setForm({ customerType: "company", status: "active", paymentTerms: "שוטף 30", creditLimit: 0, creditTermsDays: 30, currency: "ILS", country: "ישראל", category: "רגיל", languagePref: "he", communicationPref: "phone" });
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
    setFormTab("basic");
    setShowForm(true);
  };

  const save = async () => {
    const url = editing ? `${API}/sales/customers/${editing.id}` : `${API}/sales/customers`;
    const method = editing ? "PUT" : "POST";
    await executeSave(
      () => authFetch(url, { method, headers: getHeaders(), body: JSON.stringify(form) }),
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
  const sel = "select select-bordered w-full select-sm text-sm";
  const F = (field: string, val?: any) => (e: any) => setForm({ ...form, [field]: val !== undefined ? val : e.target.value });

  const renderFormTab = () => {
    switch (formTab) {
      case "basic":
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="שם לקוח *"><input className={inp} value={form.name || ""} onChange={F("name")} /></FormField>
            <FormField label="סוג">
              <select className={sel} value={form.customerType || "company"} onChange={F("customerType")}>
                <option value="company">חברה</option><option value="individual">פרטי</option>
              </select>
            </FormField>
            <FormField label="ח.פ / ת.ז"><input className={inp} value={form.taxId || ""} onChange={F("taxId")} /></FormField>
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
            <FormField label="טלפון"><input className={inp} value={form.phone || ""} onChange={F("phone")} dir="ltr" /></FormField>
            <FormField label="נייד"><input className={inp} value={form.mobile || ""} onChange={F("mobile")} dir="ltr" /></FormField>
            <FormField label="פקס"><input className={inp} value={form.fax || ""} onChange={F("fax")} dir="ltr" /></FormField>
            <FormField label="אימייל"><input type="email" className={inp} value={form.email || ""} onChange={F("email")} dir="ltr" /></FormField>
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
        <div><h1 className="text-lg sm:text-2xl font-bold">ניהול לקוחות</h1><p className="text-sm text-muted-foreground">ניהול לקוחות, פרטים ומסגרות אשראי</p></div>
        <div className="flex gap-2">
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
      </div>

      <div className="border rounded-lg overflow-auto relative">
        {tableLoading && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="flex items-center gap-2 bg-background border rounded-lg px-4 py-2 shadow-lg"><Loader2 className="w-4 h-4 animate-spin text-primary" /><span className="text-sm">טוען נתונים...</span></div>
          </div>
        )}
        <table className="table table-sm w-full"><thead><tr className="bg-muted/50">
          <th className="text-right w-8"></th>
          <th className="text-right">מספר</th><th className="text-right">שם</th><th className="text-right">סוג</th>
          <th className="text-right hidden md:table-cell">טלפון</th><th className="text-right hidden md:table-cell">אימייל</th>
          <th className="text-right hidden lg:table-cell">עיר</th><th className="text-right hidden lg:table-cell">ענף</th>
          <th className="text-right">סטטוס</th><th className="text-right hidden sm:table-cell">מסגרת אשראי</th>
          <th className="text-right hidden xl:table-cell">הכנסה כוללת</th>
          <th className="text-right">פעולות</th>
        </tr></thead><tbody>
          {paginatedRows.map(r => (
            <>
              <tr key={r.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedRow(expandedRow === r.id ? null : r.id)}>
                <td>{expandedRow === r.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</td>
                <td className="font-mono text-xs">{r.customer_number}</td>
                <td className="font-medium">{r.name}</td>
                <td><span className={`px-2 py-0.5 rounded text-xs ${TYPE_MAP[r.customer_type]?.color || ""}`}>{TYPE_MAP[r.customer_type]?.label || r.customer_type}</span></td>
                <td className="hidden md:table-cell">{r.phone}</td>
                <td className="hidden md:table-cell text-xs">{r.email}</td>
                <td className="hidden lg:table-cell">{r.city}</td>
                <td className="hidden lg:table-cell text-xs">{r.industry}</td>
                <td><span className={`px-2 py-0.5 rounded text-xs ${STATUS_MAP[r.status]?.color || ""}`}>{STATUS_MAP[r.status]?.label || r.status}</span></td>
                <td className="hidden sm:table-cell">{fmtC(r.credit_limit || 0)}</td>
                <td className="hidden xl:table-cell">{fmtC(r.total_revenue || 0)}</td>
                <td>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(r)} className="btn btn-ghost btn-xs" title="עריכה"><Edit className="w-3.5 h-3.5" /></button>
                    <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="btn btn-ghost btn-xs text-red-400" title="מחיקה"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
              {expandedRow === r.id && (
                <tr key={`detail-${r.id}`} className="bg-muted/20">
                  <td colSpan={12} className="p-3">
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
                  </td>
                </tr>
              )}
            </>
          ))}
          {!tableLoading && paginatedRows.length === 0 && <tr><td colSpan={12} className="text-center py-8 text-muted-foreground">אין לקוחות להצגה</td></tr>}
        </tbody></table>
      </div>

      <SmartPagination pagination={pagination} />

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
    </div>
  );
}