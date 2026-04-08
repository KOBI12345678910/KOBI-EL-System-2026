import { useState, useEffect, useMemo } from "react";
import { Users, Search, Plus, Edit2, Trash2, ArrowUpDown, Building2, Phone, Mail, UserCheck, UserX, Clock, Award, Hash, X, Eye, Briefcase, CreditCard, Heart, MapPin, Calendar, Loader2, Copy } from "lucide-react";
import { EmptyState } from "@/components/ui/unified-states";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useSearch } from "wouter";
import { Download, Printer, Send } from "lucide-react";
import ExportDropdown from "@/components/export-dropdown";
import ImportButton from "@/components/import-button";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";
import { useApiAction, ActionButton } from "@/hooks/use-api-action";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import StatusTransition from "@/components/status-transition";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";
import { validateIsraeliId } from "@/utils/israeliId";
import { validateIsraeliPhone } from "@/utils/israeliPhone";

const API = "/api";
const fmt = (n: number) => n.toLocaleString("he-IL");

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-100 text-green-700" },
  on_leave: { label: "בחופשה", color: "bg-yellow-100 text-yellow-700" },
  terminated: { label: "סיום העסקה", color: "bg-red-100 text-red-700" },
  probation: { label: "ניסיון", color: "bg-blue-100 text-blue-700" },
  draft: { label: "טיוטה", color: "bg-muted/50 text-muted-foreground" },
};

const GENDER_MAP: Record<string, string> = { male: "זכר", female: "נקבה", other: "אחר" };
const DEPT_OPTIONS = ["הנהלה", "כספים", "ייצור", "מכירות", "שיווק", "לוגיסטיקה", "רכש", "הנדסה", "IT", "משאבי אנוש", "אחזקה", "בקרת איכות", "התקנות", "מחסן"];

interface Employee { id: number; status: string; data: Record<string, string>; created_at?: string; updated_at?: string; }

const EMPTY_FORM: Record<string, any> = {
  employee_id: "", full_name: "", id_number: "", birth_date: "", gender: "male",
  address: "", city: "", zip_code: "", phone: "", mobile: "", email: "",
  department: "", position: "", job_title: "", manager: "", hire_date: "",
  employment_type: "full_time", salary: "", currency: "ILS",
  bank_name: "", bank_branch: "", bank_account: "",
  emergency_name: "", emergency_phone: "", emergency_relation: "",
  marital_status: "single", children: "0", education: "",
  military_service: "", health_fund: "", notes: "",
};

