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
  Users, Target, TrendingUp, DollarSign, PieChart, Search, Plus,
  Building2, Shield, AlertTriangle, Award, Eye, ArrowUpDown,
  BarChart3, Zap, Globe, Briefcase, ArrowUp, ArrowDown, Minus
} from "lucide-react";

const FALLBACK_COMPETITORS = [
  { id: 1, name: "אלומיניום ישראל בע\"מ", spec: "פרופילי אלומיניום", size: "גדול", region: "מרכז", winRate: 38, priceIdx: 0.95, strengths: "מחירים תחרותיים, כמויות גדולות", weaknesses: "זמני אספקה ארוכים", recentWins: 4 },
  { id: 2, name: "מתכת פלוס תעשיות", spec: "ריתוך ומתכת", size: "בינוני", region: "צפון", winRate: 25, priceIdx: 1.02, strengths: "איכות ריתוך גבוהה", weaknesses: "מגוון מוצרים מצומצם", recentWins: 2 },
  { id: 3, name: "זכוכית הגליל", spec: "זכוכית מחוסמת", size: "בינוני", region: "צפון", winRate: 30, priceIdx: 0.98, strengths: "התמחות בזכוכית בטיחותית", weaknesses: "אין יכולת מתכת", recentWins: 3 },
  { id: 4, name: "טיטאן מתכות", spec: "פלדה וברזל", size: "גדול", region: "דרום", winRate: 42, priceIdx: 0.91, strengths: "מפעל ייצור ענק, מחירי סיטונאות", weaknesses: "גמישות נמוכה בהזמנות קטנות", recentWins: 6 },
  { id: 5, name: "אומגה חלונות", spec: "חלונות ודלתות", size: "קטן", region: "מרכז", winRate: 18, priceIdx: 1.08, strengths: "שירות מהיר, התקנה מקצועית", weaknesses: "חברה קטנה, יכולת מוגבלת", recentWins: 1 },
  { id: 6, name: "מגן אלום בע\"מ", spec: "מערכות אלומיניום", size: "בינוני", region: "שרון", winRate: 33, priceIdx: 0.97, strengths: "ניסיון 20+ שנה, מוניטין", weaknesses: "מחירים גבוהים יחסית", recentWins: 3 },
  { id: 7, name: "גלאס-טק", spec: "זכוכית אדריכלית", size: "קטן", region: "מרכז", winRate: 22, priceIdx: 1.05, strengths: "עיצוב מתקדם, ייבוא ישיר", weaknesses: "זמני אספקה ארוכים מחו\"ל", recentWins: 2 },
  { id: 8, name: "ברזל הנגב", spec: "מסגרות וברזל", size: "בינוני", region: "דרום", winRate: 28, priceIdx: 0.93, strengths: "מחירים נמוכים, קרבה לאילת/ב\"ש", weaknesses: "איכות בינונית", recentWins: 2 },
  { id: 9, name: "אקסל פרופילים", spec: "פרופילים תרמיים", size: "גדול", region: "מרכז", winRate: 35, priceIdx: 1.01, strengths: "טכנולוגיה מתקדמת, ISO 9001", weaknesses: "MOQ גבוה", recentWins: 4 },
  { id: 10, name: "סטיל מאסטר", spec: "נירוסטה ופלדה", size: "קטן", region: "חיפה", winRate: 15, priceIdx: 1.12, strengths: "עבודות מיוחדות ומורכבות", weaknesses: "יקר, קיבולת נמוכה", recentWins: 1 },
];

