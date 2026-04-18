import { useState, useEffect, useMemo } from "react";
import { Target, Plus, Edit2, Trash2, X, ChevronDown, ChevronRight, TrendingUp, Users, AlertTriangle, CheckCircle2, Search, BarChart2, Activity, Star, UserCheck, ClipboardList, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);

const STATUS_MAP: Record<string, { label: string; color: string; dot: string }> = {
  on_track: { label: "בנתיב", color: "text-emerald-400", dot: "bg-emerald-400" },
  at_risk: { label: "בסיכון", color: "text-yellow-400", dot: "bg-yellow-400" },
  behind: { label: "מאחור", color: "text-red-400", dot: "bg-red-400" },
  completed: { label: "הושלם", color: "text-blue-400", dot: "bg-blue-400" },
};

const OWNER_TYPES = [
  { key: "company", label: "חברה" },
  { key: "department", label: "מחלקה" },
  { key: "individual", label: "אישי" },
];

const PIP_STATUS: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-orange-500/20 text-orange-400" },
  completed: { label: "הושלם", color: "bg-emerald-500/20 text-emerald-400" },
  closed: { label: "נסגר", color: "bg-muted/30 text-muted-foreground" },
};

const REVIEW_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-muted/30 text-muted-foreground" },
  active: { label: "פעיל", color: "bg-blue-500/20 text-blue-400" },
  collecting: { label: "אוסף משובים", color: "bg-indigo-500/20 text-indigo-400" },
  completed: { label: "הושלם", color: "bg-emerald-500/20 text-emerald-400" },
};

const NINE_BOX_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  "3-3": { label: "כוכב עתידי", bg: "bg-emerald-500/20", text: "text-emerald-300" },
  "3-2": { label: "ביצועים גבוהים", bg: "bg-emerald-500/10", text: "text-emerald-400" },
  "3-1": { label: "עובד מוכשר", bg: "bg-blue-500/10", text: "text-blue-400" },
  "2-3": { label: "פוטנציאל גבוה", bg: "bg-yellow-500/20", text: "text-yellow-300" },
  "2-2": { label: "ביצועים טובים", bg: "bg-blue-500/15", text: "text-blue-300" },
  "2-1": { label: "ביצועים בסיסיים", bg: "bg-muted/20", text: "text-muted-foreground" },
  "1-3": { label: "פוטנציאל בלתי ממומש", bg: "bg-orange-500/10", text: "text-orange-400" },
  "1-2": { label: "צריך פיתוח", bg: "bg-orange-500/15", text: "text-orange-300" },
  "1-1": { label: "בסיכון", bg: "bg-red-500/20", text: "text-red-400" },
};

