import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield, FileCheck, Calendar, AlertTriangle, CheckCircle2, Clock,
  Search, Plus, Edit2, Trash2, X, Save, Eye, FileText, Award,
  Globe, Building2, Hash, XCircle, RefreshCw, Lock, Unlock, Copy
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

const CERT_TYPES = [
  "תעודת מקור (Certificate of Origin)",
  "שטר מטען (Bill of Lading)",
  "רשימת אריזה (Packing List)",
  "חשבונית מסחרית (Commercial Invoice)",
  "תעודה פיטוסניטרית (Phytosanitary)",
  "אישור FDA",
  "סימון CE (CE Marking)",
  "ISO 9001",
  "ISO 14001",
  "ISO 45001",
  "תעודת ביטוח (Insurance Certificate)",
  "תעודת בדיקה (Inspection Certificate)",
  "תעודת תקן ישראלי (SII)",
  "RoHS",
  "REACH",
  "UL Listed",
  "הצהרת התאמה (Declaration of Conformity)",
  "אישור מכס (Customs Certificate)",
  "תעודת כשרות",
  "אחר",
];

const STATUSES = ["פעיל", "פג תוקף", "ממתין לחידוש", "בבדיקה", "מאושר", "נדחה", "בוטל", "טיוטה"];
const CATEGORIES = ["סחר", "איכות", "בטיחות", "סביבה", "רגולציה", "מכס", "ביטוח", "תקינה"];
const PRIORITIES = ["רגיל", "דחוף", "קריטי"];
const VERIFICATION_STATUSES = ["לא אומת", "אומת", "נכשל", "בבדיקה"];

const STATUS_COLORS: Record<string, string> = {
  "פעיל": "bg-green-100 text-green-800",
  "פג תוקף": "bg-red-100 text-red-800",
  "ממתין לחידוש": "bg-yellow-100 text-yellow-800",
  "בבדיקה": "bg-blue-100 text-blue-800",
  "מאושר": "bg-emerald-100 text-emerald-800",
  "נדחה": "bg-rose-100 text-rose-800",
  "בוטל": "bg-muted/50 text-foreground",
  "טיוטה": "bg-muted/50 text-foreground",
};

const PRIORITY_COLORS: Record<string, string> = {
  "רגיל": "bg-muted/50 text-foreground",
  "דחוף": "bg-orange-100 text-orange-700",
  "קריטי": "bg-red-100 text-red-700",
};

const VERIFICATION_COLORS: Record<string, string> = {
  "לא אומת": "bg-muted/50 text-muted-foreground",
  "אומת": "bg-green-100 text-green-700",
  "נכשל": "bg-red-100 text-red-700",
  "בבדיקה": "bg-blue-100 text-blue-700",
};

interface Certificate {
  id: number; certNumber: string; certName: string; certType: string; status: string;
  linkedImportOrderId: number | null; linkedSupplier: string | null; supplierCountry: string | null;
  productName: string | null; hsCode: string | null;
  issuingAuthority: string | null; issuingCountry: string | null;
  documentNumber: string | null; referenceNumber: string | null;
  issueDate: string | null; expiryDate: string | null; renewalDate: string | null;
  lastAuditDate: string | null; nextAuditDate: string | null;
  scope: string | null; standards: string | null; accreditationBody: string | null;
  certificateHolder: string | null; holderAddress: string | null;
  fileUrl: string | null; fileName: string | null;
  verificationUrl: string | null; verificationStatus: string;
  verifiedBy: string | null; verifiedDate: string | null;
  isMandatory: boolean; isOriginal: boolean; copiesCount: number;
  notarized: boolean; apostille: boolean; translated: boolean; translationLanguage: string | null;
  linkedLcId: number | null; linkedCustomsId: number | null;
  rejectionReason: string | null; amendmentNotes: string | null;
  priority: string; category: string; tags: string | null;
  notes: string | null; createdBy: string | null; approvedBy: string | null; approvedDate: string | null;
  createdAt: string;
}

