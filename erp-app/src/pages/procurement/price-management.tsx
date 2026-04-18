import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  DollarSign, TrendingUp, TrendingDown, FileText, ShieldCheck,
  Clock, BarChart3, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Minus, Users, RefreshCw, Target
} from "lucide-react";

const API = "/api";

const fmt = (v: number) => new Intl.NumberFormat("he-IL").format(v);
const fmtCurrency = (v: number) => "\u20AA" + fmt(v);

// ============================================================
// MOCK DATA
// ============================================================
const FALLBACK_PRICE_COMPARISONS = [
  { item: "פרופיל אלומיניום 100mm", unit: "מ' רץ", supplier1: { name: "Alumil SA", price: 48.5 }, supplier2: { name: "Schüco International", price: 52.0 }, supplier3: { name: "אלומיניום הגליל", price: 45.8 }, best: 45.8, savings: 6.2 },
  { item: "זכוכית מחוסמת 8mm", unit: "מ\"ר", supplier1: { name: "Foshan Glass Co.", price: 185.0 }, supplier2: { name: "זכוכית ירושלים", price: 210.0 }, supplier3: { name: "AGC Glass", price: 178.0 }, best: 178.0, savings: 32.0 },
  { item: 'ברזל T-45', unit: "ק\"ג", supplier1: { name: "מפעלי ברזל השרון", price: 12.3 }, supplier2: { name: "ברזל צפון", price: 13.1 }, supplier3: { name: "Metalcorp EU", price: 11.8 }, best: 11.8, savings: 1.3 },
  { item: "אטם EPDM", unit: "מ' רץ", supplier1: { name: "Tremco Illbruck", price: 8.9 }, supplier2: { name: "אטמים בע\"מ", price: 9.5 }, supplier3: { name: "Sika AG", price: 8.2 }, best: 8.2, savings: 1.3 },
  { item: "בורג נירוסטה M8x40", unit: "יחידה", supplier1: { name: "Würth", price: 1.85 }, supplier2: { name: "בורגים ישראל", price: 2.10 }, supplier3: { name: "Hilti", price: 1.95 }, best: 1.85, savings: 0.25 },
  { item: "פח אלומיניום 2mm", unit: "מ\"ר", supplier1: { name: "Alumil SA", price: 95.0 }, supplier2: { name: "אלומיניום הגליל", price: 89.5 }, supplier3: { name: "Novelis", price: 92.0 }, best: 89.5, savings: 5.5 },
];

const FALLBACK_PRICE_AGREEMENTS = [
  { id: "PA-2026-001", supplier: "Alumil SA", items: "פרופילי אלומיניום (32 פריטים)", validFrom: "2026-01-01", validTo: "2026-12-31", discount: 12.0, status: "active" },
  { id: "PA-2026-002", supplier: "Foshan Glass Co.", items: "זכוכיות מחוסמות (18 פריטים)", validFrom: "2026-01-01", validTo: "2026-06-30", discount: 8.5, status: "expiring" },
  { id: "PA-2025-014", supplier: "מפעלי ברזל השרון", items: "ברזל וצינורות (45 פריטים)", validFrom: "2025-07-01", validTo: "2026-03-31", discount: 10.0, status: "expired" },
  { id: "PA-2026-003", supplier: "Schüco International", items: "מערכות חלונות (12 פריטים)", validFrom: "2026-03-01", validTo: "2027-02-28", discount: 15.0, status: "active" },
  { id: "PA-2026-004", supplier: "Tremco Illbruck", items: "אטמים וחומרי איטום (28 פריטים)", validFrom: "2026-02-01", validTo: "2026-08-31", discount: 7.0, status: "active" },
  { id: "PA-2026-005", supplier: "Würth", items: "ברגים ומחברים (120 פריטים)", validFrom: "2026-01-15", validTo: "2026-07-15", discount: 18.0, status: "expiring" },
];

