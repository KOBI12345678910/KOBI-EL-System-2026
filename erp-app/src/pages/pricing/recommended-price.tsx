import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Target, TrendingUp, TrendingDown, ShieldCheck, AlertTriangle,
  CheckCircle2, Clock, DollarSign, BarChart3, Layers, ArrowDown,
  ArrowRight, Info, FileText, User, Calendar
} from "lucide-react";

const fmt = (v: number) => "₪" + v.toLocaleString("he-IL");
const pct = (v: number) => v.toFixed(1) + "%";

const FALLBACK_COST_BREAKDOWN = [
  { label: "חומרי גלם", amount: 42800, pctOfTotal: 28.5, color: "bg-blue-500" },
  { label: "יבוא ומכס", amount: 8900, pctOfTotal: 5.9, color: "bg-cyan-500" },
  { label: "ייצור", amount: 38200, pctOfTotal: 25.4, color: "bg-violet-500" },
  { label: "גימור וציפוי", amount: 18500, pctOfTotal: 12.3, color: "bg-pink-500" },
  { label: "לוגיסטיקה", amount: 7600, pctOfTotal: 5.1, color: "bg-amber-500" },
  { label: "תקורה כללית", amount: 22400, pctOfTotal: 14.9, color: "bg-slate-400" },
  { label: "רזרבת סיכון", amount: 11800, pctOfTotal: 7.9, color: "bg-red-400" },
];
const totalCost = FALLBACK_COST_BREAKDOWN.reduce((s, c) => s + c.amount, 0);

const FALLBACK_PRICE_CARDS = [
  { title: "מחיר רצפה (מינימום)", price: 168500, margin: 11.8, profit: 18300, icon: ArrowDown, color: "from-red-600/30 to-red-900/10 border-red-500/30", textColor: "text-red-400" },
  { title: "מחיר יעד", price: 187000, margin: 24.4, profit: 36800, icon: Target, color: "from-amber-600/30 to-amber-900/10 border-amber-500/30", textColor: "text-amber-400" },
  { title: "מחיר מומלץ", price: 198500, margin: 32.1, profit: 48300, icon: TrendingUp, color: "from-emerald-600/30 to-emerald-900/10 border-emerald-500/30", textColor: "text-emerald-400" },
];

const FALLBACK_SENSITIVITY_ROWS = [
  { scenario: "בסיס (ללא שינוי)", costDelta: 0, newCost: totalCost, price: 198500, margin: 32.1, profit: 48300, status: "ok" },
  { scenario: "עלייה של 5%", costDelta: 5, newCost: Math.round(totalCost * 1.05), price: 198500, margin: 27.3, profit: 41190, status: "ok" },
  { scenario: "עלייה של 10%", costDelta: 10, newCost: Math.round(totalCost * 1.10), price: 198500, margin: 22.2, profit: 33780, status: "warning" },
  { scenario: "עלייה של 15%", costDelta: 15, newCost: Math.round(totalCost * 1.15), price: 198500, margin: 16.8, profit: 26070, status: "warning" },
  { scenario: "עלייה של 20%", costDelta: 20, newCost: Math.round(totalCost * 1.20), price: 198500, margin: 11.0, profit: 18060, status: "danger" },
];

const FALLBACK_PAST_PROJECTS = [
  { id: "PRJ-0982", name: "שער כניסה Deluxe", client: "נכסי אריאל", cost: 138200, price: 179000, margin: 22.8, date: "2025-11" },
  { id: "PRJ-1011", name: "שער Premium חשמלי", client: "קבוצת רמות", cost: 155400, price: 205000, margin: 24.2, date: "2025-12" },
  { id: "PRJ-1023", name: "שער כניסה מעוצב", client: "גולדן הום", cost: 128700, price: 168000, margin: 23.4, date: "2026-01" },
  { id: "PRJ-1035", name: "שער Premium כפול", client: "אחוזת השרון", cost: 162300, price: 214000, margin: 24.1, date: "2026-02" },
  { id: "PRJ-1041", name: "שער אלומיניום Premium", client: "נדל\"ן פלוס", cost: 144900, price: 191000, margin: 24.1, date: "2026-03" },
];

const FALLBACK_DISCOUNT_GUARDRAILS = [
  { label: "הנחה מקסימלית מותרת", value: "12%", detail: "עד ₪23,820 ממחיר המומלץ", icon: ShieldCheck, color: "text-blue-400" },
  { label: "מרווח מינימלי (התראה)", value: "15%", detail: "מתחת ל-15% — נדרש אישור מנהל", icon: AlertTriangle, color: "text-amber-400" },
  { label: "חריגה ללקוח אסטרטגי", value: "אושר", detail: "קבוצת אלון — לקוח אסטרטגי, הנחה עד 18%", icon: CheckCircle2, color: "text-emerald-400" },
];

