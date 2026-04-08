import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Shield, DollarSign, Calendar, AlertTriangle, CheckCircle2,
  Search, Plus, Edit2, Trash2, X, Save, Eye, Anchor,
  Package, Clock, Hash, Phone, Mail, ChevronDown, ChevronUp,
  ClipboardCheck, FileCheck, Truck, Globe, ArrowUpDown, Copy
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";

interface CustomsClearance {
  id: number;
  clearanceNumber: string;
  importOrderId: number | null;
  declarationNumber: string | null;
  customsBroker: string | null;
  brokerPhone: string | null;
  brokerEmail: string | null;
  portOfEntry: string;
  arrivalDate: string | null;
  submissionDate: string | null;
  releaseDate: string | null;
  clearanceDate: string | null;
  goodsValue: string;
  goodsCurrency: string;
  exchangeRate: string;
  goodsValueIls: string;
  customsDutyPct: string;
  customsDutyAmount: string;
  purchaseTaxPct: string;
  purchaseTaxAmount: string;
  vatPct: string;
  vatAmount: string;
  portFees: string;
  storageFees: string;
  inspectionFees: string;
  brokerFees: string;
  otherFees: string;
  totalFees: string;
  totalTaxes: string;
  totalCost: string;
  hsCodes: string | null;
  customsClassification: string | null;
  containerNumbers: string | null;
  billOfLading: string | null;
  docCommercialInvoice: boolean;
  docPackingList: boolean;
  docBillOfLading: boolean;
  docCertificateOfOrigin: boolean;
  docInsuranceCertificate: boolean;
  docCustomsDeclaration: boolean;
  docInspectionReport: boolean;
  docLetterOfCredit: boolean;
  docPhytosanitary: boolean;
  docStandardsCertificate: boolean;
  supplierName: string | null;
  countryOfOrigin: string | null;
  responsiblePerson: string | null;
  notes: string | null;
  status: string;
  priority: string;
  createdAt: string;
}

const STATUSES = ["ממתין", "בבדיקה", "הוגש לרשות", "בתהליך שחרור", "ממתין לתשלום", "שוחרר", "נדחה", "מבוטל"];
const PRIORITIES = ["רגילה", "גבוהה", "דחופה"];
const PORTS = ["חיפה", "אשדוד", "נתב\"ג - מטען אווירי", "אילת", "נמל בן גוריון"];
const CURRENCIES = ["USD", "EUR", "GBP", "CNY", "JPY", "ILS"];

const STATUS_COLORS: Record<string, string> = {
  "ממתין": "bg-muted/50 text-foreground",
  "בבדיקה": "bg-blue-100 text-blue-800",
  "הוגש לרשות": "bg-indigo-100 text-indigo-800",
  "בתהליך שחרור": "bg-yellow-100 text-yellow-800",
  "ממתין לתשלום": "bg-orange-100 text-orange-800",
  "שוחרר": "bg-green-100 text-green-800",
  "נדחה": "bg-red-100 text-red-800",
  "מבוטל": "bg-muted text-muted-foreground",
};

const PRIORITY_COLORS: Record<string, string> = {
  "רגילה": "bg-muted/50 text-foreground",
  "גבוהה": "bg-orange-100 text-orange-700",
  "דחופה": "bg-red-100 text-red-700",
};

const DOCUMENT_LIST = [
  { key: "docCommercialInvoice", label: "חשבונית מסחרית" },
  { key: "docPackingList", label: "רשימת אריזה" },
  { key: "docBillOfLading", label: "שטר מטען" },
  { key: "docCertificateOfOrigin", label: "תעודת מקור" },
  { key: "docInsuranceCertificate", label: "תעודת ביטוח" },
  { key: "docCustomsDeclaration", label: "הצהרת מכס" },
  { key: "docInspectionReport", label: "דו\"ח בדיקה" },
  { key: "docLetterOfCredit", label: "מכתב אשראי" },
  { key: "docPhytosanitary", label: "תעודה פיטוסניטרית" },
  { key: "docStandardsCertificate", label: "תעודת תקן" },
];

const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtCur = (v: any, c = "₪") => `${c}${fmt(v)}`;

