import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Plus, Search, Eye, Edit2, Trash2, ChevronRight, ChevronLeft,
  X, Save, AlertCircle, CheckCircle2, Clock, Loader2,
  BarChart3, Medal, Calendar, ClipboardCheck, AlertTriangle, TrendingUp, TrendingDown
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { authFetch } from "@/lib/utils";

const BASE = "/api/qms";

type SubTab = "scorecards" | "audits" | "scars";

const AUDIT_STATUS_HE: Record<string, string> = {
  scheduled: "מתוכנן", in_progress: "בתהליך", completed: "הושלם", cancelled: "בוטל"
};
const AUDIT_STATUS_COLOR: Record<string, string> = {
  scheduled: "bg-blue-500/20 text-blue-300", in_progress: "bg-yellow-500/20 text-yellow-300",
  completed: "bg-green-500/20 text-green-300", cancelled: "bg-gray-500/20 text-gray-300"
};
const SCAR_STATUS_HE: Record<string, string> = {
  issued: "הונפק", "in-review": "בסקירה", "supplier-responded": "ספק השיב", verified: "אומת", closed: "סגור"
};
const SCAR_STATUS_COLOR: Record<string, string> = {
  issued: "bg-orange-500/20 text-orange-300", "in-review": "bg-yellow-500/20 text-yellow-300",
  "supplier-responded": "bg-blue-500/20 text-blue-300", verified: "bg-purple-500/20 text-purple-300",
  closed: "bg-green-500/20 text-green-300"
};
const SEV_HE: Record<string, string> = { minor: "מינורי", major: "מז'ורי", critical: "קריטי" };
const SEV_COLOR: Record<string, string> = {
  minor: "bg-yellow-500/20 text-yellow-300", major: "bg-orange-500/20 text-orange-300",
  critical: "bg-red-500/20 text-red-300"
};

function scoreColor(score: number): string {
  if (score >= 90) return "text-green-400";
  if (score >= 70) return "text-yellow-400";
  if (score >= 50) return "text-orange-400";
  return "text-red-400";
}

function ScoreCard({ score }: { score: any }) {
  const s = parseFloat(score.quality_score || 0);
  const rejRate = (parseFloat(score.rejection_rate || 0) * 100).toFixed(2);
  const ppm = parseFloat(score.ppm || 0).toFixed(0);
  return (
    <Card className="bg-card border border-border/50 hover:border-primary/30 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="font-semibold text-foreground">{score.supplier_name || `ספק #${score.supplier_id}`}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{score.period_start?.slice(0, 7)} — {score.period_end?.slice(0, 7)}</div>
          </div>
          <div className={`text-2xl font-bold ${scoreColor(s)}`}>{s.toFixed(1)}</div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-background/50 rounded-lg p-2 text-center">
            <div className="text-muted-foreground">PPM</div>
            <div className="font-bold text-foreground">{ppm}</div>
          </div>
          <div className="bg-background/50 rounded-lg p-2 text-center">
            <div className="text-muted-foreground">דחיות %</div>
            <div className="font-bold text-foreground">{rejRate}%</div>
          </div>
          <div className="bg-background/50 rounded-lg p-2 text-center">
            <div className="text-muted-foreground">SCAR פתוחים</div>
            <div className={`font-bold ${parseInt(score.open_scars || 0) > 0 ? "text-red-400" : "text-green-400"}`}>{score.open_scars || 0}</div>
          </div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          אצוות: {score.total_lots || 0} | נדחו: {score.rejected_lots || 0}
          {score.last_audit_date && <> | ביקורת אחרונה: {score.last_audit_date?.slice(0, 10)}</>}
        </div>
      </CardContent>
    </Card>
  );
}

