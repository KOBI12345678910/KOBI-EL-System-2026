import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bug, Search, Plus, Edit2, Trash2, X, Save, Eye,
  ArrowUpDown, AlertTriangle, CheckCircle2, Shield, BarChart3, Clock
} from "lucide-react";
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
import AttachmentsSection from "@/components/attachments-section";
import StatusTransition from "@/components/status-transition";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const resultMap: Record<string, { label: string; color: string }> = {
  "ממתין": { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
  "עבר": { label: "עבר", color: "bg-green-500/20 text-green-400" },
  "נכשל": { label: "נכשל", color: "bg-red-500/20 text-red-400" },
  "חלקי": { label: "חלקי", color: "bg-orange-500/20 text-orange-400" },
  "דילוג": { label: "דילוג", color: "bg-muted/20 text-muted-foreground" },
};

const testTypeOptions = ["יחידה", "אינטגרציה", "מערכת", "קבלה", "רגרסיה", "ביצועים", "אבטחה", "ידני"];

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}
    </div>
  );
}

export default function QATestingPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterResult, setFilterResult] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("test_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);
  const [detailTab, setDetailTab] = useState("details");
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const { errors, validate, clearErrors } = useFormValidation<any>({
    test_name: { required: true, minLength: 2, message: "שם בדיקה חובה" },
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/product-dev/qa-testing`);
      if (res.ok) setItems(safeArray(await res.json()));
      else throw new Error("שגיאה בטעינת נתונים");
    } catch (e: any) {
      setError(e.message || "שגיאה בטעינת נתונים");
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterResult === "all" || i.result === filterResult) &&
      (filterType === "all" || i.test_type === filterType) &&
      (!search || [i.test_name, i.version, i.tester, i.test_suite, i.environment]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterResult, filterType, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ result: "ממתין", testDate: new Date().toISOString().slice(0, 10) });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      testName: r.test_name, version: r.version, testType: r.test_type,
      testSuite: r.test_suite, tester: r.tester, testDate: r.test_date?.slice(0, 10),
      result: r.result, bugsFound: r.bugs_found, bugsCritical: r.bugs_critical,
      bugsResolved: r.bugs_resolved, coverage: r.coverage, duration: r.duration,
      environment: r.environment, steps: r.steps, expectedResult: r.expected_result,
      actualResult: r.actual_result, notes: r.notes,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!validate(form)) return;
    setSaving(true);
    try {
      const url = editing ? `${API}/product-dev/qa-testing/${editing.id}` : `${API}/product-dev/qa-testing`;
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
    if (await globalConfirm("למחוק בדיקה זו? פעולה זו אינה ניתנת לביטול.")) {
      await authFetch(`${API}/product-dev/qa-testing/${id}`, { method: "DELETE" });
      load();
    }
  };

  const passed = items.filter(i => i.result === "עבר").length;
  const passRate = items.length > 0 ? ((passed / items.length) * 100).toFixed(0) : "0";
  const totalBugs = items.reduce((s, i) => s + (Number(i.bugs_found) || 0), 0);
  const avgCoverage = items.length > 0
    ? (items.reduce((s, i) => s + (Number(i.coverage) || 0), 0) / items.length).toFixed(0)
    : "0";

  const kpis = [
    { label: "בדיקות שעברו", value: fmt(passed), icon: CheckCircle2, color: "text-green-400" },
    { label: "שיעור מעבר", value: `${passRate}%`, icon: Shield, color: "text-blue-400" },
    { label: "באגים שנמצאו", value: fmt(totalBugs), icon: Bug, color: "text-red-400" },
    { label: "כיסוי בדיקות", value: `${avgCoverage}%`, icon: BarChart3, color: "text-purple-400" },
    { label: "ממתינות", value: fmt(items.filter(i => i.result === "ממתין").length), icon: Clock, color: "text-yellow-400" },
  ];

  const columns = [
    { key: "test_name", label: "שם בדיקה" },
    { key: "version", label: "גרסה" },
    { key: "test_type", label: "סוג" },
    { key: "tester", label: "בודק" },
    { key: "test_date", label: "תאריך" },
    { key: "result", label: "תוצאה" },
    { key: "bugs_found", label: "באגים" },
    { key: "coverage", label: "כיסוי%" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Bug className="text-rose-400 w-6 h-6" />
            בדיקות QA
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול בדיקות איכות, כיסוי ומעקב באגים</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown
            data={filtered}
            headers={{ test_name: "שם", version: "גרסה", test_type: "סוג", result: "תוצאה", bugs_found: "באגים", coverage: "כיסוי%", tester: "בודק" }}
            filename="qa_testing"
          />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> בדיקה חדשה
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

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש בדיקה, גרסה, בודק..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterResult} onChange={e => setFilterResult(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל התוצאות</option>
          {Object.keys(resultMap).map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסוגים</option>
          {testTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="בדיקות QA" actions={defaultBulkActions(selectedIds, clear, load, `${API}/product-dev/qa-tests`)} />

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
          <Bug className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין בדיקות QA</p>
          <p className="text-sm mt-1">{search || filterResult !== "all" ? "נסה לשנות את הסינון" : "לחץ על 'בדיקה חדשה' כדי להתחיל"}</p>
        </div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  {columns.map(col => (
                    <th key={col.key} onClick={() => toggleSort(col.key)}
                      className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                      <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginate(filtered).map(r => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <td className="px-2 py-3"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                    <td className="px-4 py-3 text-foreground font-medium">{r.test_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.version || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.test_type || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.tester || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.test_date?.slice(0, 10) || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${resultMap[r.result]?.color || "bg-muted/20 text-muted-foreground"}`}>
                        {resultMap[r.result]?.label || r.result}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className={Number(r.bugs_found) > 0 ? "text-red-400 font-medium" : "text-muted-foreground"}>{r.bugs_found || 0}</span>
                      {Number(r.bugs_critical) > 0 && <span className="text-red-400 text-xs mr-1">({r.bugs_critical} קריטי)</span>}
                    </td>
                    <td className="px-4 py-3 text-emerald-400">{r.coverage != null ? `${r.coverage}%` : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                        {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.id || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setViewDetail(null); setDetailTab("details"); }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{viewDetail.test_name}</h2>
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="שם בדיקה" value={viewDetail.test_name} />
                <DetailField label="גרסה" value={viewDetail.version} />
                <DetailField label="סוג בדיקה" value={viewDetail.test_type} />
                <DetailField label="סוויטה" value={viewDetail.test_suite} />
                <DetailField label="בודק" value={viewDetail.tester} />
                <DetailField label="תאריך" value={viewDetail.test_date?.slice(0, 10)} />
                <DetailField label="תוצאה">
                  <Badge className={resultMap[viewDetail.result]?.color}>{viewDetail.result}</Badge>
                </DetailField>
                <DetailField label="כיסוי" value={viewDetail.coverage != null ? `${viewDetail.coverage}%` : undefined} />
                <DetailField label="באגים שנמצאו" value={String(viewDetail.bugs_found || 0)} />
                <DetailField label="באגים קריטיים" value={String(viewDetail.bugs_critical || 0)} />
                <DetailField label="באגים שנפתרו" value={String(viewDetail.bugs_resolved || 0)} />
                <DetailField label="משך" value={viewDetail.duration} />
                <DetailField label="סביבה" value={viewDetail.environment} />
                <div className="col-span-2"><DetailField label="שלבי בדיקה" value={viewDetail.steps} /></div>
                <DetailField label="תוצאה צפויה" value={viewDetail.expected_result} />
                <DetailField label="תוצאה בפועל" value={viewDetail.actual_result} />
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>
              )}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="qa-test" entityId={viewDetail.id} /></div>}
              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="qa-test" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="qa-test" entityId={viewDetail.id} /></div>}
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת בדיקה" : "בדיקה חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם בדיקה *</label>
                  <input value={form.testName || ""} onChange={e => setForm({ ...form, testName: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">גרסה</label>
                  <input value={form.version || ""} onChange={e => setForm({ ...form, version: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג בדיקה</label>
                  <select value={form.testType || ""} onChange={e => setForm({ ...form, testType: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    <option value="">בחר...</option>
                    {testTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">בודק</label>
                  <input value={form.tester || ""} onChange={e => setForm({ ...form, tester: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך בדיקה</label>
                  <input type="date" value={form.testDate || ""} onChange={e => setForm({ ...form, testDate: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תוצאה</label>
                  <select value={form.result || "ממתין"} onChange={e => setForm({ ...form, result: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.keys(resultMap).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">באגים שנמצאו</label>
                  <input type="number" value={form.bugsFound || ""} onChange={e => setForm({ ...form, bugsFound: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">באגים קריטיים</label>
                  <input type="number" value={form.bugsCritical || ""} onChange={e => setForm({ ...form, bugsCritical: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">כיסוי (%)</label>
                  <input type="number" step="0.01" value={form.coverage || ""} onChange={e => setForm({ ...form, coverage: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">סביבה</label>
                  <input value={form.environment || ""} onChange={e => setForm({ ...form, environment: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label>
                  <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })}
                    rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
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
