import { useState, useEffect, useMemo } from "react";
import {
  Building2, Plus, Search, MoreVertical, Edit2, Trash2,
  Users, ChevronRight, X, Palette, AlertCircle, Layers
} from "lucide-react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import StatusTransition from "@/components/status-transition";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";

interface DeptDef {
  nameEn: string;
  desc: string;
  color: string;
}

const BUILTIN_DEPTS: Record<string, DeptDef> = {
  "ייצור":        { nameEn: "Manufacturing",        desc: "ניהול קווי ייצור, תכנון ובקרת תהליכי ייצור",      color: "blue" },
  "מכירות":       { nameEn: "Sales",                desc: "ניהול מכירות, לקוחות, הצעות מחיר ועסקאות",        color: "green" },
  "הנהלה":        { nameEn: "Management",           desc: "הנהלה בכירה, ניהול אסטרטגי וקבלת החלטות",         color: "purple" },
  "כספים":        { nameEn: "Finance",              desc: "ניהול כספים, חשבונאות, תקציבים ודוחות",            color: "emerald" },
  "לוגיסטיקה":   { nameEn: "Logistics",            desc: "ניהול שרשרת אספקה, הובלה ומחסנות",                 color: "orange" },
  "שירות":        { nameEn: "Customer Service",     desc: "שירות לקוחות, תמיכה וטיפול בפניות",               color: "cyan" },
  "הנדסה":        { nameEn: "Engineering",          desc: "תכנון הנדסי, פיתוח מוצר ומחקר ופיתוח",            color: "indigo" },
  "IT":           { nameEn: "Information Technology", desc: "תשתיות IT, פיתוח תוכנה ואבטחת מידע",           color: "violet" },
  "משאבי אנוש":  { nameEn: "Human Resources",      desc: "גיוס עובדים, פיתוח ארגוני ורווחת עובדים",         color: "pink" },
  "שיווק":        { nameEn: "Marketing",            desc: "מיתוג, שיווק דיגיטלי, קמפיינים ואנליטיקה",        color: "amber" },
  "חיתוך":        { nameEn: "Cutting",              desc: "תהליכי חיתוך, עיבוד חומרים ובקרת מלאי",           color: "red" },
  "ריתוך":        { nameEn: "Welding",              desc: "עבודות ריתוך ועיבוד מתכת",                        color: "orange" },
  "צביעה":        { nameEn: "Painting",             desc: "ציפוי, צביעה ועיבוד פני שטח",                     color: "yellow" },
  "הרכבה":        { nameEn: "Assembly",             desc: "הרכבת מוצרים, בדיקות וחתימה",                     color: "teal" },
  "מחסן":         { nameEn: "Warehouse",            desc: "ניהול מלאי, אחסון, קבלה ואספקה",                  color: "slate" },
  "בקרת איכות":  { nameEn: "Quality Control",      desc: "בקרת איכות, בדיקות ותיקוף מוצרים",                color: "lime" },
  "תחזוקה":       { nameEn: "Maintenance",          desc: "תחזוקת מכונות, תשתיות ומערכות",                   color: "sky" },
  "רכש":          { nameEn: "Procurement",          desc: "רכש, ניהול ספקים וחוזים",                         color: "rose" },
  "אחזקה":        { nameEn: "Facilities",           desc: "ניהול מתקנים, ניקיון ותחזוקת בניין",               color: "stone" },
  "התקנות":       { nameEn: "Installation",         desc: "שירותי התקנה ופרויקטים בשטח",                     color: "fuchsia" },
};

const COLOR_OPTIONS = [
  { key: "blue",    label: "כחול",     cls: "bg-blue-500" },
  { key: "green",   label: "ירוק",     cls: "bg-green-500" },
  { key: "purple",  label: "סגול",     cls: "bg-purple-500" },
  { key: "emerald", label: "ירוק כהה", cls: "bg-emerald-500" },
  { key: "orange",  label: "כתום",     cls: "bg-orange-500" },
  { key: "cyan",    label: "תכלת",     cls: "bg-cyan-500" },
  { key: "indigo",  label: "נייבי",    cls: "bg-indigo-500" },
  { key: "violet",  label: "סגלגל",   cls: "bg-violet-500" },
  { key: "pink",    label: "ורוד",     cls: "bg-pink-500" },
  { key: "amber",   label: "זהב",      cls: "bg-amber-500" },
  { key: "red",     label: "אדום",     cls: "bg-red-500" },
  { key: "teal",    label: "ציאן",     cls: "bg-teal-500" },
  { key: "lime",    label: "לימון",    cls: "bg-lime-500" },
  { key: "sky",     label: "שמיים",    cls: "bg-sky-500" },
  { key: "rose",    label: "וורד",     cls: "bg-rose-500" },
  { key: "fuchsia", label: "פוקסיה",   cls: "bg-fuchsia-500" },
  { key: "slate",   label: "אפור",     cls: "bg-muted" },
  { key: "yellow",  label: "צהוב",     cls: "bg-yellow-500" },
];

