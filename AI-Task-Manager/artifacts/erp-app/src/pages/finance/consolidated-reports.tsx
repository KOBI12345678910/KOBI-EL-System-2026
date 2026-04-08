import { useState, useEffect, useMemo } from "react";
import {
  Layers, Search, AlertTriangle, TrendingUp, TrendingDown,
  DollarSign, BarChart3, PieChart, ArrowUpRight, Building2, Scale,
  Eye, X, ArrowUpDown, Plus, Edit2, Trash2, Save
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
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCurrency = (v: any) => Number(v || 0).toLocaleString("he-IL", { style: "currency", currency: "ILS" });

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

const categoryTypeMap: Record<string, { label: string; color: string }> = {
  income: { label: "הכנסה", color: "bg-green-500/20 text-green-400" },
  expense: { label: "הוצאה", color: "bg-red-500/20 text-red-400" },
};

export default function ConsolidatedReportsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [incomes, setIncomes] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [balanceData, setBalanceData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("monthly");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("amount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
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
      const [r1, r2, r3] = await Promise.all([
        authFetch(`${API}/consolidated-reports/income`).then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
        authFetch(`${API}/consolidated-reports/expenses`).then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
        authFetch(`${API}/consolidated-reports/balance`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
      ]);
      setIncomes(safeArray(r1));
      setExpenses(safeArray(r2));
      setBalanceData(r3 || {});
    } catch (e: any) { setError(e.message || "שגיאה בטעינה"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const allItems = useMemo(() => {
    const inc = incomes.map((i: any, idx: number) => ({ ...i, _type: "income", _id: `inc-${idx}` }));
    const exp = expenses.map((e: any, idx: number) => ({ ...e, _type: "expense", _id: `exp-${idx}` }));
    return [...inc, ...exp];
  }, [incomes, expenses]);

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = allItems.filter(i =>
      (filterType === "all" || i._type === filterType) &&
      (!search || [i.category, i.description, i.source].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [allItems, search, filterType, sortField, sortDir]);

  const totalIncome = incomes.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
  const totalExpenses = expenses.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
  const netProfit = totalIncome - totalExpenses;
  const profitMargin = totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(1) : "0";
  const totalAssets = Number(balanceData?.totalAssets || 0);
  const totalLiabilities = Number(balanceData?.totalLiabilities || 0);
  const equity = totalAssets - totalLiabilities;

  const kpis = [
    { label: 'סה"כ הכנסות', value: fmtCurrency(totalIncome), icon: TrendingUp, color: "text-green-400" },
    { label: 'סה"כ הוצאות', value: fmtCurrency(totalExpenses), icon: BarChart3, color: "text-red-400" },
    { label: "רווח נקי", value: fmtCurrency(netProfit), icon: PieChart, color: netProfit >= 0 ? "text-emerald-400" : "text-red-400" },
    { label: "שיעור רווח", value: `${profitMargin}%`, icon: ArrowUpRight, color: "text-blue-400" },
    { label: 'סה"כ נכסים', value: fmtCurrency(totalAssets), icon: Building2, color: "text-indigo-400" },
    { label: "הון עצמי", value: fmtCurrency(equity), icon: Scale, color: "text-amber-400" },
  ];

  const openCreate = () => {
    setEditing(null);
    setForm({ type: "income", category: "", amount: 0, description: "", date: new Date().toISOString().slice(0, 10) });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ type: r._type, category: r.category || "", amount: r.amount || 0, description: r.description || "", date: r.date || "" });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const endpoint = form.type === "income" ? "income" : "expenses";
      const url = editing ? `${API}/consolidated-reports/${endpoint}/${editing.id}` : `${API}/consolidated-reports/${endpoint}`;
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

  const remove = async (r: any) => {
    if (await globalConfirm("למחוק רשומה זו? פעולה זו אינה ניתנת לביטול.")) {
      const endpoint = r._type === "income" ? "income" : "expenses";
      await authFetch(`${API}/consolidated-reports/${endpoint}/${r.id}`, { method: "DELETE" });
      load();
    }
  };

  const columns = [
    { key: "category", label: "קטגוריה" },
    { key: "_type", label: "סוג" },
    { key: "description", label: "תיאור" },
    { key: "amount", label: "סכום" },
    { key: "date", label: "תאריך" },
  ];

  const incomeByCategory: Record<string, number> = {};
  incomes.forEach((i: any) => { const cat = i.category || "אחר"; incomeByCategory[cat] = (incomeByCategory[cat] || 0) + Number(i.amount || 0); });
  const expenseByCategory: Record<string, number> = {};
  expenses.forEach((e: any) => { const cat = e.category || "אחר"; expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Number(e.amount || 0); });

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Layers className="text-indigo-400 w-6 h-6" /> דוחות כספיים מאוחדים</h1>
          <p className="text-sm text-muted-foreground mt-1">סיכום כלל הנתונים הפיננסיים</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={period} onChange={e => setPeriod(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
            <option value="monthly">חודשי</option><option value="quarterly">רבעוני</option><option value="yearly">שנתי</option>
          </select>
          <ExportDropdown data={filtered} headers={{ category: "קטגוריה", _type: "סוג", description: "תיאור", amount: "סכום", date: "תאריך" }} filename="consolidated_reports" />
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

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי קטגוריה, תיאור..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסוגים</option>
          <option value="income">הכנסות</option>
          <option value="expense">הוצאות</option>
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="רשומות" actions={defaultBulkActions(selectedIds, clear, load, `${API}/consolidated-reports`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה בטעינה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Layers className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין נתונים</p><p className="text-sm mt-1">{search || filterType !== "all" ? "נסה לשנות את הסינון" : "לחץ על 'רשומה חדשה' כדי להתחיל"}</p>{!(search || filterType !== "all") && <button onClick={() => openCreate()} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 text-sm font-medium flex items-center gap-2 mx-auto"><Plus className="w-4 h-4" />רשומה חדשה</button>}</div>
      ) : (<>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-card border border-border/50 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-400" /> פילוח הכנסות</h3>
            {Object.keys(incomeByCategory).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground"><TrendingUp className="w-12 h-12 mx-auto mb-2 opacity-30" /><p>אין נתוני הכנסות</p></div>
            ) : (
              <div className="space-y-3">{Object.entries(incomeByCategory).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([cat, amount]) => {
                const pct = totalIncome > 0 ? (amount / totalIncome * 100) : 0;
                return (<div key={cat}><div className="flex justify-between text-sm mb-1"><span className="text-muted-foreground">{cat}</span><span className="text-green-400 font-medium">{fmtCurrency(amount)}</span></div><div className="w-full bg-muted/30 rounded-full h-2"><div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} /></div></div>);
              })}</div>
            )}
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-400" /> פילוח הוצאות</h3>
            {Object.keys(expenseByCategory).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground"><BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-30" /><p>אין נתוני הוצאות</p></div>
            ) : (
              <div className="space-y-3">{Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([cat, amount]) => {
                const pct = totalExpenses > 0 ? (amount / totalExpenses * 100) : 0;
                return (<div key={cat}><div className="flex justify-between text-sm mb-1"><span className="text-muted-foreground">{cat}</span><span className="text-red-400 font-medium">{fmtCurrency(amount)}</span></div><div className="w-full bg-muted/30 rounded-full h-2"><div className="bg-red-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} /></div></div>);
              })}</div>
            )}
          </div>
        </div>

        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50"><tr>
              <th className="px-4 py-3 w-10"><BulkCheckbox allIds={filtered.map(r => r._id)} selectedIds={selectedIds} onToggleAll={toggleAll} /></th>
              {columns.map(col => (
                <th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                  <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div>
                </th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
            </tr></thead>
            <tbody>{pagination.paginate(filtered).map((r: any) => (
              <tr key={r._id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3"><BulkCheckbox id={r._id} selectedIds={selectedIds} onToggle={toggle} /></td>
                <td className="px-4 py-3 text-foreground font-medium">{r.category || "—"}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${categoryTypeMap[r._type]?.color || "bg-muted/20 text-muted-foreground"}`}>{categoryTypeMap[r._type]?.label || r._type}</Badge></td>
                <td className="px-4 py-3 text-muted-foreground">{r.description || "—"}</td>
                <td className={`px-4 py-3 font-bold ${r._type === "income" ? "text-green-400" : "text-red-400"}`}>{fmtCurrency(r.amount)}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{r.date?.slice(0, 10) || "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                    {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r._id || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r)}} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Layers className="w-5 h-5 text-indigo-400" /> פרטי רשומה</h2>
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
                  <DetailField label="קטגוריה" value={viewDetail.category} />
                  <DetailField label="סוג"><Badge className={categoryTypeMap[viewDetail._type]?.color}>{categoryTypeMap[viewDetail._type]?.label}</Badge></DetailField>
                  <DetailField label="סכום" value={fmtCurrency(viewDetail.amount)} />
                  <DetailField label="תאריך" value={viewDetail.date?.slice(0, 10)} />
                  <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
                  <DetailField label="מקור" value={viewDetail.source} />
                  <DetailField label="אסמכתא" value={viewDetail.reference} />
                </div>
              )}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="consolidated-reports" entityId={String(viewDetail.id || viewDetail._id)} /></div>}
              {detailTab === "attachments" && <div className="p-5"><AttachmentsSection entityType="consolidated-reports" entityId={String(viewDetail.id || viewDetail._id)} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="consolidated-reports" entityId={String(viewDetail.id || viewDetail._id)} /></div>}
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת רשומה" : "רשומה חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג *</label>
                    <select value={form.type || "income"} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      <option value="income">הכנסה</option><option value="expense">הוצאה</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">קטגוריה *</label>
                    <input value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="שם הקטגוריה" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סכום *</label>
                    <input type="number" min={0} value={form.amount ?? ""} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך</label>
                    <input type="date" value={form.date || ""} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור</label>
                  <textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="תיאור הרשומה" />
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
