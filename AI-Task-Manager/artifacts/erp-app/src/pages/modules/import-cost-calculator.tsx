import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calculator, DollarSign, Package, Ship, Shield, Landmark, Truck,
  Search, Plus, Edit2, Trash2, X, Save, Eye, FileText, Hash,
  TrendingUp, Percent, Globe, CreditCard, Warehouse, Scale, Copy
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Printer, Send } from "lucide-react";
import ExportDropdown from "@/components/export-dropdown";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const n = (v: any) => Number(v || 0);
const fmt = (v: any) => n(v).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCur = (v: any, c = "₪") => `${c}${fmt(v)}`;

const STATUSES = ["טיוטה", "פעיל", "מאושר", "בוצע", "ארכיון"];
const CURRENCIES = ["USD", "EUR", "GBP", "CNY", "JPY", "TRY", "ILS"];
const SHIPPING_METHODS = ["ים", "אוויר", "יבשה", "משולב"];
const CONTAINER_TYPES = ["20ft", "40ft", "40ft HC", "LCL", "Bulk", "Flat Rack", "Open Top"];
const UNIT_TYPES = ["יחידה", 'ק"ג', "טון", "מ' אורך", "מ\"ר", "מ\"ק", "חבילה", "פלטה", "גליל"];
const STATUS_COLORS: Record<string, string> = {
  "טיוטה": "bg-muted/50 text-foreground",
  "פעיל": "bg-blue-100 text-blue-800",
  "מאושר": "bg-green-100 text-green-800",
  "בוצע": "bg-emerald-100 text-emerald-800",
  "ארכיון": "bg-muted/50 text-foreground",
};

interface CalcItem {
  id: number; calcNumber: string; calcName: string; status: string;
  linkedImportOrderId: number | null; linkedSupplier: string | null; supplierCountry: string | null;
  productName: string; productDescription: string | null; hsCode: string | null;
  quantity: string; unitType: string; unitWeightKg: string; totalWeightKg: string;
  currency: string; exchangeRate: string;
  productCostPerUnit: string; totalProductCost: string;
  shippingMethod: string; shippingCost: string; containerType: string | null; containerCount: number;
  insuranceRate: string; insuranceCost: string;
  customsDutyRate: string; customsDutyAmount: string;
  purchaseTaxRate: string; purchaseTaxAmount: string;
  vatRate: string; vatAmount: string;
  portFees: string; storageFees: string; inspectionFees: string;
  inlandTransport: string; handlingFees: string; unloadingFees: string;
  customsBrokerFee: string; forwardingAgentFee: string;
  agentCommissionRate: string; agentCommissionAmount: string;
  bankCharges: string; lcCharges: string; documentationFees: string;
  otherCosts: string; otherCostsDescription: string | null;
  totalFreightCosts: string; totalTaxesDuties: string; totalPortFees: string;
  totalAgentFees: string; totalFinancialCosts: string; totalOtherCosts: string;
  totalLandedCost: string; landedCostPerUnit: string; landedCostPerKg: string;
  costMarkupPercentage: string; notes: string | null; createdBy: string | null; createdAt: string;
}

const emptyForm: any = {
  calcNumber: "", calcName: "", status: "טיוטה",
  linkedSupplier: "", supplierCountry: "",
  productName: "", productDescription: "", hsCode: "",
  quantity: "1", unitType: "יחידה", unitWeightKg: "0", totalWeightKg: "0",
  currency: "USD", exchangeRate: "3.60",
  productCostPerUnit: "0", totalProductCost: "0",
  shippingMethod: "ים", shippingCost: "0", containerType: "40ft", containerCount: 1,
  insuranceRate: "0.5", insuranceCost: "0",
  customsDutyRate: "0", customsDutyAmount: "0",
  purchaseTaxRate: "0", purchaseTaxAmount: "0",
  vatRate: "17", vatAmount: "0",
  portFees: "0", storageFees: "0", inspectionFees: "0",
  inlandTransport: "0", handlingFees: "0", unloadingFees: "0",
  customsBrokerFee: "0", forwardingAgentFee: "0",
  agentCommissionRate: "0", agentCommissionAmount: "0",
  bankCharges: "0", lcCharges: "0", documentationFees: "0",
  otherCosts: "0", otherCostsDescription: "",
  costMarkupPercentage: "0", notes: "", createdBy: "",
};

