import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Globe, Building2, DollarSign, Calendar, AlertTriangle, CheckCircle2,
  Search, Plus, Edit2, Trash2, X, Save, Eye, Shield, Star,
  Phone, Mail, MapPin, Clock, Award, FileCheck, FileText, Package, Hash,
  TrendingUp, CreditCard, Landmark, Download, Printer, Send, MessageCircle, Copy
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { printPage, sendByEmail, generateEmailBody, exportToWord } from "@/lib/print-utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";

interface ForeignSupplier {
  id: number;
  supplierCode: string;
  companyName: string;
  companyNameEnglish: string | null;
  country: string;
  city: string | null;
  address: string | null;
  postalCode: string | null;
  contactPerson: string | null;
  contactTitle: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;
  language: string;
  timeZone: string;
  preferredCurrency: string;
  paymentMethod: string;
  bankName: string | null;
  bankBranch: string | null;
  bankAccount: string | null;
  swiftCode: string | null;
  iban: string | null;
  paymentTerms: string;
  creditLimit: string;
  taxId: string | null;
  vatNumber: string | null;
  dunsNumber: string | null;
  tradeAgreements: string | null;
  freeTradeZone: boolean;
  preferentialOrigin: boolean;
  incoterms: string;
  minOrderValue: string;
  leadTimeDays: number;
  iso9001: boolean;
  iso14001: boolean;
  iso45001: boolean;
  ceMarking: boolean;
  ulListed: boolean;
  rohsCompliant: boolean;
  reachCompliant: boolean;
  otherCertifications: string | null;
  productCategories: string | null;
  mainProducts: string | null;
  annualImportVolume: string;
  totalOrders: number;
  totalImportValue: string;
  lastOrderDate: string | null;
  avgDeliveryScore: string;
  avgQualityScore: string;
  blacklistedCountries: string | null;
  sanctionsCheck: boolean;
  sanctionsCheckDate: string | null;
  insuranceRequired: boolean;
  lcRequired: boolean;
  rating: string;
  notes: string | null;
  status: string;
  createdAt: string;
}

const STATUSES = ["פעיל", "לא פעיל", "בהערכה", "חסום", "VIP"];
const RATINGS = ["A+", "A", "B+", "B", "C", "D"];
const CURRENCIES = ["USD", "EUR", "GBP", "CNY", "JPY", "KRW", "TWD", "INR", "TRY", "ILS"];
const PAYMENT_METHODS = ["Wire Transfer", "L/C", "D/P", "D/A", "Open Account", "Advance Payment", "PayPal", "Western Union"];
const PAYMENT_TERMS = ["Net 30", "Net 45", "Net 60", "Net 90", "CIA", "COD", "2/10 Net 30", "Advance 30%"];
const INCOTERMS = ["FOB", "CIF", "EXW", "DDP", "DAP", "FCA", "CFR", "CPT", "CIP", "DPU"];
const LANGUAGES = ["English", "Chinese", "Turkish", "German", "Italian", "Spanish", "French", "Korean", "Japanese", "Hindi", "Arabic"];
const TIME_ZONES = ["UTC-8", "UTC-5", "UTC", "UTC+1", "UTC+2", "UTC+3", "UTC+5:30", "UTC+8", "UTC+9", "UTC+10"];

const STATUS_COLORS: Record<string, string> = {
  "פעיל": "bg-green-100 text-green-800",
  "לא פעיל": "bg-muted/50 text-foreground",
  "בהערכה": "bg-blue-100 text-blue-800",
  "חסום": "bg-red-100 text-red-800",
  "VIP": "bg-purple-100 text-purple-800",
};

const RATING_COLORS: Record<string, string> = {
  "A+": "bg-emerald-100 text-emerald-800",
  "A": "bg-green-100 text-green-800",
  "B+": "bg-teal-100 text-teal-800",
  "B": "bg-blue-100 text-blue-800",
  "C": "bg-yellow-100 text-yellow-800",
  "D": "bg-red-100 text-red-800",
};

const CERTIFICATIONS = [
  { key: "iso9001", label: "ISO 9001" },
  { key: "iso14001", label: "ISO 14001" },
  { key: "iso45001", label: "ISO 45001" },
  { key: "ceMarking", label: "CE Marking" },
  { key: "ulListed", label: "UL Listed" },
  { key: "rohsCompliant", label: "RoHS" },
  { key: "reachCompliant", label: "REACH" },
];

const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtCur = (v: any, c = "$") => `${c}${fmt(v)}`;

const emptyForm: Partial<ForeignSupplier> = {
  supplierCode: "", companyName: "", companyNameEnglish: "", country: "", city: "", address: "", postalCode: "",
  contactPerson: "", contactTitle: "", phone: "", mobile: "", email: "", website: "",
  language: "English", timeZone: "UTC", preferredCurrency: "USD", paymentMethod: "Wire Transfer",
  bankName: "", bankBranch: "", bankAccount: "", swiftCode: "", iban: "",
  paymentTerms: "Net 30", creditLimit: "0", taxId: "", vatNumber: "", dunsNumber: "",
  tradeAgreements: "", freeTradeZone: false, preferentialOrigin: false, incoterms: "FOB",
  minOrderValue: "0", leadTimeDays: 30,
  iso9001: false, iso14001: false, iso45001: false, ceMarking: false, ulListed: false,
  rohsCompliant: false, reachCompliant: false, otherCertifications: "",
  productCategories: "", mainProducts: "",
  annualImportVolume: "0", totalOrders: 0, totalImportValue: "0", lastOrderDate: "",
  avgDeliveryScore: "0", avgQualityScore: "0",
  blacklistedCountries: "", sanctionsCheck: false, sanctionsCheckDate: "", insuranceRequired: false, lcRequired: false,
  rating: "B", notes: "", status: "פעיל",
};

