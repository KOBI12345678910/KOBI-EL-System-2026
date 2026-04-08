import { useState, useMemo, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import ImportButton from "@/components/import-button";
    import { Card, CardContent } from "@/components/ui/card";
    import { Button } from "@/components/ui/button";
    import { Input } from "@/components/ui/input";
    import { Label } from "@/components/ui/label";
    import { Badge } from "@/components/ui/badge";
    import { CheckCircle2, Download, Plus, Search, Printer, Upload, MoreHorizontal, ChevronRight, ChevronLeft, ArrowUp, ArrowDown, X, Save, Eye, Edit2, Trash2, Copy, FileSpreadsheet, TrendingUp, TrendingDown, ChevronsUpDown, Clock, Send, AlertCircle, Loader2 } from "lucide-react";

    const fmt = (v: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v / 100);
    const STATUSES = ["טיוטה", "פעיל", "בשימוש", "ארכיון"] as const;
    const SC: Record<string, string> = { "טיוטה": "bg-gray-500/20 text-gray-300", "פעיל": "bg-green-500/20 text-green-300", "בשימוש": "bg-blue-500/20 text-blue-300", "ארכיון": "bg-purple-500/20 text-purple-300" };
    const CATS = ["חומרי גלם","בתהליך","מוצר מוגמר","אריזה","משלוח"];
    const EMP = ["יוסי כהן","שרה לוי","דוד מזרחי","רחל אברהם","אלון גולדשטיין","מיכל ברק","עומר חדד","נועה פרידמן","איתן רוזנברג","תמר שלום"];
export default function QualityChecklists() {
      const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
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

      const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } };

      const load = useCallback(async () => {
    try {
      setError(null);
      const res = await authFetch("/api/quality-inspections");
      if (res.ok) {
        const j = await res.json();
        setData(Array.isArray(j) ? j : j.data || j.items || []);
      }
    } catch (e: any) { setError(e.message); }
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

      const filtered = useMemo(() => {
        let d = [...data];
        if (search) { const s = search.toLowerCase(); d = d.filter(r => r.id?.toLowerCase().includes(s) || r.title?.toLowerCase().includes(s) || r.stage?.toLowerCase().includes(s) || r.department?.toLowerCase().includes(s)); }
        if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
      if (catFilter !== "all") d = d.filter(r => r.stage === catFilter);
        if (sortField) d.sort((a: any, b: any) => { const av = a[sortField], bv = b[sortField]; const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv), "he"); return sortDir === "asc" ? cmp : -cmp; });
        return d;
      }, [search, statusFilter, catFilter, sortField, sortDir]);

      const tp = Math.ceil(filtered.length / perPage);
      const pd = filtered.slice((page - 1) * perPage, page * perPage);
      const allSel = pd.length > 0 && pd.every(r => selected.has(r.id));
      const SI = ({ field }: { field: string }) => <ChevronsUpDown className="h-3 w-3 opacity-40" />;
      const af = [statusFilter !== "all", catFilter !== "all"].filter(Boolean).length;
      const dr = showDetail ? data.find(r => r.id === showDetail) : null;
  const handleSave = async () => {
    setSaving(true);
    try {
      const method = editId ? "PUT" : "POST";
      const url = editId ? `/api/quality-inspections/${editId}` : "/api/quality-inspections";
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "שגיאה בשמירה"); }
      setShowCreate(false); setEditId(null); setForm({});
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id: any) => {
    try {
      await authFetch(`/api/quality-inspections/${id}`, { method: "DELETE" });
      setDeleteConfirm(null);
      await load();
    } catch (e: any) { setError(e.message); }
  };


      return (
        <div className="p-6 space-y-4" dir="rtl">
      {error && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400"><AlertCircle className="h-4 w-4 flex-shrink-0" /><span className="text-sm">{error}</span><button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button></div>}
          <div className="flex items-center justify-between">
            <div><h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><CheckCircle2 className="h-6 w-6 text-teal-400" />רשימות ביקורת איכות</h1><p className="text-sm text-muted-foreground mt-1">ניהול צ'קליסטים, ביקורות וקריטריוני קבלה</p></div>
            <div className="flex gap-2">
              <ImportButton apiRoute="/api/quality-inspections" onSuccess={load} />
              <Button variant="outline" size="sm" className="border-border text-gray-300 gap-1"><FileSpreadsheet className="h-4 w-4" />ייצוא</Button>
              <Button variant="outline" size="sm" className="border-border text-gray-300 gap-1"><Printer className="h-4 w-4" />הדפסה</Button>
              <Button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700 gap-2"><Plus className="h-4 w-4" />רשימה חדשה</Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[{"l":"רשימות","v":"56","c":"text-teal-400","t":"+4","u":true},{"l":"פעילות","v":"38","c":"text-green-400","t":"+2","u":true},{"l":"בשימוש היום","v":"12","c":"text-blue-400","t":"+3","u":true},{"l":"סעיפים כולל","v":"420","c":"text-cyan-400","t":"+30","u":true},{"l":"ממוצע סעיפים","v":"7.5","c":"text-amber-400","t":"+0.5","u":true},{"l":"עדכון אחרון","v":"היום","c":"text-emerald-400","t":"","u":true}].map((k: any, i: number) => (
              <Card key={i} className="bg-card/80 border-border hover:border-border transition-colors"><CardContent className="p-4">{isLoading ? <div className="space-y-2 animate-pulse"><div className="h-3 w-16 bg-muted rounded" /><div className="h-6 w-20 bg-muted rounded" /><div className="h-3 w-12 bg-muted rounded" /></div> : <div className="flex items-start justify-between"><div><p className="text-[11px] text-muted-foreground">{k.l}</p><p className={`text-lg font-bold font-mono mt-1 ${k.c}`}>{k.v}</p><div className="flex items-center gap-1 mt-1">{k.u ? <TrendingUp className="h-3 w-3 text-green-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}<span className={`text-[10px] ${k.u ? "text-green-400" : "text-red-400"}`}>{k.t}</span></div></div></div>}</CardContent></Card>
            ))}
          </div>

          <Card className="bg-card/60 border-border"><CardContent className="p-3"><div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="חיפוש..." className="pr-9 bg-input border-border text-foreground" /></div>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסטטוסים</option>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>
            <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל השלבים</option>{CATS.map((o: string) => <option key={o} value={o}>{o}</option>)}</select>
            {af > 0 && <Button variant="ghost" size="sm" onClick={() => { setStatusFilter("all"); setCatFilter("all"); setSearch(""); }} className="text-red-400 hover:text-red-300 gap-1"><X className="h-3 w-3" />נקה ({af})</Button>}
          </div></CardContent></Card>

          {selected.size > 0 && <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3"><span className="text-sm text-blue-300">{selected.size} נבחרו</span><Button size="sm" variant="outline" className="border-blue-500/30 text-blue-300 gap-1"><CheckCircle2 className="h-3 w-3" />אשר</Button><Button onClick={()=>setDeleteConfirm({_bulk:true,count:selected.size})} size="sm" variant="outline" className="border-red-500/30 text-red-300 gap-1"><Trash2 className="h-3 w-3" />מחק</Button><Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="text-gray-400 mr-auto">בטל</Button></div>}

          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
            <th className="p-3 w-10"><input type="checkbox" checked={allSel} onChange={() => { if (allSel) setSelected(new Set()); else setSelected(new Set(pd.map(r => r.id))); }} className="rounded" /></th>
            <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={()=>toggleSort("id")}>מזהה<SI field="id" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={()=>toggleSort("title")}>כותרת<SI field="title" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={()=>toggleSort("stage")}>שלב<SI field="stage" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={()=>toggleSort("department")}>מחלקה<SI field="department" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={()=>toggleSort("checkItems")}>סעיפים<SI field="checkItems" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={()=>toggleSort("passRate")}>שיעור עמידה<SI field="passRate" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={()=>toggleSort("frequency")}>תדירות<SI field="frequency" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={()=>toggleSort("version")}>גרסה<SI field="version" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={()=>toggleSort("status")}>סטטוס<SI field="status" /></button></th>
            <th className="p-3 text-center text-muted-foreground font-medium">פעולות</th>
          </tr></thead><tbody>
            {isLoading ? Array.from({length:8}).map((_,sk) => (<tr key={sk} className="border-b border-border/50"><td colSpan={99} className="p-3"><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted rounded" /><div className="h-4 w-16 bg-muted rounded" /><div className="h-4 w-32 bg-muted rounded" /><div className="h-4 w-24 bg-muted rounded" /><div className="h-4 w-20 bg-muted rounded" /><div className="h-4 w-16 bg-muted rounded" /><div className="h-4 w-28 bg-muted rounded" /><div className="h-4 w-12 bg-muted rounded" /></div></td></tr>)) : pd.length === 0 ? <tr><td colSpan={99} className="p-20 text-center"><div className="flex flex-col items-center gap-4">{(af > 0 || search) ? <Search className="h-16 w-16 text-muted-foreground" /> : <CheckCircle2 className="h-16 w-16 text-muted-foreground" />}<p className="text-lg font-medium text-muted-foreground">{(af > 0 || search) ? "לא נמצאו תוצאות" : "עדיין אין רשימות ביקורת איכות"}</p><p className="text-sm text-muted-foreground/60">{(af > 0 || search) ? "נסה לשנות את מונחי החיפוש או הסינון" : "רשימה חדשה ותתחיל לעבוד"}</p>{!(af > 0 || search) && <Button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700 gap-2 mt-2"><Plus className="h-4 w-4" />רשימה חדשה</Button>}</div></td></tr> : pd.map(row => (
              <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="p-3"><input type="checkbox" checked={selected.has(row.id)} onChange={() => { const s = new Set(selected); s.has(row.id) ? s.delete(row.id) : s.add(row.id); setSelected(s); }} className="rounded" /></td>
              <td className="p-3 font-mono text-xs text-blue-400">{row.id}</td>
            <td className="p-3 "><div className="font-medium text-foreground">{row.title}</div></td>
            <td className="p-3 text-muted-foreground">{row.stage}</td>
            <td className="p-3 text-muted-foreground text-xs">{row.department}</td>
            <td className="p-3 font-mono text-cyan-400 text-center">{row.checkItems}</td>
            <td className="p-3 font-mono text-green-400">{row.passRate}%</td>
            <td className="p-3 text-muted-foreground text-xs">{row.frequency}</td>
            <td className="p-3 font-mono text-muted-foreground text-xs">{row.version}</td>
            <td className="p-3 "><Badge className={`${SC[row.status]} border-0 text-xs`}>{row.status}</Badge></td>
                <td className="p-3 text-center"><div className="relative inline-block"><Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setMenuOpen(menuOpen === row.id ? null : row.id)}><MoreHorizontal className="h-4 w-4" /></Button>
                  {menuOpen === row.id && <div className="absolute left-0 top-8 z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[150px]" onMouseLeave={() => setMenuOpen(null)}>
                    <button onClick={() => { setShowDetail(row.id); setMenuOpen(null); }} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2"><Eye className="h-4 w-4" />צפייה</button>
                    <button onClick={() => { setEditId(row.id); setShowCreate(true); setMenuOpen(null); }} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2"><Edit2 className="h-4 w-4" />עריכה</button>
                    <button onClick={async () => { const _dup = await duplicateRecord("/api/quality-inspections", row.id); if (_dup.ok) { setMenuOpen(null); load(); } else { alert("שגיאה בשכפול: " + _dup.error); } }} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2"><Copy className="h-4 w-4" />שכפול</button>
                    <hr className="border-border my-1" /><button onClick={()=>{setDeleteConfirm(row);setMenuOpen(null)}} className="w-full px-3 py-2 text-right text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"><Trash2 className="h-4 w-4" />מחיקה</button>
                  </div>}</div></td>
              </tr>
            ))}
          </tbody></table></div>
          <div className="flex items-center justify-between p-3 border-t border-border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><span>מציג {((page-1)*perPage)+1}-{Math.min(page*perPage,filtered.length)} מתוך {filtered.length}</span><select value={perPage} onChange={e=>{setPerPage(Number(e.target.value));setPage(1)}} className="bg-input border border-border rounded px-2 py-1 text-xs text-foreground">{[10,25,50,100].map(n=><option key={n} value={n}>{n} שורות</option>)}</select></div>
            <div className="flex items-center gap-1"><Button variant="ghost" size="sm" disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="h-8 w-8 p-0"><ChevronRight className="h-4 w-4" /></Button>{Array.from({length:Math.min(5,tp)},(_,i)=>{const p=page<=3?i+1:page+i-2;if(p>tp||p<1)return null;return <Button key={p} variant={p===page?"default":"ghost"} size="sm" onClick={()=>setPage(p)} className={`h-8 w-8 p-0 ${p===page?"bg-blue-600":""}`}>{p}</Button>})}<Button variant="ghost" size="sm" disabled={page>=tp} onClick={()=>setPage(p=>p+1)} className="h-8 w-8 p-0"><ChevronLeft className="h-4 w-4" /></Button></div>
          </div></CardContent></Card>

          {showCreate && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={()=>{setShowCreate(false);setEditId(null)}}><div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border"><h2 className="text-lg font-bold text-foreground">{editId ? "עריכה" : "רשימה חדשה"}</h2><Button variant="ghost" size="sm" onClick={()=>{setShowCreate(false);setEditId(null)}}><X className="h-4 w-4" /></Button></div>
            <div className="p-4 space-y-6">
              <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">פרטי רשימה</h3></div>
            <div className="grid grid-cols-3 gap-4">
            <div><Label className="text-muted-foreground text-xs">כותרת *</Label><Input type="text" placeholder="שם הרשימה" className="bg-input border-border text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">שלב *</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option>בחר...</option><option>חומרי גלם</option><option>בתהליך</option><option>מוצר מוגמר</option><option>אריזה</option><option>משלוח</option></select></div>
            <div><Label className="text-muted-foreground text-xs">מחלקה</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option>בחר...</option><option>ייצור</option><option>איכות</option><option>מחסן</option><option>משלוחים</option><option>ציפוי</option></select></div>
            <div><Label className="text-muted-foreground text-xs">תדירות</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option>בחר...</option><option>כל אצוות</option><option>יומי</option><option>שבועי</option><option>חודשי</option></select></div>
            <div><Label className="text-muted-foreground text-xs">חובה</Label><div className="mt-2"><input type="checkbox" defaultChecked className="rounded" /><span className="text-sm text-foreground mr-2">כן</span></div></div>
            <div><Label className="text-muted-foreground text-xs">גרסה</Label><Input type="text" placeholder="v1.0" className="bg-input border-border text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">סטטוס</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option>בחר...</option><option>טיוטה</option><option>פעיל</option><option>בשימוש</option><option>ארכיון</option></select></div>
            </div>
          <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">סעיפי בדיקה</h3></div>
            <div className="grid grid-cols-3 gap-4">
            <div className="col-span-3"><Label className="text-muted-foreground text-xs">סעיפים</Label><textarea rows={3} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" placeholder="סעיפי ביקורת..." /></div>
            <div className="col-span-3"><Label className="text-muted-foreground text-xs">הערות</Label><textarea rows={3} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" placeholder="הערות..." /></div>
            </div>
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-border justify-end"><Button variant="outline" onClick={()=>{setShowCreate(false);setEditId(null)}} className="border-border">ביטול</Button><Button variant="outline" className="border-blue-500/30 text-blue-300">שמור והמשך</Button><Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 gap-1">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{editId?"עדכן":"שמור"}</Button></div>
          </div></div>}

          {dr && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={()=>setShowDetail(null)}><div className="bg-card border border-border rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border"><div className="flex items-center gap-3"><h2 className="text-lg font-bold text-foreground">{dr.id}</h2><Badge className={`${SC[dr.status]} border-0`}>{dr.status}</Badge></div><Button variant="ghost" size="sm" onClick={()=>setShowDetail(null)}><X className="h-4 w-4" /></Button></div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">כותרת</p><p className="text-foreground mt-1 font-medium">{dr.title}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">שלב</p><p className="text-foreground mt-1 font-medium">{dr.stage}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">מחלקה</p><p className="text-foreground mt-1 font-medium">{dr.department}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">סעיפים</p><p className="text-foreground mt-1 font-medium">{dr.checkItems}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">שיעור עמידה</p><p className="text-foreground mt-1 font-medium">{dr.passRate}%</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">תדירות</p><p className="text-foreground mt-1 font-medium">{dr.frequency}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">גרסה</p><p className="text-foreground mt-1 font-medium">{dr.version}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">חובה</p><p className="text-foreground mt-1 font-medium">{dr.mandatory?"כן":"לא"}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">נוצר ע"י</p><p className="text-foreground mt-1 font-medium">{dr.createdBy}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">שימוש אחרון</p><p className="text-foreground mt-1 font-medium">{new Date(dr.lastUsed).toLocaleDateString("he-IL")}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">סטטוס</p><p className="text-foreground mt-1 font-medium">{dr.status}</p></div>
              </div>
              <h3 className="text-sm font-semibold text-blue-400 border-b border-border pb-2">היסטוריה</h3>
              <div className="space-y-2">{[{t:"10:30",d:"01/01/2026",a:"נוצר",u:"מערכת"},{t:"14:15",d:"02/01/2026",a:"עודכן",u:"אדמין"},{t:"09:00",d:"03/01/2026",a:"אושר",u:"מנהל"}].map((a,i)=><div key={i} className="flex items-center gap-3 text-sm p-2 rounded bg-background/50"><Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" /><span className="text-muted-foreground text-xs min-w-[50px]">{a.t}</span><span className="text-muted-foreground text-xs min-w-[80px]">{a.d}</span><span className="text-foreground">{a.a}</span><span className="text-muted-foreground mr-auto">{a.u}</span></div>)}</div>
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-border justify-end"><Button variant="outline" className="border-border gap-1"><Printer className="h-4 w-4" />הדפסה</Button><Button onClick={()=>{setEditId(dr.id);setShowDetail(null);setShowCreate(true)}} className="bg-blue-600 hover:bg-blue-700 gap-1"><Edit2 className="h-4 w-4" />ערוך</Button></div>
          </div></div>}


          {deleteConfirm && <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={()=>setDeleteConfirm(null)}><div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e=>e.stopPropagation()}><div className="p-6 text-center space-y-4"><div className="mx-auto w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center"><Trash2 className="h-6 w-6 text-red-400" /></div><h3 className="text-lg font-bold text-foreground">אישור מחיקה</h3><p className="text-muted-foreground">{deleteConfirm._bulk ? `למחוק ${deleteConfirm.count} רשומות?` : `למחוק את '${deleteConfirm.title || deleteConfirm.id}'?`} פעולה זו אינה ניתנת לביטול.</p></div><div className="flex items-center gap-2 p-4 border-t border-border justify-end"><Button variant="outline" onClick={()=>setDeleteConfirm(null)} className="border-border">ביטול</Button><Button onClick={() => { if (deleteConfirm._bulk) { setSelected(new Set()); } else { handleDelete(deleteConfirm.id); } setDeleteConfirm(null); }} className="bg-red-600 hover:bg-red-700 gap-1"><Trash2 className="h-4 w-4" />מחק לצמיתות</Button></div></div></div>}
        </div>
      );
    }
  