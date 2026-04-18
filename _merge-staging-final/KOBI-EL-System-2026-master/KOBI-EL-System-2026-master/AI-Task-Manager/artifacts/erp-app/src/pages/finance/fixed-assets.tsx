import { useState, useEffect, useMemo } from "react";
import { Package, Search, Plus, Edit2, Trash2, X, Save, Hash, Calendar, CheckCircle2, DollarSign, ArrowUpDown, TrendingDown, MapPin, Wrench, AlertTriangle, Building2, Clock, BarChart3, Calculator, Layers , Loader2 , Copy } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Printer, Send } from "lucide-react";
import ExportDropdown from "@/components/export-dropdown";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { useApiAction } from "@/hooks/use-api-action";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import StatusTransition from "@/components/status-transition";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-100 text-green-700" },
  under_maintenance: { label: "בתחזוקה", color: "bg-yellow-100 text-yellow-700" },
  disposed: { label: "נמכר/נגרט", color: "bg-red-100 text-red-700" },
  inactive: { label: "לא פעיל", color: "bg-muted/50 text-muted-foreground" },
  leased: { label: "מושכר", color: "bg-blue-100 text-blue-700" },
};

const assetTypeMap: Record<string, string> = {
  equipment: "ציוד", vehicle: "רכב", computer: "מחשבים", furniture: "ריהוט",
  machinery: "מכונות", building: "מבנה", land: "קרקע", software: "תוכנה",
  tool: "כלי עבודה", other: "אחר",
};

const depMethodMap: Record<string, string> = {
  straight_line: "קו ישר", declining_balance: "יתרה פוחתת",
  units_of_production: "יחידות תפוקה", sum_of_years: "סכום ספרות השנים",
};

const categoryOptions = ["ציוד משרדי", "מחשבים וטכנולוגיה", "רכבים", "ריהוט", "מכונות", "ציוד ייצור", "מבנים", "שיפורים", "כלי עבודה", "אחר"];

type TabType = "assets" | "by_category" | "by_location" | "depreciation";

