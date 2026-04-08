import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3, TrendingUp, Target, DollarSign, Clock, Percent,
  ArrowUpRight, ArrowDownRight, Brain, Lightbulb, AlertTriangle,
  CheckCircle2, Download, RefreshCw, ChevronLeft,
  Briefcase, Building2, Layers, Zap, PieChart, Activity
} from "lucide-react";

const FALLBACK_KPIS = [
  { label: "סה\"כ הצעות", value: "187", change: "+12%", up: true, icon: Briefcase, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "אחוז זכייה", value: "38.5%", change: "+4.2%", up: true, icon: Target, color: "text-green-400", bg: "bg-green-500/10" },
  { label: "ערך הצעה ממוצע", value: "₪284,000", change: "+8%", up: true, icon: DollarSign, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "שווי זכיות כולל", value: "₪20.5M", change: "+15%", up: true, icon: TrendingUp, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "ימי הכנה ממוצע", value: "14.3", change: "-2.1", up: true, icon: Clock, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { label: "ROI על הגשות", value: "3.2x", change: "+0.4", up: true, icon: Percent, color: "text-rose-400", bg: "bg-rose-500/10" },
];

const FALLBACK_QUARTERLY_DATA = [
  { q: "Q3 2025", submitted: 28, won: 9, lost: 15, pending: 4, winRate: 37.5 },
  { q: "Q4 2025", submitted: 32, won: 12, lost: 16, pending: 4, winRate: 42.9 },
  { q: "Q1 2026", submitted: 35, won: 14, lost: 17, pending: 4, winRate: 45.2 },
];
const FALLBACK_PROJECT_TYPES = [
  { type: "חלונות אלומיניום", bids: 45, wins: 22, rate: 48.9, avg: "₪320K" },
  { type: "מעקות זכוכית", bids: 38, wins: 16, rate: 42.1, avg: "₪185K" },
  { type: "חיפוי מתכת", bids: 32, wins: 10, rate: 31.3, avg: "₪410K" },
  { type: "דלתות פנים", bids: 28, wins: 12, rate: 42.9, avg: "₪95K" },
  { type: "פרגולות/סככות", bids: 24, wins: 8, rate: 33.3, avg: "₪260K" },
];
const FALLBACK_SECTOR_DATA = [
  { sector: "ממשלתי", bids: 52, wins: 18, rate: 34.6, trend: "up" },
  { sector: "מוניציפלי", bids: 40, wins: 17, rate: 42.5, trend: "up" },
  { sector: "פרטי - מגורים", bids: 35, wins: 16, rate: 45.7, trend: "stable" },
  { sector: "מסחרי", bids: 30, wins: 12, rate: 40.0, trend: "down" },
  { sector: "תעשייתי", bids: 20, wins: 6, rate: 30.0, trend: "up" },
];

const FALLBACK_FIN_MONTHS = [
  { month: "אוק 25", bidValue: 2800000, wonValue: 1050000, margin: 24.5 },
  { month: "נוב 25", bidValue: 3200000, wonValue: 1400000, margin: 26.1 },
  { month: "דצמ 25", bidValue: 2600000, wonValue: 980000, margin: 22.8 },
  { month: "ינו 26", bidValue: 3500000, wonValue: 1650000, margin: 27.3 },
  { month: "פבר 26", bidValue: 3100000, wonValue: 1320000, margin: 25.9 },
  { month: "מרץ 26", bidValue: 3800000, wonValue: 1800000, margin: 28.4 },
];
const finTotals = { totalBid: 19000000, totalWon: 8200000, avgMargin: 25.8, totalCost: 285000 };

const FALLBACK_FUNNEL_STAGES = [
  { stage: "זוהו", count: 64, value: "₪38.2M", color: "bg-slate-500", pct: 100 },
  { stage: "מסוננים", count: 48, value: "₪29.8M", color: "bg-blue-500", pct: 75 },
  { stage: "בהכנה", count: 28, value: "₪18.4M", color: "bg-cyan-500", pct: 43.8 },
  { stage: "הוגשו", count: 22, value: "₪14.1M", color: "bg-amber-500", pct: 34.4 },
  { stage: "בהערכה", count: 14, value: "₪9.6M", color: "bg-purple-500", pct: 21.9 },
  { stage: "החלטה", count: 8, value: "₪5.2M", color: "bg-green-500", pct: 12.5 },
];

const FALLBACK_AI_RECOMMENDATIONS = [
  { type: "pursue", icon: CheckCircle2, color: "text-green-400", bg: "border-green-500/30", title: "מכרז עיריית חיפה - חלונות מבנה ציבורי", desc: "התאמה גבוהה: 87%. ניסיון קודם עם הלקוח, יתרון טכני בפרופילי אלומיניום. הערכת רווח: ₪180K. מומלץ להגיש עם דגש על אחריות מורחבת.", budget: "₪1.2M", deadline: "28/04/2026" },
  { type: "pursue", icon: CheckCircle2, color: "text-green-400", bg: "border-green-500/30", title: "פרויקט מגדל הים - מעקות זכוכית", desc: "שוק ממוקד עם מעט מתחרים. חיזוי רווחיות 32%. מומלץ לתמחר ב-₪210K עם מרווח של 28%.", budget: "₪750K", deadline: "15/05/2026" },
  { type: "caution", icon: AlertTriangle, color: "text-amber-400", bg: "border-amber-500/30", title: "משרד הביטחון - חיפוי מתכת מתקדם", desc: "תחרות צפופה. 4 מתחרים חזקים מזוהים. נדרש השקעה גדולה בהכנה. שקלו הגשה רק אם יש פינוי משאבים.", budget: "₪3.5M", deadline: "10/05/2026" },
  { type: "avoid", icon: ArrowDownRight, color: "text-red-400", bg: "border-red-500/30", title: "פרויקט נהריה - תריסי אלומיניום", desc: "שיעור זכייה היסטורי נמוך (15%) בקטגוריה זו. מתחרה מקומי עם יתרון מובהק. ROI צפוי שלילי.", budget: "₪480K", deadline: "20/04/2026" },
];

const FALLBACK_PRICING_INSIGHTS = [
  { category: "חלונות אלומיניום", optimalRange: "₪280-340 למ\"ר", current: "₪310 למ\"ר", status: "optimal", note: "במרכז הטווח האופטימלי" },
  { category: "מעקות זכוכית", optimalRange: "₪420-500 למ\"ר", current: "₪380 למ\"ר", status: "low", note: "מתחת לטווח - הפסד רווחיות" },
  { category: "חיפוי מתכת", optimalRange: "₪200-260 למ\"ר", current: "₪245 למ\"ר", status: "optimal", note: "תמחור תחרותי ורווחי" },
];

const FALLBACK_RESOURCE_ALLOCATION = [
  { resource: "צוות הנדסה", current: 78, optimal: 65, note: "עומס יתר - נדרש חיזוק" },
  { resource: "צוות תמחור", current: 62, optimal: 70, note: "ניצולת תקינה" },
  { resource: "ניהול פרויקטים", current: 85, optimal: 75, note: "עומס קריטי - עדיפות לזכיות בטוחות" },
];

export default function TenderAnalyticsPage() {
  const { data: kpis = FALLBACK_KPIS } = useQuery({
    queryKey: ["tenders-kpis"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-analytics/kpis");
      if (!res.ok) return FALLBACK_KPIS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_KPIS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: quarterlyData = FALLBACK_QUARTERLY_DATA } = useQuery({
    queryKey: ["tenders-quarterly-data"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-analytics/quarterly-data");
      if (!res.ok) return FALLBACK_QUARTERLY_DATA;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_QUARTERLY_DATA;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: projectTypes = FALLBACK_PROJECT_TYPES } = useQuery({
    queryKey: ["tenders-project-types"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-analytics/project-types");
      if (!res.ok) return FALLBACK_PROJECT_TYPES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_PROJECT_TYPES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: sectorData = FALLBACK_SECTOR_DATA } = useQuery({
    queryKey: ["tenders-sector-data"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-analytics/sector-data");
      if (!res.ok) return FALLBACK_SECTOR_DATA;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_SECTOR_DATA;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: finMonths = FALLBACK_FIN_MONTHS } = useQuery({
    queryKey: ["tenders-fin-months"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-analytics/fin-months");
      if (!res.ok) return FALLBACK_FIN_MONTHS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_FIN_MONTHS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: funnelStages = FALLBACK_FUNNEL_STAGES } = useQuery({
    queryKey: ["tenders-funnel-stages"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-analytics/funnel-stages");
      if (!res.ok) return FALLBACK_FUNNEL_STAGES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_FUNNEL_STAGES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: aiRecommendations = FALLBACK_AI_RECOMMENDATIONS } = useQuery({
    queryKey: ["tenders-ai-recommendations"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-analytics/ai-recommendations");
      if (!res.ok) return FALLBACK_AI_RECOMMENDATIONS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_AI_RECOMMENDATIONS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: pricingInsights = FALLBACK_PRICING_INSIGHTS } = useQuery({
    queryKey: ["tenders-pricing-insights"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-analytics/pricing-insights");
      if (!res.ok) return FALLBACK_PRICING_INSIGHTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_PRICING_INSIGHTS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: resourceAllocation = FALLBACK_RESOURCE_ALLOCATION } = useQuery({
    queryKey: ["tenders-resource-allocation"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-analytics/resource-allocation");
      if (!res.ok) return FALLBACK_RESOURCE_ALLOCATION;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_RESOURCE_ALLOCATION;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const [activeTab, setActiveTab] = useState("performance");
  const [period, setPeriod] = useState("6m");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-primary" />אנליטיקת מכרזים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניתוח ביצועים, מגמות ותובנות AI למכרזים - טכנו-כל עוזי</p>
        </div>
        <div className="flex gap-2">
          <select value={period} onChange={e => setPeriod(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
            <option value="3m">3 חודשים</option>
            <option value="6m">6 חודשים</option>
            <option value="12m">12 חודשים</option>
          </select>
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא דוח</Button>
          <Button variant="outline" size="sm"><RefreshCw className="w-4 h-4 ml-1" />רענון</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-lg ${k.bg}`}><k.icon className={`w-4 h-4 ${k.color}`} /></div>
                <span className={`text-xs flex items-center gap-0.5 ${k.up ? "text-green-400" : "text-red-400"}`}>
                  {k.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{k.change}
                </span>
              </div>
              <div className="text-xl font-bold text-foreground">{k.value}</div>
              <div className="text-xs text-muted-foreground">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="performance" className="flex items-center gap-1"><Activity className="w-4 h-4" />ביצועים</TabsTrigger>
          <TabsTrigger value="financial" className="flex items-center gap-1"><DollarSign className="w-4 h-4" />פיננסי</TabsTrigger>
          <TabsTrigger value="pipeline" className="flex items-center gap-1"><Layers className="w-4 h-4" />צינור מכרזים</TabsTrigger>
          <TabsTrigger value="insights" className="flex items-center gap-1"><Brain className="w-4 h-4" />תובנות AI</TabsTrigger>
        </TabsList>
        <TabsContent value="performance" className="space-y-6 mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-5">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2"><PieChart className="w-5 h-5 text-primary" />ביצועי זכייה/הפסד לפי רבעון</h3>
              <div className="grid grid-cols-3 gap-4">
                {quarterlyData.map((q, i) => (
                  <div key={i} className="bg-background/40 rounded-xl p-4 border border-border/30">
                    <div className="text-sm font-medium text-muted-foreground mb-3">{q.q}</div>
                    <div className="flex items-end gap-1 h-24 mb-3">
                      <div className="flex-1 bg-green-500/80 rounded-t" style={{ height: `${(q.won / q.submitted) * 100}%` }} title={`זכיות: ${q.won}`} />
                      <div className="flex-1 bg-red-500/60 rounded-t" style={{ height: `${(q.lost / q.submitted) * 100}%` }} title={`הפסדים: ${q.lost}`} />
                      <div className="flex-1 bg-amber-500/60 rounded-t" style={{ height: `${(q.pending / q.submitted) * 100}%` }} title={`ממתינים: ${q.pending}`} />
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-xs">
                      <span className="text-green-400">זכיות: {q.won}</span>
                      <span className="text-red-400">הפסד: {q.lost}</span>
                      <span className="text-amber-400">ממתין: {q.pending}</span>
                    </div>
                    <div className="text-center mt-2">
                      <Badge className="bg-blue-500/20 text-blue-300">{q.winRate}% זכייה</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-5">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Briefcase className="w-5 h-5 text-primary" />ביצועים לפי סוג פרויקט</h3>
              <div className="space-y-3">
                {projectTypes.map((p, i) => (
                  <div key={i} className="flex items-center gap-4 bg-background/30 rounded-lg p-3 border border-border/20">
                    <div className="w-36 text-sm font-medium text-foreground">{p.type}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Progress value={p.rate} className="flex-1 h-2" />
                        <span className="text-sm font-bold text-foreground w-14 text-left">{p.rate}%</span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground w-24 text-center">{p.bids} הגשות / {p.wins} זכיות</div>
                    <Badge variant="outline" className="w-20 justify-center">{p.avg}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-5">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Building2 className="w-5 h-5 text-primary" />ביצועים לפי מגזר לקוח</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {sectorData.map((s, i) => (
                  <div key={i} className="bg-background/40 rounded-xl p-4 border border-border/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">{s.sector}</span>
                      {s.trend === "up" && <ArrowUpRight className="w-4 h-4 text-green-400" />}
                      {s.trend === "down" && <ArrowDownRight className="w-4 h-4 text-red-400" />}
                      {s.trend === "stable" && <Activity className="w-4 h-4 text-amber-400" />}
                    </div>
                    <div className="text-2xl font-bold text-foreground">{s.rate}%</div>
                    <div className="text-xs text-muted-foreground">{s.bids} הגשות, {s.wins} זכיות</div>
                    <Progress value={s.rate} className="mt-2 h-1.5" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="financial" className="space-y-6 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "סה\"כ ערך הצעות", val: `₪${(finTotals.totalBid / 1000000).toFixed(1)}M`, cls: "text-foreground" },
              { label: "סה\"כ זכיות", val: `₪${(finTotals.totalWon / 1000000).toFixed(1)}M`, cls: "text-green-400" },
              { label: "מרווח ממוצע", val: `${finTotals.avgMargin}%`, cls: "text-amber-400" },
              { label: "עלות הגשות כוללת", val: `₪${(finTotals.totalCost / 1000).toFixed(0)}K`, cls: "text-red-400" },
            ].map((c, i) => (
              <Card key={i} className="bg-card/50 border-border/50">
                <CardContent className="p-4 text-center">
                  <div className="text-xs text-muted-foreground">{c.label}</div>
                  <div className={`text-xl font-bold mt-1 ${c.cls}`}>{c.val}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-5">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" />ערכי הצעות מול זכיות - 6 חודשים</h3>
              <div className="space-y-3">
                {finMonths.map((m, i) => {
                  const maxVal = 4000000;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-16 text-xs text-muted-foreground text-left">{m.month}</div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="h-3 bg-blue-500/70 rounded" style={{ width: `${(m.bidValue / maxVal) * 100}%` }} />
                          <span className="text-xs text-muted-foreground">₪{(m.bidValue / 1000000).toFixed(1)}M</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-3 bg-green-500/70 rounded" style={{ width: `${(m.wonValue / maxVal) * 100}%` }} />
                          <span className="text-xs text-muted-foreground">₪{(m.wonValue / 1000000).toFixed(1)}M</span>
                        </div>
                      </div>
                      <div className="w-16 text-center">
                        <Badge className={m.margin >= 26 ? "bg-green-500/20 text-green-300" : "bg-amber-500/20 text-amber-300"}>{m.margin}%</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-6 mt-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500/70 rounded inline-block" />ערך הצעות</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500/70 rounded inline-block" />ערך זכיות</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-5">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2"><DollarSign className="w-5 h-5 text-primary" />עלות הגשת מכרזים</h3>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "עלות ממוצעת להגשה", val: "₪47.5K", sub: "ירידה של 8% מהרבעון הקודם", cls: "text-foreground", subCls: "text-green-400" },
                  { label: "יחס עלות/זכייה", val: "₪123K", sub: "עלות ממוצעת לכל זכייה", cls: "text-foreground", subCls: "text-muted-foreground" },
                  { label: "ROI על הגשות", val: "28.7x", sub: "תשואה על כל שקל שהושקע", cls: "text-green-400", subCls: "text-muted-foreground" },
                ].map((c, i) => (
                  <div key={i} className="bg-background/40 rounded-xl p-4 border border-border/30 text-center">
                    <div className="text-xs text-muted-foreground">{c.label}</div>
                    <div className={`text-2xl font-bold mt-2 ${c.cls}`}>{c.val}</div>
                    <div className={`text-xs mt-1 ${c.subCls}`}>{c.sub}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="pipeline" className="space-y-6 mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-5">
              <h3 className="font-semibold text-foreground mb-6 flex items-center gap-2"><Layers className="w-5 h-5 text-primary" />משפך מכרזים - צינור הזדמנויות</h3>
              <div className="space-y-3">
                {funnelStages.map((s, i) => (
                  <div key={i} className="relative">
                    <div className="flex items-center gap-4">
                      <div className="w-24 text-sm font-medium text-foreground">{s.stage}</div>
                      <div className="flex-1">
                        <div className="relative h-10 bg-background/30 rounded-lg overflow-hidden">
                          <div className={`absolute inset-y-0 right-0 ${s.color} rounded-lg flex items-center justify-end px-3 transition-all`} style={{ width: `${s.pct}%` }}>
                            <span className="text-xs font-bold text-white">{s.count} מכרזים</span>
                          </div>
                        </div>
                      </div>
                      <div className="w-24 text-left">
                        <div className="text-sm font-bold text-foreground">{s.value}</div>
                        <div className="text-xs text-muted-foreground">{s.pct}%</div>
                      </div>
                    </div>
                    {i < funnelStages.length - 1 && (
                      <div className="flex items-center justify-center my-1">
                        <ChevronLeft className="w-4 h-4 text-muted-foreground rotate-90" />
                        <span className="text-xs text-muted-foreground mx-2">
                          {Math.round((funnelStages[i + 1].count / s.count) * 100)}% המרה
                        </span>
                        <ChevronLeft className="w-4 h-4 text-muted-foreground rotate-90" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { Icon: Zap, color: "text-amber-400", label: "זמן ממוצע בצינור", val: "32 יום", valCls: "text-foreground" },
              { Icon: TrendingUp, color: "text-green-400", label: "שיעור המרה כולל", val: "12.5%", valCls: "text-foreground" },
              { Icon: Target, color: "text-blue-400", label: "מכרזים בהכנה", val: "28", valCls: "text-foreground" },
              { Icon: Clock, color: "text-red-400", label: "דדליין קרוב (7 ימים)", val: "5", valCls: "text-red-400" },
            ].map((c, i) => (
              <Card key={i} className="bg-card/50 border-border/50">
                <CardContent className="p-4 text-center">
                  <c.Icon className={`w-5 h-5 mx-auto mb-1 ${c.color}`} />
                  <div className="text-xs text-muted-foreground">{c.label}</div>
                  <div className={`text-xl font-bold mt-1 ${c.valCls}`}>{c.val}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="insights" className="space-y-6 mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-5">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Brain className="w-5 h-5 text-primary" />המלצות AI - אילו מכרזים לרדוף</h3>
              <div className="space-y-3">
                {aiRecommendations.map((r, i) => (
                  <div key={i} className={`bg-background/40 rounded-xl p-4 border ${r.bg}`}>
                    <div className="flex items-start gap-3">
                      <r.icon className={`w-5 h-5 mt-0.5 ${r.color}`} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-foreground">{r.title}</span>
                          <div className="flex gap-2 text-xs">
                            <Badge variant="outline">תקציב: {r.budget}</Badge>
                            <Badge variant="outline">דדליין: {r.deadline}</Badge>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">{r.desc}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-5">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Lightbulb className="w-5 h-5 text-primary" />תמחור אופטימלי - ניתוח AI</h3>
              <div className="space-y-3">
                {pricingInsights.map((p, i) => (
                  <div key={i} className="flex items-center gap-4 bg-background/30 rounded-lg p-3 border border-border/20">
                    <div className="w-32 text-sm font-medium text-foreground">{p.category}</div>
                    <div className="flex-1 text-sm text-muted-foreground">טווח: {p.optimalRange}</div>
                    <div className="text-sm font-medium text-foreground">נוכחי: {p.current}</div>
                    <Badge className={p.status === "optimal" ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}>
                      {p.status === "optimal" ? "אופטימלי" : "נמוך מדי"}
                    </Badge>
                    <div className="w-48 text-xs text-muted-foreground">{p.note}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-5">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-primary" />הקצאת משאבים - ניצולת והמלצות</h3>
              <div className="space-y-4">
                {resourceAllocation.map((r, i) => (
                  <div key={i} className="bg-background/30 rounded-lg p-3 border border-border/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">{r.resource}</span>
                      <span className="text-xs text-muted-foreground">{r.note}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="relative h-3 bg-background/50 rounded-full overflow-hidden">
                          <div className={`absolute inset-y-0 right-0 rounded-full ${r.current > r.optimal ? "bg-red-500/70" : "bg-green-500/70"}`} style={{ width: `${r.current}%` }} />
                          <div className="absolute inset-y-0 border-r-2 border-dashed border-amber-400" style={{ right: `${r.optimal}%` }} title={`אופטימלי: ${r.optimal}%`} />
                        </div>
                      </div>
                      <span className="text-sm font-bold text-foreground w-12">{r.current}%</span>
                      <Badge variant="outline" className="text-xs">יעד: {r.optimal}%</Badge>
                    </div>
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