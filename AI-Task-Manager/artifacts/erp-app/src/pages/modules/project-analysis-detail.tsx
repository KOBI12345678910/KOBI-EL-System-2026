import { usePermissions } from "@/hooks/use-permissions";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { authFetch } from "@/lib/utils";
import {
  FolderKanban, Save, ArrowRight, Plus, Trash2, RefreshCw,
  DollarSign, TrendingUp, AlertTriangle, CheckCircle, XCircle,
  BarChart3, Shield, Activity, History, Calculator, Package
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";
import { VAT_RATE } from "@/utils/money";

const API = "/api";
function fmt(n: number) { return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n); }
function pct(n: number) { return `${n.toFixed(1)}%`; }

interface ProjectAnalysis {
  id: number;
  projectCode: string;
  projectName: string;
  customerName?: string;
  managerName?: string;
  status: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  laborCost?: string;
  installationCost?: string;
  transportCost?: string;
  insuranceCost?: string;
  storageCost?: string;
  customsCost?: string;
  packagingCost?: string;
  overheadCost?: string;
  paymentTerms?: string;
  numberOfPayments?: number;
  creditFeePercent?: string;
  contingencyPercent?: string;
  operationalOverheadPercent?: string;
  targetMarginPercent?: string;
  proposedSalePrice?: string;
  actualSalePrice?: string;
  riskScore?: string;
  supplierRisk?: string;
  currencyRisk?: string;
  marketRisk?: string;
  operationalRisk?: string;
  notes?: string;
  auditTrail?: AuditEntry[];
  materials: AnalysisMaterial[];
  costs: AnalysisCost[];
  simulations: AnalysisSimulation[];
  [key: string]: unknown;
}

interface AnalysisMaterial {
  id: number;
  projectAnalysisId: number;
  materialName: string;
  materialNumber?: string;
  quantity?: string;
  unit?: string;
  unitPrice?: string;
  totalPrice?: string;
  vatAmount?: string;
  supplierDiscount?: string;
  pricePerMeter?: string;
  supplierName?: string;
}

interface AnalysisCost {
  id: number;
  projectAnalysisId: number;
  costType: string;
  description?: string;
  amount?: string;
  currency?: string;
}

interface AnalysisSimulation {
  id: number;
  scenarioName: string;
  simulationType: string;
  parameters?: Record<string, unknown>;
  results?: { adjustedTotal?: number; adjustedProfit?: number; adjustedMargin?: number };
  createdAt: string;
}

interface AuditEntry {
  timestamp: string;
  action?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  materialName?: string;
  materialId?: number;
  costType?: string;
  costId?: number;
  amount?: string;
  [key: string]: unknown;
}

interface RawMaterialLookup {
  id: number;
  materialName: string;
  materialNumber: string;
  unit?: string;
  standardPrice?: string;
  supplierPrices?: { supplierId: number; supplierPrice: string }[];
}

interface ServerCalcResult {
  totalMaterials: number;
  totalAdditionalCosts: number;
  productionCosts: number;
  transportAndInstall: number;
  subtotal: number;
  contingency: number;
  operationalOverhead: number;
  creditFee: number;
  totalBeforeVat: number;
  vat: number;
  totalWithVat: number;
  salePrice: number;
  grossProfit: number;
  grossMargin: number;
  netProfit: number;
  netMargin: number;
  roi: number;
  breakEven: number;
  riskScore: number;
  npv: number;
  irr: number;
  npvYears: { year: number; cashFlow: number; presentValue: number }[];
  sensitivity: { materialChange: number; totalCost: number; profit: number; margin: number }[];
}

export default function ProjectAnalysisDetailPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [activeTab, setActiveTab] = useState("details");
  const [simScenario, setSimScenario] = useState("realistic");
  const [simMaterialChange, setSimMaterialChange] = useState(0);
  const [simCurrencyChange, setSimCurrencyChange] = useState(0);

  const { data: analysis, isLoading } = useQuery<ProjectAnalysis>({
    queryKey: ["project-analysis", id],
    queryFn: async () => {
      const r = await authFetch(`${API}/project-analyses/${id}`);
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
    enabled: !!id,
  });

  const { data: rawMaterials = [] } = useQuery<RawMaterialLookup[]>({
    queryKey: ["raw-materials-lookup"],
    queryFn: async () => {
      const r = await authFetch(`${API}/project-analyses/raw-materials/lookup`);
      return r.json();
    },
  });

  const [form, setForm] = useState<Partial<ProjectAnalysis> | null>(null);

  const currentForm = form || analysis || {} as Partial<ProjectAnalysis>;
  const materials: AnalysisMaterial[] = analysis?.materials || [];
  const costs: AnalysisCost[] = analysis?.costs || [];
  const simulations: AnalysisSimulation[] = analysis?.simulations || [];

  const setField = useCallback((key: string, value: string | number) => {
    setForm((prev) => ({ ...(prev || analysis || {}), [key]: value }));
  }, [analysis]);

  const updateMutation = useMutation({
    mutationFn: async (body: Partial<ProjectAnalysis>) => {
      const r = await authFetch(`${API}/project-analyses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Failed to update");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-analysis", id] });
      qc.invalidateQueries({ queryKey: ["project-analyses"] });
      setForm(null);
      toast({ title: "נשמר בהצלחה" });
    },
    onError: () => toast({ title: "שגיאה בשמירה", variant: "destructive" }),
  });

  const addMaterialMutation = useMutation({
    mutationFn: async (body: Partial<AnalysisMaterial>) => {
      const r = await authFetch(`${API}/project-analyses/${id}/materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-analysis", id] });
      qc.invalidateQueries({ queryKey: ["project-analysis-calc", id] });
      toast({ title: "חומר נוסף" });
    },
  });

  const removeMaterialMutation = useMutation({
    mutationFn: async (materialId: number) => {
      await authFetch(`${API}/project-analyses/${id}/materials/${materialId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-analysis", id] });
      qc.invalidateQueries({ queryKey: ["project-analysis-calc", id] });
    },
  });

  const updateMaterialMutation = useMutation({
    mutationFn: async ({ materialId, data }: { materialId: number; data: Record<string, string> }) => {
      const r = await authFetch(`${API}/project-analyses/${id}/materials/${materialId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-analysis", id] });
      qc.invalidateQueries({ queryKey: ["project-analysis-calc", id] });
    },
  });

  const addCostMutation = useMutation({
    mutationFn: async (body: { costType: string; amount?: string; currency?: string; description?: string }) => {
      const r = await authFetch(`${API}/project-analyses/${id}/costs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-analysis", id] });
      qc.invalidateQueries({ queryKey: ["project-analysis-calc", id] });
      toast({ title: "עלות נוספה" });
    },
  });

  const removeCostMutation = useMutation({
    mutationFn: async (costId: number) => {
      await authFetch(`${API}/project-analyses/${id}/costs/${costId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-analysis", id] });
      qc.invalidateQueries({ queryKey: ["project-analysis-calc", id] });
    },
  });

  const { data: serverCalc } = useQuery<ServerCalcResult>({
    queryKey: ["project-analysis-calc", id],
    queryFn: async () => {
      const r = await authFetch(`${API}/project-analyses/${id}/calculate`);
      return r.json();
    },
    enabled: !!id && !!analysis,
  });

  const addSimulationMutation = useMutation({
    mutationFn: async (body: { simulationType: string; scenarioName: string; parameters: Record<string, unknown>; results: Record<string, unknown> }) => {
      const r = await authFetch(`${API}/project-analyses/${id}/simulations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-analysis", id] });
      toast({ title: "סימולציה נשמרה" });
    },
  });

  const calc = useMemo(() => {
    const d = currentForm;
    const totalMaterials = materials.reduce((s, m) => s + parseFloat(m.totalPrice || "0"), 0);
    const labor = parseFloat(d.laborCost || "0");
    const installation = parseFloat(d.installationCost || "0");
    const transport = parseFloat(d.transportCost || "0");
    const insurance = parseFloat(d.insuranceCost || "0");
    const storage = parseFloat(d.storageCost || "0");
    const customs = parseFloat(d.customsCost || "0");
    const packaging = parseFloat(d.packagingCost || "0");
    const overhead = parseFloat(d.overheadCost || "0");

    const productionCosts = labor + installation + transport + insurance + storage + customs + packaging + overhead;
    const transportAndInstall = transport + installation;
    const totalAdditionalCosts = costs.reduce((s: number, c: AnalysisCost) => s + parseFloat(c.amount || "0"), 0);
    const subtotal = totalMaterials + productionCosts + totalAdditionalCosts;

    const contingencyPct = parseFloat(d.contingencyPercent || "0");
    const operationalPct = parseFloat(d.operationalOverheadPercent || "0");
    const creditPct = parseFloat(d.creditFeePercent || "0");
    const contingency = subtotal * (contingencyPct / 100);
    const operationalOverhead = subtotal * (operationalPct / 100);
    const creditFee = subtotal * (creditPct / 100);

    const totalBeforeVat = subtotal + contingency + operationalOverhead + creditFee;
    const vat = totalBeforeVat * VAT_RATE;
    const totalWithVat = totalBeforeVat + vat;

    const proposedSale = parseFloat(d.proposedSalePrice || "0");
    const actualSale = parseFloat(d.actualSalePrice || "0");
    const salePrice = actualSale || proposedSale;
    const grossProfit = salePrice - totalBeforeVat;
    const grossMargin = salePrice > 0 ? (grossProfit / salePrice) * 100 : 0;
    const netProfit = grossProfit - creditFee - contingency;
    const netMargin = salePrice > 0 ? (netProfit / salePrice) * 100 : 0;
    const roi = totalBeforeVat > 0 ? (grossProfit / totalBeforeVat) * 100 : 0;
    const breakEven = grossMargin > 0 ? totalBeforeVat / (grossMargin / 100) : 0;

    const supplierRisk = parseFloat(d.supplierRisk || "5");
    const currencyRisk = parseFloat(d.currencyRisk || "5");
    const marketRisk = parseFloat(d.marketRisk || "5");
    const operationalRisk = parseFloat(d.operationalRisk || "5");
    const riskScore = (supplierRisk + currencyRisk + marketRisk + operationalRisk) / 4;

    return {
      totalMaterials, productionCosts, transportAndInstall, subtotal,
      contingency, operationalOverhead, creditFee,
      totalBeforeVat, vat, totalWithVat,
      salePrice, grossProfit, grossMargin, netProfit, netMargin, roi, breakEven,
      riskScore, supplierRisk, currencyRisk, marketRisk, operationalRisk,
    };
  }, [currentForm, materials, costs]);

  const runSimulation = useCallback(() => {
    const materialDelta = simMaterialChange / 100;
    const currencyDelta = simCurrencyChange / 100;

    const d = currentForm;
    const contingencyPct = parseFloat(d.contingencyPercent || "0");
    const operationalPct = parseFloat(d.operationalOverheadPercent || "0");
    const creditPct = parseFloat(d.creditFeePercent || "0");

    const totalAdditionalCosts = costs.reduce((s: number, c: Record<string, string>) => s + parseFloat(c.amount || "0"), 0);

    const computeScenario = (matDelta: number, curDelta: number) => {
      const adjMat = calc.totalMaterials * (1 + matDelta);
      const adjSubtotal = adjMat + calc.productionCosts + totalAdditionalCosts;
      const adjContingency = adjSubtotal * (contingencyPct / 100);
      const adjOperational = adjSubtotal * (operationalPct / 100);
      const adjCredit = adjSubtotal * (creditPct / 100) * (1 + curDelta);
      const adjTotal = adjSubtotal + adjContingency + adjOperational + adjCredit;
      const adjProfit = calc.salePrice - adjTotal;
      const adjMargin = calc.salePrice > 0 ? (adjProfit / calc.salePrice) * 100 : 0;
      return { totalCost: adjTotal, profit: adjProfit, margin: adjMargin };
    };

    const mainResult = computeScenario(materialDelta, currencyDelta);

    const scenarios: Record<string, { materialDelta: number; result: { totalCost: number; profit: number; margin: number } | null }> = {
      optimistic: { materialDelta: -0.1, result: null },
      realistic: { materialDelta: 0, result: null },
      pessimistic: { materialDelta: 0.2, result: null },
    };

    for (const [key, sc] of Object.entries(scenarios)) {
      const r = computeScenario(sc.materialDelta, 0);
      scenarios[key].result = r;
    }

    addSimulationMutation.mutate({
      simulationType: "what-if",
      scenarioName: `${simScenario} — חומרים ${simMaterialChange >= 0 ? "+" : ""}${simMaterialChange}%, מטבע ${simCurrencyChange >= 0 ? "+" : ""}${simCurrencyChange}%`,
      parameters: { materialChange: simMaterialChange, currencyChange: simCurrencyChange, scenario: simScenario },
      results: { adjustedTotal: mainResult.totalCost, adjustedProfit: mainResult.profit, adjustedMargin: mainResult.margin, scenarios },
    });
  }, [calc, simMaterialChange, simCurrencyChange, simScenario, addSimulationMutation]);

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">טוען...</div>;
  if (!analysis) return <div className="flex items-center justify-center h-64 text-muted-foreground">ניתוח לא נמצא</div>;

  const isGo = calc.grossMargin > 15 && calc.riskScore < 7;

  const handleSave = () => {
    if (!form) return;
    const { materials: _m, simulations: _s, ...rest } = form;
    updateMutation.mutate(rest);
  };

  const handleAddMaterial = (rawMat: RawMaterialLookup) => {
    const price = rawMat.supplierPrices?.[0]?.supplierPrice || rawMat.standardPrice || "0";
    addMaterialMutation.mutate({
      rawMaterialId: rawMat.id,
      materialName: rawMat.materialName,
      materialNumber: rawMat.materialNumber,
      quantity: "1",
      unit: rawMat.unit || "יחידה",
      unitPrice: price,
      totalPrice: price,
      supplierName: rawMat.supplierPrices?.[0] ? `ספק #${rawMat.supplierPrices[0].supplierId}` : "",
    });
  };

  function RiskBar({ label, value, color }: { label: string; value: number; color: string }) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground w-28 text-right">{label}</span>
        <div className="flex-1 bg-slate-800 rounded-full h-3">
          <div className={`h-3 rounded-full ${color}`} style={{ width: `${(value / 10) * 100}%` }} />
        </div>
        <span className={`text-sm font-bold w-8 ${value <= 3 ? "text-green-400" : value <= 6 ? "text-amber-400" : "text-red-400"}`}>{value}</span>
      </div>
    );
  }

  function RiskMatrix() {
    const risks = [
      { name: "ספקים", score: calc.supplierRisk },
      { name: "מטבע", score: calc.currencyRisk },
      { name: "שוק", score: calc.marketRisk },
      { name: "תפעולי", score: calc.operationalRisk },
    ];
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {risks.map(r => (
          <div
            key={r.name}
            className={`p-4 rounded-lg border text-center ${
              r.score <= 3 ? "bg-green-500/10 border-green-500/30" :
              r.score <= 6 ? "bg-amber-500/10 border-amber-500/30" :
              "bg-red-500/10 border-red-500/30"
            }`}
          >
            <p className="text-sm text-muted-foreground">{r.name}</p>
            <p className={`text-lg sm:text-2xl font-bold ${
              r.score <= 3 ? "text-green-400" : r.score <= 6 ? "text-amber-400" : "text-red-400"
            }`}>{r.score}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/project-analyses")} className="text-muted-foreground">
            <ArrowRight className="w-4 h-4 ml-1" />חזרה
          </Button>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-violet-400" />
            {analysis.projectName}
          </h1>
          <Badge className={`${analysis.status === "active" ? "bg-green-500/20 text-green-400" : analysis.status === "completed" ? "bg-blue-500/20 text-blue-400" : analysis.status === "cancelled" ? "bg-red-500/20 text-red-400" : "bg-muted/20 text-muted-foreground"}`}>
            {analysis.status === "draft" ? "טיוטה" : analysis.status === "active" ? "פעיל" : analysis.status === "completed" ? "הושלם" : analysis.status === "cancelled" ? "בוטל" : analysis.status}
          </Badge>
          {isGo ? (
            <Badge className="bg-emerald-500/20 text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Go</Badge>
          ) : (
            <Badge className="bg-red-500/20 text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" />No-Go</Badge>
          )}
        </div>
        <Button onClick={handleSave} disabled={!form || updateMutation.isPending} className="bg-violet-600 hover:bg-violet-700">
          <Save className="w-4 h-4 ml-2" />{updateMutation.isPending ? "שומר..." : "שמור שינויים"}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">עלות כוללת</p>
            <p className="text-lg font-bold text-blue-400">{fmt(calc.totalBeforeVat)}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">מרג'ין גולמי</p>
            <p className={`text-lg font-bold ${calc.grossMargin >= 20 ? "text-green-400" : calc.grossMargin >= 0 ? "text-amber-400" : "text-red-400"}`}>{pct(calc.grossMargin)}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">ציון סיכון</p>
            <p className={`text-lg font-bold ${calc.riskScore <= 3 ? "text-green-400" : calc.riskScore <= 6 ? "text-amber-400" : "text-red-400"}`}>{calc.riskScore.toFixed(1)}/10</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">כדאיות</p>
            <p className={`text-lg font-bold ${isGo ? "text-emerald-400" : "text-red-400"}`}>{isGo ? "Go" : "No-Go"}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="bg-slate-800 border border-slate-700 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="details" className="text-xs">פרטי ניתוח</TabsTrigger>
          <TabsTrigger value="materials" className="text-xs">חומרים ומוצרים</TabsTrigger>
          <TabsTrigger value="production" className="text-xs">עלויות ייצור</TabsTrigger>
          <TabsTrigger value="credit" className="text-xs">אשראי/תשלום</TabsTrigger>
          <TabsTrigger value="additions" className="text-xs">תוספות פיננסיות</TabsTrigger>
          <TabsTrigger value="summary" className="text-xs">סיכום עלויות</TabsTrigger>
          <TabsTrigger value="profitability" className="text-xs">רווחיות</TabsTrigger>
          <TabsTrigger value="risk" className="text-xs">סיכון</TabsTrigger>
          <TabsTrigger value="simulation" className="text-xs">סימולציות</TabsTrigger>
          <TabsTrigger value="history" className="text-xs">היסטוריה</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-foreground flex items-center gap-2"><FolderKanban className="w-5 h-5 text-violet-400" />פרטי ניתוח</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <Label>קוד פרויקט</Label>
                  <Input value={currentForm.projectCode || ""} onChange={e => setField("projectCode", e.target.value)} className="bg-slate-800 border-slate-700" />
                </div>
                <div>
                  <Label>שם פרויקט</Label>
                  <Input value={currentForm.projectName || ""} onChange={e => setField("projectName", e.target.value)} className="bg-slate-800 border-slate-700" />
                </div>
                <div>
                  <Label>לקוח</Label>
                  <Input value={currentForm.customerName || ""} onChange={e => setField("customerName", e.target.value)} className="bg-slate-800 border-slate-700" />
                </div>
                <div>
                  <Label>מנהל פרויקט</Label>
                  <Input value={currentForm.managerName || ""} onChange={e => setField("managerName", e.target.value)} className="bg-slate-800 border-slate-700" />
                </div>
                <div>
                  <Label>תאריך התחלה</Label>
                  <Input type="date" value={currentForm.startDate || ""} onChange={e => setField("startDate", e.target.value)} className="bg-slate-800 border-slate-700" />
                </div>
                <div>
                  <Label>תאריך סיום</Label>
                  <Input type="date" value={currentForm.endDate || ""} onChange={e => setField("endDate", e.target.value)} className="bg-slate-800 border-slate-700" />
                </div>
                <div>
                  <Label>סטטוס</Label>
                  <Select value={currentForm.status || "draft"} onValueChange={v => setField("status", v)}>
                    <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="draft">טיוטה</SelectItem>
                      <SelectItem value="active">פעיל</SelectItem>
                      <SelectItem value="completed">הושלם</SelectItem>
                      <SelectItem value="cancelled">בוטל</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>תיאור / הערות</Label>
                <Input value={currentForm.description || ""} onChange={e => setField("description", e.target.value)} className="bg-slate-800 border-slate-700" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="materials" className="mt-4">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-foreground flex items-center gap-2"><Package className="w-5 h-5 text-orange-400" />חומרי גלם ומוצרים</CardTitle>
                <Select onValueChange={(val) => {
                  const mat = rawMaterials.find((m) => String(m.id) === val);
                  if (mat) handleAddMaterial(mat);
                }}>
                  <SelectTrigger className="w-60 bg-slate-800 border-slate-700">
                    <SelectValue placeholder="הוסף חומר מהקטלוג..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 max-h-60">
                    {rawMaterials.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.materialName} ({m.materialNumber})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {materials.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">אין חומרים. בחר חומר מהקטלוג להוספה.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 text-muted-foreground">
                        <th className="text-right p-2">חומר</th>
                        <th className="text-right p-2">מק"ט</th>
                        <th className="text-right p-2 w-20">כמות</th>
                        <th className="text-right p-2 w-20">יחידה</th>
                        <th className="text-right p-2 w-24">מחיר יחידה</th>
                        <th className="text-right p-2 w-20">הנחה %</th>
                        <th className="text-right p-2">מע"מ</th>
                        <th className="text-right p-2">מחיר/מטר</th>
                        <th className="text-right p-2">סה"כ</th>
                        <th className="text-right p-2">ספק</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map((m) => {
                        const handleMaterialFieldChange = (field: string, value: string) => {
                          const qty = field === "quantity" ? parseFloat(value) || 0 : parseFloat(m.quantity || "1");
                          const price = field === "unitPrice" ? parseFloat(value) || 0 : parseFloat(m.unitPrice || "0");
                          const disc = field === "supplierDiscount" ? parseFloat(value) || 0 : parseFloat(m.supplierDiscount || "0");
                          const discountedPrice = price * (1 - disc / 100);
                          const total = qty * discountedPrice;
                          const vatAmt = total * VAT_RATE;

                          const updateData: Record<string, string> = { [field]: value };
                          if (field === "quantity" || field === "unitPrice" || field === "supplierDiscount") {
                            updateData.totalPrice = String(Math.round(total * 100) / 100);
                            updateData.vatAmount = String(Math.round(vatAmt * 100) / 100);
                          }

                          updateMaterialMutation.mutate({ materialId: m.id, data: updateData });
                        };

                        return (
                          <tr key={m.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                            <td className="p-2 text-foreground">{m.materialName}</td>
                            <td className="p-2 text-muted-foreground">{m.materialNumber}</td>
                            <td className="p-1">
                              <Input type="number" defaultValue={m.quantity || "1"} className="bg-slate-800 border-slate-700 h-8 text-sm w-20"
                                onBlur={e => handleMaterialFieldChange("quantity", e.target.value)} />
                            </td>
                            <td className="p-1">
                              <Input defaultValue={m.unit || ""} className="bg-slate-800 border-slate-700 h-8 text-sm w-20"
                                onBlur={e => handleMaterialFieldChange("unit", e.target.value)} />
                            </td>
                            <td className="p-1">
                              <Input type="number" defaultValue={m.unitPrice || "0"} className="bg-slate-800 border-slate-700 h-8 text-sm w-24"
                                onBlur={e => handleMaterialFieldChange("unitPrice", e.target.value)} />
                            </td>
                            <td className="p-1">
                              <Input type="number" defaultValue={m.supplierDiscount || "0"} className="bg-slate-800 border-slate-700 h-8 text-sm w-20"
                                onBlur={e => handleMaterialFieldChange("supplierDiscount", e.target.value)} />
                            </td>
                            <td className="p-2 text-slate-300 text-xs">{fmt(parseFloat(m.vatAmount || "0"))}</td>
                            <td className="p-1">
                              <Input type="number" defaultValue={m.pricePerMeter || ""} className="bg-slate-800 border-slate-700 h-8 text-sm w-20" placeholder="—"
                                onBlur={e => updateMaterialMutation.mutate({ materialId: m.id, data: { pricePerMeter: e.target.value } })} />
                            </td>
                            <td className="p-2 text-blue-400 font-medium">{fmt(parseFloat(m.totalPrice || "0"))}</td>
                            <td className="p-2 text-muted-foreground text-xs">{m.supplierName || "—"}</td>
                            <td className="p-2">
                              {isSuperAdmin && <Button variant="ghost" size="sm" className="text-red-400 h-7 w-7 p-0" onClick={() => removeMaterialMutation.mutate(m.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-600">
                        <td colSpan={8} className="p-2 text-foreground font-medium text-left">סה"כ חומרים:</td>
                        <td className="p-2 text-blue-400 font-bold">{fmt(calc.totalMaterials)}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="production" className="mt-4">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-foreground flex items-center gap-2"><Calculator className="w-5 h-5 text-cyan-400" />עלויות ייצור</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { key: "laborCost", label: "עלות עבודה" },
                  { key: "installationCost", label: "התקנה" },
                  { key: "transportCost", label: "הובלה" },
                  { key: "insuranceCost", label: "ביטוח" },
                  { key: "storageCost", label: "אחסנה" },
                  { key: "customsCost", label: "מכס (ייבוא)" },
                  { key: "packagingCost", label: "אריזה" },
                  { key: "overheadCost", label: "עלויות תקורה" },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <Label>{label}</Label>
                    <Input
                      type="number"
                      value={currentForm[key] || "0"}
                      onChange={e => setField(key, e.target.value)}
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-slate-800 rounded-lg flex justify-between items-center">
                <span className="text-muted-foreground">סה"כ עלויות ייצור:</span>
                <span className="text-lg font-bold text-cyan-400">{fmt(calc.productionCosts)}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="credit" className="mt-4">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-foreground flex items-center gap-2"><DollarSign className="w-5 h-5 text-yellow-400" />הגדרות אשראי / תשלום</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label>תנאי תשלום</Label>
                  <Select value={currentForm.paymentTerms || "net30"} onValueChange={v => setField("paymentTerms", v)}>
                    <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="immediate">מיידי</SelectItem>
                      <SelectItem value="net30">שוטף + 30</SelectItem>
                      <SelectItem value="net60">שוטף + 60</SelectItem>
                      <SelectItem value="net90">שוטף + 90</SelectItem>
                      <SelectItem value="installments">תשלומים</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>מספר תשלומים</Label>
                  <Input type="number" value={currentForm.numberOfPayments || 1} onChange={e => setField("numberOfPayments", parseInt(e.target.value) || 1)} className="bg-slate-800 border-slate-700" />
                </div>
                <div>
                  <Label>עמלת אשראי %</Label>
                  <Input type="number" step="0.1" value={currentForm.creditFeePercent || "0"} onChange={e => setField("creditFeePercent", e.target.value)} className="bg-slate-800 border-slate-700" />
                </div>
                <div>
                  <Label>אחוז בלתי צפוי %</Label>
                  <Input type="number" step="0.1" value={currentForm.contingencyPercent || "0"} onChange={e => setField("contingencyPercent", e.target.value)} className="bg-slate-800 border-slate-700" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="additions" className="mt-4 space-y-4">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-foreground flex items-center gap-2"><TrendingUp className="w-5 h-5 text-purple-400" />תוספות פיננסיות</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <Label>תקורת תפעולית %</Label>
                  <Input type="number" step="0.1" value={currentForm.operationalOverheadPercent || "0"} onChange={e => setField("operationalOverheadPercent", e.target.value)} className="bg-slate-800 border-slate-700" />
                </div>
                <div>
                  <Label>מרווח יעד %</Label>
                  <Input type="number" step="0.1" value={currentForm.targetMarginPercent || "0"} onChange={e => setField("targetMarginPercent", e.target.value)} className="bg-slate-800 border-slate-700" />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-800 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">תקורת תפעולית</p>
                  <p className="text-lg font-bold text-purple-400">{fmt(calc.operationalOverhead)}</p>
                </div>
                <div className="p-3 bg-slate-800 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">עמלת אשראי</p>
                  <p className="text-lg font-bold text-yellow-400">{fmt(calc.creditFee)}</p>
                </div>
                <div className="p-3 bg-slate-800 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">בלתי צפוי</p>
                  <p className="text-lg font-bold text-orange-400">{fmt(calc.contingency)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-foreground flex items-center gap-2"><DollarSign className="w-5 h-5 text-green-400" />עלויות נוספות</CardTitle>
                <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => {
                  const costType = prompt("סוג עלות:");
                  if (!costType) return;
                  const amount = prompt("סכום:");
                  addCostMutation.mutate({ costType, amount: amount || "0", currency: "ILS" });
                }}>
                  <Plus className="w-3.5 h-3.5 ml-1" />הוסף עלות
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {costs.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">אין עלויות נוספות. לחץ "הוסף עלות" להוספה.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 text-muted-foreground">
                        <th className="text-right p-2">סוג עלות</th>
                        <th className="text-right p-2">תיאור</th>
                        <th className="text-right p-2">סכום</th>
                        <th className="text-right p-2">מטבע</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {costs.map((c) => (
                        <tr key={c.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                          <td className="p-2 text-foreground">{c.costType}</td>
                          <td className="p-2 text-muted-foreground">{c.description || "—"}</td>
                          <td className="p-2 text-green-400 font-medium">{fmt(parseFloat(c.amount || "0"))}</td>
                          <td className="p-2 text-muted-foreground">{c.currency || "ILS"}</td>
                          <td className="p-2">
                            {isSuperAdmin && <Button variant="ghost" size="sm" className="text-red-400 h-7 w-7 p-0" onClick={() => removeCostMutation.mutate(c.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-600">
                        <td colSpan={2} className="p-2 text-foreground font-medium text-left">סה"כ עלויות נוספות:</td>
                        <td className="p-2 text-green-400 font-bold">{fmt(costs.reduce((s: number, c: AnalysisCost) => s + parseFloat(c.amount || "0"), 0))}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className="mt-4">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-foreground flex items-center gap-2"><Calculator className="w-5 h-5 text-blue-400" />סיכום עלויות</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { label: "סה\"כ חומרים", value: calc.totalMaterials, color: "text-orange-400" },
                  { label: "סה\"כ ייצור", value: calc.productionCosts, color: "text-cyan-400" },
                  { label: "סה\"כ הובלה + התקנה", value: calc.transportAndInstall, color: "text-teal-400" },
                  { label: "תקורה תפעולית", value: calc.operationalOverhead, color: "text-purple-400" },
                  { label: "עמלת אשראי", value: calc.creditFee, color: "text-yellow-400" },
                  { label: "בלתי צפוי", value: calc.contingency, color: "text-orange-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex justify-between items-center p-2 border-b border-slate-800">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={`font-medium ${color}`}>{fmt(value)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center p-3 bg-slate-800 rounded-lg">
                  <span className="text-foreground font-bold">עלות כוללת לפני מע"מ</span>
                  <span className="text-xl font-bold text-blue-400">{fmt(calc.totalBeforeVat)}</span>
                </div>
                <div className="flex justify-between items-center p-2 border-b border-slate-800">
                  <span className="text-muted-foreground">מע"מ (17%)</span>
                  <span className="text-slate-300">{fmt(calc.vat)}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
                  <span className="text-foreground font-bold">סכום כולל עם מע"מ</span>
                  <span className="text-xl font-bold text-blue-400">{fmt(calc.totalWithVat)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profitability" className="mt-4">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-foreground flex items-center gap-2"><TrendingUp className="w-5 h-5 text-green-400" />ניתוח רווחיות</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>מחיר מכירה מוצע</Label>
                  <Input type="number" value={currentForm.proposedSalePrice || "0"} onChange={e => setField("proposedSalePrice", e.target.value)} className="bg-slate-800 border-slate-700" />
                </div>
                <div>
                  <Label>מחיר מכירה בפועל</Label>
                  <Input type="number" value={currentForm.actualSalePrice || "0"} onChange={e => setField("actualSalePrice", e.target.value)} className="bg-slate-800 border-slate-700" />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="p-4 bg-slate-800 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">מרג'ין גולמי</p>
                  <p className={`text-lg sm:text-2xl font-bold ${calc.grossMargin >= 20 ? "text-green-400" : calc.grossMargin >= 0 ? "text-amber-400" : "text-red-400"}`}>{pct(calc.grossMargin)}</p>
                </div>
                <div className="p-4 bg-slate-800 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">מרג'ין נקי</p>
                  <p className={`text-lg sm:text-2xl font-bold ${calc.netMargin >= 15 ? "text-green-400" : calc.netMargin >= 0 ? "text-amber-400" : "text-red-400"}`}>{pct(calc.netMargin)}</p>
                </div>
                <div className="p-4 bg-slate-800 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">ROI</p>
                  <p className={`text-lg sm:text-2xl font-bold ${calc.roi >= 20 ? "text-green-400" : calc.roi >= 0 ? "text-amber-400" : "text-red-400"}`}>{pct(calc.roi)}</p>
                </div>
                <div className="p-4 bg-slate-800 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">רווח גולמי</p>
                  <p className={`text-lg sm:text-2xl font-bold ${calc.grossProfit >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(calc.grossProfit)}</p>
                </div>
                <div className="p-4 bg-slate-800 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">רווח נקי</p>
                  <p className={`text-lg sm:text-2xl font-bold ${calc.netProfit >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(calc.netProfit)}</p>
                </div>
                <div className="p-4 bg-slate-800 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">נקודת איזון</p>
                  <p className="text-lg sm:text-2xl font-bold text-blue-400">{fmt(calc.breakEven)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="risk" className="mt-4">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-foreground flex items-center gap-2"><Shield className="w-5 h-5 text-amber-400" />מדדי סיכון</CardTitle></CardHeader>
            <CardContent className="space-y-4 sm:space-y-6">
              <div className="p-4 rounded-lg text-center bg-slate-800">
                <p className="text-sm text-muted-foreground">ציון סיכון כולל</p>
                <p className={`text-4xl font-bold ${calc.riskScore <= 3 ? "text-green-400" : calc.riskScore <= 6 ? "text-amber-400" : "text-red-400"}`}>
                  {calc.riskScore.toFixed(1)}/10
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { key: "supplierRisk", label: "סיכון ספקים" },
                  { key: "currencyRisk", label: "סיכון מטבע" },
                  { key: "marketRisk", label: "סיכון שוק" },
                  { key: "operationalRisk", label: "סיכון תפעולי" },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <Label>{label} (1-10)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={currentForm[key] || "5"}
                      onChange={e => setField(key, e.target.value)}
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <h3 className="text-foreground font-medium">פירוט סיכונים</h3>
                <RiskBar label="סיכון ספקים" value={calc.supplierRisk} color="bg-blue-500" />
                <RiskBar label="סיכון מטבע" value={calc.currencyRisk} color="bg-purple-500" />
                <RiskBar label="סיכון שוק" value={calc.marketRisk} color="bg-amber-500" />
                <RiskBar label="סיכון תפעולי" value={calc.operationalRisk} color="bg-red-500" />
              </div>

              <div>
                <h3 className="text-foreground font-medium mb-3">מטריצת סיכון</h3>
                <RiskMatrix />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="simulation" className="mt-4 space-y-4">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-foreground flex items-center gap-2"><BarChart3 className="w-5 h-5 text-indigo-400" />סימולציות What-If</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label>שינוי מחירי חומרים %</Label>
                  <div className="flex gap-2 mt-1">
                    {[-30, -20, -10, 0, 10, 20, 30].map(v => (
                      <button
                        key={v}
                        onClick={() => setSimMaterialChange(v)}
                        className={`px-2 py-1 rounded text-xs ${simMaterialChange === v ? "bg-indigo-600 text-foreground" : "bg-slate-800 text-muted-foreground hover:bg-slate-700"}`}
                      >
                        {v > 0 ? "+" : ""}{v}%
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>שינוי שער מטבע %</Label>
                  <div className="flex gap-2 mt-1">
                    {[-20, -10, 0, 10, 20].map(v => (
                      <button
                        key={v}
                        onClick={() => setSimCurrencyChange(v)}
                        className={`px-2 py-1 rounded text-xs ${simCurrencyChange === v ? "bg-indigo-600 text-foreground" : "bg-slate-800 text-muted-foreground hover:bg-slate-700"}`}
                      >
                        {v > 0 ? "+" : ""}{v}%
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>תרחיש</Label>
                  <Select value={simScenario} onValueChange={setSimScenario}>
                    <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="optimistic">אופטימי</SelectItem>
                      <SelectItem value="realistic">ריאלי</SelectItem>
                      <SelectItem value="pessimistic">פסימי</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={runSimulation} className="bg-indigo-600 hover:bg-indigo-700 w-full">
                    <RefreshCw className="w-4 h-4 ml-2" />הרץ סימולציה
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: "אופטימי (-10% חומרים)", delta: -0.1 },
                  { label: "ריאלי (ללא שינוי)", delta: 0 },
                  { label: "פסימי (+20% חומרים)", delta: 0.2 },
                ].map(({ label, delta }) => {
                  const adjMat = calc.totalMaterials * (1 + delta);
                  const adjTotal = adjMat + calc.productionCosts + calc.contingency + calc.operationalOverhead + calc.creditFee;
                  const adjProfit = calc.salePrice - adjTotal;
                  const adjMargin = calc.salePrice > 0 ? (adjProfit / calc.salePrice) * 100 : 0;
                  return (
                    <div key={label} className={`p-4 rounded-lg border ${delta < 0 ? "bg-green-500/5 border-green-500/20" : delta === 0 ? "bg-blue-500/5 border-blue-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                      <p className="text-xs text-muted-foreground mb-2">{label}</p>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">עלות:</span><span className="text-foreground">{fmt(adjTotal)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">רווח:</span><span className={adjProfit >= 0 ? "text-green-400" : "text-red-400"}>{fmt(adjProfit)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">מרג'ין:</span><span className={adjMargin >= 15 ? "text-green-400" : adjMargin >= 0 ? "text-amber-400" : "text-red-400"}>{pct(adjMargin)}</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <h3 className="text-foreground font-medium mb-3">ניתוח רגישות</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 text-muted-foreground">
                        <th className="text-right p-2">שינוי חומרים</th>
                        <th className="text-right p-2">עלות כוללת</th>
                        <th className="text-right p-2">רווח</th>
                        <th className="text-right p-2">מרג'ין</th>
                        <th className="text-right p-2">כדאיות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[-30, -20, -10, 0, 10, 20, 30].map(pctChange => {
                        const adjMat = calc.totalMaterials * (1 + pctChange / 100);
                        const addCosts = costs.reduce((s: number, c: AnalysisCost) => s + parseFloat(c.amount || "0"), 0);
                        const adjSubtotal = adjMat + calc.productionCosts + addCosts;
                        const contingencyPctVal = parseFloat(currentForm.contingencyPercent as string || "0");
                        const operationalPctVal = parseFloat(currentForm.operationalOverheadPercent as string || "0");
                        const creditPctVal = parseFloat(currentForm.creditFeePercent as string || "0");
                        const adjContingency = adjSubtotal * (contingencyPctVal / 100);
                        const adjOperational = adjSubtotal * (operationalPctVal / 100);
                        const adjCredit = adjSubtotal * (creditPctVal / 100);
                        const adjTotal = adjSubtotal + adjContingency + adjOperational + adjCredit;
                        const adjProfit = calc.salePrice - adjTotal;
                        const adjMargin = calc.salePrice > 0 ? (adjProfit / calc.salePrice) * 100 : 0;
                        const adjGo = adjMargin > 15;
                        return (
                          <tr key={pctChange} className={`border-b border-slate-800 ${pctChange === 0 ? "bg-slate-800/50" : ""}`}>
                            <td className="p-2 text-foreground">{pctChange > 0 ? "+" : ""}{pctChange}%</td>
                            <td className="p-2 text-slate-300">{fmt(adjTotal)}</td>
                            <td className={`p-2 ${adjProfit >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(adjProfit)}</td>
                            <td className={`p-2 ${adjMargin >= 15 ? "text-green-400" : adjMargin >= 0 ? "text-amber-400" : "text-red-400"}`}>{pct(adjMargin)}</td>
                            <td className="p-2">{adjGo ? <Badge className="bg-emerald-500/20 text-emerald-400">Go</Badge> : <Badge className="bg-red-500/20 text-red-400">No-Go</Badge>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-foreground flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-400" />NPV / IRR</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-800 rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">NPV (ערך נוכחי נקי)</p>
                  <p className={`text-xl sm:text-3xl font-bold ${(serverCalc?.npv || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(serverCalc?.npv || 0)}</p>
                  <p className="text-xs text-muted-foreground mt-1">שיעור היוון 8%</p>
                </div>
                <div className="p-4 bg-slate-800 rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">IRR (שיעור תשואה פנימי)</p>
                  <p className={`text-xl sm:text-3xl font-bold ${(serverCalc?.irr || 0) >= 8 ? "text-green-400" : (serverCalc?.irr || 0) >= 0 ? "text-amber-400" : "text-red-400"}`}>{pct(serverCalc?.irr || 0)}</p>
                  <p className="text-xs text-muted-foreground mt-1">יעד מינימלי: 8%</p>
                </div>
              </div>

              {serverCalc?.npvYears && (
                <div>
                  <h3 className="text-foreground font-medium mb-3">תזרים מזומנים מהוון (5 שנים)</h3>
                  <div className="flex items-end gap-2 h-40">
                    {serverCalc.npvYears.map((y) => {
                      const maxVal = Math.max(...serverCalc.npvYears.map((yy) => Math.abs(yy.presentValue)));
                      const heightPct = maxVal > 0 ? Math.abs(y.presentValue) / maxVal * 100 : 0;
                      const isNeg = y.presentValue < 0;
                      return (
                        <div key={y.year} className="flex-1 flex flex-col items-center justify-end h-full">
                          <span className={`text-xs font-medium mb-1 ${isNeg ? "text-red-400" : "text-green-400"}`}>
                            {fmt(y.presentValue)}
                          </span>
                          <div
                            className={`w-full rounded-t ${isNeg ? "bg-red-500/60" : "bg-green-500/60"}`}
                            style={{ height: `${Math.max(heightPct, 5)}%` }}
                          />
                          <span className="text-xs text-muted-foreground mt-1">שנה {y.year}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {serverCalc?.sensitivity && (
                <div>
                  <h3 className="text-foreground font-medium mb-3">ניתוח רגישות — מרג'ין לפי שינוי חומרים</h3>
                  <div className="flex items-end gap-1 h-32">
                    {serverCalc.sensitivity.map((s) => {
                      const maxMargin = Math.max(...serverCalc.sensitivity.map((ss) => Math.abs(ss.margin)));
                      const heightPct = maxMargin > 0 ? Math.abs(s.margin) / maxMargin * 100 : 0;
                      const isPos = s.margin >= 0;
                      return (
                        <div key={s.materialChange} className="flex-1 flex flex-col items-center justify-end h-full">
                          <span className={`text-xs mb-1 ${isPos ? "text-green-400" : "text-red-400"}`}>
                            {pct(s.margin)}
                          </span>
                          <div
                            className={`w-full rounded-t ${isPos ? "bg-blue-500/60" : "bg-red-500/60"}`}
                            style={{ height: `${Math.max(heightPct, 3)}%` }}
                          />
                          <span className="text-xs text-muted-foreground mt-1">{s.materialChange > 0 ? "+" : ""}{s.materialChange}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {simulations.length > 0 && (
            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardHeader><CardTitle className="text-foreground text-sm">סימולציות שנשמרו ({simulations.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {simulations.map((sim) => (
                    <div key={sim.id} className="p-3 bg-slate-800 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-foreground text-sm">{sim.scenarioName}</span>
                        <span className="text-xs text-muted-foreground">{new Date(sim.createdAt).toLocaleDateString("he-IL")}</span>
                      </div>
                      {sim.results && (
                        <div className="flex gap-4 mt-1 text-xs">
                          <span className="text-muted-foreground">עלות: {fmt(sim.results.adjustedTotal || 0)}</span>
                          <span className={`${(sim.results.adjustedProfit || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>רווח: {fmt(sim.results.adjustedProfit || 0)}</span>
                          <span className="text-muted-foreground">מרג'ין: {pct(sim.results.adjustedMargin || 0)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-foreground flex items-center gap-2"><History className="w-5 h-5 text-muted-foreground" />היסטוריית שינויים</CardTitle></CardHeader>
            <CardContent>
              {(!analysis.auditTrail || (Array.isArray(analysis.auditTrail) && analysis.auditTrail.length === 0)) ? (
                <div className="text-center py-8 text-muted-foreground">אין שינויים מתועדים</div>
              ) : (
                <div className="space-y-3">
                  {(Array.isArray(analysis.auditTrail) ? analysis.auditTrail as AuditEntry[] : []).slice().reverse().map((entry, idx) => {
                    const actionLabels: Record<string, string> = {
                      material_added: "חומר נוסף",
                      material_deleted: "חומר נמחק",
                      material_updated: "חומר עודכן",
                      cost_added: "עלות נוספה",
                      cost_deleted: "עלות נמחקה",
                    };
                    const isAction = !!entry.action;
                    const actionLabel = entry.action ? actionLabels[entry.action] || entry.action : "";

                    return (
                      <div key={idx} className="p-3 bg-slate-800 rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs text-muted-foreground">{new Date(entry.timestamp).toLocaleString("he-IL")}</span>
                          {isAction && (
                            <Badge className="bg-indigo-500/20 text-indigo-400 text-xs">{actionLabel}</Badge>
                          )}
                        </div>
                        {isAction ? (
                          <div className="text-xs text-slate-300 space-y-1">
                            {entry.materialName && <span>חומר: {entry.materialName}</span>}
                            {entry.costType && <span>סוג: {entry.costType}</span>}
                            {entry.amount && <span> | סכום: {entry.amount}</span>}
                            {entry.changes && typeof entry.changes === "object" && (
                              <div className="mt-1">
                                {Object.entries(entry.changes).map(([field, change]) => (
                                  <div key={field} className="flex items-center gap-2">
                                    <span className="text-muted-foreground">{field}:</span>
                                    <span className="text-amber-400">{String((change as { from: unknown; to: unknown }).to ?? "—")}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : entry.changes ? (
                          <div className="space-y-1">
                            {Object.entries(entry.changes).map(([field, change]) => (
                              <div key={field} className="text-xs flex items-center gap-2">
                                <span className="text-muted-foreground">{field}:</span>
                                <span className="text-red-400 line-through">{String(change.from || "—")}</span>
                                <span className="text-muted-foreground">→</span>
                                <span className="text-green-400">{String(change.to || "—")}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="space-y-4 mt-6">
        <RelatedRecords
          tabs={[
            {
              key: "materials",
              label: "חומרים",
              endpoint: `${API}/project-analyses/${id}/materials`,
              columns: [
                { key: "materialName", label: "שם חומר" },
                { key: "quantity", label: "כמות" },
                { key: "unitPrice", label: "מחיר יחידה" },
                { key: "totalPrice", label: "סה״כ" },
              ],
            },
            {
              key: "costs",
              label: "עלויות",
              endpoint: `${API}/project-analyses/${id}/costs`,
              columns: [
                { key: "costType", label: "סוג" },
                { key: "description", label: "תיאור" },
                { key: "amount", label: "סכום" },
              ],
            },
          ]}
        />
        <AttachmentsSection entityType="project-analyses" entityId={Number(id) || 0} />
        <ActivityLog entityType="project-analyses" entityId={id} />
      </div>
    </div>
  );
}
