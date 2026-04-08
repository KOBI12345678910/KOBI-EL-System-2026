import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle, Shield, TrendingDown, Activity, Eye, ChevronRight,
  Gauge, Target, Zap, Globe, DollarSign, Users, Building2
} from "lucide-react";

const riskCategories = [
  { id: "liquidity", label: "נזילות", icon: DollarSign, score: 28, maxScore: 100, color: "text-blue-600", bgColor: "bg-blue-50" },
  { id: "credit", label: "אשראי", icon: Users, score: 42, maxScore: 100, color: "text-amber-600", bgColor: "bg-amber-50" },
  { id: "concentration", label: "ריכוזיות", icon: Target, score: 55, maxScore: 100, color: "text-orange-600", bgColor: "bg-orange-50" },
  { id: "operational", label: "תפעולי", icon: Activity, score: 18, maxScore: 100, color: "text-green-600", bgColor: "bg-green-50" },
  { id: "supplier", label: "ספקים", icon: Building2, score: 35, maxScore: 100, color: "text-purple-600", bgColor: "bg-purple-50" },
  { id: "fx", label: 'מט"ח', icon: Globe, score: 48, maxScore: 100, color: "text-red-600", bgColor: "bg-red-50" },
];

const riskRegister = [
  { id: 1, name: "ריכוזיות לקוח A (38% מההכנסות)", category: "concentration", likelihood: 3, impact: 5, score: 15, status: "open", owner: "CFO", mitigation: "גיוון בסיס לקוחות - יעד 25% תוך 6 חודשים" },
  { id: 2, name: "חשיפת EUR לא מגודרת (€420K)", category: "fx", likelihood: 4, impact: 3, score: 12, status: "mitigated", owner: "Treasury", mitigation: "Forward 6M נסגר ב-3.78" },
  { id: 3, name: "תלות בספק יחיד לאלומיניום", category: "supplier", likelihood: 3, impact: 4, score: 12, status: "open", owner: "רכש", mitigation: "איתור ספק חלופי - בתהליך" },
  { id: 4, name: "עיכוב גבייה ממגזר ציבורי (68 ימים)", category: "credit", likelihood: 4, impact: 3, score: 12, status: "open", owner: "גבייה", mitigation: "מכתבי התראה + שיחות follow-up" },
  { id: 5, name: "עליית ריבית על מסגרת אשראי", category: "liquidity", likelihood: 3, impact: 2, score: 6, status: "accepted", owner: "CFO", mitigation: "מעבר למסגרת קבועה בבנק לאומי" },
  { id: 6, name: "כשל מערכת ERP - downtime", category: "operational", likelihood: 2, impact: 4, score: 8, status: "mitigated", owner: "IT", mitigation: "DR site + גיבוי יומי" },
];

const exposures = [
  { type: "מט\"ח EUR", gross: 850000, hedged: 620000, net: 230000, hedgeRatio: 73, instrument: "Forward 6M" },
  { type: "מט\"ח USD", gross: 320000, hedged: 280000, net: 40000, hedgeRatio: 87.5, instrument: "Forward 3M" },
  { type: "אלומיניום", gross: 1200000, hedged: 0, net: 1200000, hedgeRatio: 0, instrument: "—" },
  { type: "ריבית", gross: 5000000, hedged: 3000000, net: 2000000, hedgeRatio: 60, instrument: "IRS 5Y" },
];

const earlyWarnings = [
  { indicator: "DSO עולה (42 → 48 ימים)", severity: "warning", trend: "up" },
  { indicator: "ריכוזיות Top 5 > 60%", severity: "critical", trend: "stable" },
  { indicator: "Current Ratio ירד מתחת ל-2.0", severity: "warning", trend: "down" },
  { indicator: "Hedge Ratio ירד ל-72%", severity: "info", trend: "down" },
];

function getScoreColor(score: number): string {
  if (score <= 30) return "text-emerald-600";
  if (score <= 50) return "text-amber-600";
  if (score <= 70) return "text-orange-600";
  return "text-red-600";
}

function getScoreBg(score: number): string {
  if (score <= 30) return "bg-emerald-500";
  if (score <= 50) return "bg-amber-500";
  if (score <= 70) return "bg-orange-500";
  return "bg-red-500";
}

function getRiskBadge(score: number) {
  if (score >= 12) return <Badge className="bg-red-100 text-red-700 border-red-200">קריטי</Badge>;
  if (score >= 8) return <Badge className="bg-amber-100 text-amber-700 border-amber-200">גבוה</Badge>;
  if (score >= 4) return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">בינוני</Badge>;
  return <Badge className="bg-green-100 text-green-700 border-green-200">נמוך</Badge>;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "open": return <Badge variant="outline" className="text-red-600 border-red-300">פתוח</Badge>;
    case "mitigated": return <Badge variant="outline" className="text-blue-600 border-blue-300">ממותן</Badge>;
    case "accepted": return <Badge variant="outline" className="text-gray-600 border-gray-300">מקובל</Badge>;
    case "closed": return <Badge variant="outline" className="text-green-600 border-green-300">סגור</Badge>;
    default: return null;
  }
}

