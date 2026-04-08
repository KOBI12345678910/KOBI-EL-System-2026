import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Award, Download, Plus, Search, Printer, Upload, MoreHorizontal, ChevronRight, ChevronLeft, ArrowUp, ArrowDown, X, Save, Eye, Edit2, Trash2, Copy, FileSpreadsheet, TrendingUp, TrendingDown, ChevronsUpDown, Clock, CheckCircle2, Send, Target, DollarSign, Users, AlertCircle, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import ImportButton from "@/components/import-button";

const fmt = (v: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v / 100);
const STATUSES = ["טיוטה", "ממתין לאישור", "מאושר", "שולם", "נדחה"] as const;
const SC: Record<string, string> = { "טיוטה": "bg-gray-500/20 text-gray-300", "ממתין לאישור": "bg-yellow-500/20 text-yellow-300", "מאושר": "bg-blue-500/20 text-blue-300", "שולם": "bg-green-500/20 text-green-300", "נדחה": "bg-red-500/20 text-red-300" };
const TYPES = ["בונוס שנתי", "בונוס רבעוני", "בונוס ביצועים", "בונוס חד-פעמי", "מענק חג", "מענק לידה", "בונוס המלצה", "בונוס פרויקט"];
const DEPTS = ["ייצור", "הנהלה", "כספים", "שיווק", "לוגיסטיקה", "טכנולוגיה", "מכירות", "משאבי אנוש"];
const EMP = ["יוסי כהן", "שרה לוי", "דוד מזרחי", "רחל אברהם", "אלון גולדשטיין", "מיכל ברק", "עומר חדד", "נועה פרידמן", "איתן רוזנברג", "תמר שלום"];
export default function Bonuses() {
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [sortField, setSortField] = useState("effectiveDate");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
      const [deleteConfirm, setDeleteConfirm] = useState<any>(null);

  const filtered = useMemo(() => {
    let d = [...data];
    if (search) { const s = search.toLowerCase(); d = d.filter(r => r.employee.includes(s) || r.id.toLowerCase().includes(s) || r.type.includes(s)); }
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    if (typeFilter !== "all") d = d.filter(r => r.type === typeFilter);
    if (deptFilter !== "all") d = d.filter(r => r.department === deptFilter);
    return d;
  }, [search, statusFilter, typeFilter, deptFilter]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const pd = filtered.slice((page - 1) * perPage, page * perPage);
  const allSel = pd.length > 0 && pd.every(r => selected.has(r.id));
  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } };

      const load = useCallback(async () => {
    try {
      setError(null);
      const res = await authFetch("/api/hr/bonuses");
      if (res.ok) {
        const j = await res.json();
        setData(Array.isArray(j) ? j : j.data || j.items || []);
      }
    } catch (e: any) { setError(e.message); }
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  const SI = ({ field }: { field: string }) => sortField !== field ? <ChevronsUpDown className="h-3 w-3 opacity-40" /> : sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-blue-400" /> : <ArrowDown className="h-3 w-3 text-blue-400" />;
  const af = [statusFilter !== "all", typeFilter !== "all", deptFilter !== "all"].filter(Boolean).length;
  const dr = showDetail ? data.find(r => r.id === showDetail) : null;
  const totalAmt = filtered.reduce((s, r) => s + r.amount, 0);
  const paidCt = filtered.filter(r => r.status === "שולם").length;
  const handleSave = async () => {
    setSaving(true);
    try {
      const method = editId ? "PUT" : "POST";
      const url = editId ? `/api/hr/bonuses/${editId}` : "/api/hr/bonuses";
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "שגיאה בשמירה"); }
      setShowCreate(false); setEditId(null); setForm({});
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id: any) => {
    try {
      await authFetch(`/api/hr/bonuses/${id}`, { method: "DELETE" });
      setDeleteConfirm(null);
      await load();
    } catch (e: any) { setError(e.message); }
  };


  return (
    <div className="p-6 space-y-4" dir="rtl">
      {error && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400"><AlertCircle className="h-4 w-4 flex-shrink-0" /><span className="text-sm">{error}</span><button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button></div>}
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Award className="h-6 w-6 text-amber-400" />בונוסים ומענקים</h1><p className="text-sm text-muted-foreground mt-1">ניהול בונוסים, מענקים ותמריצים לעובדים</p></div>
        <div className="flex gap-2">
          <ImportButton apiRoute="/api/hr/bonuses" onSuccess={load} />
          <Button variant="outline" size="sm" className="border-border text-gray-300 gap-1"><FileSpreadsheet className="h-4 w-4" />ייצוא Excel</Button>
          <Button variant="outline" size="sm" className="border-border text-gray-300 gap-1"><Printer className="h-4 w-4" />הדפסה</Button>
          <Button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700 gap-2"><Plus className="h-4 w-4" />בונוס חדש</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[{ l: "סה\"כ בונוסים", v: String(filtered.length), c: "text-amber-400", t: "+8", u: true },
          { l: "סכום כולל", v: fmt(totalAmt), c: "text-emerald-400", t: "+15%", u: true },
          { l: "ממוצע", v: fmt(filtered.length ? totalAmt / filtered.length : 0), c: "text-blue-400", t: "+7%", u: true },
          { l: "שולמו", v: String(paidCt), c: "text-green-400", t: `${Math.round(paidCt/Math.max(1,filtered.length)*100)}%`, u: true },
          { l: "ממתינים", v: String(filtered.filter(r => r.status === "ממתין לאישור").length), c: "text-yellow-400", t: "5", u: false },
          { l: "KPI ממוצע", v: `${filtered.length ? Math.round(filtered.reduce((s, r) => s + r.kpiScore, 0) / filtered.length) : 0}%`, c: "text-purple-400", t: "+3", u: true }
        ].map((k, i) => (
          <Card key={i} className="bg-card/80 border-border hover:border-border transition-colors"><CardContent className="p-4">{isLoading ? <div className="space-y-2 animate-pulse"><div className="h-3 w-16 bg-muted rounded" /><div className="h-6 w-20 bg-muted rounded" /><div className="h-3 w-12 bg-muted rounded" /></div> : <div className="flex items-start justify-between"><div><p className="text-[11px] text-muted-foreground">{k.l}</p><p className={`text-lg font-bold font-mono mt-1 ${k.c}`}>{k.v}</p><div className="flex items-center gap-1 mt-1">{k.u ? <TrendingUp className="h-3 w-3 text-green-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}<span className={`text-[10px] ${k.u ? "text-green-400" : "text-red-400"}`}>{k.t}</span></div></div></div>}</CardContent></Card>
        ))}
      </div>

      <Card className="bg-card/60 border-border"><CardContent className="p-3"><div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="חיפוש..." className="pr-9 bg-input border-border text-foreground" /></div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסטטוסים</option>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסוגים</option>{TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
        <select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל המחלקות</option>{DEPTS.map(d => <option key={d} value={d}>{d}</option>)}</select>
        {af > 0 && <Button variant="ghost" size="sm" onClick={() => { setStatusFilter("all"); setTypeFilter("all"); setDeptFilter("all"); setSearch(""); }} className="text-red-400 hover:text-red-300 gap-1"><X className="h-3 w-3" />נקה ({af})</Button>}
      </div></CardContent></Card>

      {selected.size > 0 && <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3"><span className="text-sm text-blue-300">{selected.size} נבחרו</span><Button size="sm" variant="outline" className="border-blue-500/30 text-blue-300 gap-1"><CheckCircle2 className="h-3 w-3" />אשר</Button><Button onClick={()=>setDeleteConfirm({_bulk:true,count:selected.size})} size="sm" variant="outline" className="border-red-500/30 text-red-300 gap-1"><Trash2 className="h-3 w-3" />מחק</Button><Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="text-gray-400 mr-auto">בטל</Button></div>}

      <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
        <th className="p-3 w-10"><input type="checkbox" checked={allSel} onChange={() => { if (allSel) setSelected(new Set()); else setSelected(new Set(pd.map(r => r.id))); }} className="rounded" /></th>
        <th className="p-3 text-right text-muted-foreground font-medium">מזהה</th>
        <th className="p-3 text-right text-muted-foreground font-medium cursor-pointer" onClick={() => toggleSort("employee")}><div className="flex items-center gap-1">עובד<SI field="employee" /></div></th>
        <th className="p-3 text-right text-muted-foreground font-medium">מחלקה</th>
        <th className="p-3 text-right text-muted-foreground font-medium cursor-pointer" onClick={() => toggleSort("type")}><div className="flex items-center gap-1">סוג<SI field="type" /></div></th>
        <th className="p-3 text-right text-muted-foreground font-medium cursor-pointer" onClick={() => toggleSort("amount")}><div className="flex items-center gap-1">סכום<SI field="amount" /></div></th>
        <th className="p-3 text-right text-muted-foreground font-medium">%</th>
        <th className="p-3 text-right text-muted-foreground font-medium">סיבה</th>
        <th className="p-3 text-right text-muted-foreground font-medium">KPI</th>
        <th className="p-3 text-right text-muted-foreground font-medium">תקופה</th>
        <th className="p-3 text-right text-muted-foreground font-medium cursor-pointer" onClick={() => toggleSort("status")}><div className="flex items-center gap-1">סטטוס<SI field="status" /></div></th>
        <th className="p-3 text-center text-muted-foreground font-medium">פעולות</th>
      </tr></thead><tbody>
        {isLoading ? Array.from({length:8}).map((_,sk) => (<tr key={sk} className="border-b border-border/50"><td colSpan={99} className="p-3"><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted rounded" /><div className="h-4 w-16 bg-muted rounded" /><div className="h-4 w-32 bg-muted rounded" /><div className="h-4 w-24 bg-muted rounded" /><div className="h-4 w-20 bg-muted rounded" /><div className="h-4 w-16 bg-muted rounded" /><div className="h-4 w-28 bg-muted rounded" /><div className="h-4 w-12 bg-muted rounded" /></div></td></tr>)) : pd.length === 0 ? <tr><td colSpan={99} className="p-20 text-center"><div className="flex flex-col items-center gap-4">{(af > 0 || search) ? <Search className="h-16 w-16 text-muted-foreground" /> : <Award className="h-16 w-16 text-muted-foreground" />}<p className="text-lg font-medium text-muted-foreground">{(af > 0 || search) ? "לא נמצאו תוצאות" : "עדיין אין בונוסים ומענקים"}</p><p className="text-sm text-muted-foreground/60">{(af > 0 || search) ? "נסה לשנות את מונחי החיפוש או הסינון" : "בונוס חדש ותתחיל לעבוד"}</p>{!(af > 0 || search) && <Button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700 gap-2 mt-2"><Plus className="h-4 w-4" />בונוס חדש</Button>}</div></td></tr> : pd.map(row => (
          <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
            <td className="p-3"><input type="checkbox" checked={selected.has(row.id)} onChange={() => { const s = new Set(selected); s.has(row.id) ? s.delete(row.id) : s.add(row.id); setSelected(s); }} className="rounded" /></td>
            <td className="p-3 font-mono text-xs text-blue-400">{row.id}</td>
            <td className="p-3"><div className="font-medium text-foreground">{row.employee}</div><div className="text-xs text-muted-foreground">{row.employeeId}</div></td>
            <td className="p-3 text-muted-foreground">{row.department}</td>
            <td className="p-3"><Badge variant="outline" className="text-xs border-border">{row.type}</Badge></td>
            <td className="p-3 font-mono font-bold text-emerald-400">{fmt(row.amount)}</td>
            <td className="p-3 font-mono text-muted-foreground">{row.percentage}%</td>
            <td className="p-3 text-muted-foreground text-xs">{row.reason}</td>
            <td className="p-3"><div className="flex items-center gap-1"><div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${row.kpiScore}%`, background: row.kpiScore >= 80 ? "#22c55e" : row.kpiScore >= 60 ? "#eab308" : "#ef4444" }} /></div><span className="text-xs text-muted-foreground">{row.kpiScore}</span></div></td>
            <td className="p-3 text-muted-foreground text-xs">{row.period}</td>
            <td className="p-3"><Badge className={`${SC[row.status]} border-0 text-xs`}>{row.status}</Badge></td>
            <td className="p-3 text-center"><div className="relative inline-block"><Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setMenuOpen(menuOpen === row.id ? null : row.id)}><MoreHorizontal className="h-4 w-4" /></Button>
              {menuOpen === row.id && <div className="absolute left-0 top-8 z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[150px]" onMouseLeave={() => setMenuOpen(null)}>
                <button onClick={() => { setShowDetail(row.id); setMenuOpen(null); }} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2"><Eye className="h-4 w-4" />צפייה</button>
                <button onClick={() => { setEditId(row.id); setShowCreate(true); setMenuOpen(null); }} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2"><Edit2 className="h-4 w-4" />עריכה</button>
                <button onClick={async () => { const _dup = await duplicateRecord("/api/hr/bonuses", row.id); if (_dup.ok) { setMenuOpen(null); load(); } else { alert("שגיאה בשכפול: " + _dup.error); } }} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2"><Copy className="h-4 w-4" />שכפול</button>
                <hr className="border-border my-1" /><button onClick={()=>{setDeleteConfirm(row);setMenuOpen(null)}} className="w-full px-3 py-2 text-right text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"><Trash2 className="h-4 w-4" />מחיקה</button>
              </div>}</div></td>
          </tr>
        ))}
      </tbody></table></div>
      <div className="flex items-center justify-between p-3 border-t border-border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><span>מציג {((page-1)*perPage)+1}-{Math.min(page*perPage,filtered.length)} מתוך {filtered.length}</span><select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }} className="bg-input border border-border rounded px-2 py-1 text-xs text-foreground">{[10,25,50,100].map(n => <option key={n} value={n}>{n} שורות</option>)}</select></div>
        <div className="flex items-center gap-1"><Button variant="ghost" size="sm" disabled={page<=1} onClick={() => setPage(p=>p-1)} className="h-8 w-8 p-0"><ChevronRight className="h-4 w-4" /></Button>{Array.from({length:Math.min(5,totalPages)},(_,i)=>{const p=page<=3?i+1:page+i-2;if(p>totalPages||p<1)return null;return <Button key={p} variant={p===page?"default":"ghost"} size="sm" onClick={()=>setPage(p)} className={`h-8 w-8 p-0 ${p===page?"bg-blue-600":""}`}>{p}</Button>})}<Button variant="ghost" size="sm" disabled={page>=totalPages} onClick={() => setPage(p=>p+1)} className="h-8 w-8 p-0"><ChevronLeft className="h-4 w-4" /></Button></div>
      </div></CardContent></Card>

      {showCreate && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => { setShowCreate(false); setEditId(null); }}><div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><h2 className="text-lg font-bold text-foreground">{editId ? "עריכת בונוס" : "בונוס חדש"}</h2><Button variant="ghost" size="sm" onClick={() => { setShowCreate(false); setEditId(null); }}><X className="h-4 w-4" /></Button></div>
        <div className="p-4 space-y-6">
          <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">פרטי עובד</h3></div>
          <div className="grid grid-cols-3 gap-4">
            <div><Label className="text-muted-foreground text-xs">עובד *</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option>בחר עובד...</option>{EMP.map(e => <option key={e}>{e}</option>)}</select></div>
            <div><Label className="text-muted-foreground text-xs">מחלקה *</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option>בחר...</option>{DEPTS.map(d => <option key={d}>{d}</option>)}</select></div>
            <div><Label className="text-muted-foreground text-xs">תקופה</Label><Input placeholder="Q1 2026" className="bg-input border-border text-foreground mt-1" /></div>
          </div>
          <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">פרטי בונוס</h3></div>
          <div className="grid grid-cols-3 gap-4">
            <div><Label className="text-muted-foreground text-xs">סוג בונוס *</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option>בחר...</option>{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div><Label className="text-muted-foreground text-xs">סכום (אג׳) *</Label><Input type="number" placeholder="0" className="bg-input border-border text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">אחוז משכר</Label><Input type="number" placeholder="0" className="bg-input border-border text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">סיבה *</Label><Input placeholder="ביצועים מעולים" className="bg-input border-border text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">ציון KPI</Label><Input type="number" placeholder="0-100" className="bg-input border-border text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">תאריך אפקטיבי *</Label><Input type="date" className="bg-input border-border text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">חייב במס</Label><div className="mt-2"><input type="checkbox" defaultChecked className="rounded" /><span className="text-sm text-foreground mr-2">כן</span></div></div>
            <div><Label className="text-muted-foreground text-xs">מאשר</Label><Input placeholder="שם המאשר" className="bg-input border-border text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">סטטוס</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">{STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
          </div>
          <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">מידע נוסף</h3></div>
          <div className="grid grid-cols-1 gap-4">
            <div><Label className="text-muted-foreground text-xs">הערות</Label><textarea rows={3} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" placeholder="הערות..." /></div>
            <div><Label className="text-muted-foreground text-xs">קבצים</Label><div className="border-2 border-dashed border-border rounded-lg p-6 text-center mt-1"><Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">גרור קבצים או לחץ לבחירה</p></div></div>
          </div>
        </div>
        <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
          <Button variant="outline" onClick={() => { setShowCreate(false); setEditId(null); }} className="border-border">ביטול</Button>
          <Button variant="outline" className="border-blue-500/30 text-blue-300">שמור והמשך</Button>
          <Button className="bg-blue-600 hover:bg-blue-700 gap-1"><Save className="h-4 w-4" />{editId ? "עדכן" : "שמור"}</Button>
        </div>
      </div></div>}

      {dr && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowDetail(null)}><div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><div className="flex items-center gap-3"><h2 className="text-lg font-bold text-foreground">{dr.id} — {dr.employee}</h2><Badge className={`${SC[dr.status]} border-0`}>{dr.status}</Badge></div><Button variant="ghost" size="sm" onClick={() => setShowDetail(null)}><X className="h-4 w-4" /></Button></div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[{l:"עובד",v:dr.employee},{l:"מזהה",v:dr.employeeId},{l:"מחלקה",v:dr.department},{l:"סוג",v:dr.type},{l:"סכום",v:fmt(dr.amount)},{l:"אחוז",v:`${dr.percentage}%`},{l:"סיבה",v:dr.reason},{l:"תקופה",v:dr.period},{l:"KPI",v:`${dr.kpiScore}%`},{l:"חייב במס",v:dr.taxable?"כן":"לא"},{l:"תאריך",v:new Date(dr.effectiveDate).toLocaleDateString("he-IL")},{l:"מאשר",v:dr.approvedBy||"טרם אושר"}].map((f,i) => <div key={i} className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">{f.l}</p><p className="text-foreground mt-1 font-medium">{f.v}</p></div>)}
          </div>
          {dr.notes && <div className="bg-input rounded-lg p-3"><p className="text-xs text-muted-foreground">הערות</p><p className="text-sm text-foreground mt-1">{dr.notes}</p></div>}
          <h3 className="text-sm font-semibold text-blue-400 border-b border-border pb-2">היסטוריה</h3>
          <div className="space-y-2">{[{t:"10:30",d:"01/01/2026",a:"נוצר",u:"מערכת"},{t:"14:15",d:"02/01/2026",a:"נשלח לאישור",u:"משאבי אנוש"},{t:"09:00",d:"03/01/2026",a:"אושר",u:"מנהל"}].map((a,i)=><div key={i} className="flex items-center gap-3 text-sm p-2 rounded bg-background/50"><Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" /><span className="text-muted-foreground text-xs min-w-[50px]">{a.t}</span><span className="text-muted-foreground text-xs min-w-[80px]">{a.d}</span><span className="text-foreground">{a.a}</span><span className="text-muted-foreground mr-auto">{a.u}</span></div>)}</div>
        </div>
        <div className="flex items-center gap-2 p-4 border-t border-border justify-end"><Button variant="outline" className="border-border gap-1"><Printer className="h-4 w-4" />הדפסה</Button><Button onClick={() => { setEditId(dr.id); setShowDetail(null); setShowCreate(true); }} className="bg-blue-600 hover:bg-blue-700 gap-1"><Edit2 className="h-4 w-4" />ערוך</Button></div>
      </div></div>}
    </div>
  );
}
