import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3, TrendingUp, TrendingDown, Target, DollarSign,
  Percent, Scale, Search, Award, XCircle, CheckCircle2,
  AlertTriangle, ArrowUpRight, ArrowDownRight, Eye
} from "lucide-react";

const FALLBACK_BIDS = [
  { id: "BID-001", tender: "חלונות אלומיניום - מגדלי הים", ourPrice: 2850000, marketAvg: 3100000, competitor: 2720000, margin: 18.5, winProb: 72, status: "מוביל" },
  { id: "BID-002", tender: "מעטפת זכוכית - עזריאלי", ourPrice: 5400000, marketAvg: 5800000, competitor: 5150000, margin: 22.3, winProb: 45, status: "תחרותי" },
  { id: "BID-003", tender: "דלתות זכוכית מאובטחות", ourPrice: 1950000, marketAvg: 2200000, competitor: 1880000, margin: 15.2, winProb: 58, status: "נמוך" },
  { id: "BID-004", tender: "חיפוי מתכת - קניון הנגב", ourPrice: 3200000, marketAvg: 3450000, competitor: 3100000, margin: 20.1, winProb: 65, status: "מוביל" },
  { id: "BID-005", tender: "מסגרות פלדה - גשר חדש", ourPrice: 7800000, marketAvg: 8200000, competitor: 7650000, margin: 16.8, winProb: 52, status: "תחרותי" },
  { id: "BID-006", tender: "ויטרינות חנויות TLV", ourPrice: 1450000, marketAvg: 1600000, competitor: 1380000, margin: 24.5, winProb: 40, status: "נמוך" },
  { id: "BID-007", tender: "תקרות אלומיניום - איכילוב", ourPrice: 4100000, marketAvg: 4500000, competitor: 3950000, margin: 19.7, winProb: 68, status: "מוביל" },
  { id: "BID-008", tender: "מעקות זכוכית - מגורים", ourPrice: 980000, marketAvg: 1100000, competitor: 920000, margin: 21.3, winProb: 55, status: "תחרותי" },
];

const FALLBACK_COST_BREAKDOWN = [
  { bid: "BID-001", materials: 48, labor: 28, overhead: 12, profit: 12 },
  { bid: "BID-002", materials: 42, labor: 30, overhead: 10, profit: 18 },
  { bid: "BID-003", materials: 52, labor: 25, overhead: 11, profit: 12 },
  { bid: "BID-004", materials: 45, labor: 27, overhead: 13, profit: 15 },
  { bid: "BID-005", materials: 50, labor: 26, overhead: 10, profit: 14 },
  { bid: "BID-006", materials: 38, labor: 32, overhead: 12, profit: 18 },
  { bid: "BID-007", materials: 46, labor: 28, overhead: 11, profit: 15 },
  { bid: "BID-008", materials: 44, labor: 29, overhead: 14, profit: 13 },
];

const FALLBACK_WIN_LOSS = [
  { quarter: "Q1 2025", submitted: 14, won: 6, lost: 5, pending: 3, winRate: 54.5 },
  { quarter: "Q2 2025", submitted: 18, won: 7, lost: 8, pending: 3, winRate: 46.7 },
  { quarter: "Q3 2025", submitted: 12, won: 5, lost: 4, pending: 3, winRate: 55.6 },
  { quarter: "Q4 2025", submitted: 16, won: 8, lost: 6, pending: 2, winRate: 57.1 },
  { quarter: "Q1 2026", submitted: 20, won: 9, lost: 5, pending: 6, winRate: 64.3 },
];

const statusColors: Record<string, string> = {
  "מוביל": "bg-green-500/20 text-green-400",
  "תחרותי": "bg-amber-500/20 text-amber-400",
  "נמוך": "bg-red-500/20 text-red-400",
};