const FALLBACK_H2H_METRICS = [
  { metric: "מחיר ממוצע", us: 92, c1: 95, c2: 91, c3: 98, c4: 102, c5: 97, unit: "אינדקס" },
  { metric: "ציון איכות", us: 94, c1: 85, c2: 88, c3: 82, c4: 90, c5: 78, unit: "%" },
  { metric: "מהירות אספקה", us: 88, c1: 75, c2: 92, c3: 70, c4: 85, c5: 80, unit: "%" },
  { metric: "מוניטין שוק", us: 90, c1: 88, c2: 82, c3: 86, c4: 78, c5: 75, unit: "%" },
  { metric: "שירות לקוחות", us: 93, c1: 80, c2: 76, c3: 85, c4: 82, c5: 70, unit: "%" },
  { metric: "גמישות ייצור", us: 91, c1: 70, c2: 85, c3: 65, c4: 88, c5: 72, unit: "%" },
];
const FALLBACK_H2H_NAMES = ["טכנו-כל עוזי", "אלומיניום ישראל", "טיטאן מתכות", "זכוכית הגליל", "מגן אלום", "אקסל פרופילים"];
const FALLBACK_MARKET_TRENDS = [
  { title: "עלייה בביקוש לזכוכית אנרגטית", trend: "up", impact: "גבוה", desc: "דרישות תקן ירוק 5281 מגדילות ביקוש ב-35%" },
  { title: "מחסור בפרופילי אלומיניום", trend: "up", impact: "בינוני", desc: "עיכובים בייבוא מטורקיה, עלייה של 12% במחירים" },
  { title: "ירידה בפרויקטים ממשלתיים", trend: "down", impact: "גבוה", desc: "קיצוץ תקציבי של 15% בתשתיות לשנת 2026" },
  { title: "צמיחה בשוק הפרטי", trend: "up", impact: "בינוני", desc: "גידול של 22% בבנייה למגורים באזור המרכז" },
  { title: "תחרות מיבוא סיני", trend: "neutral", impact: "גבוה", desc: "מוצרי אלומיניום זולים מסין מאיימים על שוק מקומי" },
];
const FALLBACK_UPCOMING_PROJECTS = [
  { name: "מגדל משרדים רמת גן", value: "45M", deadline: "2026-06", type: "מסחרי" },
  { name: "בית ספר אשדוד", value: "8M", deadline: "2026-05", type: "ממשלתי" },
  { name: "מרכז מסחרי מודיעין", value: "32M", deadline: "2026-07", type: "מסחרי" },
  { name: "שיקום חזיתות ת\"א", value: "15M", deadline: "2026-08", type: "שיפוץ" },
  { name: "פרויקט מחיר למשתכן כרמיאל", value: "55M", deadline: "2026-09", type: "מגורים" },
];
const FALLBACK_GOV_BUDGETS = [
  { ministry: "משרד השיכון", budget: 380, change: 5 }, { ministry: "משרד הביטחון", budget: 220, change: -8 },
  { ministry: "משרד החינוך", budget: 150, change: 12 }, { ministry: "רשויות מקומיות", budget: 290, change: 3 },
  { ministry: "משרד הבריאות", budget: 95, change: 18 },
];
const FALLBACK_PRICING_PATTERNS = [
  { type: "מבנה מגורים", ourAvg: 100, marketAvg: 105, low: 91, high: 118, volume: 42 },
  { type: "בניין משרדים", ourAvg: 98, marketAvg: 102, low: 88, high: 115, volume: 28 },
  { type: "מוסד ציבורי", ourAvg: 95, marketAvg: 98, low: 85, high: 108, volume: 18 },
  { type: "מסחרי/קניון", ourAvg: 103, marketAvg: 108, low: 93, high: 122, volume: 15 },
  { type: "תעשייה", ourAvg: 92, marketAvg: 96, low: 82, high: 110, volume: 12 },
  { type: "שיפוץ/שימור", ourAvg: 110, marketAvg: 115, low: 98, high: 130, volume: 8 },
];

