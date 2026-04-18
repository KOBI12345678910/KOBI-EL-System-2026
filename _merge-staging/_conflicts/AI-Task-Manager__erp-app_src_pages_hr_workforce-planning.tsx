import { useState, useEffect, useMemo } from "react";
import { TrendingUp, Plus, Edit2, Trash2, X, Search, BarChart2, Users, Star, UserPlus, AlertTriangle, ShieldAlert } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmtCur = (v: any) => `₪${Number(v || 0).toLocaleString("he-IL")}`;

const READINESS: Record<string, { label: string; color: string }> = {
  ready_now: { label: "מוכן עכשיו", color: "bg-emerald-500/20 text-emerald-400" },
  ready_1_year: { label: "מוכן תוך שנה", color: "bg-blue-500/20 text-blue-400" },
  developing: { label: "בפיתוח", color: "bg-yellow-500/20 text-yellow-400" },
  not_ready: { label: "לא מוכן", color: "bg-red-500/20 text-red-400" },
};

const TALENT_STATUS: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-emerald-500/20 text-emerald-400" },
  contacted: { label: "נוצר קשר", color: "bg-blue-500/20 text-blue-400" },
  inactive: { label: "לא פעיל", color: "bg-muted/30 text-muted-foreground" },
};

const QUARTERS = [
  { value: 0, label: "שנתי" },
  { value: 1, label: "Q1" },
  { value: 2, label: "Q2" },
  { value: 3, label: "Q3" },
  { value: 4, label: "Q4" },
];