export default function ForeignSuppliersPage() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "list" | "compliance" | "history">("dashboard");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<ForeignSupplier | null>(null);
  const [detailItem, setDetailItem] = useState<ForeignSupplier | null>(null);
  const [formData, setFormData] = useState<any>({ ...emptyForm });
  const [searchTerm, setSearchTerm] = useState("");
  const [detailTab, setDetailTab] = useState("details");
  const qc = useQueryClient();
  const { selectedIds, toggle, toggleAll, clear, isSelected, isAllSelected } = useBulkSelection();

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["foreign-suppliers"],
    queryFn: () => authFetch(`${API}/foreign-suppliers`).then(r => r.json()),
  });
  const suppliers: ForeignSupplier[] = useMemo(() => safeArray(rawData), [rawData]);

  const createMut = useMutation({
    mutationFn: (d: any) => authFetch(`${API}/foreign-suppliers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["foreign-suppliers"] }); setShowForm(false); },
  });
  const updateMut = useMutation({
    mutationFn: (d: any) => authFetch(`${API}/foreign-suppliers/${d.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["foreign-suppliers"] }); setShowForm(false); setEditItem(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/foreign-suppliers/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["foreign-suppliers"] }); },
  });

  const openCreate = () => { setFormData({ ...emptyForm }); setEditItem(null); setShowForm(true); };
  const openEdit = (s: ForeignSupplier) => { setFormData({ ...s }); setEditItem(s); setShowForm(true); };
  const handleSave = () => {
    const d = { ...formData };
    if (editItem) { d.id = editItem.id; updateMut.mutate(d); }
    else createMut.mutate(d);
  };

  const filtered = useMemo(() => {
    if (!searchTerm) return suppliers;
    const s = searchTerm.toLowerCase();
    return suppliers.filter(sup =>
      sup.companyName?.toLowerCase().includes(s) ||
      sup.companyNameEnglish?.toLowerCase().includes(s) ||
      sup.supplierCode?.toLowerCase().includes(s) ||
      sup.country?.toLowerCase().includes(s) ||
      sup.contactPerson?.toLowerCase().includes(s)
    );
  }, [suppliers, searchTerm]);

  const total = suppliers.length;
  const active = suppliers.filter(s => s.status === "פעיל").length;
  const vip = suppliers.filter(s => s.status === "VIP").length;
  const totalImport = suppliers.reduce((sum, s) => sum + Number(s.totalImportValue || 0), 0);
  const totalOrders = suppliers.reduce((sum, s) => sum + (s.totalOrders || 0), 0);
  const withCerts = suppliers.filter(s => CERTIFICATIONS.some(c => (s as any)[c.key])).length;
  const avgQuality = suppliers.length > 0 ? suppliers.reduce((sum, s) => sum + Number(s.avgQualityScore || 0), 0) / suppliers.length : 0;
  const countryCount = new Set(suppliers.map(s => s.country)).size;

  const countryDist = Object.entries(
    suppliers.reduce((acc: Record<string, number>, s) => { acc[s.country] = (acc[s.country] || 0) + 1; return acc; }, {})
  ).sort((a, b) => b[1] - a[1]);

  const ratingDist = RATINGS.map(r => ({ rating: r, count: suppliers.filter(s => s.rating === r).length }));

  const kpis = [
    { label: "סה\"כ ספקים", value: total, icon: Building2, color: "blue" },
    { label: "פעילים", value: active, icon: CheckCircle2, color: "green" },
    { label: "VIP", value: vip, icon: Star, color: "purple" },
    { label: "ארצות", value: countryCount, icon: Globe, color: "cyan" },
    { label: "סה\"כ הזמנות", value: totalOrders, icon: Package, color: "orange" },
    { label: "ערך יבוא", value: fmtCur(totalImport), icon: DollarSign, color: "teal" },
    { label: "עם תעודות", value: withCerts, icon: Award, color: "indigo" },
    { label: "ציון איכות ממוצע", value: avgQuality.toFixed(1), icon: TrendingUp, color: "emerald" },
  ];

  const TABS = [
    { key: "dashboard" as const, label: "לוח בקרה", icon: Building2 },
    { key: "list" as const, label: "רשימת ספקים", icon: Globe },
    { key: "compliance" as const, label: "תעודות ותאימות", icon: Shield },
    { key: "history" as const, label: "היסטוריית יבוא", icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50" dir="rtl">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <Globe className="text-indigo-600" /> ספקים בחו"ל
            </h1>
            <p className="text-muted-foreground mt-1">ניהול ספקים בינלאומיים, תשלומים, תאימות והיסטוריית יבוא</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => {
              const msg = `ספקים בחו"ל - טכנו-כל עוזי\n${suppliers.filter((s: ForeignSupplier) => s.status === "פעיל" || s.status === "VIP").slice(0, 10).map((s: ForeignSupplier) => `• ${s.companyName} | ${s.country} | ${s.phone || s.mobile || ""}`).join("\n")}`;
              window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
            }} className="flex items-center gap-1.5 bg-green-700 text-foreground px-3 py-2 rounded-lg hover:bg-green-600 text-sm">
              <MessageCircle size={16} /> WhatsApp
            </button>
            <ExportDropdown data={suppliers} headers={{ supplierCode: "קוד ספק", companyName: "שם חברה", country: "ארץ", city: "עיר", status: "סטטוס", contactPerson: "איש קשר", email: "אימייל", phone: "טלפון", preferredCurrency: "מטבע", paymentMethod: "שיטת תשלום", paymentTerms: "תנאי תשלום", qualityScore: "ציון איכות", totalOrders: "סה\"כ הזמנות", totalImportValue: "ערך יבוא" }} filename={"foreign_suppliers"} />
            <button onClick={() => exportToWord("ספקים בחו\"ל", suppliers, { supplierCode: "קוד ספק", companyName: "שם חברה", country: "ארץ", status: "סטטוס", phone: "טלפון", email: "אימייל" }, "foreign_suppliers")} className="flex items-center gap-1.5 bg-indigo-700 text-foreground px-3 py-2 rounded-lg hover:bg-indigo-600 text-sm">
              <FileText size={16} /> Word
            </button>
            <button onClick={() => printPage("ספקים בחו\"ל")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm">
              <Printer size={16} /> הדפסה
            </button>
            <button onClick={() => sendByEmail("ספקים בחו\"ל - טכנו-כל עוזי", generateEmailBody("ספקים בחו\"ל", suppliers, { supplierCode: "קוד ספק", companyName: "שם חברה", country: "ארץ", status: "סטטוס", phone: "טלפון", email: "אימייל" }))} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm">
              <Send size={16} /> שליחה
            </button>
            <button onClick={openCreate} className="flex items-center gap-2 bg-indigo-600 text-foreground px-3 py-2 rounded-lg hover:bg-indigo-700 shadow-lg text-sm">
              <Plus size={16} /> ספק חדש
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {kpis.map((kpi, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-card rounded-xl p-3 shadow-sm border border-slate-100 text-center">
              <kpi.icon size={20} className={`mx-auto mb-1 text-${kpi.color}-500`} />
              <div className="text-lg font-bold text-foreground">{kpi.value}</div>
              <div className="text-xs text-muted-foreground">{kpi.label}</div>
            </motion.div>
          ))}
        </div>

        <div className="flex gap-1 bg-card rounded-xl p-1 shadow-sm border border-slate-100">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.key ? "bg-indigo-600 text-foreground shadow-md" : "text-muted-foreground hover:bg-muted/30"}`}>
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3"></div>
            <p className="text-muted-foreground">טוען נתונים...</p>
          </div>
        ) : (
          <>
            {activeTab === "dashboard" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Globe size={18} /> התפלגות לפי ארץ</h3>
                  {countryDist.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">אין נתונים</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {countryDist.map(([country, count]) => (
                        <div key={country} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                          <span className="font-medium text-foreground">{country}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-24 bg-muted rounded-full h-2">
                              <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${(count / total) * 100}%` }}></div>
                            </div>
                            <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-sm font-bold min-w-[28px] text-center">{count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Star size={18} /> דירוג ספקים</h3>
                  <div className="space-y-3">
                    {ratingDist.map(r => (
                      <div key={r.rating} className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-sm font-bold min-w-[40px] text-center ${RATING_COLORS[r.rating] || "bg-muted/50"}`}>{r.rating}</span>
                        <div className="flex-1 bg-muted/50 rounded-full h-3">
                          <div className="bg-indigo-500 h-3 rounded-full transition-all" style={{ width: `${total > 0 ? (r.count / total) * 100 : 0}%` }}></div>
                        </div>
                        <span className="font-bold text-foreground w-8 text-center">{r.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><CreditCard size={18} /> שיטות תשלום</h3>
                  {(() => {
                    const pmDist = Object.entries(
                      suppliers.reduce((acc: Record<string, number>, s) => { acc[s.paymentMethod] = (acc[s.paymentMethod] || 0) + 1; return acc; }, {})
                    ).sort((a, b) => b[1] - a[1]);
                    return pmDist.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">אין נתונים</p>
                    ) : (
                      <div className="space-y-2">
                        {pmDist.map(([method, count]) => (
                          <div key={method} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                            <span className="text-sm font-medium text-foreground">{method}</span>
                            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-sm font-bold">{count}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><DollarSign size={18} /> מטבעות מועדפים</h3>
                  {(() => {
                    const currDist = Object.entries(
                      suppliers.reduce((acc: Record<string, number>, s) => { acc[s.preferredCurrency] = (acc[s.preferredCurrency] || 0) + 1; return acc; }, {})
                    ).sort((a, b) => b[1] - a[1]);
                    return currDist.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">אין נתונים</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {currDist.map(([curr, count]) => (
                          <div key={curr} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                            <span className="font-bold text-foreground">{curr}</span>
                            <span className="text-sm text-muted-foreground">{count} ספקים</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {activeTab === "list" && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                  <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    placeholder="חיפוש לפי שם חברה, קוד, ארץ, איש קשר..."
                    className="w-full pr-10 pl-4 py-2.5 border border-border rounded-xl bg-card focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                </div>
                <BulkActions selectedIds={selectedIds} onClear={clear} entityName="ספקים" actions={defaultBulkActions(selectedIds, clear, () => qc.invalidateQueries({ queryKey: ["foreign-suppliers"] }), `${API}/foreign-suppliers`)} />
                {filtered.length === 0 ? (
                  <div className="text-center py-16 bg-card rounded-xl border border-slate-100">
                    <Globe size={48} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-muted-foreground">אין ספקים בחו"ל</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filtered.map(s => {
                      const certCount = CERTIFICATIONS.filter(c => (s as any)[c.key]).length;
                      return (
                        <motion.div key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          className={`bg-card rounded-xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-all ${isSelected(s.id) ? "ring-2 ring-indigo-400" : ""}`}>
                          <div className="flex items-start justify-between mb-3">
                            <BulkCheckbox checked={isSelected(s.id)} onChange={() => toggle(s.id)} />
                            <div>
                              <div className="font-bold text-indigo-700 text-lg">{s.companyName}</div>
                              {s.companyNameEnglish && <div className="text-xs text-muted-foreground">{s.companyNameEnglish}</div>}
                              <div className="text-xs text-muted-foreground mt-0.5">{s.supplierCode}</div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${RATING_COLORS[s.rating] || ""}`}>{s.rating}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s.status] || ""}`}>{s.status}</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-sm mb-3">
                            <div className="flex items-center gap-1 text-muted-foreground"><MapPin size={12} /> {s.country}{s.city ? `, ${s.city}` : ""}</div>
                            <div className="flex items-center gap-1 text-muted-foreground"><DollarSign size={12} /> {s.preferredCurrency} | {s.paymentMethod}</div>
                            {s.contactPerson && <div className="flex items-center gap-1 text-muted-foreground"><Phone size={12} /> {s.contactPerson}</div>}
                            <div className="flex items-center gap-1 text-muted-foreground"><Clock size={12} /> {s.timeZone} | {s.language}</div>
                          </div>
                          <div className="flex items-center justify-between text-sm mb-3">
                            <div className="flex gap-3">
                              <span className="text-muted-foreground">הזמנות: <span className="font-bold text-foreground">{s.totalOrders}</span></span>
                              <span className="text-muted-foreground">יבוא: <span className="font-bold text-green-700">{fmtCur(s.totalImportValue)}</span></span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Award size={14} className="text-indigo-400" />
                              <span className="text-xs text-muted-foreground">{certCount}/{CERTIFICATIONS.length}</span>
                            </div>
                          </div>
                          {certCount > 0 && (
                            <div className="flex flex-wrap gap-1 mb-3">
                              {CERTIFICATIONS.filter(c => (s as any)[c.key]).map(c => (
                                <span key={c.key} className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[10px] font-medium border border-green-200">{c.label}</span>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-1 pt-2 border-t border-slate-100">
                            <button onClick={() => setDetailItem(s)} className="flex-1 flex items-center justify-center gap-1 text-indigo-600 hover:bg-indigo-50 rounded-lg py-1.5 text-sm"><Eye size={14} /> צפייה</button>
                            <button onClick={() => openEdit(s)} className="flex-1 flex items-center justify-center gap-1 text-amber-600 hover:bg-amber-50 rounded-lg py-1.5 text-sm"><Edit2 size={14} /> עריכה</button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/foreign-suppliers`, s.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                            {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק ספק זה?", { itemName: s.supplier_name || s.name || String(s.id), entityType: "ספק חוץ" }); if (ok) deleteMut.mutate(s.id); }} className="flex-1 flex items-center justify-center gap-1 text-red-600 hover:bg-red-50 rounded-lg py-1.5 text-sm"><Trash2 size={14} /> מחיקה</button>}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === "compliance" && (
              <div className="space-y-4 sm:space-y-6">
                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Award size={18} /> סטטוס תעודות</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {CERTIFICATIONS.map(cert => {
                      const count = suppliers.filter(s => (s as any)[cert.key]).length;
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={cert.key} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${pct >= 50 ? "bg-green-100 text-green-600" : pct > 0 ? "bg-yellow-100 text-yellow-600" : "bg-red-100 text-red-600"}`}>
                            {pct >= 50 ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-bold text-sm text-foreground">{cert.label}</span>
                              <span className="text-xs text-muted-foreground">{count}/{total} ({pct}%)</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2">
                              <div className={`h-2 rounded-full ${pct >= 50 ? "bg-green-500" : pct > 0 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${pct}%` }}></div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Shield size={18} /> בדיקות סנקציות ותאימות</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="bg-green-50 rounded-xl p-4 border border-green-200 text-center">
                      <div className="text-lg sm:text-2xl font-bold text-green-700">{suppliers.filter(s => s.sanctionsCheck).length}</div>
                      <div className="text-sm text-green-600">עברו בדיקת סנקציות</div>
                    </div>
                    <div className="bg-orange-50 rounded-xl p-4 border border-orange-200 text-center">
                      <div className="text-lg sm:text-2xl font-bold text-orange-700">{suppliers.filter(s => s.insuranceRequired).length}</div>
                      <div className="text-sm text-orange-600">דורשים ביטוח</div>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-center">
                      <div className="text-lg sm:text-2xl font-bold text-blue-700">{suppliers.filter(s => s.lcRequired).length}</div>
                      <div className="text-sm text-blue-600">דורשים L/C</div>
                    </div>
                  </div>
                  {suppliers.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/30">
                          <tr>
                            <th className="text-right p-2 font-medium">ספק</th>
                            <th className="text-right p-2 font-medium">ארץ</th>
                            {CERTIFICATIONS.map(c => (
                              <th key={c.key} className="text-center p-2 font-medium text-xs">{c.label}</th>
                            ))}
                            <th className="text-center p-2 font-medium">סנקציות</th>
                          </tr>
                        </thead>
                        <tbody>
                          {suppliers.map(s => (
                            <tr key={s.id} className="border-t border-slate-100 hover:bg-muted/30">
                              <td className="p-2 font-bold text-indigo-700">{s.companyName}</td>
                              <td className="p-2 text-muted-foreground">{s.country}</td>
                              {CERTIFICATIONS.map(c => (
                                <td key={c.key} className="text-center p-2">
                                  {(s as any)[c.key] ? <CheckCircle2 size={14} className="mx-auto text-green-500" /> : <X size={14} className="mx-auto text-red-300" />}
                                </td>
                              ))}
                              <td className="text-center p-2">
                                {s.sanctionsCheck ? <CheckCircle2 size={14} className="mx-auto text-green-500" /> : <AlertTriangle size={14} className="mx-auto text-yellow-500" />}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "history" && (
              <div className="space-y-4 sm:space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-center">
                    <div className="text-lg sm:text-2xl font-bold text-blue-700">{totalOrders}</div>
                    <div className="text-sm text-blue-600">סה"כ הזמנות</div>
                  </div>
                  <div className="bg-green-50 rounded-xl p-4 border border-green-200 text-center">
                    <div className="text-lg sm:text-2xl font-bold text-green-700">{fmtCur(totalImport)}</div>
                    <div className="text-sm text-green-600">סה"כ ערך יבוא</div>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-4 border border-purple-200 text-center">
                    <div className="text-lg sm:text-2xl font-bold text-purple-700">{fmtCur(suppliers.reduce((s, sup) => s + Number(sup.annualImportVolume || 0), 0))}</div>
                    <div className="text-sm text-purple-600">מחזור יבוא שנתי</div>
                  </div>
                </div>

                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><TrendingUp size={18} /> היסטוריית יבוא לפי ספק</h3>
                  {suppliers.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">אין נתונים</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/30">
                          <tr>
                            <th className="text-right p-2 font-medium">ספק</th>
                            <th className="text-right p-2 font-medium">ארץ</th>
                            <th className="text-right p-2 font-medium">הזמנות</th>
                            <th className="text-right p-2 font-medium">ערך יבוא</th>
                            <th className="text-right p-2 font-medium">מחזור שנתי</th>
                            <th className="text-right p-2 font-medium">הזמנה אחרונה</th>
                            <th className="text-right p-2 font-medium">ציון משלוח</th>
                            <th className="text-right p-2 font-medium">ציון איכות</th>
                            <th className="text-right p-2 font-medium">דירוג</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...suppliers].sort((a, b) => Number(b.totalImportValue || 0) - Number(a.totalImportValue || 0)).map(s => (
                            <tr key={s.id} className="border-t border-slate-100 hover:bg-muted/30">
                              <td className="p-2 font-bold text-indigo-700">{s.companyName}</td>
                              <td className="p-2 text-muted-foreground">{s.country}</td>
                              <td className="p-2 font-medium">{s.totalOrders}</td>
                              <td className="p-2 font-medium text-green-700">{fmtCur(s.totalImportValue)}</td>
                              <td className="p-2">{fmtCur(s.annualImportVolume)}</td>
                              <td className="p-2">{s.lastOrderDate || "-"}</td>
                              <td className="p-2">
                                <span className={`font-bold ${Number(s.avgDeliveryScore) >= 4 ? "text-green-600" : Number(s.avgDeliveryScore) >= 3 ? "text-yellow-600" : "text-red-600"}`}>
                                  {Number(s.avgDeliveryScore).toFixed(1)}
                                </span>
                              </td>
                              <td className="p-2">
                                <span className={`font-bold ${Number(s.avgQualityScore) >= 4 ? "text-green-600" : Number(s.avgQualityScore) >= 3 ? "text-yellow-600" : "text-red-600"}`}>
                                  {Number(s.avgQualityScore).toFixed(1)}
                                </span>
                              </td>
                              <td className="p-2"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${RATING_COLORS[s.rating]}`}>{s.rating}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 overflow-y-auto p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto my-8">
              <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-card rounded-t-2xl z-10">
                <h2 className="text-lg font-bold text-foreground">{editItem ? "עריכת ספק בחו\"ל" : "ספק חו\"ל חדש"}</h2>
                <button onClick={() => { setShowForm(false); setEditItem(null); }} className="p-1 hover:bg-muted/50 rounded-lg"><X size={20} /></button>
              </div>
              <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-indigo-700 px-2">פרטי חברה</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground">קוד ספק (אוטומטי)</label>
                      <input value={formData.supplierCode || ""} onChange={e => setFormData({ ...formData, supplierCode: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" placeholder="FS-NNNN" /></div>
                    <div><label className="text-xs text-muted-foreground">שם חברה *</label>
                      <input value={formData.companyName || ""} onChange={e => setFormData({ ...formData, companyName: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" required /></div>
                    <div><label className="text-xs text-muted-foreground">שם באנגלית</label>
                      <input value={formData.companyNameEnglish || ""} onChange={e => setFormData({ ...formData, companyNameEnglish: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">ארץ *</label>
                      <input value={formData.country || ""} onChange={e => setFormData({ ...formData, country: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" required /></div>
                    <div><label className="text-xs text-muted-foreground">עיר</label>
                      <input value={formData.city || ""} onChange={e => setFormData({ ...formData, city: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">כתובת</label>
                      <input value={formData.address || ""} onChange={e => setFormData({ ...formData, address: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">מיקוד</label>
                      <input value={formData.postalCode || ""} onChange={e => setFormData({ ...formData, postalCode: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">סטטוס</label>
                      <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select></div>
                    <div><label className="text-xs text-muted-foreground">דירוג</label>
                      <select value={formData.rating} onChange={e => setFormData({ ...formData, rating: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                        {RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-indigo-700 px-2">איש קשר</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground">שם</label>
                      <input value={formData.contactPerson || ""} onChange={e => setFormData({ ...formData, contactPerson: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">תפקיד</label>
                      <input value={formData.contactTitle || ""} onChange={e => setFormData({ ...formData, contactTitle: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">טלפון</label>
                      <input value={formData.phone || ""} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">נייד</label>
                      <input value={formData.mobile || ""} onChange={e => setFormData({ ...formData, mobile: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">אימייל</label>
                      <input value={formData.email || ""} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">אתר אינטרנט</label>
                      <input value={formData.website || ""} onChange={e => setFormData({ ...formData, website: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-indigo-700 px-2">שפה ואזור זמן</legend>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">שפה</label>
                      <select value={formData.language} onChange={e => setFormData({ ...formData, language: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                        {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                      </select></div>
                    <div><label className="text-xs text-muted-foreground">אזור זמן</label>
                      <select value={formData.timeZone} onChange={e => setFormData({ ...formData, timeZone: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                        {TIME_ZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                      </select></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-indigo-700 px-2">תשלומים בינלאומיים</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground">מטבע מועדף</label>
                      <select value={formData.preferredCurrency} onChange={e => setFormData({ ...formData, preferredCurrency: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select></div>
                    <div><label className="text-xs text-muted-foreground">שיטת תשלום</label>
                      <select value={formData.paymentMethod} onChange={e => setFormData({ ...formData, paymentMethod: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                        {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select></div>
                    <div><label className="text-xs text-muted-foreground">תנאי תשלום</label>
                      <select value={formData.paymentTerms} onChange={e => setFormData({ ...formData, paymentTerms: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                        {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select></div>
                    <div><label className="text-xs text-muted-foreground">שם בנק</label>
                      <input value={formData.bankName || ""} onChange={e => setFormData({ ...formData, bankName: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">סניף</label>
                      <input value={formData.bankBranch || ""} onChange={e => setFormData({ ...formData, bankBranch: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">חשבון</label>
                      <input value={formData.bankAccount || ""} onChange={e => setFormData({ ...formData, bankAccount: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">SWIFT</label>
                      <input value={formData.swiftCode || ""} onChange={e => setFormData({ ...formData, swiftCode: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">IBAN</label>
                      <input value={formData.iban || ""} onChange={e => setFormData({ ...formData, iban: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">מסגרת אשראי</label>
                      <input type="number" step="0.01" value={formData.creditLimit || ""} onChange={e => setFormData({ ...formData, creditLimit: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-indigo-700 px-2">מספרי זיהוי</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground">Tax ID</label>
                      <input value={formData.taxId || ""} onChange={e => setFormData({ ...formData, taxId: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">VAT Number</label>
                      <input value={formData.vatNumber || ""} onChange={e => setFormData({ ...formData, vatNumber: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">DUNS Number</label>
                      <input value={formData.dunsNumber || ""} onChange={e => setFormData({ ...formData, dunsNumber: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-indigo-700 px-2">הסכמי סחר</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground">Incoterms</label>
                      <select value={formData.incoterms} onChange={e => setFormData({ ...formData, incoterms: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                        {INCOTERMS.map(i => <option key={i} value={i}>{i}</option>)}
                      </select></div>
                    <div><label className="text-xs text-muted-foreground">הזמנה מינימלית ($)</label>
                      <input type="number" step="0.01" value={formData.minOrderValue || ""} onChange={e => setFormData({ ...formData, minOrderValue: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">זמן אספקה (ימים)</label>
                      <input type="number" value={formData.leadTimeDays || ""} onChange={e => setFormData({ ...formData, leadTimeDays: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div className="md:col-span-3"><label className="text-xs text-muted-foreground">הסכמי סחר</label>
                      <input value={formData.tradeAgreements || ""} onChange={e => setFormData({ ...formData, tradeAgreements: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" placeholder="הסכם סחר חופשי EU-Israel, EFTA..." /></div>
                    <label className="flex items-center gap-2 p-2 hover:bg-muted/30 rounded-lg cursor-pointer">
                      <input type="checkbox" checked={formData.freeTradeZone || false} onChange={e => setFormData({ ...formData, freeTradeZone: e.target.checked })} className="w-4 h-4" />
                      <span className="text-sm">אזור סחר חופשי</span></label>
                    <label className="flex items-center gap-2 p-2 hover:bg-muted/30 rounded-lg cursor-pointer">
                      <input type="checkbox" checked={formData.preferentialOrigin || false} onChange={e => setFormData({ ...formData, preferentialOrigin: e.target.checked })} className="w-4 h-4" />
                      <span className="text-sm">מקור מועדף (Preferential Origin)</span></label>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-indigo-700 px-2">תעודות תאימות</legend>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {CERTIFICATIONS.map(cert => (
                      <label key={cert.key} className="flex items-center gap-2 p-2 hover:bg-muted/30 rounded-lg cursor-pointer">
                        <input type="checkbox" checked={formData[cert.key] || false} onChange={e => setFormData({ ...formData, [cert.key]: e.target.checked })} className="w-4 h-4 text-indigo-600" />
                        <span className="text-sm">{cert.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-3"><label className="text-xs text-muted-foreground">תעודות נוספות</label>
                    <input value={formData.otherCertifications || ""} onChange={e => setFormData({ ...formData, otherCertifications: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" placeholder="FDA, GOST, BIS..." /></div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-indigo-700 px-2">מוצרים</legend>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">קטגוריות מוצרים</label>
                      <input value={formData.productCategories || ""} onChange={e => setFormData({ ...formData, productCategories: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" placeholder="מתכת, אלומיניום, ברזל..." /></div>
                    <div><label className="text-xs text-muted-foreground">מוצרים עיקריים</label>
                      <input value={formData.mainProducts || ""} onChange={e => setFormData({ ...formData, mainProducts: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" placeholder="פרופילי אלומיניום, פלדה..." /></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-indigo-700 px-2">היסטוריית יבוא</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground">מחזור יבוא שנתי ($)</label>
                      <input type="number" step="0.01" value={formData.annualImportVolume || ""} onChange={e => setFormData({ ...formData, annualImportVolume: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">סה"כ הזמנות</label>
                      <input type="number" value={formData.totalOrders || ""} onChange={e => setFormData({ ...formData, totalOrders: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">ערך יבוא כולל ($)</label>
                      <input type="number" step="0.01" value={formData.totalImportValue || ""} onChange={e => setFormData({ ...formData, totalImportValue: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">הזמנה אחרונה</label>
                      <input type="date" value={formData.lastOrderDate || ""} onChange={e => setFormData({ ...formData, lastOrderDate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">ציון משלוח (1-5)</label>
                      <input type="number" step="0.1" min="0" max="5" value={formData.avgDeliveryScore || ""} onChange={e => setFormData({ ...formData, avgDeliveryScore: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">ציון איכות (1-5)</label>
                      <input type="number" step="0.1" min="0" max="5" value={formData.avgQualityScore || ""} onChange={e => setFormData({ ...formData, avgQualityScore: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-indigo-700 px-2">בטיחות וסנקציות</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="flex items-center gap-2 p-2 hover:bg-muted/30 rounded-lg cursor-pointer">
                      <input type="checkbox" checked={formData.sanctionsCheck || false} onChange={e => setFormData({ ...formData, sanctionsCheck: e.target.checked })} className="w-4 h-4" />
                      <span className="text-sm">עבר בדיקת סנקציות</span></label>
                    <div><label className="text-xs text-muted-foreground">תאריך בדיקה</label>
                      <input type="date" value={formData.sanctionsCheckDate || ""} onChange={e => setFormData({ ...formData, sanctionsCheckDate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <label className="flex items-center gap-2 p-2 hover:bg-muted/30 rounded-lg cursor-pointer">
                      <input type="checkbox" checked={formData.insuranceRequired || false} onChange={e => setFormData({ ...formData, insuranceRequired: e.target.checked })} className="w-4 h-4" />
                      <span className="text-sm">דורש ביטוח</span></label>
                    <label className="flex items-center gap-2 p-2 hover:bg-muted/30 rounded-lg cursor-pointer">
                      <input type="checkbox" checked={formData.lcRequired || false} onChange={e => setFormData({ ...formData, lcRequired: e.target.checked })} className="w-4 h-4" />
                      <span className="text-sm">דורש L/C</span></label>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-indigo-700 px-2">הערות</legend>
                  <textarea value={formData.notes || ""} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={3} className="w-full border border-border rounded-lg p-2 text-sm" />
                </fieldset>
              </div>
              <div className="flex gap-3 p-4 border-t border-slate-100 sticky bottom-0 bg-card rounded-b-2xl">
                <button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-foreground py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  <Save size={16} /> {editItem ? "עדכון" : "שמירה"}
                </button>
                <button onClick={() => { setShowForm(false); setEditItem(null); }} className="px-6 py-2.5 border border-border rounded-lg hover:bg-muted/30">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail Modal */}
      <AnimatePresence>
        {detailItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 overflow-y-auto p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto my-8">
              <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-card rounded-t-2xl z-10">
                <div>
                  <h2 className="text-lg font-bold text-foreground">{detailItem.companyName}</h2>
                  <div className="flex gap-2 mt-1">
                    {detailItem.companyNameEnglish && <span className="text-sm text-muted-foreground">{detailItem.companyNameEnglish}</span>}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${RATING_COLORS[detailItem.rating]}`}>{detailItem.rating}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[detailItem.status]}`}>{detailItem.status}</span>
                  </div>
                </div>
                <button onClick={() => setDetailItem(null)} className="p-1 hover:bg-muted/50 rounded-lg"><X size={20} /></button>
              </div>
              <div className="flex gap-1 px-4 pt-3 border-b border-slate-100 overflow-x-auto">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"attachments",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(tab => (
                  <button key={tab.key} onClick={() => setDetailTab(tab.key)} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${detailTab === tab.key ? "bg-blue-50 text-blue-700 border-b-2 border-blue-500" : "text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>
                ))}
              </div>
              <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
                {detailTab === "details" && (<>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { label: "קוד", value: detailItem.supplierCode },
                    { label: "ארץ", value: detailItem.country },
                    { label: "עיר", value: detailItem.city },
                    { label: "איש קשר", value: detailItem.contactPerson },
                    { label: "תפקיד", value: detailItem.contactTitle },
                    { label: "טלפון", value: detailItem.phone },
                    { label: "נייד", value: detailItem.mobile },
                    { label: "אימייל", value: detailItem.email },
                    { label: "אתר", value: detailItem.website },
                    { label: "שפה", value: detailItem.language },
                    { label: "אזור זמן", value: detailItem.timeZone },
                    { label: "Incoterms", value: detailItem.incoterms },
                  ].filter(f => f.value).map((f, i) => (
                    <div key={i} className="bg-muted/30 rounded-lg p-2">
                      <div className="text-xs text-muted-foreground">{f.label}</div>
                      <div className="font-medium text-sm text-foreground">{f.value}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "מטבע", value: detailItem.preferredCurrency },
                    { label: "שיטת תשלום", value: detailItem.paymentMethod },
                    { label: "תנאי תשלום", value: detailItem.paymentTerms },
                    { label: "SWIFT", value: detailItem.swiftCode },
                  ].filter(f => f.value).map((f, i) => (
                    <div key={i} className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
                      <div className="text-xs text-blue-600">{f.label}</div>
                      <div className="font-bold text-foreground">{f.value}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                    <div className="text-xs text-green-600">הזמנות</div>
                    <div className="font-bold text-foreground">{detailItem.totalOrders}</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                    <div className="text-xs text-green-600">ערך יבוא</div>
                    <div className="font-bold text-foreground">{fmtCur(detailItem.totalImportValue)}</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                    <div className="text-xs text-green-600">ציון משלוח</div>
                    <div className="font-bold text-foreground">{Number(detailItem.avgDeliveryScore).toFixed(1)}/5</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                    <div className="text-xs text-green-600">ציון איכות</div>
                    <div className="font-bold text-foreground">{Number(detailItem.avgQualityScore).toFixed(1)}/5</div>
                  </div>
                </div>

                {CERTIFICATIONS.some(c => (detailItem as any)[c.key]) && (
                  <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200">
                    <h4 className="font-bold text-sm text-indigo-700 mb-2">תעודות</h4>
                    <div className="flex flex-wrap gap-2">
                      {CERTIFICATIONS.filter(c => (detailItem as any)[c.key]).map(c => (
                        <span key={c.key} className="px-2 py-1 bg-green-100 text-green-800 rounded-lg text-sm font-medium flex items-center gap-1">
                          <CheckCircle2 size={12} /> {c.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {detailItem.tradeAgreements && (
                  <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                    <h4 className="font-bold text-sm text-yellow-700 mb-1">הסכמי סחר</h4>
                    <p className="text-sm text-foreground">{detailItem.tradeAgreements}</p>
                  </div>
                )}

                {detailItem.notes && (
                  <div className="bg-muted/30 rounded-xl p-4 border border-border">
                    <h4 className="font-bold text-sm text-foreground mb-1">הערות</h4>
                    <p className="text-sm text-foreground">{detailItem.notes}</p>
                  </div>
                )}
                </>)}
                {detailTab === "related" && <RelatedRecords entityType="foreign-suppliers" entityId={detailItem.id} />}
                {detailTab === "attachments" && <AttachmentsSection entityType="foreign-suppliers" entityId={detailItem.id} />}
                {detailTab === "history" && <ActivityLog entityType="foreign-suppliers" entityId={detailItem.id} />}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
