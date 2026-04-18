import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { authFetch } from "@/lib/utils";
import {
  Shield, AlertTriangle, TrendingDown, TrendingUp, Activity, Eye,
  Plus, Globe, DollarSign, Users, Building2, Target, Gauge,
  CheckCircle, XCircle, Clock, TriangleAlert, ArrowUpRight,
  ArrowDownRight, Layers, Zap, RefreshCw
} from "lucide-react";

// ============================================================
// RISK CATEGORIES
// ============================================================
const RISK_CATEGORIES = [
  { id: "all", label: "הכל", icon: Layers },
  { id: "liquidity", label: "נזילות", icon: DollarSign, color: "text-blue-600", bg: "bg-blue-50" },
  { id: "credit", label: "אשראי", icon: Users, color: "text-amber-600", bg: "bg-amber-50" },
  { id: "concentration", label: "ריכוזיות", icon: Target, color: "text-orange-600", bg: "bg-orange-50" },
  { id: "operational", label: "תפעולי", icon: Activity, color: "text-green-600", bg: "bg-green-50" },
  { id: "supplier", label: "ספקים", icon: Building2, color: "text-purple-600", bg: "bg-purple-50" },
  { id: "fx", label: 'מט"ח', icon: Globe, color: "text-red-600", bg: "bg-red-50" },
  { id: "project", label: "פרויקטים", icon: Gauge, color: "text-indigo-600", bg: "bg-indigo-50" },
  { id: "market", label: "שוק", icon: TrendingDown, color: "text-pink-600", bg: "bg-pink-50" },
];

// Risk Register data
const riskRegister = [
  { id: 1, name: "ריכוזיות לקוח A (38% מההכנסות)", category: "concentration", likelihood: 4, impact: 5, score: 20, status: "open", owner: "CFO", mitigation: "גיוון בסיס לקוחות - יעד 25% תוך 6 חודשים", reviewDate: "2026-05-01" },
  { id: 2, name: "חשיפת EUR לא מגודרת (€420K)", category: "fx", likelihood: 4, impact: 3, score: 12, status: "mitigated", owner: "Treasury", mitigation: "Forward 6M נסגר ב-3.78", reviewDate: "2026-07-01" },
  { id: 3, name: "תלות בספק יחיד לאלומיניום", category: "supplier", likelihood: 3, impact: 4, score: 12, status: "open", owner: "רכש", mitigation: "איתור ספק חלופי - בתהליך", reviewDate: "2026-04-30" },
  { id: 4, name: "עיכוב גבייה ממגזר ציבורי (68 ימים)", category: "credit", likelihood: 4, impact: 3, score: 12, status: "open", owner: "גבייה", mitigation: "מכתבי התראה + שיחות follow-up", reviewDate: "2026-04-15" },
  { id: 5, name: "עליית ריבית על מסגרת אשראי", category: "liquidity", likelihood: 3, impact: 2, score: 6, status: "accepted", owner: "CFO", mitigation: "מעבר למסגרת קבועה בבנק לאומי", reviewDate: "2026-06-01" },
  { id: 6, name: "כשל מערכת ERP - downtime", category: "operational", likelihood: 2, impact: 4, score: 8, status: "mitigated", owner: "IT", mitigation: "DR site + גיבוי יומי", reviewDate: "2026-12-01" },
  { id: 7, name: "פרויקט קרית אתא - חריגת עלויות 15%", category: "project", likelihood: 4, impact: 3, score: 12, status: "open", owner: "PM", mitigation: "Scope freeze + דו\"ח שבועי", reviewDate: "2026-04-20" },
  { id: 8, name: "עליית מחירי אלומיניום (LME)", category: "market", likelihood: 3, impact: 4, score: 12, status: "open", owner: "רכש", mitigation: "חוזה שנתי במחיר קבוע", reviewDate: "2026-06-30" },
  { id: 9, name: "כשל בגבייה מלקוח B (₪320K)", category: "credit", likelihood: 3, impact: 3, score: 9, status: "open", owner: "CFO", mitigation: "בטוחה בנקאית + מעקב שבועי", reviewDate: "2026-05-15" },
  { id: 10, name: "עיכוב משלוח יבוא מסין (COVID-related)", category: "supplier", likelihood: 2, impact: 3, score: 6, status: "accepted", owner: "לוגיסטיקה", mitigation: "ספק חלופי מטורקיה מוכן", reviewDate: "2026-08-01" },
];

