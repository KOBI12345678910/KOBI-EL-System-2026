import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  Truck, Plus, X, Save, Loader2, ChevronDown, ChevronUp, Calculator,
  Package, Shield, Wrench, DollarSign, Percent, BarChart3, AlertTriangle, Pencil
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const fmt = (v: number | string | null | undefined) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2 }).format(Number(v || 0));

const COMPONENT_TYPES = [
  { value: "freight", label: "שילוח", icon: Truck, color: "text-blue-400" },
  { value: "customs", label: "מכס", icon: Package, color: "text-orange-400" },
  { value: "insurance", label: "ביטוח", icon: Shield, color: "text-green-400" },
  { value: "handling", label: "טיפול", icon: Wrench, color: "text-purple-400" },
  { value: "other", label: "אחר", icon: DollarSign, color: "text-gray-400" },
];

const ALLOCATION_METHODS = [
  { value: "by_value", label: "לפי ערך" },
  { value: "by_quantity", label: "לפי כמות" },
  { value: "by_weight", label: "לפי משקל" },
  { value: "by_volume", label: "לפי נפח" },
  { value: "equal", label: "חלוקה שווה" },
];

export default function LandedCostPage() {
  const qc = useQueryClient();
  const [selectedPoId, setSelectedPoId] = useState<number | null>(null);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState<number | null>(null);
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);
  const [entryForm, setEntryForm] = useState({
    componentType: "freight",
    componentName: "שילוח",
    amount: "",
    currency: "ILS",
    allocationMethod: "by_value",
    notes: "",
  });

  const { data: posRaw = [] } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async () => { const r = await authFetch("/api/purchase-orders"); return r.json(); },
  });
  const pos: any[] = Array.isArray(posRaw) ? posRaw : (posRaw?.data || []);
  const activePOs = pos.filter(p => !["בוטל", "טיוטה"].includes(p.status));

  const { data: landedData, refetch: refetchLanded } = useQuery({
    queryKey: ["landed-cost", selectedPoId],
    queryFn: async () => {
      if (!selectedPoId) return null;
      const r = await authFetch(`/api/landed-costs/${selectedPoId}`);
      return r.json();
    },
    enabled: selectedPoId !== null,
  });

  const { data: previewData, refetch: refetchPreview } = useQuery({
    queryKey: ["landed-cost-preview", selectedPoId],
    queryFn: async () => {
      if (!selectedPoId) return null;
      const r = await authFetch(`/api/landed-costs/${selectedPoId}/preview`);
      return r.json();
    },
    enabled: selectedPoId !== null,
  });

  const selectedPO = pos.find(p => p.id === selectedPoId);

  const addEntryMut = useMutation({
    mutationFn: async () => {
      const r = await authFetch(`/api/landed-costs/${selectedPoId}/entries`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...entryForm,
          amount: parseFloat(entryForm.amount),
        }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["landed-cost", selectedPoId] });
      qc.invalidateQueries({ queryKey: ["landed-cost-preview", selectedPoId] });
      setShowAddEntry(false);
      setEntryForm({ componentType: "freight", componentName: "שילוח", amount: "", currency: "ILS", allocationMethod: "by_value", notes: "" });
    },
  });

  const editEntryMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`/api/landed-costs/entries/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...entryForm,
          amount: parseFloat(entryForm.amount),
        }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["landed-cost", selectedPoId] });
      qc.invalidateQueries({ queryKey: ["landed-cost-preview", selectedPoId] });
      setEditingEntry(null);
      setEntryForm({ componentType: "freight", componentName: "שילוח", amount: "", currency: "ILS", allocationMethod: "by_value", notes: "" });
    },
  });

  const deleteEntryMut = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`/api/landed-costs/entries/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["landed-cost", selectedPoId] });
      qc.invalidateQueries({ queryKey: ["landed-cost-preview", selectedPoId] });
    },
  });

  const entries = landedData?.entries || [];
  const totalLandedCost = landedData?.totalLandedCost || 0;
  const poAmount = parseFloat(selectedPO?.totalAmount || "0");
  const landedPct = poAmount > 0 ? (totalLandedCost / poAmount * 100).toFixed(1) : "0";

  const typeMap = Object.fromEntries(COMPONENT_TYPES.map(t => [t.value, t]));

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Calculator className="h-6 w-6 text-amber-400" />
            עלות עגינה (Landed Cost)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">חישוב ואילוקציה של עלויות שילוח, מכס וביטוח לפריטי הזמנה</p>
        </div>
      </div>

      <div className="flex gap-4 items-start">
        <div className="w-80 space-y-3">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-3">
              <Label className="text-muted-foreground text-xs mb-2 block">בחר הזמנת רכש</Label>
              <select value={selectedPoId || ""} onChange={e => setSelectedPoId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
                <option value="">בחר הזמנה...</option>
                {activePOs.map(p => (
                  <option key={p.id} value={p.id}>{p.order_number || p.orderNumber} — {fmt(p.total_amount ?? p.totalAmount)}</option>
                ))}
              </select>
            </CardContent>
          </Card>

          {selectedPoId && selectedPO && (
            <Card className="bg-card/80 border-border">
              <CardContent className="p-3 space-y-2">
                <p className="text-xs text-muted-foreground font-semibold">סיכום עלויות</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">שווי PO</span>
                  <span className="text-foreground font-mono">{fmt(poAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">עלויות עגינה</span>
                  <span className="text-amber-400 font-mono">{fmt(totalLandedCost)}</span>
                </div>
                <div className="h-px bg-muted" />
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-muted-foreground">עלות עגינה כוללת</span>
                  <span className="text-foreground font-mono">{fmt(poAmount + totalLandedCost)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">% מהשווי</span>
                  <span className={`font-mono ${parseFloat(landedPct) > 15 ? "text-red-400" : parseFloat(landedPct) > 8 ? "text-yellow-400" : "text-green-400"}`}>
                    {landedPct}%
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {selectedPoId && (
            <Button onClick={() => setShowAddEntry(true)} className="w-full bg-amber-600 hover:bg-amber-700 gap-2">
              <Plus className="h-4 w-4" />הוסף עלות
            </Button>
          )}
        </div>

        <div className="flex-1 space-y-4">
          {!selectedPoId ? (
            <div className="text-center py-16 text-muted-foreground">
              <Calculator className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p className="font-medium">בחר הזמנת רכש</p>
              <p className="text-sm">בחר הזמנה מהרשימה כדי לנהל עלויות העגינה שלה</p>
            </div>
          ) : (
            <>
              <div className="flex gap-2 flex-wrap">
                {COMPONENT_TYPES.map(type => {
                  const existing = entries.filter((e: any) => e.component_type === type.value);
                  if (existing.length === 0) return null;
                  const total = existing.reduce((s: number, e: any) => s + parseFloat(e.amount || 0), 0);
                  return (
                    <div key={type.value} className="bg-card/80 border border-border rounded-lg p-3 flex items-center gap-2">
                      <type.icon className={`h-4 w-4 ${type.color}`} />
                      <div>
                        <p className="text-[10px] text-muted-foreground">{type.label}</p>
                        <p className={`text-sm font-bold font-mono ${type.color}`}>{fmt(total)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {entries.length === 0 ? (
                <Card className="bg-card/80 border-border">
                  <CardContent className="p-12 text-center">
                    <Truck className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-muted-foreground">אין עלויות עגינה עדיין</p>
                    <p className="text-sm text-muted-foreground/60 mt-1">הוסף עלויות שילוח, מכס, ביטוח וטיפול</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {entries.map((entry: any) => {
                    const typeInfo = typeMap[entry.component_type] || COMPONENT_TYPES[4];
                    return (
                      <Card key={entry.id} className="bg-card/80 border-border">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <typeInfo.icon className={`h-5 w-5 ${typeInfo.color}`} />
                              <div>
                                <p className="font-medium text-foreground text-sm">{entry.component_name}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {typeInfo.label} · {ALLOCATION_METHODS.find(m => m.value === entry.allocation_method)?.label || entry.allocation_method}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`font-mono font-bold ${typeInfo.color}`}>{fmt(entry.amount)}</span>
                              <button onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)} className="p-1 hover:bg-muted rounded">
                                {expandedEntry === entry.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                              </button>
                              <button onClick={() => {
                                setEditingEntry(entry.id);
                                setEntryForm({
                                  componentType: entry.component_type || "freight",
                                  componentName: entry.component_name || "",
                                  amount: String(entry.amount || ""),
                                  currency: entry.currency || "ILS",
                                  allocationMethod: entry.allocation_method || "by_value",
                                  notes: entry.notes || "",
                                });
                              }} className="p-1 hover:bg-blue-500/20 rounded">
                                <Pencil className="h-4 w-4 text-blue-400" />
                              </button>
                              <button onClick={() => { if (confirm("למחוק?")) deleteEntryMut.mutate(entry.id); }} className="p-1 hover:bg-red-500/20 rounded">
                                <X className="h-4 w-4 text-red-400" />
                              </button>
                            </div>
                          </div>

                          {expandedEntry === entry.id && entry.allocations?.length > 0 && (
                            <div className="mt-3 border-t border-border pt-3">
                              <p className="text-xs text-muted-foreground mb-2">אילוקציה לפריטים</p>
                              <table className="w-full text-xs">
                                <thead><tr className="border-b border-border/50">
                                  <th className="pb-1 text-right text-muted-foreground">פריט</th>
                                  <th className="pb-1 text-right text-muted-foreground">%</th>
                                  <th className="pb-1 text-right text-muted-foreground">סכום</th>
                                  <th className="pb-1 text-right text-muted-foreground">ליחידה</th>
                                </tr></thead>
                                <tbody>
                                  {entry.allocations.map((alloc: any, i: number) => (
                                    <tr key={i} className="border-b border-border/30">
                                      <td className="py-1.5 text-foreground">{alloc.item_description}</td>
                                      <td className="py-1.5 font-mono text-muted-foreground">{parseFloat(alloc.allocation_pct || 0).toFixed(1)}%</td>
                                      <td className="py-1.5 font-mono text-amber-400">{fmt(alloc.allocated_amount)}</td>
                                      <td className="py-1.5 font-mono text-muted-foreground">{fmt(alloc.landed_cost_per_unit)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {previewData?.items?.length > 0 && (
                <Card className="bg-card/80 border-border">
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      סיכום עלות עגינה לפי פריט
                    </h3>
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-border">
                        <th className="pb-2 text-right text-muted-foreground">פריט</th>
                        <th className="pb-2 text-right text-muted-foreground">כמות</th>
                        <th className="pb-2 text-right text-muted-foreground">מחיר יחידה</th>
                        <th className="pb-2 text-right text-muted-foreground">עלות עגינה</th>
                        <th className="pb-2 text-right text-muted-foreground">עלות עגינה ליח'</th>
                        <th className="pb-2 text-right text-muted-foreground">מחיר כולל</th>
                      </tr></thead>
                      <tbody>
                        {previewData.items.map((item: any, i: number) => {
                          const landedUnit = item.totalLandedCostPerUnit;
                          const totalUnit = item.unitPrice + landedUnit;
                          return (
                            <tr key={i} className="border-b border-border/30">
                              <td className="py-2 text-foreground">{item.description}</td>
                              <td className="py-2 font-mono text-muted-foreground">{item.quantity}</td>
                              <td className="py-2 font-mono text-muted-foreground">{fmt(item.unitPrice)}</td>
                              <td className="py-2 font-mono text-amber-400">{fmt(item.totalLandedCostAllocation)}</td>
                              <td className="py-2 font-mono text-amber-400">+{fmt(landedUnit)}</td>
                              <td className="py-2 font-mono text-foreground font-bold">{fmt(totalUnit)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {showAddEntry && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowAddEntry(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold text-foreground">הוספת עלות עגינה</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowAddEntry(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <Label className="text-muted-foreground text-xs">סוג עלות</Label>
                <div className="grid grid-cols-5 gap-2 mt-1">
                  {COMPONENT_TYPES.map(type => (
                    <button key={type.value} onClick={() => setEntryForm({ ...entryForm, componentType: type.value, componentName: type.label })}
                      className={`flex flex-col items-center p-2 rounded-lg border text-xs transition-colors ${entryForm.componentType === type.value ? "border-amber-500/50 bg-amber-500/10" : "border-border hover:border-border"}`}>
                      <type.icon className={`h-4 w-4 ${type.color} mb-1`} />
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">שם הרכיב</Label>
                <Input value={entryForm.componentName} onChange={e => setEntryForm({ ...entryForm, componentName: e.target.value })} className="bg-input border-border text-foreground mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-muted-foreground text-xs">סכום (₪)</Label>
                  <Input type="number" value={entryForm.amount} onChange={e => setEntryForm({ ...entryForm, amount: e.target.value })} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">שיטת הקצאה</Label>
                  <select value={entryForm.allocationMethod} onChange={e => setEntryForm({ ...entryForm, allocationMethod: e.target.value })}
                    className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    {ALLOCATION_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">הערות</Label>
                <Input value={entryForm.notes} onChange={e => setEntryForm({ ...entryForm, notes: e.target.value })} className="bg-input border-border text-foreground mt-1" />
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" onClick={() => setShowAddEntry(false)} className="border-border">ביטול</Button>
              <Button onClick={() => addEntryMut.mutate()} disabled={!entryForm.amount || !entryForm.componentName || addEntryMut.isPending}
                className="bg-amber-600 hover:bg-amber-700 gap-1">
                {addEntryMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}שמור
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingEntry !== null && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setEditingEntry(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold text-foreground">עריכת רכיב עלות</h3>
              <Button variant="ghost" size="sm" onClick={() => setEditingEntry(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-muted-foreground text-xs">סוג רכיב</Label>
                  <select value={entryForm.componentType} onChange={e => setEntryForm({ ...entryForm, componentType: e.target.value })}
                    className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    {COMPONENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">שם</Label>
                  <Input value={entryForm.componentName} onChange={e => setEntryForm({ ...entryForm, componentName: e.target.value })} className="bg-input border-border text-foreground mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-muted-foreground text-xs">סכום *</Label>
                  <Input type="number" value={entryForm.amount} onChange={e => setEntryForm({ ...entryForm, amount: e.target.value })} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">שיטת הקצאה</Label>
                  <select value={entryForm.allocationMethod} onChange={e => setEntryForm({ ...entryForm, allocationMethod: e.target.value })}
                    className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    {ALLOCATION_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">הערות</Label>
                <Input value={entryForm.notes} onChange={e => setEntryForm({ ...entryForm, notes: e.target.value })} className="bg-input border-border text-foreground mt-1" />
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" onClick={() => setEditingEntry(null)} className="border-border">ביטול</Button>
              <Button onClick={() => editEntryMut.mutate(editingEntry!)} disabled={!entryForm.amount || editEntryMut.isPending}
                className="bg-blue-600 hover:bg-blue-700 gap-1">
                {editEntryMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}עדכן
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