export default function WorkforcePlanningPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [activeTab, setActiveTab] = useState<"headcount" | "succession" | "talent" | "attrition">("headcount");

  // Headcount Plans state
  const [plans, setPlans] = useState<any[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [planForm, setPlanForm] = useState<any>({});
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());

  // Succession Plans state
  const [successionPlans, setSuccessionPlans] = useState<any[]>([]);
  const [loadingSuccession, setLoadingSuccession] = useState(true);
  const [showSuccessionForm, setShowSuccessionForm] = useState(false);
  const [editingSuccession, setEditingSuccession] = useState<any>(null);
  const [successionForm, setSuccessionForm] = useState<any>({});
  const [searchSuccession, setSearchSuccession] = useState("");

  // Talent Pool state
  const [talentPool, setTalentPool] = useState<any[]>([]);
  const [loadingTalent, setLoadingTalent] = useState(true);
  const [showTalentForm, setShowTalentForm] = useState(false);
  const [editingTalent, setEditingTalent] = useState<any>(null);
  const [talentForm, setTalentForm] = useState<any>({});
  const [searchTalent, setSearchTalent] = useState("");

  // Attrition Risk state
  const [attritionData, setAttritionData] = useState<any[]>([]);
  const [loadingAttrition, setLoadingAttrition] = useState(false);

  const loadPlans = async () => {
    setLoadingPlans(true);
    const r = await authFetch(`${API}/headcount-plans`);
    if (r.ok) setPlans(safeArray(await r.json()));
    setLoadingPlans(false);
  };

  const loadSuccession = async () => {
    setLoadingSuccession(true);
    const r = await authFetch(`${API}/succession-plans`);
    if (r.ok) setSuccessionPlans(safeArray(await r.json()));
    setLoadingSuccession(false);
  };

  const loadTalent = async () => {
    setLoadingTalent(true);
    const r = await authFetch(`${API}/talent-pool`);
    if (r.ok) setTalentPool(safeArray(await r.json()));
    setLoadingTalent(false);
  };

  const loadAttrition = async () => {
    setLoadingAttrition(true);
    const r = await authFetch(`${API}/attrition-risk`);
    if (r.ok) setAttritionData(safeArray(await r.json()));
    setLoadingAttrition(false);
  };

  useEffect(() => { loadPlans(); loadSuccession(); loadTalent(); }, []);
  useEffect(() => { if (activeTab === "attrition") loadAttrition(); }, [activeTab]);

  // Handlers
  const savePlan = async () => {
    const url = editingPlan ? `${API}/headcount-plans/${editingPlan.id}` : `${API}/headcount-plans`;
    await authFetch(url, { method: editingPlan ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(planForm) });
    setShowPlanForm(false); loadPlans();
  };

  const deletePlan = async (id: number) => {
    if (await globalConfirm("למחוק תכנון זה?")) { await authFetch(`${API}/headcount-plans/${id}`, { method: "DELETE" }); loadPlans(); }
  };

  const saveSuccession = async () => {
    const url = editingSuccession ? `${API}/succession-plans/${editingSuccession.id}` : `${API}/succession-plans`;
    await authFetch(url, { method: editingSuccession ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(successionForm) });
    setShowSuccessionForm(false); loadSuccession();
  };

  const deleteSuccession = async (id: number) => {
    if (await globalConfirm("למחוק תכנית מחליף זו?")) { await authFetch(`${API}/succession-plans/${id}`, { method: "DELETE" }); loadSuccession(); }
  };

  const saveTalent = async () => {
    const url = editingTalent ? `${API}/talent-pool/${editingTalent.id}` : `${API}/talent-pool`;
    await authFetch(url, { method: editingTalent ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(talentForm) });
    setShowTalentForm(false); loadTalent();
  };

  const deleteTalent = async (id: number) => {
    if (await globalConfirm("למחוק מועמד מאגר הכישרונות?")) { await authFetch(`${API}/talent-pool/${id}`, { method: "DELETE" }); loadTalent(); }
  };

  const filteredPlans = useMemo(() => plans.filter(p => filterYear === "all" || String(p.year) === filterYear), [plans, filterYear]);

  const filteredSuccession = useMemo(() => successionPlans.filter(s =>
    !searchSuccession || s.position_title?.toLowerCase().includes(searchSuccession.toLowerCase()) || s.incumbent_name?.toLowerCase().includes(searchSuccession.toLowerCase()) || s.successor_name?.toLowerCase().includes(searchSuccession.toLowerCase())
  ), [successionPlans, searchSuccession]);

  const filteredTalent = useMemo(() => talentPool.filter(t =>
    !searchTalent || t.name?.toLowerCase().includes(searchTalent.toLowerCase()) || t.skills?.toLowerCase().includes(searchTalent.toLowerCase())
  ), [talentPool, searchTalent]);

  const totalPlanned = filteredPlans.reduce((a, p) => a + Number(p.planned || 0), 0);
  const totalActual = filteredPlans.reduce((a, p) => a + Number(p.actual || 0), 0);
  const totalBudget = filteredPlans.reduce((a, p) => a + Number(p.budget || 0), 0);
  const totalSpend = filteredPlans.reduce((a, p) => a + Number(p.actual_spend || 0), 0);

  const tabs = [
    { key: "headcount", label: "תכנון כח אדם", icon: BarChart2 },
    { key: "succession", label: "תכנון מחליפים", icon: Users },
    { key: "talent", label: "מאגר כישרונות", icon: Star },
    { key: "attrition", label: "סיכון עזיבה", icon: ShieldAlert },
  ];

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground"><TrendingUp className="text-cyan-400" /> תכנון כח אדם</h1>
          <p className="text-muted-foreground mt-1 text-sm">תכנון ראש, תכנון מחליפים ומאגר כישרונות</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-border/50">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? "border-cyan-500 text-cyan-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* HEADCOUNT TAB */}
      {activeTab === "headcount" && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "מתוכנן", value: totalPlanned, unit: "עובדים", color: "text-cyan-400" },
              { label: "בפועל", value: totalActual, unit: "עובדים", color: totalActual <= totalPlanned ? "text-emerald-400" : "text-red-400" },
              { label: "תקציב", value: fmtCur(totalBudget), unit: "", color: "text-blue-400" },
              { label: "הוצאה בפועל", value: fmtCur(totalSpend), unit: "", color: totalSpend <= totalBudget ? "text-emerald-400" : "text-red-400" },
            ].map((kpi, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4">
                <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}{kpi.unit ? ` ${kpi.unit}` : ""}</div>
                <div className="text-xs text-muted-foreground mt-1">{kpi.label} ({filterYear === "all" ? "כל השנים" : filterYear})</div>
              </div>
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2 text-sm">
              <option value="all">כל השנים</option>
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={() => { setEditingPlan(null); setPlanForm({ year: new Date().getFullYear(), quarter: 0, planned: 0, actual: 0, budget: 0, actualSpend: 0 }); setShowPlanForm(true); }}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-foreground px-4 py-2 rounded-xl text-sm ml-auto">
              <Plus className="w-4 h-4" /> הוסף תכנון
            </button>
          </div>

          {/* Headcount chart */}
          {filteredPlans.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-4">
              <h3 className="text-sm font-semibold mb-4 text-foreground flex items-center gap-2"><BarChart2 className="w-4 h-4 text-cyan-400" /> כח אדם לפי מחלקה</h3>
              <div className="space-y-3">
                {Object.entries(filteredPlans.reduce((acc: any, p) => {
                  if (!acc[p.department]) acc[p.department] = { planned: 0, actual: 0 };
                  acc[p.department].planned += Number(p.planned || 0);
                  acc[p.department].actual += Number(p.actual || 0);
                  return acc;
                }, {})).map(([dept, vals]: [string, any], i) => {
                  const max = Math.max(vals.planned, vals.actual, 1);
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span className="font-medium text-foreground">{dept}</span>
                        <span>בפועל {vals.actual} / מתוכנן {vals.planned}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-14">מתוכנן</span>
                          <div className="flex-1 bg-muted/20 rounded-full h-2.5 overflow-hidden">
                            <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${(vals.planned / max) * 100}%` }} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-14">בפועל</span>
                          <div className="flex-1 bg-muted/20 rounded-full h-2.5 overflow-hidden">
                            <div className={`h-full rounded-full ${vals.actual <= vals.planned ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${(vals.actual / max) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Table */}
          {loadingPlans ? <div className="text-center py-8 text-muted-foreground">טוען...</div> : (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/10">
                  <tr>
                    {["מחלקה", "שנה", "רבעון", "מתוכנן", "בפועל", "תקציב", "הוצאה בפועל", "פעולות"].map(h => (
                      <th key={h} className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredPlans.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">אין תכניות. לחץ "הוסף תכנון".</td></tr>}
                  {filteredPlans.map(plan => (
                    <tr key={plan.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{plan.department}</td>
                      <td className="px-4 py-3 text-muted-foreground">{plan.year}</td>
                      <td className="px-4 py-3 text-muted-foreground">{QUARTERS.find(q => q.value === Number(plan.quarter))?.label || plan.quarter}</td>
                      <td className="px-4 py-3 text-cyan-400 font-mono">{plan.planned}</td>
                      <td className="px-4 py-3 font-mono"><span className={Number(plan.actual) <= Number(plan.planned) ? "text-emerald-400" : "text-red-400"}>{plan.actual}</span></td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{fmtCur(plan.budget)}</td>
                      <td className="px-4 py-3 font-mono text-xs"><span className={Number(plan.actual_spend) <= Number(plan.budget) ? "text-emerald-400" : "text-red-400"}>{fmtCur(plan.actual_spend)}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setEditingPlan(plan); setPlanForm({ department: plan.department, year: plan.year, quarter: plan.quarter, planned: plan.planned, actual: plan.actual, budget: plan.budget, actualSpend: plan.actual_spend, notes: plan.notes }); setShowPlanForm(true); }}
                            className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deletePlan(plan.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUCCESSION TAB */}
      {activeTab === "succession" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <input value={searchSuccession} onChange={e => setSearchSuccession(e.target.value)} placeholder="חיפוש תפקיד, עובד..." className="w-full pr-9 pl-4 py-2 bg-card border border-border rounded-xl text-sm" />
            </div>
            <button onClick={() => { setEditingSuccession(null); setSuccessionForm({ readinessLevel: "developing" }); setShowSuccessionForm(true); }}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-foreground px-4 py-2 rounded-xl text-sm">
              <Plus className="w-4 h-4" /> תכנית מחליף חדשה
            </button>
          </div>

          {loadingSuccession ? <div className="text-center py-12 text-muted-foreground">טוען...</div> : (
            <div className="space-y-3">
              {filteredSuccession.length === 0 && <div className="text-center py-12 text-muted-foreground">אין תכניות מחליפים. לחץ "תכנית מחליף חדשה".</div>}
              {filteredSuccession.map(s => {
                const rd = READINESS[s.readiness_level] || READINESS.developing;
                return (
                  <div key={s.id} className="bg-card border border-border rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${rd.color}`}>{rd.label}</span>
                          {s.department && <span className="text-xs text-muted-foreground">{s.department}</span>}
                        </div>
                        <h3 className="font-bold text-foreground">{s.position_title || "תפקיד לא מוגדר"}</h3>
                        <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                          <div>
                            <span className="text-xs text-muted-foreground">בעל התפקיד הנוכחי</span>
                            <div className="flex items-center gap-1 mt-0.5">
                              <Users className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-foreground">{s.incumbent_name || "—"}</span>
                            </div>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">יורש מוצע</span>
                            <div className="flex items-center gap-1 mt-0.5">
                              <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">{s.successor_name || "—"}</span>
                            </div>
                          </div>
                        </div>
                        {s.notes && <div className="text-xs text-muted-foreground mt-2">{s.notes}</div>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => { setEditingSuccession(s); setSuccessionForm({ positionTitle: s.position_title, department: s.department, incumbentName: s.incumbent_name, successorName: s.successor_name, readinessLevel: s.readiness_level, notes: s.notes }); setShowSuccessionForm(true); }}
                          className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => deleteSuccession(s.id)} className="p-2 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TALENT POOL TAB */}
      {activeTab === "talent" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <input value={searchTalent} onChange={e => setSearchTalent(e.target.value)} placeholder="חיפוש לפי שם, מיומנות..." className="w-full pr-9 pl-4 py-2 bg-card border border-border rounded-xl text-sm" />
            </div>
            <button onClick={() => { setEditingTalent(null); setTalentForm({ status: "active" }); setShowTalentForm(true); }}
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-foreground px-4 py-2 rounded-xl text-sm">
              <Plus className="w-4 h-4" /> הוסף למאגר
            </button>
          </div>

          <div className="text-xs text-muted-foreground">{filteredTalent.length} מועמדים במאגר</div>

          {loadingTalent ? <div className="text-center py-12 text-muted-foreground">טוען...</div> : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredTalent.length === 0 && <div className="col-span-full text-center py-12 text-muted-foreground">מאגר הכישרונות ריק.</div>}
              {filteredTalent.map(t => {
                const st = TALENT_STATUS[t.status] || TALENT_STATUS.active;
                const skills = t.skills ? t.skills.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
                return (
                  <div key={t.id} className="bg-card border border-border rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditingTalent(t); setTalentForm({ name: t.name, email: t.email, phone: t.phone, skills: t.skills, source: t.source, notes: t.notes, status: t.status, lastContactDate: t.last_contact_date?.slice(0,10) }); setShowTalentForm(true); }}
                          className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteTalent(t.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <h3 className="font-bold text-foreground">{t.name}</h3>
                    {t.email && <div className="text-xs text-blue-400 mt-1">{t.email}</div>}
                    {t.phone && <div className="text-xs text-muted-foreground">{t.phone}</div>}
                    {t.source && <div className="text-xs text-muted-foreground mt-1">מקור: {t.source}</div>}
                    {t.last_contact_date && <div className="text-xs text-muted-foreground">קשר אחרון: {t.last_contact_date?.slice(0,10)}</div>}
                    {skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {skills.slice(0,5).map((s: string, i: number) => (
                          <span key={i} className="text-xs bg-muted/30 text-foreground/70 px-1.5 py-0.5 rounded">{s}</span>
                        ))}
                        {skills.length > 5 && <span className="text-xs text-muted-foreground">+{skills.length - 5}</span>}
                      </div>
                    )}
                    {t.notes && <div className="text-xs text-muted-foreground mt-2 line-clamp-2">{t.notes}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ATTRITION RISK TAB */}
      {activeTab === "attrition" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">ניתוח סיכון עזיבה</h2>
              <p className="text-sm text-muted-foreground">עובדים בסיכון גבוה לעזוב, עם המלצות שימור</p>
            </div>
            <button onClick={loadAttrition} className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 border border-border rounded-xl">רענן</button>
          </div>

          {loadingAttrition ? (
            <div className="text-center text-muted-foreground py-8">מחשב סיכוני עזיבה...</div>
          ) : attritionData.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
              <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <div className="text-sm">לא נמצאו נתוני סיכון עזיבה. וודאו שיש עובדים עם ותק ונתוני ביצועים.</div>
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "סיכון גבוה", count: attritionData.filter((e: any) => e.risk_score >= 70).length, color: "text-red-400", bg: "border-red-500/20" },
                  { label: "סיכון בינוני", count: attritionData.filter((e: any) => e.risk_score >= 40 && e.risk_score < 70).length, color: "text-yellow-400", bg: "border-yellow-500/20" },
                  { label: "סיכון נמוך", count: attritionData.filter((e: any) => e.risk_score < 40).length, color: "text-emerald-400", bg: "border-emerald-500/20" },
                ].map((s, i) => (
                  <div key={i} className={`bg-card border ${s.bg} rounded-2xl p-4 text-center`}>
                    <div className={`text-3xl font-bold ${s.color}`}>{s.count}</div>
                    <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Risk Table */}
              <div className="space-y-2">
                {attritionData.sort((a: any, b: any) => b.risk_score - a.risk_score).map((emp: any, i: number) => {
                  const risk = emp.risk_score >= 70 ? { label: "גבוה", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" }
                    : emp.risk_score >= 40 ? { label: "בינוני", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30" }
                    : { label: "נמוך", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" };
                  return (
                    <div key={i} className={`bg-card border ${emp.risk_score >= 70 ? "border-red-500/20" : "border-border"} rounded-2xl p-4`}>
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-semibold text-foreground">{emp.employee_name || emp.name}</span>
                            <span className="text-xs text-muted-foreground">{emp.position || emp.department}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            {emp.tenure_months > 0 && <span>ותק: {emp.tenure_months} חודשים</span>}
                            {emp.performance_score > 0 && <span>ביצועים: {emp.performance_score}%</span>}
                            {emp.recent_absences > 0 && <span className="text-orange-400">היעדרויות: {emp.recent_absences}</span>}
                          </div>
                          {emp.risk_factors && (
                            <div className="mt-2 text-xs text-muted-foreground bg-muted/10 rounded-lg px-2 py-1">{emp.risk_factors}</div>
                          )}
                          {emp.retention_recommendation && (
                            <div className="mt-1.5 text-xs text-blue-400 flex items-start gap-1.5">
                              <span className="opacity-60">המלצה:</span> {emp.retention_recommendation}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${risk.bg} ${risk.color}`}>{risk.label}</span>
                          <div className="text-2xl font-bold" style={{ color: emp.risk_score >= 70 ? "#f87171" : emp.risk_score >= 40 ? "#facc15" : "#34d399" }}>
                            {Math.round(emp.risk_score)}%
                          </div>
                        </div>
                      </div>
                      {/* Risk bar */}
                      <div className="mt-3 bg-muted/20 rounded-full h-1.5 overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${emp.risk_score >= 70 ? "bg-red-500" : emp.risk_score >= 40 ? "bg-yellow-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, emp.risk_score)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* HEADCOUNT PLAN FORM */}
      <AnimatePresence>
        {showPlanForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowPlanForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editingPlan ? "עריכת תכנון" : "תכנון כח אדם חדש"}</h2>
                <button onClick={() => setShowPlanForm(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div><label className="text-xs text-muted-foreground mb-1 block">מחלקה *</label>
                  <input value={planForm.department || ""} onChange={e => setPlanForm({ ...planForm, department: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground mb-1 block">שנה</label>
                    <input type="number" value={planForm.year || new Date().getFullYear()} onChange={e => setPlanForm({ ...planForm, year: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">רבעון</label>
                    <select value={planForm.quarter ?? 0} onChange={e => setPlanForm({ ...planForm, quarter: Number(e.target.value) })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
                      {QUARTERS.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
                    </select></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">מתוכנן</label>
                    <input type="number" value={planForm.planned || 0} onChange={e => setPlanForm({ ...planForm, planned: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">בפועל</label>
                    <input type="number" value={planForm.actual || 0} onChange={e => setPlanForm({ ...planForm, actual: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">תקציב (₪)</label>
                    <input type="number" value={planForm.budget || 0} onChange={e => setPlanForm({ ...planForm, budget: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">הוצאה בפועל (₪)</label>
                    <input type="number" value={planForm.actualSpend || 0} onChange={e => setPlanForm({ ...planForm, actualSpend: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                </div>
                <div><label className="text-xs text-muted-foreground mb-1 block">הערות</label>
                  <textarea value={planForm.notes || ""} onChange={e => setPlanForm({ ...planForm, notes: e.target.value })} rows={2} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm resize-none" /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowPlanForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
                <button onClick={savePlan} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-foreground rounded-xl text-sm">שמור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SUCCESSION FORM */}
      <AnimatePresence>
        {showSuccessionForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowSuccessionForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editingSuccession ? "עריכת תכנית מחליף" : "תכנית מחליף חדשה"}</h2>
                <button onClick={() => setShowSuccessionForm(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground mb-1 block">תפקיד *</label>
                    <input value={successionForm.positionTitle || ""} onChange={e => setSuccessionForm({ ...successionForm, positionTitle: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">מחלקה</label>
                    <input value={successionForm.department || ""} onChange={e => setSuccessionForm({ ...successionForm, department: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">בעל התפקיד</label>
                    <input value={successionForm.incumbentName || ""} onChange={e => setSuccessionForm({ ...successionForm, incumbentName: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">יורש מוצע</label>
                    <input value={successionForm.successorName || ""} onChange={e => setSuccessionForm({ ...successionForm, successorName: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                </div>
                <div><label className="text-xs text-muted-foreground mb-1 block">רמת מוכנות</label>
                  <select value={successionForm.readinessLevel || "developing"} onChange={e => setSuccessionForm({ ...successionForm, readinessLevel: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
                    {Object.entries(READINESS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">הערות</label>
                  <textarea value={successionForm.notes || ""} onChange={e => setSuccessionForm({ ...successionForm, notes: e.target.value })} rows={2} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm resize-none" /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowSuccessionForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
                <button onClick={saveSuccession} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-foreground rounded-xl text-sm">שמור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TALENT FORM */}
      <AnimatePresence>
        {showTalentForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowTalentForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editingTalent ? "עריכת מועמד" : "הוסף למאגר כישרונות"}</h2>
                <button onClick={() => setShowTalentForm(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground mb-1 block">שם מלא *</label>
                    <input value={talentForm.name || ""} onChange={e => setTalentForm({ ...talentForm, name: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">אימייל</label>
                    <input value={talentForm.email || ""} onChange={e => setTalentForm({ ...talentForm, email: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">טלפון</label>
                    <input value={talentForm.phone || ""} onChange={e => setTalentForm({ ...talentForm, phone: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">מקור</label>
                    <input value={talentForm.source || ""} onChange={e => setTalentForm({ ...talentForm, source: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" placeholder="LinkedIn, הפנייה, אירוע..." /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">סטטוס</label>
                    <select value={talentForm.status || "active"} onChange={e => setTalentForm({ ...talentForm, status: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
                      {Object.entries(TALENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">תאריך קשר אחרון</label>
                    <input type="date" value={talentForm.lastContactDate || ""} onChange={e => setTalentForm({ ...talentForm, lastContactDate: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                </div>
                <div><label className="text-xs text-muted-foreground mb-1 block">מיומנויות (מופרדות בפסיקים)</label>
                  <input value={talentForm.skills || ""} onChange={e => setTalentForm({ ...talentForm, skills: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" placeholder="React, Python, ניהול..." /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">הערות</label>
                  <textarea value={talentForm.notes || ""} onChange={e => setTalentForm({ ...talentForm, notes: e.target.value })} rows={2} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm resize-none" /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowTalentForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
                <button onClick={saveTalent} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-foreground rounded-xl text-sm">שמור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