const COLOR_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  blue:    { bg: "bg-blue-500/15",    border: "border-blue-500/30",    text: "text-blue-400" },
  green:   { bg: "bg-green-500/15",   border: "border-green-500/30",   text: "text-green-400" },
  purple:  { bg: "bg-purple-500/15",  border: "border-purple-500/30",  text: "text-purple-400" },
  emerald: { bg: "bg-emerald-500/15", border: "border-emerald-500/30", text: "text-emerald-400" },
  orange:  { bg: "bg-orange-500/15",  border: "border-orange-500/30",  text: "text-orange-400" },
  cyan:    { bg: "bg-cyan-500/15",    border: "border-cyan-500/30",    text: "text-cyan-400" },
  indigo:  { bg: "bg-indigo-500/15",  border: "border-indigo-500/30",  text: "text-indigo-400" },
  violet:  { bg: "bg-violet-500/15",  border: "border-violet-500/30",  text: "text-violet-400" },
  pink:    { bg: "bg-pink-500/15",    border: "border-pink-500/30",    text: "text-pink-400" },
  amber:   { bg: "bg-amber-500/15",   border: "border-amber-500/30",   text: "text-amber-400" },
  red:     { bg: "bg-red-500/15",     border: "border-red-500/30",     text: "text-red-400" },
  teal:    { bg: "bg-teal-500/15",    border: "border-teal-500/30",    text: "text-teal-400" },
  lime:    { bg: "bg-lime-500/15",    border: "border-lime-500/30",    text: "text-lime-400" },
  sky:     { bg: "bg-sky-500/15",     border: "border-sky-500/30",     text: "text-sky-400" },
  rose:    { bg: "bg-rose-500/15",    border: "border-rose-500/30",    text: "text-rose-400" },
  fuchsia: { bg: "bg-fuchsia-500/15", border: "border-fuchsia-500/30", text: "text-fuchsia-400" },
  slate:   { bg: "bg-muted/15",   border: "border-slate-500/30",   text: "text-muted-foreground" },
  stone:   { bg: "bg-stone-500/15",   border: "border-stone-500/30",   text: "text-stone-400" },
  yellow:  { bg: "bg-yellow-500/15",  border: "border-yellow-500/30",  text: "text-yellow-400" },
};

interface Department {
  nameHe: string;
  nameEn: string;
  desc: string;
  color: string;
  employeeCount: number;
}

interface FormData {
  nameHe: string;
  nameEn: string;
  desc: string;
  color: string;
}

const EMPTY_FORM: FormData = { nameHe: "", nameEn: "", desc: "", color: "blue" };

