import { useState, useEffect, useMemo } from "react";
import {
  Landmark, Search, Plus, Edit2, Trash2, X, Save, AlertTriangle,
  ArrowUpDown, DollarSign, Hash, Eye, TrendingUp, TrendingDown,
  Clock, Percent, BarChart3, Briefcase, RefreshCw, Copy
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { duplicateRecord } from "@/lib/duplicate-record";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCurrency = (v: any) => Number(v || 0).toLocaleString("he-IL", { style: "currency", currency: "ILS" });
const fmtPct = (v: any) => (Number(v || 0)).toFixed(2) + "%";
const fmtDate = (v: any) => v ? new Date(v).toLocaleDateString("he-IL") : "\u2014";

interface TreasuryPosition {
  id: number;
  instrument_type: string;
  instrument_name: string;
  counterparty: string;
  principal: number;
  rate: number;
  start_date: string;
  maturity_date: string;
  current_value: number;
  pnl: number;
  unrealized_pnl: number;
  currency: string;
  status: string;
  notes: string;
}

const instrumentTypes: Record<string, { label: string; icon: string }> = {
  deposit: { label: "פיקדון", icon: "bg-blue-500/20 text-blue-400" },
  loan: { label: "הלוואה", icon: "bg-orange-500/20 text-orange-400" },
  bond: { label: "אג\"ח", icon: "bg-purple-500/20 text-purple-400" },
  forex: { label: "מט\"ח", icon: "bg-emerald-500/20 text-emerald-400" },
  derivative: { label: "נגזרת", icon: "bg-pink-500/20 text-pink-400" },
  investment: { label: "השקעה", icon: "bg-amber-500/20 text-amber-400" },
};

const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  matured: { label: "נפרע", color: "bg-blue-500/20 text-blue-400" },
  closed: { label: "סגור", color: "bg-muted/20 text-muted-foreground" },
  defaulted: { label: "כשל", color: "bg-red-500/20 text-red-400" },
  pending: { label: "ממתין", color: "bg-amber-500/20 text-amber-400" },
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children || <div className="text-sm text-foreground font-medium">{value || "\u2014"}</div>}
    </div>
  );
}