function recalc(f: any) {
  const qty = n(f.quantity);
  const rate = n(f.exchangeRate);
  const costPerUnit = n(f.productCostPerUnit);
  const totalProduct = costPerUnit * qty;
  const totalProductILS = totalProduct * rate;
  const shipping = n(f.shippingCost);
  const insRate = n(f.insuranceRate);
  const insurance = (totalProduct + shipping) * (insRate / 100);

  const cifValue = totalProduct + shipping + insurance;
  const cifILS = cifValue * rate;

  const dutyRate = n(f.customsDutyRate);
  const dutyAmount = cifILS * (dutyRate / 100);

  const purchaseTaxRate = n(f.purchaseTaxRate);
  const purchaseTaxAmount = (cifILS + dutyAmount) * (purchaseTaxRate / 100);

  const vatRate = n(f.vatRate);
  const vatBase = cifILS + dutyAmount + purchaseTaxAmount;
  const vatAmount = vatBase * (vatRate / 100);

  const portFees = n(f.portFees);
  const storageFees = n(f.storageFees);
  const inspectionFees = n(f.inspectionFees);
  const inlandTransport = n(f.inlandTransport);
  const handlingFees = n(f.handlingFees);
  const unloadingFees = n(f.unloadingFees);

  const customsBrokerFee = n(f.customsBrokerFee);
  const forwardingAgentFee = n(f.forwardingAgentFee);
  const agentCommRate = n(f.agentCommissionRate);
  const agentCommAmount = totalProductILS * (agentCommRate / 100);

  const bankCharges = n(f.bankCharges);
  const lcCharges = n(f.lcCharges);
  const documentationFees = n(f.documentationFees);
  const otherCosts = n(f.otherCosts);

  const totalFreight = (shipping + insurance) * rate;
  const totalTaxes = dutyAmount + purchaseTaxAmount + vatAmount;
  const totalPort = portFees + storageFees + inspectionFees + inlandTransport + handlingFees + unloadingFees;
  const totalAgent = customsBrokerFee + forwardingAgentFee + agentCommAmount;
  const totalFinancial = bankCharges + lcCharges + documentationFees;
  const totalOther = otherCosts;

  const totalLanded = totalProductILS + totalFreight + totalTaxes + totalPort + totalAgent + totalFinancial + totalOther;
  const landedPerUnit = qty > 0 ? totalLanded / qty : 0;
  const totalWeight = n(f.totalWeightKg) || (n(f.unitWeightKg) * qty);
  const landedPerKg = totalWeight > 0 ? totalLanded / totalWeight : 0;

  return {
    ...f,
    totalProductCost: totalProduct.toFixed(2),
    totalWeightKg: totalWeight.toFixed(3),
    insuranceCost: insurance.toFixed(2),
    customsDutyAmount: dutyAmount.toFixed(2),
    purchaseTaxAmount: purchaseTaxAmount.toFixed(2),
    vatAmount: vatAmount.toFixed(2),
    agentCommissionAmount: agentCommAmount.toFixed(2),
    totalFreightCosts: totalFreight.toFixed(2),
    totalTaxesDuties: totalTaxes.toFixed(2),
    totalPortFees: totalPort.toFixed(2),
    totalAgentFees: totalAgent.toFixed(2),
    totalFinancialCosts: totalFinancial.toFixed(2),
    totalOtherCosts: totalOther.toFixed(2),
    totalLandedCost: totalLanded.toFixed(2),
    landedCostPerUnit: landedPerUnit.toFixed(2),
    landedCostPerKg: landedPerKg.toFixed(2),
  };
}

