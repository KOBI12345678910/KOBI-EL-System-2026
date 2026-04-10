import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Landmark, DollarSign, Calendar, AlertTriangle, CheckCircle2, Clock,
  Search, Plus, Edit2, Trash2, X, Save, Eye, Shield, FileText,
  Globe, Building2, Ship, Hash, CreditCard, TrendingUp, FileCheck,
  ChevronDown, ChevronUp, PlusCircle, Ban, Copy
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Printer, Send } from "lucide-react";
import ExportDropdown from "@/components/export-dropdown";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtCur = (v: any, c = "$") => `${c}${fmt(v)}`;

const STATUSES = ["טיוטה", "פעיל", "ממתין לאישור", "מאושר", "הונפק", "בשימוש", "ממתין לתשלום", "שולם חלקית", "שולם", "פג תוקף", "בוטל", "נדחה"];
const LC_TYPES = ["Irrevocable", "Revocable", "Confirmed", "Unconfirmed", "Transferable", "Back-to-Back", "Standby", "Revolving", "Red Clause", "Green Clause"];
const CURRENCIES = ["USD", "EUR", "GBP", "CNY", "JPY", "CHF", "ILS"];
const PAYMENT_TERMS_OPTIONS = ["At Sight", "30 Days", "60 Days", "90 Days", "120 Days", "180 Days", "Deferred", "Acceptance", "Negotiation", "Mixed"];
const INCOTERMS = ["FOB", "CIF", "EXW", "DDP", "DAP", "FCA", "CFR", "CPT", "CIP", "DPU"];
const AMENDMENT_TYPES = ["שינוי סכום", "הארכת תוקף", "שינוי מוטב", "שינוי תנאים", "שינוי מסמכים", "שינוי נמל", "שינוי סחורה", "אחר"];

const STATUS_COLORS: Record<string, string> = {
  "טיוטה": "bg-muted/50 text-foreground",
  "פעיל": "bg-green-100 text-green-800",
  "ממתין לאישור": "bg-yellow-100 text-yellow-800",
  "מאושר": "bg-blue-100 text-blue-800",
  "הונפק": "bg-indigo-100 text-indigo-800",
  "בשימוש": "bg-purple-100 text-purple-800",
  "ממתין לתשלום": "bg-orange-100 text-orange-800",
  "שולם חלקית": "bg-teal-100 text-teal-800",
  "שולם": "bg-emerald-100 text-emerald-800",
  "פג תוקף": "bg-red-100 text-red-800",
  "בוטל": "bg-red-200 text-red-900",
  "נדחה": "bg-rose-100 text-rose-800",
};

const STATUS_ICONS: Record<string, any> = {
  "טיוטה": FileText,
  "פעיל": CheckCircle2,
  "ממתין לאישור": Clock,
  "מאושר": Shield,
  "הונפק": Landmark,
  "בשימוש": CreditCard,
  "ממתין לתשלום": DollarSign,
  "שולם חלקית": TrendingUp,
  "שולם": CheckCircle2,
  "פג תוקף": AlertTriangle,
  "בוטל": Ban,
  "נדחה": X,
};

interface LC {
  id: number; lcNumber: string; lcType: string; status: string;
  issuingBank: string; issuingBankBranch: string | null; issuingBankSwift: string | null;
  advisingBank: string | null; advisingBankSwift: string | null; confirmingBank: string | null;
  applicantName: string; applicantAddress: string | null;
  beneficiaryName: string; beneficiaryAddress: string | null; beneficiaryCountry: string | null;
  amount: string; currency: string;
  amountTolerancePlus: string; amountToleranceMinus: string; amountInWords: string | null;
  issueDate: string | null; expiryDate: string;
  expiryPlace: string | null; latestShipmentDate: string | null;
  presentationPeriod: number; partialShipments: string; transshipment: string;
  incoterms: string; portOfLoading: string | null; portOfDischarge: string | null;
  countryOfOrigin: string | null; goodsDescription: string | null; hsCode: string | null;
  linkedImportOrderId: number | null; linkedSupplierId: number | null;
  requiredDocuments: string | null; additionalConditions: string | null;
  paymentTerms: string; deferredPaymentDays: number | null;
  chargesApplicant: string; chargesBeneficiary: string;
  commissionRate: string; commissionAmount: string;
  insuranceRequired: boolean; insuranceCoverage: string;
  amendmentCount: number; lastAmendmentDate: string | null;
  negotiationDate: string | null; paymentDate: string | null;
  paidAmount: string; outstandingAmount: string;
  discrepancyNotes: string | null; rejectionReason: string | null;
  swiftMessageType: string; ucpVersion: string; governingLaw: string;
  notes: string | null; createdBy: string | null; approvedBy: string | null; approvedDate: string | null;
  createdAt: string;
}

interface Amendment {
  id: number; lcId: number; amendmentNumber: number; amendmentDate: string;
  amendmentType: string; description: string; oldValue: string | null; newValue: string | null;
  status: string; requestedBy: string | null; approvedBy: string | null; approvedDate: string | null;
  bankReference: string | null; feeAmount: string; notes: string | null; createdAt: string;
}

