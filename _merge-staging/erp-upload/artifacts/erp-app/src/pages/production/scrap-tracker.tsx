import { useState, useEffect, useMemo } from "react";
import {
  Recycle, Search, Plus, Edit2, Trash2, X, BarChart3, TrendingDown, TrendingUp,
  AlertTriangle, DollarSign, Users, Factory, Wrench, Calendar, Filter, Percent
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

const API = "/api/scrap-tracker";
const safeArr = (d: any) => Array.isArray(d) ? d : [];
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtC = (v: any) => Number(v || 0).toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });

const scrapReasons = [
  { value: "cutting_error", label: "שגיאת חיתוך" },
  { value: "material_defect", label: "פגם בחומר" },
  { value: "welding_error", label: "שגיאת ריתוך" },
  { value: "measurement_error", label: "שגיאת מדידה" },
  { value: "machine_malfunction", label: "תקלת מכונה" },
  { value: "design_change", label: "שינוי עיצוב" },
  { value: "handling_damage", label: "נזק בטיפול" },
  { value: "corrosion", label: "חלודה/קורוזיה" },
  { value: "overproduction", label: "ייצור עודף" },
  { value: "other", label: "אחר" },
];

const recoveryTypes = [
  { value: "resell_scrap", label: "מכירת גרוטאות" },
  { value: "rework", label: "עיבוד חוזר" },
  { value: "downcycle", label: "שימוש חלופי" },
  { value: "return_supplier", label: "החזרה לספק" },
];

const reasonLabel = (v: string) => scrapReasons.find(r => r.value === v)?.label || v;

