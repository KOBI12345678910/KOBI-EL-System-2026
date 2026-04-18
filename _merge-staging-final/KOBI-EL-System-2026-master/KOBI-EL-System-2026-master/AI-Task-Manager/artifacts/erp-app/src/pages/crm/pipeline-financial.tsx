import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DollarSign, TrendingUp, TrendingDown, Target, BarChart3,
  Clock, AlertTriangle, CheckCircle, XCircle, Zap,
  ArrowUpRight, ArrowDownRight, Gauge, Activity, Shield
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const FALLBACK_STAGES = [
  { name: "ליד חדש", deals: 45, value: 2200000, weighted: 220000, avgDays: 3, convRate: 62, color: "bg-gray-400" },
  { name: "פגישה ראשונה", deals: 28, value: 1800000, weighted: 360000, avgDays: 8, convRate: 78, color: "bg-blue-400" },
  { name: "הצעת מחיר", deals: 22, value: 1500000, weighted: 600000, avgDays: 12, convRate: 68, color: "bg-indigo-400" },
  { name: "משא ומתן", deals: 15, value: 1800000, weighted: 1080000, avgDays: 18, convRate: 73, color: "bg-purple-400" },
  { name: "אישור סופי", deals: 8, value: 1200000, weighted: 960000, avgDays: 5, convRate: 88, color: "bg-amber-400" },
];

const FALLBACK_DEALS = [
  { id: 1, name: "פרויקט מגדל A", customer: "קבוצת אלון", value: 850000, weighted: 552500, stage: "משא ומתן", prob: 65, daysInStage: 12, velocity: "normal", risk: "low", stuckDays: 0, agent: "דני כהן", predictedClose: "2026-05-15", bestCase: 920000, expectedCase: 750000, worstCase: 450000 },
  { id: 2, name: "חיפוי מגורים רמת גן", customer: "שיכון ובינוי", value: 620000, weighted: 248000, stage: "הצעת מחיר", prob: 40, daysInStage: 18, velocity: "slow", risk: "medium", stuckDays: 8, agent: "מיכל לוי", predictedClose: "2026-06-01", bestCase: 680000, expectedCase: 520000, worstCase: 0 },
  { id: 3, name: "משרדי hi-tech הרצליה", customer: "אמות השקעות", value: 480000, weighted: 408000, stage: "אישור סופי", prob: 85, daysInStage: 3, velocity: "fast", risk: "low", stuckDays: 0, agent: "דני כהן", predictedClose: "2026-04-20", bestCase: 520000, expectedCase: 480000, worstCase: 420000 },
  { id: 4, name: "בית ספר חולון", customer: "עיריית חולון", value: 320000, weighted: 80000, stage: "פגישה ראשונה", prob: 25, daysInStage: 22, velocity: "stuck", risk: "high", stuckDays: 15, agent: "יוסי אברהם", predictedClose: "2026-07-01", bestCase: 350000, expectedCase: 180000, worstCase: 0 },
  { id: 5, name: "מפעל אור יהודה", customer: "תעשיות ORT", value: 290000, weighted: 145000, stage: "הצעת מחיר", prob: 50, daysInStage: 10, velocity: "normal", risk: "low", stuckDays: 0, agent: "מיכל לוי", predictedClose: "2026-05-30", bestCase: 310000, expectedCase: 260000, worstCase: 150000 },
  { id: 6, name: "מרכז מסחרי באר שבע", customer: "BIG", value: 1200000, weighted: 120000, stage: "ליד חדש", prob: 10, daysInStage: 5, velocity: "normal", risk: "medium", stuckDays: 0, agent: "דני כהן", predictedClose: "2026-08-01", bestCase: 1400000, expectedCase: 600000, worstCase: 0 },
];