export default function FixedAssetsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [byCategory, setByCategory] = useState<any[]>([]);
  const [byLocation, setByLocation] = useState<any[]>([]);
  const [depSchedule, setDepSchedule] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [tab, setTab] = useState<TabType>("assets");
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const [tableLoading, setTableLoading] = useState(true);
  const [detailTab, setDetailTab] = useState("details");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const pagination = useSmartPagination(25);
  const { executeSave, executeDelete, execute, loading: actionLoading } = useApiAction();
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const assetValidation = useFormValidation({ assetName: { required: true } });

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/finance/fixed-assets`, { headers }).then(r => r.json()).then(d => setItems(safeArray(d))),
      authFetch(`${API}/finance/fixed-assets/stats`, { headers }).then(r => r.json()).then(d => setStats(d || {})),
      authFetch(`${API}/finance/fixed-assets/by-category`, { headers }).then(r => r.json()).then(d => setByCategory(safeArray(d))),
      authFetch(`${API}/finance/fixed-assets/by-location`, { headers }).then(r => r.json()).then(d => setByLocation(safeArray(d))),
      authFetch(`${API}/finance/fixed-assets/depreciation-schedule`, { headers }).then(r => r.json()).then(d => setDepSchedule(safeArray(d)))
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    let f = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterType === "all" || i.asset_type === filterType) &&
      (filterCategory === "all" || i.category === filterCategory) &&
      (!search || i.asset_number?.toLowerCase().includes(search.toLowerCase()) || i.asset_name?.toLowerCase().includes(search.toLowerCase()) || i.serial_number?.toLowerCase().includes(search.toLowerCase()) || i.location?.toLowerCase().includes(search.toLowerCase()))
    );
    f.sort((a: any, b: any) => {
      const av = a[sortField], bv = b[sortField];
      const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return f;
  }, [items, search, filterStatus, filterType, filterCategory, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ assetType: "equipment", status: "active", currency: "ILS", purchaseDate: new Date().toISOString().slice(0, 10), usefulLifeYears: 5, depreciationMethod: "straight_line" });
    setShowForm(true);
  };
  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      assetName: r.asset_name, assetType: r.asset_type, category: r.category, description: r.description,
      serialNumber: r.serial_number, manufacturer: r.manufacturer, model: r.model, location: r.location,
      department: r.department, assignedTo: r.assigned_to || r.responsible_person, purchaseDate: r.purchase_date?.slice(0, 10),
      purchasePrice: r.purchase_price || r.purchase_cost, currency: r.currency, supplier: r.supplier || r.supplier_name, invoiceNumber: r.invoice_number,
      usefulLifeYears: r.useful_life_years, depreciationMethod: r.depreciation_method,
      accumulatedDepreciation: r.accumulated_depreciation, currentValue: r.current_value || (Number(r.purchase_cost || 0) - Number(r.accumulated_depreciation || 0)),
      residualValue: r.residual_value || r.salvage_value, warrantyExpiry: r.warranty_expiry?.slice(0, 10),
      insurancePolicy: r.insurance_policy, maintenanceSchedule: r.maintenance_schedule,
      status: r.status, glAccount: r.gl_account, costCenter: r.cost_center, barcode: r.barcode, notes: r.notes,
      condition: r.condition,
    });
    setShowForm(true);
  };
  const save = async () => { const url = editing ? `${API}/fixed-assets/${editing.id}` : `${API}/fixed-assets`; await executeSave(url, editing ? "PUT" : "POST", form, editing ? "עודכן בהצלחה" : "נוצר בהצלחה", () => { setShowForm(false); load(); }); };
  const remove = async (id: number) => { await executeDelete(`${API}/fixed-assets/${id}`, "למחוק רשומה?", () => { load(); }); };
  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const runDepreciation = async () => { await execute(() => authFetch(`${API}/finance/fixed-assets/calculate-depreciation`, { method: "POST", headers }).then(r => { if (!r.ok) throw new Error(); return r; }), "לחשב פחת חודשי לכל הנכסים?", "פחת חושב בהצלחה", () => { load(); }); };

  const totalPurchaseValue = Number(stats.total_purchase_value || stats.total_cost || 0);
  const totalDepreciation = Number(stats.total_depreciation || 0);
  const totalCurrentValue = Number(stats.total_current_value || (totalPurchaseValue - totalDepreciation));
  
  const depPct = totalPurchaseValue > 0
    ? (totalDepreciation / totalPurchaseValue * 100).toFixed(1)
    : "0";

  const kpis = [
    { label: "סה\"כ נכסים", value: fmt(stats.total || 0), icon: Hash, color: "text-blue-600" },
    { label: "נכסים פעילים", value: fmt(stats.active_count || stats.active || 0), icon: CheckCircle2, color: "text-green-600" },
    { label: "בתחזוקה", value: fmt(stats.maintenance_count || stats.in_maintenance || 0), icon: Wrench, color: "text-yellow-600" },
    { label: "שווי רכישה", value: `₪${fmt(totalPurchaseValue)}`, icon: DollarSign, color: "text-blue-600" },
    { label: "שווי נוכחי", value: `₪${fmt(totalCurrentValue)}`, icon: DollarSign, color: "text-emerald-600" },
    { label: "פחת מצטבר", value: `₪${fmt(totalDepreciation)}`, icon: TrendingDown, color: "text-red-600" },
    { label: "פחת שנתי", value: `₪${fmt(stats.total_annual_depreciation || stats.annual_depreciation || 0)}`, icon: Calendar, color: "text-orange-600" },
    { label: "אחריות פגה", value: fmt(stats.expired_warranty || 0), icon: AlertTriangle, color: "text-red-600" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><Building2 className="text-teal-600" /> רכוש קבוע (Fixed Assets)</h1>
          <p className="text-muted-foreground mt-1">ניהול נכסי החברה — ציוד, רכבים, מחשבים, פחת, שווי ספרים ומיקומים</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={items} headers={{ asset_number: "מספר", asset_name: "שם", category: "קטגוריה", purchase_price: "עלות", accumulated_depreciation: "פחת", location: "מיקום", status: "סטטוס" }} filename={"fixed_assets"} />
          <button onClick={() => printPage("רכוש קבוע")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Printer size={16} /> הדפסה</button>
          <button onClick={runDepreciation} className="flex items-center gap-1.5 bg-orange-600 text-foreground px-3 py-2 rounded-lg hover:bg-orange-700 text-sm"><Calculator size={16} /> חשב פחת</button>
          <button onClick={() => sendByEmail("רכוש קבוע - טכנו-כל עוזי", generateEmailBody("רכוש קבוע", items, { asset_number: "מספר", asset_name: "נכס", purchase_price: "עלות", current_value: "שווי", status: "סטטוס" }))} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Send size={16} /> שליחה</button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-teal-600 text-foreground px-3 py-2 rounded-lg hover:bg-teal-700 shadow-lg text-sm"><Plus size={16} /> נכס חדש</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card rounded-xl shadow-sm border p-3">
            <kpi.icon className={`${kpi.color} mb-1`} size={20} />
            <div className="text-lg font-bold">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="bg-card rounded-xl shadow-sm border p-4">
        <div className="text-sm font-bold text-foreground mb-2">שיעור פחת כולל</div>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="h-4 bg-muted/50 rounded-full overflow-hidden">
              <div className="bg-gradient-to-l from-red-500 to-orange-400 h-full rounded-full" style={{ width: `${Math.min(Number(depPct), 100)}%` }}></div>
            </div>
          </div>
          <div className="text-xl font-bold text-orange-600">{depPct}%</div>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>שווי נוכחי: ₪{fmt(totalCurrentValue)}</span>
          <span>עלות מקורית: ₪{fmt(totalPurchaseValue)}</span>
        </div>
      </div>

      <div className="flex gap-2 border-b">
        {([["assets", "נכסים"], ["by_category", "לפי קטגוריה"], ["by_location", "לפי מיקום"], ["depreciation", "לוח פחת"]] as [TabType, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === key ? 'border-teal-600 text-teal-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</button>
        ))}
      </div>

      {tab === "assets" && (<>
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px]"><Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש נכס/מספר/מיקום..." className="w-full pr-10 pl-4 py-2 border rounded-lg" /></div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2"><option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border rounded-lg px-3 py-2"><option value="all">כל הסוגים</option>{Object.entries(assetTypeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="border rounded-lg px-3 py-2"><option value="all">כל הקטגוריות</option>{categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}</select>
        </div>

        <div className="bg-card rounded-xl shadow-sm border overflow-x-auto relative">
        {tableLoading && (
          <div className="absolute inset-0 bg-card/60 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="flex items-center gap-2 bg-card border rounded-lg px-4 py-2 shadow-lg"><Loader2 className="w-4 h-4 animate-spin text-amber-600" /><span className="text-sm">טוען נתונים...</span></div>
          </div>
        )}
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b"><tr>
              {[
                { key: "asset_number", label: "מספר" }, { key: "asset_name", label: "שם נכס" },
                { key: "asset_type", label: "סוג" }, { key: "category", label: "קטגוריה" },
                { key: "purchase_price", label: "עלות" }, { key: "current_value", label: "שווי נוכחי" },
                { key: "accumulated_depreciation", label: "פחת" }, { key: "location", label: "מיקום" },
                { key: "status", label: "סטטוס" },
              ].map(col => (
                <th key={col.key} className="px-2 py-3 text-right cursor-pointer hover:bg-muted/50 text-xs" onClick={() => toggleSort(col.key)}>
                  <div className="flex items-center gap-1">{col.label} <ArrowUpDown size={10} /></div>
                </th>
              ))}
              <th className="px-2 py-3 text-right text-xs">פעולות</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">אין נכסים</td></tr> :
              filtered.map(r => (
                <tr key={r.id} className="border-b hover:bg-teal-50/30 cursor-pointer" onClick={() => { setSelectedItem(r); setDetailTab("details"); }}>
                  <td className="px-2 py-2 font-mono text-teal-600 font-bold text-xs">{r.asset_number}</td>
                  <td className="px-2 py-2 font-medium">{r.asset_name}</td>
                  <td className="px-2 py-2 text-xs">{assetTypeMap[r.asset_type] || r.asset_type}</td>
                  <td className="px-2 py-2 text-xs">{r.category || "-"}</td>
                  <td className="px-2 py-2 font-bold">₪{fmt(r.purchase_price || r.purchase_cost)}</td>
                  <td className="px-2 py-2 text-green-600 font-bold">₪{fmt(r.current_value || (Number(r.purchase_cost || 0) - Number(r.accumulated_depreciation || 0)))}</td>
                  <td className="px-2 py-2 text-red-600">₪{fmt(r.accumulated_depreciation)}</td>
                  <td className="px-2 py-2 text-xs">{r.location || "-"}</td>
                  <td className="px-2 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${statusMap[r.status]?.color || 'bg-muted/50'}`}>{statusMap[r.status]?.label || r.status}</span></td>
                  <td className="px-2 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(r)} className="p-1 hover:bg-blue-500/10 rounded"><Edit2 size={13} /></button><button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/fixed-assets`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                      <button onClick={() => remove(r.id)} className="p-1 hover:bg-red-500/10 rounded text-red-500"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      <SmartPagination pagination={pagination} />
        <div className="text-sm text-muted-foreground">סה"כ: {filtered.length} נכסים</div>
      </>)}

      {tab === "by_category" && (
        <div className="bg-card rounded-xl shadow-sm border p-4">
          <div className="space-y-4">
            {byCategory.length === 0 ? <div className="text-muted-foreground text-center py-8">אין נתונים</div> :
            byCategory.map((c: any, i: number) => {
              const bookValue = Number(c.total_current || (Number(c.total_cost || 0) - Number(c.total_depreciation || 0)));
              const totalAll = byCategory.reduce((s: number, x: any) => s + Number(x.total_current || x.total_cost || 0), 0);
              const pct = totalAll > 0 ? (Number(c.total_current || c.total_cost) / totalAll * 100) : 0;
              return (
                <div key={i} className="border rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <div className="font-bold">{c.category || "אחר"} <span className="text-muted-foreground text-sm font-normal">({c.count} נכסים)</span></div>
                    <div className="text-sm font-bold">{pct.toFixed(1)}%</div>
                  </div>
                  <div className="h-2 bg-muted/50 rounded-full overflow-hidden mb-2">
                    <div className="bg-teal-500 h-full rounded-full" style={{ width: `${pct}%` }}></div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div><span className="text-muted-foreground">עלות:</span> <span className="font-bold">₪{fmt(c.total_purchase || c.total_cost)}</span></div>
                    <div><span className="text-muted-foreground">פחת:</span> <span className="font-bold text-orange-600">₪{fmt(c.total_depreciation)}</span></div>
                    <div><span className="text-muted-foreground">שווי ספרים:</span> <span className="font-bold text-green-600">₪{fmt(bookValue)}</span></div>
                    <div><span className="text-muted-foreground">פחת שנתי:</span> <span className="font-bold">₪{fmt(c.annual_depreciation)}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "by_location" && (
        <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b"><tr>
              <th className="px-3 py-3 text-right">מיקום</th>
              <th className="px-3 py-3 text-right">כמות</th>
              <th className="px-3 py-3 text-right">שווי כולל</th>
              <th className="px-3 py-3 text-right">% מסה"כ</th>
            </tr></thead>
            <tbody>
              {byLocation.length === 0 ? <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">אין נתונים</td></tr> :
              byLocation.map((r: any, i: number) => {
                const totalAll = byLocation.reduce((s: number, x: any) => s + Number(x.total_value || 0), 0);
                const pct = totalAll > 0 ? (Number(r.total_value) / totalAll * 100) : 0;
                return (
                  <tr key={i} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium flex items-center gap-1"><MapPin size={14} className="text-muted-foreground" /> {r.location}</td>
                    <td className="px-3 py-2 text-center">{r.count}</td>
                    <td className="px-3 py-2 font-bold text-green-600">₪{fmt(r.total_value)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-muted/50 rounded-full h-2"><div className="bg-teal-500 h-2 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }}></div></div>
                        <span className="text-xs">{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "depreciation" && (
        <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b"><tr>
              <th className="px-3 py-3 text-right">מספר</th><th className="px-3 py-3 text-right">שם</th>
              <th className="px-3 py-3 text-right">קטגוריה</th><th className="px-3 py-3 text-right">עלות</th>
              <th className="px-3 py-3 text-right">שיטת פחת</th><th className="px-3 py-3 text-right">פחת שנתי</th>
              <th className="px-3 py-3 text-right">פחת נצבר</th><th className="px-3 py-3 text-right">שווי ספרים</th>
              <th className="px-3 py-3 text-right">% פחת</th><th className="px-3 py-3 text-right">שנים נותרות</th>
            </tr></thead>
            <tbody>
              {depSchedule.length === 0 ? <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">אין לוח פחת</td></tr> :
              depSchedule.map((r: any) => (
                <tr key={r.id} className="border-b hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-teal-600 text-xs">{r.asset_number}</td>
                  <td className="px-3 py-2 font-medium">{r.asset_name}</td>
                  <td className="px-3 py-2 text-xs">{r.category}</td>
                  <td className="px-3 py-2 font-bold">₪{fmt(r.purchase_cost)}</td>
                  <td className="px-3 py-2 text-xs">{depMethodMap[r.depreciation_method] || r.depreciation_method}</td>
                  <td className="px-3 py-2">₪{fmt(r.annual_depreciation)}</td>
                  <td className="px-3 py-2 text-orange-600">₪{fmt(r.accumulated_depreciation)}</td>
                  <td className="px-3 py-2 font-bold text-green-600">₪{fmt(r.book_value)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <div className="w-12 bg-muted/50 rounded-full h-1.5"><div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${Math.min(Number(r.depreciation_pct || 0), 100)}%` }}></div></div>
                      <span className="text-xs">{Number(r.depreciation_pct || 0).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">{Number(r.remaining_years || 0).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{editing ? "עריכת נכס" : "נכס חדש"}</h2>
                <button onClick={() => setShowForm(false)}><X size={20} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium mb-1">שם נכס *</label><input value={form.assetName || ""} onChange={e => setForm({ ...form, assetName: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סוג</label>
                  <select value={form.assetType || "equipment"} onChange={e => setForm({ ...form, assetType: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                    {Object.entries(assetTypeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-medium mb-1">קטגוריה</label>
                  <select value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                    <option value="">בחר</option>{categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-medium mb-1">יצרן</label><input value={form.manufacturer || ""} onChange={e => setForm({ ...form, manufacturer: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">דגם</label><input value={form.model || ""} onChange={e => setForm({ ...form, model: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מס' סריאלי</label><input value={form.serialNumber || ""} onChange={e => setForm({ ...form, serialNumber: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תאריך רכישה</label><input type="date" value={form.purchaseDate || ""} onChange={e => setForm({ ...form, purchaseDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">עלות רכישה (₪)</label><input type="number" step="0.01" value={form.purchasePrice || form.purchaseCost || ""} onChange={e => setForm({ ...form, purchasePrice: e.target.value, purchaseCost: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">ערך שייר/גרט (₪)</label><input type="number" step="0.01" value={form.residualValue || form.salvageValue || ""} onChange={e => setForm({ ...form, residualValue: e.target.value, salvageValue: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">אורך חיים (שנים)</label><input type="number" value={form.usefulLifeYears || ""} onChange={e => setForm({ ...form, usefulLifeYears: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">שיטת פחת</label>
                  <select value={form.depreciationMethod || "straight_line"} onChange={e => setForm({ ...form, depreciationMethod: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                    {Object.entries(depMethodMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-medium mb-1">סטטוס</label>
                  <select value={form.status || "active"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                    {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-medium mb-1">מיקום</label><input value={form.location || ""} onChange={e => setForm({ ...form, location: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מחלקה</label><input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">אחראי/מוקצה ל</label><input value={form.assignedTo || form.responsiblePerson || ""} onChange={e => setForm({ ...form, assignedTo: e.target.value, responsiblePerson: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">ספק</label><input value={form.supplier || form.supplierName || ""} onChange={e => setForm({ ...form, supplier: e.target.value, supplierName: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">חשבונית</label><input value={form.invoiceNumber || ""} onChange={e => setForm({ ...form, invoiceNumber: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תום אחריות</label><input type="date" value={form.warrantyExpiry || ""} onChange={e => setForm({ ...form, warrantyExpiry: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מצב (Condition)</label><input value={form.condition || ""} onChange={e => setForm({ ...form, condition: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">פוליסת ביטוח</label><input value={form.insurancePolicy || ""} onChange={e => setForm({ ...form, insurancePolicy: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מרכז עלות</label><input value={form.costCenter || ""} onChange={e => setForm({ ...form, costCenter: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-1"><label className="block text-sm font-medium mb-1">ברקוד</label><input value={form.barcode || ""} onChange={e => setForm({ ...form, barcode: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">תיאור</label><input value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-3"><label className="block text-sm font-medium mb-1">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={2} /></div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
                <button onClick={save} className="px-6 py-2 bg-teal-600 text-foreground rounded-lg hover:bg-teal-700 flex items-center gap-2"><Save size={16} /> {editing ? "עדכן" : "צור"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedItem(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-slate-700">
              <h2 className="text-xl font-bold text-foreground">נכס: {selectedItem.asset_name} ({selectedItem.asset_number})</h2>
              <button onClick={() => setSelectedItem(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="flex border-b border-border/50">
              {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
              ))}
            </div>
            <div className="p-6">
              {detailTab === "details" && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div><div className="text-xs text-muted-foreground mb-1">סוג נכס</div><div className="text-sm text-foreground">{assetTypeMap[selectedItem.asset_type] || selectedItem.asset_type}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">קטגוריה</div><div className="text-sm text-foreground">{selectedItem.category || "-"}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">עלות רכישה</div><div className="text-sm text-foreground font-bold">₪{fmt(selectedItem.purchase_price || selectedItem.purchase_cost)}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">שווי נוכחי</div><div className="text-sm text-green-400 font-bold">₪{fmt(selectedItem.current_value)}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">פחת מצטבר</div><div className="text-sm text-red-400">₪{fmt(selectedItem.accumulated_depreciation)}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">מיקום</div><div className="text-sm text-foreground">{selectedItem.location || "-"}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">שיטת פחת</div><div className="text-sm text-foreground">{depMethodMap[selectedItem.depreciation_method] || selectedItem.depreciation_method || "-"}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">סטטוס</div><div className="text-sm text-foreground">{statusMap[selectedItem.status]?.label || selectedItem.status}</div></div>
                </div>
              )}
              {detailTab === "related" && <RelatedRecords entityType="fixed-assets" entityId={selectedItem.id} tabs={[{ key: "depreciation", label: "לוח פחת", endpoint: `${API}/finance/fixed-assets/${selectedItem.id}/depreciation` }, { key: "maintenance", label: "תחזוקה", endpoint: `${API}/finance/fixed-assets/${selectedItem.id}/maintenance` }]} />}
              {detailTab === "docs" && <AttachmentsSection entityType="fixed-assets" entityId={selectedItem.id} />}
              {detailTab === "history" && <ActivityLog entityType="fixed-assets" entityId={selectedItem.id} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
