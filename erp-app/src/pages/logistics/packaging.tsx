import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, Printer, Truck, RefreshCw, Trash2, ChevronDown, ChevronUp, Cpu } from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/20 text-gray-300",
  confirmed: "bg-blue-500/20 text-blue-300",
  shipped: "bg-green-500/20 text-green-300",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "טיוטה",
  confirmed: "מאושר",
  shipped: "נשלח",
};

const CONTAINER_TYPES = [
  { value: "20GP", label: '20\' GP (590×235×239 ס"מ)', l: 590, w: 235, h: 239 },
  { value: "40GP", label: '40\' GP (1200×235×239 ס"מ)', l: 1200, w: 235, h: 239 },
  { value: "40HC", label: '40\' HC (1200×235×269 ס"מ)', l: 1200, w: 235, h: 269 },
  { value: "LCL", label: "LCL — מטען חלקי", l: 0, w: 0, h: 0 },
];

interface PLItem { id: string; name: string; qty: number; length: number; width: number; height: number; weight: number; hsCode: string; }
interface PackingList { id: number; packing_number: string; customer_name: string; delivery_address: string; container_type: string; items: PLItem[]; total_weight: string; total_volume: string; utilization_pct: string; status: string; notes: string; }
interface LoadPlan { placements: any[]; utilizationPct: string; totalItems: number; containerType: string; }
interface Stats { total: number; draft: number; confirmed: number; shipped: number; avg_utilization: number; total_weight: number; }