const emptyForm: Partial<CustomsClearance> = {
  clearanceNumber: "",
  importOrderId: null,
  declarationNumber: "",
  customsBroker: "",
  brokerPhone: "",
  brokerEmail: "",
  portOfEntry: "חיפה",
  arrivalDate: "",
  submissionDate: "",
  releaseDate: "",
  clearanceDate: "",
  goodsValue: "0",
  goodsCurrency: "USD",
  exchangeRate: "1",
  goodsValueIls: "0",
  customsDutyPct: "0",
  customsDutyAmount: "0",
  purchaseTaxPct: "0",
  purchaseTaxAmount: "0",
  vatPct: "18",
  vatAmount: "0",
  portFees: "0",
  storageFees: "0",
  inspectionFees: "0",
  brokerFees: "0",
  otherFees: "0",
  totalFees: "0",
  totalTaxes: "0",
  totalCost: "0",
  hsCodes: "",
  customsClassification: "",
  containerNumbers: "",
  billOfLading: "",
  docCommercialInvoice: false,
  docPackingList: false,
  docBillOfLading: false,
  docCertificateOfOrigin: false,
  docInsuranceCertificate: false,
  docCustomsDeclaration: false,
  docInspectionReport: false,
  docLetterOfCredit: false,
  docPhytosanitary: false,
  docStandardsCertificate: false,
  supplierName: "",
  countryOfOrigin: "",
  responsiblePerson: "",
  notes: "",
  status: "ממתין",
  priority: "רגילה",
};

