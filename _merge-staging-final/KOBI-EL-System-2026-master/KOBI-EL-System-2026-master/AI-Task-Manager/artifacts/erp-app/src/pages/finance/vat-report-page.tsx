import { useState, useEffect, useMemo } from "react";
import {
  FileText, Search, AlertTriangle, TrendingUp, TrendingDown,
  DollarSign, Hash, Eye, X, ArrowUpDown, Plus, Edit2, Trash2, Save, Calendar
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);

const monthNames: Record<string, string> = {
  "01": "ינואר", "02": "פברואר", "03": "מרץ", "04": "אפריל",
  "05": "מאי", "06": "יוני", "07": "יולי", "08": "אוגוסט",
  "09": "ספטמבר", "10": "אוקטובר", "11": "נובמבר", "12": "דצמבר",
};

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

const statusMap: Record<string, { label: string; color: string }> = {
  submitted: { label: "הוגש", color: "bg-green-500/20 text-green-400" },
  draft: { label: "טיוטה", color: "bg-yellow-500/20 text-yellow-400" },
  pending: { label: "ממתין", color: "bg-blue-500/20 text-blue-400" },
};

export default function VatReportPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3));
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("month");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected, isAllSelected } = useBulkSelection();
  const [detailTab, setDetailTab] = useState("details");

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/vat-report?year=${year}&quarter=${quarter}`);
      if (res.ok) setData(await res.json());
      else setError("שגיאה בטעינת נתונים");
    } catch (e: any) { setError(e.message || "שגיאה"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [year, quarter]);

  const allPeriods = data?.periods || [];
  const summary = data?.summary || {};

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let d = [...allPeriods];
    if (search) {
      d = d.filter((p: any) => {
        const [, month] = (p.month || "").split("-");
        return (monthNames[month] || p.month || "").includes(search);
      });
    }
    d.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(d.length);
    return d;
  }, [allPeriods, search, sortField, sortDir]);

  const kpis = [
    { label: "מכירות חייבות", value: `₪${fmt(summary.totalTaxableSales)}`, icon: TrendingUp, color: "text-blue-400" },
    { label: 'מע"מ תפוקות', value: `₪${fmt(summary.totalOutputVat)}`, icon: DollarSign, color: "text-green-400" },
    { label: "רכישות חייבות", value: `₪${fmt(summary.totalTaxablePurchases)}`, icon: TrendingDown, color: "text-muted-foreground" },
    { label: 'מע"מ תשומות', value: `₪${fmt(summary.totalInputVat)}`, icon: DollarSign, color: "text-orange-400" },
    { label: "חבות/זיכוי", value: `₪${fmt(Math.abs(summary.netVat || 0))}`, icon: FileText, color: Number(summary.netVat) >= 0 ? "text-red-400" : "text-green-400" },
    { label: "עסקאות", value: fmt(allPeriods.reduce((s: number, p: any) => s + Number(p.transaction_count || 0), 0)), icon: Hash, color: "text-purple-400" },
  ];

  const openCreate = () => {
    setEditing(null);
    setForm({ month: `${year}-01`, taxable_sales: 0, output_vat: 0, taxable_purchases: 0, input_vat: 0, status: "draft" });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ month: r.month, taxable_sales: r.taxable_sales || 0, output_vat: r.output_vat || 0, taxable_purchases: r.taxable_purchases || 0, input_vat: r.input_vat || 0, status: r.status || "draft" });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/vat-report/${editing.id}` : `${API}/vat-report`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (r: any) => {
    if (await globalConfirm("למחוק רשומת מע\"מ זו?")) {
      await authFetch(`${API}/vat-report/${r.id}`, { method: "DELETE" });
      load();
    }
  };

  const columns = [
    { key: "month", label: "חודש" },
    { key: "taxable_sales", label: "מכירות חייבות" },
    { key: "output_vat", label: 'מע"מ תפוקות' },
    { key: "taxable_purchases", label: "רכישות חייבות" },
    { key: "input_vat", label: 'מע"מ תשומות' },
    { key: "net_vat", label: "חבות נטו" },
    { key: "transaction_count", label: "עסקאות" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><FileText className="text-blue-400 w-6 h-6" /> {'דוח מע"מ'}</h1>
          <p className="text-sm text-muted-foreground mt-1">{'סיכום עסקאות, מע"מ תשומות/תפוקות וחבות מע"מ'}</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
            {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={quarter} onChange={e => setQuarter(Number(e.target.value))} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
            <option value={1}>רבעון 1</option><option value={2}>רבעון 2</option>
            <option value={3}>רבעון 3</option><option value={4}>רבעון 4</option>
          </select>
          <ExportDropdown data={allPeriods} headers={{ month: "חודש", taxable_sales: "מכירות חייבות", output_vat: "תפוקות", taxable_purchases: "רכישות", input_vat: "תשומות", net_vat: "חבות" }} filename="vat_report" />
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי חודש..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="רשומות" actions={defaultBulkActions(selectedIds, clear, load, `${API}/vat-report`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה בטעינה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><FileText className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">{'אין נתוני מע"מ לתקופה זו'}</p></div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border/50"><tr>
            <th className="px-4 py-3 w-10"><BulkCheckbox checked={isAllSelected(filtered.map((_: any, i: number) => i))} onChange={() => toggleAll(filtered.map((_: any, i: number) => i))} /></th>
            {columns.map(col => (
              <th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div>
              </th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead>
          <tbody>{pagination.paginate(filtered).map((p: any, i: number) => {
            const [, month] = (p.month || "").split("-");
            const net = Number(p.net_vat || 0);
            return (
              <tr key={i} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3"><BulkCheckbox checked={isSelected(i)} onChange={() => toggle(i)} /></td>
                <td className="px-4 py-3 text-foreground font-medium">{monthNames[month] || p.month}</td>
                <td className="px-4 py-3 text-blue-400">₪{fmt(p.taxable_sales)}</td>
                <td className="px-4 py-3 text-green-400 font-bold">₪{fmt(p.output_vat)}</td>
                <td className="px-4 py-3 text-muted-foreground">₪{fmt(p.taxable_purchases)}</td>
                <td className="px-4 py-3 text-orange-400 font-bold">₪{fmt(p.input_vat)}</td>
                <td className={`px-4 py-3 font-bold ${net >= 0 ? "text-red-400" : "text-green-400"}`}>₪{fmt(Math.abs(net))} {net >= 0 ? "לתשלום" : "לזיכוי"}</td>
                <td className="px-4 py-3 text-muted-foreground text-center">{p.transaction_count || 0}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => setViewDetail(p)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    <button onClick={() => openEdit(p)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                    <button onClick={() => remove(p)} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                  </div>
                </td>
              </tr>
            );
          })}</tbody>
          <tfoot><tr className="bg-muted/20 font-bold">
            <td className="px-4 py-3 text-foreground">{'סה"כ'}</td>
            <td className="px-4 py-3 text-blue-400">₪{fmt(summary.totalTaxableSales)}</td>
            <td className="px-4 py-3 text-green-400">₪{fmt(summary.totalOutputVat)}</td>
            <td className="px-4 py-3 text-muted-foreground">₪{fmt(summary.totalTaxablePurchases)}</td>
            <td className="px-4 py-3 text-orange-400">₪{fmt(summary.totalInputVat)}</td>
            <td className={`px-4 py-3 ${Number(summary.netVat) >= 0 ? "text-red-400" : "text-green-400"}`}>₪{fmt(Math.abs(summary.netVat || 0))}</td>
            <td className="px-4 py-3 text-center text-muted-foreground">{allPeriods.reduce((s: number, p: any) => s + Number(p.transaction_count || 0), 0)}</td>
            <td></td>
          </tr></tfoot>
        </table></div></div>
        <SmartPagination pagination={pagination} />

        {data?.taxRate && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 text-sm text-blue-400">
            <strong>{'שיעור מע"מ:'}</strong> {data.taxRate}% | <strong>מספר עוסק:</strong> {data.vatNumber || "לא הוגדר"}
          </div>
        )}
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">פירוט חודש {monthNames[(viewDetail.month || "").split("-")[1]] || viewDetail.month}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border">
                {[{k:"details",l:"פרטים"},{k:"related",l:"רשומות קשורות"},{k:"attachments",l:"מסמכים"},{k:"history",l:"היסטוריה"}].map(t=>(
                  <button key={t.k} onClick={()=>setDetailTab(t.k)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${detailTab===t.k?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"}`}>{t.l}</button>
                ))}
              </div>
              {detailTab === "details" && (
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מכירות חייבות" value={`₪${fmt(viewDetail.taxable_sales)}`} />
                <DetailField label={'מע"מ תפוקות'} value={`₪${fmt(viewDetail.output_vat)}`} />
                <DetailField label="רכישות חייבות" value={`₪${fmt(viewDetail.taxable_purchases)}`} />
                <DetailField label={'מע"מ תשומות'} value={`₪${fmt(viewDetail.input_vat)}`} />
                <DetailField label="חבות נטו" value={`₪${fmt(Math.abs(Number(viewDetail.net_vat || 0)))}`} />
                <DetailField label="מספר עסקאות" value={String(viewDetail.transaction_count || 0)} />
                <DetailField label="מכירות פטורות" value={`₪${fmt(viewDetail.exempt_sales || 0)}`} />
                <DetailField label={'שיעור מע"מ'} value={data?.taxRate ? `${data.taxRate}%` : "—"} />
              </div>
              )}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="vat-report" entityId={viewDetail.id} /></div>}
              {detailTab === "attachments" && <div className="p-5"><AttachmentsSection entityType="vat-report" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="vat-report" entityId={viewDetail.id} /></div>}
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
                <h2 className="text-lg font-bold text-foreground">{editing ? 'עריכת רשומה' : 'רשומת מע״מ חדשה'}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">חודש *</label>
                    <input value={form.month || ""} onChange={e => setForm({ ...form, month: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="2025-01" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                    <select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">מכירות חייבות</label>
                    <input type="number" min={0} value={form.taxable_sales ?? ""} onChange={e => setForm({ ...form, taxable_sales: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">{'מע"מ תפוקות'}</label>
                    <input type="number" min={0} value={form.output_vat ?? ""} onChange={e => setForm({ ...form, output_vat: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">רכישות חייבות</label>
                    <input type="number" min={0} value={form.taxable_purchases ?? ""} onChange={e => setForm({ ...form, taxable_purchases: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">{'מע"מ תשומות'}</label>
                    <input type="number" min={0} value={form.input_vat ?? ""} onChange={e => setForm({ ...form, input_vat: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
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
