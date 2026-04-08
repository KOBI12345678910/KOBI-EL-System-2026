import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Brain, TrendingUp, TrendingDown, Users, Target, AlertTriangle,
  Zap, DollarSign, Shield, Heart, Star, ArrowUpRight, ArrowDownRight,
  Lightbulb, RefreshCw, Eye, ChevronRight, BarChart3, Activity
} from "lucide-react";
import { useLocation } from "wouter";

const customers = [
  {
    id: 1, name: "קבוצת אלון", segment: "VIP",
    ltv: 2850000, churnProb: 0.05, closeProb: 0.72, expectedRevenue: 1200000,
    riskScore: 18, paymentScore: 92, engagementScore: 85, influenceScore: 78, referralScore: 65,
    healthScore: 88, interestLevel: 82, buyingIntent: 75,
    nextBestAction: "הצע הרחבת חוזה לשלב ב'", nextBestOffer: "הנחת נפח 8% לפרויקט שנתי",
    alerts: ["הזדמנות upsell - פרויקט חדש בקרוב"], upsell: ["חיפוי נוסף - מגדל B"], crossSell: ["מערכות חשמל חכמות"],
  },
  {
    id: 2, name: "שיכון ובינוי", segment: "Enterprise",
    ltv: 4200000, churnProb: 0.08, closeProb: 0.55, expectedRevenue: 850000,
    riskScore: 32, paymentScore: 78, engagementScore: 68, influenceScore: 90, referralScore: 82,
    healthScore: 72, interestLevel: 65, buyingIntent: 58,
    nextBestAction: "שיחת מעקב על איחור תשלום", nextBestOffer: "תנאי תשלום גמישים",
    alerts: ["איחור תשלום 45 ימים", "ירידה ב-engagement"], upsell: [], crossSell: ["שירותי תחזוקה"],
  },
  {
    id: 3, name: "אמות השקעות", segment: "Enterprise",
    ltv: 1800000, churnProb: 0.03, closeProb: 0.85, expectedRevenue: 480000,
    riskScore: 12, paymentScore: 95, engagementScore: 90, influenceScore: 72, referralScore: 55,
    healthScore: 94, interestLevel: 88, buyingIntent: 82,
    nextBestAction: "שלח חוזה לחתימה", nextBestOffer: "ביטוח מורחב 3 שנים",
    alerts: [], upsell: ["שדרוג חלונות premium"], crossSell: ["מערכות אוורור"],
  },
  {
    id: 4, name: "עיריית חולון", segment: "Public",
    ltv: 650000, churnProb: 0.35, closeProb: 0.25, expectedRevenue: 320000,
    riskScore: 68, paymentScore: 45, engagementScore: 32, influenceScore: 55, referralScore: 20,
    healthScore: 38, interestLevel: 28, buyingIntent: 15,
    nextBestAction: "פגישת הנהלה - חידוש קשר", nextBestOffer: "פיילוט בפרויקט קטן",
    alerts: ["סיכון נטישה גבוה", "אין פעילות 60 ימים", "איחור תשלום חמור"], upsell: [], crossSell: [],
  },
  {
    id: 5, name: "סופרגז אנרגיה", segment: "SMB",
    ltv: 380000, churnProb: 0.55, closeProb: 0.10, expectedRevenue: 58000,
    riskScore: 82, paymentScore: 28, engagementScore: 15, influenceScore: 30, referralScore: 10,
    healthScore: 18, interestLevel: 12, buyingIntent: 5,
    nextBestAction: "העבר לגבייה משפטית", nextBestOffer: "הסדר תשלומים",
    alerts: ["חשד לחדלות פירעון", "חוב פתוח ₪58K", "115 ימי איחור"], upsell: [], crossSell: [],
  },
];

