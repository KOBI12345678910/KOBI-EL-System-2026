import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Brain, Target, FileText, TrendingUp, Sparkles, Users, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Zap, Search, Send, Star, ThumbsUp,
  BarChart3, DollarSign, ShieldCheck, Clock
} from "lucide-react";

const kpis = [
  { label: "המלצות AI היום", value: 24, icon: Brain, color: "text-violet-400", bg: "bg-violet-500/10", change: "+6", up: true },
  { label: "לידים שנוקדו", value: 156, icon: Target, color: "text-blue-400", bg: "bg-blue-500/10", change: "+18", up: true },
  { label: "הצעות שנוצרו", value: 12, icon: FileText, color: "text-emerald-400", bg: "bg-emerald-500/10", change: "+3", up: true },
  { label: "הסתברות זכייה ממוצעת", value: "68%", icon: TrendingUp, color: "text-amber-400", bg: "bg-amber-500/10", change: "+4%", up: true },
  { label: "הכנסה צפויה ₪", value: "4.2M", icon: DollarSign, color: "text-green-400", bg: "bg-green-500/10", change: "+12%", up: true },
  { label: "שיפור המרה %", value: "23%", icon: Sparkles, color: "text-pink-400", bg: "bg-pink-500/10", change: "+5%", up: true },
];

const I = (c:string,a:string,t:string,p:string,s:number) => ({customer:c,action:a,type:t,priority:p,score:s});
const insights = [
  I("אלקטרו-טק בע\"מ","שלח הצעת מחיר מעודכנת - הלקוח השווה מחירים מול מתחרה","next_action","high",94),
  I("מפעלי הגליל","הצע חבילת שדרוג קו ייצור #3 - צריכת חשמל גבוהה ב-30%","upsell","high",91),
  I("תעשיות הנגב","התראת נטישה - לא הזמין 90 יום, ירידה של 40% בתקשורת","churn","critical",89),
  I("פלדות ישראל","תזמן פגישת חידוש חוזה - פג תוקף בעוד 30 יום","next_action","medium",87),
  I("כימיקלים מתקדמים","הצע מוצר משלים: חיישני IoT לניטור תהליכים","upsell","medium",85),
  I("אופטיקה דיגיטלית","התראת נטישה - פנה לתמיכה 5 פעמים החודש ללא פתרון","churn","high",83),
  I("בטון הצפון","שלח קטלוג מוצרים חדשים - ביקר באתר 12 פעמים השבוע","next_action","medium",80),
  I("מתכות אשדוד","הצע הרחבת הסכם שירות לכלול תחזוקה מונעת","upsell","medium",78),
  I("פולימרים בע\"מ","צור קשר אישי - מנהל רכש חדש מונה לפני שבוע","next_action","high",76),
  I("רכיבים אלקטרוניים","הצע מערכת ניהול מלאי - דיווח על חוסרים תכופים","upsell","low",72),
];

const L = (n:string,c:string,s:number,b:number,t:number,d:boolean,p:number,e:number,st:string) => ({name:n,company:c,score:s,budget:b,timeline:t,decisionMaker:d,pastPurchases:p,engagement:e,status:st});
const leads = [
  L("דוד כהן","טכנולוגיות עתיד",95,92,88,true,4,96,"חם"), L("שרה לוי","מפעלי דרום",91,85,90,true,2,94,"חם"),
  L("יוסי אברהם","תעשיות מרכז",88,78,92,true,3,88,"חם"), L("מירי גולן","אלקטרו-סיסטם",85,90,70,false,1,91,"חם"),
  L("אבי פרידמן","בניה ירוקה",82,88,65,true,0,85,"פושר"), L("רונית שמש","מזון טבעי",79,72,80,true,2,78,"פושר"),
  L("עמית ברק","לוגיסטיקה פלוס",76,68,85,false,1,82,"פושר"), L("נועה דגן","חומרי גלם",73,80,55,true,0,76,"פושר"),
  L("גיל מזרחי","אריזות מתקדמות",70,65,72,false,3,70,"פושר"), L("תמר רוזן","אנרגיה חכמה",67,60,78,true,0,68,"קר"),
  L("עידן כץ","פלסטיק איכותי",64,55,60,false,1,72,"קר"), L("הדר אלון","מכשור רפואי",61,75,42,true,0,60,"קר"),
  L("ליאור חן","תקשורת ענן",55,48,50,false,0,65,"קר"), L("שי פינטו","ייצור מדויק",48,40,55,false,0,52,"קר"),
  L("אורלי ביטון","שירותי IT",42,35,38,false,0,48,"קר"),
];

