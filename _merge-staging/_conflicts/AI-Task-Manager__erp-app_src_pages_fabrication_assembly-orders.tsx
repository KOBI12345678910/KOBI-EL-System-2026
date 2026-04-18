import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Download, Plus, Search, Printer, Upload, MoreHorizontal, ChevronRight, ChevronLeft, X, Save, Eye, Edit2, Trash2, ChevronsUpDown, Clock, Loader2, AlertCircle } from "lucide-react";
import { authFetch } from "@/lib/utils";
import { translateStatus } from "@/lib/status-labels";

const STATUSES = ["pending", "in_progress", "completed"] as const;
const STATUS_HE: Record<string, string> = { pending: "ממתין", in_progress: "בהרכבה", completed: "הושלם" };
const SC: Record<string, string> = { pending: "bg-gray-500/20 text-gray-300", in_progress: "bg-yellow-500/20 text-yellow-300", completed: "bg-green-500/20 text-green-300" };
const PRIORITIES: Record<string, string> = { normal: "רגיל", urgent: "דחוף", vip: "VIP" };
const PC: Record<string, string> = { normal: "text-gray-300", urgent: "text-orange-400", vip: "text-red-400" };

export default function AssemblyOrdersPage() {
  const [data, setData] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } };

  const load = useCallback(async () => {
    try {
      const [dataRes, statsRes] = await Promise.all([
        authFetch("/api/assembly-orders"),
        authFetch("/api/assembly-orders/stats"),
      ]);
      if (dataRes.ok) { const j = await dataRes.json(); setData(Array.isArray(j) ? j : []); }
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e: any) { setError(e.message); }
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const method = editId ? "PUT" : "POST";
      const url = editId ? `/api/assembly-orders/${editId}` : "/api/assembly-orders";
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "שגיאה"); }
      setShowCreate(false); setEditId(null); setForm({});
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    try {
      await authFetch(`/api/assembly-orders/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) { setError(e.message); }
    setDeleteConfirm(null);
  };

  const handleBulkDelete = async () => {
    await Promise.allSettled([...selected].map(id => authFetch(`/api/assembly-orders/${id}`, { method: "DELETE" })));
    setSelected(new Set()); setDeleteConfirm(null); await load();
  };

  const openEdit = (row: any) => {
    setForm({ assemblyNumber: row.assembly_number, productName: row.product_name, productType: row.product_type, assignedTo: row.assigned_to, estimatedMinutes: row.estimated_minutes, priority: row.priority, status: row.status, notes: row.notes });
    setEditId(row.id); setShowCreate(true);
  };

  const filtered = useMemo(() => {
    let d = [...data];
    if (search) { const s = search.toLowerCase(); d = d.filter(r => r.assembly_number?.toLowerCase().includes(s) || r.product_name?.toLowerCase().includes(s) || r.assigned_to?.toLowerCase().includes(s)); }
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    if (sortField) d.sort((a: any, b: any) => { const av = a[sortField], bv = b[sortField]; const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""), "he"); return sortDir === "asc" ? cmp : -cmp; });
    return d;
  }, [data, search, statusFilter, sortField, sortDir]);

  const tp = Math.ceil(filtered.length / perPage);
  const pd = filtered.slice((page - 1) * perPage, page * perPage);
  const allSel = pd.length > 0 && pd.every(r => selected.has(r.id));
  const SI = ({ field }: { field: string }) => <ChevronsUpDown className="h-3 w-3 opacity-40" />;
  const af = [statusFilter !== "all"].filter(Boolean).length;
  const dr = showDetail ? data.find(r => r.id === showDetail) : null;

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2 text-red-400 text-sm"><AlertCircle className="h-4 w-4" />{error}<Button variant="ghost" size="sm" onClick={() => setError(null)}><X className="h-3 w-3" /></Button></div>}
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><CheckCircle2 className="h-6 w-6 text-blue-400" />הזמנות הרכבה</h1><p className="text-sm text-muted-foreground mt-1">ניהול הרכבה, מעקב צוותים ובקרת איכות</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="border-border text-gray-300 gap-1"><Printer className="h-4 w-4" />הדפסה</Button>
          <Button onClick={() => { setForm({}); setEditId(null); setShowCreate(true); }} className="bg-blue-600 hover:bg-blue-700 gap-2"><Plus className="h-4 w-4" />הזמנה חדשה</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: "סה״כ", v: stats.total || 0, c: "text-blue-400" },
          { l: "ממתינים", v: stats.pending || 0, c: "text-gray-400" },
          { l: "בהרכבה", v: stats.in_progress || 0, c: "text-yellow-400" },
          { l: "הושלמו", v: stats.completed || 0, c: "text-green-400" },
        ].map((k, i) => (
          <Card key={i} className="bg-card/80 border-border"><CardContent className="p-4">{isLoading ? <div className="space-y-2 animate-pulse"><div className="h-3 w-16 bg-muted rounded" /><div className="h-6 w-20 bg-muted rounded" /></div> : <div><p className="text-[11px] text-muted-foreground">{k.l}</p><p className={`text-lg font-bold font-mono mt-1 ${k.c}`}>{k.v}</p></div>}</CardContent></Card>
        ))}
      </div>

      <Card className="bg-card/60 border-border"><CardContent className="p-3"><div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="חיפוש..." className="pr-9 bg-input border-border text-foreground" /></div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסטטוסים</option>{STATUSES.map(s => <option key={s} value={s}>{STATUS_HE[s]}</option>)}</select>
        {af > 0 && <Button variant="ghost" size="sm" onClick={() => { setStatusFilter("all"); setSearch(""); }} className="text-red-400 hover:text-red-300 gap-1"><X className="h-3 w-3" />נקה</Button>}
      </div></CardContent></Card>

      {selected.size > 0 && <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3"><span className="text-sm text-blue-300">{selected.size} נבחרו</span><Button onClick={() => setDeleteConfirm({ _bulk: true, count: selected.size })} size="sm" variant="outline" className="border-red-500/30 text-red-300 gap-1"><Trash2 className="h-3 w-3" />מחק</Button><Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="text-gray-400 mr-auto">בטל</Button></div>}

      <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
        <th className="p-3 w-10"><input type="checkbox" checked={allSel} onChange={() => { if (allSel) setSelected(new Set()); else setSelected(new Set(pd.map(r => r.id))); }} className="rounded" /></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("assembly_number")}>מזהה<SI field="assembly_number" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("product_name")}>מוצר<SI field="product_name" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("product_type")}>סוג<SI field="product_type" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("assigned_to")}>אחראי<SI field="assigned_to" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("estimated_minutes")}>זמן (דק)<SI field="estimated_minutes" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("priority")}>עדיפות<SI field="priority" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("status")}>סטטוס<SI field="status" /></button></th>
        <th className="p-3 text-center text-muted-foreground font-medium">פעולות</th>
      </tr></thead><tbody>
        {isLoading ? Array.from({ length: 6 }).map((_, sk) => (<tr key={sk} className="border-b border-border/50"><td colSpan={99} className="p-3"><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted rounded" /><div className="h-4 w-20 bg-muted rounded" /><div className="h-4 w-32 bg-muted rounded" /><div className="h-4 w-24 bg-muted rounded" /></div></td></tr>)) : pd.length === 0 ? <tr><td colSpan={99} className="p-20 text-center"><div className="flex flex-col items-center gap-4"><CheckCircle2 className="h-16 w-16 text-muted-foreground" /><p className="text-lg font-medium text-muted-foreground">{(af > 0 || search) ? "לא נמצאו תוצאות" : "עדיין אין הזמנות הרכבה"}</p>{!(af > 0 || search) && <Button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700 gap-2 mt-2"><Plus className="h-4 w-4" />הזמנה חדשה</Button>}</div></td></tr> : pd.map(row => (
          <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
            <td className="p-3"><input type="checkbox" checked={selected.has(row.id)} onChange={() => { const s = new Set(selected); s.has(row.id) ? s.delete(row.id) : s.add(row.id); setSelected(s); }} className="rounded" /></td>
            <td className="p-3 font-mono text-xs text-blue-400">{row.assembly_number || `#${row.id}`}</td>
            <td className="p-3 text-foreground">{row.product_name || "-"}</td>
            <td className="p-3 text-muted-foreground text-xs">{row.product_type || "-"}</td>
            <td className="p-3 text-muted-foreground text-xs">{row.assigned_to || "-"}</td>
            <td className="p-3 font-mono text-muted-foreground text-center">{row.estimated_minutes || "-"}</td>
            <td className="p-3"><span className={PC[row.priority] || "text-gray-300"}>{PRIORITIES[row.priority] || row.priority || "-"}</span></td>
            <td className="p-3"><Badge className={`${SC[row.status] || "bg-gray-500/20 text-gray-300"} border-0 text-xs`}>{STATUS_HE[row.status] || translateStatus(row.status)}</Badge></td>
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
        <span className="text-sm text-muted-foreground">מציג {filtered.length > 0 ? ((page - 1) * perPage) + 1 : 0}-{Math.min(page * perPage, filtered.length)} מתוך {filtered.length}</span>
        <div className="flex items-center gap-1"><Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-8 w-8 p-0"><ChevronRight className="h-4 w-4" /></Button>{Array.from({ length: Math.min(5, tp) }, (_, i) => { const p = page <= 3 ? i + 1 : page + i - 2; if (p > tp || p < 1) return null; return <Button key={p} variant={p === page ? "default" : "ghost"} size="sm" onClick={() => setPage(p)} className={`h-8 w-8 p-0 ${p === page ? "bg-blue-600" : ""}`}>{p}</Button>; })}<Button variant="ghost" size="sm" disabled={page >= tp} onClick={() => setPage(p => p + 1)} className="h-8 w-8 p-0"><ChevronLeft className="h-4 w-4" /></Button></div>
      </div></CardContent></Card>

      {showCreate && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => { setShowCreate(false); setEditId(null); }}><div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><h2 className="text-lg font-bold text-foreground">{editId ? "עריכת הזמנת הרכבה" : "הזמנה חדשה"}</h2><Button variant="ghost" size="sm" onClick={() => { setShowCreate(false); setEditId(null); }}><X className="h-4 w-4" /></Button></div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div><Label className="text-muted-foreground text-xs">מספר הרכבה *</Label><Input value={form.assemblyNumber || ""} onChange={e => setForm({ ...form, assemblyNumber: e.target.value })} placeholder="ASM-0001" className="bg-input border-border text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">שם מוצר</Label><Input value={form.productName || ""} onChange={e => setForm({ ...form, productName: e.target.value })} placeholder="דלת כניסה" className="bg-input border-border text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">סוג מוצר</Label><Input value={form.productType || ""} onChange={e => setForm({ ...form, productType: e.target.value })} placeholder="חלון/דלת" className="bg-input border-border text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">אחראי</Label><Input value={form.assignedTo || ""} onChange={e => setForm({ ...form, assignedTo: e.target.value })} placeholder="שם" className="bg-input border-border text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">זמן משוער (דקות)</Label><Input type="number" value={form.estimatedMinutes || ""} onChange={e => setForm({ ...form, estimatedMinutes: Number(e.target.value) })} className="bg-input border-border text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">עדיפות</Label><select value={form.priority || "normal"} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option value="normal">רגיל</option><option value="urgent">דחוף</option><option value="vip">VIP</option></select></div>
            <div><Label className="text-muted-foreground text-xs">סטטוס</Label><select value={form.status || "pending"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">{STATUSES.map(s => <option key={s} value={s}>{STATUS_HE[s]}</option>)}</select></div>
          </div>
          <div><Label className="text-muted-foreground text-xs">הערות</Label><textarea rows={3} value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" /></div>
        </div>
        <div className="flex items-center gap-2 p-4 border-t border-border justify-end"><Button variant="outline" onClick={() => { setShowCreate(false); setEditId(null); }} className="border-border">ביטול</Button><Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 gap-1">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{editId ? "עדכן" : "שמור"}</Button></div>
      </div></div>}

      {dr && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowDetail(null)}><div className="bg-card border border-border rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><div className="flex items-center gap-3"><h2 className="text-lg font-bold text-foreground">{dr.assembly_number || `#${dr.id}`}</h2><Badge className={`${SC[dr.status] || ""} border-0`}>{STATUS_HE[dr.status] || dr.status}</Badge></div><Button variant="ghost" size="sm" onClick={() => setShowDetail(null)}><X className="h-4 w-4" /></Button></div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          {[["מוצר", dr.product_name], ["סוג", dr.product_type], ["מערכת", dr.system_name], ["אחראי", dr.assigned_to], ["זמן משוער (דק)", dr.estimated_minutes], ["זמן בפועל (דק)", dr.actual_minutes], ["עדיפות", PRIORITIES[dr.priority] || dr.priority], ["תוצאת בדיקה", dr.qc_result], ["נוצר", dr.created_at ? new Date(dr.created_at).toLocaleDateString("he-IL") : "-"]].map(([l, v], i) => (
            <div key={i} className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">{l}</p><p className="text-foreground mt-1 font-medium">{v || "-"}</p></div>
          ))}
        </div>
        <div className="flex items-center gap-2 p-4 border-t border-border justify-end"><Button onClick={() => { openEdit(dr); setShowDetail(null); }} className="bg-blue-600 hover:bg-blue-700 gap-1"><Edit2 className="h-4 w-4" />ערוך</Button></div>
      </div></div>}

      {deleteConfirm && <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}><div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}><div className="p-6 text-center space-y-4"><div className="mx-auto w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center"><Trash2 className="h-6 w-6 text-red-400" /></div><h3 className="text-lg font-bold text-foreground">אישור מחיקה</h3><p className="text-muted-foreground">{deleteConfirm._bulk ? `למחוק ${deleteConfirm.count} רשומות?` : `למחוק ${deleteConfirm.assembly_number || deleteConfirm.id}?`}</p></div><div className="flex items-center gap-2 p-4 border-t border-border justify-end"><Button variant="outline" onClick={() => setDeleteConfirm(null)} className="border-border">ביטול</Button><Button onClick={() => { if (deleteConfirm._bulk) handleBulkDelete(); else handleDelete(deleteConfirm.id); }} className="bg-red-600 hover:bg-red-700 gap-1"><Trash2 className="h-4 w-4" />מחק</Button></div></div></div>}
    </div>
  );
}