export default function TreasuryManagementPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<TreasuryPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("maturity_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TreasuryPosition | null>(null);
  const [viewDetail, setViewDetail] = useState<TreasuryPosition | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const [detailTab, setDetailTab] = useState("details");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/finance-sap/treasury-positions`);
      if (res.ok) setItems(safeArray(await res.json()));
      else setError("שגיאה בטעינת פוזיציות אוצר");
    } catch (e: any) {
      setError(e.message || "שגיאה");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterType === "all" || i.instrument_type === filterType) &&
      (!search || [i.instrument_name, i.counterparty, i.instrument_type, i.currency]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [items, search, filterStatus, filterType, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ status: "active", instrument_type: "deposit", currency: "ILS" });
    setShowForm(true);
  };

  const openEdit = (r: TreasuryPosition) => {
    setEditing(r);
    setForm({
      instrumentType: r.instrument_type, instrumentName: r.instrument_name,
      counterparty: r.counterparty, principal: r.principal, rate: r.rate,
      startDate: r.start_date?.split("T")[0], maturityDate: r.maturity_date?.split("T")[0],
      currency: r.currency, status: r.status, notes: r.notes,
    });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/finance-sap/treasury-positions/${editing.id}` : `${API}/finance-sap/treasury-positions`;
      await authFetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק פוזיציה זו?")) {
      await authFetch(`${API}/finance-sap/treasury-positions/${id}`, { method: "DELETE" });
      load();
    }
  };

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const activeItems = items.filter(i => i.status === "active");
  const totalValue = activeItems.reduce((s, i) => s + Number(i.current_value || 0), 0);
  const totalUnrealizedPnl = activeItems.reduce((s, i) => s + Number(i.unrealized_pnl || i.pnl || 0), 0);
  const maturingIn30 = activeItems.filter(i => {
    if (!i.maturity_date) return false;
    const d = new Date(i.maturity_date);
    return d >= now && d <= in30Days;
  }).length;

  const kpis = [
    { label: "סה\"כ פוזיציות", value: fmt(activeItems.length), icon: Hash, color: "text-blue-400" },
    { label: "שווי כולל", value: fmtCurrency(totalValue), icon: DollarSign, color: "text-amber-400" },
    { label: "רווח/הפסד לא ממומש", value: fmtCurrency(totalUnrealizedPnl), icon: totalUnrealizedPnl >= 0 ? TrendingUp : TrendingDown, color: totalUnrealizedPnl >= 0 ? "text-green-400" : "text-red-400" },
    { label: "נפדים ב-30 יום", value: fmt(maturingIn30), icon: Clock, color: maturingIn30 > 0 ? "text-orange-400" : "text-muted-foreground" },
  ];

  const columns = [
    { key: "instrument_type", label: "סוג מכשיר" },
    { key: "instrument_name", label: "שם" },
    { key: "counterparty", label: "צד נגדי" },
    { key: "principal", label: "קרן" },
    { key: "rate", label: "ריבית" },
    { key: "maturity_date", label: "מועד פירעון" },
    { key: "current_value", label: "שווי נוכחי" },
    { key: "pnl", label: "רוו\"ה" },
    { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Landmark className="text-cyan-400 w-6 h-6" />
            ניהול אוצר
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול פוזיציות אוצר, מכשירים פיננסיים ופדיונות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={load} className="flex items-center gap-2 bg-card border border-border px-3 py-2.5 rounded-xl hover:bg-muted text-sm">
            <RefreshCw className="w-4 h-4" /> רענן
          </button>
          <ExportDropdown
            data={filtered}
            headers={{ instrument_type: "סוג", instrument_name: "שם", counterparty: "צד נגדי", principal: "קרן", rate: "ריבית", maturity_date: "פירעון", current_value: "שווי", pnl: "רוו\"ה", status: "סטטוס" }}
            filename="treasury_positions"
          />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> פוזיציה חדשה
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} />
            <div className="text-xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי שם, צד נגדי, מטבע..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסוגים</option>
          {Object.entries(instrumentTypes).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({length:4}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">שגיאה בטעינה</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Landmark className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין פוזיציות אוצר</p>
          <p className="text-sm mt-1">{search || filterStatus !== "all" || filterType !== "all" ? "נסה לשנות את הסינון" : "לחץ על 'פוזיציה חדשה' כדי להתחיל"}</p>
        </div>
      ) : (<>
        <BulkActions selectedIds={selectedIds} onClear={clear} entityName="items" actions={defaultBulkActions(selectedIds, clear, load, `${API}/finance-sap/treasury-positions`)} />
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="px-4 py-3 w-10"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered.map(r => r.id))} /></th>
                  {columns.map(col => (
                    <th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                      <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginate(filtered).map(r => {
                  const pnlVal = Number(r.pnl || r.unrealized_pnl || 0);
                  const matDate = r.maturity_date ? new Date(r.maturity_date) : null;
                  const isNearMaturity = matDate && matDate >= now && matDate <= in30Days;
                  return (
                    <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 w-10"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] ${instrumentTypes[r.instrument_type]?.icon || "bg-muted/20 text-muted-foreground"}`}>
                          {instrumentTypes[r.instrument_type]?.label || r.instrument_type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-foreground font-medium">{r.instrument_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.counterparty || "\u2014"}</td>
                      <td className="px-4 py-3 text-amber-400">{fmtCurrency(r.principal)}</td>
                      <td className="px-4 py-3 text-cyan-400 font-mono text-xs">{fmtPct(r.rate)}</td>
                      <td className={`px-4 py-3 ${isNearMaturity ? "text-orange-400 font-bold" : "text-muted-foreground"}`}>
                        {fmtDate(r.maturity_date)}
                        {isNearMaturity && <Clock className="w-3 h-3 inline mr-1" />}
                      </td>
                      <td className="px-4 py-3 text-foreground font-medium">{fmtCurrency(r.current_value)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold ${pnlVal >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {pnlVal >= 0 ? "+" : ""}{fmtCurrency(pnlVal)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>{statusMap[r.status]?.label || r.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => { setDetailTab("details"); setViewDetail(r); }} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button><button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/finance-sap/treasury-positions`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                          {isSuperAdmin && <button onClick={async () => { if (await globalConfirm(`למחוק פוזיציה '${r.instrument_name}'?`)) remove(r.id); }} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <SmartPagination pagination={pagination} />
      </>)}

      {/* Detail Modal */}
      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{viewDetail.instrument_name}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex gap-1 p-3 border-b border-border bg-muted/20">
                {[
                  { id: "details", label: "פרטים" },
                  { id: "related", label: "רשומות קשורות" },
                  { id: "attachments", label: "מסמכים" },
                  { id: "activity", label: "היסטוריה" },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setDetailTab(tab.id)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${detailTab === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>
                ))}
              </div>
              {detailTab === "details" ? (
                <div className="p-5 grid grid-cols-2 gap-4">
                  <DetailField label="סוג מכשיר">
                    <Badge className={instrumentTypes[viewDetail.instrument_type]?.icon}>{instrumentTypes[viewDetail.instrument_type]?.label || viewDetail.instrument_type}</Badge>
                  </DetailField>
                  <DetailField label="שם מכשיר" value={viewDetail.instrument_name} />
                  <DetailField label="צד נגדי" value={viewDetail.counterparty} />
                  <DetailField label="מטבע" value={viewDetail.currency} />
                  <DetailField label="קרן" value={fmtCurrency(viewDetail.principal)} />
                  <DetailField label="ריבית" value={fmtPct(viewDetail.rate)} />
                  <DetailField label="תאריך התחלה" value={fmtDate(viewDetail.start_date)} />
                  <DetailField label="מועד פירעון" value={fmtDate(viewDetail.maturity_date)} />
                  <DetailField label="שווי נוכחי" value={fmtCurrency(viewDetail.current_value)} />
                  <DetailField label="רווח/הפסד">
                    <span className={`text-sm font-bold ${Number(viewDetail.pnl || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {fmtCurrency(viewDetail.pnl)}
                    </span>
                  </DetailField>
                  <DetailField label={'רווח לא ממומש'}>
                    <span className={`text-sm font-bold ${Number(viewDetail.unrealized_pnl || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {fmtCurrency(viewDetail.unrealized_pnl)}
                    </span>
                  </DetailField>
                  <DetailField label="סטטוס">
                    <Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge>
                  </DetailField>
                  <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
                </div>
              ) : detailTab === "related" ? (
                <div className="p-5"><RelatedRecords entityType="treasury-positions" entityId={viewDetail?.id} /></div>
              ) : detailTab === "attachments" ? (
                <div className="p-5"><AttachmentsSection entityType="treasury-positions" entityId={viewDetail?.id} /></div>
              ) : (
                <div className="p-5"><ActivityLog entityType="treasury-positions" entityId={viewDetail?.id} /></div>
              )}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30">
                  <Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה
                </button>
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create/Edit Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת פוזיציה" : "פוזיציה חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג מכשיר *</label>
                  <select value={form.instrumentType || "deposit"} onChange={e => setForm({ ...form, instrumentType: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(instrumentTypes).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם מכשיר *</label>
                  <input value={form.instrumentName || ""} onChange={e => setForm({ ...form, instrumentName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">צד נגדי</label>
                  <input value={form.counterparty || ""} onChange={e => setForm({ ...form, counterparty: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">קרן</label>
                  <input type="number" value={form.principal || ""} onChange={e => setForm({ ...form, principal: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">ריבית (%)</label>
                  <input type="number" step="0.01" value={form.rate || ""} onChange={e => setForm({ ...form, rate: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">מטבע</label>
                  <select value={form.currency || "ILS"} onChange={e => setForm({ ...form, currency: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    <option value="ILS">ILS</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="JPY">JPY</option>
                    <option value="CHF">CHF</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך התחלה</label>
                  <input type="date" value={form.startDate || ""} onChange={e => setForm({ ...form, startDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">מועד פירעון</label>
                  <input type="date" value={form.maturityDate || ""} onChange={e => setForm({ ...form, maturityDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                  <select value={form.status || "active"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label>
                  <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
              </div>
              <div className="p-5 border-t border-border flex gap-3">
                <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl hover:bg-primary/90 text-sm disabled:opacity-50">
                  <Save className="w-4 h-4" /> {saving ? "שומר..." : editing ? "עדכון" : "שמירה"}
                </button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2.5 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
