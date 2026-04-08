import { useState, useEffect, useMemo } from "react";
import {
  FileText, Search, Plus, Edit2, Trash2, X, Save, AlertTriangle,
  ArrowUpDown, DollarSign, Hash, Eye, Percent, Clock
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
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCurrency = (v: any) => Number(v || 0).toLocaleString("he-IL", { style: "currency", currency: "ILS" });

interface WHItem {
  id: number;
  vendor_name: string;
  certificate_number: string;
  tax_rate: number;
  base_amount: number;
  tax_amount: number;
  net_amount: number;
  payment_date: string;
  certificate_date: string;
  certificate_expiry: string;
  status: string;
  tax_type: string;
  notes: string;
}

const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  expired: { label: "פג תוקף", color: "bg-red-500/20 text-red-400" },
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
  exempt: { label: "פטור", color: "bg-blue-500/20 text-blue-400" },
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}
    </div>
  );
}

export default function WithholdingTaxPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<WHItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("payment_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WHItem | null>(null);
  const [viewDetail, setViewDetail] = useState<WHItem | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const [detailTab, setDetailTab] = useState("details");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/withholding-tax`);
      if (res.ok) setItems(safeArray(await res.json()));
      else setError("שגיאה בטעינת ניכויי מס");
    } catch (e: any) {
      setError(e.message || "שגיאה");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (!search || [i.vendor_name, i.certificate_number]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [items, search, filterStatus, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ status: "active", taxRate: 0, paymentDate: new Date().toISOString().slice(0, 10) });
    setShowForm(true);
  };

  const openEdit = (r: WHItem) => {
    setEditing(r);
    setForm({
      vendorName: r.vendor_name, certificateNumber: r.certificate_number,
      taxRate: r.tax_rate, baseAmount: r.base_amount,
      paymentDate: r.payment_date?.slice(0, 10),
      certificateDate: r.certificate_date?.slice(0, 10),
      certificateExpiry: r.certificate_expiry?.slice(0, 10),
      status: r.status, taxType: r.tax_type, notes: r.notes,
    });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/withholding-tax/${editing.id}` : `${API}/withholding-tax`;
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
    if (await globalConfirm("למחוק ניכוי מס זה?")) {
      await authFetch(`${API}/withholding-tax/${id}`, { method: "DELETE" });
      load();
    }
  };

  const totalTax = items.reduce((s, i) => s + Number(i.tax_amount || 0), 0);
  const totalBase = items.reduce((s, i) => s + Number(i.base_amount || 0), 0);
  const kpis = [
    { label: "רשומות", value: fmt(items.length), icon: Hash, color: "text-blue-400" },
    { label: "סה\"כ בסיס", value: fmtCurrency(totalBase), icon: DollarSign, color: "text-amber-400" },
    { label: "סה\"כ ניכוי", value: fmtCurrency(totalTax), icon: Percent, color: "text-red-400" },
    { label: "פעילים", value: fmt(items.filter(i => i.status === "active").length), icon: FileText, color: "text-green-400" },
    { label: "פגי תוקף", value: fmt(items.filter(i => i.status === "expired").length), icon: Clock, color: "text-red-400" },
  ];

  const columns = [
    { key: "vendor_name", label: "ספק" },
    { key: "certificate_number", label: "מס' אישור" },
    { key: "tax_rate", label: "שיעור %" },
    { key: "base_amount", label: "בסיס" },
    { key: "tax_amount", label: "ניכוי" },
    { key: "payment_date", label: "תאריך" },
    { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="text-red-400 w-6 h-6" />
            ניכוי מס במקור
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול ניכויי מס במקור ואישורים</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ vendor_name: "ספק", certificate_number: "אישור", tax_rate: "שיעור", base_amount: "בסיס", tax_amount: "ניכוי", status: "סטטוס" }} filename="withholding_tax" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> ניכוי חדש
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי ספק, מס' אישור..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">שגיאה בטעינה</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין ניכויי מס</p>
          <p className="text-sm mt-1">{search || filterStatus !== "all" ? "נסה לשנות את הסינון" : "לחץ על 'ניכוי חדש' כדי להתחיל"}</p>
        </div>
      ) : (<>
        <BulkActions selectedIds={selectedIds} onClear={clear} entityName="items" actions={defaultBulkActions(selectedIds, clear, load, `${API}/withholding-tax`)} />
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
                {pagination.paginate(filtered).map(r => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 w-10"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                    <td className="px-4 py-3 text-foreground font-medium">{r.vendor_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-blue-400">{r.certificate_number || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmt(r.tax_rate)}%</td>
                    <td className="px-4 py-3 text-amber-400">{fmtCurrency(r.base_amount)}</td>
                    <td className="px-4 py-3 text-red-400 font-bold">{fmtCurrency(r.tax_amount)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.payment_date?.slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>{statusMap[r.status]?.label || r.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => { setDetailTab("details"); setViewDetail(r); }} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                        {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.vendor_name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
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
                <h2 className="text-lg font-bold text-foreground">{viewDetail.vendor_name}</h2>
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
                <DetailField label="ספק" value={viewDetail.vendor_name} />
                <DetailField label="מס' אישור" value={viewDetail.certificate_number} />
                <DetailField label="שיעור מס" value={`${fmt(viewDetail.tax_rate)}%`} />
                <DetailField label="סכום בסיס" value={fmtCurrency(viewDetail.base_amount)} />
                <DetailField label="סכום ניכוי" value={fmtCurrency(viewDetail.tax_amount)} />
                <DetailField label="סכום נטו" value={fmtCurrency(viewDetail.net_amount)} />
                <DetailField label="תאריך תשלום" value={viewDetail.payment_date?.slice(0, 10)} />
                <DetailField label="תוקף אישור" value={viewDetail.certificate_expiry?.slice(0, 10)} />
                <DetailField label="סוג מס" value={viewDetail.tax_type} />
                <DetailField label="סטטוס">
                  <Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge>
                </DetailField>
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>
                            ) : detailTab === "related" ? (
                <div className="p-5"><RelatedRecords entityType="withholding-tax" entityId={viewDetail?.id} /></div>
                ) : detailTab === "attachments" ? (
                <div className="p-5"><AttachmentsSection entityType="withholding-tax" entityId={viewDetail?.id} /></div>
                ) : (
                <div className="p-5"><ActivityLog entityType="withholding-tax" entityId={viewDetail?.id} /></div>
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

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת ניכוי" : "ניכוי חדש"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">ספק *</label>
                  <input value={form.vendorName || ""} onChange={e => setForm({ ...form, vendorName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">מס' אישור</label>
                  <input value={form.certificateNumber || ""} onChange={e => setForm({ ...form, certificateNumber: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">שיעור %</label>
                  <input type="number" value={form.taxRate || ""} onChange={e => setForm({ ...form, taxRate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">סכום בסיס</label>
                  <input type="number" value={form.baseAmount || ""} onChange={e => setForm({ ...form, baseAmount: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך תשלום</label>
                  <input type="date" value={form.paymentDate || ""} onChange={e => setForm({ ...form, paymentDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תוקף אישור</label>
                  <input type="date" value={form.certificateExpiry || ""} onChange={e => setForm({ ...form, certificateExpiry: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
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