const fmt = (v: number) => v >= 1000000 ? `₪${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `₪${(v / 1000).toFixed(0)}K` : `₪${v}`;

export default function PipelineFinancial() {
  const { data: apiPipeline } = useQuery<{ stages: typeof FALLBACK_STAGES; deals: typeof FALLBACK_DEALS }>({
    queryKey: ["crm-pipeline-financial"],
    queryFn: async () => { const res = await authFetch("/api/crm/deals/pipeline"); if (!res.ok) throw new Error("API error"); return res.json(); },
  });
  const stages = apiPipeline?.stages ?? FALLBACK_STAGES;
  const deals = apiPipeline?.deals ?? FALLBACK_DEALS;

  const totalValue = stages.reduce((s, st) => s + st.value, 0);
  const totalWeighted = stages.reduce((s, st) => s + st.weighted, 0);
  const totalDeals = stages.reduce((s, st) => s + st.deals, 0);
  const stuckDeals = deals.filter(d => d.stuckDays > 7);
  const highRiskDeals = deals.filter(d => d.risk === "high");
  const bestCaseTotal = deals.reduce((s, d) => s + d.bestCase, 0);
  const expectedTotal = deals.reduce((s, d) => s + d.expectedCase, 0);
  const worstCaseTotal = deals.reduce((s, d) => s + d.worstCase, 0);

  const [view, setView] = useState("financial");

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-primary" /> Pipeline — Financial View
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">ניהול pipeline כמו תיק השקעות | Weighted | Velocity | Risk | Scenarios</p>
        </div>
      </div>

      {/* Scenario Strip */}
      <div className="grid grid-cols-6 gap-3">
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <p className="text-[10px] text-emerald-700">Best Case</p>
            <p className="text-lg font-bold font-mono text-emerald-800">{fmt(bestCaseTotal)}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <p className="text-[10px] text-blue-700">Expected</p>
            <p className="text-lg font-bold font-mono text-blue-800">{fmt(expectedTotal)}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <p className="text-[10px] text-amber-700">Worst Case</p>
            <p className="text-lg font-bold font-mono text-amber-800">{fmt(worstCaseTotal)}</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <p className="text-[10px] text-purple-700">Weighted Pipeline</p>
            <p className="text-lg font-bold font-mono text-purple-800">{fmt(totalWeighted)}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <p className="text-[10px] text-red-700">Stuck Deals</p>
            <p className="text-lg font-bold text-red-800">{stuckDeals.length}</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <p className="text-[10px] text-orange-700">High Risk</p>
            <p className="text-lg font-bold text-orange-800">{highRiskDeals.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Funnel - Financial */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Pipeline Funnel — Financial Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-right text-[10px] font-semibold">שלב</TableHead>
                <TableHead className="text-right text-[10px] font-semibold">עסקאות</TableHead>
                <TableHead className="text-right text-[10px] font-semibold">ערך נומינלי</TableHead>
                <TableHead className="text-right text-[10px] font-semibold">ערך משוקלל</TableHead>
                <TableHead className="text-right text-[10px] font-semibold">ימים ממוצע</TableHead>
                <TableHead className="text-right text-[10px] font-semibold">Conversion</TableHead>
                <TableHead className="text-right text-[10px] font-semibold w-40">funnel</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stages.map((st, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded ${st.color}`} />
                      <span className="text-xs font-medium">{st.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{st.deals}</TableCell>
                  <TableCell className="font-mono text-xs">{fmt(st.value)}</TableCell>
                  <TableCell className="font-mono text-xs font-bold text-primary">{fmt(st.weighted)}</TableCell>
                  <TableCell className="font-mono text-xs">{st.avgDays}d</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[9px] font-mono ${st.convRate >= 75 ? "text-emerald-600" : st.convRate >= 60 ? "text-blue-600" : "text-amber-600"}`}>
                      {st.convRate}%
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className={`h-5 ${st.color} rounded flex items-center justify-end pr-2 text-white text-[9px] font-bold`}
                      style={{ width: `${(st.value / totalValue) * 100}%`, minWidth: "30px" }}>
                      {((st.value / totalValue) * 100).toFixed(0)}%
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-primary/5 font-bold border-t-2">
                <TableCell className="text-xs">סה"כ</TableCell>
                <TableCell className="font-mono text-xs">{totalDeals}</TableCell>
                <TableCell className="font-mono text-xs">{fmt(totalValue)}</TableCell>
                <TableCell className="font-mono text-xs text-primary">{fmt(totalWeighted)}</TableCell>
                <TableCell colSpan={3} />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Tabs defaultValue="deals">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="deals" className="text-xs gap-1"><DollarSign className="h-3.5 w-3.5" /> עסקאות</TabsTrigger>
          <TabsTrigger value="velocity" className="text-xs gap-1"><Gauge className="h-3.5 w-3.5" /> Velocity</TabsTrigger>
          <TabsTrigger value="risk" className="text-xs gap-1"><Shield className="h-3.5 w-3.5" /> Risk View</TabsTrigger>
        </TabsList>

        {/* Deals Financial */}
        <TabsContent value="deals">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-right text-[10px] font-semibold">עסקה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">לקוח</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">שלב</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">נומינלי</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">משוקלל</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">P(Win)</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">Best</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">Expected</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">Worst</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">Close</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deals.sort((a, b) => b.weighted - a.weighted).map(d => (
                      <TableRow key={d.id} className={`hover:bg-accent ${d.risk === "high" ? "bg-red-50/20" : ""}`}>
                        <TableCell className="text-xs font-medium">{d.name}</TableCell>
                        <TableCell className="text-[10px]">{d.customer}</TableCell>
                        <TableCell>
                          <Badge className={`text-[8px] text-white ${stages.find(s => s.name === d.stage)?.color}`}>{d.stage}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-[10px]">{fmt(d.value)}</TableCell>
                        <TableCell className="font-mono text-[10px] font-bold text-primary">{fmt(d.weighted)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Progress value={d.prob} className="h-1.5 w-10" />
                            <span className="text-[9px] font-mono">{d.prob}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-[9px] text-emerald-600">{fmt(d.bestCase)}</TableCell>
                        <TableCell className="font-mono text-[9px] text-blue-600">{fmt(d.expectedCase)}</TableCell>
                        <TableCell className="font-mono text-[9px] text-red-600">{fmt(d.worstCase)}</TableCell>
                        <TableCell className="text-[9px]">{d.predictedClose}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Velocity */}
        <TabsContent value="velocity">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">עסקה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">שלב</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">ימים בשלב</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">Velocity</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">Stuck</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">AI המלצה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deals.sort((a, b) => b.stuckDays - a.stuckDays).map(d => (
                    <TableRow key={d.id} className={d.velocity === "stuck" ? "bg-red-50/20" : ""}>
                      <TableCell className="text-xs font-medium">{d.name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[8px]">{d.stage}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{d.daysInStage}d</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${
                          d.velocity === "fast" ? "bg-emerald-100 text-emerald-700" :
                          d.velocity === "normal" ? "bg-blue-100 text-blue-700" :
                          d.velocity === "slow" ? "bg-amber-100 text-amber-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {d.velocity === "fast" ? "⚡ מהיר" : d.velocity === "normal" ? "→ רגיל" : d.velocity === "slow" ? "🐌 איטי" : "🚨 תקוע"}
                        </Badge>
                      </TableCell>
                      <TableCell className={`font-mono text-xs ${d.stuckDays > 7 ? "text-red-600 font-bold" : ""}`}>
                        {d.stuckDays > 0 ? `${d.stuckDays}d` : "—"}
                      </TableCell>
                      <TableCell className="text-[10px] text-primary max-w-[200px]">
                        {d.velocity === "stuck" ? "📞 שיחת בדיקת סטטוס + escalation למנהל" :
                         d.velocity === "slow" ? "📧 שלח תזכורת + הנחה מוגבלת בזמן" :
                         d.velocity === "fast" ? "✅ המשך מומנטום - תאם חתימה" :
                         "→ פעולות שגרתיות"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Risk View */}
        <TabsContent value="risk">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">עסקה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">ערך</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סיכון</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">P(Win)</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">P(Loss)</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">Value at Risk</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סוכן</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deals.sort((a, b) => (b.value * (1 - b.prob / 100)) - (a.value * (1 - a.prob / 100))).map(d => {
                    const valueAtRisk = d.value * (1 - d.prob / 100);
                    return (
                      <TableRow key={d.id} className={d.risk === "high" ? "bg-red-50/30" : ""}>
                        <TableCell className="text-xs font-medium">{d.name}</TableCell>
                        <TableCell className="font-mono text-xs">{fmt(d.value)}</TableCell>
                        <TableCell>
                          <Badge className={`text-[9px] ${d.risk === "high" ? "bg-red-100 text-red-700" : d.risk === "medium" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                            {d.risk === "high" ? "גבוה" : d.risk === "medium" ? "בינוני" : "נמוך"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-emerald-600">{d.prob}%</TableCell>
                        <TableCell className="font-mono text-[10px] text-red-600">{(100 - d.prob)}%</TableCell>
                        <TableCell className="font-mono text-xs font-bold text-red-600">{fmt(valueAtRisk)}</TableCell>
                        <TableCell className="text-[10px]">{d.agent}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-red-50/30 font-bold border-t-2">
                    <TableCell className="text-xs">Total Value at Risk</TableCell>
                    <TableCell className="font-mono text-xs">{fmt(totalValue)}</TableCell>
                    <TableCell colSpan={3} />
                    <TableCell className="font-mono text-xs text-red-700">{fmt(deals.reduce((s, d) => s + d.value * (1 - d.prob / 100), 0))}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
