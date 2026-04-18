import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Search, Wrench, Plus, Edit2, X, Download, RefreshCw, Eye, AlertTriangle,
  CheckCircle, Clock, Settings, Gauge, ChevronsUpDown, Calendar, Shield,
  Activity, Hammer, TrendingUp, TrendingDown, Bell, Loader2, Trash2, Save, Copy
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";

const API = "/api/production-sap";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const conditionMap: Record<string, { label: string; color: string }> = {
  new: { label: "חדש", color: "bg-green-500/20 text-green-400" },
  good: { label: "תקין", color: "bg-blue-500/20 text-blue-400" },
  fair: { label: "סביר", color: "bg-yellow-500/20 text-yellow-400" },
  worn: { label: "שחוק", color: "bg-orange-500/20 text-orange-400" },
  broken: { label: "שבור", color: "bg-red-500/20 text-red-400" },
};

const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  in_use: { label: "בשימוש", color: "bg-blue-500/20 text-blue-400" },
  maintenance: { label: "בתחזוקה", color: "bg-yellow-500/20 text-yellow-400" },
  calibration: { label: "בכיול", color: "bg-cyan-500/20 text-cyan-400" },
  retired: { label: "הושבת", color: "bg-gray-500/20 text-gray-400" },
  missing: { label: "חסר", color: "bg-red-500/20 text-red-400" },
};

const typeOptions = ["חיתוך", "קידוח", "ריתוך", "מדידה", "הרכבה", "ציפוי", "כיפוף", "ליטוש", "אחר"];