export default function PackagingPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loadPlan, setLoadPlan] = useState<LoadPlan | null>(null);
  const [loadingOptimize, setLoadingOptimize] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [labelData, setLabelData] = useState<any | null>(null);

  const [form, setForm] = useState({
    customerName: "", deliveryAddress: "", containerType: "20GP",
    notes: "", items: [] as PLItem[],
  });

  const { data: lists = [] } = useQuery<PackingList[]>({
    queryKey: ["packing-lists"],
    queryFn: async () => {
      const r = await authFetch(`${API}/packing-lists-v2`);
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
    staleTime: 60_000,
  });

  const { data: stats } = useQuery<Stats | null>({
    queryKey: ["packing-lists-stats"],
    queryFn: async () => {
      const r = await authFetch(`${API}/packing-lists-v2/stats`);
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 60_000,
  });

  function addItem() {
    setForm(f => ({
      ...f,
      items: [...f.items, { id: String(Date.now()), name: "", qty: 1, length: 0, width: 0, height: 0, weight: 0, hsCode: "" }]
    }));
  }

  function updateItem(idx: number, key: keyof PLItem, value: any) {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [key]: key === "name" || key === "id" || key === "hsCode" ? value : Number(value) };
      return { ...f, items };
    });
  }

  function removeItem(idx: number) {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const ct = CONTAINER_TYPES.find(c => c.value === form.containerType) || CONTAINER_TYPES[0];
      await authFetch(`${API}/packing-lists-v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          containerDimensionsL: ct.l, containerDimensionsW: ct.w, containerDimensionsH: ct.h,
        }),
      });
      setShowForm(false);
      setForm({ customerName: "", deliveryAddress: "", containerType: "20GP", notes: "", items: [] });
      queryClient.invalidateQueries({ queryKey: ["packing-lists"] });
      queryClient.invalidateQueries({ queryKey: ["packing-lists-stats"] });
    } finally { setSaving(false); }
  }

  async function handleOptimize(id: number) {
    setLoadingOptimize(id);
    setLoadPlan(null);
    try {
      const r = await authFetch(`${API}/packing-lists-v2/${id}/optimize`, { method: "POST" });
      const data = await r.json();
      setLoadPlan(data);
      setExpandedId(id);
    } finally { setLoadingOptimize(null); }
  }

  async function handlePrintLabel(pl: PackingList) {
    const r = await authFetch(`${API}/packing-lists-v2/${pl.id}/label`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carrier: "ZIM", serviceType: "Standard" }),
    });
    const data = await r.json();
    setLabelData(data);
  }

  async function handleDelete(id: number) {
    if (!confirm("למחוק רשימת אריזה זו?")) return;
    await authFetch(`${API}/packing-lists-v2/${id}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["packing-lists"] });
    queryClient.invalidateQueries({ queryKey: ["packing-lists-stats"] });
  }

  async function handleStatusChange(pl: PackingList, status: string) {
    await authFetch(`${API}/packing-lists-v2/${pl.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...pl, status }),
    });
    queryClient.invalidateQueries({ queryKey: ["packing-lists"] });
    queryClient.invalidateQueries({ queryKey: ["packing-lists-stats"] });
  }

  const utilizationColor = (pct: number) =>
    pct >= 85 ? "text-green-400" : pct >= 60 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">אריזה ומשלוח</h1>
          <p className="text-sm text-muted-foreground mt-1">רשימות אריזה, תכנון מיכל תלת-מימד ותוויות משלוח</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ["packing-lists"] }); queryClient.invalidateQueries({ queryKey: ["packing-lists-stats"] }); }}><RefreshCw className="w-4 h-4 ml-1" />רענן</Button>
          <Button size="sm" className="bg-primary" onClick={() => setShowForm(true)}><Plus className="w-4 h-4 ml-1" />רשימת אריזה חדשה</Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: "סה״כ", value: stats.total, color: "text-foreground" },
            { label: "טיוטות", value: stats.draft, color: "text-gray-400" },
            { label: "מאושרות", value: stats.confirmed, color: "text-blue-400" },
            { label: "נשלחו", value: stats.shipped, color: "text-green-400" },
            { label: "ניצולת ממוצעת", value: `${Math.round(Number(stats.avg_utilization))}%`, color: utilizationColor(Number(stats.avg_utilization)) },
            { label: "משקל כולל (ק״ג)", value: Math.round(Number(stats.total_weight)).toLocaleString(), color: "text-cyan-400" },
          ].map(s => (
            <Card key={s.label} className="bg-card/50 border-border/50">
              <CardContent className="p-3 text-center">
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Packing List Form */}
      {showForm && (
        <Card className="bg-card/50 border-border/50 border-blue-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-foreground">רשימת אריזה חדשה</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">שם לקוח</label>
                <Input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} placeholder="שם לקוח" className="bg-background/50" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">כתובת משלוח</label>
                <Input value={form.deliveryAddress} onChange={e => setForm(f => ({ ...f, deliveryAddress: e.target.value }))} placeholder="כתובת מלאה" className="bg-background/50" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">סוג מכולה</label>
                <select value={form.containerType} onChange={e => setForm(f => ({ ...f, containerType: e.target.value }))} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  {CONTAINER_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">פריטים</span>
                <Button size="sm" variant="outline" onClick={addItem}><Plus className="w-3 h-3 ml-1" />הוסף פריט</Button>
              </div>
              {form.items.length === 0 && (
                <div className="text-center py-6 text-muted-foreground text-sm border border-dashed border-border/40 rounded-lg">
                  לחץ "הוסף פריט" כדי להתחיל
                </div>
              )}
              {form.items.map((item, idx) => (
                <div key={item.id} className="grid grid-cols-8 gap-2 mb-2 items-center">
                  <Input className="col-span-2 bg-background/50 text-xs" placeholder="שם פריט" value={item.name} onChange={e => updateItem(idx, "name", e.target.value)} />
                  <Input type="number" className="bg-background/50 text-xs" placeholder="כמות" value={item.qty || ""} onChange={e => updateItem(idx, "qty", e.target.value)} />
                  <Input type="number" className="bg-background/50 text-xs" placeholder='א (ס"מ)' value={item.length || ""} onChange={e => updateItem(idx, "length", e.target.value)} />
                  <Input type="number" className="bg-background/50 text-xs" placeholder='ר (ס"מ)' value={item.width || ""} onChange={e => updateItem(idx, "width", e.target.value)} />
                  <Input type="number" className="bg-background/50 text-xs" placeholder='ג (ס"מ)' value={item.height || ""} onChange={e => updateItem(idx, "height", e.target.value)} />
                  <Input type="number" className="bg-background/50 text-xs" placeholder="משקל ק״ג" value={item.weight || ""} onChange={e => updateItem(idx, "weight", e.target.value)} />
                  <Button size="sm" variant="ghost" className="text-red-400" onClick={() => removeItem(idx)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              ))}
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">הערות</label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="הערות נוספות" className="bg-background/50" />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowForm(false)}>ביטול</Button>
              <Button className="bg-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? <RefreshCw className="w-4 h-4 ml-1 animate-spin" /> : <Plus className="w-4 h-4 ml-1" />}שמור
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Label Modal */}
      {labelData && (
        <Card className="bg-card/50 border-border/50 border-green-500/40">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-foreground">תווית משלוח — {labelData.carrier}</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setLabelData(null)}>✕</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-white text-black p-4 rounded-lg text-sm font-mono">
              <div className="text-xl font-bold mb-2">SHIPPING LABEL</div>
              <div><b>TO:</b> {labelData.label_data?.customerName || "N/A"}</div>
              <div>{labelData.label_data?.deliveryAddress || ""}</div>
              <div className="mt-2"><b>CARRIER:</b> {labelData.carrier}</div>
              <div><b>SERVICE:</b> {labelData.service_type}</div>
              <div><b>WEIGHT:</b> {labelData.weight} kg</div>
              <div className="mt-2 text-center text-2xl font-bold tracking-widest border border-black p-2">
                {labelData.barcode}
              </div>
            </div>
            <Button className="mt-3 w-full" variant="outline" onClick={() => window.print()}>
              <Printer className="w-4 h-4 ml-1" />הדפס תווית
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 3D Load Plan Visualization */}
      {loadPlan && (
        <Card className="bg-card/50 border-border/50 border-purple-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              תכנון טעינה — {loadPlan.containerType}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6 mb-4">
              <div className="text-center">
                <div className={`text-3xl font-bold ${utilizationColor(Number(loadPlan.utilizationPct))}`}>
                  {Number(loadPlan.utilizationPct).toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">ניצולת מיכל</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">{loadPlan.totalItems}</div>
                <div className="text-xs text-muted-foreground">פריטים שמוקמו</div>
              </div>
            </div>

            {/* Simple 2D top-view representation */}
            <div className="bg-background/30 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-2">תצוגה עליונה — מיקום פריטים</p>
              <div className="relative bg-zinc-800 rounded overflow-hidden" style={{ height: 200 }}>
                {loadPlan.placements.slice(0, 30).map((p: any, i: number) => {
                  const scale = 0.25;
                  return (
                    <div
                      key={i}
                      className="absolute border border-blue-400/50 bg-blue-500/20 flex items-center justify-center"
                      style={{
                        left: `${p.x * scale}px`,
                        top: `${p.z * scale}px`,
                        width: `${Math.max(8, p.l * scale)}px`,
                        height: `${Math.max(8, p.h * scale)}px`,
                      }}
                      title={p.name}
                    >
                      <span className="text-[8px] text-blue-300 truncate px-0.5">{p.name?.substring(0, 4)}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">* אלגוריתם: First-Fit Decreasing (FFD) לפי נפח</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lists Table */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-0">
          {lists.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">אין רשימות אריזה</p>
              <p className="text-sm mt-1">לחץ "רשימת אריזה חדשה" להתחיל</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-right p-3 text-muted-foreground font-medium">מספר אריזה</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">לקוח</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">מיכל</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">משקל</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">ניצולת</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                    <th className="text-center p-3 text-muted-foreground font-medium">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {lists.map(pl => (
                    <>
                      <tr key={pl.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 font-mono text-blue-300">{pl.packing_number}</td>
                        <td className="p-3 text-foreground">{pl.customer_name || "—"}</td>
                        <td className="p-3 text-foreground">{pl.container_type}</td>
                        <td className="p-3 text-foreground">{pl.total_weight} ק״ג</td>
                        <td className="p-3">
                          <span className={`font-bold ${utilizationColor(Number(pl.utilization_pct))}`}>
                            {Number(pl.utilization_pct).toFixed(1)}%
                          </span>
                        </td>
                        <td className="p-3">
                          <Badge className={STATUS_COLORS[pl.status] || "bg-gray-500/20 text-gray-300"}>
                            {STATUS_LABELS[pl.status] || pl.status}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setExpandedId(expandedId === pl.id ? null : pl.id)} title="פרטים">
                              {expandedId === pl.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleOptimize(pl.id)} title="אופטימיזציה" disabled={loadingOptimize === pl.id}>
                              {loadingOptimize === pl.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Cpu className="w-3.5 h-3.5 text-purple-400" />}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handlePrintLabel(pl)} title="תווית משלוח">
                              <Printer className="w-3.5 h-3.5 text-cyan-400" />
                            </Button>
                            {pl.status === "draft" && (
                              <Button size="sm" variant="ghost" onClick={() => handleStatusChange(pl, "confirmed")} title="אשר">
                                <Truck className="w-3.5 h-3.5 text-green-400" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="text-red-400" onClick={() => handleDelete(pl.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === pl.id && (
                        <tr key={`${pl.id}-exp`} className="border-b border-border/20 bg-card/20">
                          <td colSpan={7} className="p-4">
                            <div className="text-xs text-muted-foreground mb-2">פריטים ברשימת האריזה:</div>
                            {(Array.isArray(pl.items) ? pl.items : []).length === 0 ? (
                              <p className="text-xs text-muted-foreground">אין פריטים</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-muted-foreground">
                                    <th className="text-right pr-2">שם</th><th className="text-right pr-2">כמות</th>
                                    <th className="text-right pr-2">אורך</th><th className="text-right pr-2">רוחב</th>
                                    <th className="text-right pr-2">גובה</th><th className="text-right pr-2">משקל</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(Array.isArray(pl.items) ? pl.items : []).map((item: PLItem, i: number) => (
                                    <tr key={i} className="border-t border-border/20">
                                      <td className="pr-2 py-1 text-foreground">{item.name}</td>
                                      <td className="pr-2 py-1">{item.qty}</td>
                                      <td className="pr-2 py-1">{item.length}</td>
                                      <td className="pr-2 py-1">{item.width}</td>
                                      <td className="pr-2 py-1">{item.height}</td>
                                      <td className="pr-2 py-1">{item.weight} ק״ג</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            {pl.notes && <p className="text-xs text-muted-foreground mt-2">הערות: {pl.notes}</p>}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
