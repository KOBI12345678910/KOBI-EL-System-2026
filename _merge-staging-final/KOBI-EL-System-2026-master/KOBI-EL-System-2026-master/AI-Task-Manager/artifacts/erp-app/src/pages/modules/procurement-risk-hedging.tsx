import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Shield, Plus, Trash2, AlertTriangle, TrendingDown, Activity, Calculator, Copy } from "lucide-react";
import { duplicateRecord } from "@/lib/duplicate-record";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";

const API = "/api";
function fmt(n: number) { return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n); }

interface BaCurrencyExposure {
  id: number;
  currencyPair: string;
  exposureAmount: string | null;
  expiryDate?: string | null;
  hedgingType: string | null;
  hedgingCostPercent: string | null;
  notes?: string | null;
}

interface CommodityRisk {
  id: number;
  materialName: string;
  quantity: string | null;
  unit: string | null;
  currentPrice: string | null;
  floorPrice?: string | null;
  ceilingPrice?: string | null;
  hedgingRecommendation?: string | null;
  notes?: string | null;
}

interface RiskBreakdown {
  currency: number;
  supplier: number;
  market: number;
  operational: number;
}

interface RiskSummary {
  overallScore: number;
  breakdown: RiskBreakdown;
  exposureSummary: { totalExposure: number; unhedgedExposure: number; hedgingCoverage: number; exposureCount: number };
  commoditySummary: { count: number; totalValue: number };
}

interface HedgingScenario {
  type: string;
  hedgingCost: number;
  unprotectedLoss5: number;
  unprotectedLoss10: number;
  recommendation: string;
}

type ExposureFormState = {
  currencyPair: string;
  exposureAmount: string;
  expiryDate: string;
  hedgingType: string;
  hedgingCostPercent: string;
  notes: string;
};

type CommodityFormState = {
  materialName: string;
  quantity: string;
  unit: string;
  currentPrice: string;
  floorPrice: string;
  ceilingPrice: string;
  hedgingRecommendation: string;
  notes: string;
};

const HEDGING_LABELS: Record<string, string> = {
  none: "ללא גידור",
  forward: "Forward",
  option: "Option",
};

const RISK_MATRIX_CONFIG: { key: keyof RiskBreakdown; label: string; x: number; color: string }[] = [
  { key: "currency", label: "מטבע", x: 3, color: "#3b82f6" },
  { key: "supplier", label: "ספק", x: 2, color: "#f59e0b" },
  { key: "market", label: "שוק", x: 4, color: "#8b5cf6" },
  { key: "operational", label: "תפעולי", x: 3, color: "#10b981" },
];

function calcHedgingScenarios(amount: number): HedgingScenario[] {
  const loss5 = amount * 0.05;
  const loss10 = amount * 0.1;
  return [
    {
      type: "Forward",
      hedgingCost: amount * 0.015,
      unprotectedLoss5: loss5,
      unprotectedLoss10: loss10,
      recommendation: loss5 > amount * 0.015 ? "מומלץ" : "לשקול",
    },
    {
      type: "Option",
      hedgingCost: amount * 0.025,
      unprotectedLoss5: loss5,
      unprotectedLoss10: loss10,
      recommendation: loss10 > amount * 0.025 ? "מומלץ לחשיפה גדולה" : "יקר מדי",
    },
    {
      type: "ללא גידור",
      hedgingCost: 0,
      unprotectedLoss5: loss5,
      unprotectedLoss10: loss10,
      recommendation: loss5 < 5000 ? "סביר לחשיפות קטנות" : "לא מומלץ",
    },
  ];
}

export default function ProcurementRiskHedgingPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [detailTab, setDetailTab] = useState("details");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const [exposureDialog, setExposureDialog] = useState(false);
  const [commodityDialog, setCommodityDialog] = useState(false);
  const [hedgingCalcOpen, setHedgingCalcOpen] = useState(false);
  const [hedgingExposureId, setHedgingExposureId] = useState<number | null>(null);
  const [exposureForm, setExposureForm] = useState<ExposureFormState>({
    currencyPair: "USD/ILS", exposureAmount: "", expiryDate: "", hedgingType: "none", hedgingCostPercent: "", notes: "",
  });
  const [commodityForm, setCommodityForm] = useState<CommodityFormState>({
    materialName: "", quantity: "", unit: "kg", currentPrice: "", floorPrice: "", ceilingPrice: "", hedgingRecommendation: "", notes: "",
  });

  const { data: exposures = [] } = useQuery<BaCurrencyExposure[]>({
    queryKey: ["ba-currency-exposures"],
    queryFn: async () => {
      const r = await authFetch(`${API}/currency-exposures`);
      return r.json() as Promise<BaCurrencyExposure[]>;
    },
  });

  const { data: commodities = [] } = useQuery<CommodityRisk[]>({
    queryKey: ["commodity-risks"],
    queryFn: async () => {
      const r = await authFetch(`${API}/commodity-risks`);
      return r.json() as Promise<CommodityRisk[]>;
    },
  });

  const { data: riskSummary } = useQuery<RiskSummary>({
    queryKey: ["risk-summary"],
    queryFn: async () => {
      const r = await authFetch(`${API}/risk-summary`);
      return r.json() as Promise<RiskSummary>;
    },
  });

  const createExposureMutation = useMutation({
    mutationFn: async (body: ExposureFormState) => {
      const r = await authFetch(`${API}/currency-exposures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("שגיאה");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ba-currency-exposures"] });
      qc.invalidateQueries({ queryKey: ["risk-summary"] });
      setExposureDialog(false);
      setExposureForm({ currencyPair: "USD/ILS", exposureAmount: "", expiryDate: "", hedgingType: "none", hedgingCostPercent: "", notes: "" });
      toast({ title: "חשיפה נוספה" });
    },
    onError: (err: Error) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const deleteExposureMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/currency-exposures/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ba-currency-exposures"] });
      qc.invalidateQueries({ queryKey: ["risk-summary"] });
    },
  });

  const createCommodityMutation = useMutation({
    mutationFn: async (body: CommodityFormState) => {
      const r = await authFetch(`${API}/commodity-risks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("שגיאה");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commodity-risks"] });
      qc.invalidateQueries({ queryKey: ["risk-summary"] });
      setCommodityDialog(false);
      setCommodityForm({ materialName: "", quantity: "", unit: "kg", currentPrice: "", floorPrice: "", ceilingPrice: "", hedgingRecommendation: "", notes: "" });
      toast({ title: "סיכון סחורה נוסף" });
    },
    onError: (err: Error) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const deleteCommodityMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/commodity-risks/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commodity-risks"] });
      qc.invalidateQueries({ queryKey: ["risk-summary"] });
    },
  });

  const selectedExposure = exposures.find(e => e.id === hedgingExposureId);
  const hedgingScenarios: HedgingScenario[] = selectedExposure
    ? calcHedgingScenarios(parseFloat(selectedExposure.exposureAmount ?? "0"))
    : [];

  const overallScore = riskSummary?.overallScore ?? 5;
  const breakdown: RiskBreakdown = riskSummary?.breakdown ?? { currency: 5, supplier: 5, market: 5, operational: 5 };

  const riskMatrixData = RISK_MATRIX_CONFIG.map(cfg => ({
    name: cfg.label,
    x: cfg.x,
    y: breakdown[cfg.key],
    z: 100,
    color: cfg.color,
  }));

  const scoreColor = overallScore <= 3 ? "text-green-400" : overallScore <= 6 ? "text-amber-400" : "text-red-400";

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-amber-400" /> ניתוח סיכון וגידור
          </h1>
          <p className="text-muted-foreground mt-1">חשיפות מטבע, סיכוני סחורות ומטריצת סיכון</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">ציון סיכון כולל</p>
            <p className={`text-xl sm:text-3xl font-bold ${scoreColor}`}>{overallScore}/10</p>
            <div className="w-full h-1.5 bg-slate-700 rounded-full mt-2">
              <div className={`h-1.5 rounded-full ${overallScore <= 3 ? "bg-green-500" : overallScore <= 6 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${overallScore * 10}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Activity className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">חשיפות מטבע</p>
              <p className="text-lg font-bold text-blue-400">{riskSummary?.exposureSummary?.exposureCount ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">כיסוי גידור</p>
              <p className="text-lg font-bold text-amber-400">{riskSummary?.exposureSummary?.hedgingCoverage ?? 0}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">חשיפה לא מגודרת</p>
              <p className="text-lg font-bold text-red-400">{fmt(riskSummary?.exposureSummary?.unhedgedExposure ?? 0)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {RISK_MATRIX_CONFIG.map(cfg => {
          const val = breakdown[cfg.key];
          const bgColor = val <= 3 ? "bg-green-500/10 border-green-500/30" : val <= 6 ? "bg-amber-500/10 border-amber-500/30" : "bg-red-500/10 border-red-500/30";
          const textColor = val <= 3 ? "text-green-400" : val <= 6 ? "text-amber-400" : "text-red-400";
          return (
            <Card key={cfg.key} className={`border ${bgColor}`}>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">{cfg.label}</p>
                <p className={`text-lg sm:text-2xl font-bold mt-1 ${textColor}`}>{val.toFixed(1)}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="currency">
        <TabsList className="bg-slate-800 border-slate-700">
          <TabsTrigger value="currency">חשיפות מטבע</TabsTrigger>
          <TabsTrigger value="commodities">סיכוני סחורות</TabsTrigger>
          <TabsTrigger value="matrix">מטריצת סיכון</TabsTrigger>
        </TabsList>

        <TabsContent value="currency" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setExposureDialog(true)} className="bg-amber-600 hover:bg-amber-700">
              <Plus className="w-4 h-4 ml-2" />הוסף חשיפה
            </Button>
          </div>
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50 text-muted-foreground text-xs">
                    <th className="text-right py-3 px-4">זוג מטבע</th>
                    <th className="text-left py-3 px-4">סכום חשיפה (₪)</th>
                    <th className="text-right py-3 px-4">פקיעה</th>
                    <th className="text-center py-3 px-4">סוג גידור</th>
                    <th className="text-left py-3 px-4">עלות גידור %</th>
                    <th className="text-left py-3 px-4">הפסד אפשרי ±5%</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {exposures.map(e => {
                    const amt = parseFloat(e.exposureAmount ?? "0");
                    const loss5 = amt * 0.05;
                    const hedgingType = e.hedgingType ?? "none";
                    return (
                      <tr key={e.id} className="border-b border-slate-700/30 hover:bg-slate-800/30">
                        <td className="py-3 px-4 text-foreground font-mono">{e.currencyPair}</td>
                        <td className="py-3 px-4 text-left text-blue-400">{fmt(amt)}</td>
                        <td className="py-3 px-4 text-slate-300">{e.expiryDate ?? "—"}</td>
                        <td className="py-3 px-4 text-center">
                          <Badge className={hedgingType === "none" ? "bg-red-500/20 text-red-400" : hedgingType === "forward" ? "bg-blue-500/20 text-blue-400" : "bg-green-500/20 text-green-400"}>
                            {HEDGING_LABELS[hedgingType] ?? hedgingType}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-left text-slate-300">{parseFloat(e.hedgingCostPercent ?? "0").toFixed(2)}%</td>
                        <td className="py-3 px-4 text-left text-amber-400">{fmt(loss5)}</td>
                        <td className="py-3 px-4 flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300 h-7 px-2" onClick={() => { setHedgingExposureId(e.id); setHedgingCalcOpen(true); }}>
                            <Calculator className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" title="שכפול" className="text-muted-foreground hover:text-slate-300 h-7 w-7 p-0" onClick={async () => { const res = await duplicateRecord(`${API}/currency-exposures`, e.id); if (!res.ok) alert("שגיאה בשכפול: " + res.error); else { qc.invalidateQueries({ queryKey: ["currency-exposures"] }); qc.invalidateQueries({ queryKey: ["commodity-risks"] }); } }}>
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          {isSuperAdmin && <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 h-7 w-7 p-0" onClick={async () => { const ok = await globalConfirm("למחוק חשיפה זו?", { itemName: e.commodity || String(e.id), entityType: "חשיפת סחורה" }); if (ok) deleteExposureMutation.mutate(e.id); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>}
                        </td>
                      </tr>
                    );
                  })}
                  {exposures.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">אין חשיפות מטבע</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commodities" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setCommodityDialog(true)} className="bg-amber-600 hover:bg-amber-700">
              <Plus className="w-4 h-4 ml-2" />הוסף סיכון סחורה
            </Button>
          </div>
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50 text-muted-foreground text-xs">
                    <th className="text-right py-3 px-4">חומר גלם</th>
                    <th className="text-left py-3 px-4">כמות</th>
                    <th className="text-left py-3 px-4">מחיר נוכחי</th>
                    <th className="text-left py-3 px-4">רצפה</th>
                    <th className="text-left py-3 px-4">תקרה</th>
                    <th className="text-right py-3 px-4">המלצת גידור</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {commodities.map(c => (
                    <tr key={c.id} className="border-b border-slate-700/30 hover:bg-slate-800/30">
                      <td className="py-3 px-4 text-foreground">{c.materialName}</td>
                      <td className="py-3 px-4 text-left text-slate-300">{parseFloat(c.quantity ?? "0").toLocaleString()} {c.unit ?? ""}</td>
                      <td className="py-3 px-4 text-left text-blue-400">₪{parseFloat(c.currentPrice ?? "0").toLocaleString()}</td>
                      <td className="py-3 px-4 text-left text-green-400">{c.floorPrice ? `₪${parseFloat(c.floorPrice).toLocaleString()}` : "—"}</td>
                      <td className="py-3 px-4 text-left text-red-400">{c.ceilingPrice ? `₪${parseFloat(c.ceilingPrice).toLocaleString()}` : "—"}</td>
                      <td className="py-3 px-4 text-right text-slate-300 text-xs">{c.hedgingRecommendation ?? "—"}</td>
                      <td className="py-3 px-4">
                        {isSuperAdmin && <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 h-7 w-7 p-0" onClick={async () => { const ok = await globalConfirm("למחוק סחורה זו?", { itemName: c.name || String(c.id), entityType: "סחורה" }); if (ok) deleteCommodityMutation.mutate(c.id); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>}
                      </td>
                    </tr>
                  ))}
                  {commodities.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">אין סיכוני סחורות</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="matrix" className="mt-4">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-sm text-slate-300">מטריצת סיכון — הסתברות vs. השפעה</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis type="number" dataKey="x" name="הסתברות" domain={[0, 5]} tick={{ fill: "#94a3b8", fontSize: 11 }} label={{ value: "הסתברות →", position: "insideBottom", offset: -5, fill: "#64748b", fontSize: 11 }} />
                  <YAxis type="number" dataKey="y" name="השפעה" domain={[0, 10]} tick={{ fill: "#94a3b8", fontSize: 11 }} label={{ value: "השפעה", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 11 }} />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }}
                    formatter={(value, _name, props) => [value, props?.payload?.name ?? _name]}
                  />
                  <Scatter name="סיכונים" data={riskMatrixData}>
                    {riskMatrixData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                {riskMatrixData.map(r => (
                  <div key={r.name} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color }} />
                    <span className="text-muted-foreground">{r.name}: {r.y.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={exposureDialog} onOpenChange={setExposureDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>הוסף חשיפת מטבע</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>זוג מטבע</Label>
              <Select value={exposureForm.currencyPair} onValueChange={v => setExposureForm(f => ({ ...f, currencyPair: v }))}>
                <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {["USD/ILS", "EUR/ILS", "CNY/ILS", "GBP/ILS", "CHF/ILS"].map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>סכום חשיפה (₪)</Label>
                <Input type="number" value={exposureForm.exposureAmount} onChange={e => setExposureForm(f => ({ ...f, exposureAmount: e.target.value }))} className="bg-slate-800 border-slate-700" />
              </div>
              <div>
                <Label>תאריך פקיעה</Label>
                <Input type="date" value={exposureForm.expiryDate} onChange={e => setExposureForm(f => ({ ...f, expiryDate: e.target.value }))} className="bg-slate-800 border-slate-700" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>סוג גידור</Label>
                <Select value={exposureForm.hedgingType} onValueChange={v => setExposureForm(f => ({ ...f, hedgingType: v }))}>
                  <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="none">ללא גידור</SelectItem>
                    <SelectItem value="forward">Forward</SelectItem>
                    <SelectItem value="option">Option</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>עלות גידור %</Label>
                <Input type="number" step="0.01" value={exposureForm.hedgingCostPercent} onChange={e => setExposureForm(f => ({ ...f, hedgingCostPercent: e.target.value }))} className="bg-slate-800 border-slate-700" placeholder="0.00" />
              </div>
            </div>
            <Button onClick={() => createExposureMutation.mutate(exposureForm)} disabled={!exposureForm.exposureAmount || createExposureMutation.isPending} className="bg-amber-600 hover:bg-amber-700">
              {createExposureMutation.isPending ? "שומר..." : "הוסף חשיפה"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={commodityDialog} onOpenChange={setCommodityDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>הוסף סיכון סחורה</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>שם חומר גלם</Label>
                <Input value={commodityForm.materialName} onChange={e => setCommodityForm(f => ({ ...f, materialName: e.target.value }))} className="bg-slate-800 border-slate-700" />
              </div>
              <div>
                <Label>יחידה</Label>
                <Input value={commodityForm.unit} onChange={e => setCommodityForm(f => ({ ...f, unit: e.target.value }))} className="bg-slate-800 border-slate-700" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>כמות</Label>
                <Input type="number" value={commodityForm.quantity} onChange={e => setCommodityForm(f => ({ ...f, quantity: e.target.value }))} className="bg-slate-800 border-slate-700" />
              </div>
              <div>
                <Label>מחיר נוכחי</Label>
                <Input type="number" value={commodityForm.currentPrice} onChange={e => setCommodityForm(f => ({ ...f, currentPrice: e.target.value }))} className="bg-slate-800 border-slate-700" />
              </div>
              <div>
                <Label>רצפה</Label>
                <Input type="number" value={commodityForm.floorPrice} onChange={e => setCommodityForm(f => ({ ...f, floorPrice: e.target.value }))} className="bg-slate-800 border-slate-700" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>תקרה</Label>
                <Input type="number" value={commodityForm.ceilingPrice} onChange={e => setCommodityForm(f => ({ ...f, ceilingPrice: e.target.value }))} className="bg-slate-800 border-slate-700" />
              </div>
              <div>
                <Label>המלצת גידור</Label>
                <Input value={commodityForm.hedgingRecommendation} onChange={e => setCommodityForm(f => ({ ...f, hedgingRecommendation: e.target.value }))} className="bg-slate-800 border-slate-700" />
              </div>
            </div>
            <Button onClick={() => createCommodityMutation.mutate(commodityForm)} disabled={!commodityForm.materialName || createCommodityMutation.isPending} className="bg-amber-600 hover:bg-amber-700">
              {createCommodityMutation.isPending ? "שומר..." : "הוסף סיכון"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={hedgingCalcOpen} onOpenChange={setHedgingCalcOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-blue-400" />
              בדיקת גידור — {selectedExposure?.currencyPair}
            </DialogTitle>
          </DialogHeader>
          {selectedExposure && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">חשיפה: <span className="text-foreground font-medium">{fmt(parseFloat(selectedExposure.exposureAmount ?? "0"))}</span></p>
              {hedgingScenarios.map(s => (
                <div key={s.type} className="p-3 rounded-lg border border-slate-700 bg-slate-800/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-foreground font-medium">{s.type}</span>
                    <Badge className={s.recommendation.includes("מומלץ") ? "bg-green-500/20 text-green-400" : s.recommendation.includes("לא") ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"}>
                      {s.recommendation}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">עלות גידור</p>
                      <p className="text-blue-400">{fmt(s.hedgingCost)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">הפסד אפשרי ±5%</p>
                      <p className="text-amber-400">{fmt(s.unprotectedLoss5)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">הפסד אפשרי ±10%</p>
                      <p className="text-red-400">{fmt(s.unprotectedLoss10)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="חשיפות" actions={defaultBulkActions(selectedIds, clear, () => qc.invalidateQueries({ queryKey: ["currency-exposures"] }), `${API}/currency-exposures`)} />

      <ActivityLog entityType="risk-hedging" />
    </div>
  );
}