const riskLimits = [
  { name: "ריכוזיות Top 5 לקוחות", metric: "revenue_concentration_top5", limit: 60, current: 58, unit: "%" },
  { name: "ריכוזיות ספק יחיד", metric: "supplier_single_dependency", limit: 20, current: 18, unit: "%" },
  { name: "DSO מקסימלי", metric: "dso_max", limit: 60, current: 42, unit: "ימים" },
  { name: "חשיפת מט\"ח לא מגודרת", metric: "unhedged_fx_exposure", limit: 500000, current: 230000, unit: "₪" },
  { name: "Current Ratio מינימלי", metric: "current_ratio_min", limit: 1.5, current: 1.85, unit: "x" },
  { name: "Debt/Equity מקסימלי", metric: "debt_to_equity_max", limit: 1.0, current: 0.62, unit: "x" },
  { name: "חובות אבודים מקסימלי", metric: "bad_debt_max", limit: 3, current: 1.8, unit: "%" },
  { name: "תקציב חריגה מקסימלית", metric: "budget_overrun_max", limit: 10, current: 4.2, unit: "%" },
];

const exposures = [
  { type: 'מט"ח EUR', gross: 850000, hedged: 620000, net: 230000, instrument: "Forward 6M", maturity: "2026-09-30", counterparty: "לאומי" },
  { type: 'מט"ח USD', gross: 320000, hedged: 280000, net: 40000, instrument: "Forward 3M", maturity: "2026-06-30", counterparty: "הפועלים" },
  { type: "אלומיניום (LME)", gross: 1200000, hedged: 0, net: 1200000, instrument: "—", maturity: "—", counterparty: "—" },
  { type: "ריבית", gross: 5000000, hedged: 3000000, net: 2000000, instrument: "IRS 5Y", maturity: "2029-12-31", counterparty: "דיסקונט" },
  { type: "סחורות (זכוכית)", gross: 450000, hedged: 200000, net: 250000, instrument: "חוזה שנתי", maturity: "2026-12-31", counterparty: "Foshan" },
];

const earlyWarnings = [
  { indicator: "DSO עולה (42 → 48 ימים)", severity: "warning" as const, category: "credit", detail: "גבייה איטית ממגזר ציבורי" },
  { indicator: "ריכוזיות Top 5 > 58%", severity: "critical" as const, category: "concentration", detail: "לקוח A = 38%, חייב לגוון" },
  { indicator: "Current Ratio ירד מתחת ל-2.0", severity: "warning" as const, category: "liquidity", detail: "1.85 - עדיין מעל מינימום 1.5" },
  { indicator: "Hedge Ratio ירד ל-72%", severity: "info" as const, category: "fx", detail: "יעד 80% - צריך גידור נוסף" },
  { indicator: "מחיר אלומיניום עלה 8% ב-30 יום", severity: "warning" as const, category: "market", detail: "LME benchmark - משפיע על מרווח" },
  { indicator: "פרויקט קרית אתא חריגה 15%", severity: "critical" as const, category: "project", detail: "₪180K חריגה - scope freeze הופעל" },
];

