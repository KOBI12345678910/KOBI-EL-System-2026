import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { authFetch } from "@/lib/utils";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";
import {
  ShieldAlert, Plus, Search, X, Save, Eye, Edit2, Trash2,
  ChevronRight, ChevronLeft, Loader2, AlertTriangle, CheckCircle2,
  MoreHorizontal, Filter, Download, BarChart3, Grid3x3
} from "lucide-react";

const API = "/api";

const RISK_COLORS: Record<string, string> = {
  "negligible": "bg-green-500/20 text-green-300 border-green-500/30",
  "low": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "medium": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "high": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "critical": "bg-red-500/20 text-red-300 border-red-500/30",
};

const RISK_LABELS: Record<string, string> = {
  "negligible": "זניח",
  "low": "נמוך",
  "medium": "בינוני",
  "high": "גבוה",
  "critical": "קריטי",
};

const STATUS_COLORS: Record<string, string> = {
  "active": "bg-green-500/20 text-green-300",
  "review": "bg-yellow-500/20 text-yellow-300",
  "closed": "bg-gray-500/20 text-gray-300",
  "draft": "bg-blue-500/20 text-blue-300",
};

const STATUS_LABELS: Record<string, string> = {
  "active": "פעיל",
  "review": "בסקירה",
  "closed": "סגור",
  "draft": "טיוטה",
};

const HAZARD_TYPES = ["מכני", "חשמלי", "כימי", "ביולוגי", "ארגונומי", "אש", "גובה", "חשיפה", "אחר"];
const DEPARTMENTS = ["ייצור", "מחסן", "תחזוקה", "גמר", "לוגיסטיקה", "משרד", "חצר", "מעבדה"];

function getRiskLevel(score: number): string {
  if (score <= 3) return "negligible";
  if (score <= 6) return "low";
  if (score <= 12) return "medium";
  if (score <= 16) return "high";
  return "critical";
}

