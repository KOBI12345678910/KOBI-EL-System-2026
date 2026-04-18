import { useState, useMemo, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import {
  FileText, AlertTriangle, Calendar, DollarSign, Plus, Edit, Trash2, Search,
  CheckCircle, XCircle, Clock, ArrowUpDown, Loader2, X, Eye, RefreshCw,
  Shield, Bell, TrendingUp, Building2, RotateCcw, Timer, Zap, Archive
} from "lucide-react";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const getHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}` });
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("he-IL") : "—";

type Contract = {
  id: number;
  contractNumber: string;
  customer: string;
  type: "service" | "maintenance" | "subscription";
  title: string;
  startDate: string;
  endDate: string;
  value: number;
  monthlyValue: number;
  autoRenew: boolean;
  status: "active" | "expiring" | "expired" | "draft" | "cancelled" | "renewed";
  contactPerson: string;
  notes: string;
  createdAt: string;
};

const TYPE_MAP: Record<string, { label: string; color: string }> = {
  service: { label: "שירות", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  maintenance: { label: "תחזוקה", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  subscription: { label: "מנוי", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
};

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: CheckCircle },
  expiring: { label: "פג בקרוב", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: Timer },
  expired: { label: "פג תוקף", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: XCircle },
  draft: { label: "טיוטה", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: FileText },
  cancelled: { label: "בוטל", color: "bg-muted/20 text-muted-foreground border-gray-500/30", icon: XCircle },
  renewed: { label: "חודש", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: RefreshCw },
};

const today = new Date().toISOString().slice(0, 10);
const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

const INITIAL_DATA: Contract[] = [
  { id: 1, contractNumber: "CTR-2025-001", customer: "אבקה בע\"מ", type: "service", title: "שירות תמיכה טכנית שנתי", startDate: "2025-01-01", endDate: "2026-12-31", value: 120000, monthlyValue: 5000, autoRenew: true, status: "active", contactPerson: "רוני כהן", notes: "", createdAt: "2025-01-01" },
  { id: 2, contractNumber: "CTR-2025-002", customer: "מגדל ביטוח", type: "maintenance", title: "חוזה תחזוקת מערכות", startDate: "2025-03-01", endDate: "2026-02-28", value: 84000, monthlyValue: 7000, autoRenew: true, status: "expired", contactPerson: "שולה לוי", notes: "בהמתנה לחידוש", createdAt: "2025-03-01" },
  { id: 3, contractNumber: "CTR-2025-003", customer: "חברת גבע", type: "subscription", title: "מנוי פלטפורמה פרימיום", startDate: "2025-06-01", endDate: "2026-05-31", value: 36000, monthlyValue: 3000, autoRenew: false, status: "active", contactPerson: "משה אדרי", notes: "", createdAt: "2025-06-01" },
  { id: 4, contractNumber: "CTR-2025-004", customer: "דלתא סיסטמס", type: "service", title: "שירות ייעוץ ואינטגרציה", startDate: "2025-04-15", endDate: "2026-04-14", value: 200000, monthlyValue: 16667, autoRenew: true, status: "expiring", contactPerson: "ענת ברון", notes: "יש לחדש תוך 30 יום", createdAt: "2025-04-15" },
  { id: 5, contractNumber: "CTR-2025-005", customer: "קנדי בע\"מ", type: "maintenance", title: "תחזוקת חומרה ותוכנה", startDate: "2025-07-01", endDate: "2026-06-30", value: 60000, monthlyValue: 5000, autoRenew: true, status: "active", contactPerson: "אורי גפן", notes: "", createdAt: "2025-07-01" },
  { id: 6, contractNumber: "CTR-2025-006", customer: "ספרינט קום", type: "subscription", title: "מנוי שירותי ענן", startDate: "2025-09-01", endDate: "2026-04-01", value: 28000, monthlyValue: 4000, autoRenew: false, status: "expiring", contactPerson: "יעל שמש", notes: "לקוח שוקל שדרוג", createdAt: "2025-09-01" },
  { id: 7, contractNumber: "CTR-2024-010", customer: "בזק בינלאומי", type: "service", title: "חוזה תמיכה ישן", startDate: "2024-01-01", endDate: "2025-12-31", value: 150000, monthlyValue: 6250, autoRenew: false, status: "expired", contactPerson: "גדי ארד", notes: "חוזה לא חודש", createdAt: "2024-01-01" },
  { id: 8, contractNumber: "CTR-2026-001", customer: "סלקום", type: "service", title: "חוזה שירות חדש 2026", startDate: "2026-04-01", endDate: "2027-03-31", value: 180000, monthlyValue: 15000, autoRenew: true, status: "draft", contactPerson: "נדב לב", notes: "ממתין לחתימה", createdAt: "2026-03-20" },
  { id: 9, contractNumber: "CTR-2025-007", customer: "אלביט", type: "maintenance", title: "תחזוקה שנתית", startDate: "2025-02-01", endDate: "2026-01-31", value: 96000, monthlyValue: 8000, autoRenew: true, status: "renewed", contactPerson: "תומר אשר", notes: "חודש אוטומטית", createdAt: "2025-02-01" },
];

export default function ContractManagement() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<Contract[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [sortField, setSortField] = useState<string>("endDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [form, setForm] = useState<any>({});
  const [tableLoading, setTableLoading] = useState(true);
  const [viewDetail, setViewDetail] = useState<Contract | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const validation = useFormValidation({ contractNumber: { required: true }, customer: { required: true }, title: { required: true }, startDate: { required: true }, endDate: { required: true } });

  const load = useCallback(() => {
    setTableLoading(true);
    authFetch(`${API}/crm-sap/contracts`, { headers: getHeaders() })
      .then(r => r.json())
      .then(d => setItems(Array.isArray(d) ? d : INITIAL_DATA))
      .catch(() => setItems(INITIAL_DATA))
      .finally(() => setTableLoading(false));
  }, []);
  useEffect(load, [load]);

  const stats = useMemo(() => ({
    activeContracts: items.filter(i => i.status === "active").length,
    totalValue: items.filter(i => ["active", "expiring"].includes(i.status)).reduce((s, i) => s + i.value, 0),
    expiringSoon: items.filter(i => i.status === "expiring").length,
    expired: items.filter(i => i.status === "expired").length,
    monthlyRevenue: items.filter(i => ["active", "expiring"].includes(i.status)).reduce((s, i) => s + i.monthlyValue, 0),
    autoRenewCount: items.filter(i => i.autoRenew && ["active", "expiring"].includes(i.status)).length,
  }), [items]);

  const alerts = useMemo(() => {
    return items
      .filter(i => i.status === "expiring" || i.status === "expired")
      .sort((a, b) => a.endDate.localeCompare(b.endDate))
      .map(i => ({
        ...i,
        daysLeft: Math.ceil((new Date(i.endDate).getTime() - Date.now()) / 86400000),
      }));
  }, [items]);

  const filtered = useMemo(() => {
    let f = items.filter(r => {
      const s = `${r.contractNumber} ${r.customer} ${r.title} ${r.contactPerson}`.toLowerCase();
      if (search && !s.includes(search.toLowerCase())) return false;
      if (filterType && r.type !== filterType) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      return true;
    });
    f.sort((a: any, b: any) => {
      const va = a[sortField], vb = b[sortField];
      const cmp = typeof va === "number" ? va - vb : String(va || "").localeCompare(String(vb || ""), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return f;
  }, [items, search, filterType, filterStatus, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ contractNumber: `CTR-2026-${String(items.length + 1).padStart(3, "0")}`, customer: "", type: "service", title: "", startDate: today, endDate: "", value: 0, monthlyValue: 0, autoRenew: true, status: "draft", contactPerson: "", notes: "" });
    validation.reset();
    setShowForm(true);
  };
  const openEdit = (r: Contract) => {
    setEditing(r);
    setForm({ contractNumber: r.contractNumber, customer: r.customer, type: r.type, title: r.title, startDate: r.startDate, endDate: r.endDate, value: r.value, monthlyValue: r.monthlyValue, autoRenew: r.autoRenew, status: r.status, contactPerson: r.contactPerson, notes: r.notes });
    validation.reset();
    setShowForm(true);
  };

  const save = async () => {
    if (!validation.validateAll(form)) return;
    try {
      const url = editing ? `${API}/crm-sap/contracts/${editing.id}` : `${API}/crm-sap/contracts`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: getHeaders(), body: JSON.stringify(form) });
      setShowForm(false);
      load();
    } catch {
      if (editing) {
        setItems(prev => prev.map(i => i.id === editing.id ? { ...i, ...form } : i));
      } else {
        setItems(prev => [...prev, { id: Date.now(), ...form, createdAt: today }]);
      }
      setShowForm(false);
    }
  };

  const remove = async (id: number) => {
    if (!(await globalConfirm("האם למחוק את החוזה?"))) return;
    try { await authFetch(`${API}/crm-sap/contracts/${id}`, { method: "DELETE", headers: getHeaders() }); } catch {}
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };
  const SortIcon = ({ field }: { field: string }) => (
    <ArrowUpDown className={`inline w-3 h-3 mr-1 cursor-pointer ${sortField === field ? "text-primary" : "text-muted-foreground"}`} onClick={() => toggleSort(field)} />
  );

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="w-7 h-7 text-primary" /> ניהול חוזים</h1>
          <p className="text-muted-foreground mt-1">מעקב חוזי שירות, תחזוקה ומנויים</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAlerts(!showAlerts)} className="relative flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-muted/30 transition text-sm">
            <Bell className="w-4 h-4" /> התראות
            {alerts.length > 0 && <span className="absolute -top-1 -left-1 w-5 h-5 bg-red-500 text-foreground text-xs rounded-full flex items-center justify-center">{alerts.length}</span>}
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition">
            <Plus className="w-4 h-4" /> חוזה חדש
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: "חוזים פעילים", value: fmt(stats.activeContracts), icon: CheckCircle, color: "text-green-400", bg: "bg-green-500/10" },
          { label: "שווי כולל", value: fmtC(stats.totalValue), icon: DollarSign, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "הכנסה חודשית", value: fmtC(stats.monthlyRevenue), icon: TrendingUp, color: "text-cyan-400", bg: "bg-cyan-500/10" },
          { label: "פג בקרוב", value: fmt(stats.expiringSoon), icon: Timer, color: stats.expiringSoon > 0 ? "text-amber-400" : "text-green-400", bg: stats.expiringSoon > 0 ? "bg-amber-500/10" : "bg-green-500/10" },
          { label: "פג תוקף", value: fmt(stats.expired), icon: XCircle, color: stats.expired > 0 ? "text-red-400" : "text-green-400", bg: stats.expired > 0 ? "bg-red-500/10" : "bg-green-500/10" },
          { label: "חידוש אוטומטי", value: fmt(stats.autoRenewCount), icon: RefreshCw, color: "text-purple-400", bg: "bg-purple-500/10" },
        ].map((c, i) => (
          <div key={i} className={`rounded-xl border border-border/50 p-4 ${c.bg}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{c.label}</span>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </div>
            <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Alerts Panel */}
      {showAlerts && alerts.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold flex items-center gap-2 text-amber-400"><AlertTriangle className="w-5 h-5" /> התראות חוזים ({alerts.length})</h3>
            <button onClick={() => setShowAlerts(false)} className="p-1 rounded hover:bg-muted/30"><X className="w-4 h-4" /></button>
          </div>
          <div className="space-y-2">
            {alerts.map(a => (
              <div key={a.id} className={`flex items-center justify-between p-3 rounded-lg border ${a.status === "expired" ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                <div className="flex items-center gap-3">
                  {a.status === "expired" ? <XCircle className="w-5 h-5 text-red-400" /> : <Timer className="w-5 h-5 text-amber-400" />}
                  <div>
                    <div className="font-medium text-sm">{a.contractNumber} — {a.customer}</div>
                    <div className="text-xs text-muted-foreground">{a.title}</div>
                  </div>
                </div>
                <div className="text-left">
                  <div className={`text-sm font-bold ${a.daysLeft <= 0 ? "text-red-400" : "text-amber-400"}`}>
                    {a.daysLeft <= 0 ? `פג לפני ${Math.abs(a.daysLeft)} ימים` : `עוד ${a.daysLeft} ימים`}
                  </div>
                  <div className="text-xs text-muted-foreground">סיום: {fmtDate(a.endDate)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש מספר חוזה, לקוח, כותרת..." className="w-full pr-10 pl-4 py-2 rounded-lg border border-border bg-card text-sm" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-sm">
          <option value="">כל הסוגים</option>
          {Object.entries(TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-sm">
          <option value="">כל הסטטוסים</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {(search || filterType || filterStatus) && (
          <button onClick={() => { setSearch(""); setFilterType(""); setFilterStatus(""); }} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
            <X className="w-3 h-3" /> נקה
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="p-3 text-right font-medium"><BulkCheckbox checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered.map(r => r.id))} /></th>
                <th className="p-3 text-right font-medium cursor-pointer" onClick={() => toggleSort("contractNumber")}>מספר חוזה <SortIcon field="contractNumber" /></th>
                <th className="p-3 text-right font-medium cursor-pointer" onClick={() => toggleSort("customer")}>לקוח <SortIcon field="customer" /></th>
                <th className="p-3 text-center font-medium">סוג</th>
                <th className="p-3 text-right font-medium">כותרת</th>
                <th className="p-3 text-center font-medium cursor-pointer" onClick={() => toggleSort("startDate")}>התחלה <SortIcon field="startDate" /></th>
                <th className="p-3 text-center font-medium cursor-pointer" onClick={() => toggleSort("endDate")}>סיום <SortIcon field="endDate" /></th>
                <th className="p-3 text-right font-medium cursor-pointer" onClick={() => toggleSort("value")}>שווי <SortIcon field="value" /></th>
                <th className="p-3 text-center font-medium">חידוש אוטו'</th>
                <th className="p-3 text-center font-medium">סטטוס</th>
                <th className="p-3 text-center font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <tr><td colSpan={11} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">לא נמצאו חוזים</td></tr>
              ) : filtered.map(r => {
                const st = STATUS_MAP[r.status];
                const StIcon = st?.icon || FileText;
                return (
                  <tr key={r.id} className={`border-b border-border/50 hover:bg-muted/20 transition ${r.status === "expired" ? "bg-red-500/5" : r.status === "expiring" ? "bg-amber-500/5" : ""}`}>
                    <td className="p-3"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                    <td className="p-3 font-mono text-xs font-medium">{r.contractNumber}</td>
                    <td className="p-3 font-medium"><span className="flex items-center gap-1"><Building2 className="w-3 h-3 text-muted-foreground" />{r.customer}</span></td>
                    <td className="p-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs border ${TYPE_MAP[r.type]?.color}`}>{TYPE_MAP[r.type]?.label}</span></td>
                    <td className="p-3 text-xs max-w-[200px] truncate">{r.title}</td>
                    <td className="p-3 text-center text-xs">{fmtDate(r.startDate)}</td>
                    <td className="p-3 text-center text-xs">{fmtDate(r.endDate)}</td>
                    <td className="p-3 font-mono text-xs">{fmtC(r.value)}</td>
                    <td className="p-3 text-center">
                      {r.autoRenew ? <RefreshCw className="w-4 h-4 text-green-400 mx-auto" /> : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${st?.color}`}>
                        <StIcon className="w-3 h-3" />{st?.label}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setViewDetail(r)} className="p-1.5 rounded-lg hover:bg-muted/30" title="צפייה"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-muted/30" title="עריכה"><Edit className="w-4 h-4" /></button>
                        <button onClick={() => remove(r.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400" title="מחיקה"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
          <span>מציג {filtered.length} מתוך {items.length} חוזים</span>
          {selectedIds.size > 0 && <span className="text-primary font-medium">{selectedIds.size} נבחרו</span>}
        </div>
      </div>

      {/* Detail Modal */}
      {viewDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setViewDetail(null)}>
          <div className="bg-card rounded-2xl border border-border w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2"><FileText className="w-5 h-5 text-primary" />{viewDetail.contractNumber}</h2>
              <button onClick={() => setViewDetail(null)} className="p-1 rounded hover:bg-muted/30"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">לקוח:</span> {viewDetail.customer}</div>
              <div><span className="text-muted-foreground">סוג:</span> {TYPE_MAP[viewDetail.type]?.label}</div>
              <div className="col-span-2"><span className="text-muted-foreground">כותרת:</span> {viewDetail.title}</div>
              <div><span className="text-muted-foreground">התחלה:</span> {fmtDate(viewDetail.startDate)}</div>
              <div><span className="text-muted-foreground">סיום:</span> {fmtDate(viewDetail.endDate)}</div>
              <div><span className="text-muted-foreground">שווי:</span> {fmtC(viewDetail.value)}</div>
              <div><span className="text-muted-foreground">חודשי:</span> {fmtC(viewDetail.monthlyValue)}</div>
              <div><span className="text-muted-foreground">חידוש אוטומטי:</span> {viewDetail.autoRenew ? "כן" : "לא"}</div>
              <div><span className="text-muted-foreground">איש קשר:</span> {viewDetail.contactPerson}</div>
            </div>
            {viewDetail.notes && <p className="text-sm text-muted-foreground border-t border-border pt-3">{viewDetail.notes}</p>}
          </div>
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card rounded-2xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{editing ? "עריכת חוזה" : "חוזה חדש"}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-muted/30"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">מספר חוזה <RequiredMark /></label>
                <input value={form.contractNumber || ""} onChange={e => setForm({ ...form, contractNumber: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                <FormFieldError error={validation.errors.contractNumber} />
              </div>
              <div>
                <label className="text-sm font-medium">לקוח <RequiredMark /></label>
                <input value={form.customer || ""} onChange={e => setForm({ ...form, customer: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                <FormFieldError error={validation.errors.customer} />
              </div>
              <div>
                <label className="text-sm font-medium">סוג</label>
                <select value={form.type || "service"} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm">
                  {Object.entries(TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">סטטוס</label>
                <select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm">
                  {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium">כותרת <RequiredMark /></label>
                <input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                <FormFieldError error={validation.errors.title} />
              </div>
              <div>
                <label className="text-sm font-medium">תאריך התחלה <RequiredMark /></label>
                <input type="date" value={form.startDate || ""} onChange={e => setForm({ ...form, startDate: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                <FormFieldError error={validation.errors.startDate} />
              </div>
              <div>
                <label className="text-sm font-medium">תאריך סיום <RequiredMark /></label>
                <input type="date" value={form.endDate || ""} onChange={e => setForm({ ...form, endDate: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                <FormFieldError error={validation.errors.endDate} />
              </div>
              <div>
                <label className="text-sm font-medium">שווי (₪)</label>
                <input type="number" min={0} value={form.value || 0} onChange={e => setForm({ ...form, value: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">שווי חודשי (₪)</label>
                <input type="number" min={0} value={form.monthlyValue || 0} onChange={e => setForm({ ...form, monthlyValue: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">איש קשר</label>
                <input value={form.contactPerson || ""} onChange={e => setForm({ ...form, contactPerson: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
              </div>
              <div className="flex items-center gap-2 mt-6">
                <input type="checkbox" id="autoRenew" checked={form.autoRenew || false} onChange={e => setForm({ ...form, autoRenew: e.target.checked })} className="rounded" />
                <label htmlFor="autoRenew" className="text-sm">חידוש אוטומטי</label>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium">הערות</label>
                <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted/30 transition">ביטול</button>
              <button onClick={save} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition">{editing ? "עדכון" : "יצירה"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