export default function CustomsClearancePage() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "list" | "documents" | "taxes">("dashboard");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<CustomsClearance | null>(null);
  const [detailItem, setDetailItem] = useState<CustomsClearance | null>(null);
  const [formData, setFormData] = useState<any>({ ...emptyForm });
  const [searchTerm, setSearchTerm] = useState("");
  const [detailTab, setDetailTab] = useState("details");
  const qc = useQueryClient();
  const { selectedIds, toggle, toggleAll, clear, isSelected, isAllSelected } = useBulkSelection();

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["customs-clearances"],
    queryFn: () => authFetch(`${API}/customs-clearances`).then(r => r.json()),
  });

  const clearances: CustomsClearance[] = useMemo(() => safeArray(rawData), [rawData]);

  const createMut = useMutation({
    mutationFn: (d: any) => authFetch(`${API}/customs-clearances`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customs-clearances"] }); setShowForm(false); },
  });

  const updateMut = useMutation({
    mutationFn: (d: any) => authFetch(`${API}/customs-clearances/${d.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customs-clearances"] }); setShowForm(false); setEditItem(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/customs-clearances/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customs-clearances"] }); },
  });

  const openCreate = () => { setFormData({ ...emptyForm }); setEditItem(null); setShowForm(true); };
  const openEdit = (c: CustomsClearance) => { setFormData({ ...c }); setEditItem(c); setShowForm(true); };
  const handleSave = () => {
    const d = { ...formData };
    if (editItem) { d.id = editItem.id; updateMut.mutate(d); }
    else createMut.mutate(d);
  };

  const filtered = useMemo(() => {
    if (!searchTerm) return clearances;
    const s = searchTerm.toLowerCase();
    return clearances.filter(c =>
      c.clearanceNumber?.toLowerCase().includes(s) ||
      c.declarationNumber?.toLowerCase().includes(s) ||
      c.customsBroker?.toLowerCase().includes(s) ||
      c.supplierName?.toLowerCase().includes(s)
    );
  }, [clearances, searchTerm]);

  const totalClearances = clearances.length;
  const activeClearances = clearances.filter(c => !["שוחרר", "נדחה", "מבוטל"].includes(c.status)).length;
  const released = clearances.filter(c => c.status === "שוחרר").length;
  const pending = clearances.filter(c => c.status === "ממתין").length;
  const inProcess = clearances.filter(c => c.status === "בתהליך שחרור").length;
  const totalDuty = clearances.reduce((s, c) => s + Number(c.customsDutyAmount || 0), 0);
  const totalVat = clearances.reduce((s, c) => s + Number(c.vatAmount || 0), 0);
  const totalAllTaxes = clearances.reduce((s, c) => s + Number(c.totalTaxes || 0), 0);
  const totalAllFees = clearances.reduce((s, c) => s + Number(c.totalFees || 0), 0);
  const totalCosts = clearances.reduce((s, c) => s + Number(c.totalCost || 0), 0);

  const statusDist = STATUSES.map(s => ({ status: s, count: clearances.filter(c => c.status === s).length }));
  const portDist = Object.entries(
    clearances.reduce((acc: Record<string, number>, c) => { const p = c.portOfEntry || "אחר"; acc[p] = (acc[p] || 0) + 1; return acc; }, {})
  ).sort((a, b) => b[1] - a[1]);

  const docStats = DOCUMENT_LIST.map(d => ({
    ...d,
    count: clearances.filter(c => (c as any)[d.key]).length,
    pct: totalClearances > 0 ? Math.round((clearances.filter(c => (c as any)[d.key]).length / totalClearances) * 100) : 0,
  }));

  const kpis = [
    { label: "סה\"כ תיקים", value: totalClearances, icon: FileText, color: "blue" },
    { label: "תיקים פעילים", value: activeClearances, icon: Clock, color: "orange" },
    { label: "שוחררו", value: released, icon: CheckCircle2, color: "green" },
    { label: "ממתינים", value: pending, icon: AlertTriangle, color: "yellow" },
    { label: "בתהליך שחרור", value: inProcess, icon: Truck, color: "indigo" },
    { label: "סה\"כ מכס", value: fmtCur(totalDuty), icon: Shield, color: "red" },
    { label: "סה\"כ מע\"מ", value: fmtCur(totalVat), icon: DollarSign, color: "purple" },
    { label: "סה\"כ עלויות", value: fmtCur(totalCosts), icon: Package, color: "teal" },
  ];

  const TABS = [
    { key: "dashboard" as const, label: "לוח בקרה", icon: FileText },
    { key: "list" as const, label: "רשימת תיקים", icon: ClipboardCheck },
    { key: "documents" as const, label: "מסמכים", icon: FileCheck },
    { key: "taxes" as const, label: "מיסים ועמלות", icon: DollarSign },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50" dir="rtl">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <Shield className="text-blue-600" /> עמילות מכס
            </h1>
            <p className="text-muted-foreground mt-1">ניהול שחרור מכס, מיסים ומסמכים</p>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 text-foreground px-4 py-2 rounded-lg hover:bg-blue-700 transition-all shadow-lg">
            <Plus size={18} /> תיק מכס חדש
          </button>
        </div>

        {/* KPIs */}
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

        {/* Tabs */}
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
            {/* Dashboard */}
            {activeTab === "dashboard" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Status Distribution */}
                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><ArrowUpDown size={18} /> התפלגות סטטוס</h3>
                  <div className="space-y-2">
                    {statusDist.map(s => (
                      <div key={s.status} className="flex items-center justify-between">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[s.status] || "bg-muted/50"}`}>{s.status}</span>
                        <div className="flex-1 mx-3 bg-muted/50 rounded-full h-2">
                          <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${totalClearances > 0 ? (s.count / totalClearances) * 100 : 0}%` }}></div>
                        </div>
                        <span className="text-sm font-bold text-foreground w-8 text-center">{s.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Port Distribution */}
                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Anchor size={18} /> התפלגות לפי נמל</h3>
                  {portDist.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">אין נתונים</p>
                  ) : (
                    <div className="space-y-3">
                      {portDist.map(([port, count]) => (
                        <div key={port} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                          <span className="font-medium text-foreground">{port}</span>
                          <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-sm font-bold">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Clearance Pipeline */}
                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100 md:col-span-2">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Truck size={18} /> צינור שחרור</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: "ממתין", status: "ממתין", color: "gray", icon: Clock },
                      { label: "בבדיקה", status: "בבדיקה", color: "blue", icon: Search },
                      { label: "הוגש / בתהליך", statuses: ["הוגש לרשות", "בתהליך שחרור"], color: "yellow", icon: FileText },
                      { label: "שוחרר", status: "שוחרר", color: "green", icon: CheckCircle2 },
                    ].map((step, i) => {
                      const count = "statuses" in step
                        ? clearances.filter(c => step.statuses!.includes(c.status)).length
                        : clearances.filter(c => c.status === step.status).length;
                      return (
                        <div key={i} className={`text-center p-4 rounded-xl border-2 border-${step.color}-200 bg-${step.color}-50`}>
                          <step.icon size={28} className={`mx-auto mb-2 text-${step.color}-500`} />
                          <div className="text-lg sm:text-2xl font-bold text-foreground">{count}</div>
                          <div className="text-sm text-muted-foreground">{step.label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100 md:col-span-2">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><DollarSign size={18} /> סיכום פיננסי</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                      { label: "מכס", value: totalDuty, color: "red" },
                      { label: "מס קנייה", value: clearances.reduce((s, c) => s + Number(c.purchaseTaxAmount || 0), 0), color: "orange" },
                      { label: "מע\"מ", value: totalVat, color: "purple" },
                      { label: "עמלות", value: totalAllFees, color: "blue" },
                      { label: "סה\"כ", value: totalCosts, color: "green" },
                    ].map((item, i) => (
                      <div key={i} className={`text-center p-3 rounded-xl bg-${item.color}-50 border border-${item.color}-200`}>
                        <div className={`text-lg font-bold text-${item.color}-700`}>{fmtCur(item.value)}</div>
                        <div className="text-sm text-muted-foreground">{item.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* List View */}
            {activeTab === "list" && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                  <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    placeholder="חיפוש לפי מספר תיק, הצהרה, עמיל מכס, ספק..."
                    className="w-full pr-10 pl-4 py-2.5 border border-border rounded-xl bg-card focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <BulkActions selectedIds={selectedIds} onClear={clear} entityName="תיקי מכס" actions={defaultBulkActions(selectedIds, clear, () => qc.invalidateQueries({ queryKey: ["customs-clearances"] }), `${API}/customs-clearances`)} />
                {filtered.length === 0 ? (
                  <div className="text-center py-16 bg-card rounded-xl border border-slate-100">
                    <Shield size={48} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-muted-foreground">אין תיקי מכס</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filtered.map(c => {
                      const docCount = DOCUMENT_LIST.filter(d => (c as any)[d.key]).length;
                      return (
                        <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          className={`bg-card rounded-xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-all ${isSelected(c.id) ? "ring-2 ring-blue-400" : ""}`}>
                          <div className="flex items-start justify-between mb-3">
                            <BulkCheckbox checked={isSelected(c.id)} onChange={() => toggle(c.id)} />
                            <div>
                              <div className="font-bold text-blue-700 text-lg">{c.clearanceNumber}</div>
                              {c.declarationNumber && <div className="text-xs text-muted-foreground">הצהרה: {c.declarationNumber}</div>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[c.priority] || ""}`}>{c.priority}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] || ""}`}>{c.status}</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                            {c.customsBroker && <div><span className="text-muted-foreground">עמיל:</span> <span className="font-medium">{c.customsBroker}</span></div>}
                            {c.supplierName && <div><span className="text-muted-foreground">ספק:</span> <span className="font-medium">{c.supplierName}</span></div>}
                            <div><span className="text-muted-foreground">נמל:</span> <span className="font-medium">{c.portOfEntry}</span></div>
                            {c.countryOfOrigin && <div><span className="text-muted-foreground">ארץ:</span> <span className="font-medium">{c.countryOfOrigin}</span></div>}
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex gap-3">
                              <span className="text-muted-foreground">מכס: <span className="font-bold text-red-600">{fmtCur(c.customsDutyAmount)}</span></span>
                              <span className="text-muted-foreground">סה\"כ: <span className="font-bold text-green-700">{fmtCur(c.totalCost)}</span></span>
                            </div>
                            <div className="flex items-center gap-1 text-muted-foreground text-xs">
                              <FileCheck size={14} /> {docCount}/{DOCUMENT_LIST.length}
                            </div>
                          </div>
                          <div className="flex gap-1 mt-3 pt-3 border-t border-slate-100">
                            <button onClick={() => setDetailItem(c)} className="flex-1 flex items-center justify-center gap-1 text-blue-600 hover:bg-blue-50 rounded-lg py-1.5 text-sm"><Eye size={14} /> צפייה</button>
                            <button onClick={() => openEdit(c)} className="flex-1 flex items-center justify-center gap-1 text-amber-600 hover:bg-amber-50 rounded-lg py-1.5 text-sm"><Edit2 size={14} /> עריכה</button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/customs-clearances`, c.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                            {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק תיק זה?", { itemName: c.file_number || c.reference_number || String(c.id), entityType: "תיק עמילות מכס" }); if (ok) deleteMut.mutate(c.id); }} className="flex-1 flex items-center justify-center gap-1 text-red-600 hover:bg-red-50 rounded-lg py-1.5 text-sm"><Trash2 size={14} /> מחיקה</button>}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Documents Tab */}
            {activeTab === "documents" && (
              <div className="space-y-4 sm:space-y-6">
                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><FileCheck size={18} /> סטטוס מסמכים נדרשים</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {docStats.map(d => (
                      <div key={d.key} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${d.pct === 100 ? "bg-green-100 text-green-600" : d.pct > 50 ? "bg-yellow-100 text-yellow-600" : "bg-red-100 text-red-600"}`}>
                          {d.pct === 100 ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-medium text-sm text-foreground">{d.label}</span>
                            <span className="text-xs text-muted-foreground">{d.count}/{totalClearances}</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full transition-all ${d.pct === 100 ? "bg-green-500" : d.pct > 50 ? "bg-yellow-500" : "bg-red-500"}`}
                              style={{ width: `${d.pct}%` }}></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Per-clearance document status */}
                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4">רשימת מסמכים לפי תיק</h3>
                  {clearances.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">אין תיקים</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/30">
                          <tr>
                            <th className="text-right p-2 font-medium text-muted-foreground">מספר תיק</th>
                            <th className="text-right p-2 font-medium text-muted-foreground">ספק</th>
                            {DOCUMENT_LIST.map(d => (
                              <th key={d.key} className="text-center p-2 font-medium text-muted-foreground text-xs whitespace-nowrap">{d.label.slice(0, 8)}</th>
                            ))}
                            <th className="text-center p-2 font-medium text-muted-foreground">סה״כ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clearances.map(c => {
                            const docCount = DOCUMENT_LIST.filter(d => (c as any)[d.key]).length;
                            return (
                              <tr key={c.id} className="border-t border-slate-100 hover:bg-muted/30">
                                <td className="p-2 font-bold text-blue-700">{c.clearanceNumber}</td>
                                <td className="p-2 text-muted-foreground">{c.supplierName || "-"}</td>
                                {DOCUMENT_LIST.map(d => (
                                  <td key={d.key} className="text-center p-2">
                                    {(c as any)[d.key] ? <CheckCircle2 size={14} className="mx-auto text-green-500" /> : <X size={14} className="mx-auto text-red-300" />}
                                  </td>
                                ))}
                                <td className="text-center p-2 font-bold">{docCount}/{DOCUMENT_LIST.length}</td>
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

            {/* Taxes & Fees Tab */}
            {activeTab === "taxes" && (
              <div className="space-y-4 sm:space-y-6">
                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "סה\"כ מכס", value: totalDuty, color: "red" },
                    { label: "סה\"כ מס קנייה", value: clearances.reduce((s, c) => s + Number(c.purchaseTaxAmount || 0), 0), color: "orange" },
                    { label: "סה\"כ מע\"מ", value: totalVat, color: "purple" },
                    { label: "סה\"כ עמלות", value: totalAllFees, color: "blue" },
                  ].map((item, i) => (
                    <div key={i} className={`bg-card rounded-xl p-4 shadow-sm border border-${item.color}-200`}>
                      <div className="text-sm text-muted-foreground">{item.label}</div>
                      <div className={`text-lg sm:text-2xl font-bold text-${item.color}-700`}>{fmtCur(item.value)}</div>
                    </div>
                  ))}
                </div>

                {/* Detailed table */}
                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><DollarSign size={18} /> פירוט מיסים ועמלות לפי תיק</h3>
                  {clearances.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">אין נתונים</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/30">
                          <tr>
                            <th className="text-right p-2 font-medium">תיק</th>
                            <th className="text-right p-2 font-medium">ערך סחורה</th>
                            <th className="text-right p-2 font-medium">מכס %</th>
                            <th className="text-right p-2 font-medium">מכס ₪</th>
                            <th className="text-right p-2 font-medium">מס קנייה</th>
                            <th className="text-right p-2 font-medium">מע״מ</th>
                            <th className="text-right p-2 font-medium">עמלת נמל</th>
                            <th className="text-right p-2 font-medium">אחסון</th>
                            <th className="text-right p-2 font-medium">עמיל</th>
                            <th className="text-right p-2 font-medium">אחר</th>
                            <th className="text-right p-2 font-medium font-bold">סה״כ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clearances.map(c => (
                            <tr key={c.id} className="border-t border-slate-100 hover:bg-muted/30">
                              <td className="p-2 font-bold text-blue-700">{c.clearanceNumber}</td>
                              <td className="p-2">{fmtCur(c.goodsValueIls)}</td>
                              <td className="p-2">{Number(c.customsDutyPct || 0)}%</td>
                              <td className="p-2 text-red-600 font-medium">{fmtCur(c.customsDutyAmount)}</td>
                              <td className="p-2">{fmtCur(c.purchaseTaxAmount)}</td>
                              <td className="p-2">{fmtCur(c.vatAmount)}</td>
                              <td className="p-2">{fmtCur(c.portFees)}</td>
                              <td className="p-2">{fmtCur(c.storageFees)}</td>
                              <td className="p-2">{fmtCur(c.brokerFees)}</td>
                              <td className="p-2">{fmtCur(c.otherFees)}</td>
                              <td className="p-2 font-bold text-green-700">{fmtCur(c.totalCost)}</td>
                            </tr>
                          ))}
                          <tr className="border-t-2 border-border bg-muted/30 font-bold">
                            <td className="p-2">סה״כ</td>
                            <td className="p-2">{fmtCur(clearances.reduce((s, c) => s + Number(c.goodsValueIls || 0), 0))}</td>
                            <td className="p-2">-</td>
                            <td className="p-2 text-red-600">{fmtCur(totalDuty)}</td>
                            <td className="p-2">{fmtCur(clearances.reduce((s, c) => s + Number(c.purchaseTaxAmount || 0), 0))}</td>
                            <td className="p-2">{fmtCur(totalVat)}</td>
                            <td className="p-2">{fmtCur(clearances.reduce((s, c) => s + Number(c.portFees || 0), 0))}</td>
                            <td className="p-2">{fmtCur(clearances.reduce((s, c) => s + Number(c.storageFees || 0), 0))}</td>
                            <td className="p-2">{fmtCur(clearances.reduce((s, c) => s + Number(c.brokerFees || 0), 0))}</td>
                            <td className="p-2">{fmtCur(clearances.reduce((s, c) => s + Number(c.otherFees || 0), 0))}</td>
                            <td className="p-2 text-green-700">{fmtCur(totalCosts)}</td>
                          </tr>
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
                <h2 className="text-lg font-bold text-foreground">{editItem ? "עריכת תיק מכס" : "תיק מכס חדש"}</h2>
                <button onClick={() => { setShowForm(false); setEditItem(null); }} className="p-1 hover:bg-muted/50 rounded-lg"><X size={20} /></button>
              </div>
              <div className="p-5 space-y-6 max-h-[75vh] overflow-y-auto">
                {/* Basic Info */}
                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-blue-700 px-2">פרטי תיק</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">מספר תיק (אוטומטי)</label>
                      <input value={formData.clearanceNumber || ""} onChange={e => setFormData({ ...formData, clearanceNumber: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" placeholder="CUS-YYYY-NNNN" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">מספר הצהרת מכס</label>
                      <input value={formData.declarationNumber || ""} onChange={e => setFormData({ ...formData, declarationNumber: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">הזמנת יבוא מקושרת (ID)</label>
                      <input type="number" value={formData.importOrderId || ""} onChange={e => setFormData({ ...formData, importOrderId: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">סטטוס</label>
                      <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm">
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">עדיפות</label>
                      <select value={formData.priority} onChange={e => setFormData({ ...formData, priority: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm">
                        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">אחראי</label>
                      <input value={formData.responsiblePerson || ""} onChange={e => setFormData({ ...formData, responsiblePerson: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                  </div>
                </fieldset>

                {/* Broker & Supplier */}
                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-blue-700 px-2">עמיל מכס וספק</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">שם עמיל מכס</label>
                      <input value={formData.customsBroker || ""} onChange={e => setFormData({ ...formData, customsBroker: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">טלפון עמיל</label>
                      <input value={formData.brokerPhone || ""} onChange={e => setFormData({ ...formData, brokerPhone: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">אימייל עמיל</label>
                      <input value={formData.brokerEmail || ""} onChange={e => setFormData({ ...formData, brokerEmail: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">שם ספק</label>
                      <input value={formData.supplierName || ""} onChange={e => setFormData({ ...formData, supplierName: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">ארץ מקור</label>
                      <input value={formData.countryOfOrigin || ""} onChange={e => setFormData({ ...formData, countryOfOrigin: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">נמל כניסה</label>
                      <select value={formData.portOfEntry} onChange={e => setFormData({ ...formData, portOfEntry: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm">
                        {PORTS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                </fieldset>

                {/* Dates */}
                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-blue-700 px-2">תאריכים</legend>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {[
                      { key: "arrivalDate", label: "הגעה לנמל" },
                      { key: "submissionDate", label: "הגשה למכס" },
                      { key: "releaseDate", label: "שחרור" },
                      { key: "clearanceDate", label: "סיום תהליך" },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="text-xs text-muted-foreground">{f.label}</label>
                        <input type="date" value={formData[f.key] || ""} onChange={e => setFormData({ ...formData, [f.key]: e.target.value })}
                          className="w-full border border-border rounded-lg p-2 text-sm" />
                      </div>
                    ))}
                  </div>
                </fieldset>

                {/* Customs & HS */}
                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-blue-700 px-2">סיווג מכס</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">קודי HS (מופרדים בפסיק)</label>
                      <input value={formData.hsCodes || ""} onChange={e => setFormData({ ...formData, hsCodes: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" placeholder="7216.10, 7308.90" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">סיווג מכסי</label>
                      <input value={formData.customsClassification || ""} onChange={e => setFormData({ ...formData, customsClassification: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">שטר מטען</label>
                      <input value={formData.billOfLading || ""} onChange={e => setFormData({ ...formData, billOfLading: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">מספרי מכולות</label>
                      <input value={formData.containerNumbers || ""} onChange={e => setFormData({ ...formData, containerNumbers: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" placeholder="MSCU1234567, TRLU9876543" />
                    </div>
                  </div>
                </fieldset>

                {/* Financial - Goods Value & Taxes */}
                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-blue-700 px-2">ערך סחורה ומיסים</legend>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">ערך סחורה</label>
                      <input type="number" step="0.01" value={formData.goodsValue || ""} onChange={e => setFormData({ ...formData, goodsValue: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">מטבע</label>
                      <select value={formData.goodsCurrency} onChange={e => setFormData({ ...formData, goodsCurrency: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm">
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">שער חליפין</label>
                      <input type="number" step="0.0001" value={formData.exchangeRate || ""} onChange={e => setFormData({ ...formData, exchangeRate: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">ערך ב-₪</label>
                      <input type="number" step="0.01" value={formData.goodsValueIls || ""} onChange={e => setFormData({ ...formData, goodsValueIls: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">מכס %</label>
                      <input type="number" step="0.01" value={formData.customsDutyPct || ""} onChange={e => setFormData({ ...formData, customsDutyPct: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">מכס ₪</label>
                      <input type="number" step="0.01" value={formData.customsDutyAmount || ""} onChange={e => setFormData({ ...formData, customsDutyAmount: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">מס קנייה %</label>
                      <input type="number" step="0.01" value={formData.purchaseTaxPct || ""} onChange={e => setFormData({ ...formData, purchaseTaxPct: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">מס קנייה ₪</label>
                      <input type="number" step="0.01" value={formData.purchaseTaxAmount || ""} onChange={e => setFormData({ ...formData, purchaseTaxAmount: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">מע\"מ %</label>
                      <input type="number" step="0.01" value={formData.vatPct || ""} onChange={e => setFormData({ ...formData, vatPct: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">מע\"מ ₪</label>
                      <input type="number" step="0.01" value={formData.vatAmount || ""} onChange={e => setFormData({ ...formData, vatAmount: e.target.value })}
                        className="w-full border border-border rounded-lg p-2 text-sm" />
                    </div>
                  </div>
                </fieldset>

                {/* Fees */}
                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-blue-700 px-2">עמלות</legend>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {[
                      { key: "portFees", label: "עמלת נמל" },
                      { key: "storageFees", label: "דמי אחסון" },
                      { key: "inspectionFees", label: "דמי בדיקה" },
                      { key: "brokerFees", label: "עמלת עמיל" },
                      { key: "otherFees", label: "הוצאות אחרות" },
                      { key: "totalFees", label: "סה\"כ עמלות" },
                      { key: "totalTaxes", label: "סה\"כ מיסים" },
                      { key: "totalCost", label: "סה\"כ עלות" },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="text-xs text-muted-foreground">{f.label}</label>
                        <input type="number" step="0.01" value={formData[f.key] || ""} onChange={e => setFormData({ ...formData, [f.key]: e.target.value })}
                          className="w-full border border-border rounded-lg p-2 text-sm" />
                      </div>
                    ))}
                  </div>
                </fieldset>

                {/* Documents Checklist */}
                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-blue-700 px-2">רשימת מסמכים נדרשים</legend>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {DOCUMENT_LIST.map(doc => (
                      <label key={doc.key} className="flex items-center gap-2 p-2 hover:bg-muted/30 rounded-lg cursor-pointer">
                        <input type="checkbox" checked={formData[doc.key] || false}
                          onChange={e => setFormData({ ...formData, [doc.key]: e.target.checked })}
                          className="w-4 h-4 text-blue-600 border-border rounded focus:ring-blue-500" />
                        <span className="text-sm text-foreground">{doc.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {/* Notes */}
                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-blue-700 px-2">הערות</legend>
                  <textarea value={formData.notes || ""} onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    rows={3} className="w-full border border-border rounded-lg p-2 text-sm" placeholder="הערות נוספות..." />
                </fieldset>
              </div>
              <div className="flex gap-3 p-4 border-t border-slate-100 sticky bottom-0 bg-card rounded-b-2xl">
                <button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-foreground py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  <Save size={16} /> {editItem ? "עדכון" : "שמירה"}
                </button>
                <button onClick={() => { setShowForm(false); setEditItem(null); }}
                  className="px-6 py-2.5 border border-border rounded-lg hover:bg-muted/30">ביטול</button>
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
                  <h2 className="text-lg font-bold text-foreground">תיק מכס {detailItem.clearanceNumber}</h2>
                  <div className="flex gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[detailItem.status]}`}>{detailItem.status}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[detailItem.priority]}`}>{detailItem.priority}</span>
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
                    { label: "הצהרת מכס", value: detailItem.declarationNumber },
                    { label: "עמיל מכס", value: detailItem.customsBroker },
                    { label: "טלפון עמיל", value: detailItem.brokerPhone },
                    { label: "אימייל עמיל", value: detailItem.brokerEmail },
                    { label: "ספק", value: detailItem.supplierName },
                    { label: "ארץ מקור", value: detailItem.countryOfOrigin },
                    { label: "נמל כניסה", value: detailItem.portOfEntry },
                    { label: "שטר מטען", value: detailItem.billOfLading },
                    { label: "מכולות", value: detailItem.containerNumbers },
                    { label: "קודי HS", value: detailItem.hsCodes },
                    { label: "סיווג מכסי", value: detailItem.customsClassification },
                    { label: "אחראי", value: detailItem.responsiblePerson },
                  ].filter(f => f.value).map((f, i) => (
                    <div key={i} className="bg-muted/30 rounded-lg p-2">
                      <div className="text-xs text-muted-foreground">{f.label}</div>
                      <div className="font-medium text-sm text-foreground">{f.value}</div>
                    </div>
                  ))}
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "הגעה", value: detailItem.arrivalDate },
                    { label: "הגשה", value: detailItem.submissionDate },
                    { label: "שחרור", value: detailItem.releaseDate },
                    { label: "סיום", value: detailItem.clearanceDate },
                  ].map((f, i) => (
                    <div key={i} className="bg-blue-50 rounded-lg p-2 text-center">
                      <div className="text-xs text-blue-600">{f.label}</div>
                      <div className="font-bold text-sm text-foreground">{f.value || "-"}</div>
                    </div>
                  ))}
                </div>

                {/* Financial cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "ערך סחורה", value: `${fmtCur(detailItem.goodsValue, "")} ${detailItem.goodsCurrency}`, sub: `${fmtCur(detailItem.goodsValueIls)} (₪)` },
                    { label: "מכס", value: `${Number(detailItem.customsDutyPct)}% = ${fmtCur(detailItem.customsDutyAmount)}` },
                    { label: "מע\"מ", value: `${Number(detailItem.vatPct)}% = ${fmtCur(detailItem.vatAmount)}` },
                    { label: "סה\"כ עלות", value: fmtCur(detailItem.totalCost) },
                  ].map((f, i) => (
                    <div key={i} className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                      <div className="text-xs text-green-700">{f.label}</div>
                      <div className="font-bold text-foreground">{f.value}</div>
                      {"sub" in f && f.sub && <div className="text-xs text-muted-foreground mt-0.5">{f.sub}</div>}
                    </div>
                  ))}
                </div>

                {/* Fees breakdown */}
                <div className="bg-muted/30 rounded-xl p-4">
                  <h4 className="font-bold text-sm text-foreground mb-2">פירוט עמלות</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    {[
                      { label: "עמלת נמל", value: detailItem.portFees },
                      { label: "אחסון", value: detailItem.storageFees },
                      { label: "בדיקה", value: detailItem.inspectionFees },
                      { label: "עמלת עמיל", value: detailItem.brokerFees },
                      { label: "אחר", value: detailItem.otherFees },
                      { label: "סה\"כ עמלות", value: detailItem.totalFees },
                    ].map((f, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-muted-foreground">{f.label}:</span>
                        <span className="font-medium">{fmtCur(f.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Documents checklist */}
                <div className="bg-muted/30 rounded-xl p-4">
                  <h4 className="font-bold text-sm text-foreground mb-2">מסמכים</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {DOCUMENT_LIST.map(doc => (
                      <div key={doc.key} className="flex items-center gap-2 text-sm">
                        {(detailItem as any)[doc.key] ? (
                          <CheckCircle2 size={14} className="text-green-500" />
                        ) : (
                          <X size={14} className="text-red-400" />
                        )}
                        <span className={(detailItem as any)[doc.key] ? "text-foreground" : "text-muted-foreground"}>{doc.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {detailItem.notes && (
                  <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                    <h4 className="font-bold text-sm text-yellow-700 mb-1">הערות</h4>
                    <p className="text-sm text-foreground">{detailItem.notes}</p>
                  </div>
                )}
                </>)}
                {detailTab === "related" && <RelatedRecords entityType="customs-clearances" entityId={detailItem.id} />}
                {detailTab === "attachments" && <AttachmentsSection entityType="customs-clearances" entityId={detailItem.id} />}
                {detailTab === "history" && <ActivityLog entityType="customs-clearances" entityId={detailItem.id} />}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