export default function EmployeesListPage() {
  const searchStr = useSearch();
  const urlDept = useMemo(() => new URLSearchParams(searchStr).get("department") || "all", [searchStr]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState(urlDept);
  useEffect(() => { setDeptFilter(urlDept); }, [urlDept]);
  const [sortField, setSortField] = useState("full_name");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("asc");
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<"grid"|"table">("grid");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<Record<string, any>>({ ...EMPTY_FORM });
  const [formStatus, setFormStatus] = useState("active");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailTab, setDetailTab] = useState("details");
  const [viewDetail, setViewDetail] = useState<Employee | null>(null);
  const bulk = useBulkSelection();
  const formValidation = useFormValidation<Record<string, string>>({
    full_name: { required: true, message: "שם מלא נדרש" },
    employee_id: { required: true, message: "מספר עובד נדרש" },
    id_number: {
      required: true,
      custom: (value: string) => {
        if (!value || !value.trim()) return "תעודת זהות נדרשת";
        if (!validateIsraeliId(value)) return "תעודת זהות אינה תקינה (מספר לא חוקי)";
        return null;
      },
    },
    phone: {
      custom: (value: string) => {
        if (!value || !value.trim()) return null;
        if (!validateIsraeliPhone(value)) return "מספר טלפון אינו תקין";
        return null;
      },
    },
    mobile: {
      custom: (value: string) => {
        if (!value || !value.trim()) return null;
        if (!validateIsraeliPhone(value)) return "מספר נייד אינו תקין";
        return null;
      },
    },
  });
  const [activeTab, setActiveTab] = useState("personal");
  const pageSize = 50;
  const { executeSave, executeDelete, loading: actionLoading } = useApiAction();
  const token = localStorage.getItem("token") || "";
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = () => {
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
    if (search) params.set("search", search);
    if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
    setLoading(true);
    authFetch(`${API}/hr/employees?${params}`, { headers })
      .then(r => r.json())
      .then(d => { setEmployees(d?.employees || []); setTotal(d?.total || 0); })
      .catch(() => { setEmployees([]); setTotal(0); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [search, statusFilter, page]);

  const totalPages = Math.ceil(total / pageSize);

  const filtered = useMemo(() => {
    let arr = [...employees];
    if (deptFilter !== "all") arr = arr.filter(e => e.data?.department === deptFilter);
    arr.sort((a, b) => {
      const av = a.data?.[sortField] || a.status || "";
      const bv = b.data?.[sortField] || b.status || "";
      const cmp = av.localeCompare(bv, "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [employees, sortField, sortDir, deptFilter]);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } };

  const [empStats, setEmpStats] = useState<any>({});
  useEffect(() => {
    authFetch(`${API}/hr-summary`, { headers }).then(r => r.json()).then(d => setEmpStats(d?.employees || {})).catch(() => setEmpStats({}));
  }, []);
  const stats = {
    total,
    active: Number(empStats.active || 0),
    on_leave: Number(empStats.on_leave || 0),
    probation: Number(empStats.probation || 0),
    terminated: Number(empStats.terminated || 0),
  };

  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach(e => { if (e.data?.department) set.add(e.data.department); });
    return Array.from(set).sort();
  }, [employees]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, hire_date: new Date().toISOString().slice(0, 10) });
    setFormStatus("active");
    setActiveTab("personal");
    setShowForm(true);
  };

  const openEdit = (emp: Employee) => {
    setEditing(emp);
    const d = emp.data || {};
    setForm({ ...EMPTY_FORM, ...d });
    setFormStatus(emp.status || "active");
    setActiveTab("personal");
    setShowForm(true);
  };

  const save = async () => {
    if (!formValidation.validate(form)) return;
    const cleanedData: Record<string, any> = {};
    Object.entries(form).forEach(([k, v]) => {
      cleanedData[k] = v === "" ? null : v;
    });
    const body = { status: formStatus, data: cleanedData };
    const url = editing ? `${API}/hr/employees/${editing.id}` : `${API}/hr/employees`;
    await executeSave(() => authFetch(url, { method: editing ? "PUT" : "POST", headers, body: JSON.stringify(body) }), !!editing, { successMessage: editing ? "עובד עודכן בהצלחה" : "עובד נוצר בהצלחה", onSuccess: () => { setShowForm(false); load(); } });
  };

  const remove = async (id: number) => {
    await executeDelete(() => authFetch(`${API}/hr/employees/${id}`, { method: "DELETE", headers }), { confirm: "האם למחוק עובד זה?", successMessage: "עובד נמחק בהצלחה", onSuccess: load });
  };

  const exportData = filtered.map(e => ({
    id: e.id, status: STATUS_MAP[e.status]?.label || e.status,
    name: e.data?.full_name || `${e.data?.first_name||""} ${e.data?.last_name||""}`.trim(),
    id_number: e.data?.id_number || "", department: e.data?.department || "",
    job_title: e.data?.job_title || "", phone: e.data?.phone || e.data?.mobile || "",
    email: e.data?.email || "", hire_date: e.data?.hire_date || "",
    salary: e.data?.salary || "",
  }));

  const kpis = [
    { label: "סה\"כ עובדים", value: fmt(stats.total), icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "פעילים", value: fmt(stats.active), icon: UserCheck, color: "text-green-600", bg: "bg-green-50" },
    { label: "בחופשה", value: fmt(stats.on_leave), icon: Clock, color: "text-yellow-600", bg: "bg-yellow-50" },
    { label: "תקופת ניסיון", value: fmt(stats.probation), icon: Award, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "סיום העסקה", value: fmt(stats.terminated), icon: UserX, color: "text-red-600", bg: "bg-red-50" },
    { label: "מחלקות", value: fmt(departments.length), icon: Building2, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "% פעילים", value: stats.total > 0 ? `${Math.round((stats.active / stats.total) * 100)}%` : "0%", icon: UserCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "חדשים השנה", value: fmt(employees.filter(e => e.data?.hire_date && e.data.hire_date >= new Date().getFullYear() + "-01-01").length), icon: Calendar, color: "text-indigo-600", bg: "bg-indigo-50" },
  ];

  const F = (name: string, label: string, type = "text", opts?: string[]) => (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      {opts ? (
        <select value={form[name] || ""} onChange={e => setForm({ ...form, [name]: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
          <option value="">-- בחר --</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : type === "textarea" ? (
        <textarea value={form[name] || ""} onChange={e => setForm({ ...form, [name]: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} />
      ) : (
        <input type={type} value={form[name] || ""} onChange={e => setForm({ ...form, [name]: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
      )}
    </div>
  );

  const formTabs = [
    { id: "personal", label: "פרטים אישיים", icon: Users },
    { id: "employment", label: "העסקה", icon: Briefcase },
    { id: "bank", label: "פרטי בנק", icon: CreditCard },
    { id: "emergency", label: "קשר חירום", icon: Heart },
    { id: "notes", label: "הערות", icon: Hash },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><Users className="text-blue-600" /> תיקי עובדים</h1>
          <p className="text-muted-foreground mt-1">{total} עובדים רשומים במערכת</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ImportButton apiRoute="/api/hr/employees" onSuccess={load} />
          <ExportDropdown data={exportData} headers={{ id: "מזהה", name: "שם", id_number: "ת.ז.", department: "מחלקה", job_title: "תפקיד", phone: "טלפון", email: "אימייל", hire_date: "תאריך קליטה", salary: "שכר", status: "סטטוס" }} filename={"employees"} />
          <button onClick={() => printPage("עובדים")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Printer size={16} /> הדפסה</button>
          <button onClick={() => sendByEmail("עובדים - טכנו-כל עוזי", generateEmailBody("עובדים", exportData, { name: "שם", department: "מחלקה", job_title: "תפקיד", status: "סטטוס" }))} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Send size={16} /> שליחה</button>
          <div className="flex border rounded-lg overflow-hidden">
            <button onClick={() => setViewMode("grid")} className={`px-3 py-2 text-sm ${viewMode === "grid" ? "bg-blue-600 text-foreground" : "bg-card"}`}>כרטיסים</button>
            <button onClick={() => setViewMode("table")} className={`px-3 py-2 text-sm ${viewMode === "table" ? "bg-blue-600 text-foreground" : "bg-card"}`}>טבלה</button>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 text-foreground px-4 py-2 rounded-lg hover:bg-blue-700 shadow-lg text-sm"><Plus size={16} /> עובד חדש</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={`${kpi.bg} rounded-xl shadow-sm border p-3`}>
            <kpi.icon className={`${kpi.color} mb-1`} size={20} />
            <div className="text-lg font-bold">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]"><Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} /><input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="חיפוש לפי שם, ת.ז., מחלקה, תפקיד..." className="w-full pr-10 pl-4 py-2 border rounded-lg" /></div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }} className="border rounded-lg px-3 py-2">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="border rounded-lg px-3 py-2">
          <option value="all">כל המחלקות</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <BulkActions selectedIds={bulk.selectedIds} onClear={bulk.clearAll} entityName="עובדים" actions={defaultBulkActions} />

      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card border border-border/50 rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-muted/30" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-muted/30 rounded" />
                    <div className="h-3 w-24 bg-muted/20 rounded" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-full bg-muted/20 rounded" />
                  <div className="h-3 w-3/4 bg-muted/15 rounded" />
                  <div className="h-3 w-1/2 bg-muted/10 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) :
      viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 ? (
            <div className="col-span-3">
              <EmptyState
                icon={Users}
                title="עדיין אין עובדים במערכת"
                subtitle="הוסף את העובד הראשון שלך ובנה את צוות האנשים שלך"
                ctaLabel="➕ הוסף עובד ראשון"
                onCtaClick={openCreate}
              />
            </div>
          ) :
          filtered.map(emp => {
            const d = emp.data || {};
            const name = d.full_name || `${d.first_name || ""} ${d.last_name || ""}`.trim() || "ללא שם";
            return (
              <motion.div key={emp.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl shadow-sm border p-5 hover:shadow-md hover:border-blue-300 transition-all">
                <div className="flex items-start gap-4">
                  <BulkCheckbox checked={bulk.isSelected(emp.id)} onChange={() => bulk.toggle(emp.id)} />
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-lg font-bold text-blue-600">{name.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{name}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_MAP[emp.status]?.color || "bg-muted/50"}`}>{STATUS_MAP[emp.status]?.label || emp.status || "-"}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{d.job_title || d.position || d.role || "-"}</p>
                    {d.department && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Building2 size={12} /> {d.department}</p>}
                    {d.id_number && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><CreditCard size={12} /> ת.ז. {d.id_number}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {(d.phone || d.mobile) && <span className="flex items-center gap-1"><Phone size={12} />{d.mobile || d.phone}</span>}
                      {d.email && <span className="flex items-center gap-1"><Mail size={12} />{d.email}</span>}
                    </div>
                    {d.hire_date && <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Calendar size={12} /> קליטה: {d.hire_date}</p>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => openEdit(emp)} className="p-1.5 hover:bg-blue-500/10 rounded text-blue-600"><Edit2 size={14} /></button>
                    <button onClick={() => remove(emp.id)} className="p-1.5 hover:bg-red-500/10 rounded text-red-500"><Trash2 size={14} /></button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b"><tr>
              <th className="px-2 py-3 w-10"><BulkCheckbox checked={bulk.isAllSelected(filtered)} indeterminate={bulk.isSomeSelected(filtered)} onChange={() => bulk.toggleAll(filtered)} /></th>
              {[
                { key: "id", label: "#" }, { key: "full_name", label: "שם מלא" }, { key: "id_number", label: "ת.ז." },
                { key: "department", label: "מחלקה" }, { key: "job_title", label: "תפקיד" },
                { key: "phone", label: "טלפון" }, { key: "email", label: "אימייל" },
                { key: "hire_date", label: "תאריך קליטה" }, { key: "status", label: "סטטוס" },
              ].map(col => (
                <th key={col.key} className="px-3 py-3 text-right cursor-pointer hover:bg-muted/50" onClick={() => toggleSort(col.key)}>
                  <div className="flex items-center gap-1">{col.label} <ArrowUpDown size={12} /></div>
                </th>
              ))}
              <th className="px-3 py-3 text-right">פעולות</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={11}>
                  <EmptyState
                    icon={Users}
                    title="עדיין אין עובדים במערכת"
                    subtitle="הוסף את העובד הראשון שלך ובנה את צוות האנשים שלך"
                    ctaLabel="➕ הוסף עובד ראשון"
                    onCtaClick={openCreate}
                  />
                </td></tr>
              ) :
              filtered.map(emp => {
                const d = emp.data || {};
                const name = d.full_name || `${d.first_name || ""} ${d.last_name || ""}`.trim() || "ללא שם";
                return (
                  <tr key={emp.id} className="border-b hover:bg-blue-50/30">
                    <td className="px-2 py-2"><BulkCheckbox checked={bulk.isSelected(emp.id)} onChange={() => bulk.toggle(emp.id)} /></td>
                    <td className="px-3 py-2 text-muted-foreground">{emp.id}</td>
                    <td className="px-3 py-2 font-medium">{name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{d.id_number || "-"}</td>
                    <td className="px-3 py-2">{d.department || "-"}</td>
                    <td className="px-3 py-2">{d.job_title || d.position || d.role || "-"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{d.mobile || d.phone || "-"}</td>
                    <td className="px-3 py-2 text-xs">{d.email || "-"}</td>
                    <td className="px-3 py-2 text-xs">{d.hire_date || "-"}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_MAP[emp.status]?.color || "bg-muted/50"}`}>{STATUS_MAP[emp.status]?.label || emp.status}</span></td>
                    <td className="px-3 py-2 flex gap-1">
                      <button onClick={() => openEdit(emp)} className="p-1 hover:bg-blue-500/10 rounded text-blue-600"><Edit2 size={14} /></button>
                      <button onClick={async () => { const _dup = await duplicateRecord(`${API}/hr/employees`, emp.id); if (_dup.ok) { load(); } else { alert("שגיאה בשכפול: " + _dup.error); } }} className="p-1 hover:bg-slate-500/10 rounded text-muted-foreground" title="שכפול"><Copy size={14} /></button>
                      <button onClick={() => remove(emp.id)} className="p-1 hover:bg-red-500/10 rounded text-red-500"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 rounded-lg text-sm border disabled:opacity-30">הקודם</button>
          <span className="text-sm text-muted-foreground">עמוד {page + 1} מתוך {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 rounded-lg text-sm border disabled:opacity-30">הבא</button>
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 bg-card border-b px-6 py-4 flex justify-between items-center z-10 rounded-t-2xl">
                <h2 className="text-xl font-bold flex items-center gap-2"><Users className="text-blue-600" /> {editing ? "עריכת עובד" : "עובד חדש"}</h2>
                <button onClick={() => setShowForm(false)} className="p-2 hover:bg-muted/50 rounded-lg"><X size={20} /></button>
              </div>

              <div className="flex border-b overflow-x-auto">
                {formTabs.map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                    <tab.icon size={16} /> {tab.label}
                  </button>
                ))}
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">סטטוס</label>
                    <select value={formStatus} onChange={e => setFormStatus(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                      {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  {F("employee_id", "מספר עובד")}
                </div>

                {activeTab === "personal" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {F("full_name", "שם מלא *")}
                    {F("id_number", "תעודת זהות")}
                    {F("birth_date", "תאריך לידה", "date")}
                    {F("gender", "מגדר", "text", ["זכר", "נקבה", "אחר"])}
                    {F("marital_status", "מצב משפחתי", "text", ["רווק/ה", "נשוי/אה", "גרוש/ה", "אלמן/ה"])}
                    {F("children", "מספר ילדים", "number")}
                    {F("address", "כתובת")}
                    {F("city", "עיר")}
                    {F("zip_code", "מיקוד")}
                    {F("phone", "טלפון קווי")}
                    {F("mobile", "נייד")}
                    {F("email", "אימייל", "email")}
                    {F("education", "השכלה", "text", ["תיכונית", "מקצועית", "תואר ראשון", "תואר שני", "תואר שלישי", "הנדסאי", "טכנאי"])}
                    {F("military_service", "שירות צבאי")}
                    {F("health_fund", "קופת חולים", "text", ["כללית", "מכבי", "מאוחדת", "לאומית"])}
                  </div>
                )}

                {activeTab === "employment" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {F("department", "מחלקה", "text", DEPT_OPTIONS)}
                    {F("position", "תפקיד")}
                    {F("job_title", "כותרת תפקיד")}
                    {F("manager", "ממונה ישיר")}
                    {F("hire_date", "תאריך קליטה", "date")}
                    {F("employment_type", "סוג העסקה", "text", ["משרה מלאה", "משרה חלקית", "שעתי", "קבלן", "פרילנסר", "התמחות"])}
                    {F("salary", "שכר ברוטו", "number")}
                    {F("currency", "מטבע", "text", ["ILS", "USD", "EUR"])}
                    {F("work_hours", "שעות עבודה שבועיות", "number")}
                    {F("vacation_days", "ימי חופשה שנתיים", "number")}
                    {F("sick_days", "ימי מחלה שנתיים", "number")}
                    {F("probation_end", "סוף תקופת ניסיון", "date")}
                  </div>
                )}

                {activeTab === "bank" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {F("bank_name", "שם בנק", "text", ["הפועלים", "לאומי", "דיסקונט", "מזרחי-טפחות", "הבינלאומי", "איגוד", "מרכנתיל"])}
                    {F("bank_branch", "מספר סניף")}
                    {F("bank_account", "מספר חשבון")}
                    {F("pension_fund", "קרן פנסיה")}
                    {F("pension_percent", "אחוז הפרשה", "number")}
                    {F("hishtalmut_fund", "קרן השתלמות")}
                    {F("hishtalmut_percent", "אחוז הפרשה", "number")}
                    {F("tax_deduction_points", "נקודות זיכוי", "number")}
                  </div>
                )}

                {activeTab === "emergency" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {F("emergency_name", "שם איש קשר")}
                    {F("emergency_phone", "טלפון איש קשר")}
                    {F("emergency_relation", "קרבה", "text", ["בן/בת זוג", "אב/אם", "אח/אחות", "ילד/ה", "חבר/ה", "אחר"])}
                    {F("emergency_name2", "איש קשר נוסף")}
                    {F("emergency_phone2", "טלפון נוסף")}
                    {F("emergency_relation2", "קרבה נוספת", "text", ["בן/בת זוג", "אב/אם", "אח/אחות", "ילד/ה", "חבר/ה", "אחר"])}
                  </div>
                )}

                {activeTab === "notes" && (
                  <div className="space-y-3">
                    {F("notes", "הערות כלליות", "textarea")}
                    {F("medical_notes", "הערות רפואיות", "textarea")}
                    {F("skills", "כישורים מיוחדים", "textarea")}
                    {F("certifications", "הסמכות ורישיונות", "textarea")}
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 bg-card border-t px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
                <button onClick={() => setShowForm(false)} disabled={saving} className="px-6 py-2.5 border rounded-lg hover:bg-muted/30 text-sm disabled:opacity-50">ביטול</button>
                <button onClick={save} disabled={saving} className="px-6 py-2.5 bg-blue-600 text-foreground rounded-lg hover:bg-blue-700 text-sm font-medium shadow-lg disabled:opacity-50 flex items-center gap-2">{saving ? <Loader2 size={16} className="animate-spin" /> : null}{saving ? "שומר..." : editing ? "עדכון" : "שמירה"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
