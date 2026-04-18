import { usePermissions } from "@/hooks/use-permissions";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import ImportButton from "@/components/import-button";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import {
  Building2, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, Clock,
  AlertTriangle, ArrowUpDown, DollarSign, TrendingDown, Shield, Package, Eye, Copy
} from "lucide-react";
import { duplicateRecord } from "@/lib/duplicate-record";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

interface FixedAsset {
  id: number; asset_number: string; asset_name: string; asset_type: string;
  manufacturer: string; serial_number: string; status: string; department: string;
  location: string; responsible_person: string; purchase_date: string;
  purchase_cost: number; current_value: number; condition: string; notes: string;
}

const typeMap: Record<string, string> = { machinery: "מכונה", vehicle: "רכב", computer: "מחשב", furniture: "ריהוט", building: "מבנה", tool: "כלי", mold: "תבנית", other: "אחר" };
const statusMap: Record<string, { label: string; color: string }> = { active: { label: "פעיל", color: "bg-green-500/20 text-green-400" }, inactive: { label: "לא פעיל", color: "bg-muted/20 text-muted-foreground" }, maintenance: { label: "בתחזוקה", color: "bg-yellow-500/20 text-yellow-400" }, disposed: { label: "סולק", color: "bg-red-500/20 text-red-400" } };
const conditionMap: Record<string, { label: string; color: string }> = { excellent: { label: "מצוין", color: "bg-green-500/20 text-green-400" }, good: { label: "טוב", color: "bg-blue-500/20 text-blue-400" }, fair: { label: "סביר", color: "bg-yellow-500/20 text-yellow-400" }, poor: { label: "גרוע", color: "bg-orange-500/20 text-orange-400" }, critical: { label: "קריטי", color: "bg-red-500/20 text-red-400" } };

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

