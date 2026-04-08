import { useState, useEffect, useCallback, useMemo } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Plus, X, Loader2, Package2, AlertCircle, RefreshCw, Eye, Minus } from "lucide-react";

export default function WmsConsignmentPage() {
  const [stocks, setStocks] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [tab, setTab] = useState<"stock" | "txn">("stock");
  const [showForm, setShowForm] = useState(false);
  const [showConsumeForm, setShowConsumeForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({ currency: "ILS" });
  const [consumeForm, setConsumeForm] = useState<any>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stockRes, txnRes, whRes] = await Promise.all([
        authFetch("/api/wms/consignment-stock"),
        authFetch("/api/wms/consignment-transactions"),
        authFetch("/api/warehouses"),
      ]);
      if (stockRes.ok) setStocks(await stockRes.json());
      if (txnRes.ok) setTransactions(await txnRes.json());
      if (whRes.ok) setWarehouses(await whRes.json());
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const suppliers = useMemo(() => [...new Set(stocks.map(s => s.supplier_name).filter(Boolean))], [stocks]);

  const filtered = useMemo(() => {
    let d = [...stocks];
    if (search) { const s = search.toLowerCase(); d = d.filter(r => r.item_code?.toLowerCase().includes(s) || r.item_name?.toLowerCase().includes(s) || r.supplier_name?.toLowerCase().includes(s)); }
    if (supplierFilter !== "all") d = d.filter(r => r.supplier_name === supplierFilter);
    return d;
  }, [stocks, search, supplierFilter]);

  const stats = useMemo(() => ({
    total: stocks.length,
    active: stocks.filter(s => s.status === 'active').length,
    totalValue: stocks.reduce((s, r) => s + parseFloat(r.quantity_on_hand || 0) * parseFloat(r.unit_cost || 0), 0),
    totalConsumed: stocks.reduce((s, r) => s + parseFloat(r.quantity_consumed || 0), 0),
  }), [stocks]);

  const fmt = (v: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await authFetch("/api/wms/consignment-stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error((await res.json()).error);
      setShowForm(false); setForm({ currency: "ILS" }); await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleConsume = async () => {
    if (!showConsumeForm) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/wms/consignment-stock/${showConsumeForm.id}/consume`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(consumeForm) });
      if (!res.ok) throw new Error((await res.json()).error);
      setShowConsumeForm(null); setConsumeForm({}); await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {error && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400"><AlertCircle className="h-4 w-4" /><span className="text-sm">{error}</span><button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button></div>}
      
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Package2 className="h-6 w-6 text-violet-400" />מלאי קונסיגנציה</h1><p className="text-sm text-muted-foreground mt-1">מלאי בבעלות ספקים, מעקב צריכה, דו"ח ספקים</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="border-border text-gray-300 gap-1"><RefreshCw className="h-4 w-4" />רענן</Button>
          <Button onClick={() => setShowForm(true)} className="bg-violet-600 hover:bg-violet-700 gap-2"><Plus className="h-4 w-4" />הוסף מלאי</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[{ l: "פריטים", v: stats.total, c: "text-violet-400" }, { l: "פעילים", v: stats.active, c: "text-green-400" }, { l: "שווי מלאי", v: fmt(stats.totalValue), c: "text-emerald-400" }, { l: "נצרך (כמות)", v: stats.totalConsumed.toLocaleString(), c: "text-yellow-400" }].map((k, i) => (
          <Card key={i} className="bg-card/80 border-border"><CardContent className="p-4"><p className="text-[11px] text-muted-foreground">{k.l}</p><p className={`text-xl font-bold font-mono mt-1 ${k.c}`}>{k.v}</p></CardContent></Card>
        ))}
      </div>

      <div className="flex gap-2 border-b border-border pb-2">
        <button onClick={() => setTab("stock")} className={`px-4 py-2 text-sm rounded-t-lg transition-colors ${tab === "stock" ? "bg-violet-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>מלאי קונסיגנציה</button>
        <button onClick={() => setTab("txn")} className={`px-4 py-2 text-sm rounded-t-lg transition-colors ${tab === "txn" ? "bg-violet-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>היסטוריית צריכה</button>
      </div>

      {tab === "stock" && (
        <>
          <Card className="bg-card/60 border-border"><CardContent className="p-3"><div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]"><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="bg-input border-border text-foreground" /></div>
            <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הספקים</option>{suppliers.map(s => <option key={s} value={s}>{s}</option>)}</select>
          </div></CardContent></Card>
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-background/50">
              <th className="p-3 text-right text-muted-foreground">ספק</th>
              <th className="p-3 text-right text-muted-foreground">קוד פריט</th>
              <th className="p-3 text-right text-muted-foreground">שם פריט</th>
              <th className="p-3 text-right text-muted-foreground">מחסן</th>
              <th className="p-3 text-right text-muted-foreground">במלאי</th>
              <th className="p-3 text-right text-muted-foreground">נצרך</th>
              <th className="p-3 text-right text-muted-foreground">הוחזר</th>
              <th className="p-3 text-right text-muted-foreground">עלות יחידה</th>
              <th className="p-3 text-right text-muted-foreground">ערך</th>
              <th className="p-3 text-right text-muted-foreground">סטטוס</th>
              <th className="p-3 text-center text-muted-foreground">פעולות</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={11} className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-violet-400" /></td></tr>
              : filtered.length === 0 ? <tr><td colSpan={11} className="p-12 text-center text-muted-foreground"><Package2 className="h-12 w-12 mx-auto mb-3 opacity-20" /><p>אין מלאי קונסיגנציה</p></td></tr>
              : filtered.map(row => (
                <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="p-3 text-violet-400 text-xs font-medium">{row.supplier_name || "—"}</td>
                  <td className="p-3 font-mono text-xs text-cyan-400">{row.item_code || "—"}</td>
                  <td className="p-3 text-foreground">{row.item_name || "—"}</td>
                  <td className="p-3 text-muted-foreground text-xs">{row.warehouse_name || "—"}</td>
                  <td className="p-3 font-mono text-center text-foreground">{parseFloat(row.quantity_on_hand || 0).toLocaleString()}</td>
                  <td className="p-3 font-mono text-center text-yellow-400">{parseFloat(row.quantity_consumed || 0).toLocaleString()}</td>
                  <td className="p-3 font-mono text-center text-muted-foreground">{parseFloat(row.quantity_returned || 0).toLocaleString()}</td>
                  <td className="p-3 font-mono text-muted-foreground text-xs">{fmt(parseFloat(row.unit_cost || 0))}</td>
                  <td className="p-3 font-mono text-emerald-400 text-xs">{fmt(parseFloat(row.quantity_on_hand || 0) * parseFloat(row.unit_cost || 0))}</td>
                  <td className="p-3"><Badge className={`border-0 text-xs ${row.status === 'active' ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'}`}>{row.status === 'active' ? 'פעיל' : 'לא פעיל'}</Badge></td>
                  <td className="p-3 text-center"><button onClick={() => setShowConsumeForm(row)} className="text-xs border border-yellow-500/30 text-yellow-300 px-2 py-1 rounded hover:bg-yellow-500/10 flex items-center gap-1 mx-auto"><Minus className="h-3 w-3" />צרוך</button></td>
                </tr>
              ))}
            </tbody>
          </table></div></CardContent></Card>
        </>
      )}

      {tab === "txn" && (
        <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-background/50">
            <th className="p-3 text-right text-muted-foreground">תאריך</th>
            <th className="p-3 text-right text-muted-foreground">סוג</th>
            <th className="p-3 text-right text-muted-foreground">כמות</th>
            <th className="p-3 text-right text-muted-foreground">עלות יחידה</th>
            <th className="p-3 text-right text-muted-foreground">עלות כוללת</th>
            <th className="p-3 text-right text-muted-foreground">הזמנת מכירה</th>
            <th className="p-3 text-right text-muted-foreground">אסמכתא</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-violet-400" /></td></tr>
            : transactions.length === 0 ? <tr><td colSpan={7} className="p-12 text-center text-muted-foreground"><p>אין עסקאות עדיין</p></td></tr>
            : transactions.map(t => (
              <tr key={t.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="p-3 text-muted-foreground text-xs">{new Date(t.created_at).toLocaleDateString("he-IL")}</td>
                <td className="p-3"><Badge className="bg-yellow-500/20 text-yellow-300 border-0 text-xs">{t.transaction_type}</Badge></td>
                <td className="p-3 font-mono text-foreground">{t.quantity}</td>
                <td className="p-3 font-mono text-muted-foreground text-xs">{t.unit_cost ? fmt(parseFloat(t.unit_cost)) : "—"}</td>
                <td className="p-3 font-mono text-emerald-400 text-xs">{t.unit_cost ? fmt(parseFloat(t.quantity) * parseFloat(t.unit_cost)) : "—"}</td>
                <td className="p-3 font-mono text-xs text-cyan-400">{t.sales_order_id || "—"}</td>
                <td className="p-3 text-muted-foreground text-xs">{t.reference_number || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table></div></CardContent></Card>
      )}

      {showForm && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowForm(false)}><div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><h2 className="text-lg font-bold text-foreground">הוסף מלאי קונסיגנציה</h2><button onClick={() => setShowForm(false)}><X className="h-5 w-5 text-gray-400" /></button></div>
        <div className="p-4 grid grid-cols-2 gap-4">
          <div><Label className="text-xs text-muted-foreground">שם ספק *</Label><Input className="bg-input border-border text-foreground mt-1" value={form.supplier_name || ""} onChange={e => setForm({...form, supplier_name: e.target.value})} /></div>
          <div><Label className="text-xs text-muted-foreground">מחסן</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1" value={form.warehouse_id || ""} onChange={e => setForm({...form, warehouse_id: e.target.value})}><option value="">בחר...</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          <div><Label className="text-xs text-muted-foreground">קוד פריט</Label><Input className="bg-input border-border text-foreground mt-1" value={form.item_code || ""} onChange={e => setForm({...form, item_code: e.target.value})} /></div>
          <div><Label className="text-xs text-muted-foreground">שם פריט *</Label><Input className="bg-input border-border text-foreground mt-1" value={form.item_name || ""} onChange={e => setForm({...form, item_name: e.target.value})} /></div>
          <div><Label className="text-xs text-muted-foreground">כמות</Label><Input type="number" className="bg-input border-border text-foreground mt-1" value={form.quantity_on_hand || ""} onChange={e => setForm({...form, quantity_on_hand: e.target.value})} /></div>
          <div><Label className="text-xs text-muted-foreground">עלות יחידה</Label><Input type="number" className="bg-input border-border text-foreground mt-1" value={form.unit_cost || ""} onChange={e => setForm({...form, unit_cost: e.target.value})} /></div>
          <div><Label className="text-xs text-muted-foreground">מיקום</Label><Input className="bg-input border-border text-foreground mt-1" value={form.location_code || ""} onChange={e => setForm({...form, location_code: e.target.value})} /></div>
          <div><Label className="text-xs text-muted-foreground">תאריך תפוגה</Label><Input type="date" className="bg-input border-border text-foreground mt-1" value={form.expiry_date || ""} onChange={e => setForm({...form, expiry_date: e.target.value})} /></div>
          <div className="col-span-2"><Label className="text-xs text-muted-foreground">הערות</Label><textarea rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} /></div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <Button variant="outline" onClick={() => setShowForm(false)} className="border-border">ביטול</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-violet-600 hover:bg-violet-700 gap-1">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}שמור</Button>
        </div>
      </div></div>}

      {showConsumeForm && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowConsumeForm(null)}><div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><h2 className="text-lg font-bold text-foreground">רישום צריכה</h2><button onClick={() => setShowConsumeForm(null)}><X className="h-5 w-5 text-gray-400" /></button></div>
        <div className="p-4 space-y-3">
          <div className="bg-input rounded-lg p-3 text-sm">
            <p className="text-muted-foreground">פריט: <span className="text-foreground">{showConsumeForm.item_name}</span></p>
            <p className="text-muted-foreground mt-1">במלאי: <span className="text-green-400 font-mono">{parseFloat(showConsumeForm.quantity_on_hand || 0)}</span></p>
          </div>
          <div><Label className="text-xs text-muted-foreground">כמות לצריכה *</Label><Input type="number" min={0.001} className="bg-input border-border text-foreground mt-1" value={consumeForm.quantity || ""} onChange={e => setConsumeForm({...consumeForm, quantity: e.target.value})} /></div>
          <div><Label className="text-xs text-muted-foreground">אסמכתא</Label><Input className="bg-input border-border text-foreground mt-1" value={consumeForm.reference_number || ""} onChange={e => setConsumeForm({...consumeForm, reference_number: e.target.value})} /></div>
          <div><Label className="text-xs text-muted-foreground">הערות</Label><textarea rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" value={consumeForm.notes || ""} onChange={e => setConsumeForm({...consumeForm, notes: e.target.value})} /></div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <Button variant="outline" onClick={() => setShowConsumeForm(null)} className="border-border">ביטול</Button>
          <Button onClick={handleConsume} disabled={saving} className="bg-yellow-600 hover:bg-yellow-700 gap-1">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Minus className="h-4 w-4" />}רשום צריכה</Button>
        </div>
      </div></div>}
    </div>
  );
}