const emptyForm: any = {
  lcNumber: "", lcType: "Irrevocable", status: "טיוטה",
  issuingBank: "", issuingBankBranch: "", issuingBankSwift: "",
  advisingBank: "", advisingBankSwift: "", confirmingBank: "",
  applicantName: "", applicantAddress: "",
  beneficiaryName: "", beneficiaryAddress: "", beneficiaryCountry: "",
  amount: "0", currency: "USD",
  amountTolerancePlus: "0", amountToleranceMinus: "0", amountInWords: "",
  issueDate: "", expiryDate: "", expiryPlace: "", latestShipmentDate: "",
  presentationPeriod: 21, partialShipments: "Allowed", transshipment: "Allowed",
  incoterms: "FOB", portOfLoading: "", portOfDischarge: "",
  countryOfOrigin: "", goodsDescription: "", hsCode: "",
  requiredDocuments: "", additionalConditions: "",
  paymentTerms: "At Sight", deferredPaymentDays: "",
  chargesApplicant: "Opening charges", chargesBeneficiary: "Advising charges",
  commissionRate: "0", commissionAmount: "0",
  insuranceRequired: false, insuranceCoverage: "110",
  notes: "", createdBy: "", swiftMessageType: "MT700", ucpVersion: "UCP 600", governingLaw: "ICC Rules",
};

const emptyAmendment: any = {
  amendmentType: "שינוי סכום", description: "", oldValue: "", newValue: "",
  requestedBy: "", bankReference: "", feeAmount: "0", notes: "",
};


