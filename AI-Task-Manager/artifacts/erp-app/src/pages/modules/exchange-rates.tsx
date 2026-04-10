import { usePermissions } from "@/hooks/use-permissions";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, DollarSign, BarChart3, Search, Plus, Edit2,
  Trash2, X, Save, Eye, Calendar, Shield, ArrowUpDown, ArrowUp, ArrowDown,
  Building2, AlertTriangle, Clock, Minus, RefreshCw, FileText, Copy
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Printer, Send } from "lucide-react";
import ExportDropdown from "@/components/export-dropdown";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (n: any) => n != null ? Number(n).toLocaleString("he-IL") : "-";
const fmtRate = (n: any) => n != null ? Number(n).toFixed(4) : "-";
const fmtPct = (n: any) => n != null ? `${Number(n) >= 0 ? "+" : ""}${Number(n).toFixed(2)}%` : "-";

const CURRENCIES = [
  { code: "USD", name: "דולר אמריקאי", symbol: "$", flag: "🇺🇸" },
  { code: "EUR", name: "אירו", symbol: "€", flag: "🇪🇺" },
  { code: "GBP", name: "לירה שטרלינג", symbol: "£", flag: "🇬🇧" },
  { code: "CNY", name: "יואן סיני", symbol: "¥", flag: "🇨🇳" },
  { code: "JPY", name: "ין יפני", symbol: "¥", flag: "🇯🇵" },
  { code: "TRY", name: "לירה טורקית", symbol: "₺", flag: "🇹🇷" },
  { code: "CHF", name: "פרנק שוויצרי", symbol: "CHF", flag: "🇨🇭" },
  { code: "CAD", name: "דולר קנדי", symbol: "C$", flag: "🇨🇦" },
  { code: "AUD", name: "דולר אוסטרלי", symbol: "A$", flag: "🇦🇺" },
  { code: "SEK", name: "כתר שוודי", symbol: "kr", flag: "🇸🇪" },
];

const HEDGE_TYPES = ["פורוורד", "אופציה", "swap", "פיוצ'ר", "collar"];
const HEDGE_STATUSES = ["פעיל", "בוצע", "פג תוקף", "בוטל", "ממתין"];
const EXPOSURE_TYPES = ["יבוא", "ייצוא", "הלוואה", "השקעה", "אחר"];
const RISK_LEVELS = ["נמוך", "בינוני", "גבוה", "קריטי"];
const OPTION_TYPES = ["Call", "Put"];

const RISK_COLORS: Record<string, string> = {
  "נמוך": "bg-green-100 text-green-700",
  "בינוני": "bg-yellow-100 text-yellow-700",
  "גבוה": "bg-orange-100 text-orange-700",
  "קריטי": "bg-red-100 text-red-700",
};

const STATUS_COLORS: Record<string, string> = {
  "פעיל": "bg-green-100 text-green-800",
  "בוצע": "bg-blue-100 text-blue-800",
  "פג תוקף": "bg-red-100 text-red-800",
  "בוטל": "bg-muted/50 text-foreground",
  "ממתין": "bg-yellow-100 text-yellow-800",
  "פתוח": "bg-blue-100 text-blue-700",
  "סגור": "bg-muted/50 text-foreground",
};

interface Rate { id: number; rateNumber: string; currencyCode: string; currencyName: string; baseCurrency: string; rate: string; previousRate: string | null; changePercent: string | null; rateDate: string; source: string; rateType: string; buyRate: string | null; sellRate: string | null; midRate: string | null; status: string; notes: string | null; }
interface Hedge { id: number; contractNumber: string; contractType: string; status: string; currencyCode: string; amount: string; hedgedRate: string; spotRateAtContract: string | null; startDate: string; maturityDate: string; settlementDate: string | null; counterparty: string | null; bankName: string | null; linkedImportOrder: string | null; linkedLc: string | null; premiumCost: string | null; strikePrice: string | null; optionType: string | null; notionalAmount: string | null; settlementAmount: string | null; realizedPnl: string | null; unrealizedPnl: string | null; marginRequired: string | null; marginDeposited: string | null; referenceNumber: string | null; priority: string; notes: string | null; }
interface Exposure { id: number; exposureNumber: string; currencyCode: string; exposureType: string; category: string; totalExposure: string; hedgedAmount: string; unhedgedAmount: string; hedgeRatio: string; currentRate: string | null; budgetRate: string | null; impactAtCurrent: string | null; impactAtBudget: string | null; variance: string | null; linkedSupplier: string | null; linkedOrders: string | null; maturityMonth: string | null; status: string; riskLevel: string; notes: string | null; }

