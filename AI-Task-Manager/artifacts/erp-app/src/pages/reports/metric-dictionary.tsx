import { useState, useMemo, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, X, Save, Edit2, Trash2, Loader2, AlertCircle, BarChart3, CheckCircle2, XCircle, TrendingUp, Clock, Eye, BookOpen, Camera } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-yellow-500/20 text-yellow-300" },
  approved: { label: "מאושר", color: "bg-green-500/20 text-green-300" },
  deprecated: { label: "מבוטל", color: "bg-red-500/20 text-red-300" },
};

export default function MetricDictionaryPage() {
  const [data, setData] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [showSnapshots, setShowSnapshots] = useState<any>(null);
  const [snapshotForm, setSnapshotForm] = useState({ value: "", snapshot_date: "", context: "" });
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const perPage = 20;

  const load = useCallback(async () => {
    try {
      setError(null);
      const [metricsRes, dashRes] = await Promise.all([
        authFetch("/api/metrics"),
        authFetch("/api/metrics/dashboard")
      ]);
      if (metricsRes.ok) { const j = await metricsRes.json(); setData(j.data || []); }
      if (dashRes.ok) { const j = await dashRes.json(); setDashboard(j); }
    } catch (e: any) { setError(e.message); }
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() => {
    const cats = new Set(data.map(d => d.category).filter(Boolean));
    return Array.from(cats);
  }, [data]);

  const filtered = useMemo(() => {
    let d = [...data];
    if (search) { const s = search.toLowerCase(); d = d.filter(r => r.metric_key?.toLowerCase().includes(s) || r.name?.toLowerCase().includes(s) || r.description?.toLowerCase().includes(s) || r.category?.toLowerCase().includes(s)); }
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    if (categoryFilter !== "all") d = d.filter(r => r.category === categoryFilter);
    return d;
  }, [data, search, statusFilter, categoryFilter]);

  const tp = Math.ceil(filtered.length / perPage);
  const pd = filtered.slice((page - 1) * perPage, page * perPage);

  const handleSave = async () => {
    setSaving(true);
    try {
      const method = editId ? "PUT" : "POST";
      const url = editId ? `/api/metrics/${editId}` : "/api/metrics";
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "שגיאה בשמירה"); }
      setShowCreate(false); setEditId(null); setForm({});
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id: any) => {
    try {
      await authFetch(`/api/metrics/${id}`, { method: "DELETE" });
      setDeleteConfirm(null);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const handleApprove = async (id: any) => {
    try {
      await authFetch(`/api/metrics/${id}/approve`, { method: "POST" });
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const handleDeprecate = async (id: any) => {
    try {
      await authFetch(`/api/metrics/${id}/deprecate`, { method: "POST" });
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const loadSnapshots = async (metric: any) => {
    try {
      const res = await authFetch(`/api/metrics/snapshots/${metric.id}`);
      if (res.ok) { const j = await res.json(); setSnapshots(j.data || []); }
      setShowSnapshots(metric);
    } catch (e: any) { setError(e.message); }
  };

  const handleSnapshot = async () => {
    if (!showSnapshots) return;
    setSnapshotSaving(true);
    try {
      const res = await authFetch(`/api/metrics/${showSnapshots.id}/snapshot`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: parseFloat(snapshotForm.value), snapshot_date: snapshotForm.snapshot_date || undefined, context: snapshotForm.context ? JSON.parse(snapshotForm.context) : undefined })
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "שגיאה"); }
      setSnapshotForm({ value: "", snapshot_date: "", context: "" });
      await loadSnapshots(showSnapshots);
    } catch (e: any) { setError(e.message); }
    setSnapshotSaving(false);
  };

  const openEdit = (r: any) => {
    setForm({ metric_key: r.metric_key, name: r.name, category: r.category, description: r.description, formula: r.formula, source_tables: r.source_tables, refresh_frequency: r.refresh_frequency, owner: r.owner });
    setEditId(r.id);
    setShowCreate(true);
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>;

  return (
    <div dir="rtl" className="p-6 space-y-6 bg-[#0a0a1a] min-h-screen text-white">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="h-6 w-6 text-purple-400" />מילון מדדים (KPI)</h1>
          <p className="text-gray-400 text-sm mt-1">הגדרה, אישור ומעקב אחר מדדים עסקיים</p>
        </div>
        <Button onClick={() => { setForm({}); setEditId(null); setShowCreate(true); }} className="bg-purple-600 hover:bg-purple-700">
          <Plus className="h-4 w-4 ml-2" />מדד חדש
        </Button>
      </div>

      {error && <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}<X className="h-4 w-4 mr-auto cursor-pointer" onClick={() => setError(null)} /></div>}

      {/* Dashboard */}
      {dashboard && (
        <div className="grid grid-cols-5 gap-4">
          <Card className="bg-[#12122a] border-gray-800"><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-blue-400">{dashboard.total}</div><div className="text-gray-400 text-sm">סה"כ מדדים</div></CardContent></Card>
          <Card className="bg-[#12122a] border-gray-800"><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-green-400">{dashboard.approved}</div><div className="text-gray-400 text-sm">מאושרים</div></CardContent></Card>
          <Card className="bg-[#12122a] border-gray-800"><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-yellow-400">{dashboard.draft}</div><div className="text-gray-400 text-sm">טיוטות</div></CardContent></Card>
          <Card className="bg-[#12122a] border-gray-800"><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-red-400">{dashboard.deprecated}</div><div className="text-gray-400 text-sm">מבוטלים</div></CardContent></Card>
          <Card className="bg-[#12122a] border-gray-800"><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-purple-400">{dashboard.total_snapshots}</div><div className="text-gray-400 text-sm">snapshots</div></CardContent></Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1"><Search className="absolute right-3 top-2.5 h-4 w-4 text-gray-500" /><Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="חיפוש מדד..." className="pr-10 bg-[#12122a] border-gray-700 text-white" /></div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-[#12122a] border border-gray-700 rounded-md px-3 text-white text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1); }} className="bg-[#12122a] border border-gray-700 rounded-md px-3 text-white text-sm">
          <option value="all">כל הקטגוריות</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Metric List */}
      <div className="space-y-2">
        {pd.map(metric => {
          const st = STATUS_MAP[metric.status] || { label: metric.status, color: "bg-gray-500/20 text-gray-300" };
          return (
            <Card key={metric.id} className="bg-[#12122a] border-gray-800 hover:border-gray-600 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <BarChart3 className="h-4 w-4 text-purple-400" />
                      <span className="font-semibold text-white">{metric.name}</span>
                      <Badge variant="outline" className="text-xs bg-gray-800 border-gray-700 text-gray-300 font-mono">{metric.metric_key}</Badge>
                      <Badge className={`text-xs ${st.color}`}>{st.label}</Badge>
                      {metric.category && <Badge variant="outline" className="text-xs border-purple-700 text-purple-300">{metric.category}</Badge>}
                    </div>
                    {metric.description && <p className="text-gray-400 text-sm mt-1 truncate">{metric.description}</p>}
                    <div className="flex gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                      {metric.formula && <span>נוסחה: {metric.formula.substring(0, 50)}{metric.formula.length > 50 ? "..." : ""}</span>}
                      {metric.owner && <span>בעלים: {metric.owner}</span>}
                      {metric.refresh_frequency && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{metric.refresh_frequency}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => loadSnapshots(metric)} title="snapshots"><Camera className="h-4 w-4 text-purple-400" /></Button>
                    {metric.status === "draft" && <Button size="sm" variant="ghost" onClick={() => handleApprove(metric.id)} title="אשר"><CheckCircle2 className="h-4 w-4 text-green-400" /></Button>}
                    {metric.status === "approved" && <Button size="sm" variant="ghost" onClick={() => handleDeprecate(metric.id)} title="בטל"><XCircle className="h-4 w-4 text-red-400" /></Button>}
                    <Button size="sm" variant="ghost" onClick={() => openEdit(metric)}><Edit2 className="h-4 w-4 text-gray-400" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(metric)}><Trash2 className="h-4 w-4 text-red-400" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {pd.length === 0 && <div className="text-center py-12 text-gray-500">לא נמצאו מדדים</div>}
      </div>

      {/* Pagination */}
      {tp > 1 && (
        <div className="flex justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="border-gray-700 text-gray-300">הקודם</Button>
          <span className="text-gray-400 text-sm flex items-center">{page} / {tp}</span>
          <Button size="sm" variant="outline" disabled={page >= tp} onClick={() => setPage(p => p + 1)} className="border-gray-700 text-gray-300">הבא</Button>
        </div>
      )}

      {/* Create/Edit Dialog */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => { setShowCreate(false); setEditId(null); }}>
          <div className="bg-[#12122a] border border-gray-700 rounded-xl p-6 w-full max-w-lg space-y-4 max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold">{editId ? "עריכת מדד" : "מדד חדש"}</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-gray-300">מפתח (slug)</Label><Input value={form.metric_key || ""} onChange={e => setForm({ ...form, metric_key: e.target.value })} placeholder="revenue_monthly" className="bg-[#0a0a1a] border-gray-700 text-white font-mono" /></div>
              <div><Label className="text-gray-300">שם תצוגה</Label><Input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="הכנסה חודשית" className="bg-[#0a0a1a] border-gray-700 text-white" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-gray-300">קטגוריה</Label><Input value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="מכירות / תפעול" className="bg-[#0a0a1a] border-gray-700 text-white" /></div>
              <div><Label className="text-gray-300">בעלים</Label><Input value={form.owner || ""} onChange={e => setForm({ ...form, owner: e.target.value })} className="bg-[#0a0a1a] border-gray-700 text-white" /></div>
            </div>
            <div><Label className="text-gray-300">תיאור</Label><Input value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} className="bg-[#0a0a1a] border-gray-700 text-white" /></div>
            <div><Label className="text-gray-300">נוסחה</Label><textarea value={form.formula || ""} onChange={e => setForm({ ...form, formula: e.target.value })} rows={2} placeholder="SUM(revenue) WHERE month = current" className="w-full bg-[#0a0a1a] border border-gray-700 rounded-md px-3 py-2 text-white text-sm font-mono" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-gray-300">טבלאות מקור</Label><Input value={form.source_tables || ""} onChange={e => setForm({ ...form, source_tables: e.target.value })} placeholder="invoices, payments" className="bg-[#0a0a1a] border-gray-700 text-white" /></div>
              <div><Label className="text-gray-300">תדירות רענון</Label><Input value={form.refresh_frequency || ""} onChange={e => setForm({ ...form, refresh_frequency: e.target.value })} placeholder="יומי / שבועי / חודשי" className="bg-[#0a0a1a] border-gray-700 text-white" /></div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowCreate(false); setEditId(null); }} className="border-gray-700 text-gray-300">ביטול</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-purple-600 hover:bg-purple-700">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 ml-2" />}{editId ? "עדכון" : "יצירה"}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Snapshots Dialog */}
      {showSnapshots && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => { setShowSnapshots(null); setSnapshots([]); }}>
          <div className="bg-[#12122a] border border-gray-700 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-auto space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2"><TrendingUp className="h-5 w-5 text-purple-400" />היסטוריית Snapshots - {showSnapshots.name}</h2>
              <Button size="sm" variant="ghost" onClick={() => { setShowSnapshots(null); setSnapshots([]); }}><X className="h-4 w-4" /></Button>
            </div>

            {/* Add Snapshot Form */}
            <div className="bg-[#0a0a1a] border border-gray-800 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-300">הוספת Snapshot חדש</h3>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-gray-400 text-xs">ערך</Label><Input type="number" value={snapshotForm.value} onChange={e => setSnapshotForm({ ...snapshotForm, value: e.target.value })} placeholder="100" className="bg-[#12122a] border-gray-700 text-white text-sm" /></div>
                <div><Label className="text-gray-400 text-xs">תאריך</Label><Input type="date" value={snapshotForm.snapshot_date} onChange={e => setSnapshotForm({ ...snapshotForm, snapshot_date: e.target.value })} className="bg-[#12122a] border-gray-700 text-white text-sm" /></div>
                <div className="flex items-end"><Button size="sm" onClick={handleSnapshot} disabled={snapshotSaving || !snapshotForm.value} className="bg-purple-600 hover:bg-purple-700 w-full">{snapshotSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : "הוסף"}</Button></div>
              </div>
            </div>

            {/* Snapshot Chart (Simple Bar) */}
            {snapshots.length > 0 && (
              <div className="bg-[#0a0a1a] border border-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">גרף היסטוריה</h3>
                <div className="flex items-end gap-1 h-32">
                  {snapshots.slice().reverse().slice(0, 20).map((s: any, i: number) => {
                    const maxVal = Math.max(...snapshots.map((x: any) => parseFloat(x.value) || 0));
                    const height = maxVal > 0 ? ((parseFloat(s.value) || 0) / maxVal) * 100 : 0;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full bg-purple-500/60 rounded-t" style={{ height: `${height}%` }} title={`${s.value} - ${s.snapshot_date}`}></div>
                        <span className="text-[9px] text-gray-500 rotate-45 origin-right">{s.snapshot_date?.substring(5)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Snapshot Table */}
            <div className="space-y-1">
              {snapshots.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between bg-[#0a0a1a] border border-gray-800 rounded px-3 py-2 text-sm">
                  <span className="text-gray-400">{s.snapshot_date}</span>
                  <span className="font-semibold text-white">{parseFloat(s.value).toLocaleString("he-IL")}</span>
                </div>
              ))}
              {snapshots.length === 0 && <div className="text-center py-8 text-gray-500">אין snapshots</div>}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[#12122a] border border-gray-700 rounded-xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-red-400">מחיקת מדד</h3>
            <p className="text-gray-300">האם למחוק את "{deleteConfirm.name}"?</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="border-gray-700 text-gray-300">ביטול</Button>
              <Button onClick={() => handleDelete(deleteConfirm.id)} className="bg-red-600 hover:bg-red-700">מחיקה</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
