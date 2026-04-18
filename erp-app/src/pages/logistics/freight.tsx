import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, RefreshCw, Star, DollarSign, BarChart3, Calculator, Truck, CheckCircle2, Trash2 } from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

interface Carrier { id: number; carrier_code: string; carrier_name: string; carrier_type: string; country: string; is_active: boolean; }
interface ScoreRow { carrier_id: number; carrier_name: string; carrier_type: string; avg_on_time_pct: string; avg_damage_rate: string; avg_cost_per_kg: string; total_shipments: string; avg_overall_score: string; }
interface CalcResult { id: number; carrier_id: number; carrier_name: string; weight_kg: string; volume_cbm: string; base_rate: string; fuel_surcharge: string; handling_fee: string; calculated_cost: string; currency: string; is_selected: boolean; comparison_group_id: string; }

const CARRIER_TYPE_LABELS: Record<string, string> = {
  sea: "ים", air: "אוויר", express: "אקספרס", road: "יבשה", rail: "רכבת"
};

function ScoreBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  return (
    <div className="w-full bg-background/50 rounded-full h-2">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  );
}

export default function FreightPage() {
  const queryClient = useQueryClient();
  const [comparisons, setComparisons] = useState<CalcResult[]>([]);
  const [activeTab, setActiveTab] = useState<"compare" | "scorecards" | "carriers">("compare");
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [showAddCarrier, setShowAddCarrier] = useState(false);
  const [savingCarrier, setSavingCarrier] = useState(false);

  const [calcForm, setCalcForm] = useState({ weightKg: "", volumeCbm: "", distanceKm: "", originZone: "Israel", destinationZone: "", shipmentRef: "" });
  const [newCarrier, setNewCarrier] = useState({ carrierCode: "", carrierName: "", carrierType: "sea", country: "", contactName: "", contactEmail: "", contactPhone: "" });

  const { data: carriers = [] } = useQuery<Carrier[]>({
    queryKey: ["freight-carriers"],
    queryFn: async () => {
      const r = await authFetch(`${API}/carriers`);
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
    staleTime: 60_000,
  });

  const { data: scorecards = [] } = useQuery<ScoreRow[]>({
    queryKey: ["freight-carrier-scorecards"],
    queryFn: async () => {
      const r = await authFetch(`${API}/carrier-scorecards/summary`);
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
    staleTime: 60_000,
  });

  async function handleCompare() {
    if (!calcForm.weightKg && !calcForm.volumeCbm) return;
    setLoadingCompare(true);
    try {
      const r = await authFetch(`${API}/freight-calculations/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(calcForm),
      });
      const data = await r.json();
      setComparisons(data.comparisons || []);
    } finally { setLoadingCompare(false); }
  }

  async function handleSelect(id: number) {
    await authFetch(`${API}/freight-calculations/${id}/select`, { method: "PUT" });
    setComparisons(prev => prev.map(c => ({ ...c, is_selected: c.id === id })));
  }

  async function handleAddCarrier() {
    setSavingCarrier(true);
    try {
      await authFetch(`${API}/carriers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCarrier),
      });
      setShowAddCarrier(false);
      setNewCarrier({ carrierCode: "", carrierName: "", carrierType: "sea", country: "", contactName: "", contactEmail: "", contactPhone: "" });
      queryClient.invalidateQueries({ queryKey: ["freight-carriers"] });
    } finally { setSavingCarrier(false); }
  }

  async function handleDeleteCarrier(id: number) {
    if (!confirm("למחוק מוביל?")) return;
    await authFetch(`${API}/carriers/${id}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["freight-carriers"] });
  }

  const scoreColor = (score: number) =>
    score >= 90 ? "bg-green-500" : score >= 75 ? "bg-yellow-500" : "bg-red-500";

  const cheapest = comparisons.length > 0 ? Math.min(...comparisons.map(c => parseFloat(c.calculated_cost))) : null;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ניהול עלויות מטענים</h1>
          <p className="text-sm text-muted-foreground mt-1">השוואת מובילים, חישוב עלויות וכרטיסי ביצועים</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["freight-carriers"] });
            queryClient.invalidateQueries({ queryKey: ["freight-carrier-scorecards"] });
          }}><RefreshCw className="w-4 h-4 ml-1" />רענן</Button>
          <Button size="sm" className="bg-primary" onClick={() => setShowAddCarrier(true)}><Plus className="w-4 h-4 ml-1" />מוביל חדש</Button>
        </div>
      </div>

      <div className="flex gap-1 bg-background/50 p-1 rounded-lg w-fit">
        {[
          { id: "compare", label: "השוואת מחירים", icon: Calculator },
          { id: "scorecards", label: "ביצועי מובילים", icon: BarChart3 },
          { id: "carriers", label: "רשימת מובילים", icon: Truck },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-colors ${
              activeTab === tab.id ? "bg-primary text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="w-4 h-4" />{tab.label}
          </button>
        ))}
      </div>

      {activeTab === "compare" && (
        <div className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-foreground">מחשבון עלות משלוח</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">משקל (ק״ג)</label>
                  <Input type="number" value={calcForm.weightKg} onChange={e => setCalcForm(f => ({ ...f, weightKg: e.target.value }))} placeholder="0" className="bg-background/50" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">נפח (CBM)</label>
                  <Input type="number" value={calcForm.volumeCbm} onChange={e => setCalcForm(f => ({ ...f, volumeCbm: e.target.value }))} placeholder="0" className="bg-background/50" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">מרחק (ק״מ)</label>
                  <Input type="number" value={calcForm.distanceKm} onChange={e => setCalcForm(f => ({ ...f, distanceKm: e.target.value }))} placeholder="אופציונלי" className="bg-background/50" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">אזור מוצא</label>
                  <Input value={calcForm.originZone} onChange={e => setCalcForm(f => ({ ...f, originZone: e.target.value }))} placeholder="Israel" className="bg-background/50" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">אזור יעד</label>
                  <Input value={calcForm.destinationZone} onChange={e => setCalcForm(f => ({ ...f, destinationZone: e.target.value }))} placeholder="Europe" className="bg-background/50" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">מסמך / הפניה</label>
                  <Input value={calcForm.shipmentRef} onChange={e => setCalcForm(f => ({ ...f, shipmentRef: e.target.value }))} placeholder="SHP-2026-0001" className="bg-background/50" />
                </div>
              </div>
              <Button onClick={handleCompare} disabled={loadingCompare} className="bg-primary">
                {loadingCompare ? <RefreshCw className="w-4 h-4 ml-1 animate-spin" /> : <Calculator className="w-4 h-4 ml-1" />}
                השווה מובילים
              </Button>
            </CardContent>
          </Card>

          {comparisons.length > 0 && (
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-foreground">תוצאות השוואה — {comparisons.length} מובילים</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground">מוביל</th>
                      <th className="text-right p-3 text-muted-foreground">תעריף בסיס</th>
                      <th className="text-right p-3 text-muted-foreground">תוספת דלק</th>
                      <th className="text-right p-3 text-muted-foreground">טיפול</th>
                      <th className="text-right p-3 text-muted-foreground font-bold">עלות כוללת</th>
                      <th className="text-center p-3 text-muted-foreground">בחר</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisons.map(c => {
                      const cost = parseFloat(c.calculated_cost);
                      const isCheapest = cheapest !== null && cost === cheapest;
                      return (
                        <tr key={c.id} className={`border-b border-border/30 hover:bg-card/30 ${c.is_selected ? "bg-green-500/10" : ""}`}>
                          <td className="p-3 text-foreground">
                            <div className="flex items-center gap-2">
                              {isCheapest && <Badge className="bg-green-500/20 text-green-300 text-xs">זול ביותר</Badge>}
                              {c.carrier_name}
                            </div>
                          </td>
                          <td className="p-3">${parseFloat(c.base_rate).toFixed(4)}/ק״ג</td>
                          <td className="p-3">${parseFloat(c.fuel_surcharge).toFixed(2)}</td>
                          <td className="p-3">${parseFloat(c.handling_fee).toFixed(2)}</td>
                          <td className="p-3 font-bold text-foreground">${cost.toFixed(2)}</td>
                          <td className="p-3 text-center">
                            {c.is_selected ? (
                              <CheckCircle2 className="w-5 h-5 text-green-400 mx-auto" />
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => handleSelect(c.id)}>בחר</Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "scorecards" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scorecards.length === 0 ? (
              <Card className="col-span-3 bg-card/50 border-border/50">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Star className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>אין נתוני ביצועים עדיין</p>
                </CardContent>
              </Card>
            ) : scorecards.map(sc => {
              const score = parseFloat(sc.avg_overall_score) || 0;
              return (
                <Card key={sc.carrier_id} className="bg-card/50 border-border/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm text-foreground">{sc.carrier_name || "לא ידוע"}</CardTitle>
                      <Badge className="bg-blue-500/20 text-blue-300 text-xs">{CARRIER_TYPE_LABELS[sc.carrier_type] || sc.carrier_type}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">ציון כולל</span>
                      <span className={`text-xl font-bold ${score >= 90 ? "text-green-400" : score >= 75 ? "text-yellow-400" : "text-red-400"}`}>
                        {score.toFixed(1)}
                      </span>
                    </div>
                    <ScoreBar value={score} color={scoreColor(score)} />

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">אחוז בזמן</span>
                        <span className="text-green-400">{Number(sc.avg_on_time_pct).toFixed(1)}%</span>
                      </div>
                      <ScoreBar value={Number(sc.avg_on_time_pct)} color="bg-green-500" />

                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">שיעור נזק</span>
                        <span className={Number(sc.avg_damage_rate) < 1 ? "text-green-400" : "text-red-400"}>{Number(sc.avg_damage_rate).toFixed(2)}%</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">עלות ממוצעת/ק״ג</span>
                        <span className="text-cyan-400">${Number(sc.avg_cost_per_kg).toFixed(4)}</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">סה״כ משלוחים</span>
                        <span className="text-foreground">{sc.total_shipments || "—"}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "carriers" && (
        <div className="space-y-4">
          {showAddCarrier && (
            <Card className="bg-card/50 border-border/50 border-blue-500/30">
              <CardHeader className="pb-3"><CardTitle className="text-base text-foreground">מוביל חדש</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">קוד מוביל *</label>
                    <Input value={newCarrier.carrierCode} onChange={e => setNewCarrier(f => ({ ...f, carrierCode: e.target.value }))} placeholder="ZIM" className="bg-background/50" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">שם מוביל *</label>
                    <Input value={newCarrier.carrierName} onChange={e => setNewCarrier(f => ({ ...f, carrierName: e.target.value }))} placeholder="ZIM Shipping" className="bg-background/50" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">סוג</label>
                    <select value={newCarrier.carrierType} onChange={e => setNewCarrier(f => ({ ...f, carrierType: e.target.value }))} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                      <option value="sea">ים</option>
                      <option value="air">אוויר</option>
                      <option value="express">אקספרס</option>
                      <option value="road">יבשה</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">מדינה</label>
                    <Input value={newCarrier.country} onChange={e => setNewCarrier(f => ({ ...f, country: e.target.value }))} placeholder="Israel" className="bg-background/50" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">איש קשר</label>
                    <Input value={newCarrier.contactName} onChange={e => setNewCarrier(f => ({ ...f, contactName: e.target.value }))} className="bg-background/50" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">אימייל</label>
                    <Input type="email" value={newCarrier.contactEmail} onChange={e => setNewCarrier(f => ({ ...f, contactEmail: e.target.value }))} className="bg-background/50" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">טלפון</label>
                    <Input value={newCarrier.contactPhone} onChange={e => setNewCarrier(f => ({ ...f, contactPhone: e.target.value }))} className="bg-background/50" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setShowAddCarrier(false)}>ביטול</Button>
                  <Button className="bg-primary" onClick={handleAddCarrier} disabled={savingCarrier}>שמור</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-right p-3 text-muted-foreground">שם מוביל</th>
                    <th className="text-right p-3 text-muted-foreground">קוד</th>
                    <th className="text-right p-3 text-muted-foreground">סוג</th>
                    <th className="text-right p-3 text-muted-foreground">מדינה</th>
                    <th className="text-right p-3 text-muted-foreground">איש קשר</th>
                    <th className="text-right p-3 text-muted-foreground">סטטוס</th>
                    <th className="text-center p-3 text-muted-foreground">מחיקה</th>
                  </tr>
                </thead>
                <tbody>
                  {carriers.length === 0 ? (
                    <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">אין מובילים</td></tr>
                  ) : carriers.map(c => (
                    <tr key={c.id} className="border-b border-border/30 hover:bg-card/30">
                      <td className="p-3 text-foreground font-medium">{c.carrier_name}</td>
                      <td className="p-3 font-mono text-muted-foreground">{c.carrier_code}</td>
                      <td className="p-3"><Badge className="bg-blue-500/20 text-blue-300 text-xs">{CARRIER_TYPE_LABELS[c.carrier_type] || c.carrier_type}</Badge></td>
                      <td className="p-3 text-muted-foreground">{c.country || "—"}</td>
                      <td className="p-3 text-muted-foreground text-xs">{c.contact_name || "—"}</td>
                      <td className="p-3">
                        <Badge className={c.is_active ? "bg-green-500/20 text-green-300" : "bg-gray-500/20 text-gray-300"}>
                          {c.is_active ? "פעיל" : "לא פעיל"}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        <Button size="sm" variant="ghost" className="text-red-400" onClick={() => handleDeleteCarrier(c.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
