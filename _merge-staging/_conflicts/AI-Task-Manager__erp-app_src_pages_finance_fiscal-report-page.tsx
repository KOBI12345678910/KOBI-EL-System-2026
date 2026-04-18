import { useState, useEffect, useMemo } from "react";
import {
  BarChart3, Search, AlertTriangle, TrendingUp, TrendingDown,
  DollarSign, Hash, Eye, X, ArrowUpDown, Plus, Edit2, Trash2, Save
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);

const quarterNames: Record<number, string> = { 1: "רבעון א'", 2: "רבעון ב'", 3: "רבעון ג'", 4: "רבעון ד'" };

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

export default function FiscalReportPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [view, setView] = useState<"annual" | "quarterly">("quarterly");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("quarter");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/fiscal-report?year=${year}&view=${view}`);
      if (res.ok) setData(await res.json());
      else setError("שגיאה בטעינת נתונים");
    } catch (e: any) { setError(e.message || "שגיאה"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [year, view]);

  const quarters = data?.quarters || [];
  const annual = data?.annual || {};
  const revenueByCategory = data?.revenueByCategory || [];
  const expensesByCategory = data?.expensesByCategory || [];

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let d = [...quarters];
    if (search) d = d.filter((q: any) => (quarterNames[q.quarter] || "").includes(search));
    d.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(d.length);
    return d;
  }, [quarters, search, sortField, sortDir]);

  const kpis = [
    { label: 'סה"כ הכנסות', value: `₪${fmt(annual.revenue)}`, icon: TrendingUp, color: "text-green-400" },
    { label: 'סה"כ הוצאות', value: `₪${fmt(annual.expenses)}`, icon: TrendingDown, color: "text-red-400" },
    { label: "רווח גולמי", value: `₪${fmt(annual.gross_profit)}`, icon: DollarSign, color: Number(annual.gross_profit) >= 0 ? "text-blue-400" : "text-red-400" },
    { label: "מיסים", value: `₪${fmt(annual.tax_amount)}`, icon: BarChart3, color: "text-orange-400" },
    { label: "רווח נקי", value: `₪${fmt(annual.net_profit)}`, icon: DollarSign, color: Number(annual.net_profit) >= 0 ? "text-emerald-400" : "text-red-400" },
    { label: "מרווח", value: `${Number(annual.margin || 0).toFixed(1)}%`, icon: Hash, color: "text-purple-400" },
  ];

  const openCreate = () => {
    setEditing(null);
    setForm({ quarter: 1, revenue: 0, expenses: 0, gross_profit: 0, tax_amount: 0, net_profit: 0 });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ quarter: r.quarter, revenue: r.revenue || 0, expenses: r.expenses || 0, gross_profit: r.gross_profit || 0, tax_amount: r.tax_amount || 0, net_profit: r.net_profit || 0 });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/fiscal-report/${editing.id}` : `${API}/fiscal-report`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, year }) });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (r: any) => {
    if (await globalConfirm("למחוק רשומה פיסקלית זו?")) {
      await authFetch(`${API}/fiscal-report/${r.id}`, { method: "DELETE" });
      load();
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><BarChart3 className="text-purple-400 w-6 h-6" /> דוח פיסקלי</h1>
          <p className="text-sm text-muted-foreground mt-1">דוח פיסקלי שנתי/רבעוני</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
            {[2022, 2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="flex bg-card border border-border rounded-xl overflow-hidden">
            <button onClick={() => setView("annual")} className={`px-3 py-2 text-sm transition-colors ${view === "annual" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>שנתי</button>
            <button onClick={() => setView("quarterly")} className={`px-3 py-2 text-sm transition-colors ${view === "quarterly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>רבעוני</button>
          </div>
          <ExportDropdown data={quarters.length > 0 ? quarters : [annual]} headers={{ quarter: "תקופה", revenue: "הכנסות", expenses: "הוצאות", gross_profit: "רווח גולמי", tax_amount: "מיסים", net_profit: "רווח נקי", margin: "מרווח%" }} filename="fiscal_report" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> רשומה חדשה
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה בטעינה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : !data ? (
        <div className="text-center py-16 text-muted-foreground"><BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין נתונים</p></div>
      ) : (<>
        {view === "quarterly" && quarters.length > 0 && (<>
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש רבעון..."
                className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
          </div>
          <BulkActions selectedIds={selectedIds} onClear={clear} entityName="רבעונים" actions={defaultBulkActions(selectedIds, clear, load, `${API}/fiscal-report`)} />
          <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50"><tr>
              <th className="px-4 py-3 w-10"><BulkCheckbox allIds={filtered.map((q: any, i: number) => q.id || i)} selectedIds={selectedIds} onToggleAll={toggleAll} /></th>
              <th onClick={() => toggleSort("quarter")} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">רבעון<ArrowUpDown className="w-3 h-3" /></div></th>
              <th onClick={() => toggleSort("revenue")} className="px-4 py-3 text-right text-xs font-medium text-green-400 cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">הכנסות<ArrowUpDown className="w-3 h-3" /></div></th>
              <th onClick={() => toggleSort("expenses")} className="px-4 py-3 text-right text-xs font-medium text-red-400 cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">הוצאות<ArrowUpDown className="w-3 h-3" /></div></th>
              <th className="px-4 py-3 text-right text-xs font-medium text-blue-400">רווח גולמי</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-orange-400">מיסים</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">רווח נקי</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">מרווח%</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
            </tr></thead>
            <tbody>{pagination.paginate(filtered).map((q: any, i: number) => {
              const net = Number(q.net_profit || 0);
              return (
                <tr key={i} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3"><BulkCheckbox id={q.id || i} selectedIds={selectedIds} onToggle={toggle} /></td>
                  <td className="px-4 py-3 text-foreground font-medium">{quarterNames[q.quarter] || `רבעון ${q.quarter}`}</td>
                  <td className="px-4 py-3 text-green-400 font-bold">₪{fmt(q.revenue)}</td>
                  <td className="px-4 py-3 text-red-400 font-bold">₪{fmt(q.expenses)}</td>
                  <td className="px-4 py-3 text-blue-400">₪{fmt(q.gross_profit)}</td>
                  <td className="px-4 py-3 text-orange-400">₪{fmt(q.tax_amount)}</td>
                  <td className={`px-4 py-3 font-bold ${net >= 0 ? "text-emerald-400" : "text-red-400"}`}>₪{fmt(net)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{Number(q.margin || 0).toFixed(1)}%</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setViewDetail(q)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => openEdit(q)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                      <button onClick={() => remove(q)} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}</tbody>
            <tfoot><tr className="bg-muted/20 font-bold">
              <td className="px-4 py-3 text-foreground">{'סה"כ שנה'}</td>
              <td className="px-4 py-3 text-green-400">₪{fmt(annual.revenue)}</td>
              <td className="px-4 py-3 text-red-400">₪{fmt(annual.expenses)}</td>
              <td className="px-4 py-3 text-blue-400">₪{fmt(annual.gross_profit)}</td>
              <td className="px-4 py-3 text-orange-400">₪{fmt(annual.tax_amount)}</td>
              <td className={`px-4 py-3 ${Number(annual.net_profit) >= 0 ? "text-emerald-400" : "text-red-400"}`}>₪{fmt(annual.net_profit)}</td>
              <td className="px-4 py-3 text-muted-foreground">{Number(annual.margin || 0).toFixed(1)}%</td>
              <td></td>
            </tr></tfoot>
          </table></div></div>
          <SmartPagination pagination={pagination} />
        </>)}

        {view === "annual" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-card border border-border/50 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-400" /> הכנסות לפי קטגוריה</h3>
              {revenueByCategory.length === 0 ? (<div className="text-muted-foreground text-sm py-4">אין נתונים</div>) : (
                <div className="space-y-3">{revenueByCategory.map((c: any, i: number) => (<div key={i} className="flex justify-between text-sm"><span className="text-muted-foreground">{c.category || "כללי"}</span><span className="font-bold text-green-400">₪{fmt(c.total)}</span></div>))}</div>
              )}
            </div>
            <div className="bg-card border border-border/50 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-400" /> הוצאות לפי קטגוריה</h3>
              {expensesByCategory.length === 0 ? (<div className="text-muted-foreground text-sm py-4">אין נתונים</div>) : (
                <div className="space-y-3">{expensesByCategory.map((c: any, i: number) => (<div key={i} className="flex justify-between text-sm"><span className="text-muted-foreground">{c.category || "כללי"}</span><span className="font-bold text-red-400">₪{fmt(c.total)}</span></div>))}</div>
              )}
            </div>
          </div>
        )}
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{quarterNames[viewDetail.quarter] || `רבעון ${viewDetail.quarter}`} — {year}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border">
                {[
                  { key: "details", label: "פרטים" },
                  { key: "related", label: "רשומות קשורות" },
                  { key: "attachments", label: "מסמכים" },
                  { key: "history", label: "היסטוריה" },
                ].map(tab => (
                  <button key={tab.key} onClick={() => setDetailTab(tab.key)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${detailTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <div className="p-5 grid grid-cols-2 gap-4">
                  <DetailField label="הכנסות" value={`₪${fmt(viewDetail.revenue)}`} />
                  <DetailField label="הוצאות" value={`₪${fmt(viewDetail.expenses)}`} />
                  <DetailField label="רווח גולמי" value={`₪${fmt(viewDetail.gross_profit)}`} />
                  <DetailField label="מיסים" value={`₪${fmt(viewDetail.tax_amount)}`} />
                  <DetailField label="רווח נקי" value={`₪${fmt(viewDetail.net_profit)}`} />
                  <DetailField label="מרווח" value={`${Number(viewDetail.margin || 0).toFixed(1)}%`} />
                </div>
              )}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="fiscal-report" entityId={String(viewDetail.id)} /></div>}
              {detailTab === "attachments" && <div className="p-5"><AttachmentsSection entityType="fiscal-report" entityId={String(viewDetail.id)} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="fiscal-report" entityId={String(viewDetail.id)} /></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה</button>
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת רשומה" : "רשומה פיסקלית חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">רבעון *</label>
                    <select value={form.quarter || 1} onChange={e => setForm({ ...form, quarter: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {[1, 2, 3, 4].map(q => <option key={q} value={q}>{quarterNames[q]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">הכנסות</label>
                    <input type="number" value={form.revenue ?? ""} onChange={e => setForm({ ...form, revenue: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">הוצאות</label>
                    <input type="number" value={form.expenses ?? ""} onChange={e => setForm({ ...form, expenses: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">מיסים</label>
                    <input type="number" value={form.tax_amount ?? ""} onChange={e => setForm({ ...form, tax_amount: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">רווח גולמי</label>
                    <input type="number" value={form.gross_profit ?? ""} onChange={e => setForm({ ...form, gross_profit: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">רווח נקי</label>
                    <input type="number" value={form.net_profit ?? ""} onChange={e => setForm({ ...form, net_profit: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm flex items-center gap-2 disabled:opacity-50">
                  <Save className="w-4 h-4" /> {saving ? "שומר..." : "שמור"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