function CalibrationGrid({ employees }: { employees: any[] }) {
  const getBox = (perf: number, pot: number) => {
    const pc = perf >= 4 ? 3 : perf >= 2.5 ? 2 : 1;
    const ptc = pot >= 4 ? 3 : pot >= 2.5 ? 2 : 1;
    return `${pc}-${ptc}`;
  };
  const boxes = ["3-3","3-2","3-1","2-3","2-2","2-1","1-3","1-2","1-1"];
  const grouped: Record<string, any[]> = {};
  boxes.forEach(b => { grouped[b] = []; });
  employees.forEach(e => {
    const box = getBox(Number(e.performance_score || 3), Number(e.potential_score || 3));
    if (grouped[box]) grouped[box].push(e);
    else grouped["2-2"].push(e);
  });
  const potLabels = ["פוטנציאל נמוך","פוטנציאל בינוני","פוטנציאל גבוה"];
  const perfLabels = ["ביצועים נמוכים","ביצועים בינוניים","ביצועים גבוהים"];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-1">
        <span className="font-medium text-foreground">מטריצת 9 תאים — כישרונות</span>
        <span>ציר X: פוטנציאל · ציר Y: ביצועים</span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[540px]">
          <div className="grid grid-cols-3 gap-1 mb-1">
            {potLabels.map(l => <div key={l} className="text-center text-xs text-muted-foreground py-1">{l}</div>)}
          </div>
          <div className="grid grid-cols-3 grid-rows-3 gap-1">
            {["3","2","1"].map(perfRow =>
              ["1","2","3"].map(potCol => {
                const key = `${perfRow}-${potCol}`;
                const meta = NINE_BOX_LABELS[key];
                const emps = grouped[key] || [];
                return (
                  <div key={key} className={`${meta.bg} border border-border/50 rounded-xl p-3 min-h-[90px]`}>
                    <div className={`text-xs font-medium mb-2 ${meta.text}`}>{meta.label}</div>
                    <div className="space-y-1">
                      {emps.slice(0, 3).map((e: any, i: number) => (
                        <div key={i} className="text-xs bg-black/20 rounded px-2 py-0.5 text-foreground truncate">{e.employee_name || e.name || `עובד ${e.id}`}</div>
                      ))}
                      {emps.length > 3 && <div className="text-xs text-muted-foreground">+{emps.length - 3} נוספים</div>}
                      {emps.length === 0 && <div className="text-xs text-muted-foreground/40">—</div>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="grid grid-cols-1 gap-1 mt-1">
            {perfLabels.slice().reverse().map((l, i) => (
              <div key={i} className="text-xs text-muted-foreground text-right pr-1">{l}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ pct, color = "bg-blue-500" }: { pct: number; color?: string }) {
  const p = Math.max(0, Math.min(100, Number(pct || 0)));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted/30 rounded-full h-2 overflow-hidden">
        <div className={`${p >= 100 ? "bg-emerald-500" : p >= 70 ? "bg-blue-500" : p >= 40 ? "bg-yellow-500" : "bg-red-500"} h-full rounded-full transition-all`} style={{ width: `${p}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-8 text-right">{Math.round(p)}%</span>
    </div>
  );
}

function OKRObjectiveCard({ obj, onEdit, onDelete, onAddKR, onEditKR, onDeleteKR }: any) {
  const [expanded, setExpanded] = useState(true);
  const krs = obj.key_results || [];
  const avgProgress = krs.length > 0 ? krs.reduce((a: number, k: any) => a + Number(k.progress_pct || 0), 0) / krs.length : Number(obj.progress_pct || 0);
  const st = STATUS_MAP[obj.status] || STATUS_MAP.on_track;
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="p-4 flex items-start gap-3">
        <button onClick={() => setExpanded(e => !e)} className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <span className={`text-xs px-2 py-0.5 rounded-full bg-muted/30 text-muted-foreground mr-2`}>{OWNER_TYPES.find(o => o.key === obj.owner_type)?.label || obj.owner_type}</span>
              <span className="text-sm font-bold text-foreground">{obj.title}</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted/20 ${st.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
              </span>
              <button onClick={() => onEdit(obj)} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"><Edit2 className="w-3.5 h-3.5" /></button>
              <button onClick={() => onDelete(obj.id)} className="p-1 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-2">
            {obj.owner_name && <span className="text-xs text-muted-foreground">{obj.owner_name}</span>}
            {obj.period && <span className="text-xs text-muted-foreground border border-border px-1.5 py-0.5 rounded">{obj.period}</span>}
          </div>
          <ProgressBar pct={avgProgress} />
        </div>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="border-t border-border/50 bg-muted/5">
              {krs.map((kr: any) => (
                <div key={kr.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/30 last:border-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0 ml-4" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-foreground/80 mb-1.5">{kr.title}</div>
                    <div className="flex items-center gap-3">
                      <ProgressBar pct={kr.progress_pct} />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{Number(kr.current_value).toLocaleString()} / {Number(kr.target_value).toLocaleString()} {kr.unit || ""}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => onEditKR(kr)} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"><Edit2 className="w-3 h-3" /></button>
                    <button onClick={() => onDeleteKR(kr.id)} className="p-1 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}
              <div className="px-4 py-2">
                <button onClick={() => onAddKR(obj)} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> הוסף תוצאת מפתח
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function TalentManagementPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [activeTab, setActiveTab] = useState<"okr" | "reviews" | "calibration" | "pip">("okr");

  // OKR State
  const [objectives, setObjectives] = useState<any[]>([]);
  const [loadingOKR, setLoadingOKR] = useState(true);
  const [showObjForm, setShowObjForm] = useState(false);
  const [editingObj, setEditingObj] = useState<any>(null);
  const [objForm, setObjForm] = useState<any>({});
  const [showKRForm, setShowKRForm] = useState(false);
  const [editingKR, setEditingKR] = useState<any>(null);
  const [krForm, setKRForm] = useState<any>({});
  const [selectedObjective, setSelectedObjective] = useState<any>(null);
  const [searchOKR, setSearchOKR] = useState("");
  const [filterOwnerType, setFilterOwnerType] = useState("all");

  // Review Cycles State
  const [cycles, setCycles] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [showCycleForm, setShowCycleForm] = useState(false);
  const [editingCycle, setEditingCycle] = useState<any>(null);
  const [cycleForm, setCycleForm] = useState<any>({});

  // PIP State
  const [pips, setPips] = useState<any[]>([]);
  const [loadingPIP, setLoadingPIP] = useState(true);
  const [showPIPForm, setShowPIPForm] = useState(false);
  const [editingPIP, setEditingPIP] = useState<any>(null);
  const [pipForm, setPIPForm] = useState<any>({});

  // Calibration State
  const [calibrationData, setCalibrationData] = useState<any[]>([]);
  const [loadingCalibration, setLoadingCalibration] = useState(false);
  const [calibrationFilter, setCalibrationFilter] = useState("all");
  const [calibrationEdit, setCalibrationEdit] = useState<any>(null);

  // 360 Reviewer Assignment State
  const [selectedCycle, setSelectedCycle] = useState<any>(null);
  const [reviewerForm, setReviewerForm] = useState<any>({});
  const [showReviewerForm, setShowReviewerForm] = useState(false);
  const [cycleReviewers, setCycleReviewers] = useState<any[]>([]);
  const [savingReviewer, setSavingReviewer] = useState(false);

  const loadOKR = async () => {
    setLoadingOKR(true);
    const r = await authFetch(`${API}/okr-objectives`);
    if (r.ok) setObjectives(safeArray(await r.json()));
    setLoadingOKR(false);
  };

  const loadReviews = async () => {
    setLoadingReviews(true);
    const r = await authFetch(`${API}/review-cycles`);
    if (r.ok) setCycles(safeArray(await r.json()));
    setLoadingReviews(false);
  };

  const loadPIPs = async () => {
    setLoadingPIP(true);
    const r = await authFetch(`${API}/pips`);
    if (r.ok) setPips(safeArray(await r.json()));
    setLoadingPIP(false);
  };

  const loadCalibration = async () => {
    setLoadingCalibration(true);
    const r = await authFetch(`${API}/performance-reviews`);
    if (r.ok) setCalibrationData(safeArray(await r.json()));
    setLoadingCalibration(false);
  };

  const loadCycleReviewers = async (cycleId: number) => {
    try {
      const r = await authFetch(`${API}/review-cycles/${cycleId}/reviewers`);
      if (r.ok) setCycleReviewers(safeArray(await r.json()));
    } catch { setCycleReviewers([]); }
  };

  const saveReviewer = async () => {
    if (!selectedCycle) return;
    setSavingReviewer(true);
    await authFetch(`${API}/review-cycles/${selectedCycle.id}/reviewers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reviewerForm),
    });
    setShowReviewerForm(false);
    setReviewerForm({});
    loadCycleReviewers(selectedCycle.id);
    setSavingReviewer(false);
  };

  const removeReviewer = async (reviewerId: number) => {
    if (!selectedCycle) return;
    if (await globalConfirm("להסיר מעריך זה?")) {
      await authFetch(`${API}/review-cycles/${selectedCycle.id}/reviewers/${reviewerId}`, { method: "DELETE" });
      loadCycleReviewers(selectedCycle.id);
    }
  };

  const updateCalibrationScore = async (empId: number, field: "performance_score" | "potential_score", value: number) => {
    setCalibrationData(prev => prev.map(e => e.id === empId ? { ...e, [field]: value } : e));
    await authFetch(`${API}/performance-reviews/${empId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field === "performance_score" ? "performanceScore" : "potentialScore"]: value }),
    }).catch(() => null);
  };

  useEffect(() => { loadOKR(); loadReviews(); loadPIPs(); loadCalibration(); }, []);

  // OKR Handlers
  const saveObjective = async () => {
    const url = editingObj ? `${API}/okr-objectives/${editingObj.id}` : `${API}/okr-objectives`;
    await authFetch(url, { method: editingObj ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(objForm) });
    setShowObjForm(false); loadOKR();
  };

  const deleteObjective = async (id: number) => {
    if (await globalConfirm("למחוק יעד זה וכל תוצאות המפתח שלו?")) { await authFetch(`${API}/okr-objectives/${id}`, { method: "DELETE" }); loadOKR(); }
  };

  const saveKR = async () => {
    if (editingKR?.id) {
      await authFetch(`${API}/okr-key-results/${editingKR.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(krForm) });
    } else {
      await authFetch(`${API}/okr-key-results`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...krForm, objectiveId: selectedObjective?.id }) });
    }
    setShowKRForm(false); loadOKR();
  };

  const deleteKR = async (id: number) => {
    if (await globalConfirm("למחוק תוצאת מפתח זו?")) { await authFetch(`${API}/okr-key-results/${id}`, { method: "DELETE" }); loadOKR(); }
  };

  // Review Handlers
  const saveCycle = async () => {
    const url = editingCycle ? `${API}/review-cycles/${editingCycle.id}` : `${API}/review-cycles`;
    await authFetch(url, { method: editingCycle ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cycleForm) });
    setShowCycleForm(false); loadReviews();
  };

  const deleteCycle = async (id: number) => {
    if (await globalConfirm("למחוק מחזור הערכה זה?")) { await authFetch(`${API}/review-cycles/${id}`, { method: "DELETE" }); loadReviews(); }
  };

  // PIP Handlers
  const savePIP = async () => {
    const url = editingPIP ? `${API}/pips/${editingPIP.id}` : `${API}/pips`;
    await authFetch(url, { method: editingPIP ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pipForm) });
    setShowPIPForm(false); loadPIPs();
  };

  const deletePIP = async (id: number) => {
    if (await globalConfirm("למחוק תוכנית שיפור זו?")) { await authFetch(`${API}/pips/${id}`, { method: "DELETE" }); loadPIPs(); }
  };

  const filteredObjectives = useMemo(() => {
    return objectives.filter(o =>
      (filterOwnerType === "all" || o.owner_type === filterOwnerType) &&
      (!searchOKR || o.title?.toLowerCase().includes(searchOKR.toLowerCase()) || o.owner_name?.toLowerCase().includes(searchOKR.toLowerCase()))
    );
  }, [objectives, filterOwnerType, searchOKR]);

  const avgOKR = objectives.length > 0 ? objectives.reduce((a, o) => a + Number(o.progress_pct || 0), 0) / objectives.length : 0;

  const calibrationDeps = useMemo(() => {
    const all = calibrationFilter === "all" ? calibrationData : calibrationData.filter(e => e.department === calibrationFilter);
    return all;
  }, [calibrationData, calibrationFilter]);
  const calibrationDepts = useMemo(() => Array.from(new Set(calibrationData.map((e: any) => e.department).filter(Boolean))), [calibrationData]);

  const tabs = [
    { key: "okr", label: "OKR & יעדים", icon: Target },
    { key: "reviews", label: "הערכה 360°", icon: Users },
    { key: "calibration", label: "כיול ביצועים", icon: BarChart2 },
    { key: "pip", label: "תוכניות שיפור", icon: AlertTriangle },
  ];

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground"><Target className="text-purple-400" /> ניהול כישרונות</h1>
          <p className="text-muted-foreground mt-1 text-sm">OKR, הערכה 360° ותוכניות שיפור ביצועים</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-border/50">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? "border-purple-500 text-purple-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* ============= OKR TAB ============= */}
      {activeTab === "okr" && (
        <div className="space-y-4">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "סה\"כ יעדים", value: objectives.length, color: "text-purple-400", icon: Target },
              { label: "בנתיב", value: objectives.filter(o => o.status === "on_track").length, color: "text-emerald-400", icon: CheckCircle2 },
              { label: "בסיכון", value: objectives.filter(o => o.status === "at_risk").length, color: "text-yellow-400", icon: AlertTriangle },
              { label: "ממוצע התקדמות", value: `${Math.round(avgOKR)}%`, color: "text-blue-400", icon: BarChart2 },
            ].map((kpi, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4">
                <kpi.icon className={`${kpi.color} mb-2 w-5 h-5`} />
                <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* Filters & Action */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <input value={searchOKR} onChange={e => setSearchOKR(e.target.value)} placeholder="חיפוש יעדים..." className="w-full pr-9 pl-4 py-2 bg-card border border-border rounded-xl text-sm" />
            </div>
            <select value={filterOwnerType} onChange={e => setFilterOwnerType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2 text-sm">
              <option value="all">כל הסוגים</option>
              {OWNER_TYPES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <button onClick={() => { setEditingObj(null); setObjForm({ ownerType: "individual", status: "on_track", period: `Q${Math.ceil((new Date().getMonth()+1)/3)}-${new Date().getFullYear()}` }); setShowObjForm(true); }}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-foreground px-4 py-2 rounded-xl text-sm">
              <Plus className="w-4 h-4" /> יעד חדש
            </button>
          </div>

          {loadingOKR ? (
            <div className="text-center py-12 text-muted-foreground">טוען...</div>
          ) : filteredObjectives.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">אין יעדים. לחץ על "יעד חדש" להתחלה.</div>
          ) : (
            <div className="space-y-3">
              {filteredObjectives.map(obj => (
                <OKRObjectiveCard key={obj.id} obj={obj}
                  onEdit={(o: any) => { setEditingObj(o); setObjForm({ title: o.title, description: o.description, ownerType: o.owner_type, ownerName: o.owner_name, period: o.period, status: o.status, progressPct: o.progress_pct }); setShowObjForm(true); }}
                  onDelete={deleteObjective}
                  onAddKR={(o: any) => { setSelectedObjective(o); setEditingKR(null); setKRForm({ status: "on_track", unit: "%" }); setShowKRForm(true); }}
                  onEditKR={(kr: any) => { setEditingKR(kr); setKRForm({ title: kr.title, targetValue: kr.target_value, currentValue: kr.current_value, unit: kr.unit, status: kr.status, progressPct: kr.progress_pct }); setShowKRForm(true); }}
                  onDeleteKR={deleteKR}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============= REVIEWS TAB ============= */}
      {activeTab === "reviews" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingCycle(null); setCycleForm({ type: "360", status: "draft" }); setShowCycleForm(true); }}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-foreground px-4 py-2 rounded-xl text-sm">
              <Plus className="w-4 h-4" /> מחזור הערכה חדש
            </button>
          </div>

          {loadingReviews ? <div className="text-center py-12 text-muted-foreground">טוען...</div> : (
            <div className={`grid gap-4 ${selectedCycle ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
              {/* Cycles list */}
              <div className="space-y-3">
                {cycles.length === 0 && <div className="text-center py-12 text-muted-foreground">אין מחזורי הערכה. לחץ "מחזור הערכה חדש" להתחלה.</div>}
                {cycles.map(cycle => {
                  const st = REVIEW_STATUS[cycle.status] || REVIEW_STATUS.draft;
                  const isSelected = selectedCycle?.id === cycle.id;
                  return (
                    <div key={cycle.id} className={`bg-card border rounded-2xl p-4 cursor-pointer transition-colors ${isSelected ? "border-indigo-500/60" : "border-border hover:border-border/80"}`}
                      onClick={() => { if (isSelected) { setSelectedCycle(null); setCycleReviewers([]); } else { setSelectedCycle(cycle); loadCycleReviewers(cycle.id); } }}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                            <span className="text-xs text-muted-foreground border border-border px-2 py-0.5 rounded">{cycle.type === '360' ? 'הערכה 360°' : cycle.type}</span>
                          </div>
                          <div className="font-bold text-foreground">{cycle.name}</div>
                          {cycle.period && <div className="text-sm text-muted-foreground mt-1">{cycle.period}</div>}
                          {(cycle.start_date || cycle.end_date) && (
                            <div className="text-xs text-muted-foreground mt-1">{cycle.start_date?.slice(0,10)} — {cycle.end_date?.slice(0,10)}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => { setEditingCycle(cycle); setCycleForm({ name: cycle.name, period: cycle.period, type: cycle.type, status: cycle.status, startDate: cycle.start_date?.slice(0,10), endDate: cycle.end_date?.slice(0,10) }); setShowCycleForm(true); }}
                            className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => deleteCycle(cycle.id)} className="p-2 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reviewer Assignment Panel */}
              {selectedCycle && (
                <div className="bg-card border border-indigo-500/30 rounded-2xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-foreground flex items-center gap-2"><UserCheck className="w-4 h-4 text-indigo-400" /> מעריכים — {selectedCycle.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">הקצאת מעריכים וניהול תהליך הערכה 360°</p>
                    </div>
                    <button onClick={() => { setShowReviewerForm(true); setReviewerForm({ cycleId: selectedCycle.id, reviewType: "peer", status: "pending" }); }}
                      className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-foreground px-3 py-1.5 rounded-xl text-xs">
                      <Plus className="w-3.5 h-3.5" /> הוסף מעריך
                    </button>
                  </div>

                  {cycleReviewers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>אין מעריכים מוקצים עדיין.</p>
                      <p className="text-xs mt-1">לחץ "הוסף מעריך" כדי להתחיל בתהליך 360°</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {cycleReviewers.map((rv: any) => {
                        const statusColor = rv.status === "completed" ? "text-emerald-400" : rv.status === "in_progress" ? "text-yellow-400" : "text-muted-foreground";
                        const statusLabel = rv.status === "completed" ? "הושלם" : rv.status === "in_progress" ? "בתהליך" : "ממתין";
                        return (
                          <div key={rv.id} className="flex items-center justify-between bg-muted/10 border border-border/50 rounded-xl px-3 py-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground truncate">{rv.reviewer_name || rv.reviewerName}</span>
                                <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">{rv.review_type === "peer" ? "עמית" : rv.review_type === "manager" ? "מנהל" : rv.review_type === "self" ? "עצמי" : "360°"}</span>
                              </div>
                              {rv.reviewee_name && <div className="text-xs text-muted-foreground mt-0.5">מעריך: {rv.reviewee_name}</div>}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`text-xs ${statusColor}`}>{statusLabel}</span>
                              {rv.status !== "completed" && (
                                <button onClick={() => {
                                  const newStatus = rv.status === "pending" ? "in_progress" : "completed";
                                  setCycleReviewers(prev => prev.map(r => r.id === rv.id ? { ...r, status: newStatus } : r));
                                  authFetch(`${API}/review-cycles/${selectedCycle.id}/reviewers/${rv.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) });
                                }} className="p-1 hover:bg-indigo-500/10 rounded text-indigo-400 hover:text-indigo-300 text-xs">
                                  <Send className="w-3 h-3" />
                                </button>
                              )}
                              <button onClick={() => removeReviewer(rv.id)} className="p-1 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-400">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      <div className="pt-2 border-t border-border/50 flex gap-4 text-xs text-muted-foreground">
                        <span>סה"כ: {cycleReviewers.length}</span>
                        <span className="text-emerald-400">הושלמו: {cycleReviewers.filter(r => r.status === "completed").length}</span>
                        <span className="text-yellow-400">בתהליך: {cycleReviewers.filter(r => r.status === "in_progress").length}</span>
                        <span>ממתינים: {cycleReviewers.filter(r => r.status === "pending").length}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============= CALIBRATION TAB ============= */}
      {activeTab === "calibration" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <select value={calibrationFilter} onChange={e => setCalibrationFilter(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2 text-sm">
              <option value="all">כל המחלקות</option>
              {calibrationDepts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <div className="text-xs text-muted-foreground">{calibrationDeps.length} עובדים</div>
          </div>

          {loadingCalibration ? (
            <div className="text-center py-12 text-muted-foreground">טוען נתוני כיול...</div>
          ) : calibrationDeps.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>אין נתוני הערכת ביצועים זמינים.</p>
              <p className="text-xs mt-1">יש להוסיף עובדים למערכת ולבצע הערכות ביצועים.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 9-Box Grid */}
              <div className="bg-card border border-border rounded-2xl p-4">
                <CalibrationGrid employees={calibrationDeps} />
              </div>

              {/* Calibration Table */}
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-border">
                  <h3 className="font-bold text-foreground flex items-center gap-2"><Star className="w-4 h-4 text-yellow-400" /> טבלת כיול ציונים</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">לחץ על הכוכבים לעדכון ציוני ביצועים ופוטנציאל</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="text-right px-4 py-3 font-medium">עובד</th>
                        <th className="text-right px-4 py-3 font-medium">מחלקה</th>
                        <th className="text-center px-4 py-3 font-medium">ביצועים (1-5)</th>
                        <th className="text-center px-4 py-3 font-medium">פוטנציאל (1-5)</th>
                        <th className="text-center px-4 py-3 font-medium">קטגוריה</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {calibrationDeps.map((emp: any) => {
                        const pc = Math.max(0, Math.min(5, Number(emp.performance_score || 3)));
                        const pot = Math.max(0, Math.min(5, Number(emp.potential_score || 3)));
                        const pci = pc >= 4 ? 3 : pc >= 2.5 ? 2 : 1;
                        const pti = pot >= 4 ? 3 : pot >= 2.5 ? 2 : 1;
                        const box = NINE_BOX_LABELS[`${pci}-${pti}`];
                        return (
                          <tr key={emp.id} className="hover:bg-muted/5 transition-colors">
                            <td className="px-4 py-3 font-medium text-foreground">{emp.employee_name || emp.name || `עובד ${emp.id}`}</td>
                            <td className="px-4 py-3 text-muted-foreground">{emp.department || "—"}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-0.5">
                                {[1,2,3,4,5].map(n => (
                                  <button key={n} onClick={() => updateCalibrationScore(emp.id, "performance_score", n)}
                                    className={`transition-colors ${n <= pc ? "text-yellow-400" : "text-muted-foreground/30"} hover:text-yellow-300`}>
                                    <Star className="w-4 h-4 fill-current" />
                                  </button>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-0.5">
                                {[1,2,3,4,5].map(n => (
                                  <button key={n} onClick={() => updateCalibrationScore(emp.id, "potential_score", n)}
                                    className={`transition-colors ${n <= pot ? "text-blue-400" : "text-muted-foreground/30"} hover:text-blue-300`}>
                                    <Star className="w-4 h-4 fill-current" />
                                  </button>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {box && <span className={`text-xs px-2 py-0.5 rounded-full ${box.bg} ${box.text}`}>{box.label}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============= PIP TAB ============= */}
      {activeTab === "pip" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingPIP(null); setPIPForm({ status: "active", startDate: new Date().toISOString().slice(0,10) }); setShowPIPForm(true); }}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-foreground px-4 py-2 rounded-xl text-sm">
              <Plus className="w-4 h-4" /> תוכנית שיפור חדשה
            </button>
          </div>

          {loadingPIP ? <div className="text-center py-12 text-muted-foreground">טוען...</div> : (
            <div className="space-y-3">
              {pips.length === 0 && <div className="text-center py-12 text-muted-foreground">אין תוכניות שיפור פעילות.</div>}
              {pips.map(pip => {
                const st = PIP_STATUS[pip.status] || PIP_STATUS.active;
                const daysLeft = pip.end_date ? Math.ceil((new Date(pip.end_date).getTime() - Date.now()) / 86400000) : null;
                return (
                  <div key={pip.id} className="bg-card border border-border rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                          {daysLeft !== null && daysLeft > 0 && <span className="text-xs text-muted-foreground">{daysLeft} ימים נותרו</span>}
                          {daysLeft !== null && daysLeft <= 0 && <span className="text-xs text-red-400">פג תוקף</span>}
                        </div>
                        <div className="font-bold text-foreground">{pip.employee_name}</div>
                        {pip.department && <div className="text-sm text-muted-foreground">{pip.department}</div>}
                        {pip.manager_name && <div className="text-xs text-muted-foreground">מנהל: {pip.manager_name}</div>}
                        {pip.reason && <div className="text-sm mt-2 text-foreground/70 line-clamp-2">{pip.reason}</div>}
                        <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                          {pip.start_date && <span>התחלה: {pip.start_date?.slice(0,10)}</span>}
                          {pip.end_date && <span>סיום: {pip.end_date?.slice(0,10)}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => { setEditingPIP(pip); setPIPForm({ employeeName: pip.employee_name, department: pip.department, reason: pip.reason, startDate: pip.start_date?.slice(0,10), endDate: pip.end_date?.slice(0,10), status: pip.status, managerName: pip.manager_name, notes: pip.notes }); setShowPIPForm(true); }}
                          className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => deletePIP(pip.id)} className="p-2 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============= OKR OBJECTIVE FORM ============= */}
      <AnimatePresence>
        {showObjForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowObjForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editingObj ? "עריכת יעד" : "יעד חדש"}</h2>
                <button onClick={() => setShowObjForm(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div><label className="text-xs text-muted-foreground mb-1 block">כותרת יעד *</label>
                  <input value={objForm.title || ""} onChange={e => setObjForm({ ...objForm, title: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" placeholder="למשל: הגדלת נתח השוק ב-20%" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground mb-1 block">סוג בעלים</label>
                    <select value={objForm.ownerType || "individual"} onChange={e => setObjForm({ ...objForm, ownerType: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
                      {OWNER_TYPES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">שם בעלים</label>
                    <input value={objForm.ownerName || ""} onChange={e => setObjForm({ ...objForm, ownerName: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">תקופה</label>
                    <input value={objForm.period || ""} onChange={e => setObjForm({ ...objForm, period: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" placeholder="Q2-2026" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">סטטוס</label>
                    <select value={objForm.status || "on_track"} onChange={e => setObjForm({ ...objForm, status: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
                      {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select></div>
                </div>
                <div><label className="text-xs text-muted-foreground mb-1 block">תיאור</label>
                  <textarea value={objForm.description || ""} onChange={e => setObjForm({ ...objForm, description: e.target.value })} rows={2} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm resize-none" /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowObjForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
                <button onClick={saveObjective} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-foreground rounded-xl text-sm">שמור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============= KR FORM ============= */}
      <AnimatePresence>
        {showKRForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowKRForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editingKR?.id ? "עריכת תוצאת מפתח" : "תוצאת מפתח חדשה"}</h2>
                <button onClick={() => setShowKRForm(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                {selectedObjective && !editingKR?.id && <div className="text-xs text-muted-foreground">עבור יעד: <span className="text-foreground">{selectedObjective.title}</span></div>}
                <div><label className="text-xs text-muted-foreground mb-1 block">תיאור תוצאת מפתח *</label>
                  <input value={krForm.title || ""} onChange={e => setKRForm({ ...krForm, title: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="text-xs text-muted-foreground mb-1 block">ערך יעד</label>
                    <input type="number" value={krForm.targetValue || ""} onChange={e => setKRForm({ ...krForm, targetValue: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">ערך נוכחי</label>
                    <input type="number" value={krForm.currentValue || ""} onChange={e => setKRForm({ ...krForm, currentValue: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">יחידה</label>
                    <input value={krForm.unit || ""} onChange={e => setKRForm({ ...krForm, unit: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" placeholder="%, ₪, יח'" /></div>
                </div>
                <div><label className="text-xs text-muted-foreground mb-1 block">סטטוס</label>
                  <select value={krForm.status || "on_track"} onChange={e => setKRForm({ ...krForm, status: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
                    {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowKRForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
                <button onClick={saveKR} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-foreground rounded-xl text-sm">שמור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============= REVIEWER ASSIGNMENT FORM ============= */}
      <AnimatePresence>
        {showReviewerForm && selectedCycle && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowReviewerForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><UserCheck className="w-5 h-5 text-indigo-400" /> הוספת מעריך</h2>
                <button onClick={() => setShowReviewerForm(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="text-xs text-muted-foreground bg-muted/10 rounded-xl px-3 py-2">מחזור: <span className="text-foreground">{selectedCycle.name}</span></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">שם המעריך *</label>
                  <input value={reviewerForm.reviewerName || ""} onChange={e => setReviewerForm({ ...reviewerForm, reviewerName: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" placeholder="שם המעריך" /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">שם הנסקר (מי מוערך)</label>
                  <input value={reviewerForm.revieweeName || ""} onChange={e => setReviewerForm({ ...reviewerForm, revieweeName: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" placeholder="שם העובד המוערך" /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">סוג הערכה</label>
                  <select value={reviewerForm.reviewType || "peer"} onChange={e => setReviewerForm({ ...reviewerForm, reviewType: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
                    <option value="peer">עמית</option>
                    <option value="manager">מנהל</option>
                    <option value="self">עצמי</option>
                    <option value="subordinate">כפוף</option>
                    <option value="360">360°</option>
                  </select></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowReviewerForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
                <button onClick={saveReviewer} disabled={savingReviewer || !reviewerForm.reviewerName} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-foreground rounded-xl text-sm flex items-center gap-2">
                  {savingReviewer ? "שומר..." : <><Send className="w-3.5 h-3.5" /> הוסף מעריך</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============= REVIEW CYCLE FORM ============= */}
      <AnimatePresence>
        {showCycleForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowCycleForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editingCycle ? "עריכת מחזור הערכה" : "מחזור הערכה חדש"}</h2>
                <button onClick={() => setShowCycleForm(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div><label className="text-xs text-muted-foreground mb-1 block">שם המחזור *</label>
                  <input value={cycleForm.name || ""} onChange={e => setCycleForm({ ...cycleForm, name: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" placeholder="הערכה חצי-שנתית 2026" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground mb-1 block">סוג הערכה</label>
                    <select value={cycleForm.type || "360"} onChange={e => setCycleForm({ ...cycleForm, type: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
                      <option value="360">360°</option>
                      <option value="peer">עמיתים</option>
                      <option value="manager">מנהל</option>
                      <option value="self">עצמי</option>
                    </select></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">סטטוס</label>
                    <select value={cycleForm.status || "draft"} onChange={e => setCycleForm({ ...cycleForm, status: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
                      {Object.entries(REVIEW_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">תאריך התחלה</label>
                    <input type="date" value={cycleForm.startDate || ""} onChange={e => setCycleForm({ ...cycleForm, startDate: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">תאריך סיום</label>
                    <input type="date" value={cycleForm.endDate || ""} onChange={e => setCycleForm({ ...cycleForm, endDate: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                </div>
                <div><label className="text-xs text-muted-foreground mb-1 block">תקופה</label>
                  <input value={cycleForm.period || ""} onChange={e => setCycleForm({ ...cycleForm, period: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" placeholder="Q1 2026" /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowCycleForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
                <button onClick={saveCycle} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-foreground rounded-xl text-sm">שמור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============= PIP FORM ============= */}
      <AnimatePresence>
        {showPIPForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowPIPForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editingPIP ? "עריכת תוכנית שיפור" : "תוכנית שיפור חדשה"}</h2>
                <button onClick={() => setShowPIPForm(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground mb-1 block">שם עובד *</label>
                    <input value={pipForm.employeeName || ""} onChange={e => setPIPForm({ ...pipForm, employeeName: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">מחלקה</label>
                    <input value={pipForm.department || ""} onChange={e => setPIPForm({ ...pipForm, department: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">מנהל</label>
                    <input value={pipForm.managerName || ""} onChange={e => setPIPForm({ ...pipForm, managerName: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">סטטוס</label>
                    <select value={pipForm.status || "active"} onChange={e => setPIPForm({ ...pipForm, status: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
                      {Object.entries(PIP_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">תאריך התחלה</label>
                    <input type="date" value={pipForm.startDate || ""} onChange={e => setPIPForm({ ...pipForm, startDate: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">תאריך סיום</label>
                    <input type="date" value={pipForm.endDate || ""} onChange={e => setPIPForm({ ...pipForm, endDate: e.target.value })} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" /></div>
                </div>
                <div><label className="text-xs text-muted-foreground mb-1 block">סיבה ורקע</label>
                  <textarea value={pipForm.reason || ""} onChange={e => setPIPForm({ ...pipForm, reason: e.target.value })} rows={3} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm resize-none" /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">הערות</label>
                  <textarea value={pipForm.notes || ""} onChange={e => setPIPForm({ ...pipForm, notes: e.target.value })} rows={2} className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm resize-none" /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowPIPForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
                <button onClick={savePIP} className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-foreground rounded-xl text-sm">שמור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