export default function ScrapTrackerPage() {
  const [dashboard, setDashboard] = useState<any>({});
  const [entries, setEntries] = useState<any[]>([]);
  const [trends, setTrends] = useState<any[]>([]);
  const [recovery, setRecovery] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"dashboard" | "entries" | "analysis" | "recovery">("dashboard");
  const [showForm, setShowForm] = useState(false);
  const [showRecoveryForm, setShowRecoveryForm] = useState(false);
  const [form, setForm] = useState<any>({});
  const [recoveryForm, setRecoveryForm] = useState<any>({});
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [analysisTab, setAnalysisTab] = useState<"reason" | "material" | "worker" | "project">("reason");
  const [analysisData, setAnalysisData] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [dRes, eRes, tRes, rRes] = await Promise.all([
        authFetch(`${API}/dashboard`),
        authFetch(`${API}/entries`),
        authFetch(`${API}/trends?months=12`),
        authFetch(`${API}/recovery`),
      ]);
      if (dRes.ok) setDashboard(await dRes.json());
      if (eRes.ok) setEntries(safeArr(await eRes.json()));
      if (tRes.ok) setTrends(safeArr(await tRes.json()));
      if (rRes.ok) setRecovery(safeArr(await rRes.json()));
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const loadAnalysis = async (type: string) => {
    setAnalysisTab(type as any);
    try {
      const r = await authFetch(`${API}/by-${type}`);
      if (r.ok) setAnalysisData(safeArr(await r.json()));
    } catch {}
  };

  useEffect(() => { loadAnalysis("reason"); }, []);

  const saveEntry = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/entries/${editing.id}` : `${API}/entries`;
      const method = editing ? "PUT" : "POST";
      await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); setEditing(null); setForm({}); load();
    } catch {}
    setSaving(false);
  };

  const deleteEntry = async (id: number) => {
    await authFetch(`${API}/entries/${id}`, { method: "DELETE" });
    load();
  };

  const saveRecovery = async () => {
    setSaving(true);
    try {
      const url = recoveryForm.id ? `${API}/recovery/${recoveryForm.id}` : `${API}/recovery`;
      const method = recoveryForm.id ? "PUT" : "POST";
      await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(recoveryForm) });
      setShowRecoveryForm(false); setRecoveryForm({}); load();
    } catch {}
    setSaving(false);
  };

  const filtered = useMemo(() => {
    if (!search) return entries;
    const s = search.toLowerCase();
    return entries.filter(e => e.material_name?.toLowerCase().includes(s) || e.worker_name?.toLowerCase().includes(s) || e.station?.toLowerCase().includes(s));
  }, [entries, search]);

  const ds = dashboard.summary || {};

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Recycle className="w-6 h-6 text-orange-400" /> מעקב פסולת וגרוטאות</h1>
          <p className="text-sm text-muted-foreground mt-1">ניטור בזבוז חומרים, ניתוח סיבות ומעקב שחזור</p>
        </div>
        <div className="flex gap-2">
          {(["dashboard", "entries", "analysis", "recovery"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? "bg-orange-600 text-white" : "bg-white/5 hover:bg-white/10 text-gray-400"}`}>
              {t === "dashboard" ? "דשבורד" : t === "entries" ? "רשומות" : t === "analysis" ? "ניתוח" : "שחזור"}
            </button>
          ))}
        </div>
      </div>

      {/* Dashboard */}
      {tab === "dashboard" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: "רשומות (30 יום)", val: ds.total_entries, icon: Recycle, color: "text-orange-400" },
              { label: "סה\"כ פסולת", val: `${fmt(ds.total_scrap_qty)} ק\"ג`, icon: Trash2, color: "text-red-400" },
              { label: "שווי פסולת", val: fmtC(ds.total_scrap_value), icon: DollarSign, color: "text-yellow-400" },
              { label: "שיעור פסולת ממוצע", val: `${fmt(ds.avg_scrap_rate)}%`, icon: Percent, color: "text-cyan-400" },
              { label: "ניתנים לשחזור", val: ds.recoverable_count, icon: Recycle, color: "text-green-400" },
            ].map((c, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="bg-[#111118] border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2"><c.icon className={`w-4 h-4 ${c.color}`} /><span className="text-xs text-muted-foreground">{c.label}</span></div>
                <div className="text-xl font-bold">{c.val ?? "—"}</div>
              </motion.div>
            ))}
          </div>

          {/* Trend Chart */}
          {safeArr(dashboard.monthlyTrend).length > 0 && (
            <div className="bg-[#111118] border border-white/10 rounded-xl p-5">
              <h3 className="text-lg font-bold mb-4">מגמת פסולת חודשית</h3>
              <div className="h-40 flex items-end gap-2">
                {safeArr(dashboard.monthlyTrend).map((m: any, i: number) => {
                  const max = Math.max(...safeArr(dashboard.monthlyTrend).map((x: any) => Number(x.scrap_value) || 1));
                  const pct = max > 0 ? (Number(m.scrap_value) / max) * 100 : 10;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full bg-orange-500/40 rounded-t hover:bg-orange-500/60 transition-colors relative group"
                        style={{ height: `${pct}%`, minHeight: 4 }}>
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 px-2 py-1 rounded text-xs hidden group-hover:block whitespace-nowrap">
                          {fmtC(m.scrap_value)} | {m.avg_rate}%
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{m.month?.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* By Reason */}
          {safeArr(dashboard.byReason).length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#111118] border border-white/10 rounded-xl p-5">
                <h3 className="font-bold mb-3">סיבות פסולת (30 יום)</h3>
                <div className="space-y-2">
                  {safeArr(dashboard.byReason).map((r: any, i: number) => {
                    const max = Math.max(...safeArr(dashboard.byReason).map((x: any) => Number(x.total_value) || 1));
                    return (
                      <div key={i}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{reasonLabel(r.scrap_reason)}</span>
                          <span className="font-bold">{fmtC(r.total_value)}</span>
                        </div>
                        <div className="h-2 bg-white/5 rounded overflow-hidden">
                          <div className="h-full bg-orange-500/60 rounded" style={{ width: `${(Number(r.total_value) / max) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="bg-[#111118] border border-white/10 rounded-xl p-5">
                <h3 className="font-bold mb-3">חומרים מובילים בפסולת</h3>
                <div className="space-y-2">
                  {safeArr(dashboard.byMaterial).map((m: any, i: number) => (
                    <div key={i} className="flex items-center justify-between bg-white/5 rounded-lg p-3">
                      <div>
                        <div className="text-sm font-medium">{m.material_name}</div>
                        <div className="text-xs text-muted-foreground">{m.cnt} רשומות | ממוצע: {m.avg_scrap_pct}%</div>
                      </div>
                      <div className="text-left">
                        <div className="font-bold">{fmtC(m.total_value)}</div>
                        <div className="text-xs text-muted-foreground">{fmt(m.total_qty)} ק"ג</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Entries Tab */}
      {tab === "entries" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input className="w-full bg-[#111118] border border-white/10 rounded-lg pl-3 pr-10 py-2 text-sm"
                placeholder="חיפוש לפי חומר, עובד, תחנה..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button onClick={() => { setForm({ date: new Date().toISOString().slice(0, 10) }); setEditing(null); setShowForm(true); }}
              className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
              <Plus className="w-4 h-4" /> רשומה חדשה
            </button>
          </div>

          <div className="bg-[#111118] border border-white/10 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/10 text-muted-foreground text-xs">
                  <th className="text-right py-3 px-3">תאריך</th>
                  <th className="text-right py-3 px-3">חומר</th>
                  <th className="text-right py-3 px-3">תחנה</th>
                  <th className="text-right py-3 px-3">עובד</th>
                  <th className="text-right py-3 px-3">מתוכנן</th>
                  <th className="text-right py-3 px-3">בפועל</th>
                  <th className="text-right py-3 px-3">פסולת</th>
                  <th className="text-right py-3 px-3">%</th>
                  <th className="text-right py-3 px-3">סיבה</th>
                  <th className="text-right py-3 px-3">שווי</th>
                  <th className="text-right py-3 px-3">שחזור</th>
                  <th className="py-3 px-3"></th>
                </tr></thead>
                <tbody>{loading ? <tr><td colSpan={12} className="text-center py-8 text-muted-foreground">טוען...</td></tr> :
                  filtered.length === 0 ? <tr><td colSpan={12} className="text-center py-8 text-muted-foreground">אין רשומות</td></tr> :
                  filtered.map(e => (
                    <tr key={e.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2 px-3">{e.date ? new Date(e.date).toLocaleDateString("he-IL") : "—"}</td>
                      <td className="py-2 px-3 font-medium">{e.material_name || "—"}</td>
                      <td className="py-2 px-3">{e.station || "—"}</td>
                      <td className="py-2 px-3">{e.worker_name || "—"}</td>
                      <td className="py-2 px-3">{fmt(e.planned_qty)}</td>
                      <td className="py-2 px-3">{fmt(e.actual_qty)}</td>
                      <td className="py-2 px-3 font-bold text-red-400">{fmt(e.scrap_qty)}</td>
                      <td className="py-2 px-3">
                        <Badge className={Number(e.scrap_pct) > 10 ? "bg-red-500/20 text-red-400" : Number(e.scrap_pct) > 5 ? "bg-yellow-500/20 text-yellow-400" : "bg-green-500/20 text-green-400"}>
                          {fmt(e.scrap_pct)}%
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-xs">{reasonLabel(e.scrap_reason)}</td>
                      <td className="py-2 px-3">{fmtC(e.scrap_value)}</td>
                      <td className="py-2 px-3">{e.recoverable ? <Badge className="bg-green-500/20 text-green-400">כן</Badge> : <span className="text-muted-foreground">לא</span>}</td>
                      <td className="py-2 px-3">
                        <div className="flex gap-1">
                          <button onClick={() => { setEditing(e); setForm(e); setShowForm(true); }} className="p-1 hover:bg-white/10 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteEntry(e.id)} className="p-1 hover:bg-red-500/20 rounded text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                          {e.recoverable && <button onClick={() => { setRecoveryForm({ scrap_entry_id: e.id }); setShowRecoveryForm(true); }} className="p-1 hover:bg-green-500/20 rounded text-green-400"><Recycle className="w-3.5 h-3.5" /></button>}
                        </div>
                      </td>
                    </tr>
                  ))
                }</tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Analysis Tab */}
      {tab === "analysis" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {([
              { key: "reason", label: "לפי סיבה", icon: AlertTriangle },
              { key: "material", label: "לפי חומר", icon: Factory },
              { key: "worker", label: "לפי עובד", icon: Users },
              { key: "project", label: "לפי פרויקט", icon: Wrench },
            ] as const).map(t => (
              <button key={t.key} onClick={() => loadAnalysis(t.key)}
                className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-all ${analysisTab === t.key ? "bg-orange-600/20 text-orange-300 border border-orange-500/30" : "bg-white/5 hover:bg-white/10 text-gray-400"}`}>
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </div>

          <div className="bg-[#111118] border border-white/10 rounded-xl p-5">
            {analysisData.length === 0 ? <div className="text-center py-12 text-muted-foreground">אין נתונים</div> : (
              <div className="space-y-3">
                {analysisData.map((item: any, i: number) => {
                  const max = Math.max(...analysisData.map((x: any) => Number(x.total_value) || 1));
                  const label = item.scrap_reason ? reasonLabel(item.scrap_reason) :
                    item.material_name || item.worker_name || `פרויקט #${item.project_id}`;
                  return (
                    <div key={i} className="bg-white/5 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <div>
                          <span className="font-medium">{label}</span>
                          <span className="text-xs text-muted-foreground mr-2">{item.entries} רשומות</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-left">
                            <div className="text-xs text-muted-foreground">פסולת</div>
                            <div className="font-bold">{fmt(item.total_scrap)} ק"ג</div>
                          </div>
                          <div className="text-left">
                            <div className="text-xs text-muted-foreground">שווי</div>
                            <div className="font-bold text-red-400">{fmtC(item.total_value)}</div>
                          </div>
                          <Badge className={Number(item.avg_scrap_rate) > 10 ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}>
                            {item.avg_scrap_rate}%
                          </Badge>
                        </div>
                      </div>
                      <div className="h-2 bg-white/5 rounded overflow-hidden">
                        <div className="h-full bg-orange-500/50 rounded transition-all" style={{ width: `${(Number(item.total_value) / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Trend lines */}
          {trends.length > 0 && (
            <div className="bg-[#111118] border border-white/10 rounded-xl p-5">
              <h3 className="font-bold mb-4">מגמת שיעור פסולת (12 חודשים)</h3>
              <div className="h-32 flex items-end gap-2">
                {trends.map((t: any, i: number) => {
                  const maxRate = Math.max(...trends.map((x: any) => Number(x.avg_rate) || 1));
                  const pct = maxRate > 0 ? (Number(t.avg_rate) / maxRate) * 100 : 10;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className={`w-full rounded-t transition-colors ${Number(t.avg_rate) > 10 ? "bg-red-500/50 hover:bg-red-500/70" : Number(t.avg_rate) > 5 ? "bg-yellow-500/50 hover:bg-yellow-500/70" : "bg-green-500/50 hover:bg-green-500/70"}`}
                        style={{ height: `${pct}%`, minHeight: 4 }} title={`${t.month}: ${t.avg_rate}%`} />
                      <span className="text-[10px] text-muted-foreground">{t.month?.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recovery Tab */}
      {tab === "recovery" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-lg">מעקב שחזור חומרים</h3>
            <button onClick={() => { setRecoveryForm({}); setShowRecoveryForm(true); }}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
              <Plus className="w-4 h-4" /> שחזור חדש
            </button>
          </div>

          <div className="bg-[#111118] border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-white/10 text-muted-foreground text-xs">
                <th className="text-right py-3 px-3">תאריך</th>
                <th className="text-right py-3 px-3">חומר</th>
                <th className="text-right py-3 px-3">סוג שחזור</th>
                <th className="text-right py-3 px-3">כמות</th>
                <th className="text-right py-3 px-3">הכנסה</th>
              </tr></thead>
              <tbody>{recovery.length === 0 ? <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">אין רשומות שחזור</td></tr> :
                recovery.map(r => (
                  <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 px-3">{r.date ? new Date(r.date).toLocaleDateString("he-IL") : "—"}</td>
                    <td className="py-2 px-3 font-medium">{r.material_name || "—"}</td>
                    <td className="py-2 px-3">{recoveryTypes.find(t => t.value === r.recovery_type)?.label || r.recovery_type}</td>
                    <td className="py-2 px-3">{fmt(r.recovered_amount)} ק"ג</td>
                    <td className="py-2 px-3 text-green-400 font-bold">{fmtC(r.revenue)}</td>
                  </tr>
                ))
              }</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Entry Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-[#181820] border border-white/10 rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-4">{editing ? "עריכת רשומה" : "רשומת פסולת חדשה"}</h2>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-muted-foreground mb-1 block">תאריך</label>
                  <input type="date" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={form.date?.slice(0, 10) ?? ""} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">שם חומר</label>
                  <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={form.material_name ?? ""} onChange={e => setForm({ ...form, material_name: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">תחנה</label>
                  <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={form.station ?? ""} onChange={e => setForm({ ...form, station: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">שם עובד</label>
                  <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={form.worker_name ?? ""} onChange={e => setForm({ ...form, worker_name: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">כמות מתוכננת</label>
                  <input type="number" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={form.planned_qty ?? ""} onChange={e => setForm({ ...form, planned_qty: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">כמות בפועל</label>
                  <input type="number" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={form.actual_qty ?? ""} onChange={e => setForm({ ...form, actual_qty: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">כמות פסולת</label>
                  <input type="number" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={form.scrap_qty ?? ""} onChange={e => setForm({ ...form, scrap_qty: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">שווי פסולת</label>
                  <input type="number" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={form.scrap_value ?? ""} onChange={e => setForm({ ...form, scrap_value: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">סיבה</label>
                  <select className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={form.scrap_reason ?? ""} onChange={e => setForm({ ...form, scrap_reason: e.target.value })}>
                    <option value="">בחר סיבה</option>
                    {scrapReasons.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select></div>
                <div className="flex items-center gap-2 mt-6">
                  <input type="checkbox" checked={form.recoverable || false}
                    onChange={e => setForm({ ...form, recoverable: e.target.checked })} />
                  <label className="text-sm">ניתן לשחזור</label>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-400">ביטול</button>
                <button onClick={saveEntry} disabled={saving}
                  className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg text-sm disabled:opacity-50">
                  {saving ? "שומר..." : editing ? "עדכן" : "צור"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recovery Form Modal */}
      <AnimatePresence>
        {showRecoveryForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowRecoveryForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-[#181820] border border-white/10 rounded-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-4">רשומת שחזור חדשה</h2>
              <div className="grid grid-cols-2 gap-4">
                {recoveryForm.scrap_entry_id && (
                  <div className="col-span-2 text-xs text-muted-foreground">מקושר לרשומת פסולת #{recoveryForm.scrap_entry_id}</div>
                )}
                {!recoveryForm.scrap_entry_id && (
                  <div><label className="text-xs text-muted-foreground mb-1 block">מזהה רשומת פסולת</label>
                    <input type="number" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                      value={recoveryForm.scrap_entry_id ?? ""} onChange={e => setRecoveryForm({ ...recoveryForm, scrap_entry_id: e.target.value })} /></div>
                )}
                <div><label className="text-xs text-muted-foreground mb-1 block">סוג שחזור</label>
                  <select className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={recoveryForm.recovery_type ?? ""} onChange={e => setRecoveryForm({ ...recoveryForm, recovery_type: e.target.value })}>
                    <option value="">בחר סוג</option>
                    {recoveryTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">כמות (ק"ג)</label>
                  <input type="number" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={recoveryForm.recovered_amount ?? ""} onChange={e => setRecoveryForm({ ...recoveryForm, recovered_amount: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">הכנסה</label>
                  <input type="number" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={recoveryForm.revenue ?? ""} onChange={e => setRecoveryForm({ ...recoveryForm, revenue: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">תאריך</label>
                  <input type="date" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={recoveryForm.date ?? ""} onChange={e => setRecoveryForm({ ...recoveryForm, date: e.target.value })} /></div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowRecoveryForm(false)} className="px-4 py-2 text-sm text-gray-400">ביטול</button>
                <button onClick={saveRecovery} disabled={saving}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg text-sm disabled:opacity-50">
                  {saving ? "שומר..." : "שמור"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
