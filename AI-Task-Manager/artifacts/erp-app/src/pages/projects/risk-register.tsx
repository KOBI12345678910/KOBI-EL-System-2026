import { useState, useEffect, useMemo } from "react";
import {
  AlertTriangle, Search, Plus, X, Save, Shield, ShieldAlert, ShieldCheck,
  ArrowUpDown, Filter, RefreshCw, Target, Activity
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const severityMap: Record<string, { label: string; color: string }> = {
  critical: { label: "קריטי",  color: "bg-red-500/20 text-red-400 border-red-500/30" },
  high:     { label: "גבוה",   color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  medium:   { label: "בינוני", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  low:      { label: "נמוך",   color: "bg-green-500/20 text-green-400 border-green-500/30" },
};

const statusMap: Record<string, { label: string; color: string }> = {
  open:       { label: "פתוח",      color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  mitigating: { label: "בטיפול",    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  mitigated:  { label: "טופל",      color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  accepted:   { label: "התקבל",     color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  closed:     { label: "נסגר",      color: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
};

const categoryMap: Record<string, string> = {
  technical: "טכני",
  financial: "פיננסי",
  schedule: "לו\"ז",
  resource: "משאבים",
  external: "חיצוני",
  quality: "איכות",
  legal: "משפטי",
  scope: "היקף",
};

const probabilityLabels = ["נמוך מאוד", "נמוך", "בינוני", "גבוה", "גבוה מאוד"];
const impactLabels = ["זניח", "קל", "מתון", "חמור", "קטסטרופלי"];

function RiskMatrix({ risks }: { risks: any[] }) {
  // 5x5 matrix grid: probability (y) vs impact (x)
  const matrix: Record<string, any[]> = {};
  risks.forEach(r => {
    const p = Math.min(Math.max(Math.round(r.probability || 1), 1), 5);
    const imp = Math.min(Math.max(Math.round(r.impact || 1), 1), 5);
    const key = `${p}-${imp}`;
    if (!matrix[key]) matrix[key] = [];
    matrix[key].push(r);
  });

  const getCellColor = (prob: number, impact: number) => {
    const score = prob * impact;
    if (score >= 15) return "bg-red-500/40 hover:bg-red-500/60";
    if (score >= 10) return "bg-orange-500/30 hover:bg-orange-500/50";
    if (score >= 5) return "bg-yellow-500/20 hover:bg-yellow-500/40";
    return "bg-green-500/15 hover:bg-green-500/30";
  };

  return (
    <div className="rounded-xl border border-border/50 bg-muted/30 p-5">
      <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
        <Target className="w-5 h-5 text-red-400" />
        מטריצת סיכונים (הסתברות x השפעה)
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="w-24 p-2 text-xs text-gray-400 text-right">הסתברות \ השפעה</th>
              {impactLabels.map((label, i) => (
                <th key={i} className="p-2 text-xs text-gray-300 text-center">{label}<br /><span className="text-gray-500">{i + 1}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[5, 4, 3, 2, 1].map(prob => (
              <tr key={prob}>
                <td className="p-2 text-xs text-gray-300 text-right whitespace-nowrap">
                  {probabilityLabels[prob - 1]} <span className="text-gray-500">({prob})</span>
                </td>
                {[1, 2, 3, 4, 5].map(impact => {
                  const key = `${prob}-${impact}`;
                  const cellRisks = matrix[key] || [];
                  return (
                    <td key={impact} className={`p-1 border border-border/30 text-center transition-colors ${getCellColor(prob, impact)}`}>
                      <div className="min-h-[40px] flex items-center justify-center">
                        {cellRisks.length > 0 ? (
                          <div className="flex flex-wrap gap-1 justify-center p-1">
                            {cellRisks.map((r: any, i: number) => (
                              <div key={i} className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs text-foreground font-bold"
                                title={r.title || r.description || `Risk #${r.id}`}>
                                {cellRisks.length > 3 ? cellRisks.length : (r.risk_id || r.id || "R")}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-600">{prob * impact}</span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Legend */}
      <div className="flex gap-4 mt-3 text-xs text-gray-400">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/40" /> קריטי (15-25)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500/30" /> גבוה (10-14)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500/20" /> בינוני (5-9)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500/15" /> נמוך (1-4)</span>
      </div>
    </div>
  );
}

export default function RiskRegisterPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [sortField, setSortField] = useState("risk_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/projects-sap/risk-register`);
      if (res.ok) setItems(safeArray(await res.json()));
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let arr = items.map(i => ({
      ...i,
      risk_score: (i.probability || 1) * (i.impact || 1),
      severity: getSeverity((i.probability || 1) * (i.impact || 1)),
    }));
    if (search) {
      const s = search.toLowerCase();
      arr = arr.filter(i => (i.title || "").toLowerCase().includes(s) || (i.description || "").toLowerCase().includes(s));
    }
    if (filterStatus !== "all") arr = arr.filter(i => i.status === filterStatus);
    if (filterCategory !== "all") arr = arr.filter(i => i.category === filterCategory);
    arr.sort((a, b) => {
      const av = a[sortField], bv = b[sortField];
      const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [items, search, filterStatus, filterCategory, sortField, sortDir]);

  const kpi = useMemo(() => {
    const total = items.length;
    const withScore = items.map(i => ({ ...i, score: (i.probability || 1) * (i.impact || 1) }));
    const critical = withScore.filter(i => i.score >= 15).length;
    const high = withScore.filter(i => i.score >= 10 && i.score < 15).length;
    const mitigated = items.filter(i => i.status === "mitigated" || i.status === "closed").length;
    return { total, critical, high, mitigated };
  }, [items]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await authFetch(`${API}/projects-sap/risk-register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setShowForm(false);
      setForm({});
      load();
    } catch {}
    setSaving(false);
  };

  const kpis = [
    { icon: Shield, label: 'סה"כ סיכונים', value: fmt(kpi.total), color: "from-blue-600 to-blue-800" },
    { icon: ShieldAlert, label: "קריטיים", value: fmt(kpi.critical), color: "from-red-600 to-red-800" },
    { icon: AlertTriangle, label: "גבוהים", value: fmt(kpi.high), color: "from-orange-600 to-orange-800" },
    { icon: ShieldCheck, label: "טופלו", value: fmt(kpi.mitigated), color: "from-emerald-600 to-emerald-800" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">רישום סיכונים</h1>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 rounded-lg bg-muted hover:bg-muted text-gray-300">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setForm({}); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? "סגור" : "סיכון חדש"}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={i} className={`rounded-xl bg-gradient-to-br ${k.color} p-4 border border-white/10`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-foreground/70">{k.label}</div>
                <div className="text-2xl font-bold text-foreground mt-1">{k.value}</div>
              </div>
              <k.icon className="w-8 h-8 text-foreground/30" />
            </div>
          </div>
        ))}
      </div>

      {/* Create Risk Form */}
      {showForm && (
        <div className="rounded-xl border border-border/50 bg-muted/30 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">הוספת סיכון חדש</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-300 mb-1">כותרת *</label>
              <input type="text" className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground"
                value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">קטגוריה</label>
              <select className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground"
                value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })}>
                <option value="">בחר...</option>
                {Object.entries(categoryMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">הסתברות (1-5)</label>
              <select className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground"
                value={form.probability || ""} onChange={e => setForm({ ...form, probability: +e.target.value })}>
                <option value="">בחר...</option>
                {probabilityLabels.map((l, i) => <option key={i} value={i + 1}>{i + 1} - {l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">השפעה (1-5)</label>
              <select className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground"
                value={form.impact || ""} onChange={e => setForm({ ...form, impact: +e.target.value })}>
                <option value="">בחר...</option>
                {impactLabels.map((l, i) => <option key={i} value={i + 1}>{i + 1} - {l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">בעלים</label>
              <input type="text" className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground"
                value={form.owner || ""} onChange={e => setForm({ ...form, owner: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">סטטוס</label>
              <select className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground"
                value={form.status || "open"} onChange={e => setForm({ ...form, status: e.target.value })}>
                {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm text-gray-300 mb-1">תיאור</label>
              <textarea className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground h-20"
                value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm text-gray-300 mb-1">תוכנית מיטיגציה</label>
              <textarea className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground h-20"
                value={form.mitigation_plan || ""} onChange={e => setForm({ ...form, mitigation_plan: e.target.value })} />
            </div>
          </div>
          {form.probability && form.impact && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-400">ציון סיכון:</span>
              <Badge className={`${severityMap[getSeverity(form.probability * form.impact)]?.color || "bg-gray-500/20 text-gray-400"} border`}>
                {form.probability * form.impact} - {severityMap[getSeverity(form.probability * form.impact)]?.label}
              </Badge>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => { setShowForm(false); setForm({}); }}
              className="px-4 py-2 rounded-lg bg-muted hover:bg-muted text-gray-300 text-sm">ביטול</button>
            <button onClick={handleSave} disabled={saving || !form.title}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-foreground text-sm disabled:opacity-50">
              <Save className="w-4 h-4" />{saving ? "שומר..." : "שמור סיכון"}
            </button>
          </div>
        </div>
      )}

      {/* Risk Matrix */}
      {!loading && <RiskMatrix risks={items} />}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="חיפוש סיכון..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pr-10 pl-3 py-2 rounded-lg border border-border bg-muted/50 text-foreground text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground text-sm">
            <option value="all">כל הסטטוסים</option>
            {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-gray-400" />
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground text-sm">
            <option value="all">כל הקטגוריות</option>
            {Object.entries(categoryMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <span className="text-sm text-gray-400">{filtered.length} סיכונים</span>
      </div>

      {/* Risk List Table */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                {[
                  { key: "title", label: "כותרת" },
                  { key: "category", label: "קטגוריה" },
                  { key: "probability", label: "הסתברות" },
                  { key: "impact", label: "השפעה" },
                  { key: "risk_score", label: "ציון" },
                  { key: "severity", label: "חומרה" },
                  { key: "owner", label: "בעלים" },
                  { key: "status", label: "סטטוס" },
                ].map(col => (
                  <th key={col.key} onClick={() => toggleSort(col.key)}
                    className="px-4 py-3 text-right font-medium text-gray-300 cursor-pointer hover:text-foreground whitespace-nowrap">
                    <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3 opacity-40" /></div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">טוען נתונים...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">לא נמצאו סיכונים</td></tr>
              ) : filtered.map((item, idx) => {
                const sev = severityMap[item.severity] || { label: "—", color: "bg-gray-500/20 text-gray-400" };
                const st = statusMap[item.status] || { label: item.status || "—", color: "bg-gray-500/20 text-gray-400" };
                return (
                  <tr key={item.id || idx} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-foreground font-medium">{item.title || "—"}</td>
                    <td className="px-4 py-3 text-gray-400">{categoryMap[item.category] || item.category || "—"}</td>
                    <td className="px-4 py-3 text-center text-gray-300">{item.probability || "—"}</td>
                    <td className="px-4 py-3 text-center text-gray-300">{item.impact || "—"}</td>
                    <td className="px-4 py-3 text-center font-bold text-foreground">{item.risk_score}</td>
                    <td className="px-4 py-3">
                      <Badge className={`${sev.color} border text-xs`}>{sev.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{item.owner || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={`${st.color} border text-xs`}>{st.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function getSeverity(score: number): string {
  if (score >= 15) return "critical";
  if (score >= 10) return "high";
  if (score >= 5) return "medium";
  return "low";
}
