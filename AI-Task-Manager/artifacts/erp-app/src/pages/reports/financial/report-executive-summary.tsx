import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Download, Printer, TrendingUp, TrendingDown, DollarSign,
  Users, Target, BarChart3, Shield, Lightbulb, Eye,
  Factory, Truck, AlertTriangle, CheckCircle, ArrowUp, ArrowDown, Building2
} from "lucide-react";

const FALLBACK_KPIS = [
  { title: "הכנסות", value: "₪18,450,000", icon: DollarSign, color: "text-green-400", bg: "bg-green-500/10", change: "+12.3%", up: true, target: "₪17,500,000", targetPct: 105 },
  { title: "מרווח גולמי", value: "40.4%", icon: TrendingUp, color: "text-blue-400", bg: "bg-blue-500/10", change: "+2.1%", up: true, target: "38%", targetPct: 106 },
  { title: "EBITDA", value: "₪4,720,000", icon: BarChart3, color: "text-purple-400", bg: "bg-purple-500/10", change: "+18.5%", up: true, target: "₪4,200,000", targetPct: 112 },
  { title: "מזומנים", value: "₪2,850,000", icon: Building2, color: "text-emerald-400", bg: "bg-emerald-500/10", change: "+22.1%", up: true, target: "₪2,500,000", targetPct: 114 },
  { title: "עובדים", value: "127", icon: Users, color: "text-amber-400", bg: "bg-amber-500/10", change: "+8", up: true, target: "130", targetPct: 98 },
];

const FALLBACK_FINANCIAL_HIGHLIGHTS = [
  { metric: "הכנסות ממכירות", current: 18450000, prev: 16425000, change: 12.3 },
  { metric: "עלות המכר", current: 11000000, prev: 10200000, change: 7.8 },
  { metric: "רווח גולמי", current: 7450000, prev: 6225000, change: 19.7 },
  { metric: "הוצאות תפעוליות", current: 3280000, prev: 3050000, change: 7.5 },
  { metric: "EBITDA", current: 4720000, prev: 3985000, change: 18.4 },
  { metric: "רווח תפעולי", current: 4170000, prev: 3175000, change: 31.3 },
  { metric: "הוצאות מימון", current: 400000, prev: 380000, change: 5.3 },
  { metric: "רווח נקי", current: 3207900, prev: 2380000, change: 34.8 },
];

const FALLBACK_OPERATIONAL_KPIS = [
  { category: "ייצור", items: [
    { name: "OEE (יעילות ציוד כוללת)", value: "84.2%", target: "85%", status: "yellow", trend: "+2.1%" },
    { name: "תפוקה יומית ממוצעת", value: "42 יח׳", target: "45 יח׳", status: "yellow", trend: "+5.0%" },
    { name: "אחוז פסולת", value: "3.2%", target: "<4%", status: "green", trend: "-0.8%" },
    { name: "זמן עצירה לא מתוכנן", value: "4.5%", target: "<5%", status: "green", trend: "-1.2%" },
  ]},
  { category: "מכירות", items: [
    { name: "לקוחות חדשים", value: "18", target: "20", status: "yellow", trend: "+3" },
    { name: "אחוז שימור לקוחות", value: "94%", target: "92%", status: "green", trend: "+1%" },
    { name: "ממוצע הזמנה", value: "₪54,000", target: "₪50,000", status: "green", trend: "+8%" },
    { name: "צבר הזמנות", value: "₪3,200,000", target: "₪2,800,000", status: "green", trend: "+14%" },
  ]},
  { category: "משאבי אנוש", items: [
    { name: "תחלופת עובדים", value: "8.5%", target: "<10%", status: "green", trend: "-2.1%" },
    { name: "שעות הכשרה לעובד", value: "32", target: "40", status: "yellow", trend: "+8" },
    { name: "שביעות רצון עובדים", value: "4.1/5", target: "4.0/5", status: "green", trend: "+0.2" },
    { name: "משרות פתוחות", value: "5", target: "-", status: "neutral", trend: "" },
  ]},
  { category: "איכות", items: [
    { name: "תלונות לקוח", value: "12", target: "<15", status: "green", trend: "-4" },
    { name: "החזרות", value: "0.8%", target: "<1%", status: "green", trend: "-0.3%" },
    { name: "תקלות ISO", value: "2", target: "0", status: "red", trend: "+1" },
    { name: "ציון ביקורת אחרון", value: "92/100", target: "90/100", status: "green", trend: "+3" },
  ]},
];

