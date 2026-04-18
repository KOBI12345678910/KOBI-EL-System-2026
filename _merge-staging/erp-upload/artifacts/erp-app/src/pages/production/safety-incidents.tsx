import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Search, Plus, Edit2, X, RefreshCw, AlertTriangle, CheckCircle, Clock,
  Shield, Activity, Loader2, Save, Trash2, Eye, BarChart3, FileText,
  ClipboardCheck, GraduationCap, Flame, Heart, HardHat, AlertCircle,
  TrendingDown, Calendar, Users
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api/safety";
const safeArr = (d: any) => (Array.isArray(d) ? d : d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const typeMap: Record<string, { label: string; color: string }> = {
  injury: { label: "פציעה", color: "bg-red-500/20 text-red-400" },
  near_miss: { label: "כמעט תאונה", color: "bg-yellow-500/20 text-yellow-400" },
  property_damage: { label: "נזק לרכוש", color: "bg-orange-500/20 text-orange-400" },
  fire: { label: "שריפה", color: "bg-red-600/20 text-red-500" },
  chemical_spill: { label: "דליפה כימית", color: "bg-purple-500/20 text-purple-400" },
  equipment_failure: { label: "תקלת ציוד", color: "bg-blue-500/20 text-blue-400" },
  fall: { label: "נפילה", color: "bg-pink-500/20 text-pink-400" },
  cut: { label: "חתך", color: "bg-rose-500/20 text-rose-400" },
  burn: { label: "כוויה", color: "bg-amber-500/20 text-amber-400" },
  eye_injury: { label: "פגיעה בעין", color: "bg-cyan-500/20 text-cyan-400" },
};

const severityMap: Record<string, { label: string; color: string }> = {
  minor: { label: "קל", color: "bg-green-500/20 text-green-400" },
  moderate: { label: "בינוני", color: "bg-yellow-500/20 text-yellow-400" },
  serious: { label: "חמור", color: "bg-orange-500/20 text-orange-400" },
  critical: { label: "קריטי", color: "bg-red-500/20 text-red-400" },
  fatal: { label: "קטלני", color: "bg-red-700/30 text-red-500" },
};

const incStatusMap: Record<string, { label: string; color: string }> = {
  reported: { label: "דווח", color: "bg-blue-500/20 text-blue-400" },
  investigating: { label: "בחקירה", color: "bg-yellow-500/20 text-yellow-400" },
  action_required: { label: "דרושה פעולה", color: "bg-orange-500/20 text-orange-400" },
  resolved: { label: "טופל", color: "bg-green-500/20 text-green-400" },
  closed: { label: "סגור", color: "bg-gray-500/20 text-gray-400" },
};

const eqTypeMap: Record<string, string> = {
  fire_extinguisher: "מטף כיבוי",
  first_aid_kit: "ערכת עזרה ראשונה",
  safety_shower: "מקלחת בטיחות",
  eye_wash: "שטיפת עיניים",
  smoke_detector: "גלאי עשן",
  guard_rail: "מעקה בטיחות",
  ventilation: "אוורור",
  ppe_station: "עמדת ציוד מגן",
};

const trainingCatMap: Record<string, string> = {
  general: "כללי", welding: "ריתוך", cutting: "חיתוך", heights: "עבודה בגובה",
  chemicals: "חומרים מסוכנים", fire: "כיבוי אש", first_aid: "עזרה ראשונה",
  ppe: "ציוד מגן", crane: "מנוף", forklift: "מלגזה",
};

const tabs = [
  { id: "dashboard", label: "לוח בקרה", icon: BarChart3 },
  { id: "incidents", label: "תקריות", icon: AlertTriangle },
  { id: "inspections", label: "ביקורות", icon: ClipboardCheck },
  { id: "training", label: "הדרכות", icon: GraduationCap },
  { id: "equipment", label: "ציוד בטיחות", icon: Shield },
  { id: "procedures", label: "נהלים", icon: FileText },
];

export default function SafetyIncidentsPage() {
  const [tab, setTab] = useState("dashboard");
  const [dashboard, setDashboard] = useState<any>({});
  const [kpis, setKpis] = useState<any>({});
  const [incidents, setIncidents] = useState<any[]>([]);
  const [trend, setTrend] = useState<any[]>([]);
  const [inspections, setInspections] = useState<any[]>([]);
  const [trainings, setTrainings] = useState<any[]>([]);
  const [eqChecks, setEqChecks] = useState<any[]>([]);
  const [procedures, setProcedures] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showIncForm, setShowIncForm] = useState(false);
  const [showInspForm, setShowInspForm] = useState(false);
  const [showTrainForm, setShowTrainForm] = useState(false);
  const [showEqForm, setShowEqForm] = useState(false);
  const [showProcForm, setShowProcForm] = useState(false);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [dash, kpi, inc, trd, insp, trn, eq, proc] = await Promise.all([
        authFetch(`${API}/dashboard`).then(r => r.json()),
        authFetch(`${API}/kpis`).then(r => r.json()),
        authFetch(`${API}/incidents`).then(r => r.json()),
        authFetch(`${API}/incidents/trend`).then(r => r.json()),
        authFetch(`${API}/inspections`).then(r => r.json()),
        authFetch(`${API}/trainings`).then(r => r.json()),
        authFetch(`${API}/equipment-checks`).then(r => r.json()),
        authFetch(`${API}/procedures`).then(r => r.json()),
      ]);
      setDashboard(dash); setKpis(kpi); setIncidents(safeArr(inc)); setTrend(safeArr(trd));
      setInspections(safeArr(insp)); setTrainings(safeArr(trn)); setEqChecks(safeArr(eq)); setProcedures(safeArr(proc));
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filteredInc = useMemo(() => incidents.filter(i => {
    if (search && !`${i.description} ${i.employee_name} ${i.incident_number}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType && i.type !== filterType) return false;
    if (filterSeverity && i.severity !== filterSeverity) return false;
    return true;
  }), [incidents, search, filterType, filterSeverity]);

  const saveIncident = async () => {
    const method = editing?.id ? "PUT" : "POST";
    const url = editing?.id ? `${API}/incidents/${editing.id}` : `${API}/incidents`;
    await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowIncForm(false); setEditing(null); setForm({}); load();
  };

  const saveInspection = async () => {
    const method = editing?.id ? "PUT" : "POST";
    const url = editing?.id ? `${API}/inspections/${editing.id}` : `${API}/inspections`;
    await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowInspForm(false); setEditing(null); setForm({}); load();
  };

  const saveTraining = async () => {
    const method = editing?.id ? "PUT" : "POST";
    const url = editing?.id ? `${API}/trainings/${editing.id}` : `${API}/trainings`;
    await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowTrainForm(false); setEditing(null); setForm({}); load();
  };

  const saveEqCheck = async () => {
    await authFetch(`${API}/equipment-checks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowEqForm(false); setForm({}); load();
  };

  const saveProcedure = async () => {
    const method = editing?.id ? "PUT" : "POST";
    const url = editing?.id ? `${API}/procedures/${editing.id}` : `${API}/procedures`;
    await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowProcForm(false); setEditing(null); setForm({}); load();
  };

  const d = dashboard;
  const k = kpis;

  return (
    <div dir="rtl" className="p-6 space-y-6 bg-gradient-to-br from-[#0a0a1a] to-[#1a1a3a] min-h-screen text-white">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-l from-red-400 to-orange-400 bg-clip-text text-transparent">
            בטיחות ותקריות
          </h1>
          <p className="text-gray-400 mt-1">ניהול בטיחות, תקריות, ביקורות, הדרכות ונהלים</p>
        </div>
        <Button onClick={load} variant="outline" size="sm" className="border-gray-700">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span className="mr-2">רענון</span>
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {tabs.map(t => (
          <Button key={t.id} variant={tab === t.id ? "default" : "outline"} size="sm"
            className={tab === t.id ? "bg-red-600" : "border-gray-700 text-gray-300"}
            onClick={() => setTab(t.id)}>
            <t.icon className="w-4 h-4 ml-1" /> {t.label}
          </Button>
        ))}
      </div>

      {/* ═══ DASHBOARD ═══ */}
      {tab === "dashboard" && (
        <div className="space-y-6">
          {/* Days since last incident - big hero */}
          <Card className="bg-gradient-to-l from-green-900/30 to-emerald-900/30 border-green-500/20">
            <CardContent className="p-6 text-center">
              <Shield className="w-12 h-12 mx-auto text-green-400 mb-2" />
              <div className="text-6xl font-bold text-green-400">{d.days_since_last_incident ?? k.days_since_last_incident ?? 0}</div>
              <div className="text-xl text-green-300 mt-1">ימים ללא תאונה</div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: "סה\"כ תקריות", val: d.total_incidents, color: "text-white", icon: AlertTriangle },
              { label: "תקריות פתוחות", val: d.open_incidents, color: "text-orange-400", icon: AlertCircle },
              { label: "ביקורות באיחור", val: d.overdue_inspections, color: "text-red-400", icon: ClipboardCheck },
              { label: "הדרכות קרובות", val: d.training_due, color: "text-yellow-400", icon: GraduationCap },
              { label: "תקלות ציוד", val: d.equipment_issues, color: "text-pink-400", icon: Shield },
              { label: "ימי אובדן (שנה)", val: k.year_days_lost, color: "text-red-400", icon: TrendingDown },
              { label: "עמידה בהדרכות", val: `${k.training_avg_pass_rate || 0}%`, color: "text-green-400", icon: CheckCircle },
            ].map((c, i) => (
              <Card key={i} className="bg-white/5 border-white/10">
                <CardContent className="p-3 text-center">
                  <c.icon className={`w-5 h-5 mx-auto mb-1 ${c.color}`} />
                  <div className={`text-2xl font-bold ${c.color}`}>{c.val ?? 0}</div>
                  <div className="text-xs text-gray-400">{c.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* By type & severity */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <h3 className="font-semibold text-lg mb-3">תקריות לפי סוג</h3>
                <div className="space-y-2">
                  {safeArr(d.by_type).map((t: any, i: number) => (
                    <div key={i} className="flex justify-between items-center bg-white/5 rounded p-2">
                      <Badge className={typeMap[t.type]?.color || "bg-gray-500/20"}>{typeMap[t.type]?.label || t.type}</Badge>
                      <span className="font-bold">{t.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <h3 className="font-semibold text-lg mb-3">תקריות לפי חומרה</h3>
                <div className="space-y-2">
                  {safeArr(d.by_severity).map((s: any, i: number) => (
                    <div key={i} className="flex justify-between items-center bg-white/5 rounded p-2">
                      <Badge className={severityMap[s.severity]?.color || "bg-gray-500/20"}>{severityMap[s.severity]?.label || s.severity}</Badge>
                      <span className="font-bold">{s.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Trend */}
          {trend.length > 0 && (
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <h3 className="font-semibold text-lg mb-3">מגמת תקריות (12 חודשים)</h3>
                <div className="flex gap-1 items-end h-32">
                  {trend.map((t: any, i: number) => {
                    const max = Math.max(...trend.map((x: any) => Number(x.total) || 1));
                    const h = ((Number(t.total) || 0) / max) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs text-gray-400">{t.total}</span>
                        <div className="w-full rounded-t" style={{ height: `${h}%`, backgroundColor: Number(t.serious) > 0 ? '#ef4444' : Number(t.moderate) > 0 ? '#f59e0b' : '#22c55e' }} />
                        <span className="text-[10px] text-gray-500">{t.month?.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent */}
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <h3 className="font-semibold text-lg mb-3">תקריות אחרונות</h3>
              <div className="space-y-2">
                {safeArr(d.recent_incidents).map((inc: any) => (
                  <div key={inc.id} className="flex justify-between items-center bg-white/5 rounded p-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge className={severityMap[inc.severity]?.color}>{severityMap[inc.severity]?.label}</Badge>
                      <Badge className={typeMap[inc.type]?.color}>{typeMap[inc.type]?.label}</Badge>
                      <span>{inc.description?.slice(0, 60)}</span>
                    </div>
                    <span className="text-gray-400">{inc.date?.split("T")[0]}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ INCIDENTS ═══ */}
      {tab === "incidents" && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap items-end">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
              <Input className="pr-10 bg-white/5 border-white/10" placeholder="חיפוש תקריות..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">כל הסוגים</option>
              {Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
              <option value="">כל החומרות</option>
              {Object.entries(severityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <Button onClick={() => { setEditing(null); setForm({}); setShowIncForm(true); }} className="bg-red-600 hover:bg-red-700">
              <Plus className="w-4 h-4 ml-1" /> דיווח תקרית
            </Button>
          </div>

          <div className="grid gap-3">
            {filteredInc.map((inc: any) => (
              <Card key={inc.id} className="bg-white/5 border-white/10 hover:bg-white/8 transition cursor-pointer" onClick={() => setShowDetail(inc)}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm text-gray-400">{inc.incident_number}</span>
                        <Badge className={typeMap[inc.type]?.color}>{typeMap[inc.type]?.label}</Badge>
                        <Badge className={severityMap[inc.severity]?.color}>{severityMap[inc.severity]?.label}</Badge>
                        <Badge className={incStatusMap[inc.status]?.color}>{incStatusMap[inc.status]?.label}</Badge>
                      </div>
                      <div className="text-sm mt-1">{inc.description?.slice(0, 100)}</div>
                      <div className="text-xs text-gray-400 mt-1 flex gap-4">
                        <span>תאריך: {inc.date?.split("T")[0]}</span>
                        <span>מיקום: {inc.location}</span>
                        {inc.employee_name && <span>עובד: {inc.employee_name}</span>}
                        {inc.days_lost > 0 && <span className="text-red-400">ימי אובדן: {inc.days_lost}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="border-white/20 text-xs"
                        onClick={e => { e.stopPropagation(); setEditing(inc); setForm(inc); setShowIncForm(true); }}>
                        <Edit2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ═══ INSPECTIONS ═══ */}
      {tab === "inspections" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-blue-400" /> ביקורות בטיחות</h2>
            <Button onClick={() => { setEditing(null); setForm({}); setShowInspForm(true); }} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 ml-1" /> ביקורת חדשה
            </Button>
          </div>
          <div className="grid gap-3">
            {inspections.map((insp: any) => (
              <Card key={insp.id} className="bg-white/5 border-white/10">
                <CardContent className="p-4 flex justify-between items-center">
                  <div>
                    <div className="font-semibold">{insp.area}</div>
                    <div className="text-sm text-gray-400">
                      תאריך: {insp.inspection_date} | מבקר: {insp.inspector_name} | הבאה: {insp.next_inspection || "-"}
                    </div>
                    {insp.findings && <div className="text-xs text-gray-500 mt-1">{insp.findings.slice(0, 100)}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={insp.overall_result === "pass" ? "bg-green-500/20 text-green-400" : insp.overall_result === "fail" ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}>
                      {insp.overall_result === "pass" ? "עבר" : insp.overall_result === "fail" ? "נכשל" : "מותנה"}
                    </Badge>
                    <Badge className={insp.status === "completed" ? "bg-green-500/20 text-green-400" : insp.status === "overdue" ? "bg-red-500/20 text-red-400" : "bg-gray-500/20 text-gray-400"}>
                      {insp.status === "completed" ? "הושלם" : insp.status === "overdue" ? "באיחור" : "מתוכנן"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ═══ TRAINING ═══ */}
      {tab === "training" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold flex items-center gap-2"><GraduationCap className="w-5 h-5 text-green-400" /> הדרכות בטיחות</h2>
            <Button onClick={() => { setEditing(null); setForm({}); setShowTrainForm(true); }} className="bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4 ml-1" /> הדרכה חדשה
            </Button>
          </div>
          <div className="grid gap-3">
            {trainings.map((tr: any) => (
              <Card key={tr.id} className="bg-white/5 border-white/10">
                <CardContent className="p-4 flex justify-between items-center">
                  <div>
                    <div className="font-semibold">{tr.training_name}</div>
                    <div className="text-sm text-gray-400">
                      קטגוריה: {trainingCatMap[tr.category] || tr.category} | מדריך: {tr.instructor}
                      | תאריך: {tr.date} | {tr.duration_hours} שעות
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      משתתפים: {safeArr(tr.attendees).length} | אחוז הצלחה: {Number(tr.pass_rate || 0).toFixed(0)}% | תעודות: {tr.certificates_issued}
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="text-2xl font-bold text-green-400">{Number(tr.pass_rate || 0).toFixed(0)}%</div>
                    <div className="text-xs text-gray-400">הצלחה</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ═══ EQUIPMENT CHECKS ═══ */}
      {tab === "equipment" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold flex items-center gap-2"><Shield className="w-5 h-5 text-emerald-400" /> בדיקות ציוד בטיחות</h2>
            <Button onClick={() => { setForm({}); setShowEqForm(true); }} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 ml-1" /> בדיקה חדשה
            </Button>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {eqChecks.map((eq: any) => (
              <Card key={eq.id} className="bg-white/5 border-white/10">
                <CardContent className="p-4 flex justify-between items-center">
                  <div>
                    <div className="font-semibold">{eqTypeMap[eq.equipment_type] || eq.equipment_type}</div>
                    <div className="text-sm text-gray-400">מיקום: {eq.location} | בדק: {eq.checked_by} | {eq.check_date}</div>
                  </div>
                  <Badge className={eq.status === "ok" ? "bg-green-500/20 text-green-400" : eq.status === "missing" ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}>
                    {eq.status === "ok" ? "תקין" : eq.status === "missing" ? "חסר" : eq.status === "replaced" ? "הוחלף" : "דורש תיקון"}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ═══ PROCEDURES ═══ */}
      {tab === "procedures" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold flex items-center gap-2"><FileText className="w-5 h-5 text-purple-400" /> נוהלי בטיחות</h2>
            <Button onClick={() => { setEditing(null); setForm({}); setShowProcForm(true); }} className="bg-purple-600 hover:bg-purple-700">
              <Plus className="w-4 h-4 ml-1" /> נוהל חדש
            </Button>
          </div>
          <div className="grid gap-3">
            {procedures.map((p: any) => (
              <Card key={p.id} className="bg-white/5 border-white/10">
                <CardContent className="p-4 flex justify-between items-center">
                  <div>
                    <div className="font-semibold">{p.procedure_name}</div>
                    <div className="text-sm text-gray-400">
                      קטגוריה: {trainingCatMap[p.category] || p.category || "-"} | גרסה: {p.version}
                      | עודכן: {p.last_updated}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      אישור: {p.acknowledged_count}/{p.total_employees} עובדים
                      ({p.total_employees > 0 ? ((p.acknowledged_count / p.total_employees) * 100).toFixed(0) : 0}%)
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-1.5 mt-1 max-w-[200px]">
                      <div className="bg-purple-500 rounded-full h-1.5" style={{ width: `${p.total_employees > 0 ? (p.acknowledged_count / p.total_employees) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <Badge className={p.status === "active" ? "bg-green-500/20 text-green-400" : p.status === "draft" ? "bg-gray-500/20 text-gray-400" : "bg-orange-500/20 text-orange-400"}>
                    {p.status === "active" ? "פעיל" : p.status === "draft" ? "טיוטה" : "בארכיון"}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ═══ MODALS ═══ */}

      {/* Incident Form */}
      {showIncForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#1a1a3a] border-white/10 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between"><h3 className="text-xl font-bold">{editing?.id ? "עריכת תקרית" : "דיווח תקרית חדשה"}</h3><Button size="sm" variant="ghost" onClick={() => setShowIncForm(false)}><X className="w-4 h-4" /></Button></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>סוג</Label>
                  <select className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={form.type || ""} onChange={e => setForm({ ...form, type: e.target.value })}>
                    <option value="">בחר</option>
                    {Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div><Label>חומרה</Label>
                  <select className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={form.severity || ""} onChange={e => setForm({ ...form, severity: e.target.value })}>
                    <option value="">בחר</option>
                    {Object.entries(severityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div><Label>מיקום</Label><Input className="bg-white/5 border-white/10" value={form.location || ""} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
                <div><Label>שם עובד</Label><Input className="bg-white/5 border-white/10" value={form.employee_name || ""} onChange={e => setForm({ ...form, employee_name: e.target.value })} /></div>
              </div>
              <div><Label>תיאור</Label><textarea className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm min-h-[80px]" value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>פעולה מיידית</Label><Input className="bg-white/5 border-white/10" value={form.immediate_action || ""} onChange={e => setForm({ ...form, immediate_action: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>סיבה שורשית</Label><Input className="bg-white/5 border-white/10" value={form.root_cause || ""} onChange={e => setForm({ ...form, root_cause: e.target.value })} /></div>
                <div><Label>פעולה מתקנת</Label><Input className="bg-white/5 border-white/10" value={form.corrective_action || ""} onChange={e => setForm({ ...form, corrective_action: e.target.value })} /></div>
                <div><Label>פעולה מונעת</Label><Input className="bg-white/5 border-white/10" value={form.preventive_action || ""} onChange={e => setForm({ ...form, preventive_action: e.target.value })} /></div>
                <div><Label>טיפול רפואי</Label><Input className="bg-white/5 border-white/10" value={form.medical_treatment || ""} onChange={e => setForm({ ...form, medical_treatment: e.target.value })} /></div>
                <div><Label>ימי אובדן</Label><Input type="number" className="bg-white/5 border-white/10" value={form.days_lost || 0} onChange={e => setForm({ ...form, days_lost: e.target.value })} /></div>
                <div><Label>הערכת עלות</Label><Input type="number" className="bg-white/5 border-white/10" value={form.cost_estimate || 0} onChange={e => setForm({ ...form, cost_estimate: e.target.value })} /></div>
              </div>
              <div><Label>סטטוס</Label>
                <select className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={form.status || "reported"} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(incStatusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <Button onClick={saveIncident} className="w-full bg-red-600 hover:bg-red-700"><Save className="w-4 h-4 ml-1" /> שמירה</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Inspection Form */}
      {showInspForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#1a1a3a] border-white/10 w-full max-w-md">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between"><h3 className="text-xl font-bold">ביקורת חדשה</h3><Button size="sm" variant="ghost" onClick={() => setShowInspForm(false)}><X className="w-4 h-4" /></Button></div>
              <div><Label>אזור</Label><Input className="bg-white/5 border-white/10" value={form.area || ""} onChange={e => setForm({ ...form, area: e.target.value })} /></div>
              <div><Label>שם מבקר</Label><Input className="bg-white/5 border-white/10" value={form.inspector_name || ""} onChange={e => setForm({ ...form, inspector_name: e.target.value })} /></div>
              <div><Label>תאריך</Label><Input type="date" className="bg-white/5 border-white/10" value={form.inspection_date || ""} onChange={e => setForm({ ...form, inspection_date: e.target.value })} /></div>
              <div><Label>תוצאה</Label>
                <select className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={form.overall_result || ""} onChange={e => setForm({ ...form, overall_result: e.target.value })}>
                  <option value="">בחר</option>
                  <option value="pass">עבר</option>
                  <option value="fail">נכשל</option>
                  <option value="conditional">מותנה</option>
                </select>
              </div>
              <div><Label>ממצאים</Label><textarea className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm min-h-[60px]" value={form.findings || ""} onChange={e => setForm({ ...form, findings: e.target.value })} /></div>
              <div><Label>ביקורת הבאה</Label><Input type="date" className="bg-white/5 border-white/10" value={form.next_inspection || ""} onChange={e => setForm({ ...form, next_inspection: e.target.value })} /></div>
              <div><Label>סטטוס</Label>
                <select className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={form.status || "completed"} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="scheduled">מתוכנן</option>
                  <option value="completed">הושלם</option>
                </select>
              </div>
              <Button onClick={saveInspection} className="w-full bg-blue-600 hover:bg-blue-700"><Save className="w-4 h-4 ml-1" /> שמירה</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Training Form */}
      {showTrainForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#1a1a3a] border-white/10 w-full max-w-md">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between"><h3 className="text-xl font-bold">הדרכה חדשה</h3><Button size="sm" variant="ghost" onClick={() => setShowTrainForm(false)}><X className="w-4 h-4" /></Button></div>
              <div><Label>שם הדרכה</Label><Input className="bg-white/5 border-white/10" value={form.training_name || ""} onChange={e => setForm({ ...form, training_name: e.target.value })} /></div>
              <div><Label>קטגוריה</Label>
                <select className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })}>
                  <option value="">בחר</option>
                  {Object.entries(trainingCatMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><Label>מדריך</Label><Input className="bg-white/5 border-white/10" value={form.instructor || ""} onChange={e => setForm({ ...form, instructor: e.target.value })} /></div>
              <div><Label>תאריך</Label><Input type="date" className="bg-white/5 border-white/10" value={form.date || ""} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div><Label>משך (שעות)</Label><Input type="number" step="0.5" className="bg-white/5 border-white/10" value={form.duration_hours || ""} onChange={e => setForm({ ...form, duration_hours: e.target.value })} /></div>
              <div><Label>ריענון הבא</Label><Input type="date" className="bg-white/5 border-white/10" value={form.next_refresher || ""} onChange={e => setForm({ ...form, next_refresher: e.target.value })} /></div>
              <Button onClick={saveTraining} className="w-full bg-green-600 hover:bg-green-700"><Save className="w-4 h-4 ml-1" /> שמירה</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Equipment Check Form */}
      {showEqForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#1a1a3a] border-white/10 w-full max-w-md">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between"><h3 className="text-xl font-bold">בדיקת ציוד</h3><Button size="sm" variant="ghost" onClick={() => setShowEqForm(false)}><X className="w-4 h-4" /></Button></div>
              <div><Label>סוג ציוד</Label>
                <select className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={form.equipment_type || ""} onChange={e => setForm({ ...form, equipment_type: e.target.value })}>
                  <option value="">בחר</option>
                  {Object.entries(eqTypeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><Label>מיקום</Label><Input className="bg-white/5 border-white/10" value={form.location || ""} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
              <div><Label>בודק</Label><Input className="bg-white/5 border-white/10" value={form.checked_by || ""} onChange={e => setForm({ ...form, checked_by: e.target.value })} /></div>
              <div><Label>סטטוס</Label>
                <select className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={form.status || "ok"} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="ok">תקין</option>
                  <option value="needs_repair">דורש תיקון</option>
                  <option value="replaced">הוחלף</option>
                  <option value="missing">חסר</option>
                </select>
              </div>
              <div><Label>בדיקה הבאה</Label><Input type="date" className="bg-white/5 border-white/10" value={form.next_check || ""} onChange={e => setForm({ ...form, next_check: e.target.value })} /></div>
              <Button onClick={saveEqCheck} className="w-full bg-emerald-600 hover:bg-emerald-700"><Save className="w-4 h-4 ml-1" /> שמירה</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Procedure Form */}
      {showProcForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#1a1a3a] border-white/10 w-full max-w-md">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between"><h3 className="text-xl font-bold">נוהל חדש</h3><Button size="sm" variant="ghost" onClick={() => setShowProcForm(false)}><X className="w-4 h-4" /></Button></div>
              <div><Label>שם נוהל</Label><Input className="bg-white/5 border-white/10" value={form.procedure_name || ""} onChange={e => setForm({ ...form, procedure_name: e.target.value })} /></div>
              <div><Label>קטגוריה</Label><Input className="bg-white/5 border-white/10" value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
              <div><Label>תוכן</Label><textarea className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm min-h-[100px]" value={form.content || ""} onChange={e => setForm({ ...form, content: e.target.value })} /></div>
              <div><Label>סה"כ עובדים</Label><Input type="number" className="bg-white/5 border-white/10" value={form.total_employees || ""} onChange={e => setForm({ ...form, total_employees: e.target.value })} /></div>
              <div><Label>סטטוס</Label>
                <select className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="draft">טיוטה</option>
                  <option value="active">פעיל</option>
                  <option value="archived">בארכיון</option>
                </select>
              </div>
              <Button onClick={saveProcedure} className="w-full bg-purple-600 hover:bg-purple-700"><Save className="w-4 h-4 ml-1" /> שמירה</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Incident Detail Modal */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowDetail(null)}>
          <Card className="bg-[#1a1a3a] border-white/10 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-mono text-sm text-gray-400">{showDetail.incident_number}</div>
                  <h3 className="text-xl font-bold mt-1">פרטי תקרית</h3>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setShowDetail(null)}><X className="w-4 h-4" /></Button>
              </div>
              <div className="flex gap-2">
                <Badge className={typeMap[showDetail.type]?.color}>{typeMap[showDetail.type]?.label}</Badge>
                <Badge className={severityMap[showDetail.severity]?.color}>{severityMap[showDetail.severity]?.label}</Badge>
                <Badge className={incStatusMap[showDetail.status]?.color}>{incStatusMap[showDetail.status]?.label}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-400">תאריך:</span> <span>{showDetail.date?.split("T")[0]}</span></div>
                <div><span className="text-gray-400">מיקום:</span> <span>{showDetail.location}</span></div>
                {showDetail.employee_name && <div><span className="text-gray-400">עובד:</span> <span>{showDetail.employee_name}</span></div>}
                {showDetail.days_lost > 0 && <div><span className="text-gray-400">ימי אובדן:</span> <span className="text-red-400">{showDetail.days_lost}</span></div>}
              </div>
              <div className="space-y-2 text-sm">
                {showDetail.description && <div><span className="text-gray-400 font-semibold">תיאור:</span><div className="mt-1">{showDetail.description}</div></div>}
                {showDetail.immediate_action && <div><span className="text-gray-400 font-semibold">פעולה מיידית:</span><div className="mt-1">{showDetail.immediate_action}</div></div>}
                {showDetail.root_cause && <div><span className="text-gray-400 font-semibold">סיבה שורשית:</span><div className="mt-1">{showDetail.root_cause}</div></div>}
                {showDetail.corrective_action && <div><span className="text-gray-400 font-semibold">פעולה מתקנת:</span><div className="mt-1">{showDetail.corrective_action}</div></div>}
                {showDetail.preventive_action && <div><span className="text-gray-400 font-semibold">פעולה מונעת:</span><div className="mt-1">{showDetail.preventive_action}</div></div>}
                {showDetail.medical_treatment && <div><span className="text-gray-400 font-semibold">טיפול רפואי:</span><div className="mt-1">{showDetail.medical_treatment}</div></div>}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
