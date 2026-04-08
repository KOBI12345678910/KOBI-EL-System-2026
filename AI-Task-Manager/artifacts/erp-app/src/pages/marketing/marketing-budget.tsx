import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  PieChart,
  BarChart3,
  DollarSign,
  Monitor,
  PartyPopper,
  Printer,
  Share2,
  CalendarDays,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

const budgetByChannel = [
  { channel: "דיגיטלי", allocated: 85000, spent: 62400, icon: Monitor, color: "text-blue-600", bg: "bg-blue-50" },
  { channel: "אירועים ותערוכות", allocated: 65000, spent: 42500, icon: PartyPopper, color: "text-purple-600", bg: "bg-purple-50" },
  { channel: "דפוס ומודפסים", allocated: 35000, spent: 28900, icon: Printer, color: "text-orange-600", bg: "bg-orange-50" },
  { channel: "רשתות חברתיות", allocated: 45000, spent: 31200, icon: Share2, color: "text-green-600", bg: "bg-green-50" },
];

const monthlySpend = [
  { month: "ינואר", planned: 18000, actual: 16500 },
  { month: "פברואר", planned: 19000, actual: 21200 },
  { month: "מרץ", planned: 22000, actual: 20800 },
  { month: "אפריל", planned: 20000, actual: 14200 },
  { month: "מאי", planned: 21000, actual: 0 },
  { month: "יוני", planned: 23000, actual: 0 },
  { month: "יולי", planned: 18000, actual: 0 },
  { month: "אוגוסט", planned: 15000, actual: 0 },
  { month: "ספטמבר", planned: 20000, actual: 0 },
  { month: "אוקטובר", planned: 22000, actual: 0 },
  { month: "נובמבר", planned: 19000, actual: 0 },
  { month: "דצמבר", planned: 16000, actual: 0 },
];

const roiByChannel = [
  { channel: "דיגיטלי - גוגל", spend: 28000, revenue: 112000, leads: 156, roi: 300 },
  { channel: "דיגיטלי - אימייל", spend: 12000, revenue: 54000, leads: 89, roi: 350 },
  { channel: "רשתות חברתיות", spend: 31200, revenue: 78000, leads: 124, roi: 150 },
  { channel: "אירועים", spend: 42500, revenue: 195000, leads: 210, roi: 359 },
  { channel: "דפוס", spend: 28900, revenue: 52000, leads: 65, roi: 80 },
  { channel: "SEO אורגני", spend: 22400, revenue: 98000, leads: 178, roi: 337 },
];