export default function RiskDashboard() {
  const overallScore = Math.round(riskCategories.reduce((s, r) => s + r.score, 0) / riskCategories.length);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" /> ניהול סיכונים פיננסיים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Enterprise Risk | חשיפות | גידור | אזהרות מוקדמות</p>
        </div>
        <Card className="px-6 py-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">ציון סיכון כולל</p>
            <p className={`text-3xl font-bold font-mono ${getScoreColor(overallScore)}`}>{overallScore}</p>
            <p className="text-xs text-muted-foreground">מתוך 100</p>
          </div>
        </Card>
      </div>

      {/* Risk Heatmap */}
      <div className="grid grid-cols-6 gap-3">
        {riskCategories.map((cat) => {
          const Icon = cat.icon;
          return (
            <Card key={cat.id} className={`${cat.bgColor} border-0`}>
              <CardContent className="pt-4 pb-3 text-center">
                <Icon className={`h-6 w-6 mx-auto ${cat.color} mb-1`} />
                <p className="text-xs font-medium mb-1">{cat.label}</p>
                <p className={`text-2xl font-bold font-mono ${getScoreColor(cat.score)}`}>{cat.score}</p>
                <Progress value={cat.score} className="h-1.5 mt-2" />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Early Warnings */}
      <Card className="border-amber-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" /> אזהרות מוקדמות
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {earlyWarnings.map((w, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b last:border-0">
                {w.severity === "critical"
                  ? <Badge className="bg-red-100 text-red-700 w-16 justify-center">קריטי</Badge>
                  : w.severity === "warning"
                    ? <Badge className="bg-amber-100 text-amber-700 w-16 justify-center">אזהרה</Badge>
                    : <Badge className="bg-blue-100 text-blue-700 w-16 justify-center">מידע</Badge>
                }
                <span className="text-sm flex-1">{w.indicator}</span>
                {w.trend === "up" && <TrendingDown className="h-4 w-4 text-red-500 rotate-180" />}
                {w.trend === "down" && <TrendingDown className="h-4 w-4 text-red-500" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="register">
        <TabsList>
          <TabsTrigger value="register">מרשם סיכונים</TabsTrigger>
          <TabsTrigger value="exposures">חשיפות וגידור</TabsTrigger>
        </TabsList>

        {/* Risk Register */}
        <TabsContent value="register">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-right font-semibold">סיכון</TableHead>
                    <TableHead className="text-right font-semibold">קטגוריה</TableHead>
                    <TableHead className="text-right font-semibold w-20">סבירות</TableHead>
                    <TableHead className="text-right font-semibold w-20">השפעה</TableHead>
                    <TableHead className="text-right font-semibold w-20">ציון</TableHead>
                    <TableHead className="text-right font-semibold">סטטוס</TableHead>
                    <TableHead className="text-right font-semibold">אחראי</TableHead>
                    <TableHead className="text-right font-semibold">מענה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riskRegister.sort((a, b) => b.score - a.score).map((risk) => (
                    <TableRow key={risk.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium max-w-[250px]">{risk.name}</TableCell>
                      <TableCell><Badge variant="outline">{risk.category}</Badge></TableCell>
                      <TableCell className="text-center font-mono">{risk.likelihood}/5</TableCell>
                      <TableCell className="text-center font-mono">{risk.impact}/5</TableCell>
                      <TableCell className="text-center">{getRiskBadge(risk.score)}</TableCell>
                      <TableCell>{getStatusBadge(risk.status)}</TableCell>
                      <TableCell className="text-sm">{risk.owner}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{risk.mitigation}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Exposures & Hedging */}
        <TabsContent value="exposures">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">חשיפות וגידור</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-right font-semibold">סוג חשיפה</TableHead>
                    <TableHead className="text-right font-semibold">חשיפה ברוטו</TableHead>
                    <TableHead className="text-right font-semibold">סכום מגודר</TableHead>
                    <TableHead className="text-right font-semibold">חשיפה נטו</TableHead>
                    <TableHead className="text-right font-semibold">יחס גידור</TableHead>
                    <TableHead className="text-right font-semibold">מכשיר</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exposures.map((exp, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{exp.type}</TableCell>
                      <TableCell className="font-mono">₪{exp.gross.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-emerald-600">₪{exp.hedged.toLocaleString()}</TableCell>
                      <TableCell className={`font-mono font-bold ${exp.net > 500000 ? "text-red-600" : "text-amber-600"}`}>
                        ₪{exp.net.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={exp.hedgeRatio} className="h-2 w-16" />
                          <span className="text-xs font-mono">{exp.hedgeRatio}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{exp.instrument}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
