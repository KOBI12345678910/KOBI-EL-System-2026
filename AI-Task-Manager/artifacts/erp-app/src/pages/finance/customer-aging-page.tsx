import { useState, useEffect, useMemo } from "react";
import {
  Clock, Search, AlertTriangle, ArrowUpDown, Eye, X, Users,
  DollarSign, Hash, TrendingDown, Plus, Edit2, Trash2, Save
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

interface AgingEntry {
  id?: number;
  customer_name: string;
  customer_number?: string;
  current: number;
  days_30: number;
  days_60: number;
  days_90: number;
  days_120_plus: number;
  total: number;
  last_payment_date?: string;
  credit_limit?: number;
  contact_phone?: string;
  notes?: string;
}

const riskMap: Record<string, { label: string; color: string }> = {
  low: { label: "נמוך", color: "bg-green-500/20 text-green-400" },
  medium: { label: "בינוני", color: "bg-yellow-500/20 text-yellow-400" },
  high: { label: "גבוה", color: "bg-red-500/20 text-red-400" },
};

function getRisk(entry: AgingEntry) {
  const overdue = Number(entry.days_90 || 0) + Number(entry.days_120_plus || 0);
  if (overdue > Number(entry.total || 1) * 0.5) return "high";
  if (overdue > 0) return "medium";
  return "low";
}

export default function CustomerAgingPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<AgingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterRange, setFilterRange] = useState("all");
  const [sortField, setSortField] = useState("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<AgingEntry | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AgingEntry | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/customer-aging`);
      if (res.ok) setItems(safeArray(await res.json())); else setError("שגיאה בטעינת נתונים");
    } catch (e: any) { setError(e.message || "שגיאה"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i => {
      if (search && !i.customer_name?.toLowerCase().includes(search.toLowerCase()) && !i.customer_number?.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterRange === "overdue") return Number(i.days_90 || 0) + Number(i.days_120_plus || 0) > 0;
      if (filterRange === "current") return Number(i.days_90 || 0) + Number(i.days_120_plus || 0) === 0;
      return true;
    });
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterRange, sortField, sortDir]);

  const totalAll = items.reduce((s, i) => s + Number(i.total || 0), 0);
  const totalOverdue = items.reduce((s, i) => s + Number(i.days_90 || 0) + Number(i.days_120_plus || 0), 0);
  const kpis = [
    { label: "לקוחות", value: fmt(items.length), icon: Users, color: "text-blue-400" },
    { label: 'סה"כ חוב', value: fmtCurrency(totalAll), icon: DollarSign, color: "text-red-400" },
    { label: "שוטף", value: fmtCurrency(items.reduce((s, i) => s + Number(i.current || 0), 0)), icon: Clock, color: "text-green-400" },
    { label: "30 יום", value: fmtCurrency(items.reduce((s, i) => s + Number(i.days_30 || 0), 0)), icon: Hash, color: "text-amber-400" },
    { label: "60 יום", value: fmtCurrency(items.reduce((s, i) => s + Number(i.days_60 || 0), 0)), icon: AlertTriangle, color: "text-orange-400" },
    { label: "90+ יום", value: fmtCurrency(totalOverdue), icon: TrendingDown, color: "text-red-400" },
  ];

  const openCreate = () => {
    setEditing(null);
    setForm({ customer_name: "", customer_number: "", current: 0, days_30: 0, days_60: 0, days_90: 0, days_120_plus: 0, credit_limit: 0, notes: "" });
    setShowForm(true);
  };

  const openEdit = (r: AgingEntry) => {
    setEditing(r);
    setForm({ customer_name: r.customer_name, customer_number: r.customer_number, current: r.current, days_30: r.days_30, days_60: r.days_60, days_90: r.days_90, days_120_plus: r.days_120_plus, credit_limit: r.credit_limit || 0, notes: (r as any).notes || "" });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/customer-aging/${editing.id}` : `${API}/customer-aging`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (r: AgingEntry) => {
    if (await globalConfirm("למחוק רשומת גיול זו?")) {
      await authFetch(`${API}/customer-aging/${r.id}`, { method: "DELETE" });
      load();
    }
  };

  const columns = [
    { key: "customer_name", label: "לקוח" },
    { key: "current", label: "שוטף" },
    { key: "days_30", label: "30 יום" },
    { key: "days_60", label: "60 יום" },
    { key: "days_90", label: "90 יום" },
    { key: "days_120_plus", label: "120+ יום" },
    { key: "total", label: 'סה"כ' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Clock className="text-blue-400 w-6 h-6" /> גיול לקוחות</h1>
          <p className="text-sm text-muted-foreground mt-1">דוח גיול חובות לקוחות לפי תקופות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ customer_name: "לקוח", current: "שוטף", days_30: "30 יום", days_60: "60 יום", days_90: "90 יום", days_120_plus: "120+", total: "סהכ" }} filename="customer_aging" />
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לקוח..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterRange} onChange={e => setFilterRange(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">הכל</option><option value="current">שוטף בלבד</option><option value="overdue">באיחור 90+</option>
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="רשומות גיול" actions={defaultBulkActions(selectedIds, clear, load, `${API}/customer-aging`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה בטעינה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Clock className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין נתוני גיול</p><p className="text-sm mt-1">{search || filterRange !== "all" ? "נסה לשנות את הסינון" : "לחץ על 'רשומה חדשה' כדי להתחיל"}</p>{!(search) && <button onClick={() => openCreate()} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 text-sm font-medium flex items-center gap-2 mx-auto"><Plus className="w-4 h-4" />רשומה חדשה</button>}</div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50"><tr>
                <th className="px-4 py-3 w-10"><BulkCheckbox allIds={filtered.map((r, i) => r.id || i)} selectedIds={selectedIds} onToggleAll={toggleAll} /></th>
                {columns.map(col => (<th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div></th>))}
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">סיכון</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
              </tr></thead>
              <tbody>
                {pagination.paginate(filtered).map((r, idx) => {
                  const risk = getRisk(r);
                  return (
                    <tr key={r.id || idx} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3"><BulkCheckbox id={r.id || idx} selectedIds={selectedIds} onToggle={toggle} /></td>
                      <td className="px-4 py-3 text-foreground font-medium">{r.customer_name}</td>
                      <td className="px-4 py-3 text-green-400">{fmtCurrency(r.current)}</td>
                      <td className="px-4 py-3 text-amber-400">{fmtCurrency(r.days_30)}</td>
                      <td className="px-4 py-3 text-orange-400">{fmtCurrency(r.days_60)}</td>
                      <td className="px-4 py-3 text-red-400">{fmtCurrency(r.days_90)}</td>
                      <td className="px-4 py-3 text-red-500 font-bold">{fmtCurrency(r.days_120_plus)}</td>
                      <td className="px-4 py-3 text-foreground font-bold">{fmtCurrency(r.total)}</td>
                      <td className="px-4 py-3"><Badge className={`text-[10px] ${riskMap[risk]?.color}`}>{riskMap[risk]?.label}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                          <button onClick={() => remove(r)} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
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

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{viewDetail.customer_name}</h2>
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
                  <DetailField label="לקוח" value={viewDetail.customer_name} />
                  <DetailField label="מספר לקוח" value={viewDetail.customer_number} />
                  <DetailField label="שוטף" value={fmtCurrency(viewDetail.current)} />
                  <DetailField label="30 יום" value={fmtCurrency(viewDetail.days_30)} />
                  <DetailField label="60 יום" value={fmtCurrency(viewDetail.days_60)} />
                  <DetailField label="90 יום" value={fmtCurrency(viewDetail.days_90)} />
                  <DetailField label="120+ יום" value={fmtCurrency(viewDetail.days_120_plus)} />
                  <DetailField label={'סה"כ'} value={fmtCurrency(viewDetail.total)} />
                  <DetailField label="מסגרת אשראי" value={fmtCurrency(viewDetail.credit_limit)} />
                  <DetailField label="תשלום אחרון" value={viewDetail.last_payment_date?.slice(0, 10)} />
                  <DetailField label="רמת סיכון"><Badge className={riskMap[getRisk(viewDetail)]?.color}>{riskMap[getRisk(viewDetail)]?.label}</Badge></DetailField>
                </div>
              )}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="customer-aging" entityId={String(viewDetail.id)} /></div>}
              {detailTab === "attachments" && <div className="p-5"><AttachmentsSection entityType="customer-aging" entityId={String(viewDetail.id)} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="customer-aging" entityId={String(viewDetail.id)} /></div>}
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת גיול" : "רשומת גיול חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שם לקוח *</label><input value={form.customer_name || ""} onChange={e => setForm({ ...form, customer_name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מספר לקוח</label><input value={form.customer_number || ""} onChange={e => setForm({ ...form, customer_number: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שוטף</label><input type="number" min={0} value={form.current ?? ""} onChange={e => setForm({ ...form, current: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">30 יום</label><input type="number" min={0} value={form.days_30 ?? ""} onChange={e => setForm({ ...form, days_30: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">60 יום</label><input type="number" min={0} value={form.days_60 ?? ""} onChange={e => setForm({ ...form, days_60: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">90 יום</label><input type="number" min={0} value={form.days_90 ?? ""} onChange={e => setForm({ ...form, days_90: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">120+ יום</label><input type="number" min={0} value={form.days_120_plus ?? ""} onChange={e => setForm({ ...form, days_120_plus: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מסגרת אשראי</label><input type="number" min={0} value={form.credit_limit ?? ""} onChange={e => setForm({ ...form, credit_limit: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                </div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" /> {saving ? "שומר..." : "שמור"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