const FALLBACK_PRICE_HISTORY = [
  { item: "פרופיל אלומיניום 100mm", supplier: "Alumil SA", prices: [{ date: "2025-10", price: 52.0 }, { date: "2025-12", price: 50.5 }, { date: "2026-01", price: 48.5 }, { date: "2026-04", price: 48.5 }], trend: "down" },
  { item: "זכוכית מחוסמת 8mm", supplier: "Foshan Glass Co.", prices: [{ date: "2025-10", price: 170.0 }, { date: "2025-12", price: 175.0 }, { date: "2026-01", price: 180.0 }, { date: "2026-04", price: 185.0 }], trend: "up" },
  { item: 'ברזל T-45', supplier: "מפעלי ברזל השרון", prices: [{ date: "2025-10", price: 12.8 }, { date: "2025-12", price: 12.5 }, { date: "2026-01", price: 12.3 }, { date: "2026-04", price: 12.3 }], trend: "down" },
  { item: "אטם EPDM", supplier: "Tremco Illbruck", prices: [{ date: "2025-10", price: 8.9 }, { date: "2025-12", price: 8.9 }, { date: "2026-01", price: 8.9 }, { date: "2026-04", price: 8.9 }], trend: "stable" },
  { item: "בורג נירוסטה M8x40", supplier: "Würth", prices: [{ date: "2025-10", price: 1.70 }, { date: "2025-12", price: 1.75 }, { date: "2026-01", price: 1.80 }, { date: "2026-04", price: 1.85 }], trend: "up" },
  { item: "פח אלומיניום 2mm", supplier: "Alumil SA", prices: [{ date: "2025-10", price: 98.0 }, { date: "2025-12", price: 97.0 }, { date: "2026-01", price: 95.0 }, { date: "2026-04", price: 95.0 }], trend: "down" },
];

const FALLBACK_PRICE_VARIANCES = [
  { po: "PO-000458", item: "זכוכית מחוסמת 8mm", supplier: "Foshan Glass Co.", agreedPrice: 178.0, actualPrice: 185.0, variance: 3.9, impact: 4200, date: "2026-04-08" },
  { po: "PO-000452", item: "פרופיל אלומיניום 100mm", supplier: "אלומיניום הגליל", agreedPrice: 45.8, actualPrice: 48.0, variance: 4.8, impact: 2640, date: "2026-04-03" },
  { po: "PO-000449", item: "אטם EPDM", supplier: "Sika AG", agreedPrice: 8.2, actualPrice: 8.9, variance: 8.5, impact: 1400, date: "2026-03-28" },
  { po: "PO-000445", item: 'ברזל T-45', supplier: "Metalcorp EU", agreedPrice: 11.8, actualPrice: 12.5, variance: 5.9, impact: 3500, date: "2026-03-22" },
  { po: "PO-000441", item: "בורג נירוסטה M8x40", supplier: "Hilti", agreedPrice: 1.95, actualPrice: 2.15, variance: 10.3, impact: 800, date: "2026-03-18" },
];

const kpis = [
  { label: "הסכמי מחיר פעילים", value: "4", icon: FileText, color: "from-blue-600 to-blue-800" },
  { label: "סטיית מחיר ממוצעת", value: "4.8%", icon: BarChart3, color: "from-amber-600 to-amber-800" },
  { label: "חיסכון רבעוני", value: fmtCurrency(142000), icon: Target, color: "from-emerald-600 to-emerald-800" },
  { label: "פריטים מתחת ליעד", value: "3", icon: AlertTriangle, color: "from-red-600 to-red-800" },
  { label: "ספקים בהשוואה", value: "18", icon: Users, color: "from-purple-600 to-purple-800" },
  { label: "עדכון מחירים אחרון", value: "08/04/2026", icon: RefreshCw, color: "from-cyan-600 to-cyan-800" },
];