export default function MarketingBudget() {
  const [tab, setTab] = useState("allocation");

  const totalBudget = budgetByChannel.reduce((s, c) => s + c.allocated, 0);
  const totalSpent = budgetByChannel.reduce((s, c) => s + c.spent, 0);
  const remaining = totalBudget - totalSpent;
  const utilization = ((totalSpent / totalBudget) * 100).toFixed(1);
  const totalRevenue = roiByChannel.reduce((s, c) => s + c.revenue, 0);
  const totalRoiSpend = roiByChannel.reduce((s, c) => s + c.spend, 0);
  const overallRoi = (((totalRevenue - totalRoiSpend) / totalRoiSpend) * 100).toFixed(0);

  const kpis = [
    { label: "תקציב כולל", value: `₪${totalBudget.toLocaleString()}`, icon: Wallet, color: "text-blue-600" },
    { label: "הוצא", value: `₪${totalSpent.toLocaleString()}`, icon: TrendingDown, color: "text-red-600" },
    { label: "נותר", value: `₪${remaining.toLocaleString()}`, icon: DollarSign, color: "text-green-600" },
    { label: "ניצול תקציב", value: `${utilization}%`, icon: PieChart, color: "text-purple-600" },
    { label: "ROI כולל", value: `${overallRoi}%`, icon: TrendingUp, color: "text-emerald-600" },
  ];

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">תקציב שיווק</h1>
          <p className="text-muted-foreground mt-1">טכנו-כל עוזי - ניהול והקצאת תקציבי שיווק</p>
        </div>
        <Button><BarChart3 className="h-4 w-4 ml-2" />דוח תקציב</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4 text-center">
              <kpi.icon className={`h-8 w-8 mx-auto mb-2 ${kpi.color}`} />
              <div className="text-2xl font-bold">{kpi.value}</div>
              <div className="text-xs text-muted-foreground">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="allocation">הקצאת תקציב</TabsTrigger>
          <TabsTrigger value="spending">מעקב הוצאות</TabsTrigger>
          <TabsTrigger value="roi">ניתוח ROI</TabsTrigger>
        </TabsList>

        <TabsContent value="allocation" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {budgetByChannel.map((ch) => {
              const pct = ((ch.spent / ch.allocated) * 100).toFixed(0);
              return (
                <Card key={ch.channel}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`${ch.bg} p-3 rounded-lg`}>
                        <ch.icon className={`h-6 w-6 ${ch.color}`} />
                      </div>
                      <div>
                        <div className="font-bold text-lg">{ch.channel}</div>
                        <Badge variant="outline">{pct}% ניצול</Badge>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">הוקצה:</span>
                        <span className="font-bold">₪{ch.allocated.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">הוצא:</span>
                        <span className="font-bold text-red-600">₪{ch.spent.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">נותר:</span>
                        <span className="font-bold text-green-600">₪{(ch.allocated - ch.spent).toLocaleString()}</span>
                      </div>
                      <Progress value={Number(pct)} className="h-3" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Card>
            <CardHeader><CardTitle>חלוקת תקציב כוללת</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {budgetByChannel.map((ch) => (
                  <div key={ch.channel} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <ch.icon className={`h-4 w-4 ${ch.color}`} />
                      <span>{ch.channel}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">{((ch.allocated / totalBudget) * 100).toFixed(0)}% מהתקציב</span>
                      <span className="font-bold">₪{ch.allocated.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="spending" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>הוצאות חודשיות - מתוכנן מול בפועל</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {monthlySpend.map((m) => {
                  const diff = m.actual > 0 ? m.actual - m.planned : 0;
                  const isOver = diff > 0;
                  return (
                    <div key={m.month} className="flex items-center gap-4 py-2 border-b last:border-0">
                      <div className="w-20 font-medium">{m.month}</div>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span>מתוכנן: ₪{m.planned.toLocaleString()}</span>
                          {m.actual > 0 ? (
                            <span className={isOver ? "text-red-600" : "text-green-600"}>
                              בפועל: ₪{m.actual.toLocaleString()} {isOver ? <ArrowUpRight className="inline h-3 w-3" /> : <ArrowDownRight className="inline h-3 w-3" />}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">טרם בוצע</span>
                          )}
                        </div>
                        <Progress value={m.actual > 0 ? (m.actual / m.planned) * 100 : 0} className="h-2" />
                      </div>
                      {m.actual > 0 && (
                        <Badge className={isOver ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}>
                          {isOver ? "+" : ""}₪{diff.toLocaleString()}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <CalendarDays className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                <div className="text-2xl font-bold">₪{monthlySpend.filter((m) => m.actual > 0).reduce((s, m) => s + m.actual, 0).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">סה"כ הוצא עד כה</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <TrendingUp className="h-8 w-8 mx-auto mb-2 text-green-600" />
                <div className="text-2xl font-bold">₪{monthlySpend.reduce((s, m) => s + m.planned, 0).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">תקציב שנתי מתוכנן</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <BarChart3 className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                <div className="text-2xl font-bold">₪{Math.round(monthlySpend.reduce((s, m) => s + m.planned, 0) / 12).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">ממוצע חודשי</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="roi" className="space-y-4">
          <div className="space-y-3">
            {roiByChannel.sort((a, b) => b.roi - a.roi).map((ch) => (
              <Card key={ch.channel}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-bold text-lg">{ch.channel}</div>
                    <Badge className={ch.roi >= 200 ? "bg-green-100 text-green-800" : ch.roi >= 100 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}>
                      ROI: {ch.roi}%
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="text-center p-2 bg-red-50 rounded">
                      <div className="font-bold">₪{ch.spend.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">הוצאה</div>
                    </div>
                    <div className="text-center p-2 bg-green-50 rounded">
                      <div className="font-bold">₪{ch.revenue.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">הכנסה</div>
                    </div>
                    <div className="text-center p-2 bg-blue-50 rounded">
                      <div className="font-bold">{ch.leads}</div>
                      <div className="text-xs text-muted-foreground">לידים</div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Progress value={Math.min(ch.roi / 4, 100)} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