const FALLBACK_RISKS = [
  { title: "עליית מחירי חומרי גלם", severity: "גבוה", impact: "₪450,000", probability: "70%", mitigation: "חוזים ארוכי טווח עם 3 ספקים עיקריים, גידור מחירי אלומיניום", color: "bg-red-500/20 text-red-300" },
  { title: "מחסור בעובדי ייצור מקצועיים", severity: "בינוני", impact: "עיכוב בייצור", probability: "50%", mitigation: "תוכנית הכשרה פנימית, שיתוף פעולה עם מכללות", color: "bg-yellow-500/20 text-yellow-300" },
  { title: "תחרות מיבוא סיני", severity: "בינוני", impact: "₪800,000", probability: "40%", mitigation: "התמחות במוצרי פרימיום, שירות מהיר, התאמות אישיות", color: "bg-yellow-500/20 text-yellow-300" },
  { title: "עדכון תקנות בנייה", severity: "נמוך", impact: "הסמכות חדשות", probability: "30%", mitigation: "מעקב רגולטורי, צוות תקינה פנימי", color: "bg-green-500/20 text-green-300" },
];

const FALLBACK_OPPORTUNITIES = [
  { title: "כניסה לשוק הפוטו-וולטאי", potential: "₪2,500,000", timeline: "Q3 2026", status: "בבדיקה", icon: Lightbulb },
  { title: "הרחבת קו ייצור זכוכית מבודדת", potential: "₪1,800,000", timeline: "Q4 2026", status: "מאושר", icon: Factory },
  { title: "ייצוא לקפריסין ויוון", potential: "₪1,200,000", timeline: "2027", status: "בתכנון", icon: Truck },
  { title: "אוטומציה של קו חיתוך", potential: "חיסכון ₪400,000/שנה", timeline: "Q2 2026", status: "בביצוע", icon: Target },
];

const FALLBACK_OUTLOOK = [
  { quarter: "Q2 2026", revenue: "₪4,800,000", challenge: "עונת שיא בנייה", confidence: 92 },
  { quarter: "Q3 2026", revenue: "₪5,200,000", challenge: "השקת קו חדש", confidence: 85 },
  { quarter: "Q4 2026", revenue: "₪4,600,000", challenge: "האטה עונתית", confidence: 88 },
  { quarter: "Q1 2027", revenue: "₪4,400,000", challenge: "כניסה לשוק חדש", confidence: 78 },
];

const fmt = (n: number) => "₪" + n.toLocaleString("he-IL");

const statusIcon = (status: string) => {
  if (status === "green") return <CheckCircle className="w-4 h-4 text-green-400" />;
  if (status === "yellow") return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
  if (status === "red") return <AlertTriangle className="w-4 h-4 text-red-400" />;
  return <div className="w-4 h-4" />;
};

