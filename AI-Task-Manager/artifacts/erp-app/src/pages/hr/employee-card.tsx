import { useState, useEffect, useMemo } from "react";
import { User, Phone, Mail, MapPin, Calendar, Briefcase, Award, FileText, Edit2, Save, X, Plus, Search, Building2, Clock, Shield, Star, DollarSign, Eye, Trash2, ArrowUpDown, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch, validateIsraeliID, validateIsraeliPhone } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import StatusTransition from "@/components/status-transition";
import { FormFieldError } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  on_leave: { label: "בחופשה", color: "bg-amber-500/20 text-amber-400" },
  terminated: { label: "סיים", color: "bg-red-500/20 text-red-400" },
  suspended: { label: "מושעה", color: "bg-orange-500/20 text-orange-400" },
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}
    </div>
  );
}

export default function EmployeeCardPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("full_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [detailTab, setDetailTab] = useState("details");
  const bulk = useBulkSelection();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const pagination = useSmartPagination(25);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/employees`);
      if (res.ok) setItems(safeArray(await res.json()));
      else throw new Error("שגיאה בטעינה");
    } catch (e: any) {
      setError(e.message || "שגיאה בטעינת נתונים");
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const departments = [...new Set(items.map(e => e.department).filter(Boolean))];

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(e =>
      (filterDept === "all" || e.department === filterDept) &&
      (filterStatus === "all" || e.status === filterStatus) &&
      (!search || [e.full_name, e.employee_id, e.position, e.phone, e.email, e.department]
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
  }, [items, search, filterDept, filterStatus, sortField, sortDir]);

  const stats = {
    total: items.length,
    active: items.filter(e => e.status === "active" || !e.status).length,
    onLeave: items.filter(e => e.status === "on_leave").length,
    departments: departments.length,
  };

  const kpis = [
    { label: "סה\"כ עובדים", value: fmt(stats.total), icon: User, color: "text-blue-400" },
    { label: "פעילים", value: fmt(stats.active), icon: Shield, color: "text-green-400" },
    { label: "בחופשה", value: fmt(stats.onLeave), icon: Calendar, color: "text-amber-400" },
    { label: "מחלקות", value: fmt(stats.departments), icon: Building2, color: "text-purple-400" },
  ];

  const openCreate = () => {
    setEditing(null);
    setForm({ status: "active", start_date: new Date().toISOString().slice(0, 10) });
    setFieldErrors({});
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (emp: any) => {
    setEditing(emp);
    setForm({ ...emp });
    setFieldErrors({});
    setFormError(null);
    setShowForm(true);
  };

  const save = async () => {
    setFormError(null);
    const errs: Record<string, string> = {};

    if (!form.full_name || String(form.full_name).trim() === "") {
      errs.full_name = "שם מלא הוא שדה חובה";
    } else if (String(form.full_name).trim().length < 2) {
      errs.full_name = "שם מלא חייב להכיל לפחות 2 תווים";
    } else if (String(form.full_name).length > 100) {
      errs.full_name = "שם מלא לא יכול לעלות על 100 תווים";
    }

    if (!form.employee_id || String(form.employee_id).trim() === "") {
      errs.employee_id = "מספר עובד הוא שדה חובה";
    } else if (String(form.employee_id).length > 20) {
      errs.employee_id = "מספר עובד לא יכול לעלות על 20 תווים";
    }

    if (form.id_number && !validateIsraeliID(form.id_number)) {
      errs.id_number = "מספר ת.ז. לא תקין — יש להזין 9 ספרות תקינות";
    }

    if (form.phone && !validateIsraeliPhone(form.phone)) {
      errs.phone = "מספר טלפון לא תקין — לדוגמה: 050-1234567";
    }

    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = "כתובת אימייל לא תקינה";
    }

    if (form.salary !== undefined && form.salary !== "" && (isNaN(Number(form.salary)) || Number(form.salary) < 0)) {
      errs.salary = "שכר חייב להיות מספר חיובי";
    }

    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const url = editing ? `${API}/employees/${editing.id}` : `${API}/employees`;
      const res = await authFetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData.errors) {
          setFieldErrors(errData.errors);
        } else {
          setFormError(errData.message || errData.error || "שגיאה בשמירה");
        }
        setSaving(false);
        return;
      }
      setShowForm(false);
      setFormError(null);
      setFieldErrors({});
      load();
    } catch (e: any) {
      setFormError(e.message || "שגיאה בשמירה");
    }
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק עובד זה? פעולה זו אינה ניתנת לביטול.")) {
      await authFetch(`${API}/employees/${id}`, { method: "DELETE" });
      load();
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <User className="text-blue-400 w-6 h-6" />
            כרטיס עובד
          </h1>
          <p className="text-sm text-muted-foreground mt-1">תיקי עובדים, פרטים אישיים ומקצועיים</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown
            data={filtered}
            headers={{ employee_id: "מספר", full_name: "שם", position: "תפקיד", department: "מחלקה", phone: "טלפון", email: "אימייל", status: "סטטוס" }}
            filename="employees"
          />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> עובד חדש
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש עובד..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל המחלקות</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      <BulkActions selectedIds={bulk.selectedIds} onClear={bulk.clearAll} entityName="עובדים" actions={defaultBulkActions} />

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
          <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין עובדים להצגה</p>
          <p className="text-sm mt-1">{search || filterDept !== "all" || filterStatus !== "all" ? "נסה לשנות את הסינון" : "לחץ על 'עובד חדש' כדי להתחיל"}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pagination.paginate(filtered).map(emp => (
              <motion.div key={emp.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border/50 rounded-2xl p-4 cursor-pointer transition-all hover:border-primary/30">
                <div className="flex items-start gap-3">
                  <BulkCheckbox checked={bulk.isSelected(emp.id)} onChange={() => bulk.toggle(emp.id)} />
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-foreground font-bold text-lg flex-shrink-0">
                    {emp.full_name?.charAt(0) || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-foreground">{emp.full_name || "—"}</div>
                    <div className="text-sm text-muted-foreground">{emp.position || emp.role || "—"}</div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {emp.department && <Badge className="bg-blue-500/20 text-blue-400 text-[10px]">{emp.department}</Badge>}
                      {emp.employee_id && <span className="text-xs font-mono text-muted-foreground">{emp.employee_id}</span>}
                      <Badge className={`text-[10px] ${statusMap[emp.status || "active"]?.color || "bg-green-500/20 text-green-400"}`}>
                        {statusMap[emp.status || "active"]?.label || "פעיל"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={(e) => { e.stopPropagation(); setSelected(emp); }} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    <button onClick={(e) => { e.stopPropagation(); openEdit(emp); }} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                    <button onClick={(e) => { e.stopPropagation(); remove(emp.id); }} className="p-1.5 hover:bg-muted rounded-lg" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border/30 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  {emp.phone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3" />{emp.phone}</div>}
                  {emp.email && <div className="flex items-center gap-1.5 truncate"><Mail className="w-3 h-3" />{emp.email}</div>}
                  {emp.start_date && <div className="flex items-center gap-1.5"><Calendar className="w-3 h-3" />{emp.start_date?.slice(0, 10)}</div>}
                  {emp.salary && <div className="flex items-center gap-1.5"><DollarSign className="w-3 h-3" />₪{fmt(emp.salary)}</div>}
                </div>
              </motion.div>
            ))}
          </div>
          <SmartPagination pagination={pagination} />
        </>
      )}

      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-400" />
                  {selected.full_name}
                </h2>
                <button onClick={() => setSelected(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מספר עובד" value={selected.employee_id} />
                <DetailField label="שם מלא" value={selected.full_name} />
                <DetailField label="תפקיד" value={selected.position} />
                <DetailField label="מחלקה" value={selected.department} />
                <DetailField label="טלפון" value={selected.phone} />
                <DetailField label="אימייל" value={selected.email} />
                <DetailField label="כתובת" value={selected.address} />
                <DetailField label="תאריך התחלה" value={selected.start_date?.slice(0, 10)} />
                <DetailField label="שכר" value={selected.salary ? `₪${fmt(selected.salary)}` : undefined} />
                <DetailField label="סטטוס">
                  <Badge className={statusMap[selected.status || "active"]?.color}>{statusMap[selected.status || "active"]?.label}</Badge>
                </DetailField>
                <DetailField label="חשבון בנק" value={selected.bank_account} />
                <DetailField label="ת.ז." value={selected.id_number} />
              </div>}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="employees" entityId={selected.id} relations={[{key:"attendance",label:"נוכחות",icon:"Clock"},{key:"leave-requests",label:"חופשות",icon:"Calendar"},{key:"payroll-records",label:"שכר",icon:"DollarSign"},{key:"training-records",label:"הדרכות",icon:"GraduationCap"},{key:"performance-reviews",label:"הערכות",icon:"Star"}]} /></div>}
              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="employees" entityId={selected.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="employees" entityId={selected.id} /></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setSelected(null); openEdit(selected); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30">
                  <Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה
                </button>
                <button onClick={() => setSelected(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת עובד" : "עובד חדש"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: "full_name", label: "שם מלא", required: true, maxLength: 100 },
                    { key: "employee_id", label: "מספר עובד", required: true, maxLength: 20 },
                    { key: "id_number", label: "תעודת זהות", required: false, maxLength: 9 },
                    { key: "position", label: "תפקיד", required: false, maxLength: 100 },
                    { key: "department", label: "מחלקה", required: false, maxLength: 100 },
                    { key: "phone", label: "טלפון", required: false, maxLength: 20 },
                    { key: "email", label: "אימייל", required: false, maxLength: 150 },
                    { key: "address", label: "כתובת", required: false, maxLength: 200 },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                        {f.label}
                        {f.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      <input
                        value={form[f.key] || ""}
                        onChange={e => { setForm({ ...form, [f.key]: e.target.value }); setFieldErrors(prev => ({ ...prev, [f.key]: "" })); }}
                        maxLength={f.maxLength}
                        className={`w-full bg-background border rounded-xl px-3 py-2.5 text-sm ${fieldErrors[f.key] ? "border-red-500 focus:ring-red-500" : "border-border"}`}
                      />
                      <FormFieldError error={fieldErrors[f.key]} />
                    </div>
                  ))}
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך התחלה</label>
                    <input type="date" value={form.start_date || ""} onChange={e => setForm({ ...form, start_date: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">שכר (₪)</label>
                    <input type="number" value={form.salary || ""} onChange={e => { setForm({ ...form, salary: e.target.value }); setFieldErrors(prev => ({ ...prev, salary: "" })); }}
                      className={`w-full bg-background border rounded-xl px-3 py-2.5 text-sm ${fieldErrors.salary ? "border-red-500" : "border-border"}`} min={0} />
                    <FormFieldError error={fieldErrors.salary} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">חשבון בנק</label>
                    <input value={form.bank_account || ""} onChange={e => setForm({ ...form, bank_account: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" maxLength={30} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                    <select value={form.status || "active"} onChange={e => setForm({ ...form, status: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                      {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              {formError && (
                <div className="p-5 bg-red-500/20 border-t border-red-500/50 text-red-400 text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> {formError}
                </div>
              )}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">
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