export default function RecommendedPrice() {

  const { data: apiData } = useQuery({
    queryKey: ["recommended_price"],
    queryFn: () => authFetch("/api/pricing/recommended-price").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const costBreakdown = apiData?.costBreakdown ?? FALLBACK_COST_BREAKDOWN;
  const priceCards = apiData?.priceCards ?? FALLBACK_PRICE_CARDS;
  const sensitivityRows = apiData?.sensitivityRows ?? FALLBACK_SENSITIVITY_ROWS;
  const pastProjects = apiData?.pastProjects ?? FALLBACK_PAST_PROJECTS;
  const discountGuardrails = apiData?.discountGuardrails ?? FALLBACK_DISCOUNT_GUARDRAILS;
  const [tab, setTab] = useState("recommended");

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Target className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">מחיר מומלץ וניתוח מרווח</h1>
            <p className="text-sm text-muted-foreground">טכנו-כל עוזי — מערכת תמחור</p>
          </div>
        </div>
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-sm px-3 py-1">
          <FileText className="w-3.5 h-3.5 ml-1.5" /> PRJ-1048
        </Badge>
      </div>

      {/* Project selector */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded bg-violet-500/20 flex items-center justify-center">
                <Layers className="w-4 h-4 text-violet-400" />
              </div>
              <div>
                <div className="font-semibold text-base">שער כניסה Premium — PRJ-1048</div>
                <div className="text-sm text-muted-foreground">לקוח: קבוצת אלון &nbsp;|&nbsp; תאריך הצעה: 06/04/2026 &nbsp;|&nbsp; סטטוס: ממתין לאישור</div>
              </div>
            </div>
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">ממתין לאישור</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="bg-muted/50 border border-border">
          <TabsTrigger value="recommended">מחיר מומלץ</TabsTrigger>
          <TabsTrigger value="sensitivity">רגישות</TabsTrigger>
          <TabsTrigger value="comparison">השוואה</TabsTrigger>
          <TabsTrigger value="approval">אישור</TabsTrigger>
        </TabsList>

        {/* ===== Tab 1: Recommended ===== */}
        <TabsContent value="recommended" className="space-y-6 mt-4">
          {/* 3 Price Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {priceCards.map((c) => (
              <Card key={c.title} className={`bg-gradient-to-br ${c.color} border relative overflow-hidden`}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <c.icon className={`w-5 h-5 ${c.textColor}`} />
                    <span className="text-sm font-medium text-muted-foreground">{c.title}</span>
                  </div>
                  <div className={`text-3xl font-bold ${c.textColor}`}>{fmt(c.price)}</div>
                  <div className="flex items-center gap-4 mt-3 text-sm">
                    <span className="text-muted-foreground">מרווח: <span className={`font-semibold ${c.textColor}`}>{pct(c.margin)}</span></span>
                    <span className="text-muted-foreground">רווח: <span className={`font-semibold ${c.textColor}`}>{fmt(c.profit)}</span></span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Cost Waterfall */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" /> מפל עלויות — מחומר גלם למחיר מכירה
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {costBreakdown.map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className="w-28 text-sm text-muted-foreground shrink-0">{item.label}</div>
                  <div className="flex-1 bg-muted/30 rounded-full h-6 relative overflow-hidden">
                    <div className={`${item.color} h-full rounded-full transition-all`} style={{ width: `${item.pctOfTotal * 2.5}%` }} />
                  </div>
                  <div className="w-24 text-sm font-medium text-left">{fmt(item.amount)}</div>
                  <div className="w-14 text-xs text-muted-foreground text-left">{pct(item.pctOfTotal)}</div>
                </div>
              ))}
              <div className="border-t border-border pt-3 mt-2 flex items-center gap-3">
                <div className="w-28 text-sm font-semibold shrink-0">סה"כ עלות</div>
                <div className="flex-1" />
                <div className="w-24 text-sm font-bold text-left">{fmt(totalCost)}</div>
                <div className="w-14 text-xs text-muted-foreground text-left">100%</div>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <div className="w-28 text-sm font-semibold text-emerald-400 shrink-0">+ מרווח</div>
                <div className="flex-1 flex items-center justify-center">
                  <ArrowRight className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="w-24 text-sm font-bold text-emerald-400 text-left">{fmt(48300)}</div>
                <div className="w-14 text-xs text-emerald-400 text-left">32.1%</div>
              </div>
              <div className="flex items-center gap-3 pt-1 border-t border-border">
                <div className="w-28 text-sm font-bold shrink-0">מחיר מכירה</div>
                <div className="flex-1" />
                <div className="w-24 text-base font-bold text-emerald-400 text-left">{fmt(198500)}</div>
                <div className="w-14" />
              </div>
            </CardContent>
          </Card>

          {/* Discount Guardrails */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-400" /> גדרות הנחה ומרווח מינימלי
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {discountGuardrails.map((g) => (
                  <div key={g.label} className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-border">
                    <g.icon className={`w-5 h-5 mt-0.5 ${g.color}`} />
                    <div>
                      <div className="text-sm font-medium">{g.label}</div>
                      <div className="text-lg font-bold mt-0.5">{g.value}</div>
                      <div className="text-xs text-muted-foreground mt-1">{g.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Tab 2: Sensitivity ===== */}
        <TabsContent value="sensitivity" className="space-y-6 mt-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-amber-400" /> ניתוח רגישות — השפעת עליית עלויות על המרווח
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-right py-2 px-3 font-medium">תרחיש</th>
                      <th className="text-right py-2 px-3 font-medium">עלייה %</th>
                      <th className="text-right py-2 px-3 font-medium">עלות חדשה</th>
                      <th className="text-right py-2 px-3 font-medium">מחיר מכירה</th>
                      <th className="text-right py-2 px-3 font-medium">מרווח %</th>
                      <th className="text-right py-2 px-3 font-medium">רווח ₪</th>
                      <th className="text-right py-2 px-3 font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sensitivityRows.map((r) => (
                      <tr key={r.scenario} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-3 font-medium">{r.scenario}</td>
                        <td className="py-2.5 px-3">{r.costDelta > 0 ? `+${r.costDelta}%` : "—"}</td>
                        <td className="py-2.5 px-3">{fmt(r.newCost)}</td>
                        <td className="py-2.5 px-3">{fmt(r.price)}</td>
                        <td className="py-2.5 px-3 font-semibold">{pct(r.margin)}</td>
                        <td className="py-2.5 px-3">{fmt(r.profit)}</td>
                        <td className="py-2.5 px-3">
                          <Badge className={
                            r.status === "ok" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                            r.status === "warning" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                            "bg-red-500/20 text-red-400 border-red-500/30"
                          }>
                            {r.status === "ok" ? "תקין" : r.status === "warning" ? "אזהרה" : "סכנה"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-300">
                  בעלייה של 15% ומעלה בעלויות, המרווח יורד מתחת ל-20% — מומלץ לסכם סעיף הצמדה בחוזה או לעדכן מחיר.
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Margin Breakdown Visual */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-violet-400" /> התפלגות מרווח לפי תרחיש
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sensitivityRows.map((r) => (
                <div key={r.scenario} className="flex items-center gap-3">
                  <div className="w-32 text-sm text-muted-foreground shrink-0">{r.scenario}</div>
                  <div className="flex-1 bg-muted/30 rounded-full h-5 relative overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        r.status === "ok" ? "bg-emerald-500" : r.status === "warning" ? "bg-amber-500" : "bg-red-500"
                      }`}
                      style={{ width: `${r.margin * 2.5}%` }}
                    />
                  </div>
                  <div className="w-16 text-sm font-semibold text-left">{pct(r.margin)}</div>
                </div>
              ))}
              <div className="border-t border-border pt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-3 h-3 rounded bg-emerald-500" /> תקין (מעל 20%)
                <div className="w-3 h-3 rounded bg-amber-500 mr-3" /> אזהרה (15%-20%)
                <div className="w-3 h-3 rounded bg-red-500 mr-3" /> סכנה (מתחת ל-15%)
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Tab 3: Comparison ===== */}
        <TabsContent value="comparison" className="space-y-6 mt-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" /> השוואה לפרויקטים דומים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-right py-2 px-3 font-medium">מס׳ פרויקט</th>
                      <th className="text-right py-2 px-3 font-medium">שם פרויקט</th>
                      <th className="text-right py-2 px-3 font-medium">לקוח</th>
                      <th className="text-right py-2 px-3 font-medium">עלות בפועל</th>
                      <th className="text-right py-2 px-3 font-medium">מחיר מכירה</th>
                      <th className="text-right py-2 px-3 font-medium">מרווח %</th>
                      <th className="text-right py-2 px-3 font-medium">תאריך</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastProjects.map((p) => (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-3">
                          <Badge variant="outline" className="font-mono text-xs">{p.id}</Badge>
                        </td>
                        <td className="py-2.5 px-3 font-medium">{p.name}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{p.client}</td>
                        <td className="py-2.5 px-3">{fmt(p.cost)}</td>
                        <td className="py-2.5 px-3">{fmt(p.price)}</td>
                        <td className="py-2.5 px-3">
                          <span className={`font-semibold ${p.margin >= 24 ? "text-emerald-400" : "text-amber-400"}`}>{pct(p.margin)}</span>
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground">{p.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary comparison */}
              <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-3 rounded-lg bg-muted/20 border border-border text-center">
                  <div className="text-xs text-muted-foreground">ממוצע מרווח — פרויקטים דומים</div>
                  <div className="text-xl font-bold text-blue-400 mt-1">23.7%</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/20 border border-border text-center">
                  <div className="text-xs text-muted-foreground">מרווח פרויקט נוכחי (מומלץ)</div>
                  <div className="text-xl font-bold text-emerald-400 mt-1">32.1%</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/20 border border-border text-center">
                  <div className="text-xs text-muted-foreground">הפרש מהממוצע</div>
                  <div className="text-xl font-bold text-emerald-400 mt-1">+8.4%</div>
                  <div className="text-xs text-emerald-400">מעל הממוצע</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Margin Progress by Project */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> מגמת מרווח — פרויקטים אחרונים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pastProjects.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <div className="w-36 text-sm text-muted-foreground shrink-0 truncate">{p.id} — {p.name}</div>
                  <div className="flex-1"><Progress value={p.margin * 3.3} className="h-4" /></div>
                  <div className="w-14 text-sm font-semibold text-left">{pct(p.margin)}</div>
                </div>
              ))}
              <div className="flex items-center gap-3 border-t border-border pt-2">
                <div className="w-36 text-sm font-semibold text-emerald-400 shrink-0">PRJ-1048 (נוכחי)</div>
                <div className="flex-1"><Progress value={32.1 * 3.3} className="h-4" /></div>
                <div className="w-14 text-sm font-bold text-emerald-400 text-left">32.1%</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Tab 4: Approval ===== */}
        <TabsContent value="approval" className="space-y-6 mt-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> סטטוס אישור תמחור
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Approval Details */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <Clock className="w-5 h-5 text-amber-400" />
                    <div>
                      <div className="text-sm font-medium">סטטוס: ממתין לאישור</div>
                      <div className="text-xs text-muted-foreground">הוגש ב-06/04/2026 — ממתין 2 ימים</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">מגיש:</span>
                      <span className="text-sm font-medium">יוסי כהן — מנהל תמחור</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">מאשר:</span>
                      <span className="text-sm font-medium">עוזי טכנו-כל — מנכ"ל</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">תאריך הגשה:</span>
                      <span className="text-sm font-medium">06/04/2026</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">מחיר מוגש:</span>
                      <span className="text-sm font-bold text-emerald-400">{fmt(198500)}</span>
                    </div>
                  </div>
                </div>

                {/* Approval Timeline */}
                <div className="space-y-3">
                  <div className="text-sm font-medium mb-2">תהליך אישור</div>
                  {[
                    { step: "הכנת תמחור", status: "done", date: "04/04/2026", by: "יוסי כהן" },
                    { step: "בדיקת עלויות", status: "done", date: "05/04/2026", by: "מיכל לוי" },
                    { step: "אישור מנהל תמחור", status: "done", date: "06/04/2026", by: "יוסי כהן" },
                    { step: "אישור מנכ\"ל", status: "pending", date: "—", by: "עוזי טכנו-כל" },
                    { step: "שליחה ללקוח", status: "waiting", date: "—", by: "צוות מכירות" },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                        s.status === "done" ? "bg-emerald-500/20" :
                        s.status === "pending" ? "bg-amber-500/20" : "bg-muted/30"
                      }`}>
                        {s.status === "done" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
                         s.status === "pending" ? <Clock className="w-4 h-4 text-amber-400" /> :
                         <div className="w-2 h-2 rounded-full bg-muted-foreground" />}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{s.step}</div>
                        <div className="text-xs text-muted-foreground">{s.by} — {s.date}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" /> הערות
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 rounded-lg bg-muted/20 border border-border">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">יוסי כהן</span>
                  <span className="text-xs text-muted-foreground">06/04/2026 10:30</span>
                </div>
                <p className="text-sm text-muted-foreground">מחיר מומלץ כולל רזרבת סיכון של 7.9% בגלל תנודתיות מחירי אלומיניום. קבוצת אלון לקוח אסטרטגי — ניתן לאשר הנחה עד 18% אם יידרש.</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/20 border border-border">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">מיכל לוי</span>
                  <span className="text-xs text-muted-foreground">05/04/2026 14:15</span>
                </div>
                <p className="text-sm text-muted-foreground">בדקתי עלויות חומרי גלם מול ספקים — המחירים עדכניים. עלות ייצור מבוססת על 48 שעות עבודה בתעריף מעודכן.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