export default function ImportCostCalculatorPage() {
  const [activeTab, setActiveTab] = useState<"calculator" | "saved" | "comparison">("calculator");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<CalcItem | null>(null);
  const [detailItem, setDetailItem] = useState<CalcItem | null>(null);
  const [formData, setFormData] = useState<any>({ ...emptyForm });
  const [searchTerm, setSearchTerm] = useState("");
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const qc = useQueryClient();

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["import-cost-calculations"],
    queryFn: () => authFetch(`${API}/import-cost-calculations`).then(r => r.json()),
  });
  const items: CalcItem[] = useMemo(() => safeArray(rawData), [rawData]);

  const createMut = useMutation({
    mutationFn: (d: any) => authFetch(`${API}/import-cost-calculations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["import-cost-calculations"] }); setShowForm(false); },
  });
  const updateMut = useMutation({
    mutationFn: (d: any) => authFetch(`${API}/import-cost-calculations/${d.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["import-cost-calculations"] }); setShowForm(false); setEditItem(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/import-cost-calculations/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["import-cost-calculations"] }),
  });

  const updateField = useCallback((field: string, value: string) => {
    setFormData((prev: any) => recalc({ ...prev, [field]: value }));
  }, []);

  const openCreate = () => { setFormData(recalc({ ...emptyForm })); setEditItem(null); setShowForm(true); };
  const openEdit = (item: CalcItem) => { setFormData(recalc({ ...item })); setEditItem(item); setShowForm(true); };
  const handleDuplicate = (item: CalcItem) => {
    setFormData(recalc({ ...item, calcNumber: "", calcName: `${item.calcName} (העתק)`, status: "טיוטה" }));
    setEditItem(null);
    setShowForm(true);
  };
  const handleSave = () => {
    const d = recalc(formData);
    if (editItem) { d.id = editItem.id; updateMut.mutate(d); }
    else createMut.mutate(d);
  };

  useEffect(() => { if (showForm) setFormData((prev: any) => recalc(prev)); }, [showForm]);

  const filtered = useMemo(() => {
    if (!searchTerm) return items;
    const s = searchTerm.toLowerCase();
    return items.filter(i =>
      i.calcName?.toLowerCase().includes(s) ||
      i.calcNumber?.toLowerCase().includes(s) ||
      i.productName?.toLowerCase().includes(s) ||
      i.linkedSupplier?.toLowerCase().includes(s)
    );
  }, [items, searchTerm]);

  const totalCalcs = items.length;
  const totalLandedAll = items.reduce((s, i) => s + n(i.totalLandedCost), 0);
  const avgMarkup = items.length > 0 ? items.reduce((s, i) => s + n(i.costMarkupPercentage), 0) / items.length : 0;
  const avgDutyRate = items.length > 0 ? items.reduce((s, i) => s + n(i.customsDutyRate), 0) / items.length : 0;

  const costBreakdown = formData && showForm ? [
    { label: "עלות מוצר", value: n(formData.totalProductCost) * n(formData.exchangeRate), color: "bg-blue-500", icon: Package },
    { label: "הובלה וביטוח", value: n(formData.totalFreightCosts), color: "bg-cyan-500", icon: Ship },
    { label: "מיסים ומכס", value: n(formData.totalTaxesDuties), color: "bg-red-500", icon: Landmark },
    { label: "דמי נמל ושינוע", value: n(formData.totalPortFees), color: "bg-orange-500", icon: Warehouse },
    { label: "עמלות סוכנים", value: n(formData.totalAgentFees), color: "bg-purple-500", icon: Globe },
    { label: "עלויות פיננסיות", value: n(formData.totalFinancialCosts), color: "bg-teal-500", icon: CreditCard },
    { label: "אחר", value: n(formData.totalOtherCosts), color: "bg-muted", icon: FileText },
  ] : [];

  const totalForPie = costBreakdown.reduce((s, c) => s + c.value, 0);

  const compareItems = useMemo(() => items.filter(i => compareIds.includes(i.id)), [items, compareIds]);

  const TABS = [
    { key: "calculator" as const, label: "מחשבון", icon: Calculator },
    { key: "saved" as const, label: "חישובים שמורים", icon: FileText },
    { key: "comparison" as const, label: "השוואת חישובים", icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50" dir="rtl">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <Calculator className="text-emerald-600" /> מחשבון עלויות יבוא
            </h1>
            <p className="text-muted-foreground mt-1">חישוב עלות נחיתה מלאה: מוצר, הובלה, ביטוח, מכס, נמל, שינוע, עמלות</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <ExportDropdown data={calculations} headers={{ calcNumber: "מספר חישוב", productName: "מוצר", currency: "מטבע", quantity: "כמות", totalProductCost: "עלות מוצר", shippingCost: "הובלה", customsDutyAmount: "מכס", vatAmount: "מע\"מ", totalLandedCost: "עלות נחיתה", costPerUnit: "עלות ליחידה" }} filename={"import_cost_calculations"} />
            <button onClick={() => printPage("מחשבון עלויות יבוא")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm">
              <Printer size={16} /> הדפסה
            </button>
            <button onClick={() => sendByEmail("מחשבון עלויות יבוא - טכנו-כל עוזי", generateEmailBody("מחשבון עלויות יבוא", calculations, { calcNumber: "מספר", productName: "מוצר", totalLandedCost: "עלות נחיתה", costPerUnit: "עלות ליחידה" }))} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm">
              <Send size={16} /> שליחה
            </button>
            <button onClick={openCreate} className="flex items-center gap-2 bg-emerald-600 text-foreground px-3 py-2 rounded-lg hover:bg-emerald-700 shadow-lg text-sm">
              <Plus size={16} /> חישוב חדש
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "חישובים שמורים", value: totalCalcs, icon: FileText, color: "blue" },
            { label: "סה\"כ עלות נחיתה", value: fmtCur(totalLandedAll), icon: DollarSign, color: "emerald" },
            { label: "מכס ממוצע", value: `${avgDutyRate.toFixed(1)}%`, icon: Percent, color: "red" },
            { label: "תוספת ממוצעת", value: `${avgMarkup.toFixed(1)}%`, icon: TrendingUp, color: "purple" },
          ].map((kpi, i) => (
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

        {isLoading && activeTab !== "calculator" ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mx-auto mb-3"></div>
          </div>
        ) : (
          <>
            {activeTab === "calculator" && !showForm && (
              <div className="text-center py-16 bg-card rounded-xl border border-slate-100">
                <Calculator size={64} className="mx-auto text-emerald-300 mb-4" />
                <h3 className="text-xl font-bold text-foreground mb-2">מחשבון עלויות יבוא</h3>
                <p className="text-muted-foreground mb-6">חשב את עלות הנחיתה המלאה של מוצרי יבוא כולל מכס, מיסים, הובלה ועמלות</p>
                <button onClick={openCreate} className="inline-flex items-center gap-2 bg-emerald-600 text-foreground px-6 py-3 rounded-lg hover:bg-emerald-700 text-lg">
                  <Calculator size={20} /> התחל חישוב חדש
                </button>
              </div>
            )}

            {activeTab === "saved" && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                  <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    placeholder="חיפוש לפי שם, מספר, מוצר, ספק..."
                    className="w-full pr-10 pl-4 py-2.5 border border-border rounded-xl bg-card focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                </div>
                {filtered.length === 0 ? (
                  <div className="text-center py-16 bg-card rounded-xl border border-slate-100">
                    <Calculator size={48} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-muted-foreground">אין חישובים שמורים</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filtered.map(item => (
                      <motion.div key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="bg-card rounded-xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-all">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="font-bold text-emerald-700">{item.calcName}</div>
                            <div className="text-xs text-muted-foreground">{item.calcNumber}</div>
                            <div className="text-sm text-muted-foreground mt-0.5">{item.productName}</div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[item.status] || ""}`}>{item.status}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm mb-3">
                          <div className="bg-blue-50 rounded-lg p-2 text-center">
                            <div className="text-xs text-blue-600">עלות מוצר</div>
                            <div className="font-bold text-blue-800">{item.currency} {fmt(item.totalProductCost)}</div>
                          </div>
                          <div className="bg-red-50 rounded-lg p-2 text-center">
                            <div className="text-xs text-red-600">מכס {n(item.customsDutyRate)}%</div>
                            <div className="font-bold text-red-800">{fmtCur(item.customsDutyAmount)}</div>
                          </div>
                          <div className="bg-emerald-50 rounded-lg p-2 text-center">
                            <div className="text-xs text-emerald-600">עלות נחיתה</div>
                            <div className="font-bold text-emerald-800">{fmtCur(item.totalLandedCost)}</div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm mb-3">
                          <span className="text-muted-foreground">{n(item.quantity)} {item.unitType} | {item.shippingMethod}</span>
                          <span className="font-bold text-emerald-700">ליחידה: {fmtCur(item.landedCostPerUnit)}</span>
                        </div>
                        <div className="flex gap-1 pt-2 border-t border-slate-100">
                          <button onClick={() => setDetailItem(item)} className="flex-1 flex items-center justify-center gap-1 text-blue-600 hover:bg-blue-50 rounded-lg py-1.5 text-sm"><Eye size={14} /> צפייה</button>
                          <button onClick={() => openEdit(item)} className="flex-1 flex items-center justify-center gap-1 text-amber-600 hover:bg-amber-50 rounded-lg py-1.5 text-sm"><Edit2 size={14} /> עריכה</button>
                          <button onClick={() => handleDuplicate(item)} className="flex-1 flex items-center justify-center gap-1 text-purple-600 hover:bg-purple-50 rounded-lg py-1.5 text-sm"><Copy size={14} /> שכפול</button>
                          {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק חישוב זה?", { itemName: item.reference_number || item.name || String(item.id), entityType: "חישוב עלות יבוא" }); if (ok) deleteMut.mutate(item.id); }} className="flex-1 flex items-center justify-center gap-1 text-red-600 hover:bg-red-50 rounded-lg py-1.5 text-sm"><Trash2 size={14} /> מחיקה</button>}
                        </div>
                        <label className="flex items-center gap-2 mt-2 text-xs text-muted-foreground cursor-pointer">
                          <input type="checkbox" checked={compareIds.includes(item.id)}
                            onChange={e => setCompareIds(prev => e.target.checked ? [...prev, item.id] : prev.filter(id => id !== item.id))} className="w-3.5 h-3.5" />
                          הוסף להשוואה
                        </label>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "comparison" && (
              <div className="space-y-4">
                {compareItems.length < 2 ? (
                  <div className="text-center py-16 bg-card rounded-xl border border-slate-100">
                    <TrendingUp size={48} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-muted-foreground mb-2">בחר לפחות 2 חישובים להשוואה</p>
                    <p className="text-xs text-muted-foreground">סמן חישובים בלשונית "חישובים שמורים"</p>
                  </div>
                ) : (
                  <div className="bg-card rounded-xl shadow-sm border border-slate-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30">
                        <tr>
                          <th className="text-right p-3 font-bold text-foreground sticky right-0 bg-muted/30 min-w-[180px]">פריט</th>
                          {compareItems.map(item => (
                            <th key={item.id} className="text-center p-3 font-bold text-emerald-700 min-w-[150px]">{item.calcName}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: "מוצר", field: "productName" },
                          { label: "כמות", field: "quantity" },
                          { label: "מטבע", field: "currency" },
                          { label: "שער חליפין", field: "exchangeRate" },
                          { label: "עלות ליחידה", field: "productCostPerUnit", isMoney: true },
                          { label: "עלות מוצר כוללת", field: "totalProductCost", isMoney: true },
                          { label: "הובלה", field: "shippingCost", isMoney: true },
                          { label: "ביטוח", field: "insuranceCost", isMoney: true },
                          { label: "מכס %", field: "customsDutyRate", isPct: true },
                          { label: "מכס ₪", field: "customsDutyAmount", isILS: true },
                          { label: "מס רכישה ₪", field: "purchaseTaxAmount", isILS: true },
                          { label: 'מע"מ ₪', field: "vatAmount", isILS: true },
                          { label: "דמי נמל", field: "portFees", isILS: true },
                          { label: "שינוע פנים", field: "inlandTransport", isILS: true },
                          { label: "עמלת מכס", field: "customsBrokerFee", isILS: true },
                          { label: "עלויות בנקאיות", field: "bankCharges", isILS: true },
                          { label: "סה\"כ נחיתה ₪", field: "totalLandedCost", isILS: true, bold: true },
                          { label: "עלות ליחידה ₪", field: "landedCostPerUnit", isILS: true, bold: true },
                          { label: "עלות לק\"ג ₪", field: "landedCostPerKg", isILS: true },
                        ].map((row, ri) => (
                          <tr key={ri} className={`border-t border-slate-100 ${row.bold ? "bg-emerald-50 font-bold" : "hover:bg-muted/30"}`}>
                            <td className="p-2 text-right font-medium text-foreground sticky right-0 bg-inherit">{row.label}</td>
                            {compareItems.map(item => {
                              const val = (item as any)[row.field];
                              return (
                                <td key={item.id} className="p-2 text-center">
                                  {row.isMoney ? `${item.currency} ${fmt(val)}` :
                                    row.isILS ? fmtCur(val) :
                                    row.isPct ? `${n(val).toFixed(1)}%` : val}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Calculator Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 overflow-y-auto p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-5xl my-8">
              <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-card rounded-t-2xl z-10">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Calculator size={20} className="text-emerald-600" />
                  {editItem ? "עריכת חישוב" : "חישוב עלות יבוא חדש"}
                </h2>
                <button onClick={() => { setShowForm(false); setEditItem(null); }} className="p-1 hover:bg-muted/50 rounded-lg"><X size={20} /></button>
              </div>
              <div className="flex flex-col lg:flex-row">
                <div className="flex-1 p-5 space-y-5 max-h-[75vh] overflow-y-auto border-l border-slate-100">
                  <fieldset className="border border-border rounded-xl p-4">
                    <legend className="text-sm font-bold text-emerald-700 px-2">פרטי חישוב</legend>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div><label className="text-xs text-muted-foreground">מספר (אוטומטי)</label>
                        <input value={formData.calcNumber || ""} onChange={e => updateField("calcNumber", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" placeholder="ICC-YYYY-NNNN" /></div>
                      <div><label className="text-xs text-muted-foreground">שם חישוב *</label>
                        <input value={formData.calcName || ""} onChange={e => updateField("calcName", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      <div><label className="text-xs text-muted-foreground">סטטוס</label>
                        <select value={formData.status} onChange={e => updateField("status", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm">
                          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select></div>
                      <div><label className="text-xs text-muted-foreground">ספק</label>
                        <input value={formData.linkedSupplier || ""} onChange={e => updateField("linkedSupplier", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      <div><label className="text-xs text-muted-foreground">ארץ ספק</label>
                        <input value={formData.supplierCountry || ""} onChange={e => updateField("supplierCountry", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    </div>
                  </fieldset>

                  <fieldset className="border border-blue-200 rounded-xl p-4 bg-blue-50/30">
                    <legend className="text-sm font-bold text-blue-700 px-2 flex items-center gap-1"><Package size={14} /> עלות מוצר</legend>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div><label className="text-xs text-muted-foreground">שם מוצר *</label>
                        <input value={formData.productName || ""} onChange={e => updateField("productName", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      <div><label className="text-xs text-muted-foreground">קוד HS</label>
                        <input value={formData.hsCode || ""} onChange={e => updateField("hsCode", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      <div><label className="text-xs text-muted-foreground">מטבע</label>
                        <select value={formData.currency} onChange={e => updateField("currency", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm">
                          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select></div>
                      <div><label className="text-xs text-muted-foreground">שער חליפין ל-₪</label>
                        <input type="number" step="0.0001" value={formData.exchangeRate || ""} onChange={e => updateField("exchangeRate", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      <div><label className="text-xs text-muted-foreground">כמות</label>
                        <input type="number" step="0.001" value={formData.quantity || ""} onChange={e => updateField("quantity", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      <div><label className="text-xs text-muted-foreground">יחידת מידה</label>
                        <select value={formData.unitType} onChange={e => updateField("unitType", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm">
                          {UNIT_TYPES.map(u => <option key={u} value={u}>{u}</option>)}
                        </select></div>
                      <div><label className="text-xs text-muted-foreground font-bold">עלות ליחידה ({formData.currency})</label>
                        <input type="number" step="0.01" value={formData.productCostPerUnit || ""} onChange={e => updateField("productCostPerUnit", e.target.value)} className="w-full border border-blue-300 rounded-lg p-2 text-sm bg-blue-50 font-bold" /></div>
                      <div><label className="text-xs text-muted-foreground">משקל ליחידה (ק"ג)</label>
                        <input type="number" step="0.001" value={formData.unitWeightKg || ""} onChange={e => updateField("unitWeightKg", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      <div><label className="text-xs text-muted-foreground">עלות כוללת: {formData.currency} {fmt(formData.totalProductCost)}</label>
                        <div className="w-full border border-border rounded-lg p-2 text-sm bg-muted/30 font-bold text-blue-700">{fmtCur(n(formData.totalProductCost) * n(formData.exchangeRate))}</div></div>
                    </div>
                  </fieldset>

                  <fieldset className="border border-cyan-200 rounded-xl p-4 bg-cyan-50/30">
                    <legend className="text-sm font-bold text-cyan-700 px-2 flex items-center gap-1"><Ship size={14} /> הובלה וביטוח</legend>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div><label className="text-xs text-muted-foreground">שיטת הובלה</label>
                        <select value={formData.shippingMethod} onChange={e => updateField("shippingMethod", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm">
                          {SHIPPING_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select></div>
                      <div><label className="text-xs text-muted-foreground">סוג מכולה</label>
                        <select value={formData.containerType || ""} onChange={e => updateField("containerType", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm">
                          <option value="">---</option>
                          {CONTAINER_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select></div>
                      <div><label className="text-xs text-muted-foreground">מספר מכולות</label>
                        <input type="number" value={formData.containerCount || ""} onChange={e => updateField("containerCount", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      <div><label className="text-xs text-muted-foreground font-bold">עלות הובלה ({formData.currency})</label>
                        <input type="number" step="0.01" value={formData.shippingCost || ""} onChange={e => updateField("shippingCost", e.target.value)} className="w-full border border-cyan-300 rounded-lg p-2 text-sm bg-cyan-50 font-bold" /></div>
                      <div><label className="text-xs text-muted-foreground">אחוז ביטוח (%)</label>
                        <input type="number" step="0.001" value={formData.insuranceRate || ""} onChange={e => updateField("insuranceRate", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      <div><label className="text-xs text-muted-foreground">עלות ביטוח ({formData.currency})</label>
                        <div className="w-full border border-border rounded-lg p-2 text-sm bg-muted/30 font-bold text-cyan-700">{fmt(formData.insuranceCost)}</div></div>
                    </div>
                  </fieldset>

                  <fieldset className="border border-red-200 rounded-xl p-4 bg-red-50/30">
                    <legend className="text-sm font-bold text-red-700 px-2 flex items-center gap-1"><Landmark size={14} /> מכס ומיסים</legend>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div><label className="text-xs text-muted-foreground font-bold">אחוז מכס (%)</label>
                        <input type="number" step="0.01" value={formData.customsDutyRate || ""} onChange={e => updateField("customsDutyRate", e.target.value)} className="w-full border border-red-300 rounded-lg p-2 text-sm bg-red-50 font-bold" /></div>
                      <div><label className="text-xs text-muted-foreground">מכס ₪</label>
                        <div className="w-full border border-border rounded-lg p-2 text-sm bg-muted/30 font-bold text-red-700">{fmtCur(formData.customsDutyAmount)}</div></div>
                      <div><label className="text-xs text-muted-foreground">מס רכישה (%)</label>
                        <input type="number" step="0.01" value={formData.purchaseTaxRate || ""} onChange={e => updateField("purchaseTaxRate", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      <div><label className="text-xs text-muted-foreground">מס רכישה ₪</label>
                        <div className="w-full border border-border rounded-lg p-2 text-sm bg-muted/30 font-bold text-orange-700">{fmtCur(formData.purchaseTaxAmount)}</div></div>
                      <div><label className="text-xs text-muted-foreground">מע"מ (%)</label>
                        <input type="number" step="0.01" value={formData.vatRate || ""} onChange={e => updateField("vatRate", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      <div><label className="text-xs text-muted-foreground">מע"מ ₪</label>
                        <div className="w-full border border-border rounded-lg p-2 text-sm bg-muted/30 font-bold text-orange-700">{fmtCur(formData.vatAmount)}</div></div>
                    </div>
                  </fieldset>

                  <fieldset className="border border-orange-200 rounded-xl p-4 bg-orange-50/30">
                    <legend className="text-sm font-bold text-orange-700 px-2 flex items-center gap-1"><Warehouse size={14} /> דמי נמל ושינוע</legend>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div><label className="text-xs text-muted-foreground">דמי נמל (₪)</label>
                        <input type="number" step="0.01" value={formData.portFees || ""} onChange={e => updateField("portFees", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      <div><label className="text-xs text-muted-foreground">אחסנה (₪)</label>
                        <input type="number" step="0.01" value={formData.storageFees || ""} onChange={e => updateField("storageFees", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      <div><label className="text-xs text-muted-foreground">בדיקות (₪)</label>
                        <input type="number" step="0.01" value={formData.inspectionFees || ""} onChange={e => updateField("inspectionFees", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      <div><label className="text-xs text-muted-foreground">שינוע פנים (₪)</label>
                        <input type="number" step="0.01" value={formData.inlandTransport || ""} onChange={e => updateField("inlandTransport", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      <div><label className="text-xs text-muted-foreground">טיפול (₪)</label>
                        <input type="number" step="0.01" value={formData.handlingFees || ""} onChange={e => updateField("handlingFees", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      <div><label className="text-xs text-muted-foreground">פריקה (₪)</label>
                        <input type="number" step="0.01" value={formData.unloadingFees || ""} onChange={e => updateField("unloadingFees", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    </div>
                  </fieldset>

                  <fieldset className="border border-purple-200 rounded-xl p-4 bg-purple-50/30">
                    <legend className="text-sm font-bold text-purple-700 px-2 flex items-center gap-1"><Globe size={14} /> עמלות סוכנים</legend>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div><label className="text-xs text-muted-foreground">עמלת עמיל מכס (₪)</label>
                        <input type="number" step="0.01" value={formData.customsBrokerFee || ""} onChange={e => updateField("customsBrokerFee", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      <div><label className="text-xs text-muted-foreground">עמלת משלח (₪)</label>
                        <input type="number" step="0.01" value={formData.forwardingAgentFee || ""} onChange={e => updateField("forwardingAgentFee", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      <div><label className="text-xs text-muted-foreground">עמלת סוכן (%)</label>
                        <input type="number" step="0.01" value={formData.agentCommissionRate || ""} onChange={e => updateField("agentCommissionRate", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    </div>
                  </fieldset>

                  <fieldset className="border border-teal-200 rounded-xl p-4 bg-teal-50/30">
                    <legend className="text-sm font-bold text-teal-700 px-2 flex items-center gap-1"><CreditCard size={14} /> עלויות פיננסיות</legend>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div><label className="text-xs text-muted-foreground">עמלות בנקאיות (₪)</label>
                        <input type="number" step="0.01" value={formData.bankCharges || ""} onChange={e => updateField("bankCharges", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      <div><label className="text-xs text-muted-foreground">עמלות L/C (₪)</label>
                        <input type="number" step="0.01" value={formData.lcCharges || ""} onChange={e => updateField("lcCharges", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      <div><label className="text-xs text-muted-foreground">דמי תיעוד (₪)</label>
                        <input type="number" step="0.01" value={formData.documentationFees || ""} onChange={e => updateField("documentationFees", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    </div>
                  </fieldset>

                  <fieldset className="border border-border rounded-xl p-4">
                    <legend className="text-sm font-bold text-foreground px-2">עלויות נוספות והערות</legend>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><label className="text-xs text-muted-foreground">עלויות אחרות (₪)</label>
                        <input type="number" step="0.01" value={formData.otherCosts || ""} onChange={e => updateField("otherCosts", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                      <div><label className="text-xs text-muted-foreground">פירוט</label>
                        <input value={formData.otherCostsDescription || ""} onChange={e => updateField("otherCostsDescription", e.target.value)} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                    </div>
                    <div className="mt-3"><label className="text-xs text-muted-foreground">הערות</label>
                      <textarea value={formData.notes || ""} onChange={e => updateField("notes", e.target.value)} rows={2} className="w-full border border-border rounded-lg p-2 text-sm" /></div>
                  </fieldset>
                </div>

                {/* Results Panel */}
                <div className="w-full lg:w-80 p-5 bg-muted/30 space-y-4 max-h-[75vh] overflow-y-auto">
                  <div className="bg-emerald-600 rounded-xl p-4 text-foreground text-center">
                    <div className="text-xs opacity-80">עלות נחיתה כוללת</div>
                    <div className="text-xl sm:text-3xl font-bold">{fmtCur(formData.totalLandedCost)}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-card rounded-lg p-3 text-center border border-emerald-200">
                      <div className="text-xs text-emerald-600">ליחידה</div>
                      <div className="text-lg font-bold text-emerald-800">{fmtCur(formData.landedCostPerUnit)}</div>
                    </div>
                    <div className="bg-card rounded-lg p-3 text-center border border-emerald-200">
                      <div className="text-xs text-emerald-600">לק"ג</div>
                      <div className="text-lg font-bold text-emerald-800">{fmtCur(formData.landedCostPerKg)}</div>
                    </div>
                  </div>

                  <div className="bg-card rounded-xl p-3 border border-border">
                    <h4 className="font-bold text-sm text-foreground mb-2">פירוט עלויות</h4>
                    <div className="space-y-2">
                      {costBreakdown.filter(c => c.value > 0).map((cat, i) => {
                        const pct = totalForPie > 0 ? (cat.value / totalForPie) * 100 : 0;
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${cat.color}`}></div>
                            <div className="flex-1 text-xs text-muted-foreground">{cat.label}</div>
                            <div className="text-xs font-bold text-foreground">{fmtCur(cat.value)}</div>
                            <div className="text-[10px] text-muted-foreground w-10 text-left">{pct.toFixed(1)}%</div>
                          </div>
                        );
                      })}
                    </div>
                    {totalForPie > 0 && (
                      <div className="flex rounded-full h-3 overflow-hidden mt-3">
                        {costBreakdown.filter(c => c.value > 0).map((cat, i) => (
                          <div key={i} className={`${cat.color}`} style={{ width: `${(cat.value / totalForPie) * 100}%` }}></div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-card rounded-xl p-3 border border-border space-y-1.5">
                    <h4 className="font-bold text-sm text-foreground">סיכום קטגוריות</h4>
                    {[
                      { label: "עלות מוצר", value: n(formData.totalProductCost) * n(formData.exchangeRate), color: "blue" },
                      { label: "הובלה + ביטוח", value: n(formData.totalFreightCosts), color: "cyan" },
                      { label: "מכס + מיסים", value: n(formData.totalTaxesDuties), color: "red" },
                      { label: "נמל + שינוע", value: n(formData.totalPortFees), color: "orange" },
                      { label: "עמלות", value: n(formData.totalAgentFees), color: "purple" },
                      { label: "פיננסי", value: n(formData.totalFinancialCosts), color: "teal" },
                      { label: "אחר", value: n(formData.totalOtherCosts), color: "gray" },
                    ].map((cat, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{cat.label}</span>
                        <span className={`font-bold text-${cat.color}-700`}>{fmtCur(cat.value)}</span>
                      </div>
                    ))}
                    <div className="border-t border-border pt-1.5 mt-1.5 flex justify-between text-sm font-bold">
                      <span className="text-foreground">סה"כ</span>
                      <span className="text-emerald-700">{fmtCur(formData.totalLandedCost)}</span>
                    </div>
                  </div>

                  <div className="bg-card rounded-xl p-3 border border-border">
                    <h4 className="font-bold text-sm text-foreground mb-2">תוספת מכס/מיסים על מוצר</h4>
                    {(() => {
                      const productILS = n(formData.totalProductCost) * n(formData.exchangeRate);
                      const totalLanded = n(formData.totalLandedCost);
                      const markup = productILS > 0 ? ((totalLanded - productILS) / productILS) * 100 : 0;
                      return (
                        <div className="text-center">
                          <div className="text-xl sm:text-3xl font-bold text-orange-700">{markup.toFixed(1)}%</div>
                          <div className="text-xs text-muted-foreground">תוספת על עלות המוצר</div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 p-4 border-t border-slate-100 sticky bottom-0 bg-card rounded-b-2xl">
                <button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-foreground py-2.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                  <Save size={16} /> {editItem ? "עדכון" : "שמירת חישוב"}
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
                  <h2 className="text-lg font-bold text-foreground">{detailItem.calcName}</h2>
                  <div className="flex gap-2 mt-1">
                    <span className="text-sm text-muted-foreground">{detailItem.calcNumber}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[detailItem.status]}`}>{detailItem.status}</span>
                  </div>
                </div>
                <button onClick={() => setDetailItem(null)} className="p-1 hover:bg-muted/50 rounded-lg"><X size={20} /></button>
              </div>
              <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
                <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-200 text-center">
                  <div className="text-sm text-emerald-600">עלות נחיתה כוללת</div>
                  <div className="text-4xl font-bold text-emerald-800">{fmtCur(detailItem.totalLandedCost)}</div>
                  <div className="flex justify-center gap-6 mt-2">
                    <span className="text-sm"><span className="text-muted-foreground">ליחידה:</span> <span className="font-bold text-emerald-700">{fmtCur(detailItem.landedCostPerUnit)}</span></span>
                    <span className="text-sm"><span className="text-muted-foreground">לק"ג:</span> <span className="font-bold text-emerald-700">{fmtCur(detailItem.landedCostPerKg)}</span></span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "מוצר", value: detailItem.productName },
                    { label: "כמות", value: `${n(detailItem.quantity)} ${detailItem.unitType}` },
                    { label: "ספק", value: detailItem.linkedSupplier },
                    { label: "ארץ", value: detailItem.supplierCountry },
                    { label: "הובלה", value: detailItem.shippingMethod },
                    { label: "מטבע", value: detailItem.currency },
                    { label: "שער", value: detailItem.exchangeRate },
                    { label: "HS", value: detailItem.hsCode },
                  ].filter(f => f.value).map((f, i) => (
                    <div key={i} className="bg-muted/30 rounded-lg p-2 text-center">
                      <div className="text-xs text-muted-foreground">{f.label}</div>
                      <div className="font-medium text-sm text-foreground">{f.value}</div>
                    </div>
                  ))}
                </div>

                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr><th className="text-right p-2 font-medium">קטגוריה</th><th className="text-left p-2 font-medium">סכום (₪)</th><th className="text-left p-2 font-medium">%</th></tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "עלות מוצר", value: n(detailItem.totalProductCost) * n(detailItem.exchangeRate), color: "blue" },
                        { label: "הובלה + ביטוח", value: n(detailItem.totalFreightCosts), color: "cyan" },
                        { label: "מכס", value: n(detailItem.customsDutyAmount), color: "red" },
                        { label: "מס רכישה", value: n(detailItem.purchaseTaxAmount), color: "orange" },
                        { label: 'מע"מ', value: n(detailItem.vatAmount), color: "yellow" },
                        { label: "נמל + שינוע", value: n(detailItem.totalPortFees), color: "orange" },
                        { label: "עמלות", value: n(detailItem.totalAgentFees), color: "purple" },
                        { label: "פיננסי", value: n(detailItem.totalFinancialCosts), color: "teal" },
                        { label: "אחר", value: n(detailItem.totalOtherCosts), color: "gray" },
                      ].filter(r => r.value > 0).map((r, i) => {
                        const pct = n(detailItem.totalLandedCost) > 0 ? (r.value / n(detailItem.totalLandedCost)) * 100 : 0;
                        return (
                          <tr key={i} className="border-t border-slate-100 hover:bg-muted/30">
                            <td className={`p-2 font-medium text-${r.color}-700`}>{r.label}</td>
                            <td className="p-2 text-left font-bold">{fmtCur(r.value)}</td>
                            <td className="p-2 text-left text-muted-foreground">{pct.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-emerald-300 bg-emerald-50 font-bold">
                        <td className="p-2 text-emerald-800">סה"כ עלות נחיתה</td>
                        <td className="p-2 text-left text-emerald-800">{fmtCur(detailItem.totalLandedCost)}</td>
                        <td className="p-2 text-left text-emerald-800">100%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {detailItem.notes && (
                  <div className="bg-muted/30 rounded-xl p-4 border border-border">
                    <h4 className="font-bold text-sm text-foreground mb-1">הערות</h4>
                    <p className="text-sm text-muted-foreground">{detailItem.notes}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-4 mt-6">
        <RelatedRecords
          tabs={[
            {
              key: "suppliers",
              label: "ספקים",
              endpoint: `${API}/suppliers?limit=10`,
              columns: [
                { key: "name", label: "שם" },
                { key: "contactName", label: "איש קשר" },
                { key: "status", label: "סטטוס" },
              ],
            },
            {
              key: "import-orders",
              label: "הזמנות יבוא",
              endpoint: `${API}/platform/entities/45/records?limit=10`,
              columns: [
                { key: "id", label: "#" },
                { key: "status", label: "סטטוס" },
              ],
            },
          ]}
        />
        <AttachmentsSection entityType="import-calculations" entityId={0} />
        <ActivityLog entityType="import-calculations" />
      </div>
    </div>
  );
}
