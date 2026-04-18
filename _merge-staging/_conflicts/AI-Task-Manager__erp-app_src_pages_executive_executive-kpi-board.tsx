import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Download, Plus, Search, Printer, Upload, MoreHorizontal, ChevronRight, ChevronLeft, X, Save, Eye, Edit2, Trash2, Copy, FileSpreadsheet, TrendingDown, ChevronsUpDown, Clock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/utils";

const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
const STATUSES = ["בגבולות", "מעל יעד", "מתחת ליעד", "ללא נתון"] as const;
const SC: Record<string, string> = { "בגבולות": "bg-blue-500/20 text-blue-300", "מעל יעד": "bg-green-500/20 text-green-300", "מתחת ליעד": "bg-red-500/20 text-red-300", "ללא נתון": "bg-gray-500/20 text-gray-300" };
const CATS = ["פיננסי","תפעולי","מכירות","ייצור","איכות","משאבים"];
const FREQS = ["יומי","שבועי","חודשי","רבעוני"];

const emptyForm = () => ({ name: "", category: "", value: "", target: "", achievement: "", weight: "", frequency: "", owner: "", status: "", notes: "" });

export default function ExecutiveKpiBoard() {
  const [data, setData] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState<any>(emptyForm());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [isLoading, setIsLoading] = useState(true);
  const [kpiHistory, setKpiHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } };

  const load = useCallback(async () => {
    try {
      setError(null);
      const [kpiRes, empRes] = await Promise.all([
        authFetch(`${BASE}/executive/kpi-board/list`),
        authFetch(`${BASE}/hr/employees?limit=100`),
      ]);
      if (kpiRes.ok) {
        const j = await kpiRes.json();
        setData(Array.isArray(j) ? j : j.data || j.items || []);
      } else {
        const err = await kpiRes.json().catch(() => ({}));
        setError(err.error || `שגיאה בטעינת נתונים (${kpiRes.status})`);
      }
      if (empRes.ok) {
        const emp = await empRes.json();
        const list = Array.isArray(emp) ? emp : emp.employees || emp.records || emp.items || emp.data || [];
        setEmployees(list);
      }
    } catch (e: any) { setError(e.message); }
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadHistory = useCallback(async (kpiId: string) => {
    setHistoryLoading(true);
    setKpiHistory([]);
    try {
      const res = await authFetch(`${BASE}/executive/kpi-board/${kpiId}/history`);
      if (res.ok) {
        const h = await res.json();
        setKpiHistory(Array.isArray(h) ? h : []);
      } else {
        console.warn("[KPI history] failed to load:", res.status);
        setKpiHistory([]);
      }
    } catch (e: any) {
      console.warn("[KPI history] network error:", e.message);
      setKpiHistory([]);
    }
    setHistoryLoading(false);
  }, []);

  const filtered = useMemo(() => {
    let d = [...data];
    if (search) { const s = search.toLowerCase(); d = d.filter(r => r.id?.toLowerCase?.()?.includes(s) || r.name?.toLowerCase().includes(s) || r.category?.toLowerCase().includes(s) || r.owner?.toLowerCase().includes(s)); }
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    if (catFilter !== "all") d = d.filter(r => r.category === catFilter);
    if (sortField) d.sort((a: any, b: any) => { const av = a[sortField], bv = b[sortField]; const cmp = typeof av === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""), "he"); return sortDir === "asc" ? cmp : -cmp; });
    return d;
  }, [data, search, statusFilter, catFilter, sortField, sortDir]);

  const tp = Math.ceil(filtered.length / perPage);
  const pd = filtered.slice((page - 1) * perPage, page * perPage);
  const allSel = pd.length > 0 && pd.every(r => selected.has(r.id));
  const SI = () => <ChevronsUpDown className="h-3 w-3 opacity-40" />;
  const af = [statusFilter !== "all", catFilter !== "all"].filter(Boolean).length;
  const dr = showDetail ? data.find(r => r.id === showDetail) : null;

  const openCreate = () => { setForm(emptyForm()); setEditId(null); setSaveError(null); setShowCreate(true); };
  const openEdit = (row: any) => {
    setForm({
      name: row.name || "",
      category: row.category || "",
      value: row.value ?? "",
      target: row.target ?? "",
      achievement: row.achievement ?? "",
      weight: row.weight ?? "",
      frequency: row.frequency || "",
      owner: row.owner || "",
      status: row.status || "",
      notes: row.notes || "",
    });
    setEditId(row.id);
    setSaveError(null);
    setShowCreate(true);
  };

  const handleSave = async () => {
    if (!form.name?.trim()) { setSaveError("שם ה-KPI הוא שדה חובה"); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        name: form.name,
        category: form.category,
        value: form.value,
        target: form.target,
        achievement: form.achievement !== "" ? form.achievement : undefined,
        weight: form.weight !== "" ? form.weight : undefined,
        frequency: form.frequency,
        owner: form.owner,
        status: form.status,
        notes: form.notes,
      };
      let res: Response;
      if (editId) {
        res = await authFetch(`${BASE}/executive/kpi-board/${editId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      } else {
        res = await authFetch(`${BASE}/executive/kpi-board`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.error || "שגיאה בשמירה");
      } else {
        setShowCreate(false);
        setEditId(null);
        await load();
      }
    } catch (e: any) { setSaveError(e.message || "שגיאה בשמירה"); }
    setSaving(false);
  };

  const handleDelete = async (ids: string[]) => {
    try {
      const results = await Promise.all(ids.map(id => authFetch(`${BASE}/executive/kpi-board/${id}`, { method: "DELETE" })));
      const failed = results.filter(r => !r.ok).length;
      setDeleteConfirm(null);
      setSelected(new Set());
      await load();
      if (failed > 0) setError(`${failed} רשומות לא נמחקו עקב שגיאה`);
    } catch (e: any) { setError(e.message || "שגיאה במחיקה"); }
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><TrendingUp className="h-6 w-6 text-cyan-400" />לוח KPI מנהלים</h1><p className="text-sm text-muted-foreground mt-1">מדדי ביצועים מרכזיים — KPI ברמה ארגונית</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="border-border text-gray-300 gap-1"><FileSpreadsheet className="h-4 w-4" />ייצוא</Button>
          <Button variant="outline" size="sm" className="border-border text-gray-300 gap-1"><Printer className="h-4 w-4" />הדפסה</Button>
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 gap-2"><Plus className="h-4 w-4" />KPI חדש</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {(() => {
          const total = data.length;
          const inRange = data.filter(r => r.status === "בגבולות").length;
          const below = data.filter(r => r.status === "מתחת ליעד").length;
          const above = data.filter(r => r.status === "מעל יעד").length;
          const scores = data.map(r => Number(r.score || r.currentValue || 0)).filter(v => v > 0);
          const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;
          const latestUpdate = data.reduce((latest: string, r: any) => {
            const ts = r.updatedAt || r.updated_at || r.lastUpdated || r.createdAt || r.created_at || "";
            return ts > latest ? ts : latest;
          }, "");
          const lastUpdatedLabel = latestUpdate
            ? new Date(latestUpdate).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })
            : data.length > 0 ? "זמין" : "—";
          const kpis = [
            { l: "KPIs פעילים", v: String(total), c: "text-cyan-400", u: true },
            { l: "בגבולות", v: String(inRange), c: "text-green-400", u: true },
            { l: "מתחת ליעד", v: String(below), c: "text-red-400", u: below === 0 },
            { l: "מעל יעד", v: String(above), c: "text-emerald-400", u: true },
            { l: "ציון ממוצע", v: avgScore > 0 ? `${avgScore}%` : "—", c: "text-blue-400", u: true },
            { l: "עדכון אחרון", v: lastUpdatedLabel, c: "text-amber-400", u: true },
          ];
          return kpis.map((k, i) => (
            <Card key={i} className="bg-card/80 border-border"><CardContent className="p-4">{isLoading ? <div className="space-y-2 animate-pulse"><div className="h-3 w-16 bg-muted rounded" /><div className="h-6 w-20 bg-muted rounded" /></div> : <div><p className="text-[11px] text-muted-foreground">{k.l}</p><p className={`text-lg font-bold font-mono mt-1 ${k.c}`}>{k.v}</p></div>}</CardContent></Card>
          ));
        })()}
      </div>

      <Card className="bg-card/60 border-border"><CardContent className="p-3"><div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="חיפוש..." className="pr-9 bg-input border-border text-foreground" /></div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסטטוסים</option>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הקטגוריות</option>{CATS.map((o: string) => <option key={o} value={o}>{o}</option>)}</select>
        {af > 0 && <Button variant="ghost" size="sm" onClick={() => { setStatusFilter("all"); setCatFilter("all"); setSearch(""); }} className="text-red-400 hover:text-red-300 gap-1"><X className="h-3 w-3" />נקה ({af})</Button>}
      </div></CardContent></Card>

      {selected.size > 0 && <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3"><span className="text-sm text-blue-300">{selected.size} נבחרו</span><Button onClick={() => setDeleteConfirm({ _bulk: true, count: selected.size })} size="sm" variant="outline" className="border-red-500/30 text-red-300 gap-1"><Trash2 className="h-3 w-3" />מחק</Button><Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="text-gray-400 mr-auto">בטל</Button></div>}

      <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
        <th className="p-3 w-10"><input type="checkbox" checked={allSel} onChange={() => { if (allSel) setSelected(new Set()); else setSelected(new Set(pd.map(r => r.id))); }} className="rounded" /></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("id")}>מזהה<SI /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("name")}>KPI<SI /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("category")}>קטגוריה<SI /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("value")}>ערך<SI /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("target")}>יעד<SI /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("achievement")}>עמידה<SI /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("frequency")}>תדירות<SI /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("owner")}>אחראי<SI /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("status")}>סטטוס<SI /></button></th>
        <th className="p-3 text-center text-muted-foreground font-medium">פעולות</th>
      </tr></thead><tbody>
        {isLoading ? Array.from({length:8}).map((_,sk) => (<tr key={sk} className="border-b border-border/50"><td colSpan={11} className="p-3"><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted rounded" /><div className="h-4 w-16 bg-muted rounded" /><div className="h-4 w-32 bg-muted rounded" /><div className="h-4 w-24 bg-muted rounded" /></div></td></tr>)) :
        error ? <tr><td colSpan={11} className="p-20 text-center"><p className="text-red-400">{error}</p><Button onClick={load} className="mt-4">נסה שוב</Button></td></tr> :
        pd.length === 0 ? <tr><td colSpan={11} className="p-20 text-center"><div className="flex flex-col items-center gap-4"><TrendingUp className="h-16 w-16 text-muted-foreground" /><p className="text-lg font-medium text-muted-foreground">{(af > 0 || search) ? "לא נמצאו תוצאות" : "עדיין אין KPIs"}</p>{!(af > 0 || search) && <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 gap-2 mt-2"><Plus className="h-4 w-4" />KPI חדש</Button>}</div></td></tr> :
        pd.map(row => (
          <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
            <td className="p-3"><input type="checkbox" checked={selected.has(row.id)} onChange={() => { const s = new Set(selected); s.has(row.id) ? s.delete(row.id) : s.add(row.id); setSelected(s); }} className="rounded" /></td>
            <td className="p-3 font-mono text-xs text-blue-400">{row.id}</td>
            <td className="p-3"><div className="font-medium text-foreground">{row.name}</div></td>
            <td className="p-3 text-muted-foreground">{row.category}</td>
            <td className="p-3 font-mono text-emerald-400">{row.value}</td>
            <td className="p-3 font-mono text-muted-foreground">{row.target}</td>
            <td className="p-3"><div className="flex items-center gap-2"><div className="w-12 bg-muted rounded-full h-2"><div className={`rounded-full h-2 ${Number(row.achievement)>=90?"bg-green-500":Number(row.achievement)>=70?"bg-yellow-500":"bg-red-500"}`} style={{width:`${Math.min(Number(row.achievement)||0,100)}%`}} /></div><span className="font-mono text-xs">{row.achievement != null ? `${row.achievement}%` : "—"}</span></div></td>
            <td className="p-3 text-muted-foreground text-xs">{row.frequency}</td>
            <td className="p-3 text-muted-foreground text-xs">{row.owner}</td>
            <td className="p-3"><Badge className={`${SC[row.status] || "bg-gray-500/20 text-gray-300"} border-0 text-xs`}>{row.status || "—"}</Badge></td>
            <td className="p-3 text-center"><div className="relative inline-block"><Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setMenuOpen(menuOpen === row.id ? null : row.id)}><MoreHorizontal className="h-4 w-4" /></Button>
              {menuOpen === row.id && <div className="absolute left-0 top-8 z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[150px]" onMouseLeave={() => setMenuOpen(null)}>
                <button onClick={() => { setShowDetail(row.id); loadHistory(row.id); setMenuOpen(null); }} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2"><Eye className="h-4 w-4" />צפייה</button>
                <button onClick={() => { openEdit(row); setMenuOpen(null); }} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2"><Edit2 className="h-4 w-4" />עריכה</button>
                <hr className="border-border my-1" /><button onClick={() => { setDeleteConfirm(row); setMenuOpen(null); }} className="w-full px-3 py-2 text-right text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"><Trash2 className="h-4 w-4" />מחיקה</button>
              </div>}
            </div></td>
          </tr>
        ))}
      </tbody></table></div>
      <div className="flex items-center justify-between p-3 border-t border-border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><span>מציג {((page-1)*perPage)+1}–{Math.min(page*perPage,filtered.length)} מתוך {filtered.length}</span><select value={perPage} onChange={e=>{setPerPage(Number(e.target.value));setPage(1)}} className="bg-input border border-border rounded px-2 py-1 text-xs text-foreground">{[10,25,50,100].map(n=><option key={n} value={n}>{n} שורות</option>)}</select></div>
        <div className="flex items-center gap-1"><Button variant="ghost" size="sm" disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="h-8 w-8 p-0"><ChevronRight className="h-4 w-4" /></Button>{Array.from({length:Math.min(5,tp)},(_,i)=>{const p=page<=3?i+1:page+i-2;if(p>tp||p<1)return null;return <Button key={p} variant={p===page?"default":"ghost"} size="sm" onClick={()=>setPage(p)} className={`h-8 w-8 p-0 ${p===page?"bg-blue-600":""}`}>{p}</Button>})}<Button variant="ghost" size="sm" disabled={page>=tp} onClick={()=>setPage(p=>p+1)} className="h-8 w-8 p-0"><ChevronLeft className="h-4 w-4" /></Button></div>
      </div></CardContent></Card>

      {showCreate && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => { setShowCreate(false); setEditId(null); }}><div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><h2 className="text-lg font-bold text-foreground">{editId ? "עריכת KPI" : "KPI חדש"}</h2><Button variant="ghost" size="sm" onClick={() => { setShowCreate(false); setEditId(null); }}><X className="h-4 w-4" /></Button></div>
        <div className="p-4 space-y-6">
          {saveError && <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm"><AlertCircle className="h-4 w-4 flex-shrink-0" />{saveError}</div>}
          <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">פרטי KPI</h3></div>
          <div className="grid grid-cols-3 gap-4">
            <div><Label className="text-muted-foreground text-xs">שם *</Label><Input value={form.name} onChange={e => setForm((f: any) => ({...f, name: e.target.value}))} type="text" placeholder="שם ה-KPI" className="bg-input border-border text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">קטגוריה *</Label><select value={form.category} onChange={e => setForm((f: any) => ({...f, category: e.target.value}))} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option value="">בחר...</option>{CATS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <div><Label className="text-muted-foreground text-xs">ערך נוכחי</Label><Input value={form.value} onChange={e => setForm((f: any) => ({...f, value: e.target.value}))} type="text" placeholder="0" className="bg-input border-border text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">יעד</Label><Input value={form.target} onChange={e => setForm((f: any) => ({...f, target: e.target.value}))} type="text" placeholder="0" className="bg-input border-border text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">עמידה (%)</Label><Input value={form.achievement} onChange={e => setForm((f: any) => ({...f, achievement: e.target.value}))} type="number" min="0" max="200" placeholder="—" className="bg-input border-border text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">משקל (%)</Label><Input value={form.weight} onChange={e => setForm((f: any) => ({...f, weight: e.target.value}))} type="number" placeholder="10" className="bg-input border-border text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">תדירות</Label><select value={form.frequency} onChange={e => setForm((f: any) => ({...f, frequency: e.target.value}))} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option value="">בחר...</option>{FREQS.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
            <div><Label className="text-muted-foreground text-xs">אחראי</Label><select value={form.owner} onChange={e => setForm((f: any) => ({...f, owner: e.target.value}))} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option value="">בחר...</option>{employees.map((emp: any) => { const n = emp.data?.full_name || emp.data?.name || emp.full_name || emp.name || `${emp.data?.first_name || ""} ${emp.data?.last_name || ""}`.trim() || String(emp.id); return <option key={emp.id} value={n}>{n}</option>; })}</select></div>
            <div><Label className="text-muted-foreground text-xs">סטטוס</Label><select value={form.status} onChange={e => setForm((f: any) => ({...f, status: e.target.value}))} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option value="">בחר...</option>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          </div>
          <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">הערות</h3></div>
          <div><Label className="text-muted-foreground text-xs">הערות</Label><textarea value={form.notes} onChange={e => setForm((f: any) => ({...f, notes: e.target.value}))} rows={3} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" placeholder="הערות..." /></div>
        </div>
        <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
          <Button variant="outline" onClick={() => { setShowCreate(false); setEditId(null); }} className="border-border">ביטול</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 gap-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {editId ? "עדכן" : "שמור"}
          </Button>
        </div>
      </div></div>}

      {dr && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowDetail(null)}><div className="bg-card border border-border rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><div className="flex items-center gap-3"><h2 className="text-lg font-bold text-foreground">{dr.name || dr.id}</h2><Badge className={`${SC[dr.status] || "bg-gray-500/20 text-gray-300"} border-0`}>{dr.status || "—"}</Badge></div><Button variant="ghost" size="sm" onClick={() => setShowDetail(null)}><X className="h-4 w-4" /></Button></div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">KPI</p><p className="text-foreground mt-1 font-medium">{dr.name}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">קטגוריה</p><p className="text-foreground mt-1 font-medium">{dr.category || "—"}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">ערך</p><p className="text-foreground mt-1 font-medium">{dr.value ?? "—"}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">יעד</p><p className="text-foreground mt-1 font-medium">{dr.target ?? "—"}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">עמידה</p><p className="text-foreground mt-1 font-medium">{dr.achievement != null ? `${dr.achievement}%` : "—"}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">משקל</p><p className="text-foreground mt-1 font-medium">{dr.weight != null ? `${dr.weight}%` : "—"}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">תדירות</p><p className="text-foreground mt-1 font-medium">{dr.frequency || "—"}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">אחראי</p><p className="text-foreground mt-1 font-medium">{dr.owner || "—"}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">סטטוס</p><p className="text-foreground mt-1 font-medium">{dr.status || "—"}</p></div>
            {dr.notes && <div className="bg-input rounded-lg p-3 col-span-3"><p className="text-[11px] text-muted-foreground">הערות</p><p className="text-foreground mt-1 text-sm">{dr.notes}</p></div>}
          </div>
          <h3 className="text-sm font-semibold text-blue-400 border-b border-border pb-2">היסטוריה</h3>
          {historyLoading ? (
            <div className="space-y-2 animate-pulse">{Array.from({length:3}).map((_,i) => <div key={i} className="h-10 bg-muted rounded" />)}</div>
          ) : kpiHistory.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {kpiHistory.map((h: any, i: number) => (
                <div key={i} className="flex items-center gap-3 text-sm p-2 rounded bg-background/50">
                  <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-muted-foreground text-xs min-w-[50px]">{h.time || new Date(h.createdAt || h.created_at || h.timestamp).toLocaleTimeString("he-IL", {hour:"2-digit",minute:"2-digit"})}</span>
                  <span className="text-muted-foreground text-xs min-w-[80px]">{new Date(h.createdAt || h.created_at || h.timestamp).toLocaleDateString("he-IL")}</span>
                  <span className="text-foreground">{h.action || h.event || "עדכון"}</span>
                  <span className="text-muted-foreground mr-auto">{h.user || h.performedBy || h.userName || "מערכת"}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">אין היסטוריית שינויים זמינה</p>
          )}
        </div>
        <div className="flex items-center gap-2 p-4 border-t border-border justify-end"><Button variant="outline" className="border-border gap-1"><Printer className="h-4 w-4" />הדפסה</Button><Button onClick={() => { openEdit(dr); setShowDetail(null); }} className="bg-blue-600 hover:bg-blue-700 gap-1"><Edit2 className="h-4 w-4" />ערוך</Button></div>
      </div></div>}

      {deleteConfirm && <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}><div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}><div className="p-6 text-center space-y-4"><div className="mx-auto w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center"><Trash2 className="h-6 w-6 text-red-400" /></div><h3 className="text-lg font-bold text-foreground">אישור מחיקה</h3><p className="text-muted-foreground">{deleteConfirm._bulk ? `למחוק ${deleteConfirm.count} רשומות?` : `למחוק את '${deleteConfirm.name || deleteConfirm.id}'?`} פעולה זו אינה ניתנת לביטול.</p></div><div className="flex items-center gap-2 p-4 border-t border-border justify-end"><Button variant="outline" onClick={() => setDeleteConfirm(null)} className="border-border">ביטול</Button><Button onClick={() => { if (deleteConfirm._bulk) { handleDelete(Array.from(selected)); } else { handleDelete([deleteConfirm.id]); } }} className="bg-red-600 hover:bg-red-700 gap-1"><Trash2 className="h-4 w-4" />מחק לצמיתות</Button></div></div></div>}
    </div>
  );
}
