import { useState, useEffect, useCallback, useMemo } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Plus, Search, X, Loader2, BarChart3, CheckCircle2, AlertCircle, ClipboardList, RefreshCw, ChevronDown, Eye, Edit2 } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-blue-500/20 text-blue-300",
  in_progress: "bg-yellow-500/20 text-yellow-300",
  completed: "bg-green-500/20 text-green-300",
  approved: "bg-emerald-500/20 text-emerald-300",
  cancelled: "bg-gray-500/20 text-gray-400",
};
const STATUS_LABELS: Record<string, string> = {
  planned: "מתוכנן", in_progress: "בביצוע", completed: "הושלם", approved: "מאושר", cancelled: "בוטל"
};
const ABC_COLORS: Record<string, string> = {
  A: "bg-red-500/20 text-red-300", B: "bg-yellow-500/20 text-yellow-300", C: "bg-green-500/20 text-green-300"
};

export default function WmsCycleCountingPage() {
  const [counts, setCounts] = useState<any[]>([]);
  const [abcItems, setAbcItems] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [abcFilter, setAbcFilter] = useState("all");
  const [tab, setTab] = useState<"counts" | "abc">("counts");
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({ abc_class: "C", count_type: "cycle" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [countsRes, abcRes, whRes] = await Promise.all([
        authFetch("/api/wms/cycle-counts"),
        authFetch("/api/wms/abc-classification"),
        authFetch("/api/warehouses"),
      ]);
      if (countsRes.ok) setCounts(await countsRes.json());
      if (abcRes.ok) setAbcItems(await abcRes.json());
      if (whRes.ok) setWarehouses(await whRes.json());
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let d = [...counts];
    if (search) { const s = search.toLowerCase(); d = d.filter(r => r.count_number?.toLowerCase().includes(s) || r.warehouse_name?.toLowerCase().includes(s)); }
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    if (abcFilter !== "all") d = d.filter(r => r.abc_class === abcFilter);
    return d;
  }, [counts, search, statusFilter, abcFilter]);

  const abcStats = useMemo(() => {
    const a = abcItems.filter(i => i.abc_class === 'A');
    const b = abcItems.filter(i => i.abc_class === 'B');
    const c = abcItems.filter(i => i.abc_class === 'C');
    return { a: a.length, b: b.length, c: c.length, aValue: a.reduce((s, i) => s + parseFloat(i.stock_value || 0), 0), total: abcItems.length };
  }, [abcItems]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await authFetch("/api/wms/cycle-counts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error((await res.json()).error);
      setShowForm(false); setForm({ abc_class: "C", count_type: "cycle" }); await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleApprove = async (id: number) => {
    try {
      const res = await authFetch(`/api/wms/cycle-counts/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approved_by: "מנהל מחסן" }) });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const fmt = (v: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {error && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400"><AlertCircle className="h-4 w-4" /><span className="text-sm">{error}</span><button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button></div>}
      
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><ClipboardList className="h-6 w-6 text-cyan-400" />ספירות מחזוריות (Cycle Counting)</h1><p className="text-sm text-muted-foreground mt-1">ABC ניתוח, לוח ספירות, גיליונות ספירה, טיפול בסטיות</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="border-border text-gray-300 gap-1"><RefreshCw className="h-4 w-4" />רענן</Button>
          <Button onClick={() => setShowForm(true)} className="bg-cyan-600 hover:bg-cyan-700 gap-2"><Plus className="h-4 w-4" />ספירה חדשה</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: "סה״כ פריטים", v: abcStats.total, c: "text-cyan-400" },
          { l: "קבוצה A (ערך גבוה)", v: `${abcStats.a} פריטים`, c: "text-red-400" },
          { l: "קבוצה B", v: `${abcStats.b} פריטים`, c: "text-yellow-400" },
          { l: "קבוצה C", v: `${abcStats.c} פריטים`, c: "text-green-400" },
        ].map((k, i) => (
          <Card key={i} className="bg-card/80 border-border"><CardContent className="p-4"><p className="text-[11px] text-muted-foreground">{k.l}</p><p className={`text-xl font-bold font-mono mt-1 ${k.c}`}>{k.v}</p></CardContent></Card>
        ))}
      </div>

      <div className="flex gap-2 border-b border-border pb-2">
        <button onClick={() => setTab("counts")} className={`px-4 py-2 text-sm rounded-t-lg transition-colors ${tab === "counts" ? "bg-cyan-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>ספירות</button>
        <button onClick={() => setTab("abc")} className={`px-4 py-2 text-sm rounded-t-lg transition-colors ${tab === "abc" ? "bg-cyan-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>ניתוח ABC</button>
      </div>

      {tab === "counts" && (
        <>
          <Card className="bg-card/60 border-border"><CardContent className="p-3"><div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="pr-9 bg-input border-border text-foreground" /></div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסטטוסים</option>{Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select value={abcFilter} onChange={e => setAbcFilter(e.target.value)} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל קבוצות ABC</option><option value="A">קבוצה A</option><option value="B">קבוצה B</option><option value="C">קבוצה C</option></select>
          </div></CardContent></Card>

          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-background/50">
              <th className="p-3 text-right text-muted-foreground">מספר ספירה</th>
              <th className="p-3 text-right text-muted-foreground">מחסן</th>
              <th className="p-3 text-right text-muted-foreground">קבוצה</th>
              <th className="p-3 text-right text-muted-foreground">סוג</th>
              <th className="p-3 text-right text-muted-foreground">תאריך מתוכנן</th>
              <th className="p-3 text-right text-muted-foreground">פריטים</th>
              <th className="p-3 text-right text-muted-foreground">דיוק</th>
              <th className="p-3 text-right text-muted-foreground">סטיות</th>
              <th className="p-3 text-right text-muted-foreground">סטטוס</th>
              <th className="p-3 text-center text-muted-foreground">פעולות</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={10} className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-cyan-400" /></td></tr>
              : filtered.length === 0 ? <tr><td colSpan={10} className="p-12 text-center text-muted-foreground"><ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-20" /><p>אין ספירות עדיין</p></td></tr>
              : filtered.map(row => (
                <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs text-cyan-400">{row.count_number}</td>
                  <td className="p-3 text-foreground">{row.warehouse_name || "—"}</td>
                  <td className="p-3"><Badge className={`${ABC_COLORS[row.abc_class] || ''} border-0 text-xs`}>{row.abc_class}</Badge></td>
                  <td className="p-3 text-muted-foreground text-xs">{row.count_type}</td>
                  <td className="p-3 text-muted-foreground text-xs">{row.scheduled_date ? new Date(row.scheduled_date).toLocaleDateString("he-IL") : "—"}</td>
                  <td className="p-3 font-mono text-center">{row.counted_items}/{row.total_items}</td>
                  <td className="p-3 font-mono text-center text-green-400">{row.accuracy_pct || 0}%</td>
                  <td className="p-3 font-mono text-center text-red-400">{row.variance_items || 0}</td>
                  <td className="p-3"><Badge className={`${STATUS_COLORS[row.status] || ''} border-0 text-xs`}>{STATUS_LABELS[row.status] || row.status}</Badge></td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setShowDetail(row)} className="p-1.5 hover:bg-muted rounded"><Eye className="h-4 w-4 text-blue-400" /></button>
                      {row.status === "completed" && <button onClick={() => handleApprove(row.id)} className="p-1.5 hover:bg-muted rounded text-xs text-emerald-400 border border-emerald-500/30 px-2">אשר</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div></CardContent></Card>
        </>
      )}

      {tab === "abc" && (
        <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-background/50">
            <th className="p-3 text-right text-muted-foreground">קוד פריט</th>
            <th className="p-3 text-right text-muted-foreground">שם</th>
            <th className="p-3 text-right text-muted-foreground">קטגוריה</th>
            <th className="p-3 text-right text-muted-foreground">כמות במלאי</th>
            <th className="p-3 text-right text-muted-foreground">עלות יחידה</th>
            <th className="p-3 text-right text-muted-foreground">ערך מלאי</th>
            <th className="p-3 text-center text-muted-foreground">קבוצת ABC</th>
          </tr></thead>
          <tbody>
            {abcItems.slice(0, 100).map(item => (
              <tr key={item.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="p-3 font-mono text-xs text-cyan-400">{item.item_code}</td>
                <td className="p-3 text-foreground">{item.name}</td>
                <td className="p-3 text-muted-foreground text-xs">{item.category}</td>
                <td className="p-3 font-mono text-center">{parseFloat(item.qty_on_hand || 0).toLocaleString()}</td>
                <td className="p-3 font-mono text-center">{fmt(parseFloat(item.unit_cost || 0))}</td>
                <td className="p-3 font-mono text-emerald-400">{fmt(parseFloat(item.stock_value || 0))}</td>
                <td className="p-3 text-center"><Badge className={`${ABC_COLORS[item.abc_class] || ''} border-0 text-xs font-bold`}>{item.abc_class}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table></div></CardContent></Card>
      )}

      {showForm && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowForm(false)}><div className="bg-card border border-border rounded-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><h2 className="text-lg font-bold text-foreground">ספירה מחזורית חדשה</h2><button onClick={() => setShowForm(false)}><X className="h-5 w-5 text-gray-400" /></button></div>
        <div className="p-4 grid grid-cols-2 gap-4">
          <div><Label className="text-xs text-muted-foreground">מחסן</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1" value={form.warehouse_id || ""} onChange={e => setForm({...form, warehouse_id: e.target.value})}><option value="">בחר מחסן...</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          <div><Label className="text-xs text-muted-foreground">קבוצת ABC</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1" value={form.abc_class} onChange={e => setForm({...form, abc_class: e.target.value})}><option value="A">A — ערך גבוה (יומי)</option><option value="B">B — ערך בינוני (שבועי)</option><option value="C">C — ערך נמוך (חודשי)</option></select></div>
          <div><Label className="text-xs text-muted-foreground">סוג ספירה</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1" value={form.count_type} onChange={e => setForm({...form, count_type: e.target.value})}><option value="cycle">מחזורי</option><option value="full">מלא</option><option value="spot">ספוט</option></select></div>
          <div><Label className="text-xs text-muted-foreground">תאריך מתוכנן</Label><Input type="date" className="bg-input border-border text-foreground mt-1" value={form.scheduled_date || ""} onChange={e => setForm({...form, scheduled_date: e.target.value})} /></div>
          <div><Label className="text-xs text-muted-foreground">אחראי ספירה</Label><Input className="bg-input border-border text-foreground mt-1" value={form.assigned_to || ""} onChange={e => setForm({...form, assigned_to: e.target.value})} /></div>
          <div className="col-span-2"><Label className="text-xs text-muted-foreground">הערות</Label><textarea rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} /></div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <Button variant="outline" onClick={() => setShowForm(false)} className="border-border">ביטול</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-cyan-600 hover:bg-cyan-700 gap-1">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}צור ספירה</Button>
        </div>
      </div></div>}

      {showDetail && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowDetail(null)}><div className="bg-card border border-border rounded-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><h2 className="text-lg font-bold text-foreground">{showDetail.count_number}</h2><button onClick={() => setShowDetail(null)}><X className="h-5 w-5 text-gray-400" /></button></div>
        <div className="p-4 grid grid-cols-2 gap-3">
          {[["מחסן", showDetail.warehouse_name], ["קבוצת ABC", showDetail.abc_class], ["סוג", showDetail.count_type], ["סטטוס", STATUS_LABELS[showDetail.status] || showDetail.status], ["תאריך מתוכנן", showDetail.scheduled_date ? new Date(showDetail.scheduled_date).toLocaleDateString("he-IL") : "—"], ["אחראי", showDetail.assigned_to || "—"], ["פריטים", `${showDetail.counted_items}/${showDetail.total_items}`], ["דיוק", `${showDetail.accuracy_pct || 0}%`], ["סטיות", showDetail.variance_items], ["ערך סטיה", fmt(parseFloat(showDetail.variance_value || 0))], ["מאשר", showDetail.approved_by || "—"], ["הערות", showDetail.notes || "—"]].map(([l, v], i) => (
            <div key={i} className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">{l}</p><p className="text-foreground mt-1 font-medium text-sm">{String(v)}</p></div>
          ))}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <Button variant="outline" onClick={() => setShowDetail(null)} className="border-border">סגור</Button>
          {showDetail.status === "completed" && <Button onClick={() => { handleApprove(showDetail.id); setShowDetail(null); }} className="bg-emerald-600 hover:bg-emerald-700 gap-1"><CheckCircle2 className="h-4 w-4" />אשר ספירה</Button>}
        </div>
      </div></div>}
    </div>
  );
}
