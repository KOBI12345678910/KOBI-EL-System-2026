import { LoadingOverlay } from "@/components/ui/unified-states";
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import {
  Wind, Plus, Search, Edit2, Eye, X, Save, AlertCircle,
  ArrowUpDown, RefreshCw, TrendingUp, TrendingDown
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);

const EMISSION_TYPES = ["CO2", "NOx", "SOx", "PM10", "PM2.5", "VOC", "CO", "אחר"];
const SOURCES = ["ייצור", "מחולל חשמל", "בוילר", "רכבים", "תהליך כימי", "אחר"];
const STATUS_LIST = ["תקין", "אזהרה", "חריגה", "ממתין לאישור"];
const UNITS = ["ק\"ג/יום", "טון/שנה", "מ\"ג/מ\"ק", "g/km", "אחר"];

const SC: Record<string, string> = {
  "תקין": "bg-green-500/20 text-green-300",
  "אזהרה": "bg-yellow-500/20 text-yellow-300",
  "חריגה": "bg-red-500/20 text-red-300",
  "ממתין לאישור": "bg-blue-500/20 text-blue-300",
};

interface EmissionLog {
  id: number;
  emission_type: string;
  source: string;
  measurement_value: number;
  threshold_value: number;
  unit: string;
  measurement_date: string;
  measured_by: string;
  status: string;
  notes: string;
  report_number: string;
  created_at: string;
}

const EMPTY_FORM = {
  emission_type: "CO2", source: "ייצור", measurement_value: "", threshold_value: "",
  unit: "ק\"ג/יום", measurement_date: new Date().toISOString().slice(0,10),
  measured_by: "", status: "תקין", notes: "", report_number: ""
};

