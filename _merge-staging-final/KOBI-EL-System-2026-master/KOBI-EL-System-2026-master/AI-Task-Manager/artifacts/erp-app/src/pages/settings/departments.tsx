import { useState, useMemo, useEffect } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Printer, Upload, MoreHorizontal, ChevronRight, ChevronLeft, X, Save, Eye, Edit2, Trash2, Copy, FileSpreadsheet, TrendingUp, ChevronsUpDown, Clock, CheckCircle2, AlertCircle, Loader2, Building2, Users } from "lucide-react";

const fmt = (v: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);
const STATUSES = ["active", "inactive"] as const;
const STATUS_LABELS: Record<string, string> = { active: "פעיל", inactive: "לא פעיל" };
const SC: Record<string, string> = { active: "bg-green-500/20 text-green-300", inactive: "bg-red-500/20 text-red-300" };

interface Dept {
  id: number;
  name: string;
  code: string;
  manager: string;
  parent_department: string;
  location: string;
  phone: string;
  email: string;
  budget: number;
  employee_count: number;
  description: string;
  status: string;
}

const EMPTY_FORM = { name: "", code: "", manager: "", parentDepartment: "", location: "", phone: "", email: "", budget: 0, employeeCount: 0, description: "", status: "active" };

export default function SettingsDepartments() {
  const [data, setData] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({ ...EMPTY_FORM });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Dept | { _bulk: true; count: number } | null>(null);

  const load = async () => {
    try {
      const res = await authFetch("/api/settings/departments");
      if (res.ok) {
        const j = await res.json();
        setData(Array.isArray(j) ? j : j.data || j.items || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let d = [...data];
    if (search) { const s = search.toLowerCase(); d = d.filter(r => r.name.includes(s) || (r.code || "").toLowerCase().includes(s) || (r.manager || "").includes(s)); }
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    return d;
  }, [data, search, statusFilter]);

  const tp = Math.ceil(filtered.length / perPage);
  const pd = filtered.slice((page - 1) * perPage, page * perPage);
  const allSel = pd.length > 0 && pd.every(r => selected.has(r.id));
  const af = [statusFilter !== "all"].filter(Boolean).length;
  const dr = showDetail !== null ? data.find(r => r.id === showDetail) : null;

  const totalBudget = data.reduce((s, d) => s + Number(d.budget || 0), 0);
  const totalEmps = data.reduce((s, d) => s + Number(d.employee_count || 0), 0);
  const activeCount = data.filter(d => d.status === "active").length;

  const openEdit = (dept: Dept) => {
    setForm({
      name: dept.name, code: dept.code, manager: dept.manager,
      parentDepartment: dept.parent_department, location: dept.location,
      phone: dept.phone, email: dept.email, budget: dept.budget,
      employeeCount: dept.employee_count, description: dept.description, status: dept.status,
    });
    setEditId(dept.id);
    setShowCreate(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const method = editId ? "PUT" : "POST";
      const url = editId ? `/api/settings/departments/${editId}` : "/api/settings/departments";
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "שגיאה בשמירה"); }
      setShowCreate(false);
      setEditId(null);
      setForm({ ...EMPTY_FORM });
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "שגיאה"); }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    try {
      await authFetch(`/api/settings/departments/${id}`, { method: "DELETE" });
      setDeleteConfirm(null);
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "שגיאה"); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>;
  }

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {error && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400"><AlertCircle className="h-4 w-4 flex-shrink-0" /><span className="text-sm">{error}</span><button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button></div>}
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Building2 className="h-6 w-6 text-blue-400" />ניהול מחלקות</h1><p className="text-sm text-muted-foreground mt-1">הגדרת מחלקות, צוותים ומבנה ארגוני</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="border-border text-gray-300 gap-1"><FileSpreadsheet className="h-4 w-4" />ייצוא</Button>
          <Button variant="outline" size="sm" className="border-border text-gray-300 gap-1"><Printer className="h-4 w-4" />הדפסה</Button>
          <Button onClick={() => { setForm({ ...EMPTY_FORM }); setEditId(null); setShowCreate(true); }} className="bg-blue-600 hover:bg-blue-700 gap-2"><Plus className="h-4 w-4" />מחלקה חדשה</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { l: "מחלקות", v: String(data.length), c: "text-blue-400" },
          { l: "פעילות", v: String(activeCount), c: "text-green-400" },
          { l: "עובדים", v: String(totalEmps), c: "text-emerald-400" },
          { l: "תקציב כולל", v: fmt(totalBudget), c: "text-cyan-400" },
          { l: "מנהלים", v: String(data.length), c: "text-purple-400" },
          { l: "ממוצע/מחלקה", v: data.length > 0 ? (totalEmps / data.length).toFixed(1) : "0", c: "text-amber-400" },
        ].map((k, i) => (
          <Card key={i} className="bg-card/80 border-border hover:border-border transition-colors">
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground">{k.l}</p>
              <p className={`text-lg font-bold font-mono mt-1 ${k.c}`}>{k.v}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card/60 border-border"><CardContent className="p-3"><div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="חיפוש..." className="pr-9 bg-input border-border text-foreground" /></div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסטטוסים</option>{STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select>
        {af > 0 && <Button variant="ghost" size="sm" onClick={() => { setStatusFilter("all"); setSearch(""); }} className="text-red-400 hover:text-red-300 gap-1"><X className="h-3 w-3" />נקה ({af})</Button>}
      </div></CardContent></Card>

      {selected.size > 0 && <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3"><span className="text-sm text-blue-300">{selected.size} נבחרו</span><Button onClick={() => setDeleteConfirm({ _bulk: true, count: selected.size })} size="sm" variant="outline" className="border-red-500/30 text-red-300 gap-1"><Trash2 className="h-3 w-3" />מחק</Button><Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="text-gray-400 mr-auto">בטל</Button></div>}

      <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
        <th className="p-3 w-10"><input type="checkbox" checked={allSel} onChange={() => { if (allSel) setSelected(new Set()); else setSelected(new Set(pd.map(r => r.id))); }} className="rounded" /></th>
        <th className="p-3 text-right text-muted-foreground font-medium">קוד</th>
        <th className="p-3 text-right text-muted-foreground font-medium">שם מחלקה</th>
        <th className="p-3 text-right text-muted-foreground font-medium">מנהל</th>
        <th className="p-3 text-right text-muted-foreground font-medium">עובדים</th>
        <th className="p-3 text-right text-muted-foreground font-medium">תקציב</th>
        <th className="p-3 text-right text-muted-foreground font-medium">מחלקת אב</th>
        <th className="p-3 text-right text-muted-foreground font-medium">מיקום</th>
        <th className="p-3 text-right text-muted-foreground font-medium">אימייל</th>
        <th className="p-3 text-right text-muted-foreground font-medium">סטטוס</th>
        <th className="p-3 text-center text-muted-foreground font-medium">פעולות</th>
      </tr></thead><tbody>
        {pd.length === 0 && <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">אין מחלקות להצגה</td></tr>}
        {pd.map(row => (
          <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
            <td className="p-3"><input type="checkbox" checked={selected.has(row.id)} onChange={() => { const s = new Set(selected); s.has(row.id) ? s.delete(row.id) : s.add(row.id); setSelected(s); }} className="rounded" /></td>
            <td className="p-3 font-mono text-xs text-blue-400">{row.code}</td>
            <td className="p-3"><div className="font-medium text-foreground">{row.name}</div></td>
            <td className="p-3 text-muted-foreground">{row.manager}</td>
            <td className="p-3 text-center text-foreground font-mono">{row.employee_count}</td>
            <td className="p-3 font-mono text-emerald-400">{fmt(Number(row.budget))}</td>
            <td className="p-3 text-muted-foreground text-xs">{row.parent_department}</td>
            <td className="p-3 text-muted-foreground text-xs">{row.location}</td>
            <td className="p-3 text-muted-foreground text-xs">{row.email}</td>
            <td className="p-3"><Badge className={`${SC[row.status] || SC.active} border-0 text-xs`}>{STATUS_LABELS[row.status] || row.status}</Badge></td>
            <td className="p-3 text-center"><div className="relative inline-block"><Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setMenuOpen(menuOpen === row.id ? null : row.id)}><MoreHorizontal className="h-4 w-4" /></Button>
              {menuOpen === row.id && <div className="absolute left-0 top-8 z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[150px]" onMouseLeave={() => setMenuOpen(null)}>
                <button onClick={() => { setShowDetail(row.id); setMenuOpen(null); }} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2"><Eye className="h-4 w-4" />צפייה</button>
                <button onClick={() => { openEdit(row); setMenuOpen(null); }} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2"><Edit2 className="h-4 w-4" />עריכה</button>
                <hr className="border-border my-1" /><button onClick={() => { setDeleteConfirm(row); setMenuOpen(null); }} className="w-full px-3 py-2 text-right text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"><Trash2 className="h-4 w-4" />מחיקה</button>
              </div>}</div></td>
          </tr>
        ))}
      </tbody></table></div>
      <div className="flex items-center justify-between p-3 border-t border-border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><span>מציג {filtered.length === 0 ? 0 : ((page - 1) * perPage) + 1}-{Math.min(page * perPage, filtered.length)} מתוך {filtered.length}</span><select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }} className="bg-input border border-border rounded px-2 py-1 text-xs text-foreground">{[10, 25, 50].map(n => <option key={n} value={n}>{n} שורות</option>)}</select></div>
        <div className="flex items-center gap-1"><Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-8 w-8 p-0"><ChevronRight className="h-4 w-4" /></Button>{Array.from({ length: Math.min(5, tp) }, (_, i) => { const p = page <= 3 ? i + 1 : page + i - 2; if (p > tp || p < 1) return null; return <Button key={p} variant={p === page ? "default" : "ghost"} size="sm" onClick={() => setPage(p)} className={`h-8 w-8 p-0 ${p === page ? "bg-blue-600" : ""}`}>{p}</Button>; })}<Button variant="ghost" size="sm" disabled={page >= tp} onClick={() => setPage(p => p + 1)} className="h-8 w-8 p-0"><ChevronLeft className="h-4 w-4" /></Button></div>
      </div></CardContent></Card>

      {showCreate && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => { setShowCreate(false); setEditId(null); }}><div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><h2 className="text-lg font-bold text-foreground">{editId ? "עריכת מחלקה" : "מחלקה חדשה"}</h2><Button variant="ghost" size="sm" onClick={() => { setShowCreate(false); setEditId(null); }}><X className="h-4 w-4" /></Button></div>
        <div className="p-4 space-y-6">
          <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">פרטי מחלקה</h3></div>
          <div className="grid grid-cols-3 gap-4">
            <div><Label className="text-muted-foreground text-xs">שם מחלקה *</Label><Input value={String(form.name || "")} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="שם" className="bg-input border-border text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">קוד *</Label><Input value={String(form.code || "")} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="DEPT" className="bg-input border-border text-foreground mt-1" dir="ltr" /></div>
            <div><Label className="text-muted-foreground text-xs">מנהל *</Label><Input value={String(form.manager || "")} onChange={e => setForm(f => ({ ...f, manager: e.target.value }))} placeholder="שם מנהל" className="bg-input border-border text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">מחלקת אב</Label>
              <select value={String(form.parentDepartment || "")} onChange={e => setForm(f => ({ ...f, parentDepartment: e.target.value }))} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                <option value="">ללא</option>
                {data.filter(d => d.id !== editId).map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div><Label className="text-muted-foreground text-xs">מיקום</Label><Input value={String(form.location || "")} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="בניין/קומה" className="bg-input border-border text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">טלפון</Label><Input value={String(form.phone || "")} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="03-0000000" className="bg-input border-border text-foreground mt-1" dir="ltr" /></div>
            <div><Label className="text-muted-foreground text-xs">אימייל</Label><Input value={String(form.email || "")} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="dept@company.co.il" className="bg-input border-border text-foreground mt-1" dir="ltr" /></div>
            <div><Label className="text-muted-foreground text-xs">תקציב שנתי</Label><Input value={String(form.budget || 0)} onChange={e => setForm(f => ({ ...f, budget: Number(e.target.value) }))} type="number" className="bg-input border-border text-foreground mt-1" dir="ltr" /></div>
            <div><Label className="text-muted-foreground text-xs">מספר עובדים</Label><Input value={String(form.employeeCount || 0)} onChange={e => setForm(f => ({ ...f, employeeCount: Number(e.target.value) }))} type="number" className="bg-input border-border text-foreground mt-1" dir="ltr" /></div>
            <div><Label className="text-muted-foreground text-xs">סטטוס</Label>
              <select value={String(form.status || "active")} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                <option value="active">פעיל</option>
                <option value="inactive">לא פעיל</option>
              </select>
            </div>
          </div>
          <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">תיאור</h3></div>
          <div><textarea value={String(form.description || "")} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground resize-none" placeholder="תפקיד המחלקה..." /></div>
        </div>
        <div className="flex items-center gap-2 p-4 border-t border-border justify-end"><Button variant="outline" onClick={() => { setShowCreate(false); setEditId(null); }} className="border-border">ביטול</Button><Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 gap-1">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{editId ? "עדכן" : "שמור"}</Button></div>
      </div></div>}

      {dr && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowDetail(null)}><div className="bg-card border border-border rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><div className="flex items-center gap-3"><h2 className="text-lg font-bold text-foreground">{dr.name}</h2><Badge className={`${SC[dr.status] || SC.active} border-0`}>{STATUS_LABELS[dr.status] || dr.status}</Badge></div><Button variant="ghost" size="sm" onClick={() => setShowDetail(null)}><X className="h-4 w-4" /></Button></div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">שם</p><p className="text-foreground mt-1 font-medium">{dr.name}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">קוד</p><p className="text-foreground mt-1 font-medium">{dr.code}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">מנהל</p><p className="text-foreground mt-1 font-medium">{dr.manager}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">עובדים</p><p className="text-foreground mt-1 font-medium">{dr.employee_count}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">תקציב</p><p className="text-foreground mt-1 font-medium">{fmt(Number(dr.budget))}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">מחלקת אב</p><p className="text-foreground mt-1 font-medium">{dr.parent_department || "—"}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">מיקום</p><p className="text-foreground mt-1 font-medium">{dr.location}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">טלפון</p><p className="text-foreground mt-1 font-medium">{dr.phone}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">אימייל</p><p className="text-foreground mt-1 font-medium">{dr.email}</p></div>
          </div>
          {dr.description && <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">תיאור</p><p className="text-foreground mt-1">{dr.description}</p></div>}
        </div>
        <div className="flex items-center gap-2 p-4 border-t border-border justify-end"><Button variant="outline" className="border-border gap-1"><Printer className="h-4 w-4" />הדפסה</Button><Button onClick={() => { openEdit(dr); setShowDetail(null); }} className="bg-blue-600 hover:bg-blue-700 gap-1"><Edit2 className="h-4 w-4" />ערוך</Button></div>
      </div></div>}

      {deleteConfirm && <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}><div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}><div className="p-6 text-center space-y-4"><div className="mx-auto w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center"><Trash2 className="h-6 w-6 text-red-400" /></div><h3 className="text-lg font-bold text-foreground">אישור מחיקה</h3><p className="text-muted-foreground">{"_bulk" in deleteConfirm ? `למחוק ${deleteConfirm.count} רשומות?` : `למחוק את '${(deleteConfirm as Dept).name}'?`} פעולה זו אינה ניתנת לביטול.</p></div><div className="flex items-center gap-2 p-4 border-t border-border justify-end"><Button variant="outline" onClick={() => setDeleteConfirm(null)} className="border-border">ביטול</Button><Button onClick={async () => { if ("_bulk" in deleteConfirm) { for (const id of selected) { await authFetch(`/api/settings/departments/${id}`, { method: "DELETE" }); } setSelected(new Set()); } else { await handleDelete((deleteConfirm as Dept).id); } setDeleteConfirm(null); await load(); }} className="bg-red-600 hover:bg-red-700 gap-1"><Trash2 className="h-4 w-4" />מחק לצמיתות</Button></div></div></div>}
    </div>
  );
}
