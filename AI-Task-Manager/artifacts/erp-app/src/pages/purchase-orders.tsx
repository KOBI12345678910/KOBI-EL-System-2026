import { useState, useMemo, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import ImportButton from "@/components/import-button";
    import { Card, CardContent } from "@/components/ui/card";
    import { Button } from "@/components/ui/button";
    import { Input } from "@/components/ui/input";
    import { Label } from "@/components/ui/label";
    import { Badge } from "@/components/ui/badge";
    import { TrendingUp, Download, Plus, Search, Printer, Upload, MoreHorizontal, ChevronRight, ChevronLeft, ArrowUp, ArrowDown, X, Save, Eye, Edit2, Trash2, Copy, FileSpreadsheet, TrendingDown, ChevronsUpDown, Clock, CheckCircle2, Send, AlertCircle, Loader2 } from "lucide-react";

    const fmt = (v: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v / 100);
    const STATUSES = ["טיוטה", "ממתין", "מאושר", "נשלח", "התקבל חלקית", "התקבל", "בוטל"] as const;
    const SC: Record<string, string> = { "טיוטה": "bg-muted text-muted-foreground", "ממתין": "bg-yellow-500/20 text-yellow-600 dark:text-yellow-300", "מאושר": "bg-blue-500/20 text-blue-600 dark:text-blue-300", "נשלח": "bg-cyan-500/20 text-cyan-600 dark:text-cyan-300", "התקבל חלקית": "bg-orange-500/20 text-orange-600 dark:text-orange-300", "התקבל": "bg-green-500/20 text-green-600 dark:text-green-300", "בוטל": "bg-red-500/20 text-red-600 dark:text-red-300" };
    const CATS = ["חומרי גלם","ציוד","שירותים","חלפים","אחר"];
    const EMP = ["יוסי כהן","שרה לוי","דוד מזרחי","רחל אברהם","אלון גולדשטיין","מיכל ברק","עומר חדד","נועה פרידמן","איתן רוזנברג","תמר שלום"];
export default function PurchaseOrdersPage() {
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
      const res = await authFetch("/api/purchase-orders");
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
        if (search) { const s = search.toLowerCase(); d = d.filter(r => r.id?.toLowerCase().includes(s) || r.supplier?.toLowerCase().includes(s) || r.category?.toLowerCase().includes(s)); }
        if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
      if (catFilter !== "all") d = d.filter(r => r.category === catFilter);
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
    if (!form.supplier || String(form.supplier).trim() === "") { setError("שדה 'ספק' הוא שדה חובה"); return; }
    if (!form.category || String(form.category).trim() === "") { setError("שדה 'קטגוריה' הוא שדה חובה"); return; }
    if (!form.orderDate || String(form.orderDate).trim() === "") { setError("שדה 'תאריך הזמנה' הוא שדה חובה"); return; }
    setSaving(true);
    try {
      const method = editId ? "PUT" : "POST";
      const url = editId ? `/api/purchase-orders/${editId}` : "/api/purchase-orders";
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "שגיאה בשמירה"); }
      setShowCreate(false); setEditId(null); setForm({});
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id: any) => {
    try {
      await authFetch(`/api/purchase-orders/${id}`, { method: "DELETE" });
      setDeleteConfirm(null);
      await load();
    } catch (e: any) { setError(e.message); }
  };


      return (
        <div className="p-6 space-y-4" dir="rtl">
      {error && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400"><AlertCircle className="h-4 w-4 flex-shrink-0" /><span className="text-sm">{error}</span><button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button></div>}
          <div className="flex items-center justify-between">
            <div><h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><TrendingUp className="h-6 w-6 text-blue-400" />הזמנות רכש</h1><p className="text-sm text-muted-foreground mt-1">ניהול הזמנות רכש, אישורים ומעקב אספקה</p></div>
            <div className="flex gap-2">
              <ImportButton apiRoute="/api/purchase-orders" onSuccess={load} />
              <Button variant="outline" size="sm" className="gap-1"><FileSpreadsheet className="h-4 w-4" />ייצוא</Button>
              <Button variant="outline" size="sm" className="gap-1"><Printer className="h-4 w-4" />הדפסה</Button>
              <Button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700 gap-2"><Plus className="h-4 w-4" />הזמנה חדשה</Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[{"l":"הזמנות פתוחות","v":"28","c":"text-blue-400","t":"+3","u":true},{"l":"סכום כולל","v":"₪1.8M","c":"text-emerald-400","t":"+15%","u":true},{"l":"ממתינות","v":"8","c":"text-yellow-400","t":"+2","u":false},{"l":"התקבלו החודש","v":"15","c":"text-green-400","t":"+5","u":true},{"l":"זמן אספקה","v":"12 ימים","c":"text-cyan-400","t":"-2","u":true},{"l":"חריגות","v":"3","c":"text-red-400","t":"-1","u":true}].map((k: any) => (
              <Card key={k.l} className="hover:border-border/80 transition-colors"><CardContent className="p-4">{isLoading ? <div className="space-y-2 animate-pulse"><div className="h-3 w-16 bg-muted rounded" /><div className="h-6 w-20 bg-muted rounded" /><div className="h-3 w-12 bg-muted rounded" /></div> : <div className="flex items-start justify-between"><div><p className="text-[11px] text-muted-foreground">{k.l}</p><p className={`text-lg font-bold font-mono mt-1 ${k.c}`}>{k.v}</p><div className="flex items-center gap-1 mt-1">{k.u ? <TrendingUp className="h-3 w-3 text-green-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}<span className={`text-[10px] ${k.u ? "text-green-400" : "text-red-400"}`}>{k.t}</span></div></div></div>}</CardContent></Card>
            ))}
          </div>

          <Card><CardContent className="p-3"><div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="חיפוש..." className="pr-9" /></div>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסטטוסים</option>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>
            <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הקטגוריות</option>{CATS.map((o: string) => <option key={o} value={o}>{o}</option>)}</select>
            {af > 0 && <Button variant="ghost" size="sm" onClick={() => { setStatusFilter("all"); setCatFilter("all"); setSearch(""); }} className="text-red-400 hover:text-red-300 gap-1"><X className="h-3 w-3" />נקה ({af})</Button>}
          </div></CardContent></Card>

          {selected.size > 0 && <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3"><span className="text-sm text-blue-600 dark:text-blue-300">{selected.size} נבחרו</span><Button size="sm" variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3" />אשר</Button><Button onClick={()=>setDeleteConfirm({_bulk:true,count:selected.size})} size="sm" variant="outline" className="gap-1"><Trash2 className="h-3 w-3" />מחק</Button><Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="mr-auto">בטל</Button></div>}

          <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border bg-muted/50">
            <th className="p-3 w-10"><input type="checkbox" checked={allSel} onChange={() => { if (allSel) setSelected(new Set()); else setSelected(new Set(pd.map(r => r.id))); }} className="rounded" /></th>
            <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={()=>toggleSort("id")}>מזהה<SI field="id" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={()=>toggleSort("supplier")}>ספק<SI field="supplier" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={()=>toggleSort("category")}>קטגוריה<SI field="category" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={()=>toggleSort("items")}>פריטים<SI field="items" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={()=>toggleSort("totalAmount")}>סכום<SI field="totalAmount" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={()=>toggleSort("orderDate")}>תאריך<SI field="orderDate" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={()=>toggleSort("expectedDelivery")}>אספקה<SI field="expectedDelivery" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={()=>toggleSort("priority")}>עדיפות<SI field="priority" /></button></th>
        <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={()=>toggleSort("status")}>סטטוס<SI field="status" /></button></th>
            <th className="p-3 text-center text-muted-foreground font-medium">פעולות</th>
          </tr></thead><tbody>
            {isLoading ? Array.from({length:8}).map((_,sk) => (<tr key={sk} className="border-b border-border/50"><td colSpan={99} className="p-3"><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted rounded" /><div className="h-4 w-16 bg-muted rounded" /><div className="h-4 w-32 bg-muted rounded" /><div className="h-4 w-24 bg-muted rounded" /><div className="h-4 w-20 bg-muted rounded" /><div className="h-4 w-16 bg-muted rounded" /><div className="h-4 w-28 bg-muted rounded" /><div className="h-4 w-12 bg-muted rounded" /></div></td></tr>)) : pd.length === 0 ? <tr><td colSpan={99} className="p-20 text-center"><div className="flex flex-col items-center gap-4">{(af > 0 || search) ? <Search className="h-16 w-16 text-muted-foreground/30" /> : <TrendingUp className="h-16 w-16 text-muted-foreground/30" />}<p className="text-lg font-medium text-muted-foreground">{(af > 0 || search) ? "לא נמצאו תוצאות" : "עדיין אין הזמנות רכש"}</p><p className="text-sm text-muted-foreground/60">{(af > 0 || search) ? "נסה לשנות את מונחי החיפוש או הסינון" : "הזמנה חדשה ותתחיל לעבוד"}</p>{!(af > 0 || search) && <Button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700 gap-2 mt-2"><Plus className="h-4 w-4" />הזמנה חדשה</Button>}</div></td></tr> : pd.map(row => (
              <tr key={row.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="p-3"><input type="checkbox" checked={selected.has(row.id)} onChange={() => { const s = new Set(selected); s.has(row.id) ? s.delete(row.id) : s.add(row.id); setSelected(s); }} className="rounded" /></td>
              <td className="p-3 font-mono text-xs text-blue-500">{row.id}</td>
            <td className="p-3"><div className="font-medium text-foreground">{row.supplier}</div></td>
            <td className="p-3 text-muted-foreground">{row.category}</td>
            <td className="p-3 font-mono text-muted-foreground text-center">{row.items}</td>
            <td className="p-3 font-mono text-emerald-600 dark:text-emerald-400">{fmt(row.totalAmount)}</td>
            <td className="p-3 text-muted-foreground text-xs">{new Date(row.orderDate).toLocaleDateString("he-IL")}</td>
            <td className="p-3 text-muted-foreground text-xs">{new Date(row.expectedDelivery).toLocaleDateString("he-IL")}</td>
            <td className="p-3"><Badge className={`${row.priority==="קריטי"?"bg-red-500/20 text-red-600 dark:text-red-300":row.priority==="דחוף"?"bg-orange-500/20 text-orange-600 dark:text-orange-300":"bg-blue-500/20 text-blue-600 dark:text-blue-300"} border-0 text-xs`}>{row.priority}</Badge></td>
            <td className="p-3"><Badge className={`${SC[row.status]} border-0 text-xs`}>{row.status}</Badge></td>
                <td className="p-3 text-center"><div className="relative inline-block"><Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setMenuOpen(menuOpen === row.id ? null : row.id)}><MoreHorizontal className="h-4 w-4" /></Button>
                  {menuOpen === row.id && <div className="absolute left-0 top-8 z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[150px]" onMouseLeave={() => setMenuOpen(null)}>
                    <button onClick={() => { setShowDetail(row.id); setMenuOpen(null); }} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2"><Eye className="h-4 w-4" />צפייה</button>
                    <button onClick={() => { setEditId(row.id); setForm({supplier:row.supplier,category:row.category,totalAmount:row.totalAmount,orderDate:row.orderDate?.slice?.(0,10)||"",expectedDelivery:row.expectedDelivery?.slice?.(0,10)||"",priority:row.priority,deliveryTerms:row.deliveryTerms,status:row.status,notes:row.notes||""}); setShowCreate(true); setMenuOpen(null); }} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2"><Edit2 className="h-4 w-4" />עריכה</button>
                    <button onClick={async () => { const _dup = await duplicateRecord(`/api/purchase-orders`, row.id); if (_dup.ok) { load(); } else { alert("שגיאה בשכפול: " + _dup.error); } }} className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2"><Copy className="h-4 w-4" />שכפול</button>
                    <hr className="border-border my-1" /><button onClick={()=>{setDeleteConfirm(row);setMenuOpen(null)}} className="w-full px-3 py-2 text-right text-sm text-red-500 hover:bg-red-500/10 flex items-center gap-2"><Trash2 className="h-4 w-4" />מחיקה</button>
                  </div>}</div></td>
              </tr>
            ))}
          </tbody></table></div>
          <div className="flex items-center justify-between p-3 border-t border-border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><span>מציג {((page-1)*perPage)+1}-{Math.min(page*perPage,filtered.length)} מתוך {filtered.length}</span><select value={perPage} onChange={e=>{setPerPage(Number(e.target.value));setPage(1)}} className="bg-input border border-border rounded px-2 py-1 text-xs text-foreground">{[10,25,50,100].map(n=><option key={n} value={n}>{n} שורות</option>)}</select></div>
            <div className="flex items-center gap-1"><Button variant="ghost" size="sm" disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="h-8 w-8 p-0"><ChevronRight className="h-4 w-4" /></Button>{Array.from({length:Math.min(5,tp)},(_,i)=>{const p=page<=3?i+1:page+i-2;if(p>tp||p<1)return null;return <Button key={p} variant={p===page?"default":"ghost"} size="sm" onClick={()=>setPage(p)} className={`h-8 w-8 p-0 ${p===page?"bg-blue-600":""}`}>{p}</Button>})}<Button variant="ghost" size="sm" disabled={page>=tp} onClick={()=>setPage(p=>p+1)} className="h-8 w-8 p-0"><ChevronLeft className="h-4 w-4" /></Button></div>
          </div></CardContent></Card>

          {showCreate && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={()=>{setShowCreate(false);setEditId(null);setForm({});}}><div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border"><h2 className="text-lg font-bold text-foreground">{editId ? "עריכה" : "הזמנה חדשה"}</h2><Button variant="ghost" size="sm" onClick={()=>{setShowCreate(false);setEditId(null);setForm({});}}><X className="h-4 w-4" /></Button></div>
            <div className="p-4 space-y-6">
              <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-500">פרטי הזמנה</h3></div>
            <div className="grid grid-cols-3 gap-4">
            <div><Label className="text-muted-foreground text-xs">ספק *</Label><Input required type="text" placeholder="שם הספק" value={form.supplier||""} onChange={e=>setForm((f:any)=>({...f,supplier:e.target.value}))} className="mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">קטגוריה *</Label><select required value={form.category||""} onChange={e=>setForm((f:any)=>({...f,category:e.target.value}))} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option value="">בחר...</option><option>חומרי גלם</option><option>ציוד</option><option>שירותים</option><option>חלפים</option><option>אחר</option></select></div>
            <div><Label className="text-muted-foreground text-xs">סכום</Label><Input type="number" placeholder="0" value={form.totalAmount||""} onChange={e=>setForm((f:any)=>({...f,totalAmount:Number(e.target.value)}))} className="mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">תאריך *</Label><Input required type="date" value={form.orderDate||""} onChange={e=>setForm((f:any)=>({...f,orderDate:e.target.value}))} className="mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">אספקה צפויה</Label><Input type="date" value={form.expectedDelivery||""} onChange={e=>setForm((f:any)=>({...f,expectedDelivery:e.target.value}))} className="mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">עדיפות</Label><select value={form.priority||""} onChange={e=>setForm((f:any)=>({...f,priority:e.target.value}))} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option value="">בחר...</option><option>רגיל</option><option>דחוף</option><option>קריטי</option></select></div>
            <div><Label className="text-muted-foreground text-xs">תנאי אספקה</Label><select value={form.deliveryTerms||""} onChange={e=>setForm((f:any)=>({...f,deliveryTerms:e.target.value}))} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option value="">בחר...</option><option>EXW</option><option>FOB</option><option>CIF</option><option>DDU</option></select></div>
            <div><Label className="text-muted-foreground text-xs">סטטוס</Label><select value={form.status||"טיוטה"} onChange={e=>setForm((f:any)=>({...f,status:e.target.value}))} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option value="">בחר...</option><option>טיוטה</option><option>ממתין</option><option>מאושר</option><option>נשלח</option><option>התקבל חלקית</option><option>התקבל</option><option>בוטל</option></select></div>
            </div>
          <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-500">הערות</h3></div>
            <div className="grid grid-cols-3 gap-4">
            <div className="col-span-3"><Label className="text-muted-foreground text-xs">הערות</Label><textarea rows={3} value={form.notes||""} onChange={e=>setForm((f:any)=>({...f,notes:e.target.value}))} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" placeholder="הערות..." /></div>
            </div>
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-border justify-end"><Button variant="outline" onClick={()=>{setShowCreate(false);setEditId(null);setForm({});}}>ביטול</Button><Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 gap-1">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{editId?"עדכן":"שמור"}</Button></div>
          </div></div>}

          {dr && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={()=>setShowDetail(null)}><div className="bg-card border border-border rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border"><div className="flex items-center gap-3"><h2 className="text-lg font-bold text-foreground">{dr.id}</h2><Badge className={`${SC[dr.status]} border-0`}>{dr.status}</Badge></div><Button variant="ghost" size="sm" onClick={()=>setShowDetail(null)}><X className="h-4 w-4" /></Button></div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="bg-muted/30 rounded-lg p-3"><p className="text-[11px] text-muted-foreground">ספק</p><p className="text-foreground mt-1 font-medium">{dr.supplier}</p></div>
            <div className="bg-muted/30 rounded-lg p-3"><p className="text-[11px] text-muted-foreground">קטגוריה</p><p className="text-foreground mt-1 font-medium">{dr.category}</p></div>
            <div className="bg-muted/30 rounded-lg p-3"><p className="text-[11px] text-muted-foreground">פריטים</p><p className="text-foreground mt-1 font-medium">{dr.items}</p></div>
            <div className="bg-muted/30 rounded-lg p-3"><p className="text-[11px] text-muted-foreground">סכום</p><p className="text-foreground mt-1 font-medium">{fmt(dr.totalAmount)}</p></div>
            <div className="bg-muted/30 rounded-lg p-3"><p className="text-[11px] text-muted-foreground">תאריך</p><p className="text-foreground mt-1 font-medium">{new Date(dr.orderDate).toLocaleDateString("he-IL")}</p></div>
            <div className="bg-muted/30 rounded-lg p-3"><p className="text-[11px] text-muted-foreground">אספקה</p><p className="text-foreground mt-1 font-medium">{new Date(dr.expectedDelivery).toLocaleDateString("he-IL")}</p></div>
            <div className="bg-muted/30 rounded-lg p-3"><p className="text-[11px] text-muted-foreground">התקבל</p><p className="text-foreground mt-1 font-medium">{dr.receivedDate?new Date(dr.receivedDate).toLocaleDateString("he-IL"):"טרם"}</p></div>
            <div className="bg-muted/30 rounded-lg p-3"><p className="text-[11px] text-muted-foreground">אושר</p><p className="text-foreground mt-1 font-medium">{dr.approvedBy||"טרם"}</p></div>
            <div className="bg-muted/30 rounded-lg p-3"><p className="text-[11px] text-muted-foreground">מבקש</p><p className="text-foreground mt-1 font-medium">{dr.requester}</p></div>
            <div className="bg-muted/30 rounded-lg p-3"><p className="text-[11px] text-muted-foreground">עדיפות</p><p className="text-foreground mt-1 font-medium">{dr.priority}</p></div>
            <div className="bg-muted/30 rounded-lg p-3"><p className="text-[11px] text-muted-foreground">תנאים</p><p className="text-foreground mt-1 font-medium">{dr.deliveryTerms}</p></div>
            <div className="bg-muted/30 rounded-lg p-3"><p className="text-[11px] text-muted-foreground">סטטוס</p><p className="text-foreground mt-1 font-medium">{dr.status}</p></div>
              </div>
              <h3 className="text-sm font-semibold text-blue-500 border-b border-border pb-2">היסטוריה</h3>
              <div className="space-y-2">{[{t:"10:30",d:"01/01/2026",a:"נוצר",u:"מערכת"},{t:"14:15",d:"02/01/2026",a:"עודכן",u:"אדמין"},{t:"09:00",d:"03/01/2026",a:"אושר",u:"מנהל"}].map((a)=><div key={`${a.d}-${a.a}`} className="flex items-center gap-3 text-sm p-2 rounded bg-muted/30"><Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" /><span className="text-muted-foreground text-xs min-w-[50px]">{a.t}</span><span className="text-muted-foreground text-xs min-w-[80px]">{a.d}</span><span className="text-foreground">{a.a}</span><span className="text-muted-foreground mr-auto">{a.u}</span></div>)}</div>
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-border justify-end"><Button variant="outline" className="gap-1"><Printer className="h-4 w-4" />הדפסה</Button><Button onClick={()=>{setEditId(dr.id);setShowDetail(null);setShowCreate(true)}} className="bg-blue-600 hover:bg-blue-700 gap-1"><Edit2 className="h-4 w-4" />ערוך</Button></div>
          </div></div>}


          {deleteConfirm && <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={()=>setDeleteConfirm(null)}><div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e=>e.stopPropagation()}><div className="p-6 text-center space-y-4"><div className="mx-auto w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center"><Trash2 className="h-6 w-6 text-red-500" /></div><h3 className="text-lg font-bold text-foreground">אישור מחיקה</h3><p className="text-muted-foreground">{deleteConfirm._bulk ? `למחוק ${deleteConfirm.count} רשומות?` : `למחוק את '${deleteConfirm.supplier || deleteConfirm.id}'?`} פעולה זו אינה ניתנת לביטול.</p></div><div className="flex items-center gap-2 p-4 border-t border-border justify-end"><Button variant="outline" onClick={()=>setDeleteConfirm(null)}>ביטול</Button><Button onClick={() => { if (deleteConfirm._bulk) { setSelected(new Set()); } else { handleDelete(deleteConfirm.id); } setDeleteConfirm(null); }} className="bg-red-600 hover:bg-red-700 gap-1"><Trash2 className="h-4 w-4" />מחק לצמיתות</Button></div></div></div>}
        </div>
      );
    }
  