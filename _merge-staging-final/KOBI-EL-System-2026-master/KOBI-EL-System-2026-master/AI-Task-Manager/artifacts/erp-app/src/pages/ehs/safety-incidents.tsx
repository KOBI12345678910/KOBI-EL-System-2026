import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Search, Download, Eye, Edit2, Trash2, ChevronRight, ChevronLeft,
  Filter, AlertCircle, CheckCircle2, Clock, Loader2, X, Save, MoreHorizontal,
  ChevronsUpDown, ShieldAlert, Activity, FileText, Users, AlertTriangle,
  ClipboardList, ChevronDown, ArrowUpRight
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const INCIDENT_TYPES = [
  { value: "near_miss", label: "כמעט תאונה" },
  { value: "first_aid", label: "עזרה ראשונה" },
  { value: "property_damage", label: "נזק לרכוש" },
  { value: "medical_treatment", label: "טיפול רפואי" },
  { value: "lost_time", label: "אובדן ימי עבודה" },
  { value: "fatality", label: "תאונה קטלנית" },
  { value: "environmental", label: "אירוע סביבתי" },
  { value: "hazard", label: "זיהוי סכנה" },
];

const SEVERITIES = [
  { value: "negligible", label: "זניח", color: "bg-gray-500/20 text-gray-300" },
  { value: "minor", label: "קל", color: "bg-blue-500/20 text-blue-300" },
  { value: "moderate", label: "בינוני", color: "bg-yellow-500/20 text-yellow-300" },
  { value: "major", label: "חמור", color: "bg-orange-500/20 text-orange-300" },
  { value: "critical", label: "קריטי", color: "bg-red-500/20 text-red-300" },
  { value: "catastrophic", label: "קטסטרופלי", color: "bg-red-700/20 text-red-400" },
];

const STATUSES = [
  { value: "reported", label: "דווח", color: "bg-blue-500/20 text-blue-300" },
  { value: "under_investigation", label: "בחקירה", color: "bg-yellow-500/20 text-yellow-300" },
  { value: "corrective_action", label: "בטיפול", color: "bg-orange-500/20 text-orange-300" },
  { value: "monitoring", label: "מעקב", color: "bg-purple-500/20 text-purple-300" },
  { value: "closed", label: "סגור", color: "bg-green-500/20 text-green-300" },
  { value: "reopened", label: "נפתח מחדש", color: "bg-red-500/20 text-red-300" },
];

const LOCATIONS = ["אולם A", "אולם B", "אולם C", "מחסן ראשי", "חצר", "משרדים", "קו ציפוי", "מחלקת ריתוך", "מחלקת גמר", "כניסה ראשית"];
const DEPARTMENTS = ["ייצור", "לוגיסטיקה", "מחסן", "גמר", "ריתוך", "ציפוי", "אדמיניסטרציה", "שירות", "מכירות", "הנדסה"];
const INJURY_TYPES = ["none", "cut", "burn", "fracture", "sprain", "eye_injury", "hearing_damage", "chemical_exposure", "electric_shock", "crush"];
const INJURY_TYPE_LABELS: Record<string, string> = {
  none: "ללא פגיעה", cut: "חתך", burn: "כוויה", fracture: "שבר", sprain: "נקע",
  eye_injury: "פגיעת עין", hearing_damage: "פגיעת שמיעה", chemical_exposure: "חשיפה כימית",
  electric_shock: "חשמל", crush: "מחיצה"
};

function getStatusInfo(val: string) {
  return STATUSES.find(s => s.value === val) || { label: val, color: "bg-gray-500/20 text-gray-300" };
}
function getSeverityInfo(val: string) {
  return SEVERITIES.find(s => s.value === val) || { label: val, color: "bg-gray-500/20 text-gray-300" };
}
function getTypeLabel(val: string) {
  return INCIDENT_TYPES.find(t => t.value === val)?.label || val;
}

