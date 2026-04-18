import { useState, useEffect, useCallback, useMemo } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Plus, Search, X, Loader2, Package, AlertCircle, RefreshCw, Truck, PackageCheck, Layers } from "lucide-react";

const PL_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/20 text-gray-300",
  assigned: "bg-blue-500/20 text-blue-300",
  in_progress: "bg-yellow-500/20 text-yellow-300",
  completed: "bg-green-500/20 text-green-300",
  cancelled: "bg-red-500/20 text-red-400",
};
const PL_STATUS_LABELS: Record<string, string> = {
  draft: "טיוטה", assigned: "הוקצה", in_progress: "בביצוע", completed: "הושלם", cancelled: "בוטל"
};
const PICK_TYPE_LABELS: Record<string, string> = {
  standard: "רגיל", wave: "גל (Wave)", zone: "אזור (Zone)", batch: "אצווה (Batch)"
};

export default function WmsPickPackShipPage() {
  const [pickLists, setPickLists] = useState<any[]>([]);
  const [packStations, setPackStations] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [tab, setTab] = useState<"pick" | "pack" | "ship">("pick");
  const [showForm, setShowForm] = useState(false);
  const [showPackForm, setShowPackForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({ picking_type: "standard", priority: 5 });
  const [packForm, setPackForm] = useState<any>({ carrier: "פדקס" });
  const [detailId, setDetailId] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plRes, psRes, whRes] = await Promise.all([
        authFetch("/api/wms/pick-lists"),
        authFetch("/api/wms/pack-stations"),
        authFetch("/api/warehouses"),
      ]);
      if (plRes.ok) setPickLists(await plRes.json());
      if (psRes.ok) setPackStations(await psRes.json());
      if (whRes.ok) setWarehouses(await whRes.json());
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredPickLists = useMemo(() => {
    let d = [...pickLists];
    if (search) { const s = search.toLowerCase(); d = d.filter(r => r.pick_number?.toLowerCase().includes(s) || r.warehouse_name?.toLowerCase().includes(s)); }
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    if (typeFilter !== "all") d = d.filter(r => r.picking_type === typeFilter);
    return d;
  }, [pickLists, search, statusFilter, typeFilter]);

  const stats = useMemo(() => ({
    totalPick: pickLists.length,
    inProgress: pickLists.filter(p => p.status === "in_progress").length,
    completed: pickLists.filter(p => p.status === "completed").length,
    totalPack: packStations.length,
    shipped: packStations.filter(p => p.status === "shipped").length,
  }), [pickLists, packStations]);

  const handleSavePickList = async () => {
    setSaving(true);
    try {
      const res = await authFetch("/api/wms/pick-lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error((await res.json()).error);
      setShowForm(false); setForm({ picking_type: "standard", priority: 5 }); await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleSavePackStation = async () => {
    setSaving(true);
    try {
      const res = await authFetch("/api/wms/pack-stations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(packForm) });
      if (!res.ok) throw new Error((await res.json()).error);
      setShowPackForm(false); setPackForm({ carrier: "פדקס" }); await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const updatePickStatus = async (id: number, status: string) => {
    try {
      const res = await authFetch(`/api/wms/pick-lists/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const updatePackStatus = async (id: number, status: string, extra?: any) => {
    try {
      const res = await authFetch(`/api/wms/pack-stations/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, ...extra }) });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {error && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400"><AlertCircle className="h-4 w-4" /><span className="text-sm">{error}</span><button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button></div>}
      
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Package className="h-6 w-6 text-blue-400" />ליקוט, אריזה ומשלוח (Pick/Pack/Ship)</h1><p className="text-sm text-muted-foreground mt-1">ניהול גלי ליקוט, תחנות אריזה ואישור משלוח</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="border-border text-gray-300 gap-1"><RefreshCw className="h-4 w-4" />רענן</Button>
          {tab === "pick" && <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700 gap-2"><Plus className="h-4 w-4" />רשימת ליקוט</Button>}
          {tab === "pack" && <Button onClick={() => setShowPackForm(true)} className="bg-purple-600 hover:bg-purple-700 gap-2"><Plus className="h-4 w-4" />תחנת אריזה</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { l: "רשימות ליקוט", v: stats.totalPick, c: "text-blue-400", icon: <Layers className="h-4 w-4" /> },
          { l: "בביצוע", v: stats.inProgress, c: "text-yellow-400", icon: <Package className="h-4 w-4" /> },
          { l: "הושלמו", v: stats.completed, c: "text-green-400", icon: <PackageCheck className="h-4 w-4" /> },
          { l: "תחנות אריזה", v: stats.totalPack, c: "text-purple-400", icon: <Package className="h-4 w-4" /> },
          { l: "נשלחו", v: stats.shipped, c: "text-emerald-400", icon: <Truck className="h-4 w-4" /> },
        ].map((k, i) => (
          <Card key={i} className="bg-card/80 border-border"><CardContent className="p-4"><div className="flex items-center gap-2 mb-1">{k.icon}<p className="text-[11px] text-muted-foreground">{k.l}</p></div><p className={`text-xl font-bold font-mono ${k.c}`}>{k.v}</p></CardContent></Card>
        ))}
      </div>

      <div className="flex gap-2 border-b border-border pb-2">
        <button onClick={() => setTab("pick")} className={`px-4 py-2 text-sm rounded-t-lg transition-colors flex items-center gap-2 ${tab === "pick" ? "bg-blue-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}><Layers className="h-4 w-4" />ליקוט</button>
        <button onClick={() => setTab("pack")} className={`px-4 py-2 text-sm rounded-t-lg transition-colors flex items-center gap-2 ${tab === "pack" ? "bg-purple-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}><Package className="h-4 w-4" />אריזה</button>
        <button onClick={() => setTab("ship")} className={`px-4 py-2 text-sm rounded-t-lg transition-colors flex items-center gap-2 ${tab === "ship" ? "bg-emerald-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}><Truck className="h-4 w-4" />משלוח</button>
      </div>

      {tab === "pick" && (
        <>
          <Card className="bg-card/60 border-border"><CardContent className="p-3"><div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="pr-9 bg-input border-border text-foreground" /></div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסטטוסים</option>{Object.entries(PL_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסוגים</option>{Object.entries(PICK_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div></CardContent></Card>
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-background/50">
              <th className="p-3 text-right text-muted-foreground">מספר</th>
              <th className="p-3 text-right text-muted-foreground">סוג ליקוט</th>
              <th className="p-3 text-right text-muted-foreground">מחסן</th>
              <th className="p-3 text-right text-muted-foreground">אזור</th>
              <th className="p-3 text-right text-muted-foreground">עדיפות</th>
              <th className="p-3 text-right text-muted-foreground">תאריך אספקה</th>
              <th className="p-3 text-right text-muted-foreground">שורות</th>
              <th className="p-3 text-right text-muted-foreground">אחראי</th>
              <th className="p-3 text-right text-muted-foreground">סטטוס</th>
              <th className="p-3 text-center text-muted-foreground">פעולות</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={10} className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-400" /></td></tr>
              : filteredPickLists.length === 0 ? <tr><td colSpan={10} className="p-12 text-center text-muted-foreground"><Package className="h-12 w-12 mx-auto mb-3 opacity-20" /><p>אין רשימות ליקוט עדיין</p></td></tr>
              : filteredPickLists.map(row => (
                <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs text-blue-400">{row.pick_number}</td>
                  <td className="p-3"><Badge className="bg-blue-500/20 text-blue-300 border-0 text-xs">{PICK_TYPE_LABELS[row.picking_type] || row.picking_type}</Badge></td>
                  <td className="p-3 text-muted-foreground text-xs">{row.warehouse_name || "—"}</td>
                  <td className="p-3 text-muted-foreground text-xs">{row.zone || "—"}</td>
                  <td className="p-3 text-center"><span className={`font-mono text-xs px-2 py-0.5 rounded ${row.priority <= 2 ? "bg-red-500/20 text-red-300" : row.priority <= 4 ? "bg-yellow-500/20 text-yellow-300" : "bg-gray-500/20 text-gray-300"}`}>{row.priority}</span></td>
                  <td className="p-3 text-muted-foreground text-xs">{row.delivery_date ? new Date(row.delivery_date).toLocaleDateString("he-IL") : "—"}</td>
                  <td className="p-3 text-center font-mono">{row.picked_lines}/{row.total_lines}</td>
                  <td className="p-3 text-muted-foreground text-xs">{row.assigned_to || "—"}</td>
                  <td className="p-3"><Badge className={`${PL_STATUS_COLORS[row.status] || ''} border-0 text-xs`}>{PL_STATUS_LABELS[row.status] || row.status}</Badge></td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {row.status === "draft" && <button onClick={() => updatePickStatus(row.id, "in_progress")} className="text-xs border border-yellow-500/30 text-yellow-300 px-2 py-1 rounded hover:bg-yellow-500/10">התחל</button>}
                      {row.status === "in_progress" && <button onClick={() => updatePickStatus(row.id, "completed")} className="text-xs border border-green-500/30 text-green-300 px-2 py-1 rounded hover:bg-green-500/10">השלם</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div></CardContent></Card>
        </>
      )}

      {tab === "pack" && (
        <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-background/50">
            <th className="p-3 text-right text-muted-foreground">מספר תחנה</th>
            <th className="p-3 text-right text-muted-foreground">רשימת ליקוט</th>
            <th className="p-3 text-right text-muted-foreground">מפעיל</th>
            <th className="p-3 text-right text-muted-foreground">קופסאות</th>
            <th className="p-3 text-right text-muted-foreground">משקל</th>
            <th className="p-3 text-right text-muted-foreground">מובל</th>
            <th className="p-3 text-right text-muted-foreground">מעקב</th>
            <th className="p-3 text-right text-muted-foreground">סטטוס</th>
            <th className="p-3 text-center text-muted-foreground">פעולות</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9} className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-purple-400" /></td></tr>
            : packStations.length === 0 ? <tr><td colSpan={9} className="p-12 text-center text-muted-foreground"><Package className="h-12 w-12 mx-auto mb-3 opacity-20" /><p>אין תחנות אריזה</p></td></tr>
            : packStations.map(row => (
              <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="p-3 font-mono text-xs text-purple-400">{row.pack_station_number}</td>
                <td className="p-3 text-muted-foreground text-xs">#{row.pick_list_id || "—"}</td>
                <td className="p-3 text-foreground text-xs">{row.operator || "—"}</td>
                <td className="p-3 text-center font-mono">{row.box_count || 0}</td>
                <td className="p-3 text-center font-mono text-xs">{row.total_weight ? `${row.total_weight} ק"ג` : "—"}</td>
                <td className="p-3 text-muted-foreground text-xs">{row.carrier || "—"}</td>
                <td className="p-3 font-mono text-xs text-cyan-400">{row.tracking_number || "—"}</td>
                <td className="p-3"><Badge className={`border-0 text-xs ${row.status === 'shipped' ? 'bg-green-500/20 text-green-300' : row.status === 'packed' ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-500/20 text-gray-300'}`}>{row.status === 'shipped' ? 'נשלח' : row.status === 'packed' ? 'ארוז' : 'פתוח'}</Badge></td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {row.status === "open" && <button onClick={() => updatePackStatus(row.id, "packed", { packed_at: new Date().toISOString() })} className="text-xs border border-blue-500/30 text-blue-300 px-2 py-1 rounded hover:bg-blue-500/10">ארז</button>}
                    {row.status === "packed" && <button onClick={() => updatePackStatus(row.id, "shipped", { shipped_at: new Date().toISOString() })} className="text-xs border border-green-500/30 text-green-300 px-2 py-1 rounded hover:bg-green-500/10">שלח</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div></CardContent></Card>
      )}

      {tab === "ship" && (
        <Card className="bg-card/80 border-border"><CardContent className="p-6">
          <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2"><Truck className="h-5 w-5 text-emerald-400" />אישורי משלוח</h3>
          <div className="space-y-3">
            {packStations.filter(p => p.status === "packed").map(ps => (
              <div key={ps.id} className="bg-input rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="font-mono text-purple-400 text-sm">{ps.pack_station_number}</p>
                  <p className="text-foreground text-sm mt-1">{ps.carrier || "מובל לא מוגדר"} — {ps.box_count || 0} קופסאות</p>
                  {ps.tracking_number && <p className="text-xs text-cyan-400 mt-0.5">מס׳ מעקב: {ps.tracking_number}</p>}
                </div>
                <button onClick={() => updatePackStatus(ps.id, "shipped", { shipped_at: new Date().toISOString() })} className="bg-emerald-600 hover:bg-emerald-700 text-foreground text-sm px-4 py-2 rounded-lg flex items-center gap-2"><Truck className="h-4 w-4" />אשר משלוח</button>
              </div>
            ))}
            {packStations.filter(p => p.status === "packed").length === 0 && <div className="text-center text-muted-foreground py-8"><Truck className="h-12 w-12 mx-auto mb-3 opacity-20" /><p>אין משלוחים ממתינים לאישור</p></div>}
          </div>
        </CardContent></Card>
      )}

      {showForm && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowForm(false)}><div className="bg-card border border-border rounded-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><h2 className="text-lg font-bold text-foreground">רשימת ליקוט חדשה</h2><button onClick={() => setShowForm(false)}><X className="h-5 w-5 text-gray-400" /></button></div>
        <div className="p-4 grid grid-cols-2 gap-4">
          <div><Label className="text-xs text-muted-foreground">סוג ליקוט</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1" value={form.picking_type} onChange={e => setForm({...form, picking_type: e.target.value})}>{Object.entries(PICK_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><Label className="text-xs text-muted-foreground">מחסן</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1" value={form.warehouse_id || ""} onChange={e => setForm({...form, warehouse_id: e.target.value})}><option value="">בחר מחסן...</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          <div><Label className="text-xs text-muted-foreground">אזור</Label><Input className="bg-input border-border text-foreground mt-1" placeholder="A, B, C..." value={form.zone || ""} onChange={e => setForm({...form, zone: e.target.value})} /></div>
          <div><Label className="text-xs text-muted-foreground">עדיפות (1=גבוה)</Label><Input type="number" min={1} max={10} className="bg-input border-border text-foreground mt-1" value={form.priority} onChange={e => setForm({...form, priority: parseInt(e.target.value)})} /></div>
          <div><Label className="text-xs text-muted-foreground">תאריך אספקה</Label><Input type="date" className="bg-input border-border text-foreground mt-1" value={form.delivery_date || ""} onChange={e => setForm({...form, delivery_date: e.target.value})} /></div>
          <div><Label className="text-xs text-muted-foreground">מלקט</Label><Input className="bg-input border-border text-foreground mt-1" value={form.assigned_to || ""} onChange={e => setForm({...form, assigned_to: e.target.value})} /></div>
          <div className="col-span-2"><Label className="text-xs text-muted-foreground">הערות</Label><textarea rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} /></div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <Button variant="outline" onClick={() => setShowForm(false)} className="border-border">ביטול</Button>
          <Button onClick={handleSavePickList} disabled={saving} className="bg-blue-600 hover:bg-blue-700 gap-1">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}צור רשימה</Button>
        </div>
      </div></div>}

      {showPackForm && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowPackForm(false)}><div className="bg-card border border-border rounded-xl w-full max-w-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><h2 className="text-lg font-bold text-foreground">תחנת אריזה חדשה</h2><button onClick={() => setShowPackForm(false)}><X className="h-5 w-5 text-gray-400" /></button></div>
        <div className="p-4 grid grid-cols-2 gap-4">
          <div><Label className="text-xs text-muted-foreground">מחסן</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1" value={packForm.warehouse_id || ""} onChange={e => setPackForm({...packForm, warehouse_id: e.target.value})}><option value="">בחר מחסן...</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          <div><Label className="text-xs text-muted-foreground">מפעיל</Label><Input className="bg-input border-border text-foreground mt-1" value={packForm.operator || ""} onChange={e => setPackForm({...packForm, operator: e.target.value})} /></div>
          <div><Label className="text-xs text-muted-foreground">מובל</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1" value={packForm.carrier} onChange={e => setPackForm({...packForm, carrier: e.target.value})}><option>פדקס</option><option>DHL</option><option>UPS</option><option>ישראל דואר</option><option>אחר</option></select></div>
          <div><Label className="text-xs text-muted-foreground">מס׳ מעקב</Label><Input className="bg-input border-border text-foreground mt-1" value={packForm.tracking_number || ""} onChange={e => setPackForm({...packForm, tracking_number: e.target.value})} /></div>
          <div className="col-span-2"><Label className="text-xs text-muted-foreground">הערות</Label><textarea rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" value={packForm.notes || ""} onChange={e => setPackForm({...packForm, notes: e.target.value})} /></div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <Button variant="outline" onClick={() => setShowPackForm(false)} className="border-border">ביטול</Button>
          <Button onClick={handleSavePackStation} disabled={saving} className="bg-purple-600 hover:bg-purple-700 gap-1">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}צור תחנה</Button>
        </div>
      </div></div>}
    </div>
  );
}
