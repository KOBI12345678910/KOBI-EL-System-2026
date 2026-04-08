import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Bot, Clock, ThumbsUp, ShieldCheck, Brain, DollarSign,
  ArrowUpRight, ArrowDownRight, MessageSquare, Search,
  RotateCcw, Download, Send, AlertTriangle, CheckCircle2,
  Users, Zap, Target, BookOpen, Star,
  Truck, Wrench, ShieldAlert, RefreshCw, PhoneCall,
  GraduationCap, Lightbulb, BarChart3
} from "lucide-react";

const kpis = [
  { label: "פתרונות אוטומטיים", value: "1,847", change: "+22%", up: true, icon: Bot, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "זמן תגובה ראשון", value: "8 שניות", change: "-65%", up: true, icon: Clock, color: "text-green-400", bg: "bg-green-500/10" },
  { label: "שיפור CSAT", value: "+18.4%", change: "+3.2%", up: true, icon: ThumbsUp, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "הסטת פניות", value: "72.3%", change: "+8.5%", up: true, icon: ShieldCheck, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "דיוק מאגר ידע", value: "96.7%", change: "+1.4%", up: true, icon: Brain, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { label: 'חיסכון עלויות', value: "₪284,500", change: "+31%", up: true, icon: DollarSign, color: "text-rose-400", bg: "bg-rose-500/10" },
];

const conversations = [
  { id: "CS-4821", topic: "שאלה על אחריות מוצר", customer: "יוסי כהן", channel: "צ'אט", resolution: "הופנה למסמך אחריות + אישור הארכה", confidence: 97, feedback: 5, status: "נפתר", time: "2 דק'" },
  { id: "CS-4820", topic: "בעיית תשלום בהזמנה", customer: "שרה לוי", channel: "אימייל", resolution: "עדכון אמצעי תשלום והפעלה מחדש", confidence: 94, feedback: 5, status: "נפתר", time: "4 דק'" },
  { id: "CS-4819", topic: "מעקב אחר משלוח", customer: "אבי דוד", channel: "צ'אט", resolution: "עדכון מיקום בזמן אמת + ETA מעודכן", confidence: 99, feedback: 4, status: "נפתר", time: "1 דק'" },
  { id: "CS-4818", topic: "בקשת החזר כספי", customer: "מירי אברהם", channel: "טלפון", resolution: "הועבר לנציג בכיר - מעל סמכות AI", confidence: 62, feedback: null, status: "הועבר", time: "3 דק'" },
  { id: "CS-4817", topic: "שאלה טכנית על התקנה", customer: "דני פרץ", channel: "צ'אט", resolution: "מדריך התקנה + וידאו הדגמה", confidence: 96, feedback: 5, status: "נפתר", time: "5 דק'" },
  { id: "CS-4816", topic: "עדכון פרטי חשבון", customer: "רונית שמעון", channel: "אימייל", resolution: "עדכון כתובת וטלפון בוצע אוטומטית", confidence: 98, feedback: 4, status: "נפתר", time: "1 דק'" },
  { id: "CS-4815", topic: "תלונה על איכות מוצר", customer: "עומר גולן", channel: "צ'אט", resolution: "פתיחת קריאת שירות + תיאום טכנאי", confidence: 88, feedback: 4, status: "נפתר", time: "6 דק'" },
  { id: "CS-4814", topic: "שדרוג חבילת שירות", customer: "הילה נתן", channel: "צ'אט", resolution: "הצגת מסלולים + ביצוע שדרוג", confidence: 95, feedback: 5, status: "נפתר", time: "3 דק'" },
  { id: "CS-4813", topic: "ביטול הזמנה", customer: "גיא מזרחי", channel: "טלפון", resolution: "ביטול אושר + זיכוי תוך 5 ימי עסקים", confidence: 91, feedback: 4, status: "נפתר", time: "2 דק'" },
  { id: "CS-4812", topic: "פנייה חוזרת - בעיה לא נפתרה", customer: "לינה חדד", channel: "צ'אט", resolution: "הועבר לנציג + התראת SLA", confidence: 55, feedback: null, status: "הועבר", time: "4 דק'" },
];

const routingRules = [
  { category: "תלונה על מוצר", priority: "גבוהה", team: "שירות בכיר", aiConfidence: 94, autoRoute: true, sla: "2 שעות" },
  { category: "שאלה טכנית", priority: "בינונית", team: "תמיכה טכנית", aiConfidence: 97, autoRoute: true, sla: "4 שעות" },
  { category: "בקשת החזר > ₪500", priority: "גבוהה", team: "מנהל צוות", aiConfidence: 89, autoRoute: false, sla: "1 שעה" },
  { category: "מעקב משלוח", priority: "נמוכה", team: "AI אוטומטי", aiConfidence: 99, autoRoute: true, sla: "מיידי" },
  { category: "חשבונית / מסמך", priority: "נמוכה", team: "AI אוטומטי", aiConfidence: 98, autoRoute: true, sla: "מיידי" },
  { category: "תקלה קריטית", priority: "דחופה", team: "הנדסה + שירות", aiConfidence: 96, autoRoute: true, sla: "30 דקות" },
  { category: "ביטול חוזה", priority: "גבוהה", team: "שימור לקוחות", aiConfidence: 91, autoRoute: false, sla: "1 שעה" },
];

const proactiveOutreach = [
  { customer: "מפעלי תעשייה בע\"מ", issue: "אחריות פגה בעוד 14 יום", type: "אחריות", urgency: "בינונית", action: "שליחת הצעת הארכה", status: "ממתין", icon: ShieldAlert },
  { customer: "אלקטרו פתרונות", issue: "משלוח מתעכב ב-3 ימים", type: "משלוח", urgency: "גבוהה", action: "הודעת עדכון + פיצוי", status: "נשלח", icon: Truck },
  { customer: "בניה חכמה בע\"מ", issue: "3 תלונות איכות ברבעון", type: "איכות", urgency: "גבוהה", action: "שיחת מעקב + בדיקת שורש", status: "בטיפול", icon: Wrench },
  { customer: "שיווק דיגיטלי פלוס", issue: "לא התחבר 45 ימים", type: "חוסר פעילות", urgency: "בינונית", action: "מייל שימור + הטבה", status: "ממתין", icon: Users },
  { customer: "טכנולוגיות אופק", issue: "חידוש חוזה בעוד 30 יום", type: "חידוש", urgency: "בינונית", action: "הצעת חידוש מותאמת", status: "נשלח", icon: RefreshCw },
  { customer: "יבואני פרמיום", issue: "4 פניות שירות בשבוע", type: "תדירות פניות", urgency: "דחופה", action: "הקצאת נציג ייעודי", status: "בטיפול", icon: PhoneCall },
];

const trainingMetrics = [
  { model: "סיווג נושא פנייה", accuracy: 96.8, lastTrained: "לפני 3 ימים", samples: "124,500", trend: "up", improvement: "+0.7%" },
  { model: "ניתוח סנטימנט", accuracy: 93.2, lastTrained: "לפני 5 ימים", samples: "89,200", trend: "up", improvement: "+1.1%" },
  { model: "חיזוי עדיפות", accuracy: 91.5, lastTrained: "לפני 2 ימים", samples: "67,800", trend: "stable", improvement: "+0.2%" },
  { model: "התאמת נציג", accuracy: 88.9, lastTrained: "לפני 7 ימים", samples: "45,300", trend: "up", improvement: "+2.3%" },
  { model: "זיהוי כוונת לקוח", accuracy: 95.1, lastTrained: "לפני 1 יום", samples: "156,000", trend: "up", improvement: "+0.5%" },
];

const newPatterns = [
  { pattern: "שאלות על מדיניות ESG חדשה", occurrences: 47, since: "השבוע", gap: false },
  { pattern: "בעיות אינטגרציה עם גרסה 4.2", occurrences: 23, since: "3 ימים", gap: true },
  { pattern: "שאלות על תוכנית נאמנות חדשה", occurrences: 61, since: "השבוע", gap: true },
  { pattern: "דיווח על עיכוב בהודעות SMS", occurrences: 18, since: "יומיים", gap: true },
];

const knowledgeGaps = [
  { topic: "מדיניות החזרות למוצרים מותאמים אישית", queries: 34, urgency: "גבוהה" },
  { topic: "תנאי אחריות לאחר העברת בעלות", queries: 28, urgency: "גבוהה" },
  { topic: "תהליך שדרוג מגרסה ישנה (< 3.0)", queries: 19, urgency: "בינונית" },
  { topic: "תאימות מוצר עם תקן ISO 2025", queries: 12, urgency: "נמוכה" },
];

const SC: Record<string, string> = {
  "נפתר": "bg-green-500/20 text-green-300", "הועבר": "bg-amber-500/20 text-amber-300",
  "בטיפול": "bg-blue-500/20 text-blue-300", "ממתין": "bg-slate-500/20 text-slate-300",
  "נשלח": "bg-emerald-500/20 text-emerald-300", "דחופה": "bg-red-500/20 text-red-300",
  "גבוהה": "bg-orange-500/20 text-orange-300", "בינונית": "bg-yellow-500/20 text-yellow-300",
  "נמוכה": "bg-green-500/20 text-green-300",
};

export default function AiCustomerServicePro() {
  const [search, setSearch] = useState("");
  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bot className="w-7 h-7 text-blue-400" />
            שירות לקוחות AI מתקדם
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מערכת שירות חכמה עם למידת מכונה, ניתוב אוטומטי ופנייה פרואקטיבית</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />יצוא דוח</Button>
          <Button variant="outline" size="sm"><RefreshCw className="w-4 h-4 ml-1" />רענון</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-lg ${k.bg}`}><k.icon className={`w-4 h-4 ${k.color}`} /></div>
                <span className={`text-xs flex items-center gap-0.5 ${k.up ? "text-green-400" : "text-red-400"}`}>
                  {k.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {k.change}
                </span>
              </div>
              <div className="text-xl font-bold text-foreground">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="conversations" className="space-y-4">
        <TabsList className="bg-card/50 border border-border/50 p-1">
          <TabsTrigger value="conversations" className="gap-1.5"><MessageSquare className="w-4 h-4" />שיחות AI</TabsTrigger>
          <TabsTrigger value="routing" className="gap-1.5"><Zap className="w-4 h-4" />ניתוב חכם</TabsTrigger>
          <TabsTrigger value="proactive" className="gap-1.5"><Send className="w-4 h-4" />פנייה פרואקטיבית</TabsTrigger>
          <TabsTrigger value="training" className="gap-1.5"><GraduationCap className="w-4 h-4" />אימון ולמידה</TabsTrigger>
        </TabsList>

        {/* Tab 1: AI Conversations */}
        <TabsContent value="conversations" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">שיחות שטופלו ע״י AI - אחרונות</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש שיחה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מס׳</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">נושא</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">לקוח</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">ערוץ</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">פתרון</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">ביטחון</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">משוב</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">זמן</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversations
                      .filter(c => !search || c.topic.includes(search) || c.customer.includes(search))
                      .map((c, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-card/30">
                        <td className="p-3 text-foreground font-mono text-xs">{c.id}</td>
                        <td className="p-3 text-foreground font-medium">{c.topic}</td>
                        <td className="p-3 text-foreground">{c.customer}</td>
                        <td className="p-3"><Badge variant="outline" className="text-xs">{c.channel}</Badge></td>
                        <td className="p-3 text-muted-foreground text-xs max-w-[200px] truncate">{c.resolution}</td>
                        <td className="p-3 text-center">
                          <span className={`font-medium ${c.confidence >= 90 ? "text-green-400" : c.confidence >= 70 ? "text-amber-400" : "text-red-400"}`}>
                            {c.confidence}%
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {c.feedback ? (
                            <span className="flex items-center justify-center gap-0.5">
                              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />{c.feedback}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">--</span>}
                        </td>
                        <td className="p-3 text-center text-muted-foreground text-xs">{c.time}</td>
                        <td className="p-3 text-center"><Badge className={SC[c.status] || ""}>{c.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/30 text-xs text-muted-foreground">
                <span>שיעור פתרון אוטומטי: <strong className="text-green-400">80%</strong> (8 מתוך 10)</span>
                <span>ציון משוב ממוצע: <strong className="text-amber-400">4.7/5</strong></span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Smart Routing */}
        <TabsContent value="routing" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="bg-card/50 border-border/50 lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2"><Target className="w-5 h-5 text-blue-400" />כללי סיווג וניתוב AI</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-right p-3 text-muted-foreground font-medium">קטגוריה</th>
                        <th className="text-center p-3 text-muted-foreground font-medium">עדיפות</th>
                        <th className="text-right p-3 text-muted-foreground font-medium">צוות יעד</th>
                        <th className="text-center p-3 text-muted-foreground font-medium">דיוק AI</th>
                        <th className="text-center p-3 text-muted-foreground font-medium">ניתוב אוטומטי</th>
                        <th className="text-center p-3 text-muted-foreground font-medium">SLA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routingRules.map((r, i) => (
                        <tr key={i} className="border-b border-border/30 hover:bg-card/30">
                          <td className="p-3 text-foreground font-medium">{r.category}</td>
                          <td className="p-3 text-center"><Badge className={SC[r.priority] || ""}>{r.priority}</Badge></td>
                          <td className="p-3 text-foreground">{r.team}</td>
                          <td className="p-3 text-center"><span className={`font-medium ${r.aiConfidence >= 95 ? "text-green-400" : r.aiConfidence >= 85 ? "text-blue-400" : "text-amber-400"}`}>{r.aiConfidence}%</span></td>
                          <td className="p-3 text-center">
                            {r.autoRoute ? <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto" /> : <AlertTriangle className="w-4 h-4 text-amber-400 mx-auto" />}
                          </td>
                          <td className="p-3 text-center text-muted-foreground text-xs">{r.sla}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-4 h-4 text-purple-400" />חיזוי עדיפות</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {[{ label: "דחופה", pct: 8 }, { label: "גבוהה", pct: 22 }, { label: "בינונית", pct: 45 }, { label: "נמוכה", pct: 25 }].map((p, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-1"><span className="text-foreground">{p.label}</span><span className="text-muted-foreground">{p.pct}%</span></div>
                      <Progress value={p.pct} className="h-2" />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4 text-cyan-400" />התאמת נציגים</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {[{ agent: "דנה כ.", specialty: "טכני", load: 72, score: 4.8 }, { agent: "מוטי ל.", specialty: "חשבונות", load: 58, score: 4.6 }, { agent: "יעל ש.", specialty: "תלונות", load: 85, score: 4.9 }, { agent: "אדם ר.", specialty: "מכירות", load: 44, score: 4.5 }].map((a, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-background/30">
                      <div><span className="text-foreground font-medium">{a.agent}</span><span className="text-muted-foreground text-xs mr-2">{a.specialty}</span></div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs ${a.load > 80 ? "text-red-400" : a.load > 60 ? "text-amber-400" : "text-green-400"}`}>עומס {a.load}%</span>
                        <span className="text-xs text-amber-400 flex items-center gap-0.5"><Star className="w-3 h-3 fill-amber-400" />{a.score}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Proactive Outreach */}
        <TabsContent value="proactive" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2"><Send className="w-5 h-5 text-emerald-400" />לקוחות שזוהו לפנייה פרואקטיבית</CardTitle>
                <Badge className="bg-emerald-500/20 text-emerald-300">6 לקוחות</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {proactiveOutreach.map((p, i) => (
                  <div key={i} className="border border-border/40 rounded-lg p-3 hover:bg-card/30 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-background/50"><p.icon className="w-4 h-4 text-muted-foreground" /></div>
                        <div><div className="font-medium text-foreground text-sm">{p.customer}</div><div className="text-xs text-muted-foreground">{p.issue}</div></div>
                      </div>
                      <Badge className={SC[p.urgency] || ""}>{p.urgency}</Badge>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-border/20">
                      <div className="flex items-center gap-2"><Badge variant="outline" className="text-xs">{p.type}</Badge><Badge className={SC[p.status] || ""}>{p.status}</Badge></div>
                      <span className="text-xs text-muted-foreground">{p.action}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/30 text-xs text-muted-foreground">
                <span>נשלחו השבוע: <strong className="text-emerald-400">23</strong> פניות פרואקטיביות</span>
                <span>שיעור מענה: <strong className="text-blue-400">68%</strong> | שימור בעקבות פנייה: <strong className="text-green-400">94%</strong></span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Training & Learning */}
        <TabsContent value="training" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2"><Brain className="w-5 h-5 text-purple-400" />ביצועי מודלים</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {trainingMetrics.map((m, i) => (
                    <div key={i} className="p-3 rounded-lg bg-background/30">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-medium text-foreground text-sm">{m.model}</span>
                        <span className={`text-xs flex items-center gap-1 ${m.trend === "up" ? "text-green-400" : "text-muted-foreground"}`}>
                          {m.improvement}{m.trend === "up" && <ArrowUpRight className="w-3 h-3" />}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Progress value={m.accuracy} className="h-2 flex-1" />
                        <span className="text-sm font-bold text-foreground w-14 text-left">{m.accuracy}%</span>
                      </div>
                      <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                        <span>אומן {m.lastTrained}</span><span>{m.samples} דגימות</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-400" />דפוסים חדשים שזוהו</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {newPatterns.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-background/30">
                        <div className="flex-1"><div className="text-sm text-foreground">{p.pattern}</div><div className="text-xs text-muted-foreground mt-0.5">{p.occurrences} מופעים | {p.since}</div></div>
                        <Badge className={p.gap ? "bg-red-500/20 text-red-300 text-xs" : "bg-green-500/20 text-green-300 text-xs"}>{p.gap ? "חסר ידע" : "מכוסה"}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><BookOpen className="w-4 h-4 text-red-400" />פערי ידע שזוהו</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {knowledgeGaps.map((g, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-background/30">
                        <div className="flex-1"><div className="text-sm text-foreground">{g.topic}</div><div className="text-xs text-muted-foreground mt-0.5">{g.queries} שאילתות ללא מענה</div></div>
                        <Badge className={SC[g.urgency] || ""}>{g.urgency}</Badge>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border/30 flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">סה״כ <strong className="text-red-400">4</strong> פערים פתוחים</span>
                    <Button size="sm" variant="outline" className="text-xs h-7"><RotateCcw className="w-3 h-3 ml-1" />עדכון מאגר</Button>
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