const proposals = [
  { id: "P-2026-041", customer: "אלקטרו-טק בע\"מ", title: "שדרוג מערכת אוטומציה", value: "₪850,000", products: "PLC מתקדם, חיישני IoT, תוכנת SCADA", discount: "8%", status: "ממתין" },
  { id: "P-2026-042", customer: "מפעלי הגליל", title: "קו ייצור חדש - שלב ב'", value: "₪1,200,000", products: "רובוט תעשייתי, מסוע אוטומטי, מערכת בקרה", discount: "12%", status: "נשלח" },
  { id: "P-2026-043", customer: "פלדות ישראל", title: "חידוש הסכם שירות שנתי", value: "₪320,000", products: "תחזוקה מונעת, חלפים, תמיכה 24/7", discount: "5%", status: "טיוטה" },
  { id: "P-2026-044", customer: "כימיקלים מתקדמים", title: "מערכת ניטור תהליכים", value: "₪480,000", products: "חיישנים, Gateway IoT, פלטפורמת ניתוח", discount: "10%", status: "אושר" },
];

const forecast = [
  { month: "אפריל 2026", predicted: 1800000, deals: 8, probability: 72 },
  { month: "מאי 2026", predicted: 2100000, deals: 11, probability: 65 },
  { month: "יוני 2026", predicted: 1950000, deals: 9, probability: 58 },
  { month: "יולי 2026", predicted: 2400000, deals: 14, probability: 52 },
  { month: "אוגוסט 2026", predicted: 2750000, deals: 16, probability: 45 },
  { month: "ספטמבר 2026", predicted: 3100000, deals: 18, probability: 40 },
];

const priorityColors: Record<string, string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/30",
  high: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  low: "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

const typeIcons: Record<string, typeof Brain> = { next_action: Zap, upsell: ArrowUpRight, churn: AlertTriangle };
const typeLabels: Record<string, string> = { next_action: "פעולה הבאה", upsell: "הרחבת מכירה", churn: "סיכון נטישה" };
const statusColors: Record<string, string> = {
  "חם": "bg-red-500/20 text-red-300", "פושר": "bg-yellow-500/20 text-yellow-300", "קר": "bg-blue-500/20 text-blue-300",
  "טיוטה": "bg-gray-500/20 text-gray-300", "ממתין": "bg-yellow-500/20 text-yellow-300", "נשלח": "bg-blue-500/20 text-blue-300", "אושר": "bg-green-500/20 text-green-300",
};