export default function BidAnalysis() {
  const { data: bids = FALLBACK_BIDS } = useQuery({
    queryKey: ["tenders-bids"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/bid-analysis/bids");
      if (!res.ok) return FALLBACK_BIDS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_BIDS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: costBreakdown = FALLBACK_COST_BREAKDOWN } = useQuery({
    queryKey: ["tenders-cost-breakdown"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/bid-analysis/cost-breakdown");
      if (!res.ok) return FALLBACK_COST_BREAKDOWN;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_COST_BREAKDOWN;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: winLoss = FALLBACK_WIN_LOSS } = useQuery({
    queryKey: ["tenders-win-loss"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/bid-analysis/win-loss");
      if (!res.ok) return FALLBACK_WIN_LOSS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_WIN_LOSS;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const [activeTab, setActiveTab] = useState("comparison");

  const avgMargin = (bids.reduce((s, b) => s + b.margin, 0) / bids.length).toFixed(1);
  const competitiveBids = bids.filter((b) => b.status === "מוביל" || b.status === "תחרותי").length;
  const avgWinProb = Math.round(bids.reduce((s, b) => s + b.winProb, 0) / bids.length);

  const kpis = [
    { label: "הצעות בניתוח", value: bids.length.toString(), icon: BarChart3, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "מרווח ממוצע", value: `${avgMargin}%`, icon: Percent, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "הצעות תחרותיות", value: competitiveBids.toString(), icon: Scale, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "סיכוי זכייה ממוצע", value: `${avgWinProb}%`, icon: Target, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "דיוק עלויות", value: "92%", icon: CheckCircle2, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-blue-400" />
            ניתוח הצעות מחיר - טכנו-כל עוזי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">השוואה, ניתוח מרווחים ודפוסי זכייה</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="bg-card/80 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${kpi.bg}`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground leading-tight">{kpi.label}</p>
                  <p className={`text-lg font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-card/80 border border-border/50">
          <TabsTrigger value="comparison">השוואת הצעות</TabsTrigger>
          <TabsTrigger value="margins">ניתוח מרווחים</TabsTrigger>
          <TabsTrigger value="winloss">דפוסי זכייה/הפסד</TabsTrigger>
        </TabsList>

        {/* Tab 1: Bid Comparison */}
        <TabsContent value="comparison" className="space-y-4">
          <Card className="bg-card/60 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Scale className="h-5 w-5 text-blue-400" />
                השוואת הצעות מול שוק ומתחרים
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-right p-3 text-muted-foreground font-medium">מספר</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מכרז</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">המחיר שלנו</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">ממוצע שוק</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מתחרה מוביל</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מרווח</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סיכוי זכייה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bids.map((b) => {
                      const vsMarket = ((b.marketAvg - b.ourPrice) / b.marketAvg * 100).toFixed(1);
                      const vsComp = b.ourPrice <= b.competitor;
                      return (
                        <tr key={b.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                          <td className="p-3 font-mono text-xs text-muted-foreground">{b.id}</td>
                          <td className="p-3 text-foreground font-medium max-w-[180px] truncate">{b.tender}</td>
                          <td className="p-3 font-mono font-medium text-foreground">₪{b.ourPrice.toLocaleString()}</td>
                          <td className="p-3 font-mono text-muted-foreground">₪{b.marketAvg.toLocaleString()}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-muted-foreground">₪{b.competitor.toLocaleString()}</span>
                              {vsComp ? (
                                <ArrowDownRight className="h-3.5 w-3.5 text-red-400" />
                              ) : (
                                <ArrowUpRight className="h-3.5 w-3.5 text-green-400" />
                              )}
                            </div>
                          </td>
                          <td className="p-3 font-mono">
                            <span className={b.margin >= 20 ? "text-green-400" : b.margin >= 15 ? "text-amber-400" : "text-red-400"}>
                              {b.margin}%
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <Progress value={b.winProb} className="h-2 w-16" />
                              <span className="text-xs font-mono text-muted-foreground">{b.winProb}%</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <Badge className={statusColors[b.status]}>{b.status}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Margin Analysis */}
        <TabsContent value="margins" className="space-y-4">
          <Card className="bg-card/60 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-400" />
                פירוט עלויות לפי הצעה
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {costBreakdown.map((cb, idx) => {
                const bid = bids.find((b) => b.id === cb.bid);
                return (
                  <div key={idx} className="p-3 bg-muted/20 rounded-lg border border-border/30">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="font-mono text-xs text-muted-foreground">{cb.bid}</span>
                        <span className="text-sm text-foreground mr-2">{bid?.tender}</span>
                      </div>
                      <span className="font-mono text-sm font-bold text-foreground">₪{bid?.ourPrice.toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">חומרים</span>
                          <span className="text-blue-400 font-mono">{cb.materials}%</span>
                        </div>
                        <Progress value={cb.materials} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">עבודה</span>
                          <span className="text-amber-400 font-mono">{cb.labor}%</span>
                        </div>
                        <Progress value={cb.labor} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">תקורה</span>
                          <span className="text-purple-400 font-mono">{cb.overhead}%</span>
                        </div>
                        <Progress value={cb.overhead} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">רווח</span>
                          <span className={`font-mono ${cb.profit >= 15 ? "text-green-400" : "text-red-400"}`}>{cb.profit}%</span>
                        </div>
                        <Progress value={cb.profit} className="h-2" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Win/Loss Patterns */}
        <TabsContent value="winloss" className="space-y-4">
          <Card className="bg-card/60 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-purple-400" />
                דפוסי זכייה והפסד לפי רבעון
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {winLoss.map((wl, idx) => (
                <div key={idx} className="p-4 bg-muted/20 rounded-lg border border-border/30">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-bold text-foreground">{wl.quarter}</h4>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-500/20 text-blue-400">הוגשו: {wl.submitted}</Badge>
                      <Badge className={wl.winRate >= 55 ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"}>
                        אחוז זכייה: {wl.winRate}%
                      </Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center p-2 bg-background/50 rounded-lg">
                      <p className="text-[10px] text-muted-foreground">הוגשו</p>
                      <p className="text-xl font-bold font-mono text-blue-400">{wl.submitted}</p>
                    </div>
                    <div className="text-center p-2 bg-background/50 rounded-lg">
                      <p className="text-[10px] text-muted-foreground">זכינו</p>
                      <p className="text-xl font-bold font-mono text-green-400">{wl.won}</p>
                    </div>
                    <div className="text-center p-2 bg-background/50 rounded-lg">
                      <p className="text-[10px] text-muted-foreground">הפסדנו</p>
                      <p className="text-xl font-bold font-mono text-red-400">{wl.lost}</p>
                    </div>
                    <div className="text-center p-2 bg-background/50 rounded-lg">
                      <p className="text-[10px] text-muted-foreground">ממתינים</p>
                      <p className="text-xl font-bold font-mono text-amber-400">{wl.pending}</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex h-3 rounded-full overflow-hidden">
                      <div className="bg-green-500" style={{ width: `${(wl.won / wl.submitted) * 100}%` }} />
                      <div className="bg-red-500" style={{ width: `${(wl.lost / wl.submitted) * 100}%` }} />
                      <div className="bg-amber-500" style={{ width: `${(wl.pending / wl.submitted) * 100}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>זכייה {((wl.won / wl.submitted) * 100).toFixed(0)}%</span>
                      <span>הפסד {((wl.lost / wl.submitted) * 100).toFixed(0)}%</span>
                      <span>ממתין {((wl.pending / wl.submitted) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Loss Reasons */}
          <Card className="bg-card/60 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                סיבות הפסד עיקריות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { reason: "מחיר גבוה מהמתחרה", count: 12, pct: 42 },
                  { reason: "ניסיון לא מספיק בפרויקט דומה", count: 7, pct: 25 },
                  { reason: "לוחות זמנים לא תחרותיים", count: 5, pct: 18 },
                  { reason: "מפרט טכני לא מלא", count: 4, pct: 15 },
                ].map((r, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-foreground">{r.reason}</span>
                      <span className="text-muted-foreground font-mono">{r.count} ({r.pct}%)</span>
                    </div>
                    <Progress value={r.pct} className="h-2" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