const emptyRateForm: any = { rateNumber: "", currencyCode: "USD", currencyName: "דולר אמריקאי", baseCurrency: "ILS", rate: "", previousRate: "", changePercent: "", rateDate: new Date().toISOString().split("T")[0], source: "ידני", rateType: "רשמי", buyRate: "", sellRate: "", midRate: "", status: "פעיל", notes: "" };
const emptyHedgeForm: any = { contractNumber: "", contractType: "פורוורד", status: "פעיל", currencyCode: "USD", amount: "", hedgedRate: "", spotRateAtContract: "", startDate: "", maturityDate: "", settlementDate: "", counterparty: "", bankName: "", linkedImportOrder: "", linkedLc: "", premiumCost: "", strikePrice: "", optionType: "", notionalAmount: "", settlementAmount: "", realizedPnl: "", unrealizedPnl: "", marginRequired: "", marginDeposited: "", referenceNumber: "", priority: "רגיל", notes: "" };
const emptyExposureForm: any = { exposureNumber: "", currencyCode: "USD", exposureType: "יבוא", category: "סחורות", totalExposure: "", hedgedAmount: "", unhedgedAmount: "", hedgeRatio: "", currentRate: "", budgetRate: "", impactAtCurrent: "", impactAtBudget: "", variance: "", linkedSupplier: "", linkedOrders: "", maturityMonth: "", status: "פתוח", riskLevel: "בינוני", notes: "" };