export default function AiSalesAssistant() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("insights");

  const maxForecast = Math.max(...forecast.map(f => f.predicted));

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain className="w-7 h-7 text-violet-400" />
            עוזר מכירות AI
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניתוח חכם, ניקוד לידים, הצעות מחיר אוטומטיות ותחזית הכנסות</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="חיפוש..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pr-9 w-64 bg-background/50" />
          </div>
          <Button size="sm" className="bg-violet-600 hover:bg-violet-700"><Sparkles className="w-4 h-4 ml-1" />הפעל ניתוח AI</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="bg-card/50 border-border/50 hover:border-border transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-lg ${kpi.bg}`}><kpi.icon className={`w-4 h-4 ${kpi.color}`} /></div>
                <span className={`text-xs flex items-center gap-0.5 ${kpi.up ? "text-green-400" : "text-red-400"}`}>
                  {kpi.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{kpi.change}
                </span>
              </div>
              <div className="text-2xl font-bold text-foreground">{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card/50 border border-border/50 p-1">
          <TabsTrigger value="insights" className="data-[state=active]:bg-violet-600/20 data-[state=active]:text-violet-300">
            <Brain className="w-4 h-4 ml-1" />תובנות AI
          </TabsTrigger>
          <TabsTrigger value="leads" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">
            <Target className="w-4 h-4 ml-1" />ניקוד לידים
          </TabsTrigger>
          <TabsTrigger value="proposals" className="data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-300">
            <FileText className="w-4 h-4 ml-1" />מחולל הצעות
          </TabsTrigger>
          <TabsTrigger value="forecasting" className="data-[state=active]:bg-amber-600/20 data-[state=active]:text-amber-300">
            <TrendingUp className="w-4 h-4 ml-1" />תחזית הכנסות
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: AI Insights */}
        <TabsContent value="insights" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2"><Sparkles className="w-5 h-5 text-violet-400" />המלצות חכמות - 10 הפעולות המובילות</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {insights.map((item, i) => {
                const Icon = typeIcons[item.type] || Brain;
                return (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-background/30 border border-border/30 hover:border-border/60 transition-colors">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-violet-500/10 text-violet-400 font-bold text-sm shrink-0">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-foreground">{item.customer}</span>
                        <Badge className={`text-[10px] ${priorityColors[item.priority]}`}>{item.priority === "critical" ? "קריטי" : item.priority === "high" ? "גבוה" : item.priority === "medium" ? "בינוני" : "נמוך"}</Badge>
                        <Badge variant="outline" className="text-[10px] flex items-center gap-1"><Icon className="w-3 h-3" />{typeLabels[item.type]}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.action}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-center">
                        <div className="text-lg font-bold text-violet-400">{item.score}</div>
                        <div className="text-[10px] text-muted-foreground">ציון AI</div>
                      </div>
                      <Button size="sm" variant="outline" className="h-8"><Send className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Lead Scoring */}
        <TabsContent value="leads" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2"><Target className="w-5 h-5 text-blue-400" />ניקוד לידים AI - {leads.length} לידים פעילים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">#</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שם</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">חברה</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">ציון AI</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">תקציב</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">ציר זמן</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">מקבל החלטות</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">רכישות</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">מעורבות</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 text-muted-foreground">{i + 1}</td>
                        <td className="p-3 font-medium text-foreground">{lead.name}</td>
                        <td className="p-3 text-muted-foreground">{lead.company}</td>
                        <td className="p-3">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`font-bold ${lead.score >= 80 ? "text-green-400" : lead.score >= 60 ? "text-yellow-400" : "text-red-400"}`}>{lead.score}</span>
                            <Progress value={lead.score} className="h-1.5 w-16" />
                          </div>
                        </td>
                        <td className="p-3 text-center"><span className="text-xs bg-background/50 rounded px-2 py-0.5">{lead.budget}</span></td>
                        <td className="p-3 text-center"><span className="text-xs bg-background/50 rounded px-2 py-0.5">{lead.timeline}</span></td>
                        <td className="p-3 text-center">{lead.decisionMaker ? <ShieldCheck className="w-4 h-4 text-green-400 mx-auto" /> : <span className="text-muted-foreground text-xs">-</span>}</td>
                        <td className="p-3 text-center"><span className="text-xs">{lead.pastPurchases > 0 ? `${lead.pastPurchases} הזמנות` : "-"}</span></td>
                        <td className="p-3">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-xs">{lead.engagement}%</span>
                            <Progress value={lead.engagement} className="h-1 w-12" />
                          </div>
                        </td>
                        <td className="p-3 text-center"><Badge className={`text-[10px] ${statusColors[lead.status]}`}>{lead.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Proposal Generator */}
        <TabsContent value="proposals" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2"><FileText className="w-5 h-5 text-emerald-400" />הצעות מחיר אחרונות</CardTitle>
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"><Sparkles className="w-4 h-4 ml-1" />צור הצעה חדשה</Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {proposals.map((p, i) => (
                    <div key={i} className="p-4 rounded-lg bg-background/30 border border-border/30 hover:border-border/60 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">{p.id}</span>
                          <span className="font-semibold text-foreground">{p.title}</span>
                        </div>
                        <Badge className={`text-[10px] ${statusColors[p.status]}`}>{p.status}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{p.customer}</span>
                        <span className="flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" />{p.value}</span>
                        <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5" />הנחה: {p.discount}</span>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        <span className="text-foreground/70">מוצרים: </span>{p.products}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
            <div className="space-y-4">
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-400" />אופטימיזציית תמחור AI</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { bg: "green", label: "המלצת הנחה אופטימלית", val: "7-10%", sub: "מבוסס על 200+ עסקאות דומות", big: true },
                    { bg: "blue", label: "מוצרים בביקוש גבוה", val: "חיישני IoT, מערכות SCADA", sub: "עלייה של 35% בביקוש ברבעון" },
                    { bg: "amber", label: "הזדמנות Cross-Sell", val: "חוזה תחזוקה + הדרכה", sub: "מגדיל שווי עסקה ב-25%" },
                    { bg: "violet", label: "עונתיות", val: "Q2 - שיא רכישות", sub: "הזמן אופטימלי לסגירת עסקאות" },
                  ].map((c, i) => (
                    <div key={i} className={`p-3 rounded-lg bg-${c.bg}-500/5 border border-${c.bg}-500/20`}>
                      <div className={`text-xs text-${c.bg}-400 mb-1`}>{c.label}</div>
                      <div className={`${c.big ? "text-lg font-bold" : "text-sm font-medium"} text-foreground`}>{c.val}</div>
                      <div className="text-xs text-muted-foreground">{c.sub}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2"><ThumbsUp className="w-4 h-4 text-green-400" />ביצועי הצעות</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">שיעור אישור</span><span className="font-medium text-green-400">72%</span></div>
                  <Progress value={72} className="h-2" />
                  <div className="flex items-center justify-between text-sm mt-2"><span className="text-muted-foreground">זמן ממוצע לאישור</span><span className="font-medium text-foreground">4.2 ימים</span></div>
                  <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">שווי ממוצע</span><span className="font-medium text-foreground">₪712,500</span></div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Tab 4: Forecasting */}
        <TabsContent value="forecasting" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2"><BarChart3 className="w-5 h-5 text-amber-400" />תחזית הכנסות AI - 6 חודשים קדימה</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {forecast.map((f, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="w-28 text-sm text-muted-foreground shrink-0">{f.month}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex-1 bg-background/30 rounded-full h-6 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-l from-amber-500 to-amber-600/70 flex items-center justify-end px-2" style={{ width: `${(f.predicted / maxForecast) * 100}%` }}>
                              <span className="text-[10px] font-medium text-white whitespace-nowrap">₪{(f.predicted / 1000000).toFixed(1)}M</span>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[10px] w-16 justify-center">{f.deals} עסקאות</Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Progress value={f.probability} className="h-1 flex-1" />
                          <span className={`text-[10px] w-8 text-left ${f.probability >= 60 ? "text-green-400" : f.probability >= 45 ? "text-yellow-400" : "text-red-400"}`}>{f.probability}%</span>
                        </div>
                      </div></div>))}
                </CardContent>
              </Card>
            </div>
            <div className="space-y-4">
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-400" />בריאות Pipeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[{l:"שווי כולל Pipeline",v:"₪14.1M",c:"text-foreground"},{l:"שווי משוקלל",v:"₪7.8M",c:"text-green-400"}].map((r,i)=>(
                    <div key={i} className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{r.l}</span><span className={`font-bold ${r.c}`}>{r.v}</span></div>
                  ))}
                  <div className="border-t border-border/30 pt-3 space-y-2">
                    {[{s:"ראשוני",n:22,p:18,c:"bg-blue-500"},{s:"הצעה",n:15,p:35,c:"bg-yellow-500"},{s:"משא ומתן",n:8,p:27,c:"bg-orange-500"},{s:"סגירה",n:5,p:20,c:"bg-green-500"}].map((s,i) => (
                      <div key={i}>
                        <div className="flex items-center justify-between text-xs mb-1"><span className="text-muted-foreground">{s.s} ({s.n})</span><span className="text-foreground">{s.p}%</span></div>
                        <div className="h-2 bg-background/30 rounded-full overflow-hidden"><div className={`h-full rounded-full ${s.c}`} style={{ width: `${s.p}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-blue-400" />ניתוח הסתברות עסקאות</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[{l:"סיכוי גבוה (>70%)",n:12,v:"₪3.2M",c:"text-green-400"},{l:"סיכוי בינוני (40-70%)",n:18,v:"₪5.8M",c:"text-yellow-400"},{l:"סיכוי נמוך (<40%)",n:20,v:"₪5.1M",c:"text-red-400"}].map((d,i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded bg-background/20">
                      <div><div className={`text-sm font-medium ${d.c}`}>{d.l}</div><div className="text-xs text-muted-foreground">{d.n} עסקאות</div></div>
                      <span className="font-bold text-foreground">{d.v}</span>
                    </div>
                  ))}
                  <div className="mt-3 p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
                    <div className="flex items-center gap-1 text-xs text-violet-400 mb-1"><Brain className="w-3 h-3" />תובנת AI</div>
                    <p className="text-xs text-muted-foreground">5 עסקאות בשלב משא ומתן צפויות לעלות ל-70%+ אם תתבצע פגישה נוספת תוך שבוע</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
