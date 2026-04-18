import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import {
  DollarSign, TrendingUp, Calculator, Layers, Target, Plus, Pencil, Trash2,
  ArrowUpDown, Search, Percent, Tag, CheckCircle, Clock, Eye, X, AlertTriangle, Package
} from "lucide-react";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";
import ActivityLog from "@/components/activity-log";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  inactive: { label: "לא פעיל", color: "bg-muted/20 text-muted-foreground" },
  draft: { label: "טיוטה", color: "bg-blue-500/20 text-blue-400" },
  expired: { label: "פג תוקף", color: "bg-red-500/20 text-red-400" },
};
const CATEGORIES = ["מתכת", "ברזל", "אלומיניום", "זכוכית", "נירוסטה", "פלדה", "אביזרים", "עבודה", "התקנה", "אחר"];
const SEGMENTS = ["פרטי", "עסקי", "מוסדי", "אדריכלים", "קבלנים", "סיטונאי", "VIP"];

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

const emptyForm: any = { status: "active", basePrice: 0, discountPercent: 0, minQuantity: 1, priority: 0 };

export default function DynamicPricingPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const validation = useFormValidation({ ruleName: { required: true }, basePrice: { min: 0 } });
  const [detailTab, setDetailTab] = useState("details");

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [r1, r2] = await Promise.all([authFetch(`${API}/crm-pricing-rules`), authFetch(`${API}/crm-pricing-rules/stats`)]);
      if (r1.ok) setItems(safeArray(await r1.json()));
      if (r2.ok) setStats((await r2.json()) || {});
    } catch (e: any) { setError(e.message || "שגיאה"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    const url = editItem ? `${API}/crm-pricing-rules/${editItem.id}` : `${API}/crm-pricing-rules`;
    try {
      await authFetch(url, { method: editItem ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); setEditItem(null); setForm(emptyForm); load();
    } catch {}
  };

  const handleDelete = async (id: number) => {
    const ok = await globalConfirm({ title: "מחיקת כלל", message: "למחוק כלל תמחור?", confirmText: "מחק", variant: "destructive" });
    if (!ok) return;
    try { await authFetch(`${API}/crm-pricing-rules/${id}`, { method: "DELETE" }); load(); } catch {}
  };

  const openEdit = (r: any) => {
    setEditItem(r);
    setForm({ ruleName: r.rule_name, productCategory: r.product_category, customerSegment: r.customer_segment, basePrice: r.base_price, discountPercent: r.discount_percent, minQuantity: r.min_quantity, maxQuantity: r.max_quantity, validFrom: r.valid_from?.slice(0,10), validTo: r.valid_to?.slice(0,10), status: r.status, priority: r.priority, conditions: r.conditions, approvedBy: r.approved_by, notes: r.notes });
    setShowForm(true);
  };

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(r => {
      const s = `${r.rule_name} ${r.rule_number} ${r.product_category} ${r.customer_segment}`.toLowerCase();
      return (!search || s.includes(search.toLowerCase())) && (filterStatus === "all" || r.status === filterStatus) && (filterCat === "all" || r.product_category === filterCat);
    });
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb)); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterCat, sortField, sortDir]);

  const kpis = [
    { label: "סה\"כ כללים", value: fmt(stats.total || items.length), icon: Layers, color: "text-blue-400" },
    { label: "פעילים", value: fmt(stats.active_count || 0), icon: CheckCircle, color: "text-green-400" },
    { label: "בתוקף כעת", value: fmt(stats.currently_valid || 0), icon: Target, color: "text-cyan-400" },
    { label: "ממתין לאישור", value: fmt(stats.pending_approval || 0), icon: Clock, color: "text-amber-400" },
    { label: "הנחה ממוצעת", value: `${Number(stats.avg_discount || 0).toFixed(1)}%`, icon: Percent, color: "text-purple-400" },
    { label: "קטגוריות", value: fmt(stats.categories || 0), icon: Package, color: "text-orange-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Calculator className="text-purple-400 w-6 h-6" />תמחור דינמי</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול כללי תמחור, הנחות וסגמנטים</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setEditItem(null); setForm(emptyForm); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm"><Plus className="w-4 h-4" /> כלל חדש</button>
          <ExportDropdown data={filtered} headers={{ rule_number: "מספר", rule_name: "שם", product_category: "קטגוריה", base_price: "מחיר בסיס", discount_percent: "הנחה%", final_price: "מחיר סופי", status: "סטטוס" }} filename="pricing_rules" />
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
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש כלל תמחור..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסטטוסים</option>{Object.entries(STATUS_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הקטגוריות</option>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
        defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/crm-pricing-rules/${id}`, { method: "DELETE" }))); load(); }),
        defaultBulkActions.export(async (ids) => { const rows = filtered.filter(r => ids.has(r.id)); const csv = ["שם,קטגוריה,מחיר בסיס,הנחה%,מחיר סופי", ...rows.map(r => `${r.rule_name},${r.product_category},${r.base_price},${r.discount_percent},${r.final_price}`)].join("\n"); const b = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "pricing_export.csv"; a.click(); }),
      ]} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Calculator className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין כללי תמחור</p></div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            <th className="px-2 py-3 w-10"><BulkCheckbox items={filtered} selectedIds={selectedIds} onToggleAll={toggleAll} mode="all" /></th>
            {[["rule_number","מספר"],["rule_name","שם כלל"],["product_category","קטגוריה"],["customer_segment","סגמנט"],["base_price","מחיר בסיס"],["discount_percent","הנחה%"],["final_price","מחיר סופי"],["status","סטטוס"]].map(([f,l])=>(
              <th key={f} onClick={()=>toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r=>(
              <tr key={r.id} className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${isSelected(r.id) ? "bg-primary/5" : ""}`}>
                <td className="px-2 py-3"><BulkCheckbox id={r.id} selectedIds={selectedIds} onToggle={toggle} mode="single" /></td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.rule_number}</td>
                <td className="px-4 py-3 font-medium text-foreground">{r.rule_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.product_category||"—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.customer_segment||"—"}</td>
                <td className="px-4 py-3">{fmtC(r.base_price||0)}</td>
                <td className="px-4 py-3"><span className={Number(r.discount_percent)>15?"text-red-400 font-bold":"text-green-400"}>{Number(r.discount_percent||0).toFixed(1)}%</span></td>
                <td className="px-4 py-3 font-medium">{fmtC(r.final_price||0)}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${STATUS_MAP[r.status]?.color||""}`}>{STATUS_MAP[r.status]?.label||r.status}</Badge></td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={()=>setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={()=>openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Pencil className="w-3.5 h-3.5 text-blue-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.rule_name || r.id}'? פעולה זו אינה ניתנת לביטול.`))handleDelete(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                </div></td>
              </tr>
            ))}
          </tbody></table>
        </div></div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={()=>setViewDetail(null)}>
            <motion.div initial={{scale:0.95}} animate={{scale:1}} exit={{scale:0.95}} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e=>e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{viewDetail.rule_name}</h2><button onClick={()=>{setViewDetail(null);setDetailTab("details");}} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <div className="p-5 grid grid-cols-2 gap-4">
                  <DetailField label="מספר" value={viewDetail.rule_number} />
                  <DetailField label="שם" value={viewDetail.rule_name} />
                  <DetailField label="קטגוריה" value={viewDetail.product_category} />
                  <DetailField label="סגמנט" value={viewDetail.customer_segment} />
                  <DetailField label="מחיר בסיס" value={fmtC(viewDetail.base_price||0)} />
                  <DetailField label="הנחה" value={`${Number(viewDetail.discount_percent||0).toFixed(1)}%`} />
                  <DetailField label="מחיר סופי" value={fmtC(viewDetail.final_price||0)} />
                  <DetailField label="סטטוס"><Badge className={STATUS_MAP[viewDetail.status]?.color}>{STATUS_MAP[viewDetail.status]?.label}</Badge></DetailField>
                  <DetailField label="תוקף מ-" value={viewDetail.valid_from?.slice(0,10)} />
                  <DetailField label="תוקף עד" value={viewDetail.valid_to?.slice(0,10)||"ללא הגבלה"} />
                  <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
                </div>
              )}
              {detailTab === "related" && (
                <div className="p-5"><RelatedRecords tabs={[{key:"products",label:"מוצרים",endpoint:`${API}/crm-pricing-rules/${viewDetail.id}/products`,columns:[{key:"name",label:"שם"},{key:"category",label:"קטגוריה"},{key:"price",label:"מחיר"}]},{key:"rules",label:"כללים קשורים",endpoint:`${API}/crm-pricing-rules/${viewDetail.id}/related-rules`,columns:[{key:"rule_name",label:"שם כלל"},{key:"discount_percent",label:"הנחה%"},{key:"status",label:"סטטוס"}]}]} /></div>
              )}
              {detailTab === "docs" && (
                <div className="p-5"><AttachmentsSection entityType="pricing-rule" entityId={viewDetail.id} /></div>
              )}
              {detailTab === "history" && (
                <div className="p-5"><ActivityLog entityType="pricing-rule" entityId={viewDetail.id} /></div>
              )}
              <div className="p-5 border-t border-border flex justify-end"><button onClick={()=>{setViewDetail(null);setDetailTab("details");}} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={()=>{setShowForm(false);setEditItem(null);}}>
            <motion.div initial={{scale:0.95}} animate={{scale:1}} exit={{scale:0.95}} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e=>e.stopPropagation()}>
              <div className="p-5 border-b border-border"><h2 className="text-lg font-bold text-foreground">{editItem?"עריכת כלל":"כלל תמחור חדש"}</h2></div>
              <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="col-span-2"><label className="text-xs text-muted-foreground">שם <RequiredMark /></label><input className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.ruleName||""} onChange={e=>setForm({...form,ruleName:e.target.value})} /><FormFieldError error={validation.errors.ruleName} /></div>
                <div><label className="text-xs text-muted-foreground">סטטוס</label><select className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{Object.entries(STATUS_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="text-xs text-muted-foreground">קטגוריה</label><select className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.productCategory||""} onChange={e=>setForm({...form,productCategory:e.target.value})}><option value="">בחר</option>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                <div><label className="text-xs text-muted-foreground">סגמנט</label><select className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.customerSegment||""} onChange={e=>setForm({...form,customerSegment:e.target.value})}><option value="">בחר</option>{SEGMENTS.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
                <div><label className="text-xs text-muted-foreground">מחיר בסיס (₪)</label><input type="number" className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.basePrice||0} onChange={e=>setForm({...form,basePrice:Number(e.target.value)})} /></div>
                <div><label className="text-xs text-muted-foreground">הנחה (%)</label><input type="number" step="0.5" className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.discountPercent||0} onChange={e=>setForm({...form,discountPercent:Number(e.target.value)})} /></div>
                <div><label className="text-xs text-muted-foreground">תוקף מ-</label><input type="date" className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.validFrom||""} onChange={e=>setForm({...form,validFrom:e.target.value})} /></div>
                <div><label className="text-xs text-muted-foreground">תוקף עד</label><input type="date" className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.validTo||""} onChange={e=>setForm({...form,validTo:e.target.value})} /></div>
              </div>
              {form.basePrice > 0 && <div className="mx-5 mb-2 bg-muted/30 rounded-lg p-3 text-center"><span className="text-sm text-muted-foreground">מחיר סופי: </span><span className="text-lg font-bold text-green-400">{fmtC(form.basePrice*(1-(form.discountPercent||0)/100))}</span></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={()=>{setShowForm(false);setEditItem(null);}} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={handleSave} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">שמירה</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
