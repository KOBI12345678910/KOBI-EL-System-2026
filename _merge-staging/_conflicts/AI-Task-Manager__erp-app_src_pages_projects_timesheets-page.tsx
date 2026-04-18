import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock, Search, Plus, Edit2, Trash2, X, Save, Eye,
  ArrowUpDown, AlertTriangle, CheckCircle2, Send, BarChart3, Timer,
  DollarSign, XCircle, Grid3X3, Copy
} from "lucide-react";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const approvalStatusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-muted/20 text-muted-foreground" },
  submitted: { label: "ממתין לאישור", color: "bg-yellow-500/20 text-yellow-400" },
  approved: { label: "מאושר", color: "bg-green-500/20 text-green-400" },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-400" },
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}
    </div>
  );
}

function getWeekEnding(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + 6 + offset * 7);
  return d.toISOString().slice(0, 10);
}

type Tab = "list" | "weekly" | "approval" | "billable";


const load: any[] = [];
export default function TimesheetsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [approvalQueue, setApprovalQueue] = useState<any[]>([]);
  const [billableReport, setBillableReport] = useState<any[]>([]);
  const [weeklyGrid, setWeeklyGrid] = useState<any>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBillable, setFilterBillable] = useState("all");
  const [sortField, setSortField] = useState("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [rejectModal, setRejectModal] = useState<any>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);
  const [detailTab, setDetailTab] = useState("details");
  const [activeTab, setActiveTab] = useState<Tab>("list");
  const { selectedIds, toggle, clear, isSelected } = useBulkSelection();
  const { errors, validate } = useFormValidation<any>({
    employee: { required: true, minLength: 2, message: "שם עובד חובה" },
  });

  const loadMain = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterBillable !== "all") params.set("billable", filterBillable);
      const res = await authFetch(`${API}/timesheet-entries?${params}`);
      if (res.ok) setItems(safeArray(await res.json()));
      else throw new Error("שגיאה בטעינת נתונים");
    } catch (e: any) { setError(e.message || "שגיאה"); }
    setLoading(false);
  };

  const loadApprovalQueue = async () => {
    const res = await authFetch(`${API}/timesheet-entries/approval-queue`);
    if (res.ok) setApprovalQueue(safeArray(await res.json()));
  };

  const loadBillableReport = async () => {
    const res = await authFetch(`${API}/timesheet-entries/billable-report`);
    if (res.ok) setBillableReport(safeArray(await res.json()));
  };

  const loadWeeklyGrid = async () => {
    const weekEnding = getWeekEnding(weekOffset);
    const res = await authFetch(`${API}/timesheet-entries/weekly-grid?weekEnding=${weekEnding}`);
    if (res.ok) setWeeklyGrid(await res.json());
  };

  useEffect(() => { loadMain(); loadApprovalQueue(); loadBillableReport(); }, [filterBillable]);
  useEffect(() => { loadWeeklyGrid(); }, [weekOffset]);

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || (i.approvalStatus || i.approval_status || i.status) === filterStatus) &&
      (!search || [i.employee, i.project_name, i.task_name, i.description]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ approvalStatus: "draft", status: "draft", date: new Date().toISOString().slice(0, 10), billable: true });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ ...r, date: r.date?.slice(0, 10) });
    setShowForm(true);
  };

  const save = async () => {
    if (!validate(form)) return;
    setSaving(true);
    try {
      const url = editing ? `${API}/timesheet-entries/${editing.id}` : `${API}/timesheet-entries`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false);
      loadMain();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק רשומת שעות? פעולה זו אינה ניתנת לביטול.")) {
      await authFetch(`${API}/timesheet-entries/${id}`, { method: "DELETE" });
      loadMain(); loadApprovalQueue();
    }
  };

  const submitEntry = async (id: number) => {
    await authFetch(`${API}/timesheet-entries/${id}/submit`, { method: "PATCH" });
    loadMain(); loadApprovalQueue();
  };

  const approveEntry = async (id: number) => {
    await authFetch(`${API}/timesheet-entries/${id}/approve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "מנהל" }),
    });
    loadMain(); loadApprovalQueue();
  };

  const rejectEntry = async () => {
    if (!rejectModal) return;
    await authFetch(`${API}/timesheet-entries/${rejectModal.id}/reject`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: rejectComment }),
    });
    setRejectModal(null);
    setRejectComment("");
    loadMain(); loadApprovalQueue();
  };

  const totalHours = items.reduce((s, i) => s + parseFloat(i.hours || "0"), 0);
  const billableHours = items.filter(i => i.billable).reduce((s, i) => s + parseFloat(i.hours || "0"), 0);
  const approvedCount = items.filter(i => (i.approvalStatus || i.approval_status) === "approved").length;
  const pendingCount = approvalQueue.length;

  const kpis = [
    { label: "סה\"כ שעות", value: `${totalHours.toFixed(1)}h`, icon: Timer, color: "text-indigo-400" },
    { label: "שעות חייבות", value: `${billableHours.toFixed(1)}h`, icon: DollarSign, color: "text-emerald-400" },
    { label: "ממתינות לאישור", value: fmt(pendingCount), icon: Send, color: "text-yellow-400" },
    { label: "מאושרות", value: fmt(approvedCount), icon: CheckCircle2, color: "text-green-400" },
    { label: "רשומות", value: fmt(items.length), icon: Clock, color: "text-blue-400" },
  ];

  const days7 = weeklyGrid ? Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weeklyGrid.weekStart);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  }) : [];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Clock className="text-indigo-400 w-6 h-6" />
            דוחות שעות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול שעות עבודה, חיוב ואישורים</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown
            data={filtered}
            headers={{ employee: "עובד", date: "תאריך", hours: "שעות", billable: "חייב", approvalStatus: "סטטוס" }}
            filename="timesheets"
          />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> רשומה חדשה
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} />
            <div className="text-xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-2 border-b border-border/50">
        {([
          ["list", "רשימה", Clock],
          ["weekly", "לוח שבועי", Grid3X3],
          ["approval", `אישורים (${pendingCount})`, CheckCircle2],
          ["billable", "דוח חיוב", DollarSign],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setActiveTab(key as Tab)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 ${activeTab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {activeTab === "weekly" && (
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Grid3X3 className="w-5 h-5 text-indigo-400" /> לוח שבועי
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={() => setWeekOffset(w => w - 1)} className="px-3 py-1.5 bg-muted rounded-lg text-sm hover:bg-muted/80">← הקודם</button>
              <span className="text-sm text-muted-foreground">{weeklyGrid?.weekStart} — {weeklyGrid?.weekEnd}</span>
              <button onClick={() => setWeekOffset(w => w + 1)} className="px-3 py-1.5 bg-muted rounded-lg text-sm hover:bg-muted/80">הבא →</button>
              <button onClick={() => setWeekOffset(0)} className="px-3 py-1.5 bg-primary/20 text-primary rounded-lg text-sm">השבוע</button>
            </div>
          </div>
          {!weeklyGrid || weeklyGrid.grid?.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">אין נתוני שבוע זה</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-right py-2 pr-3 text-muted-foreground font-medium min-w-[120px]">עובד / פרויקט</th>
                    {days7.map(d => (
                      <th key={d} className="text-center py-2 px-2 text-muted-foreground font-medium min-w-[60px]">
                        {new Date(d).toLocaleDateString("he-IL", { weekday: "short", day: "numeric" })}
                      </th>
                    ))}
                    <th className="text-center py-2 px-2 text-muted-foreground font-medium">סה"כ</th>
                    <th className="text-center py-2 px-2 text-muted-foreground font-medium">חייב</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyGrid.grid.map((row: any, i: number) => (
                    <tr key={i} className="border-b border-border/20 hover:bg-muted/10">
                      <td className="py-2 pr-3">
                        <div className="text-foreground font-medium">{row.employee}</div>
                        <div className="text-muted-foreground">{row.projectName}</div>
                      </td>
                      {days7.map(d => (
                        <td key={d} className="text-center py-2 px-2">
                          <span className={row.days[d] ? "text-foreground font-medium" : "text-muted-foreground/30"}>
                            {row.days[d] ? row.days[d].toFixed(1) : "—"}
                          </span>
                        </td>
                      ))}
                      <td className="text-center py-2 px-2 text-emerald-400 font-bold">{row.totalHours.toFixed(1)}h</td>
                      <td className="text-center py-2 px-2 text-blue-400">{row.billableHours.toFixed(1)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "approval" && (
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-yellow-400" /> תור אישורים ({approvalQueue.length})
          </h2>
          {approvalQueue.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">אין רשומות הממתינות לאישור</p>
          ) : (
            <div className="space-y-2">
              {approvalQueue.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between bg-muted/20 rounded-xl p-3 border border-border/30">
                  <div className="space-y-0.5">
                    <div className="text-sm text-foreground font-medium">{r.employee} — {r.project_label || r.project_name}</div>
                    <div className="text-xs text-muted-foreground">{r.date?.slice(0, 10)} | {r.hours}h | {r.billable ? "חייב" : "לא חייב"} | {r.description || "—"}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => approveEntry(r.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs hover:bg-green-500/30">
                      <CheckCircle2 className="w-3 h-3" /> אישור
                    </button>
                    <button onClick={() => { setRejectModal(r); setRejectComment(""); }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs hover:bg-red-500/30">
                      <XCircle className="w-3 h-3" /> דחייה
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "billable" && (
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-400" /> דוח שעות חיוב
          </h2>
          {billableReport.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">אין נתוני חיוב</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    {["עובד", "פרויקט", "שעות חייבות", "שעות לא-חייבות", "סה\"כ שעות", "סכום חיוב"].map(h => (
                      <th key={h} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {billableReport.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-border/20 hover:bg-muted/10">
                      <td className="px-4 py-3 text-foreground font-medium">{r.employee}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.project_name}</td>
                      <td className="px-4 py-3 text-emerald-400">{parseFloat(r.billable_hours || "0").toFixed(1)}h</td>
                      <td className="px-4 py-3 text-muted-foreground">{parseFloat(r.non_billable_hours || "0").toFixed(1)}h</td>
                      <td className="px-4 py-3 text-foreground">{parseFloat(r.total_hours || "0").toFixed(1)}h</td>
                      <td className="px-4 py-3 text-emerald-400 font-medium">₪{fmt(r.total_billable_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "list" && (
        <>
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש עובד, פרויקט..."
                className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
              <option value="all">כל הסטטוסים</option>
              {Object.entries(approvalStatusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filterBillable} onChange={e => setFilterBillable(e.target.value)}
              className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
              <option value="all">חיוב: הכל</option>
              <option value="true">חייב בלבד</option>
              <option value="false">לא-חייב בלבד</option>
            </select>
            <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
          </div>

          <BulkActions selectedIds={selectedIds} onClear={clear} entityName="דיווחי שעות" actions={defaultBulkActions(selectedIds, clear, loadMain, `${API}/timesheet-entries`)} />

          {loading ? (
            <div className="border border-border/50 rounded-2xl bg-card/50 h-48 animate-pulse" />
          ) : error ? (
            <div className="text-center py-16 text-red-400">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">שגיאה בטעינה</p>
              <button onClick={loadMain} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">אין רשומות שעות</p>
              <p className="text-sm mt-1">{search || filterStatus !== "all" ? "נסה לשנות את הסינון" : "לחץ על 'רשומה חדשה' כדי להתחיל"}</p>
            </div>
          ) : (
            <>
              <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 border-b border-border/50">
                      <tr>
                        <th className="px-2 py-3 w-8" />
                        {[
                          { key: "employee", label: "עובד" },
                          { key: "date", label: "תאריך" },
                          { key: "hours", label: "שעות" },
                          { key: "billable", label: "חיוב" },
                          { key: "project_id", label: "פרויקט" },
                          { key: "approval_status", label: "סטטוס" },
                        ].map(col => (
                          <th key={col.key} onClick={() => {
                            if (sortField === col.key) setSortDir(d => d === "asc" ? "desc" : "asc");
                            else { setSortField(col.key); setSortDir("desc"); }
                          }} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                            <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div>
                          </th>
                        ))}
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagination.paginate(filtered).map(r => {
                        const status = r.approvalStatus || r.approval_status || r.status || "draft";
                        return (
                          <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                            <td className="px-2 py-3"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                            <td className="px-4 py-3 text-foreground font-medium">{r.employee || "—"}</td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">{r.date?.slice(0, 10) || "—"}</td>
                            <td className="px-4 py-3 text-emerald-400 font-medium">{r.hours ? `${r.hours}h` : "—"}</td>
                            <td className="px-4 py-3">
                              <Badge className={`text-[10px] ${r.billable ? "bg-emerald-500/20 text-emerald-400" : "bg-muted/20 text-muted-foreground"}`}>
                                {r.billable ? "חייב" : "לא-חייב"}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{r.project_name || r.project_id || "—"}</td>
                            <td className="px-4 py-3">
                              <Badge className={`text-[10px] ${approvalStatusMap[status]?.color || "bg-muted/20 text-muted-foreground"}`}>
                                {approvalStatusMap[status]?.label || status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1">
                                <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                                {status === "draft" && (
                                  <button onClick={() => submitEntry(r.id)} className="p-1.5 hover:bg-muted rounded-lg" title="שלח לאישור"><Send className="w-3.5 h-3.5 text-yellow-400" /></button>
                                )}
                                {status === "submitted" && (
                                  <>
                                    <button onClick={() => approveEntry(r.id)} className="p-1.5 hover:bg-muted rounded-lg" title="אישור"><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /></button>
                                    <button onClick={() => { setRejectModal(r); setRejectComment(""); }} className="p-1.5 hover:bg-muted rounded-lg" title="דחייה"><XCircle className="w-3.5 h-3.5 text-red-400" /></button>
                                  </>
                                )}
                                <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button><button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/timesheet-entries`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                                {isSuperAdmin && <button onClick={async () => { if (await globalConfirm(`למחוק?`)) remove(r.id); }} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
            </>
          )}
        </>
      )}

      <AnimatePresence>
        {rejectModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-5">
              <h2 className="text-base font-bold text-foreground mb-3">דחיית רשומת שעות</h2>
              <p className="text-sm text-muted-foreground mb-3">רשומה של {rejectModal.employee} — {rejectModal.hours}h</p>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">סיבת דחייה</label>
                <textarea value={rejectComment} onChange={e => setRejectComment(e.target.value)}
                  rows={3} placeholder="הסבר מדוע הרשומה נדחית..."
                  className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div className="flex gap-2 mt-4 justify-end">
                <button onClick={() => setRejectModal(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={rejectEntry} className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30">דחה רשומה</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setViewDetail(null); setDetailTab("details"); }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">דוח שעות — {viewDetail.employee}</h2>
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <div className="p-5 grid grid-cols-2 gap-4">
                  <DetailField label="עובד" value={viewDetail.employee} />
                  <DetailField label="תאריך" value={viewDetail.date?.slice(0, 10)} />
                  <DetailField label="שעות" value={viewDetail.hours ? `${viewDetail.hours}h` : undefined} />
                  <DetailField label="חיוב">
                    <Badge className={viewDetail.billable ? "bg-emerald-500/20 text-emerald-400" : "bg-muted/20 text-muted-foreground"}>
                      {viewDetail.billable ? "חייב" : "לא-חייב"}
                    </Badge>
                  </DetailField>
                  <DetailField label="תעריף שעתי" value={viewDetail.hourlyRate || viewDetail.hourly_rate ? `₪${fmt(viewDetail.hourlyRate || viewDetail.hourly_rate)}` : undefined} />
                  <DetailField label="סכום חיוב" value={viewDetail.billableAmount || viewDetail.billable_amount ? `₪${fmt(viewDetail.billableAmount || viewDetail.billable_amount)}` : undefined} />
                  <DetailField label="סטטוס">
                    <Badge className={approvalStatusMap[viewDetail.approvalStatus || viewDetail.approval_status || viewDetail.status]?.color}>
                      {approvalStatusMap[viewDetail.approvalStatus || viewDetail.approval_status || viewDetail.status]?.label}
                    </Badge>
                  </DetailField>
                  <DetailField label={'מאושר ע"י'} value={viewDetail.approvedBy || viewDetail.approved_by} />
                  {(viewDetail.rejectionComment || viewDetail.rejection_comment) && (
                    <div className="col-span-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                      <div className="text-xs text-red-400 font-medium mb-1">סיבת דחייה</div>
                      <div className="text-xs text-red-300">{viewDetail.rejectionComment || viewDetail.rejection_comment}</div>
                    </div>
                  )}
                  <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
                </div>
              )}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="timesheet" entityId={viewDetail.id} /></div>}
              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="timesheet" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="timesheet" entityId={viewDetail.id} /></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }}
                  className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30">
                  <Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה
                </button>
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת רשומה" : "רשומת שעות חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">עובד *</label>
                  <input value={form.employee || ""} onChange={e => setForm({ ...form, employee: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  <FormFieldError error={errors.employee} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך</label>
                  <input type="date" value={form.date || ""} onChange={e => setForm({ ...form, date: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">שעות *</label>
                  <input type="number" step="0.5" value={form.hours || ""} onChange={e => setForm({ ...form, hours: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">מזהה פרויקט</label>
                  <input type="number" value={form.projectId || form.project_id || ""} onChange={e => setForm({ ...form, projectId: Number(e.target.value) })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תעריף שעתי (₪)</label>
                  <input type="number" step="0.01" value={form.hourlyRate || form.hourly_rate || ""} onChange={e => setForm({ ...form, hourlyRate: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!form.billable} onChange={e => setForm({ ...form, billable: e.target.checked })}
                      className="w-4 h-4 rounded" />
                    <span className="text-sm font-medium text-muted-foreground">שעות חייבות</span>
                  </label>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור</label>
                  <textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })}
                    rows={3} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving}
                  className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">
                  <Save className="w-3.5 h-3.5 inline ml-1" /> {editing ? "עדכון" : "שמירה"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