export default function DepartmentsPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [overrides, setOverrides] = useState<Record<string, DeptDef>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<Record<string, DeptDef>>({});

  const [showForm, setShowForm] = useState(false);
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({ ...EMPTY_FORM });
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [detailTab, setDetailTab] = useState("details");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({
    nameHe: [{ type: "required", message: "שם מחלקה נדרש" }],
  });

  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  useEffect(() => {
    setLoading(true);
    authFetch(`${API}/hr/employees?limit=9999`, { headers })
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        const list = Array.isArray(data) ? data : (data.items || data.employees || []);
        setEmployees(list);
        setLoading(false);
      })
      .catch(() => { setEmployees([]); setLoading(false); });
  }, []);

  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    employees.forEach(emp => {
      const dept = emp.data?.department || emp.department || "";
      if (dept) counts[dept] = (counts[dept] || 0) + 1;
    });
    return counts;
  }, [employees]);

  const departments: Department[] = useMemo(() => {
    const result: Department[] = [];
    const seen = new Set<string>();

    const buildDept = (nameHe: string, base: DeptDef): Department => {
      const ov = overrides[nameHe];
      const def = ov ?? base;
      return {
        nameHe,
        nameEn: def.nameEn,
        desc: def.desc,
        color: def.color,
        employeeCount: deptCounts[nameHe] || 0,
      };
    };

    Object.entries(BUILTIN_DEPTS).forEach(([nameHe, base]) => {
      if (hidden.has(nameHe)) return;
      result.push(buildDept(nameHe, base));
      seen.add(nameHe);
    });

    Object.entries(extras).forEach(([nameHe, def]) => {
      if (seen.has(nameHe) || hidden.has(nameHe)) return;
      result.push({ nameHe, nameEn: def.nameEn, desc: def.desc, color: def.color, employeeCount: deptCounts[nameHe] || 0 });
      seen.add(nameHe);
    });

    Object.keys(deptCounts).forEach(nameHe => {
      if (seen.has(nameHe)) return;
      result.push({ nameHe, nameEn: nameHe, desc: "", color: "slate", employeeCount: deptCounts[nameHe] || 0 });
    });

    return result.sort((a, b) => b.employeeCount - a.employeeCount || a.nameHe.localeCompare(b.nameHe, "he"));
  }, [deptCounts, overrides, hidden, extras]);

  const filtered = useMemo(() =>
    departments.filter(d =>
      !search ||
      d.nameHe.includes(search) ||
      d.nameEn.toLowerCase().includes(search.toLowerCase()) ||
      d.desc.includes(search)
    ),
    [departments, search]
  );

  const openAdd = () => {
    setEditingDept(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (dept: Department) => {
    setEditingDept(dept.nameHe);
    setForm({ nameHe: dept.nameHe, nameEn: dept.nameEn, desc: dept.desc, color: dept.color });
    setFormError("");
    setShowForm(true);
    setOpenMenu(null);
  };

  const handleSave = () => {
    const nameHe = form.nameHe.trim();
    if (!nameHe) { setFormError("שם המחלקה בעברית הוא שדה חובה"); return; }

    const def: DeptDef = { nameEn: form.nameEn, desc: form.desc, color: form.color };

    if (editingDept) {
      if (editingDept === nameHe) {
        if (BUILTIN_DEPTS[nameHe]) {
          setOverrides(prev => ({ ...prev, [nameHe]: def }));
        } else {
          setExtras(prev => ({ ...prev, [nameHe]: def }));
        }
      } else {
        if (BUILTIN_DEPTS[editingDept]) {
          setHidden(prev => new Set([...prev, editingDept]));
        } else {
          setExtras(prev => { const n = { ...prev }; delete n[editingDept]; return n; });
        }
        setExtras(prev => ({ ...prev, [nameHe]: def }));
        setOverrides(prev => { const n = { ...prev }; delete n[editingDept]; return n; });
      }
    } else {
      setExtras(prev => ({ ...prev, [nameHe]: def }));
    }

    setShowForm(false);
  };

  const handleDelete = (nameHe: string) => {
    if (BUILTIN_DEPTS[nameHe]) {
      setHidden(prev => new Set([...prev, nameHe]));
      setOverrides(prev => { const n = { ...prev }; delete n[nameHe]; return n; });
    } else {
      setExtras(prev => { const n = { ...prev }; delete n[nameHe]; return n; });
      setHidden(prev => new Set([...prev, nameHe]));
    }
    setDeleteConfirm(null);
    setOpenMenu(null);
  };

  const getStyle = (color: string) => COLOR_STYLE[color] || COLOR_STYLE.slate;

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-3">
            <Layers className="w-7 h-7 text-blue-400" />
            מחלקות
            <span className="text-sm font-normal bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded-full px-3 py-0.5">
              {departments.length}
            </span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">ניהול מחלקות הארגון ועובדיהן</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-foreground font-medium px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          הוספת מחלקה +
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          className="w-full bg-card border border-border rounded-lg py-2 pr-9 pl-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          placeholder="חיפוש מחלקה..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2">
            <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <BulkActions selectedIds={bulk.selectedIds} onClear={bulk.clearAll} entityName="מחלקות" actions={defaultBulkActions} />
          <AnimatePresence>
            {filtered.map((dept) => {
              const style = getStyle(dept.color);
              return (
                <motion.div
                  key={dept.nameHe}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="relative bg-card border border-border/50 rounded-xl p-5 hover:border-primary/30 transition-all group cursor-pointer"
                  onClick={() => { setViewDetail(dept); setDetailTab("details"); }}
                >
                  <div className="absolute top-3 left-3 z-10" onClick={e => e.stopPropagation()}><BulkCheckbox checked={bulk.isSelected(dept.nameHe)} onChange={() => bulk.toggle(dept.nameHe)} /></div>
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 rounded-xl ${style.bg} border ${style.border} flex items-center justify-center`}>
                      <Building2 className={`w-6 h-6 ${style.text}`} />
                    </div>
                    <div className="relative">
                      <button
                        onClick={() => setOpenMenu(openMenu === dept.nameHe ? null : dept.nameHe)}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {openMenu === dept.nameHe && (
                        <div className="absolute left-0 top-8 bg-popover border border-border rounded-lg shadow-xl z-20 min-w-[130px] py-1">
                          <button
                            onClick={() => openEdit(dept)}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted text-foreground"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> עריכה
                          </button>
                          <button
                            onClick={() => { setDeleteConfirm(dept.nameHe); setOpenMenu(null); }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> מחיקה
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <h3 className="font-semibold text-foreground text-base leading-tight">{dept.nameHe}</h3>
                  <p className={`text-xs ${style.text} mt-0.5`}>{dept.nameEn}</p>
                  {dept.desc && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed">{dept.desc}</p>
                  )}

                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Users className="w-4 h-4" />
                      <span className="font-medium text-foreground">{dept.employeeCount}</span>
                      <span>עובדים</span>
                    </div>
                    <Link
                      href={`/hr/employees?department=${encodeURIComponent(dept.nameHe)}`}
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
                    >
                      פירוט
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-16 text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>לא נמצאו מחלקות</p>
            </div>
          )}
        </motion.div>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}
          >
            <motion.div
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div className="flex items-center justify-between p-5 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">
                  {editingDept ? "עריכת מחלקה" : "הוספת מחלקה חדשה"}
                </h2>
                <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {formError && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-3 py-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {formError}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם המחלקה בעברית *</label>
                  <input
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                    placeholder="לדוגמה: ייצור"
                    value={form.nameHe}
                    onChange={e => { setForm(f => ({ ...f, nameHe: e.target.value })); setFormError(""); }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם המחלקה באנגלית</label>
                  <input
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                    placeholder="e.g. Manufacturing"
                    value={form.nameEn}
                    onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))}
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור קצר</label>
                  <textarea
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50 resize-none"
                    placeholder="תיאור קצר של תחום האחריות של המחלקה"
                    rows={2}
                    value={form.desc}
                    onChange={e => setForm(f => ({ ...f, desc: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">
                    <span className="flex items-center gap-1.5"><Palette className="w-3.5 h-3.5" /> צבע</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_OPTIONS.map(c => (
                      <button
                        key={c.key}
                        onClick={() => setForm(f => ({ ...f, color: c.key }))}
                        title={c.label}
                        className={`w-7 h-7 rounded-full ${c.cls} transition-all ${form.color === c.key ? "ring-2 ring-white ring-offset-2 ring-offset-card scale-110" : "opacity-70 hover:opacity-100"}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 p-5 border-t border-border">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  ביטול
                </button>
                <button
                  onClick={handleSave}
                  className="px-5 py-2 bg-green-600 hover:bg-green-500 text-foreground font-medium text-sm rounded-lg transition-colors"
                >
                  {editingDept ? "שמירה" : "הוספה"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6"
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
            >
              <h2 className="text-lg font-semibold text-foreground mb-2">מחיקת מחלקה</h2>
              <p className="text-sm text-muted-foreground mb-5">
                האם אתה בטוח שברצונך למחוק את המחלקה <span className="text-foreground font-medium">"{deleteConfirm}"</span>?
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
                  ביטול
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-foreground text-sm font-medium rounded-lg transition-colors"
                >
                  מחיקה
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {viewDetail && (
        <AnimatePresence>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center p-5 border-b border-border">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Building2 className="w-5 h-5 text-primary" /> {viewDetail.nameHe}</h2>
                <button onClick={() => setViewDetail(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && <div className="p-5 space-y-3">
                <div className="flex justify-between py-1.5 border-b border-border/20"><span className="text-sm text-muted-foreground">שם בעברית</span><span className="text-sm text-foreground font-medium">{viewDetail.nameHe}</span></div>
                <div className="flex justify-between py-1.5 border-b border-border/20"><span className="text-sm text-muted-foreground">שם באנגלית</span><span className="text-sm text-foreground font-medium">{viewDetail.nameEn}</span></div>
                <div className="flex justify-between py-1.5 border-b border-border/20"><span className="text-sm text-muted-foreground">תיאור</span><span className="text-sm text-foreground">{viewDetail.desc || "—"}</span></div>
                <div className="flex justify-between py-1.5 border-b border-border/20"><span className="text-sm text-muted-foreground">עובדים</span><span className="text-sm text-foreground font-bold">{viewDetail.employeeCount}</span></div>
              </div>}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="departments" entityId={viewDetail.nameHe} relations={[{key:"employees",label:"עובדים",icon:"Users"},{key:"budget",label:"תקציב",icon:"DollarSign"}]} /></div>}
              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="departments" entityId={viewDetail.nameHe} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="departments" entityId={viewDetail.nameHe} /></div>}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}

      {openMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
      )}
    </div>
  );
}