const load: any[] = [];
export default function LettersOfCreditPage() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "list" | "amendments" | "expiry">("dashboard");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<LC | null>(null);
  const [detailItem, setDetailItem] = useState<LC | null>(null);
  const [formData, setFormData] = useState<any>({ ...emptyForm });
  const [searchTerm, setSearchTerm] = useState("");
  const [showAmendForm, setShowAmendForm] = useState<LC | null>(null);
  const [amendForm, setAmendForm] = useState<any>({ ...emptyAmendment });
  const [expandedLc, setExpandedLc] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const qc = useQueryClient();
  const { selectedIds, toggle, toggleAll, clear, isSelected, isAllSelected } = useBulkSelection();

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["letters-of-credit"],
    queryFn: () => authFetch(`${API}/letters-of-credit`).then(r => r.json()),
  });
  const lcs: LC[] = useMemo(() => safeArray(rawData), [rawData]);

  const { data: rawAmendments } = useQuery({
    queryKey: ["lc-amendments", expandedLc],
    queryFn: () => expandedLc ? authFetch(`${API}/letters-of-credit/${expandedLc}/amendments`).then(r => r.json()) : [],
    enabled: !!expandedLc,
  });
  const amendments: Amendment[] = useMemo(() => safeArray(rawAmendments), [rawAmendments]);

  const createMut = useMutation({
    mutationFn: (d: any) => authFetch(`${API}/letters-of-credit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["letters-of-credit"] }); setShowForm(false); },
  });
  const updateMut = useMutation({
    mutationFn: (d: any) => authFetch(`${API}/letters-of-credit/${d.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["letters-of-credit"] }); setShowForm(false); setEditItem(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/letters-of-credit/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["letters-of-credit"] }),
  });
  const createAmendMut = useMutation({
    mutationFn: (d: any) => authFetch(`${API}/lc-amendments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lc-amendments"] }); qc.invalidateQueries({ queryKey: ["letters-of-credit"] }); setShowAmendForm(null); },
  });

  const openCreate = () => { setFormData({ ...emptyForm }); setEditItem(null); setShowForm(true); };
  const openEdit = (lc: LC) => { setFormData({ ...lc }); setEditItem(lc); setShowForm(true); };
  const handleSave = () => {
    const d = { ...formData };
    if (editItem) { d.id = editItem.id; updateMut.mutate(d); }
    else createMut.mutate(d);
  };

  const filtered = useMemo(() => {
    if (!searchTerm) return lcs;
    const s = searchTerm.toLowerCase();
    return lcs.filter(lc =>
      lc.lcNumber?.toLowerCase().includes(s) ||
      lc.issuingBank?.toLowerCase().includes(s) ||
      lc.beneficiaryName?.toLowerCase().includes(s) ||
      lc.applicantName?.toLowerCase().includes(s)
    );
  }, [lcs, searchTerm]);

  const total = lcs.length;
  const totalAmount = lcs.reduce((s, lc) => s + Number(lc.amount || 0), 0);
  const activeCount = lcs.filter(lc => ["פעיל", "הונפק", "בשימוש", "מאושר"].includes(lc.status)).length;
  const activeAmount = lcs.filter(lc => ["פעיל", "הונפק", "בשימוש", "מאושר"].includes(lc.status)).reduce((s, lc) => s + Number(lc.amount || 0), 0);
  const pendingPayment = lcs.filter(lc => ["ממתין לתשלום", "שולם חלקית"].includes(lc.status));
  const pendingAmount = pendingPayment.reduce((s, lc) => s + Number(lc.outstandingAmount || 0), 0);
  const paidTotal = lcs.reduce((s, lc) => s + Number(lc.paidAmount || 0), 0);
  const now = new Date();
  const expiringSoon = lcs.filter(lc => {
    if (!lc.expiryDate || ["שולם", "בוטל", "פג תוקף"].includes(lc.status)) return false;
    const diff = (new Date(lc.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  });
  const expired = lcs.filter(lc => lc.expiryDate && new Date(lc.expiryDate) < now && !["שולם", "בוטל", "פג תוקף"].includes(lc.status));
  const totalAmendments = lcs.reduce((s, lc) => s + (lc.amendmentCount || 0), 0);

  const kpis = [
    { label: "סה\"כ L/C", value: total, icon: Landmark, color: "blue" },
    { label: "פעילים", value: activeCount, icon: CheckCircle2, color: "green" },
    { label: "סכום כולל", value: fmtCur(totalAmount), icon: DollarSign, color: "indigo" },
    { label: "סכום פעיל", value: fmtCur(activeAmount), icon: TrendingUp, color: "teal" },
    { label: "ממתין לתשלום", value: fmtCur(pendingAmount), icon: Clock, color: "orange" },
    { label: "שולם", value: fmtCur(paidTotal), icon: CreditCard, color: "emerald" },
    { label: "פג בקרוב", value: expiringSoon.length, icon: AlertTriangle, color: "yellow" },
    { label: "תיקונים", value: totalAmendments, icon: FileCheck, color: "purple" },
  ];

  const statusDist = STATUSES.map(s => ({ status: s, count: lcs.filter(lc => lc.status === s).length, amount: lcs.filter(lc => lc.status === s).reduce((sum, lc) => sum + Number(lc.amount || 0), 0) })).filter(s => s.count > 0);

  const bankDist = Object.entries(lcs.reduce((acc: Record<string, { count: number; amount: number }>, lc) => {
    if (!acc[lc.issuingBank]) acc[lc.issuingBank] = { count: 0, amount: 0 };
    acc[lc.issuingBank].count++;
    acc[lc.issuingBank].amount += Number(lc.amount || 0);
    return acc;
  }, {})).sort((a, b) => b[1].amount - a[1].amount);

  const currDist = Object.entries(lcs.reduce((acc: Record<string, number>, lc) => {
    acc[lc.currency] = (acc[lc.currency] || 0) + Number(lc.amount || 0);
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);

  const daysToExpiry = (d: string) => {
    const diff = (new Date(d).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return Math.ceil(diff);
  };

  const TABS = [
    { key: "dashboard" as const, label: "לוח בקרה", icon: Landmark },
    { key: "list" as const, label: "רשימת L/C", icon: FileText },
    { key: "amendments" as const, label: "תיקונים", icon: FileCheck },
    { key: "expiry" as const, label: "מעקב תוקף", icon: Calendar },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50" dir="rtl">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <Landmark className="text-blue-600" /> מכתבי אשראי (L/C)
            </h1>
            <p className="text-muted-foreground mt-1">ניהול מכתבי אשראי דוקומנטריים, תיקונים, מעקב תוקף ותשלומים</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <ExportDropdown data={lcs} headers={{ lcNumber: "מספר L/C", status: "סטטוס", issuingBank: "בנק מנפיק", applicant: "מבקש", beneficiary: "מוטב", amount: "סכום", currency: "מטבע", issueDate: "תאריך הנפקה", expiryDate: "תפוגה", shipmentDate: "תאריך משלוח", advisingBank: "בנק מייעץ", lcType: "סוג" }} filename={"letters_of_credit"} />
            <button onClick={() => printPage("מכתבי אשראי (L/C)")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm">
              <Printer size={16} /> הדפסה
            </button>
            <button onClick={() => sendByEmail("מכתבי אשראי - טכנו-כל עוזי", generateEmailBody("מכתבי אשראי", lcs, { lcNumber: "מספר L/C", status: "סטטוס", issuingBank: "בנק", amount: "סכום", currency: "מטבע", expiryDate: "תפוגה" }))} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm">
              <Send size={16} /> שליחה
            </button>
            <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 text-foreground px-3 py-2 rounded-lg hover:bg-blue-700 shadow-lg text-sm">
              <Plus size={16} /> L/C חדש
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
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.key ? "bg-blue-600 text-foreground shadow-md" : "text-muted-foreground hover:bg-muted/30"}`}>
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-muted-foreground">טוען נתונים...</p>
          </div>
        ) : (
          <>
            {activeTab === "dashboard" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Landmark size={18} /> התפלגות לפי סטטוס</h3>
                  {statusDist.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">אין נתונים</p>
                  ) : (
                    <div className="space-y-2">
                      {statusDist.map(s => {
                        const Icon = STATUS_ICONS[s.status] || FileText;
                        return (
                          <div key={s.status} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                            <Icon size={14} className="text-muted-foreground" />
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s.status] || ""}`}>{s.status}</span>
                            <div className="flex-1 bg-muted rounded-full h-2">
                              <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${(s.count / total) * 100}%` }}></div>
                            </div>
                            <span className="text-sm font-bold text-foreground">{s.count}</span>
                            <span className="text-xs text-muted-foreground">{fmtCur(s.amount)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Building2 size={18} /> בנקים מנפיקים</h3>
                  {bankDist.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">אין נתונים</p>
                  ) : (
                    <div className="space-y-2">
                      {bankDist.map(([bank, data]) => (
                        <div key={bank} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                          <div>
                            <span className="font-medium text-foreground">{bank}</span>
                            <span className="text-xs text-muted-foreground mr-2">{data.count} L/C</span>
                          </div>
                          <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-sm font-bold">{fmtCur(data.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><DollarSign size={18} /> התפלגות מטבעות</h3>
                  {currDist.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">אין נתונים</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {currDist.map(([curr, amount]) => (
                        <div key={curr} className="bg-muted/30 rounded-lg p-3 text-center">
                          <div className="text-xl font-bold text-foreground">{curr}</div>
                          <div className="text-sm text-muted-foreground">{fmt(amount)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><AlertTriangle size={18} className="text-yellow-500" /> פג תוקף בקרוב (30 יום)</h3>
                  {expiringSoon.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">אין L/C שפג תוקפם בקרוב</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {expiringSoon.sort((a, b) => daysToExpiry(a.expiryDate) - daysToExpiry(b.expiryDate)).map(lc => {
                        const days = daysToExpiry(lc.expiryDate);
                        return (
                          <div key={lc.id} className={`flex items-center justify-between p-2 rounded-lg ${days <= 7 ? "bg-red-50 border border-red-200" : "bg-yellow-50 border border-yellow-200"}`}>
                            <div>
                              <span className="font-bold text-sm text-foreground">{lc.lcNumber}</span>
                              <span className="text-xs text-muted-foreground mr-2">{lc.beneficiaryName}</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${days <= 7 ? "bg-red-200 text-red-800" : "bg-yellow-200 text-yellow-800"}`}>
                              {days} ימים
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "list" && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                  <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    placeholder="חיפוש לפי מספר L/C, בנק, מוטב, מבקש..."
                    className="w-full pr-10 pl-4 py-2.5 border border-border rounded-xl bg-card focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <BulkActions selectedIds={selectedIds} onClear={clear} entityName="מכתבי אשראי" actions={defaultBulkActions(selectedIds, clear, () => qc.invalidateQueries({ queryKey: ["letters-of-credit"] }), `${API}/letters-of-credit`)} />
                {filtered.length === 0 ? (
                  <div className="text-center py-16 bg-card rounded-xl border border-slate-100">
                    <Landmark size={48} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-muted-foreground">אין מכתבי אשראי</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filtered.map(lc => {
                      const days = lc.expiryDate ? daysToExpiry(lc.expiryDate) : null;
                      const utilization = Number(lc.amount) > 0 ? (Number(lc.paidAmount || 0) / Number(lc.amount)) * 100 : 0;
                      return (
                        <motion.div key={lc.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          className={`bg-card rounded-xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-all ${isSelected(lc.id) ? "ring-2 ring-blue-400" : ""}`}>
                          <div className="mb-1"><BulkCheckbox checked={isSelected(lc.id)} onChange={() => toggle(lc.id)} /></div>
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-blue-700 text-lg">{lc.lcNumber}</span>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[lc.status] || ""}`}>{lc.status}</span>
                                <span className="px-2 py-0.5 bg-muted/50 text-muted-foreground rounded-full text-xs">{lc.lcType}</span>
                              </div>
                              <div className="text-sm text-muted-foreground mt-0.5">{lc.issuingBank}{lc.issuingBankSwift ? ` (${lc.issuingBankSwift})` : ""}</div>
                            </div>
                            <div className="text-left">
                              <div className="text-xl font-bold text-foreground">{lc.currency} {fmt(lc.amount)}</div>
                              {days !== null && (
                                <div className={`text-xs font-medium ${days < 0 ? "text-red-600" : days <= 14 ? "text-orange-600" : "text-muted-foreground"}`}>
                                  {days < 0 ? `פג תוקף לפני ${Math.abs(days)} ימים` : `${days} ימים לתפוגה`}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mb-3">
                            <div className="flex items-center gap-1 text-muted-foreground"><Building2 size={12} /> מבקש: <span className="font-medium">{lc.applicantName}</span></div>
                            <div className="flex items-center gap-1 text-muted-foreground"><Globe size={12} /> מוטב: <span className="font-medium">{lc.beneficiaryName}</span></div>
                            {lc.portOfLoading && <div className="flex items-center gap-1 text-muted-foreground"><Ship size={12} /> {lc.portOfLoading} → {lc.portOfDischarge}</div>}
                            <div className="flex items-center gap-1 text-muted-foreground"><CreditCard size={12} /> {lc.paymentTerms} | {lc.incoterms}</div>
                          </div>
                          <div className="flex items-center gap-3 mb-3">
                            <div className="flex-1">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-muted-foreground">ניצול</span>
                                <span className="font-medium text-foreground">{utilization.toFixed(0)}%</span>
                              </div>
                              <div className="w-full bg-muted/50 rounded-full h-2">
                                <div className={`h-2 rounded-full ${utilization >= 100 ? "bg-emerald-500" : utilization > 50 ? "bg-blue-500" : "bg-slate-300"}`}
                                  style={{ width: `${Math.min(utilization, 100)}%` }}></div>
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              שולם: <span className="font-bold text-green-700">{fmtCur(lc.paidAmount)}</span>
                              {Number(lc.outstandingAmount) > 0 && <> | יתרה: <span className="font-bold text-orange-700">{fmtCur(lc.outstandingAmount)}</span></>}
                            </div>
                            {lc.amendmentCount > 0 && (
                              <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs border border-purple-200">
                                {lc.amendmentCount} תיקונים
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1 pt-2 border-t border-slate-100">
                            <button onClick={() => setDetailItem(lc)} className="flex-1 flex items-center justify-center gap-1 text-blue-600 hover:bg-blue-50 rounded-lg py-1.5 text-sm"><Eye size={14} /> צפייה</button>
                            <button onClick={() => openEdit(lc)} className="flex-1 flex items-center justify-center gap-1 text-amber-600 hover:bg-amber-50 rounded-lg py-1.5 text-sm"><Edit2 size={14} /> עריכה</button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/letters-of-credit`, lc.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                            <button onClick={() => { setShowAmendForm(lc); setAmendForm({ ...emptyAmendment }); }} className="flex-1 flex items-center justify-center gap-1 text-purple-600 hover:bg-purple-50 rounded-lg py-1.5 text-sm"><PlusCircle size={14} /> תיקון</button>
                            {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק L/C זה?", { itemName: lc.lc_number || lc.reference || String(lc.id), entityType: "מכתב אשראי" }); if (ok) deleteMut.mutate(lc.id); }} className="flex-1 flex items-center justify-center gap-1 text-red-600 hover:bg-red-50 rounded-lg py-1.5 text-sm"><Trash2 size={14} /> מחיקה</button>}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === "amendments" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-purple-50 rounded-xl p-4 border border-purple-200 text-center">
                    <div className="text-lg sm:text-2xl font-bold text-purple-700">{totalAmendments}</div>
                    <div className="text-sm text-purple-600">סה"כ תיקונים</div>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-center">
                    <div className="text-lg sm:text-2xl font-bold text-blue-700">{lcs.filter(lc => lc.amendmentCount > 0).length}</div>
                    <div className="text-sm text-blue-600">L/C עם תיקונים</div>
                  </div>
                  <div className="bg-orange-50 rounded-xl p-4 border border-orange-200 text-center">
                    <div className="text-lg sm:text-2xl font-bold text-orange-700">{total > 0 ? (totalAmendments / total).toFixed(1) : "0"}</div>
                    <div className="text-sm text-orange-600">ממוצע תיקונים ל-L/C</div>
                  </div>
                </div>

                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><FileCheck size={18} /> תיקונים לפי L/C</h3>
                  {lcs.filter(lc => lc.amendmentCount > 0).length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">אין תיקונים עדיין</p>
                  ) : (
                    <div className="space-y-2">
                      {lcs.filter(lc => lc.amendmentCount > 0).sort((a, b) => b.amendmentCount - a.amendmentCount).map(lc => (
                        <div key={lc.id} className="border border-border rounded-lg overflow-hidden">
                          <button onClick={() => setExpandedLc(expandedLc === lc.id ? null : lc.id)}
                            className="w-full flex items-center justify-between p-3 hover:bg-muted/30">
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-blue-700">{lc.lcNumber}</span>
                              <span className="text-sm text-muted-foreground">{lc.beneficiaryName}</span>
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">{lc.amendmentCount} תיקונים</span>
                            </div>
                            {expandedLc === lc.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                          <AnimatePresence>
                            {expandedLc === lc.id && (
                              <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                                <div className="p-3 bg-muted/30 border-t border-border space-y-2">
                                  {amendments.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-3">טוען...</p>
                                  ) : amendments.map(a => (
                                    <div key={a.id} className="bg-card p-3 rounded-lg border border-border">
                                      <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                          <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-bold">#{a.amendmentNumber}</span>
                                          <span className="text-sm font-medium text-foreground">{a.amendmentType}</span>
                                          <span className={`px-1.5 py-0.5 rounded text-xs ${a.status === "מאושר" ? "bg-green-100 text-green-700" : a.status === "נדחה" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>{a.status}</span>
                                        </div>
                                        <span className="text-xs text-muted-foreground">{a.amendmentDate}</span>
                                      </div>
                                      <p className="text-sm text-muted-foreground">{a.description}</p>
                                      {(a.oldValue || a.newValue) && (
                                        <div className="flex gap-3 mt-1 text-xs">
                                          {a.oldValue && <span className="text-red-600">ישן: {a.oldValue}</span>}
                                          {a.newValue && <span className="text-green-600">חדש: {a.newValue}</span>}
                                        </div>
                                      )}
                                      {Number(a.feeAmount) > 0 && <div className="text-xs text-muted-foreground mt-1">עמלה: {fmtCur(a.feeAmount)}</div>}
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "expiry" && (
              <div className="space-y-4 sm:space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-red-50 rounded-xl p-4 border border-red-200 text-center">
                    <div className="text-lg sm:text-2xl font-bold text-red-700">{expired.length}</div>
                    <div className="text-sm text-red-600">פג תוקף</div>
                  </div>
                  <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200 text-center">
                    <div className="text-lg sm:text-2xl font-bold text-yellow-700">{expiringSoon.length}</div>
                    <div className="text-sm text-yellow-600">פג תוקף ב-30 יום</div>
                  </div>
                  <div className="bg-green-50 rounded-xl p-4 border border-green-200 text-center">
                    <div className="text-lg sm:text-2xl font-bold text-green-700">{lcs.filter(lc => lc.expiryDate && daysToExpiry(lc.expiryDate) > 30 && !["שולם", "בוטל", "פג תוקף"].includes(lc.status)).length}</div>
                    <div className="text-sm text-green-600">תקין (מעל 30 יום)</div>
                  </div>
                </div>

                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Calendar size={18} /> מעקב תפוגה</h3>
                  {lcs.filter(lc => !["שולם", "בוטל", "פג תוקף"].includes(lc.status)).length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">אין L/C פעילים</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/30">
                          <tr>
                            <th className="text-right p-2 font-medium">מס' L/C</th>
                            <th className="text-right p-2 font-medium">מוטב</th>
                            <th className="text-right p-2 font-medium">סכום</th>
                            <th className="text-right p-2 font-medium">תאריך הנפקה</th>
                            <th className="text-right p-2 font-medium">תפוגה</th>
                            <th className="text-right p-2 font-medium">ימים שנותרו</th>
                            <th className="text-right p-2 font-medium">סטטוס</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...lcs].filter(lc => !["שולם", "בוטל", "פג תוקף"].includes(lc.status))
                            .sort((a, b) => daysToExpiry(a.expiryDate) - daysToExpiry(b.expiryDate))
                            .map(lc => {
                              const days = daysToExpiry(lc.expiryDate);
                              return (
                                <tr key={lc.id} className={`border-t border-slate-100 ${days < 0 ? "bg-red-50" : days <= 14 ? "bg-orange-50" : days <= 30 ? "bg-yellow-50" : "hover:bg-muted/30"}`}>
                                  <td className="p-2 font-bold text-blue-700">{lc.lcNumber}</td>
                                  <td className="p-2 text-foreground">{lc.beneficiaryName}</td>
                                  <td className="p-2 font-medium">{lc.currency} {fmt(lc.amount)}</td>
                                  <td className="p-2">{lc.issueDate || "-"}</td>
                                  <td className="p-2 font-medium">{lc.expiryDate}</td>
                                  <td className="p-2">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${days < 0 ? "bg-red-200 text-red-800" : days <= 14 ? "bg-orange-200 text-orange-800" : days <= 30 ? "bg-yellow-200 text-yellow-800" : "bg-green-200 text-green-800"}`}>
                                      {days < 0 ? `פג לפני ${Math.abs(days)} ימים` : `${days} ימים`}
                                    </span>
                                  </td>
                                  <td className="p-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[lc.status]}`}>{lc.status}</span></td>
                                </tr>
                              );
                            })}
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
                <h2 className="text-lg font-bold text-foreground">{editItem ? "עריכת L/C" : "L/C חדש"}</h2>
                <button onClick={() => { setShowForm(false); setEditItem(null); }} className="p-1 hover:bg-muted/50 rounded-lg"><X size={20} /></button>
              </div>
              <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-blue-700 px-2">פרטי L/C</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground">מספר L/C (אוטומטי)</label>
                      <input value={formData.lcNumber || ""} onChange={e => setFormData({ ...formData, lcNumber: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" placeholder="LC-YYYY-NNNN" /></div>
                    <div><label className="text-xs text-muted-foreground">סוג L/C</label>
                      <select value={formData.lcType} onChange={e => setFormData({ ...formData, lcType: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                        {LC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select></div>
                    <div><label className="text-xs text-muted-foreground">סטטוס</label>
                      <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-blue-700 px-2">בנקים</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground">בנק מנפיק *</label>
                      <input value={formData.issuingBank || ""} onChange={e => setFormData({ ...formData, issuingBank: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" required /></div>
                    <div><label className="text-xs text-muted-foreground">סניף</label>
                      <input value={formData.issuingBankBranch || ""} onChange={e => setFormData({ ...formData, issuingBankBranch: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">SWIFT בנק מנפיק</label>
                      <input value={formData.issuingBankSwift || ""} onChange={e => setFormData({ ...formData, issuingBankSwift: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">בנק מייעץ</label>
                      <input value={formData.advisingBank || ""} onChange={e => setFormData({ ...formData, advisingBank: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">SWIFT בנק מייעץ</label>
                      <input value={formData.advisingBankSwift || ""} onChange={e => setFormData({ ...formData, advisingBankSwift: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">בנק מאשר</label>
                      <input value={formData.confirmingBank || ""} onChange={e => setFormData({ ...formData, confirmingBank: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-blue-700 px-2">מבקש ומוטב</legend>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">שם מבקש (Applicant) *</label>
                      <input value={formData.applicantName || ""} onChange={e => setFormData({ ...formData, applicantName: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" required /></div>
                    <div><label className="text-xs text-muted-foreground">כתובת מבקש</label>
                      <input value={formData.applicantAddress || ""} onChange={e => setFormData({ ...formData, applicantAddress: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">שם מוטב (Beneficiary) *</label>
                      <input value={formData.beneficiaryName || ""} onChange={e => setFormData({ ...formData, beneficiaryName: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" required /></div>
                    <div><label className="text-xs text-muted-foreground">כתובת מוטב</label>
                      <input value={formData.beneficiaryAddress || ""} onChange={e => setFormData({ ...formData, beneficiaryAddress: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">ארץ מוטב</label>
                      <input value={formData.beneficiaryCountry || ""} onChange={e => setFormData({ ...formData, beneficiaryCountry: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-blue-700 px-2">סכום ומטבע</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground">סכום *</label>
                      <input type="number" step="0.01" value={formData.amount || ""} onChange={e => setFormData({ ...formData, amount: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">מטבע</label>
                      <select value={formData.currency} onChange={e => setFormData({ ...formData, currency: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select></div>
                    <div><label className="text-xs text-muted-foreground">סכום במילים</label>
                      <input value={formData.amountInWords || ""} onChange={e => setFormData({ ...formData, amountInWords: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">סבילות + (%)</label>
                      <input type="number" step="0.01" value={formData.amountTolerancePlus || ""} onChange={e => setFormData({ ...formData, amountTolerancePlus: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">סבילות - (%)</label>
                      <input type="number" step="0.01" value={formData.amountToleranceMinus || ""} onChange={e => setFormData({ ...formData, amountToleranceMinus: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-blue-700 px-2">תאריכים</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground">תאריך הנפקה</label>
                      <input type="date" value={formData.issueDate || ""} onChange={e => setFormData({ ...formData, issueDate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">תאריך תפוגה *</label>
                      <input type="date" value={formData.expiryDate || ""} onChange={e => setFormData({ ...formData, expiryDate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" required /></div>
                    <div><label className="text-xs text-muted-foreground">מקום תפוגה</label>
                      <input value={formData.expiryPlace || ""} onChange={e => setFormData({ ...formData, expiryPlace: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">תאריך משלוח אחרון</label>
                      <input type="date" value={formData.latestShipmentDate || ""} onChange={e => setFormData({ ...formData, latestShipmentDate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">תקופת הצגה (ימים)</label>
                      <input type="number" value={formData.presentationPeriod || ""} onChange={e => setFormData({ ...formData, presentationPeriod: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-blue-700 px-2">משלוח וסחר</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground">Incoterms</label>
                      <select value={formData.incoterms} onChange={e => setFormData({ ...formData, incoterms: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                        {INCOTERMS.map(i => <option key={i} value={i}>{i}</option>)}
                      </select></div>
                    <div><label className="text-xs text-muted-foreground">משלוחים חלקיים</label>
                      <select value={formData.partialShipments} onChange={e => setFormData({ ...formData, partialShipments: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                        <option value="Allowed">Allowed</option><option value="Not Allowed">Not Allowed</option>
                      </select></div>
                    <div><label className="text-xs text-muted-foreground">Transshipment</label>
                      <select value={formData.transshipment} onChange={e => setFormData({ ...formData, transshipment: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                        <option value="Allowed">Allowed</option><option value="Not Allowed">Not Allowed</option>
                      </select></div>
                    <div><label className="text-xs text-muted-foreground">נמל טעינה</label>
                      <input value={formData.portOfLoading || ""} onChange={e => setFormData({ ...formData, portOfLoading: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">נמל פריקה</label>
                      <input value={formData.portOfDischarge || ""} onChange={e => setFormData({ ...formData, portOfDischarge: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">ארץ מקור</label>
                      <input value={formData.countryOfOrigin || ""} onChange={e => setFormData({ ...formData, countryOfOrigin: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-blue-700 px-2">סחורה</legend>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="md:col-span-2"><label className="text-xs text-muted-foreground">תיאור סחורה</label>
                      <textarea value={formData.goodsDescription || ""} onChange={e => setFormData({ ...formData, goodsDescription: e.target.value })} rows={2} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">קוד HS</label>
                      <input value={formData.hsCode || ""} onChange={e => setFormData({ ...formData, hsCode: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-blue-700 px-2">תשלום ועמלות</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground">תנאי תשלום</label>
                      <select value={formData.paymentTerms} onChange={e => setFormData({ ...formData, paymentTerms: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                        {PAYMENT_TERMS_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select></div>
                    <div><label className="text-xs text-muted-foreground">ימי דחייה</label>
                      <input type="number" value={formData.deferredPaymentDays || ""} onChange={e => setFormData({ ...formData, deferredPaymentDays: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">אחוז עמלה</label>
                      <input type="number" step="0.001" value={formData.commissionRate || ""} onChange={e => setFormData({ ...formData, commissionRate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">סכום עמלה</label>
                      <input type="number" step="0.01" value={formData.commissionAmount || ""} onChange={e => setFormData({ ...formData, commissionAmount: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <label className="flex items-center gap-2 p-2 hover:bg-muted/30 rounded-lg cursor-pointer">
                      <input type="checkbox" checked={formData.insuranceRequired || false} onChange={e => setFormData({ ...formData, insuranceRequired: e.target.checked })} className="w-4 h-4" />
                      <span className="text-sm">ביטוח נדרש</span></label>
                    <div><label className="text-xs text-muted-foreground">כיסוי ביטוח (%)</label>
                      <input type="number" step="0.01" value={formData.insuranceCoverage || ""} onChange={e => setFormData({ ...formData, insuranceCoverage: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-blue-700 px-2">מסמכים ותנאים</legend>
                  <div className="grid grid-cols-1 gap-3">
                    <div><label className="text-xs text-muted-foreground">מסמכים נדרשים</label>
                      <textarea value={formData.requiredDocuments || ""} onChange={e => setFormData({ ...formData, requiredDocuments: e.target.value })} rows={3} className="w-full border border-border rounded-lg p-2 text-sm"
                        placeholder="חשבונית מסחרית, שטר מטען, תעודת מקור, רשימת אריזה..." /></div>
                    <div><label className="text-xs text-muted-foreground">תנאים נוספים</label>
                      <textarea value={formData.additionalConditions || ""} onChange={e => setFormData({ ...formData, additionalConditions: e.target.value })} rows={2} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-blue-700 px-2">כללי</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground">הודעת SWIFT</label>
                      <input value={formData.swiftMessageType || ""} onChange={e => setFormData({ ...formData, swiftMessageType: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">גרסת UCP</label>
                      <input value={formData.ucpVersion || ""} onChange={e => setFormData({ ...formData, ucpVersion: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">דין חל</label>
                      <input value={formData.governingLaw || ""} onChange={e => setFormData({ ...formData, governingLaw: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">נוצר ע"י</label>
                      <input value={formData.createdBy || ""} onChange={e => setFormData({ ...formData, createdBy: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </div>
                  <div className="mt-3"><label className="text-xs text-muted-foreground">הערות</label>
                    <textarea value={formData.notes || ""} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                </fieldset>
              </div>
              <div className="flex gap-3 p-4 border-t border-slate-100 sticky bottom-0 bg-card rounded-b-2xl">
                <button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-foreground py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  <Save size={16} /> {editItem ? "עדכון" : "שמירה"}
                </button>
                <button onClick={() => { setShowForm(false); setEditItem(null); }} className="px-6 py-2.5 border border-border rounded-lg hover:bg-muted/30">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Amendment Form Modal */}
      <AnimatePresence>
        {showAmendForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-lg">
              <div className="flex items-center justify-between p-4 border-b border-slate-100">
                <h2 className="text-lg font-bold text-foreground">תיקון ל-{showAmendForm.lcNumber}</h2>
                <button onClick={() => setShowAmendForm(null)} className="p-1 hover:bg-muted/50 rounded-lg"><X size={20} /></button>
              </div>
              <div className="p-5 space-y-3">
                <div><label className="text-xs text-muted-foreground">סוג תיקון</label>
                  <select value={amendForm.amendmentType} onChange={e => setAmendForm({ ...amendForm, amendmentType: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                    {AMENDMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select></div>
                <div><label className="text-xs text-muted-foreground">תיאור *</label>
                  <textarea value={amendForm.description || ""} onChange={e => setAmendForm({ ...amendForm, description: e.target.value })} rows={2} className="w-full border border-border rounded-lg p-2 text-sm" required /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground">ערך ישן</label>
                    <input value={amendForm.oldValue || ""} onChange={e => setAmendForm({ ...amendForm, oldValue: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground">ערך חדש</label>
                    <input value={amendForm.newValue || ""} onChange={e => setAmendForm({ ...amendForm, newValue: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground">מבקש</label>
                    <input value={amendForm.requestedBy || ""} onChange={e => setAmendForm({ ...amendForm, requestedBy: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground">עמלת תיקון</label>
                    <input type="number" step="0.01" value={amendForm.feeAmount || ""} onChange={e => setAmendForm({ ...amendForm, feeAmount: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                </div>
                <div><label className="text-xs text-muted-foreground">אסמכתא בנק</label>
                  <input value={amendForm.bankReference || ""} onChange={e => setAmendForm({ ...amendForm, bankReference: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
              </div>
              <div className="flex gap-3 p-4 border-t border-slate-100">
                <button onClick={() => createAmendMut.mutate({ ...amendForm, lcId: showAmendForm.id, amendmentNumber: (showAmendForm.amendmentCount || 0) + 1 })}
                  disabled={createAmendMut.isPending} className="flex-1 flex items-center justify-center gap-2 bg-purple-600 text-foreground py-2.5 rounded-lg hover:bg-purple-700 disabled:opacity-50">
                  <Save size={16} /> הוספת תיקון
                </button>
                <button onClick={() => setShowAmendForm(null)} className="px-6 py-2.5 border border-border rounded-lg hover:bg-muted/30">ביטול</button>
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
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Landmark size={20} className="text-blue-600" /> {detailItem.lcNumber}</h2>
                  <div className="flex gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[detailItem.status]}`}>{detailItem.status}</span>
                    <span className="px-2 py-0.5 bg-muted/50 rounded-full text-xs">{detailItem.lcType}</span>
                    <span className="px-2 py-0.5 bg-muted/50 rounded-full text-xs">{detailItem.swiftMessageType}</span>
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
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-center">
                  <div className="text-xl sm:text-3xl font-bold text-blue-800">{detailItem.currency} {fmt(detailItem.amount)}</div>
                  {detailItem.amountInWords && <div className="text-sm text-blue-600 mt-1">{detailItem.amountInWords}</div>}
                  {(Number(detailItem.amountTolerancePlus) > 0 || Number(detailItem.amountToleranceMinus) > 0) &&
                    <div className="text-xs text-blue-500 mt-1">סבילות: +{detailItem.amountTolerancePlus}% / -{detailItem.amountToleranceMinus}%</div>}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                    <div className="text-xs text-green-600">שולם</div>
                    <div className="font-bold text-green-800">{fmtCur(detailItem.paidAmount)}</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3 text-center border border-orange-200">
                    <div className="text-xs text-orange-600">יתרה</div>
                    <div className="font-bold text-orange-800">{fmtCur(detailItem.outstandingAmount)}</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3 text-center border border-purple-200">
                    <div className="text-xs text-purple-600">עמלה</div>
                    <div className="font-bold text-purple-800">{fmtCur(detailItem.commissionAmount)}</div>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 text-center border border-border">
                    <div className="text-xs text-muted-foreground">תיקונים</div>
                    <div className="font-bold text-foreground">{detailItem.amendmentCount}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { label: "בנק מנפיק", value: detailItem.issuingBank },
                    { label: "SWIFT מנפיק", value: detailItem.issuingBankSwift },
                    { label: "בנק מייעץ", value: detailItem.advisingBank },
                    { label: "מבקש", value: detailItem.applicantName },
                    { label: "מוטב", value: detailItem.beneficiaryName },
                    { label: "ארץ מוטב", value: detailItem.beneficiaryCountry },
                    { label: "תנאי תשלום", value: detailItem.paymentTerms },
                    { label: "Incoterms", value: detailItem.incoterms },
                    { label: "נמל טעינה", value: detailItem.portOfLoading },
                    { label: "נמל פריקה", value: detailItem.portOfDischarge },
                    { label: "ארץ מקור", value: detailItem.countryOfOrigin },
                    { label: "קוד HS", value: detailItem.hsCode },
                  ].filter(f => f.value).map((f, i) => (
                    <div key={i} className="bg-muted/30 rounded-lg p-2">
                      <div className="text-xs text-muted-foreground">{f.label}</div>
                      <div className="font-medium text-sm text-foreground">{f.value}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "תאריך הנפקה", value: detailItem.issueDate },
                    { label: "תפוגה", value: detailItem.expiryDate },
                    { label: "משלוח אחרון", value: detailItem.latestShipmentDate },
                    { label: "תקופת הצגה", value: detailItem.presentationPeriod ? `${detailItem.presentationPeriod} ימים` : null },
                  ].filter(f => f.value).map((f, i) => (
                    <div key={i} className="bg-blue-50 rounded-lg p-2 text-center border border-blue-200">
                      <div className="text-xs text-blue-600">{f.label}</div>
                      <div className="font-bold text-sm text-foreground">{f.value}</div>
                    </div>
                  ))}
                </div>

                {detailItem.goodsDescription && (
                  <div className="bg-muted/30 rounded-xl p-4 border border-border">
                    <h4 className="font-bold text-sm text-foreground mb-1">תיאור סחורה</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{detailItem.goodsDescription}</p>
                  </div>
                )}

                {detailItem.requiredDocuments && (
                  <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                    <h4 className="font-bold text-sm text-yellow-700 mb-1">מסמכים נדרשים</h4>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{detailItem.requiredDocuments}</p>
                  </div>
                )}

                {detailItem.discrepancyNotes && (
                  <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                    <h4 className="font-bold text-sm text-red-700 mb-1">אי התאמות</h4>
                    <p className="text-sm text-foreground">{detailItem.discrepancyNotes}</p>
                  </div>
                )}

                {detailItem.notes && (
                  <div className="bg-muted/30 rounded-xl p-4 border border-border">
                    <h4 className="font-bold text-sm text-foreground mb-1">הערות</h4>
                    <p className="text-sm text-muted-foreground">{detailItem.notes}</p>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-slate-100">
                  <span>{detailItem.ucpVersion} | {detailItem.governingLaw}</span>
                  {detailItem.createdBy && <span>נוצר ע"י: {detailItem.createdBy}</span>}
                </div>
                </>)}
                {detailTab === "related" && <RelatedRecords entityType="letters-of-credit" entityId={detailItem.id} />}
                {detailTab === "attachments" && <AttachmentsSection entityType="letters-of-credit" entityId={detailItem.id} />}
                {detailTab === "history" && <ActivityLog entityType="letters-of-credit" entityId={detailItem.id} />}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