export default function EnergyManagement() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<EmissionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("measurement_date");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EmissionLog | null>(null);
  const [viewDetail, setViewDetail] = useState<EmissionLog | null>(null);
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await authFetch(`${API}/hse-emissions-log?limit=500`);
      if (r.ok) setItems(safeArray(await r.json()));
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let data = items.filter(r =>
      (filterStatus === "all" || r.status === filterStatus) &&
      (filterType === "all" || r.emission_type === filterType) &&
      (!search || [r.emission_type, r.source, r.measured_by, r.report_number].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? c : -c;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterType, sortField, sortDir]);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setShowForm(true); };
  const openEdit = (r: EmissionLog) => {
    setEditing(r);
    setForm({ emission_type: r.emission_type, source: r.source, measurement_value: r.measurement_value, threshold_value: r.threshold_value, unit: r.unit, measurement_date: r.measurement_date?.slice(0,10), measured_by: r.measured_by, status: r.status, notes: r.notes, report_number: r.report_number });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/hse-emissions-log/${editing.id}` : `${API}/hse-emissions-log`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const stats = useMemo(() => ({
    total: items.length,
    overThreshold: items.filter(r => r.status === "חריגה").length,
    warning: items.filter(r => r.status === "אזהרה").length,
    compliant: items.filter(r => r.status === "תקין").length,
  }), [items]);

  const getPctBadge = (val: number, threshold: number) => {
    if (!threshold) return null;
    const pct = (val / threshold) * 100;
    const color = pct >= 100 ? "text-red-400" : pct >= 80 ? "text-yellow-400" : "text-green-400";
    const Icon = pct >= 100 ? TrendingUp : TrendingDown;
    return <span className={`text-xs font-medium ${color} flex items-center gap-0.5`}><Icon className="w-3 h-3" />{pct.toFixed(0)}%</span>;
  };

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2"><Wind className="w-6 h-6 text-teal-400" />ניטור פליטות וסביבה</h1>
          <p className="text-sm text-muted-foreground mt-1">יומן מדידות פליטות מול סף רגולטורי — דיווח למשרד הסביבה</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={load} className="flex items-center gap-1 px-3 py-2 bg-card border border-border rounded-lg text-sm hover:bg-muted"><RefreshCw className="w-3.5 h-3.5" /></button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-teal-600 text-foreground px-4 py-2 rounded-xl hover:bg-teal-700 text-sm font-medium"><Plus className="w-4 h-4" />הוסף מדידה</button>
        </div>
      </div>

      {stats.overThreshold > 0 && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium">{stats.overThreshold} מדידות עם חריגה מהסף הרגולטורי — נדרש טיפול דחוף!</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{stats.total}</p><p className="text-xs text-muted-foreground mt-1">סה"כ מדידות</p></CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-green-400">{stats.compliant}</p><p className="text-xs text-muted-foreground mt-1">תקין</p></CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-yellow-400">{stats.warning}</p><p className="text-xs text-muted-foreground mt-1">אזהרה</p></CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-red-400">{stats.overThreshold}</p><p className="text-xs text-muted-foreground mt-1">חריגות</p></CardContent></Card>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי סוג, מקור, מודד..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל סוגי הפליטה</option>
          {EMISSION_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} מדידות</span>
      </div>

      {loading ? (
        <LoadingOverlay className="min-h-[100px]" />
      ) : error ? (
        <div className="text-center py-12 text-red-400"><AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>{error}</p></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Wind className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין מדידות פליטות</p></div>
      ) : (
        <>
          <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
              {[["emission_type","סוג פליטה"],["source","מקור"],["measurement_value","ערך מדוד"],["threshold_value","סף מותר"],["unit","יחידה"],["measurement_date","תאריך מדידה"],["measured_by","מודד"],["status","סטטוס"]].map(([f,l]) => (
                <th key={f} onClick={() => toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                  <div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div>
                </th>
              ))}
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">% מהסף</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">פעולות</th>
            </tr></thead><tbody>
              {pagination.paginate(filtered).map(r => (
                <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-bold text-teal-400">{r.emission_type}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.source}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{r.measurement_value}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.threshold_value || "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{r.unit}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{r.measurement_date?.slice(0,10)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.measured_by || "—"}</td>
                  <td className="px-4 py-3"><Badge className={`text-[10px] ${SC[r.status] || ""}`}>{r.status}</Badge></td>
                  <td className="px-4 py-3">{getPctBadge(r.measurement_value, r.threshold_value)}</td>
                  <td className="px-4 py-3"><div className="flex gap-1">
                    <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                    <button onClick={async () => { if (await globalConfirm("למחוק מדידה?")) { await authFetch(`${API}/hse-emissions-log/${r.id}`, { method: "DELETE" }); load(); } }} className="p-1.5 hover:bg-muted rounded-lg"><AlertCircle className="w-3.5 h-3.5 text-red-400" /></button>
                  </div></td>
                </tr>
              ))}
            </tbody></table>
          </div></div>
          <SmartPagination pagination={pagination} />
        </>
      )}

      {viewDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">פרטי מדידת פליטה</h2><button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5 grid grid-cols-2 gap-4 text-sm">
              {[["סוג פליטה", viewDetail.emission_type], ["מקור", viewDetail.source], ["ערך מדוד", `${viewDetail.measurement_value} ${viewDetail.unit}`], ["סף מותר", `${viewDetail.threshold_value || "—"} ${viewDetail.unit}`], ["תאריך מדידה", viewDetail.measurement_date?.slice(0,10)], ["מודד", viewDetail.measured_by], ["מספר דוח", viewDetail.report_number], ["סטטוס", viewDetail.status]].map(([l,v]) => (
                <div key={l}><p className="text-xs text-muted-foreground mb-0.5">{l}</p><p className="font-medium text-foreground">{v || "—"}</p></div>
              ))}
              <div className="col-span-2"><p className="text-xs text-muted-foreground mb-0.5">הערות</p><p className="text-foreground">{viewDetail.notes || "—"}</p></div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" />עריכה</button>
              <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת מדידה" : "הוספת מדידת פליטה"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <div><label className="block text-xs text-muted-foreground mb-1.5">סוג פליטה *</label><select value={form.emission_type} onChange={e => setForm({...form, emission_type: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{EMISSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">מקור</label><select value={form.source} onChange={e => setForm({...form, source: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{SOURCES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">ערך מדוד *</label><input type="number" step="0.001" value={form.measurement_value} onChange={e => setForm({...form, measurement_value: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">סף מותר</label><input type="number" step="0.001" value={form.threshold_value} onChange={e => setForm({...form, threshold_value: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">יחידה</label><select value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">תאריך מדידה</label><input type="date" value={form.measurement_date} onChange={e => setForm({...form, measurement_date: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">מודד</label><input value={form.measured_by} onChange={e => setForm({...form, measured_by: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">מספר דוח</label><input value={form.report_number} onChange={e => setForm({...form, report_number: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">סטטוס</label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              <div className="col-span-2"><label className="block text-xs text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-foreground rounded-lg text-sm hover:bg-teal-700">
                {saving ? "שומר..." : <><Save className="w-3.5 h-3.5" />שמור</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
