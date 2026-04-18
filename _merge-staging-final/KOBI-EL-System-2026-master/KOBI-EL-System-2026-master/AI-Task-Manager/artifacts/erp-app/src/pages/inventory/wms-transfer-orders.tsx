import { useState, useEffect, useCallback, useMemo } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Plus, X, Loader2, ArrowRightLeft, AlertCircle, RefreshCw, Eye, Truck, CheckCircle2 } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/20 text-gray-300",
  approved: "bg-blue-500/20 text-blue-300",
  in_transit: "bg-yellow-500/20 text-yellow-300",
  received: "bg-green-500/20 text-green-300",
  cancelled: "bg-red-500/20 text-red-400",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "טיוטה", approved: "מאושר", in_transit: "במעבר", received: "התקבל", cancelled: "בוטל"
};

export default function WmsTransferOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [lines, setLines] = useState<any[]>([{ item_code: "", item_name: "", quantity_requested: "", unit: "יח'" }]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, whRes] = await Promise.all([authFetch("/api/wms/transfer-orders"), authFetch("/api/warehouses")]);
      if (ordersRes.ok) setOrders(await ordersRes.json());
      if (whRes.ok) setWarehouses(await whRes.json());
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let d = [...orders];
    if (search) { const s = search.toLowerCase(); d = d.filter(r => r.transfer_number?.toLowerCase().includes(s) || r.from_warehouse_name?.toLowerCase().includes(s) || r.to_warehouse_name?.toLowerCase().includes(s)); }
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    return d;
  }, [orders, search, statusFilter]);

  const stats = useMemo(() => ({
    total: orders.length,
    inTransit: orders.filter(o => o.status === "in_transit").length,
    received: orders.filter(o => o.status === "received").length,
    draft: orders.filter(o => o.status === "draft").length,
  }), [orders]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await authFetch("/api/wms/transfer-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, lines: lines.filter(l => l.item_code || l.quantity_requested) }) });
      if (!res.ok) throw new Error((await res.json()).error);
      setShowForm(false); setForm({}); setLines([{ item_code: "", item_name: "", quantity_requested: "", unit: "יח'" }]); await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const updateStatus = async (id: number, status: string, extra?: any) => {
    try {
      const res = await authFetch(`/api/wms/transfer-orders/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, ...extra }) });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const addLine = () => setLines([...lines, { item_code: "", item_name: "", quantity_requested: "", unit: "יח'" }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: string, value: any) => setLines(lines.map((l, idx) => idx === i ? { ...l, [field]: value } : l));

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {error && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400"><AlertCircle className="h-4 w-4" /><span className="text-sm">{error}</span><button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button></div>}
      
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><ArrowRightLeft className="h-6 w-6 text-indigo-400" />העברות בין מחסנים</h1><p className="text-sm text-muted-foreground mt-1">יצירת העברות, מעקב במעבר, קבלה ביעד ובדיקת סטיות</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="border-border text-gray-300 gap-1"><RefreshCw className="h-4 w-4" />רענן</Button>
          <Button onClick={() => setShowForm(true)} className="bg-indigo-600 hover:bg-indigo-700 gap-2"><Plus className="h-4 w-4" />העברה חדשה</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: "סה״כ העברות", v: stats.total, c: "text-indigo-400" },
          { l: "במעבר", v: stats.inTransit, c: "text-yellow-400" },
          { l: "התקבלו", v: stats.received, c: "text-green-400" },
          { l: "טיוטות", v: stats.draft, c: "text-gray-400" },
        ].map((k, i) => (
          <Card key={i} className="bg-card/80 border-border"><CardContent className="p-4"><p className="text-[11px] text-muted-foreground">{k.l}</p><p className={`text-xl font-bold font-mono mt-1 ${k.c}`}>{k.v}</p></CardContent></Card>
        ))}
      </div>

      <Card className="bg-card/60 border-border"><CardContent className="p-3"><div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]"><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="bg-input border-border text-foreground" /></div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסטטוסים</option>{Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div></CardContent></Card>

      <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="border-b border-border bg-background/50">
          <th className="p-3 text-right text-muted-foreground">מספר</th>
          <th className="p-3 text-right text-muted-foreground">ממחסן</th>
          <th className="p-3 text-right text-muted-foreground">למחסן</th>
          <th className="p-3 text-right text-muted-foreground">מבוקש ע"י</th>
          <th className="p-3 text-right text-muted-foreground">הגעה צפויה</th>
          <th className="p-3 text-right text-muted-foreground">שורות</th>
          <th className="p-3 text-right text-muted-foreground">סטטוס</th>
          <th className="p-3 text-center text-muted-foreground">פעולות</th>
        </tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={8} className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-400" /></td></tr>
          : filtered.length === 0 ? <tr><td colSpan={8} className="p-12 text-center text-muted-foreground"><ArrowRightLeft className="h-12 w-12 mx-auto mb-3 opacity-20" /><p>אין העברות עדיין</p></td></tr>
          : filtered.map(row => (
            <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
              <td className="p-3 font-mono text-xs text-indigo-400">{row.transfer_number}</td>
              <td className="p-3 text-foreground text-xs">{row.from_warehouse_name || "—"}</td>
              <td className="p-3 text-foreground text-xs">{row.to_warehouse_name || "—"}</td>
              <td className="p-3 text-muted-foreground text-xs">{row.requested_by || "—"}</td>
              <td className="p-3 text-muted-foreground text-xs">{row.expected_arrival ? new Date(row.expected_arrival).toLocaleDateString("he-IL") : "—"}</td>
              <td className="p-3 text-center font-mono">{row.total_lines}</td>
              <td className="p-3"><Badge className={`${STATUS_COLORS[row.status] || ''} border-0 text-xs`}>{STATUS_LABELS[row.status] || row.status}</Badge></td>
              <td className="p-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <button onClick={() => setShowDetail(row)} className="p-1.5 hover:bg-muted rounded"><Eye className="h-4 w-4 text-blue-400" /></button>
                  {row.status === "draft" && <button onClick={() => updateStatus(row.id, "approved", { approved_by: "מנהל מחסן" })} className="text-xs border border-blue-500/30 text-blue-300 px-2 py-1 rounded hover:bg-blue-500/10">אשר</button>}
                  {row.status === "approved" && <button onClick={() => updateStatus(row.id, "in_transit", { shipped_at: new Date().toISOString() })} className="text-xs border border-yellow-500/30 text-yellow-300 px-2 py-1 rounded hover:bg-yellow-500/10 flex items-center gap-1"><Truck className="h-3 w-3" />שלח</button>}
                  {row.status === "in_transit" && <button onClick={() => updateStatus(row.id, "received", { received_at: new Date().toISOString() })} className="text-xs border border-green-500/30 text-green-300 px-2 py-1 rounded hover:bg-green-500/10 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />קבל</button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div></CardContent></Card>

      {showForm && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowForm(false)}><div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><h2 className="text-lg font-bold text-foreground">העברה חדשה</h2><button onClick={() => setShowForm(false)}><X className="h-5 w-5 text-gray-400" /></button></div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-xs text-muted-foreground">ממחסן *</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1" value={form.from_warehouse_id || ""} onChange={e => setForm({...form, from_warehouse_id: e.target.value})}><option value="">בחר...</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
            <div><Label className="text-xs text-muted-foreground">למחסן *</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1" value={form.to_warehouse_id || ""} onChange={e => setForm({...form, to_warehouse_id: e.target.value})}><option value="">בחר...</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
            <div><Label className="text-xs text-muted-foreground">הגעה צפויה</Label><Input type="date" className="bg-input border-border text-foreground mt-1" value={form.expected_arrival || ""} onChange={e => setForm({...form, expected_arrival: e.target.value})} /></div>
            <div><Label className="text-xs text-muted-foreground">מבוקש ע"י</Label><Input className="bg-input border-border text-foreground mt-1" value={form.requested_by || ""} onChange={e => setForm({...form, requested_by: e.target.value})} /></div>
          </div>
          <div className="border-b border-border pb-1"><h3 className="text-xs font-semibold text-indigo-400">פריטים</h3></div>
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-5 gap-2 items-end bg-input rounded-lg p-3">
              <div><Label className="text-xs text-muted-foreground">קוד פריט</Label><Input className="bg-card border-border text-foreground mt-1 text-xs" value={line.item_code} onChange={e => updateLine(i, "item_code", e.target.value)} /></div>
              <div className="col-span-2"><Label className="text-xs text-muted-foreground">שם פריט</Label><Input className="bg-card border-border text-foreground mt-1 text-xs" value={line.item_name} onChange={e => updateLine(i, "item_name", e.target.value)} /></div>
              <div><Label className="text-xs text-muted-foreground">כמות</Label><Input type="number" className="bg-card border-border text-foreground mt-1 text-xs" value={line.quantity_requested} onChange={e => updateLine(i, "quantity_requested", e.target.value)} /></div>
              <button onClick={() => removeLine(i)} className="p-1.5 hover:bg-red-500/10 rounded self-end mb-0.5"><X className="h-4 w-4 text-red-400" /></button>
            </div>
          ))}
          <Button variant="outline" onClick={addLine} size="sm" className="border-border gap-1"><Plus className="h-4 w-4" />הוסף פריט</Button>
          <div><Label className="text-xs text-muted-foreground">הערות</Label><textarea rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} /></div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <Button variant="outline" onClick={() => setShowForm(false)} className="border-border">ביטול</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 gap-1">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}צור העברה</Button>
        </div>
      </div></div>}

      {showDetail && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowDetail(null)}><div className="bg-card border border-border rounded-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><div className="flex items-center gap-3"><h2 className="text-lg font-bold text-foreground">{showDetail.transfer_number}</h2><Badge className={`${STATUS_COLORS[showDetail.status] || ''} border-0`}>{STATUS_LABELS[showDetail.status] || showDetail.status}</Badge></div><button onClick={() => setShowDetail(null)}><X className="h-5 w-5 text-gray-400" /></button></div>
        <div className="p-4 grid grid-cols-2 gap-3">
          {[["ממחסן", showDetail.from_warehouse_name], ["למחסן", showDetail.to_warehouse_name], ["מבוקש ע\"י", showDetail.requested_by || "—"], ["מאשר", showDetail.approved_by || "—"], ["הגעה צפויה", showDetail.expected_arrival ? new Date(showDetail.expected_arrival).toLocaleDateString("he-IL") : "—"], ["נשלח", showDetail.shipped_at ? new Date(showDetail.shipped_at).toLocaleDateString("he-IL") : "—"], ["התקבל", showDetail.received_at ? new Date(showDetail.received_at).toLocaleDateString("he-IL") : "—"], ["שורות", showDetail.total_lines], ["הערות", showDetail.notes || "—"]].map(([l, v], i) => (
            <div key={i} className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">{l}</p><p className="text-foreground mt-1 font-medium text-sm">{String(v)}</p></div>
          ))}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <Button variant="outline" onClick={() => setShowDetail(null)} className="border-border">סגור</Button>
          {showDetail.status === "draft" && <Button onClick={() => { updateStatus(showDetail.id, "approved", { approved_by: "מנהל מחסן" }); setShowDetail(null); }} className="bg-blue-600 hover:bg-blue-700 gap-1"><CheckCircle2 className="h-4 w-4" />אשר</Button>}
          {showDetail.status === "in_transit" && <Button onClick={() => { updateStatus(showDetail.id, "received", { received_at: new Date().toISOString() }); setShowDetail(null); }} className="bg-green-600 hover:bg-green-700 gap-1"><CheckCircle2 className="h-4 w-4" />קבל</Button>}
        </div>
      </div></div>}
    </div>
  );
}