export default function ReportExecutiveSummaryPage() {
  const { data: reportexecutivesummaryData } = useQuery({
    queryKey: ["report-executive-summary"],
    queryFn: () => authFetch("/api/reports/report_executive_summary"),
    staleTime: 5 * 60 * 1000,
  });

  const kpis = reportexecutivesummaryData ?? FALLBACK_KPIS;
  const financialHighlights = FALLBACK_FINANCIAL_HIGHLIGHTS;
  const operationalKpis = FALLBACK_OPERATIONAL_KPIS;
  const opportunities = FALLBACK_OPPORTUNITIES;
  const outlook = FALLBACK_OUTLOOK;
  const risks = FALLBACK_RISKS;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">סיכום מנהלים</h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי | סיכום ביצועים שנתי - אפריל 2026</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Printer className="w-4 h-4 ml-1" />הדפסה</Button>
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />יצוא PDF</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-lg ${kpi.bg}`}>
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
                <span className={`text-xs font-medium flex items-center gap-0.5 ${kpi.up ? "text-green-400" : "text-red-400"}`}>
                  {kpi.up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                  {kpi.change}
                </span>
              </div>
              <div className="text-xl font-bold text-foreground">{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{kpi.title}</div>
              <div className="mt-2">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>יעד: {kpi.target}</span>
                  <span>{kpi.targetPct}%</span>
                </div>
                <Progress value={Math.min(kpi.targetPct, 100)} className="h-1.5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="financial" className="space-y-4">
        <TabsList className="bg-card/50 border border-border/50">
          <TabsTrigger value="financial">דגשים פיננסיים</TabsTrigger>
          <TabsTrigger value="operational">KPI תפעוליים</TabsTrigger>
          <TabsTrigger value="risks">סיכונים והזדמנויות</TabsTrigger>
          <TabsTrigger value="outlook">תחזית</TabsTrigger>
        </TabsList>

        {/* Financial Highlights */}
        <TabsContent value="financial">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-green-400" />
                  דגשים פיננסיים - השוואה שנתית
                </CardTitle>
                <Badge className="bg-green-500/20 text-green-300">צמיחה: +12.3%</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מדד</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שנה נוכחית</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שנה קודמת</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שינוי %</th>
                      <th className="text-right p-3 text-muted-foreground font-medium w-40">מגמה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financialHighlights.map((row, i) => {
                      const isProfit = row.metric.includes("רווח") || row.metric === "EBITDA";
                      const isCost = row.metric.includes("עלות") || row.metric.includes("הוצאות");
                      const changePositive = isCost ? row.change < 10 : row.change > 0;
                      return (
                        <tr key={i} className={`border-b border-border/30 hover:bg-card/30 transition-colors ${isProfit ? "bg-card/20" : ""}`}>
                          <td className={`p-3 ${isProfit ? "font-bold" : ""} text-foreground`}>{row.metric}</td>
                          <td className="p-3 font-medium text-foreground">{fmt(row.current)}</td>
                          <td className="p-3 text-muted-foreground">{fmt(row.prev)}</td>
                          <td className={`p-3 font-medium ${changePositive ? "text-green-400" : "text-red-400"}`}>
                            <span className="flex items-center gap-1">
                              {changePositive ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                              {row.change}%
                            </span>
                          </td>
                          <td className="p-3">
                            <Progress value={Math.min(row.change * 3, 100)} className="h-2" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Key Insights */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div className="p-4 bg-green-500/5 rounded-lg border border-green-500/20">
                  <h4 className="text-sm font-medium text-green-300 mb-2 flex items-center gap-2"><CheckCircle className="w-4 h-4" />הישגים עיקריים</h4>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    <li>- רווח נקי עלה ב-34.8% לעומת שנה קודמת</li>
                    <li>- מרווח גולמי שיפור של 2.1% ל-40.4%</li>
                    <li>- צמיחה בהכנסות של 12.3% מעל יעד</li>
                    <li>- EBITDA חצה את ₪4.7M לראשונה</li>
                  </ul>
                </div>
                <div className="p-4 bg-yellow-500/5 rounded-lg border border-yellow-500/20">
                  <h4 className="text-sm font-medium text-yellow-300 mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />נקודות לשיפור</h4>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    <li>- הוצאות תפעוליות עלו ב-7.5%</li>
                    <li>- הוצאות מימון בעליה מתמשכת</li>
                    <li>- ימי גבייה ממוצע עלה ל-42 יום</li>
                    <li>- עלות חומרי גלם עלתה ב-9%</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Operational KPIs */}
        <TabsContent value="operational">
          <div className="space-y-4">
            {operationalKpis.map((cat, ci) => (
              <Card key={ci} className="bg-card/50 border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{cat.category}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="text-right p-3 text-muted-foreground font-medium">מדד</th>
                          <th className="text-right p-3 text-muted-foreground font-medium">ערך נוכחי</th>
                          <th className="text-right p-3 text-muted-foreground font-medium">יעד</th>
                          <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                          <th className="text-right p-3 text-muted-foreground font-medium">מגמה</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cat.items.map((item, ii) => (
                          <tr key={ii} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                            <td className="p-3 font-medium text-foreground">{item.name}</td>
                            <td className="p-3 text-foreground font-bold">{item.value}</td>
                            <td className="p-3 text-muted-foreground">{item.target}</td>
                            <td className="p-3 text-center">{statusIcon(item.status)}</td>
                            <td className={`p-3 font-medium ${item.trend.startsWith("+") ? "text-green-400" : item.trend.startsWith("-") ? "text-red-400" : "text-muted-foreground"}`}>
                              {item.trend || "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Risks & Opportunities */}
        <TabsContent value="risks">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Risks */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="w-4 h-4 text-red-400" />
                  סיכונים עיקריים
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {risks.map((risk, i) => (
                  <div key={i} className="p-3 bg-background/30 rounded-lg border border-border/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-foreground text-sm">{risk.title}</span>
                      <Badge className={risk.color}>{risk.severity}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-2">
                      <span>השפעה: {risk.impact}</span>
                      <span>הסתברות: {risk.probability}</span>
                    </div>
                    <p className="text-xs text-muted-foreground/80">מענה: {risk.mitigation}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Opportunities */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-yellow-400" />
                  הזדמנויות
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {opportunities.map((opp, i) => (
                  <div key={i} className="p-3 bg-background/30 rounded-lg border border-border/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <opp.icon className="w-4 h-4 text-blue-400" />
                        <span className="font-medium text-foreground text-sm">{opp.title}</span>
                      </div>
                      <Badge className={
                        opp.status === "מאושר" ? "bg-green-500/20 text-green-300" :
                        opp.status === "בביצוע" ? "bg-blue-500/20 text-blue-300" :
                        opp.status === "בבדיקה" ? "bg-yellow-500/20 text-yellow-300" :
                        "bg-gray-500/20 text-gray-300"
                      }>{opp.status}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span>פוטנציאל: {opp.potential}</span>
                      <span>לוח זמנים: {opp.timeline}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Outlook */}
        <TabsContent value="outlook">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-400" />
                תחזית רבעונית
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {outlook.map((q, i) => (
                  <Card key={i} className="bg-background/30 border-border/30">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-bold text-foreground">{q.quarter}</span>
                        <Badge className={
                          q.confidence >= 90 ? "bg-green-500/20 text-green-300" :
                          q.confidence >= 80 ? "bg-yellow-500/20 text-yellow-300" :
                          "bg-orange-500/20 text-orange-300"
                        }>ביטחון: {q.confidence}%</Badge>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">הכנסות צפויות</span>
                          <span className="font-bold text-green-400">{q.revenue}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">אתגר עיקרי</span>
                          <span className="text-foreground text-xs">{q.challenge}</span>
                        </div>
                        <Progress value={q.confidence} className="h-2 mt-2" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Strategic Priorities */}
              <div className="p-4 bg-blue-500/5 rounded-lg border border-blue-500/20">
                <h4 className="text-sm font-medium text-blue-300 mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  יעדים אסטרטגיים - 2026
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { goal: "הגדלת הכנסות ל-₪20M", progress: 92, status: "במעקב" },
                    { goal: "שיפור OEE ל-85%", progress: 99, status: "כמעט הושג" },
                    { goal: "הפחתת ימי גבייה ל-35 יום", progress: 72, status: "דורש שיפור" },
                    { goal: "השקת קו ייצור חדש", progress: 60, status: "בביצוע" },
                    { goal: "הסמכת ISO 14001", progress: 45, status: "בתהליך" },
                    { goal: "גיוס 12 עובדי ייצור", progress: 67, status: "בתהליך" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">{item.goal}</span>
                          <span className={`font-medium ${item.progress >= 90 ? "text-green-400" : item.progress >= 60 ? "text-yellow-400" : "text-orange-400"}`}>{item.progress}%</span>
                        </div>
                        <Progress value={item.progress} className="h-2" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* CEO Message */}
              <div className="mt-6 p-4 bg-card/30 rounded-lg border border-border/30">
                <h4 className="text-sm font-medium text-foreground mb-2">סיכום מנכ״ל</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  טכנו-כל עוזי מסיימת את הרבעון הראשון של 2026 עם ביצועים חזקים. הכנסות המפעל
                  עלו ב-12.3% לעומת תקופה מקבילה, עם שיפור משמעותי ברווחיות. אנו ממשיכים
                  להשקיע בהרחבת קווי הייצור ובאוטומציה, עם מיקוד בשווקים חדשים ומוצרי פרימיום.
                  האתגרים העיקריים הם עליית מחירי חומרי גלם וגיוס כ״א מקצועי. אנו אופטימיים
                  לגבי המשך השנה ועומדים ביעדים שנקבעו.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
