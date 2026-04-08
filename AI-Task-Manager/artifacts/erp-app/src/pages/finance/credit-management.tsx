import { useState, useEffect, useMemo } from "react";
import {
  ShieldCheck, Search, Plus, Edit2, Trash2, X, Save, AlertTriangle,
  ArrowUpDown, DollarSign, Hash, Eye, TrendingUp, Ban, ShieldAlert,
  Lock, Unlock, Users, RefreshCw, AlertCircle
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

interface CreditCustomer {
  id: number;
  customer_code: string;
  customer_name: string;
  credit_limit: number;
  total_exposure: number;
  available_credit: number;
  risk_category: string;
  overdue_amount: number;
  overdue_days: number;
  last_payment_date: string;
  payment_terms: string;
  status: string;
  blocked: boolean;
  blocked_reason: string;
  credit_score: number;
  notes: string;
}

const riskMap: Record<string, { label: string; color: string }> = {
  low: { label: "נמוך", color: "bg-green-500/20 text-green-400" },
  medium: { label: "בינוני", color: "bg-amber-500/20 text-amber-400" },
  high: { label: "גבוה", color: "bg-orange-500/20 text-orange-400" },
  critical: { label: "קריטי", color: "bg-red-500/20 text-red-400" },
};

const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  blocked: { label: "חסום", color: "bg-red-500/20 text-red-400" },
  review: { label: "בבדיקה", color: "bg-amber-500/20 text-amber-400" },
  suspended: { label: "מושהה", color: "bg-orange-500/20 text-orange-400" },
  inactive: { label: "לא פעיל", color: "bg-muted/20 text-muted-foreground" },
};

const fmtDate = (v: any) => v ? new Date(v).toLocaleDateString("he-IL") : "\u2014";

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children || <div className="text-sm text-foreground font-medium">{value || "\u2014"}</div>}
    </div>
  );
}

