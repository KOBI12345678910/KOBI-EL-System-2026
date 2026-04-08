import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Globe, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Minus, DollarSign, BarChart3, Activity, RefreshCw,
} from "lucide-react";

const fmt = (v: number) => new Intl.NumberFormat("he-IL").format(v);
const fmtUsd = (v: number) => "$" + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const fmtIls = (v: number) => "\u20AA" + new Intl.NumberFormat("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const fmtEur = (v: number) => "\u20AC" + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const fmtPct = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%";

// ============================================================
// SUBMODULE: steel_index
// ============================================================
const FALLBACK_STEEL_INDEX = [
  { date: "2026-04-08", lme: 3820, local: 4250, avgCost: 4100, is_price_above_market: false, is_good_deal: true },
  { date: "2026-04-01", lme: 3790, local: 4220, avgCost: 4100, is_price_above_market: false, is_good_deal: true },
  { date: "2026-03-25", lme: 3850, local: 4310, avgCost: 4100, is_price_above_market: true, is_good_deal: false },
  { date: "2026-03-18", lme: 3910, local: 4380, avgCost: 4100, is_price_above_market: true, is_good_deal: false },
  { date: "2026-03-11", lme: 3870, local: 4340, avgCost: 4100, is_price_above_market: true, is_good_deal: false },
  { date: "2026-03-04", lme: 3830, local: 4260, avgCost: 4100, is_price_above_market: true, is_good_deal: false },
  { date: "2026-02-25", lme: 3780, local: 4190, avgCost: 4100, is_price_above_market: false, is_good_deal: true },
  { date: "2026-02-18", lme: 3750, local: 4150, avgCost: 4100, is_price_above_market: false, is_good_deal: true },
];

// ============================================================
// SUBMODULE: aluminum_index
// ============================================================
const FALLBACK_ALUMINUM_INDEX = [
  { date: "2026-04-08", lme: 2480, local: 2850, avgCost: 2780, is_price_above_market: false, is_good_deal: true },
  { date: "2026-04-01", lme: 2510, local: 2890, avgCost: 2780, is_price_above_market: true, is_good_deal: false },
  { date: "2026-03-25", lme: 2540, local: 2930, avgCost: 2780, is_price_above_market: true, is_good_deal: false },
  { date: "2026-03-18", lme: 2490, local: 2860, avgCost: 2780, is_price_above_market: true, is_good_deal: false },
  { date: "2026-03-11", lme: 2460, local: 2820, avgCost: 2780, is_price_above_market: false, is_good_deal: true },
  { date: "2026-03-04", lme: 2430, local: 2790, avgCost: 2780, is_price_above_market: false, is_good_deal: true },
  { date: "2026-02-25", lme: 2410, local: 2760, avgCost: 2780, is_price_above_market: false, is_good_deal: true },
  { date: "2026-02-18", lme: 2380, local: 2720, avgCost: 2780, is_price_above_market: false, is_good_deal: true },
];

// ============================================================
// SUBMODULE: currency_rates
// ============================================================
const FALLBACK_CURRENCY_RATES = [
  { currency: "USD/ILS", symbol: "$", rate: 3.62, prevRate: 3.59, dailyChange: +0.83, weeklyChange: +1.12 },
  { currency: "EUR/ILS", symbol: "\u20AC", rate: 3.98, prevRate: 3.95, dailyChange: +0.76, weeklyChange: +0.95 },
  { currency: "CNY/ILS", symbol: "\u00A5", rate: 0.498, prevRate: 0.501, dailyChange: -0.60, weeklyChange: -0.42 },
  { currency: "GBP/ILS", symbol: "\u00A3", rate: 4.58, prevRate: 4.55, dailyChange: +0.66, weeklyChange: +0.88 },
  { currency: "JPY/ILS", symbol: "\u00A5", rate: 0.0242, prevRate: 0.0240, dailyChange: +0.83, weeklyChange: +0.71 },
  { currency: "CHF/ILS", symbol: "CHF", rate: 4.12, prevRate: 4.10, dailyChange: +0.49, weeklyChange: +0.62 },
];

// ============================================================
// SUBMODULE: commodity_trends
// ============================================================
const FALLBACK_COMMODITY_TRENDS = [
  { commodity: "פלדה HRC", unit: "$/ton", m6: 3420, m5: 3510, m4: 3590, m3: 3680, m2: 3780, m1: 3820, direction: "up", change: +11.7 },
  { commodity: "אלומיניום LME", unit: "$/ton", m6: 2290, m5: 2330, m4: 2380, m3: 2430, m2: 2460, m1: 2480, direction: "up", change: +8.3 },
  { commodity: "נחושת LME", unit: "$/ton", m6: 8750, m5: 8820, m4: 8900, m3: 8950, m2: 9010, m1: 9080, direction: "up", change: +3.8 },
  { commodity: "אבץ LME", unit: "$/ton", m6: 2640, m5: 2580, m4: 2520, m3: 2490, m2: 2470, m1: 2450, direction: "down", change: -7.2 },
  { commodity: "ניקל LME", unit: "$/ton", m6: 16200, m5: 16400, m4: 16100, m3: 15800, m2: 15600, m1: 15500, direction: "down", change: -4.3 },
  { commodity: "נפט ברנט", unit: "$/barrel", m6: 78.5, m5: 77.2, m4: 76.8, m3: 77.1, m2: 76.5, m1: 75.9, direction: "down", change: -3.3 },
  { commodity: "גז טבעי EU", unit: "\u20AC/MWh", m6: 28.4, m5: 30.1, m4: 31.5, m3: 29.8, m2: 28.9, m1: 27.6, direction: "down", change: -2.8 },
  { commodity: "פוליאתילן HDPE", unit: "$/ton", m6: 1120, m5: 1150, m4: 1180, m3: 1200, m2: 1210, m1: 1230, direction: "up", change: +9.8 },
];

const months = ["נוב", "דצמ", "ינו", "פבר", "מרץ", "אפר"];

const FALLBACK_KPIS = [
  { label: "מדד פלדה", value: "$3,820/ton", icon: BarChart3, color: "from-blue-600 to-blue-800" },
  { label: "מדד אלומיניום", value: "$2,480/ton", icon: Activity, color: "from-cyan-600 to-cyan-800" },
  { label: "שער USD/ILS", value: "3.62", icon: DollarSign, color: "from-emerald-600 to-emerald-800" },
  { label: "שער EUR/ILS", value: "3.98", icon: DollarSign, color: "from-purple-600 to-purple-800" },
  { label: "שינוי חודשי", value: "+2.4%", icon: TrendingUp, color: "from-amber-600 to-amber-800" },
  { label: "מגמת שוק", value: "עלייה", icon: RefreshCw, color: "from-red-600 to-red-800" },
];

const DealBadge = ({ isGood }: { isGood: boolean }) => (
  <Badge className={isGood
    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
    : "bg-red-500/20 text-red-400 border border-red-500/30"
  }>
    {isGood ? "עסקה טובה" : "מעל השוק"}
  </Badge>
);

const DirectionIcon = ({ dir }: { dir: string }) => {
  if (dir === "up") return <ArrowUpRight className="w-4 h-4 text-red-400" />;
  if (dir === "down") return <ArrowDownRight className="w-4 h-4 text-emerald-400" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
};

export default function MarketPriceTracking() {
  const { data: marketpricetrackingData } = useQuery({
    queryKey: ["market-price-tracking"],
    queryFn: () => authFetch("/api/procurement/market_price_tracking"),
    staleTime: 5 * 60 * 1000,
  });

  const steelIndex = marketpricetrackingData ?? FALLBACK_STEEL_INDEX;

  const [activeTab, setActiveTab] = useState("steel");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-600/20">
          <Globe className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">מדדי שוק ומחירי סחורות</h1>
          <p className="text-sm text-gray-400">מעקב מחירי סחורות, מטבעות ומגמות שוק &mdash; טכנו-כל עוזי</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((k, i) => (
          <div key={i} className={`rounded-xl bg-gradient-to-br ${k.color} p-4 border border-white/10`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-foreground/70">{k.label}</div>
                <div className="text-xl font-bold text-foreground mt-1">{k.value}</div>
              </div>
              <k.icon className="w-7 h-7 text-foreground/30" />
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-800/50 border border-slate-700 p-1">
          <TabsTrigger value="steel" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-sm">
            פלדה
          </TabsTrigger>
          <TabsTrigger value="aluminum" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-sm">
            אלומיניום
          </TabsTrigger>
          <TabsTrigger value="currency" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-sm">
            מטבעות
          </TabsTrigger>
          <TabsTrigger value="trends" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-sm">
            מגמות
          </TabsTrigger>
        </TabsList>

        {/* ===== Tab 1: Steel Index ===== */}
        <TabsContent value="steel">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                מדד מחיר פלדה &mdash; LME ומחיר מקומי
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-gray-300">תאריך</TableHead>
                    <TableHead className="text-right text-gray-300">מחיר LME ($/ton)</TableHead>
                    <TableHead className="text-right text-gray-300">מחיר מקומי ($/ton)</TableHead>
                    <TableHead className="text-right text-gray-300">עלות ממוצעת שלך</TableHead>
                    <TableHead className="text-right text-gray-300">פער %</TableHead>
                    <TableHead className="text-right text-gray-300">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {steelIndex.map((row, idx) => {
                    const gap = ((row.avgCost - row.local) / row.local * 100);
                    return (
                      <TableRow key={idx} className="border-slate-700/50 hover:bg-slate-700/30">
                        <TableCell className="text-foreground font-medium">{row.date}</TableCell>
                        <TableCell className="text-gray-300">{fmtUsd(row.lme)}</TableCell>
                        <TableCell className="text-gray-300">{fmtUsd(row.local)}</TableCell>
                        <TableCell className="text-gray-300">{fmtUsd(row.avgCost)}</TableCell>
                        <TableCell className={gap < 0 ? "text-emerald-400" : "text-red-400"}>
                          {fmtPct(gap)}
                        </TableCell>
                        <TableCell><DealBadge isGood={row.is_good_deal} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
                <Activity className="w-4 h-4" />
                <span>מדד פלדה עולה ב-8 שבועות אחרונים. מומלץ לבחון נעילת מחיר עם ספקים.</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Tab 2: Aluminum Index ===== */}
        <TabsContent value="aluminum">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-cyan-400" />
                מדד מחיר אלומיניום &mdash; LME ומחיר מקומי
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-gray-300">תאריך</TableHead>
                    <TableHead className="text-right text-gray-300">מחיר LME ($/ton)</TableHead>
                    <TableHead className="text-right text-gray-300">מחיר מקומי ($/ton)</TableHead>
                    <TableHead className="text-right text-gray-300">עלות ממוצעת שלך</TableHead>
                    <TableHead className="text-right text-gray-300">פער %</TableHead>
                    <TableHead className="text-right text-gray-300">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aluminumIndex.map((row, idx) => {
                    const gap = ((row.avgCost - row.local) / row.local * 100);
                    return (
                      <TableRow key={idx} className="border-slate-700/50 hover:bg-slate-700/30">
                        <TableCell className="text-foreground font-medium">{row.date}</TableCell>
                        <TableCell className="text-gray-300">{fmtUsd(row.lme)}</TableCell>
                        <TableCell className="text-gray-300">{fmtUsd(row.local)}</TableCell>
                        <TableCell className="text-gray-300">{fmtUsd(row.avgCost)}</TableCell>
                        <TableCell className={gap < 0 ? "text-emerald-400" : "text-red-400"}>
                          {fmtPct(gap)}
                        </TableCell>
                        <TableCell><DealBadge isGood={row.is_good_deal} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
                <Activity className="w-4 h-4" />
                <span>אלומיניום במגמת עלייה מתונה. העלות הממוצעת שלך תחרותית ברוב התקופה.</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Tab 3: Currency Rates ===== */}
        <TabsContent value="currency">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                שערי מטבעות חיים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-gray-300">צמד מטבעות</TableHead>
                    <TableHead className="text-right text-gray-300">שער נוכחי</TableHead>
                    <TableHead className="text-right text-gray-300">שער קודם</TableHead>
                    <TableHead className="text-right text-gray-300">שינוי יומי</TableHead>
                    <TableHead className="text-right text-gray-300">שינוי שבועי</TableHead>
                    <TableHead className="text-right text-gray-300">מגמה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currencyRates.map((row, idx) => (
                    <TableRow key={idx} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="text-foreground font-medium">{row.currency}</TableCell>
                      <TableCell className="text-gray-300 font-mono">{fmtIls(row.rate)}</TableCell>
                      <TableCell className="text-gray-400 font-mono">{fmtIls(row.prevRate)}</TableCell>
                      <TableCell className={row.dailyChange >= 0 ? "text-red-400" : "text-emerald-400"}>
                        <span className="flex items-center gap-1">
                          {row.dailyChange >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {fmtPct(row.dailyChange)}
                        </span>
                      </TableCell>
                      <TableCell className={row.weeklyChange >= 0 ? "text-red-400" : "text-emerald-400"}>
                        {fmtPct(row.weeklyChange)}
                      </TableCell>
                      <TableCell>
                        <Badge className={row.dailyChange >= 0
                          ? "bg-red-500/20 text-red-400 border border-red-500/30"
                          : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        }>
                          {row.dailyChange >= 0 ? "שקל נחלש" : "שקל מתחזק"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
                <Activity className="w-4 h-4" />
                <span>השקל נחלש מול רוב המטבעות. רכש במט&quot;ח יקר יותר &mdash; שקלו גידור.</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Tab 4: Commodity Trends ===== */}
        <TabsContent value="trends">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-amber-400" />
                מגמות סחורות &mdash; 6 חודשים אחרונים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-gray-300">סחורה</TableHead>
                    <TableHead className="text-right text-gray-300">יחידה</TableHead>
                    {months.map((m, i) => (
                      <TableHead key={i} className="text-right text-gray-300">{m}</TableHead>
                    ))}
                    <TableHead className="text-right text-gray-300">שינוי 6 חד'</TableHead>
                    <TableHead className="text-right text-gray-300">כיוון</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commodityTrends.map((row, idx) => {
                    const vals = [row.m6, row.m5, row.m4, row.m3, row.m2, row.m1];
                    return (
                      <TableRow key={idx} className="border-slate-700/50 hover:bg-slate-700/30">
                        <TableCell className="text-foreground font-medium">{row.commodity}</TableCell>
                        <TableCell className="text-gray-400 text-xs">{row.unit}</TableCell>
                        {vals.map((v, vi) => (
                          <TableCell key={vi} className="text-gray-300 font-mono text-sm">
                            {fmt(v)}
                          </TableCell>
                        ))}
                        <TableCell className={row.change >= 0 ? "text-red-400 font-semibold" : "text-emerald-400 font-semibold"}>
                          {fmtPct(row.change)}
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1">
                            <DirectionIcon dir={row.direction} />
                            <span className={row.direction === "up" ? "text-red-400 text-sm" : "text-emerald-400 text-sm"}>
                              {row.direction === "up" ? "עלייה" : "ירידה"}
                            </span>
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                  <div className="text-sm font-semibold text-red-400 mb-1">סחורות בעלייה</div>
                  <div className="text-xs text-gray-400">
                    פלדה (+11.7%), HDPE (+9.8%), אלומיניום (+8.3%), נחושת (+3.8%) &mdash; מומלץ לנעול מחירים
                  </div>
                </div>
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                  <div className="text-sm font-semibold text-emerald-400 mb-1">סחורות בירידה</div>
                  <div className="text-xs text-gray-400">
                    אבץ (-7.2%), ניקל (-4.3%), נפט (-3.3%), גז טבעי (-2.8%) &mdash; הזדמנות לרכש
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}