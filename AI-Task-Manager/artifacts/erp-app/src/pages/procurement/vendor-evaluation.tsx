import { useState, useEffect, useMemo } from "react";
import {
  Star, Search, Plus, X, Save, Users, Award, ThumbsUp, Ban,
  ArrowUpDown, Filter, RefreshCw, TrendingUp, ChevronDown
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const recommendationMap: Record<string, { label: string; color: string }> = {
  preferred:    { label: "מועדף",   color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  approved:     { label: "מאושר",   color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  conditional:  { label: "מותנה",   color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  blacklisted:  { label: "חסום",    color: "bg-red-500/20 text-red-400 border-red-500/30" },
};

function StarRating({ score, max = 5 }: { score: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i < Math.round(score) ? "text-yellow-400 fill-yellow-400" : "text-gray-600"}`}
        />
      ))}
      <span className="text-xs text-gray-400 mr-1">({Number(score || 0).toFixed(1)})</span>
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const pct = Math.min((score / 5) * 100, 100);
  const color = score >= 4 ? "bg-emerald-500" : score >= 3 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-12">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-300 w-8 text-left">{Number(score || 0).toFixed(1)}</span>
    </div>
  );
}

export default function VendorEvaluationPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRec, setFilterRec] = useState("all");
  const [sortField, setSortField] = useState("overall_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/procurement-sap/vendor-evaluations`);
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
    let arr = [...items];
    if (search) {
      const s = search.toLowerCase();
      arr = arr.filter(i => (i.vendor_name || "").toLowerCase().includes(s) || (i.vendor_code || "").toLowerCase().includes(s));
    }
    if (filterRec !== "all") arr = arr.filter(i => i.recommendation === filterRec);
    arr.sort((a, b) => {
      const av = a[sortField], bv = b[sortField];
      const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [items, search, filterRec, sortField, sortDir]);

  const kpi = useMemo(() => {
    const total = items.length;
    const avg = total ? items.reduce((s, i) => s + (i.overall_score || 0), 0) / total : 0;
    const preferred = items.filter(i => i.recommendation === "preferred").length;
    const blacklisted = items.filter(i => i.recommendation === "blacklisted").length;
    return { total, avg, preferred, blacklisted };
  }, [items]);

  const handleSave = async () => {
    if (!form.vendorName) { alert("שדה חובה: שם ספק"); return; }
    setSaving(true);
    try {
      const res = await authFetch(`${API}/procurement-sap/vendor-evaluations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; }
      setShowForm(false);
      setForm({});
      load();
    } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };

  const kpis = [
    { icon: Users, label: "סה\"כ ספקים", value: fmt(kpi.total), color: "from-blue-600 to-blue-800" },
    { icon: TrendingUp, label: "ציון ממוצע", value: kpi.avg.toFixed(1), color: "from-purple-600 to-purple-800" },
    { icon: Award, label: "ספקים מועדפים", value: fmt(kpi.preferred), color: "from-emerald-600 to-emerald-800" },
    { icon: Ban, label: "ספקים חסומים", value: fmt(kpi.blacklisted), color: "from-red-600 to-red-800" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">הערכת ספקים</h1>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 rounded-lg bg-muted hover:bg-muted text-gray-300">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setForm({}); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? "סגור" : "הערכה חדשה"}
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

      {/* Create Evaluation Form */}
      {showForm && (
        <div className="rounded-xl border border-border/50 bg-muted/30 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">יצירת הערכה חדשה</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">שם ספק *</label>
              <input
                type="text" className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground"
                value={form.vendor_name || ""} onChange={e => setForm({ ...form, vendor_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">קוד ספק</label>
              <input
                type="text" className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground"
                value={form.vendor_code || ""} onChange={e => setForm({ ...form, vendor_code: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">ציון איכות (1-5)</label>
              <input
                type="number" min={1} max={5} step={0.1}
                className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground"
                value={form.quality_score || ""} onChange={e => setForm({ ...form, quality_score: +e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">ציון אספקה (1-5)</label>
              <input
                type="number" min={1} max={5} step={0.1}
                className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground"
                value={form.delivery_score || ""} onChange={e => setForm({ ...form, delivery_score: +e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">ציון מחיר (1-5)</label>
              <input
                type="number" min={1} max={5} step={0.1}
                className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground"
                value={form.price_score || ""} onChange={e => setForm({ ...form, price_score: +e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">ציון שירות (1-5)</label>
              <input
                type="number" min={1} max={5} step={0.1}
                className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground"
                value={form.service_score || ""} onChange={e => setForm({ ...form, service_score: +e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">המלצה</label>
              <select
                className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground"
                value={form.recommendation || ""} onChange={e => setForm({ ...form, recommendation: e.target.value })}
              >
                <option value="">בחר...</option>
                <option value="preferred">מועדף</option>
                <option value="approved">מאושר</option>
                <option value="conditional">מותנה</option>
                <option value="blacklisted">חסום</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">תאריך הערכה</label>
              <input
                type="date" className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground"
                value={form.evaluation_date || ""} onChange={e => setForm({ ...form, evaluation_date: e.target.value })}
              />
            </div>
            <div className="md:col-span-2 lg:col-span-1">
              <label className="block text-sm text-gray-300 mb-1">הערות</label>
              <input
                type="text" className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground"
                value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => { setShowForm(false); setForm({}); }}
              className="px-4 py-2 rounded-lg bg-muted hover:bg-muted text-gray-300 text-sm">ביטול</button>
            <button onClick={handleSave} disabled={saving || !form.vendor_name}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-foreground text-sm disabled:opacity-50">
              <Save className="w-4 h-4" />{saving ? "שומר..." : "שמור הערכה"}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" placeholder="חיפוש ספק..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pr-10 pl-3 py-2 rounded-lg border border-border bg-muted/50 text-foreground text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={filterRec} onChange={e => setFilterRec(e.target.value)}
            className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground text-sm"
          >
            <option value="all">כל ההמלצות</option>
            <option value="preferred">מועדף</option>
            <option value="approved">מאושר</option>
            <option value="conditional">מותנה</option>
            <option value="blacklisted">חסום</option>
          </select>
        </div>
        <span className="text-sm text-gray-400">{filtered.length} ספקים</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                {[
                  { key: "vendor_name", label: "שם ספק" },
                  { key: "overall_score", label: "ציון כללי" },
                  { key: "quality_score", label: "איכות" },
                  { key: "delivery_score", label: "אספקה" },
                  { key: "price_score", label: "מחיר" },
                  { key: "service_score", label: "שירות" },
                  { key: "recommendation", label: "המלצה" },
                  { key: "evaluation_date", label: "תאריך הערכה" },
                ].map(col => (
                  <th key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className="px-4 py-3 text-right font-medium text-gray-300 cursor-pointer hover:text-foreground whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {col.label}
                      <ArrowUpDown className="w-3 h-3 opacity-40" />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">טוען נתונים...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">לא נמצאו ספקים</td></tr>
              ) : filtered.map((item, idx) => {
                const rec = recommendationMap[item.recommendation] || { label: item.recommendation || "—", color: "bg-gray-500/20 text-gray-400" };
                return (
                  <tr key={item.id || idx} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-foreground font-medium">{item.vendor_name || "—"}</td>
                    <td className="px-4 py-3">
                      <StarRating score={item.overall_score || 0} />
                    </td>
                    <td className="px-4 py-3"><ScoreBar label="" score={item.quality_score || 0} /></td>
                    <td className="px-4 py-3"><ScoreBar label="" score={item.delivery_score || 0} /></td>
                    <td className="px-4 py-3"><ScoreBar label="" score={item.price_score || 0} /></td>
                    <td className="px-4 py-3"><ScoreBar label="" score={item.service_score || 0} /></td>
                    <td className="px-4 py-3">
                      <Badge className={`${rec.color} border text-xs`}>{rec.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{item.evaluation_date || "—"}</td>
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