export default function SafetyIncidents() {
  const [data, setData] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<any | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any | null>(null);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<any>({});

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const load = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams({
        page: String(page), limit: String(perPage),
        ...(search ? { search } : {}),
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        ...(severityFilter !== "all" ? { severity: severityFilter } : {}),
        ...(typeFilter !== "all" ? { incident_type: typeFilter } : {}),
      });
      const [dataRes, statsRes] = await Promise.all([
        authFetch(`/api/hse/incidents?${params}`),
        authFetch("/api/hse/incidents/stats"),
      ]);
      if (dataRes.ok) {
        const j = await dataRes.json();
        setData(j.data || []);
        setTotal(j.pagination?.total || 0);
      }
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e: any) { setError(e.message); }
    setIsLoading(false);
  }, [page, perPage, search, statusFilter, severityFilter, typeFilter]);

  useEffect(() => { setIsLoading(true); load(); }, [load]);

  const displayData = useMemo(() => {
    if (!sortField) return data;
    return [...data].sort((a, b) => {
      const av = a[sortField], bv = b[sortField];
      const cmp = String(av || "").localeCompare(String(bv || ""), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortField, sortDir]);

  const pd = displayData.slice(0, perPage);
  const allSel = pd.length > 0 && pd.every(r => selected.has(r.id));

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: string }) => (
    <ChevronsUpDown className={`h-3 w-3 ${sortField === field ? "text-blue-400" : "opacity-40"}`} />
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const method = editId ? "PUT" : "POST";
      const url = editId ? `/api/hse/incidents/${editId}` : "/api/hse/incidents";
      const res = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "שגיאה בשמירה");
      }
      setShowCreate(false); setEditId(null); setForm({}); setStep(1);
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await authFetch(`/api/hse/incidents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "שגיאה במחיקה");
      }
      setDeleteConfirm(null);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const openEdit = async (id: number) => {
    setMenuOpen(null);
    const res = await authFetch(`/api/hse/incidents/${id}`);
    if (res.ok) {
      const r = await res.json();
      setForm({
        title: r.title, incidentType: r.incident_type, incidentDate: r.incident_date?.slice(0, 10),
        incidentTime: r.incident_time, severity: r.severity, status: r.status, location: r.location,
        department: r.department, reportedBy: r.reported_by, involvedPersons: r.involved_persons,
        witnesses: r.witnesses, injuryType: r.injury_type, injuryDescription: r.injury_description,
        bodyPart: r.body_part, treatmentGiven: r.treatment_given, hospitalized: r.hospitalized,
        lostWorkDays: r.lost_work_days, estimatedCost: r.estimated_cost, notes: r.notes,
        employeeName: r.employee_name, description: r.description,
      });
      setEditId(id); setStep(1); setShowCreate(true);
    }
  };

  const openDetail = async (row: any) => {
    setMenuOpen(null);
    const res = await authFetch(`/api/hse/incidents/${row.id}/full`);
    if (res.ok) setShowDetail(await res.json());
    else setShowDetail({ incident: row, investigations: [], correctiveActions: [], witnesses: [], lessons: [], timeline: [] });
  };

  const af = [statusFilter !== "all", severityFilter !== "all", typeFilter !== "all"].filter(Boolean).length;

  const STEP_TITLES = ["פרטי אירוע", "אנשים מעורבים", "פרטי פגיעה", "תיאור מפורט"];

  const F = ({ label, children, span }: { label: string; children: React.ReactNode; span?: number }) => (
    <div className={span ? `col-span-${span}` : ""}>
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );

  const SI = (p: any) => <select {...p} className={`w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground ${p.className || ""}`}>{p.children}</select>;
  const TI = (p: any) => <Input {...p} className={`bg-input border-border text-foreground ${p.className || ""}`} />;
  const TA = (p: any) => <textarea {...p} className={`w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground resize-none ${p.className || ""}`} />;

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-red-400" />
            תיעוד אירועי בטיחות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">דיווח, חקירה וניהול אירועי בטיחות בסביבת העבודה</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="border-border text-gray-300 gap-1">
            <Download className="h-4 w-4" />ייצוא
          </Button>
          <Button onClick={() => { setForm({ incidentDate: new Date().toISOString().slice(0, 10), status: "reported", severity: "minor", incidentType: "near_miss" }); setStep(1); setEditId(null); setShowCreate(true); }} className="bg-blue-600 hover:bg-blue-700 gap-2">
            <Plus className="h-4 w-4" />דיווח אירוע חדש
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: "סה״כ השנה", value: stats.this_year || 0, color: "text-foreground", icon: <Activity className="h-4 w-4 text-blue-400" /> },
          { label: "החודש", value: stats.this_month || 0, color: "text-red-400", icon: <AlertTriangle className="h-4 w-4 text-red-400" /> },
          { label: "בחקירה", value: stats.under_investigation || 0, color: "text-yellow-400", icon: <ClipboardList className="h-4 w-4 text-yellow-400" /> },
          { label: "בטיפול", value: stats.corrective_action || 0, color: "text-orange-400", icon: <FileText className="h-4 w-4 text-orange-400" /> },
          { label: "כמעט תאונות", value: stats.near_misses || 0, color: "text-amber-400", icon: <AlertCircle className="h-4 w-4 text-amber-400" /> },
          { label: "אשפוזים", value: stats.hospitalizations || 0, color: "text-red-500", icon: <Users className="h-4 w-4 text-red-500" /> },
        ].map((k, i) => (
          <Card key={i} className="bg-card/80 border-border">
            <CardContent className="p-3">
              {isLoading ? (
                <div className="space-y-2 animate-pulse"><div className="h-3 w-16 bg-muted rounded" /><div className="h-6 w-12 bg-muted rounded" /></div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{k.label}</p>
                    <p className={`text-xl font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
                  </div>
                  {k.icon}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card/60 border-border">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="חיפוש..." className="pr-9 bg-input border-border text-foreground" />
            </div>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסטטוסים</option>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={severityFilter} onChange={e => { setSeverityFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל החומרות</option>
              {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסוגים</option>
              {INCIDENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {af > 0 && (
              <Button variant="ghost" size="sm" onClick={() => { setStatusFilter("all"); setSeverityFilter("all"); setTypeFilter("all"); setSearch(""); }} className="text-red-400 hover:text-red-300 gap-1">
                <X className="h-3 w-3" />נקה ({af})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
          <span className="text-sm text-blue-300">{selected.size} נבחרו</span>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="text-gray-400 mr-auto">בטל</Button>
        </div>
      )}

      <Card className="bg-card/80 border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  <th className="p-3 w-10"><input type="checkbox" checked={allSel} onChange={() => { if (allSel) setSelected(new Set()); else setSelected(new Set(pd.map(r => r.id))); }} className="rounded" /></th>
                  {[
                    { key: "incident_number", label: "מס' אירוע" },
                    { key: "incident_date", label: "תאריך" },
                    { key: "title", label: "אירוע" },
                    { key: "incident_type", label: "סוג" },
                    { key: "severity", label: "חומרה" },
                    { key: "location", label: "מיקום" },
                    { key: "department", label: "מחלקה" },
                    { key: "reported_by", label: "מדווח" },
                    { key: "status", label: "סטטוס" },
                  ].map(col => (
                    <th key={col.key} className="p-3 text-right text-muted-foreground font-medium">
                      <button className="flex items-center gap-1" onClick={() => toggleSort(col.key)}>
                        {col.label}<SortIcon field={col.key} />
                      </button>
                    </th>
                  ))}
                  <th className="p-3 text-center text-muted-foreground font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, sk) => (
                    <tr key={sk} className="border-b border-border/50">
                      <td colSpan={11} className="p-3">
                        <div className="flex items-center gap-4 animate-pulse">
                          <div className="h-4 w-4 bg-muted rounded" />
                          <div className="h-4 w-24 bg-muted rounded" />
                          <div className="h-4 w-32 bg-muted rounded" />
                          <div className="h-4 w-20 bg-muted rounded" />
                          <div className="h-4 w-16 bg-muted rounded" />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : pd.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-20 text-center">
                      <div className="flex flex-col items-center gap-4">
                        {(af > 0 || search) ? <Search className="h-16 w-16 text-muted-foreground" /> : <ShieldAlert className="h-16 w-16 text-muted-foreground" />}
                        <p className="text-lg font-medium text-muted-foreground">
                          {(af > 0 || search) ? "לא נמצאו תוצאות" : "עדיין אין אירועי בטיחות"}
                        </p>
                        {!(af > 0 || search) && (
                          <Button onClick={() => { setForm({ incidentDate: new Date().toISOString().slice(0, 10), status: "reported", severity: "minor", incidentType: "near_miss" }); setStep(1); setEditId(null); setShowCreate(true); }} className="bg-blue-600 hover:bg-blue-700 gap-2 mt-2">
                            <Plus className="h-4 w-4" />דיווח אירוע ראשון
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  pd.map(row => {
                    const sv = getSeverityInfo(row.severity);
                    const st = getStatusInfo(row.status);
                    return (
                      <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="p-3"><input type="checkbox" checked={selected.has(row.id)} onChange={() => { const s = new Set(selected); s.has(row.id) ? s.delete(row.id) : s.add(row.id); setSelected(s); }} className="rounded" /></td>
                        <td className="p-3 font-mono text-xs text-blue-400">{row.incident_number || `#${row.id}`}</td>
                        <td className="p-3 text-muted-foreground text-xs">{row.incident_date ? new Date(row.incident_date).toLocaleDateString("he-IL") : "-"}</td>
                        <td className="p-3"><div className="font-medium text-foreground max-w-[200px] truncate">{row.title}</div></td>
                        <td className="p-3 text-muted-foreground text-xs">{getTypeLabel(row.incident_type)}</td>
                        <td className="p-3"><Badge className={`${sv.color} border-0 text-xs`}>{sv.label}</Badge></td>
                        <td className="p-3 text-muted-foreground text-xs">{row.location}</td>
                        <td className="p-3 text-muted-foreground text-xs">{row.department}</td>
                        <td className="p-3 text-muted-foreground text-xs">{row.reported_by}</td>
                        <td className="p-3"><Badge className={`${st.color} border-0 text-xs`}>{st.label}</Badge></td>
                        <td className="p-3 text-center">
                          <div className="relative inline-block">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setMenuOpen(menuOpen === row.id ? null : row.id)}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                            {menuOpen === row.id && (
                              <div className="absolute left-0 top-8 z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[160px]" onMouseLeave={() => setMenuOpen(null)}>
                                <button onClick={() => openDetail(row)} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2"><Eye className="h-4 w-4" />צפייה מלאה</button>
                                <button onClick={() => openEdit(row.id)} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2"><Edit2 className="h-4 w-4" />עריכה</button>
                                <hr className="border-border my-1" />
                                <button onClick={() => { setDeleteConfirm(row); setMenuOpen(null); }} className="w-full px-3 py-2 text-right text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"><Trash2 className="h-4 w-4" />מחיקה</button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between p-3 border-t border-border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>מציג {Math.min((page - 1) * perPage + 1, total)}-{Math.min(page * perPage, total)} מתוך {total}</span>
              <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }} className="bg-input border border-border rounded px-2 py-1 text-xs text-foreground">
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} שורות</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-8 w-8 p-0"><ChevronRight className="h-4 w-4" /></Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => { const p = page <= 3 ? i + 1 : page + i - 2; if (p > totalPages || p < 1) return null; return <Button key={p} variant={p === page ? "default" : "ghost"} size="sm" onClick={() => setPage(p)} className={`h-8 w-8 p-0 ${p === page ? "bg-blue-600" : ""}`}>{p}</Button>; })}
              <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="h-8 w-8 p-0"><ChevronLeft className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => { setShowCreate(false); setEditId(null); setStep(1); }}>
          <div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h2 className="text-lg font-bold text-foreground">{editId ? "עריכת אירוע" : "דיווח אירוע חדש"}</h2>
                <div className="flex items-center gap-2 mt-2">
                  {STEP_TITLES.map((t, i) => (
                    <button key={i} onClick={() => setStep(i + 1)} className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${step === i + 1 ? "bg-blue-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step > i ? "bg-blue-500" : "bg-muted"}`}>{i + 1}</span>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setShowCreate(false); setEditId(null); setStep(1); }}><X className="h-4 w-4" /></Button>
            </div>

            <div className="p-4 space-y-4">
              {step === 1 && (
                <>
                  <h3 className="text-sm font-semibold text-blue-400 border-b border-border pb-2">פרטי האירוע</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <F label="כותרת *" span={3}><TI value={form.title || ""} onChange={(e: any) => setForm({ ...form, title: e.target.value })} placeholder="תיאור קצר של האירוע" /></F>
                    <F label="סוג אירוע *"><SI value={form.incidentType || ""} onChange={(e: any) => setForm({ ...form, incidentType: e.target.value })}>
                      <option value="">בחר...</option>{INCIDENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </SI></F>
                    <F label="חומרה *"><SI value={form.severity || ""} onChange={(e: any) => setForm({ ...form, severity: e.target.value })}>
                      <option value="">בחר...</option>{SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </SI></F>
                    <F label="סטטוס"><SI value={form.status || "reported"} onChange={(e: any) => setForm({ ...form, status: e.target.value })}>
                      {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </SI></F>
                    <F label="תאריך *"><TI type="date" value={form.incidentDate || ""} onChange={(e: any) => setForm({ ...form, incidentDate: e.target.value })} /></F>
                    <F label="שעה"><TI type="time" value={form.incidentTime || ""} onChange={(e: any) => setForm({ ...form, incidentTime: e.target.value })} /></F>
                    <F label="מיקום"><SI value={form.location || ""} onChange={(e: any) => setForm({ ...form, location: e.target.value })}>
                      <option value="">בחר...</option>{LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                    </SI></F>
                    <F label="מחלקה"><SI value={form.department || ""} onChange={(e: any) => setForm({ ...form, department: e.target.value })}>
                      <option value="">בחר...</option>{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </SI></F>
                    <F label="מדווח ע״י"><TI value={form.reportedBy || ""} onChange={(e: any) => setForm({ ...form, reportedBy: e.target.value })} placeholder="שם המדווח" /></F>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <h3 className="text-sm font-semibold text-blue-400 border-b border-border pb-2">אנשים מעורבים</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <F label="שם הנפגע/עובד"><TI value={form.employeeName || ""} onChange={(e: any) => setForm({ ...form, employeeName: e.target.value })} placeholder="שם מלא" /></F>
                    <F label="אנשים מעורבים"><TI value={form.involvedPersons || ""} onChange={(e: any) => setForm({ ...form, involvedPersons: e.target.value })} placeholder="שמות אנשים מעורבים" /></F>
                    <F label="עדים" span={2}><TI value={form.witnesses || ""} onChange={(e: any) => setForm({ ...form, witnesses: e.target.value })} placeholder="שמות העדים לאירוע" /></F>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <h3 className="text-sm font-semibold text-blue-400 border-b border-border pb-2">פרטי פגיעה</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <F label="סוג פגיעה"><SI value={form.injuryType || "none"} onChange={(e: any) => setForm({ ...form, injuryType: e.target.value })}>
                      {INJURY_TYPES.map(t => <option key={t} value={t}>{INJURY_TYPE_LABELS[t]}</option>)}
                    </SI></F>
                    <F label="אזור גוף"><TI value={form.bodyPart || ""} onChange={(e: any) => setForm({ ...form, bodyPart: e.target.value })} placeholder="יד ימין, ראש, ..." /></F>
                    <F label="ימי היעדרות"><TI type="number" value={form.lostWorkDays || ""} onChange={(e: any) => setForm({ ...form, lostWorkDays: e.target.value })} placeholder="0" /></F>
                    <F label="תיאור הפגיעה" span={3}><TA rows={2} value={form.injuryDescription || ""} onChange={(e: any) => setForm({ ...form, injuryDescription: e.target.value })} placeholder="תיאור מפורט של הפגיעה" /></F>
                    <F label="טיפול שניתן" span={2}><TI value={form.treatmentGiven || ""} onChange={(e: any) => setForm({ ...form, treatmentGiven: e.target.value })} placeholder="עזרה ראשונה, אשפוז, ..." /></F>
                    <F label="אשפוז"><div className="flex items-center gap-2 mt-2"><input type="checkbox" checked={!!form.hospitalized} onChange={e => setForm({ ...form, hospitalized: e.target.checked })} className="rounded" /><span className="text-sm text-foreground">כן, נדרש אשפוז</span></div></F>
                    <F label="עלות משוערת (₪)"><TI type="number" value={form.estimatedCost || ""} onChange={(e: any) => setForm({ ...form, estimatedCost: e.target.value })} placeholder="0" /></F>
                  </div>
                </>
              )}

              {step === 4 && (
                <>
                  <h3 className="text-sm font-semibold text-blue-400 border-b border-border pb-2">תיאור מפורט</h3>
                  <div className="space-y-3">
                    <F label="תיאור האירוע"><TA rows={4} value={form.description || ""} onChange={(e: any) => setForm({ ...form, description: e.target.value })} placeholder="תיאור מפורט של האירוע, רצף האירועים, תנאי הסביבה..." /></F>
                    <F label="סיבת שורש ראשונית"><TA rows={2} value={form.rootCause || ""} onChange={(e: any) => setForm({ ...form, rootCause: e.target.value })} placeholder="מה לדעתך הסיבה הבסיסית לאירוע?" /></F>
                    <F label="הערות נוספות"><TA rows={2} value={form.notes || ""} onChange={(e: any) => setForm({ ...form, notes: e.target.value })} placeholder="הערות, מידע נוסף..." /></F>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-between p-4 border-t border-border">
              <div>
                {step > 1 && <Button variant="outline" onClick={() => setStep(s => s - 1)} className="border-border">הקודם</Button>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setShowCreate(false); setEditId(null); setStep(1); }} className="border-border">ביטול</Button>
                {step < 4 ? (
                  <Button onClick={() => setStep(s => s + 1)} className="bg-blue-600 hover:bg-blue-700">הבא</Button>
                ) : (
                  <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 gap-1">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {editId ? "עדכן" : "שמור"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-card border border-red-500/30 rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-foreground mb-2">מחיקת אירוע</h3>
            <p className="text-muted-foreground text-sm mb-4">האם למחוק את האירוע "{deleteConfirm.title}"? פעולה זו בלתי הפיכה.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="border-border">ביטול</Button>
              <Button onClick={() => handleDelete(deleteConfirm.id)} className="bg-red-600 hover:bg-red-700">מחק</Button>
            </div>
          </div>
        </div>
      )}

      {showDetail && <IncidentDetailModal data={showDetail} onClose={() => setShowDetail(null)} onRefresh={load} />}
    </div>
  );
}

function IncidentDetailModal({ data, onClose, onRefresh }: { data: any; onClose: () => void; onRefresh: () => void }) {
  const { incident, investigations, correctiveActions, witnesses, lessons, timeline } = data;
  const [activeTab, setActiveTab] = useState("summary");
  const [showInvForm, setShowInvForm] = useState(false);
  const [showCaForm, setShowCaForm] = useState(false);
  const [showWitnessForm, setShowWitnessForm] = useState(false);
  const [showLessonForm, setShowLessonForm] = useState(false);
  const [invForm, setInvForm] = useState<any>({ investigationMethod: "five_whys" });
  const [caForm, setCaForm] = useState<any>({ priority: "medium", actionType: "corrective", status: "open" });
  const [witnessForm, setWitnessForm] = useState<any>({ wasPresent: true });
  const [lessonForm, setLessonForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  const st = getStatusInfo(incident.status);
  const sv = getSeverityInfo(incident.severity);
  const id = incident.id;

  const TABS = [
    { key: "summary", label: "סיכום" },
    { key: "investigation", label: `חקירה (${investigations?.length || 0})` },
    { key: "corrective", label: `פעולות מתקנות (${correctiveActions?.length || 0})` },
    { key: "witnesses", label: `עדויות (${witnesses?.length || 0})` },
    { key: "lessons", label: `לקחים (${lessons?.length || 0})` },
    { key: "timeline", label: "ציר זמן" },
  ];

  const VALID_NEXT: Record<string, { value: string; label: string }[]> = {
    reported: [{ value: "under_investigation", label: "פתח חקירה" }],
    under_investigation: [{ value: "corrective_action", label: "עבור לטיפול" }, { value: "closed", label: "סגור" }],
    corrective_action: [{ value: "monitoring", label: "מעקב" }, { value: "closed", label: "סגור" }],
    monitoring: [{ value: "closed", label: "סגור" }],
    closed: [{ value: "reopened", label: "פתח מחדש" }],
    reopened: [{ value: "under_investigation", label: "פתח חקירה" }],
  };

  const handleTransition = async (newStatus: string) => {
    setTransitioning(true); setError(null);
    try {
      const res = await authFetch(`/api/hse/incidents/${id}/transition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStatus }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "שגיאה");
      }
      onRefresh();
      onClose();
    } catch (e: any) { setError(e.message); }
    setTransitioning(false);
  };

  const saveItem = async (url: string, body: any) => {
    setSaving(true); setError(null);
    try {
      const res = await authFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "שגיאה בשמירה"); }
      setShowInvForm(false); setShowCaForm(false); setShowWitnessForm(false); setShowLessonForm(false);
      const fullRes = await authFetch(`/api/hse/incidents/${id}/full`);
      if (fullRes.ok) {
        const fresh = await fullRes.json();
        Object.assign(data, fresh);
        onRefresh();
      }
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const TI = (p: any) => <Input {...p} className={`bg-input border-border text-foreground ${p.className || ""}`} />;
  const SI = (p: any) => <select {...p} className={`w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground ${p.className || ""}`}>{p.children}</select>;
  const TA = (p: any) => <textarea {...p} className={`w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground resize-none ${p.className || ""}`} />;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-blue-400 text-sm">{incident.incident_number || `#${incident.id}`}</span>
                <Badge className={`${sv.color} border-0 text-xs`}>{sv.label}</Badge>
                <Badge className={`${st.color} border-0 text-xs`}>{st.label}</Badge>
              </div>
              <h2 className="text-lg font-bold text-foreground mt-1">{incident.title}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(VALID_NEXT[incident.status] || []).map(t => (
              <Button key={t.value} size="sm" onClick={() => handleTransition(t.value)} disabled={transitioning} className="bg-blue-600 hover:bg-blue-700 text-xs gap-1">
                <ArrowUpRight className="h-3 w-3" />{t.label}
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 mx-4 mt-2 rounded-lg p-2 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
            <button onClick={() => setError(null)} className="mr-auto"><X className="h-3 w-3" /></button>
          </div>
        )}

        <div className="flex border-b border-border px-4 overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.key ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          {activeTab === "summary" && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                ["תאריך", incident.incident_date ? new Date(incident.incident_date).toLocaleDateString("he-IL") : "-"],
                ["שעה", incident.incident_time || "-"],
                ["סוג אירוע", getTypeLabel(incident.incident_type)],
                ["מיקום", incident.location || "-"],
                ["מחלקה", incident.department || "-"],
                ["מדווח ע״י", incident.reported_by || "-"],
                ["נפגע", incident.employee_name || "-"],
                ["אנשים מעורבים", incident.involved_persons || "-"],
                ["סוג פגיעה", INJURY_TYPE_LABELS[incident.injury_type] || incident.injury_type || "-"],
                ["אזור גוף", incident.body_part || "-"],
                ["ימי היעדרות", incident.lost_work_days || 0],
                ["אשפוז", incident.hospitalized ? "כן" : "לא"],
                ["עלות משוערת", incident.estimated_cost ? `₪${Number(incident.estimated_cost).toLocaleString("he-IL")}` : "-"],
                ["חוקר", incident.investigation_by || "טרם מונה"],
                ["תאריך חקירה", incident.investigation_date ? new Date(incident.investigation_date).toLocaleDateString("he-IL") : "-"],
              ].map(([label, val]) => (
                <div key={label as string} className="bg-input rounded-lg p-3">
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                  <p className="text-foreground mt-1 text-sm font-medium">{val as string}</p>
                </div>
              ))}
              {incident.description && (
                <div className="col-span-3 bg-input rounded-lg p-3">
                  <p className="text-[11px] text-muted-foreground">תיאור האירוע</p>
                  <p className="text-foreground mt-1 text-sm">{incident.description}</p>
                </div>
              )}
              {incident.root_cause && (
                <div className="col-span-3 bg-input rounded-lg p-3">
                  <p className="text-[11px] text-muted-foreground">סיבת שורש</p>
                  <p className="text-foreground mt-1 text-sm">{incident.root_cause}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "investigation" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-foreground">חקירת האירוע</h3>
                <Button size="sm" onClick={() => setShowInvForm(!showInvForm)} className="bg-blue-600 hover:bg-blue-700 gap-1"><Plus className="h-3 w-3" />חקירה חדשה</Button>
              </div>

              {showInvForm && (
                <Card className="bg-input border-border">
                  <CardContent className="p-4 space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div><Label className="text-xs text-muted-foreground">שיטת חקירה</Label><div className="mt-1"><SI value={invForm.investigationMethod} onChange={(e: any) => setInvForm({ ...invForm, investigationMethod: e.target.value })}>
                        <option value="five_whys">5 למה (5 Whys)</option>
                        <option value="fishbone">דיאגרמת עצם דג (Fishbone)</option>
                        <option value="combined">משולב</option>
                      </SI></div></div>
                      <div><Label className="text-xs text-muted-foreground">חוקר</Label><div className="mt-1"><TI value={invForm.investigator || ""} onChange={(e: any) => setInvForm({ ...invForm, investigator: e.target.value })} placeholder="שם החוקר" /></div></div>
                      <div><Label className="text-xs text-muted-foreground">תאריך חקירה</Label><div className="mt-1"><TI type="date" value={invForm.investigationDate || new Date().toISOString().slice(0, 10)} onChange={(e: any) => setInvForm({ ...invForm, investigationDate: e.target.value })} /></div></div>
                    </div>

                    {(invForm.investigationMethod === "five_whys" || invForm.investigationMethod === "combined") && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-amber-400">שיטת 5 למה</h4>
                        {[1, 2, 3, 4, 5].map(n => (
                          <div key={n}><Label className="text-xs text-muted-foreground">למה {n}?</Label><div className="mt-1"><TI value={invForm[`why${n}`] || ""} onChange={(e: any) => setInvForm({ ...invForm, [`why${n}`]: e.target.value })} placeholder={`תשובה ל"למה" מספר ${n}`} /></div></div>
                        ))}
                      </div>
                    )}

                    {(invForm.investigationMethod === "fishbone" || invForm.investigationMethod === "combined") && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-amber-400">דיאגרמת עצם דג (Ishikawa)</h4>
                        <div className="grid grid-cols-2 gap-2">
                          {[["fishbonePeople", "אנשים"], ["fishboneProcess", "תהליך"], ["fishboneEquipment", "ציוד"], ["fishboneEnvironment", "סביבה"], ["fishboneMaterials", "חומרים"], ["fishboneManagement", "ניהול"]].map(([key, label]) => (
                            <div key={key}><Label className="text-xs text-muted-foreground">{label}</Label><div className="mt-1"><TI value={invForm[key] || ""} onChange={(e: any) => setInvForm({ ...invForm, [key]: e.target.value })} placeholder={`גורמי ${label}`} /></div></div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div><Label className="text-xs text-muted-foreground">קטגוריית סיבת שורש</Label><div className="mt-1"><SI value={invForm.rootCauseCategory || ""} onChange={(e: any) => setInvForm({ ...invForm, rootCauseCategory: e.target.value })}>
                      <option value="">בחר...</option>
                      <option value="human_error">שגיאה אנושית</option>
                      <option value="equipment_failure">כשל ציוד</option>
                      <option value="process_deficiency">ליקוי תהליך</option>
                      <option value="training_gap">חסר הדרכה</option>
                      <option value="environmental">סביבתי</option>
                      <option value="management">ניהול</option>
                    </SI></div></div>

                    <div><Label className="text-xs text-muted-foreground">סיבת שורש - תיאור</Label><div className="mt-1"><TA rows={2} value={invForm.rootCauseDescription || ""} onChange={(e: any) => setInvForm({ ...invForm, rootCauseDescription: e.target.value })} placeholder="תיאור מפורט של סיבת השורש" /></div></div>
                    <div><Label className="text-xs text-muted-foreground">ממצאים</Label><div className="mt-1"><TA rows={2} value={invForm.findings || ""} onChange={(e: any) => setInvForm({ ...invForm, findings: e.target.value })} placeholder="ממצאי החקירה" /></div></div>
                    <div><Label className="text-xs text-muted-foreground">המלצות</Label><div className="mt-1"><TA rows={2} value={invForm.recommendations || ""} onChange={(e: any) => setInvForm({ ...invForm, recommendations: e.target.value })} placeholder="המלצות למניעה" /></div></div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowInvForm(false)} className="border-border">ביטול</Button>
                      <Button size="sm" onClick={() => saveItem(`/api/hse/incidents/${id}/investigations`, invForm)} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                        {saving ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : null}שמור חקירה
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {(investigations || []).map((inv: any) => (
                <Card key={inv.id} className="bg-input border-border">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="text-xs text-blue-400">{inv.investigation_method === "five_whys" ? "5 למה" : inv.investigation_method === "fishbone" ? "עצם דג" : "משולב"}</span>
                        {inv.investigator && <span className="text-xs text-muted-foreground mr-3">חוקר: {inv.investigator}</span>}
                        {inv.investigation_date && <span className="text-xs text-muted-foreground mr-3">{new Date(inv.investigation_date).toLocaleDateString("he-IL")}</span>}
                      </div>
                      <Badge className={`text-xs border-0 ${inv.status === "completed" ? "bg-green-500/20 text-green-300" : "bg-yellow-500/20 text-yellow-300"}`}>{inv.status === "completed" ? "הושלמה" : "בביצוע"}</Badge>
                    </div>
                    {[1, 2, 3, 4, 5].some(n => inv[`why_${n}`]) && (
                      <div className="space-y-1 mb-3">
                        <p className="text-xs font-semibold text-amber-400 mb-1">5 למה:</p>
                        {[1, 2, 3, 4, 5].map(n => inv[`why_${n}`] ? <p key={n} className="text-xs text-foreground"><span className="text-muted-foreground">למה {n}:</span> {inv[`why_${n}`]}</p> : null)}
                      </div>
                    )}
                    {inv.root_cause_description && <div className="mb-2"><p className="text-xs text-muted-foreground">סיבת שורש:</p><p className="text-sm text-foreground">{inv.root_cause_description}</p></div>}
                    {inv.findings && <div className="mb-2"><p className="text-xs text-muted-foreground">ממצאים:</p><p className="text-sm text-foreground">{inv.findings}</p></div>}
                    {inv.recommendations && <div><p className="text-xs text-muted-foreground">המלצות:</p><p className="text-sm text-foreground">{inv.recommendations}</p></div>}
                  </CardContent>
                </Card>
              ))}
              {(investigations || []).length === 0 && !showInvForm && (
                <div className="text-center py-8 text-muted-foreground"><ClipboardList className="h-12 w-12 mx-auto mb-2 opacity-30" /><p>טרם נפתחה חקירה לאירוע זה</p></div>
              )}
            </div>
          )}

          {activeTab === "corrective" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-foreground">פעולות מתקנות</h3>
                <Button size="sm" onClick={() => setShowCaForm(!showCaForm)} className="bg-blue-600 hover:bg-blue-700 gap-1"><Plus className="h-3 w-3" />פעולה חדשה</Button>
              </div>

              {showCaForm && (
                <Card className="bg-input border-border">
                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2"><Label className="text-xs text-muted-foreground">כותרת *</Label><div className="mt-1"><TI value={caForm.title || ""} onChange={(e: any) => setCaForm({ ...caForm, title: e.target.value })} placeholder="כותרת הפעולה" /></div></div>
                      <div><Label className="text-xs text-muted-foreground">סוג</Label><div className="mt-1"><SI value={caForm.actionType || "corrective"} onChange={(e: any) => setCaForm({ ...caForm, actionType: e.target.value })}>
                        <option value="corrective">מתקנת</option><option value="preventive">מונעת</option><option value="immediate">מיידית</option>
                      </SI></div></div>
                      <div><Label className="text-xs text-muted-foreground">עדיפות</Label><div className="mt-1"><SI value={caForm.priority || "medium"} onChange={(e: any) => setCaForm({ ...caForm, priority: e.target.value })}>
                        <option value="low">נמוכה</option><option value="medium">בינונית</option><option value="high">גבוהה</option><option value="critical">קריטית</option>
                      </SI></div></div>
                      <div><Label className="text-xs text-muted-foreground">אחראי</Label><div className="mt-1"><TI value={caForm.assignedTo || ""} onChange={(e: any) => setCaForm({ ...caForm, assignedTo: e.target.value })} placeholder="שם האחראי" /></div></div>
                      <div><Label className="text-xs text-muted-foreground">תאריך יעד</Label><div className="mt-1"><TI type="date" value={caForm.dueDate || ""} onChange={(e: any) => setCaForm({ ...caForm, dueDate: e.target.value })} /></div></div>
                      <div className="col-span-2"><Label className="text-xs text-muted-foreground">תיאור</Label><div className="mt-1"><TA rows={2} value={caForm.description || ""} onChange={(e: any) => setCaForm({ ...caForm, description: e.target.value })} placeholder="תיאור מפורט של הפעולה" /></div></div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowCaForm(false)} className="border-border">ביטול</Button>
                      <Button size="sm" onClick={() => saveItem(`/api/hse/incidents/${id}/corrective-actions`, caForm)} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                        {saving ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : null}שמור
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {(correctiveActions || []).map((ca: any) => {
                const isOverdue = ca.due_date && new Date(ca.due_date) < new Date() && ca.status !== "completed";
                return (
                  <Card key={ca.id} className={`bg-input border-border ${isOverdue ? "border-red-500/30" : ""}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-blue-400 text-xs">{ca.action_number}</span>
                            <Badge className={`text-xs border-0 ${ca.priority === "critical" ? "bg-red-500/20 text-red-300" : ca.priority === "high" ? "bg-orange-500/20 text-orange-300" : "bg-blue-500/20 text-blue-300"}`}>{ca.priority === "critical" ? "קריטי" : ca.priority === "high" ? "גבוה" : ca.priority === "medium" ? "בינוני" : "נמוך"}</Badge>
                            <Badge className={`text-xs border-0 ${ca.status === "completed" ? "bg-green-500/20 text-green-300" : ca.status === "verified" ? "bg-purple-500/20 text-purple-300" : isOverdue ? "bg-red-500/20 text-red-300" : "bg-yellow-500/20 text-yellow-300"}`}>{ca.status === "completed" ? "הושלמה" : ca.status === "verified" ? "אומתה" : isOverdue ? "באיחור" : "פתוחה"}</Badge>
                            {isOverdue && <AlertTriangle className="h-3 w-3 text-red-400" />}
                          </div>
                          <p className="text-foreground text-sm font-medium">{ca.title}</p>
                          {ca.description && <p className="text-muted-foreground text-xs mt-1">{ca.description}</p>}
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            {ca.assigned_to && <span>אחראי: {ca.assigned_to}</span>}
                            {ca.due_date && <span className={isOverdue ? "text-red-400" : ""}>יעד: {new Date(ca.due_date).toLocaleDateString("he-IL")}</span>}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {(correctiveActions || []).length === 0 && !showCaForm && (
                <div className="text-center py-8 text-muted-foreground"><CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-30" /><p>אין פעולות מתקנות לאירוע זה</p></div>
              )}
            </div>
          )}

          {activeTab === "witnesses" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-foreground">עדויות</h3>
                <Button size="sm" onClick={() => setShowWitnessForm(!showWitnessForm)} className="bg-blue-600 hover:bg-blue-700 gap-1"><Plus className="h-3 w-3" />הוסף עדות</Button>
              </div>

              {showWitnessForm && (
                <Card className="bg-input border-border">
                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label className="text-xs text-muted-foreground">שם העד *</Label><div className="mt-1"><TI value={witnessForm.witnessName || ""} onChange={(e: any) => setWitnessForm({ ...witnessForm, witnessName: e.target.value })} placeholder="שם מלא" /></div></div>
                      <div><Label className="text-xs text-muted-foreground">תפקיד</Label><div className="mt-1"><TI value={witnessForm.witnessRole || ""} onChange={(e: any) => setWitnessForm({ ...witnessForm, witnessRole: e.target.value })} placeholder="תפקיד בארגון" /></div></div>
                      <div><Label className="text-xs text-muted-foreground">מחלקה</Label><div className="mt-1"><TI value={witnessForm.witnessDepartment || ""} onChange={(e: any) => setWitnessForm({ ...witnessForm, witnessDepartment: e.target.value })} placeholder="מחלקה" /></div></div>
                      <div><Label className="text-xs text-muted-foreground">תאריך עדות</Label><div className="mt-1"><TI type="date" value={witnessForm.statementDate || new Date().toISOString().slice(0, 10)} onChange={(e: any) => setWitnessForm({ ...witnessForm, statementDate: e.target.value })} /></div></div>
                      <div className="col-span-2"><Label className="text-xs text-muted-foreground">תוכן העדות</Label><div className="mt-1"><TA rows={3} value={witnessForm.statementText || ""} onChange={(e: any) => setWitnessForm({ ...witnessForm, statementText: e.target.value })} placeholder="תיאור מה שהעד ראה/שמע..." /></div></div>
                      <div className="flex items-center gap-2"><input type="checkbox" checked={!!witnessForm.wasPresent} onChange={e => setWitnessForm({ ...witnessForm, wasPresent: e.target.checked })} className="rounded" /><Label className="text-xs text-foreground">העד היה נוכח בזמן האירוע</Label></div>
                      <div className="flex items-center gap-2"><input type="checkbox" checked={!!witnessForm.signatureObtained} onChange={e => setWitnessForm({ ...witnessForm, signatureObtained: e.target.checked })} className="rounded" /><Label className="text-xs text-foreground">חתימה התקבלה</Label></div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowWitnessForm(false)} className="border-border">ביטול</Button>
                      <Button size="sm" onClick={() => saveItem(`/api/hse/incidents/${id}/witnesses`, witnessForm)} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                        {saving ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : null}שמור
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {(witnesses || []).map((w: any) => (
                <Card key={w.id} className="bg-input border-border">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground text-sm">{w.witness_name}</span>
                          {w.witness_role && <span className="text-xs text-muted-foreground">{w.witness_role}</span>}
                          {w.signature_obtained && <Badge className="text-xs border-0 bg-green-500/20 text-green-300">חתום</Badge>}
                          {!w.was_present && <Badge className="text-xs border-0 bg-gray-500/20 text-gray-300">לא נוכח</Badge>}
                        </div>
                        {w.statement_text && <p className="text-sm text-gray-300 mt-2 leading-relaxed">{w.statement_text}</p>}
                        {w.statement_date && <p className="text-xs text-muted-foreground mt-1">{new Date(w.statement_date).toLocaleDateString("he-IL")}</p>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {(witnesses || []).length === 0 && !showWitnessForm && (
                <div className="text-center py-8 text-muted-foreground"><Users className="h-12 w-12 mx-auto mb-2 opacity-30" /><p>לא נרשמו עדויות</p></div>
              )}
            </div>
          )}

          {activeTab === "lessons" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-foreground">לקחים שנלמדו</h3>
                <Button size="sm" onClick={() => setShowLessonForm(!showLessonForm)} className="bg-blue-600 hover:bg-blue-700 gap-1"><Plus className="h-3 w-3" />הוסף לקח</Button>
              </div>

              {showLessonForm && (
                <Card className="bg-input border-border">
                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2"><Label className="text-xs text-muted-foreground">כותרת *</Label><div className="mt-1"><TI value={lessonForm.title || ""} onChange={(e: any) => setLessonForm({ ...lessonForm, title: e.target.value })} placeholder="כותרת הלקח" /></div></div>
                      <div><Label className="text-xs text-muted-foreground">קטגוריה</Label><div className="mt-1"><SI value={lessonForm.category || ""} onChange={(e: any) => setLessonForm({ ...lessonForm, category: e.target.value })}>
                        <option value="">בחר...</option>
                        <option value="procedure">נהלים</option><option value="training">הדרכה</option><option value="equipment">ציוד</option>
                        <option value="environment">סביבה</option><option value="communication">תקשורת</option>
                      </SI></div></div>
                      <div><Label className="text-xs text-muted-foreground">מחלקות רלוונטיות</Label><div className="mt-1"><TI value={lessonForm.applicableDepartments || ""} onChange={(e: any) => setLessonForm({ ...lessonForm, applicableDepartments: e.target.value })} placeholder="ייצור, לוגיסטיקה..." /></div></div>
                      <div className="col-span-2"><Label className="text-xs text-muted-foreground">תיאור</Label><div className="mt-1"><TA rows={3} value={lessonForm.description || ""} onChange={(e: any) => setLessonForm({ ...lessonForm, description: e.target.value })} placeholder="תיאור הלקח ומה ניתן ללמוד..." /></div></div>
                      <div className="flex items-center gap-2 col-span-2"><input type="checkbox" checked={!!lessonForm.isShared} onChange={e => setLessonForm({ ...lessonForm, isShared: e.target.checked })} className="rounded" /><Label className="text-xs text-foreground">שתף עם כלל הארגון</Label></div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowLessonForm(false)} className="border-border">ביטול</Button>
                      <Button size="sm" onClick={() => saveItem(`/api/hse/incidents/${id}/lessons`, lessonForm)} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                        {saving ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : null}שמור
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {(lessons || []).map((lesson: any) => (
                <Card key={lesson.id} className="bg-input border-border">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-foreground text-sm">{lesson.title}</span>
                          {lesson.is_shared && <Badge className="text-xs border-0 bg-blue-500/20 text-blue-300">שותף</Badge>}
                          {lesson.category && <Badge className="text-xs border-0 bg-gray-500/20 text-gray-300">{lesson.category}</Badge>}
                        </div>
                        {lesson.description && <p className="text-sm text-gray-300 leading-relaxed">{lesson.description}</p>}
                        {lesson.applicable_departments && <p className="text-xs text-muted-foreground mt-1">מחלקות: {lesson.applicable_departments}</p>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {(lessons || []).length === 0 && !showLessonForm && (
                <div className="text-center py-8 text-muted-foreground"><FileText className="h-12 w-12 mx-auto mb-2 opacity-30" /><p>טרם תועדו לקחים</p></div>
              )}
            </div>
          )}

          {activeTab === "timeline" && (
            <div className="space-y-2">
              {(timeline || []).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground"><Clock className="h-12 w-12 mx-auto mb-2 opacity-30" /><p>אין פעולות בהיסטוריה</p></div>
              ) : (
                (timeline || []).map((entry: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-background/50">
                    <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground text-sm font-medium">{entry.action}</span>
                        {entry.field_changed && <span className="text-xs text-muted-foreground">({entry.field_changed}: {entry.old_value} → {entry.new_value})</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>{entry.performed_by}</span>
                        <span>•</span>
                        <span>{new Date(entry.performed_at).toLocaleString("he-IL")}</span>
                      </div>
                      {entry.notes && <p className="text-xs text-muted-foreground mt-1">{entry.notes}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