const portfolioMetrics = {
  totalLtv: customers.reduce((s, c) => s + c.ltv, 0),
  weightedExpectedRev: customers.reduce((s, c) => s + c.expectedRevenue * c.closeProb, 0),
  avgHealthScore: Math.round(customers.reduce((s, c) => s + c.healthScore, 0) / customers.length),
  avgRiskScore: Math.round(customers.reduce((s, c) => s + c.riskScore, 0) / customers.length),
  churnRiskCount: customers.filter(c => c.churnProb > 0.3).length,
  top5Concentration: 100, // all 5 shown
  upsellOpps: customers.reduce((s, c) => s + c.upsell.length, 0),
  crossSellOpps: customers.reduce((s, c) => s + c.crossSell.length, 0),
};

const fmt = (v: number) => v >= 1000000 ? `₪${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `₪${(v / 1000).toFixed(0)}K` : `₪${v}`;

const scoreColor = (score: number) => score >= 80 ? "text-emerald-600" : score >= 60 ? "text-blue-600" : score >= 40 ? "text-amber-600" : "text-red-600";
const scoreBg = (score: number) => score >= 80 ? "bg-emerald-100" : score >= 60 ? "bg-blue-100" : score >= 40 ? "bg-amber-100" : "bg-red-100";

export default function IntelligenceEngine() {
  const [, navigate] = useLocation();
  const [sortBy, setSortBy] = useState("ltv");

  const sorted = [...customers].sort((a, b) => {
    switch (sortBy) {
      case "ltv": return b.ltv - a.ltv;
      case "risk": return b.riskScore - a.riskScore;
      case "health": return b.healthScore - a.healthScore;
      case "churn": return b.churnProb - a.churnProb;
      case "revenue": return b.expectedRevenue - a.expectedRevenue;
      default: return 0;
    }
  });

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="h-7 w-7 text-primary" /> Customer Intelligence Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            9 מודלים | 5 outputs | Real-time | כל לקוח = נכס פיננסי
          </p>
        </div>
        <Button variant="outline" size="sm"><RefreshCw className="h-3.5 w-3.5 ml-1" /> חשב מחדש</Button>
      </div>

      {/* Portfolio KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-blue-600 mb-1" />
            <p className="text-[10px] text-blue-700">Total LTV</p>
            <p className="text-xl font-bold font-mono text-blue-800">{fmt(portfolioMetrics.totalLtv)}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <Target className="h-5 w-5 mx-auto text-emerald-600 mb-1" />
            <p className="text-[10px] text-emerald-700">Weighted Expected</p>
            <p className="text-xl font-bold font-mono text-emerald-800">{fmt(portfolioMetrics.weightedExpectedRev)}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <Heart className="h-5 w-5 mx-auto text-amber-600 mb-1" />
            <p className="text-[10px] text-amber-700">Health Score ממוצע</p>
            <p className="text-xl font-bold text-amber-800">{portfolioMetrics.avgHealthScore}/100</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto text-red-600 mb-1" />
            <p className="text-[10px] text-red-700">Churn Risk</p>
            <p className="text-xl font-bold text-red-800">{portfolioMetrics.churnRiskCount} לקוחות</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="scores">
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="scores" className="text-xs gap-1"><Brain className="h-3.5 w-3.5" /> ציונים</TabsTrigger>
          <TabsTrigger value="actions" className="text-xs gap-1"><Zap className="h-3.5 w-3.5" /> Next Best Action</TabsTrigger>
          <TabsTrigger value="opportunities" className="text-xs gap-1"><Lightbulb className="h-3.5 w-3.5" /> הזדמנויות</TabsTrigger>
          <TabsTrigger value="portfolio" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" /> Portfolio View</TabsTrigger>
        </TabsList>

        {/* Scores Matrix */}
        <TabsContent value="scores">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">מטריצת ציונים — 9 מודלים</CardTitle>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ltv">LTV</SelectItem>
                  <SelectItem value="risk">סיכון</SelectItem>
                  <SelectItem value="health">בריאות</SelectItem>
                  <SelectItem value="churn">נטישה</SelectItem>
                  <SelectItem value="revenue">הכנסה צפויה</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-right text-[10px] font-semibold sticky right-0 bg-muted/40">לקוח</TableHead>
                      <TableHead className="text-[10px] font-semibold text-center">LTV</TableHead>
                      <TableHead className="text-[10px] font-semibold text-center">P(Close)</TableHead>
                      <TableHead className="text-[10px] font-semibold text-center">P(Churn)</TableHead>
                      <TableHead className="text-[10px] font-semibold text-center">Risk</TableHead>
                      <TableHead className="text-[10px] font-semibold text-center">Payment</TableHead>
                      <TableHead className="text-[10px] font-semibold text-center">Engage</TableHead>
                      <TableHead className="text-[10px] font-semibold text-center">Influence</TableHead>
                      <TableHead className="text-[10px] font-semibold text-center">Referral</TableHead>
                      <TableHead className="text-[10px] font-semibold text-center">Health</TableHead>
                      <TableHead className="text-[10px] font-semibold text-center">Intent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map(c => (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-accent" onClick={() => navigate(`/crm/customer-360/${c.id}`)}>
                        <TableCell className="sticky right-0 bg-background">
                          <div>
                            <p className="text-xs font-medium">{c.name}</p>
                            <Badge variant="outline" className="text-[8px]">{c.segment}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-mono text-[10px] font-bold">{fmt(c.ltv)}</TableCell>
                        <TableCell className="text-center"><Badge className={`${scoreBg(c.closeProb * 100)} ${scoreColor(c.closeProb * 100)} text-[9px] font-mono`}>{(c.closeProb * 100).toFixed(0)}%</Badge></TableCell>
                        <TableCell className="text-center"><Badge className={`${scoreBg(100 - c.churnProb * 100)} ${scoreColor(100 - c.churnProb * 100)} text-[9px] font-mono`}>{(c.churnProb * 100).toFixed(0)}%</Badge></TableCell>
                        <TableCell className="text-center"><Badge className={`${scoreBg(100 - c.riskScore)} ${scoreColor(100 - c.riskScore)} text-[9px] font-mono`}>{c.riskScore}</Badge></TableCell>
                        <TableCell className="text-center"><Badge className={`${scoreBg(c.paymentScore)} ${scoreColor(c.paymentScore)} text-[9px] font-mono`}>{c.paymentScore}</Badge></TableCell>
                        <TableCell className="text-center"><Badge className={`${scoreBg(c.engagementScore)} ${scoreColor(c.engagementScore)} text-[9px] font-mono`}>{c.engagementScore}</Badge></TableCell>
                        <TableCell className="text-center"><Badge className={`${scoreBg(c.influenceScore)} ${scoreColor(c.influenceScore)} text-[9px] font-mono`}>{c.influenceScore}</Badge></TableCell>
                        <TableCell className="text-center"><Badge className={`${scoreBg(c.referralScore)} ${scoreColor(c.referralScore)} text-[9px] font-mono`}>{c.referralScore}</Badge></TableCell>
                        <TableCell className="text-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold mx-auto ${scoreBg(c.healthScore)} ${scoreColor(c.healthScore)}`}>
                            {c.healthScore}
                          </div>
                        </TableCell>
                        <TableCell className="text-center"><Badge className={`${scoreBg(c.buyingIntent)} ${scoreColor(c.buyingIntent)} text-[9px] font-mono`}>{c.buyingIntent}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Next Best Action */}
        <TabsContent value="actions">
          <div className="space-y-3">
            {sorted.map(c => (
              <Card key={c.id} className={`border-r-4 ${c.riskScore > 50 ? "border-r-red-500 bg-red-50/10" : c.healthScore > 80 ? "border-r-emerald-500" : "border-r-amber-400"}`}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${scoreBg(c.healthScore)} ${scoreColor(c.healthScore)}`}>
                      {c.healthScore}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm">{c.name}</h3>
                        <Badge variant="outline" className="text-[9px]">{c.segment}</Badge>
                        <span className="text-[10px] text-muted-foreground mr-auto">LTV: {fmt(c.ltv)}</span>
                      </div>
                      <div className="mt-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20">
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 text-primary shrink-0" />
                          <p className="text-sm font-medium text-primary">{c.nextBestAction}</p>
                        </div>
                      </div>
                      {c.nextBestOffer && (
                        <div className="mt-1.5 p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                          <div className="flex items-center gap-2">
                            <Lightbulb className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <p className="text-xs text-emerald-700">הצעה: {c.nextBestOffer}</p>
                          </div>
                        </div>
                      )}
                      {c.alerts.length > 0 && (
                        <div className="mt-1.5 flex gap-1.5 flex-wrap">
                          {c.alerts.map((a, i) => (
                            <Badge key={i} className="bg-red-100 text-red-700 text-[9px]">
                              <AlertTriangle className="h-2.5 w-2.5 ml-0.5" />{a}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Opportunities */}
        <TabsContent value="opportunities">
          <div className="grid grid-cols-2 gap-4">
            <Card className="border-emerald-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-500" /> Upsell ({portfolioMetrics.upsellOpps})</CardTitle>
              </CardHeader>
              <CardContent>
                {customers.filter(c => c.upsell.length > 0).map(c => (
                  <div key={c.id} className="py-2 border-b last:border-0">
                    <p className="text-xs font-medium">{c.name}</p>
                    {c.upsell.map((u, i) => (
                      <Badge key={i} variant="outline" className="text-[9px] mt-1 ml-1">{u}</Badge>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-blue-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Star className="h-4 w-4 text-blue-500" /> Cross-Sell ({portfolioMetrics.crossSellOpps})</CardTitle>
              </CardHeader>
              <CardContent>
                {customers.filter(c => c.crossSell.length > 0).map(c => (
                  <div key={c.id} className="py-2 border-b last:border-0">
                    <p className="text-xs font-medium">{c.name}</p>
                    {c.crossSell.map((cs, i) => (
                      <Badge key={i} variant="outline" className="text-[9px] mt-1 ml-1">{cs}</Badge>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Portfolio View */}
        <TabsContent value="portfolio">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Portfolio Risk/Return Matrix</CardTitle>
              <CardDescription>כל לקוח כנקודה: X = סיכון, Y = LTV, גודל = הכנסה צפויה</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative h-64 border-b border-r">
                {/* Quadrant labels */}
                <div className="absolute top-2 right-2 text-[9px] text-emerald-500 font-medium">Low Risk / High Value</div>
                <div className="absolute top-2 left-2 text-[9px] text-red-500 font-medium">High Risk / High Value</div>
                <div className="absolute bottom-2 right-2 text-[9px] text-blue-500 font-medium">Low Risk / Low Value</div>
                <div className="absolute bottom-2 left-2 text-[9px] text-amber-500 font-medium">High Risk / Low Value</div>

                {/* Center lines */}
                <div className="absolute top-0 bottom-0 left-1/2 border-l border-dashed border-muted-foreground/20" />
                <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-muted-foreground/20" />

                {/* Customer dots */}
                {customers.map(c => {
                  const maxLtv = Math.max(...customers.map(x => x.ltv));
                  const x = (c.riskScore / 100) * 100;
                  const y = 100 - (c.ltv / maxLtv) * 100;
                  const size = Math.max(20, (c.expectedRevenue / 500000) * 40);
                  return (
                    <div
                      key={c.id}
                      className={`absolute rounded-full flex items-center justify-center text-[8px] font-bold text-white cursor-pointer hover:scale-110 transition-transform ${
                        c.healthScore >= 70 ? "bg-emerald-500" : c.healthScore >= 40 ? "bg-amber-500" : "bg-red-500"
                      }`}
                      style={{ left: `${x}%`, top: `${y}%`, width: `${size}px`, height: `${size}px`, transform: "translate(-50%, -50%)" }}
                      title={`${c.name}: LTV=${fmt(c.ltv)}, Risk=${c.riskScore}, Health=${c.healthScore}`}
                    >
                      {c.name.split(" ")[0].charAt(0)}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1 px-2">
                <span>סיכון נמוך ←</span>
                <span>→ סיכון גבוה</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