export default function ToolManagementPage() {
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCondition, setFilterCondition] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("tool_number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [showAlerts, setShowAlerts] = useState(false);
  const perPage = 25;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [iRes, sRes, aRes] = await Promise.all([
        authFetch(`${API}/tools`),
        authFetch(`${API}/tools/stats`),
        authFetch(`${API}/tools/alerts`),
      ]);
      if (iRes.ok) setItems(safeArray(await iRes.json()));
      if (sRes.ok) setStats((await sRes.json()) || {});
      if (aRes.ok) setAlerts(safeArray(await aRes.json()));
    } catch (e: any) {
      setError(e.message || "שגיאה בטעינת נתונים");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(r =>
      (filterCondition === "all" || r.condition === filterCondition) &&
      (filterStatus === "all" || r.status === filterStatus) &&
      (!search || [r.tool_number, r.name, r.type, r.location, r.machine_assigned]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [items, search, filterCondition, filterStatus, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((page - 1) * perPage, page * perPage);
  const activeFilters = [filterCondition !== "all", filterStatus !== "all"].filter(Boolean).length;
  const SI = () => <ChevronsUpDown className="h-3 w-3 opacity-40" />;

  const openCreate = () => {
    setEditing(null);
    setForm({ condition: "new", status: "active", usage_hours: 0, max_hours: 0 });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      tool_number: r.tool_number, name: r.name, type: r.type, condition: r.condition,
      location: r.location, machine_assigned: r.machine_assigned, usage_hours: r.usage_hours,
      max_hours: r.max_hours, next_maintenance: r.next_maintenance, calibration_due: r.calibration_due,
      status: r.status, notes: r.notes,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name || !form.tool_number) { setError("שם וקוד כלי חובה"); return; }
    setSaving(true);
    try {
      const url = editing ? `${API}/tools/${editing.id}` : `${API}/tools`;
      const method = editing ? "PUT" : "POST";
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "שגיאה בשמירה"); }
      setShowForm(false);
      load();
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("האם למחוק כלי זה?")) return;
    try {
      await authFetch(`${API}/tools/${id}`, { method: "DELETE" });
      load();
    } catch (e: any) { setError(e.message); }
  };

  const usagePercent = (r: any) => {
    if (!r.max_hours || r.max_hours <= 0) return 0;
    return Math.min(100, Math.round((r.usage_hours / r.max_hours) * 100));
  };

  const isOverdue = (dateStr: string) => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  };

  const kpis = [
    { label: "סה\"כ כלים", value: fmt(stats.total_tools || items.length), color: "text-blue-400", icon: Wrench },
    { label: "פעילים", value: fmt(stats.active_tools || 0), color: "text-green-400", icon: CheckCircle },
    { label: "דרושה תחזוקה", value: fmt(stats.maintenance_needed || 0), color: "text-yellow-400", icon: Settings },
    { label: "כיול נדרש", value: fmt(stats.calibration_due || 0), color: "text-orange-400", icon: Gauge },
  ];

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Hammer className="h-6 w-6 text-amber-400" />
            ניהול כלים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב כלים, תחזוקה וכיול</p>
        </div>
        <div className="flex gap-2">
          {alerts.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAlerts(!showAlerts)}
              className="border-orange-500/30 text-orange-400 gap-1 relative"
            >
              <Bell className="h-4 w-4" />
              התראות
              <span className="absolute -top-1 -left-1 bg-red-500 text-foreground text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                {alerts.length}
              </span>
            </Button>
          )}
          <Button variant="outline" size="sm" className="border-border text-gray-300 gap-1">
            <Download className="h-4 w-4" />ייצוא
          </Button>
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 gap-2">
            <Plus className="h-4 w-4" />כלי חדש
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />{error}
          <Button variant="ghost" size="sm" onClick={() => setError(null)} className="mr-auto text-red-400"><X className="h-3 w-3" /></Button>
        </div>
      )}

      {/* Alerts Banner */}
      {showAlerts && alerts.length > 0 && (
        <Card className="bg-orange-500/5 border-orange-500/30">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-orange-400 flex items-center gap-2"><Bell className="h-4 w-4" />התראות כלים</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowAlerts(false)}><X className="h-3 w-3" /></Button>
            </div>
            {alerts.slice(0, 10).map((a: any, i: number) => (
              <div key={i} className="flex items-center gap-3 text-sm bg-background/50 rounded-lg p-2">
                <AlertTriangle className={`h-4 w-4 shrink-0 ${a.severity === "critical" ? "text-red-400" : "text-orange-400"}`} />
                <span className="text-gray-300 flex-1">{a.message || `${a.tool_name}: ${a.alert_type}`}</span>
                <span className="text-xs text-muted-foreground">{a.date || ""}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card/80 border-border hover:border-border transition-colors">
            <CardContent className="p-4">
              {loading ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-3 w-16 bg-muted rounded" />
                  <div className="h-6 w-20 bg-muted rounded" />
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{k.label}</p>
                    <p className={`text-lg font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
                  </div>
                  <k.icon className={`h-5 w-5 ${k.color} opacity-50`} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="bg-card/60 border-border">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="חיפוש כלי, קוד, מיקום..."
                className="pr-9 bg-input border-border text-foreground"
              />
            </div>
            <select
              value={filterCondition}
              onChange={e => { setFilterCondition(e.target.value); setPage(1); }}
              className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"
            >
              <option value="all">כל המצבים</option>
              {Object.entries(conditionMap).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
              className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"
            >
              <option value="all">כל הסטטוסים</option>
              {Object.entries(statusMap).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            {activeFilters > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setFilterCondition("all"); setFilterStatus("all"); setSearch(""); }}
                className="text-red-400 hover:text-red-300 gap-1"
              >
                <X className="h-3 w-3" />נקה ({activeFilters})
              </Button>
            )}
            <span className="text-xs text-muted-foreground mr-auto">{filtered.length} כלים</span>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-card/80 border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("tool_number")}>מספר כלי<SI /></button></th>
                  <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("name")}>שם<SI /></button></th>
                  <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("type")}>סוג<SI /></button></th>
                  <th className="p-3 text-right text-muted-foreground font-medium">מצב</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">מיקום</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">מכונה</th>
                  <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("usage_hours")}>שעות שימוש<SI /></button></th>
                  <th className="p-3 text-right text-muted-foreground font-medium">תחזוקה הבאה</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">כיול נדרש</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">סטטוס</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {Array.from({ length: 11 }).map((_, j) => (
                        <td key={j} className="p-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : paged.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-muted-foreground">
                      <Wrench className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p>אין כלים להצגה</p>
                    </td>
                  </tr>
                ) : paged.map((r: any, i: number) => {
                  const cond = conditionMap[r.condition] || { label: r.condition, color: "bg-gray-500/20 text-gray-400" };
                  const st = statusMap[r.status] || { label: r.status, color: "bg-gray-500/20 text-gray-400" };
                  const usage = usagePercent(r);
                  const maintOverdue = isOverdue(r.next_maintenance);
                  const calibOverdue = isOverdue(r.calibration_due);
                  return (
                    <tr key={r.id || i} className="border-b border-border/50 hover:bg-card/40 transition-colors">
                      <td className="p-3 font-mono text-foreground font-medium">{r.tool_number || "—"}</td>
                      <td className="p-3 text-foreground">{r.name || "—"}</td>
                      <td className="p-3 text-gray-300">{r.type || "—"}</td>
                      <td className="p-3"><Badge className={cond.color}>{cond.label}</Badge></td>
                      <td className="p-3 text-gray-300">{r.location || "—"}</td>
                      <td className="p-3 text-gray-300">{r.machine_assigned || "—"}</td>
                      <td className="p-3">
                        <div className="space-y-1">
                          <span className="font-mono text-gray-300">{fmt(r.usage_hours)}/{fmt(r.max_hours)}</span>
                          <div className="w-full h-1.5 bg-input rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                usage >= 90 ? "bg-red-500" : usage >= 70 ? "bg-yellow-500" : "bg-green-500"
                              }`}
                              style={{ width: `${usage}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={maintOverdue ? "text-red-400 font-bold" : "text-gray-300"}>
                          {r.next_maintenance || "—"}
                        </span>
                        {maintOverdue && <span className="text-[10px] text-red-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />באיחור</span>}
                      </td>
                      <td className="p-3">
                        <span className={calibOverdue ? "text-red-400 font-bold" : "text-gray-300"}>
                          {r.calibration_due || "—"}
                        </span>
                        {calibOverdue && <span className="text-[10px] text-red-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />באיחור</span>}
                      </td>
                      <td className="p-3"><Badge className={st.color}>{st.label}</Badge></td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setViewDetail(r)} className="text-gray-400 hover:text-foreground"><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(r)} className="text-gray-400 hover:text-blue-400"><Edit2 className="h-4 w-4" /></Button>
                    <Button title="שכפול" variant="ghost" size="sm" className="p-1 hover:bg-muted rounded text-muted-foreground" onClick={async () => { const res = await duplicateRecord(`${API}/tools`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }}><Copy className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)} className="text-gray-400 hover:text-red-400"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                מציג {(page - 1) * perPage + 1}-{Math.min(page * perPage, filtered.length)} מתוך {filtered.length}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="border-border text-gray-300">הקודם</Button>
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="border-border text-gray-300">הבא</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת כלי" : "כלי חדש"}</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}><X className="h-4 w-4" /></Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-300">מספר כלי *</Label>
                <Input value={form.tool_number || ""} onChange={e => setForm({ ...form, tool_number: e.target.value })} className="bg-input border-border text-foreground mt-1" />
              </div>
              <div>
                <Label className="text-gray-300">שם כלי *</Label>
                <Input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-input border-border text-foreground mt-1" />
              </div>
              <div>
                <Label className="text-gray-300">סוג</Label>
                <select value={form.type || ""} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  <option value="">בחר סוג</option>
                  {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-gray-300">מצב</Label>
                <select value={form.condition || "new"} onChange={e => setForm({ ...form, condition: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  {Object.entries(conditionMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-gray-300">מיקום</Label>
                <Input value={form.location || ""} onChange={e => setForm({ ...form, location: e.target.value })} className="bg-input border-border text-foreground mt-1" />
              </div>
              <div>
                <Label className="text-gray-300">מכונה משויכת</Label>
                <Input value={form.machine_assigned || ""} onChange={e => setForm({ ...form, machine_assigned: e.target.value })} className="bg-input border-border text-foreground mt-1" />
              </div>
              <div>
                <Label className="text-gray-300">שעות שימוש</Label>
                <Input type="number" value={form.usage_hours || 0} onChange={e => setForm({ ...form, usage_hours: Number(e.target.value) })} className="bg-input border-border text-foreground mt-1" />
              </div>
              <div>
                <Label className="text-gray-300">שעות מקסימום</Label>
                <Input type="number" value={form.max_hours || 0} onChange={e => setForm({ ...form, max_hours: Number(e.target.value) })} className="bg-input border-border text-foreground mt-1" />
              </div>
              <div>
                <Label className="text-gray-300">תחזוקה הבאה</Label>
                <Input type="date" value={form.next_maintenance || ""} onChange={e => setForm({ ...form, next_maintenance: e.target.value })} className="bg-input border-border text-foreground mt-1" />
              </div>
              <div>
                <Label className="text-gray-300">כיול נדרש</Label>
                <Input type="date" value={form.calibration_due || ""} onChange={e => setForm({ ...form, calibration_due: e.target.value })} className="bg-input border-border text-foreground mt-1" />
              </div>
              <div>
                <Label className="text-gray-300">סטטוס</Label>
                <select value={form.status || "active"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <Label className="text-gray-300">הערות</Label>
                <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)} className="border-border text-gray-300">ביטול</Button>
              <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700 gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editing ? "עדכן" : "צור"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {viewDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setViewDetail(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6 space-y-4" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Wrench className="h-5 w-5 text-amber-400" />
                {viewDetail.name} ({viewDetail.tool_number})
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setViewDetail(null)}><X className="h-4 w-4" /></Button>
            </div>

            {/* Usage bar */}
            <div className="bg-input rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">שימוש</span>
                <span className="text-sm font-mono text-foreground">{fmt(viewDetail.usage_hours)} / {fmt(viewDetail.max_hours)} שעות</span>
              </div>
              <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    usagePercent(viewDetail) >= 90 ? "bg-red-500" : usagePercent(viewDetail) >= 70 ? "bg-yellow-500" : "bg-green-500"
                  }`}
                  style={{ width: `${usagePercent(viewDetail)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1 text-left">{usagePercent(viewDetail)}%</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "סוג", value: viewDetail.type },
                { label: "מצב", value: conditionMap[viewDetail.condition]?.label || viewDetail.condition },
                { label: "סטטוס", value: statusMap[viewDetail.status]?.label || viewDetail.status },
                { label: "מיקום", value: viewDetail.location },
                { label: "מכונה משויכת", value: viewDetail.machine_assigned },
                { label: "תחזוקה הבאה", value: viewDetail.next_maintenance },
                { label: "כיול נדרש", value: viewDetail.calibration_due },
                { label: "עדכון אחרון", value: viewDetail.updated_at },
              ].map((f, i) => (
                <div key={i}>
                  <p className="text-xs text-muted-foreground">{f.label}</p>
                  <p className="text-sm text-foreground mt-1">{f.value || "—"}</p>
                </div>
              ))}
            </div>
            {viewDetail.notes && (
              <div>
                <p className="text-xs text-muted-foreground">הערות</p>
                <p className="text-sm text-gray-300 mt-1">{viewDetail.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