export default function TenderCompetitorsPage() {
  const { data: competitors = FALLBACK_COMPETITORS } = useQuery({
    queryKey: ["tenders-competitors"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-competitors/competitors");
      if (!res.ok) return FALLBACK_COMPETITORS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_COMPETITORS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: h2hMetrics = FALLBACK_H2H_METRICS } = useQuery({
    queryKey: ["tenders-h2h-metrics"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-competitors/h2h-metrics");
      if (!res.ok) return FALLBACK_H2H_METRICS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_H2H_METRICS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: h2hNames = FALLBACK_H2H_NAMES } = useQuery({
    queryKey: ["tenders-h2h-names"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-competitors/h2h-names");
      if (!res.ok) return FALLBACK_H2H_NAMES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_H2H_NAMES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: marketTrends = FALLBACK_MARKET_TRENDS } = useQuery({
    queryKey: ["tenders-market-trends"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-competitors/market-trends");
      if (!res.ok) return FALLBACK_MARKET_TRENDS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_MARKET_TRENDS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: upcomingProjects = FALLBACK_UPCOMING_PROJECTS } = useQuery({
    queryKey: ["tenders-upcoming-projects"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-competitors/upcoming-projects");
      if (!res.ok) return FALLBACK_UPCOMING_PROJECTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_UPCOMING_PROJECTS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: govBudgets = FALLBACK_GOV_BUDGETS } = useQuery({
    queryKey: ["tenders-gov-budgets"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-competitors/gov-budgets");
      if (!res.ok) return FALLBACK_GOV_BUDGETS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_GOV_BUDGETS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: pricingPatterns = FALLBACK_PRICING_PATTERNS } = useQuery({
    queryKey: ["tenders-pricing-patterns"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-competitors/pricing-patterns");
      if (!res.ok) return FALLBACK_PRICING_PATTERNS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_PRICING_PATTERNS;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("competitors");

  const filtered = competitors.filter(c =>
    !search || c.name.includes(search) || c.spec.includes(search) || c.region.includes(search)
  );

  const avgWinRate = Math.round(competitors.reduce((s, c) => s + c.winRate, 0) / competitors.length);
  const avgPriceRatio = (competitors.reduce((s, c) => s + c.priceIdx, 0) / competitors.length).toFixed(2);
  const activeCount = competitors.filter(c => c.recentWins > 0).length;
  const kpis = [
    { label: "מתחרים במעקב", value: competitors.length, icon: Users, color: "text-blue-400" },
    { label: "פעילים בשוק", value: activeCount, icon: Target, color: "text-green-400" },
    { label: "שיעור זכייה ממוצע מול", value: `${avgWinRate}%`, icon: TrendingUp, color: "text-amber-400" },
    { label: "יחס מחיר ממוצע", value: avgPriceRatio, icon: DollarSign, color: "text-purple-400" },
    { label: "נתח שוק שלנו", value: "24%", icon: PieChart, color: "text-cyan-400" },
  ];
  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === "up") return <ArrowUp className="w-4 h-4 text-green-400" />;
    if (trend === "down") return <ArrowDown className="w-4 h-4 text-red-400" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };
  const cellColor = (val: number, isPrice = false) => {
    if (isPrice) return val <= 95 ? "text-green-400 font-bold" : val >= 105 ? "text-red-400" : "text-foreground";
    return val >= 90 ? "text-green-400 font-bold" : val >= 80 ? "text-amber-400" : "text-red-400";
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Eye className="h-7 w-7 text-primary" /> מודיעין מתחרים - מכרזים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניתוח מתחרים, מגמות שוק ואסטרטגיות תמחור</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><BarChart3 className="w-4 h-4 ml-1" />דוח מתחרים</Button>
          <Button size="sm" className="bg-primary"><Plus className="w-4 h-4 ml-1" />הוסף מתחרה</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="bg-card/50 border-border/50">
            <CardContent className="p-4 text-center">
              <k.icon className={`h-6 w-6 mx-auto mb-1 ${k.color}`} />
              <div className="text-2xl font-bold text-foreground">{k.value}</div>
              <div className="text-xs text-muted-foreground">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="competitors">מתחרים</TabsTrigger>
          <TabsTrigger value="h2h">ראש בראש</TabsTrigger>
          <TabsTrigger value="market">מודיעין שוק</TabsTrigger>
          <TabsTrigger value="pricing">דפוסי תמחור</TabsTrigger>
        </TabsList>

        <TabsContent value="competitors" className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="חיפוש מתחרה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(c => (
              <Card key={c.id} className="bg-card/50 border-border/50 hover:border-primary/40 transition-colors">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-foreground flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-primary" /> {c.name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{c.spec} | {c.region} | {c.size}</div>
                    </div>
                    <Badge className={c.winRate >= 35 ? "bg-red-500/20 text-red-300" : c.winRate >= 25 ? "bg-amber-500/20 text-amber-300" : "bg-green-500/20 text-green-300"}>
                      זכייה {c.winRate}%
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-background/50 rounded p-2">
                      <div className="text-xs text-muted-foreground">אינדקס מחיר</div>
                      <div className={`text-sm font-bold ${c.priceIdx <= 0.95 ? "text-green-400" : c.priceIdx >= 1.05 ? "text-red-400" : "text-foreground"}`}>
                        {c.priceIdx.toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-background/50 rounded p-2">
                      <div className="text-xs text-muted-foreground">זכיות אחרונות</div>
                      <div className="text-sm font-bold text-foreground">{c.recentWins}</div>
                    </div>
                    <div className="bg-background/50 rounded p-2">
                      <div className="text-xs text-muted-foreground">שיעור זכייה</div>
                      <Progress value={c.winRate} className="h-2 mt-1" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-start gap-1">
                      <Shield className="w-3 h-3 text-green-400 mt-0.5 shrink-0" />
                      <span className="text-muted-foreground"><span className="text-green-400">חוזקות:</span> {c.strengths}</span>
                    </div>
                    <div className="flex items-start gap-1">
                      <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                      <span className="text-muted-foreground"><span className="text-red-400">חולשות:</span> {c.weaknesses}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="h2h" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ArrowUpDown className="w-5 h-5 text-primary" /> השוואה ראש בראש - אנחנו מול 5 מתחרים מובילים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 font-semibold text-muted-foreground">מדד</th>
                      {h2hNames.map((n, i) => (
                        <th key={n} className={`p-3 text-center font-semibold ${i === 0 ? "text-primary bg-primary/5" : "text-muted-foreground"}`}>
                          {n}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {h2hMetrics.map(m => {
                      const vals = [m.us, m.c1, m.c2, m.c3, m.c4, m.c5];
                      const isPrice = m.metric === "מחיר ממוצע";
                      return (
                        <tr key={m.metric} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="p-3 font-medium text-foreground">{m.metric}</td>
                          {vals.map((v, i) => (
                            <td key={i} className={`p-3 text-center ${i === 0 ? "bg-primary/5" : ""} ${cellColor(v, isPrice)}`}>
                              {v}{m.unit === "%" ? "%" : ""}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: Award, color: "green", title: "מובילים באיכות", desc: "ציון 94% - הגבוה ביותר בשוק" },
              { icon: Zap, color: "amber", title: "מהירות אספקה #2", desc: "טיטאן מתכות מהירים ב-4% מאיתנו" },
              { icon: DollarSign, color: "blue", title: "מחיר תחרותי", desc: "אינדקס 92 - שלישי בזול" },
            ].map(s => (
              <Card key={s.title} className={`bg-${s.color}-500/5 border-${s.color}-500/20`}>
                <CardContent className="p-4 text-center">
                  <s.icon className={`w-6 h-6 mx-auto text-${s.color}-400 mb-2`} />
                  <div className={`font-bold text-${s.color}-400 text-lg`}>{s.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.desc}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="market" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" /> מגמות שוק
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {marketTrends.map((t, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-background/50 rounded-lg">
                    <TrendIcon trend={t.trend} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground text-sm">{t.title}</span>
                        <Badge className={t.impact === "גבוה" ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"}>
                          {t.impact}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-primary" /> פרויקטים עתידיים
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {upcomingProjects.map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-background/50 rounded">
                      <div>
                        <div className="text-sm font-medium text-foreground">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.type} | {p.deadline}</div>
                      </div>
                      <Badge variant="outline" className="text-primary border-primary/30">{p.value} &#8362;</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Globe className="w-5 h-5 text-primary" /> הקצאות תקציב ממשלתיות (מיליוני &#8362;)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {govBudgets.map((g, i) => (
                    <div key={i} className="flex items-center justify-between p-2">
                      <span className="text-sm text-foreground">{g.ministry}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-foreground">{g.budget}M</span>
                        <Badge className={g.change > 0 ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}>
                          {g.change > 0 ? "+" : ""}{g.change}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="pricing" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-primary" /> דפוסי תמחור מתחרים לפי סוג פרויקט
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 font-semibold text-muted-foreground">סוג פרויקט</th>
                      <th className="p-3 text-center font-semibold text-primary">המחיר שלנו</th>
                      <th className="p-3 text-center font-semibold text-muted-foreground">ממוצע שוק</th>
                      <th className="p-3 text-center font-semibold text-muted-foreground">מתחרה זול</th>
                      <th className="p-3 text-center font-semibold text-muted-foreground">מתחרה יקר</th>
                      <th className="p-3 text-center font-semibold text-muted-foreground">מכרזים/שנה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricingPatterns.map(p => {
                      const diff = p.ourAvg - p.marketAvg;
                      return (
                        <tr key={p.type} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="p-3 font-medium text-foreground">{p.type}</td>
                          <td className="p-3 text-center bg-primary/5">
                            <span className="font-bold text-primary">{p.ourAvg}</span>
                            <span className={`text-xs mr-1 ${diff < 0 ? "text-green-400" : "text-red-400"}`}>
                              ({diff > 0 ? "+" : ""}{diff})
                            </span>
                          </td>
                          <td className="p-3 text-center text-foreground">{p.marketAvg}</td>
                          <td className="p-3 text-center text-green-400 font-medium">{p.low}</td>
                          <td className="p-3 text-center text-red-400 font-medium">{p.high}</td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-foreground">{p.volume}</span>
                              <Progress value={p.volume / 42 * 100} className="h-2 w-16" />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { color: "green", title: "יתרון תמחור", desc: "בממוצע, המחירים שלנו נמוכים ב-4% מממוצע השוק בפרויקטי מגורים ותעשייה" },
              { color: "amber", title: "נקודת תשומת לב", desc: "בפרויקטי שיפוץ ושימור המחירים שלנו גבוהים ב-5% מהממוצע - שקלו הפחתה" },
              { color: "blue", title: "הזדמנות", desc: "שוק מוסדות ציבוריים: 18 מכרזים/שנה עם פער מחיר נמוך של 3% - פוטנציאל גבוה" },
            ].map(s => (
              <Card key={s.title} className={`bg-${s.color}-500/5 border-${s.color}-500/20`}>
                <CardContent className="p-4">
                  <div className={`font-bold text-${s.color}-400 mb-1`}>{s.title}</div>
                  <div className="text-sm text-muted-foreground">{s.desc}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}