function getRiskColor(score: number) {
  if (score >= 15) return { bg: "bg-red-500", text: "text-white", badge: "bg-red-100 text-red-700", label: "קריטי" };
  if (score >= 10) return { bg: "bg-orange-500", text: "text-white", badge: "bg-orange-100 text-orange-700", label: "גבוה" };
  if (score >= 5) return { bg: "bg-amber-400", text: "text-black", badge: "bg-amber-100 text-amber-700", label: "בינוני" };
  return { bg: "bg-green-400", text: "text-black", badge: "bg-green-100 text-green-700", label: "נמוך" };
}

function getLimitStatus(current: number, limit: number, isMax: boolean = true) {
  const ratio = isMax ? current / limit : limit / current;
  if (ratio >= 0.95) return "critical";
  if (ratio >= 0.8) return "warning";
  return "ok";
}

export default function RiskDashboard() {
  const queryClient = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showAddRisk, setShowAddRisk] = useState(false);

  // API queries
  const { data: apiRisks } = useQuery({
    queryKey: ["/api/fin/quant/risk/register"],
    queryFn: () => authFetch("/api/fin/quant/risk/register").then(r => r.json()).catch(() => []),
  });

  const { data: apiLimits } = useQuery({
    queryKey: ["/api/fin/quant/risk/limits"],
    queryFn: () => authFetch("/api/fin/quant/risk/limits").then(r => r.json()).catch(() => []),
  });

  const { data: exposureData } = useQuery({
    queryKey: ["/api/fin/quant/exposure"],
    queryFn: () => authFetch("/api/fin/quant/exposure").then(r => r.json()).catch(() => ({ items: [], hedges: [], summary: {} })),
  });

  const filteredRisks = useMemo(() =>
    categoryFilter === "all" ? riskRegister : riskRegister.filter(r => r.category === categoryFilter),
    [categoryFilter]
  );

  // Compute heatmap
  const heatmap = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {};
    for (let l = 1; l <= 5; l++) {
      matrix[l] = {};
      for (let i = 1; i <= 5; i++) {
        matrix[l][i] = riskRegister.filter(r => r.likelihood === l && r.impact === i).length;
      }
    }
    return matrix;
  }, []);

  // Summary
  const criticalRisks = riskRegister.filter(r => r.score >= 15).length;
  const highRisks = riskRegister.filter(r => r.score >= 10 && r.score < 15).length;
  const openRisks = riskRegister.filter(r => r.status === "open").length;
  const overallScore = Math.round(riskRegister.reduce((s, r) => s + r.score, 0) / riskRegister.length);

  const totalGrossExposure = exposures.reduce((s, e) => s + e.gross, 0);
  const totalHedged = exposures.reduce((s, e) => s + e.hedged, 0);
  const hedgeRatio = totalGrossExposure > 0 ? (totalHedged / totalGrossExposure * 100) : 0;

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" /> ניהול סיכונים Enterprise
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Risk Register | Heatmap | חשיפות וגידור | מגבלות | אזהרות מוקדמות
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Card className="px-4 py-2">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">ציון סיכון כולל</p>
              <p className={`text-2xl font-bold font-mono ${overallScore > 12 ? "text-red-600" : overallScore > 8 ? "text-amber-600" : "text-emerald-600"}`}>
                {overallScore}/25
              </p>
            </div>
          </Card>
          <Dialog open={showAddRisk} onOpenChange={setShowAddRisk}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 ml-1" /> סיכון חדש</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg" dir="rtl">
              <DialogHeader><DialogTitle>הוספת סיכון</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label className="text-xs">שם הסיכון</Label><Input placeholder="תאר את הסיכון" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">קטגוריה</Label>
                    <Select><SelectTrigger><SelectValue placeholder="בחר" /></SelectTrigger>
                      <SelectContent>{RISK_CATEGORIES.filter(c => c.id !== "all").map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">אחראי</Label><Input /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">סבירות (1-5)</Label><Input type="number" min={1} max={5} defaultValue={3} /></div>
                  <div><Label className="text-xs">השפעה (1-5)</Label><Input type="number" min={1} max={5} defaultValue={3} /></div>
                </div>
                <div><Label className="text-xs">תוכנית מענה</Label><Textarea /></div>
                <Button className="w-full" onClick={() => setShowAddRisk(false)}>שמור</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-6 gap-3">
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="pt-3 pb-2 text-center">
            <p className="text-[10px] text-red-700">קריטי</p>
            <p className="text-2xl font-bold text-red-800">{criticalRisks}</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50/40">
          <CardContent className="pt-3 pb-2 text-center">
            <p className="text-[10px] text-orange-700">גבוה</p>
            <p className="text-2xl font-bold text-orange-800">{highRisks}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="pt-3 pb-2 text-center">
            <p className="text-[10px] text-amber-700">פתוחים</p>
            <p className="text-2xl font-bold text-amber-800">{openRisks}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="pt-3 pb-2 text-center">
            <p className="text-[10px] text-blue-700">חשיפה ברוטו</p>
            <p className="text-lg font-bold font-mono text-blue-800">₪{(totalGrossExposure / 1000000).toFixed(1)}M</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="pt-3 pb-2 text-center">
            <p className="text-[10px] text-emerald-700">מגודר</p>
            <p className="text-lg font-bold font-mono text-emerald-800">{hedgeRatio.toFixed(0)}%</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50/40">
          <CardContent className="pt-3 pb-2 text-center">
            <p className="text-[10px] text-purple-700">אזהרות</p>
            <p className="text-2xl font-bold text-purple-800">{earlyWarnings.length}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="register">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="register" className="gap-1 text-xs"><Shield className="h-3.5 w-3.5" /> מרשם סיכונים</TabsTrigger>
          <TabsTrigger value="heatmap" className="gap-1 text-xs"><Layers className="h-3.5 w-3.5" /> Heatmap</TabsTrigger>
          <TabsTrigger value="exposure" className="gap-1 text-xs"><Globe className="h-3.5 w-3.5" /> חשיפות</TabsTrigger>
          <TabsTrigger value="limits" className="gap-1 text-xs"><Target className="h-3.5 w-3.5" /> מגבלות</TabsTrigger>
          <TabsTrigger value="warnings" className="gap-1 text-xs"><AlertTriangle className="h-3.5 w-3.5" /> אזהרות</TabsTrigger>
        </TabsList>

        {/* Risk Register */}
        <TabsContent value="register" className="space-y-3">
          <div className="flex gap-1.5 flex-wrap">
            {RISK_CATEGORIES.map(cat => {
              const count = cat.id === "all" ? riskRegister.length : riskRegister.filter(r => r.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-2.5 py-1 rounded text-xs border transition-all ${
                    categoryFilter === cat.id ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent border-border"
                  }`}
                >
                  {cat.label} ({count})
                </button>
              );
            })}
          </div>

          <Card>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-right text-xs w-8">ציון</TableHead>
                      <TableHead className="text-right text-xs">סיכון</TableHead>
                      <TableHead className="text-right text-xs w-16">קטגוריה</TableHead>
                      <TableHead className="text-right text-xs w-10">L</TableHead>
                      <TableHead className="text-right text-xs w-10">I</TableHead>
                      <TableHead className="text-right text-xs w-16">סטטוס</TableHead>
                      <TableHead className="text-right text-xs w-16">אחראי</TableHead>
                      <TableHead className="text-right text-xs">מענה</TableHead>
                      <TableHead className="text-right text-xs w-20">סקירה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRisks.sort((a, b) => b.score - a.score).map(risk => {
                      const riskColor = getRiskColor(risk.score);
                      return (
                        <TableRow key={risk.id} className="hover:bg-muted/20">
                          <TableCell>
                            <div className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold ${riskColor.bg} ${riskColor.text}`}>
                              {risk.score}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium text-sm max-w-[250px]">{risk.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[9px]">{risk.category}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-center">{risk.likelihood}</TableCell>
                          <TableCell className="font-mono text-xs text-center">{risk.impact}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[9px] ${
                              risk.status === "open" ? "text-red-600 border-red-300" :
                              risk.status === "mitigated" ? "text-blue-600 border-blue-300" :
                              "text-gray-600 border-gray-300"
                            }`}>
                              {risk.status === "open" ? "פתוח" : risk.status === "mitigated" ? "ממותן" : "מקובל"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{risk.owner}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{risk.mitigation}</TableCell>
                          <TableCell className="text-[10px] text-muted-foreground">{risk.reviewDate}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Heatmap */}
        <TabsContent value="heatmap">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Risk Heatmap — Likelihood × Impact</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-6">
                {/* Matrix */}
                <div className="flex-1">
                  <div className="grid grid-cols-6 gap-1">
                    <div /> {/* corner */}
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="text-center text-[10px] font-medium text-muted-foreground pb-1">Impact {i}</div>
                    ))}
                    {[5, 4, 3, 2, 1].map(l => (
                      <>
                        <div key={`l-${l}`} className="text-[10px] font-medium text-muted-foreground flex items-center justify-end pr-2">L{l}</div>
                        {[1, 2, 3, 4, 5].map(i => {
                          const score = l * i;
                          const count = heatmap[l]?.[i] || 0;
                          const color = getRiskColor(score);
                          return (
                            <div
                              key={`${l}-${i}`}
                              className={`h-14 rounded flex items-center justify-center text-sm font-bold transition-all
                                ${count > 0 ? `${color.bg} ${color.text}` : "bg-muted/30 text-muted-foreground/30"}`}
                            >
                              {count > 0 ? count : ""}
                            </div>
                          );
                        })}
                      </>
                    ))}
                  </div>
                </div>

                {/* Legend */}
                <div className="w-36 space-y-2 pt-6">
                  <p className="text-xs font-medium mb-2">מקרא</p>
                  {[
                    { label: "קריטי (15-25)", color: "bg-red-500" },
                    { label: "גבוה (10-14)", color: "bg-orange-500" },
                    { label: "בינוני (5-9)", color: "bg-amber-400" },
                    { label: "נמוך (1-4)", color: "bg-green-400" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded ${item.color}`} />
                      <span className="text-[10px]">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Exposures */}
        <TabsContent value="exposure" className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-blue-200">
              <CardContent className="pt-4 text-center">
                <p className="text-[10px] text-muted-foreground">חשיפה ברוטו</p>
                <p className="text-xl font-bold font-mono">₪{(totalGrossExposure / 1000000).toFixed(2)}M</p>
              </CardContent>
            </Card>
            <Card className="border-emerald-200">
              <CardContent className="pt-4 text-center">
                <p className="text-[10px] text-muted-foreground">מגודר</p>
                <p className="text-xl font-bold font-mono text-emerald-700">₪{(totalHedged / 1000000).toFixed(2)}M</p>
              </CardContent>
            </Card>
            <Card className="border-red-200">
              <CardContent className="pt-4 text-center">
                <p className="text-[10px] text-muted-foreground">חשיפה נטו</p>
                <p className="text-xl font-bold font-mono text-red-700">₪{((totalGrossExposure - totalHedged) / 1000000).toFixed(2)}M</p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-xs">סוג חשיפה</TableHead>
                    <TableHead className="text-right text-xs">ברוטו</TableHead>
                    <TableHead className="text-right text-xs">מגודר</TableHead>
                    <TableHead className="text-right text-xs">נטו</TableHead>
                    <TableHead className="text-right text-xs">יחס גידור</TableHead>
                    <TableHead className="text-right text-xs">מכשיר</TableHead>
                    <TableHead className="text-right text-xs">פקיעה</TableHead>
                    <TableHead className="text-right text-xs">צד נגדי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exposures.map((exp, i) => {
                    const hr = exp.gross > 0 ? (exp.hedged / exp.gross * 100) : 0;
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-sm">{exp.type}</TableCell>
                        <TableCell className="font-mono text-xs">₪{exp.gross.toLocaleString()}</TableCell>
                        <TableCell className="font-mono text-xs text-emerald-600">₪{exp.hedged.toLocaleString()}</TableCell>
                        <TableCell className={`font-mono text-xs font-bold ${exp.net > 500000 ? "text-red-600" : "text-amber-600"}`}>
                          ₪{exp.net.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Progress value={hr} className="h-1.5 w-14" />
                            <span className="text-[10px] font-mono">{hr.toFixed(0)}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{exp.instrument}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">{exp.maturity}</TableCell>
                        <TableCell className="text-xs">{exp.counterparty}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Limits */}
        <TabsContent value="limits">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">מגבלות סיכון — Risk Limits</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-xs">מגבלה</TableHead>
                    <TableHead className="text-right text-xs">סף</TableHead>
                    <TableHead className="text-right text-xs">בפועל</TableHead>
                    <TableHead className="text-right text-xs">מרווח</TableHead>
                    <TableHead className="text-right text-xs w-32">ניצול</TableHead>
                    <TableHead className="text-right text-xs">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riskLimits.map((lim, i) => {
                    const isMaxLimit = !lim.name.includes("מינימלי");
                    const utilizationPct = isMaxLimit ? (lim.current / lim.limit * 100) : (lim.limit / lim.current * 100);
                    const status = getLimitStatus(lim.current, lim.limit, isMaxLimit);
                    const headroom = isMaxLimit ? lim.limit - lim.current : lim.current - lim.limit;

                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-sm">{lim.name}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {lim.unit === "₪" ? `₪${lim.limit.toLocaleString()}` : `${lim.limit}${lim.unit}`}
                        </TableCell>
                        <TableCell className={`font-mono text-xs font-bold ${
                          status === "critical" ? "text-red-600" : status === "warning" ? "text-amber-600" : "text-emerald-600"
                        }`}>
                          {lim.unit === "₪" ? `₪${lim.current.toLocaleString()}` : `${lim.current}${lim.unit}`}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-emerald-600">
                          +{lim.unit === "₪" ? `₪${headroom.toLocaleString()}` : `${headroom.toFixed(1)}${lim.unit}`}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Progress
                              value={utilizationPct}
                              className={`h-2 w-20 ${status === "critical" ? "[&>div]:bg-red-500" : status === "warning" ? "[&>div]:bg-amber-500" : ""}`}
                            />
                            <span className="text-[10px] font-mono">{utilizationPct.toFixed(0)}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {status === "ok"
                            ? <CheckCircle className="h-4 w-4 text-emerald-500" />
                            : status === "warning"
                              ? <AlertTriangle className="h-4 w-4 text-amber-500" />
                              : <XCircle className="h-4 w-4 text-red-500" />
                          }
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Early Warnings */}
        <TabsContent value="warnings">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> אזהרות מוקדמות — Early Warning System
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {earlyWarnings.map((w, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${
                  w.severity === "critical" ? "border-red-200 bg-red-50/50" :
                  w.severity === "warning" ? "border-amber-200 bg-amber-50/50" :
                  "border-blue-200 bg-blue-50/50"
                }`}>
                  {w.severity === "critical"
                    ? <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                    : w.severity === "warning"
                      ? <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                      : <Eye className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                  }
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{w.indicator}</p>
                      <Badge variant="outline" className="text-[9px]">{w.category}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{w.detail}</p>
                  </div>
                  <Badge className={
                    w.severity === "critical" ? "bg-red-100 text-red-700" :
                    w.severity === "warning" ? "bg-amber-100 text-amber-700" :
                    "bg-blue-100 text-blue-700"
                  }>{w.severity === "critical" ? "קריטי" : w.severity === "warning" ? "אזהרה" : "מידע"}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
