import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import {
  Building2, Search, Plus, Edit2, Trash2, X, Save, Eye, ArrowUpDown, AlertTriangle,
  Users, DollarSign, TrendingUp, ChevronDown, ChevronRight, RefreshCw,
  BarChart3, Briefcase, UserPlus, Target, GitBranch, Layers, Settings,
  Factory, Wrench, Paintbrush, Shield, Truck, ShoppingCart, Megaphone,
  Calculator, Monitor, Cog, Ruler, HardHat, Phone, Scale, Crown
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (n: any) => Number(n || 0).toLocaleString("he-IL");
const fmtC = (n: any) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(Number(n || 0));

const DEPT_TYPES: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  production: { label: "ייצור", icon: Factory, color: "text-orange-400", bg: "bg-orange-500/10" },
  admin: { label: "מנהלה", icon: Building2, color: "text-gray-400", bg: "bg-gray-500/10" },
  sales: { label: "מכירות", icon: Target, color: "text-blue-400", bg: "bg-blue-500/10" },
  finance: { label: "כספים", icon: Calculator, color: "text-green-400", bg: "bg-green-500/10" },
  hr: { label: "משאבי אנוש", icon: Users, color: "text-purple-400", bg: "bg-purple-500/10" },
  logistics: { label: "לוגיסטיקה", icon: Truck, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  engineering: { label: "הנדסה", icon: Cog, color: "text-indigo-400", bg: "bg-indigo-500/10" },
  quality: { label: "בקרת איכות", icon: Shield, color: "text-teal-400", bg: "bg-teal-500/10" },
  field: { label: "שטח", icon: HardHat, color: "text-amber-400", bg: "bg-amber-500/10" },
  it: { label: "IT", icon: Monitor, color: "text-violet-400", bg: "bg-violet-500/10" },
  management: { label: "הנהלה", icon: Crown, color: "text-yellow-400", bg: "bg-yellow-500/10" },
  marketing: { label: "שיווק", icon: Megaphone, color: "text-pink-400", bg: "bg-pink-500/10" },
  legal: { label: "משפטי", icon: Scale, color: "text-slate-400", bg: "bg-slate-500/10" },
  procurement: { label: "רכש", icon: ShoppingCart, color: "text-lime-400", bg: "bg-lime-500/10" },
};

const ROLE_LEVELS = [
  { key: "director", label: "מנהל בכיר" },
  { key: "manager", label: "מנהל" },
  { key: "supervisor", label: "מפקח" },
  { key: "lead", label: "ראש צוות" },
  { key: "senior", label: "בכיר" },
  { key: "junior", label: "זוטר" },
  { key: "intern", label: "מתמחה" },
];
const ROLE_LEVEL_MAP = Object.fromEntries(ROLE_LEVELS.map(r => [r.key, r]));

const BUDGET_CATEGORIES = [
  { key: "salaries", label: "שכר" },
  { key: "equipment", label: "ציוד" },
  { key: "materials", label: "חומרים" },
  { key: "training", label: "הכשרה" },
  { key: "travel", label: "נסיעות" },
  { key: "software", label: "תוכנה" },
  { key: "other", label: "אחר" },
];

type Tab = "org-chart" | "departments" | "roles" | "budgets" | "dashboard";

export default function DepartmentManager() {
  const [tab, setTab] = useState<Tab>("org-chart");
  const [departments, setDepartments] = useState<any[]>([]);
  const [orgChart, setOrgChart] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>({});
  const [headcount, setHeadcount] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"department" | "role" | "budget" | "position">("department");
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [detailRoles, setDetailRoles] = useState<any[]>([]);
  const [detailBudgets, setDetailBudgets] = useState<any[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [dRes, oRes, dashRes, hRes] = await Promise.all([
        authFetch(`${API}/departments`),
        authFetch(`${API}/departments/org-chart`),
        authFetch(`${API}/departments/dashboard`).catch(() => null),
        authFetch(`${API}/departments/headcount-summary`).catch(() => null),
      ]);
      if (dRes.ok) setDepartments(safeArray(await dRes.json()));
      if (oRes.ok) setOrgChart(safeArray(await oRes.json()));
      if (dashRes?.ok) setDashboard(await dashRes.json());
      if (hRes?.ok) setHeadcount(await hRes.json());
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const loadDetail = async (dept: any) => {
    setViewDetail(dept);
    const [rRes, bRes] = await Promise.all([
      authFetch(`${API}/departments/${dept.id}/roles`),
      authFetch(`${API}/departments/${dept.id}/budgets`),
    ]);
    if (rRes.ok) setDetailRoles(safeArray(await rRes.json()));
    if (bRes.ok) setDetailBudgets(safeArray(await bRes.json()));
  };

  const openCreate = (type: typeof formType, parentData?: any) => {
    setFormType(type); setEditing(null);
    if (type === "department") setForm({ departmentType: "admin", status: "active" });
    else if (type === "role") setForm({ departmentId: parentData?.id || "", roleLevel: "junior", headcount: 1, filled: 0 });
    else if (type === "budget") setForm({ departmentId: parentData?.id || "", category: "salaries", period: new Date().getFullYear().toString() });
    else setForm({ departmentId: parentData?.id || "", status: "vacant" });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const endpoints: Record<string, string> = { department: "departments", role: "departments/roles", budget: "departments/budgets", position: "departments/positions" };
      const url = editing ? `${API}/${endpoints[formType]}/${editing.id}` : `${API}/${endpoints[formType]}`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
      if (viewDetail) loadDetail(viewDetail);
    } catch {} setSaving(false);
  };

  const remove = async (id: number) => {
    await authFetch(`${API}/departments/${id}`, { method: "DELETE" }); load();
  };

  const toggleNode = (id: number) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const renderOrgNode = (node: any, depth = 0): JSX.Element => {
    const type = DEPT_TYPES[node.department_type] || DEPT_TYPES.admin;
    const Icon = type.icon;
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    return (
      <div key={node.id} style={{ marginRight: depth * 24 }}>
        <div className={`flex items-center gap-2 p-2.5 rounded-xl hover:bg-muted/20 cursor-pointer border border-transparent hover:border-border/30 transition-all group ${depth === 0 ? "bg-card/50" : ""}`}
          onClick={() => loadDetail(node)}>
          {hasChildren ? (
            <button onClick={e => { e.stopPropagation(); toggleNode(node.id); }} className="p-0.5 hover:bg-muted rounded">
              {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </button>
          ) : <div className="w-5" />}
          <div className={`p-1.5 rounded-lg ${type.bg}`}><Icon className={`w-4 h-4 ${type.color}`} /></div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white">{node.name}</div>
            <div className="text-[10px] text-muted-foreground">{node.code} | {type.label}</div>
          </div>
          <div className="flex items-center gap-3">
            {node.manager_name && <span className="text-xs text-muted-foreground hidden sm:block">{node.manager_name}</span>}
            <Badge className="text-[10px] bg-muted/30 text-muted-foreground">{fmt(node.total_filled || node.employee_count || 0)}/{fmt(node.total_headcount || 0)}</Badge>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div className="border-r border-border/20 mr-4">{node.children.map((child: any) => renderOrgNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  const filteredDepts = departments.filter(d => !search || [d.name, d.name_en, d.code, d.manager_name].some(f => f?.toLowerCase().includes(search.toLowerCase())));

  const stats = dashboard.stats || {};
  const kpis = [
    { label: "מחלקות פעילות", value: fmt(stats.active || departments.length), icon: Building2, color: "text-blue-400" },
    { label: "סה\"כ עובדים", value: fmt(stats.total_employees || 0), icon: Users, color: "text-green-400" },
    { label: "תקציב שנתי", value: fmtC(stats.total_budget || 0), icon: DollarSign, color: "text-amber-400" },
    { label: "סוגי מחלקות", value: fmt(stats.types_count || 0), icon: Layers, color: "text-purple-400" },
  ];

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "org-chart", label: "מבנה ארגוני", icon: GitBranch },
    { key: "departments", label: "מחלקות", icon: Building2 },
    { key: "roles", label: "תקנים", icon: Briefcase },
    { key: "budgets", label: "תקציבים", icon: DollarSign },
    { key: "dashboard", label: "דשבורד", icon: BarChart3 },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-white flex items-center gap-2"><Building2 className="text-blue-400 w-6 h-6" /> ניהול מחלקות ומבנה ארגוני</h1>
          <p className="text-sm text-muted-foreground mt-1">מבנה ארגוני, תקנים, תקציבים ותפקידים</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={load} className="flex items-center gap-1.5 bg-card border border-border text-muted-foreground px-3 py-2 rounded-xl text-sm hover:bg-muted"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => openCreate("department")} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> מחלקה חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-white">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-1 bg-card border border-border/50 rounded-xl p-1 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${tab === t.key ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {tab !== "org-chart" && tab !== "dashboard" && (
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש מחלקה..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-12 bg-card border border-border/50 rounded-xl animate-pulse" />)}</div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : (
        <>
          {/* ORG CHART */}
          {tab === "org-chart" && (
            <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-1">
              {orgChart.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground"><GitBranch className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>אין מבנה ארגוני</p></div>
              ) : (
                <>
                  <div className="flex justify-end mb-2">
                    <button onClick={() => { const all = new Set<number>(); const addAll = (nodes: any[]) => { for (const n of nodes) { all.add(n.id); if (n.children) addAll(n.children); } }; addAll(orgChart); setExpandedNodes(all); }} className="text-xs text-primary hover:underline ml-3">פתח הכל</button>
                    <button onClick={() => setExpandedNodes(new Set())} className="text-xs text-muted-foreground hover:underline">סגור הכל</button>
                  </div>
                  {orgChart.map(node => renderOrgNode(node))}
                </>
              )}
            </div>
          )}

          {/* DEPARTMENTS LIST */}
          {tab === "departments" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredDepts.length === 0 ? (
                <div className="col-span-full text-center py-16 text-muted-foreground"><Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>אין מחלקות</p></div>
              ) : filteredDepts.map(d => {
                const type = DEPT_TYPES[d.department_type] || DEPT_TYPES.admin;
                const Icon = type.icon;
                const fillRate = d.total_headcount > 0 ? (Number(d.total_filled || 0) / d.total_headcount * 100) : 0;
                return (
                  <div key={d.id} className="bg-card border border-border/50 rounded-2xl p-4 hover:border-primary/30 transition-colors cursor-pointer" onClick={() => loadDetail(d)}>
                    <div className="flex items-start justify-between mb-3">
                      <div className={`p-2 rounded-xl ${type.bg}`}><Icon className={`w-5 h-5 ${type.color}`} /></div>
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setFormType("department"); setEditing(d); setForm({ name: d.name, nameEn: d.name_en, code: d.code, parentDepartmentId: d.parent_department_id, departmentType: d.department_type, managerName: d.manager_name, employeeCount: d.employee_count, budgetAnnual: d.budget_annual, location: d.location, status: d.status, description: d.description }); setShowForm(true); }} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <button onClick={() => remove(d.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                      </div>
                    </div>
                    <div className="text-white font-bold">{d.name}</div>
                    <div className="text-xs text-muted-foreground">{d.code} | {d.name_en || ""}</div>
                    {d.parent_name && <div className="text-[10px] text-muted-foreground mt-1">תחת: {d.parent_name}</div>}
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <div className="bg-muted/10 rounded-lg p-2 text-center">
                        <div className="text-xs text-muted-foreground">עובדים</div>
                        <div className="text-sm font-bold text-white">{fmt(d.total_filled || d.employee_count || 0)}/{fmt(d.total_headcount || 0)}</div>
                      </div>
                      <div className="bg-muted/10 rounded-lg p-2 text-center">
                        <div className="text-xs text-muted-foreground">תקציב</div>
                        <div className="text-sm font-bold text-white">{fmtC(d.budget_annual)}</div>
                      </div>
                    </div>
                    {d.total_headcount > 0 && (
                      <div className="mt-2"><div className="flex justify-between text-[10px] text-muted-foreground"><span>איוש</span><span>{fillRate.toFixed(0)}%</span></div>
                        <div className="h-1.5 bg-muted/20 rounded-full overflow-hidden mt-0.5"><div className={`h-full rounded-full transition-all ${fillRate >= 90 ? 'bg-green-500' : fillRate >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${fillRate}%` }} /></div>
                      </div>
                    )}
                    {d.manager_name && <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1"><Users className="w-3 h-3" />{d.manager_name}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* ROLES TAB - headcount summary */}
          {tab === "roles" && (
            <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border/50">
                    <tr>{["מחלקה", "קוד", "סוג", "תקן מתוכנן", "מאויש", "פנוי", "תקציב שנתי"].map(h => <th key={h} className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {(safeArray(headcount.departments || [])).length === 0 ? <tr><td colSpan={99} className="text-center py-12 text-muted-foreground">אין נתונים</td></tr> :
                      safeArray(headcount.departments || []).map((d: any) => {
                        const vacant = Number(d.planned_headcount || 0) - Number(d.filled_headcount || 0);
                        return (
                          <tr key={d.id} className="border-b border-border/20 hover:bg-muted/10">
                            <td className="px-3 py-2 text-white font-medium">{d.name}</td>
                            <td className="px-3 py-2 text-xs">{d.code}</td>
                            <td className="px-3 py-2"><Badge className={`text-[10px] ${DEPT_TYPES[d.department_type]?.bg || ""} ${DEPT_TYPES[d.department_type]?.color || ""}`}>{DEPT_TYPES[d.department_type]?.label || d.department_type}</Badge></td>
                            <td className="px-3 py-2 text-xs">{fmt(d.planned_headcount)}</td>
                            <td className="px-3 py-2 text-xs text-green-400">{fmt(d.filled_headcount)}</td>
                            <td className="px-3 py-2 text-xs"><span className={vacant > 0 ? "text-red-400 font-bold" : "text-muted-foreground"}>{fmt(vacant)}</span></td>
                            <td className="px-3 py-2 text-xs">{fmtC(d.budget_annual)}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                  {headcount.totals && (
                    <tfoot className="bg-muted/20 border-t border-border">
                      <tr>
                        <td className="px-3 py-2 font-bold text-white" colSpan={3}>סה"כ</td>
                        <td className="px-3 py-2 font-bold text-white text-xs">{fmt(headcount.totals.total_planned)}</td>
                        <td className="px-3 py-2 font-bold text-green-400 text-xs">{fmt(headcount.totals.total_filled)}</td>
                        <td className="px-3 py-2 font-bold text-red-400 text-xs">{fmt(Number(headcount.totals.total_planned || 0) - Number(headcount.totals.total_filled || 0))}</td>
                        <td className="px-3 py-2 font-bold text-white text-xs">{fmtC(headcount.totals.total_budget)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* BUDGETS TAB */}
          {tab === "budgets" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Top budgets */}
                <div className="bg-card border border-border/50 rounded-2xl p-4">
                  <h3 className="font-bold text-white mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4 text-green-400" /> תקציבים גדולים</h3>
                  <div className="space-y-2">
                    {(dashboard.topBudgets || []).map((d: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-muted/10 rounded-lg">
                        <span className="text-sm text-white">{d.name} <span className="text-[10px] text-muted-foreground">({d.code})</span></span>
                        <span className="text-sm font-bold text-green-400">{fmtC(d.budget_annual)}</span>
                      </div>
                    ))}
                    {(dashboard.topBudgets || []).length === 0 && <p className="text-sm text-muted-foreground">אין תקציבים</p>}
                  </div>
                </div>
                {/* Vacancies */}
                <div className="bg-card border border-border/50 rounded-2xl p-4">
                  <h3 className="font-bold text-white mb-3 flex items-center gap-2"><UserPlus className="w-4 h-4 text-red-400" /> משרות פנויות</h3>
                  <div className="space-y-2">
                    {(dashboard.vacancies || []).map((v: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-muted/10 rounded-lg">
                        <div><span className="text-sm text-white">{v.role_name}</span><span className="text-[10px] text-muted-foreground mr-2">({v.name})</span></div>
                        <Badge className="text-[10px] bg-red-500/10 text-red-400">{v.vacant} פנויות</Badge>
                      </div>
                    ))}
                    {(dashboard.vacancies || []).length === 0 && <p className="text-sm text-muted-foreground">אין משרות פנויות</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DASHBOARD TAB */}
          {tab === "dashboard" && (
            <div className="space-y-4">
              <div className="bg-card border border-border/50 rounded-2xl p-4">
                <h3 className="font-bold text-white mb-3 flex items-center gap-2"><Layers className="w-4 h-4 text-purple-400" /> מחלקות לפי סוג</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {(dashboard.byType || []).map((t: any, i: number) => {
                    const type = DEPT_TYPES[t.department_type] || DEPT_TYPES.admin;
                    const Icon = type.icon;
                    return (
                      <div key={i} className={`${type.bg} rounded-xl p-3 text-center border border-transparent`}>
                        <Icon className={`w-5 h-5 mx-auto mb-1 ${type.color}`} />
                        <div className="text-sm font-bold text-white">{t.count}</div>
                        <div className="text-xs text-muted-foreground">{type.label}</div>
                        <div className="text-[10px] text-muted-foreground">{fmt(t.employees)} עובדים</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* DEPARTMENT DETAIL MODAL */}
      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center p-4 border-b border-border/50">
                <div>
                  <h2 className="font-bold text-white">{viewDetail.name}</h2>
                  <div className="text-xs text-muted-foreground">{viewDetail.code} | {viewDetail.name_en || ""}</div>
                </div>
                <button onClick={() => setViewDetail(null)} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-muted/10 rounded-lg p-2 text-center"><div className="text-xs text-muted-foreground">סוג</div><Badge className={`text-[10px] ${DEPT_TYPES[viewDetail.department_type]?.bg || ""} ${DEPT_TYPES[viewDetail.department_type]?.color || ""}`}>{DEPT_TYPES[viewDetail.department_type]?.label || viewDetail.department_type}</Badge></div>
                  <div className="bg-muted/10 rounded-lg p-2 text-center"><div className="text-xs text-muted-foreground">מנהל</div><div className="text-sm text-white">{viewDetail.manager_name || "---"}</div></div>
                  <div className="bg-muted/10 rounded-lg p-2 text-center"><div className="text-xs text-muted-foreground">עובדים</div><div className="text-sm font-bold text-white">{fmt(viewDetail.employee_count || 0)}</div></div>
                  <div className="bg-muted/10 rounded-lg p-2 text-center"><div className="text-xs text-muted-foreground">תקציב</div><div className="text-sm font-bold text-green-400">{fmtC(viewDetail.budget_annual)}</div></div>
                </div>
                {viewDetail.description && <div className="text-sm text-muted-foreground bg-muted/10 rounded-lg p-3">{viewDetail.description}</div>}

                {/* Roles */}
                <div className="border border-border/30 rounded-xl p-3">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-1"><Briefcase className="w-4 h-4 text-blue-400" /> תקנים</h3>
                    <button onClick={() => openCreate("role", viewDetail)} className="text-xs text-primary hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> הוסף תקן</button>
                  </div>
                  {detailRoles.length === 0 ? <p className="text-xs text-muted-foreground">אין תקנים</p> :
                    <div className="space-y-1">{detailRoles.map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between p-2 bg-muted/10 rounded-lg">
                        <div><span className="text-xs font-medium text-white">{r.role_name}</span><Badge className="text-[10px] bg-muted/30 mr-2">{ROLE_LEVEL_MAP[r.role_level]?.label || r.role_level}</Badge></div>
                        <div className="flex items-center gap-2"><span className="text-xs">{r.filled}/{r.headcount}</span>{r.salary_range_min > 0 && <span className="text-[10px] text-muted-foreground">{fmtC(r.salary_range_min)}-{fmtC(r.salary_range_max)}</span>}</div>
                      </div>
                    ))}</div>}
                </div>

                {/* Budgets */}
                <div className="border border-border/30 rounded-xl p-3">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-1"><DollarSign className="w-4 h-4 text-green-400" /> תקציבים</h3>
                    <button onClick={() => openCreate("budget", viewDetail)} className="text-xs text-primary hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> הוסף תקציב</button>
                  </div>
                  {detailBudgets.length === 0 ? <p className="text-xs text-muted-foreground">אין תקציבים</p> :
                    <div className="space-y-1">{detailBudgets.map((b: any) => {
                      const variance = Number(b.budgeted) - Number(b.actual);
                      return (
                        <div key={b.id} className="flex items-center justify-between p-2 bg-muted/10 rounded-lg">
                          <div><span className="text-xs font-medium text-white">{BUDGET_CATEGORIES.find(c => c.key === b.category)?.label || b.category}</span><span className="text-[10px] text-muted-foreground mr-2">{b.period}</span></div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs">{fmtC(b.actual)} / {fmtC(b.budgeted)}</span>
                            <span className={`text-xs font-bold ${variance >= 0 ? "text-green-400" : "text-red-400"}`}>{variance >= 0 ? "+" : ""}{fmtC(variance)}</span>
                          </div>
                        </div>
                      );
                    })}</div>}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FORM MODAL */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center p-4 border-b border-border/50">
                <h2 className="font-bold text-white">{editing ? "עריכה" : "יצירה"} - {formType === "department" ? "מחלקה" : formType === "role" ? "תקן" : formType === "budget" ? "תקציב" : "עמדה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-4 space-y-3">
                {formType === "department" && (<>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">שם (עברית)</label><input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-muted-foreground">שם (אנגלית)</label><input value={form.nameEn || ""} onChange={e => setForm({ ...form, nameEn: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">קוד</label><input value={form.code || ""} onChange={e => setForm({ ...form, code: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-muted-foreground">סוג</label><select value={form.departmentType || "admin"} onChange={e => setForm({ ...form, departmentType: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1">{Object.entries(DEPT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                  </div>
                  <div><label className="text-xs text-muted-foreground">מחלקת אב</label><select value={form.parentDepartmentId || ""} onChange={e => setForm({ ...form, parentDepartmentId: e.target.value || null })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1"><option value="">ללא (שורש)</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}</select></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">מנהל</label><input value={form.managerName || ""} onChange={e => setForm({ ...form, managerName: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-muted-foreground">מיקום</label><input value={form.location || ""} onChange={e => setForm({ ...form, location: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">מספר עובדים</label><input type="number" value={form.employeeCount || ""} onChange={e => setForm({ ...form, employeeCount: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-muted-foreground">תקציב שנתי</label><input type="number" value={form.budgetAnnual || ""} onChange={e => setForm({ ...form, budgetAnnual: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  </div>
                  <div><label className="text-xs text-muted-foreground">תיאור</label><textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                </>)}
                {formType === "role" && (<>
                  <div><label className="text-xs text-muted-foreground">מחלקה</label><select value={form.departmentId || ""} onChange={e => setForm({ ...form, departmentId: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1">{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">שם תפקיד</label><input value={form.roleName || ""} onChange={e => setForm({ ...form, roleName: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-muted-foreground">רמה</label><select value={form.roleLevel || "junior"} onChange={e => setForm({ ...form, roleLevel: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1">{ROLE_LEVELS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">תקן</label><input type="number" value={form.headcount || ""} onChange={e => setForm({ ...form, headcount: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-muted-foreground">מאויש</label><input type="number" value={form.filled || ""} onChange={e => setForm({ ...form, filled: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">שכר מינימום</label><input type="number" value={form.salaryRangeMin || ""} onChange={e => setForm({ ...form, salaryRangeMin: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-muted-foreground">שכר מקסימום</label><input type="number" value={form.salaryRangeMax || ""} onChange={e => setForm({ ...form, salaryRangeMax: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  </div>
                </>)}
                {formType === "budget" && (<>
                  <div><label className="text-xs text-muted-foreground">מחלקה</label><select value={form.departmentId || ""} onChange={e => setForm({ ...form, departmentId: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1">{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">תקופה</label><input value={form.period || ""} onChange={e => setForm({ ...form, period: e.target.value })} placeholder="2024" className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-muted-foreground">קטגוריה</label><select value={form.category || "salaries"} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1">{BUDGET_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">מתוקצב</label><input type="number" value={form.budgeted || ""} onChange={e => setForm({ ...form, budgeted: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-muted-foreground">בפועל</label><input type="number" value={form.actual || ""} onChange={e => setForm({ ...form, actual: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  </div>
                </>)}
              </div>
              <div className="flex justify-end gap-2 p-4 border-t border-border/50">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg">ביטול</button>
                <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"><Save className="w-4 h-4" />{saving ? "שומר..." : "שמור"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
