import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";
import {
  Users, Clock, CalendarDays, TrendingUp, UserCheck, UserX,
  DollarSign, BarChart3, Briefcase, Award, GraduationCap, Calendar,
  Target, Star, ArrowUpRight, AlertTriangle, CheckCircle2, Hash, Bot, Layers,
  Search, ArrowUpDown, Eye, X
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCur = (v: any) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(Number(v || 0));

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

export default function HRDashboard() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [hrSum, dashboard] = await Promise.all([
        authFetch(`${API}/hr-summary`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
        authFetch(`${API}/hr/dashboard`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
      ]);
      setSummary({ ...hrSum, dashboard });
    } catch { setError("שגיאה בטעינת נתונים"); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const emp = summary.employees || summary.dashboard?.employees || {};
  const leaves = summary.leaves || {};
  const training = summary.training || {};
  const recruitment = summary.recruitment || {};
  const reviews = summary.reviews || {};
  const att = summary.dashboard?.attendance || {};
  const shifts = summary.dashboard?.shifts || {};

  const kpis = [
    { label: "סך עובדים", value: fmt(emp.total || emp.total_employees || 0), icon: Users, color: "text-blue-400" },
    { label: "עובדים פעילים", value: fmt(emp.active || emp.active_employees || 0), icon: UserCheck, color: "text-green-400" },
    { label: "נוכחים היום", value: fmt(att.present_today || 0), icon: Clock, color: "text-yellow-400" },
    { label: "בחופשה", value: fmt(emp.on_leave || 0), icon: CalendarDays, color: "text-purple-400" },
    { label: "חופשות ממתינות", value: fmt(leaves.pending || 0), icon: AlertTriangle, color: "text-orange-400" },
    { label: "משרות פתוחות", value: fmt(recruitment.active || 0), icon: Briefcase, color: "text-cyan-400" },
    { label: "הדרכות פעילות", value: fmt(training.active || 0), icon: GraduationCap, color: "text-indigo-400" },
    { label: "ציון הערכה ממוצע", value: Number(reviews.avg_score || 0).toFixed(1), icon: Star, color: "text-amber-400" },
  ];

  const moduleCategories: Record<string, string> = {
    employees: "כוח אדם",
    time: "זמן ונוכחות",
    development: "פיתוח וגיוס",
    management: "ניהול",
  };

  const modules = [
    { href: "/hr/employees", title: "ניהול עובדים", desc: "תיקי עובדים, פרטים אישיים ומקצועיים", icon: Users, color: "text-blue-400", bg: "bg-blue-500/10", count: fmt(emp.total || emp.total_employees || 0), category: "employees" },
    { href: "/hr/attendance", title: "נוכחות ושעות", desc: "מעקב נוכחות, שעות עבודה ושעות נוספות", icon: Clock, color: "text-yellow-400", bg: "bg-yellow-500/10", count: `${fmt(att.present_today || 0)} היום`, category: "time" },
    { href: "/hr/payroll", title: "חישוב שכר", desc: "ניהול שכר, ניכויים, הפרשות ותשלומים", icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10", count: "", category: "employees" },
    { href: "/hr/shifts", title: "משמרות", desc: "ניהול משמרות, לוח זמנים וסידור עבודה", icon: CalendarDays, color: "text-purple-400", bg: "bg-purple-500/10", count: `${fmt(shifts.active_shifts || 0)} פעילות`, category: "time" },
    { href: "/hr/leave-management", title: "ניהול חופשות", desc: "בקשות חופשה, מחלה, מילואים ואישורים", icon: Calendar, color: "text-teal-400", bg: "bg-teal-500/10", count: `${fmt(leaves.total || 0)} בקשות`, category: "time" },
    { href: "/hr/training", title: "הדרכות ופיתוח", desc: "תכנון הדרכות, הסמכות ומעקב השתתפות", icon: GraduationCap, color: "text-violet-400", bg: "bg-violet-500/10", count: `${fmt(training.total || 0)} הדרכות`, category: "development" },
    { href: "/hr/recruitment", title: "גיוס עובדים", desc: "משרות פתוחות, מועמדים, ראיונות והצעות", icon: Briefcase, color: "text-cyan-400", bg: "bg-cyan-500/10", count: `${fmt(recruitment.total || 0)} משרות`, category: "development" },
    { href: "/hr/performance-reviews", title: "הערכות ביצועים", desc: "הערכות עובדים, ציונים, משוב וקידום", icon: Award, color: "text-amber-400", bg: "bg-amber-500/10", count: `${fmt(reviews.total || 0)} הערכות`, category: "development" },
    { href: "/hr/employee-value", title: "שווי עובד", desc: "ניתוח ערך ופרודוקטיביות עובדים", icon: BarChart3, color: "text-blue-400", bg: "bg-blue-500/10", count: "", category: "management" },
    { href: "/hr/contractors", title: "תשלום קבלנים", desc: "ניהול תשלומים וחוזים לקבלנים", icon: Target, color: "text-orange-400", bg: "bg-orange-500/10", count: `${fmt(emp.contractors || 0)} קבלנים`, category: "management" },
    { href: "/hr/departments", title: "מחלקות", desc: "ניהול מחלקות הארגון, עובדים לפי מחלקה", icon: Layers, color: "text-indigo-400", bg: "bg-indigo-500/10", count: "", category: "management" },
    { href: "/hr/org-chart", title: "מבנה ארגוני", desc: "תרשים ארגוני ודרגי ניהול", icon: Users, color: "text-purple-400", bg: "bg-purple-500/10", count: "", category: "management" },
    { href: "/hr/benefits", title: "הטבות עובדים", desc: "ניהול חבילת הטבות לעובדים", icon: Award, color: "text-red-400", bg: "bg-red-500/10", count: "", category: "employees" },
    { href: "/hr/meetings", title: "פגישות AI", desc: "ניהול פגישות חכם עם סיכום אוטומטי בינה מלאכותית", icon: Bot, color: "text-violet-400", bg: "bg-violet-500/10", count: "", category: "management" },
  ];

  const filteredModules = useMemo(() => {
    let data = modules;
    if (search) data = data.filter(m => m.title.includes(search) || m.desc.includes(search));
    if (filterCategory !== "all") data = data.filter(m => m.category === filterCategory);
    pagination.setTotalItems(data.length);
    return data;
  }, [search, filterCategory, modules]);

  const exportData = modules.map(m => ({ title: m.title, description: m.desc, category: moduleCategories[m.category] || m.category, count: m.count }));

  return (
    <div className="space-y-6 p-4 md:p-6" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-3"><Users className="w-7 h-7 text-blue-400" /> משאבי אנוש — דשבורד</h1>
          <p className="text-muted-foreground mt-1">סקירה מקיפה: כוח אדם, נוכחות, שכר, גיוס, הדרכות והערכות ביצועים</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={exportData} headers={{ title: "מודול", description: "תיאור", category: "קטגוריה", count: "נתון" }} filename="hr_dashboard" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <span className="mr-3 text-muted-foreground">טוען דשבורד משאבי אנוש...</span>
        </div>
      ) : error ? (
        <div className="text-center py-16 text-red-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">שגיאה בטעינה</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button>
        </div>
      ) : (<>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpis.map((kpi, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-card border border-border/50 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <kpi.icon className={`w-6 h-6 ${kpi.color}`} />
                <ArrowUpRight className={`w-4 h-4 ${kpi.color}`} />
              </div>
              <p className="text-xl font-bold text-foreground mt-2">{kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
            </motion.div>
          ))}
        </div>

        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative min-w-[200px] flex-1 max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש מודול..."
              className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
            <option value="all">כל הקטגוריות</option>
            {Object.entries(moduleCategories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="text-sm text-muted-foreground">{filteredModules.length} מודולים</span>
        </div>

        {filteredModules.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">לא נמצאו מודולים</p>
            <p className="text-sm mt-1">נסה לשנות את החיפוש או הסינון</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredModules.map((mod, i) => (
              <Link key={i} href={mod.href}>
                <div className="border border-border/50 rounded-2xl p-5 hover:border-primary/30 transition-all cursor-pointer bg-card group" onClick={e => { if ((e.target as HTMLElement).closest('.detail-btn')) { e.preventDefault(); setViewDetail(mod); } }}>
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl ${mod.bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                      <mod.icon className={`w-6 h-6 ${mod.color}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-foreground">{mod.title}</h3>
                        {mod.count && <Badge className="bg-muted/50 text-muted-foreground text-[10px]">{mod.count}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{mod.desc}</p>
                      <div className="mt-2">
                        <Badge className="text-[10px] bg-primary/10 text-primary">{moduleCategories[mod.category]}</Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-border/50 rounded-2xl p-4 bg-card">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3"><Calendar className="w-4 h-4 text-teal-400" /> חופשות</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">{'סה"כ בקשות'}</span><span className="text-foreground font-medium">{fmt(leaves.total || 0)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">ממתינות לאישור</span><span className="text-yellow-400 font-medium">{fmt(leaves.pending || 0)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">מאושרות</span><span className="text-green-400 font-medium">{fmt(leaves.approved || 0)}</span></div>
            </div>
          </div>
          <div className="border border-border/50 rounded-2xl p-4 bg-card">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3"><Briefcase className="w-4 h-4 text-cyan-400" /> גיוס</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">משרות פתוחות</span><span className="text-foreground font-medium">{fmt(recruitment.active || 0)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">עמדות לאיוש</span><span className="text-cyan-400 font-medium">{fmt(recruitment.open_positions || 0)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">{'סה"כ תהליכים'}</span><span className="text-blue-400 font-medium">{fmt(recruitment.total || 0)}</span></div>
            </div>
          </div>
          <div className="border border-border/50 rounded-2xl p-4 bg-card">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3"><Award className="w-4 h-4 text-amber-400" /> הערכות</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">{'סה"כ הערכות'}</span><span className="text-foreground font-medium">{fmt(reviews.total || 0)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">ממתינות</span><span className="text-yellow-400 font-medium">{fmt(reviews.pending || 0)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">ציון ממוצע</span><span className="text-amber-400 font-medium">{Number(reviews.avg_score || 0).toFixed(1)}/5</span></div>
            </div>
          </div>
        </div>
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Users className="w-5 h-5 text-blue-400" />{viewDetail.title}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מודול" value={viewDetail.title} />
                <DetailField label="קטגוריה" value={moduleCategories[viewDetail.category]} />
                <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.desc} /></div>
                <DetailField label="נתון" value={viewDetail.count || "—"} />
                <DetailField label="נתיב" value={viewDetail.href} />
              </div>}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="hr-modules" entityId={viewDetail.href} relations={[{key:"employees",label:"עובדים",icon:"Users"},{key:"reports",label:"דוחות",icon:"BarChart3"}]} /></div>}
              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="hr-modules" entityId={viewDetail.href} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="hr-modules" entityId={viewDetail.href} /></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <Link href={viewDetail.href}><button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90">פתח מודול</button></Link>
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