const emptyForm: any = {
  certNumber: "", certName: "", certType: "תעודת מקור (Certificate of Origin)", status: "פעיל",
  linkedSupplier: "", supplierCountry: "", productName: "", hsCode: "",
  issuingAuthority: "", issuingCountry: "", documentNumber: "", referenceNumber: "",
  issueDate: "", expiryDate: "", renewalDate: "", lastAuditDate: "", nextAuditDate: "",
  scope: "", standards: "", accreditationBody: "",
  certificateHolder: "", holderAddress: "",
  fileUrl: "", fileName: "", verificationUrl: "",
  verificationStatus: "לא אומת", verifiedBy: "", verifiedDate: "",
  isMandatory: false, isOriginal: false, copiesCount: 0,
  notarized: false, apostille: false, translated: false, translationLanguage: "",
  rejectionReason: "", amendmentNotes: "",
  priority: "רגיל", category: "סחר", tags: "", notes: "", createdBy: "",
};

export default function ComplianceCertificatesPage() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "list" | "expiry" | "matrix">("dashboard");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Certificate | null>(null);
  const [detailItem, setDetailItem] = useState<Certificate | null>(null);
  const [formData, setFormData] = useState<any>({ ...emptyForm });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("");
  const [detailTab, setDetailTab] = useState("details");
  const qc = useQueryClient();
  const { selectedIds, toggle, toggleAll, clear, isSelected, isAllSelected } = useBulkSelection();

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["compliance-certificates"],
    queryFn: () => authFetch(`${API}/compliance-certificates`).then(r => r.json()),
  });
  const certs: Certificate[] = useMemo(() => safeArray(rawData), [rawData]);

  const createMut = useMutation({
    mutationFn: (d: any) => authFetch(`${API}/compliance-certificates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["compliance-certificates"] }); setShowForm(false); },
  });
  const updateMut = useMutation({
    mutationFn: (d: any) => authFetch(`${API}/compliance-certificates/${d.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["compliance-certificates"] }); setShowForm(false); setEditItem(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/compliance-certificates/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance-certificates"] }),
  });

  const openCreate = () => { setFormData({ ...emptyForm }); setEditItem(null); setShowForm(true); };
  const openEdit = (c: Certificate) => { setFormData({ ...c }); setEditItem(c); setShowForm(true); };
  const handleSave = () => {
    const d = { ...formData };
    if (editItem) { d.id = editItem.id; updateMut.mutate(d); }
    else createMut.mutate(d);
  };

  const now = new Date();
  const daysTo = (d: string | null) => d ? Math.ceil((new Date(d).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

  const filtered = useMemo(() => {
    let result = certs;
    if (filterType) result = result.filter(c => c.certType === filterType);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      result = result.filter(c =>
        c.certName?.toLowerCase().includes(s) || c.certNumber?.toLowerCase().includes(s) ||
        c.linkedSupplier?.toLowerCase().includes(s) || c.certType?.toLowerCase().includes(s) ||
        c.certificateHolder?.toLowerCase().includes(s) || c.productName?.toLowerCase().includes(s)
      );
    }
    return result;
  }, [certs, searchTerm, filterType]);

  const total = certs.length;
  const active = certs.filter(c => c.status === "פעיל" || c.status === "מאושר").length;
  const expired = certs.filter(c => c.expiryDate && new Date(c.expiryDate) < now && c.status !== "בוטל").length;
  const expiringSoon = certs.filter(c => { const d = daysTo(c.expiryDate); return d !== null && d >= 0 && d <= 30 && c.status !== "בוטל"; });
  const mandatory = certs.filter(c => c.isMandatory).length;
  const verified = certs.filter(c => c.verificationStatus === "אומת").length;
  const pending = certs.filter(c => c.status === "בבדיקה" || c.status === "ממתין לחידוש").length;
  const rejected = certs.filter(c => c.status === "נדחה").length;

  const typeDist = Object.entries(
    certs.reduce((acc: Record<string, number>, c) => { acc[c.certType] = (acc[c.certType] || 0) + 1; return acc; }, {})
  ).sort((a, b) => b[1] - a[1]);

  const categoryDist = Object.entries(
    certs.reduce((acc: Record<string, number>, c) => { acc[c.category] = (acc[c.category] || 0) + 1; return acc; }, {})
  ).sort((a, b) => b[1] - a[1]);

  const supplierCerts = Object.entries(
    certs.filter(c => c.linkedSupplier).reduce((acc: Record<string, Certificate[]>, c) => {
      const key = c.linkedSupplier!;
      if (!acc[key]) acc[key] = [];
      acc[key].push(c);
      return acc;
    }, {})
  ).sort((a, b) => b[1].length - a[1].length);

  const kpis = [
    { label: "סה\"כ תעודות", value: total, icon: FileCheck, color: "blue" },
    { label: "פעילות", value: active, icon: CheckCircle2, color: "green" },
    { label: "פג תוקף", value: expired, icon: XCircle, color: "red" },
    { label: "פג בקרוב", value: expiringSoon.length, icon: AlertTriangle, color: "yellow" },
    { label: "חובה", value: mandatory, icon: Lock, color: "purple" },
    { label: "אומתו", value: verified, icon: Shield, color: "emerald" },
    { label: "ממתינות", value: pending, icon: Clock, color: "orange" },
    { label: "נדחו", value: rejected, icon: X, color: "rose" },
  ];

  const TABS = [
    { key: "dashboard" as const, label: "לוח בקרה", icon: Shield },
    { key: "list" as const, label: "רשימת תעודות", icon: FileCheck },
    { key: "expiry" as const, label: "מעקב תוקף", icon: Calendar },
    { key: "matrix" as const, label: "מטריצת ספקים", icon: Building2 },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50" dir="rtl">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <Shield className="text-purple-600" /> תאימות ותעודות
            </h1>
            <p className="text-muted-foreground mt-1">ניהול תעודות, תאימות רגולטורית, מעקב תוקף ואימות מסמכים</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <ExportDropdown data={certs} headers={{ certNumber: "מספר תעודה", certName: "שם", certType: "סוג", status: "סטטוס", linkedSupplier: "ספק", issuingAuthority: "גוף מנפיק", issueDate: "הנפקה", expiryDate: "תפוגה", verificationStatus: "אימות", category: "קטגוריה", isMandatory: "חובה", standards: "תקנים" }} filename={"compliance_certificates"} />
            <button onClick={() => printPage("תאימות ותעודות")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm">
              <Printer size={16} /> הדפסה
            </button>
            <button onClick={() => sendByEmail("תאימות ותעודות - טכנו-כל עוזי", generateEmailBody("תאימות ותעודות", certs, { certNumber: "מספר", certName: "שם", certType: "סוג", status: "סטטוס", expiryDate: "תפוגה" }))} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm">
              <Send size={16} /> שליחה
            </button>
            <button onClick={openCreate} className="flex items-center gap-2 bg-purple-600 text-foreground px-3 py-2 rounded-lg hover:bg-purple-700 shadow-lg text-sm">
              <Plus size={16} /> תעודה חדשה
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
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.key ? "bg-purple-600 text-foreground shadow-md" : "text-muted-foreground hover:bg-muted/30"}`}>
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto mb-3"></div>
          </div>
        ) : (
          <>
            {activeTab === "dashboard" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><FileCheck size={18} /> התפלגות סוגי תעודות</h3>
                  {typeDist.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">אין נתונים</p>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {typeDist.map(([type, count]) => (
                        <div key={type} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                          <span className="flex-1 text-sm font-medium text-foreground truncate">{type}</span>
                          <div className="w-20 bg-muted rounded-full h-2">
                            <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${(count / total) * 100}%` }}></div>
                          </div>
                          <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs font-bold min-w-[24px] text-center">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Award size={18} /> סטטוס תעודות</h3>
                  <div className="space-y-2">
                    {STATUSES.map(s => {
                      const count = certs.filter(c => c.status === s).length;
                      if (count === 0) return null;
                      return (
                        <div key={s} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s]}`}>{s}</span>
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${(count / total) * 100}%` }}></div>
                          </div>
                          <span className="font-bold text-sm text-foreground">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Globe size={18} /> קטגוריות</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {categoryDist.map(([cat, count]) => (
                      <div key={cat} className="bg-muted/30 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-purple-700">{count}</div>
                        <div className="text-xs text-muted-foreground">{cat}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><AlertTriangle size={18} className="text-yellow-500" /> פג תוקף בקרוב (30 יום)</h3>
                  {expiringSoon.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">אין תעודות שפג תוקפן בקרוב</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {expiringSoon.sort((a, b) => daysTo(a.expiryDate)! - daysTo(b.expiryDate)!).map(c => {
                        const days = daysTo(c.expiryDate)!;
                        return (
                          <div key={c.id} className={`flex items-center justify-between p-2 rounded-lg ${days <= 7 ? "bg-red-50 border border-red-200" : "bg-yellow-50 border border-yellow-200"}`}>
                            <div>
                              <span className="font-bold text-sm text-foreground">{c.certName}</span>
                              <span className="text-xs text-muted-foreground mr-2">{c.certType.split(" (")[0]}</span>
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
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                      placeholder="חיפוש לפי שם, מספר, ספק, סוג..."
                      className="w-full pr-10 pl-4 py-2.5 border border-border rounded-xl bg-card focus:ring-2 focus:ring-purple-500 focus:outline-none" />
                  </div>
                  <select value={filterType} onChange={e => setFilterType(e.target.value)}
                    className="border border-border rounded-xl px-3 py-2.5 bg-card text-sm">
                    <option value="">כל הסוגים</option>
                    {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <BulkActions selectedIds={selectedIds} onClear={clear} entityName="תעודות" actions={defaultBulkActions(selectedIds, clear, () => qc.invalidateQueries({ queryKey: ["compliance-certificates"] }), `${API}/compliance-certificates`)} />
                {filtered.length === 0 ? (
                  <div className="text-center py-16 bg-card rounded-xl border border-slate-100">
                    <Shield size={48} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-muted-foreground">אין תעודות</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filtered.map(c => {
                      const days = daysTo(c.expiryDate);
                      return (
                        <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          className={`bg-card rounded-xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-all ${isSelected(c.id) ? "ring-2 ring-purple-400" : ""}`}>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <BulkCheckbox checked={isSelected(c.id)} onChange={() => toggle(c.id)} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-purple-700">{c.certName}</span>
                                {c.isMandatory && <Lock size={12} className="text-red-500" title="חובה" />}
                                {c.isOriginal && <FileText size={12} className="text-blue-500" title="מקורי" />}
                              </div>
                              <div className="text-xs text-muted-foreground">{c.certNumber} | {c.certType.split(" (")[0]}</div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[c.priority]}`}>{c.priority}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status]}`}>{c.status}</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mb-2">
                            {c.linkedSupplier && <div className="flex items-center gap-1 text-muted-foreground"><Building2 size={12} /> {c.linkedSupplier}</div>}
                            {c.issuingAuthority && <div className="flex items-center gap-1 text-muted-foreground"><Award size={12} /> {c.issuingAuthority}</div>}
                            {c.issueDate && <div className="flex items-center gap-1 text-muted-foreground"><Calendar size={12} /> הונפק: {c.issueDate}</div>}
                            {c.expiryDate && (
                              <div className={`flex items-center gap-1 ${days !== null && days < 0 ? "text-red-600 font-bold" : days !== null && days <= 30 ? "text-orange-600" : "text-muted-foreground"}`}>
                                <Clock size={12} /> תפוגה: {c.expiryDate}
                                {days !== null && <span className="text-xs">({days < 0 ? `פג לפני ${Math.abs(days)} ימים` : `${days} ימים`})</span>}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${VERIFICATION_COLORS[c.verificationStatus]}`}>{c.verificationStatus}</span>
                            <span className="px-2 py-0.5 bg-muted/50 rounded-full text-xs text-muted-foreground">{c.category}</span>
                            {c.notarized && <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-200">נוטריון</span>}
                            {c.apostille && <span className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded border border-indigo-200">אפוסטיל</span>}
                            {c.translated && <span className="text-[10px] px-1.5 py-0.5 bg-teal-50 text-teal-600 rounded border border-teal-200">מתורגם</span>}
                          </div>
                          <div className="flex gap-1 pt-2 border-t border-slate-100">
                            <button onClick={() => setDetailItem(c)} className="flex-1 flex items-center justify-center gap-1 text-purple-600 hover:bg-purple-50 rounded-lg py-1.5 text-sm"><Eye size={14} /> צפייה</button>
                            <button onClick={() => openEdit(c)} className="flex-1 flex items-center justify-center gap-1 text-amber-600 hover:bg-amber-50 rounded-lg py-1.5 text-sm"><Edit2 size={14} /> עריכה</button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/compliance-certificates`, c.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                            {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק תעודה זו?", { itemName: c.certificate_number || c.name || String(c.id), entityType: "תעודת ציות" }); if (ok) deleteMut.mutate(c.id); }} className="flex-1 flex items-center justify-center gap-1 text-red-600 hover:bg-red-50 rounded-lg py-1.5 text-sm"><Trash2 size={14} /> מחיקה</button>}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === "expiry" && (
              <div className="space-y-4 sm:space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-red-50 rounded-xl p-4 border border-red-200 text-center">
                    <div className="text-lg sm:text-2xl font-bold text-red-700">{expired}</div>
                    <div className="text-sm text-red-600">פג תוקף</div>
                  </div>
                  <div className="bg-orange-50 rounded-xl p-4 border border-orange-200 text-center">
                    <div className="text-lg sm:text-2xl font-bold text-orange-700">{certs.filter(c => { const d = daysTo(c.expiryDate); return d !== null && d >= 0 && d <= 7; }).length}</div>
                    <div className="text-sm text-orange-600">פג תוך 7 ימים</div>
                  </div>
                  <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200 text-center">
                    <div className="text-lg sm:text-2xl font-bold text-yellow-700">{expiringSoon.length}</div>
                    <div className="text-sm text-yellow-600">פג תוך 30 יום</div>
                  </div>
                  <div className="bg-green-50 rounded-xl p-4 border border-green-200 text-center">
                    <div className="text-lg sm:text-2xl font-bold text-green-700">{certs.filter(c => { const d = daysTo(c.expiryDate); return d === null || d > 30; }).filter(c => c.status !== "בוטל").length}</div>
                    <div className="text-sm text-green-600">תקין</div>
                  </div>
                </div>

                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Calendar size={18} /> מעקב תפוגה</h3>
                  {certs.filter(c => c.expiryDate && c.status !== "בוטל").length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">אין תעודות עם תאריך תפוגה</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/30">
                          <tr>
                            <th className="text-right p-2 font-medium">תעודה</th>
                            <th className="text-right p-2 font-medium">סוג</th>
                            <th className="text-right p-2 font-medium">ספק</th>
                            <th className="text-right p-2 font-medium">הנפקה</th>
                            <th className="text-right p-2 font-medium">תפוגה</th>
                            <th className="text-right p-2 font-medium">ימים</th>
                            <th className="text-right p-2 font-medium">חובה</th>
                            <th className="text-right p-2 font-medium">סטטוס</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...certs].filter(c => c.expiryDate && c.status !== "בוטל")
                            .sort((a, b) => daysTo(a.expiryDate)! - daysTo(b.expiryDate)!)
                            .map(c => {
                              const days = daysTo(c.expiryDate)!;
                              return (
                                <tr key={c.id} className={`border-t border-slate-100 ${days < 0 ? "bg-red-50" : days <= 7 ? "bg-orange-50" : days <= 30 ? "bg-yellow-50" : "hover:bg-muted/30"}`}>
                                  <td className="p-2 font-bold text-purple-700">{c.certName}</td>
                                  <td className="p-2 text-xs text-muted-foreground">{c.certType.split(" (")[0]}</td>
                                  <td className="p-2 text-muted-foreground">{c.linkedSupplier || "-"}</td>
                                  <td className="p-2">{c.issueDate || "-"}</td>
                                  <td className="p-2 font-medium">{c.expiryDate}</td>
                                  <td className="p-2">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${days < 0 ? "bg-red-200 text-red-800" : days <= 7 ? "bg-orange-200 text-orange-800" : days <= 30 ? "bg-yellow-200 text-yellow-800" : "bg-green-200 text-green-800"}`}>
                                      {days < 0 ? `פג ${Math.abs(days)}` : days}
                                    </span>
                                  </td>
                                  <td className="p-2 text-center">{c.isMandatory ? <Lock size={14} className="mx-auto text-red-500" /> : <Unlock size={14} className="mx-auto text-slate-300" />}</td>
                                  <td className="p-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status]}`}>{c.status}</span></td>
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

            {activeTab === "matrix" && (
              <div className="space-y-4 sm:space-y-6">
                <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Building2 size={18} /> מטריצת תעודות לפי ספק</h3>
                  {supplierCerts.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">אין תעודות מקושרות לספקים</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/30">
                          <tr>
                            <th className="text-right p-2 font-medium sticky right-0 bg-muted/30 min-w-[150px]">ספק</th>
                            {CERT_TYPES.slice(0, 12).map(t => (
                              <th key={t} className="text-center p-2 font-medium text-[10px] min-w-[60px] whitespace-nowrap">{t.split(" (")[0]}</th>
                            ))}
                            <th className="text-center p-2 font-medium">סה"כ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {supplierCerts.map(([supplier, supplierCertsList]) => (
                            <tr key={supplier} className="border-t border-slate-100 hover:bg-muted/30">
                              <td className="p-2 font-bold text-purple-700 sticky right-0 bg-inherit">{supplier}</td>
                              {CERT_TYPES.slice(0, 12).map(type => {
                                const hasCert = supplierCertsList.some(c => c.certType === type);
                                const cert = supplierCertsList.find(c => c.certType === type);
                                const isExpired = cert && cert.expiryDate && new Date(cert.expiryDate) < now;
                                return (
                                  <td key={type} className="text-center p-2">
                                    {hasCert ? (
                                      isExpired ? <AlertTriangle size={14} className="mx-auto text-red-500" /> :
                                      <CheckCircle2 size={14} className="mx-auto text-green-500" />
                                    ) : <X size={14} className="mx-auto text-slate-200" />}
                                  </td>
                                );
                              })}
                              <td className="text-center p-2 font-bold">{supplierCertsList.length}</td>
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
                <h2 className="text-lg font-bold text-foreground">{editItem ? "עריכת תעודה" : "תעודה חדשה"}</h2>
                <button onClick={() => { setShowForm(false); setEditItem(null); }} className="p-1 hover:bg-muted/50 rounded-lg"><X size={20} /></button>
              </div>
              <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-purple-700 px-2">פרטי תעודה</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground">מספר תעודה (אוטומטי)</label>
                      <input value={formData.certNumber || ""} onChange={e => setFormData({ ...formData, certNumber: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" placeholder="CRT-YYYY-NNNN" /></div>
                    <div><label className="text-xs text-muted-foreground">שם תעודה *</label>
                      <input value={formData.certName || ""} onChange={e => setFormData({ ...formData, certName: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">סוג תעודה *</label>
                      <select value={formData.certType} onChange={e => setFormData({ ...formData, certType: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                        {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select></div>
                    <div><label className="text-xs text-muted-foreground">סטטוס</label>
                      <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select></div>
                    <div><label className="text-xs text-muted-foreground">קטגוריה</label>
                      <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select></div>
                    <div><label className="text-xs text-muted-foreground">עדיפות</label>
                      <select value={formData.priority} onChange={e => setFormData({ ...formData, priority: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-purple-700 px-2">ספק ומוצר</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground">ספק</label>
                      <input value={formData.linkedSupplier || ""} onChange={e => setFormData({ ...formData, linkedSupplier: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">ארץ ספק</label>
                      <input value={formData.supplierCountry || ""} onChange={e => setFormData({ ...formData, supplierCountry: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">מוצר</label>
                      <input value={formData.productName || ""} onChange={e => setFormData({ ...formData, productName: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">קוד HS</label>
                      <input value={formData.hsCode || ""} onChange={e => setFormData({ ...formData, hsCode: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-purple-700 px-2">גוף מנפיק</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground">רשות/גוף מנפיק</label>
                      <input value={formData.issuingAuthority || ""} onChange={e => setFormData({ ...formData, issuingAuthority: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">ארץ הנפקה</label>
                      <input value={formData.issuingCountry || ""} onChange={e => setFormData({ ...formData, issuingCountry: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">גוף הסמכה</label>
                      <input value={formData.accreditationBody || ""} onChange={e => setFormData({ ...formData, accreditationBody: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">מספר מסמך</label>
                      <input value={formData.documentNumber || ""} onChange={e => setFormData({ ...formData, documentNumber: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">מספר אסמכתא</label>
                      <input value={formData.referenceNumber || ""} onChange={e => setFormData({ ...formData, referenceNumber: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">בעל התעודה</label>
                      <input value={formData.certificateHolder || ""} onChange={e => setFormData({ ...formData, certificateHolder: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-purple-700 px-2">תאריכים</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground">תאריך הנפקה</label>
                      <input type="date" value={formData.issueDate || ""} onChange={e => setFormData({ ...formData, issueDate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">תאריך תפוגה</label>
                      <input type="date" value={formData.expiryDate || ""} onChange={e => setFormData({ ...formData, expiryDate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">תאריך חידוש</label>
                      <input type="date" value={formData.renewalDate || ""} onChange={e => setFormData({ ...formData, renewalDate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">ביקורת אחרונה</label>
                      <input type="date" value={formData.lastAuditDate || ""} onChange={e => setFormData({ ...formData, lastAuditDate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">ביקורת הבאה</label>
                      <input type="date" value={formData.nextAuditDate || ""} onChange={e => setFormData({ ...formData, nextAuditDate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-purple-700 px-2">תוכן והיקף</legend>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">היקף התעודה</label>
                      <textarea value={formData.scope || ""} onChange={e => setFormData({ ...formData, scope: e.target.value })} rows={2} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">תקנים</label>
                      <textarea value={formData.standards || ""} onChange={e => setFormData({ ...formData, standards: e.target.value })} rows={2} className="w-full border border-border rounded-lg p-2 text-sm" placeholder="ISO 9001:2015, EN 1090-1..." /></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-purple-700 px-2">אימות ומסמך</legend>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground">סטטוס אימות</label>
                      <select value={formData.verificationStatus} onChange={e => setFormData({ ...formData, verificationStatus: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                        {VERIFICATION_STATUSES.map(v => <option key={v} value={v}>{v}</option>)}
                      </select></div>
                    <div><label className="text-xs text-muted-foreground">אומת ע"י</label>
                      <input value={formData.verifiedBy || ""} onChange={e => setFormData({ ...formData, verifiedBy: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">תאריך אימות</label>
                      <input type="date" value={formData.verifiedDate || ""} onChange={e => setFormData({ ...formData, verifiedDate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">קישור קובץ</label>
                      <input value={formData.fileUrl || ""} onChange={e => setFormData({ ...formData, fileUrl: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" placeholder="URL" /></div>
                    <div><label className="text-xs text-muted-foreground">שם קובץ</label>
                      <input value={formData.fileName || ""} onChange={e => setFormData({ ...formData, fileName: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">קישור אימות</label>
                      <input value={formData.verificationUrl || ""} onChange={e => setFormData({ ...formData, verificationUrl: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-purple-700 px-2">דגלים</legend>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {[
                      { key: "isMandatory", label: "חובה" },
                      { key: "isOriginal", label: "מסמך מקורי" },
                      { key: "notarized", label: "נוטריון" },
                      { key: "apostille", label: "אפוסטיל" },
                      { key: "translated", label: "מתורגם" },
                    ].map(flag => (
                      <label key={flag.key} className="flex items-center gap-2 p-2 hover:bg-muted/30 rounded-lg cursor-pointer">
                        <input type="checkbox" checked={formData[flag.key] || false} onChange={e => setFormData({ ...formData, [flag.key]: e.target.checked })} className="w-4 h-4 text-purple-600" />
                        <span className="text-sm">{flag.label}</span>
                      </label>
                    ))}
                    {formData.translated && (
                      <div><label className="text-xs text-muted-foreground">שפת תרגום</label>
                        <input value={formData.translationLanguage || ""} onChange={e => setFormData({ ...formData, translationLanguage: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    )}
                    <div><label className="text-xs text-muted-foreground">מספר עותקים</label>
                      <input type="number" value={formData.copiesCount || ""} onChange={e => setFormData({ ...formData, copiesCount: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </div>
                </fieldset>

                <fieldset className="border border-border rounded-xl p-4">
                  <legend className="text-sm font-bold text-purple-700 px-2">הערות</legend>
                  <div className="grid grid-cols-1 gap-3">
                    <div><label className="text-xs text-muted-foreground">תגיות</label>
                      <input value={formData.tags || ""} onChange={e => setFormData({ ...formData, tags: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" placeholder="יבוא, מכס, תקן..." /></div>
                    <div><label className="text-xs text-muted-foreground">הערות</label>
                      <textarea value={formData.notes || ""} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </div>
                </fieldset>
              </div>
              <div className="flex gap-3 p-4 border-t border-slate-100 sticky bottom-0 bg-card rounded-b-2xl">
                <button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}
                  className="flex-1 flex items-center justify-center gap-2 bg-purple-600 text-foreground py-2.5 rounded-lg hover:bg-purple-700 disabled:opacity-50">
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
                  <h2 className="text-lg font-bold text-foreground">{detailItem.certName}</h2>
                  <div className="flex gap-2 mt-1">
                    <span className="text-sm text-muted-foreground">{detailItem.certNumber}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[detailItem.status]}`}>{detailItem.status}</span>
                    <span className="px-2 py-0.5 bg-muted/50 rounded-full text-xs">{detailItem.certType.split(" (")[0]}</span>
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
                    { label: "ספק", value: detailItem.linkedSupplier },
                    { label: "ארץ ספק", value: detailItem.supplierCountry },
                    { label: "מוצר", value: detailItem.productName },
                    { label: "קוד HS", value: detailItem.hsCode },
                    { label: "גוף מנפיק", value: detailItem.issuingAuthority },
                    { label: "ארץ הנפקה", value: detailItem.issuingCountry },
                    { label: "גוף הסמכה", value: detailItem.accreditationBody },
                    { label: "מספר מסמך", value: detailItem.documentNumber },
                    { label: "אסמכתא", value: detailItem.referenceNumber },
                    { label: "בעל התעודה", value: detailItem.certificateHolder },
                    { label: "קטגוריה", value: detailItem.category },
                    { label: "עדיפות", value: detailItem.priority },
                  ].filter(f => f.value).map((f, i) => (
                    <div key={i} className="bg-muted/30 rounded-lg p-2">
                      <div className="text-xs text-muted-foreground">{f.label}</div>
                      <div className="font-medium text-sm text-foreground">{f.value}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "הנפקה", value: detailItem.issueDate },
                    { label: "תפוגה", value: detailItem.expiryDate },
                    { label: "חידוש", value: detailItem.renewalDate },
                    { label: "ביקורת הבאה", value: detailItem.nextAuditDate },
                  ].filter(f => f.value).map((f, i) => {
                    const days = f.label === "תפוגה" ? daysTo(f.value!) : null;
                    return (
                      <div key={i} className={`rounded-lg p-2 text-center border ${f.label === "תפוגה" && days !== null && days < 0 ? "bg-red-50 border-red-200" : f.label === "תפוגה" && days !== null && days <= 30 ? "bg-yellow-50 border-yellow-200" : "bg-blue-50 border-blue-200"}`}>
                        <div className="text-xs text-muted-foreground">{f.label}</div>
                        <div className="font-bold text-sm text-foreground">{f.value}</div>
                        {days !== null && <div className="text-[10px] text-muted-foreground">{days < 0 ? `פג לפני ${Math.abs(days)} ימים` : `${days} ימים`}</div>}
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className={`px-2 py-1 rounded-lg text-xs font-medium ${VERIFICATION_COLORS[detailItem.verificationStatus]}`}>{detailItem.verificationStatus}</span>
                  {detailItem.isMandatory && <span className="px-2 py-1 bg-red-50 text-red-700 rounded-lg text-xs border border-red-200 flex items-center gap-1"><Lock size={10} /> חובה</span>}
                  {detailItem.isOriginal && <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs border border-blue-200">מקורי</span>}
                  {detailItem.notarized && <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs border border-indigo-200">נוטריון</span>}
                  {detailItem.apostille && <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded-lg text-xs border border-purple-200">אפוסטיל</span>}
                  {detailItem.translated && <span className="px-2 py-1 bg-teal-50 text-teal-700 rounded-lg text-xs border border-teal-200">מתורגם{detailItem.translationLanguage ? ` (${detailItem.translationLanguage})` : ""}</span>}
                </div>

                {detailItem.scope && (
                  <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
                    <h4 className="font-bold text-sm text-purple-700 mb-1">היקף</h4>
                    <p className="text-sm text-foreground">{detailItem.scope}</p>
                  </div>
                )}

                {detailItem.standards && (
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                    <h4 className="font-bold text-sm text-blue-700 mb-1">תקנים</h4>
                    <p className="text-sm text-foreground">{detailItem.standards}</p>
                  </div>
                )}

                {detailItem.rejectionReason && (
                  <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                    <h4 className="font-bold text-sm text-red-700 mb-1">סיבת דחייה</h4>
                    <p className="text-sm text-foreground">{detailItem.rejectionReason}</p>
                  </div>
                )}

                {detailItem.notes && (
                  <div className="bg-muted/30 rounded-xl p-4 border border-border">
                    <h4 className="font-bold text-sm text-foreground mb-1">הערות</h4>
                    <p className="text-sm text-muted-foreground">{detailItem.notes}</p>
                  </div>
                )}
                </>)}
                {detailTab === "related" && <RelatedRecords entityType="compliance-certificates" entityId={detailItem.id} />}
                {detailTab === "attachments" && <AttachmentsSection entityType="compliance-certificates" entityId={detailItem.id} />}
                {detailTab === "history" && <ActivityLog entityType="compliance-certificates" entityId={detailItem.id} />}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
