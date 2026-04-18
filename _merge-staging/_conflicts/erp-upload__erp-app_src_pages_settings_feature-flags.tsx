import { useState, useMemo, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, X, Save, Edit2, Trash2, ToggleLeft, ToggleRight, Loader2, Flag, Eye, Shield, Clock, AlertCircle, ChevronsUpDown } from "lucide-react";

const ENVS = ["all", "production", "staging", "development"] as const;

export default function FeatureFlagsPage() {
  const [data, setData] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({ enabled: false, environment: "all", role_scope: [], branch_scope: [] });
  const [search, setSearch] = useState("");
  const [envFilter, setEnvFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const perPage = 20;

  const load = useCallback(async () => {
    try {
      setError(null);
      const [flagsRes, dashRes] = await Promise.all([
        authFetch("/api/feature-flags"),
        authFetch("/api/feature-flags/dashboard")
      ]);
      if (flagsRes.ok) { const j = await flagsRes.json(); setData(j.data || []); }
      if (dashRes.ok) { const j = await dashRes.json(); setDashboard(j); }
    } catch (e: any) { setError(e.message); }
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let d = [...data];
    if (search) { const s = search.toLowerCase(); d = d.filter(r => r.flag_key?.toLowerCase().includes(s) || r.name?.toLowerCase().includes(s) || r.description?.toLowerCase().includes(s)); }
    if (envFilter !== "all") d = d.filter(r => r.environment === envFilter);
    return d;
  }, [data, search, envFilter]);

  const tp = Math.ceil(filtered.length / perPage);
  const pd = filtered.slice((page - 1) * perPage, page * perPage);

  const handleSave = async () => {
    setSaving(true);
    try {
      const method = editId ? "PUT" : "POST";
      const url = editId ? `/api/feature-flags/${editId}` : "/api/feature-flags";
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "שגיאה בשמירה"); }
      setShowCreate(false); setEditId(null); setForm({ enabled: false, environment: "all", role_scope: [], branch_scope: [] });
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleToggle = async (flag: any) => {
    try {
      await authFetch(`/api/feature-flags/${flag.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !flag.enabled })
      });
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const handleDelete = async (id: any) => {
    try {
      await authFetch(`/api/feature-flags/${id}`, { method: "DELETE" });
      setDeleteConfirm(null);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const openEdit = (r: any) => {
    setForm({ flag_key: r.flag_key, name: r.name, description: r.description, enabled: r.enabled, environment: r.environment, role_scope: r.role_scope || [], branch_scope: r.branch_scope || [], owner: r.owner, expiry_date: r.expiry_date?.split("T")[0] || "" });
    setEditId(r.id);
    setShowCreate(true);
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>;

  return (
    <div dir="rtl" className="p-6 space-y-6 bg-[#0a0a1a] min-h-screen text-white">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Flag className="h-6 w-6 text-blue-400" />דגלי פיצ'רים</h1>
          <p className="text-gray-400 text-sm mt-1">ניהול הפעלה/כיבוי של פיצ'רים לפי סביבה ותפקיד</p>
        </div>
        <Button onClick={() => { setForm({ enabled: false, environment: "all", role_scope: [], branch_scope: [] }); setEditId(null); setShowCreate(true); }} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 ml-2" />דגל חדש
        </Button>
      </div>

      {error && <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}<X className="h-4 w-4 mr-auto cursor-pointer" onClick={() => setError(null)} /></div>}

      {/* Dashboard Cards */}
      {dashboard && (
        <div className="grid grid-cols-4 gap-4">
          <Card className="bg-[#12122a] border-gray-800"><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-blue-400">{dashboard.total}</div><div className="text-gray-400 text-sm">סה"כ דגלים</div></CardContent></Card>
          <Card className="bg-[#12122a] border-gray-800"><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-green-400">{dashboard.enabled}</div><div className="text-gray-400 text-sm">מופעלים</div></CardContent></Card>
          <Card className="bg-[#12122a] border-gray-800"><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-gray-400">{dashboard.disabled}</div><div className="text-gray-400 text-sm">מושבתים</div></CardContent></Card>
          <Card className="bg-[#12122a] border-gray-800"><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-red-400">{dashboard.expired}</div><div className="text-gray-400 text-sm">פגי תוקף</div></CardContent></Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1"><Search className="absolute right-3 top-2.5 h-4 w-4 text-gray-500" /><Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="חיפוש דגל..." className="pr-10 bg-[#12122a] border-gray-700 text-white" /></div>
        <select value={envFilter} onChange={e => { setEnvFilter(e.target.value); setPage(1); }} className="bg-[#12122a] border border-gray-700 rounded-md px-3 text-white text-sm">
          <option value="all">כל הסביבות</option>
          {ENVS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      {/* Flag List */}
      <div className="space-y-2">
        {pd.map(flag => (
          <Card key={flag.id} className="bg-[#12122a] border-gray-800 hover:border-gray-600 transition-colors">
            <CardContent className="p-4 flex items-center gap-4">
              <button onClick={() => handleToggle(flag)} className="flex-shrink-0">
                {flag.enabled ? <ToggleRight className="h-8 w-8 text-green-400" /> : <ToggleLeft className="h-8 w-8 text-gray-600" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{flag.name}</span>
                  <Badge variant="outline" className="text-xs bg-gray-800 border-gray-700 text-gray-300 font-mono">{flag.flag_key}</Badge>
                  <Badge className={`text-xs ${flag.enabled ? "bg-green-500/20 text-green-300" : "bg-gray-500/20 text-gray-400"}`}>{flag.enabled ? "מופעל" : "מושבת"}</Badge>
                  {flag.environment && flag.environment !== "all" && <Badge variant="outline" className="text-xs border-blue-700 text-blue-300">{flag.environment}</Badge>}
                </div>
                {flag.description && <p className="text-gray-400 text-sm mt-1 truncate">{flag.description}</p>}
                <div className="flex gap-3 mt-1 text-xs text-gray-500">
                  {flag.owner && <span className="flex items-center gap-1"><Shield className="h-3 w-3" />{flag.owner}</span>}
                  {flag.expiry_date && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(flag.expiry_date).toLocaleDateString("he-IL")}</span>}
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(flag)}><Edit2 className="h-4 w-4 text-gray-400" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(flag)}><Trash2 className="h-4 w-4 text-red-400" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {pd.length === 0 && <div className="text-center py-12 text-gray-500">לא נמצאו דגלים</div>}
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
          <div className="bg-[#12122a] border border-gray-700 rounded-xl p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold">{editId ? "עריכת דגל" : "דגל חדש"}</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-gray-300">מפתח (slug)</Label><Input value={form.flag_key || ""} onChange={e => setForm({ ...form, flag_key: e.target.value })} placeholder="my_feature" className="bg-[#0a0a1a] border-gray-700 text-white font-mono" /></div>
              <div><Label className="text-gray-300">שם תצוגה</Label><Input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="הפיצ'ר שלי" className="bg-[#0a0a1a] border-gray-700 text-white" /></div>
            </div>
            <div><Label className="text-gray-300">תיאור</Label><Input value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} className="bg-[#0a0a1a] border-gray-700 text-white" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-gray-300">סביבה</Label>
                <select value={form.environment || "all"} onChange={e => setForm({ ...form, environment: e.target.value })} className="w-full bg-[#0a0a1a] border border-gray-700 rounded-md px-3 py-2 text-white text-sm">
                  {ENVS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div><Label className="text-gray-300">בעלים</Label><Input value={form.owner || ""} onChange={e => setForm({ ...form, owner: e.target.value })} className="bg-[#0a0a1a] border-gray-700 text-white" /></div>
            </div>
            <div><Label className="text-gray-300">תאריך תפוגה</Label><Input type="date" value={form.expiry_date || ""} onChange={e => setForm({ ...form, expiry_date: e.target.value })} className="bg-[#0a0a1a] border-gray-700 text-white" /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.enabled || false} onChange={e => setForm({ ...form, enabled: e.target.checked })} className="rounded" />
              <Label className="text-gray-300">מופעל</Label>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowCreate(false); setEditId(null); }} className="border-gray-700 text-gray-300">ביטול</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 ml-2" />}{editId ? "עדכון" : "יצירה"}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[#12122a] border border-gray-700 rounded-xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-red-400">מחיקת דגל</h3>
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