function RiskMatrix({ items }: { items: any[] }) {
  const matrix: Record<string, number> = {};
  items.forEach(item => {
    const key = `${item.probability}-${item.severity}`;
    matrix[key] = (matrix[key] || 0) + 1;
  });

  const getCellColor = (p: number, s: number) => {
    const score = p * s;
    if (score <= 3) return "bg-green-500/30 border-green-500/50";
    if (score <= 6) return "bg-blue-500/30 border-blue-500/50";
    if (score <= 12) return "bg-yellow-500/30 border-yellow-500/50";
    if (score <= 16) return "bg-orange-500/30 border-orange-500/50";
    return "bg-red-500/30 border-red-500/50";
  };

  return (
    <div dir="rtl" className="overflow-auto">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-4 w-4 text-blue-400" />
        <span className="text-sm font-medium text-foreground">מטריצת סיכונים — הסתברות × חומרה</span>
      </div>
      <div className="relative">
        <div className="text-xs text-muted-foreground text-center mb-1">חומרה →</div>
        <div className="flex gap-1">
          <div className="flex flex-col gap-1 ml-1">
            <div className="w-16 h-6" />
            {[5,4,3,2,1].map(p => (
              <div key={p} className="w-16 h-14 flex items-center justify-end pr-2 text-xs text-muted-foreground">{p}</div>
            ))}
          </div>
          <div>
            <div className="flex gap-1 mb-1">
              {[1,2,3,4,5].map(s => (
                <div key={s} className="w-14 text-center text-xs text-muted-foreground">{s}</div>
              ))}
            </div>
            {[5,4,3,2,1].map(p => (
              <div key={p} className="flex gap-1 mb-1">
                {[1,2,3,4,5].map(s => {
                  const count = matrix[`${p}-${s}`] || 0;
                  return (
                    <div key={s} className={`w-14 h-14 border rounded flex items-center justify-center text-sm font-bold ${getCellColor(p, s)}`}>
                      {count > 0 ? <span className="text-foreground">{count}</span> : <span className="text-foreground/20 text-xs">{p*s}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex flex-col justify-around ml-2 text-xs text-muted-foreground" style={{marginTop:'24px'}}>
            <span>הסתברות</span>
          </div>
        </div>
        <div className="flex gap-3 mt-4 flex-wrap">
          {Object.entries(RISK_LABELS).map(([k,v]) => (
            <div key={k} className="flex items-center gap-1">
              <div className={`w-3 h-3 rounded ${RISK_COLORS[k].split(' ')[0]}`} />
              <span className="text-xs text-muted-foreground">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface RiskItem {
  id: number;
  assessment_id: number;
  hazard_description: string;
  hazard_type: string;
  who_affected: string;
  existing_controls: string;
  probability: number;
  severity: number;
  risk_score: number;
  risk_level: string;
  additional_controls: string;
  residual_probability: number;
  residual_severity: number;
  residual_risk_score: number;
  residual_risk_level: string;
  responsible_person: string;
  target_date: string;
  status: string;
}

interface Assessment {
  id: number;
  assessment_number: string;
  title: string;
  area: string;
  process: string;
  department: string;
  assessor: string;
  assessment_date: string;
  review_date: string;
  status: string;
  overall_risk_level: string;
  notes: string;
}

export default function RiskAssessment() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [perPage] = useState(25);
  const [view, setView] = useState<"list" | "matrix">("list");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [viewDetail, setViewDetail] = useState<Assessment | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validation = useFormValidation({
    title: { required: true, message: "שם ההערכה חובה" },
    assessment_date: { required: true, message: "תאריך הערכה חובה" },
  });
  const [allRiskItems, setAllRiskItems] = useState<RiskItem[]>([]);
  const [detailItems, setDetailItems] = useState<RiskItem[]>([]);
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemForm, setItemForm] = useState<any>({ probability: 3, severity: 3, residual_probability: 2, residual_severity: 2 });
  const [editItemId, setEditItemId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/hse-risk-assessments?limit=200`);
      if (res.ok) {
        const j = await res.json();
        setAssessments(Array.isArray(j) ? j : j.data || []);
      }
      const itemsRes = await authFetch(`${API}/hse-risk-items?limit=1000`);
      if (itemsRes.ok) {
        const j = await itemsRes.json();
        setAllRiskItems(Array.isArray(j) ? j : j.data || []);
      }
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadDetailItems = useCallback(async (assessmentId: number) => {
    const items = allRiskItems.filter(i => i.assessment_id === assessmentId);
    setDetailItems(items);
  }, [allRiskItems]);

  useEffect(() => {
    if (viewDetail) loadDetailItems(viewDetail.id);
  }, [viewDetail, loadDetailItems]);

  const filtered = useMemo(() => {
    let d = [...assessments];
    if (search) d = d.filter(r => [r.title, r.area, r.department, r.assessor].some(f => f?.toLowerCase().includes(search.toLowerCase())));
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    if (riskFilter !== "all") d = d.filter(r => r.overall_risk_level === riskFilter);
    return d;
  }, [assessments, search, statusFilter, riskFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageData = filtered.slice((page - 1) * perPage, page * perPage);

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true);
    setError(null);
    try {
      const url = editId ? `${API}/hse-risk-assessments/${editId}` : `${API}/hse-risk-assessments`;
      const method = editId ? "PUT" : "POST";
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "שגיאה בשמירה"); }
      setShowForm(false); setEditId(null); setForm({});
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const del = async (id: number) => {
    await authFetch(`${API}/hse-risk-assessments/${id}`, { method: "DELETE" });
    await load();
  };

  const saveItem = async () => {
    setSaving(true);
    setError(null);
    try {
      const data = { ...itemForm, assessment_id: viewDetail?.id };
      const probInt = parseInt(data.probability) || 1;
      const sevInt = parseInt(data.severity) || 1;
      const resProbInt = parseInt(data.residual_probability) || 1;
      const resSevInt = parseInt(data.residual_severity) || 1;
      data.risk_level = getRiskLevel(probInt * sevInt);
      data.residual_risk_level = getRiskLevel(resProbInt * resSevInt);
      const url = editItemId ? `${API}/hse-risk-items/${editItemId}` : `${API}/hse-risk-items`;
      const method = editItemId ? "PUT" : "POST";
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("שגיאה בשמירה");
      setShowItemForm(false); setEditItemId(null); setItemForm({ probability: 3, severity: 3, residual_probability: 2, residual_severity: 2 });
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const delItem = async (id: number) => {
    await authFetch(`${API}/hse-risk-items/${id}`, { method: "DELETE" });
    await load();
  };

  const stats = useMemo(() => ({
    total: assessments.length,
    active: assessments.filter(a => a.status === "active").length,
    critical: assessments.filter(a => a.overall_risk_level === "critical").length,
    high: assessments.filter(a => a.overall_risk_level === "high").length,
    totalItems: allRiskItems.length,
    openItems: allRiskItems.filter(i => i.status === "open").length,
  }), [assessments, allRiskItems]);

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-orange-400" />
            הערכות סיכון
          </h1>
          <p className="text-sm text-muted-foreground mt-1">זיהוי סכנות, מטריצת סיכונים ובקרת אמצעי הגנה</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setView(v => v === "list" ? "matrix" : "list")} className="border-border text-gray-300 gap-1">
            {view === "list" ? <><Grid3x3 className="h-4 w-4" />מטריצה</> : <><Filter className="h-4 w-4" />רשימה</>}
          </Button>
          <Button onClick={() => { setForm({ status: "active", assessment_date: new Date().toISOString().slice(0,10) }); setEditId(null); setShowForm(true); }} className="bg-orange-600 hover:bg-orange-700 gap-2">
            <Plus className="h-4 w-4" />הערכה חדשה
          </Button>
        </div>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-lg text-sm">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { l: "הערכות", v: stats.total, c: "text-orange-400" },
          { l: "פעילות", v: stats.active, c: "text-green-400" },
          { l: "קריטי", v: stats.critical, c: "text-red-400" },
          { l: "גבוה", v: stats.high, c: "text-orange-400" },
          { l: "פריטי סיכון", v: stats.totalItems, c: "text-blue-400" },
          { l: "פתוחים", v: stats.openItems, c: "text-yellow-400" },
        ].map((k, i) => (
          <Card key={i} className="bg-card/80 border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k.l}</p>
              <p className={`text-xl font-bold font-mono mt-1 ${k.c}`}>{loading ? "—" : k.v}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {view === "matrix" ? (
        <Card className="bg-card/80 border-border">
          <CardContent className="p-6">
            <RiskMatrix items={allRiskItems} />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="bg-card/60 border-border">
            <CardContent className="p-3">
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="חיפוש..." className="pr-9 bg-input border-border text-foreground" />
                </div>
                <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  <option value="all">כל הסטטוסים</option>
                  {Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={riskFilter} onChange={e => { setRiskFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  <option value="all">כל רמות הסיכון</option>
                  {Object.entries(RISK_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-background/50">
                      <th className="p-3 text-right text-muted-foreground font-medium">מספר</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">כותרת</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">אזור</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">מחלקה</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">הערכה</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">סיכון כולל</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">פריטים</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">סטטוס</th>
                      <th className="p-3 text-center text-muted-foreground font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td colSpan={9} className="p-3">
                            <div className="flex gap-4 animate-pulse">
                              {Array.from({length:6}).map((_,j)=><div key={j} className="h-4 bg-muted rounded flex-1" />)}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : pageData.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-16 text-center">
                          <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                          <p className="text-muted-foreground">אין הערכות סיכון</p>
                          <Button onClick={() => { setForm({ status: "active", assessment_date: new Date().toISOString().slice(0,10) }); setEditId(null); setShowForm(true); }} className="mt-3 bg-orange-600 hover:bg-orange-700 gap-2">
                            <Plus className="h-4 w-4" />הערכה חדשה
                          </Button>
                        </td>
                      </tr>
                    ) : pageData.map(row => {
                      const items = allRiskItems.filter(i => i.assessment_id === row.id);
                      return (
                        <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="p-3 font-mono text-xs text-blue-400">{row.assessment_number || `RA-${row.id}`}</td>
                          <td className="p-3 text-foreground font-medium max-w-[200px] truncate">{row.title}</td>
                          <td className="p-3 text-muted-foreground">{row.area || "—"}</td>
                          <td className="p-3 text-muted-foreground">{row.department || "—"}</td>
                          <td className="p-3 text-muted-foreground text-xs">{row.assessment_date?.slice(0,10) || "—"}</td>
                          <td className="p-3">
                            <Badge className={RISK_COLORS[row.overall_risk_level] || RISK_COLORS.medium}>
                              {RISK_LABELS[row.overall_risk_level] || row.overall_risk_level}
                            </Badge>
                          </td>
                          <td className="p-3 text-center font-mono text-muted-foreground">{items.length}</td>
                          <td className="p-3">
                            <Badge className={STATUS_COLORS[row.status] || "bg-gray-500/20 text-gray-300"}>
                              {STATUS_LABELS[row.status] || row.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setViewDetail(row); }}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => {
                                setForm({ ...row });
                                setEditId(row.id);
                                setShowForm(true);
                              }}>
                                <Edit2 className="h-3.5 w-3.5 text-blue-400" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => del(row.id)}>
                                <Trash2 className="h-3.5 w-3.5 text-red-400" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between p-3 border-t border-border">
                <span className="text-sm text-muted-foreground">מציג {Math.min(filtered.length,(page-1)*perPage+1)}-{Math.min(filtered.length,page*perPage)} מתוך {filtered.length}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" disabled={page<=1} onClick={() => setPage(p=>p-1)} className="h-8 w-8 p-0"><ChevronRight className="h-4 w-4" /></Button>
                  <span className="px-2 py-1 text-sm text-muted-foreground">{page}/{totalPages}</span>
                  <Button variant="ghost" size="sm" disabled={page>=totalPages} onClick={() => setPage(p=>p+1)} className="h-8 w-8 p-0"><ChevronLeft className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => { setShowForm(false); setEditId(null); }}>
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">{editId ? "עריכת הערכת סיכון" : "הערכת סיכון חדשה"}</h2>
              <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditId(null); }}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">כותרת <RequiredMark /></Label>
                  <Input value={form.title || ""} onChange={e => setForm({...form, title: e.target.value})} placeholder="שם ההערכה" className={`bg-input border-border text-foreground mt-1 ${validation.getFieldProps("title").className}`} />
                  <FormFieldError error={validation.errors.title} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">אזור / מיקום</Label>
                  <Input value={form.area || ""} onChange={e => setForm({...form, area: e.target.value})} placeholder="אולם A, מחסן..." className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">תהליך / משימה</Label>
                  <Input value={form.process || ""} onChange={e => setForm({...form, process: e.target.value})} placeholder="ריתוך, הרמה..." className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">מחלקה</Label>
                  <select value={form.department || ""} onChange={e => setForm({...form, department: e.target.value})} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    <option value="">בחר...</option>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">מעריך</Label>
                  <Input value={form.assessor || ""} onChange={e => setForm({...form, assessor: e.target.value})} placeholder="שם המעריך" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">תאריך הערכה <RequiredMark /></Label>
                  <Input type="date" value={form.assessment_date || ""} onChange={e => setForm({...form, assessment_date: e.target.value})} className={`bg-input border-border text-foreground mt-1 ${validation.getFieldProps("assessment_date").className}`} />
                  <FormFieldError error={validation.errors.assessment_date} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">תאריך סקירה הבאה</Label>
                  <Input type="date" value={form.review_date || ""} onChange={e => setForm({...form, review_date: e.target.value})} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">רמת סיכון כוללת</Label>
                  <select value={form.overall_risk_level || "medium"} onChange={e => setForm({...form, overall_risk_level: e.target.value})} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    {Object.entries(RISK_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">סטטוס</Label>
                  <select value={form.status || "active"} onChange={e => setForm({...form, status: e.target.value})} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    {Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">הערות</Label>
                  <textarea value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" placeholder="הערות..." />
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" onClick={() => { setShowForm(false); setEditId(null); }} className="border-border">ביטול</Button>
              <Button onClick={save} disabled={saving} className="bg-orange-600 hover:bg-orange-700 gap-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editId ? "עדכן" : "שמור"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {viewDetail && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setViewDetail(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-foreground">{viewDetail.title}</h2>
                <Badge className={RISK_COLORS[viewDetail.overall_risk_level] || RISK_COLORS.medium}>
                  {RISK_LABELS[viewDetail.overall_risk_level] || viewDetail.overall_risk_level}
                </Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setViewDetail(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                {[
                  { l: "מספר", v: viewDetail.assessment_number || `RA-${viewDetail.id}` },
                  { l: "אזור", v: viewDetail.area },
                  { l: "מחלקה", v: viewDetail.department },
                  { l: "מעריך", v: viewDetail.assessor },
                  { l: "תאריך", v: viewDetail.assessment_date?.slice(0,10) },
                  { l: "סקירה הבאה", v: viewDetail.review_date?.slice(0,10) },
                ].map((f,i) => (
                  <div key={i} className="bg-input rounded-lg p-3">
                    <p className="text-[11px] text-muted-foreground">{f.l}</p>
                    <p className="text-foreground font-medium mt-1">{f.v || "—"}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-orange-400">פריטי סיכון ({detailItems.length})</h3>
                <Button size="sm" onClick={() => { setItemForm({ probability: 3, severity: 3, residual_probability: 2, residual_severity: 2 }); setEditItemId(null); setShowItemForm(true); }} className="bg-orange-600 hover:bg-orange-700 gap-1">
                  <Plus className="h-3 w-3" />הוסף סכנה
                </Button>
              </div>

              {detailItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">אין פריטי סיכון — לחץ "הוסף סכנה" להתחיל</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-background/50">
                        <th className="p-2 text-right text-muted-foreground">סכנה</th>
                        <th className="p-2 text-right text-muted-foreground">סוג</th>
                        <th className="p-2 text-center text-muted-foreground">הס׳</th>
                        <th className="p-2 text-center text-muted-foreground">חו׳</th>
                        <th className="p-2 text-center text-muted-foreground">ציון</th>
                        <th className="p-2 text-center text-muted-foreground">סיכון</th>
                        <th className="p-2 text-center text-muted-foreground">שיורי</th>
                        <th className="p-2 text-center text-muted-foreground">סטטוס</th>
                        <th className="p-2 text-center text-muted-foreground">פעולות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailItems.map(item => (
                        <tr key={item.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="p-2 text-foreground max-w-[200px] truncate">{item.hazard_description}</td>
                          <td className="p-2 text-muted-foreground">{item.hazard_type || "—"}</td>
                          <td className="p-2 text-center font-mono text-muted-foreground">{item.probability}</td>
                          <td className="p-2 text-center font-mono text-muted-foreground">{item.severity}</td>
                          <td className="p-2 text-center font-mono font-bold text-foreground">{item.risk_score}</td>
                          <td className="p-2 text-center">
                            <Badge className={`text-[10px] ${RISK_COLORS[item.risk_level] || RISK_COLORS.medium}`}>
                              {RISK_LABELS[item.risk_level] || item.risk_level}
                            </Badge>
                          </td>
                          <td className="p-2 text-center">
                            <Badge className={`text-[10px] ${RISK_COLORS[item.residual_risk_level] || RISK_COLORS.low}`}>
                              {RISK_LABELS[item.residual_risk_level] || item.residual_risk_level}
                            </Badge>
                          </td>
                          <td className="p-2 text-center">
                            <span className={item.status === "open" ? "text-yellow-400" : "text-green-400"}>{item.status === "open" ? "פתוח" : "סגור"}</span>
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex justify-center gap-1">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setItemForm({...item}); setEditItemId(item.id); setShowItemForm(true); }}>
                                <Edit2 className="h-3 w-3 text-blue-400" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => delItem(item.id)}>
                                <Trash2 className="h-3 w-3 text-red-400" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {view !== "matrix" && (
                <div className="mt-4 p-4 bg-input rounded-lg">
                  <RiskMatrix items={detailItems} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showItemForm && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={() => { setShowItemForm(false); setEditItemId(null); }}>
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">{editItemId ? "עריכת פריט סיכון" : "פריט סיכון חדש"}</h2>
              <Button variant="ghost" size="sm" onClick={() => { setShowItemForm(false); setEditItemId(null); }}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">תיאור הסכנה *</Label>
                  <textarea value={itemForm.hazard_description || ""} onChange={e => setItemForm({...itemForm, hazard_description: e.target.value})} rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" placeholder="תאר את הסכנה..." />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">סוג סכנה</Label>
                  <select value={itemForm.hazard_type || ""} onChange={e => setItemForm({...itemForm, hazard_type: e.target.value})} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    <option value="">בחר...</option>
                    {HAZARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">מי מושפע</Label>
                  <Input value={itemForm.who_affected || ""} onChange={e => setItemForm({...itemForm, who_affected: e.target.value})} placeholder="עובדי ייצור, מנהלים..." className="bg-input border-border text-foreground mt-1" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">בקרות קיימות</Label>
                  <textarea value={itemForm.existing_controls || ""} onChange={e => setItemForm({...itemForm, existing_controls: e.target.value})} rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" placeholder="אמצעי הגנה קיימים..." />
                </div>
                <div className="col-span-2 border-b border-border pb-2">
                  <p className="text-xs font-semibold text-orange-400">סיכון ראשוני (לפני בקרות)</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">הסתברות (1-5)</Label>
                  <input type="range" min="1" max="5" value={itemForm.probability || 3} onChange={e => setItemForm({...itemForm, probability: parseInt(e.target.value)})} className="w-full mt-2" />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>1 — נמוך</span>
                    <span className="font-bold text-foreground">{itemForm.probability || 3}</span>
                    <span>5 — גבוה</span>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">חומרה (1-5)</Label>
                  <input type="range" min="1" max="5" value={itemForm.severity || 3} onChange={e => setItemForm({...itemForm, severity: parseInt(e.target.value)})} className="w-full mt-2" />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>1 — זניח</span>
                    <span className="font-bold text-foreground">{itemForm.severity || 3}</span>
                    <span>5 — קטלני</span>
                  </div>
                </div>
                <div className="col-span-2 bg-input rounded-lg p-3 text-center">
                  <span className="text-xs text-muted-foreground">ציון סיכון: </span>
                  <span className="text-xl font-bold text-foreground">{(itemForm.probability || 3) * (itemForm.severity || 3)}</span>
                  <span className="text-xs text-muted-foreground mr-2"> — </span>
                  <Badge className={RISK_COLORS[getRiskLevel((itemForm.probability||3)*(itemForm.severity||3))]}>
                    {RISK_LABELS[getRiskLevel((itemForm.probability||3)*(itemForm.severity||3))]}
                  </Badge>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">בקרות נוספות מוצעות</Label>
                  <textarea value={itemForm.additional_controls || ""} onChange={e => setItemForm({...itemForm, additional_controls: e.target.value})} rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" placeholder="פעולות מניעה נוספות..." />
                </div>
                <div className="col-span-2 border-b border-border pb-2">
                  <p className="text-xs font-semibold text-green-400">סיכון שיורי (אחרי בקרות)</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">הסתברות שיורית (1-5)</Label>
                  <input type="range" min="1" max="5" value={itemForm.residual_probability || 2} onChange={e => setItemForm({...itemForm, residual_probability: parseInt(e.target.value)})} className="w-full mt-2" />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>1</span>
                    <span className="font-bold text-foreground">{itemForm.residual_probability || 2}</span>
                    <span>5</span>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">חומרה שיורית (1-5)</Label>
                  <input type="range" min="1" max="5" value={itemForm.residual_severity || 2} onChange={e => setItemForm({...itemForm, residual_severity: parseInt(e.target.value)})} className="w-full mt-2" />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>1</span>
                    <span className="font-bold text-foreground">{itemForm.residual_severity || 2}</span>
                    <span>5</span>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">אחראי לטיפול</Label>
                  <Input value={itemForm.responsible_person || ""} onChange={e => setItemForm({...itemForm, responsible_person: e.target.value})} placeholder="שם האחראי" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">תאריך יעד</Label>
                  <Input type="date" value={itemForm.target_date || ""} onChange={e => setItemForm({...itemForm, target_date: e.target.value})} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">סטטוס</Label>
                  <select value={itemForm.status || "open"} onChange={e => setItemForm({...itemForm, status: e.target.value})} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    <option value="open">פתוח</option>
                    <option value="in_progress">בטיפול</option>
                    <option value="closed">סגור</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" onClick={() => { setShowItemForm(false); setEditItemId(null); }} className="border-border">ביטול</Button>
              <Button onClick={saveItem} disabled={saving} className="bg-orange-600 hover:bg-orange-700 gap-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editItemId ? "עדכן" : "שמור"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