export default function CreditManagementPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<CreditCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRisk, setFilterRisk] = useState("all");
  const [sortField, setSortField] = useState("customer_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CreditCustomer | null>(null);
  const [viewDetail, setViewDetail] = useState<CreditCustomer | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [togglingBlock, setTogglingBlock] = useState<number | null>(null);
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const [detailTab, setDetailTab] = useState("details");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/finance-sap/credit-management`);
      if (res.ok) setItems(safeArray(await res.json()));
      else setError("שגיאה בטעינת ניהול אשראי");
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
      (filterRisk === "all" || i.risk_category === filterRisk) &&
      (!search || [i.customer_code, i.customer_name, i.payment_terms]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [items, search, filterStatus, filterRisk, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ status: "active", riskCategory: "low" });
    setShowForm(true);
  };

  const openEdit = (r: CreditCustomer) => {
    setEditing(r);
    setForm({
      customerCode: r.customer_code, customerName: r.customer_name,
      creditLimit: r.credit_limit, riskCategory: r.risk_category,
      paymentTerms: r.payment_terms, status: r.status,
      creditScore: r.credit_score, notes: r.notes,
    });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/finance-sap/credit-management/${editing.id}` : `${API}/finance-sap/credit-management`;
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
    if (await globalConfirm("למחוק רשומת אשראי זו?")) {
      await authFetch(`${API}/finance-sap/credit-management/${id}`, { method: "DELETE" });
      load();
    }
  };

  const toggleBlock = async (customer: CreditCustomer) => {
    const action = customer.blocked ? "לבטל חסימה" : "לחסום";
    if (await globalConfirm(`${action} את הלקוח '${customer.customer_name}'?`)) {
      setTogglingBlock(customer.id);
      try {
        await authFetch(`${API}/finance-sap/credit-management/${customer.id}/block`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blocked: !customer.blocked }),
        });
        load();
      } catch {}
      setTogglingBlock(null);
    }
  };

  const totalCredit = items.reduce((s, i) => s + Number(i.credit_limit || 0), 0);
  const totalExposure = items.reduce((s, i) => s + Number(i.total_exposure || 0), 0);
  const totalAvailable = items.reduce((s, i) => s + Number(i.available_credit || 0), 0);
  const blockedCount = items.filter(i => i.blocked || i.status === "blocked").length;

  const kpis = [
    { label: "אשראי כולל", value: fmtCurrency(totalCredit), icon: DollarSign, color: "text-blue-400" },
    { label: "חשיפה כוללת", value: fmtCurrency(totalExposure), icon: ShieldAlert, color: "text-amber-400" },
    { label: "אשראי זמין", value: fmtCurrency(totalAvailable), icon: TrendingUp, color: "text-green-400" },
    { label: "לקוחות חסומים", value: fmt(blockedCount), icon: Ban, color: blockedCount > 0 ? "text-red-400" : "text-muted-foreground" },
  ];

  const columns = [
    { key: "customer_name", label: "לקוח" },
    { key: "credit_limit", label: "מסגרת אשראי" },
    { key: "total_exposure", label: "חשיפה" },
    { key: "available_credit", label: "זמין" },
    { key: "risk_category", label: "דירוג סיכון" },
    { key: "overdue_amount", label: "סכום באיחור" },
    { key: "status", label: "סטטוס" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="text-cyan-400 w-6 h-6" />
            ניהול אשראי לקוחות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול מסגרות אשראי, חשיפות וסיכונים</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown
            data={filtered}
            headers={{ customer_name: "לקוח", credit_limit: "מסגרת", total_exposure: "חשיפה", available_credit: "זמין", risk_category: "סיכון", overdue_amount: "באיחור", status: "סטטוס" }}
            filename="credit_management"
          />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> לקוח חדש
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי לקוח, קוד..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל רמות הסיכון</option>
          {Object.entries(riskMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
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
          <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין רשומות אשראי</p>
          <p className="text-sm mt-1">{search || filterStatus !== "all" || filterRisk !== "all" ? "נסה לשנות את הסינון" : "לחץ על 'לקוח חדש' כדי להתחיל"}</p>
        </div>
      ) : (<>
        <BulkActions selectedIds={selectedIds} onClear={clear} entityName="items" actions={defaultBulkActions(selectedIds, clear, load, `${API}/finance-sap/credit-management`)} />
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
                  const exposurePct = r.credit_limit > 0 ? (r.total_exposure / r.credit_limit) * 100 : 0;
                  const isOverLimit = exposurePct > 90;
                  return (
                    <tr key={r.id} className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${r.blocked ? "bg-red-500/5" : ""}`}>
                      <td className="px-4 py-3 w-10"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {r.blocked && <Lock className="w-3.5 h-3.5 text-red-400" />}
                          <div>
                            <div className="text-foreground font-medium">{r.customer_name}</div>
                            <div className="text-xs text-muted-foreground font-mono">{r.customer_code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-amber-400">{fmtCurrency(r.credit_limit)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${isOverLimit ? "text-red-400" : "text-foreground"}`}>{fmtCurrency(r.total_exposure)}</span>
                          {isOverLimit && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                        </div>
                        <div className="w-full h-1.5 bg-muted/30 rounded-full mt-1 max-w-[100px]">
                          <div
                            className={`h-full rounded-full ${exposurePct > 90 ? "bg-red-500" : exposurePct > 70 ? "bg-amber-500" : "bg-green-500"}`}
                            style={{ width: `${Math.min(exposurePct, 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-green-400">{fmtCurrency(r.available_credit)}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] ${riskMap[r.risk_category]?.color || "bg-muted/20 text-muted-foreground"}`}>
                          {riskMap[r.risk_category]?.label || r.risk_category}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {Number(r.overdue_amount || 0) > 0 ? (
                          <div>
                            <span className="text-red-400 font-bold">{fmtCurrency(r.overdue_amount)}</span>
                            {r.overdue_days > 0 && <div className="text-[10px] text-red-400/70">{r.overdue_days} ימים</div>}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">\u2014</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>{statusMap[r.status]?.label || r.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => { setDetailTab("details"); setViewDetail(r); }} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                          <button
                            onClick={() => toggleBlock(r)}
                            disabled={togglingBlock === r.id}
                            className="p-1.5 hover:bg-muted rounded-lg"
                            title={r.blocked ? "בטל חסימה" : "חסום"}
                          >
                            {r.blocked
                              ? <Unlock className="w-3.5 h-3.5 text-green-400" />
                              : <Lock className="w-3.5 h-3.5 text-orange-400" />
                            }
                          </button>
                          {isSuperAdmin && <button onClick={async () => { if (await globalConfirm(`למחוק את '${r.customer_name}'?`)) remove(r.id); }} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-foreground">{viewDetail.customer_name}</h2>
                  {viewDetail.blocked && <Badge className="bg-red-500/20 text-red-400 text-[10px]">חסום</Badge>}
                </div>
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
                <div className="p-5">
                  {/* Exposure Bar */}
                  <div className="mb-5 p-4 bg-muted/10 rounded-xl border border-border/30">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-muted-foreground">ניצול אשראי</span>
                      <span className="text-sm font-bold text-foreground">
                        {viewDetail.credit_limit > 0 ? Math.round((viewDetail.total_exposure / viewDetail.credit_limit) * 100) : 0}%
                      </span>
                    </div>
                    <div className="w-full h-3 bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          viewDetail.credit_limit > 0 && (viewDetail.total_exposure / viewDetail.credit_limit) > 0.9
                            ? "bg-red-500"
                            : (viewDetail.total_exposure / viewDetail.credit_limit) > 0.7
                              ? "bg-amber-500"
                              : "bg-green-500"
                        }`}
                        style={{ width: `${Math.min(viewDetail.credit_limit > 0 ? (viewDetail.total_exposure / viewDetail.credit_limit) * 100 : 0, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                      <span>חשיפה: {fmtCurrency(viewDetail.total_exposure)}</span>
                      <span>מסגרת: {fmtCurrency(viewDetail.credit_limit)}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <DetailField label="קוד לקוח" value={viewDetail.customer_code} />
                    <DetailField label="שם לקוח" value={viewDetail.customer_name} />
                    <DetailField label="מסגרת אשראי" value={fmtCurrency(viewDetail.credit_limit)} />
                    <DetailField label="חשיפה כוללת" value={fmtCurrency(viewDetail.total_exposure)} />
                    <DetailField label="אשראי זמין" value={fmtCurrency(viewDetail.available_credit)} />
                    <DetailField label="דירוג סיכון">
                      <Badge className={riskMap[viewDetail.risk_category]?.color}>{riskMap[viewDetail.risk_category]?.label || viewDetail.risk_category}</Badge>
                    </DetailField>
                    <DetailField label="סכום באיחור">
                      <span className={Number(viewDetail.overdue_amount || 0) > 0 ? "text-red-400 font-bold text-sm" : "text-sm text-muted-foreground"}>
                        {fmtCurrency(viewDetail.overdue_amount)}
                      </span>
                    </DetailField>
                    <DetailField label="ימי איחור" value={viewDetail.overdue_days > 0 ? `${viewDetail.overdue_days} ימים` : "\u2014"} />
                    <DetailField label="תשלום אחרון" value={fmtDate(viewDetail.last_payment_date)} />
                    <DetailField label="תנאי תשלום" value={viewDetail.payment_terms} />
                    <DetailField label="ציון אשראי" value={viewDetail.credit_score ? String(viewDetail.credit_score) : "\u2014"} />
                    <DetailField label="סטטוס">
                      <Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label || viewDetail.status}</Badge>
                    </DetailField>
                    {viewDetail.blocked && viewDetail.blocked_reason && (
                      <div className="col-span-2">
                        <DetailField label="סיבת חסימה" value={viewDetail.blocked_reason} />
                      </div>
                    )}
                    <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
                  </div>
                </div>
              ) : detailTab === "related" ? (
                <div className="p-5"><RelatedRecords entityType="credit-management" entityId={viewDetail?.id} /></div>
              ) : detailTab === "attachments" ? (
                <div className="p-5"><AttachmentsSection entityType="credit-management" entityId={viewDetail?.id} /></div>
              ) : (
                <div className="p-5"><ActivityLog entityType="credit-management" entityId={viewDetail?.id} /></div>
              )}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button
                  onClick={() => toggleBlock(viewDetail)}
                  className={`px-4 py-2 rounded-lg text-sm ${viewDetail.blocked ? "bg-green-500/20 text-green-400 hover:bg-green-500/30" : "bg-red-500/20 text-red-400 hover:bg-red-500/30"}`}
                >
                  {viewDetail.blocked ? <><Unlock className="w-3.5 h-3.5 inline ml-1" /> בטל חסימה</> : <><Lock className="w-3.5 h-3.5 inline ml-1" /> חסום</>}
                </button>
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת אשראי לקוח" : "לקוח חדש"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">קוד לקוח *</label>
                  <input value={form.customerCode || ""} onChange={e => setForm({ ...form, customerCode: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם לקוח *</label>
                  <input value={form.customerName || ""} onChange={e => setForm({ ...form, customerName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">מסגרת אשראי *</label>
                  <input type="number" value={form.creditLimit || ""} onChange={e => setForm({ ...form, creditLimit: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">דירוג סיכון</label>
                  <select value={form.riskCategory || "low"} onChange={e => setForm({ ...form, riskCategory: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(riskMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תנאי תשלום</label>
                  <select value={form.paymentTerms || ""} onChange={e => setForm({ ...form, paymentTerms: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    <option value="">בחר...</option>
                    <option value="net_30">שוטף + 30</option>
                    <option value="net_60">שוטף + 60</option>
                    <option value="net_90">שוטף + 90</option>
                    <option value="net_120">שוטף + 120</option>
                    <option value="cod">מזומן</option>
                    <option value="prepaid">מראש</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">ציון אשראי</label>
                  <input type="number" min="0" max="100" value={form.creditScore || ""} onChange={e => setForm({ ...form, creditScore: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="0-100" />
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
