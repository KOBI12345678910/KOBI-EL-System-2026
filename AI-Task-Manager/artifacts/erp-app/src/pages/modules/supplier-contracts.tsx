import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import { translateStatus } from "@/lib/status-labels";
import {
  FileText, Calendar, DollarSign, Clock, AlertTriangle, CheckCircle2,
  Search, Plus, Edit2, Trash2, X, Save, Eye, Shield, Users,
  RefreshCw, XCircle, TrendingUp, Hash, Briefcase, Phone, Mail,
  ChevronDown, ChevronUp, Bell, Target, Zap, Copy
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";

interface Contract {
  id: number;
  contractNumber: string;
  supplierId: number;
  contractType: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  autoRenewal: boolean;
  renewalPeriodMonths: number | null;
  renewalNoticeDays: number | null;
  contractValue: string;
  currency: string;
  paymentTerms: string | null;
  paymentFrequency: string | null;
  slaResponseTime: string | null;
  slaResolutionTime: string | null;
  slaUptimePct: string | null;
  slaDetails: string | null;
  penaltyLateDelivery: string | null;
  penaltyQualityIssue: string | null;
  penaltySlaBreach: string | null;
  penaltyDetails: string | null;
  warrantyPeriodMonths: number | null;
  warrantyDetails: string | null;
  terminationNoticeDays: number | null;
  terminationConditions: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  responsiblePerson: string | null;
  department: string | null;
  categories: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
}

interface Supplier {
  id: number;
  supplierName: string;
}

const CONTRACT_TYPES = ["מסגרת", "שנתי", "חד פעמי", "שירות", "אחזקה", "רישוי", "ייעוץ", "אחר"];
const STATUSES = ["טיוטה", "פעיל", "ממתין לחידוש", "מוקפא", "הסתיים", "בוטל"];
const PAYMENT_FREQ = ["חד פעמי", "חודשי", "רבעוני", "חצי שנתי", "שנתי"];

type ViewMode = "dashboard" | "list" | "expiring" | "sla";

function statusColor(status: string): string {
  const c: Record<string, string> = {
    "טיוטה": "bg-muted/20 text-muted-foreground border-gray-500/30",
    "פעיל": "bg-green-500/20 text-green-400 border-green-500/30",
    "ממתין לחידוש": "bg-amber-500/20 text-amber-400 border-amber-500/30",
    "מוקפא": "bg-blue-500/20 text-blue-400 border-blue-500/30",
    "הסתיים": "bg-purple-500/20 text-purple-400 border-purple-500/30",
    "בוטל": "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return c[status] || "bg-muted/20 text-muted-foreground border-gray-500/30";
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function expiryBadge(days: number | null) {
  if (days === null) return null;
  if (days < 0) return <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400 border border-red-500/30">פג תוקף</span>;
  if (days <= 30) return <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400 border border-red-500/30">{days} ימים</span>;
  if (days <= 90) return <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30">{days} ימים</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400 border border-green-500/30">{days} ימים</span>;
}

export default function SupplierContractsPage() {
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({ contractNumber: { required: true, message: "מספר חוזה נדרש" }, supplierId: { required: true, message: "ספק נדרש" } });

  const { data: contractsRaw, isLoading } = useQuery({
    queryKey: ["supplier-contracts"],
    queryFn: async () => { const r = await authFetch(`${API}/supplier-contracts`); return r.json(); },
  });
  const contracts: Contract[] = Array.isArray(contractsRaw) ? contractsRaw : (contractsRaw?.data || contractsRaw?.items || []);

  const { data: suppliersRaw } = useQuery({
    queryKey: ["suppliers-for-contracts"],
    queryFn: async () => { const r = await authFetch(`${API}/suppliers`); return r.json(); },
  });
  const suppliers: Supplier[] = Array.isArray(suppliersRaw) ? suppliersRaw : (suppliersRaw?.data || suppliersRaw?.items || []);
  const supplierMap = useMemo(() => {
    const m: Record<number, Supplier> = {};
    suppliers.forEach(s => { m[s.id] = s; });
    return m;
  }, [suppliers]);

  const filtered = useMemo(() => {
    return contracts.filter(c => {
      const sn = supplierMap[c.supplierId]?.supplierName || "";
      const matchSearch = !search || sn.includes(search) || c.contractNumber.includes(search) || c.title.includes(search);
      const matchStatus = statusFilter === "all" || c.status === statusFilter;
      const matchType = typeFilter === "all" || c.contractType === typeFilter;
      return matchSearch && matchStatus && matchType;
    });
  }, [contracts, search, statusFilter, typeFilter, supplierMap]);

  const kpis = useMemo(() => {
    const active = contracts.filter(c => c.status === "פעיל").length;
    const total = contracts.length;
    const totalValue = contracts.filter(c => c.status === "פעיל").reduce((s, c) => s + parseFloat(c.contractValue || "0"), 0);
    const expiring30 = contracts.filter(c => { const d = daysUntil(c.endDate); return d !== null && d >= 0 && d <= 30 && c.status === "פעיל"; }).length;
    const expiring90 = contracts.filter(c => { const d = daysUntil(c.endDate); return d !== null && d >= 0 && d <= 90 && c.status === "פעיל"; }).length;
    const expired = contracts.filter(c => { const d = daysUntil(c.endDate); return d !== null && d < 0 && !["הסתיים", "בוטל"].includes(c.status); }).length;
    const autoRenewal = contracts.filter(c => c.autoRenewal && c.status === "פעיל").length;
    const withSla = contracts.filter(c => c.slaResponseTime || c.slaResolutionTime || c.slaUptimePct).length;
    return { active, total, totalValue, expiring30, expiring90, expired, autoRenewal, withSla };
  }, [contracts]);

  const expiringContracts = useMemo(() => {
    return contracts
      .filter(c => c.endDate && !["הסתיים", "בוטל"].includes(c.status))
      .map(c => ({ ...c, daysLeft: daysUntil(c.endDate) }))
      .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
  }, [contracts]);

  const [form, setForm] = useState<any>({});

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const url = data.id ? `${API}/supplier-contracts/${data.id}` : `${API}/supplier-contracts`;
      const method = data.id ? "PUT" : "POST";
      const r = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["supplier-contracts"] }); setShowForm(false); setEditingContract(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/supplier-contracts/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Delete failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["supplier-contracts"] }),
  });

  function resetForm() {
    return {
      supplierId: "", contractType: "מסגרת", title: "", description: "",
      startDate: new Date().toISOString().split("T")[0], endDate: "",
      autoRenewal: false, renewalPeriodMonths: "12", renewalNoticeDays: "30",
      contractValue: "", currency: "ILS", paymentTerms: "", paymentFrequency: "חודשי",
      slaResponseTime: "", slaResolutionTime: "", slaUptimePct: "", slaDetails: "",
      penaltyLateDelivery: "", penaltyQualityIssue: "", penaltySlaBreach: "", penaltyDetails: "",
      warrantyPeriodMonths: "", warrantyDetails: "", terminationNoticeDays: "30", terminationConditions: "",
      contactPerson: "", contactEmail: "", contactPhone: "", responsiblePerson: "", department: "",
      categories: "", notes: "", status: "טיוטה",
    };
  }

  function openForm(c?: Contract) {
    if (c) {
      setEditingContract(c);
      setForm({
        supplierId: c.supplierId, contractType: c.contractType, title: c.title, description: c.description || "",
        startDate: c.startDate, endDate: c.endDate || "",
        autoRenewal: c.autoRenewal, renewalPeriodMonths: c.renewalPeriodMonths ?? "12", renewalNoticeDays: c.renewalNoticeDays ?? "30",
        contractValue: c.contractValue || "", currency: c.currency, paymentTerms: c.paymentTerms || "",
        paymentFrequency: c.paymentFrequency || "חודשי",
        slaResponseTime: c.slaResponseTime || "", slaResolutionTime: c.slaResolutionTime || "",
        slaUptimePct: c.slaUptimePct || "", slaDetails: c.slaDetails || "",
        penaltyLateDelivery: c.penaltyLateDelivery || "", penaltyQualityIssue: c.penaltyQualityIssue || "",
        penaltySlaBreach: c.penaltySlaBreach || "", penaltyDetails: c.penaltyDetails || "",
        warrantyPeriodMonths: c.warrantyPeriodMonths ?? "", warrantyDetails: c.warrantyDetails || "",
        terminationNoticeDays: c.terminationNoticeDays ?? "30", terminationConditions: c.terminationConditions || "",
        contactPerson: c.contactPerson || "", contactEmail: c.contactEmail || "", contactPhone: c.contactPhone || "",
        responsiblePerson: c.responsiblePerson || "", department: c.department || "",
        categories: c.categories || "", notes: c.notes || "", status: c.status,
      });
    } else {
      setEditingContract(null);
      setForm(resetForm());
    }
    setShowForm(true);
  }

  function handleSubmit() {
    const payload = { ...form };
    if (editingContract) payload.id = editingContract.id;
    saveMutation.mutate(payload);
  }

  const tabs: { key: ViewMode; label: string; icon: any }[] = [
    { key: "dashboard", label: "דשבורד", icon: FileText },
    { key: "list", label: "רשימת חוזים", icon: Briefcase },
    { key: "expiring", label: "תפוגה קרובה", icon: Bell },
    { key: "sla", label: "SLA וקנסות", icon: Shield },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-foreground p-4 md:p-6" dir="rtl">
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/20 rounded-xl border border-indigo-500/30">
              <FileText className="text-indigo-400" size={28} />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold">חוזי ספקים</h1>
              <p className="text-muted-foreground text-sm">ניהול חוזים, SLA, תנאי תשלום, קנסות וחידושים</p>
            </div>
          </div>
          <button onClick={() => openForm()} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-medium transition-colors">
            <Plus size={18} /> חוזה חדש
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "חוזים פעילים", value: kpis.active, icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
            { label: "סה\"כ חוזים", value: kpis.total, icon: FileText, color: "text-indigo-400", bg: "bg-indigo-500/10 border-indigo-500/20" },
            { label: "שווי פעיל", value: `₪${kpis.totalValue.toLocaleString()}`, icon: DollarSign, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
            { label: "פג ב-30 יום", value: kpis.expiring30, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
            { label: "פג ב-90 יום", value: kpis.expiring90, icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
            { label: "פגי תוקף", value: kpis.expired, icon: XCircle, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20" },
            { label: "חידוש אוטומטי", value: kpis.autoRenewal, icon: RefreshCw, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
            { label: "עם SLA", value: kpis.withSla, icon: Shield, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
          ].map((k, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`${k.bg} border rounded-xl p-3 text-center`}>
              <k.icon className={`${k.color} mx-auto mb-1`} size={20} />
              <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
              <div className="text-[10px] text-muted-foreground">{k.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Tabs & Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-1 bg-muted/50 rounded-xl p-1 border border-border/50">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setViewMode(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === t.key ? "bg-indigo-600 text-foreground shadow-lg" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
                <t.icon size={16} /> {t.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש חוזה, ספק..."
              className="w-full bg-muted/60 border border-border rounded-lg pr-10 pl-4 py-2.5 text-sm text-foreground placeholder-gray-500 focus:border-indigo-500/50 focus:outline-none" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-muted/60 border border-border rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:border-indigo-500/50 focus:outline-none">
            <option value="all">כל הסטטוסים</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="bg-muted/60 border border-border rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:border-indigo-500/50 focus:outline-none">
            <option value="all">כל הסוגים</option>
            {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {viewMode === "dashboard" && (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Status Distribution */}
                <div className="bg-muted/40 border border-border/50 rounded-xl p-5">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><FileText className="text-indigo-400" size={20} /> התפלגות סטטוסים</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {STATUSES.map(status => {
                      const count = contracts.filter(c => c.status === status).length;
                      return (
                        <div key={status} className={`${statusColor(status)} border rounded-lg p-3 text-center`}>
                          <div className="text-xl font-bold">{count}</div>
                          <div className="text-xs">{status}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Type Distribution */}
                <div className="bg-muted/40 border border-border/50 rounded-xl p-5">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Briefcase className="text-blue-400" size={20} /> סוגי חוזים</h3>
                  <div className="space-y-3">
                    {CONTRACT_TYPES.map(type => {
                      const count = contracts.filter(c => c.contractType === type).length;
                      const pct = contracts.length ? (count / contracts.length * 100) : 0;
                      return (
                        <div key={type} className="flex items-center gap-3">
                          <span className="text-sm w-20 text-gray-300">{type}</span>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }}
                              className="h-full bg-indigo-500 rounded-full" />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-left">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Expiring Soon Alert */}
              {(kpis.expiring30 > 0 || kpis.expired > 0) && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5">
                  <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-red-400"><AlertTriangle size={20} /> חוזים דורשים תשומת לב</h3>
                  <div className="space-y-2">
                    {expiringContracts.filter(c => (c.daysLeft ?? 999) <= 30).map(c => (
                      <div key={c.id} className="flex items-center justify-between bg-background/60 rounded-lg p-3 border border-border/30">
                        <div className="flex items-center gap-3">
                          <FileText size={16} className="text-red-400" />
                          <div>
                            <span className="font-medium">{c.title}</span>
                            <span className="text-muted-foreground text-xs mr-2">({supplierMap[c.supplierId]?.supplierName || `#${c.supplierId}`})</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{c.endDate}</span>
                          {expiryBadge(c.daysLeft)}
                          {c.autoRenewal && <RefreshCw size={14} className="text-cyan-400" title="חידוש אוטומטי" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Contracts Table */}
              <div className="bg-muted/40 border border-border/50 rounded-xl p-5">
                <h3 className="text-lg font-bold mb-4">חוזים אחרונים</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">מס' חוזה</th>
                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">כותרת</th>
                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">ספק</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">סוג</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">תחילה</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">סיום</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">שווי</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">סטטוס</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">פעולות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, 15).map(c => (
                        <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-2 font-mono text-indigo-400">{c.contractNumber}</td>
                          <td className="py-3 px-2 font-medium max-w-[200px] truncate">{c.title}</td>
                          <td className="py-3 px-2">{supplierMap[c.supplierId]?.supplierName || `#${c.supplierId}`}</td>
                          <td className="py-3 px-2 text-center text-xs">{c.contractType}</td>
                          <td className="py-3 px-2 text-center text-gray-300">{c.startDate}</td>
                          <td className="py-3 px-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-gray-300">{c.endDate || "—"}</span>
                              {c.endDate && expiryBadge(daysUntil(c.endDate))}
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center text-blue-400">₪{parseFloat(c.contractValue || "0").toLocaleString()}</td>
                          <td className="py-3 px-2 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs border ${statusColor(c.status)}`}>{translateStatus(c.status)}</span>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => setSelectedContract(c)} className="p-1.5 hover:bg-muted rounded-lg"><Eye size={14} className="text-muted-foreground" /></button>
                              <button onClick={() => openForm(c)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 size={14} className="text-blue-400" /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/supplier-contracts`, c.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                              {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק חוזה זה?", { itemName: c.contract_number || c.title || String(c.id), entityType: "חוזה ספק" }); if (ok) deleteMutation.mutate(c.id); }} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 size={14} className="text-red-400" /></button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length === 0 && <p className="text-muted-foreground text-center py-8">אין חוזים</p>}
                </div>
              </div>
            </motion.div>
          )}

          {viewMode === "list" && (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <BulkActions bulk={bulk} actions={defaultBulkActions} entityName="חוזים" />
              {filtered.map(c => {
                const days = daysUntil(c.endDate);
                return (
                  <motion.div key={c.id} layout className={`bg-muted/40 border border-border/50 rounded-xl p-4 hover:border-indigo-500/30 transition-all ${bulk.isSelected(c.id) ? "ring-1 ring-primary/50 bg-primary/5" : ""}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div onClick={e => e.stopPropagation()}><BulkCheckbox bulk={bulk} id={c.id} /></div>
                        <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                          <FileText className="text-indigo-400" size={22} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-indigo-400 font-bold">{c.contractNumber}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs border ${statusColor(c.status)}`}>{c.status}</span>
                            {c.autoRenewal && <RefreshCw size={13} className="text-cyan-400" title="חידוש אוטומטי" />}
                          </div>
                          <div className="font-medium truncate">{c.title}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                            <span>{supplierMap[c.supplierId]?.supplierName || `#${c.supplierId}`}</span>
                            <span>{c.contractType}</span>
                            <span>{c.startDate} — {c.endDate || "ללא הגבלה"}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">שווי</div>
                          <div className="font-bold text-blue-400">₪{parseFloat(c.contractValue || "0").toLocaleString()}</div>
                        </div>
                        {c.endDate && (
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground">תפוגה</div>
                            {expiryBadge(days)}
                          </div>
                        )}
                        <div className="flex gap-1">
                          <button onClick={() => setSelectedContract(c)} className="p-1.5 hover:bg-muted rounded-lg"><Eye size={15} className="text-muted-foreground" /></button>
                          <button onClick={() => openForm(c)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 size={15} className="text-blue-400" /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/supplier-contracts`, c.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                          {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק חוזה זה?", { itemName: c.contract_number || c.title || String(c.id), entityType: "חוזה ספק" }); if (ok) deleteMutation.mutate(c.id); }} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 size={15} className="text-red-400" /></button>}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              {filtered.length === 0 && <p className="text-muted-foreground text-center py-12">אין חוזים</p>}
            </motion.div>
          )}

          {viewMode === "expiring" && (
            <motion.div key="expiring" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                  <XCircle className="text-red-400 mx-auto mb-1" size={24} />
                  <div className="text-lg sm:text-2xl font-bold text-red-400">{expiringContracts.filter(c => (c.daysLeft ?? 999) < 0).length}</div>
                  <div className="text-sm text-muted-foreground">פגי תוקף</div>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
                  <AlertTriangle className="text-amber-400 mx-auto mb-1" size={24} />
                  <div className="text-lg sm:text-2xl font-bold text-amber-400">{expiringContracts.filter(c => (c.daysLeft ?? 999) >= 0 && (c.daysLeft ?? 999) <= 30).length}</div>
                  <div className="text-sm text-muted-foreground">עד 30 יום</div>
                </div>
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
                  <Clock className="text-green-400 mx-auto mb-1" size={24} />
                  <div className="text-lg sm:text-2xl font-bold text-green-400">{expiringContracts.filter(c => (c.daysLeft ?? 999) > 30 && (c.daysLeft ?? 999) <= 90).length}</div>
                  <div className="text-sm text-muted-foreground">31-90 יום</div>
                </div>
              </div>
              <div className="bg-muted/40 border border-border/50 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/60">
                      <th className="text-right py-3 px-3 text-muted-foreground font-medium">חוזה</th>
                      <th className="text-right py-3 px-3 text-muted-foreground font-medium">ספק</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">תאריך סיום</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">ימים שנותרו</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">חידוש אוטומטי</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">שווי</th>
                      <th className="text-center py-3 px-3 text-muted-foreground font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiringContracts.map(c => (
                      <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedContract(c)}>
                        <td className="py-3 px-3">
                          <div className="font-mono text-indigo-400 text-xs">{c.contractNumber}</div>
                          <div className="font-medium truncate max-w-[200px]">{c.title}</div>
                        </td>
                        <td className="py-3 px-3">{supplierMap[c.supplierId]?.supplierName || `#${c.supplierId}`}</td>
                        <td className="py-3 px-3 text-center text-gray-300">{c.endDate}</td>
                        <td className="py-3 px-3 text-center">{expiryBadge(c.daysLeft)}</td>
                        <td className="py-3 px-3 text-center">{c.autoRenewal ? <RefreshCw size={16} className="text-cyan-400 mx-auto" /> : <span className="text-muted-foreground">—</span>}</td>
                        <td className="py-3 px-3 text-center text-blue-400">₪{parseFloat(c.contractValue || "0").toLocaleString()}</td>
                        <td className="py-3 px-3 text-center"><span className={`px-2 py-1 rounded-full text-xs border ${statusColor(c.status)}`}>{c.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {expiringContracts.length === 0 && <p className="text-muted-foreground text-center py-8">אין חוזים עם תאריך סיום</p>}
              </div>
            </motion.div>
          )}

          {viewMode === "sla" && (
            <motion.div key="sla" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <p className="text-muted-foreground text-sm">חוזים עם הגדרות SLA וקנסות</p>
              <div className="space-y-3">
                {contracts.filter(c => c.slaResponseTime || c.slaResolutionTime || c.slaUptimePct || c.penaltyLateDelivery || c.penaltyQualityIssue || c.penaltySlaBreach).map(c => (
                  <div key={c.id} className="bg-muted/40 border border-border/50 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="font-bold flex items-center gap-2">
                          <Shield className="text-purple-400" size={18} />
                          {c.title}
                          <span className="text-xs text-muted-foreground font-mono">({c.contractNumber})</span>
                        </div>
                        <div className="text-sm text-muted-foreground">{supplierMap[c.supplierId]?.supplierName || `#${c.supplierId}`}</div>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs border ${statusColor(c.status)}`}>{c.status}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                      {c.slaResponseTime && (
                        <div className="bg-background/50 rounded-lg p-3 text-center border border-border/30">
                          <Clock size={16} className="text-blue-400 mx-auto mb-1" />
                          <div className="text-sm font-bold">{c.slaResponseTime}</div>
                          <div className="text-[10px] text-muted-foreground">זמן תגובה</div>
                        </div>
                      )}
                      {c.slaResolutionTime && (
                        <div className="bg-background/50 rounded-lg p-3 text-center border border-border/30">
                          <Target size={16} className="text-green-400 mx-auto mb-1" />
                          <div className="text-sm font-bold">{c.slaResolutionTime}</div>
                          <div className="text-[10px] text-muted-foreground">זמן פתרון</div>
                        </div>
                      )}
                      {c.slaUptimePct && (
                        <div className="bg-background/50 rounded-lg p-3 text-center border border-border/30">
                          <Zap size={16} className="text-amber-400 mx-auto mb-1" />
                          <div className="text-sm font-bold">{c.slaUptimePct}%</div>
                          <div className="text-[10px] text-muted-foreground">זמינות</div>
                        </div>
                      )}
                      {parseFloat(c.penaltyLateDelivery || "0") > 0 && (
                        <div className="bg-red-500/5 rounded-lg p-3 text-center border border-red-500/20">
                          <AlertTriangle size={16} className="text-red-400 mx-auto mb-1" />
                          <div className="text-sm font-bold text-red-400">₪{parseFloat(c.penaltyLateDelivery!).toLocaleString()}</div>
                          <div className="text-[10px] text-muted-foreground">קנס איחור</div>
                        </div>
                      )}
                      {parseFloat(c.penaltyQualityIssue || "0") > 0 && (
                        <div className="bg-red-500/5 rounded-lg p-3 text-center border border-red-500/20">
                          <XCircle size={16} className="text-red-400 mx-auto mb-1" />
                          <div className="text-sm font-bold text-red-400">₪{parseFloat(c.penaltyQualityIssue!).toLocaleString()}</div>
                          <div className="text-[10px] text-muted-foreground">קנס איכות</div>
                        </div>
                      )}
                      {parseFloat(c.penaltySlaBreach || "0") > 0 && (
                        <div className="bg-red-500/5 rounded-lg p-3 text-center border border-red-500/20">
                          <Shield size={16} className="text-red-400 mx-auto mb-1" />
                          <div className="text-sm font-bold text-red-400">₪{parseFloat(c.penaltySlaBreach!).toLocaleString()}</div>
                          <div className="text-[10px] text-muted-foreground">קנס SLA</div>
                        </div>
                      )}
                    </div>
                    {c.slaDetails && <p className="text-xs text-muted-foreground mt-2">{c.slaDetails}</p>}
                  </div>
                ))}
                {contracts.filter(c => c.slaResponseTime || c.slaResolutionTime || c.penaltyLateDelivery).length === 0 && (
                  <p className="text-muted-foreground text-center py-12">אין חוזים עם הגדרות SLA</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Detail Modal */}
        <AnimatePresence>
          {selectedContract && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setSelectedContract(null)}>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-background border border-border rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <FileText className="text-indigo-400" size={22} />
                    {selectedContract.title}
                    <span className="text-sm text-muted-foreground font-mono">({selectedContract.contractNumber})</span>
                  </h3>
                  <button onClick={() => setSelectedContract(null)} className="p-2 hover:bg-muted rounded-lg"><X size={20} /></button>
                </div>

                <div className="flex border-b border-border mb-6">
                  {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                    <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-indigo-500 text-indigo-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                  ))}
                </div>

                {detailTab === "details" && (<>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6 text-sm">
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">ספק:</span> <span className="font-medium mr-2">{supplierMap[selectedContract.supplierId]?.supplierName || `#${selectedContract.supplierId}`}</span></div>
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">סוג:</span> <span className="font-medium mr-2">{selectedContract.contractType}</span></div>
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">סטטוס:</span> <span className={`mr-2 px-2 py-0.5 rounded-full text-xs border ${statusColor(selectedContract.status)}`}>{selectedContract.status}</span></div>
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">תחילה:</span> <span className="font-medium mr-2">{selectedContract.startDate}</span></div>
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">סיום:</span> <span className="font-medium mr-2">{selectedContract.endDate || "ללא"}</span> {selectedContract.endDate && expiryBadge(daysUntil(selectedContract.endDate))}</div>
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">שווי:</span> <span className="font-bold mr-2 text-blue-400">₪{parseFloat(selectedContract.contractValue || "0").toLocaleString()}</span></div>
                </div>

                {selectedContract.description && (
                  <div className="bg-muted/40 rounded-lg p-3 mb-4">
                    <div className="text-xs text-muted-foreground mb-1">תיאור</div>
                    <p className="text-sm">{selectedContract.description}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-muted/40 rounded-lg p-3">
                    <h4 className="font-bold text-sm mb-2 flex items-center gap-2"><DollarSign className="text-green-400" size={16} /> תנאי תשלום</h4>
                    <div className="text-sm space-y-1">
                      <div><span className="text-muted-foreground">תנאים:</span> <span className="mr-1">{selectedContract.paymentTerms || "—"}</span></div>
                      <div><span className="text-muted-foreground">תדירות:</span> <span className="mr-1">{selectedContract.paymentFrequency || "—"}</span></div>
                    </div>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3">
                    <h4 className="font-bold text-sm mb-2 flex items-center gap-2"><RefreshCw className="text-cyan-400" size={16} /> חידוש</h4>
                    <div className="text-sm space-y-1">
                      <div><span className="text-muted-foreground">אוטומטי:</span> <span className="mr-1">{selectedContract.autoRenewal ? "כן" : "לא"}</span></div>
                      <div><span className="text-muted-foreground">תקופה:</span> <span className="mr-1">{selectedContract.renewalPeriodMonths} חודשים</span></div>
                      <div><span className="text-muted-foreground">הודעה מראש:</span> <span className="mr-1">{selectedContract.renewalNoticeDays} ימים</span></div>
                    </div>
                  </div>
                </div>

                {(selectedContract.slaResponseTime || selectedContract.slaResolutionTime || selectedContract.slaUptimePct) && (
                  <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-3 mb-4">
                    <h4 className="font-bold text-sm mb-2 flex items-center gap-2"><Shield className="text-purple-400" size={16} /> SLA</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                      <div><span className="text-muted-foreground">תגובה:</span> <span className="mr-1 font-medium">{selectedContract.slaResponseTime || "—"}</span></div>
                      <div><span className="text-muted-foreground">פתרון:</span> <span className="mr-1 font-medium">{selectedContract.slaResolutionTime || "—"}</span></div>
                      <div><span className="text-muted-foreground">זמינות:</span> <span className="mr-1 font-medium">{selectedContract.slaUptimePct ? `${selectedContract.slaUptimePct}%` : "—"}</span></div>
                    </div>
                    {selectedContract.slaDetails && <p className="text-xs text-muted-foreground mt-2">{selectedContract.slaDetails}</p>}
                  </div>
                )}

                {(parseFloat(selectedContract.penaltyLateDelivery || "0") > 0 || parseFloat(selectedContract.penaltyQualityIssue || "0") > 0 || parseFloat(selectedContract.penaltySlaBreach || "0") > 0) && (
                  <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 mb-4">
                    <h4 className="font-bold text-sm mb-2 flex items-center gap-2"><AlertTriangle className="text-red-400" size={16} /> קנסות</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                      <div><span className="text-muted-foreground">איחור:</span> <span className="mr-1 text-red-400 font-medium">₪{parseFloat(selectedContract.penaltyLateDelivery || "0").toLocaleString()}</span></div>
                      <div><span className="text-muted-foreground">איכות:</span> <span className="mr-1 text-red-400 font-medium">₪{parseFloat(selectedContract.penaltyQualityIssue || "0").toLocaleString()}</span></div>
                      <div><span className="text-muted-foreground">SLA:</span> <span className="mr-1 text-red-400 font-medium">₪{parseFloat(selectedContract.penaltySlaBreach || "0").toLocaleString()}</span></div>
                    </div>
                    {selectedContract.penaltyDetails && <p className="text-xs text-muted-foreground mt-2">{selectedContract.penaltyDetails}</p>}
                  </div>
                )}

                {(selectedContract.contactPerson || selectedContract.contactEmail || selectedContract.contactPhone) && (
                  <div className="bg-muted/40 rounded-lg p-3 mb-4">
                    <h4 className="font-bold text-sm mb-2 flex items-center gap-2"><Users className="text-blue-400" size={16} /> איש קשר</h4>
                    <div className="flex gap-4 text-sm">
                      {selectedContract.contactPerson && <span className="flex items-center gap-1"><Users size={13} className="text-muted-foreground" /> {selectedContract.contactPerson}</span>}
                      {selectedContract.contactEmail && <span className="flex items-center gap-1"><Mail size={13} className="text-muted-foreground" /> {selectedContract.contactEmail}</span>}
                      {selectedContract.contactPhone && <span className="flex items-center gap-1"><Phone size={13} className="text-muted-foreground" /> {selectedContract.contactPhone}</span>}
                    </div>
                  </div>
                )}

                {selectedContract.notes && (
                  <div className="bg-muted/40 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground mb-1">הערות</div>
                    <p className="text-sm">{selectedContract.notes}</p>
                  </div>
                )}
                </>)}

                {detailTab === "related" && (
                  <RelatedRecords entityType="supplier-contracts" entityId={selectedContract.id} relations={[
                    { key: "suppliers", label: "ספקים", endpoint: "/api/suppliers" },
                    { key: "purchase-orders", label: "הזמנות רכש", endpoint: "/api/purchase-orders" },
                  ]} />
                )}
                {detailTab === "docs" && (
                  <AttachmentsSection entityType="supplier-contracts" entityId={selectedContract.id} />
                )}
                {detailTab === "history" && (
                  <ActivityLog entityType="supplier-contracts" entityId={selectedContract.id} />
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form Modal */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-background border border-border rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold">{editingContract ? `עריכת חוזה ${editingContract.contractNumber}` : "חוזה חדש"}</h3>
                  <button onClick={() => setShowForm(false)} className="p-2 hover:bg-muted rounded-lg"><X size={20} /></button>
                </div>

                <div className="space-y-5">
                  {/* Basic Info */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">ספק *</label>
                      <select value={form.supplierId} onChange={e => setForm({ ...form, supplierId: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-indigo-500/50 focus:outline-none">
                        <option value="">בחר ספק...</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplierName}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">סוג חוזה</label>
                      <select value={form.contractType} onChange={e => setForm({ ...form, contractType: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-indigo-500/50 focus:outline-none">
                        {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">סטטוס</label>
                      <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-indigo-500/50 focus:outline-none">
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">כותרת חוזה *</label>
                    <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="כותרת"
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-indigo-500/50 focus:outline-none" />
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">תיאור</label>
                    <textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-indigo-500/50 focus:outline-none resize-none" />
                  </div>

                  {/* Dates & Value */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">תאריך תחילה *</label>
                      <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-indigo-500/50 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">תאריך סיום</label>
                      <input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-indigo-500/50 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">שווי חוזה</label>
                      <input type="number" value={form.contractValue} onChange={e => setForm({ ...form, contractValue: e.target.value })} placeholder="₪"
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-indigo-500/50 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">תדירות תשלום</label>
                      <select value={form.paymentFrequency} onChange={e => setForm({ ...form, paymentFrequency: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-indigo-500/50 focus:outline-none">
                        {PAYMENT_FREQ.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">תנאי תשלום</label>
                    <input value={form.paymentTerms} onChange={e => setForm({ ...form, paymentTerms: e.target.value })} placeholder="שוטף+30, שוטף+60..."
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-indigo-500/50 focus:outline-none" />
                  </div>

                  {/* Renewal */}
                  <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                    <h4 className="font-bold text-sm mb-3 flex items-center gap-2"><RefreshCw className="text-cyan-400" size={16} /> חידוש</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <label className="flex items-center gap-2 text-sm text-gray-300">
                        <input type="checkbox" checked={form.autoRenewal} onChange={e => setForm({ ...form, autoRenewal: e.target.checked })}
                          className="rounded border-border" /> חידוש אוטומטי
                      </label>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">תקופת חידוש (חודשים)</label>
                        <input type="number" value={form.renewalPeriodMonths} onChange={e => setForm({ ...form, renewalPeriodMonths: e.target.value })}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-indigo-500/50 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">הודעה מראש (ימים)</label>
                        <input type="number" value={form.renewalNoticeDays} onChange={e => setForm({ ...form, renewalNoticeDays: e.target.value })}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-indigo-500/50 focus:outline-none" />
                      </div>
                    </div>
                  </div>

                  {/* SLA */}
                  <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                    <h4 className="font-bold text-sm mb-3 flex items-center gap-2"><Shield className="text-purple-400" size={16} /> SLA</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">זמן תגובה</label>
                        <input value={form.slaResponseTime} onChange={e => setForm({ ...form, slaResponseTime: e.target.value })} placeholder="4 שעות"
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-indigo-500/50 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">זמן פתרון</label>
                        <input value={form.slaResolutionTime} onChange={e => setForm({ ...form, slaResolutionTime: e.target.value })} placeholder="24 שעות"
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-indigo-500/50 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">זמינות (%)</label>
                        <input type="number" value={form.slaUptimePct} onChange={e => setForm({ ...form, slaUptimePct: e.target.value })} placeholder="99.9"
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-indigo-500/50 focus:outline-none" />
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="text-xs text-muted-foreground mb-1 block">פרטי SLA נוספים</label>
                      <textarea rows={2} value={form.slaDetails} onChange={e => setForm({ ...form, slaDetails: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-indigo-500/50 focus:outline-none resize-none" />
                    </div>
                  </div>

                  {/* Penalties */}
                  <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                    <h4 className="font-bold text-sm mb-3 flex items-center gap-2"><AlertTriangle className="text-red-400" size={16} /> קנסות</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">קנס איחור (₪)</label>
                        <input type="number" value={form.penaltyLateDelivery} onChange={e => setForm({ ...form, penaltyLateDelivery: e.target.value })}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-indigo-500/50 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">קנס איכות (₪)</label>
                        <input type="number" value={form.penaltyQualityIssue} onChange={e => setForm({ ...form, penaltyQualityIssue: e.target.value })}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-indigo-500/50 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">קנס הפרת SLA (₪)</label>
                        <input type="number" value={form.penaltySlaBreach} onChange={e => setForm({ ...form, penaltySlaBreach: e.target.value })}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-indigo-500/50 focus:outline-none" />
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="text-xs text-muted-foreground mb-1 block">פרטי קנסות</label>
                      <textarea rows={2} value={form.penaltyDetails} onChange={e => setForm({ ...form, penaltyDetails: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-indigo-500/50 focus:outline-none resize-none" />
                    </div>
                  </div>

                  {/* Warranty & Termination */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                      <h4 className="font-bold text-sm mb-3">אחריות</h4>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">תקופת אחריות (חודשים)</label>
                        <input type="number" value={form.warrantyPeriodMonths} onChange={e => setForm({ ...form, warrantyPeriodMonths: e.target.value })}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-indigo-500/50 focus:outline-none" />
                      </div>
                      <div className="mt-2">
                        <label className="text-xs text-muted-foreground mb-1 block">פרטי אחריות</label>
                        <input value={form.warrantyDetails} onChange={e => setForm({ ...form, warrantyDetails: e.target.value })}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-indigo-500/50 focus:outline-none" />
                      </div>
                    </div>
                    <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                      <h4 className="font-bold text-sm mb-3">ביטול</h4>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">הודעה מראש (ימים)</label>
                        <input type="number" value={form.terminationNoticeDays} onChange={e => setForm({ ...form, terminationNoticeDays: e.target.value })}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-indigo-500/50 focus:outline-none" />
                      </div>
                      <div className="mt-2">
                        <label className="text-xs text-muted-foreground mb-1 block">תנאי ביטול</label>
                        <input value={form.terminationConditions} onChange={e => setForm({ ...form, terminationConditions: e.target.value })}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:border-indigo-500/50 focus:outline-none" />
                      </div>
                    </div>
                  </div>

                  {/* Contact & Responsible */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">איש קשר</label>
                      <input value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-indigo-500/50 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">אימייל</label>
                      <input type="email" value={form.contactEmail} onChange={e => setForm({ ...form, contactEmail: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-indigo-500/50 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">טלפון</label>
                      <input value={form.contactPhone} onChange={e => setForm({ ...form, contactPhone: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-indigo-500/50 focus:outline-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">אחראי מטעם החברה</label>
                      <input value={form.responsiblePerson} onChange={e => setForm({ ...form, responsiblePerson: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-indigo-500/50 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">מחלקה</label>
                      <input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-indigo-500/50 focus:outline-none" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">הערות</label>
                    <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-indigo-500/50 focus:outline-none resize-none" />
                  </div>

                  {/* Submit */}
                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-border rounded-lg text-gray-300 hover:bg-muted transition-colors">ביטול</button>
                    <button onClick={handleSubmit} disabled={saveMutation.isPending || !form.supplierId || !form.title}
                      className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-muted disabled:text-muted-foreground rounded-lg font-medium transition-colors">
                      <Save size={16} /> {saveMutation.isPending ? "שומר..." : editingContract ? "עדכון" : "שמירה"}
                    </button>
                  </div>
                  {saveMutation.isError && <p className="text-red-400 text-sm text-center">{(saveMutation.error as Error).message}</p>}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