export default function AssetManagementPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<FixedAsset[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("asset_number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FixedAsset | null>(null);
  const [viewDetail, setViewDetail] = useState<FixedAsset | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [r1, r2] = await Promise.all([authFetch(`${API}/fixed-assets`), authFetch(`${API}/fixed-assets/stats`)]);
      if (r1.ok) setItems(safeArray(await r1.json()));
      if (r2.ok) setStats((await r2.json()) || {});
    } catch (e: any) { setError(e.message || "שגיאה בטעינת נתונים"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterType === "all" || i.asset_type === filterType) &&
      (!search || [i.asset_number, i.asset_name, i.serial_number, i.location].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he"); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterType, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ assetType: "machinery", status: "active", condition: "good" }); setShowForm(true); };
  const openEdit = (r: FixedAsset) => { setEditing(r); setForm({ assetName: r.asset_name, assetType: r.asset_type, manufacturer: r.manufacturer, serialNumber: r.serial_number, status: r.status, department: r.department, location: r.location, responsiblePerson: r.responsible_person, purchaseDate: r.purchase_date?.slice(0, 10), purchaseCost: r.purchase_cost, condition: r.condition, notes: r.notes }); setShowForm(true); };

  const save = async () => {
    if (!form.assetName) { alert("שדה חובה: שם נכס"); return; }
    setSaving(true);
    try {
      const url = editing ? `${API}/fixed-assets/${editing.id}` : `${API}/fixed-assets`;
      const res = await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; }
      setShowForm(false); load();
    } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };

  const remove = async (id: number) => {
    const item = items.find((x: any) => x.id === id);
    if (await globalConfirm("למחוק נכס?", { itemName: item?.asset_name || String(id), entityType: "נכס" })) { await authFetch(`${API}/fixed-assets/${id}`, { method: "DELETE" }); load(); }
  };

  const kpis = [
    { label: "סה\"כ נכסים", value: fmt(stats.total || items.length), icon: Package, color: "text-blue-400" },
    { label: "פעילים", value: fmt(stats.active || 0), icon: CheckCircle2, color: "text-green-400" },
    { label: "בתחזוקה", value: fmt(stats.in_maintenance || 0), icon: AlertTriangle, color: "text-yellow-400" },
    { label: "עלות רכישה", value: `₪${fmt(stats.total_purchase_cost || 0)}`, icon: DollarSign, color: "text-indigo-400" },
    { label: "שווי נוכחי", value: `₪${fmt(stats.total_current_value || 0)}`, icon: DollarSign, color: "text-emerald-400" },
    { label: "פחת מצטבר", value: `₪${fmt(stats.total_depreciation || 0)}`, icon: TrendingDown, color: "text-orange-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Building2 className="text-indigo-400 w-6 h-6" />ניהול נכסים</h1>
          <p className="text-sm text-muted-foreground mt-1">רכוש קבוע, מכונות, ציוד, פחת ואחריות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ImportButton apiRoute="/api/fixed-assets" onSuccess={load} />
          <ExportDropdown data={filtered} headers={{ asset_number: "מספר", asset_name: "שם", asset_type: "סוג", manufacturer: "יצרן", department: "מחלקה", purchase_cost: "עלות", current_value: "שווי", status: "סטטוס" }} filename="fixed_assets" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> נכס חדש</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסוגים</option>{Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="נכסים" actions={defaultBulkActions(selectedIds, clear, load, `${API}/fixed-assets`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Package className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין נכסים</p></div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            <th className="px-2 py-3 text-center w-10"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered)} partial={selectedIds.length > 0 && selectedIds.length < filtered.length} /></th>
            {[["asset_number","מספר"],["asset_name","שם"],["asset_type","סוג"],["manufacturer","יצרן"],["department","מחלקה"],["location","מיקום"],["purchase_cost","עלות"],["current_value","שווי"],["condition","מצב"],["status","סטטוס"]].map(([f,l]) => (
              <th key={f} onClick={() => toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r => (
              <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="px-2 py-3 text-center"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="px-4 py-3 font-mono text-xs text-indigo-400 font-bold">{r.asset_number}</td>
                <td className="px-4 py-3 font-medium text-foreground max-w-[150px] truncate">{r.asset_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{typeMap[r.asset_type] || r.asset_type}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.manufacturer || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.department || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.location || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">₪{fmt(r.purchase_cost)}</td>
                <td className="px-4 py-3 text-emerald-400 font-bold">₪{fmt(r.current_value)}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${conditionMap[r.condition]?.color || ""}`}>{conditionMap[r.condition]?.label || r.condition}</Badge></td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || ""}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                  <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/fixed-assets`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.asset_name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                </div></td>
              </tr>
            ))}
          </tbody></table>
        </div></div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Building2 className="w-5 h-5 text-indigo-400" />{viewDetail.asset_name}</h2><button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"attachments",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t=>(
                  <button key={t.key} onClick={()=>setDetailTab(t.key)} className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${detailTab===t.key?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מספר נכס" value={viewDetail.asset_number} />
                <DetailField label="שם" value={viewDetail.asset_name} />
                <DetailField label="סוג" value={typeMap[viewDetail.asset_type] || viewDetail.asset_type} />
                <DetailField label="יצרן" value={viewDetail.manufacturer} />
                <DetailField label="מספר סידורי" value={viewDetail.serial_number} />
                <DetailField label="מחלקה" value={viewDetail.department} />
                <DetailField label="מיקום" value={viewDetail.location} />
                <DetailField label="אחראי" value={viewDetail.responsible_person} />
                <DetailField label="תאריך רכישה" value={viewDetail.purchase_date?.slice(0, 10)} />
                <DetailField label="עלות רכישה" value={`₪${fmt(viewDetail.purchase_cost)}`} />
                <DetailField label="שווי נוכחי" value={`₪${fmt(viewDetail.current_value)}`} />
                <DetailField label="מצב"><Badge className={conditionMap[viewDetail.condition]?.color}>{conditionMap[viewDetail.condition]?.label || viewDetail.condition}</Badge></DetailField>
                <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge></DetailField>
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>
              )}
              {detailTab === "related" && (
                <div className="p-5"><RelatedRecords tabs={[
                  { key: "maintenance", label: "תחזוקה", endpoint: `${API}/maintenance-orders?assetId=${viewDetail.id}`, columns: [{ key: "order_number", label: "מספר" }, { key: "title", label: "כותרת" }, { key: "scheduled_date", label: "תאריך" }] },
                  { key: "documents", label: "מסמכים", endpoint: `${API}/controlled-documents?assetId=${viewDetail.id}`, columns: [{ key: "document_number", label: "מספר" }, { key: "title", label: "כותרת" }] },
                ]} /></div>
              )}
              {detailTab === "attachments" && (
                <div className="p-5"><AttachmentsSection entityType="fixed-asset" entityId={viewDetail.id} /></div>
              )}
              {detailTab === "history" && (
                <div className="p-5"><ActivityLog entityType="fixed-asset" entityId={viewDetail.id} /></div>
              )}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" />עריכה</button>
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת נכס" : "נכס חדש"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">שם נכס *</label><input value={form.assetName || ""} onChange={e => setForm({ ...form, assetName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג</label><select value={form.assetType || "machinery"} onChange={e => setForm({ ...form, assetType: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">יצרן</label><input value={form.manufacturer || ""} onChange={e => setForm({ ...form, manufacturer: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מספר סידורי</label><input value={form.serialNumber || ""} onChange={e => setForm({ ...form, serialNumber: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מחלקה</label><input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מיקום</label><input value={form.location || ""} onChange={e => setForm({ ...form, location: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">אחראי</label><input value={form.responsiblePerson || ""} onChange={e => setForm({ ...form, responsiblePerson: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "active"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מצב</label><select value={form.condition || "good"} onChange={e => setForm({ ...form, condition: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(conditionMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך רכישה</label><input type="date" value={form.purchaseDate || ""} onChange={e => setForm({ ...form, purchaseDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עלות רכישה</label><input type="number" step="0.01" value={form.purchaseCost || ""} onChange={e => setForm({ ...form, purchaseCost: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div>
              <div className="p-5 border-t border-border flex gap-3">
                <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl hover:bg-primary/90 text-sm font-medium disabled:opacity-50"><Save className="w-4 h-4" />{saving ? "שומר..." : editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2.5 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