function AuditForm({ initial, onSave, onClose }: { initial?: any; onSave: () => void; onClose: () => void }) {
  const [form, setForm] = useState(initial || {
    supplier_name: "", audit_type: "routine", scheduled_date: "", auditor: "",
    lead_auditor: "", scope: "", status: "scheduled"
  });
  const [saving, setSaving] = useState(false);
  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.supplier_name) return;
    setSaving(true);
    try {
      const url = initial ? `${BASE}/supplier-audits/${initial.id}` : `${BASE}/supplier-audits`;
      await authFetch(url, { method: initial ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, supplier_id: form.supplier_id || 0 }) });
      onSave();
    } catch {}
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Calendar className="w-5 h-5 text-green-400" />{initial ? "עריכת ביקורת" : "ביקורת ספק חדשה"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">שם ספק *</Label>
            <Input value={form.supplier_name || ""} onChange={e => f("supplier_name", e.target.value)} className="mt-1 bg-background border-border" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">סוג ביקורת</Label>
            <select value={form.audit_type || "routine"} onChange={e => f("audit_type", e.target.value)} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
              <option value="routine">שגרתית</option>
              <option value="initial">ראשונית</option>
              <option value="follow_up">מעקב</option>
              <option value="special">מיוחדת</option>
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">סטטוס</Label>
            <select value={form.status || "scheduled"} onChange={e => f("status", e.target.value)} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
              <option value="scheduled">מתוכנן</option>
              <option value="in_progress">בתהליך</option>
              <option value="completed">הושלם</option>
              <option value="cancelled">בוטל</option>
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">תאריך מתוכנן</Label>
            <Input type="date" value={form.scheduled_date || ""} onChange={e => f("scheduled_date", e.target.value)} className="mt-1 bg-background border-border" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">תאריך בפועל</Label>
            <Input type="date" value={form.actual_date || ""} onChange={e => f("actual_date", e.target.value)} className="mt-1 bg-background border-border" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">מבקר ראשי</Label>
            <Input value={form.lead_auditor || ""} onChange={e => f("lead_auditor", e.target.value)} className="mt-1 bg-background border-border" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">מבקר</Label>
            <Input value={form.auditor || ""} onChange={e => f("auditor", e.target.value)} className="mt-1 bg-background border-border" />
          </div>
          {initial && <>
            <div>
              <Label className="text-xs text-muted-foreground">ציון כולל</Label>
              <Input type="number" step="0.1" max="100" value={form.overall_score || ""} onChange={e => f("overall_score", e.target.value)} className="mt-1 bg-background border-border" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">ממצאים קריטיים</Label>
              <Input type="number" value={form.critical_findings || 0} onChange={e => f("critical_findings", e.target.value)} className="mt-1 bg-background border-border" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">ממצאים מז'וריים</Label>
              <Input type="number" value={form.major_findings || 0} onChange={e => f("major_findings", e.target.value)} className="mt-1 bg-background border-border" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">ממצאים מינוריים</Label>
              <Input type="number" value={form.minor_findings || 0} onChange={e => f("minor_findings", e.target.value)} className="mt-1 bg-background border-border" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">סיכום ממצאים</Label>
              <textarea value={form.findings_summary || ""} onChange={e => f("findings_summary", e.target.value)} rows={3} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">המלצות</Label>
              <textarea value={form.recommendations || ""} onChange={e => f("recommendations", e.target.value)} rows={2} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">ביקורת עוקבת מתוכננת</Label>
              <Input type="date" value={form.next_audit_date || ""} onChange={e => f("next_audit_date", e.target.value)} className="mt-1 bg-background border-border" />
            </div>
          </>}
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">היקף הביקורת</Label>
            <textarea value={form.scope || ""} onChange={e => f("scope", e.target.value)} rows={2} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
          </div>
        </div>
        <div className="p-5 border-t border-border flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={save} disabled={saving} className="bg-green-600 hover:bg-green-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}שמור
          </Button>
        </div>
      </div>
    </div>
  );
}