const statusMap: Record<string, { label: string; className: string }> = {
  active:   { label: "פעיל",    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  expiring: { label: "פג בקרוב", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  expired:  { label: "פג תוקף", className: "bg-red-500/20 text-red-400 border-red-500/30" },
};

const TrendIcon = ({ trend }: { trend: string }) => {
  if (trend === "up") return <ArrowUpRight className="w-4 h-4 text-red-400" />;
  if (trend === "down") return <ArrowDownRight className="w-4 h-4 text-emerald-400" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
};

export default function PriceManagement() {
  const [activeTab, setActiveTab] = useState("comparison");

  const { data: apiData } = useQuery({
    queryKey: ["procurement-price-management"],
    queryFn: async () => {
      const res = await authFetch(`${API}/procurement/price-management`);
      if (!res.ok) throw new Error("Failed to fetch price management");
      return res.json();
    },
  });

  const priceComparisons = apiData?.priceComparisons ?? FALLBACK_PRICE_COMPARISONS;
  const priceAgreements = apiData?.priceAgreements ?? FALLBACK_PRICE_AGREEMENTS;
  const priceHistory = apiData?.priceHistory ?? FALLBACK_PRICE_HISTORY;
  const priceVariances = apiData?.priceVariances ?? FALLBACK_PRICE_VARIANCES;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-600/20">
          <DollarSign className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">ניהול מחירים ואופטימיזציה</h1>
          <p className="text-sm text-gray-400">השוואת מחירים, הסכמים, היסטוריה וחריגות &mdash; טכנו-כל עוזי</p>
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
          <TabsTrigger value="comparison" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-sm">
            השוואת מחירים
          </TabsTrigger>
          <TabsTrigger value="agreements" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-sm">
            הסכמי מחיר
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-sm">
            היסטוריית מחירים
          </TabsTrigger>
          <TabsTrigger value="variances" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-sm">
            חריגות
          </TabsTrigger>
        </TabsList>

        {/* ===== Tab 1: Price Comparison ===== */}
        <TabsContent value="comparison">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                השוואת מחירים בין ספקים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-gray-300">פריט</TableHead>
                    <TableHead className="text-right text-gray-300">יחידה</TableHead>
                    <TableHead className="text-right text-gray-300">ספק 1</TableHead>
                    <TableHead className="text-right text-gray-300">ספק 2</TableHead>
                    <TableHead className="text-right text-gray-300">ספק 3</TableHead>
                    <TableHead className="text-right text-gray-300">מחיר הטוב ביותר</TableHead>
                    <TableHead className="text-right text-gray-300">פוטנציאל חיסכון</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceComparisons.map((row, idx) => (
                    <TableRow key={idx} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="text-foreground font-medium">{row.item}</TableCell>
                      <TableCell className="text-gray-400">{row.unit}</TableCell>
                      <TableCell className="text-gray-300">
                        <div className="flex flex-col">
                          <span className={row.supplier1.price === row.best ? "text-emerald-400 font-semibold" : ""}>
                            {fmtCurrency(row.supplier1.price)}
                          </span>
                          <span className="text-xs text-gray-500">{row.supplier1.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-300">
                        <div className="flex flex-col">
                          <span className={row.supplier2.price === row.best ? "text-emerald-400 font-semibold" : ""}>
                            {fmtCurrency(row.supplier2.price)}
                          </span>
                          <span className="text-xs text-gray-500">{row.supplier2.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-300">
                        <div className="flex flex-col">
                          <span className={row.supplier3.price === row.best ? "text-emerald-400 font-semibold" : ""}>
                            {fmtCurrency(row.supplier3.price)}
                          </span>
                          <span className="text-xs text-gray-500">{row.supplier3.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-emerald-400 font-bold">{fmtCurrency(row.best)}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {fmtCurrency(row.savings)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Tab 2: Price Agreements ===== */}
        <TabsContent value="agreements">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-purple-400" />
                הסכמי מחיר עם ספקים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-gray-300">מס' הסכם</TableHead>
                    <TableHead className="text-right text-gray-300">ספק</TableHead>
                    <TableHead className="text-right text-gray-300">פריטים</TableHead>
                    <TableHead className="text-right text-gray-300">תוקף מ-</TableHead>
                    <TableHead className="text-right text-gray-300">תוקף עד</TableHead>
                    <TableHead className="text-right text-gray-300">הנחה %</TableHead>
                    <TableHead className="text-right text-gray-300">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceAgreements.map((row, idx) => {
                    const st = statusMap[row.status] || { label: row.status, className: "bg-gray-500/20 text-gray-400" };
                    return (
                      <TableRow key={idx} className="border-slate-700/50 hover:bg-slate-700/30">
                        <TableCell className="text-blue-400 font-mono text-sm">{row.id}</TableCell>
                        <TableCell className="text-foreground font-medium">{row.supplier}</TableCell>
                        <TableCell className="text-gray-300 text-sm">{row.items}</TableCell>
                        <TableCell className="text-gray-400 text-sm">{row.validFrom}</TableCell>
                        <TableCell className="text-gray-400 text-sm">{row.validTo}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={row.discount} max={20} className="w-16 h-2" />
                            <span className="text-foreground font-semibold">{row.discount}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${st.className} border text-xs`}>{st.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Tab 3: Price History ===== */}
        <TabsContent value="history">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Clock className="w-5 h-5 text-cyan-400" />
                היסטוריית מחירים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-gray-300">פריט</TableHead>
                    <TableHead className="text-right text-gray-300">ספק</TableHead>
                    {["10/2025", "12/2025", "01/2026", "04/2026"].map(d => (
                      <TableHead key={d} className="text-right text-gray-300">{d}</TableHead>
                    ))}
                    <TableHead className="text-right text-gray-300">שינוי %</TableHead>
                    <TableHead className="text-right text-gray-300">מגמה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceHistory.map((row, idx) => {
                    const first = row.prices[0].price;
                    const last = row.prices[row.prices.length - 1].price;
                    const changePct = ((last - first) / first * 100).toFixed(1);
                    const changePositive = last > first;
                    return (
                      <TableRow key={idx} className="border-slate-700/50 hover:bg-slate-700/30">
                        <TableCell className="text-foreground font-medium">{row.item}</TableCell>
                        <TableCell className="text-gray-400 text-sm">{row.supplier}</TableCell>
                        {row.prices.map((p, pi) => {
                          const prev = pi > 0 ? row.prices[pi - 1].price : p.price;
                          const isUp = p.price > prev;
                          const isDown = p.price < prev;
                          return (
                            <TableCell key={pi} className="text-sm">
                              <span className={isUp ? "text-red-400" : isDown ? "text-emerald-400" : "text-gray-300"}>
                                {fmtCurrency(p.price)}
                              </span>
                            </TableCell>
                          );
                        })}
                        <TableCell>
                          <span className={changePositive ? "text-red-400 font-semibold" : "text-emerald-400 font-semibold"}>
                            {changePositive ? "+" : ""}{changePct}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <TrendIcon trend={row.trend} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Tab 4: Price Variances ===== */}
        <TabsContent value="variances">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                חריגות מחיר
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-gray-300">הזמנה</TableHead>
                    <TableHead className="text-right text-gray-300">פריט</TableHead>
                    <TableHead className="text-right text-gray-300">ספק</TableHead>
                    <TableHead className="text-right text-gray-300">מחיר מוסכם</TableHead>
                    <TableHead className="text-right text-gray-300">מחיר בפועל</TableHead>
                    <TableHead className="text-right text-gray-300">סטייה %</TableHead>
                    <TableHead className="text-right text-gray-300">השפעה</TableHead>
                    <TableHead className="text-right text-gray-300">תאריך</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceVariances.map((row, idx) => {
                    const severityClass = row.variance > 8 ? "bg-red-500/20 text-red-400 border-red-500/30"
                      : row.variance > 5 ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                      : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
                    return (
                      <TableRow key={idx} className="border-slate-700/50 hover:bg-slate-700/30">
                        <TableCell className="text-blue-400 font-mono text-sm">{row.po}</TableCell>
                        <TableCell className="text-foreground font-medium">{row.item}</TableCell>
                        <TableCell className="text-gray-400 text-sm">{row.supplier}</TableCell>
                        <TableCell className="text-gray-300">{fmtCurrency(row.agreedPrice)}</TableCell>
                        <TableCell className="text-red-400 font-semibold">{fmtCurrency(row.actualPrice)}</TableCell>
                        <TableCell>
                          <Badge className={`${severityClass} border text-xs`}>
                            +{row.variance}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-red-400 font-semibold">{fmtCurrency(row.impact)}</TableCell>
                        <TableCell className="text-gray-400 text-sm">{row.date}</TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Summary row */}
                  <TableRow className="border-slate-700 bg-slate-700/20">
                    <TableCell colSpan={5} className="text-foreground font-bold text-left">סה"כ השפעת חריגות</TableCell>
                    <TableCell>
                      <Badge className="bg-red-500/20 text-red-400 border border-red-500/30">
                        {(priceVariances.reduce((s, r) => s + r.variance, 0) / priceVariances.length).toFixed(1)}% ממוצע
                      </Badge>
                    </TableCell>
                    <TableCell className="text-red-400 font-bold">
                      {fmtCurrency(priceVariances.reduce((s, r) => s + r.impact, 0))}
                    </TableCell>
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
