import { useState, useEffect, useCallback, useMemo } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Plus, X, Loader2, Box, AlertCircle, RefreshCw, Eye, Edit2, Layers } from "lucide-react";

export default function WmsKitsPage() {
  const [kits, setKits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({ unit: "יח'", selling_price: 0 });
  const [components, setComponents] = useState<any[]>([{ item_code: "", item_name: "", quantity: 1, unit: "יח'", unit_cost: 0 }]);
  const [availability, setAvailability] = useState<Record<number, any>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/wms/kits");
      if (res.ok) setKits(await res.json());
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search) return kits;
    const s = search.toLowerCase();
    return kits.filter(k => k.kit_code?.toLowerCase().includes(s) || k.kit_name?.toLowerCase().includes(s));
  }, [kits, search]);

  const loadAvailability = async (id: number) => {
    try {
      const res = await authFetch(`/api/wms/kits/${id}/availability`);
      if (res.ok) {
        const data = await res.json();
        setAvailability(prev => ({ ...prev, [id]: data }));
      }
    } catch { }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await authFetch("/api/wms/kits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, components: components.filter(c => c.item_code || c.item_name) }) });
      if (!res.ok) throw new Error((await res.json()).error);
      setShowForm(false); setForm({ unit: "יח'", selling_price: 0 }); setComponents([{ item_code: "", item_name: "", quantity: 1, unit: "יח'", unit_cost: 0 }]); await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const openDetail = async (kit: any) => {
    setShowDetail(kit);
    await loadAvailability(kit.id);
  };

  const addComp = () => setComponents([...components, { item_code: "", item_name: "", quantity: 1, unit: "יח'", unit_cost: 0 }]);
  const removeComp = (i: number) => setComponents(components.filter((_, idx) => idx !== i));
  const updateComp = (i: number, field: string, value: any) => setComponents(components.map((c, idx) => idx === i ? { ...c, [field]: value } : c));

  const calcKitCost = (comps: any[]) => comps.reduce((s, c) => s + (parseFloat(c.quantity || 0) * parseFloat(c.unit_cost || 0)), 0);
  const fmt = (v: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {error && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400"><AlertCircle className="h-4 w-4" /><span className="text-sm">{error}</span><button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button></div>}
      
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Box className="h-6 w-6 text-teal-400" />ערכות ו-BOM (Kits & Assembly)</h1><p className="text-sm text-muted-foreground mt-1">הגדרת ערכות, רכיבים, זמינות ועלות</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="border-border text-gray-300 gap-1"><RefreshCw className="h-4 w-4" />רענן</Button>
          <Button onClick={() => setShowForm(true)} className="bg-teal-600 hover:bg-teal-700 gap-2"><Plus className="h-4 w-4" />ערכה חדשה</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[{ l: "סה״כ ערכות", v: kits.length, c: "text-teal-400" }, { l: "פעילות", v: kits.filter(k => k.is_active !== false).length, c: "text-green-400" }, { l: "לא פעילות", v: kits.filter(k => k.is_active === false).length, c: "text-gray-400" }].map((k, i) => (
          <Card key={i} className="bg-card/80 border-border"><CardContent className="p-4"><p className="text-[11px] text-muted-foreground">{k.l}</p><p className={`text-xl font-bold font-mono mt-1 ${k.c}`}>{k.v}</p></CardContent></Card>
        ))}
      </div>

      <Card className="bg-card/60 border-border"><CardContent className="p-3"><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש ערכה..." className="bg-input border-border text-foreground max-w-sm" /></CardContent></Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? <div className="col-span-3 p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-teal-400" /></div>
        : filtered.length === 0 ? <div className="col-span-3 p-12 text-center text-muted-foreground"><Box className="h-12 w-12 mx-auto mb-3 opacity-20" /><p>אין ערכות עדיין</p></div>
        : filtered.map(kit => (
          <Card key={kit.id} className="bg-card/80 border-border hover:border-teal-500/30 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-mono text-xs text-teal-400">{kit.kit_code}</p>
                  <p className="text-foreground font-semibold mt-0.5">{kit.kit_name}</p>
                </div>
                <Badge className={`${kit.is_active !== false ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'} border-0 text-xs`}>{kit.is_active !== false ? 'פעיל' : 'לא פעיל'}</Badge>
              </div>
              {kit.description && <p className="text-muted-foreground text-xs mb-3">{kit.description}</p>}
              <div className="flex items-center justify-between text-sm mb-3">
                <span className="text-muted-foreground text-xs">מחיר מכירה</span>
                <span className="text-emerald-400 font-mono">{fmt(parseFloat(kit.selling_price || 0))}</span>
              </div>
              {availability[kit.id] && (
                <div className="bg-input rounded-lg p-2 mb-3">
                  <p className="text-xs text-muted-foreground mb-1">זמינות</p>
                  <p className={`text-lg font-bold font-mono ${availability[kit.id].available_qty > 0 ? 'text-green-400' : 'text-red-400'}`}>{availability[kit.id].available_qty} {kit.unit}</p>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => openDetail(kit)} className="flex-1 text-xs border border-border text-muted-foreground py-1.5 rounded hover:bg-muted flex items-center justify-center gap-1"><Eye className="h-3 w-3" />פרטים</button>
                {!availability[kit.id] && <button onClick={() => loadAvailability(kit.id)} className="flex-1 text-xs border border-teal-500/30 text-teal-300 py-1.5 rounded hover:bg-teal-500/10 flex items-center justify-center gap-1"><Layers className="h-3 w-3" />זמינות</button>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showForm && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowForm(false)}><div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><h2 className="text-lg font-bold text-foreground">ערכה חדשה</h2><button onClick={() => setShowForm(false)}><X className="h-5 w-5 text-gray-400" /></button></div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-xs text-muted-foreground">קוד ערכה *</Label><Input className="bg-input border-border text-foreground mt-1" value={form.kit_code || ""} onChange={e => setForm({...form, kit_code: e.target.value})} /></div>
            <div><Label className="text-xs text-muted-foreground">שם ערכה *</Label><Input className="bg-input border-border text-foreground mt-1" value={form.kit_name || ""} onChange={e => setForm({...form, kit_name: e.target.value})} /></div>
            <div><Label className="text-xs text-muted-foreground">יחידת מידה</Label><Input className="bg-input border-border text-foreground mt-1" value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} /></div>
            <div><Label className="text-xs text-muted-foreground">מחיר מכירה</Label><Input type="number" className="bg-input border-border text-foreground mt-1" value={form.selling_price} onChange={e => setForm({...form, selling_price: e.target.value})} /></div>
            <div className="col-span-2"><Label className="text-xs text-muted-foreground">תיאור</Label><textarea rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" value={form.description || ""} onChange={e => setForm({...form, description: e.target.value})} /></div>
          </div>
          <div className="border-b border-border pb-1"><h3 className="text-xs font-semibold text-teal-400">רכיבים (BOM)</h3></div>
          {components.map((comp, i) => (
            <div key={i} className="grid grid-cols-5 gap-2 items-end bg-input rounded-lg p-3">
              <div><Label className="text-xs text-muted-foreground">קוד</Label><Input className="bg-card border-border text-foreground mt-1 text-xs" value={comp.item_code} onChange={e => updateComp(i, "item_code", e.target.value)} /></div>
              <div className="col-span-2"><Label className="text-xs text-muted-foreground">שם רכיב</Label><Input className="bg-card border-border text-foreground mt-1 text-xs" value={comp.item_name} onChange={e => updateComp(i, "item_name", e.target.value)} /></div>
              <div><Label className="text-xs text-muted-foreground">כמות</Label><Input type="number" min={0.001} step={0.001} className="bg-card border-border text-foreground mt-1 text-xs" value={comp.quantity} onChange={e => updateComp(i, "quantity", e.target.value)} /></div>
              <button onClick={() => removeComp(i)} className="p-1.5 hover:bg-red-500/10 rounded self-end mb-0.5"><X className="h-4 w-4 text-red-400" /></button>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={addComp} size="sm" className="border-border gap-1"><Plus className="h-4 w-4" />הוסף רכיב</Button>
            {components.length > 0 && <span className="text-xs text-muted-foreground">עלות מחושבת: <span className="text-emerald-400 font-mono">{fmt(calcKitCost(components))}</span></span>}
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <Button variant="outline" onClick={() => setShowForm(false)} className="border-border">ביטול</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-teal-600 hover:bg-teal-700 gap-1">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}צור ערכה</Button>
        </div>
      </div></div>}

      {showDetail && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowDetail(null)}><div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><div className="flex items-center gap-3"><h2 className="text-lg font-bold text-foreground">{showDetail.kit_name}</h2><span className="text-xs font-mono text-teal-400">{showDetail.kit_code}</span></div><button onClick={() => setShowDetail(null)}><X className="h-5 w-5 text-gray-400" /></button></div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[["שם", showDetail.kit_name], ["קוד", showDetail.kit_code], ["יחידה", showDetail.unit], ["מחיר מכירה", fmt(parseFloat(showDetail.selling_price || 0))], ["תיאור", showDetail.description || "—"]].map(([l, v], i) => (
              <div key={i} className={`bg-input rounded-lg p-3 ${i === 4 ? 'col-span-2' : ''}`}><p className="text-[11px] text-muted-foreground">{l}</p><p className="text-foreground mt-1 font-medium text-sm">{String(v)}</p></div>
            ))}
          </div>
          {availability[showDetail.id] && (
            <div className="bg-teal-500/10 border border-teal-500/30 rounded-lg p-4">
              <p className="text-teal-400 font-semibold text-sm mb-3">זמינות ערכה: <span className="text-2xl font-mono">{availability[showDetail.id].available_qty}</span> {showDetail.unit}</p>
              <div className="space-y-2">
                {(availability[showDetail.id].components || []).map((comp: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-input rounded p-2">
                    <span className="text-muted-foreground">{comp.item_name || comp.item_code}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-foreground text-xs">נדרש: <span className="font-mono">{comp.quantity}</span></span>
                      <span className={`text-xs font-mono ${comp.stock_qty >= comp.quantity ? 'text-green-400' : 'text-red-400'}`}>במלאי: {comp.stock_qty}</span>
                      <span className={`text-xs ${comp.can_make > 0 ? 'text-green-400' : 'text-red-400'}`}>→ {comp.can_make} ערכות</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end p-4 border-t border-border"><Button variant="outline" onClick={() => setShowDetail(null)} className="border-border">סגור</Button></div>
      </div></div>}
    </div>
  );
}
