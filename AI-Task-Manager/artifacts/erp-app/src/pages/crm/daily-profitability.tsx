import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import {
  TrendingUp, TrendingDown, DollarSign, BarChart3, AlertTriangle,
  Calendar, Target, ArrowUpRight, ArrowDownRight, Search, ArrowUpDown, Eye, X,
  Plus, Edit2, Trash2, Save, RefreshCw, Percent
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || d?.daily || []);
const fmt = (n: any) => Number(n || 0).toLocaleString("he-IL");
const fmtC = (n: any) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(Number(n || 0));

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

export default function DailyProfitabilityPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [filterTrend, setFilterTrend] = useState("all");
  const [dateRange, setDateRange] = useState(() => {
    const d = new Date();
    return { from: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0,10), to: d.toISOString().slice(0,10) };
  });
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/crm/profitability/daily`);
      if (res.ok) setData((await res.json()) || {});
    } catch (e: any) { setError(e.message || "שגיאה"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const daily = Array.isArray(data.daily) ? data.daily.map((d: any, i: number) => ({ ...d, id: i + 1 })) : [];
  const summary = data.summary || {};

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let d = daily.filter((r: any) =>
      (!dateRange.from || r.date >= dateRange.from) &&
      (!dateRange.to || r.date <= dateRange.to) &&
      (!search || r.date?.includes(search)) &&
      (filterTrend === "all" || (filterTrend === "profit" ? (r.profit || 0) >= 0 : (r.profit || 0) < 0))
    );
    d.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb)); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(d.length);
    return d;
  }, [daily, search, dateRange, filterTrend, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ date: new Date().toISOString().slice(0, 10), revenue: 0, costs: 0, notes: "" });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ date: r.date, revenue: r.revenue || 0, costs: r.costs || 0, notes: r.notes || "" });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/crm/profitability/daily/${editing.id}` : `${API}/crm/profitability/daily`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק רשומת רווחיות זו?")) {
      await authFetch(`${API}/crm/profitability/daily/${id}`, { method: "DELETE" });
      load();
    }
  };

  const kpis = [
    { label: "הכנסות תקופה", value: fmtC(summary.total_revenue || 0), icon: DollarSign, color: "text-green-400" },
    { label: "עלויות", value: fmtC(summary.total_costs || 0), icon: TrendingDown, color: "text-red-400" },
    { label: "רווח גולמי", value: fmtC(summary.gross_profit || 0), icon: TrendingUp, color: "text-blue-400" },
    { label: "שולי רווח", value: `${Number(summary.profit_margin || 0).toFixed(1)}%`, icon: Target, color: "text-purple-400" },
    { label: "ממוצע יומי", value: fmtC(summary.avg_daily_revenue || 0), icon: BarChart3, color: "text-cyan-400" },
    { label: "ימים רווחיים", value: fmt(summary.profitable_days || 0), icon: Calendar, color: "text-amber-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><BarChart3 className="text-green-400 w-6 h-6" />רווחיות יומית</h1>
          <p className="text-sm text-muted-foreground mt-1">ניתוח רווחיות לפי ימים, מגמות ושולי רווח</p>
        </div>
        <div className="flex gap-2">
          <ExportDropdown data={filtered} headers={{ date: "תאריך", revenue: "הכנסות", costs: "עלויות", profit: "רווח", margin: "שולי רווח%" }} filename="daily_profitability" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> רשומה חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש תאריך..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <div className="flex gap-2 items-center text-sm">
          <label className="text-muted-foreground">מ-</label>
          <input type="date" className="bg-card border border-border rounded-xl px-3 py-2 text-sm" value={dateRange.from} onChange={e => setDateRange({...dateRange, from: e.target.value})} />
          <label className="text-muted-foreground">עד</label>
          <input type="date" className="bg-card border border-border rounded-xl px-3 py-2 text-sm" value={dateRange.to} onChange={e => setDateRange({...dateRange, to: e.target.value})} />
        </div>
        <select value={filterTrend} onChange={e => setFilterTrend(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הימים</option>
          <option value="profit">רווחיים</option>
          <option value="loss">הפסדיים</option>
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} ימים</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={() => setSelectedIds([])} entityName="רשומות רווחיות" actions={defaultBulkActions(selectedIds, () => setSelectedIds([]), load, `${API}/crm/profitability/daily`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין נתוני רווחיות</p><p className="text-sm mt-1">{search || filterTrend !== "all" ? "נסה לשנות את הסינון" : "הנתונים יופיעו כאשר יהיו עסקאות"}</p>{!(search) && <button onClick={() => openCreate()} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 text-sm font-medium flex items-center gap-2 mx-auto"><Plus className="w-4 h-4" />רשומה חדשה</button>}</div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            <th className="px-2 py-3 w-10"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered)} partial={selectedIds.length > 0 && selectedIds.length < filtered.length} /></th>
            {[["date","תאריך"],["revenue","הכנסות"],["costs","עלויות"],["profit","רווח"],["margin","שולי רווח"]].map(([f,l]) => (
              <th key={f} onClick={() => toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">מגמה</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map((r: any) => (
              <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="px-2 py-3"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.date}</td>
                <td className="px-4 py-3 text-green-400">{fmtC(r.revenue || 0)}</td>
                <td className="px-4 py-3 text-red-400">{fmtC(r.costs || 0)}</td>
                <td className={`px-4 py-3 font-medium ${(r.profit || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtC(r.profit || 0)}</td>
                <td className="px-4 py-3">{Number(r.margin || 0).toFixed(1)}%</td>
                <td className="px-4 py-3">{(r.profit || 0) >= 0 ? <ArrowUpRight className="w-4 h-4 text-green-400" /> : <ArrowDownRight className="w-4 h-4 text-red-400" />}</td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.date || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><BarChart3 className="w-5 h-5 text-green-400" />רווחיות — {viewDetail.date}</h2><button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="תאריך" value={viewDetail.date} />
                <DetailField label="הכנסות" value={fmtC(viewDetail.revenue || 0)} />
                <DetailField label="עלויות" value={fmtC(viewDetail.costs || 0)} />
                <DetailField label="רווח" value={fmtC(viewDetail.profit || 0)} />
                <DetailField label="שולי רווח" value={`${Number(viewDetail.margin || 0).toFixed(1)}%`} />
                <DetailField label="מגמה">{(viewDetail.profit || 0) >= 0 ? <Badge className="bg-green-500/20 text-green-400">רווחי</Badge> : <Badge className="bg-red-500/20 text-red-400">הפסד</Badge>}</DetailField>
                <DetailField label="עסקאות" value={fmt(viewDetail.deals_count || 0)} />
                <DetailField label="לקוחות" value={fmt(viewDetail.customers_count || 0)} />
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>
              <div className="border-t border-border">
                <div className="flex gap-2 p-3 border-b border-border/50">
                  {[{id:"details",label:"פרטים"},{id:"activity",label:"פעילות"},{id:"related",label:"קשורים"}].map(tab=>(
                    <button key={tab.id} onClick={()=>setDetailTab(tab.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${detailTab===tab.id?"bg-primary text-primary-foreground":"text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>
                  ))}
                </div>
                {detailTab === "activity" && <div className="p-4"><ActivityLog entityType="profitability" entityId={viewDetail.id} /></div>}
                {detailTab === "related" && <div className="p-4"><RelatedRecords entityType="profitability" entityId={viewDetail.id} /></div>}
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={()=>{setViewDetail(null);openEdit(viewDetail);}} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה</button>
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={()=>setShowForm(false)}>
            <motion.div initial={{scale:0.95}} animate={{scale:1}} exit={{scale:0.95}} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e=>e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת רשומת רווחיות" : "רשומת רווחיות חדשה"}</h2>
                <button onClick={()=>setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך *</label>
                    <input type="date" value={form.date||""} onChange={e=>setForm({...form,date:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">הכנסות *</label>
                    <input type="number" min={0} value={form.revenue??""} onChange={e=>setForm({...form,revenue:Number(e.target.value)})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="₪" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">עלויות *</label>
                    <input type="number" min={0} value={form.costs??""} onChange={e=>setForm({...form,costs:Number(e.target.value)})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="₪" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">רווח (מחושב)</label>
                    <div className={`px-3 py-2.5 rounded-xl border border-border text-sm font-medium ${(form.revenue || 0) - (form.costs || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtC((form.revenue || 0) - (form.costs || 0))}</div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label>
                  <textarea rows={3} value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" placeholder="הערות נוספות" />
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={()=>setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50"><Save className="w-4 h-4" />{saving?"שומר...":"שמור"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActivityLog entityType="profitability" entityId="daily" />
        <RelatedRecords entityType="profitability" entityId="daily" />
      </div>
    </div>
  );
}