function ScarForm({ initial, onSave, onClose }: { initial?: any; onSave: () => void; onClose: () => void }) {
  const [form, setForm] = useState(initial || {
    supplier_name: "", issue_description: "", severity: "major",
    issued_date: new Date().toISOString().slice(0, 10), response_due_date: "", status: "issued"
  });
  const [saving, setSaving] = useState(false);
  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.supplier_name || !form.issue_description) return;
    setSaving(true);
    try {
      const url = initial ? `${BASE}/scars/${initial.id}` : `${BASE}/scars`;
      await authFetch(url, { method: initial ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, supplier_id: form.supplier_id || 0 }) });
      onSave();
    } catch {}
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-400" />{initial ? "עריכת SCAR" : "SCAR חדש — בקשת פעולה מתקנת לספק"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">שם ספק *</Label>
            <Input value={form.supplier_name || ""} onChange={e => f("supplier_name", e.target.value)} className="mt-1 bg-background border-border" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">חומרה</Label>
            <select value={form.severity || "major"} onChange={e => f("severity", e.target.value)} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
              <option value="minor">מינורי</option>
              <option value="major">מז'ורי</option>
              <option value="critical">קריטי</option>
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">סטטוס</Label>
            <select value={form.status || "issued"} onChange={e => f("status", e.target.value)} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
              <option value="issued">הונפק</option>
              <option value="in-review">בסקירה</option>
              <option value="supplier-responded">ספק השיב</option>
              <option value="verified">אומת</option>
              <option value="closed">סגור</option>
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">תאריך הנפקה</Label>
            <Input type="date" value={form.issued_date || ""} onChange={e => f("issued_date", e.target.value)} className="mt-1 bg-background border-border" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">תאריך תשובה נדרש</Label>
            <Input type="date" value={form.response_due_date || ""} onChange={e => f("response_due_date", e.target.value)} className="mt-1 bg-background border-border" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">תיאור הבעיה *</Label>
            <textarea value={form.issue_description || ""} onChange={e => f("issue_description", e.target.value)} rows={3} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
          </div>
          {initial && <>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">סיבת שורש של ספק</Label>
              <textarea value={form.supplier_root_cause || ""} onChange={e => f("supplier_root_cause", e.target.value)} rows={2} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">פעולת ספק מוצעת</Label>
              <textarea value={form.supplier_corrective_action || ""} onChange={e => f("supplier_corrective_action", e.target.value)} rows={2} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">תאריך תגובת ספק</Label>
              <Input type="date" value={form.supplier_response_date || ""} onChange={e => f("supplier_response_date", e.target.value)} className="mt-1 bg-background border-border" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">מאמת</Label>
              <Input value={form.verified_by || ""} onChange={e => f("verified_by", e.target.value)} className="mt-1 bg-background border-border" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">תאריך אימות</Label>
              <Input type="date" value={form.verification_date || ""} onChange={e => f("verification_date", e.target.value)} className="mt-1 bg-background border-border" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">תאריך סגירה</Label>
              <Input type="date" value={form.close_out_date || ""} onChange={e => f("close_out_date", e.target.value)} className="mt-1 bg-background border-border" />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" checked={form.effectiveness_confirmed || false} onChange={e => f("effectiveness_confirmed", e.target.checked)} id="eff" />
              <Label htmlFor="eff" className="text-sm text-muted-foreground cursor-pointer">יעילות הפעולה אושרה</Label>
            </div>
          </>}
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">הערות</Label>
            <textarea value={form.notes || ""} onChange={e => f("notes", e.target.value)} rows={2} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
          </div>
        </div>
        <div className="p-5 border-t border-border flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={save} disabled={saving} className="bg-red-600 hover:bg-red-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}הנפק SCAR
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SupplierQualityPage() {
  const [scores, setScores] = useState<any[]>([]);
  const [audits, setAudits] = useState<any[]>([]);
  const [scars, setScars] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<SubTab>("scorecards");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 20;
  const [showAuditForm, setShowAuditForm] = useState(false);
  const [showScarForm, setShowScarForm] = useState(false);
  const [editAudit, setEditAudit] = useState<any>(null);
  const [editScar, setEditScar] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        authFetch(`${BASE}/supplier-scores`),
        authFetch(`${BASE}/supplier-audits`),
        authFetch(`${BASE}/scars`)
      ]);
      if (r1.ok) { const j = await r1.json(); setScores(Array.isArray(j) ? j : []); }
      if (r2.ok) { const j = await r2.json(); setAudits(Array.isArray(j) ? j : []); }
      if (r3.ok) { const j = await r3.json(); setScars(Array.isArray(j) ? j : []); }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredAudits = useMemo(() => {
    let d = audits;
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    if (search) { const s = search.toLowerCase(); d = d.filter(r => r.supplier_name?.toLowerCase().includes(s) || r.audit_number?.toLowerCase().includes(s)); }
    return d;
  }, [audits, statusFilter, search]);

  const filteredScars = useMemo(() => {
    let d = scars;
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    if (search) { const s = search.toLowerCase(); d = d.filter(r => r.supplier_name?.toLowerCase().includes(s) || r.scar_number?.toLowerCase().includes(s)); }
    return d;
  }, [scars, statusFilter, search]);

  const filteredScores = useMemo(() => {
    if (!search) return scores;
    const s = search.toLowerCase();
    return scores.filter(r => r.supplier_name?.toLowerCase().includes(s));
  }, [scores, search]);

  const activeList = subTab === "audits" ? filteredAudits : filteredScars;
  const totalPages = Math.max(1, Math.ceil(activeList.length / perPage));
  const pageData = activeList.slice((page - 1) * perPage, page * perPage);

  const stats = useMemo(() => ({
    suppliers: scores.length,
    avgScore: scores.length > 0 ? (scores.reduce((s, r) => s + parseFloat(r.quality_score || 0), 0) / scores.length).toFixed(1) : "—",
    auditsScheduled: audits.filter(r => r.status === "scheduled").length,
    openScars: scars.filter(r => r.status !== "closed").length,
  }), [scores, audits, scars]);

  const chartData = useMemo(() => {
    return scores.slice(0, 8).map(s => ({
      name: (s.supplier_name || `#${s.supplier_id}`).slice(0, 12),
      score: parseFloat(s.quality_score || 0).toFixed(1),
      ppm: parseFloat(s.ppm || 0).toFixed(0)
    }));
  }, [scores]);

  const deleteAudit = async (id: number) => {
    if (!confirm("למחוק ביקורת זו?")) return;
    await authFetch(`${BASE}/supplier-audits/${id}`, { method: "DELETE" });
    load();
  };

  const deleteScar = async (id: number) => {
    if (!confirm("למחוק SCAR זה?")) return;
    await authFetch(`${BASE}/scars/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Medal className="w-6 h-6 text-yellow-400" />איכות ספקים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">כרטיסי ציון ספקים, ביקורות ו-SCAR</p>
        </div>
        <div className="flex gap-2">
          {subTab === "audits" && <Button onClick={() => { setEditAudit(null); setShowAuditForm(true); }} className="bg-green-600 hover:bg-green-700"><Plus className="w-4 h-4 ml-1" />ביקורת חדשה</Button>}
          {subTab === "scars" && <Button onClick={() => { setEditScar(null); setShowScarForm(true); }} className="bg-red-600 hover:bg-red-700"><Plus className="w-4 h-4 ml-1" />SCAR חדש</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "ספקים במעקב", value: stats.suppliers, color: "text-foreground", icon: Medal },
          { label: "ציון איכות ממוצע", value: stats.avgScore, color: `text-${parseFloat(stats.avgScore as string) >= 80 ? "green" : parseFloat(stats.avgScore as string) >= 60 ? "yellow" : "red"}-400`, icon: BarChart3 },
          { label: "ביקורות מתוכננות", value: stats.auditsScheduled, color: "text-blue-400", icon: Calendar },
          { label: "SCAR פתוחים", value: stats.openScars, color: stats.openScars > 0 ? "text-red-400" : "text-green-400", icon: AlertTriangle },
        ].map((kpi, i) => (
          <Card key={i} className="bg-card border border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <kpi.icon className={`${kpi.color} w-7 h-7 flex-shrink-0`} />
              <div>
                <div className="text-xl font-bold text-foreground">{kpi.value}</div>
                <div className="text-xs text-muted-foreground">{kpi.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {scores.length > 0 && subTab === "scorecards" && (
        <Card className="bg-card/50 border border-border/50">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4" />ציוני איכות ספקים</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ right: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#f1f5f9", fontSize: "12px" }} />
                <Bar dataKey="score" name="ציון" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-1 border-b border-border/50">
        {([
          { key: "scorecards", label: "כרטיסי ציון", icon: Medal },
          { key: "audits", label: "ביקורות ספקים", icon: Calendar },
          { key: "scars", label: "SCAR — בקשות פעולה מתקנת", icon: AlertTriangle },
        ] as const).map(t => (
          <button key={t.key} onClick={() => { setSubTab(t.key); setPage(1); setStatusFilter("all"); }} className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${subTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      <Card className="bg-card/50 border border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש ספק..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-9 bg-background/50" />
            </div>
            {subTab !== "scorecards" && (
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-background/50 border border-border rounded-lg px-3 py-2 text-sm">
                <option value="all">כל הסטטוסים</option>
                {subTab === "audits"
                  ? Object.entries(AUDIT_STATUS_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)
                  : Object.entries(SCAR_STATUS_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)
                }
              </select>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-muted/20 rounded-lg animate-pulse" />)}</div>
          ) : subTab === "scorecards" ? (
            filteredScores.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Medal className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p>אין כרטיסי ציון ספקים</p>
                <p className="text-sm mt-1">כרטיסי ציון נוצרים בעת הוספת נתוני איכות ספק</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredScores.map((s: any) => <ScoreCard key={s.id} score={s} />)}
              </div>
            )
          ) : subTab === "audits" ? (
            pageData.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p>אין ביקורות מתוכננות</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border/50">
                    <th className="text-right p-3 text-muted-foreground font-medium">מספר ביקורת</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">ספק</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">סוג</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">תאריך מתוכנן</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">מבקר</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">ציון</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                    <th className="text-center p-3 text-muted-foreground font-medium w-20">פעולות</th>
                  </tr></thead>
                  <tbody>
                    {pageData.map((row: any) => (
                      <tr key={row.id} className="border-b border-border/30 hover:bg-card/30">
                        <td className="p-3 font-mono text-xs text-green-400">{row.audit_number}</td>
                        <td className="p-3 text-foreground font-medium">{row.supplier_name}</td>
                        <td className="p-3 text-muted-foreground text-xs">{{ routine: "שגרתית", initial: "ראשונית", follow_up: "מעקב", special: "מיוחדת" }[row.audit_type as string] || row.audit_type}</td>
                        <td className="p-3 text-muted-foreground text-xs">{row.scheduled_date?.slice(0, 10)}</td>
                        <td className="p-3 text-muted-foreground text-xs">{row.lead_auditor || row.auditor || "—"}</td>
                        <td className="p-3">
                          {row.overall_score ? (
                            <span className={`font-bold ${scoreColor(parseFloat(row.overall_score))}`}>{parseFloat(row.overall_score).toFixed(1)}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-3"><Badge className={`${AUDIT_STATUS_COLOR[row.status] || ""} border-0 text-xs`}>{AUDIT_STATUS_HE[row.status] || row.status}</Badge></td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => { setEditAudit(row); setShowAuditForm(true); }} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                            <button onClick={() => deleteAudit(row.id)} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            pageData.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <AlertTriangle className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p>אין SCAR פתוחים</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border/50">
                    <th className="text-right p-3 text-muted-foreground font-medium">מספר SCAR</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">ספק</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">תיאור</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">חומרה</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">הנפקה</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">מועד תשובה</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                    <th className="text-center p-3 text-muted-foreground font-medium w-20">פעולות</th>
                  </tr></thead>
                  <tbody>
                    {pageData.map((row: any) => (
                      <tr key={row.id} className="border-b border-border/30 hover:bg-card/30">
                        <td className="p-3 font-mono text-xs text-red-400">{row.scar_number}</td>
                        <td className="p-3 text-foreground font-medium">{row.supplier_name}</td>
                        <td className="p-3 text-muted-foreground text-xs max-w-[200px] truncate">{row.issue_description}</td>
                        <td className="p-3"><Badge className={`${SEV_COLOR[row.severity] || ""} border-0 text-xs`}>{SEV_HE[row.severity] || row.severity}</Badge></td>
                        <td className="p-3 text-muted-foreground text-xs">{row.issued_date?.slice(0, 10)}</td>
                        <td className="p-3 text-xs">
                          {row.response_due_date ? (
                            <span className={new Date(row.response_due_date) < new Date() && row.status !== "closed" ? "text-red-400" : "text-muted-foreground"}>
                              {row.response_due_date?.slice(0, 10)}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="p-3"><Badge className={`${SCAR_STATUS_COLOR[row.status] || ""} border-0 text-xs`}>{SCAR_STATUS_HE[row.status] || row.status}</Badge></td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => { setEditScar(row); setShowScarForm(true); }} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                            <button onClick={() => deleteScar(row.id)} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {subTab !== "scorecards" && (
            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <span>מציג {Math.min(activeList.length, (page - 1) * perPage + 1)}–{Math.min(activeList.length, page * perPage)} מתוך {activeList.length}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronRight className="w-4 h-4" /></Button>
                <span className="px-3 py-1">{page}/{totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronLeft className="w-4 h-4" /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {showAuditForm && <AuditForm initial={editAudit} onSave={() => { setShowAuditForm(false); load(); }} onClose={() => setShowAuditForm(false)} />}
      {showScarForm && <ScarForm initial={editScar} onSave={() => { setShowScarForm(false); load(); }} onClose={() => setShowScarForm(false)} />}
    </div>
  );
}