const exportToExcel: any[] = [];
const load: any[] = [];
export default function ExchangeRatesPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [activeTab, setActiveTab] = useState<"dashboard" | "rates" | "hedging" | "exposure">("dashboard");
  const [showForm, setShowForm] = useState<null | "rate" | "hedge" | "exposure">(null);
  const [editItem, setEditItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [detailTab, setDetailTab] = useState("details");
  const qc = useQueryClient();
  const { selectedIds, toggle, toggleAll, clear, isSelected, isAllSelected } = useBulkSelection();

  const { data: rawRates } = useQuery({ queryKey: ["exchange-rates"], queryFn: () => authFetch(`${API}/exchange-rates`).then(r => r.json()) });
  const { data: rawHedges } = useQuery({ queryKey: ["hedging-contracts"], queryFn: () => authFetch(`${API}/hedging-contracts`).then(r => r.json()) });
  const { data: rawExposures } = useQuery({ queryKey: ["currency-exposures"], queryFn: () => authFetch(`${API}/currency-exposures`).then(r => r.json()) });

  const rates: Rate[] = useMemo(() => safeArray(rawRates), [rawRates]);
  const hedges: Hedge[] = useMemo(() => safeArray(rawHedges), [rawHedges]);
  const exposures: Exposure[] = useMemo(() => safeArray(rawExposures), [rawExposures]);

  const createMut = useMutation({
    mutationFn: ({ url, data }: any) => authFetch(`${API}/${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exchange-rates"] }); qc.invalidateQueries({ queryKey: ["hedging-contracts"] }); qc.invalidateQueries({ queryKey: ["currency-exposures"] }); setShowForm(null); },
  });
  const updateMut = useMutation({
    mutationFn: ({ url, id, data }: any) => authFetch(`${API}/${url}/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exchange-rates"] }); qc.invalidateQueries({ queryKey: ["hedging-contracts"] }); qc.invalidateQueries({ queryKey: ["currency-exposures"] }); setShowForm(null); setEditItem(null); },
  });
  const deleteMut = useMutation({
    mutationFn: ({ url, id }: any) => authFetch(`${API}/${url}/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exchange-rates"] }); qc.invalidateQueries({ queryKey: ["hedging-contracts"] }); qc.invalidateQueries({ queryKey: ["currency-exposures"] }); },
  });

  const openCreate = (type: "rate" | "hedge" | "exposure") => {
    setEditItem(null);
    setFormData(type === "rate" ? { ...emptyRateForm } : type === "hedge" ? { ...emptyHedgeForm } : { ...emptyExposureForm });
    setShowForm(type);
  };
  const openEdit = (type: "rate" | "hedge" | "exposure", item: any) => {
    setEditItem(item); setFormData({ ...item }); setShowForm(type);
  };
  const handleSave = () => {
    const url = showForm === "rate" ? "exchange-rates" : showForm === "hedge" ? "hedging-contracts" : "currency-exposures";
    if (editItem) updateMut.mutate({ url, id: editItem.id, data: formData });
    else createMut.mutate({ url, data: formData });
  };
  const handleDelete = async (type: string, id: number) => {
    if (!(await globalConfirm("למחוק רשומה זו?", { entityType: type === "rate" ? "שער חליפין" : type === "hedge" ? "חוזה גידור" : "חשיפת מט\"ח" }))) return;
    const url = type === "rate" ? "exchange-rates" : type === "hedge" ? "hedging-contracts" : "currency-exposures";
    deleteMut.mutate({ url, id });
  };

  const now = new Date();
  const daysTo = (d: string | null) => d ? Math.ceil((new Date(d).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

  const latestRates = useMemo(() => {
    const map: Record<string, Rate> = {};
    rates.forEach(r => { if (!map[r.currencyCode] || r.rateDate > map[r.currencyCode].rateDate) map[r.currencyCode] = r; });
    return Object.values(map);
  }, [rates]);

  const totalHedged = hedges.filter(h => h.status === "פעיל").reduce((s, h) => s + Number(h.amount), 0);
  const totalExposure = exposures.reduce((s, e) => s + Number(e.totalExposure), 0);
  const totalUnhedged = exposures.reduce((s, e) => s + Number(e.unhedgedAmount || 0), 0);
  const avgHedgeRatio = exposures.length ? exposures.reduce((s, e) => s + Number(e.hedgeRatio || 0), 0) / exposures.length : 0;
  const activeHedges = hedges.filter(h => h.status === "פעיל").length;
  const maturingSoon = hedges.filter(h => { const d = daysTo(h.maturityDate); return d !== null && d >= 0 && d <= 30 && h.status === "פעיל"; }).length;
  const totalPnl = hedges.reduce((s, h) => s + Number(h.realizedPnl || 0) + Number(h.unrealizedPnl || 0), 0);
  const highRisk = exposures.filter(e => e.riskLevel === "גבוה" || e.riskLevel === "קריטי").length;

  const kpis = [
    { label: "מטבעות פעילים", value: latestRates.length, icon: DollarSign, color: "blue" },
    { label: "חוזי גידור פעילים", value: activeHedges, icon: Shield, color: "green" },
    { label: "סה\"כ חשיפה", value: `₪${fmt(totalExposure)}`, icon: BarChart3, color: "purple" },
    { label: "סה\"כ לא מגודר", value: `₪${fmt(totalUnhedged)}`, icon: AlertTriangle, color: "orange" },
    { label: "יחס גידור ממוצע", value: `${avgHedgeRatio.toFixed(0)}%`, icon: Shield, color: "teal" },
    { label: "פוקעים ב-30 יום", value: maturingSoon, icon: Clock, color: "yellow" },
    { label: "רווח/הפסד גידור", value: `₪${fmt(totalPnl)}`, icon: totalPnl >= 0 ? TrendingUp : TrendingDown, color: totalPnl >= 0 ? "emerald" : "red" },
    { label: "חשיפה גבוהה", value: highRisk, icon: AlertTriangle, color: "red" },
  ];

  const TABS = [
    { key: "dashboard" as const, label: "לוח בקרה", icon: BarChart3 },
    { key: "rates" as const, label: "שערי חליפין", icon: DollarSign },
    { key: "hedging" as const, label: "גידור מט\"ח", icon: Shield },
    { key: "exposure" as const, label: "דוח חשיפה", icon: AlertTriangle },
  ];

  const setCurrency = (code: string) => {
    const cur = CURRENCIES.find(c => c.code === code);
    if (cur) setFormData({ ...formData, currencyCode: code, currencyName: cur.name });
  };

  const filteredRates = useMemo(() => {
    if (!searchTerm) return rates;
    const s = searchTerm.toLowerCase();
    return rates.filter(r => r.currencyCode.toLowerCase().includes(s) || r.currencyName.toLowerCase().includes(s));
  }, [rates, searchTerm]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50" dir="rtl">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <DollarSign className="text-emerald-600" /> ניהול שערי חליפין
            </h1>
            <p className="text-muted-foreground mt-1">שערי מטבע, גידור מטח, ניתוח חשיפה ודוחות סיכון</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => {
              if (activeTab === "hedging") exportToExcel(hedges, { contractNumber: "מספר חוזה", contractType: "סוג", status: "סטטוס", currencyCode: "מטבע", amount: "סכום", hedgedRate: "שער גידור", startDate: "התחלה", maturityDate: "פקיעה", bankName: "בנק", realizedPnl: "רווח ממומש", unrealizedPnl: "רווח לא ממומש" }, "hedging_contracts");
              else if (activeTab === "exposure") exportToExcel(exposures, { exposureNumber: "מספר", currencyCode: "מטבע", exposureType: "סוג", totalExposure: "חשיפה כוללת", hedgedAmount: "מגודר", unhedgedAmount: "לא מגודר", hedgeRatio: "יחס גידור", riskLevel: "סיכון", linkedSupplier: "ספק" }, "currency_exposures");
              else exportToExcel(rates, { rateNumber: "מספר", currencyCode: "מטבע", currencyName: "שם מטבע", rate: "שער", previousRate: "שער קודם", changePercent: "שינוי %", rateDate: "תאריך", source: "מקור", buyRate: "קנייה", sellRate: "מכירה" }, "exchange_rates");
            }} className="flex items-center gap-1.5 bg-slate-600 text-foreground px-3 py-2 rounded-lg hover:bg-slate-700 text-sm">
              <Download size={16} /> ייצוא
            </button>
            <button onClick={() => printPage("ניהול שערי חליפין")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm">
              <Printer size={16} /> הדפסה
            </button>
            <button onClick={() => sendByEmail("שערי חליפין - טכנו-כל עוזי", generateEmailBody("שערי חליפין", rates, { currencyCode: "מטבע", rate: "שער", changePercent: "שינוי %", rateDate: "תאריך" }))} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm">
              <Send size={16} /> שליחה
            </button>
            <button onClick={() => openCreate("rate")} className="flex items-center gap-1 bg-emerald-600 text-foreground px-3 py-2 rounded-lg hover:bg-emerald-700 text-sm shadow-lg">
              <Plus size={16} /> שער חדש
            </button>
            <button onClick={() => openCreate("hedge")} className="flex items-center gap-1 bg-blue-600 text-foreground px-3 py-2 rounded-lg hover:bg-blue-700 text-sm shadow-lg">
              <Plus size={16} /> חוזה גידור
            </button>
            <button onClick={() => openCreate("exposure")} className="flex items-center gap-1 bg-purple-600 text-foreground px-3 py-2 rounded-lg hover:bg-purple-700 text-sm shadow-lg">
              <Plus size={16} /> חשיפה
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
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.key ? "bg-emerald-600 text-foreground shadow-md" : "text-muted-foreground hover:bg-muted/30"}`}>
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "dashboard" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
              <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><DollarSign size={18} /> שערים נוכחיים</h3>
              {latestRates.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">אין שערים</p>
              ) : (
                <div className="space-y-2">
                  {latestRates.map(r => {
                    const cur = CURRENCIES.find(c => c.code === r.currencyCode);
                    const change = Number(r.changePercent || 0);
                    return (
                      <div key={r.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{cur?.flag || "💱"}</span>
                          <div>
                            <span className="font-bold text-foreground">{r.currencyCode}</span>
                            <span className="text-xs text-muted-foreground mr-2">{r.currencyName}</span>
                          </div>
                        </div>
                        <div className="text-left">
                          <div className="font-bold text-lg text-foreground">₪{fmtRate(r.rate)}</div>
                          <div className={`text-xs flex items-center gap-0.5 ${change > 0 ? "text-green-600" : change < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                            {change > 0 ? <ArrowUp size={10} /> : change < 0 ? <ArrowDown size={10} /> : <Minus size={10} />}
                            {fmtPct(r.changePercent)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
              <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Shield size={18} /> חוזי גידור פעילים</h3>
              {hedges.filter(h => h.status === "פעיל").length === 0 ? (
                <p className="text-muted-foreground text-center py-8">אין חוזי גידור פעילים</p>
              ) : (
                <div className="space-y-2">
                  {hedges.filter(h => h.status === "פעיל").slice(0, 6).map(h => {
                    const days = daysTo(h.maturityDate);
                    return (
                      <div key={h.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div>
                          <span className="font-bold text-sm text-blue-700">{h.contractNumber}</span>
                          <span className="text-xs text-muted-foreground mr-2">{h.contractType} | {h.currencyCode}</span>
                        </div>
                        <div className="text-left">
                          <div className="font-bold text-sm">{fmt(h.amount)} {h.currencyCode}</div>
                          <div className={`text-xs ${days !== null && days <= 30 ? "text-orange-600" : "text-muted-foreground"}`}>
                            פקיעה: {days !== null ? `${days} ימים` : "-"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
              <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><AlertTriangle size={18} /> חשיפת מטבע</h3>
              {exposures.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">אין חשיפות</p>
              ) : (
                <div className="space-y-2">
                  {exposures.map(e => (
                    <div key={e.id} className="p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-purple-700">{e.currencyCode}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${RISK_COLORS[e.riskLevel]}`}>{e.riskLevel}</span>
                        </div>
                        <span className="text-sm font-bold">₪{fmt(e.totalExposure)}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${Math.min(Number(e.hedgeRatio || 0), 100)}%` }}></div>
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                        <span>מגודר: {Number(e.hedgeRatio || 0).toFixed(0)}%</span>
                        <span>לא מגודר: ₪{fmt(e.unhedgedAmount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-card rounded-xl p-5 shadow-sm border border-slate-100">
              <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Calendar size={18} className="text-orange-500" /> חוזים שפוקעים בקרוב</h3>
              {hedges.filter(h => { const d = daysTo(h.maturityDate); return d !== null && d >= 0 && d <= 60 && h.status === "פעיל"; }).length === 0 ? (
                <p className="text-muted-foreground text-center py-8">אין חוזים שפוקעים בקרוב</p>
              ) : (
                <div className="space-y-2">
                  {hedges.filter(h => { const d = daysTo(h.maturityDate); return d !== null && d >= 0 && d <= 60 && h.status === "פעיל"; })
                    .sort((a, b) => daysTo(a.maturityDate)! - daysTo(b.maturityDate)!)
                    .map(h => {
                      const days = daysTo(h.maturityDate)!;
                      return (
                        <div key={h.id} className={`flex items-center justify-between p-3 rounded-lg border ${days <= 7 ? "bg-red-50 border-red-200" : days <= 30 ? "bg-orange-50 border-orange-200" : "bg-yellow-50 border-yellow-200"}`}>
                          <div>
                            <span className="font-bold text-sm">{h.contractNumber}</span>
                            <span className="text-xs text-muted-foreground mr-2">{h.currencyCode}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${days <= 7 ? "bg-red-200 text-red-800" : days <= 30 ? "bg-orange-200 text-orange-800" : "bg-yellow-200 text-yellow-800"}`}>
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

        {activeTab === "rates" && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="חיפוש מטבע..."
                className="w-full pr-10 pl-4 py-2.5 border border-border rounded-xl bg-card focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
            </div>
            {filteredRates.length === 0 ? (
              <div className="text-center py-16 bg-card rounded-xl border border-slate-100">
                <DollarSign size={48} className="mx-auto text-slate-300 mb-3" />
                <p className="text-muted-foreground">אין שערי חליפין</p>
              </div>
            ) : (
              <div className="bg-card rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="text-right p-3 font-medium">מטבע</th>
                      <th className="text-right p-3 font-medium">שער</th>
                      <th className="text-right p-3 font-medium">שינוי</th>
                      <th className="text-right p-3 font-medium">קנייה</th>
                      <th className="text-right p-3 font-medium">מכירה</th>
                      <th className="text-right p-3 font-medium">תאריך</th>
                      <th className="text-right p-3 font-medium">מקור</th>
                      <th className="text-right p-3 font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRates.map(r => {
                      const cur = CURRENCIES.find(c => c.code === r.currencyCode);
                      const change = Number(r.changePercent || 0);
                      return (
                        <tr key={r.id} className="border-t border-slate-100 hover:bg-muted/30">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span>{cur?.flag || "💱"}</span>
                              <div>
                                <span className="font-bold text-foreground">{r.currencyCode}</span>
                                <div className="text-xs text-muted-foreground">{r.currencyName}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 font-bold text-lg">₪{fmtRate(r.rate)}</td>
                          <td className="p-3">
                            <span className={`flex items-center gap-0.5 text-sm font-medium ${change > 0 ? "text-green-600" : change < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                              {change > 0 ? <ArrowUp size={12} /> : change < 0 ? <ArrowDown size={12} /> : <Minus size={12} />}
                              {fmtPct(r.changePercent)}
                            </span>
                          </td>
                          <td className="p-3">{r.buyRate ? `₪${fmtRate(r.buyRate)}` : "-"}</td>
                          <td className="p-3">{r.sellRate ? `₪${fmtRate(r.sellRate)}` : "-"}</td>
                          <td className="p-3 text-muted-foreground">{r.rateDate}</td>
                          <td className="p-3"><span className="px-2 py-0.5 bg-muted/50 rounded text-xs">{r.source}</span></td>
                          <td className="p-3">
                            <div className="flex gap-1">
                              <button onClick={() => openEdit("rate", r)} className="p-1 text-amber-600 hover:bg-amber-50 rounded"><Edit2 size={14} /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/exchange-rates`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                              {isSuperAdmin && <button onClick={() => handleDelete("rate", r.id)} className="p-1 text-red-600 hover:bg-red-50 rounded"><Trash2 size={14} /></button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "hedging" && (
          <div className="space-y-4">
            {hedges.length === 0 ? (
              <div className="text-center py-16 bg-card rounded-xl border border-slate-100">
                <Shield size={48} className="mx-auto text-slate-300 mb-3" />
                <p className="text-muted-foreground">אין חוזי גידור</p>
              </div>
            ) : (
              <div className="space-y-3">
                {hedges.map(h => {
                  const days = daysTo(h.maturityDate);
                  return (
                    <motion.div key={h.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="bg-card rounded-xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-all">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-blue-700">{h.contractNumber}</span>
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{h.contractType}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">{h.currencyCode} | {h.bankName || "-"}</div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[h.status]}`}>{h.status}</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                        <div className="bg-muted/30 rounded-lg p-2 text-center">
                          <div className="text-xs text-muted-foreground">סכום</div>
                          <div className="font-bold text-sm">{fmt(h.amount)} {h.currencyCode}</div>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-2 text-center">
                          <div className="text-xs text-muted-foreground">שער גידור</div>
                          <div className="font-bold text-sm">₪{fmtRate(h.hedgedRate)}</div>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-2 text-center">
                          <div className="text-xs text-muted-foreground">שער ספוט</div>
                          <div className="font-bold text-sm">{h.spotRateAtContract ? `₪${fmtRate(h.spotRateAtContract)}` : "-"}</div>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-2 text-center">
                          <div className="text-xs text-muted-foreground">פקיעה</div>
                          <div className={`font-bold text-sm ${days !== null && days <= 30 ? "text-orange-600" : ""}`}>{h.maturityDate}</div>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-2 text-center">
                          <div className="text-xs text-muted-foreground">רווח/הפסד</div>
                          <div className={`font-bold text-sm ${Number(h.realizedPnl || 0) + Number(h.unrealizedPnl || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                            ₪{fmt(Number(h.realizedPnl || 0) + Number(h.unrealizedPnl || 0))}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 pt-2 border-t border-slate-100">
                        <button onClick={() => openEdit("hedge", h)} className="flex-1 flex items-center justify-center gap-1 text-amber-600 hover:bg-amber-50 rounded-lg py-1.5 text-sm"><Edit2 size={14} /> עריכה</button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/currency-hedges`, h.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                        {isSuperAdmin && <button onClick={() => handleDelete("hedge", h.id)} className="flex-1 flex items-center justify-center gap-1 text-red-600 hover:bg-red-50 rounded-lg py-1.5 text-sm"><Trash2 size={14} /> מחיקה</button>}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "exposure" && (
          <div className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-purple-50 rounded-xl p-4 border border-purple-200 text-center">
                <div className="text-xl font-bold text-purple-700">₪{fmt(totalExposure)}</div>
                <div className="text-sm text-purple-600">סה"כ חשיפה</div>
              </div>
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200 text-center">
                <div className="text-xl font-bold text-emerald-700">₪{fmt(totalHedged)}</div>
                <div className="text-sm text-emerald-600">מגודר</div>
              </div>
              <div className="bg-orange-50 rounded-xl p-4 border border-orange-200 text-center">
                <div className="text-xl font-bold text-orange-700">₪{fmt(totalUnhedged)}</div>
                <div className="text-sm text-orange-600">לא מגודר</div>
              </div>
              <div className="bg-red-50 rounded-xl p-4 border border-red-200 text-center">
                <div className="text-xl font-bold text-red-700">{highRisk}</div>
                <div className="text-sm text-red-600">סיכון גבוה/קריטי</div>
              </div>
            </div>

            {exposures.length === 0 ? (
              <div className="text-center py-16 bg-card rounded-xl border border-slate-100">
                <BarChart3 size={48} className="mx-auto text-slate-300 mb-3" />
                <p className="text-muted-foreground">אין חשיפות מטח</p>
              </div>
            ) : (
              <div className="bg-card rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="text-right p-3 font-medium">מספר</th>
                      <th className="text-right p-3 font-medium">מטבע</th>
                      <th className="text-right p-3 font-medium">סוג</th>
                      <th className="text-right p-3 font-medium">חשיפה כוללת</th>
                      <th className="text-right p-3 font-medium">מגודר</th>
                      <th className="text-right p-3 font-medium">לא מגודר</th>
                      <th className="text-right p-3 font-medium">יחס גידור</th>
                      <th className="text-right p-3 font-medium">סיכון</th>
                      <th className="text-right p-3 font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exposures.map(e => (
                      <tr key={e.id} className="border-t border-slate-100 hover:bg-muted/30">
                        <td className="p-3 font-bold text-purple-700">{e.exposureNumber}</td>
                        <td className="p-3">
                          <span className="font-medium">{e.currencyCode}</span>
                          {e.linkedSupplier && <div className="text-xs text-muted-foreground">{e.linkedSupplier}</div>}
                        </td>
                        <td className="p-3">{e.exposureType}</td>
                        <td className="p-3 font-bold">₪{fmt(e.totalExposure)}</td>
                        <td className="p-3 text-emerald-700">₪{fmt(e.hedgedAmount)}</td>
                        <td className="p-3 text-orange-700">₪{fmt(e.unhedgedAmount)}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-12 bg-muted rounded-full h-2">
                              <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${Math.min(Number(e.hedgeRatio || 0), 100)}%` }}></div>
                            </div>
                            <span className="text-xs font-medium">{Number(e.hedgeRatio || 0).toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${RISK_COLORS[e.riskLevel]}`}>{e.riskLevel}</span></td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <button onClick={() => openEdit("exposure", e)} className="p-1 text-amber-600 hover:bg-amber-50 rounded"><Edit2 size={14} /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/currency-exposures`, e.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                            {isSuperAdmin && <button onClick={() => handleDelete("exposure", e.id)} className="p-1 text-red-600 hover:bg-red-50 rounded"><Trash2 size={14} /></button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 overflow-y-auto p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto my-8">
              <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-card rounded-t-2xl z-10">
                <h2 className="text-lg font-bold text-foreground">
                  {showForm === "rate" ? (editItem ? "עריכת שער" : "שער חדש") :
                   showForm === "hedge" ? (editItem ? "עריכת חוזה גידור" : "חוזה גידור חדש") :
                   (editItem ? "עריכת חשיפה" : "חשיפה חדשה")}
                </h2>
                <button onClick={() => { setShowForm(null); setEditItem(null); }} className="p-1 hover:bg-muted/50 rounded-lg"><X size={20} /></button>
              </div>
              <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">

                {showForm === "rate" && (
                  <>
                    <fieldset className="border border-border rounded-xl p-4">
                      <legend className="text-sm font-bold text-emerald-700 px-2">פרטי שער</legend>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div><label className="text-xs text-muted-foreground">מטבע *</label>
                          <select value={formData.currencyCode || ""} onChange={e => setCurrency(e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm">
                            {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code} - {c.name}</option>)}
                          </select></div>
                        <div><label className="text-xs text-muted-foreground">שער *</label>
                          <input type="number" step="0.0001" value={formData.rate || ""} onChange={e => setFormData({ ...formData, rate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">תאריך *</label>
                          <input type="date" value={formData.rateDate || ""} onChange={e => setFormData({ ...formData, rateDate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">שער קודם</label>
                          <input type="number" step="0.0001" value={formData.previousRate || ""} onChange={e => setFormData({ ...formData, previousRate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">שינוי %</label>
                          <input type="number" step="0.01" value={formData.changePercent || ""} onChange={e => setFormData({ ...formData, changePercent: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">מקור</label>
                          <select value={formData.source || "ידני"} onChange={e => setFormData({ ...formData, source: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                            <option value="ידני">ידני</option><option value="בנק ישראל">בנק ישראל</option><option value="בנק מסחרי">בנק מסחרי</option><option value="ECB">ECB</option>
                          </select></div>
                        <div><label className="text-xs text-muted-foreground">שער קנייה</label>
                          <input type="number" step="0.0001" value={formData.buyRate || ""} onChange={e => setFormData({ ...formData, buyRate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">שער מכירה</label>
                          <input type="number" step="0.0001" value={formData.sellRate || ""} onChange={e => setFormData({ ...formData, sellRate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">סוג שער</label>
                          <select value={formData.rateType || "רשמי"} onChange={e => setFormData({ ...formData, rateType: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                            <option value="רשמי">רשמי</option><option value="ממוצע">ממוצע</option><option value="סגירה">סגירה</option><option value="פתיחה">פתיחה</option>
                          </select></div>
                      </div>
                    </fieldset>
                    <div><label className="text-xs text-muted-foreground">הערות</label>
                      <textarea value={formData.notes || ""} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </>
                )}

                {showForm === "hedge" && (
                  <>
                    <fieldset className="border border-border rounded-xl p-4">
                      <legend className="text-sm font-bold text-blue-700 px-2">פרטי חוזה</legend>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div><label className="text-xs text-muted-foreground">סוג חוזה</label>
                          <select value={formData.contractType || ""} onChange={e => setFormData({ ...formData, contractType: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                            {HEDGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select></div>
                        <div><label className="text-xs text-muted-foreground">סטטוס</label>
                          <select value={formData.status || ""} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                            {HEDGE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select></div>
                        <div><label className="text-xs text-muted-foreground">מטבע *</label>
                          <select value={formData.currencyCode || ""} onChange={e => setFormData({ ...formData, currencyCode: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                            {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                          </select></div>
                        <div><label className="text-xs text-muted-foreground">סכום *</label>
                          <input type="number" value={formData.amount || ""} onChange={e => setFormData({ ...formData, amount: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">שער גידור *</label>
                          <input type="number" step="0.0001" value={formData.hedgedRate || ""} onChange={e => setFormData({ ...formData, hedgedRate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">שער ספוט בעת חתימה</label>
                          <input type="number" step="0.0001" value={formData.spotRateAtContract || ""} onChange={e => setFormData({ ...formData, spotRateAtContract: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      </div>
                    </fieldset>
                    <fieldset className="border border-border rounded-xl p-4">
                      <legend className="text-sm font-bold text-blue-700 px-2">תאריכים ובנק</legend>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div><label className="text-xs text-muted-foreground">תאריך התחלה *</label>
                          <input type="date" value={formData.startDate || ""} onChange={e => setFormData({ ...formData, startDate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">תאריך פקיעה *</label>
                          <input type="date" value={formData.maturityDate || ""} onChange={e => setFormData({ ...formData, maturityDate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">תאריך סילוק</label>
                          <input type="date" value={formData.settlementDate || ""} onChange={e => setFormData({ ...formData, settlementDate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">בנק</label>
                          <input value={formData.bankName || ""} onChange={e => setFormData({ ...formData, bankName: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">צד נגדי</label>
                          <input value={formData.counterparty || ""} onChange={e => setFormData({ ...formData, counterparty: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">הזמנת יבוא מקושרת</label>
                          <input value={formData.linkedImportOrder || ""} onChange={e => setFormData({ ...formData, linkedImportOrder: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      </div>
                    </fieldset>
                    <fieldset className="border border-border rounded-xl p-4">
                      <legend className="text-sm font-bold text-blue-700 px-2">כספי</legend>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div><label className="text-xs text-muted-foreground">עלות פרמיה</label>
                          <input type="number" value={formData.premiumCost || ""} onChange={e => setFormData({ ...formData, premiumCost: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">רווח/הפסד ממומש</label>
                          <input type="number" value={formData.realizedPnl || ""} onChange={e => setFormData({ ...formData, realizedPnl: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">רווח/הפסד לא ממומש</label>
                          <input type="number" value={formData.unrealizedPnl || ""} onChange={e => setFormData({ ...formData, unrealizedPnl: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        {formData.contractType === "אופציה" && (
                          <>
                            <div><label className="text-xs text-muted-foreground">מחיר מימוש</label>
                              <input type="number" step="0.0001" value={formData.strikePrice || ""} onChange={e => setFormData({ ...formData, strikePrice: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                            <div><label className="text-xs text-muted-foreground">סוג אופציה</label>
                              <select value={formData.optionType || ""} onChange={e => setFormData({ ...formData, optionType: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                                <option value="">בחר</option>
                                {OPTION_TYPES.map(o => <option key={o} value={o}>{o}</option>)}
                              </select></div>
                          </>
                        )}
                      </div>
                    </fieldset>
                    <div><label className="text-xs text-muted-foreground">הערות</label>
                      <textarea value={formData.notes || ""} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </>
                )}

                {showForm === "exposure" && (
                  <>
                    <fieldset className="border border-border rounded-xl p-4">
                      <legend className="text-sm font-bold text-purple-700 px-2">פרטי חשיפה</legend>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div><label className="text-xs text-muted-foreground">מטבע *</label>
                          <select value={formData.currencyCode || ""} onChange={e => setFormData({ ...formData, currencyCode: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                            {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code} - {c.name}</option>)}
                          </select></div>
                        <div><label className="text-xs text-muted-foreground">סוג חשיפה</label>
                          <select value={formData.exposureType || ""} onChange={e => setFormData({ ...formData, exposureType: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                            {EXPOSURE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select></div>
                        <div><label className="text-xs text-muted-foreground">רמת סיכון</label>
                          <select value={formData.riskLevel || ""} onChange={e => setFormData({ ...formData, riskLevel: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm">
                            {RISK_LEVELS.map(r => <option key={r} value={r}>{r}</option>)}
                          </select></div>
                        <div><label className="text-xs text-muted-foreground">חשיפה כוללת (₪) *</label>
                          <input type="number" value={formData.totalExposure || ""} onChange={e => setFormData({ ...formData, totalExposure: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">סכום מגודר (₪)</label>
                          <input type="number" value={formData.hedgedAmount || ""} onChange={e => setFormData({ ...formData, hedgedAmount: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">סכום לא מגודר (₪)</label>
                          <input type="number" value={formData.unhedgedAmount || ""} onChange={e => setFormData({ ...formData, unhedgedAmount: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">יחס גידור %</label>
                          <input type="number" value={formData.hedgeRatio || ""} onChange={e => setFormData({ ...formData, hedgeRatio: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">שער נוכחי</label>
                          <input type="number" step="0.0001" value={formData.currentRate || ""} onChange={e => setFormData({ ...formData, currentRate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">שער תקציבי</label>
                          <input type="number" step="0.0001" value={formData.budgetRate || ""} onChange={e => setFormData({ ...formData, budgetRate: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      </div>
                    </fieldset>
                    <fieldset className="border border-border rounded-xl p-4">
                      <legend className="text-sm font-bold text-purple-700 px-2">קישורים ופרטים</legend>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div><label className="text-xs text-muted-foreground">ספק מקושר</label>
                          <input value={formData.linkedSupplier || ""} onChange={e => setFormData({ ...formData, linkedSupplier: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">הזמנות מקושרות</label>
                          <input value={formData.linkedOrders || ""} onChange={e => setFormData({ ...formData, linkedOrders: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                        <div><label className="text-xs text-muted-foreground">חודש פדיון</label>
                          <input value={formData.maturityMonth || ""} onChange={e => setFormData({ ...formData, maturityMonth: e.target.value })} className="w-full border border-border rounded-lg p-2 text-sm" placeholder="2026-04" /></div>
                      </div>
                    </fieldset>
                    <div><label className="text-xs text-muted-foreground">הערות</label>
                      <textarea value={formData.notes || ""} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </>
                )}
              </div>
              <div className="flex gap-3 p-4 border-t border-slate-100 sticky bottom-0 bg-card rounded-b-2xl">
                <button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-foreground py-2.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                  <Save size={16} /> {editItem ? "עדכון" : "שמירה"}
                </button>
                <button onClick={() => { setShowForm(null); setEditItem(null); }} className="px-6 py-2.5 border border-border rounded-lg hover:bg-muted/30">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card rounded-2xl shadow-sm border p-5">
          <h3 className="text-lg font-bold text-foreground mb-4">רשומות קשורות</h3>
          <RelatedRecords entityType="exchange-rates" entityId={0} />
        </div>
        <div className="bg-card rounded-2xl shadow-sm border p-5">
          <h3 className="text-lg font-bold text-foreground mb-4">היסטוריית פעילות</h3>
          <ActivityLog entityType="exchange-rates" entityId={0} />
        </div>
      </div>
    </div>
  );
}
